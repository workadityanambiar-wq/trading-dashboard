"""
Spread construction and Z-score computation.
Supported spread types:  price | log | ratio | residual
Hedge ratio methods:     ols | rolling | kalman
"""
import numpy as np
import pandas as pd
from dataclasses import dataclass
from typing import Literal


@dataclass
class SpreadResult:
    hedge_ratio: float
    hedge_ratio_series: np.ndarray
    spread: np.ndarray
    z_score: np.ndarray
    rolling_mean: np.ndarray
    rolling_std: np.ndarray
    upper1: np.ndarray
    lower1: np.ndarray
    upper2: np.ndarray
    lower2: np.ndarray
    dates: pd.DatetimeIndex


def _kalman_hedge(y: np.ndarray, x: np.ndarray, delta: float = 1e-4) -> np.ndarray:
    """Scalar Kalman filter estimating a dynamic hedge ratio (state = slope)."""
    n = len(y)
    beta = np.zeros(n)
    P = np.ones(n)
    Vw = delta / (1.0 - delta)
    Ve = 0.001
    beta[0] = 1.0
    for t in range(1, n):
        P_pred   = P[t - 1] + Vw
        denom    = x[t] ** 2 * P_pred + Ve + 1e-12
        K        = P_pred * x[t] / denom
        beta[t]  = beta[t - 1] + K * (y[t] - beta[t - 1] * x[t])
        P[t]     = (1.0 - K * x[t]) * P_pred
    return beta


def _rolling_ols_hedge(y: np.ndarray, x: np.ndarray, window: int = 252) -> np.ndarray:
    """Rolling OLS hedge ratio."""
    n = len(y)
    beta = np.full(n, np.nan)
    for i in range(window, n):
        _y, _x = y[i - window:i], x[i - window:i]
        cov_m = np.cov(_y, _x)
        beta[i] = cov_m[0, 1] / (cov_m[1, 1] + 1e-12)
    # fill initial NaN with first valid value
    first = np.where(~np.isnan(beta))[0]
    if len(first):
        beta[:first[0]] = beta[first[0]]
    return beta


def build_spread(
    prices1: pd.Series,
    prices2: pd.Series,
    spread_type: Literal["log", "price", "ratio", "residual"] = "log",
    hedge_method: Literal["ols", "rolling", "kalman"] = "kalman",
    zscore_window: int = 30,
    rolling_window: int = 252,
) -> SpreadResult:
    """Construct spread series and compute Z-score with Bollinger-style bands."""
    df = pd.DataFrame({"p1": prices1, "p2": prices2}).dropna()
    dates = df.index
    p1, p2 = df["p1"].values, df["p2"].values

    if spread_type == "ratio":
        spread = p1 / np.clip(p2, 1e-10, None)
        beta_full = np.ones(len(p1))
    else:
        s1 = np.log(np.clip(p1, 1e-10, None)) if spread_type == "log" else p1
        s2 = np.log(np.clip(p2, 1e-10, None)) if spread_type == "log" else p2

        if hedge_method == "kalman":
            beta_full = _kalman_hedge(s1, s2)
        elif hedge_method == "rolling":
            beta_full = _rolling_ols_hedge(s1, s2, window=rolling_window)
        else:  # ols — static
            cov_m     = np.cov(s1, s2)
            slope     = cov_m[0, 1] / (cov_m[1, 1] + 1e-12)
            beta_full = np.full(len(s1), slope)

        spread = s1 - beta_full * s2

    rm = pd.Series(spread).rolling(zscore_window).mean().values
    rs = pd.Series(spread).rolling(zscore_window).std().values
    z  = (spread - rm) / np.where(rs > 1e-10, rs, 1e-10)

    return SpreadResult(
        hedge_ratio=float(beta_full[-1]),
        hedge_ratio_series=beta_full,
        spread=spread,
        z_score=z,
        rolling_mean=rm,
        rolling_std=rs,
        upper1=rm + rs,
        lower1=rm - rs,
        upper2=rm + 2 * rs,
        lower2=rm - 2 * rs,
        dates=dates,
    )
