"""
Statistical analysis engine for pair trading.
Computes: Pearson/Spearman correlation, ADF test, Johansen cointegration,
Hurst exponent, half-life of mean reversion, volatility ratio, quality score.
"""
import warnings
import numpy as np
import pandas as pd
from dataclasses import dataclass
from scipy import stats as scipy_stats
from statsmodels.tsa.stattools import adfuller
from statsmodels.tsa.vector_ar.vecm import coint_johansen


@dataclass
class PairStats:
    ticker1: str
    ticker2: str
    pearson_corr: float
    spearman_corr: float
    adf_pvalue: float
    adf_statistic: float
    is_adf_stationary: bool
    johansen_trace_stat: float
    johansen_crit_95: float
    is_cointegrated: bool
    hurst_exponent: float
    half_life_days: float
    volatility_ratio: float
    quality_score: float
    n_obs: int


def _hurst_exponent(series: np.ndarray) -> float:
    """
    Hurst exponent via variance-of-differences method.
    H < 0.5 → mean-reverting  |  H = 0.5 → random walk  |  H > 0.5 → trending
    """
    n = len(series)
    if n < 20:
        return 0.5
    max_lag = min(100, n // 2)
    lags = list(range(2, max_lag))
    tau = [np.std(np.subtract(series[lag:], series[:-lag])) for lag in lags]
    tau = [t for t in tau if t > 0]
    if len(tau) < 2:
        return 0.5
    poly = np.polyfit(np.log(lags[:len(tau)]), np.log(tau), 1)
    return float(np.clip(poly[0], 0.0, 1.0))


def _half_life(spread: np.ndarray) -> float:
    """
    Half-life of mean reversion from the Ornstein-Uhlenbeck process.
    Regress Δspread_t on spread_{t-1}: Δs = λ·s_{t-1} + ε
    half_life = -ln(2) / λ
    """
    if len(spread) < 10:
        return 999.0
    delta = np.diff(spread)
    lag = spread[:-1] - spread[:-1].mean()
    var_lag = np.var(lag)
    if var_lag < 1e-12:
        return 999.0
    lam = float(np.cov(lag, delta)[0, 1] / var_lag)
    if lam >= 0:
        return 999.0
    return float(np.clip(-np.log(2.0) / lam, 1.0, 999.0))


def compute_pair_stats(
    ticker1: str,
    ticker2: str,
    prices1: pd.Series,
    prices2: pd.Series,
) -> PairStats:
    """Full statistical analysis for a pair."""
    df = pd.DataFrame({"p1": prices1, "p2": prices2}).dropna()
    if len(df) < 60:
        raise ValueError(f"Insufficient data ({len(df)} obs) for {ticker1}/{ticker2}")

    p1, p2 = df["p1"].values, df["p2"].values
    r1 = np.diff(np.log(np.clip(p1, 1e-10, None)))
    r2 = np.diff(np.log(np.clip(p2, 1e-10, None)))

    # Correlations
    pearson_corr  = float(np.corrcoef(r1, r2)[0, 1])
    spearman_corr = float(scipy_stats.spearmanr(r1, r2)[0])

    # OLS hedge ratio on log prices
    lp1, lp2 = np.log(p1), np.log(p2)
    slope = float(np.cov(lp1, lp2)[0, 1] / (np.var(lp2) + 1e-12))
    spread = lp1 - slope * lp2

    # ADF test
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        try:
            adf_res = adfuller(spread, maxlag=1, regression="c", autolag=None)
            adf_stat = float(adf_res[0])
            adf_pval = float(adf_res[1])
        except Exception:
            adf_stat, adf_pval = 0.0, 1.0

    # Johansen test
    try:
        jo = coint_johansen(np.column_stack([lp1, lp2]), det_order=0, k_ar_diff=1)
        jo_trace   = float(jo.lr1[0])
        jo_crit95  = float(jo.cvt[0, 1])
        is_coint   = bool(jo_trace > jo_crit95)
    except Exception:
        jo_trace, jo_crit95, is_coint = 0.0, 15.49, False

    hurst = _hurst_exponent(spread)
    hl    = _half_life(spread)

    vol1 = float(np.std(r1) * np.sqrt(252))
    vol2 = float(np.std(r2) * np.sqrt(252))
    vol_ratio = float(vol1 / (vol2 + 1e-10))

    # Composite quality score 0–100
    corr_score  = max(0.0, (abs(pearson_corr) - 0.5) / 0.5) * 25.0
    coint_score = max(0.0, 1.0 - adf_pval) * 30.0
    hurst_score = max(0.0, (0.5 - hurst) / 0.5) * 25.0
    if 5 <= hl <= 30:
        hl_score = 20.0
    elif hl < 5:
        hl_score = 12.0
    elif hl <= 60:
        hl_score = max(0.0, 20.0 * (1.0 - (hl - 30.0) / 30.0))
    else:
        hl_score = 0.0

    quality_score = float(min(100.0, corr_score + coint_score + hurst_score + hl_score))

    return PairStats(
        ticker1=ticker1, ticker2=ticker2,
        pearson_corr=pearson_corr, spearman_corr=spearman_corr,
        adf_pvalue=adf_pval, adf_statistic=adf_stat,
        is_adf_stationary=adf_pval < 0.05,
        johansen_trace_stat=jo_trace, johansen_crit_95=jo_crit95,
        is_cointegrated=is_coint,
        hurst_exponent=hurst, half_life_days=hl,
        volatility_ratio=vol_ratio, quality_score=quality_score,
        n_obs=len(df),
    )
