"""
Portfolio risk metrics: VaR, CVaR, concentration, rolling beta, sector exposure.
"""
import pandas as pd
import numpy as np
from scipy import stats
from typing import Optional


def var_cvar(
    returns: pd.Series,
    confidence_levels: list[float] = (0.95, 0.99),
) -> list[dict]:
    """
    Historical and parametric VaR / CVaR for multiple confidence levels.
    Values are in decimal form (negative = loss).
    """
    r = returns.dropna().sort_values()
    mu, sigma = float(r.mean()), float(r.std())
    results = []

    for conf in confidence_levels:
        idx = int((1 - conf) * len(r))
        var_hist = float(r.iloc[max(idx - 1, 0)])
        cvar_hist = float(r.iloc[:max(idx, 1)].mean())
        var_param = float(stats.norm.ppf(1 - conf, loc=mu, scale=sigma))
        cvar_param = float(
            mu - sigma * stats.norm.pdf(stats.norm.ppf(1 - conf)) / (1 - conf)
        )
        results.append({
            "confidence": conf,
            "var_hist":   round(var_hist, 6),
            "cvar_hist":  round(cvar_hist, 6),
            "var_param":  round(var_param, 6),
            "cvar_param": round(cvar_param, 6),
            "n_obs":      len(r),
        })

    return results


def concentration(weights: dict) -> dict:
    """HHI, top-N weights, effective N."""
    w = np.array(list(weights.values()), dtype=float)
    w = w[w > 0]
    w = w / w.sum()
    sorted_w = np.sort(w)[::-1]

    hhi = float(np.sum(w ** 2))
    eff_n = round(1 / hhi, 1) if hhi > 0 else len(w)

    return {
        "n_holdings":   len(w),
        "hhi":          round(hhi, 4),
        "effective_n":  eff_n,
        "top5_weight":  round(float(sorted_w[:5].sum()), 4),
        "top10_weight": round(float(sorted_w[:10].sum()), 4),
    }


def rolling_beta(
    portfolio_returns: pd.Series,
    benchmark_returns: pd.Series,
    window: int = 63,
) -> pd.Series:
    """Rolling window beta against a benchmark."""
    cov = portfolio_returns.rolling(window).cov(benchmark_returns)
    var = benchmark_returns.rolling(window).var()
    return (cov / var).rename("rolling_beta")


def portfolio_returns_from_weights(
    prices: pd.DataFrame,
    weights: dict[str, float],
) -> pd.Series:
    """Compute daily portfolio returns given adj_close prices and a weights dict."""
    tickers = [t for t in weights if t in prices.columns]
    if not tickers:
        return pd.Series(dtype=float)

    w = pd.Series({t: weights[t] for t in tickers})
    w = w / w.sum()  # normalise

    daily_ret = prices[tickers].pct_change()
    port_ret = (daily_ret * w).sum(axis=1).dropna()
    return port_ret


def sector_exposure(weights: dict, sector_map: dict) -> dict[str, float]:
    """Aggregate weights by sector."""
    exp: dict[str, float] = {}
    for ticker, w in weights.items():
        sector = sector_map.get(ticker, "Unknown")
        exp[sector] = round(exp.get(sector, 0.0) + w, 4)
    return dict(sorted(exp.items(), key=lambda x: -x[1]))
