"""GET /api/regime/current — full 5-dimension market regime classification."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException

from app.core.data import cache, fetcher
from app.core.regime.detector import SIGNAL_TICKERS, detect_regime

logger = logging.getLogger(__name__)
router = APIRouter()

_2Y_DAYS = 730


@router.get("/current")
async def get_current_regime():
    end   = datetime.today().strftime("%Y-%m-%d")
    start = (datetime.today() - timedelta(days=_2Y_DAYS)).strftime("%Y-%m-%d")

    tickers = list(SIGNAL_TICKERS)
    loop = asyncio.get_event_loop()

    try:
        await loop.run_in_executor(None, fetcher.ensure_prices, tickers, start, end)
    except Exception as e:
        logger.warning(f"Regime price fetch warning: {e}")

    prices = await loop.run_in_executor(None, cache.get_adj_close, tickers, start, end)

    if prices.empty:
        raise HTTPException(422, "Could not fetch market data for regime detection")

    try:
        r = detect_regime(prices)
    except Exception as e:
        logger.exception("Regime detection failed")
        raise HTTPException(500, f"Regime detection failed: {e}")

    def s(v) -> float | None:
        if v is None: return None
        f = float(v)
        return None if f != f else round(f, 4)

    return {
        "as_of": end,
        "regime": {
            "risk":       r.risk,
            "inflation":  r.inflation,
            "growth":     r.growth,
            "trend":      r.trend,
            "volatility": r.volatility,
            "label":      r.label,
            "bias":       r.bias,
            "confidence": s(r.confidence),
        },
        "scores": {
            "risk":       s(r.risk_score),
            "inflation":  s(r.infl_score),
            "growth":     s(r.growth_score),
            "trend":      s(r.trend_score),
            "volatility": s(r.vol_score),
        },
        "signals": {k: s(v) for k, v in r.signals.items()},
        "recommendations": {
            "best_factors":  r.best_factors,
            "avoid_factors": r.avoid_factors,
            "best_sectors":  r.best_sectors,
            "avoid_sectors": r.avoid_sectors,
            "sizing":        r.sizing,
        },
    }
