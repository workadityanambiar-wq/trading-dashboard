"""
Monte Carlo simulation for the Strategy Builder.
Bootstraps daily returns to generate N future-path simulations.
"""
import pandas as pd
import numpy as np
from app.core.strategy.metrics import _safe


def run_monte_carlo(
    returns: pd.Series,
    n_simulations: int = 1000,
    horizon_days: int = 252,
    confidence_levels: tuple = (0.05, 0.25, 0.50, 0.75, 0.95),
    seed: int = 42,
) -> dict:
    """Bootstrap Monte Carlo simulation on historical returns."""
    np.random.seed(seed)
    r = returns.dropna().values
    if len(r) < 20:
        return {"error": "Insufficient return history for Monte Carlo"}

    # Bootstrap: randomly sample daily returns with replacement
    simulations = np.random.choice(r, size=(n_simulations, horizon_days), replace=True)
    paths = np.cumprod(1 + simulations, axis=1)  # shape: (n_sim, horizon)

    # Final values
    final_values = paths[:, -1]
    final_returns = final_values - 1

    # Percentile paths (for chart)
    pct_paths = {}
    for p in confidence_levels:
        pct_paths[f"p{int(p*100)}"] = [
            _safe(float(np.percentile(paths[:, t], p * 100)))
            for t in range(horizon_days)
        ]

    # Statistics
    prob_profit = float(np.mean(final_returns > 0))
    prob_loss_10 = float(np.mean(final_returns < -0.10))
    prob_loss_20 = float(np.mean(final_returns < -0.20))
    prob_gain_20 = float(np.mean(final_returns > 0.20))
    prob_gain_50 = float(np.mean(final_returns > 0.50))

    expected_return = float(np.mean(final_returns))
    median_return = float(np.median(final_returns))
    std_return = float(np.std(final_returns))

    # Return histogram (for distribution chart)
    hist_counts, hist_edges = np.histogram(final_returns, bins=50)
    histogram = [
        {
            "bin_center": _safe(float((hist_edges[i] + hist_edges[i + 1]) / 2)),
            "count": int(hist_counts[i]),
            "pct": _safe(float(hist_counts[i] / n_simulations)),
        }
        for i in range(len(hist_counts))
    ]

    # Paths for chart (sample 50 paths for visualization)
    sample_idx = np.random.choice(n_simulations, min(50, n_simulations), replace=False)
    sample_paths = [
        [_safe(float(v)) for v in paths[i]]
        for i in sample_idx
    ]

    return {
        "n_simulations": n_simulations,
        "horizon_days": horizon_days,
        "statistics": {
            "expected_return": _safe(expected_return),
            "median_return": _safe(median_return),
            "std_return": _safe(std_return),
            "prob_profit": _safe(prob_profit),
            "prob_loss_10pct": _safe(prob_loss_10),
            "prob_loss_20pct": _safe(prob_loss_20),
            "prob_gain_20pct": _safe(prob_gain_20),
            "prob_gain_50pct": _safe(prob_gain_50),
            "p5_return": _safe(float(np.percentile(final_returns, 5))),
            "p25_return": _safe(float(np.percentile(final_returns, 25))),
            "p75_return": _safe(float(np.percentile(final_returns, 75))),
            "p95_return": _safe(float(np.percentile(final_returns, 95))),
        },
        "percentile_paths": pct_paths,
        "sample_paths": sample_paths,
        "histogram": histogram,
    }
