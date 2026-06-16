"""
Report generation API — PDF and Excel downloads.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import io

from pydantic import BaseModel

from app.core.reports.data_collector import collect_metrics
from app.core.reports.ai_commentary import generate_all
from app.core.reports.chart_builder import build_all_charts
from app.core.reports.pdf_generator import generate_pdf
from app.core.reports.excel_generator import generate_excel

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Request model ─────────────────────────────────────────────────────────────

class ReportRequest(BaseModel):
    report_type: str = "Portfolio Performance Report"
    report_name: str = "Portfolio Report"
    tickers: List[str] = ["SPY"]
    weights: Optional[Dict[str, float]] = None
    start_date: str = (datetime.today() - timedelta(days=365)).strftime("%Y-%m-%d")
    end_date: str = datetime.today().strftime("%Y-%m-%d")
    benchmark: str = "SPY"
    portfolio_value: float = 1_000_000.0
    theme: str = "light"          # "light" or "dark"
    format: str = "pdf"           # "pdf" or "excel"
    factor_exposures: Optional[Dict[str, float]] = None
    trade_log: Optional[List[Dict]] = None
    strategy_config: Optional[Dict] = None
    injected_metrics: Optional[Dict] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/generate")
async def generate_report(body: ReportRequest):
    """Generate and stream a PDF or Excel report."""
    try:
        # Collect metrics
        m = collect_metrics(
            tickers=[t.upper() for t in body.tickers],
            start_date=body.start_date,
            end_date=body.end_date,
            weights=body.weights,
            benchmark=body.benchmark.upper(),
            portfolio_value=body.portfolio_value,
            report_name=body.report_name,
            injected=body.injected_metrics,
        )

        if body.factor_exposures:
            m.factor_exposures = body.factor_exposures
        if body.trade_log:
            m.trade_log = body.trade_log
        if body.strategy_config:
            m.strategy_config = body.strategy_config

        fmt = body.format.lower()

        if fmt == "pdf":
            # Build charts
            charts = build_all_charts(m, theme=body.theme)
            # Generate commentary
            commentary = generate_all(m)
            # Generate PDF
            pdf_bytes = generate_pdf(
                m=m,
                commentary=commentary,
                charts=charts,
                report_type=body.report_type,
                theme=body.theme,
            )
            filename = f"{body.report_name.replace(' ', '_')}_{datetime.today().strftime('%Y%m%d')}.pdf"
            return StreamingResponse(
                io.BytesIO(pdf_bytes),
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )

        elif fmt == "excel":
            excel_bytes = generate_excel(m)
            filename = f"{body.report_name.replace(' ', '_')}_{datetime.today().strftime('%Y%m%d')}.xlsx"
            return StreamingResponse(
                io.BytesIO(excel_bytes),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported format: {fmt}")

    except Exception as e:
        logger.exception("Report generation failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/templates")
def list_templates():
    """Return available report templates."""
    return [
        {"id": "portfolio", "label": "Portfolio Performance Report",
         "description": "Full portfolio analytics with equity curve, drawdowns, and attribution"},
        {"id": "backtest",  "label": "Strategy Backtest Report",
         "description": "Backtest results with walk-forward, Monte Carlo, and regime analysis"},
        {"id": "stock",     "label": "Stock Research Report",
         "description": "Single-stock deep dive: technicals, momentum, fundamentals"},
        {"id": "risk",      "label": "Risk Analysis Report",
         "description": "VaR, CVaR, drawdown analysis, stress tests, correlation risks"},
        {"id": "pair",      "label": "Pair Trading Report",
         "description": "Spread analysis, cointegration, mean-reversion statistics"},
        {"id": "momentum",  "label": "Momentum Screener Report",
         "description": "Cross-sectional momentum rankings, factor exposures"},
        {"id": "factor",    "label": "Factor Exposure Report",
         "description": "Fama-French factors, smart beta exposures, attribution"},
        {"id": "regime",    "label": "Market Regime Report",
         "description": "Bull/Bear regime detection, regime-conditional performance"},
        {"id": "options",   "label": "Options Strategy Report",
         "description": "Greeks, P&L scenarios, volatility surface analysis"},
        {"id": "custom",    "label": "Custom Client Report",
         "description": "Fully customizable report for client presentations"},
    ]
