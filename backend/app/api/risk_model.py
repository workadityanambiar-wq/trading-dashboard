"""
POST /api/risk-model/estimate
  Body: { tickers, period, half_life, max_tickers }
  Returns the full PCA risk model: factor loadings, vols, corr matrix,
  scree data, and equal-weight portfolio analytics.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.data import cache, fetcher
from app.core.risk.pca_model import build_risk_model, compute_portfolio_risk

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Request ────────────────────────────────────────────────────────────────────

class RiskModelRequest(BaseModel):
    tickers: list[str]
    period: str = "2y"       # e.g. "1y", "2y", "3y", "6m"
    half_life: int = 63      # EWMA half-life in trading days
    max_tickers: int = 80    # cap to keep response manageable


# ── Helpers ────────────────────────────────────────────────────────────────────

def _parse_period_days(period: str) -> int:
    p = period.lower().strip()
    n = int(p[:-1])
    return n * 365 if p[-1] == "y" else n * 30


def _safe(v) -> float | None:
    if v is None:
        return None
    f = float(v)
    return None if (f != f) else round(f, 6)    # NaN check


# ── Endpoint ───────────────────────────────────────────────────────────────────

@router.post("/estimate")
async def estimate(req: RiskModelRequest):
    tickers = [t.upper().strip() for t in req.tickers if t.strip()]
    if not tickers:
        raise HTTPException(400, "No tickers provided")

    tickers = list(dict.fromkeys(tickers))[:req.max_tickers]

    days  = _parse_period_days(req.period)
    start = (datetime.today() - timedelta(days=days)).strftime("%Y-%m-%d")
    end   = datetime.today().strftime("%Y-%m-%d")

    loop = asyncio.get_event_loop()

    # Fetch prices (fills DuckDB cache)
    try:
        await loop.run_in_executor(None, fetcher.ensure_prices, tickers, start, end)
    except Exception as e:
        logger.warning(f"Price fetch warning: {e}")

    # Load wide adj-close from cache
    prices = await loop.run_in_executor(None, cache.get_adj_close, tickers, start, end)

    if prices.empty or prices.shape[1] < 3:
        raise HTTPException(422, "Not enough price data — try a longer period or more tickers")

    if prices.shape[0] < 60:
        raise HTTPException(422, f"Only {prices.shape[0]} observations — need at least 60")

    # Build the model
    try:
        model = await loop.run_in_executor(
            None, build_risk_model, prices, req.half_life
        )
    except Exception as e:
        logger.exception("Risk model error")
        raise HTTPException(500, f"Model estimation failed: {e}")

    # Equal-weight portfolio analytics
    ew = {t: 1.0 / model.n_assets for t in model.tickers}
    port = compute_portfolio_risk(model, ew)

    # Top-5 loader per factor (positive & negative)
    factor_top = []
    for k in range(model.n_factors):
        col = model.loadings[:, k]
        top_pos = int(np.argmax(col))
        order = np.argsort(col)
        top5_long  = [{"ticker": model.tickers[i], "loading": _safe(col[i])} for i in order[-5:][::-1]]
        top5_short = [{"ticker": model.tickers[i], "loading": _safe(col[i])} for i in order[:5]]
        factor_top.append({
            "factor": f"F{k+1}",
            "expl_var_pct": _safe(float(model.factor_expl_var[k]) * 100),
            "vol_ann": _safe(float(model.factor_vols[k]) * 100),
            "top_long":  top5_long,
            "top_short": top5_short,
        })

    # Per-asset risk table
    asset_risk = []
    for i, t in enumerate(model.tickers):
        asset_risk.append({
            "ticker":         t,
            "total_vol":      _safe(float(model.total_vols[i]) * 100),
            "systematic_vol": _safe(float(model.total_vols[i] * np.sqrt(model.systematic_pct[i])) * 100),
            "specific_vol":   _safe(float(model.specific_vols[i]) * 100),
            "systematic_pct": _safe(float(model.systematic_pct[i]) * 100),
        })

    # Scree data: eigenvalue index vs value (daily), with MP cutoff
    scree = [
        {"i": int(i), "eigenvalue": _safe(float(v)), "signal": bool(v >= model.lambda_plus)}
        for i, v in enumerate(model.all_eigenvalues[:min(100, len(model.all_eigenvalues))])
    ]

    # Correlation matrix — cap at 50 for rendering
    corr_tickers = model.tickers[:50]
    corr_slice   = model.corr_matrix[:50, :50]
    corr_flat    = [
        {"i": i, "j": j, "r": _safe(float(corr_slice[i, j]))}
        for i in range(len(corr_tickers))
        for j in range(len(corr_tickers))
    ]

    return {
        "tickers":       model.tickers,
        "n_assets":      model.n_assets,
        "n_obs":         model.n_obs,
        "n_factors":     model.n_factors,
        "lambda_plus":   _safe(model.lambda_plus),
        "period":        req.period,
        "half_life":     req.half_life,

        "scree":         scree,
        "factors":       factor_top,
        "asset_risk":    asset_risk,

        "corr_tickers":  corr_tickers,
        "corr_flat":     corr_flat,

        "portfolio": {
            "port_vol":       _safe(port.port_vol * 100),
            "var_95":         _safe(port.var_95 * 100),
            "cvar_95":        _safe(port.cvar_95 * 100),
            "var_99":         _safe(port.var_99 * 100),
            "systematic_pct": _safe(port.systematic_pct * 100),
            "specific_pct":   _safe(port.specific_pct * 100),
            "factor_contributions": [
                {"factor": fc["factor"], "pct": _safe(fc["pct"] * 100)}
                for fc in port.factor_contributions
            ],
        },
    }
