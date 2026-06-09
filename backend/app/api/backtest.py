"""
Backtest API.

POST /run   — runs a cross-sectional strategy and returns full tearsheet data.
GET  /runs  — list recent cached runs (future enhancement).
"""
import asyncio
from datetime import datetime, timedelta
from typing import Optional
import pandas as pd
import numpy as np
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.data import cache, fetcher, universe
from app.core.backtest import engine as bt_engine
from app.core.backtest import metrics as bt_metrics
from app.core.factors.engine import FACTOR_REGISTRY

router = APIRouter(tags=["backtest"])
logger = logging.getLogger(__name__)

_START_5Y = (datetime.today() - timedelta(days=5 * 365)).strftime("%Y-%m-%d")
_TODAY = datetime.today().strftime("%Y-%m-%d")


# ── Request / Response schemas ─────────────────────────────────────────────────

class BacktestConfig(BaseModel):
    factor: str = "momentum_12_1"
    top_n: int = 50
    cost_bps: float = 10.0
    start_date: str = "2019-01-01"
    end_date: Optional[str] = None

    model_config = {"json_schema_extra": {"example": {
        "factor": "momentum_12_1",
        "top_n": 50,
        "cost_bps": 10.0,
        "start_date": "2019-01-01",
    }}}


# ── /run ───────────────────────────────────────────────────────────────────────

@router.post("/run")
async def run_backtest(config: BacktestConfig):
    if config.factor not in FACTOR_REGISTRY:
        raise HTTPException(400, f"Unknown factor. Options: {list(FACTOR_REGISTRY.keys())}")

    end = config.end_date or _TODAY

    # Ensure universe prices are cached
    sp500 = universe.get_sp500()
    tickers = sp500["ticker"].tolist()
    cached_count = sum(1 for t in tickers if cache.get_last_date(t) is not None)
    if cached_count < 5:
        raise HTTPException(503, "Price data not cached yet. Call GET /api/factors/scores first.")

    # Also need SPY for benchmark
    await asyncio.get_event_loop().run_in_executor(
        None, fetcher.ensure_prices, ["SPY"], _START_5Y, end
    )

    prices = cache.get_adj_close(tickers, config.start_date, end)
    spy_prices = cache.get_adj_close(["SPY"], config.start_date, end)

    if prices.empty or len(prices.columns) < 10:
        raise HTTPException(503, "Insufficient price data. Load S&P 500 prices via the Screener first.")

    # Run backtest (CPU-bound — offload to thread)
    port_returns = await asyncio.get_event_loop().run_in_executor(
        None,
        _run_sync,
        prices,
        config,
    )

    if port_returns is None or port_returns.empty:
        raise HTTPException(500, "Backtest returned no results.")

    # Benchmark
    bm_returns = (
        spy_prices["SPY"].pct_change().dropna()
        if "SPY" in spy_prices.columns
        else None
    )

    # Align
    port_returns = port_returns.sort_index()
    if bm_returns is not None:
        bm_returns = bm_returns.reindex(port_returns.index).fillna(0)

    # --- Compute all outputs ---
    equity = bt_engine.compute_equity_curve(port_returns)
    drawdown = bt_engine.compute_drawdown(port_returns)
    monthly_pivot = bt_engine.compute_monthly_returns(port_returns)
    rolling_sharpe = bt_engine.compute_rolling_sharpe(port_returns)
    stats = bt_metrics.compute_all(port_returns, bm_returns)

    # Benchmark equity curve
    bm_equity = (
        bt_engine.compute_equity_curve(bm_returns)
        if bm_returns is not None
        else None
    )

    # --- Serialize ---
    equity_curve = _to_curve(equity, bm_equity, port_returns, bm_returns)
    drawdown_series = [
        {"date": str(d.date()), "drawdown": _f(v)}
        for d, v in drawdown.items()
    ]
    monthly_returns = _monthly_to_list(monthly_pivot)
    rolling_series = [
        {"date": str(d.date()), "sharpe": _f(v)}
        for d, v in rolling_sharpe.dropna().items()
    ]

    return {
        "config": config.model_dump(),
        "stats": stats,
        "equity_curve": equity_curve,
        "drawdown_series": drawdown_series,
        "monthly_returns": monthly_returns,
        "rolling_sharpe": rolling_series,
        "n_dates": len(port_returns),
        "n_tickers_available": len(prices.columns),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _run_sync(prices: pd.DataFrame, config: BacktestConfig) -> pd.Series:
    return bt_engine.run(
        prices=prices,
        factor=config.factor,
        top_n=config.top_n,
        cost_bps=config.cost_bps,
        start_date=config.start_date,
        end_date=config.end_date,
    )


def _f(v) -> Optional[float]:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    return round(float(v), 6)


def _to_curve(
    equity: pd.Series,
    bm_equity: Optional[pd.Series],
    port_ret: pd.Series,
    bm_ret: Optional[pd.Series],
) -> list[dict]:
    result = []
    for date, p_val in equity.items():
        entry: dict = {
            "date": str(date.date()),
            "portfolio": _f(p_val),
            "portfolio_ret": _f(port_ret.get(date)),
        }
        if bm_equity is not None and date in bm_equity.index:
            entry["benchmark"] = _f(bm_equity[date])
            entry["benchmark_ret"] = _f(bm_ret[date] if bm_ret is not None else None)
        result.append(entry)
    return result


def _monthly_to_list(pivot: pd.DataFrame) -> list[dict]:
    records = []
    for year in pivot.index:
        for month in pivot.columns:
            val = pivot.loc[year, month]
            records.append({
                "year": int(year),
                "month": int(month),
                "return_pct": _f(val) if not pd.isna(val) else None,
            })
    return records
