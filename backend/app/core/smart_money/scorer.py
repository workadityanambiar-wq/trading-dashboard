"""
Institutional Accumulation Score — composite 0-100.

Weights
-------
OBV           25 %   trend confirmation vs price
CMF           25 %   money-flow pressure
VWAP distance 20 %   institutional reference price premium
Dark pool     15 %   stealth accumulation heuristics
Block trades  15 %   large-print buying evidence
"""
from __future__ import annotations
import numpy as np
from typing import List

from .indicators   import compute_obv, compute_cmf, compute_vwap, linear_slope
from .dark_pool    import estimate_dark_pool_score
from .block_trades import block_trade_score, detect_block_days

WEIGHTS = {
    "obv":          0.25,
    "cmf":          0.25,
    "vwap":         0.20,
    "dark_pool":    0.15,
    "block_trades": 0.15,
}

COMPONENT_LABELS = {
    "obv":          "OBV Trend",
    "cmf":          "Chaikin MF",
    "vwap":         "VWAP Distance",
    "dark_pool":    "Dark Pool",
    "block_trades": "Block Trades",
}


# ── Component scorers ──────────────────────────────────────────────────────────

def _obv_component(closes: np.ndarray, volumes: np.ndarray, window: int = 20) -> dict:
    obv      = compute_obv(closes, volumes)
    obv_std  = np.std(obv[-window:]) + 1e-10
    px_std   = np.std(closes[-window:]) + 1e-10
    obv_norm = linear_slope(obv, window) / obv_std
    px_norm  = linear_slope(closes, window) / px_std
    div      = float(obv_norm - px_norm)

    # Map divergence [-3, +3] → [0, 100]; positive OBV norm gives a 10% bonus
    raw = float(np.clip((div + 3) / 6, 0, 1)) * 100
    if obv_norm > 0:
        raw = min(raw * 1.1, 100)

    trend = (
        "Strong Accumulation" if raw >= 70 else
        "Mild Accumulation"   if raw >= 55 else
        "Neutral"             if raw >= 40 else
        "Mild Distribution"   if raw >= 25 else
        "Strong Distribution"
    )

    return {
        "score":       round(raw, 1),
        "trend":       trend,
        "divergence":  round(div, 3),
        "latest_obv":  round(float(obv[-1]), 0),
        "series":      [round(float(x), 0) for x in obv[-60:]],
    }


def _cmf_component(
    highs: np.ndarray, lows: np.ndarray,
    closes: np.ndarray, volumes: np.ndarray,
    period: int = 20,
) -> dict:
    cmf_arr = compute_cmf(highs, lows, closes, volumes, period)
    valid   = cmf_arr[~np.isnan(cmf_arr)]
    latest  = float(valid[-1]) if len(valid) > 0 else 0.0

    raw = float(np.clip((latest + 1) / 2, 0, 1)) * 100

    signal = (
        "Strong Buying Pressure"  if latest >  0.20 else
        "Moderate Buying"         if latest >  0.05 else
        "Neutral"                 if latest > -0.05 else
        "Moderate Selling"        if latest > -0.20 else
        "Strong Selling Pressure"
    )

    return {
        "score":  round(raw, 1),
        "cmf":    round(latest, 4),
        "signal": signal,
        "series": [
            round(float(x), 4) if not np.isnan(x) else 0.0
            for x in cmf_arr[-60:]
        ],
    }


def _vwap_component(
    highs: np.ndarray, lows: np.ndarray,
    closes: np.ndarray, volumes: np.ndarray,
) -> dict:
    vwap_arr = compute_vwap(highs, lows, closes, volumes)
    px       = float(closes[-1])
    vwap     = float(vwap_arr[-1])
    pct      = (px - vwap) / max(vwap, 1e-10) * 100

    if pct >= 0:
        raw = min(50.0 + pct * 10, 95.0)
        if pct > 5:
            raw = max(raw - (pct - 5) * 5, 50.0)   # penalise over-extension
    else:
        raw = max(50.0 + pct * 8, 5.0)

    position = (
        "Well Above VWAP" if pct >  3   else
        "Above VWAP"      if pct >  0.5 else
        "Near VWAP"       if abs(pct) <= 0.5 else
        "Below VWAP"      if pct > -3   else
        "Well Below VWAP"
    )

    return {
        "score":    round(float(np.clip(raw, 0, 100)), 1),
        "vwap":     round(vwap, 2),
        "price":    round(px, 2),
        "pct_diff": round(pct, 2),
        "position": position,
    }


# ── Main entry point ───────────────────────────────────────────────────────────

def compute_accumulation_score(
    dates:   List[str],
    highs:   List[float],
    lows:    List[float],
    closes:  List[float],
    volumes: List[float],
    ticker:  str = "",
) -> dict:
    """Return the full Institutional Accumulation analysis dict."""
    if len(closes) < 25:
        return {"error": "Need at least 25 bars of OHLCV data"}

    h = np.array(highs,   float)
    l = np.array(lows,    float)
    c = np.array(closes,  float)
    v = np.array(volumes, float)

    obv_res  = _obv_component(c, v)
    cmf_res  = _cmf_component(h, l, c, v)
    vwap_res = _vwap_component(h, l, c, v)
    dp_res   = estimate_dark_pool_score(list(v), list(c), list(h), list(l))
    bt_raw   = block_trade_score(list(v), list(c), list(h), list(l))
    blocks   = detect_block_days(dates, list(v), list(c), list(h), list(l))

    comps = {
        "obv":          obv_res["score"],
        "cmf":          cmf_res["score"],
        "vwap":         vwap_res["score"],
        "dark_pool":    dp_res["score"],
        "block_trades": bt_raw["score"],
    }

    total = float(np.clip(sum(comps[k] * WEIGHTS[k] for k in WEIGHTS), 0, 100))

    if total >= 80:
        grade, color, label = "A", "#00d97e", "Strong Institutional Accumulation"
    elif total >= 65:
        grade, color, label = "B", "#26c96f", "Moderate Accumulation"
    elif total >= 50:
        grade, color, label = "C", "#f5a623", "Neutral / Mixed Signals"
    elif total >= 35:
        grade, color, label = "D", "#e8743b", "Mild Distribution"
    else:
        grade, color, label = "F", "#e84040", "Strong Distribution"

    # Key narrative signals
    signals = []
    if obv_res["score"] >= 70:
        signals.append({"type": "bullish", "text": f"OBV leading price higher — {obv_res['trend'].lower()}"})
    elif obv_res["score"] <= 30:
        signals.append({"type": "bearish", "text": "OBV diverging lower — distribution in progress"})

    if cmf_res["cmf"] > 0.15:
        signals.append({"type": "bullish", "text": f"Chaikin MF {cmf_res['cmf']:+.3f}: persistent buying pressure"})
    elif cmf_res["cmf"] < -0.15:
        signals.append({"type": "bearish", "text": f"Chaikin MF {cmf_res['cmf']:+.3f}: distribution pressure"})
    else:
        signals.append({"type": "neutral", "text": f"CMF {cmf_res['cmf']:+.3f}: balanced money flow"})

    p = vwap_res["pct_diff"]
    if abs(p) < 1.0:
        signals.append({"type": "neutral",  "text": f"Price hugging VWAP ({p:+.2f}%) — institutions active near fair value"})
    elif p > 0:
        signals.append({"type": "bullish",  "text": f"Price {p:+.2f}% above VWAP — bulls controlling tape"})
    else:
        signals.append({"type": "bearish",  "text": f"Price {p:+.2f}% below VWAP — sellers have advantage"})

    if dp_res["score"] >= 60:
        signals.append({"type": "bullish", "text": f"Dark pool score {dp_res['score']:.0f}/100 — stealth institutional accumulation"})
    elif dp_res["score"] <= 25:
        signals.append({"type": "bearish", "text": "Low dark pool score — retail-dominated, institutional absent"})

    bd = bt_raw.get("block_days", 0)
    br = bt_raw.get("buy_ratio", 0.5)
    if bd > 0:
        if br >= 0.6:
            signals.append({"type": "bullish", "text": f"{bt_raw.get('buy_blocks', 0)} block-buy days — institutional demand detected"})
        elif br <= 0.4:
            signals.append({"type": "bearish", "text": f"{bt_raw.get('sell_blocks', 0)} block-sell days — institutional supply overhead"})
        else:
            signals.append({"type": "neutral", "text": f"{bd} block-trade days — mixed institutional intent"})

    return {
        "ticker":       ticker.upper(),
        "score":        round(total, 1),
        "grade":        grade,
        "color":        color,
        "label":        label,
        "weights":      WEIGHTS,
        "component_labels": COMPONENT_LABELS,
        "components":   {k: round(v2, 1) for k, v2 in comps.items()},
        "signals":      signals[:6],
        "obv":          obv_res,
        "cmf":          cmf_res,
        "vwap":         vwap_res,
        "dark_pool":    dp_res,
        "block_trades": {**bt_raw, "recent_blocks": blocks[:5]},
        "price_series": [round(float(x), 2) for x in c[-60:]],
        "date_series":  dates[-60:] if dates else [],
    }
