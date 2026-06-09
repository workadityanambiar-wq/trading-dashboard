"""
Cross-sectional long-only factor strategy backtester.

At each monthly rebalance date:
  1. Score universe by factor, select top-N stocks.
  2. Compute turnover vs previous holdings.
  3. Deduct transaction cost on the first execution day.
  4. Hold equal-weight until next rebalance.

Returns daily portfolio return series.
"""
import pandas as pd
import numpy as np
from typing import Optional
import logging

from app.core.factors.engine import FactorEngine

logger = logging.getLogger(__name__)


def run(
    prices: pd.DataFrame,
    factor: str,
    top_n: int = 50,
    cost_bps: float = 10.0,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> pd.Series:
    """
    Run a monthly-rebalanced cross-sectional strategy.

    Args:
        prices:     Wide-format adj_close (DatetimeIndex × tickers).
        factor:     Factor key, e.g. 'momentum_12_1'.
        top_n:      Number of stocks to hold at each rebalance.
        cost_bps:   One-way transaction cost in basis points.
        start_date: Earliest date to include in the output (ISO string).
        end_date:   Latest date to include in the output (ISO string).

    Returns:
        pd.Series of daily portfolio returns (not cumulative).
    """
    if start_date:
        prices = prices[prices.index >= pd.Timestamp(start_date)]
    if end_date:
        prices = prices[prices.index <= pd.Timestamp(end_date)]
    if prices.empty or len(prices) < 30:
        return pd.Series(dtype=float, name="portfolio")

    engine = FactorEngine(prices)
    factor_hist = engine.factor_history(factor)

    if factor_hist.empty:
        logger.warning("factor_history returned empty — insufficient price history")
        return pd.Series(dtype=float, name="portfolio")

    daily_ret = prices.pct_change()
    rebal_dates = sorted(factor_hist.index)

    prev_weights: dict[str, float] = {}
    port_rets: dict[pd.Timestamp, float] = {}

    for i, t0 in enumerate(rebal_dates):
        t1 = rebal_dates[i + 1] if i + 1 < len(rebal_dates) else prices.index[-1]

        # Build new portfolio
        scores = factor_hist.loc[t0].dropna()
        avail = scores.index[scores.index.isin(prices.columns)]
        scores = scores[avail]
        n = min(top_n, len(scores))
        if n < 1:
            prev_weights = {}
            continue

        top_tickers = scores.nlargest(n).index.tolist()
        new_weights = {t: 1.0 / n for t in top_tickers}

        # Turnover and cost
        all_t = set(prev_weights) | set(new_weights)
        turnover = sum(
            abs(new_weights.get(t, 0.0) - prev_weights.get(t, 0.0)) for t in all_t
        ) / 2.0
        cost = turnover * cost_bps / 10_000.0

        # Locate period slice: the day AFTER t0 through t1 (inclusive)
        try:
            idx0 = prices.index.get_loc(t0)
        except KeyError:
            prev_weights = new_weights
            continue

        # Find the index of t1 — use searchsorted for robustness
        idx1 = prices.index.searchsorted(t1)
        if idx1 >= len(prices):
            idx1 = len(prices) - 1

        period_dates = prices.index[idx0 + 1 : idx1 + 1]

        for j, date in enumerate(period_dates):
            row = daily_ret.loc[date, top_tickers].dropna()
            ret = float(row.mean()) if not row.empty else 0.0
            if j == 0:
                ret -= cost  # deduct cost on execution day
            port_rets[date] = ret

        prev_weights = new_weights

    result = pd.Series(port_rets, name="portfolio").sort_index()
    result = result[~result.index.duplicated(keep="first")]
    return result


def compute_equity_curve(returns: pd.Series) -> pd.Series:
    """Cumulative return starting at 1.0."""
    return (1 + returns).cumprod()


def compute_drawdown(returns: pd.Series) -> pd.Series:
    """Drawdown series (always <= 0)."""
    eq = compute_equity_curve(returns)
    return eq / eq.cummax() - 1


def compute_monthly_returns(returns: pd.Series) -> pd.DataFrame:
    """
    Monthly return grid.
    Returns DataFrame indexed by year, columns=1..12 (month number).
    """
    monthly = (1 + returns).resample("ME").prod() - 1
    df = monthly.to_frame("ret")
    df["year"] = df.index.year
    df["month"] = df.index.month
    pivot = df.pivot(index="year", columns="month", values="ret")
    pivot.columns = [int(c) for c in pivot.columns]
    return pivot


def compute_rolling_sharpe(returns: pd.Series, window: int = 252) -> pd.Series:
    """Rolling annualized Sharpe ratio."""
    return (
        returns.rolling(window)
        .apply(lambda r: (r.mean() / r.std()) * np.sqrt(252) if r.std() > 0 else 0.0)
        .rename("rolling_sharpe")
    )
