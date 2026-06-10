"""
Short-term technical signals screener + setup engine + market regime.
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

_START_1Y = (datetime.today() - timedelta(days=365)).strftime("%Y-%m-%d")
_TODAY    = datetime.today().strftime("%Y-%m-%d")


def _safe(val) -> Optional[float]:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    return round(float(val), 4)


def _resolve_tickers(universe: str, theme: str, segment: str) -> list[str]:
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
    return [t.strip().upper() for t in universe.split(",") if t.strip()]


def _determine_regime(
    spy_vs_50d: Optional[float],
    spy_vs_200d: Optional[float],
    vix: Optional[float],
    breadth_50d: Optional[float],
) -> tuple[str, str, str, int]:
    """Returns (regime, description, best_strategy, score 0-100)."""
    if vix and vix > 35:
        return (
            "Panic",
            "Extreme fear. VIX above 35. Most swing longs are high risk.",
            "Fade volatility spikes. Wait for VIX compression. Avoid new breakout longs.",
            10,
        )

    spy_below_200  = spy_vs_200d is not None and spy_vs_200d < -0.05
    weak_breadth   = breadth_50d is not None and breadth_50d < 0.40
    high_vix       = vix is not None and vix > 25

    if spy_below_200 or (weak_breadth and high_vix):
        return (
            "Bear",
            "SPY below 200D MA or breadth deteriorating with elevated VIX.",
            "Defensive positioning. Avoid breakout longs. Raise stops. Consider cash.",
            25,
        )

    spy_above_50   = spy_vs_50d  is not None and spy_vs_50d  > 0
    strong_breadth = breadth_50d is not None and breadth_50d > 0.60
    low_vix        = vix is None or vix < 20

    if spy_above_50 and strong_breadth and low_vix:
        return (
            "Strong Trend",
            "SPY above 50D. Broad participation. VIX calm. Best environment for momentum.",
            "Momentum breakouts. Stage 2 setups. Add to winners. Full position sizing.",
            85,
        )

    return (
        "Choppy",
        "Mixed signals. SPY range-bound or uneven breadth.",
        "Mean reversion setups. Smaller size. Tighter stops. Be selective.",
        50,
    )


async def _fetch_ohlcv(tickers: list[str]) -> dict:
    tickers_with_spy = list(dict.fromkeys(["SPY"] + tickers))
    ohlcv = await asyncio.get_event_loop().run_in_executor(
        None, cache.get_ohlcv_wide, tickers_with_spy, _START_1Y, _TODAY
    )
    for key in ohlcv:
        if not ohlcv[key].empty:
            ohlcv[key] = ohlcv[key].ffill()
    return ohlcv


# ── /themes ───────────────────────────────────────────────────────────────────

@router.get("/themes")
def get_themes():
    return {"themes": themes_as_dict()}


# ── /signals ──────────────────────────────────────────────────────────────────

@router.get("/signals")
async def get_signals(
    universe:   str   = Query("sp500"),
    theme:      str   = Query(""),
    segment:    str   = Query(""),
    search:     str   = Query(""),
    sort_by:    str   = Query("momentum_score"),
    desc:       bool  = Query(True),
    page:       int   = Query(1, ge=1),
    page_size:  int   = Query(100, ge=1, le=500),
    near_pivot: bool  = Query(False),
    pivot_min:  float = Query(0.01),
    pivot_max:  float = Query(0.03),
):
    tickers = _resolve_tickers(universe, theme, segment)
    if not tickers:
        return {"total": 0, "page": page, "pages": 1, "results": [], "universe_size": 0}

    ohlcv   = await _fetch_ohlcv(tickers)
    prices  = ohlcv.get("adj_close", pd.DataFrame())
    high    = ohlcv.get("high",      pd.DataFrame())
    low     = ohlcv.get("low",       pd.DataFrame())
    open_p  = ohlcv.get("open",      pd.DataFrame())
    volume  = ohlcv.get("volume",    pd.DataFrame())

    if prices.empty or len(prices.columns) < 2:
        return {"total": 0, "page": page, "pages": 1, "results": [],
                "universe_size": len(tickers), "message": "No price data cached"}

    signals_df = await asyncio.get_event_loop().run_in_executor(
        None, compute_all_signals,
        prices,
        high   if not high.empty   else None,
        low    if not low.empty    else None,
        open_p if not open_p.empty else None,
        volume if not volume.empty else None,
    )
    signals_df = signals_df.drop(index="SPY", errors="ignore")

    last_prices = prices.iloc[-1].dropna()
    prev_prices = prices.dropna(how="all").iloc[-2] if len(prices.dropna(how="all")) >= 2 else pd.Series(dtype=float)

    rows = []
    for ticker in signals_df.index:
        if ticker == "SPY":
            continue
        r     = signals_df.loc[ticker]
        price = _safe(last_prices.get(ticker))
        prev  = prev_prices.get(ticker)
        chg_1d = _safe((last_prices.get(ticker, np.nan) / prev - 1) if prev and prev > 0 else None)

        np_raw        = r.get("nearest_pivot")
        nearest_pivot = str(np_raw).upper() if (np_raw is not None and str(np_raw) != "nan") else None

        rows.append({
            "ticker":         ticker,
            "price":          price,
            "chg_1d":         chg_1d,
            "rsi":            _safe(r.get("rsi")),
            "bb_pct_b":       _safe(r.get("bb_pct_b")),
            "macd_hist":      _safe(r.get("macd_hist")),
            "ma50_dist":      _safe(r.get("ma50_dist")),
            "ma200_dist":     _safe(r.get("ma200_dist")),
            "rs_spy_20d":     _safe(r.get("rs_spy_20d")),
            "rs_spy_5d":      _safe(r.get("rs_spy_5d")),
            "vol_surge":      _safe(r.get("vol_surge")),
            "atr_ratio":      _safe(r.get("atr_ratio")),
            "overnight_gap":  _safe(r.get("overnight_gap")),
            "rev_5d":         _safe(r.get("rev_5d")),
            "momentum_score": _safe(r.get("momentum_score")),
            "pivot_dist":     _safe(r.get("pivot_dist")),
            "nearest_pivot":  nearest_pivot,
        })

    if search:
        s = search.upper()
        rows = [r for r in rows if s in r["ticker"]]

    if near_pivot:
        rows = [
            r for r in rows
            if r.get("pivot_dist") is not None
            and pivot_min <= abs(r["pivot_dist"]) <= pivot_max
        ]

    def sort_key(r):
        v = r.get(sort_by)
        return v if v is not None else (-9999 if desc else 9999)
    rows.sort(key=sort_key, reverse=desc)

    total     = len(rows)
    offset    = (page - 1) * page_size
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


# ── /setups ───────────────────────────────────────────────────────────────────

@router.get("/setups")
async def get_setups(
    universe:     str  = Query("sp500"),
    setup_filter: str  = Query("", description="Filter by exact setup name"),
    stage_filter: str  = Query("", description="Comma-separated stages, e.g. '2' or '1,2'"),
    min_score:    float = Query(0,  description="Min confluence score 0-100"),
    sort_by:      str  = Query("confluence_score"),
    desc:         bool = Query(True),
    page:         int  = Query(1, ge=1),
    page_size:    int  = Query(50, ge=1, le=200),
):
    tickers = _resolve_tickers(universe, "", "")
    if not tickers:
        return {"total": 0, "page": page, "pages": 1, "results": [], "universe_size": 0}

    ohlcv   = await _fetch_ohlcv(tickers)
    prices  = ohlcv.get("adj_close", pd.DataFrame())
    high    = ohlcv.get("high",      pd.DataFrame())
    low     = ohlcv.get("low",       pd.DataFrame())
    open_p  = ohlcv.get("open",      pd.DataFrame())
    volume  = ohlcv.get("volume",    pd.DataFrame())

    if prices.empty or len(prices.columns) < 2:
        return {"total": 0, "page": page, "pages": 1, "results": [],
                "universe_size": len(tickers), "message": "No price data cached"}

    signals_df = await asyncio.get_event_loop().run_in_executor(
        None, compute_all_signals,
        prices,
        high   if not high.empty   else None,
        low    if not low.empty    else None,
        open_p if not open_p.empty else None,
        volume if not volume.empty else None,
    )
    signals_df = signals_df.drop(index="SPY", errors="ignore")

    last_prices = prices.iloc[-1].dropna()

    rows = []
    for ticker in signals_df.index:
        if ticker == "SPY":
            continue
        r     = signals_df.loc[ticker]
        price = _safe(last_prices.get(ticker))
        setup = str(r.get("setup", "No Setup"))

        # Trade planning via ATR
        atr_ratio_val = r.get("atr_ratio")
        atr_dollar    = float(price) * float(atr_ratio_val) if (price and atr_ratio_val and not np.isnan(float(atr_ratio_val))) else None
        entry         = price
        stop_price    = _safe(float(price) - 2.0 * atr_dollar) if (price and atr_dollar) else None
        target_price  = _safe(float(price) + 3.0 * atr_dollar) if (price and atr_dollar) else None
        rr            = None
        if price and stop_price and target_price and price != stop_price:
            rr = _safe((target_price - price) / (price - stop_price))

        np_raw        = r.get("nearest_pivot")
        nearest_pivot = str(np_raw).upper() if (np_raw is not None and str(np_raw) != "nan") else None

        rows.append({
            "ticker":           ticker,
            "price":            price,
            "chg_1d":           _safe(r.get("chg_1d")),
            "setup":            setup,
            "stage":            _safe(r.get("stage")),
            "breakout_score":   _safe(r.get("breakout_score")),
            "confluence_score": _safe(r.get("confluence_score")),
            "rsi":              _safe(r.get("rsi")),
            "rs_spy_20d":       _safe(r.get("rs_spy_20d")),
            "vol_surge":        _safe(r.get("vol_surge")),
            "ma50_dist":        _safe(r.get("ma50_dist")),
            "ma200_dist":       _safe(r.get("ma200_dist")),
            "bb_width_pct":     _safe(r.get("bb_width_pct")),
            "atr_pct":          _safe(r.get("atr_pct")),
            "dist_52w_high":    _safe(r.get("dist_52w_high")),
            "accum_score":      _safe(r.get("accum_score")),
            "nearest_pivot":    nearest_pivot,
            "pivot_dist":       _safe(r.get("pivot_dist")),
            "entry":            _safe(entry),
            "stop":             stop_price,
            "target":           target_price,
            "rr":               rr,
            "atr_dollar":       _safe(atr_dollar),
        })

    # Filters
    if setup_filter:
        rows = [r for r in rows if r["setup"] == setup_filter]
    else:
        rows = [r for r in rows if r["setup"] != "No Setup"]

    if stage_filter:
        stages = set()
        for s in stage_filter.split(","):
            try:
                stages.add(float(s.strip()))
            except ValueError:
                pass
        if stages:
            rows = [r for r in rows if r.get("stage") in stages]

    if min_score > 0:
        rows = [r for r in rows if (r.get("confluence_score") or 0) >= min_score]

    def sort_key(r):
        v = r.get(sort_by)
        return v if v is not None else (-9999 if desc else 9999)
    rows.sort(key=sort_key, reverse=desc)

    total     = len(rows)
    offset    = (page - 1) * page_size
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


# ── /regime ───────────────────────────────────────────────────────────────────

@router.get("/regime")
async def get_regime():
    """Market regime detection: Strong Trend / Choppy / Bear / Panic."""
    # SPY trend
    spy_ohlcv = await asyncio.get_event_loop().run_in_executor(
        None, cache.get_ohlcv_wide, ["SPY"], _START_1Y, _TODAY
    )
    spy_prices = spy_ohlcv.get("adj_close", pd.DataFrame()).ffill()

    spy_vs_50d = spy_vs_200d = None
    if not spy_prices.empty and "SPY" in spy_prices.columns:
        spy = spy_prices["SPY"].dropna()
        if len(spy) >= 50:
            spy_vs_50d = float(spy.iloc[-1] / spy.rolling(50).mean().iloc[-1] - 1)
        if len(spy) >= 200:
            spy_vs_200d = float(spy.iloc[-1] / spy.rolling(200).mean().iloc[-1] - 1)

    # VIX
    vix_value = None
    try:
        import yfinance as yf
        vix_hist = await asyncio.get_event_loop().run_in_executor(
            None, lambda: yf.Ticker("^VIX").history(period="5d")
        )
        if not vix_hist.empty:
            vix_value = float(vix_hist["Close"].iloc[-1])
    except Exception:
        pass

    # Breadth: % of S&P 500 above 50D / 200D MA
    breadth_above_50d = breadth_above_200d = None
    try:
        sp500_tickers = uni_module.get_sp500()["ticker"].tolist()
        broad_ohlcv   = await asyncio.get_event_loop().run_in_executor(
            None, cache.get_ohlcv_wide, sp500_tickers, _START_1Y, _TODAY
        )
        bp = broad_ohlcv.get("adj_close", pd.DataFrame()).ffill()
        if not bp.empty and len(bp) >= 50:
            price_now = bp.iloc[-1]
            ma50_now  = bp.rolling(50).mean().iloc[-1]
            breadth_above_50d = float((price_now > ma50_now).mean())
            if len(bp) >= 200:
                ma200_now = bp.rolling(200).mean().iloc[-1]
                breadth_above_200d = float((price_now > ma200_now).mean())
    except Exception:
        pass

    regime, description, best_strategy, score = _determine_regime(
        spy_vs_50d, spy_vs_200d, vix_value, breadth_above_50d
    )

    return {
        "regime":            regime,
        "description":       description,
        "best_strategy":     best_strategy,
        "score":             score,
        "vix":               round(vix_value, 2)          if vix_value          else None,
        "spy_vs_50d":        round(spy_vs_50d * 100, 2)   if spy_vs_50d         else None,
        "spy_vs_200d":       round(spy_vs_200d * 100, 2)  if spy_vs_200d        else None,
        "breadth_above_50d":  round(breadth_above_50d * 100, 1) if breadth_above_50d  else None,
        "breadth_above_200d": round(breadth_above_200d * 100, 1) if breadth_above_200d else None,
    }
