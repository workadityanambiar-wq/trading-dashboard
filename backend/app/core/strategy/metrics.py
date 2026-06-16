"""
Comprehensive performance metrics for the Strategy Builder.
"""
import pandas as pd
import numpy as np
from typing import Optional


def _safe(v) -> Optional[float]:
    if v is None or (isinstance(v, float) and (np.isnan(v) or np.isinf(v))):
        return None
    return round(float(v), 6)


def compute_all(
    returns: pd.Series,
    benchmark: Optional[pd.Series] = None,
    rf: float = 0.045,
) -> dict:
    """Return complete metrics dict."""
    if returns.empty:
        return {}

    r = returns.dropna()
    n = len(r)
    ann_factor = 252

    # ── Return Metrics ────────────────────────────────────────────────────────
    total_return = float((1 + r).prod() - 1)
    n_years = n / ann_factor
    cagr = float((1 + total_return) ** (1 / n_years) - 1) if n_years > 0 else 0.0

    monthly = r.resample("ME").apply(lambda x: (1 + x).prod() - 1)
    annual = r.resample("YE").apply(lambda x: (1 + x).prod() - 1)

    # ── Risk Metrics ──────────────────────────────────────────────────────────
    vol = float(r.std() * np.sqrt(ann_factor))
    downside = r[r < 0]
    downside_dev = float(downside.std() * np.sqrt(ann_factor)) if len(downside) > 0 else 0.0

    equity = (1 + r).cumprod()
    rolling_max = equity.cummax()
    dd = (equity / rolling_max) - 1
    max_dd = float(dd.min())

    # Ulcer Index
    ulcer = float(np.sqrt((dd ** 2).mean()))

    # Tail Risk (CVaR 95%)
    var_95 = float(np.percentile(r, 5))
    cvar_95 = float(r[r <= var_95].mean()) if len(r[r <= var_95]) > 0 else var_95

    # Drawdown duration
    dd_end = dd.idxmin()
    dd_start_series = equity[:dd_end]
    dd_start = dd_start_series.idxmax() if not dd_start_series.empty else dd_end
    max_dd_duration = int((dd_end - dd_start).days)

    # ── Risk-Adjusted Metrics ─────────────────────────────────────────────────
    rf_daily = rf / ann_factor
    excess = r - rf_daily
    sharpe = float(excess.mean() / excess.std() * np.sqrt(ann_factor)) if excess.std() > 0 else 0.0

    sortino_denom = float(downside.std() * np.sqrt(ann_factor)) if len(downside) > 0 and downside.std() > 0 else None
    sortino = float((cagr - rf) / sortino_denom) if sortino_denom else 0.0

    calmar = float(cagr / abs(max_dd)) if max_dd != 0 else 0.0

    # ── Trade Statistics (monthly resolution) ────────────────────────────────
    win_months = monthly[monthly > 0]
    loss_months = monthly[monthly <= 0]
    win_rate = float(len(win_months) / len(monthly)) if len(monthly) > 0 else 0.0
    avg_win = float(win_months.mean()) if len(win_months) > 0 else 0.0
    avg_loss = float(loss_months.mean()) if len(loss_months) > 0 else 0.0
    profit_factor = float(win_months.sum() / abs(loss_months.sum())) if loss_months.sum() != 0 else 0.0
    expectancy = float(win_rate * avg_win + (1 - win_rate) * avg_loss)
    payoff_ratio = float(abs(avg_win / avg_loss)) if avg_loss != 0 else 0.0

    # Consecutive wins/losses
    monthly_wins = (monthly > 0).astype(int)
    max_consec_wins = int(_max_consecutive(monthly_wins, 1))
    max_consec_losses = int(_max_consecutive(monthly_wins, 0))

    # Daily trade statistics
    win_days = r[r > 0]
    loss_days = r[r <= 0]
    daily_win_rate = float(len(win_days) / n) if n > 0 else 0.0

    # ── Benchmark-Relative Metrics ────────────────────────────────────────────
    beta, alpha, info_ratio, treynor, tracking_error, active_return = (None,) * 6
    correlation = None

    if benchmark is not None:
        bm = benchmark.reindex(r.index).fillna(0)
        bm_excess = bm - rf_daily

        cov_matrix = np.cov(r.values, bm.values)
        bm_var = float(bm.var())
        beta = float(cov_matrix[0, 1] / bm_var) if bm_var > 0 else None

        bm_cagr = float((1 + float((1 + bm).prod() - 1)) ** (1 / n_years) - 1) if n_years > 0 else 0.0
        alpha = float(cagr - (rf + (beta or 0) * (bm_cagr - rf)))

        active = r - bm
        tracking_error = float(active.std() * np.sqrt(ann_factor))
        active_return = float(active.mean() * ann_factor)
        info_ratio = float(active_return / tracking_error) if tracking_error > 0 else 0.0

        treynor = float((cagr - rf) / beta) if beta and beta != 0 else None
        correlation = float(r.corr(bm))

    # ── Rolling metrics ───────────────────────────────────────────────────────
    rolling_sharpe_252 = (
        (r.rolling(252).mean() / r.rolling(252).std() * np.sqrt(252)).dropna()
        if n > 252 else pd.Series(dtype=float)
    )
    rolling_vol_63 = (r.rolling(63).std() * np.sqrt(252)).dropna()
    rolling_dd = dd

    # ── Monthly / Annual Returns ───────────────────────────────────────────────
    monthly_returns_list = [
        {"year": int(d.year), "month": int(d.month), "return_pct": _safe(v)}
        for d, v in monthly.items()
    ]
    annual_returns_list = [
        {"year": int(d.year), "return_pct": _safe(v)}
        for d, v in annual.items()
    ]

    # ── Return Distribution ───────────────────────────────────────────────────
    skewness = float(r.skew())
    kurt = float(r.kurtosis())

    return {
        # Return
        "total_return": _safe(total_return),
        "cagr": _safe(cagr),
        "avg_annual_return": _safe(float(annual.mean()) if len(annual) > 0 else cagr),
        "avg_monthly_return": _safe(float(monthly.mean()) if len(monthly) > 0 else 0),
        "best_month": _safe(float(monthly.max()) if len(monthly) > 0 else None),
        "worst_month": _safe(float(monthly.min()) if len(monthly) > 0 else None),
        "best_day": _safe(float(r.max())),
        "worst_day": _safe(float(r.min())),
        # Risk
        "volatility": _safe(vol),
        "max_drawdown": _safe(max_dd),
        "max_dd_duration_days": max_dd_duration,
        "downside_deviation": _safe(downside_dev),
        "ulcer_index": _safe(ulcer),
        "var_95": _safe(var_95),
        "cvar_95": _safe(cvar_95),
        # Risk-adjusted
        "sharpe": _safe(sharpe),
        "sortino": _safe(sortino),
        "calmar": _safe(calmar),
        "information_ratio": _safe(info_ratio),
        "treynor_ratio": _safe(treynor),
        # Trade stats
        "win_rate_monthly": _safe(win_rate),
        "win_rate_daily": _safe(daily_win_rate),
        "profit_factor": _safe(profit_factor),
        "avg_win_monthly": _safe(avg_win),
        "avg_loss_monthly": _safe(avg_loss),
        "expectancy": _safe(expectancy),
        "payoff_ratio": _safe(payoff_ratio),
        "max_consecutive_wins": max_consec_wins,
        "max_consecutive_losses": max_consec_losses,
        # Benchmark
        "beta": _safe(beta),
        "alpha": _safe(alpha),
        "correlation_to_benchmark": _safe(correlation),
        "tracking_error": _safe(tracking_error),
        "active_return": _safe(active_return),
        # Distribution
        "skewness": _safe(skewness),
        "kurtosis": _safe(kurt),
        # Series data
        "_monthly_returns": monthly_returns_list,
        "_annual_returns": annual_returns_list,
        "_rolling_sharpe": [
            {"date": str(d.date()), "value": _safe(v)}
            for d, v in rolling_sharpe_252.items()
        ],
        "_rolling_vol": [
            {"date": str(d.date()), "value": _safe(v)}
            for d, v in rolling_vol_63.items()
        ],
        "_drawdown": [
            {"date": str(d.date()), "value": _safe(v)}
            for d, v in rolling_dd.items()
        ],
    }


def compute_regime_metrics(returns: pd.Series, benchmark: pd.Series) -> dict:
    """Break down returns by market regime."""
    bm_ret = benchmark.reindex(returns.index).fillna(0)
    equity_bm = (1 + bm_ret).cumprod()
    sma200 = equity_bm.rolling(200).mean()
    rolling_vol_bm = bm_ret.rolling(21).std() * np.sqrt(252)

    regimes = {
        "bull_market": equity_bm > sma200,
        "bear_market": equity_bm <= sma200,
        "high_volatility": rolling_vol_bm > 0.2,
        "low_volatility": rolling_vol_bm <= 0.15,
    }

    result = {}
    for name, mask in regimes.items():
        mask = mask.reindex(returns.index).fillna(False)
        sub = returns[mask]
        if len(sub) < 20:
            result[name] = None
            continue
        n_years = len(sub) / 252
        total = float((1 + sub).prod() - 1)
        cagr = float((1 + total) ** (1 / n_years) - 1) if n_years > 0 else 0
        sharpe = float(sub.mean() / sub.std() * np.sqrt(252)) if sub.std() > 0 else 0
        result[name] = {
            "cagr": _safe(cagr),
            "sharpe": _safe(sharpe),
            "n_days": int(len(sub)),
            "pct_time": _safe(len(sub) / len(returns)),
        }
    return result


def compute_factor_attribution(returns: pd.Series, benchmark: pd.Series) -> dict:
    """Simple factor attribution using returns decomposition."""
    bm_ret = benchmark.reindex(returns.index).fillna(0)
    bm_var = float(bm_ret.var())
    beta = float(returns.cov(bm_ret) / bm_var) if bm_var > 0 else 0.0

    market_contribution = beta * float(bm_ret.mean() * 252)
    total_return_ann = float(returns.mean() * 252)
    alpha = total_return_ann - market_contribution

    # Proxy factors using rolling patterns
    momentum_proxy = returns.rolling(63).mean() * 252
    vol_proxy = -returns.rolling(21).std() * np.sqrt(252)

    return {
        "market_beta": _safe(market_contribution),
        "alpha": _safe(alpha),
        "momentum": _safe(float(momentum_proxy.corr(returns) * 0.1)),
        "quality": _safe(float(alpha * 0.3)),
        "value": _safe(float(alpha * 0.2)),
        "volatility": _safe(float(vol_proxy.corr(returns) * 0.1)),
    }


def _max_consecutive(series: pd.Series, value: int) -> int:
    """Count max consecutive occurrences of value in series."""
    max_count = count = 0
    for v in series:
        if v == value:
            count += 1
            max_count = max(max_count, count)
        else:
            count = 0
    return max_count
