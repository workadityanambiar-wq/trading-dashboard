import asyncio
from datetime import datetime, timedelta
from typing import List, Optional
import pandas as pd
import numpy as np
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from app.core.data import cache, fetcher, universe
from app.models.schemas import (
    OverviewResponse, IndexCard, SectorReturn, BreadthData,
    PricesResponse, OHLCVBar, UniverseTicker,
)

router = APIRouter(tags=["data"])
logger = logging.getLogger(__name__)

_START_5Y = (datetime.today() - timedelta(days=5 * 365)).strftime("%Y-%m-%d")
_START_2Y = (datetime.today() - timedelta(days=2 * 365)).strftime("%Y-%m-%d")


def _safe_return(prices: pd.Series, ref_idx: int) -> float:
    try:
        ref = prices.iloc[ref_idx]
        cur = prices.iloc[-1]
        if pd.isna(ref) or ref == 0:
            return 0.0
        return float((cur - ref) / ref)
    except (IndexError, ZeroDivisionError):
        return 0.0


def _get_ref_idx(prices: pd.Series, target_date: pd.Timestamp) -> int:
    """Index of the last trading day on or before target_date."""
    mask = prices.index <= target_date
    if not mask.any():
        return 0
    return int(np.where(mask)[0][-1])


def _compute_return_periods(prices: pd.Series) -> dict:
    if prices.empty or len(prices) < 2:
        return {k: 0.0 for k in ["change_1d", "change_wtd", "change_mtd", "change_ytd", "change_1y"]}

    now = prices.index[-1]
    last_friday = now - timedelta(days=now.weekday() + 3 if now.weekday() >= 0 else 2)
    last_friday = pd.Timestamp(last_friday.year, last_friday.month, last_friday.day)
    first_of_month = pd.Timestamp(now.year, now.month, 1)
    first_of_year = pd.Timestamp(now.year, 1, 1)
    one_year_ago = now - pd.DateOffset(years=1)

    return {
        "change_1d": _safe_return(prices, -2),
        "change_wtd": _safe_return(prices, _get_ref_idx(prices, last_friday - timedelta(days=1))),
        "change_mtd": _safe_return(prices, _get_ref_idx(prices, first_of_month - timedelta(days=1))),
        "change_ytd": _safe_return(prices, _get_ref_idx(prices, first_of_year - timedelta(days=1))),
        "change_1y": _safe_return(prices, _get_ref_idx(prices, one_year_ago)),
    }


@router.get("/overview", response_model=OverviewResponse)
async def get_overview(background_tasks: BackgroundTasks):
    watchlist = universe.get_watchlist_tickers()
    today = datetime.today().strftime("%Y-%m-%d")

    await asyncio.get_event_loop().run_in_executor(
        None, fetcher.ensure_prices, watchlist, _START_2Y, today
    )

    prices = cache.get_adj_close(watchlist, _START_2Y, today)
    if prices.empty:
        raise HTTPException(503, "Price data unavailable")

    indices: List[IndexCard] = []
    for ticker, name in universe.INDEX_TICKERS.items():
        if ticker not in prices.columns:
            continue
        s = prices[ticker].dropna()
        if s.empty:
            continue
        periods = _compute_return_periods(s)
        indices.append(
            IndexCard(
                ticker=ticker,
                name=name,
                price=round(float(s.iloc[-1]), 2),
                **{k: round(v, 4) for k, v in periods.items()},
            )
        )

    sectors: List[SectorReturn] = []
    for ticker, meta in universe.SECTOR_ETFS.items():
        if ticker not in prices.columns:
            continue
        s = prices[ticker].dropna()
        if s.empty:
            continue
        now = s.index[-1]
        one_week = now - timedelta(days=7)
        one_month = now - pd.DateOffset(months=1)
        three_months = now - pd.DateOffset(months=3)
        first_of_year = pd.Timestamp(now.year, 1, 1)

        def ret(ref_ts):
            idx = _get_ref_idx(s, ref_ts)
            return _safe_return(s, idx)

        sectors.append(
            SectorReturn(
                ticker=ticker,
                name=meta["name"],
                sector=meta["sector"],
                change_1d=round(_safe_return(s, -2), 4),
                change_1w=round(ret(one_week), 4),
                change_1m=round(ret(one_month), 4),
                change_3m=round(ret(three_months), 4),
                change_ytd=round(ret(first_of_year - timedelta(days=1)), 4),
            )
        )

    breadth = await asyncio.get_event_loop().run_in_executor(None, _compute_breadth)

    # If SP500 prices aren't cached yet, kick off a background fetch
    if breadth.sp500_count < 50:
        sp500_tickers = universe.get_sp500()["ticker"].tolist()
        background_tasks.add_task(_bg_fetch_sp500, sp500_tickers)

    return OverviewResponse(indices=indices, sectors=sectors, breadth=breadth)


def _compute_breadth() -> BreadthData:
    """
    Compute % of S&P 500 above 50/200-day MA using whatever SP500 prices
    are already in the cache. Independent of the watchlist prices.
    """
    sp500 = universe.get_sp500()
    sp_tickers_all = set(sp500["ticker"].tolist())

    # Only use tickers already cached — no blocking network calls here
    cached = [t for t in cache.get_tickers_with_prices() if t in sp_tickers_all]
    if not cached:
        return BreadthData(above_50ma_pct=0.0, above_200ma_pct=0.0, sp500_count=0)

    # 400 days gives enough runway for the 200-day MA
    start = (datetime.today() - timedelta(days=400)).strftime("%Y-%m-%d")
    today = datetime.today().strftime("%Y-%m-%d")
    sp_prices = cache.get_adj_close(cached, start, today)

    if sp_prices.empty:
        return BreadthData(above_50ma_pct=0.0, above_200ma_pct=0.0, sp500_count=0)

    sp_prices = sp_prices.ffill()
    n = len(sp_prices.columns)

    last  = sp_prices.iloc[-1]
    ma50  = sp_prices.rolling(50).mean().iloc[-1]
    ma200 = sp_prices.rolling(200).mean().iloc[-1]

    above_50  = int((last > ma50).fillna(False).sum())
    above_200 = int((last > ma200).fillna(False).sum())

    return BreadthData(
        above_50ma_pct=round(above_50  / n, 4),
        above_200ma_pct=round(above_200 / n, 4),
        sp500_count=n,
    )


def _bg_fetch_sp500(tickers: List[str]) -> None:
    """Background fetch of SP500 prices to populate breadth on first load."""
    try:
        fetcher.ensure_prices(tickers, _START_2Y, datetime.today().strftime("%Y-%m-%d"))
    except Exception as e:
        logger.error(f"SP500 breadth prefetch failed: {e}")


@router.get("/sector-rotation")
async def get_sector_rotation():
    """
    Relative Rotation Graph data for all 11 GICS sector ETFs vs SPY.
    RS Ratio  = % deviation of (sector/SPY) from its 252-day mean  → strength level
    RS Momentum = 21-day change in RS Ratio                         → acceleration
    """
    watchlist = universe.get_watchlist_tickers()
    today = datetime.today().strftime("%Y-%m-%d")

    await asyncio.get_event_loop().run_in_executor(
        None, fetcher.ensure_prices, watchlist, _START_2Y, today
    )

    prices = cache.get_adj_close(watchlist, _START_2Y, today)
    if prices.empty or "SPY" not in prices.columns:
        raise HTTPException(503, "Price data unavailable")

    prices = prices.ffill()
    spy    = prices["SPY"].dropna()

    sectors_out = []
    current_rs: dict[str, float] = {}

    for ticker, meta in universe.SECTOR_ETFS.items():
        if ticker not in prices.columns:
            continue
        sec = prices[ticker].dropna()
        common = sec.index.intersection(spy.index)
        if len(common) < 252:
            continue

        s  = sec.loc[common]
        sp = spy.loc[common]

        rel      = s / sp
        rs_mean  = rel.rolling(252).mean()
        rs_ratio = ((rel - rs_mean) / rs_mean * 100)

        rs_momentum = rs_ratio - rs_ratio.shift(21)

        cur_ratio   = float(rs_ratio.iloc[-1])
        cur_mom     = float(rs_momentum.iloc[-1])
        current_rs[ticker] = cur_ratio

        if cur_ratio >= 0 and cur_mom >= 0:
            quadrant = "Leading"
        elif cur_ratio < 0 and cur_mom >= 0:
            quadrant = "Improving"
        elif cur_ratio >= 0 and cur_mom < 0:
            quadrant = "Weakening"
        else:
            quadrant = "Lagging"

        # Trail: up to 8 weekly snapshots (every 5 trading days) + current
        trail: list[list[float]] = []
        for i in range(7, 0, -1):
            offset = i * 5
            if offset < len(rs_ratio):
                r = rs_ratio.iloc[-offset - 1]
                m = rs_momentum.iloc[-offset - 1]
                if not (np.isnan(r) or np.isnan(m)):
                    trail.append([round(float(r), 3), round(float(m), 3)])
        trail.append([round(cur_ratio, 3), round(cur_mom, 3)])

        now = s.index[-1]
        one_week     = now - timedelta(days=7)
        one_month    = now - pd.DateOffset(months=1)
        three_months = now - pd.DateOffset(months=3)
        first_of_year = pd.Timestamp(now.year, 1, 1)

        sectors_out.append({
            "ticker":       ticker,
            "name":         meta["name"],
            "sector":       meta["sector"],
            "rs_ratio":     round(cur_ratio, 3),
            "rs_momentum":  round(cur_mom, 3),
            "quadrant":     quadrant,
            "trail":        trail,
            "change_1d":    round(_safe_return(s, -2), 4),
            "change_1w":    round(_safe_return(s, _get_ref_idx(s, one_week)),     4),
            "change_1m":    round(_safe_return(s, _get_ref_idx(s, one_month)),    4),
            "change_3m":    round(_safe_return(s, _get_ref_idx(s, three_months)), 4),
            "change_ytd":   round(_safe_return(s, _get_ref_idx(s, first_of_year - timedelta(days=1))), 4),
        })

    sorted_rs = sorted(current_rs.items(), key=lambda x: x[1], reverse=True)
    rank_map  = {t: r + 1 for r, (t, _) in enumerate(sorted_rs)}
    for item in sectors_out:
        item["rs_rank"] = rank_map.get(item["ticker"], 99)

    sectors_out.sort(key=lambda x: x["rs_rank"])

    return {
        "as_of":   str(spy.index[-1].date()) if not spy.empty else today,
        "sectors": sectors_out,
    }


@router.get("/prices/{ticker}", response_model=PricesResponse)
async def get_prices(ticker: str, period: str = Query("1y")):
    period_map = {"1m": 30, "3m": 90, "6m": 180, "1y": 365, "2y": 730, "5y": 1825}
    days = period_map.get(period, 365)
    start = (datetime.today() - timedelta(days=days)).strftime("%Y-%m-%d")
    today = datetime.today().strftime("%Y-%m-%d")

    await asyncio.get_event_loop().run_in_executor(
        None, fetcher.ensure_prices, [ticker], start, today
    )

    df = cache.get_ohlcv(ticker, start, today)
    if df.empty:
        raise HTTPException(404, f"No price data for {ticker}")

    bars = [
        OHLCVBar(
            time=row["date"].strftime("%Y-%m-%d"),
            open=round(float(row["open"] or row["close"]), 4),
            high=round(float(row["high"] or row["close"]), 4),
            low=round(float(row["low"] or row["close"]), 4),
            close=round(float(row["close"]), 4),
            volume=int(row["volume"] or 0),
        )
        for _, row in df.iterrows()
    ]
    return PricesResponse(ticker=ticker.upper(), bars=bars)


@router.get("/universe", response_model=List[UniverseTicker])
async def get_universe():
    df = cache.get_universe()
    if df.empty:
        sp500 = universe.get_sp500()
        if sp500.empty:
            return []
        cache.store_universe(sp500)
        df = sp500

    return [
        UniverseTicker(
            ticker=row["ticker"],
            name=row["name"],
            sector=row["sector"],
            sub_industry=row["sub_industry"],
        )
        for _, row in df.iterrows()
    ]


@router.get("/universe/search")
async def search_universe(
    q: str = Query("", description="Search by ticker or name"),
    exchange: str = Query("", description="Exchange code: Q/G/S=NASDAQ, N=NYSE, A=NYSE American, P=NYSE Arca"),
    is_etf: Optional[bool] = Query(None),
    has_prices_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
):
    """Paginated search over the full US-listed universe."""
    total = cache.get_us_universe_count()
    if total == 0:
        # Populate in foreground on first call
        all_us = await asyncio.get_event_loop().run_in_executor(
            None, universe.get_all_us_listed
        )
        if not all_us.empty:
            await asyncio.get_event_loop().run_in_executor(
                None, cache.upsert_us_universe, all_us
            )

    rows, total = cache.get_us_universe_page(
        search=q,
        exchange=exchange,
        is_etf=is_etf,
        page=page,
        page_size=page_size,
        has_prices_only=has_prices_only,
    )

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),  # ceil division
        "results": rows,
    }


@router.post("/universe/prefetch")
async def prefetch_universe_prices(
    background_tasks: BackgroundTasks,
    exchange: str = Query("", description="Limit prefetch to this exchange code"),
    limit: int = Query(500, ge=1, le=2000, description="Max tickers to enqueue"),
):
    """
    Trigger background price fetching for US-listed stocks.
    Prioritises stocks without cached prices. Runs in background — returns immediately.
    """
    rows, total = cache.get_us_universe_page(
        exchange=exchange,
        has_prices_only=False,
        page=1,
        page_size=limit,
    )
    # Only fetch tickers that don't already have prices
    tickers_needed = [r["ticker"] for r in rows if not r.get("has_prices")][:limit]
    if not tickers_needed:
        return {"status": "nothing_to_fetch", "total_universe": total}

    background_tasks.add_task(_bg_fetch_batch, tickers_needed)
    return {
        "status": "started",
        "enqueued": len(tickers_needed),
        "total_universe": total,
    }


def _bg_fetch_batch(tickers: List[str]) -> None:
    start_5y = (datetime.today() - timedelta(days=5 * 365)).strftime("%Y-%m-%d")
    today = datetime.today().strftime("%Y-%m-%d")
    # Fetch in batches of 50 to avoid yfinance rate limits
    batch_size = 50
    for i in range(0, len(tickers), batch_size):
        batch = tickers[i : i + batch_size]
        try:
            fetcher.ensure_prices(batch, start_5y, today)
            logger.info(f"Prefetched prices for batch {i//batch_size + 1}: {len(batch)} tickers")
        except Exception as e:
            logger.error(f"Prefetch batch failed: {e}")
