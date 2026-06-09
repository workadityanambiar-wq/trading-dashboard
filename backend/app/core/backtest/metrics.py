"""
Performance metrics for a daily return series.
Uses empyrical-reloaded for standard measures.
"""
import pandas as pd
import numpy as np
from typing import Optional
import logging

logger = logging.getLogger(__name__)

try:
    import empyrical as ep
    _HAS_EMPYRICAL = True
except Exception:
    _HAS_EMPYRICAL = False
    logger.warning("empyrical not available — using manual metric calculations")


def _cagr(returns: pd.Series) -> float:
    n_years = len(returns) / 252
    if n_years <= 0:
        return 0.0
    total = float((1 + returns).prod())
    return float(total ** (1 / n_years) - 1) if total > 0 else -1.0


def _max_drawdown(returns: pd.Series) -> float:
    eq = (1 + returns).cumprod()
    dd = eq / eq.cummax() - 1
    return float(dd.min())


def _sharpe(returns: pd.Series, rf: float = 0.0) -> float:
    excess = returns - rf / 252
    if excess.std() == 0:
        return 0.0
    return float(excess.mean() / excess.std() * np.sqrt(252))


def _sortino(returns: pd.Series, rf: float = 0.0) -> float:
    excess = returns - rf / 252
    downside = excess[excess < 0]
    if len(downside) == 0 or downside.std() == 0:
        return 0.0
    return float(excess.mean() / downside.std() * np.sqrt(252))


def _calmar(returns: pd.Series) -> float:
    mdd = _max_drawdown(returns)
    ann = _cagr(returns)
    return float(ann / abs(mdd)) if mdd != 0 else 0.0


def compute_all(
    returns: pd.Series,
    benchmark: Optional[pd.Series] = None,
) -> dict:
    """
    Compute full set of performance metrics.

    Args:
        returns:   Daily portfolio returns (fractional).
        benchmark: Daily benchmark returns (e.g. SPY). Used for beta, alpha, IR.

    Returns:
        Dict of metric name → float value.
    """
    returns = returns.dropna()
    if returns.empty:
        return {}

    if _HAS_EMPYRICAL:
        metrics = _empyrical_metrics(returns, benchmark)
    else:
        metrics = _manual_metrics(returns)

    # Information ratio and beta/alpha (manual — empyrical's alpha can have edge cases)
    if benchmark is not None:
        bm = benchmark
        if isinstance(bm, pd.DataFrame):
            bm = bm.iloc[:, 0]
        bm = bm.reindex(returns.index).dropna()
        common = returns.reindex(bm.index).dropna()
        bm = bm.loc[common.index]
        if len(common) > 30:
            active = common - bm
            metrics["information_ratio"] = round(
                float(active.mean() / active.std() * np.sqrt(252)) if active.std() > 0 else 0.0, 4
            )
            # OLS beta / alpha
            cov = np.cov(common.values, bm.values)
            metrics["beta"] = round(float(cov[0, 1] / cov[1, 1]) if cov[1, 1] != 0 else 1.0, 4)
            metrics["alpha"] = round(
                float((_cagr(common) - metrics["beta"] * _cagr(bm))), 4
            )

    metrics["hit_rate"] = round(float((returns > 0).mean()), 4)
    metrics["avg_monthly_return"] = round(
        float((1 + returns).resample("ME").prod().sub(1).mean()), 4
    )

    monthly = (1 + returns).resample("ME").prod() - 1
    if not monthly.empty:
        metrics["best_month"] = round(float(monthly.max()), 4)
        metrics["worst_month"] = round(float(monthly.min()), 4)

    return metrics


def _empyrical_metrics(returns: pd.Series, benchmark: Optional[pd.Series]) -> dict:
    bm = benchmark.reindex(returns.index).fillna(0) if benchmark is not None else None
    return {
        "total_return": round(float(ep.cum_returns_final(returns)), 4),
        "cagr": round(float(ep.annual_return(returns)), 4),
        "sharpe": round(float(ep.sharpe_ratio(returns)), 4),
        "sortino": round(float(ep.sortino_ratio(returns)), 4),
        "calmar": round(float(ep.calmar_ratio(returns)), 4),
        "max_drawdown": round(float(ep.max_drawdown(returns)), 4),
        "volatility": round(float(ep.annual_volatility(returns)), 4),
    }


def _manual_metrics(returns: pd.Series) -> dict:
    total = float((1 + returns).prod() - 1)
    return {
        "total_return": round(total, 4),
        "cagr": round(_cagr(returns), 4),
        "sharpe": round(_sharpe(returns), 4),
        "sortino": round(_sortino(returns), 4),
        "calmar": round(_calmar(returns), 4),
        "max_drawdown": round(_max_drawdown(returns), 4),
        "volatility": round(float(returns.std() * np.sqrt(252)), 4),
    }
