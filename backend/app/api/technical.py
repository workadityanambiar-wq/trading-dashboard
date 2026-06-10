"""
Short-term technical signals screener + setup engine + market regime.
"""
import asyncio
from datetime import datetime, timedelta, date
from typing import Optional
import numpy as np
import pandas as pd
import logging

from fastapi import APIRouter, BackgroundTasks, Query, HTTPException

from app.core.data import cache
from app.core.data.universe_themes import THEMES, get_tickers_for, themes_as_dict
from app.core.data import universe as uni_module
from app.core.data import universe_india as india_module
from app.core.data import universe_global as global_module
from app.core.factors.technical import compute_all_signals
from app.core.backtest.setup_backtest import (
    run_setup_backtest, load_cached_winrates, save_winrates_cache,
)

router = APIRouter(tags=["technical"])
logger = logging.getLogger(__name__)

_START_1Y = (datetime.today() - timedelta(days=365)).strftime("%Y-%m-%d")
_TODAY    = datetime.today().strftime("%Y-%m-%d")

_SECTOR_ETF_TICKERS = list(uni_module.SECTOR_ETFS.keys())
_SECTOR_NAME_TO_ETF = {v["sector"]: k for k, v in uni_module.SECTOR_ETFS.items()}

_IN_SUFFIXES = {".NS"}
_EU_SUFFIXES = {".DE", ".PA", ".L", ".AS", ".SW", ".MC", ".MI"}


def _universe_benchmark(tickers: list[str]) -> tuple[str, bool]:
    """Return (benchmark_ticker, use_sector_etfs).
    Non-US universes use their regional index and skip US sector ETFs."""
    n = max(len(tickers), 1)
    ns = sum(1 for t in tickers if any(t.endswith(s) for s in _IN_SUFFIXES))
    eu = sum(1 for t in tickers if any(t.endswith(s) for s in _EU_SUFFIXES))
    if ns / n > 0.4:
        return "^NSEI", False
    if eu / n > 0.4:
        return "^STOXX50E", False
    return "SPY", True

# How well each setup type fits each market regime (0–100).
# High score = regime is a tailwind for this setup type.
_REGIME_SETUP_AFFINITY: dict[str, dict[str, int]] = {
    "Early Breakout":             {"Strong Trend": 90, "Choppy": 45, "Bear": 15, "Panic": 5},
    "Volatility Squeeze":         {"Strong Trend": 75, "Choppy": 62, "Bear": 35, "Panic": 20},
    "Momentum Continuation":      {"Strong Trend": 90, "Choppy": 40, "Bear": 10, "Panic": 5},
    "Institutional Accumulation": {"Strong Trend": 65, "Choppy": 65, "Bear": 55, "Panic": 40},
    "Mean Reversion Bounce":      {"Strong Trend": 50, "Choppy": 78, "Bear": 65, "Panic": 45},
    "Failed Breakdown Reversal":  {"Strong Trend": 40, "Choppy": 55, "Bear": 68, "Panic": 50},
    "No Setup":                   {"Strong Trend": 50, "Choppy": 50, "Bear": 50, "Panic": 50},
}


def _next_monthly_opex(from_date: date) -> date:
    """Returns the next 3rd Friday of a month (standard monthly options expiry)."""
    for delta in range(3):
        month = from_date.month + delta
        year = from_date.year + (month - 1) // 12
        month = (month - 1) % 12 + 1
        first = date(year, month, 1)
        first_friday = first + timedelta(days=(4 - first.weekday()) % 7)
        third_friday = first_friday + timedelta(weeks=2)
        if third_friday >= from_date:
            return third_friday
    return third_friday


def _get_ticker_sector_map(universe: str) -> dict[str, str]:
    """Best-effort {ticker: sector} for any universe."""
    try:
        if universe == "nifty50":
            return india_module.get_nifty50().set_index("ticker")["sector"].to_dict()
        if universe == "euro_top":
            return global_module.get_euro_top().set_index("ticker")["sector"].to_dict()
        if universe == "etfs":
            return global_module.get_popular_etfs().set_index("ticker")["sector"].to_dict()
        return uni_module.get_sp500().set_index("ticker")["sector"].to_dict()
    except Exception:
        return {}


def _build_sector_etf_mapping(tickers: list[str]) -> dict[str, str]:
    """Map each stock ticker to its sector ETF based on S&P 500 sector data."""
    try:
        sp500 = uni_module.get_sp500()
        ticker_sector = sp500.set_index("ticker")["sector"].to_dict()
        return {
            t: _SECTOR_NAME_TO_ETF[ticker_sector[t]]
            for t in tickers
            if t in ticker_sector and ticker_sector.get(t) in _SECTOR_NAME_TO_ETF
        }
    except Exception:
        return {}


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
    if universe == "nifty50":
        return india_module.get_nifty50()["ticker"].tolist()
    if universe == "euro_top":
        return global_module.get_euro_top()["ticker"].tolist()
    if universe == "etfs":
        return global_module.get_popular_etfs()["ticker"].tolist()
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
    benchmark, use_sector_etfs = _universe_benchmark(tickers)
    extra = _SECTOR_ETF_TICKERS if use_sector_etfs else []
    all_tickers = list(dict.fromkeys([benchmark] + extra + tickers))
    ohlcv = await asyncio.get_event_loop().run_in_executor(
        None, cache.get_ohlcv_wide, all_tickers, _START_1Y, _TODAY
    )
    for key in ohlcv:
        if not ohlcv[key].empty:
            ohlcv[key] = ohlcv[key].ffill()
            if benchmark != "SPY" and benchmark in ohlcv[key].columns:
                ohlcv[key] = ohlcv[key].rename(columns={benchmark: "SPY"})
    return ohlcv


# ── /setup-winrates ───────────────────────────────────────────────────────────

_START_5Y = (datetime.today() - timedelta(days=5 * 365)).strftime("%Y-%m-%d")
_winrate_computing = False


def _bg_compute_winrates() -> None:
    global _winrate_computing
    _winrate_computing = True
    try:
        tickers = uni_module.get_sp500()["ticker"].tolist()
        all_tickers = list(dict.fromkeys(["SPY"] + tickers))
        ohlcv = cache.get_ohlcv_wide(all_tickers, _START_5Y, _TODAY)
        prices = ohlcv.get("adj_close", pd.DataFrame()).ffill()
        high   = ohlcv.get("high",      pd.DataFrame()).ffill()
        low    = ohlcv.get("low",       pd.DataFrame()).ffill()
        volume = ohlcv.get("volume",    pd.DataFrame()).ffill()
        if prices.empty:
            logger.warning("Setup backtest: no price data available")
            return
        results = run_setup_backtest(prices, high, low, volume)
        save_winrates_cache(results)
    except Exception as e:
        logger.error(f"Setup backtest failed: {e}")
    finally:
        _winrate_computing = False


@router.get("/setup-winrates")
async def get_setup_winrates(
    background_tasks: BackgroundTasks,
    recompute: bool = Query(False),
):
    """
    Returns historical win rates for each named setup.
    Results are cached for 7 days. Pass ?recompute=true to force a fresh run.
    """
    global _winrate_computing

    if not recompute:
        cached = load_cached_winrates()
        if cached:
            return {"status": "ok", "results": cached}

    if _winrate_computing:
        return {"status": "computing", "results": None}

    background_tasks.add_task(_bg_compute_winrates)
    return {"status": "computing", "results": None}


# ── background earnings fetch ─────────────────────────────────────────────────

def _bg_fetch_earnings(tickers: list[str]) -> None:
    from app.core.data import fetcher
    data = fetcher.fetch_earnings_calendar(tickers)
    cache.store_earnings(data)
    logger.info(f"Earnings calendar fetched for {len(data)} tickers")


# ── /prefetch-events ──────────────────────────────────────────────────────────

@router.post("/prefetch-events")
async def prefetch_events(
    background_tasks: BackgroundTasks,
    universe: str = Query("sp500"),
):
    """Trigger background fetch of earnings dates for a universe."""
    tickers = _resolve_tickers(universe, "", "")
    uncached = cache.get_uncached_earnings_tickers(tickers)
    if not uncached:
        return {"status": "cached", "tickers": 0}
    background_tasks.add_task(_bg_fetch_earnings, uncached)
    return {"status": "fetching", "tickers": len(uncached)}


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

    sector_map = _build_sector_etf_mapping(tickers)
    signals_df = await asyncio.get_event_loop().run_in_executor(
        None, compute_all_signals,
        prices,
        high   if not high.empty   else None,
        low    if not low.empty    else None,
        open_p if not open_p.empty else None,
        volume if not volume.empty else None,
        sector_map or None,
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
            "ticker":            ticker,
            "price":             price,
            "chg_1d":            chg_1d,
            "rsi":               _safe(r.get("rsi")),
            "bb_pct_b":          _safe(r.get("bb_pct_b")),
            "macd_hist":         _safe(r.get("macd_hist")),
            "ma50_dist":         _safe(r.get("ma50_dist")),
            "ma200_dist":        _safe(r.get("ma200_dist")),
            "rs_spy_20d":        _safe(r.get("rs_spy_20d")),
            "rs_spy_5d":         _safe(r.get("rs_spy_5d")),
            "rs_sector_20d":     _safe(r.get("rs_sector_20d")),
            "sector_vs_spy_20d": _safe(r.get("sector_vs_spy_20d")),
            "triple_rs":         bool(r.get("triple_rs", 0) == 1.0),
            "vol_surge":         _safe(r.get("vol_surge")),
            "atr_ratio":         _safe(r.get("atr_ratio")),
            "overnight_gap":     _safe(r.get("overnight_gap")),
            "rev_5d":            _safe(r.get("rev_5d")),
            "momentum_score":    _safe(r.get("momentum_score")),
            "pivot_dist":        _safe(r.get("pivot_dist")),
            "nearest_pivot":     nearest_pivot,
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
    sort_by:      str  = Query("regime_adjusted_score"),
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

    sector_map = _build_sector_etf_mapping(tickers)
    signals_df = await asyncio.get_event_loop().run_in_executor(
        None, compute_all_signals,
        prices,
        high   if not high.empty   else None,
        low    if not low.empty    else None,
        open_p if not open_p.empty else None,
        volume if not volume.empty else None,
        sector_map or None,
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
            "ticker":            ticker,
            "price":             price,
            "chg_1d":            _safe(r.get("chg_1d")),
            "setup":             setup,
            "stage":             _safe(r.get("stage")),
            "breakout_score":    _safe(r.get("breakout_score")),
            "confluence_score":  _safe(r.get("confluence_score")),
            "rsi":               _safe(r.get("rsi")),
            "rs_spy_20d":        _safe(r.get("rs_spy_20d")),
            "rs_sector_20d":     _safe(r.get("rs_sector_20d")),
            "sector_vs_spy_20d": _safe(r.get("sector_vs_spy_20d")),
            "triple_rs":         bool(r.get("triple_rs", 0) == 1.0),
            "vol_surge":         _safe(r.get("vol_surge")),
            "ma50_dist":         _safe(r.get("ma50_dist")),
            "ma200_dist":        _safe(r.get("ma200_dist")),
            "bb_width_pct":      _safe(r.get("bb_width_pct")),
            "atr_pct":           _safe(r.get("atr_pct")),
            "dist_52w_high":     _safe(r.get("dist_52w_high")),
            "accum_score":       _safe(r.get("accum_score")),
            "nearest_pivot":     nearest_pivot,
            "pivot_dist":        _safe(r.get("pivot_dist")),
            "entry":             _safe(entry),
            "stop":              stop_price,
            "target":            target_price,
            "rr":                rr,
            "atr_dollar":        _safe(atr_dollar),
        })

    # ── Regime detection (reuse SPY already in prices) ───────────────────────
    spy_s = prices["SPY"].dropna() if "SPY" in prices.columns else pd.Series(dtype=float)
    spy_vs_50d = spy_vs_200d = None
    if len(spy_s) >= 200:
        spy_vs_50d  = float(spy_s.iloc[-1] / spy_s.rolling(50).mean().iloc[-1] - 1)
        spy_vs_200d = float(spy_s.iloc[-1] / spy_s.rolling(200).mean().iloc[-1] - 1)
    elif len(spy_s) >= 50:
        spy_vs_50d  = float(spy_s.iloc[-1] / spy_s.rolling(50).mean().iloc[-1] - 1)
    regime_name, regime_desc, regime_strategy, regime_score_val = _determine_regime(
        spy_vs_50d, spy_vs_200d, None, None
    )

    # ── Regime-adjusted scoring ───────────────────────────────────────────────
    for r in rows:
        setup     = r.get("setup", "No Setup")
        affinity  = _REGIME_SETUP_AFFINITY.get(setup, {}).get(regime_name, 50)
        cs        = r.get("confluence_score")
        r["regime_alignment"]      = affinity
        r["regime_fit"]            = affinity >= 60
        r["regime_adjusted_score"] = round(cs * 0.70 + affinity * 0.30, 1) if cs is not None else None

    # ── Event enrichment ──────────────────────────────────────────────────────
    today_date   = datetime.today().date()
    next_opex    = _next_monthly_opex(today_date)
    days_to_opex = (next_opex - today_date).days
    all_tickers  = [r["ticker"] for r in rows]
    earnings_map = cache.get_earnings_dates(all_tickers)

    for r in rows:
        ed = earnings_map.get(r["ticker"])
        if ed is not None:
            days = (ed - today_date).days
            r["earnings_date"]    = str(ed)
            r["days_to_earnings"] = days if days >= 0 else None
        else:
            r["earnings_date"]    = None
            r["days_to_earnings"] = None
        r["days_to_opex"] = days_to_opex

    # ── Filters ───────────────────────────────────────────────────────────────
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
        "total":            total,
        "page":             page,
        "page_size":        page_size,
        "pages":            max(1, -(-total // page_size)),
        "universe_size":    len(tickers),
        "as_of":            prices.index[-1].strftime("%Y-%m-%d") if not prices.empty else None,
        "regime":           regime_name,
        "regime_score":     regime_score_val,
        "regime_strategy":  regime_strategy,
        "results":          page_rows,
    }


# ── /prebreakout ─────────────────────────────────────────────────────────────

@router.get("/prebreakout")
async def get_prebreakout(
    universe:  str   = Query("sp500"),
    min_score: float = Query(55, description="Min coiled_spring_score 0-100"),
    sort_by:   str   = Query("coiled_spring_score"),
    desc:      bool  = Query(True),
    page:      int   = Query(1, ge=1),
    page_size: int   = Query(50, ge=1, le=200),
):
    """
    Pre-Breakout screener: stocks in a 'coiled spring' state.
    Filters for Stage 2, above MAs, tight range, drying volume, near 52W high.
    """
    tickers = _resolve_tickers(universe, "", "")
    if not tickers:
        return {"total": 0, "page": page, "pages": 1, "results": [], "universe_size": 0}

    ohlcv  = await _fetch_ohlcv(tickers)
    prices = ohlcv.get("adj_close", pd.DataFrame())
    high   = ohlcv.get("high",      pd.DataFrame())
    low    = ohlcv.get("low",       pd.DataFrame())
    open_p = ohlcv.get("open",      pd.DataFrame())
    volume = ohlcv.get("volume",    pd.DataFrame())

    if prices.empty or len(prices.columns) < 2:
        return {"total": 0, "page": page, "pages": 1, "results": [],
                "universe_size": len(tickers), "message": "No price data cached"}

    sector_map = _build_sector_etf_mapping(tickers)
    signals_df = await asyncio.get_event_loop().run_in_executor(
        None, compute_all_signals,
        prices,
        high   if not high.empty   else None,
        low    if not low.empty    else None,
        open_p if not open_p.empty else None,
        volume if not volume.empty else None,
        sector_map or None,
    )
    signals_df = signals_df.drop(index="SPY", errors="ignore")

    last_prices = prices.iloc[-1].dropna()

    rows = []
    for ticker in signals_df.index:
        if ticker == "SPY":
            continue
        r     = signals_df.loc[ticker]
        price = _safe(last_prices.get(ticker))

        cs_score = r.get("coiled_spring_score")
        stage    = r.get("stage")
        ma50     = r.get("ma50_dist")
        vol_s    = r.get("vol_surge")
        dist52   = r.get("dist_52w_high")

        # Hard filter: Stage 2, above 50-MA, near 52W high, volume not surging
        if cs_score is None or float(cs_score) < min_score:
            continue
        if stage is None or float(stage) != 2.0:
            continue
        if ma50 is None or float(ma50) < 0:
            continue
        if dist52 is None or float(dist52) < -0.20:
            continue
        if vol_s is not None and float(vol_s) > 1.5:
            continue

        rows.append({
            "ticker":             ticker,
            "price":              price,
            "chg_1d":             _safe(r.get("chg_1d")),
            "coiled_spring_score": round(float(cs_score), 1),
            "stage":              _safe(stage),
            "bb_width_pct":       _safe(r.get("bb_width_pct")),
            "atr_pct":            _safe(r.get("atr_pct")),
            "range_compression":  _safe(r.get("range_compression")),
            "vol_surge":          _safe(vol_s),
            "dist_52w_high":      _safe(dist52),
            "rs_spy_20d":         _safe(r.get("rs_spy_20d")),
            "rs_sector_20d":      _safe(r.get("rs_sector_20d")),
            "triple_rs":          bool(r.get("triple_rs", 0) == 1.0),
            "accum_score":        _safe(r.get("accum_score")),
            "ma50_dist":          _safe(ma50),
            "ma200_dist":         _safe(r.get("ma200_dist")),
            "nr7":                bool(r.get("nr7", 0) == 1.0),
            "rsi":                _safe(r.get("rsi")),
            "breakout_score":     _safe(r.get("breakout_score")),
        })

    # Event enrichment
    today_date   = datetime.today().date()
    next_opex    = _next_monthly_opex(today_date)
    days_to_opex = (next_opex - today_date).days
    earnings_map = cache.get_earnings_dates([r["ticker"] for r in rows])

    for r in rows:
        ed = earnings_map.get(r["ticker"])
        if ed is not None:
            days = (ed - today_date).days
            r["earnings_date"]    = str(ed)
            r["days_to_earnings"] = days if days >= 0 else None
        else:
            r["earnings_date"]    = None
            r["days_to_earnings"] = None
        r["days_to_opex"] = days_to_opex

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


# ── /mtf ─────────────────────────────────────────────────────────────────────

@router.get("/mtf")
async def get_mtf_alignment(
    universe:  str  = Query("sp500"),
    min_align: int  = Query(2, ge=0, le=3, description="Min timeframes aligned (0–3)"),
    sort_by:   str  = Query("mtf_score"),
    desc:      bool = Query(True),
    page:      int  = Query(1, ge=1),
    page_size: int  = Query(50, ge=1, le=200),
):
    """
    Multi-Timeframe Alignment screener.
    Surfaces stocks where Weekly, Daily, and Short-term trends agree.
    min_align=3 → all three timeframes bullish (strongest signal).
    """
    tickers = _resolve_tickers(universe, "", "")
    if not tickers:
        return {"total": 0, "page": page, "pages": 1, "results": [], "universe_size": 0}

    ohlcv  = await _fetch_ohlcv(tickers)
    prices = ohlcv.get("adj_close", pd.DataFrame())
    high   = ohlcv.get("high",      pd.DataFrame())
    low    = ohlcv.get("low",       pd.DataFrame())
    open_p = ohlcv.get("open",      pd.DataFrame())
    volume = ohlcv.get("volume",    pd.DataFrame())

    if prices.empty or len(prices.columns) < 2:
        return {"total": 0, "page": page, "pages": 1, "results": [],
                "universe_size": len(tickers), "message": "No price data cached"}

    sector_map = _build_sector_etf_mapping(tickers)
    signals_df = await asyncio.get_event_loop().run_in_executor(
        None, compute_all_signals,
        prices,
        high   if not high.empty   else None,
        low    if not low.empty    else None,
        open_p if not open_p.empty else None,
        volume if not volume.empty else None,
        sector_map or None,
    )
    signals_df = signals_df.drop(index="SPY", errors="ignore")

    last_prices = prices.iloc[-1].dropna()

    rows = []
    for ticker in signals_df.index:
        if ticker == "SPY":
            continue
        r         = signals_df.loc[ticker]
        alignment = r.get("mtf_alignment")
        if alignment is None:
            continue
        if int(alignment) < min_align:
            continue

        rows.append({
            "ticker":          ticker,
            "price":           _safe(last_prices.get(ticker)),
            "chg_1d":          _safe(r.get("chg_1d")),
            "mtf_score":       _safe(r.get("mtf_score")),
            "mtf_alignment":   int(alignment),
            "mtf_weekly_bull": bool(r.get("mtf_weekly_bull", 0)),
            "mtf_daily_bull":  bool(r.get("mtf_daily_bull",  0)),
            "mtf_short_bull":  bool(r.get("mtf_short_bull",  0)),
            "mtf_wk_signals":  int(r.get("mtf_wk_signals", 0)),
            "mtf_d_signals":   int(r.get("mtf_d_signals",  0)),
            "mtf_st_signals":  int(r.get("mtf_st_signals", 0)),
            # supporting context
            "stage":           _safe(r.get("stage")),
            "rs_spy_20d":      _safe(r.get("rs_spy_20d")),
            "rs_sector_20d":   _safe(r.get("rs_sector_20d")),
            "triple_rs":       bool(r.get("triple_rs", 0) == 1.0),
            "rsi":             _safe(r.get("rsi")),
            "vol_surge":       _safe(r.get("vol_surge")),
            "ma50_dist":       _safe(r.get("ma50_dist")),
            "ma200_dist":      _safe(r.get("ma200_dist")),
            "dist_52w_high":   _safe(r.get("dist_52w_high")),
            "confluence_score":_safe(r.get("confluence_score")),
            "setup":           str(r.get("setup", "No Setup")),
        })

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


# ── /rs-rankings ─────────────────────────────────────────────────────────────

@router.get("/rs-rankings")
async def get_rs_rankings(
    universe:    str  = Query("sp500"),
    min_rs_rank: int  = Query(0,   ge=0, le=99),
    sector:      str  = Query("",  description="Filter by sector (exact match)"),
    sort_by:     str  = Query("rs_composite"),
    desc:        bool = Query(True),
    page:        int  = Query(1,   ge=1),
    page_size:   int  = Query(100, ge=1, le=500),
):
    """
    IBD-style Relative Strength rankings.
    RS composite = 40%×252D + 20%×126D + 20%×63D + 20%×20D, scaled 0–99.
    rs_trend > 0 means short-term RS is improving versus the 3-month baseline.
    """
    tickers = _resolve_tickers(universe, "", "")
    if not tickers:
        return {"total": 0, "page": page, "pages": 1, "results": [], "universe_size": 0}

    ohlcv  = await _fetch_ohlcv(tickers)
    prices = ohlcv.get("adj_close", pd.DataFrame())

    if prices.empty or "SPY" not in prices.columns:
        return {"total": 0, "page": page, "pages": 1, "results": [],
                "universe_size": len(tickers), "message": "No price data cached"}

    spy       = prices["SPY"].dropna()
    skip_cols = set(_SECTOR_ETF_TICKERS) | {"SPY"}
    stocks    = prices[[c for c in prices.columns if c not in skip_cols]].copy()
    n         = len(stocks)

    def _excess(days: int) -> pd.Series:
        if n < days + 1:
            return pd.Series(dtype=float)
        bm = float(spy.iloc[-1] / spy.iloc[-(days + 1)] - 1) if len(spy) >= days + 1 else 0.0
        return (stocks.iloc[-1] / stocks.iloc[-(days + 1)] - 1 - bm).rename(f"rs_{days}d")

    rs_5d   = _excess(5)
    rs_20d  = _excess(20)
    rs_63d  = _excess(63)
    rs_126d = _excess(126)
    rs_252d = _excess(252)

    def _rank(s: pd.Series) -> pd.Series:
        return (s.rank(pct=True) * 99).round(1) if not s.empty else s

    rk20  = _rank(rs_20d)
    rk63  = _rank(rs_63d)
    rk126 = _rank(rs_126d)
    rk252 = _rank(rs_252d)

    # Composite with IBD-style weighting
    parts, wts = [], []
    for rk, w in [(rk252, 0.40), (rk126, 0.20), (rk63, 0.20), (rk20, 0.20)]:
        if not rk.empty:
            parts.append(rk * w); wts.append(w)
    rs_composite = sum(parts) / sum(wts) if parts else pd.Series(dtype=float)

    # Trend: (rank_20D − rank_63D) / 99 → −1 … +1
    rs_trend = ((rk20 - rk63) / 99.0).round(4) if not rk20.empty and not rk63.empty else pd.Series(dtype=float)

    last_prices = prices.iloc[-1].dropna()
    prev_prices = prices.dropna(how="all").iloc[-2] if len(prices.dropna(how="all")) >= 2 else pd.Series(dtype=float)
    sector_info = _get_ticker_sector_map(universe)

    rows = []
    for ticker in stocks.columns:
        comp = rs_composite.get(ticker, np.nan) if not rs_composite.empty else np.nan
        if np.isnan(float(comp)):
            continue
        price  = _safe(last_prices.get(ticker))
        prev   = prev_prices.get(ticker)
        chg_1d = _safe((last_prices.get(ticker, np.nan) / prev - 1) if prev and prev > 0 else None)
        trend  = rs_trend.get(ticker, np.nan) if not rs_trend.empty else np.nan
        rows.append({
            "ticker":       ticker,
            "price":        price,
            "chg_1d":       chg_1d,
            "sector":       sector_info.get(ticker, ""),
            "rs_5d":        _safe(rs_5d.get(ticker))   if not rs_5d.empty   else None,
            "rs_20d":       _safe(rs_20d.get(ticker))  if not rs_20d.empty  else None,
            "rs_63d":       _safe(rs_63d.get(ticker))  if not rs_63d.empty  else None,
            "rs_126d":      _safe(rs_126d.get(ticker)) if not rs_126d.empty else None,
            "rs_252d":      _safe(rs_252d.get(ticker)) if not rs_252d.empty else None,
            "rs_composite": round(float(comp), 1),
            "rs_rank":      int(round(float(comp))),
            "rs_trend":     None if np.isnan(float(trend)) else round(float(trend), 4),
        })

    if min_rs_rank > 0:
        rows = [r for r in rows if r["rs_rank"] >= min_rs_rank]
    if sector:
        rows = [r for r in rows if r["sector"] == sector]

    def sort_key(r):
        v = r.get(sort_by)
        return v if v is not None else (-9999 if desc else 9999)
    rows.sort(key=sort_key, reverse=desc)

    total  = len(rows)
    offset = (page - 1) * page_size

    return {
        "total":         total,
        "page":          page,
        "page_size":     page_size,
        "pages":         max(1, -(-total // page_size)),
        "universe_size": len(tickers),
        "leaders":       sum(1 for r in rows if r["rs_rank"] >= 80),
        "laggards":      sum(1 for r in rows if r["rs_rank"] <= 20),
        "rising":        sum(1 for r in rows if (r["rs_trend"] or 0) > 0.10),
        "falling":       sum(1 for r in rows if (r["rs_trend"] or 0) < -0.10),
        "as_of":         prices.index[-1].strftime("%Y-%m-%d") if not prices.empty else None,
        "results":       rows[offset: offset + page_size],
    }


# ── /earnings-calendar ───────────────────────────────────────────────────────

@router.get("/earnings-calendar")
async def get_earnings_calendar(
    background_tasks: BackgroundTasks,
    universe:     str   = Query("sp500"),
    days_ahead:   int   = Query(21, ge=1, le=60),
    only_setups:  bool  = Query(False),
    min_score:    float = Query(0),
):
    """
    Upcoming earnings grouped by date, each stock enriched with its current setup context.
    Auto-triggers a background prefetch for any uncached tickers.
    """
    tickers = _resolve_tickers(universe, "", "")
    if not tickers:
        return {"days": [], "total_stocks": 0, "total_with_setups": 0,
                "prefetch_triggered": False, "as_of": _TODAY}

    # Kick off earnings prefetch for any uncached tickers (non-blocking)
    uncached = cache.get_uncached_earnings_tickers(tickers)
    if uncached:
        background_tasks.add_task(_bg_fetch_earnings, uncached)

    earnings_map = cache.get_earnings_dates(tickers)
    today_date   = datetime.today().date()
    cutoff_date  = today_date + timedelta(days=days_ahead)

    upcoming = {
        t: d for t, d in earnings_map.items()
        if d is not None and today_date <= d <= cutoff_date
    }

    if not upcoming:
        return {
            "days": [],
            "total_stocks": 0,
            "total_with_setups": 0,
            "prefetch_triggered": bool(uncached),
            "as_of": _TODAY,
        }

    # Compute signals for the upcoming-earnings subset only
    upcoming_tickers = list(upcoming.keys())
    ohlcv  = await _fetch_ohlcv(upcoming_tickers)
    prices = ohlcv.get("adj_close", pd.DataFrame())
    high   = ohlcv.get("high",      pd.DataFrame())
    low    = ohlcv.get("low",       pd.DataFrame())
    open_p = ohlcv.get("open",      pd.DataFrame())
    volume = ohlcv.get("volume",    pd.DataFrame())

    signals_df = pd.DataFrame()
    regime_name = "Choppy"
    last_prices = pd.Series(dtype=float)
    prev_prices = pd.Series(dtype=float)

    if not prices.empty and len(prices.columns) >= 2:
        sector_map = _build_sector_etf_mapping(upcoming_tickers)
        signals_df = await asyncio.get_event_loop().run_in_executor(
            None, compute_all_signals,
            prices,
            high   if not high.empty   else None,
            low    if not low.empty    else None,
            open_p if not open_p.empty else None,
            volume if not volume.empty else None,
            sector_map or None,
        )
        signals_df = signals_df.drop(index="SPY", errors="ignore")
        last_prices = prices.iloc[-1].dropna()
        prev_prices = prices.dropna(how="all").iloc[-2] if len(prices.dropna(how="all")) >= 2 else pd.Series(dtype=float)

        spy_s = prices["SPY"].dropna() if "SPY" in prices.columns else pd.Series(dtype=float)
        spy_vs_50d = spy_vs_200d = None
        if len(spy_s) >= 200:
            spy_vs_50d  = float(spy_s.iloc[-1] / spy_s.rolling(50).mean().iloc[-1] - 1)
            spy_vs_200d = float(spy_s.iloc[-1] / spy_s.rolling(200).mean().iloc[-1] - 1)
        elif len(spy_s) >= 50:
            spy_vs_50d = float(spy_s.iloc[-1] / spy_s.rolling(50).mean().iloc[-1] - 1)
        regime_name, _, _, _ = _determine_regime(spy_vs_50d, spy_vs_200d, None, None)

    days_grouped: dict[str, list] = {}
    total_with_setups = 0

    for ticker, earn_date in upcoming.items():
        d_str  = str(earn_date)
        price  = _safe(last_prices.get(ticker))
        prev   = prev_prices.get(ticker)
        chg_1d = _safe((last_prices.get(ticker, np.nan) / prev - 1) if prev and prev > 0 else None)

        if not signals_df.empty and ticker in signals_df.index:
            r     = signals_df.loc[ticker]
            setup = str(r.get("setup", "No Setup"))
            cs    = r.get("confluence_score")
            affinity   = _REGIME_SETUP_AFFINITY.get(setup, {}).get(regime_name, 50)
            regime_adj = round(float(cs) * 0.70 + affinity * 0.30, 1) if cs is not None else None
            row = {
                "ticker":                ticker,
                "price":                 price,
                "chg_1d":                chg_1d,
                "setup":                 setup,
                "stage":                 _safe(r.get("stage")),
                "confluence_score":      _safe(cs),
                "regime_adjusted_score": regime_adj,
                "coiled_spring_score":   _safe(r.get("coiled_spring_score")),
                "rs_spy_20d":            _safe(r.get("rs_spy_20d")),
                "rs_sector_20d":         _safe(r.get("rs_sector_20d")),
                "triple_rs":             bool(r.get("triple_rs", 0) == 1.0),
                "rsi":                   _safe(r.get("rsi")),
                "vol_surge":             _safe(r.get("vol_surge")),
                "dist_52w_high":         _safe(r.get("dist_52w_high")),
                "ma50_dist":             _safe(r.get("ma50_dist")),
                "accum_score":           _safe(r.get("accum_score")),
                "days_to_earnings":      (earn_date - today_date).days,
            }
        else:
            row = {
                "ticker": ticker, "price": price, "chg_1d": chg_1d,
                "setup": "No Setup", "stage": None,
                "confluence_score": None, "regime_adjusted_score": None,
                "coiled_spring_score": None, "rs_spy_20d": None, "rs_sector_20d": None,
                "triple_rs": False, "rsi": None, "vol_surge": None,
                "dist_52w_high": None, "ma50_dist": None, "accum_score": None,
                "days_to_earnings": (earn_date - today_date).days,
            }

        if row["setup"] != "No Setup":
            total_with_setups += 1

        days_grouped.setdefault(d_str, []).append(row)

    # Filters
    if only_setups:
        days_grouped = {
            d: [r for r in rows if r["setup"] != "No Setup"]
            for d, rows in days_grouped.items()
        }
        days_grouped = {d: rows for d, rows in days_grouped.items() if rows}

    if min_score > 0:
        days_grouped = {
            d: [r for r in rows if (r.get("confluence_score") or 0) >= min_score]
            for d, rows in days_grouped.items()
        }
        days_grouped = {d: rows for d, rows in days_grouped.items() if rows}

    # Sort within each day by regime_adjusted_score desc
    for rows in days_grouped.values():
        rows.sort(key=lambda r: r.get("regime_adjusted_score") or -9999, reverse=True)

    return {
        "days": [
            {
                "date":           d,
                "days_from_today": (date.fromisoformat(d) - today_date).days,
                "stocks":         stocks,
            }
            for d, stocks in sorted(days_grouped.items())
        ],
        "total_stocks":       len(upcoming),
        "total_with_setups":  total_with_setups,
        "prefetch_triggered": bool(uncached),
        "as_of":              _TODAY,
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
