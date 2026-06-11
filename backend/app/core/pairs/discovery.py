"""
Pair discovery engine.
Three-stage approach:
  Stage 1: vectorised correlation matrix → fast pre-filter
  Stage 2: optional sector constraint
  Stage 3: cointegration + spread stats (parallelised)
"""
import logging
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import pandas as pd

from app.core.pairs.stats import compute_pair_stats
from app.core.pairs.spread import build_spread
from app.core.pairs.signals import get_signal

logger = logging.getLogger(__name__)


def _pair_summary(
    ticker1: str, ticker2: str,
    prices1: pd.Series, prices2: pd.Series,
    sector_map: dict,
    spread_type: str,
    hedge_method: str,
    zscore_window: int,
) -> dict | None:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            stats = compute_pair_stats(ticker1, ticker2, prices1, prices2)
            sr    = build_spread(
                prices1, prices2,
                spread_type=spread_type,
                hedge_method=hedge_method,
                zscore_window=zscore_window,
            )
        z_valid  = sr.z_score[~np.isnan(sr.z_score)]
        cur_z    = float(z_valid[-1]) if len(z_valid) > 0 else 0.0
        sig      = get_signal(cur_z)
        return {
            "ticker1": ticker1,
            "ticker2": ticker2,
            "sector1": sector_map.get(ticker1, ""),
            "sector2": sector_map.get(ticker2, ""),
            "pearson_corr":        round(stats.pearson_corr, 3),
            "spearman_corr":       round(stats.spearman_corr, 3),
            "adf_pvalue":          round(stats.adf_pvalue, 4),
            "johansen_trace_stat": round(stats.johansen_trace_stat, 3),
            "is_cointegrated":     stats.is_cointegrated,
            "hurst_exponent":      round(stats.hurst_exponent, 3),
            "half_life_days":      round(stats.half_life_days, 1),
            "volatility_ratio":    round(stats.volatility_ratio, 3),
            "quality_score":       round(stats.quality_score, 1),
            "current_zscore":      round(cur_z, 3),
            "hedge_ratio":         round(sr.hedge_ratio, 4),
            "signal":              sig.signal,
            "n_obs":               stats.n_obs,
        }
    except Exception as e:
        logger.debug(f"Pair {ticker1}/{ticker2} failed: {e}")
        return None


def discover_pairs(
    prices: pd.DataFrame,
    sector_map: dict[str, str] | None = None,
    min_correlation: float = 0.70,
    max_pvalue: float = 0.05,
    sector_filter: str = "any",
    spread_type: str = "log",
    hedge_method: str = "ols",
    zscore_window: int = 30,
    top_n: int = 50,
) -> dict:
    """Discover and rank pair candidates."""
    sector_map = sector_map or {}

    valid = [c for c in prices.columns if prices[c].notna().sum() >= 120]
    if len(valid) < 2:
        return {"pairs": [], "total_tested": 0, "passed_corr": 0, "passed_coint": 0}

    ret  = prices[valid].pct_change().dropna()
    corr = ret.corr()
    cols = list(corr.columns)

    # Stage 1: correlation pre-filter
    candidates = [
        (cols[i], cols[j])
        for i in range(len(cols))
        for j in range(i + 1, len(cols))
        if abs(corr.iat[i, j]) >= min_correlation and not np.isnan(corr.iat[i, j])
    ]
    total_tested  = len(cols) * (len(cols) - 1) // 2
    passed_corr   = len(candidates)

    # Stage 2: sector filter
    if sector_filter == "same" and sector_map:
        candidates = [
            (t1, t2) for t1, t2 in candidates
            if sector_map.get(t1) and sector_map.get(t2) and sector_map[t1] == sector_map[t2]
        ]

    logger.info(f"Pair scan: {total_tested} total, {len(candidates)} after filters")

    if not candidates:
        return {"pairs": [], "total_tested": total_tested,
                "passed_corr": passed_corr, "passed_coint": 0}

    # Stage 3: cointegration + spread in thread pool
    results = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {
            pool.submit(
                _pair_summary,
                t1, t2,
                prices[t1].dropna(), prices[t2].dropna(),
                sector_map, spread_type, hedge_method, zscore_window,
            ): (t1, t2)
            for t1, t2 in candidates
        }
        for fut in as_completed(futures):
            res = fut.result()
            if res and res["adf_pvalue"] <= max_pvalue:
                results.append(res)

    # Sort: most extreme z-score first, weighted by quality
    results.sort(
        key=lambda r: r["quality_score"] * 0.5 + abs(r["current_zscore"]) * 10,
        reverse=True,
    )
    return {
        "pairs": results[:top_n],
        "total_tested": total_tested,
        "passed_corr": passed_corr,
        "passed_coint": len(results),
    }
