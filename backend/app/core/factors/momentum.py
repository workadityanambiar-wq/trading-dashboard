"""
Momentum factors on wide-format price DataFrame (DatetimeIndex × tickers).

12-1 month: return from t-252 to t-21 trading days (skip last month to avoid reversal).
6-1  month: return from t-126 to t-21 trading days.
"""
import pandas as pd
import numpy as np


def mom_12_1_at(prices: pd.DataFrame, idx: int) -> pd.Series:
    """Momentum 12-1 score at positional index idx."""
    lookback, skip = 252, 21
    if idx < lookback:
        return pd.Series(dtype=float)
    numerator = prices.iloc[idx - skip]
    denominator = prices.iloc[idx - lookback]
    return (numerator / denominator - 1).replace([np.inf, -np.inf], np.nan).dropna()


def mom_6_1_at(prices: pd.DataFrame, idx: int) -> pd.Series:
    """Momentum 6-1 score at positional index idx."""
    lookback, skip = 126, 21
    if idx < lookback:
        return pd.Series(dtype=float)
    numerator = prices.iloc[idx - skip]
    denominator = prices.iloc[idx - lookback]
    return (numerator / denominator - 1).replace([np.inf, -np.inf], np.nan).dropna()


def mom_12_1_latest(prices: pd.DataFrame) -> pd.Series:
    return mom_12_1_at(prices, len(prices) - 1)


def mom_6_1_latest(prices: pd.DataFrame) -> pd.Series:
    return mom_6_1_at(prices, len(prices) - 1)


def mom_12_1_history(prices: pd.DataFrame, month_end_idxs: list[int]) -> pd.DataFrame:
    """Factor scores at each month-end. Returns (dates × tickers) DataFrame."""
    records = {}
    for idx in month_end_idxs:
        date = prices.index[idx]
        scores = mom_12_1_at(prices, idx)
        if not scores.empty:
            records[date] = scores
    return pd.DataFrame(records).T  # dates × tickers


def mom_6_1_history(prices: pd.DataFrame, month_end_idxs: list[int]) -> pd.DataFrame:
    records = {}
    for idx in month_end_idxs:
        date = prices.index[idx]
        scores = mom_6_1_at(prices, idx)
        if not scores.empty:
            records[date] = scores
    return pd.DataFrame(records).T
