"""
Portfolio optimization via PyPortfolioOpt.

Methods:
  equal_weight   – 1/N allocation
  max_sharpe     – maximize Sharpe ratio (MVO)
  min_volatility – minimize portfolio variance
  hrp            – Hierarchical Risk Parity (Roncalli, de Prado)

Efficient frontier: N points spanning min-vol to near-max-return.
"""
import pandas as pd
import numpy as np
from typing import Optional
import logging

logger = logging.getLogger(__name__)

try:
    from pypfopt import EfficientFrontier, HRPOpt, risk_models, expected_returns
    _HAS_PYPFOPT = True
except Exception:
    _HAS_PYPFOPT = False
    logger.warning("PyPortfolioOpt not available")


# ── Public interface ──────────────────────────────────────────────────────────

def optimize(
    prices: pd.DataFrame,
    methods: list[str],
    max_weight: float = 0.10,
    n_frontier: int = 60,
) -> dict:
    """
    Run all requested optimization methods on price history.

    Returns dict:
      allocations: {method: {ticker: weight}}
      metrics:     {method: {expected_return, volatility, sharpe}}
      frontier:    [{volatility, expected_return}]
      correlation: {tickers, matrix}
    """
    prices = prices.dropna(axis=1, how="all").ffill().dropna()
    if prices.empty or len(prices) < 60:
        return {"error": "Insufficient price history (need ≥60 trading days)"}

    daily_ret = prices.pct_change().dropna()
    mu = _expected_returns(prices)
    S = _cov(prices)

    allocations: dict[str, dict[str, float]] = {}
    metrics: dict[str, dict] = {}

    # Equal weight (always available)
    n = len(prices.columns)
    ew = {t: round(1 / n, 6) for t in prices.columns}
    allocations["equal_weight"] = ew
    metrics["equal_weight"] = _perf(mu, S, ew)

    if _HAS_PYPFOPT:
        for method in methods:
            if method == "equal_weight":
                continue
            w, m = _run_method(method, mu, S, daily_ret, max_weight)
            if w:
                allocations[method] = w
                metrics[method] = m
    else:
        # Fallback: compute at least min-vol via closed-form (diagonal approx)
        for method in methods:
            if method in ("max_sharpe", "min_volatility"):
                allocations[method] = _naive_risk_parity(daily_ret)
                metrics[method] = _perf(mu, S, allocations[method])

    frontier = _frontier(mu, S, max_weight, n_frontier) if _HAS_PYPFOPT else []
    corr = _correlation_matrix(daily_ret)

    return {
        "allocations": allocations,
        "metrics": metrics,
        "frontier": frontier,
        "correlation": corr,
    }


# ── Method runners ────────────────────────────────────────────────────────────

def _run_method(
    method: str,
    mu: pd.Series,
    S: pd.DataFrame,
    daily_ret: pd.DataFrame,
    max_weight: float,
) -> tuple[dict, dict]:
    try:
        if method == "max_sharpe":
            ef = EfficientFrontier(mu, S, weight_bounds=(0, max_weight))
            ef.max_sharpe()
            w = dict(ef.clean_weights())
            p = ef.portfolio_performance(verbose=False)
            return _nonzero(w), {"expected_return": round(p[0], 4), "volatility": round(p[1], 4), "sharpe": round(p[2], 4)}

        elif method == "min_volatility":
            ef = EfficientFrontier(mu, S, weight_bounds=(0, max_weight))
            ef.min_volatility()
            w = dict(ef.clean_weights())
            p = ef.portfolio_performance(verbose=False)
            return _nonzero(w), {"expected_return": round(p[0], 4), "volatility": round(p[1], 4), "sharpe": round(p[2], 4)}

        elif method == "hrp":
            hrp = HRPOpt(daily_ret)
            w = dict(hrp.optimize())
            p = hrp.portfolio_performance(verbose=False)
            return _nonzero(w), {"expected_return": round(p[0], 4), "volatility": round(p[1], 4), "sharpe": round(p[2], 4)}

    except Exception as e:
        logger.warning(f"Optimization method {method!r} failed: {e}")
    return {}, {}


# ── Efficient frontier ────────────────────────────────────────────────────────

def _frontier(mu, S, max_weight, n_points):
    points = []
    try:
        ef_min = EfficientFrontier(mu, S, weight_bounds=(0, max_weight))
        ef_min.min_volatility()
        min_ret = ef_min.portfolio_performance(verbose=False)[0]
        max_ret = float(mu.nlargest(5).mean()) * 0.85

        if max_ret <= min_ret:
            return []

        for target in np.linspace(min_ret, max_ret, n_points):
            try:
                ef = EfficientFrontier(mu, S, weight_bounds=(0, max_weight))
                ef.efficient_return(target_return=float(target))
                p = ef.portfolio_performance(verbose=False)
                points.append({"volatility": round(p[1], 4), "expected_return": round(p[0], 4)})
            except Exception:
                continue
    except Exception as e:
        logger.warning(f"Frontier failed: {e}")
    return points


# ── Helpers ───────────────────────────────────────────────────────────────────

def _expected_returns(prices: pd.DataFrame) -> pd.Series:
    if _HAS_PYPFOPT:
        return expected_returns.mean_historical_return(prices)
    return prices.pct_change().mean() * 252


def _cov(prices: pd.DataFrame) -> pd.DataFrame:
    if _HAS_PYPFOPT:
        try:
            return risk_models.CovarianceShrinkage(prices).ledoit_wolf()
        except Exception:
            pass
    return prices.pct_change().dropna().cov() * 252


def _perf(mu: pd.Series, S: pd.DataFrame, weights: dict) -> dict:
    tickers = [t for t in weights if t in mu.index]
    w = np.array([weights[t] for t in tickers])
    m = mu[tickers].values
    cov = S.loc[tickers, tickers].values
    exp_ret = float(w @ m)
    vol = float(np.sqrt(w @ cov @ w))
    sharpe = round(exp_ret / vol, 4) if vol > 0 else 0.0
    return {"expected_return": round(exp_ret, 4), "volatility": round(vol, 4), "sharpe": sharpe}


def _nonzero(weights: dict, threshold: float = 1e-4) -> dict:
    """Keep only meaningful weights, round to 4 decimals."""
    return {t: round(w, 4) for t, w in weights.items() if w > threshold}


def _naive_risk_parity(daily_ret: pd.DataFrame) -> dict:
    """Inverse-volatility weighting as a fallback for risk parity."""
    vols = daily_ret.std()
    inv_vol = 1 / vols
    weights = (inv_vol / inv_vol.sum()).round(4)
    return dict(weights)


def _correlation_matrix(daily_ret: pd.DataFrame) -> dict:
    corr = daily_ret.corr()
    tickers = corr.columns.tolist()
    matrix = [[round(float(corr.loc[r, c]), 3) for c in tickers] for r in tickers]
    return {"tickers": tickers, "matrix": matrix}
