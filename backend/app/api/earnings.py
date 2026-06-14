"""
Earnings Intelligence API.

GET /api/earnings/options-flow
  Returns per-ticker: ATM straddle expected move, IV, put/call volume ratio.

GET /api/earnings/intelligence
  Returns per-ticker deep historical analysis:
  - Pre-earnings drift (5d, 10d avg leading into earnings)
  - Historical move (avg absolute move on earnings day, beat rate)
  - Post-earnings gap persistence (does the gap continue 5d / 10d?)
  - EPS revision trend (analysts revising up or down)
  - Full history of last 8 quarterly reactions
"""
from __future__ import annotations

import asyncio
import concurrent.futures
import logging
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, Query

from app.core.data import cache

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


# ── Earnings Intelligence ──────────────────────────────────────────────────────

_START_2Y = (datetime.today() - timedelta(days=730)).strftime("%Y-%m-%d")
_TODAY_STR = datetime.today().strftime("%Y-%m-%d")

_EMPTY_INTEL: dict = {
    "pre_drift_5d": None, "pre_drift_10d": None,
    "hist_avg_abs_move": None, "hist_avg_move": None,
    "beat_rate": None,
    "gap_persistence_5d": None, "gap_persistence_10d": None,
    "revisions_up_30d": 0, "revisions_down_30d": 0,
    "n_quarters": 0, "history": [],
}


def _ts_naive(ts) -> pd.Timestamp:
    t = pd.Timestamp(ts)
    return t.tz_localize(None) if t.tzinfo is not None else t


def _compute_intel(ticker: str, prices: pd.Series | None) -> dict:
    """
    Compute historical earnings analysis for one ticker:
      - Pre-earnings drift (avg return 5d and 10d leading into each past earnings date)
      - Earnings day reaction (gap: close after vs close before)
      - Beat / miss history from EPS Estimate vs Reported EPS
      - Post-earnings gap persistence (does the gap direction hold 5d / 10d after?)
      - EPS revision trend from yfinance eps_revisions
    """
    out = dict(_EMPTY_INTEL)
    try:
        t  = yf.Ticker(ticker)
        ed = t.earnings_dates
        if ed is None or ed.empty:
            return out

        now   = pd.Timestamp.now()
        past  = ed[ed.index.tz_localize(None) < now].head(8)  # newest 8 quarters

        if past.empty or prices is None or len(prices) < 22:
            return out

        price_idx = prices.index  # DatetimeIndex, naive

        pre5, pre10, day_rets = [], [], []
        post5_pairs, post10_pairs = [], []
        beat_ct, total_eps = 0, 0
        history = []

        for earn_ts, row in past.iterrows():
            earn_dt = _ts_naive(earn_ts).normalize()

            # Nearest trading day on or AFTER the earnings timestamp date
            after = price_idx[price_idx >= earn_dt]
            if len(after) == 0:
                continue
            loc = price_idx.get_loc(after[0])

            # Need at least 10 days before and 2 days after
            if loc < 10 or loc + 2 >= len(prices):
                continue

            p_earn  = float(prices.iloc[loc])      # close on / just after announcement
            p_after = float(prices.iloc[loc + 1])  # first full day after earnings
            p_5d_b  = float(prices.iloc[loc - 5])
            p_10d_b = float(prices.iloc[loc - 10])

            if p_earn <= 0 or p_5d_b <= 0 or p_10d_b <= 0:
                continue

            # Pre-earnings drift (return into earnings)
            pre5d  = (p_earn / p_5d_b  - 1) * 100
            pre10d = (p_earn / p_10d_b - 1) * 100
            pre5.append(pre5d)
            pre10.append(pre10d)

            # Earnings gap = close day-after vs close before announcement
            day_ret = (p_after / p_earn - 1) * 100
            day_rets.append(day_ret)

            # Post gap persistence
            post5d = post10d = None
            if loc + 6 < len(prices):
                post5d = (float(prices.iloc[loc + 6]) / p_after - 1) * 100
                post5_pairs.append((day_ret, post5d))
            if loc + 11 < len(prices):
                post10d = (float(prices.iloc[loc + 11]) / p_after - 1) * 100
                post10_pairs.append((day_ret, post10d))

            # Beat / miss
            beat = None
            try:
                eps_a = row.get("Reported EPS")
                eps_e = row.get("EPS Estimate")
                if pd.notna(eps_a) and pd.notna(eps_e):
                    beat = float(eps_a) > float(eps_e)
                    total_eps += 1
                    if beat:
                        beat_ct += 1
            except Exception:
                pass

            history.append({
                "date":     earn_dt.strftime("%Y-%m-%d"),
                "day_ret":  round(day_ret, 1),
                "pre_5d":   round(pre5d, 1),
                "post_5d":  round(post5d, 1) if post5d is not None else None,
                "post_10d": round(post10d, 1) if post10d is not None else None,
                "beat":     beat,
            })

        # Aggregate
        if day_rets:
            out["hist_avg_abs_move"] = round(float(np.mean([abs(r) for r in day_rets])), 1)
            out["hist_avg_move"]     = round(float(np.mean(day_rets)), 1)
            out["n_quarters"]        = len(day_rets)
        if pre5:
            out["pre_drift_5d"]  = round(float(np.mean(pre5)), 1)
        if pre10:
            out["pre_drift_10d"] = round(float(np.mean(pre10)), 1)
        if total_eps:
            out["beat_rate"] = round(beat_ct / total_eps, 2)
        if post5_pairs:
            same = sum(1 for g, p in post5_pairs if (g > 0) == (p > 0))
            out["gap_persistence_5d"] = round(same / len(post5_pairs) * 100)
        if post10_pairs:
            same = sum(1 for g, p in post10_pairs if (g > 0) == (p > 0))
            out["gap_persistence_10d"] = round(same / len(post10_pairs) * 100)

        out["history"] = history[:8]

        # EPS revisions
        try:
            eps_rev = t.eps_revisions
            if eps_rev is not None and not eps_rev.empty:
                col = eps_rev.columns[0]  # current quarter
                for idx_label in eps_rev.index:
                    label = str(idx_label).lower()
                    val   = eps_rev.loc[idx_label, col]
                    if pd.notna(val):
                        v = int(float(val))
                        if "up" in label and "30" in label:
                            out["revisions_up_30d"] = v
                        elif "down" in label and "30" in label:
                            out["revisions_down_30d"] = v
        except Exception:
            pass

    except Exception as exc:
        logger.debug("intelligence error %s: %s", ticker, exc)

    return out


def _run_intel_batch(ticker_list: list[str], prices_df: pd.DataFrame) -> dict:
    results: dict[str, dict] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        future_map = {}
        for t in ticker_list:
            px = prices_df[t] if (prices_df is not None and t in prices_df.columns) else None
            future_map[pool.submit(_compute_intel, t, px)] = t
        for fut in concurrent.futures.as_completed(future_map):
            tk = future_map[fut]
            try:
                results[tk] = fut.result()
            except Exception:
                results[tk] = dict(_EMPTY_INTEL)
    return results


@router.get("/intelligence")
async def earnings_intelligence(
    tickers:        str = Query(..., description="Comma-separated tickers (max 30)"),
    earnings_dates: str = Query(""),
):
    """
    Deep historical analysis for upcoming earnings stocks.
    Fetches yfinance earnings_dates + eps_revisions per ticker,
    combined with cached prices to compute all stats.
    """
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()][:30]
    if not ticker_list:
        return {"intelligence": {}}

    # Load prices from our cache (needed for drift / gap calculations)
    try:
        fetcher_start = (datetime.today() - timedelta(days=730)).strftime("%Y-%m-%d")
        from app.core.data import fetcher as _fetcher
        _fetcher.ensure_prices(ticker_list, fetcher_start, _TODAY_STR)
        prices_df = cache.get_adj_close(ticker_list, fetcher_start, _TODAY_STR)
    except Exception:
        prices_df = pd.DataFrame()

    loop         = asyncio.get_event_loop()
    intelligence = await loop.run_in_executor(
        None, _run_intel_batch, ticker_list, prices_df
    )
    return {"intelligence": intelligence}
