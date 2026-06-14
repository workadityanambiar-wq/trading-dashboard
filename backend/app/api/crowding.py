"""
Crowding Dashboard API.

GET /api/crowding/scan?universe=sp500&top_n=100
  Returns per-stock crowding score decomposed into:
  - Institutional ownership (hedge fund / 13F proxy)
  - Analyst consensus (buy%, net upgrades)
  - Short interest (low short = crowded long)
  - Media attention (news count proxy for social mentions)
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from fastapi import APIRouter, Query

from app.core.data import cache, fetcher
from app.core.data import universe as uni_module
from app.core.crowding.scanner import scan_crowding
from app.api.technical import _resolve_tickers

logger = logging.getLogger(__name__)
router = APIRouter()

_START_1Y = (datetime.today() - timedelta(days=365)).strftime("%Y-%m-%d")
_TODAY    = datetime.today().strftime("%Y-%m-%d")


def _safe(v) -> float | None:
    try:
        f = float(v)
        return None if np.isnan(f) else round(f, 4)
    except Exception:
        return None


@router.get("/scan")
async def scan(
    universe: str = Query("sp500"),
    top_n:    int = Query(100, ge=10, le=300),
):
    tickers = _resolve_tickers(universe, "", "")[:top_n]
    if not tickers:
        return {"results": [], "universe_size": 0, "as_of": _TODAY}

    # Price momentum from cached data (for short squeeze signal)
    try:
        all_t  = list(dict.fromkeys(["SPY"] + tickers))
        fetcher.ensure_prices(all_t, _START_1Y, _TODAY)
        prices = cache.get_adj_close(all_t, _START_1Y, _TODAY)
    except Exception:
        prices = pd.DataFrame()

    mo_1m: dict[str, float | None] = {}
    mo_3m: dict[str, float | None] = {}
    if not prices.empty and len(prices) >= 21:
        last = prices.iloc[-1]
        p21  = prices.iloc[-21] if len(prices) >= 21 else None
        p63  = prices.iloc[-63] if len(prices) >= 63 else None
        for t in tickers:
            try:
                mo_1m[t] = round((float(last[t]) / float(p21[t]) - 1) * 100, 1) if p21 is not None and t in last and t in p21 else None
                mo_3m[t] = round((float(last[t]) / float(p63[t]) - 1) * 100, 1) if p63 is not None and t in last and t in p63 else None
            except Exception:
                mo_1m[t] = None
                mo_3m[t] = None

    # Universe metadata
    try:
        sp_df      = uni_module.get_sp500()
        name_map   = dict(zip(sp_df["ticker"], sp_df.get("name",   sp_df["ticker"])))
        sector_map = dict(zip(sp_df["ticker"], sp_df.get("sector", "")))
    except Exception:
        name_map   = {}
        sector_map = {}

    # Run crowding scan in thread pool
    loop = asyncio.get_event_loop()
    df   = await loop.run_in_executor(None, scan_crowding, tickers)

    if df.empty:
        return {"results": [], "universe_size": len(tickers), "as_of": _TODAY}

    results = []
    for ticker in df.index:
        row = df.loc[ticker]
        s_pct = _safe(row.get("short_pct"))
        m1    = mo_1m.get(ticker)

        # Short squeeze flag: high short + positive 1m momentum
        squeeze_candidate = bool(
            s_pct is not None and s_pct >= 10
            and m1 is not None and m1 > 3
        )

        results.append({
            "ticker":             ticker,
            "name":               name_map.get(ticker, ticker),
            "sector":             sector_map.get(ticker, ""),
            "crowding_score":     _safe(row.get("crowding_score")),
            "crowding_label":     str(row.get("crowding_label", "")),
            # Institutional
            "inst_pct":           _safe(row.get("inst_pct")),
            "insider_pct":        _safe(row.get("insider_pct")),
            # Analyst
            "num_analysts":       int(row.get("num_analysts") or 0),
            "buy_pct":            _safe(row.get("buy_pct")),
            "hold_pct":           _safe(row.get("hold_pct")),
            "sell_pct":           _safe(row.get("sell_pct")),
            "rec_mean":           _safe(row.get("rec_mean")),
            "target_upside":      _safe(row.get("target_upside")),
            "upgrades_90d":       int(row.get("upgrades_90d") or 0),
            "downgrades_90d":     int(row.get("downgrades_90d") or 0),
            "net_upgrades":       int(row.get("net_upgrades") or 0),
            # Short interest
            "short_pct":          s_pct,
            "short_ratio":        _safe(row.get("short_ratio")),
            # Social / media
            "news_count":         int(row.get("news_count") or 0),
            # Price momentum
            "mo_1m":              m1,
            "mo_3m":              mo_3m.get(ticker),
            # Flags
            "squeeze_candidate":  squeeze_candidate,
        })

    results.sort(key=lambda x: (x["crowding_score"] or 0), reverse=True)
    for i, r in enumerate(results):
        r["rank"] = i + 1

    # Sector summary
    sector_crowding: dict[str, list] = {}
    for r in results:
        s = r["sector"] or "Unknown"
        sector_crowding.setdefault(s, [])
        if r["crowding_score"] is not None:
            sector_crowding[s].append(r["crowding_score"])

    sector_avg = [
        {"sector": s, "avg_score": round(float(np.mean(scores)), 1), "count": len(scores)}
        for s, scores in sector_crowding.items() if scores
    ]
    sector_avg.sort(key=lambda x: x["avg_score"], reverse=True)

    return {
        "results":       results,
        "universe_size": len(tickers),
        "computed":      len(results),
        "sector_crowding": sector_avg,
        "as_of":         _TODAY,
    }
