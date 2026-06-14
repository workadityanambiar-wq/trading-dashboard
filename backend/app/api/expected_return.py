"""
Expected Return Engine.

POST /api/expected-return/compute
  body: { tickers?, universe?, top_n? }
  Returns per-stock expected return decomposed into factor contributions.

Methodology:
  E[R_i] = Base + Σ (z_i_f * premium_f * scale)
  Base    = 9% (risk-free ~5% + equity risk premium ~4%)
  z_i_f   = factor z-score, clipped to [-3, 3]
  premium_f = long-run annualised factor return premium (from academic / AQR research)
  scale   = 0.5 so z=2 delivers the full factor premium
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, Query

from app.core.data import cache, fetcher
from app.core.factors.technical import compute_all_signals
from app.api.technical import _resolve_tickers, _fetch_ohlcv, _build_sector_etf_mapping

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Factor premia (annualised %, per unit of z-score, clipped at ±3) ──────────

FACTOR_SPECS: dict[str, dict] = {
    "momentum": {
        "z_cols":  ["momentum_12_1_z", "momentum_6_1_z"],
        "weights": [0.6, 0.4],
        "premium": 8.0,
        "label":   "Momentum",
        "description": "Price momentum — 12-month minus 1-month (Jegadeesh-Titman)",
    },
    "value": {
        "z_cols":  ["value_z"],
        "weights": [1.0],
        "premium": 4.0,
        "label":   "Value",
        "description": "Valuation — P/B, P/E, P/S relative to peers",
    },
    "quality": {
        "z_cols":  ["quality_z", "profitability_z"],
        "weights": [0.6, 0.4],
        "premium": 3.5,
        "label":   "Quality",
        "description": "Profitability, leverage, earnings quality",
    },
    "macro": {
        "z_cols":  ["macro_regime_z"],
        "weights": [1.0],
        "premium": 2.0,
        "label":   "Macro",
        "description": "Regime alignment — how well stock fits current macro environment",
    },
    "sentiment": {
        "z_cols":  ["sentiment_z", "earnings_revisions_z"],
        "weights": [0.5, 0.5],
        "premium": 3.0,
        "label":   "Sentiment",
        "description": "Analyst revisions + short interest signal",
    },
    "low_vol": {
        "z_cols":  ["low_vol_z"],
        "weights": [1.0],
        "premium": 2.5,
        "label":   "Low Vol",
        "description": "Low volatility anomaly — low-beta stocks earn excess risk-adj returns",
    },
}

BASE_RETURN = 9.0   # market expected return (risk-free + ERP)
SCALE       = 0.5   # z=2 → full premium
MAX_Z       = 3.0   # cap extreme z-scores


def _compute_er(row: pd.Series) -> dict:
    """Compute expected return breakdown for one stock row."""
    components: dict[str, float] = {"base": BASE_RETURN}
    z_scores:   dict[str, float] = {}

    for fname, spec in FACTOR_SPECS.items():
        z_vals = []
        for col, w in zip(spec["z_cols"], spec["weights"]):
            v = row.get(col)
            try:
                fv = float(v)
                if not np.isnan(fv):
                    z_vals.append((fv, w))
            except (TypeError, ValueError):
                pass

        if z_vals:
            total_w = sum(w for _, w in z_vals)
            z = sum(zv * w for zv, w in z_vals) / total_w
            z = float(np.clip(z, -MAX_Z, MAX_Z))
        else:
            z = 0.0

        contribution = round(z * spec["premium"] * SCALE, 2)
        components[fname] = contribution
        z_scores[fname]   = round(z, 3)

    total = round(sum(components.values()), 1)
    return {"components": components, "z_scores": z_scores, "expected_return": total}


def _safe(v) -> float | None:
    try:
        f = float(v)
        return None if np.isnan(f) else round(f, 4)
    except Exception:
        return None


# ── Endpoint ───────────────────────────────────────────────────────────────────

@router.get("/compute")
async def compute_expected_returns(
    universe: str = Query("sp500"),
    top_n:    int = Query(200, ge=10, le=500),
):
    tickers = _resolve_tickers(universe, "", "")
    if not tickers:
        return {"results": [], "universe_size": 0, "as_of": datetime.today().strftime("%Y-%m-%d")}

    ohlcv  = await _fetch_ohlcv(tickers)
    prices = ohlcv.get("adj_close", pd.DataFrame())
    high   = ohlcv.get("high",   pd.DataFrame())
    low    = ohlcv.get("low",    pd.DataFrame())
    open_p = ohlcv.get("open",   pd.DataFrame())
    volume = ohlcv.get("volume", pd.DataFrame())

    if prices.empty or len(prices.columns) < 2:
        return {"results": [], "universe_size": len(tickers), "as_of": datetime.today().strftime("%Y-%m-%d")}

    sector_map = _build_sector_etf_mapping(tickers)
    signals_df = await asyncio.get_event_loop().run_in_executor(
        None, compute_all_signals,
        prices,
        high   if not high.empty   else None,
        low    if not low.empty    else None,
        open_p if not open_p.empty else None,
        volume if not volume.empty else None,
        sector_map or None,
    )
    signals_df = signals_df.drop(index="SPY", errors="ignore")

    # Price + 1d change
    last_px  = prices.iloc[-1].dropna()
    prev_px  = prices.dropna(how="all").iloc[-2] if len(prices.dropna(how="all")) >= 2 else pd.Series(dtype=float)

    # Universe metadata (sector, name)
    try:
        from app.core.data import universe as uni_module
        sp_df = uni_module.get_sp500()
        name_map   = dict(zip(sp_df["ticker"], sp_df.get("name", sp_df["ticker"])))
        sector_map2 = dict(zip(sp_df["ticker"], sp_df.get("sector", "")))
    except Exception:
        name_map    = {}
        sector_map2 = {}

    results = []
    for ticker in signals_df.index:
        if ticker == "SPY":
            continue
        row = signals_df.loc[ticker]
        er  = _compute_er(row)

        price   = _safe(last_px.get(ticker))
        prev    = prev_px.get(ticker)
        chg_1d  = _safe((last_px.get(ticker, np.nan) / float(prev) - 1) if prev and float(prev) > 0 else None)

        results.append({
            "ticker":          ticker,
            "name":            name_map.get(ticker, ticker),
            "sector":          sector_map2.get(ticker, row.get("sector", "")),
            "price":           price,
            "chg_1d":          chg_1d,
            "expected_return": er["expected_return"],
            "components":      er["components"],
            "z_scores":        er["z_scores"],
            # convenience raw signal for tooltip
            "momentum_score":  _safe(row.get("momentum_12_1_z")),
            "composite_score": _safe(row.get("composite")),
        })

    results.sort(key=lambda x: x["expected_return"], reverse=True)

    for i, r in enumerate(results):
        r["rank"] = i + 1

    return {
        "results":         results[:top_n],
        "universe_size":   len(tickers),
        "computed":        len(results),
        "factor_specs":    {k: {"label": v["label"], "premium": v["premium"], "description": v["description"]}
                            for k, v in FACTOR_SPECS.items()},
        "base_return":     BASE_RETURN,
        "as_of":           datetime.today().strftime("%Y-%m-%d"),
    }
