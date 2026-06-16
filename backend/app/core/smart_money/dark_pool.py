"""
Dark pool activity estimation via heuristics.

Real FINRA ATS / dark pool data requires paid feeds. We replicate the
three strongest observable signatures of stealth institutional flow:

  1. Volume-Price-Impact  — high volume + low price movement
  2. Volume Consistency   — sustained 1.1–3× avg volume (not retail spikes)
  3. Large-Print Ratio    — high volume + narrow intraday range (absorbing supply)
"""
from __future__ import annotations
import numpy as np
from typing import List


def _vol_price_impact(volumes: np.ndarray, closes: np.ndarray, window: int = 20) -> float:
    n = min(window, len(volumes))
    v = volumes[-n:]
    c = closes[-n:]
    avg_v = v.mean()
    if len(c) < 2 or avg_v == 0:
        return 0.0
    px_chg = np.abs(np.diff(c) / np.where(c[:-1] > 0, c[:-1], 1)) * 100
    scores = []
    for i in range(1, len(v)):
        vr = v[i] / avg_v
        px = px_chg[i - 1] if i - 1 < len(px_chg) else 1.0
        if vr > 1.2 and px < 0.8:
            scores.append(min(vr / 3.0, 1.0))
    return float(np.mean(scores)) if scores else 0.0


def _vol_consistency(volumes: np.ndarray, window: int = 15) -> float:
    n   = min(window, len(volumes))
    v   = volumes[-n:]
    avg = volumes.mean()
    if avg == 0:
        return 0.0
    stealth = np.sum((v > avg * 1.1) & (v < avg * 3.0))
    return float(stealth / n)


def _large_print_ratio(
    volumes: np.ndarray, highs: np.ndarray, lows: np.ndarray, window: int = 20
) -> float:
    n = min(window, len(volumes))
    v = volumes[-n:]
    h = highs[-n:]
    l = lows[-n:]
    avg_v = v.mean()
    if avg_v == 0:
        return 0.0
    ranges  = (h - l) / np.where(l > 0, l, 1) * 100
    avg_r   = ranges.mean()
    if avg_r == 0:
        return 0.0
    scores = []
    for i in range(n):
        vol_excess  = max((v[i] / avg_v) - 1.0, 0.0)
        range_tight = max(1.0 - ranges[i] / avg_r, 0.0)
        scores.append(vol_excess * range_tight)
    return float(np.clip(np.mean(scores), 0.0, 1.0))


def estimate_dark_pool_score(
    volumes: List[float],
    closes:  List[float],
    highs:   List[float],
    lows:    List[float],
) -> dict:
    v = np.array(volumes, float)
    c = np.array(closes,  float)
    h = np.array(highs,   float)
    l = np.array(lows,    float)

    vpi     = _vol_price_impact(v, c)
    consist = _vol_consistency(v)
    lpr     = _large_print_ratio(v, h, l)

    score = float(np.clip((vpi * 0.40 + consist * 0.35 + lpr * 0.25) * 100, 0, 100))

    signal = (
        "Strong Dark Pool Accumulation"   if score >= 70 else
        "Moderate Institutional Activity" if score >= 45 else
        "Light Institutional Presence"    if score >= 20 else
        "Retail-Dominated Flow"
    )

    return {
        "score":             round(score, 1),
        "signal":            signal,
        "vol_price_impact":  round(vpi * 100, 1),
        "vol_consistency":   round(consist * 100, 1),
        "large_print_ratio": round(lpr * 100, 1),
    }
