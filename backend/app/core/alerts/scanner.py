"""
Background alert scanner — runs on a loop, evaluates all active alerts against
latest price data, records triggers, and dispatches notifications.
"""
import asyncio
import logging
from datetime import datetime, timedelta

import pandas as pd

from app.core.data.cache import _conn
from app.core.alerts.models import get_all_active_alerts, record_trigger
from app.core.alerts.conditions import evaluate
from app.core.alerts.explainer import build_explanation

logger = logging.getLogger(__name__)

_SCAN_INTERVAL_MARKET = 60      # seconds during market hours
_SCAN_INTERVAL_AFTER  = 300     # seconds after hours


def _is_market_hours() -> bool:
    from datetime import timezone
    now_et = datetime.now(timezone.utc) - timedelta(hours=4)
    if now_et.weekday() >= 5:
        return False
    h = now_et.hour + now_et.minute / 60
    return 9.0 <= h <= 16.5


def _load_df(ticker: str) -> pd.DataFrame | None:
    """Load last 250 trading days of OHLCV data for one ticker."""
    try:
        with _conn() as con:
            rows = con.execute(
                """SELECT date, open, high, low, close, volume
                   FROM prices
                   WHERE ticker = ?
                   ORDER BY date DESC
                   LIMIT 250""",
                [ticker.upper()],
            ).fetchdf()
        if rows.empty:
            return None
        rows = rows.sort_values("date").reset_index(drop=True)
        rows["date"] = pd.to_datetime(rows["date"])
        rows = rows.set_index("date")
        return rows
    except Exception as e:
        logger.warning(f"Failed to load data for {ticker}: {e}")
        return None


def _scan_once(notifier=None):
    alerts = get_all_active_alerts()
    if not alerts:
        return

    # Group by ticker so we load price data once per ticker
    by_ticker: dict[str, list] = {}
    for alert in alerts:
        by_ticker.setdefault(alert["ticker"].upper(), []).append(alert)

    for ticker, ticker_alerts in by_ticker.items():
        df = _load_df(ticker)
        if df is None or df.empty:
            continue

        for alert in ticker_alerts:
            try:
                triggered, meta = evaluate(alert["condition"], df, alert.get("params") or {})
                if not triggered:
                    continue

                exp = build_explanation(ticker, alert["condition"], meta, alert.get("name"))
                trigger_price = float(meta.get("price") or meta.get("trigger_price") or df["close"].iloc[-1])

                record_trigger(
                    alert_id=alert["id"],
                    ticker=ticker,
                    category=alert["category"],
                    condition=alert["condition"],
                    trigger_price=trigger_price,
                    confidence=int(exp["confidence"]),
                    signal_type=exp["signal_type"],
                    explanation=exp["full_explanation"],
                    suggestion=exp["suggestion"],
                    risk_level=exp["risk_level"],
                    success_rate=exp["success_rate"],
                    repeat=alert.get("repeat", False),
                )

                logger.info(f"Alert triggered: {ticker} / {alert['condition']} (id={alert['id']})")

                if notifier is not None:
                    try:
                        notifier.dispatch(alert, exp, trigger_price)
                    except Exception as ne:
                        logger.warning(f"Notifier dispatch failed: {ne}")

            except Exception as e:
                logger.warning(f"Error evaluating alert {alert.get('id')}: {e}")


async def scanner_loop(notifier=None):
    """Async loop — runs scan_once every N seconds."""
    await asyncio.sleep(15)   # give server time to fully start
    while True:
        interval = _SCAN_INTERVAL_MARKET if _is_market_hours() else _SCAN_INTERVAL_AFTER
        try:
            await asyncio.get_event_loop().run_in_executor(None, _scan_once, notifier)
        except Exception as e:
            logger.warning(f"Scanner loop error: {e}")
        await asyncio.sleep(interval)
