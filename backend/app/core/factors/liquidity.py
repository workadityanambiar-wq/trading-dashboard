"""
Liquidity factor: log average daily dollar volume over a trailing window.

Higher dollar volume = more liquid.  Factor score = log(avg_dv).
The z-score ranking in the engine inverts this if desired, but we leave it
as-is so that the IC shows whether more-liquid stocks outperform.
"""
import pandas as pd
import numpy as np


def liquidity_at(prices: pd.DataFrame, volume: pd.DataFrame, idx: int, window: int = 63) -> pd.Series:
    """Log avg daily dollar volume at positional index idx."""
    start = max(0, idx - window + 1)
    if idx - start < 20:
        return pd.Series(dtype=float)
    p = prices.iloc[start : idx + 1]
    v = volume.iloc[start : idx + 1]
    common = p.columns.intersection(v.columns)
    if common.empty:
        return pd.Series(dtype=float)
    dv = (p[common] * v[common]).mean()
    return np.log1p(dv.replace(0, np.nan)).dropna()


def liquidity_latest(prices: pd.DataFrame, volume: pd.DataFrame, window: int = 63) -> pd.Series:
    return liquidity_at(prices, volume, len(prices) - 1, window)


def liquidity_history(
    prices: pd.DataFrame, volume: pd.DataFrame, month_end_idxs: list[int]
) -> pd.DataFrame:
    records = {}
    for idx in month_end_idxs:
        date = prices.index[idx]
        scores = liquidity_at(prices, volume, idx)
        if not scores.empty:
            records[date] = scores
    return pd.DataFrame(records).T
