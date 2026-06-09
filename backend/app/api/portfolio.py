"""
Portfolio optimization API.

POST /api/portfolio/optimize
  Runs MVO, min-vol, HRP, and equal-weight on a given ticker list.
  Returns allocations, performance metrics, efficient frontier, and correlation matrix.
"""
import asyncio
from datetime import datetime, timedelta
from typing import Optional
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from app.core.data import cache, fetcher
from app.core.portfolio import optimizer

router = APIRouter(tags=["portfolio"])
logger = logging.getLogger(__name__)

_START_5Y = (datetime.today() - timedelta(days=5 * 365)).strftime("%Y-%m-%d")
_TODAY = datetime.today().strftime("%Y-%m-%d")

VALID_METHODS = {"equal_weight", "max_sharpe", "min_volatility", "hrp"}


class OptimizeRequest(BaseModel):
    tickers: list[str]
    methods: list[str] = ["equal_weight", "max_sharpe", "min_volatility", "hrp"]
    max_weight: float = 0.10
    start_date: str = "2019-01-01"

    @field_validator("tickers")
    @classmethod
    def check_tickers(cls, v):
        if len(v) < 2:
            raise ValueError("Need at least 2 tickers")
        if len(v) > 100:
            raise ValueError("Max 100 tickers")
        return [t.upper().strip() for t in v]

    @field_validator("methods")
    @classmethod
    def check_methods(cls, v):
        invalid = set(v) - VALID_METHODS
        if invalid:
            raise ValueError(f"Unknown methods: {invalid}. Valid: {VALID_METHODS}")
        return v

    @field_validator("max_weight")
    @classmethod
    def check_max_weight(cls, v):
        if not (0.01 <= v <= 1.0):
            raise ValueError("max_weight must be between 0.01 and 1.0")
        return v


@router.post("/optimize")
async def optimize_portfolio(req: OptimizeRequest):
    # Ensure prices cached
    await asyncio.get_event_loop().run_in_executor(
        None, fetcher.ensure_prices, req.tickers, req.start_date, _TODAY
    )

    prices = cache.get_adj_close(req.tickers, req.start_date, _TODAY)
    if prices.empty:
        raise HTTPException(503, "No price data available for the requested tickers.")

    missing = [t for t in req.tickers if t not in prices.columns]
    if missing:
        logger.warning(f"Missing prices for: {missing}")

    if len(prices.columns) < 2:
        raise HTTPException(400, "Need prices for at least 2 tickers to optimize.")

    result = await asyncio.get_event_loop().run_in_executor(
        None,
        optimizer.optimize,
        prices,
        req.methods,
        req.max_weight,
        60,
    )

    if "error" in result:
        raise HTTPException(422, result["error"])

    return {
        "tickers_used": prices.columns.tolist(),
        "tickers_missing": missing,
        "price_history_start": prices.index[0].strftime("%Y-%m-%d"),
        "price_history_end": prices.index[-1].strftime("%Y-%m-%d"),
        **result,
    }
