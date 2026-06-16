"""
Walk-Forward Analysis for the Strategy Builder.
Splits the data into IS (in-sample) / OOS (out-of-sample) windows and
runs the strategy on each OOS period, returning aggregated results.
"""
import pandas as pd
import numpy as np
from typing import Optional
from dateutil.relativedelta import relativedelta
import logging

from app.core.strategy.engine import StrategyConfig, run_backtest
from app.core.strategy.metrics import compute_all, _safe

logger = logging.getLogger(__name__)


def run_walk_forward(
    close: pd.DataFrame,
    high: pd.DataFrame,
    low: pd.DataFrame,
    volume: pd.DataFrame,
    benchmark: pd.Series,
    config: StrategyConfig,
    train_months: int = 24,
    test_months: int = 6,
) -> dict:
    """
    Walk-forward analysis.
    Returns OOS metrics + per-window breakdown + OOS vs IS comparison.
    """
    start = pd.Timestamp(config.start_date)
    end = pd.Timestamp(config.end_date) if config.end_date else close.index[-1]

    windows = []
    cursor = start

    while True:
        train_start = cursor
        train_end = cursor + relativedelta(months=train_months)
        test_start = train_end
        test_end = test_start + relativedelta(months=test_months)

        if test_end > end:
            break

        windows.append({
            "train_start": train_start,
            "train_end": train_end,
            "test_start": test_start,
            "test_end": test_end,
        })
        cursor = test_start  # anchored walk-forward (rolling would be cursor += test_months)

    if not windows:
        return {"error": "Insufficient data for walk-forward analysis"}

    oos_returns_list = []
    is_metrics_list = []
    oos_metrics_list = []
    window_results = []

    for i, w in enumerate(windows):
        try:
            # IS run
            is_cfg = StrategyConfig(**{**config.__dict__,
                                       "start_date": str(w["train_start"].date()),
                                       "end_date": str(w["train_end"].date())})
            is_result = run_backtest(close, high, low, volume, benchmark, is_cfg)
            is_m = compute_all(is_result.returns, is_result.benchmark_returns)

            # OOS run (same parameters, fresh period)
            oos_cfg = StrategyConfig(**{**config.__dict__,
                                        "start_date": str(w["test_start"].date()),
                                        "end_date": str(w["test_end"].date())})
            oos_result = run_backtest(close, high, low, volume, benchmark, oos_cfg)
            oos_m = compute_all(oos_result.returns, oos_result.benchmark_returns)

            oos_returns_list.append(oos_result.returns)
            is_metrics_list.append(is_m)
            oos_metrics_list.append(oos_m)

            window_results.append({
                "window": i + 1,
                "train_start": str(w["train_start"].date()),
                "train_end": str(w["train_end"].date()),
                "test_start": str(w["test_start"].date()),
                "test_end": str(w["test_end"].date()),
                "is_sharpe": is_m.get("sharpe"),
                "is_cagr": is_m.get("cagr"),
                "oos_sharpe": oos_m.get("sharpe"),
                "oos_cagr": oos_m.get("cagr"),
                "oos_max_dd": oos_m.get("max_drawdown"),
            })

        except Exception as e:
            logger.warning(f"Walk-forward window {i+1} failed: {e}")
            continue

    if not oos_returns_list:
        return {"error": "All walk-forward windows failed"}

    # Concatenate all OOS returns
    combined_oos = pd.concat(oos_returns_list).sort_index()
    combined_oos = combined_oos[~combined_oos.index.duplicated(keep="first")]
    oos_metrics = compute_all(combined_oos, benchmark.reindex(combined_oos.index).ffill().pct_change())

    # Averages
    avg_is_sharpe = _safe(np.mean([m.get("sharpe") or 0 for m in is_metrics_list]))
    avg_oos_sharpe = _safe(np.mean([m.get("sharpe") or 0 for m in oos_metrics_list]))
    sharpe_degradation = _safe((avg_oos_sharpe or 0) - (avg_is_sharpe or 0))

    # OOS equity curve
    oos_equity = (1 + combined_oos).cumprod()
    oos_equity_list = [{"date": str(d.date()), "value": _safe(v)} for d, v in oos_equity.items()]

    return {
        "n_windows": len(window_results),
        "train_months": train_months,
        "test_months": test_months,
        "window_results": window_results,
        "oos_metrics": {k: v for k, v in oos_metrics.items() if not k.startswith("_")},
        "avg_is_sharpe": avg_is_sharpe,
        "avg_oos_sharpe": avg_oos_sharpe,
        "sharpe_degradation": sharpe_degradation,
        "oos_equity_curve": oos_equity_list,
        "pct_windows_positive": _safe(
            sum(1 for w in window_results if (w.get("oos_cagr") or 0) > 0) / len(window_results)
        ),
    }
