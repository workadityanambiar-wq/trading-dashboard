"""
Earnings Drift / PEAD Dashboard.

GET /api/earnings-drift/scan?universe=sp500&top_n=200

For each stock returns its most recent past earnings event with:
  - EPS Surprise %         (Reported EPS vs Estimate)
  - Revenue Growth YoY     (proxy for revenue strength)
  - Post-Earnings Drift    (5d / 21d / 63d / 126d / current, from cached prices)
  - Estimate Revisions     (analysts revising EPS up or down in last 30 days)
  - PEAD Score             (cross-sectional composite 0-100)

PEAD = Post-Earnings Announcement Drift: stocks with large positive surprises
tend to continue drifting higher for 3-6 months (one of finance's most robust anomalies).

Results cached 24 hours.
"""
from __future__ import annotations

import asyncio
import concurrent.futures
import logging
import threading
import time
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, Query

from app.core.data import cache, fetcher
from app.core.data import universe as uni_module
from app.api.technical import _resolve_tickers

logger = logging.getLogger(__name__)
router = APIRouter()

_CACHE: dict = {}
_LOCK  = threading.Lock()
_TTL   = 86400  # 24 hours


# ── Helpers ───────────────────────────────────────────────────────────────────

def _ts_naive(ts) -> pd.Timestamp:
    t = pd.Timestamp(ts)
    return t.tz_localize(None) if t.tzinfo is not None else t


def _safe(v, digits: int = 2):
    try:
        f = float(v)
        return None if (np.isnan(f) or np.isinf(f)) else round(f, digits)
    except Exception:
        return None


# ── Per-ticker fetch ──────────────────────────────────────────────────────────

def _fetch_one(ticker: str, prices: pd.Series | None) -> dict:
    """
    Fetch EPS surprise, revenue growth, revisions, and post-earnings drift
    for one ticker.  All yfinance calls happen inside this function so it can
    run safely inside a ThreadPoolExecutor.
    """
    out: dict = {
        "earn_date":        None,
        "days_since":       None,
        "eps_surprise_pct": None,
        "eps_actual":       None,
        "eps_estimate":     None,
        "rev_growth_yoy":   None,
        "revisions_up":     0,
        "revisions_down":   0,
        "drift_5d":         None,
        "drift_21d":        None,
        "drift_63d":        None,
        "drift_126d":       None,
        "drift_current":    None,
    }
    try:
        t  = yf.Ticker(ticker)
        ed = t.earnings_dates
        if ed is None or ed.empty:
            return out

        # ── Most recent PAST earnings ─────────────────────────────────────────
        now  = pd.Timestamp.now()
        idx_naive = pd.DatetimeIndex([_ts_naive(x) for x in ed.index])
        past_mask = idx_naive < now.normalize()
        if not past_mask.any():
            return out

        past     = ed[past_mask]
        latest   = past.iloc[0]
        earn_dt  = _ts_naive(past.index[0]).normalize()

        out["earn_date"]  = earn_dt.strftime("%Y-%m-%d")
        out["days_since"] = int((now.normalize() - earn_dt).days)

        # ── EPS surprise ──────────────────────────────────────────────────────
        try:
            surp = latest.get("Surprise(%)")
            if pd.notna(surp):
                out["eps_surprise_pct"] = round(float(surp), 1)
            else:
                eps_a = latest.get("Reported EPS")
                eps_e = latest.get("EPS Estimate")
                if pd.notna(eps_a) and pd.notna(eps_e) and float(eps_e) != 0:
                    out["eps_surprise_pct"] = round(
                        (float(eps_a) - float(eps_e)) / abs(float(eps_e)) * 100, 1
                    )
        except Exception:
            pass

        out["eps_actual"]   = _safe(latest.get("Reported EPS"))
        out["eps_estimate"] = _safe(latest.get("EPS Estimate"))

        # ── Revenue growth YoY ────────────────────────────────────────────────
        try:
            fin = t.quarterly_financials
            if fin is not None and not fin.empty:
                for label in ("Total Revenue", "Revenue"):
                    if label in fin.index:
                        rv = fin.loc[label].dropna()
                        if len(rv) >= 5:
                            r0 = float(rv.iloc[0])
                            r4 = float(rv.iloc[4])
                            if r4 > 0:
                                out["rev_growth_yoy"] = round((r0 / r4 - 1) * 100, 1)
                        break
        except Exception:
            pass

        # ── EPS revisions ─────────────────────────────────────────────────────
        try:
            eps_rev = t.eps_revisions
            if eps_rev is not None and not eps_rev.empty:
                col = eps_rev.columns[0]
                for lbl in eps_rev.index:
                    s = str(lbl).lower()
                    val = eps_rev.loc[lbl, col]
                    if pd.notna(val):
                        v = int(float(val))
                        if "up"   in s and "30" in s:
                            out["revisions_up"]   = v
                        elif "down" in s and "30" in s:
                            out["revisions_down"] = v
        except Exception:
            pass

        # ── Post-earnings drift ───────────────────────────────────────────────
        if prices is not None and len(prices) > 5:
            pidx   = prices.index
            after  = pidx[pidx >= earn_dt]
            if len(after) == 0:
                return out
            loc = pidx.get_loc(after[0])
            p0  = float(prices.iloc[loc])
            if p0 <= 0:
                return out

            for days, key in [
                (5,   "drift_5d"),
                (21,  "drift_21d"),
                (63,  "drift_63d"),
                (126, "drift_126d"),
            ]:
                if loc + days < len(prices):
                    out[key] = round((float(prices.iloc[loc + days]) / p0 - 1) * 100, 1)

            out["drift_current"] = round((float(prices.iloc[-1]) / p0 - 1) * 100, 1)

    except Exception as exc:
        logger.debug("drift fetch failed %s: %s", ticker, exc)

    return out


def _run_batch(tickers: list[str], prices_df: pd.DataFrame) -> dict[str, dict]:
    results: dict[str, dict] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        fmap = {}
        for t in tickers:
            px = prices_df[t] if (prices_df is not None and t in prices_df.columns) else None
            fmap[pool.submit(_fetch_one, t, px)] = t
        for fut in concurrent.futures.as_completed(fmap):
            tk = fmap[fut]
            try:
                results[tk] = fut.result()
            except Exception:
                results[tk] = {}
    return results


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("/scan")
async def earnings_drift_scan(
    universe: str = Query("sp500"),
    top_n:    int = Query(200, ge=20, le=500),
):
    tickers = _resolve_tickers(universe, "", "")[:top_n]
    if not tickers:
        return {"results": [], "universe_size": 0, "computed": 0}

    cache_key = (tuple(sorted(tickers)), "drift_v1")
    now_ts    = time.time()
    with _LOCK:
        if cache_key in _CACHE:
            ts, payload = _CACHE[cache_key]
            if now_ts - ts < _TTL:
                return payload

    # Prices for drift computation
    start_2y = (datetime.today() - timedelta(days=730)).strftime("%Y-%m-%d")
    today    = datetime.today().strftime("%Y-%m-%d")
    try:
        fetcher.ensure_prices(tickers, start_2y, today)
        prices_df = cache.get_adj_close(tickers, start_2y, today)
    except Exception:
        prices_df = pd.DataFrame()

    # Metadata
    try:
        sp_df      = uni_module.get_sp500()
        name_map   = dict(zip(sp_df["ticker"], sp_df.get("name",   sp_df["ticker"])))
        sector_map = dict(zip(sp_df["ticker"], sp_df.get("sector", "")))
    except Exception:
        name_map = sector_map = {}

    # Parallel fetch
    loop     = asyncio.get_event_loop()
    raw      = await loop.run_in_executor(None, _run_batch, tickers, prices_df)

    # Assemble results
    rows = []
    for ticker, d in raw.items():
        if not d.get("earn_date"):
            continue
        if (d.get("days_since") or 999) > 180:
            continue
        rows.append({
            "ticker":           ticker,
            "name":             name_map.get(ticker, ticker),
            "sector":           sector_map.get(ticker, ""),
            **{k: (None if (isinstance(v, float) and np.isnan(v)) else v)
               for k, v in d.items()},
        })

    # Cross-sectional PEAD score
    if rows:
        df = pd.DataFrame(rows)

        def pctile(col: str, invert: bool = False) -> pd.Series:
            s = df[col].fillna(0.0)
            return (-s if invert else s).rank(pct=True)

        net_rev = (df["revisions_up"].fillna(0) - df["revisions_down"].fillna(0))
        df["pead_score"] = (
            0.40 * pctile("eps_surprise_pct")
            + 0.30 * pctile("drift_current")
            + 0.20 * net_rev.rank(pct=True)
            + 0.10 * pctile("rev_growth_yoy")
        ) * 100
        df["pead_score"] = df["pead_score"].round(1)

        # Sweet-spot flag: recent (20-90d), surprise>5%, still drifting, revised up
        df["sweet_spot"] = (
            df["days_since"].between(20, 90) &
            (df["eps_surprise_pct"].fillna(0) >= 5) &
            (df["drift_current"].fillna(0) > 0) &
            (df["revisions_up"] > df["revisions_down"])
        )

        rows = df.to_dict("records")
        # Clean NaN→None for JSON
        for r in rows:
            for k, v in r.items():
                if isinstance(v, float) and np.isnan(v):
                    r[k] = None

        rows.sort(key=lambda x: (x.get("pead_score") or 0), reverse=True)
        for i, r in enumerate(rows):
            r["rank"] = i + 1

    payload = {
        "results":       rows,
        "universe_size": len(tickers),
        "computed":      len(rows),
        "as_of":         today,
    }
    with _LOCK:
        _CACHE[cache_key] = (now_ts, payload)

    return payload
