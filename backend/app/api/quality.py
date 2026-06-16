"""
Quality Factor Dashboard.

GET /api/quality/scan?universe=sp500&top_n=200

Per-stock quality breakdown:
  - ROIC            (Net Income / Invested Capital, computed from balance sheet)
  - ROE             (from fundamentals cache)
  - Gross Margin %  (from fundamentals cache)
  - Gross Margin Trend (quarterly expansion/contraction, fresh from yfinance)
  - Earnings Growth (from fundamentals cache)
  - FCF Growth      (Free Cash Flow YoY growth, fresh from yfinance)
  - Quality Score   (cross-sectional composite 0-100)
  - Momentum Score  (from FactorEngine, percentile rank 0-100)
  - Combined Score  (50% quality + 50% momentum)

"Quality + Momentum" flag: combined >= 70 AND quality >= 60 AND momentum >= 60

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
from app.core.factors.engine import FactorEngine

logger = logging.getLogger(__name__)
router = APIRouter()

_CACHE: dict = {}
_LOCK  = threading.Lock()
_TTL   = 86400  # 24h

_START_2Y = (datetime.today() - timedelta(days=730)).strftime("%Y-%m-%d")
_TODAY    = datetime.today().strftime("%Y-%m-%d")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe(v, digits: int = 2) -> float | None:
    try:
        f = float(v)
        return None if (np.isnan(f) or np.isinf(f)) else round(f, digits)
    except Exception:
        return None


def _pct_rank(s: pd.Series, invert: bool = False) -> pd.Series:
    valid = s.dropna()
    if valid.empty:
        return pd.Series(dtype=float, index=s.index)
    ranked = (-valid if invert else valid).rank(pct=True)
    return ranked.reindex(s.index)


# ── Per-ticker ROIC / FCF / GM Trend ─────────────────────────────────────────

def _fetch_extras(ticker: str) -> dict:
    """
    Fetch the three metrics not in the DuckDB fundamentals cache:
      - ROIC (Net Income / Invested Capital)
      - FCF growth (Free Cash Flow YoY%)
      - Gross Margin Trend (latest 2q avg - prior 2q avg, in pct points)
    """
    out: dict = {"roic": None, "fcf_ttm": None, "fcf_growth": None, "gm_trend": None}
    try:
        t = yf.Ticker(ticker)

        # ── FCF ──────────────────────────────────────────────────────────────
        try:
            cf = t.cashflow
            if cf is not None and not cf.empty:
                for lbl in ("Free Cash Flow", "FreeCashFlow"):
                    if lbl in cf.index:
                        fcf = cf.loc[lbl].dropna()
                        if len(fcf) >= 1:
                            out["fcf_ttm"] = _safe(fcf.iloc[0])
                        if len(fcf) >= 2:
                            c0, c1 = float(fcf.iloc[0]), float(fcf.iloc[1])
                            if c1 > 0 and not np.isnan(c0):
                                out["fcf_growth"] = round((c0 / c1 - 1) * 100, 1)
                        break
        except Exception:
            pass

        # ── ROIC ─────────────────────────────────────────────────────────────
        try:
            inc = t.income_stmt
            bs  = t.balance_sheet
            if inc is not None and not inc.empty and bs is not None and not bs.empty:
                net_income = None
                for lbl in ("Net Income", "Net Income Common Stockholders"):
                    if lbl in inc.index:
                        vals = inc.loc[lbl].dropna()
                        if len(vals):
                            net_income = float(vals.iloc[0])
                        break

                equity = None
                for lbl in ("Stockholders Equity", "Total Stockholder Equity",
                            "Common Stock Equity", "Total Equity Gross Minority Interest"):
                    if lbl in bs.index:
                        vals = bs.loc[lbl].dropna()
                        if len(vals):
                            equity = float(vals.iloc[0])
                        break

                debt = 0.0
                for lbl in ("Long Term Debt", "Long Term Debt And Capital Lease Obligation"):
                    if lbl in bs.index:
                        vals = bs.loc[lbl].dropna()
                        if len(vals):
                            debt = float(vals.iloc[0])
                        break

                cash = 0.0
                for lbl in ("Cash And Cash Equivalents", "Cash Cash Equivalents And Short Term Investments",
                            "Cash And Short Term Investments"):
                    if lbl in bs.index:
                        vals = bs.loc[lbl].dropna()
                        if len(vals):
                            cash = float(vals.iloc[0])
                        break

                if net_income is not None and equity is not None:
                    invested = (equity or 0) + (debt or 0) - (cash or 0)
                    if invested > 1e6:
                        out["roic"] = round(net_income / invested * 100, 1)
        except Exception:
            pass

        # ── Gross Margin Trend ────────────────────────────────────────────────
        try:
            qinc = t.quarterly_income_stmt
            if qinc is not None and not qinc.empty:
                for rev_lbl in ("Total Revenue", "Revenue"):
                    if rev_lbl not in qinc.index:
                        continue
                    for gp_lbl in ("Gross Profit",):
                        if gp_lbl not in qinc.index:
                            continue
                        rev = qinc.loc[rev_lbl].dropna()
                        gp  = qinc.loc[gp_lbl].dropna()
                        idx = rev.index.intersection(gp.index)
                        if len(idx) >= 4:
                            gm = (gp[idx] / rev[idx]).sort_index(ascending=False)
                            out["gm_trend"] = round(
                                (gm.iloc[:2].mean() - gm.iloc[2:4].mean()) * 100, 2
                            )
                        break
                    break
        except Exception:
            pass

    except Exception as exc:
        logger.debug("quality extras %s: %s", ticker, exc)

    return out


def _run_extras_batch(tickers: list[str]) -> dict[str, dict]:
    results: dict[str, dict] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        fmap = {pool.submit(_fetch_extras, t): t for t in tickers}
        for fut in concurrent.futures.as_completed(fmap):
            tk = fmap[fut]
            try:
                results[tk] = fut.result()
            except Exception:
                results[tk] = {"roic": None, "fcf_ttm": None, "fcf_growth": None, "gm_trend": None}
    return results


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("/scan")
async def quality_scan(
    universe: str = Query("sp500"),
    top_n:    int = Query(200, ge=20, le=500),
):
    tickers = _resolve_tickers(universe, "", "")[:top_n]
    if not tickers:
        return {"results": [], "universe_size": 0, "computed": 0}

    cache_key = (tuple(sorted(tickers)), "quality_v1")
    now_ts    = time.time()
    with _LOCK:
        if cache_key in _CACHE:
            ts, payload = _CACHE[cache_key]
            if now_ts - ts < _TTL:
                return payload

    # ── 1. Fundamentals cache ─────────────────────────────────────────────────
    try:
        fund_df = cache.get_fundamentals(tickers)
    except Exception:
        fund_df = pd.DataFrame(index=tickers)

    if fund_df is None or fund_df.empty:
        fund_df = pd.DataFrame(index=tickers)
    fund_df.index = fund_df.index.astype(str)

    # ── 2. Price-based momentum (FactorEngine) ────────────────────────────────
    try:
        start_5y = (datetime.today() - timedelta(days=5*365)).strftime("%Y-%m-%d")
        fetcher.ensure_prices(tickers, _START_2Y, _TODAY)
        prices_df = cache.get_adj_close(tickers, _START_2Y, _TODAY)
        fund_cache = cache.get_fundamentals(tickers)
        vol_df     = cache.get_volume(tickers, _START_2Y, _TODAY)
        engine     = FactorEngine(prices_df, fund_cache if (fund_cache is not None and not fund_cache.empty) else None, vol_df if (vol_df is not None and not vol_df.empty) else None)
        scores_df  = engine.latest_scores()
        mo_cols    = [c for c in ("momentum_12_1_z", "momentum_6_1_z") if c in scores_df.columns]
        mo_series  = scores_df[mo_cols].mean(axis=1) if mo_cols else pd.Series(dtype=float)
    except Exception as exc:
        logger.warning("quality: FactorEngine failed: %s", exc)
        scores_df = pd.DataFrame()
        mo_series = pd.Series(dtype=float)

    # ── 3. Fresh ROIC / FCF / GM trend per-ticker ─────────────────────────────
    loop   = asyncio.get_event_loop()
    extras = await loop.run_in_executor(None, _run_extras_batch, tickers)

    # ── 4. Metadata ───────────────────────────────────────────────────────────
    try:
        sp_df      = uni_module.get_sp500()
        name_map   = dict(zip(sp_df["ticker"], sp_df.get("name",   sp_df["ticker"])))
        sector_map = dict(zip(sp_df["ticker"], sp_df.get("sector", "")))
    except Exception:
        name_map = sector_map = {}

    # ── 5. Build rows ─────────────────────────────────────────────────────────
    rows = []
    for tk in tickers:
        fd  = fund_df.loc[tk] if tk in fund_df.index else pd.Series(dtype=float)
        ex  = extras.get(tk, {})

        roe = _safe(fd.get("return_on_equity")) if hasattr(fd, "get") else None
        if roe is not None:
            roe = round(roe * 100, 1)   # yfinance gives fraction

        gm = _safe(fd.get("gross_margins")) if hasattr(fd, "get") else None
        if gm is not None:
            gm = round(gm * 100, 1)

        op_margin = _safe(fd.get("operating_margins")) if hasattr(fd, "get") else None
        if op_margin is not None:
            op_margin = round(op_margin * 100, 1)

        roa = _safe(fd.get("return_on_assets")) if hasattr(fd, "get") else None
        if roa is not None:
            roa = round(roa * 100, 1)

        eg  = _safe(fd.get("earnings_growth")) if hasattr(fd, "get") else None
        if eg is not None:
            eg = round(eg * 100, 1)

        rows.append({
            "ticker":        tk,
            "name":          name_map.get(tk, tk),
            "sector":        sector_map.get(tk, ""),
            "roe":           roe,
            "roa":           roa,
            "gross_margin":  gm,
            "op_margin":     op_margin,
            "earnings_growth": eg,
            "roic":          ex.get("roic"),
            "fcf_ttm":       ex.get("fcf_ttm"),
            "fcf_growth":    ex.get("fcf_growth"),
            "gm_trend":      ex.get("gm_trend"),
        })

    if not rows:
        payload = {"results": [], "universe_size": len(tickers), "computed": 0, "as_of": _TODAY}
        with _LOCK:
            _CACHE[cache_key] = (now_ts, payload)
        return payload

    # ── 6. Cross-sectional scoring ────────────────────────────────────────────
    df = pd.DataFrame(rows).set_index("ticker")

    # Map of field → (weight, invert)
    QUALITY_WEIGHTS = {
        "roic":            (0.20, False),
        "roe":             (0.20, False),
        "gm_trend":        (0.20, False),
        "earnings_growth": (0.20, False),
        "fcf_growth":      (0.20, False),
    }

    score_parts = []
    for col, (w, inv) in QUALITY_WEIGHTS.items():
        s = df[col] if col in df.columns else pd.Series(dtype=float, index=df.index)
        ranked = _pct_rank(s, invert=inv)
        score_parts.append(ranked * w)

    total_weight = sum(w for w, _ in QUALITY_WEIGHTS.values())
    quality_raw = pd.concat(score_parts, axis=1).sum(axis=1, min_count=1)
    df["quality_score"] = (quality_raw / total_weight * 100).round(1)

    # Momentum percentile
    mo_pct = _pct_rank(mo_series.reindex(df.index)).fillna(0.5)
    df["momentum_pctile"] = (mo_pct * 100).round(1)

    # Combined score
    q_pct = df["quality_score"].fillna(50) / 100
    df["combined_score"] = (0.50 * q_pct + 0.50 * mo_pct * 1.0).round(3)
    df["combined_score"] = (df["combined_score"] * 100).round(1)

    # Quality + Momentum flag
    df["quality_momentum"] = (
        (df["combined_score"].fillna(0)  >= 70) &
        (df["quality_score"].fillna(0)   >= 60) &
        (df["momentum_pctile"].fillna(0) >= 60)
    )

    # Rank by quality_score
    df = df.sort_values("quality_score", ascending=False)
    df["rank"] = range(1, len(df) + 1)

    # Sector avg quality
    sector_quality = (
        df.groupby("sector")["quality_score"]
        .agg(avg_quality="mean", count="count")
        .reset_index()
        .sort_values("avg_quality", ascending=False)
    )
    sector_quality["avg_quality"] = sector_quality["avg_quality"].round(1)
    sector_rows = sector_quality.to_dict("records")

    # Clean NaN → None
    records = df.reset_index().to_dict("records")
    for r in records:
        for k, v in r.items():
            if isinstance(v, float) and np.isnan(v):
                r[k] = None
            elif isinstance(v, (np.bool_,)):
                r[k] = bool(v)

    payload = {
        "results":        records,
        "universe_size":  len(tickers),
        "computed":       len(records),
        "sector_quality": sector_rows,
        "as_of":          _TODAY,
    }
    with _LOCK:
        _CACHE[cache_key] = (now_ts, payload)
    return payload
