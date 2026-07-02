"""Investment Universe API router."""
from __future__ import annotations
import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.universe.db import (
    universe_search,
    get_financials,
    get_institutional_holders,
    get_insider_transactions,
    get_corporate_actions,
)
from app.core.universe.fetcher import (
    ensure_profile_and_ratios,
    ensure_financials,
    fetch_and_cache_ownership,
    fetch_and_cache_corporate_actions,
)

router = APIRouter(tags=["universe"])


@router.get("/search")
async def search_universe(
    q:               str            = Query(""),
    sector:          str            = Query(""),
    asset_class:     str            = Query(""),
    market_cap_min:  Optional[float] = Query(None),
    market_cap_max:  Optional[float] = Query(None),
    exchange:        str            = Query(""),
    sort_by:         str            = Query("market_cap"),
    sort_dir:        str            = Query("desc"),
    page:            int            = Query(1, ge=1),
    page_size:       int            = Query(50, ge=1, le=200),
):
    results, total = universe_search(
        q=q, sector=sector, asset_class=asset_class,
        market_cap_min=market_cap_min, market_cap_max=market_cap_max,
        exchange=exchange, sort_by=sort_by, sort_dir=sort_dir,
        page=page, page_size=page_size,
    )
    return {
        "total": total,
        "page": page,
        "pages": max(1, (total + page_size - 1) // page_size),
        "results": results,
    }


@router.get("/{ticker}/profile")
async def get_security_profile(ticker: str):
    ticker = ticker.upper()
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, ensure_profile_and_ratios, ticker)
    if not data:
        raise HTTPException(404, f"No data found for {ticker}")
    return data


@router.get("/{ticker}/financials")
async def get_security_financials(ticker: str):
    ticker = ticker.upper()
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, ensure_financials, ticker)
    return data


@router.get("/{ticker}/ownership")
async def get_security_ownership(ticker: str, refresh: bool = False):
    ticker = ticker.upper()
    ih = get_institutional_holders(ticker)
    ins = get_insider_transactions(ticker)
    if (not ih and not ins) or refresh:
        loop = asyncio.get_event_loop()
        data = await loop.run_in_executor(None, fetch_and_cache_ownership, ticker)
        return data
    return {"institutional_holders": ih, "insider_transactions": ins}


@router.get("/{ticker}/corporate-actions")
async def get_security_corporate_actions(ticker: str, refresh: bool = False):
    ticker = ticker.upper()
    actions = get_corporate_actions(ticker)
    if not actions or refresh:
        loop = asyncio.get_event_loop()
        actions = await loop.run_in_executor(None, fetch_and_cache_corporate_actions, ticker)
    return actions


class CompareRequest(BaseModel):
    tickers: list[str]


@router.post("/compare")
async def compare_securities(req: CompareRequest):
    if len(req.tickers) < 2 or len(req.tickers) > 6:
        raise HTTPException(400, "Compare requires 2–6 tickers")
    loop = asyncio.get_event_loop()
    results = []
    for ticker in req.tickers:
        data = await loop.run_in_executor(None, ensure_profile_and_ratios, ticker.upper())
        results.append(data or {"ticker": ticker.upper()})
    return results
