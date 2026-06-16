"""
Alpha Engine — composite scorer.
Combines all seven factors with configurable weights into a single 0-100 Alpha Score.
"""
from __future__ import annotations

import numpy as np
from typing import List, Optional, Dict, Any

from .factors import (
    factor_momentum,
    factor_relative_strength,
    factor_institutional,
    factor_earnings,
    factor_quality,
    factor_macro,
    factor_volatility,
)

# ── Configuration ──────────────────────────────────────────────────────────────

DEFAULT_WEIGHTS: Dict[str, float] = {
    "momentum":          0.25,
    "relative_strength": 0.20,
    "institutional":     0.15,
    "earnings":          0.10,
    "quality":           0.10,
    "macro":             0.10,
    "volatility":        0.10,
}

FACTOR_META: Dict[str, Dict] = {
    "momentum":          {"label": "Momentum",           "color": "#4c9fff", "icon": "TrendingUp"},
    "relative_strength": {"label": "Relative Strength",  "color": "#a78bfa", "icon": "BarChart2"},
    "institutional":     {"label": "Institutional Flow", "color": "#00d97e", "icon": "Eye"},
    "earnings":          {"label": "Earnings Revisions", "color": "#f5a623", "icon": "FileText"},
    "quality":           {"label": "Quality",            "color": "#f472b6", "icon": "Star"},
    "macro":             {"label": "Macro Tailwind",     "color": "#34d399", "icon": "Globe"},
    "volatility":        {"label": "Vol Regime",         "color": "#fb923c", "icon": "Activity"},
}

SECTOR_ETFS: Dict[str, str] = {
    "Technology":             "XLK",
    "Healthcare":             "XLV",
    "Financial Services":     "XLF",
    "Consumer Cyclical":      "XLY",
    "Consumer Defensive":     "XLP",
    "Energy":                 "XLE",
    "Basic Materials":        "XLB",
    "Utilities":              "XLU",
    "Real Estate":            "XLRE",
    "Industrials":            "XLI",
    "Communication Services": "XLC",
}


# ── Main entry point ───────────────────────────────────────────────────────────

def compute_alpha_score(
    ticker:        str,
    dates:         List[str],
    highs:         List[float],
    lows:          List[float],
    closes:        List[float],
    volumes:       List[float],
    spy_closes:    List[float],
    sector_closes: Optional[List[float]] = None,
    sector:        str = "",
    info:          Optional[Dict[str, Any]] = None,
    weights:       Optional[Dict[str, float]] = None,
) -> dict:
    w    = {**DEFAULT_WEIGHTS, **(weights or {})}
    info = info or {}

    c  = np.array(closes,     float)
    sc = np.array(spy_closes, float) if spy_closes else np.ones(len(closes))

    # ── Compute all seven factors ──────────────────────────────────────────────
    mom   = factor_momentum(c)
    rs    = factor_relative_strength(c, sc)
    inst  = factor_institutional(dates, highs, lows, closes, volumes)
    earn  = factor_earnings(info)
    qual  = factor_quality(info)
    macro = factor_macro(
        np.array(sector_closes, float) if sector_closes else None,
        sc, sector,
    )
    vol = factor_volatility(c)

    factor_scores: Dict[str, float] = {
        "momentum":          mom["score"],
        "relative_strength": rs["score"],
        "institutional":     inst["score"],
        "earnings":          earn["score"],
        "quality":           qual["score"],
        "macro":             macro["score"],
        "volatility":        vol["score"],
    }

    # ── Weighted composite ────────────────────────────────────────────────────
    total = float(np.clip(
        sum(factor_scores[k] * w.get(k, 0.0) for k in factor_scores), 0, 100
    ))

    # ── Grade ─────────────────────────────────────────────────────────────────
    if total >= 80:
        grade, color, label = "A", "#00d97e", "Exceptional Alpha"
    elif total >= 65:
        grade, color, label = "B", "#4c9fff", "Above Average"
    elif total >= 50:
        grade, color, label = "C", "#f5a623", "Neutral"
    elif total >= 35:
        grade, color, label = "D", "#e8743b", "Below Average"
    else:
        grade, color, label = "F", "#e84040", "Weak — Avoid"

    # ── Strengths / Weaknesses ────────────────────────────────────────────────
    ranked     = sorted(factor_scores.items(), key=lambda x: x[1], reverse=True)
    strengths  = [{"factor": k, "score": round(v, 1)} for k, v in ranked[:3] if v >= 62]
    weaknesses = [{"factor": k, "score": round(v, 1)} for k, v in ranked[-3:] if v < 42]

    return {
        "ticker":            ticker.upper(),
        "score":             round(total, 1),
        "grade":             grade,
        "color":             color,
        "label":             label,
        "weights":           w,
        "factor_meta":       FACTOR_META,
        "factor_scores":     {k: round(v, 1) for k, v in factor_scores.items()},
        "strengths":         strengths,
        "weaknesses":        weaknesses,
        # Full detail per factor
        "momentum":          mom,
        "relative_strength": rs,
        "institutional":     inst,
        "earnings":          earn,
        "quality":           qual,
        "macro":             macro,
        "volatility":        vol,
    }
