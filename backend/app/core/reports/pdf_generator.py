"""
ReportLab PDF generator — produces institutional-grade reports.
"""
from __future__ import annotations

import io
from datetime import datetime
from typing import Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, NextPageTemplate,
    Paragraph, Spacer, Table, TableStyle, Image, PageBreak,
    HRFlowable, KeepTogether,
)

from app.core.reports.data_collector import ReportMetrics

# ── Palette ───────────────────────────────────────────────────────────────────

_P = {
    "dark": {
        "page_bg": HexColor("#0D1117"),
        "surface": HexColor("#161B22"),
        "surface2": HexColor("#1E2A3A"),
        "accent": HexColor("#00D4FF"),
        "gold": HexColor("#F0C040"),
        "text": HexColor("#E6EDF3"),
        "sub": HexColor("#8B949E"),
        "green": HexColor("#3FB950"),
        "red": HexColor("#F85149"),
        "header_bg": HexColor("#1E2A3A"),
        "row_alt": HexColor("#161B22"),
        "row_even": HexColor("#0D1117"),
        "border": HexColor("#21262D"),
    },
    "light": {
        "page_bg": HexColor("#FFFFFF"),
        "surface": HexColor("#F0F4FF"),
        "surface2": HexColor("#E8EDF8"),
        "accent": HexColor("#1E3A5F"),
        "gold": HexColor("#B8860B"),
        "text": HexColor("#1A1A2E"),
        "sub": HexColor("#6C757D"),
        "green": HexColor("#28A745"),
        "red": HexColor("#DC3545"),
        "header_bg": HexColor("#1E3A5F"),
        "row_alt": HexColor("#F0F4FF"),
        "row_even": HexColor("#FFFFFF"),
        "border": HexColor("#DEE2E6"),
    },
}

W, H = letter


# ── Styles ────────────────────────────────────────────────────────────────────

def _styles(theme: str) -> dict:
    p = _P[theme]
    return {
        "h1": ParagraphStyle("H1", fontName="Helvetica-Bold", fontSize=16,
                              textColor=p["text"], spaceAfter=8, spaceBefore=12, leading=20),
        "h2": ParagraphStyle("H2", fontName="Helvetica-Bold", fontSize=11,
                              textColor=p["accent"], spaceAfter=5, spaceBefore=10, leading=14),
        "h3": ParagraphStyle("H3", fontName="Helvetica-Bold", fontSize=9,
                              textColor=p["text"], spaceAfter=3, spaceBefore=6, leading=12),
        "body": ParagraphStyle("Body", fontName="Helvetica", fontSize=8.5,
                               textColor=p["text"], spaceAfter=4, leading=12.5),
        "small": ParagraphStyle("Small", fontName="Helvetica", fontSize=7.5,
                                textColor=p["sub"], spaceAfter=2, leading=11),
        "caption": ParagraphStyle("Caption", fontName="Helvetica-Oblique", fontSize=7.5,
                                  textColor=p["sub"], alignment=TA_CENTER, spaceAfter=6),
        "bullet": ParagraphStyle("Bullet", fontName="Helvetica", fontSize=8.5,
                                 textColor=p["text"], leading=12.5, leftIndent=12,
                                 bulletIndent=4, spaceAfter=3),
        "right": ParagraphStyle("Right", fontName="Helvetica", fontSize=8,
                                textColor=p["text"], alignment=TA_RIGHT),
        "center": ParagraphStyle("Center", fontName="Helvetica", fontSize=8,
                                 textColor=p["text"], alignment=TA_CENTER),
    }


# ── Canvas callbacks ──────────────────────────────────────────────────────────

def _cover_canvas(canvas, doc, report_name, report_type, subtitle, theme):
    canvas.saveState()
    p = _P[theme]
    bg = p["page_bg"]
    acc = p["accent"]
    gold = p["gold"]
    txt = p["text"]
    sub = p["sub"]

    # Background
    canvas.setFillColor(bg)
    canvas.rect(0, 0, W, H, fill=1, stroke=0)

    # Top navy stripe
    canvas.setFillColor(p["surface2"])
    canvas.rect(0, H * 0.62, W, H * 0.38, fill=1, stroke=0)

    # Gold accent bar
    canvas.setFillColor(gold)
    canvas.rect(0, H * 0.62 - 3, W, 3, fill=1, stroke=0)

    # Cyan left bar
    canvas.setFillColor(acc)
    canvas.rect(0, 0, 6, H, fill=1, stroke=0)

    # "QUANTDESK" branding
    canvas.setFont("Helvetica-Bold", 11)
    canvas.setFillColor(acc)
    canvas.drawString(0.65 * inch, H - 0.65 * inch, "QUANTDESK")
    canvas.setFont("Helvetica", 10)
    canvas.setFillColor(sub)
    canvas.drawString(0.65 * inch + 88, H - 0.65 * inch, " | Institutional Analytics")

    # Report type label
    canvas.setFont("Helvetica-Bold", 10)
    canvas.setFillColor(gold)
    canvas.drawString(0.65 * inch, H * 0.72, report_type.upper())

    # Main title
    title_sz = 26 if len(report_name) < 28 else 20
    canvas.setFont("Helvetica-Bold", title_sz)
    canvas.setFillColor(txt)
    canvas.drawString(0.65 * inch, H * 0.72 - 36, report_name)

    # Subtitle
    canvas.setFont("Helvetica", 11)
    canvas.setFillColor(sub)
    canvas.drawString(0.65 * inch, H * 0.72 - 62, subtitle)

    # Divider
    canvas.setStrokeColor(acc)
    canvas.setLineWidth(1.2)
    canvas.line(0.65 * inch, H * 0.62 + 16, W - 0.65 * inch, H * 0.62 + 16)

    # Bottom info
    canvas.setFont("Helvetica", 8.5)
    canvas.setFillColor(sub)
    canvas.drawString(0.65 * inch, 0.65 * inch,
                      f"Generated: {datetime.now().strftime('%B %d, %Y  %H:%M UTC')}")
    canvas.drawRightString(W - 0.65 * inch, 0.65 * inch,
                           "CONFIDENTIAL — For Professional Investors Only")

    # Faint watermark
    canvas.saveState()
    canvas.setFillColor(sub)
    canvas.setFont("Helvetica-Bold", 72)
    canvas.setFillAlpha(0.025)
    canvas.translate(W / 2, H / 3.5)
    canvas.rotate(30)
    canvas.drawCentredString(0, 0, "QUANTDESK")
    canvas.restoreState()

    canvas.restoreState()


def _page_canvas(canvas, doc, report_name, theme):
    canvas.saveState()
    p = _P[theme]
    # Header bar
    canvas.setFillColor(p["header_bg"])
    canvas.rect(0, H - 0.42 * inch, W, 0.42 * inch, fill=1, stroke=0)
    # Accent stripe
    canvas.setFillColor(p["accent"])
    canvas.rect(0, H - 0.42 * inch, 4, 0.42 * inch, fill=1, stroke=0)
    # Header text
    canvas.setFont("Helvetica-Bold", 7.5)
    canvas.setFillColor(p["accent"])
    canvas.drawString(0.55 * inch, H - 0.27 * inch, "QUANTDESK")
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(HexColor("#AAAACC") if theme == "dark" else colors.white)
    canvas.drawCentredString(W / 2, H - 0.27 * inch, report_name)
    canvas.drawRightString(W - 0.5 * inch, H - 0.27 * inch, f"Page {doc.page}")
    # Footer
    canvas.setFillColor(p["header_bg"])
    canvas.rect(0, 0, W, 0.32 * inch, fill=1, stroke=0)
    canvas.setFont("Helvetica", 6.5)
    canvas.setFillColor(p["sub"])
    canvas.drawString(0.5 * inch, 0.12 * inch,
                      "CONFIDENTIAL — For Authorized Recipients Only")
    canvas.drawRightString(W - 0.5 * inch, 0.12 * inch,
                           f"© {datetime.now().year} QuantDesk Research")
    canvas.restoreState()


# ── Table helpers ─────────────────────────────────────────────────────────────

def _metric_table(rows: List[tuple], theme: str, col_widths=None) -> Table:
    p = _P[theme]
    sty = _styles(theme)
    data = [
        [Paragraph(str(r[0]), sty["small"]), Paragraph(str(r[1]), sty["body"])]
        for r in rows
    ]
    cw = col_widths or [2.2 * inch, 2.2 * inch]
    tbl = Table(data, colWidths=cw, repeatRows=0)
    ts = [
        ("BACKGROUND", (0, 0), (-1, -1), p["row_even"]),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [p["row_even"], p["row_alt"]]),
        ("TEXTCOLOR", (0, 0), (-1, -1), p["text"]),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica"),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, p["border"]),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]
    tbl.setStyle(TableStyle(ts))
    return tbl


def _header_table(headers: List[str], rows: List[list], theme: str, col_widths=None) -> Table:
    p = _P[theme]
    sty = _styles(theme)
    hrow = [Paragraph(f"<b>{h}</b>", ParagraphStyle(
        "TH", fontName="Helvetica-Bold", fontSize=8, textColor=colors.white,
        alignment=TA_CENTER)) for h in headers]
    body = []
    for row in rows:
        body.append([Paragraph(str(c), sty["small"]) for c in row])
    data = [hrow] + body
    cw = col_widths or [inch * (6.5 / max(len(headers), 1))] * len(headers)
    tbl = Table(data, colWidths=cw, repeatRows=1)
    ts = [
        ("BACKGROUND", (0, 0), (-1, 0), p["accent"]),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [p["row_even"], p["row_alt"]]),
        ("TEXTCOLOR", (0, 1), (-1, -1), p["text"]),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, p["border"]),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]
    tbl.setStyle(TableStyle(ts))
    return tbl


def _kpi_grid(kpis: List[dict], theme: str) -> Table:
    """
    kpis = [{"label": ..., "value": ..., "positive": True/False/None}, ...]
    """
    p = _P[theme]
    n_cols = 5
    rows_data = []
    row_labels, row_values = [], []

    for i, kpi in enumerate(kpis):
        val_color = (
            p["green"] if kpi.get("positive") is True else
            p["red"] if kpi.get("positive") is False else
            p["accent"]
        )
        label_para = Paragraph(
            kpi["label"],
            ParagraphStyle("KL", fontName="Helvetica", fontSize=7, textColor=p["sub"],
                           alignment=TA_CENTER)
        )
        value_para = Paragraph(
            f'<font color="#{val_color.hexval()[2:]}" size="13"><b>{kpi["value"]}</b></font>',
            ParagraphStyle("KV", fontName="Helvetica-Bold", fontSize=13,
                           textColor=val_color, alignment=TA_CENTER)
        )
        row_labels.append(label_para)
        row_values.append(value_para)

        if len(row_labels) == n_cols or i == len(kpis) - 1:
            while len(row_labels) < n_cols:
                row_labels.append(Paragraph("", ParagraphStyle("E", fontSize=7)))
                row_values.append(Paragraph("", ParagraphStyle("E", fontSize=13)))
            rows_data.append(row_labels)
            rows_data.append(row_values)
            row_labels, row_values = [], []

    cw = [inch * 1.3] * n_cols
    tbl = Table(rows_data, colWidths=cw)
    ts = [
        ("BACKGROUND", (0, 0), (-1, -1), p["surface"]),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [p["surface"], p["surface"]]),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, p["border"]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    tbl.setStyle(TableStyle(ts))
    return tbl


def _img(data: bytes, width: float, caption: str = "", theme: str = "light") -> list:
    """Convert PNG bytes to an Image flowable with optional caption."""
    if not data:
        return []
    buf = io.BytesIO(data)
    elements = [Image(buf, width=width, height=width * 0.45)]
    if caption:
        elements.append(Paragraph(caption, _styles(theme)["caption"]))
    return elements


# ── Sections ─────────────────────────────────────────────────────────────────

def _section_exec_summary(m: ReportMetrics, commentary: dict, theme: str) -> list:
    sty = _styles(theme)
    p = _P[theme]
    story = []

    story.append(Paragraph("Executive Summary", sty["h1"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=p["border"]))
    story.append(Spacer(1, 8))

    # KPI grid
    def _pct(v):
        return f"{v*100:+.1f}%"
    def _f(v, d=2):
        return f"{v:.{d}f}"

    kpis = [
        {"label": "Total Return", "value": _pct(m.total_return),
         "positive": m.total_return >= 0},
        {"label": "CAGR", "value": _pct(m.cagr), "positive": m.cagr >= 0},
        {"label": "Sharpe Ratio", "value": _f(m.sharpe),
         "positive": m.sharpe >= 1.0},
        {"label": "Sortino Ratio", "value": _f(m.sortino),
         "positive": m.sortino >= 1.0},
        {"label": "Max Drawdown", "value": _pct(m.max_drawdown),
         "positive": False},
        {"label": "Volatility", "value": _pct(m.volatility), "positive": None},
        {"label": "Win Rate", "value": f"{m.win_rate*100:.0f}%",
         "positive": m.win_rate >= 0.52},
        {"label": "Alpha", "value": _pct(m.alpha), "positive": m.alpha >= 0},
        {"label": "Beta", "value": _f(m.beta), "positive": None},
        {"label": "Risk Score", "value": f"{m.risk_score}/100  {m.risk_label}",
         "positive": m.risk_score < 45},
    ]
    story.append(_kpi_grid(kpis, theme))
    story.append(Spacer(1, 12))

    story.append(Paragraph("AI-Generated Commentary", sty["h2"]))
    story.append(Spacer(1, 4))
    if isinstance(commentary.get("executive_summary"), str):
        story.append(Paragraph(commentary["executive_summary"], sty["body"]))
    story.append(Spacer(1, 8))

    # Performance bullets
    perf = commentary.get("performance", {})
    if perf:
        story.append(Paragraph("Performance Highlights", sty["h3"]))
        for key in ("headline", "best_performers", "worst_performers", "monthly_consistency"):
            if perf.get(key):
                story.append(Paragraph(f"• {perf[key]}", sty["bullet"]))
        story.append(Spacer(1, 6))

    return story


def _section_performance(m: ReportMetrics, charts: dict, theme: str) -> list:
    sty = _styles(theme)
    p = _P[theme]
    story = []

    story.append(Paragraph("Performance Analysis", sty["h1"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=p["border"]))
    story.append(Spacer(1, 8))

    # Equity curve
    story += _img(charts.get("equity", b""), 6.5 * inch,
                  "Figure 1: Portfolio Equity Curve (Base = 100)", theme)
    story.append(Spacer(1, 10))

    # Metrics tables side by side
    story.append(Paragraph("Return Metrics", sty["h2"]))
    def pct(v): return f"{v*100:.2f}%"
    def fp(v, d=2): return f"{v:.{d}f}"

    return_rows = [
        ("Total Return", pct(m.total_return)),
        ("CAGR", pct(m.cagr)),
        ("Best Day", pct(m.best_day)),
        ("Worst Day", pct(m.worst_day)),
        ("Avg Daily Return", f"{m.avg_daily_return*100:.3f}%"),
        ("Win Rate", f"{m.win_rate*100:.1f}%"),
        ("Profit Factor", fp(m.profit_factor)),
    ]
    risk_rows = [
        ("Annualized Volatility", pct(m.volatility)),
        ("Downside Volatility", pct(m.downside_vol)),
        ("Max Drawdown", pct(m.max_drawdown)),
        ("DD Duration", f"{m.max_drawdown_duration} days"),
        ("VaR (95%)", pct(m.var_95)),
        ("CVaR (95%)", pct(m.cvar_95)),
        ("Risk Score", f"{m.risk_score}/100"),
    ]
    ra_rows = [
        ("Sharpe Ratio", fp(m.sharpe)),
        ("Sortino Ratio", fp(m.sortino)),
        ("Calmar Ratio", fp(m.calmar)),
        ("Information Ratio", fp(m.information_ratio)),
        ("Treynor Ratio", fp(m.treynor)),
        ("Alpha", pct(m.alpha)),
        ("Beta", fp(m.beta)),
    ]

    # Three-column metrics layout
    def to_rows(data):
        return [[Paragraph(r[0], sty["small"]), Paragraph(r[1], sty["body"])] for r in data]

    combined = [
        [Paragraph("<b>Return Metrics</b>", sty["h3"]),
         Paragraph("<b>Risk Metrics</b>", sty["h3"]),
         Paragraph("<b>Risk-Adjusted</b>", sty["h3"])],
    ]
    for i in range(max(len(return_rows), len(risk_rows), len(ra_rows))):
        r1 = return_rows[i] if i < len(return_rows) else ("", "")
        r2 = risk_rows[i] if i < len(risk_rows) else ("", "")
        r3 = ra_rows[i] if i < len(ra_rows) else ("", "")

        def cell(r):
            if r[0]:
                return Paragraph(
                    f'<font color="#888">{r[0]}:</font>  <b>{r[1]}</b>',
                    sty["small"]
                )
            return Paragraph("", sty["small"])

        combined.append([cell(r1), cell(r2), cell(r3)])

    tbl = Table(combined, colWidths=[2.17 * inch] * 3)
    ts = [
        ("BACKGROUND", (0, 0), (-1, -1), p["surface"]),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [p["row_even"], p["row_alt"]]),
        ("BACKGROUND", (0, 0), (-1, 0), p["surface2"]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, p["border"]),
        ("LINEBETWEEN", (0, 0), (-1, -1), 0.3, p["border"]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    tbl.setStyle(TableStyle(ts))
    story.append(tbl)
    story.append(Spacer(1, 12))

    # Annual returns
    story += _img(charts.get("annual", b""), 6.5 * inch,
                  "Figure 2: Annual Returns vs Benchmark", theme)

    return story


def _section_risk(m: ReportMetrics, charts: dict, commentary: dict, theme: str) -> list:
    sty = _styles(theme)
    p = _P[theme]
    story = []

    story.append(Paragraph("Risk Analysis", sty["h1"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=p["border"]))
    story.append(Spacer(1, 8))

    story += _img(charts.get("drawdown", b""), 6.5 * inch,
                  "Figure 3: Underwater Drawdown Curve", theme)
    story.append(Spacer(1, 10))

    story += _img(charts.get("rolling", b""), 6.5 * inch,
                  "Figure 4: Rolling 30-Day Sharpe & Volatility", theme)
    story.append(Spacer(1, 10))

    risk = commentary.get("risk", {})
    if risk:
        story.append(Paragraph("Risk Commentary", sty["h2"]))
        for key in ("drawdown", "tail_risk", "volatility", "correlation"):
            val = risk.get(key, "")
            if val:
                story.append(Paragraph(f"• {val}", sty["bullet"]))
        story.append(Spacer(1, 8))

    return story


def _section_charts(m: ReportMetrics, charts: dict, theme: str) -> list:
    sty = _styles(theme)
    p = _P[theme]
    story = []

    story.append(Paragraph("Market Analysis", sty["h1"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=p["border"]))
    story.append(Spacer(1, 8))

    story += _img(charts.get("heatmap", b""), 6.5 * inch,
                  "Figure 5: Monthly Returns Heatmap", theme)
    story.append(Spacer(1, 10))

    story += _img(charts.get("histogram", b""), 5.5 * inch,
                  "Figure 6: Daily Return Distribution", theme)
    story.append(Spacer(1, 10))

    story += _img(charts.get("correlation", b""), 5.0 * inch,
                  "Figure 7: Asset Correlation Matrix", theme)

    return story


def _section_strategy(m: ReportMetrics, commentary: dict, theme: str) -> list:
    sty = _styles(theme)
    p = _P[theme]
    story = []

    story.append(Paragraph("Strategy Insights & Attribution", sty["h1"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=p["border"]))
    story.append(Spacer(1, 8))

    strat = commentary.get("strategy", {})
    if strat:
        story.append(Paragraph("Strategy Assessment", sty["h2"]))
        for key in ("sharpe", "calmar", "regime_fit"):
            val = strat.get(key, "")
            if val:
                story.append(Paragraph(f"• {val}", sty["bullet"]))
        story.append(Spacer(1, 8))

        improvements = strat.get("improvements", [])
        if improvements:
            story.append(Paragraph("Suggested Improvements", sty["h2"]))
            for tip in improvements:
                story.append(Paragraph(f"→  {tip}", sty["bullet"]))
            story.append(Spacer(1, 8))

    # Per-ticker attribution table
    if m.individual_returns:
        story.append(Paragraph("Individual Asset Performance", sty["h2"]))
        headers = ["Ticker", "Total Return", "Ann. Volatility", "Sharpe", "Weight"]
        rows = []
        for t in m.tickers:
            if t not in m.individual_returns:
                continue
            rows.append([
                t,
                f"{m.individual_returns[t]*100:+.1f}%",
                f"{m.individual_vol.get(t, 0)*100:.1f}%",
                f"{m.individual_sharpe.get(t, 0):.2f}",
                f"{m.weights.get(t, 0)*100:.1f}%",
            ])
        if rows:
            story.append(_header_table(headers, rows, theme,
                                       col_widths=[1.0*inch, 1.2*inch, 1.2*inch, 1.0*inch, 1.0*inch]))

    # Factor exposures
    if m.factor_exposures:
        story.append(Spacer(1, 8))
        story.append(Paragraph("Factor Exposures", sty["h2"]))
        fe_rows = [(k, f"{v:.3f}") for k, v in m.factor_exposures.items()]
        story.append(_metric_table(fe_rows, theme, [3.0 * inch, 1.5 * inch]))

    return story


def _section_disclaimer(theme: str) -> list:
    sty = _styles(theme)
    story = [
        Spacer(1, 20),
        HRFlowable(width="100%", thickness=0.5, color=_P[theme]["border"]),
        Spacer(1, 6),
        Paragraph("Disclaimer", sty["h3"]),
        Paragraph(
            "This report is prepared for informational purposes only and does not constitute "
            "investment advice or a solicitation to buy or sell any security. Past performance "
            "is not indicative of future results. All data sourced from public market data and "
            "computed metrics. Risk metrics are based on historical returns and may not accurately "
            "predict future risk. This document is confidential and intended solely for authorized "
            "recipients. QuantDesk and its affiliates make no representations as to accuracy or "
            "completeness of information herein.",
            sty["small"],
        ),
    ]
    return story


# ── Main generator ─────────────────────────────────────────────────────────────

def generate_pdf(
    m: ReportMetrics,
    commentary: dict,
    charts: dict,
    report_type: str = "Portfolio Performance Report",
    theme: str = "light",
) -> bytes:
    buf = io.BytesIO()
    p = _P[theme]

    subtitle = ", ".join(m.tickers[:6]) + (f"  |  {m.start_date} – {m.end_date}")

    def on_cover(canvas, doc):
        _cover_canvas(canvas, doc, m.report_name, report_type, subtitle, theme)

    def on_page(canvas, doc):
        _page_canvas(canvas, doc, m.report_name, theme)

    M = 0.5 * inch
    HF = 0.45 * inch

    cover_frame = Frame(M, M, W - 2 * M, H - 2 * M, id="cover")
    content_frame = Frame(M, HF + 0.05 * inch, W - 2 * M, H - 2 * HF - 0.1 * inch, id="content")

    cover_tpl = PageTemplate(id="Cover", frames=[cover_frame], onPage=on_cover)
    normal_tpl = PageTemplate(id="Normal", frames=[content_frame], onPage=on_page)

    doc = BaseDocTemplate(
        buf, pagesize=letter,
        pageTemplates=[cover_tpl, normal_tpl],
        leftMargin=0, rightMargin=0, topMargin=0, bottomMargin=0,
    )

    story = []

    # ── Cover page (drawn by on_cover; just a spacer here)
    story.append(Spacer(1, 0.1))
    story.append(NextPageTemplate("Normal"))
    story.append(PageBreak())

    # ── Executive Summary
    story += _section_exec_summary(m, commentary, theme)
    story.append(PageBreak())

    # ── Performance Analysis
    story += _section_performance(m, charts, theme)
    story.append(PageBreak())

    # ── Risk Analysis
    story += _section_risk(m, charts, commentary, theme)
    story.append(PageBreak())

    # ── Charts
    story += _section_charts(m, charts, theme)
    story.append(PageBreak())

    # ── Strategy / Attribution
    story += _section_strategy(m, commentary, theme)

    # ── Disclaimer
    story += _section_disclaimer(theme)

    doc.build(story)
    buf.seek(0)
    return buf.read()
