"""
Pairs Trading & Statistical Arbitrage API
Endpoints:
  POST /api/pairs/discover        — run pair discovery scan
  GET  /api/pairs/regime          — current market regime
  GET  /api/pairs/detail/{t1}/{t2}— full pair analysis
  POST /api/pairs/backtest        — run backtest for a pair
"""
import asyncio
import logging
import warnings
from datetime import datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.data import cache, fetcher
from app.core.data.universe import get_sp500, get_sp1500_tickers
from app.core.pairs.stats import compute_pair_stats
from app.core.pairs.spread import build_spread
from app.core.pairs.signals import get_signal
from app.core.pairs.regime import detect_regime
from app.core.pairs.ml import compute_ml_probability
from app.core.pairs.backtest import run_pairs_backtest
from app.core.pairs.discovery import discover_pairs

logger = logging.getLogger(__name__)
router = APIRouter(tags=["pairs"])

_START_3Y = (datetime.today() - timedelta(days=1095)).strftime("%Y-%m-%d")
_START_2Y = (datetime.today() - timedelta(days=730)).strftime("%Y-%m-%d")
_TODAY    = datetime.today().strftime("%Y-%m-%d")


# ── Request / Response models ──────────────────────────────────────────────────

class DiscoverRequest(BaseModel):
    universe: str = "sp500"
    custom_tickers: list[str] = []
    min_correlation: float = 0.70
    max_pvalue: float = 0.05
    sector_filter: str = "any"
    spread_type: str = "log"
    hedge_method: str = "ols"
    zscore_window: int = 30
    top_n: int = 50

class BacktestRequest(BaseModel):
    ticker1: str
    ticker2: str
    period: str = "3y"
    spread_type: str = "log"
    hedge_method: str = "kalman"
    zscore_window: int = 30
    entry_threshold: float = 2.0
    exit_threshold: float = 0.5
    stop_threshold: float = 3.5
    max_holding_days: int = 60
    cost_bps: float = 5.0
    notional: float = 10000.0


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_prices(tickers: list[str], start: str) -> pd.DataFrame:
    today = datetime.today().strftime("%Y-%m-%d")
    fetcher.ensure_prices(tickers, start, today)
    return cache.get_adj_close(tickers, start, today)


def _safe_float(v) -> float | None:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    return float(v)


def _series_to_list(
    dates: pd.DatetimeIndex,
    *arrays: np.ndarray,
    keys: list[str],
) -> list[dict]:
    result = []
    for i, d in enumerate(dates):
        row = {"date": str(d.date())}
        for k, arr in zip(keys, arrays):
            v = arr[i] if i < len(arr) else None
            row[k] = None if (v is None or (isinstance(v, float) and np.isnan(v))) else round(float(v), 6)
        result.append(row)
    return result


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/discover")
async def discover(req: DiscoverRequest):
    """
    Scan a universe for cointegrated pairs.
    Returns ranked list sorted by z-score extremity + quality score.
    """
    loop = asyncio.get_event_loop()

    # Resolve universe
    if req.universe == "sp500":
        sp500_df   = get_sp500()
        tickers    = sp500_df["ticker"].tolist()
        sector_map = dict(zip(sp500_df["ticker"], sp500_df["sector"]))
    elif req.universe == "sp1500":
        tickers    = get_sp1500_tickers()
        sp500_df   = get_sp500()
        sector_map = dict(zip(sp500_df["ticker"], sp500_df["sector"]))
    elif req.universe == "custom" and req.custom_tickers:
        tickers    = [t.upper().strip() for t in req.custom_tickers]
        sector_map = {}
    else:
        sp500_df   = get_sp500()
        tickers    = sp500_df["ticker"].tolist()[:200]
        sector_map = dict(zip(sp500_df["ticker"], sp500_df["sector"]))

    tickers = tickers[:500]  # hard cap

    # Fetch prices
    try:
        prices = await loop.run_in_executor(None, _get_prices, tickers, _START_2Y)
    except Exception as e:
        raise HTTPException(500, f"Price fetch failed: {e}")

    if prices.empty:
        raise HTTPException(404, "No price data found for requested universe")

    # Run discovery
    try:
        result = await loop.run_in_executor(
            None, discover_pairs, prices, sector_map,
            req.min_correlation, req.max_pvalue, req.sector_filter,
            req.spread_type, req.hedge_method, req.zscore_window, req.top_n,
        )
    except Exception as e:
        logger.error(f"Discovery failed: {e}")
        raise HTTPException(500, f"Discovery error: {e}")

    # Add regime info
    try:
        spy_vix = await loop.run_in_executor(
            None, _get_prices, ["SPY", "^VIX"], _START_2Y
        )
        spy_p = spy_vix.get("SPY") or spy_vix.get("SPY")
        vix_p = spy_vix.get("^VIX")
        regime_info = detect_regime(spy_p, vix_p) if spy_p is not None else {"regime": "unknown"}
    except Exception:
        regime_info = {"regime": "unknown"}

    return {
        "universe":       req.universe,
        "total_tested":   result["total_tested"],
        "passed_corr":    result["passed_corr"],
        "passed_coint":   result["passed_coint"],
        "returned":       len(result["pairs"]),
        "as_of":          _TODAY,
        "regime":         regime_info.get("regime", "unknown"),
        "pairs":          result["pairs"],
    }


@router.get("/regime")
async def get_regime():
    """Current market regime based on VIX + SPY MA positioning."""
    loop = asyncio.get_event_loop()
    try:
        prices = await loop.run_in_executor(
            None, _get_prices, ["SPY", "^VIX"], _START_2Y
        )
        spy_p = prices.get("SPY")
        vix_p = prices.get("^VIX")
        if spy_p is None:
            raise ValueError("SPY data missing")
        return detect_regime(spy_p, vix_p)
    except Exception as e:
        raise HTTPException(500, f"Regime detection failed: {e}")


@router.get("/detail/{ticker1}/{ticker2}")
async def get_pair_detail(
    ticker1: str,
    ticker2: str,
    period: str = Query("2y", pattern="^[0-9]+[ymYM]$"),
    spread_type: str = Query("log"),
    hedge_method: str = Query("kalman"),
    zscore_window: int = Query(30, ge=5, le=120),
):
    """Full statistical analysis + spread time series for a pair."""
    loop = asyncio.get_event_loop()
    t1, t2 = ticker1.upper(), ticker2.upper()

    days  = int(period[:-1]) * (365 if period[-1].lower() == "y" else 30)
    start = (datetime.today() - timedelta(days=days)).strftime("%Y-%m-%d")

    try:
        prices = await loop.run_in_executor(None, _get_prices, [t1, t2], start)
    except Exception as e:
        raise HTTPException(500, f"Price fetch failed: {e}")

    if t1 not in prices.columns or t2 not in prices.columns:
        raise HTTPException(404, f"No data for {t1} or {t2}")

    p1 = prices[t1].dropna()
    p2 = prices[t2].dropna()

    try:
        stats = await loop.run_in_executor(
            None, compute_pair_stats, t1, t2, p1, p2
        )
        sr = await loop.run_in_executor(
            None, build_spread, p1, p2, spread_type, hedge_method, zscore_window
        )
    except Exception as e:
        raise HTTPException(500, f"Analysis failed: {e}")

    z_valid = sr.z_score[~np.isnan(sr.z_score)]
    cur_z   = float(z_valid[-1]) if len(z_valid) > 0 else 0.0
    sig     = get_signal(cur_z)

    # ML probability
    try:
        ml_res = await loop.run_in_executor(
            None, compute_ml_probability, sr.z_score, p1, p2, stats.half_life_days, cur_z
        )
        ml_prob = _safe_float(ml_res.probability)
        ml_importances = ml_res.feature_importances
        ml_model = ml_res.model_type
    except Exception:
        ml_prob, ml_importances, ml_model = None, {}, "none"

    # Regime
    try:
        spy_p  = await loop.run_in_executor(None, _get_prices, ["SPY", "^VIX"], _START_2Y)
        regime = detect_regime(spy_p.get("SPY"), spy_p.get("^VIX"))
    except Exception:
        regime = {"regime": "unknown", "pairs_enabled": True, "recommended_entry": 2.0}

    # Build spread time series for charts
    spread_series = _series_to_list(
        sr.dates,
        sr.spread, sr.z_score, sr.rolling_mean,
        sr.upper1, sr.lower1, sr.upper2, sr.lower2,
        sr.hedge_ratio_series,
        keys=["spread", "z_score", "rolling_mean",
              "upper1", "lower1", "upper2", "lower2", "hedge_ratio"],
    )

    # Price series (normalised to 100 at start)
    df_p = pd.DataFrame({"p1": p1, "p2": p2}).reindex(sr.dates).dropna()
    norm1 = (df_p["p1"] / df_p["p1"].iloc[0] * 100).round(3)
    norm2 = (df_p["p2"] / df_p["p2"].iloc[0] * 100).round(3)
    price_series = [
        {"date": str(d.date()), "p1": float(norm1[d]), "p2": float(norm2[d]),
         "raw_p1": round(float(df_p["p1"][d]), 2), "raw_p2": round(float(df_p["p2"][d]), 2)}
        for d in df_p.index
    ]

    return {
        "ticker1": t1,
        "ticker2": t2,
        "stats": {
            "pearson_corr":        round(stats.pearson_corr, 4),
            "spearman_corr":       round(stats.spearman_corr, 4),
            "adf_pvalue":          round(stats.adf_pvalue, 4),
            "adf_statistic":       round(stats.adf_statistic, 4),
            "is_adf_stationary":   stats.is_adf_stationary,
            "johansen_trace_stat": round(stats.johansen_trace_stat, 3),
            "johansen_crit_95":    round(stats.johansen_crit_95, 3),
            "is_cointegrated":     stats.is_cointegrated,
            "hurst_exponent":      round(stats.hurst_exponent, 4),
            "half_life_days":      round(stats.half_life_days, 1),
            "volatility_ratio":    round(stats.volatility_ratio, 4),
            "quality_score":       round(stats.quality_score, 1),
            "current_zscore":      round(cur_z, 4),
            "hedge_ratio":         round(sr.hedge_ratio, 4),
            "n_obs":               stats.n_obs,
            "signal":              sig.signal,
            "signal_description":  sig.description,
            "ml_probability":      ml_prob,
            "ml_feature_importances": ml_importances,
            "ml_model":            ml_model,
        },
        "regime":         regime,
        "spread_series":  spread_series,
        "price_series":   price_series,
    }


@router.post("/backtest")
async def backtest_pair(req: BacktestRequest):
    """Run a backtest for a specific pair strategy."""
    loop = asyncio.get_event_loop()
    t1, t2 = req.ticker1.upper(), req.ticker2.upper()

    days  = int(req.period[:-1]) * (365 if req.period[-1].lower() == "y" else 30)
    start = (datetime.today() - timedelta(days=days)).strftime("%Y-%m-%d")

    try:
        prices = await loop.run_in_executor(None, _get_prices, [t1, t2], start)
    except Exception as e:
        raise HTTPException(500, f"Price fetch failed: {e}")

    if t1 not in prices.columns or t2 not in prices.columns:
        raise HTTPException(404, f"No data for {t1} or {t2}")

    p1, p2 = prices[t1].dropna(), prices[t2].dropna()

    try:
        result = await loop.run_in_executor(
            None, run_pairs_backtest,
            t1, t2, p1, p2,
            req.spread_type, req.hedge_method, req.zscore_window,
            req.entry_threshold, req.exit_threshold, req.stop_threshold,
            req.max_holding_days, req.cost_bps, req.notional,
        )
    except Exception as e:
        logger.error(f"Backtest failed {t1}/{t2}: {e}")
        raise HTTPException(500, f"Backtest error: {e}")

    return {
        "ticker1":           result.ticker1,
        "ticker2":           result.ticker2,
        "total_return":      result.total_return,
        "cagr":              result.cagr,
        "sharpe":            result.sharpe,
        "sortino":           result.sortino,
        "max_drawdown":      result.max_drawdown,
        "win_rate":          result.win_rate,
        "avg_holding_days":  result.avg_holding_days,
        "profit_factor":     result.profit_factor,
        "n_trades":          result.n_trades,
        "exposure":          result.exposure,
        "equity_curve":      result.equity_curve,
        "drawdown_series":   result.drawdown_series,
        "trade_log":         result.trade_log,
        "monthly_returns":   result.monthly_returns,
    }
