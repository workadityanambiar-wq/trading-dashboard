"""
Macro regime factor: negative rolling market beta (SPY beta).

Low-beta stocks score higher.  During risk-off regimes (high VIX) low-beta
stocks tend to outperform — this factor captures defensive quality from prices
without needing fundamental data.

Requires SPY to be present in the prices DataFrame.
"""
import pandas as pd
import numpy as np

_BENCHMARK = "SPY"
_MIN_OBS = 60


def _rolling_betas(prices: pd.DataFrame, idx: int, window: int = 252) -> pd.Series:
    start = max(0, idx - window + 1)
    sub = prices.iloc[start : idx + 1].pct_change().dropna(how="all")
    if _BENCHMARK not in sub.columns or len(sub) < _MIN_OBS:
        return pd.Series(dtype=float)
    bm = sub[_BENCHMARK].dropna()
    bm_var = bm.var()
    if bm_var < 1e-10:
        return pd.Series(dtype=float)
    stocks = sub.drop(columns=[_BENCHMARK], errors="ignore")
    betas = {}
    for col in stocks.columns:
        s = stocks[col].dropna()
        aligned_bm = bm.reindex(s.index).dropna()
        s = s.reindex(aligned_bm.index)
        if len(s) < _MIN_OBS:
            continue
        betas[col] = float(s.cov(aligned_bm) / bm_var)
    if not betas:
        return pd.Series(dtype=float)
    return pd.Series(betas)


def macro_regime_at(prices: pd.DataFrame, idx: int, window: int = 252) -> pd.Series:
    """Negative beta to SPY at positional index idx.  Low-beta → high score."""
    betas = _rolling_betas(prices, idx, window)
    return (-betas).dropna()


def macro_regime_latest(prices: pd.DataFrame, window: int = 252) -> pd.Series:
    return macro_regime_at(prices, len(prices) - 1, window)


def macro_regime_history(prices: pd.DataFrame, month_end_idxs: list[int]) -> pd.DataFrame:
    records = {}
    for idx in month_end_idxs:
        date = prices.index[idx]
        scores = macro_regime_at(prices, idx)
        if not scores.empty:
            records[date] = scores
    return pd.DataFrame(records).T
