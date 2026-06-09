"""
Risk analysis API.

POST /api/risk/analyze
  Given a portfolio (weights dict) and optional benchmark, returns:
  - VaR / CVaR at 95% and 99%
  - Concentration metrics (HHI, effective N, top-N weights)
  - Fama-French 3-factor attribution
  - Rolling beta vs SPY
  - Sector exposure
  - Correlation heatmap of holdings
"""
import asyncio
from datetime import datetime, timedelta
from typing import Optional
import logging

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from app.core.data import cache, fetcher
from app.core.data.universe import get_sp500
from app.core.risk.metrics import (
    var_cvar,
    concentration,
    rolling_beta,
    portfolio_returns_from_weights,
    sector_exposure,
)
from app.core.risk.attribution import ff3_attribution

router = APIRouter(tags=["risk"])
logger = logging.getLogger(__name__)

_TODAY = datetime.today().strftime("%Y-%m-%d")


class RiskRequest(BaseModel):
    weights: dict[str, float]
    start_date: str = "2019-01-01"
    benchmark: str = "SPY"

    @field_validator("weights")
    @classmethod
    def check_weights(cls, v):
        if len(v) < 1:
            raise ValueError("Need at least 1 ticker in weights")
        if len(v) > 200:
            raise ValueError("Max 200 tickers")
        cleaned = {k.upper().strip(): float(w) for k, w in v.items() if float(w) > 0}
        if not cleaned:
            raise ValueError("All weights are zero")
        total = sum(cleaned.values())
        return {k: w / total for k, w in cleaned.items()}


def _run_analysis(weights: dict, start_date: str, benchmark_ticker: str) -> dict:
    tickers = list(weights.keys())
    all_tickers = list({*tickers, benchmark_ticker})

    fetcher.ensure_prices(all_tickers, start_date, _TODAY)
    prices = cache.get_adj_close(all_tickers, start_date, _TODAY)

    if prices.empty:
        return {"error": "No price data available"}

    missing = [t for t in tickers if t not in prices.columns]

    port_ret = portfolio_returns_from_weights(prices, weights)
    if port_ret.empty or len(port_ret) < 30:
        return {"error": "Insufficient return history (need ≥30 trading days)"}

    var_results = var_cvar(port_ret)
    conc = concentration(weights)
    attribution = ff3_attribution(port_ret, start_date)

    # Rolling beta vs benchmark
    rolling_beta_data = []
    if benchmark_ticker in prices.columns:
        bm_ret = prices[benchmark_ticker].pct_change().dropna()
        rb = rolling_beta(port_ret, bm_ret, window=63).dropna()
        rolling_beta_data = [
            {"date": d.strftime("%Y-%m-%d"), "beta": round(float(b), 4)}
            for d, b in rb.items()
        ]

    # Sector exposure
    sector_map: dict = {}
    try:
        sp500 = get_sp500()
        if not sp500.empty:
            sector_map = sp500.set_index("ticker")["sector"].to_dict()
    except Exception:
        pass
    if not sector_map:
        # Fallback: fetch sector from yfinance for the tickers we hold
        import yfinance as yf
        for t in tickers:
            try:
                info = yf.Ticker(t).info
                sec = info.get("sector") or info.get("sectorDisp")
                if sec:
                    sector_map[t] = sec
            except Exception:
                pass
    sect_exp = sector_exposure(weights, sector_map)

    # Correlation heatmap
    held = [t for t in tickers if t in prices.columns]
    corr_result: dict = {}
    if len(held) >= 2:
        daily_ret = prices[held].pct_change().dropna()
        corr = daily_ret.corr()
        corr_result = {
            "tickers": held,
            "matrix": [[round(float(corr.loc[r, c]), 3) for c in held] for r in held],
        }

    ann_ret = float(port_ret.mean() * 252)
    ann_vol = float(port_ret.std() * (252 ** 0.5))
    sharpe = round(ann_ret / ann_vol, 4) if ann_vol > 0 else 0.0

    return {
        "tickers_used": held,
        "tickers_missing": missing,
        "price_history_start": prices.index[0].strftime("%Y-%m-%d"),
        "price_history_end": prices.index[-1].strftime("%Y-%m-%d"),
        "portfolio_stats": {
            "annualized_return": round(ann_ret, 4),
            "annualized_volatility": round(ann_vol, 4),
            "sharpe_ratio": sharpe,
            "n_obs": len(port_ret),
        },
        "var_cvar": var_results,
        "concentration": conc,
        "attribution": attribution,
        "rolling_beta": rolling_beta_data,
        "sector_exposure": sect_exp,
        "correlation": corr_result,
    }


@router.post("/analyze")
async def analyze_risk(req: RiskRequest):
    result = await asyncio.get_event_loop().run_in_executor(
        None,
        _run_analysis,
        req.weights,
        req.start_date,
        req.benchmark,
    )

    if isinstance(result, dict) and "error" in result and "tickers_used" not in result:
        raise HTTPException(422, result["error"])

    return result
