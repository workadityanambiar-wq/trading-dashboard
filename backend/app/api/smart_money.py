"""
Smart Money Flow API — Institutional Accumulation Score.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query

from app.core.smart_money.scorer import compute_accumulation_score

router = APIRouter()
logger = logging.getLogger(__name__)


def _fetch_ohlcv(ticker: str, period_days: int) -> dict:
    """Download OHLCV from yfinance; return dict of lists."""
    import ssl
    ssl._create_default_https_context = ssl._create_unverified_context  # noqa: S501
    import yfinance as yf
    import pandas as pd

    end   = datetime.today()
    start = end - timedelta(days=period_days + 35)      # buffer for indicator warmup

    df = yf.download(
        ticker.upper(),
        start=start.strftime("%Y-%m-%d"),
        end=end.strftime("%Y-%m-%d"),
        progress=False,
        auto_adjust=True,
    )

    if df is None or len(df) < 25:
        raise HTTPException(404, f"Insufficient OHLCV data for {ticker}")

    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    return {
        "dates":   [d.strftime("%Y-%m-%d") for d in df.index],
        "opens":   df["Open"].tolist(),
        "highs":   df["High"].tolist(),
        "lows":    df["Low"].tolist(),
        "closes":  df["Close"].tolist(),
        "volumes": df["Volume"].tolist(),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/flow/{ticker}")
def smart_money_flow(
    ticker:      str,
    period_days: int = Query(60, ge=20, le=365),
):
    """
    Full Institutional Accumulation Score for a single ticker.
    Returns OBV, CMF, VWAP, Dark Pool, and Block Trade breakdowns.
    """
    try:
        ohlcv  = _fetch_ohlcv(ticker, period_days)
        result = compute_accumulation_score(
            ohlcv["dates"],
            ohlcv["highs"],
            ohlcv["lows"],
            ohlcv["closes"],
            ohlcv["volumes"],
            ticker,
        )
        result["period_days"] = len(ohlcv["dates"])
        result["from_date"]   = ohlcv["dates"][0]  if ohlcv["dates"] else ""
        result["to_date"]     = ohlcv["dates"][-1] if ohlcv["dates"] else ""

        import ssl
        ssl._create_default_https_context = ssl._create_unverified_context  # noqa: S501
        import yfinance as yf
        info = yf.Ticker(ticker.upper()).fast_info
        last = ohlcv["closes"][-1]
        result["spot"] = round(float(getattr(info, "last_price", last) or last), 2)

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Smart money error for {ticker}: {e}")
        raise HTTPException(500, f"Failed to compute smart money flow: {e}")


@router.get("/compare")
def compare_tickers(
    tickers:     str = Query(..., description="Comma-separated tickers, e.g. AAPL,MSFT,NVDA"),
    period_days: int = Query(60, ge=20, le=120),
):
    """
    Rank multiple tickers by their Institutional Accumulation Score.
    Returns a leaderboard sorted highest to lowest.
    """
    symbols = [t.strip().upper() for t in tickers.split(",") if t.strip()][:10]

    results = []
    for sym in symbols:
        try:
            ohlcv = _fetch_ohlcv(sym, period_days)
            r = compute_accumulation_score(
                ohlcv["dates"],
                ohlcv["highs"],
                ohlcv["lows"],
                ohlcv["closes"],
                ohlcv["volumes"],
                sym,
            )
            results.append({
                "ticker":     sym,
                "score":      r["score"],
                "grade":      r["grade"],
                "label":      r["label"],
                "color":      r["color"],
                "components": r["components"],
                "signals":    r["signals"][:2],
            })
        except Exception as e:
            logger.warning(f"Compare error for {sym}: {e}")
            results.append({
                "ticker": sym, "score": 0, "grade": "N/A",
                "label": "Error fetching data", "color": "#555",
                "components": {}, "signals": [],
            })

    results.sort(key=lambda x: x["score"], reverse=True)
    return {"results": results}
