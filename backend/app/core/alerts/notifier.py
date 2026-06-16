"""
Notification dispatcher — sends alerts via in-app (always), email, Telegram,
Discord, and Slack channels based on alert config. All external channels are
best-effort; failures are logged but do not raise.
"""
import logging
import os
import json
from datetime import datetime

logger = logging.getLogger(__name__)


def _send_email(to_address: str, subject: str, body: str):
    """Send via SMTP. Requires EMAIL_HOST/PORT/USER/PASS env vars."""
    import smtplib
    from email.mime.text import MIMEText
    host = os.environ.get("EMAIL_HOST", "smtp.gmail.com")
    port = int(os.environ.get("EMAIL_PORT", 587))
    user = os.environ.get("EMAIL_USER", "")
    password = os.environ.get("EMAIL_PASS", "")
    if not user or not password:
        logger.warning("Email credentials not configured — skipping email notification")
        return
    msg = MIMEText(body, "plain")
    msg["Subject"] = subject
    msg["From"] = user
    msg["To"] = to_address
    with smtplib.SMTP(host, port) as srv:
        srv.starttls()
        srv.login(user, password)
        srv.sendmail(user, [to_address], msg.as_string())
    logger.info(f"Email sent to {to_address}: {subject}")


def _send_telegram(chat_id: str, text: str):
    """Send via Telegram Bot API. Requires TELEGRAM_BOT_TOKEN env var."""
    import urllib.request
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        logger.warning("TELEGRAM_BOT_TOKEN not set — skipping Telegram notification")
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps({"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=10)
    logger.info(f"Telegram sent to chat {chat_id}")


def _send_discord(webhook_url: str, content: str):
    """Send via Discord webhook."""
    import urllib.request
    payload = json.dumps({"content": content}).encode()
    req = urllib.request.Request(webhook_url, data=payload, headers={"Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=10)
    logger.info("Discord webhook sent")


def _send_slack(webhook_url: str, text: str):
    """Send via Slack incoming webhook."""
    import urllib.request
    payload = json.dumps({"text": text}).encode()
    req = urllib.request.Request(webhook_url, data=payload, headers={"Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=10)
    logger.info("Slack webhook sent")


def _format_message(ticker: str, alert_name: str, explanation: dict, trigger_price: float) -> str:
    ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    return (
        f"[{ts}] *{ticker}* — {alert_name}\n"
        f"Price: ${trigger_price:.2f} | Signal: {explanation['signal_name']} ({explanation['signal_type'].upper()})\n"
        f"Confidence: {explanation['confidence']}/100 | Risk: {explanation['risk_level']}\n"
        f"{explanation['what_happened']}\n"
        f"Suggestion: {explanation['suggestion']}"
    )


class Notifier:
    """Stateless dispatcher; all config comes from env vars or per-alert params."""

    def dispatch(self, alert: dict, explanation: dict, trigger_price: float):
        ticker = alert["ticker"]
        alert_name = alert.get("name") or explanation.get("signal_name", "Alert")
        channels = alert.get("channels") or ["in_app"]
        msg = _format_message(ticker, alert_name, explanation, trigger_price)

        for ch in channels:
            ch = ch.strip().lower()
            try:
                if ch == "email":
                    to = alert.get("params", {}).get("email") or os.environ.get("ALERT_EMAIL_TO", "")
                    if to:
                        subject = f"[QuantDesk] {ticker} — {explanation['signal_name']}"
                        _send_email(to, subject, msg)

                elif ch == "telegram":
                    chat_id = alert.get("params", {}).get("telegram_chat_id") or os.environ.get("TELEGRAM_CHAT_ID", "")
                    if chat_id:
                        _send_telegram(chat_id, msg)

                elif ch == "discord":
                    webhook = alert.get("params", {}).get("discord_webhook") or os.environ.get("DISCORD_WEBHOOK_URL", "")
                    if webhook:
                        _send_discord(webhook, msg)

                elif ch == "slack":
                    webhook = alert.get("params", {}).get("slack_webhook") or os.environ.get("SLACK_WEBHOOK_URL", "")
                    if webhook:
                        _send_slack(webhook, msg)

                elif ch == "in_app":
                    pass  # stored in alert_triggers table — frontend polls

            except Exception as e:
                logger.warning(f"Channel '{ch}' delivery failed for alert {alert.get('id')}: {e}")
