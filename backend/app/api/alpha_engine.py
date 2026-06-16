"""
Alpha Engine API — composite factor scoring and universe ranking.

GET  /api/alpha-engine/score/{ticker}   Full 7-factor breakdown
POST /api/alpha-engine/rank             Rank a custom list of tickers
GET  /api/alpha-engine/universes        Predefined universe lists
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.alpha_engine.scorer import (
    compute_alpha_score,
    DEFAULT_WEIGHTS,
    FACTOR_META,
    SECTOR_ETFS,
)

router = APIRouter()
logger = logging.getLogger(__name__)

# ── Predefined universes ───────────────────────────────────────────────────────

UNIVERSES: Dict[str, List[str]] = {
    "Magnificent 7":   ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA"],
    "S&P Top 20":      ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA",
                        "AVGO", "JPM", "LLY", "V", "UNH", "XOM", "MA", "HD",
                        "COST", "WMT", "NFLX", "ORCL", "ABBV"],
    "Growth Leaders":  ["NVDA", "ASTS", "PLTR", "CRWD", "ZS", "DDOG", "NET",
                        "APP",  "AXON", "MSTR"],
    "Quality Value":   ["BRK-B", "JPM", "JNJ", "PG", "KO", "WMT",
                        "V",     "MA",  "UNH", "LLY"],
    "Sector ETFs":     ["XLK", "XLV", "XLF", "XLY", "XLE", "XLB",
                        "XLU", "XLRE","XLI", "XLC", "XLP"],
    "Small-Cap Momentum": ["SMCI", "AXON", "ASTS", "CELH", "APP",
                           "MELI", "BKNG", "MNST", "DECK", "MOD"],
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _ssl_patch():
    import ssl
    ssl._create_default_https_context = ssl._create_unverified_context  # noqa: S501


def _batch_download(symbols: List[str], start: str, end: str) -> Dict[str, pd.DataFrame]:
    """
    Download OHLCV for multiple symbols in a single yfinance call.
    Returns {symbol: DataFrame} — missing symbols are absent.
    """
    import yfinance as yf

    if not symbols:
        return {}

    raw = yf.download(
        symbols,
        start=start,
        end=end,
        progress=False,
        auto_adjust=True,
        group_by="ticker",
    )

    if raw.empty:
        return {}

    result: Dict[str, pd.DataFrame] = {}

    if isinstance(raw.columns, pd.MultiIndex):
        for sym in symbols:
            try:
                df = raw[sym].dropna(subset=["Close"])
                if not df.empty:
                    result[sym] = df
            except (KeyError, TypeError):
                pass
    else:
        # Single symbol — yfinance returns flat columns
        df = raw.dropna(subset=["Close"])
        if not df.empty and len(symbols) == 1:
            result[symbols[0]] = df

    return result


def _df_to_lists(df: pd.DataFrame) -> dict:
    return {
        "dates":   [d.strftime("%Y-%m-%d") for d in df.index],
        "closes":  df["Close"].tolist(),
        "highs":   df["High"].tolist(),
        "lows":    df["Low"].tolist(),
        "volumes": df["Volume"].tolist(),
    }


# ── Pydantic models ────────────────────────────────────────────────────────────

class RankRequest(BaseModel):
    tickers:     List[str]
    weights:     Optional[Dict[str, float]] = None
    period_days: int  = 252
    quick:       bool = False   # True → skip info calls (faster, earnings/quality → neutral)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/score/{ticker}")
def alpha_score(
    ticker:      str,
    period_days: int = Query(252, ge=60, le=365),
):
    """Full 7-factor Alpha Score for a single ticker with complete breakdown."""
    _ssl_patch()
    import yfinance as yf

    sym = ticker.upper()
    end   = datetime.today()
    start = end - timedelta(days=period_days + 60)

    try:
        # Determine sector ETF before bulk download
        stock  = yf.Ticker(sym)
        info   = stock.info or {}
        sector = info.get("sector", "")
        etf    = SECTOR_ETFS.get(sector, "")

        fetch_syms = list(dict.fromkeys([sym, "SPY"] + ([etf] if etf else [])))
        dfs = _batch_download(fetch_syms, start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"))

        if sym not in dfs or len(dfs[sym]) < 25:
            raise HTTPException(404, f"Insufficient data for {sym}")

        td            = _df_to_lists(dfs[sym])
        spy_closes    = dfs["SPY"]["Close"].tolist() if "SPY" in dfs else []
        sector_closes = dfs[etf]["Close"].tolist()   if etf in dfs else None

        result = compute_alpha_score(
            sym,
            td["dates"], td["highs"], td["lows"], td["closes"], td["volumes"],
            spy_closes, sector_closes, sector, info,
        )

        result["spot"]       = round(float(td["closes"][-1]), 2)
        result["from_date"]  = td["dates"][0]
        result["to_date"]    = td["dates"][-1]
        result["sector"]     = sector
        result["sector_etf"] = etf

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Alpha score error for {sym}: {e}")
        raise HTTPException(500, f"Alpha Engine error: {e}")


@router.post("/rank")
def rank_tickers(req: RankRequest):
    """
    Score and rank up to 50 tickers by Alpha Score.
    quick=True skips fundamental info calls (faster but earnings/quality = neutral).
    """
    _ssl_patch()
    import yfinance as yf

    symbols = [t.strip().upper() for t in req.tickers if t.strip()][:50]
    if not symbols:
        raise HTTPException(400, "Provide at least one ticker")

    weights = {**DEFAULT_WEIGHTS, **(req.weights or {})}
    period  = max(req.period_days, 90)
    end     = datetime.today()
    start   = end - timedelta(days=period + 60)
    s_str   = start.strftime("%Y-%m-%d")
    e_str   = end.strftime("%Y-%m-%d")

    try:
        # One bulk download for all symbols + SPY + all sector ETFs
        all_etfs   = list(SECTOR_ETFS.values())
        fetch_syms = list(dict.fromkeys(symbols + ["SPY"] + all_etfs))
        dfs        = _batch_download(fetch_syms, s_str, e_str)

        spy_closes = dfs["SPY"]["Close"].tolist() if "SPY" in dfs else []

        # Fetch fundamental info unless quick mode
        infos: Dict[str, dict] = {}
        if not req.quick:
            for sym in symbols:
                try:
                    infos[sym] = yf.Ticker(sym).info or {}
                except Exception:
                    infos[sym] = {}

        results = []
        for sym in symbols:
            if sym not in dfs or len(dfs[sym]) < 25:
                results.append({
                    "ticker": sym, "score": 0.0, "grade": "N/A",
                    "label": "No data", "color": "#555",
                    "factor_scores": {}, "strengths": [], "weaknesses": [],
                    "sector": "", "spot": 0.0, "percentile": 0.0,
                })
                continue

            try:
                td     = _df_to_lists(dfs[sym])
                info   = infos.get(sym, {})
                sector = info.get("sector", "")
                etf    = SECTOR_ETFS.get(sector, "")
                sc     = dfs[etf]["Close"].tolist() if etf in dfs else None

                r = compute_alpha_score(
                    sym,
                    td["dates"], td["highs"], td["lows"], td["closes"], td["volumes"],
                    spy_closes, sc, sector, info, weights,
                )
                results.append({
                    "ticker":        sym,
                    "score":         r["score"],
                    "grade":         r["grade"],
                    "label":         r["label"],
                    "color":         r["color"],
                    "factor_scores": r["factor_scores"],
                    "strengths":     r["strengths"],
                    "weaknesses":    r["weaknesses"],
                    "sector":        sector,
                    "spot":          round(float(td["closes"][-1]), 2),
                    "percentile":    0.0,    # filled below
                    # Compact detail for table
                    "momentum_detail":  r["momentum"],
                    "rs_detail":        r["relative_strength"],
                    "vol_detail":       r["volatility"],
                })
            except Exception as e:
                logger.warning(f"Alpha rank error for {sym}: {e}")
                results.append({
                    "ticker": sym, "score": 0.0, "grade": "N/A",
                    "label": f"Error: {e}", "color": "#555",
                    "factor_scores": {}, "strengths": [], "weaknesses": [],
                    "sector": "", "spot": 0.0, "percentile": 0.0,
                })

        # Sort + assign cross-sectional percentile rank
        results.sort(key=lambda x: x["score"], reverse=True)
        valid_scores = [r["score"] for r in results if r["score"] > 0]
        for r in results:
            if r["score"] > 0 and valid_scores:
                r["percentile"] = round(
                    sum(s < r["score"] for s in valid_scores) / len(valid_scores) * 100, 1
                )

        avg = sum(r["score"] for r in results) / max(len(results), 1)

        return {
            "results":       results,
            "universe_size": len(results),
            "avg_score":     round(avg, 1),
            "weights":       weights,
            "factor_meta":   FACTOR_META,
            "quick_mode":    req.quick,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Rank endpoint error: {e}")
        raise HTTPException(500, f"Ranking failed: {e}")


@router.get("/universes")
def list_universes():
    """Return predefined ticker universes."""
    return {
        name: {"tickers": tickers, "count": len(tickers)}
        for name, tickers in UNIVERSES.items()
    }


@router.get("/meta")
def factor_meta():
    """Return factor metadata and default weights."""
    return {"factors": FACTOR_META, "default_weights": DEFAULT_WEIGHTS}
