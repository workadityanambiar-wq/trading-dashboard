"""Shared utilities: cross-sectional normalization, IC computation."""
import pandas as pd
import numpy as np
from scipy import stats
from typing import Optional


def cross_section_zscore(series: pd.Series, winsorize: float = 3.0) -> pd.Series:
    """Z-score a cross-section, winsorize outliers, return NaN-safe result."""
    valid = series.dropna()
    if len(valid) < 10:
        return pd.Series(np.nan, index=series.index)
    std = valid.std()
    if std == 0:
        return pd.Series(np.nan, index=series.index)
    z = (valid - valid.mean()) / std
    z = z.clip(-winsorize, winsorize)
    return z.reindex(series.index)


def compute_ic(scores: pd.Series, fwd_returns: pd.Series, min_obs: int = 10) -> float:
    """Spearman rank IC between factor scores and forward returns."""
    valid = scores.dropna().index.intersection(fwd_returns.dropna().index)
    if len(valid) < min_obs:
        return np.nan
    corr, _ = stats.spearmanr(scores[valid], fwd_returns[valid])
    return float(corr)


def get_month_end_indices(index: pd.DatetimeIndex) -> list[int]:
    """Return positional indices of month-end dates in a DatetimeIndex."""
    df = pd.DataFrame({"i": range(len(index))}, index=index)
    return df.resample("ME").last()["i"].tolist()
