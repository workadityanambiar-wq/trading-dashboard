"""
Factor API endpoints.

/scores  — cross-sectional factor scores for universe (screener data)
/ic      — monthly IC time series for a factor
/quintiles — Q1-Q5 cumulative return series
/summary — IC stats for all factors
/fetch-fundamentals — trigger background fetch of fundamentals
/fama-french — long-run Fama-French 5-factor + momentum data since 1963
"""
import asyncio
import io
import zipfile
from datetime import datetime, timedelta
from typing import List, Optional
import pandas as pd
import asyncio
import numpy as np
import logging

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.core.data import cache, fetcher, universe
from app.core.factors.engine import FactorEngine, FACTOR_REGISTRY, PRICE_BASED_FACTORS

router = APIRouter(tags=["factors"])
logger = logging.getLogger(__name__)

_START_5Y = (datetime.today() - timedelta(days=5 * 365)).strftime("%Y-%m-%d")
_TODAY = datetime.today().strftime("%Y-%m-%d")

# ── Fama-French cache ─────────────────────────────────────────────────────────
_FF_CACHE: dict = {}
_FF_CACHE_TS: datetime | None = None
_FF_TTL_HOURS = 24


def _get_prices_for_universe() -> pd.DataFrame:
    sp500 = universe.get_sp500()
    tickers = sp500["ticker"].tolist()
    if "SPY" not in tickers:
        tickers = ["SPY"] + tickers
    return cache.get_adj_close(tickers, _START_5Y, _TODAY)


def _get_prices_for_universe_param(universe_param: str) -> pd.DataFrame:
    """
    Resolve a universe string to a price DataFrame.
    Always includes SPY so that macro_regime (market beta) can be computed.
    """
    if universe_param == "sp500":
        tickers = universe.get_sp500()["ticker"].tolist()
    elif universe_param == "sp1500":
        tickers = universe.get_sp1500_tickers()
    elif universe_param == "all_cached":
        tickers = list(cache.get_tickers_with_prices())
    elif universe_param.startswith("theme:"):
        # theme:group_id or theme:group_id:segment_id
        from app.core.data.universe_themes import get_tickers_for
        parts = universe_param.split(":", 2)
        group_id   = parts[1] if len(parts) > 1 else ""
        segment_id = parts[2] if len(parts) > 2 else None
        tickers = get_tickers_for(group_id, segment_id)
    else:
        tickers = [t.strip().upper() for t in universe_param.split(",") if t.strip()]

    if not tickers:
        return pd.DataFrame()
    # Always include SPY for macro_regime beta computation
    if "SPY" not in tickers:
        tickers = ["SPY"] + tickers
    return cache.get_adj_close(tickers, _START_5Y, _TODAY)


def _build_engine(prices: pd.DataFrame, with_fundamentals: bool = False, with_volume: bool = False) -> FactorEngine:
    fundamentals = None
    if with_fundamentals:
        tickers = prices.columns.tolist()
        fundamentals = cache.get_fundamentals(tickers)
        if fundamentals.empty:
            fundamentals = None
    volume = None
    if with_volume:
        volume = cache.get_volume(prices.columns.tolist(), _START_5Y, _TODAY)
        if volume.empty:
            volume = None
    return FactorEngine(prices, fundamentals, volume)


# ── /scores ────────────────────────────────────────────────────────────────────

@router.get("/scores")
async def get_factor_scores(
    background_tasks: BackgroundTasks,
    universe_name: str = Query("sp500", alias="universe"),
    refresh: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    search: str = Query(""),
    exchange: str = Query(""),
    is_etf: Optional[bool] = Query(None),
    has_prices_only: bool = Query(False),
):
    """
    Cross-sectional factor scores.
    universe=sp500  — S&P 500, fast, all stocks scored (default)
    universe=all_us — full US listed universe, paginated, scores only for cached tickers
    """
    if universe_name == "all_us":
        return await _scores_all_us(
            background_tasks, page, page_size, search, exchange, is_etf, has_prices_only
        )

    # ── Theme / custom universe path ───────────────────────────────────────────
    if universe_name.startswith("theme:"):
        return await _scores_theme_universe(universe_name, page, page_size, search)

    # ── S&P 500 path (original behaviour) ─────────────────────────────────────
    sp500 = universe.get_sp500()
    tickers = sp500["ticker"].tolist()
    info_by_ticker = sp500.set_index("ticker")[["name", "sector"]].to_dict("index")

    cached_count = sum(1 for t in tickers if cache.get_last_date(t) is not None)
    is_fetching = cached_count < len(tickers) * 0.8

    if is_fetching or refresh:
        background_tasks.add_task(_bg_fetch_prices, tickers)

    prices = _get_prices_for_universe()
    if prices.empty or len(prices.columns) < 5:
        return {
            "status": "loading",
            "universe": "sp500",
            "cached_pct": round(cached_count / len(tickers), 2),
            "message": f"Fetching price data... {cached_count}/{len(tickers)} stocks cached.",
            "scores": [],
        }

    engine = _build_engine(prices, with_fundamentals=True, with_volume=True)
    scores_df = engine.latest_scores()

    result = []
    for ticker in scores_df.index:
        row = scores_df.loc[ticker]
        meta = info_by_ticker.get(ticker, {})
        result.append({
            "ticker": ticker,
            "name": meta.get("name", ""),
            "sector": meta.get("sector", ""),
            "exchange": "",
            "is_etf": False,
            "has_prices": True,
            "momentum_12_1":        _safe_float(row.get("momentum_12_1")),
            "momentum_6_1":         _safe_float(row.get("momentum_6_1")),
            "realized_vol":         _safe_float(row.get("realized_vol")),
            "momentum_12_1_z":      _safe_float(row.get("momentum_12_1_z")),
            "momentum_6_1_z":       _safe_float(row.get("momentum_6_1_z")),
            "low_vol_z":            _safe_float(row.get("low_vol_z")),
            "liquidity_z":          _safe_float(row.get("liquidity_z")),
            "macro_regime_z":       _safe_float(row.get("macro_regime_z")),
            "value_z":              _safe_float(row.get("value_z")),
            "size_z":               _safe_float(row.get("size_z")),
            "quality_z":            _safe_float(row.get("quality_z")),
            "profitability_z":      _safe_float(row.get("profitability_z")),
            "earnings_revisions_z": _safe_float(row.get("earnings_revisions_z")),
            "sentiment_z":          _safe_float(row.get("sentiment_z")),
            "composite":            _safe_float(row.get("composite")),
        })

    result.sort(key=lambda x: x["composite"] or -99, reverse=True)

    return {
        "status": "ok" if not is_fetching else "partial",
        "universe": "sp500",
        "total": len(result),
        "page": 1,
        "page_size": len(result),
        "pages": 1,
        "cached_pct": round(len(prices.columns) / len(tickers), 2),
        "as_of": prices.index[-1].strftime("%Y-%m-%d"),
        "scores": result,
    }


async def _scores_all_us(
    background_tasks: BackgroundTasks,
    page: int,
    page_size: int,
    search: str,
    exchange: str,
    is_etf: Optional[bool],
    has_prices_only: bool,
):
    """Factor scores for the full US universe — paginated, scores only for cached tickers."""
    # Ensure universe is populated
    total_in_db = cache.get_us_universe_count()
    if total_in_db == 0:
        all_us = await asyncio.get_event_loop().run_in_executor(
            None, universe.get_all_us_listed
        )
        if not all_us.empty:
            await asyncio.get_event_loop().run_in_executor(
                None, cache.upsert_us_universe, all_us
            )

    rows, total = cache.get_us_universe_page(
        search=search,
        exchange=exchange,
        is_etf=is_etf,
        page=page,
        page_size=page_size,
        has_prices_only=has_prices_only,
    )

    # Compute scores across ALL cached tickers for proper cross-sectional z-scores
    all_cached = list(cache.get_tickers_with_prices())
    scores_df = pd.DataFrame()
    as_of = None
    if all_cached:
        prices = cache.get_adj_close(all_cached, _START_5Y, _TODAY)
        if not prices.empty and len(prices.columns) >= 10:
            engine = _build_engine(prices, with_fundamentals=True, with_volume=True)
            scores_df = engine.latest_scores()
            as_of = prices.index[-1].strftime("%Y-%m-%d")

    scored_index = set(scores_df.index) if not scores_df.empty else set()
    result = []
    for row in rows:
        ticker = row["ticker"]
        has_score = ticker in scored_index
        s = scores_df.loc[ticker] if has_score else None
        def sf(col): return _safe_float(s.get(col) if s is not None else None)
        result.append({
            "ticker": ticker,
            "name": row.get("name") or "",
            "sector": row.get("sector") or "",
            "exchange": row.get("exchange") or "",
            "is_etf": bool(row.get("is_etf")),
            "has_prices": bool(row.get("has_prices")),
            "momentum_12_1":        sf("momentum_12_1"),
            "momentum_6_1":         sf("momentum_6_1"),
            "realized_vol":         sf("realized_vol"),
            "momentum_12_1_z":      sf("momentum_12_1_z"),
            "momentum_6_1_z":       sf("momentum_6_1_z"),
            "low_vol_z":            sf("low_vol_z"),
            "liquidity_z":          sf("liquidity_z"),
            "macro_regime_z":       sf("macro_regime_z"),
            "value_z":              sf("value_z"),
            "size_z":               sf("size_z"),
            "quality_z":            sf("quality_z"),
            "profitability_z":      sf("profitability_z"),
            "earnings_revisions_z": sf("earnings_revisions_z"),
            "sentiment_z":          sf("sentiment_z"),
            "composite":            sf("composite"),
        })

    return {
        "status": "ok",
        "universe": "all_us",
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
        "as_of": as_of,
        "scores": result,
    }


async def _scores_theme_universe(
    universe_name: str,
    page: int,
    page_size: int,
    search: str,
) -> dict:
    """Factor scores for a theme: prefixed universe (e.g. theme:ai_infra:photonics)."""
    prices = await asyncio.get_event_loop().run_in_executor(
        None, _get_prices_for_universe_param, universe_name
    )
    if prices.empty or len(prices.columns) < 3:
        return {
            "status": "loading",
            "universe": universe_name,
            "total": 0,
            "page": page,
            "page_size": page_size,
            "pages": 1,
            "cached_pct": 0.0,
            "scores": [],
            "message": "No price data yet — prices load in the background on first access.",
        }

    engine = _build_engine(prices, with_fundamentals=True, with_volume=True)
    scores_df = engine.latest_scores()
    scores_df = scores_df.drop(index="SPY", errors="ignore")

    # Best-effort metadata: SP500 first, then empty fallback
    sp500 = universe.get_sp500()
    info_map = sp500.set_index("ticker")[["name", "sector"]].to_dict("index")

    result = []
    for ticker in scores_df.index:
        row  = scores_df.loc[ticker]
        meta = info_map.get(ticker, {})
        result.append({
            "ticker":  ticker,
            "name":    meta.get("name",   ""),
            "sector":  meta.get("sector", ""),
            "exchange": "",
            "is_etf":  False,
            "has_prices": True,
            "momentum_12_1":        _safe_float(row.get("momentum_12_1")),
            "momentum_6_1":         _safe_float(row.get("momentum_6_1")),
            "realized_vol":         _safe_float(row.get("realized_vol")),
            "momentum_12_1_z":      _safe_float(row.get("momentum_12_1_z")),
            "momentum_6_1_z":       _safe_float(row.get("momentum_6_1_z")),
            "low_vol_z":            _safe_float(row.get("low_vol_z")),
            "liquidity_z":          _safe_float(row.get("liquidity_z")),
            "macro_regime_z":       _safe_float(row.get("macro_regime_z")),
            "value_z":              _safe_float(row.get("value_z")),
            "size_z":               _safe_float(row.get("size_z")),
            "quality_z":            _safe_float(row.get("quality_z")),
            "profitability_z":      _safe_float(row.get("profitability_z")),
            "earnings_revisions_z": _safe_float(row.get("earnings_revisions_z")),
            "sentiment_z":          _safe_float(row.get("sentiment_z")),
            "composite":            _safe_float(row.get("composite")),
        })

    if search:
        s = search.upper()
        result = [r for r in result if s in r["ticker"]]

    result.sort(key=lambda x: x["composite"] or -99, reverse=True)

    total  = len(result)
    offset = (page - 1) * page_size
    return {
        "status": "ok",
        "universe": universe_name,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
        "cached_pct": 1.0,
        "as_of": prices.index[-1].strftime("%Y-%m-%d") if not prices.empty else None,
        "scores": result[offset: offset + page_size],
    }


# ── /ic ────────────────────────────────────────────────────────────────────────

@router.get("/ic")
async def get_ic(
    factor: str = Query("momentum_12_1"),
    horizon: int = Query(21),
    universe: str = Query("sp500"),
):
    """Monthly IC time series for a factor vs horizon-day forward returns."""
    if factor not in FACTOR_REGISTRY:
        raise HTTPException(400, f"Unknown factor. Options: {list(FACTOR_REGISTRY.keys())}")

    # Fundamental factors have no price-derived IC history
    if not FACTOR_REGISTRY[factor]["ic_history"]:
        return {"factor": factor, "horizon": horizon, "series": [], "stats": {}, "no_history": True}

    prices = await asyncio.get_event_loop().run_in_executor(
        None, _get_prices_for_universe_param, universe
    )
    if prices.empty:
        raise HTTPException(503, "Price data not available yet.")

    engine = _build_engine(prices, with_volume=(factor == "liquidity"))
    ic_df = await asyncio.get_event_loop().run_in_executor(
        None, engine.ic_series, factor, horizon
    )

    if ic_df.empty:
        return {"factor": factor, "horizon": horizon, "series": [], "stats": {}}

    stats = {
        "mean_ic": round(float(ic_df["ic"].mean()), 4),
        "icir": round(float(ic_df["ic"].mean() / ic_df["ic"].std()), 3)
        if ic_df["ic"].std() > 0 else None,
        "pct_positive": round(float((ic_df["ic"] > 0).mean()), 4),
        "n_obs": len(ic_df),
    }

    series = [
        {
            "date": str(row["date"])[:10],
            "ic": _safe_float(row["ic"]),
            "ic_3m_ma": _safe_float(row["ic_3m_ma"]),
            "cumulative_ic": _safe_float(row["cumulative_ic"]),
        }
        for _, row in ic_df.iterrows()
    ]

    return {"factor": factor, "horizon": horizon, "series": series, "stats": stats}


# ── /quintiles ────────────────────────────────────────────────────────────────

@router.get("/quintiles")
async def get_quintiles(
    factor: str = Query("momentum_12_1"),
    universe: str = Query("sp500"),
):
    """Monthly-rebalanced Q1-Q5 equal-weight cumulative returns."""
    if factor not in FACTOR_REGISTRY:
        raise HTTPException(400, f"Unknown factor. Options: {list(FACTOR_REGISTRY.keys())}")

    if not FACTOR_REGISTRY[factor]["ic_history"]:
        return {"factor": factor, "series": [], "no_history": True}

    prices = await asyncio.get_event_loop().run_in_executor(
        None, _get_prices_for_universe_param, universe
    )
    if prices.empty:
        raise HTTPException(503, "Price data not available yet.")

    engine = _build_engine(prices, with_volume=(factor == "liquidity"))
    q_df = await asyncio.get_event_loop().run_in_executor(
        None, engine.quintile_returns, factor
    )

    if q_df.empty:
        return {"factor": factor, "series": []}

    q_df = q_df.reset_index()
    q_df["date"] = q_df["date"].dt.strftime("%Y-%m-%d")

    series = q_df.to_dict("records")
    return {"factor": factor, "series": series}


# ── /summary ─────────────────────────────────────────────────────────────────

@router.get("/summary")
async def get_summary(universe: str = Query("sp500")):
    """IC summary stats for all available factors."""
    prices = await asyncio.get_event_loop().run_in_executor(
        None, _get_prices_for_universe_param, universe
    )
    if prices.empty:
        return {"status": "loading", "factors": []}

    engine = _build_engine(prices)
    summaries = []
    for factor, label in FACTOR_REGISTRY.items():
        stats = await asyncio.get_event_loop().run_in_executor(
            None, engine.factor_summary, factor
        )
        stats["label"] = label
        summaries.append(stats)

    return {"status": "ok", "factors": summaries}


# ── /fama-french ─────────────────────────────────────────────────────────────

_FF5_URL  = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_5_Factors_2x3_CSV.zip"
_MOM_URL  = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Momentum_Factor_CSV.zip"


def _fetch_ff_csv(url: str, skip_rows: int = 3) -> pd.DataFrame:
    """Download a Ken French zip CSV and return a monthly DataFrame."""
    r = httpx.get(url, timeout=30, follow_redirects=True)
    r.raise_for_status()
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    name = zf.namelist()[0]
    raw = zf.read(name).decode("latin-1")

    # Each file has a monthly section then an annual section separated by a blank line
    lines = raw.splitlines()
    data_lines = []
    started = False
    for line in lines:
        stripped = line.strip()
        if not started:
            if stripped and stripped[0].isdigit() and len(stripped.split(",")[0]) == 6:
                started = True
                data_lines.append(line)
            continue
        # Stop at annual section (4-digit year rows) or trailing notes
        if stripped and stripped[0].isdigit() and len(stripped.split(",")[0]) == 4:
            break
        if stripped.startswith("Annual"):
            break
        data_lines.append(line)

    text = "\n".join(data_lines)
    df = pd.read_csv(io.StringIO(text), header=None)
    df = df.dropna(how="all")
    df.columns = range(len(df.columns))
    return df


def _build_ff_data() -> dict:
    global _FF_CACHE, _FF_CACHE_TS
    if _FF_CACHE_TS and (datetime.utcnow() - _FF_CACHE_TS).total_seconds() < _FF_TTL_HOURS * 3600:
        return _FF_CACHE

    # ── 5-factor monthly ──────────────────────────────────────────────────────
    ff5 = _fetch_ff_csv(_FF5_URL)
    # columns: date(YYYYMM), Mkt-RF, SMB, HML, RMW, CMA, RF
    ff5.columns = ["date", "mkt_rf", "smb", "hml", "rmw", "cma", "rf"]
    ff5["date"] = pd.to_datetime(ff5["date"].astype(str), format="%Y%m") + pd.offsets.MonthEnd(0)
    for col in ["mkt_rf", "smb", "hml", "rmw", "cma", "rf"]:
        ff5[col] = pd.to_numeric(ff5[col], errors="coerce") / 100

    # ── Momentum monthly ──────────────────────────────────────────────────────
    mom_raw = _fetch_ff_csv(_MOM_URL)
    mom_raw.columns = ["date", "mom"] + [f"_x{i}" for i in range(len(mom_raw.columns) - 2)]
    mom_raw["date"] = pd.to_datetime(mom_raw["date"].astype(str), format="%Y%m") + pd.offsets.MonthEnd(0)
    mom_raw["mom"] = pd.to_numeric(mom_raw["mom"], errors="coerce") / 100

    merged = ff5.merge(mom_raw[["date", "mom"]], on="date", how="left")
    merged = merged[merged["date"] >= "1963-01-01"].dropna(subset=["mkt_rf"])
    merged = merged.sort_values("date")

    # ── Cumulative returns ────────────────────────────────────────────────────
    factors = ["mkt_rf", "smb", "hml", "rmw", "cma", "mom"]
    cum = (1 + merged[factors]).cumprod()
    cum["date"] = merged["date"].values

    # ── SPX total return from yfinance (^GSPC + dividends proxy) ─────────────
    try:
        import yfinance as yf
        spx_hist = yf.download("^GSPC", start="1963-01-01", auto_adjust=True, progress=False)
        if not spx_hist.empty:
            if hasattr(spx_hist.columns, "get_level_values"):
                spx_close = spx_hist["Close"].squeeze()
            else:
                spx_close = spx_hist["Close"]
            spx_monthly = spx_close.resample("ME").last().pct_change().dropna()
            spx_cum = (1 + spx_monthly).cumprod()
            spx_cum.index = spx_cum.index + pd.offsets.MonthEnd(0)
            spx_dates = pd.DatetimeIndex(merged["date"].values)
            spx_aligned = spx_cum.reindex(spx_dates, method="ffill")
            cum["spx"] = spx_aligned.values
    except Exception as e:
        logger.warning(f"SPX download failed: {e}")

    # ── Drawdown per factor ───────────────────────────────────────────────────
    all_factor_cols = [c for c in cum.columns if c != "date"]
    rolling_max = cum[all_factor_cols].cummax()
    drawdown = (cum[all_factor_cols] / rolling_max - 1)

    records = []
    for _, row in cum.iterrows():
        rec: dict = {"date": row["date"].strftime("%Y-%m-%d")}
        for col in all_factor_cols:
            rec[col] = round(float(row[col]), 4) if pd.notna(row[col]) else None
        records.append(rec)

    dd_records = []
    for i, row in drawdown.iterrows():
        rec: dict = {"date": cum.loc[i, "date"].strftime("%Y-%m-%d")}
        for col in all_factor_cols:
            rec[col] = round(float(row[col]), 4) if pd.notna(row[col]) else None
        dd_records.append(rec)

    # ── Summary stats per factor ──────────────────────────────────────────────
    returns_df = merged[["date"] + [f for f in factors if f in merged.columns]].copy()
    summaries = {}
    for col in all_factor_cols:
        if col == "spx":
            continue
        if col not in merged.columns:
            continue
        s = merged[col].dropna()
        if s.empty:
            continue
        ann = float((1 + s).prod() ** (12 / len(s)) - 1)
        vol = float(s.std() * np.sqrt(12))
        sharpe = ann / vol if vol > 0 else 0
        max_dd = float((cum[col] / cum[col].cummax() - 1).min())
        summaries[col] = {
            "ann_return": round(ann, 4),
            "ann_vol":    round(vol, 4),
            "sharpe":     round(sharpe, 3),
            "max_dd":     round(max_dd, 4),
            "n_months":   len(s),
        }

    result = {
        "series":    records,
        "drawdown":  dd_records,
        "summaries": summaries,
        "start":     records[0]["date"] if records else None,
        "end":       records[-1]["date"] if records else None,
        "n_months":  len(records),
        "factors": {
            "mkt_rf": "Market (Mkt-RF)",
            "smb":    "Size (SMB)",
            "hml":    "Value (HML)",
            "rmw":    "Profitability (RMW)",
            "cma":    "Investment (CMA)",
            "mom":    "Momentum",
            "spx":    "S&P 500 (^GSPC)",
        },
    }

    _FF_CACHE.update(result)
    _FF_CACHE_TS = datetime.utcnow()
    return _FF_CACHE


@router.get("/fama-french")
async def get_fama_french():
    """
    Long-run Fama-French 5-factor + Momentum cumulative returns since 1963.
    Data from Kenneth French Data Library + SPX from yfinance.
    Cached for 24 hours.
    """
    try:
        data = await asyncio.get_event_loop().run_in_executor(None, _build_ff_data)
        return data
    except Exception as e:
        logger.error(f"Fama-French fetch failed: {e}")
        raise HTTPException(503, f"Could not fetch Fama-French data: {e}")


# ── /fetch-fundamentals ───────────────────────────────────────────────────────

@router.post("/fetch-fundamentals")
async def fetch_fundamentals_endpoint(
    background_tasks: BackgroundTasks,
    max_tickers: int = Query(50),
):
    """Trigger a background fetch of fundamental data (P/B, ROE, gross margins)."""
    sp500 = universe.get_sp500()
    tickers = sp500["ticker"].tolist()[:max_tickers]
    background_tasks.add_task(_bg_fetch_fundamentals, tickers)
    return {"status": "started", "tickers": len(tickers)}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_float(val) -> Optional[float]:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    return round(float(val), 6)


def _bg_fetch_prices(tickers: List[str]) -> None:
    try:
        fetcher.ensure_prices(tickers, _START_5Y)
    except Exception as e:
        logger.error(f"Background price fetch failed: {e}")


def _bg_fetch_fundamentals(tickers: List[str]) -> None:
    try:
        from app.core.factors.fundamentals import fetch_fundamentals
        df = fetch_fundamentals(tickers)
        cache.store_fundamentals(df)
        logger.info(f"Cached fundamentals for {len(df)} tickers")
    except Exception as e:
        logger.error(f"Background fundamentals fetch failed: {e}")
