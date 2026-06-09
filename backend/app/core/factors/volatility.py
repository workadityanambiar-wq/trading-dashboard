"""
Realized volatility and low-volatility factor.

Low-vol score = -realized_vol (less volatile stocks score higher).
"""
import pandas as pd
import numpy as np


def realized_vol_at(prices: pd.DataFrame, idx: int, window: int = 252) -> pd.Series:
    """Annualized realized vol at positional index idx."""
    start = max(0, idx - window + 1)
    sub = prices.iloc[start : idx + 1].pct_change().dropna(how="all")
    if len(sub) < 20:
        return pd.Series(dtype=float)
    return (sub.std() * np.sqrt(252)).dropna()


def realized_vol_latest(prices: pd.DataFrame, window: int = 252) -> pd.Series:
    return realized_vol_at(prices, len(prices) - 1, window)


def low_vol_latest(prices: pd.DataFrame, window: int = 252) -> pd.Series:
    """Low-vol factor score (negated vol)."""
    return -realized_vol_latest(prices, window)


def low_vol_history(prices: pd.DataFrame, month_end_idxs: list[int], window: int = 252) -> pd.DataFrame:
    records = {}
    for idx in month_end_idxs:
        date = prices.index[idx]
        scores = -realized_vol_at(prices, idx, window)
        if not scores.empty:
            records[date] = scores
    return pd.DataFrame(records).T
