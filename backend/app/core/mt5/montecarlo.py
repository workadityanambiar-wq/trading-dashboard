"""Monte Carlo simulation via bootstrap resampling of historical trade P&Ls."""
from __future__ import annotations
import random
import math
from collections import defaultdict


def run_montecarlo(
    trade_pnls: list[float],
    starting_equity: float = 0.0,
    n_paths: int = 500,
    forward_trades: int = 100,
) -> dict:
    if len(trade_pnls) < 5:
        return {"error": "Need at least 5 closed trades", "paths": [], "percentiles": []}

    rng = random.Random(42)
    paths: list[list[float]] = []

    for _ in range(n_paths):
        equity = starting_equity
        path   = [round(equity, 2)]
        for _ in range(forward_trades):
            pnl    = rng.choice(trade_pnls)
            equity += pnl
            path.append(round(equity, 2))
        paths.append(path)

    # Percentile bands at each step
    pct_series: list[dict] = []
    for step in range(forward_trades + 1):
        values = sorted(p[step] for p in paths)
        n      = len(values)
        def pct(q: float) -> float:
            idx = int(q / 100 * (n - 1))
            return round(values[idx], 2)
        pct_series.append({
            "trade": step,
            "p5":  pct(5),
            "p25": pct(25),
            "p50": pct(50),
            "p75": pct(75),
            "p95": pct(95),
        })

    # Summary stats across final equity
    finals = sorted(p[-1] for p in paths)
    n = len(finals)
    mean_final = sum(finals) / n
    prob_profit = sum(1 for f in finals if f > starting_equity) / n * 100

    # Max drawdown distribution
    mdd_list = []
    for path in paths:
        peak = path[0]
        mdd  = 0.0
        for v in path:
            if v > peak:
                peak = v
            dd = peak - v
            if dd > mdd:
                mdd = dd
        mdd_list.append(mdd)
    mdd_list.sort()
    median_mdd = mdd_list[n // 2]
    worst_mdd  = mdd_list[int(0.95 * n)]

    return {
        "n_paths":       n_paths,
        "forward_trades": forward_trades,
        "starting_equity": starting_equity,
        "percentiles":   pct_series,
        "summary": {
            "median_final":     round(finals[n // 2], 2),
            "mean_final":       round(mean_final, 2),
            "p5_final":         round(finals[int(0.05 * n)], 2),
            "p95_final":        round(finals[int(0.95 * n)], 2),
            "prob_profit_pct":  round(prob_profit, 1),
            "median_max_dd":    round(median_mdd, 2),
            "worst_case_mdd":   round(worst_mdd, 2),
        },
    }
