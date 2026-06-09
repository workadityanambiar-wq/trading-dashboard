"""
Short-term technical signals screener.

GET /api/technical/signals   — compute signals for a universe or theme
GET /api/technical/themes    — return theme/segment hierarchy
"""
import asyncio
from datetime import datetime, timedelta
from typing import Optional
import numpy as np
import pandas as pd
import logging

from fastapi import APIRouter, Query, HTTPException

from app.core.data import cache
from app.core.data.universe_themes import THEMES, get_tickers_for, themes_as_dict
from app.core.data import universe as uni_module
from app.core.factors.technical import compute_all_signals

router = APIRouter(tags=["technical"])
logger = logging.getLogger(__name__)

_START_1Y  = (datetime.today() - timedelta(days=365)).strftime("%Y-%m-%d")
_START_6M  = (datetime.today() - timedelta(days=180)).strftime("%Y-%m-%d")
_TODAY     = datetime.today().strftime("%Y-%m-%d")


def _safe(val) -> Optional[float]:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    return round(float(val), 4)


def _resolve_tickers(universe: str, theme: str, segment: str) -> list[str]:
    """Resolve tickers from a universe/theme/segment string."""
    if theme:
        tickers = get_tickers_for(theme, segment or None)
        if not tickers:
            raise HTTPException(400, f"Unknown theme '{theme}' or segment '{segment}'")
        return tickers
    if universe == "sp500":
        return uni_module.get_sp500()["ticker"].tolist()
    if universe == "sp1500":
        return uni_module.get_sp1500_tickers()
    if universe == "all_cached":
        return list(cache.get_tickers_with_prices())
    # Treat as comma-separated custom list
    return [t.strip().upper() for t in universe.split(",") if t.strip()]


@router.get("/themes")
def get_themes():
    """Return the full theme / segment hierarchy for the UI."""
    return {"themes": themes_as_dict()}


@router.get("/signals")
async def get_signals(
    universe:   str  = Query("sp500", description="Preset or comma-separated tickers"),
    theme:      str  = Query("",      description="Theme ID (e.g. ai_infra)"),
    segment:    str  = Query("",      description="Segment ID within the theme"),
    search:     str  = Query(""),
    sort_by:    str  = Query("momentum_score", description="Column to sort by"),
    desc:       bool = Query(True),
    page:       int  = Query(1, ge=1),
    page_size:  int  = Query(100, ge=1, le=500),
    near_pivot: bool = Query(False,   description="Only return stocks within 1-3% of nearest monthly pivot"),
    pivot_min:  float = Query(0.01,   description="Min abs distance to pivot (default 1%)"),
    pivot_max:  float = Query(0.03,   description="Max abs distance to pivot (default 3%)"),
):
    tickers = _resolve_tickers(universe, theme, segment)
    if not tickers:
        return {"total": 0, "page": page, "pages": 1, "results": [], "universe_size": 0}

    # Always include SPY for relative-strength computation
    tickers_with_spy = list(dict.fromkeys(["SPY"] + tickers))

    # Fetch OHLCV data
    ohlcv = await asyncio.get_event_loop().run_in_executor(
        None, cache.get_ohlcv_wide, tickers_with_spy, _START_1Y, _TODAY
    )
    prices  = ohlcv.get("adj_close", pd.DataFrame())
    high    = ohlcv.get("high",      pd.DataFrame())
    low     = ohlcv.get("low",       pd.DataFrame())
    open_p  = ohlcv.get("open",      pd.DataFrame())
    volume  = ohlcv.get("volume",    pd.DataFrame())

    if prices.empty or len(prices.columns) < 2:
        return {"total": 0, "page": page, "pages": 1, "results": [],
                "universe_size": len(tickers), "message": "No price data cached for this universe"}

    # Forward-fill so weekend/holiday gaps don't produce NaN on the last row
    prices  = prices.ffill()
    high    = high.ffill()    if not high.empty   else high
    low     = low.ffill()     if not low.empty    else low
    open_p  = open_p.ffill()  if not open_p.empty else open_p
    volume  = volume.ffill()  if not volume.empty else volume

    signals_df = await asyncio.get_event_loop().run_in_executor(
        None, compute_all_signals,
        prices, high if not high.empty else None,
        low if not low.empty else None,
        open_p if not open_p.empty else None,
        volume if not volume.empty else None,
    )

    # Remove SPY from results
    signals_df = signals_df.drop(index="SPY", errors="ignore")

    # Use last valid price per ticker
    last_prices = prices.iloc[-1].dropna()
    prev_prices = prices.dropna(how="all").iloc[-2] if len(prices.dropna(how="all")) >= 2 else pd.Series(dtype=float)

    rows = []
    for ticker in signals_df.index:
        if ticker == "SPY":
            continue
        r = signals_df.loc[ticker]
        price = _safe(last_prices.get(ticker))
        prev  = prev_prices.get(ticker)
        chg_1d = _safe((last_prices.get(ticker, np.nan) / prev - 1) if prev and prev > 0 else None)

        np_raw = r.get("nearest_pivot")
        nearest_pivot = str(np_raw).upper() if (np_raw is not None and str(np_raw) != "nan") else None

        rows.append({
            "ticker": ticker,
            "price":  price,
            "chg_1d": chg_1d,
            "rsi":              _safe(r.get("rsi")),
            "bb_pct_b":         _safe(r.get("bb_pct_b")),
            "macd_hist":        _safe(r.get("macd_hist")),
            "ma50_dist":        _safe(r.get("ma50_dist")),
            "ma200_dist":       _safe(r.get("ma200_dist")),
            "rs_spy_20d":       _safe(r.get("rs_spy_20d")),
            "rs_spy_5d":        _safe(r.get("rs_spy_5d")),
            "vol_surge":        _safe(r.get("vol_surge")),
            "atr_ratio":        _safe(r.get("atr_ratio")),
            "overnight_gap":    _safe(r.get("overnight_gap")),
            "rev_5d":           _safe(r.get("rev_5d")),
            "momentum_score":   _safe(r.get("momentum_score")),
            "pivot_dist":       _safe(r.get("pivot_dist")),
            "nearest_pivot":    nearest_pivot,
        })

    # Search filter
    if search:
        s = search.upper()
        rows = [r for r in rows if s in r["ticker"]]

    # Pivot proximity filter: keep only stocks within [pivot_min, pivot_max] of nearest monthly pivot
    if near_pivot:
        rows = [
            r for r in rows
            if r.get("pivot_dist") is not None
            and pivot_min <= abs(r["pivot_dist"]) <= pivot_max
        ]

    # Sort
    def sort_key(r):
        v = r.get(sort_by)
        return v if v is not None else (-9999 if desc else 9999)
    rows.sort(key=sort_key, reverse=desc)

    total = len(rows)
    offset = (page - 1) * page_size
    page_rows = rows[offset: offset + page_size]

    return {
        "total":         total,
        "page":          page,
        "page_size":     page_size,
        "pages":         max(1, -(-total // page_size)),
        "universe_size": len(tickers),
        "as_of":         prices.index[-1].strftime("%Y-%m-%d") if not prices.empty else None,
        "results":       page_rows,
    }
