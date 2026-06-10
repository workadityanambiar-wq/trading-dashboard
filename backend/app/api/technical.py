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

from app.core.data import cache, fetcher
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

# ── Macro dashboard constants ─────────────────────────────────────────────────
_MACRO_ASSETS: list[dict] = [
    # Equities
    {"ticker": "SPY",     "label": "S&P 500",      "category": "Equity"},
    {"ticker": "QQQ",     "label": "Nasdaq 100",    "category": "Equity"},
    {"ticker": "IWM",     "label": "Russell 2000",  "category": "Equity"},
    {"ticker": "EFA",     "label": "Dev. Markets",  "category": "Equity"},
    {"ticker": "EEM",     "label": "Emerging Mkt",  "category": "Equity"},
    # Bonds
    {"ticker": "TLT",     "label": "20Y+ Treasury", "category": "Bonds"},
    {"ticker": "IEF",     "label": "7-10Y Treasury","category": "Bonds"},
    {"ticker": "SHY",     "label": "1-3Y Treasury", "category": "Bonds"},
    {"ticker": "HYG",     "label": "High Yield",    "category": "Credit"},
    {"ticker": "LQD",     "label": "Invest. Grade", "category": "Credit"},
    # Real Assets
    {"ticker": "GLD",     "label": "Gold",          "category": "Commodities"},
    {"ticker": "SLV",     "label": "Silver",        "category": "Commodities"},
    {"ticker": "USO",     "label": "Oil",           "category": "Commodities"},
    {"ticker": "DBA",     "label": "Agriculture",   "category": "Commodities"},
    # Dollar & Crypto
    {"ticker": "UUP",     "label": "US Dollar",     "category": "FX"},
    {"ticker": "BTC-USD", "label": "Bitcoin",       "category": "Crypto"},
]
_MACRO_TICKERS   = [a["ticker"] for a in _MACRO_ASSETS]
_YIELD_TICKERS   = ["^IRX", "^FVX", "^TNX", "^TYX"]  # 3M, 5Y, 10Y, 30Y
_YIELD_MATURITIES = {"^IRX": 0.25, "^FVX": 5.0, "^TNX": 10.0, "^TYX": 30.0}
_YIELD_LABELS     = {"^IRX": "3M", "^FVX": "5Y", "^TNX": "10Y", "^TYX": "30Y"}

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
    universe:         str   = Query("sp500"),
    setup_filter:     str   = Query("", description="Filter by exact setup name"),
    stage_filter:     str   = Query("", description="Comma-separated stages, e.g. '2' or '1,2'"),
    min_score:        float = Query(0,  description="Min confluence score 0-100"),
    sort_by:          str   = Query("regime_adjusted_score"),
    desc:             bool  = Query(True),
    page:             int   = Query(1, ge=1),
    page_size:        int   = Query(50, ge=1, le=200),
    include_no_setup: bool  = Query(False, description="Include tickers with no active setup (for watchlist)"),
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
    elif not include_no_setup:
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
    universe_set = set(tickers)
    stock_cols   = [c for c in prices.columns if c in universe_set]
    stocks       = prices[stock_cols].copy()
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


# ── /breadth ─────────────────────────────────────────────────────────────────

@router.get("/breadth")
async def get_market_breadth(
    universe:      str = Query("sp500"),
    lookback_days: int = Query(126, ge=21, le=504),
):
    """
    Market breadth: % of stocks above their 20/50/200-day MAs, new highs/lows,
    advancing stocks, sector-level breakdown, and full daily history.
    """
    tickers = _resolve_tickers(universe, "", "")
    if not tickers:
        return {"universe": universe, "n_stocks": 0, "as_of": None,
                "snapshot": {}, "history": [], "sector_breadth": []}

    ohlcv  = await _fetch_ohlcv(tickers)
    prices = ohlcv.get("adj_close", pd.DataFrame())

    if prices.empty:
        return {"universe": universe, "n_stocks": len(tickers), "as_of": None,
                "snapshot": {}, "history": [], "sector_breadth": []}

    universe_set = set(tickers)
    stock_cols   = [c for c in prices.columns if c in universe_set]
    stocks       = prices[stock_cols].ffill()
    n            = len(stock_cols)

    if n == 0 or len(stocks) < 21:
        return {"universe": universe, "n_stocks": n, "as_of": None,
                "snapshot": {}, "history": [], "sector_breadth": []}

    # ── Rolling MA matrices ───────────────────────────────────────────────────
    ma20_mat  = stocks.rolling(20, min_periods=15).mean()
    ma50_mat  = stocks.rolling(50, min_periods=40).mean()
    ma200_mat = stocks.rolling(200, min_periods=150).mean()

    # ── Current snapshot ─────────────────────────────────────────────────────
    cur    = stocks.iloc[-1]
    ma20   = ma20_mat.iloc[-1]
    ma50   = ma50_mat.iloc[-1]
    ma200  = ma200_mat.iloc[-1]

    valid20  = cur.notna() & ma20.notna()
    valid50  = cur.notna() & ma50.notna()
    valid200 = cur.notna() & ma200.notna()

    pct_above_20ma  = float((cur[valid20]  > ma20[valid20]).mean())  if valid20.any()  else 0.0
    pct_above_50ma  = float((cur[valid50]  > ma50[valid50]).mean())  if valid50.any()  else 0.0
    pct_above_200ma = float((cur[valid200] > ma200[valid200]).mean()) if valid200.any() else 0.0

    # 52-week high / low proximity (within 2%)
    if len(stocks) >= 252:
        high252 = stocks.rolling(252).max().iloc[-1]
        low252  = stocks.rolling(252).min().iloc[-1]
    else:
        high252 = stocks.max()
        low252  = stocks.min()

    valid_hl = cur.notna() & high252.notna() & low252.notna()
    pct_52w_high = float((cur[valid_hl] >= high252[valid_hl] * 0.98).mean()) if valid_hl.any() else 0.0
    pct_52w_low  = float((cur[valid_hl] <= low252[valid_hl]  * 1.02).mean()) if valid_hl.any() else 0.0
    net_new_highs = round((pct_52w_high - pct_52w_low) * n)

    # Advancing vs declining over 20 days
    if len(stocks) >= 21:
        prev20       = stocks.iloc[-21]
        valid_adv    = cur.notna() & prev20.notna()
        advancing_4w = float((cur[valid_adv] > prev20[valid_adv]).mean()) if valid_adv.any() else 0.5
    else:
        advancing_4w = 0.5

    # ── Historical time series (every 5 trading days) ─────────────────────────
    start_idx = max(0, len(stocks) - lookback_days)
    history   = []
    indices   = range(start_idx, len(stocks), 5)
    # Always include the last bar
    idx_set   = set(indices) | {len(stocks) - 1}

    for i in sorted(idx_set):
        row_date = stocks.index[i]
        r        = stocks.iloc[i]
        m20      = ma20_mat.iloc[i]
        m50      = ma50_mat.iloc[i]
        m200     = ma200_mat.iloc[i]

        v20  = r.notna() & m20.notna()
        v50  = r.notna() & m50.notna()
        v200 = r.notna() & m200.notna()

        p20  = round(float((r[v20]  > m20[v20]).mean()),  4) if v20.any()  else None
        p50  = round(float((r[v50]  > m50[v50]).mean()),  4) if v50.any()  else None
        p200 = round(float((r[v200] > m200[v200]).mean()), 4) if v200.any() else None

        history.append({
            "date":            row_date.strftime("%Y-%m-%d"),
            "pct_above_20ma":  p20,
            "pct_above_50ma":  p50,
            "pct_above_200ma": p200,
        })

    # ── Sector breadth ────────────────────────────────────────────────────────
    sector_info   = _get_ticker_sector_map(universe)
    sector_groups: dict[str, list[str]] = {}
    for t in stock_cols:
        sec = sector_info.get(t, "")
        if sec:
            sector_groups.setdefault(sec, []).append(t)

    sector_breadth = []
    for sec, members in sorted(sector_groups.items()):
        m_cur  = cur[members].dropna()
        m_ma50 = ma50[members].dropna()
        m_200  = ma200[members].dropna()
        common50  = m_cur.index.intersection(m_ma50.index)
        common200 = m_cur.index.intersection(m_200.index)
        a50  = float((m_cur[common50]  > m_ma50[common50]).mean())  if len(common50)  else 0.0
        a200 = float((m_cur[common200] > m_200[common200]).mean())  if len(common200) else 0.0
        sector_breadth.append({
            "sector":      sec,
            "above_50ma":  round(a50, 4),
            "above_200ma": round(a200, 4),
            "count":       len(members),
        })

    as_of = stocks.index[-1].strftime("%Y-%m-%d") if not stocks.empty else None

    return {
        "universe":  universe,
        "n_stocks":  n,
        "as_of":     as_of,
        "snapshot": {
            "pct_above_20ma":  round(pct_above_20ma, 4),
            "pct_above_50ma":  round(pct_above_50ma, 4),
            "pct_above_200ma": round(pct_above_200ma, 4),
            "pct_52w_high":    round(pct_52w_high, 4),
            "pct_52w_low":     round(pct_52w_low, 4),
            "net_new_highs":   net_new_highs,
            "advancing_4w":    round(advancing_4w, 4),
        },
        "history":        history,
        "sector_breadth": sector_breadth,
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


# ── /macro ───────────────────────────────────────────────────────────────────

@router.get("/macro")
async def get_macro_dashboard():
    """
    Cross-asset returns (equity/bonds/commodities/FX/crypto) at multiple periods,
    Treasury yield curve, risk mode, and 1Y history of 10Y yield + SPY/TLT spread.
    """
    all_tickers = list(dict.fromkeys(_MACRO_TICKERS + _YIELD_TICKERS))
    start_2y    = (datetime.today() - timedelta(days=730)).strftime("%Y-%m-%d")

    await asyncio.get_event_loop().run_in_executor(
        None, fetcher.ensure_prices, all_tickers, start_2y, _TODAY
    )
    raw    = await asyncio.get_event_loop().run_in_executor(
        None, cache.get_ohlcv_wide, all_tickers, start_2y, _TODAY
    )
    prices = raw.get("adj_close", pd.DataFrame()).ffill()

    def _ret(ticker: str, days: int) -> Optional[float]:
        if ticker not in prices.columns:
            return None
        s = prices[ticker].dropna()
        if len(s) < days + 1:
            return None
        return round(float(s.iloc[-1] / s.iloc[-(days + 1)] - 1), 4)

    def _ytd(ticker: str) -> Optional[float]:
        if ticker not in prices.columns:
            return None
        s = prices[ticker].dropna()
        if s.empty:
            return None
        yr_start = str(s.index[-1].year) + "-01-01"
        ytd_s = s[s.index >= yr_start]
        if len(ytd_s) < 2:
            return None
        return round(float(ytd_s.iloc[-1] / ytd_s.iloc[0] - 1), 4)

    # ── Cross-asset returns ───────────────────────────────────────────────────
    assets_out = []
    for a in _MACRO_ASSETS:
        t = a["ticker"]
        assets_out.append({
            "ticker":   t,
            "label":    a["label"],
            "category": a["category"],
            "ret_1d":   _ret(t, 1),
            "ret_1w":   _ret(t, 5),
            "ret_1m":   _ret(t, 21),
            "ret_3m":   _ret(t, 63),
            "ret_ytd":  _ytd(t),
        })

    # ── Treasury yields (raw level from yfinance — values are already in %) ──
    yield_curve = []
    for yticker, mat in sorted(_YIELD_MATURITIES.items(), key=lambda x: x[1]):
        if yticker not in prices.columns:
            continue
        s = prices[yticker].dropna()
        if s.empty:
            continue
        level    = round(float(s.iloc[-1]), 3)
        prev_1m  = round(float(s.iloc[-22]), 3) if len(s) >= 22 else None
        prev_1y  = round(float(s.iloc[-253]), 3) if len(s) >= 253 else None
        yield_curve.append({
            "ticker":   yticker,
            "label":    _YIELD_LABELS[yticker],
            "maturity": mat,
            "level":    level,
            "prev_1m":  prev_1m,
            "prev_1y":  prev_1y,
        })

    # 3M-10Y spread (inversion indicator): negative = inverted
    spread_3m_10y = None
    irx = prices["^IRX"].dropna() if "^IRX" in prices.columns else pd.Series(dtype=float)
    tnx = prices["^TNX"].dropna() if "^TNX" in prices.columns else pd.Series(dtype=float)
    if not irx.empty and not tnx.empty:
        spread_3m_10y = round(float(tnx.iloc[-1]) - float(irx.iloc[-1]), 3)

    # ── Risk mode ─────────────────────────────────────────────────────────────
    spy_20d  = _ret("SPY", 20)
    tlt_20d  = _ret("TLT", 20)
    hyg_20d  = _ret("HYG", 20)
    risk_mode = "Neutral"
    if spy_20d is not None and tlt_20d is not None:
        if spy_20d > 0.03 and spy_20d > tlt_20d and (hyg_20d or 0) > -0.01:
            risk_mode = "Risk-On"
        elif spy_20d < -0.03 or (tlt_20d is not None and tlt_20d > spy_20d + 0.03):
            risk_mode = "Risk-Off"

    # ── 10Y yield history + SPY vs TLT relative (last 252 days) ──────────────
    history = []
    if not tnx.empty and "SPY" in prices.columns and "TLT" in prices.columns:
        spy_s = prices["SPY"].dropna()
        tlt_s = prices["TLT"].dropna()
        common_idx = tnx.index.intersection(spy_s.index).intersection(tlt_s.index)
        common_idx = common_idx[-252:]  # last year

        for d in common_idx:
            y10 = float(tnx.loc[d])
            if pd.isna(y10):
                continue
            spy_val = float(spy_s.loc[d])
            tlt_val = float(tlt_s.loc[d])
            # Normalise to 100 at start
            history.append({
                "date":  d.strftime("%Y-%m-%d"),
                "y10":   round(y10, 3),
                "spy":   round(spy_val, 4),
                "tlt":   round(tlt_val, 4),
            })

        # Normalise SPY and TLT to 100
        if history:
            spy0 = history[0]["spy"]
            tlt0 = history[0]["tlt"]
            for h in history:
                h["spy_idx"] = round(h["spy"] / spy0 * 100, 2)
                h["tlt_idx"] = round(h["tlt"] / tlt0 * 100, 2)
                del h["spy"], h["tlt"]

    as_of = prices.index[-1].strftime("%Y-%m-%d") if not prices.empty else None

    return {
        "as_of":         as_of,
        "risk_mode":     risk_mode,
        "assets":        assets_out,
        "yield_curve":   yield_curve,
        "spread_3m_10y": spread_3m_10y,
        "history":       history,
    }


# ── /volatility ──────────────────────────────────────────────────────────────

_VOL_TICKERS = ["^VIX", "^VIX3M", "^VVIX", "^SKEW", "SPY"]

def _vol_regime(vix: float) -> tuple[str, str]:
    """(label, color_key) for a VIX level."""
    if vix < 12:  return "Very Low",  "green"
    if vix < 18:  return "Low",       "green"
    if vix < 25:  return "Normal",    "yellow"
    if vix < 35:  return "Elevated",  "orange"
    if vix < 50:  return "High",      "red"
    return               "Crisis",    "red"


@router.get("/volatility")
async def get_volatility_dashboard(
    lookback_days: int = Query(252, ge=63, le=1260),
):
    """
    VIX level, term structure (VIX1M/VIX3M), percentile, VVIX, SKEW,
    vol regime label, and full daily history for chart rendering.
    """
    start = (datetime.today() - timedelta(days=lookback_days + 60)).strftime("%Y-%m-%d")

    # Ensure data is cached
    await asyncio.get_event_loop().run_in_executor(
        None, fetcher.ensure_prices, _VOL_TICKERS, start, _TODAY
    )

    raw    = await asyncio.get_event_loop().run_in_executor(
        None, cache.get_ohlcv_wide, _VOL_TICKERS, start, _TODAY
    )
    prices = raw.get("adj_close", pd.DataFrame()).ffill()

    if prices.empty or "^VIX" not in prices.columns:
        return {"error": "VIX data not available — backend may need to prefetch"}

    vix_s = prices["^VIX"].dropna()
    if vix_s.empty:
        return {"error": "VIX series empty"}

    # ── Current snapshot ──────────────────────────────────────────────────────
    current_vix   = float(vix_s.iloc[-1])
    vix_ma20      = float(vix_s.rolling(20).mean().iloc[-1]) if len(vix_s) >= 20 else None
    vix_ma50      = float(vix_s.rolling(50).mean().iloc[-1]) if len(vix_s) >= 50 else None
    regime_label, regime_color = _vol_regime(current_vix)

    # VIX percentile vs trailing 252 days
    vix_1y      = vix_s.tail(252)
    vix_pct_1y  = round(float((vix_1y < current_vix).mean()) * 100, 1)
    vix_1y_low  = round(float(vix_1y.min()), 2)
    vix_1y_high = round(float(vix_1y.max()), 2)

    # VIX3M and term structure (contango / backwardation)
    vix3m_s          = prices["^VIX3M"].dropna() if "^VIX3M" in prices.columns else pd.Series(dtype=float)
    current_vix3m    = float(vix3m_s.iloc[-1]) if not vix3m_s.empty else None
    # Negative = contango (normal: near-term < long-term), Positive = backwardation (panic)
    term_structure   = round(current_vix / current_vix3m - 1, 4) if current_vix3m else None

    # VVIX and SKEW
    vvix_s       = prices["^VVIX"].dropna() if "^VVIX" in prices.columns else pd.Series(dtype=float)
    skew_s       = prices["^SKEW"].dropna() if "^SKEW" in prices.columns else pd.Series(dtype=float)
    current_vvix = round(float(vvix_s.iloc[-1]), 2) if not vvix_s.empty else None
    current_skew = round(float(skew_s.iloc[-1]), 2) if not skew_s.empty else None

    # VVIX percentile
    vvix_pct_1y = None
    if not vvix_s.empty:
        v_1y = vvix_s.tail(252)
        vvix_pct_1y = round(float((v_1y < float(vvix_s.iloc[-1])).mean()) * 100, 1)

    # SPY context
    spy_s     = prices["SPY"].dropna() if "SPY" in prices.columns else pd.Series(dtype=float)
    spy_1m    = round(float(spy_s.iloc[-1] / spy_s.iloc[-22] - 1), 4) if len(spy_s) >= 22 else None
    spy_3m    = round(float(spy_s.iloc[-1] / spy_s.iloc[-64] - 1), 4) if len(spy_s) >= 64 else None
    spy_ytd   = None
    if not spy_s.empty:
        this_year = str(spy_s.index[-1].year) + "-01-01"
        ytd_prices = spy_s[spy_s.index >= this_year]
        spy_ytd = round(float(ytd_prices.iloc[-1] / ytd_prices.iloc[0] - 1), 4) if len(ytd_prices) >= 2 else None

    # ── History series ────────────────────────────────────────────────────────
    ma20_full  = vix_s.rolling(20).mean()
    ma50_full  = vix_s.rolling(50).mean()
    start_idx  = max(0, len(vix_s) - lookback_days)
    history    = []

    for i in range(start_idx, len(vix_s)):
        d   = vix_s.index[i]
        v   = round(float(vix_s.iloc[i]), 2)
        m20 = round(float(ma20_full.iloc[i]), 2) if not pd.isna(ma20_full.iloc[i]) else None
        m50 = round(float(ma50_full.iloc[i]), 2) if not pd.isna(ma50_full.iloc[i]) else None

        v3m = None
        if not vix3m_s.empty and d in vix3m_s.index and not pd.isna(vix3m_s.loc[d]):
            v3m = round(float(vix3m_s.loc[d]), 2)

        history.append({
            "date":    d.strftime("%Y-%m-%d"),
            "vix":     v,
            "vix_ma20":m20,
            "vix_ma50":m50,
            "vix3m":   v3m,
        })

    return {
        "as_of":          vix_s.index[-1].strftime("%Y-%m-%d"),
        "vix":            round(current_vix, 2),
        "vix_ma20":       round(vix_ma20, 2)  if vix_ma20  else None,
        "vix_ma50":       round(vix_ma50, 2)  if vix_ma50  else None,
        "regime":         regime_label,
        "regime_color":   regime_color,
        "vix_pct_1y":     vix_pct_1y,
        "vix_1y_low":     vix_1y_low,
        "vix_1y_high":    vix_1y_high,
        "vix3m":          round(current_vix3m, 2) if current_vix3m else None,
        "term_structure": term_structure,
        "vvix":           current_vvix,
        "vvix_pct_1y":    vvix_pct_1y,
        "skew":           current_skew,
        "spy_1m":         spy_1m,
        "spy_3m":         spy_3m,
        "spy_ytd":        spy_ytd,
        "history":        history,
    }


# ── /correlations ────────────────────────────────────────────────────────────

@router.get("/correlations")
async def get_correlations(
    universe:    str = Query("sectors"),
    period_days: int = Query(63,  ge=10, le=504),
    top_n:       int = Query(30,  ge=5,  le=60),
):
    """
    Hierarchically-clustered correlation matrix for the selected universe.
    universe: 'sectors' | 'sp500' | 'nifty50' | 'euro_top' | 'etfs' | comma-sep tickers
    """
    from scipy.cluster.hierarchy import linkage, leaves_list
    from scipy.spatial.distance import squareform

    _SECTOR_EXTRAS = ["SPY", "QQQ", "IWM", "GLD", "TLT"]
    if universe == "sectors":
        tickers = list(uni_module.SECTOR_ETFS.keys()) + _SECTOR_EXTRAS
    else:
        tickers = _resolve_tickers(universe, "", "")

    if not tickers:
        return {"universe": universe, "period_days": period_days, "n_stocks": 0,
                "as_of": None, "tickers": [], "matrix": [],
                "avg_correlation": 0, "most_correlated": [], "least_correlated": []}

    # Fetch more history than period_days to handle gaps/weekends
    lookback = period_days + 90
    start    = (datetime.today() - timedelta(days=lookback)).strftime("%Y-%m-%d")
    raw      = await asyncio.get_event_loop().run_in_executor(
        None, cache.get_ohlcv_wide, tickers, start, _TODAY
    )
    prices = raw.get("adj_close", pd.DataFrame()).ffill()

    avail = [t for t in tickers if t in prices.columns and prices[t].notna().sum() >= period_days // 2]
    if len(avail) < 2:
        return {"universe": universe, "period_days": period_days, "n_stocks": 0,
                "as_of": None, "tickers": [], "matrix": [],
                "avg_correlation": 0, "most_correlated": [], "least_correlated": [],
                "message": "Insufficient cached price data"}

    prices = prices[avail]

    # For large universes trim to top_n (mix of leaders + laggards by 3M return)
    if len(avail) > top_n and universe != "sectors":
        ret3m = prices.iloc[-1] / prices.iloc[max(0, len(prices) - 63)] - 1
        half    = top_n // 2
        leaders  = ret3m.nlargest(half).index.tolist()
        laggards = ret3m.nsmallest(top_n - half).index.tolist()
        avail    = list(dict.fromkeys(leaders + laggards))
        prices   = prices[avail]

    # Compute correlation on last period_days trading days of returns
    returns = prices.pct_change().dropna().tail(period_days)
    corr    = returns.corr().fillna(0)

    # Hierarchical clustering — reorder so correlated tickers are adjacent
    dist_mat = (1 - corr).clip(lower=0)
    dist_mat = (dist_mat + dist_mat.T) / 2
    np.fill_diagonal(dist_mat.values, 0)
    try:
        condensed = squareform(dist_mat.values, checks=False)
        condensed = np.clip(condensed, 0, None)
        Z     = linkage(condensed, method="ward")
        order = leaves_list(Z)
    except Exception:
        order = list(range(len(avail)))

    ordered_tickers = [avail[i] for i in order]
    ordered_corr    = corr.loc[ordered_tickers, ordered_tickers]

    # Pair analysis (upper triangle only)
    pairs = []
    n = len(ordered_tickers)
    for i in range(n):
        for j in range(i + 1, n):
            pairs.append((ordered_tickers[i], ordered_tickers[j],
                          float(ordered_corr.iloc[i, j])))

    pairs.sort(key=lambda x: x[2], reverse=True)
    most_correlated  = [{"t1": p[0], "t2": p[1], "corr": round(p[2], 3)} for p in pairs[:10]]
    least_correlated = [{"t1": p[0], "t2": p[1], "corr": round(p[2], 3)} for p in reversed(pairs[-10:])]
    avg_corr = round(float(np.nanmean([p[2] for p in pairs])), 3) if pairs else 0.0

    return {
        "universe":        universe,
        "period_days":     period_days,
        "n_stocks":        len(ordered_tickers),
        "as_of":           prices.index[-1].strftime("%Y-%m-%d") if not prices.empty else None,
        "tickers":         ordered_tickers,
        "matrix":          [[round(v, 3) for v in row] for row in ordered_corr.values.tolist()],
        "avg_correlation": avg_corr,
        "most_correlated": most_correlated,
        "least_correlated":least_correlated,
    }


# ── /stock/{ticker} ───────────────────────────────────────────────────────────

@router.get("/stock/{ticker}")
async def get_stock_detail(ticker: str):
    """
    Full drill-down for a single stock: OHLCV bars, all computed signals,
    trade levels (entry/stop/target), RS at multiple periods, and earnings.
    """
    t       = ticker.strip().upper()
    ohlcv   = await _fetch_ohlcv([t])
    prices  = ohlcv.get("adj_close", pd.DataFrame())
    high    = ohlcv.get("high",      pd.DataFrame())
    low_df  = ohlcv.get("low",       pd.DataFrame())
    open_df = ohlcv.get("open",      pd.DataFrame())
    volume  = ohlcv.get("volume",    pd.DataFrame())

    if prices.empty or t not in prices.columns:
        raise HTTPException(404, f"No price data for {t}")

    # ── OHLCV bars for chart (last 365 trading days) ──────────────────────────
    bars = []
    for idx in prices.index[-365:]:
        c = prices.at[idx, t]
        if pd.isna(c):
            continue
        o = open_df.at[idx, t] if not open_df.empty and t in open_df.columns and not pd.isna(open_df.at[idx, t]) else c
        h = high.at[idx, t]   if not high.empty   and t in high.columns   and not pd.isna(high.at[idx, t])   else c
        l = low_df.at[idx, t] if not low_df.empty  and t in low_df.columns and not pd.isna(low_df.at[idx, t])  else c
        v = volume.at[idx, t] if not volume.empty  and t in volume.columns and not pd.isna(volume.at[idx, t])  else 0
        bars.append({
            "time":   idx.strftime("%Y-%m-%d"),
            "open":   round(float(o), 4),
            "high":   round(float(h), 4),
            "low":    round(float(l), 4),
            "close":  round(float(c), 4),
            "volume": int(v),
        })

    # ── Signals ───────────────────────────────────────────────────────────────
    sector_map = _build_sector_etf_mapping([t])
    signals_df = await asyncio.get_event_loop().run_in_executor(
        None, compute_all_signals,
        prices,
        high    if not high.empty    else None,
        low_df  if not low_df.empty  else None,
        open_df if not open_df.empty else None,
        volume  if not volume.empty  else None,
        sector_map or None,
    )

    if t not in signals_df.index:
        raise HTTPException(404, f"Could not compute signals for {t}")

    sig   = signals_df.loc[t]
    price = _safe(prices[t].dropna().iloc[-1])
    setup = str(sig.get("setup", "No Setup"))

    # Trade levels via ATR
    atr_ratio_val = sig.get("atr_ratio")
    atr_dollar = (float(price) * float(atr_ratio_val)
                  if (price and atr_ratio_val and not np.isnan(float(atr_ratio_val)))
                  else None)
    stop_price   = _safe(float(price) - 2.0 * atr_dollar) if (price and atr_dollar) else None
    target_price = _safe(float(price) + 3.0 * atr_dollar) if (price and atr_dollar) else None
    rr = (_safe((target_price - price) / (price - stop_price))
          if (price and stop_price and target_price and price != stop_price) else None)

    # RS vs SPY at multiple periods
    spy_s = prices["SPY"].dropna() if "SPY" in prices.columns else pd.Series(dtype=float)
    tk_s  = prices[t].dropna()

    def _rs_period(days: int) -> Optional[float]:
        if len(tk_s) < days + 1 or len(spy_s) < days + 1:
            return None
        tk_ret  = float(tk_s.iloc[-1]  / tk_s.iloc[-(days + 1)]  - 1)
        spy_ret = float(spy_s.iloc[-1] / spy_s.iloc[-(days + 1)] - 1)
        return round(tk_ret - spy_ret, 4)

    # Regime + regime-adjusted score
    spy_vs_50d = spy_vs_200d = None
    if len(spy_s) >= 50:
        spy_vs_50d = float(spy_s.iloc[-1] / spy_s.rolling(50).mean().iloc[-1] - 1)
    if len(spy_s) >= 200:
        spy_vs_200d = float(spy_s.iloc[-1] / spy_s.rolling(200).mean().iloc[-1] - 1)
    regime_name, _, _, _ = _determine_regime(spy_vs_50d, spy_vs_200d, None, None)
    affinity   = _REGIME_SETUP_AFFINITY.get(setup, {}).get(regime_name, 50)
    confluence = _safe(sig.get("confluence_score"))
    regime_adjusted = round(confluence * 0.70 + affinity * 0.30, 1) if confluence is not None else None

    # Name / sector from universe data
    name = sector_label = ""
    try:
        sp500_df  = uni_module.get_sp500()
        sp500_row = sp500_df[sp500_df["ticker"] == t]
        if not sp500_row.empty:
            name          = str(sp500_row["name"].iloc[0])
            sector_label  = str(sp500_row["sector"].iloc[0])
    except Exception:
        pass

    # Upcoming earnings
    today_date   = datetime.today().date()
    earnings_map = cache.get_earnings_dates([t])
    ed           = earnings_map.get(t)

    np_raw        = sig.get("nearest_pivot")
    nearest_pivot = str(np_raw).upper() if (np_raw is not None and str(np_raw) != "nan") else None

    return {
        "ticker":  t,
        "name":    name or t,
        "sector":  sector_label,
        "price":   price,
        "as_of":   tk_s.index[-1].strftime("%Y-%m-%d") if not tk_s.empty else None,
        "bars":    bars,
        "signals": {
            "setup":                 setup,
            "stage":                 _safe(sig.get("stage")),
            "chg_1d":                _safe(sig.get("chg_1d")),
            "rsi":                   _safe(sig.get("rsi")),
            "ma50_dist":             _safe(sig.get("ma50_dist")),
            "ma200_dist":            _safe(sig.get("ma200_dist")),
            "dist_52w_high":         _safe(sig.get("dist_52w_high")),
            "vol_surge":             _safe(sig.get("vol_surge")),
            "bb_width_pct":          _safe(sig.get("bb_width_pct")),
            "atr_pct":               _safe(sig.get("atr_pct")),
            "atr_dollar":            _safe(atr_dollar),
            "breakout_score":        _safe(sig.get("breakout_score")),
            "confluence_score":      confluence,
            "regime_alignment":      affinity,
            "regime_adjusted_score": regime_adjusted,
            "triple_rs":             bool(sig.get("triple_rs", 0) == 1.0),
            "accum_score":           _safe(sig.get("accum_score")),
            "nearest_pivot":         nearest_pivot,
            "pivot_dist":            _safe(sig.get("pivot_dist")),
            "rs_spy_20d":            _safe(sig.get("rs_spy_20d")),
            "rs_sector_20d":         _safe(sig.get("rs_sector_20d")),
        },
        "trade": {
            "entry":      price,
            "stop":       stop_price,
            "target":     target_price,
            "rr":         rr,
            "atr_dollar": _safe(atr_dollar),
        },
        "rs_periods": {
            "rs_5d":   _rs_period(5),
            "rs_20d":  _rs_period(20),
            "rs_63d":  _rs_period(63),
            "rs_252d": _rs_period(252),
        },
        "earnings_date":    str(ed) if ed else None,
        "days_to_earnings": (ed - today_date).days if (ed and (ed - today_date).days >= 0) else None,
        "regime":           regime_name,
    }
