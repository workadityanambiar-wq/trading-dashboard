"""
Model-based estimates for CTA trend-following exposure and vol-control fund allocation.
Neither is observable directly; both are commonly used market estimates.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def estimate_cta(prices: pd.Series) -> dict:
    """
    Estimate CTA/systematic trend-follower equity exposure.
    Multi-timescale momentum (1m/3m/6m/12m) vol-adjusted signals, weighted by
    typical CTA lookback allocations.

    Returns exposure_pct in [-100, +100] where:
      +100 = fully long (strong uptrend)
       0   = flat / neutral
      -100 = fully short (strong downtrend)
    """
    if prices is None or len(prices) < 21:
        return {"exposure_pct": None, "signals": {}, "ma_distances": {}, "interpretation": "insufficient data"}

    returns = prices.pct_change().dropna()
    last = float(prices.iloc[-1])

    lookbacks = [(21, "1m", 0.10), (63, "3m", 0.25), (126, "6m", 0.30), (252, "12m", 0.35)]
    signals: dict[str, float] = {}

    for lb, label, _ in lookbacks:
        if len(prices) < lb + 1:
            continue
        ret = float(prices.iloc[-1] / prices.iloc[-lb - 1] - 1)
        rv  = float(returns.iloc[-lb:].std() * np.sqrt(252)) or 0.15
        sig = float(np.clip(ret / rv * 0.4, -1, 1))
        signals[label] = round(sig, 3)

    if not signals:
        return {"exposure_pct": None, "signals": signals, "ma_distances": {}, "interpretation": "insufficient data"}

    weight_map = {"1m": 0.10, "3m": 0.25, "6m": 0.30, "12m": 0.35}
    total_w    = sum(weight_map[k] for k in signals)
    composite  = sum(signals[k] * weight_map[k] / total_w for k in signals)
    exp_pct    = round(composite * 100, 1)

    # MA distances
    ma_dist: dict[str, float] = {}
    for window, label in [(50, "50d"), (100, "100d"), (200, "200d")]:
        if len(prices) >= window:
            ma = float(prices.rolling(window).mean().iloc[-1])
            ma_dist[label] = round((last / ma - 1) * 100, 2)

    if exp_pct > 50:
        interpretation = "Heavily long --- crowding risk if trend breaks"
    elif exp_pct > 20:
        interpretation = "Moderately long --- positive trend signal"
    elif exp_pct < -50:
        interpretation = "Heavily short --- squeeze risk on trend reversal"
    elif exp_pct < -20:
        interpretation = "Moderately short --- negative trend signal"
    else:
        interpretation = "Neutral / flat --- mixed signals"

    return {
        "exposure_pct":   exp_pct,
        "signals":        signals,
        "ma_distances":   ma_dist,
        "interpretation": interpretation,
    }


def estimate_vol_control(prices: pd.Series, target_vol: float = 0.10) -> dict:
    """
    Estimate vol-control fund equity allocation.
    VCFs target constant realized vol (typically 10%).
    Exposure = min(1, target / realized) * 100%.

    When realized vol doubles, they cut equity in half -> forced selling.
    When realized vol compresses, they add -> latent buying pressure.
    """
    if prices is None or len(prices) < 21:
        return {"exposure_pct": None, "realized_vol_21d": None, "realized_vol_63d": None,
                "delta_vs_1m": None, "interpretation": "insufficient data"}

    ret = prices.pct_change().dropna()
    rv21 = float(ret.iloc[-21:].std() * np.sqrt(252))
    rv63 = float(ret.iloc[-63:].std() * np.sqrt(252)) if len(ret) >= 63 else rv21

    rv_blend  = 0.6 * rv21 + 0.4 * rv63
    exposure  = min(1.0, target_vol / rv_blend) if rv_blend > 0 else 1.0
    exp_pct   = round(exposure * 100, 1)

    # vs 1 month ago
    rv21_prev   = float(ret.iloc[-42:-21].std() * np.sqrt(252)) if len(ret) >= 42 else rv21
    prev_exp    = min(1.0, target_vol / rv21_prev) * 100 if rv21_prev > 0 else 100
    delta_1m    = round(exp_pct - prev_exp, 1)

    if delta_1m < -15:
        interpretation = f"Actively de-risking ({delta_1m:+.0f}% vs 1m ago) --- forced selling underway"
    elif delta_1m < -5:
        interpretation = f"Reducing exposure ({delta_1m:+.0f}% vs 1m ago) --- moderate selling"
    elif delta_1m > 15:
        interpretation = f"Adding exposure ({delta_1m:+.0f}% vs 1m ago) --- latent buying pressure"
    elif delta_1m > 5:
        interpretation = f"Gradually adding ({delta_1m:+.0f}% vs 1m ago)"
    else:
        interpretation = f"Stable allocation ({delta_1m:+.0f}% vs 1m ago)"

    return {
        "exposure_pct":     exp_pct,
        "target_vol_pct":   round(target_vol * 100, 1),
        "realized_vol_21d": round(rv21 * 100, 1),
        "realized_vol_63d": round(rv63 * 100, 1),
        "delta_vs_1m":      delta_1m,
        "interpretation":   interpretation,
    }

