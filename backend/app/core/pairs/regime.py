"""
Market regime detection for pair trading.
Uses VIX level + SPY moving average positioning to classify regimes.
"""
import numpy as np
import pandas as pd
from typing import Literal

RegimeType = Literal["mean_reverting", "trending", "high_vol", "crisis"]


def detect_regime(
    spy_prices: pd.Series,
    vix_prices: pd.Series | None = None,
) -> dict:
    """
    Classify the current market regime.

    Returns:
        regime: str
        vix_current: float | None
        spy_vs_ma50: float   (fractional distance from 50-day MA)
        spy_vs_ma200: float
        description: str
        pairs_enabled: bool
        recommended_entry: float  (suggested z-score entry threshold)
    """
    spy = spy_prices.dropna()
    if len(spy) < 50:
        return {
            "regime": "mean_reverting",
            "vix_current": None,
            "spy_vs_ma50": 0.0,
            "spy_vs_ma200": 0.0,
            "description": "Insufficient data — defaulting to mean_reverting",
            "pairs_enabled": True,
            "recommended_entry": 2.0,
        }

    last = float(spy.iloc[-1])
    ma50  = float(spy.iloc[-50:].mean())
    ma200 = float(spy.iloc[-200:].mean()) if len(spy) >= 200 else float(spy.mean())

    spy_vs_ma50  = (last - ma50)  / (ma50  + 1e-10)
    spy_vs_ma200 = (last - ma200) / (ma200 + 1e-10)

    vix_val: float | None = None
    if vix_prices is not None:
        vix_clean = vix_prices.dropna()
        if len(vix_clean) > 0:
            vix_val = float(vix_clean.iloc[-1])

    if vix_val is not None and vix_val > 35:
        regime: RegimeType = "crisis"
        desc    = f"VIX={vix_val:.1f} — crisis, pairs suspended"
        enabled = False
        entry_thresh = 3.0
    elif vix_val is not None and vix_val > 22:
        regime  = "high_vol"
        desc    = f"VIX={vix_val:.1f} — elevated vol, widen thresholds"
        enabled = True
        entry_thresh = 2.5
    elif abs(spy_vs_ma50) < 0.02 and abs(spy_vs_ma200) < 0.04:
        regime  = "mean_reverting"
        desc    = "SPY consolidating near MAs — ideal pairs environment"
        enabled = True
        entry_thresh = 2.0
    elif spy_vs_ma50 > 0.04 and spy_vs_ma200 > 0.05:
        regime  = "trending"
        desc    = "SPY trending higher — reduce pair exposure"
        enabled = True
        entry_thresh = 2.0
    else:
        regime  = "mean_reverting"
        desc    = "Mixed signals — standard pair thresholds"
        enabled = True
        entry_thresh = 2.0

    return {
        "regime": regime,
        "vix_current": round(vix_val, 2) if vix_val is not None else None,
        "spy_vs_ma50":  round(spy_vs_ma50 * 100, 2),
        "spy_vs_ma200": round(spy_vs_ma200 * 100, 2),
        "description":  desc,
        "pairs_enabled": enabled,
        "recommended_entry": entry_thresh,
    }
