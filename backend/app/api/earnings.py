"""
GET /api/earnings/options-flow
  params: tickers (comma-separated, up to 40)
          earnings_dates (comma-separated YYYY-MM-DD matching tickers, optional)
  Returns per-ticker: ATM straddle expected move, IV, put/call volume ratio.
"""
from __future__ import annotations

import asyncio
import concurrent.futures
import logging
from datetime import date

import numpy as np
import yfinance as yf
from fastapi import APIRouter, Query

logger = logging.getLogger(__name__)
router = APIRouter()

_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=8)


def _fetch_one(ticker: str, earn_date_iso: str | None) -> dict:
    base: dict = {
        "ticker":               ticker,
        "expected_move_pct":    None,
        "expected_move_dollar": None,
        "atm_iv":               None,
        "put_call_vol_ratio":   None,
        "call_volume":          None,
        "put_volume":           None,
        "expiry_used":          None,
        "error":                None,
    }
    try:
        t    = yf.Ticker(ticker)
        exps = t.options
        if not exps:
            base["error"] = "no_options"
            return base

        # Current price from fast_info
        fi    = t.fast_info
        price = float(fi.get("last_price") or fi.get("lastPrice") or 0)
        if price <= 0:
            base["error"] = "no_price"
            return base

        # Choose expiry: nearest on/after earnings date, else shortest
        if earn_date_iso:
            earn_dt  = date.fromisoformat(earn_date_iso)
            exp_dates = [date.fromisoformat(e) for e in exps]
            after = [e for e in exp_dates if e >= earn_dt]
            target = min(after) if after else min(exp_dates, key=lambda x: abs((x - earn_dt).days))
        else:
            target = date.fromisoformat(exps[0])

        exp_str = target.isoformat()
        chain   = t.option_chain(exp_str)
        calls   = chain.calls
        puts    = chain.puts

        if calls.empty or puts.empty:
            base["error"] = "empty_chain"
            return base

        # ATM strike — closest to current price
        strikes  = calls["strike"].values
        atm_idx  = int(np.argmin(np.abs(strikes - price)))
        atm_s    = float(strikes[atm_idx])

        def _mid(df: "pd.DataFrame", strike: float) -> float | None:
            row = df[np.isclose(df["strike"], strike, atol=0.02)]
            if row.empty:
                return None
            ask  = float(row["ask"].values[0])   if "ask"   in row.columns else 0.0
            bid  = float(row["bid"].values[0])   if "bid"   in row.columns else 0.0
            last = float(row["lastPrice"].values[0])
            if ask > 0.01 and bid > 0.01:
                return (ask + bid) / 2
            return last if last > 0.01 else None

        def _iv(df: "pd.DataFrame", strike: float) -> float | None:
            row = df[np.isclose(df["strike"], strike, atol=0.02)]
            if row.empty or "impliedVolatility" not in row.columns:
                return None
            v = float(row["impliedVolatility"].values[0])
            return round(v * 100, 1) if v and not np.isnan(v) and v > 0 else None

        c_price = _mid(calls, atm_s)
        p_price = _mid(puts,  atm_s)
        if c_price and p_price:
            straddle = c_price + p_price
            base["expected_move_pct"]    = round(straddle / price * 100, 1)
            base["expected_move_dollar"] = round(straddle, 2)

        base["atm_iv"]     = _iv(calls, atm_s) or _iv(puts, atm_s)
        base["expiry_used"] = exp_str

        c_vol = int(calls["volume"].fillna(0).sum())
        p_vol = int(puts["volume"].fillna(0).sum())
        base["call_volume"] = c_vol
        base["put_volume"]  = p_vol
        if c_vol > 0:
            base["put_call_vol_ratio"] = round(p_vol / c_vol, 2)

    except Exception as e:
        base["error"] = str(e)[:80]
        logger.debug(f"Options flow error for {ticker}: {e}")

    return base


@router.get("/options-flow")
async def get_options_flow(
    tickers: str = Query(..., description="Comma-separated tickers (max 40)"),
    earnings_dates: str = Query("", description="Comma-separated YYYY-MM-DD matching each ticker"),
):
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()][:40]
    date_list   = [d.strip() for d in earnings_dates.split(",")]

    date_map = {t: (date_list[i] if i < len(date_list) and date_list[i] else None)
                for i, t in enumerate(ticker_list)}

    loop    = asyncio.get_event_loop()
    futures = [
        loop.run_in_executor(_EXECUTOR, _fetch_one, t, date_map.get(t))
        for t in ticker_list
    ]
    results = await asyncio.gather(*futures, return_exceptions=True)

    flow: dict = {}
    for r in results:
        if isinstance(r, dict):
            flow[r["ticker"]] = {k: v for k, v in r.items() if k != "ticker"}

    return {"options_flow": flow, "count": len(flow)}
