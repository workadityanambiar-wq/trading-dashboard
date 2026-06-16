"""
Core smart money indicators: OBV, Chaikin Money Flow, VWAP.
"""
from __future__ import annotations
import numpy as np


def compute_obv(closes: np.ndarray, volumes: np.ndarray) -> np.ndarray:
    """On-Balance Volume — cumulative volume signed by price direction."""
    obv = np.zeros(len(closes))
    for i in range(1, len(closes)):
        if closes[i] > closes[i - 1]:
            obv[i] = obv[i - 1] + volumes[i]
        elif closes[i] < closes[i - 1]:
            obv[i] = obv[i - 1] - volumes[i]
        else:
            obv[i] = obv[i - 1]
    return obv


def compute_cmf(
    highs: np.ndarray,
    lows: np.ndarray,
    closes: np.ndarray,
    volumes: np.ndarray,
    period: int = 20,
) -> np.ndarray:
    """Chaikin Money Flow — rolling money-flow volume / total volume."""
    hl = highs - lows
    hl = np.where(hl == 0, 1e-10, hl)
    mf_mult = ((closes - lows) - (highs - closes)) / hl
    mf_vol  = mf_mult * volumes

    cmf = np.full(len(closes), np.nan)
    for i in range(period - 1, len(closes)):
        vol_sum = volumes[i - period + 1 : i + 1].sum()
        cmf[i]  = mf_vol[i - period + 1 : i + 1].sum() / max(vol_sum, 1e-10)
    return cmf


def compute_vwap(
    highs: np.ndarray,
    lows: np.ndarray,
    closes: np.ndarray,
    volumes: np.ndarray,
) -> np.ndarray:
    """Cumulative VWAP using typical price."""
    typical  = (highs + lows + closes) / 3
    cum_tv   = np.cumsum(typical * volumes)
    cum_v    = np.cumsum(volumes)
    return cum_tv / np.where(cum_v == 0, 1, cum_v)


def linear_slope(arr: np.ndarray, window: int = 20) -> float:
    """Normalized linear-regression slope over last `window` values."""
    n = min(window, len(arr))
    y = arr[-n:]
    mask = ~np.isnan(y)
    if mask.sum() < 2:
        return 0.0
    x = np.arange(n)
    return float(np.polyfit(x[mask], y[mask], 1)[0])
