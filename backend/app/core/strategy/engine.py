"""
Advanced strategy backtest engine.

Supports multi-factor composite signals, configurable position sizing,
stop loss / take profit, trailing stops, and multiple rebalancing frequencies.
"""
import pandas as pd
import numpy as np
from typing import Optional, List
from dataclasses import dataclass, field
import logging

from app.core.strategy.signals import compute_composite_signal, compute_regime_mask

logger = logging.getLogger(__name__)


@dataclass
class StrategyConfig:
    # Factor weights {signal_name: weight}
    factor_weights: dict = field(default_factory=dict)
    # Regime filters (list of strings, empty = no filter)
    regime_filters: List[str] = field(default_factory=list)
    # Universe
    universe: str = "sp500"
    # Backtest period
    start_date: str = "2020-01-01"
    end_date: Optional[str] = None
    # Portfolio construction
    n_positions: int = 20
    position_sizing: str = "equal"        # "equal" | "signal_weighted" | "vol_target"
    rebalance_frequency: str = "monthly"  # "daily" | "weekly" | "monthly"
    # Risk
    initial_capital: float = 100_000
    leverage: float = 1.0
    stop_loss: Optional[float] = None     # e.g. 0.05 = 5% hard stop
    take_profit: Optional[float] = None   # e.g. 0.15 = 15% take profit
    trailing_stop: Optional[float] = None # e.g. 0.08 = 8% trailing stop
    # Costs
    transaction_cost_bps: float = 10.0
    slippage_bps: float = 5.0
    borrow_cost_annual: float = 0.0       # for short positions


@dataclass
class BacktestResult:
    returns: pd.Series
    benchmark_returns: pd.Series
    equity_curve: pd.Series
    benchmark_equity: pd.Series
    drawdown: pd.Series
    metrics: dict
    regime_metrics: dict
    factor_attribution: dict
    monthly_returns: list
    annual_returns: list
    rolling_sharpe: list
    rolling_vol: list
    holdings_history: list      # [{date, tickers, weights}, ...]
    trade_log: list             # [{date, ticker, action, price, pnl}, ...]
    n_tickers: int


def run_backtest(
    close: pd.DataFrame,
    high: pd.DataFrame,
    low: pd.DataFrame,
    volume: pd.DataFrame,
    benchmark: pd.Series,
    config: StrategyConfig,
) -> BacktestResult:
    """Main backtest entry point."""
    # ── Date filtering ─────────────────────────────────────────────────────
    start = pd.Timestamp(config.start_date)
    end = pd.Timestamp(config.end_date) if config.end_date else close.index[-1]

    close = close.loc[start:end]
    high = high.reindex(close.index)
    low = low.reindex(close.index)
    volume = volume.reindex(close.index)
    benchmark = benchmark.reindex(close.index).ffill()

    if len(close) < 50:
        raise ValueError("Insufficient price history for backtest.")

    # ── Signal computation ─────────────────────────────────────────────────
    logger.info(f"Computing composite signal for {len(close.columns)} tickers...")
    composite = compute_composite_signal(
        close=close,
        high=high,
        low=low,
        volume=volume,
        benchmark=benchmark,
        factor_weights=config.factor_weights,
    )

    # ── Regime mask ────────────────────────────────────────────────────────
    regime_mask = pd.Series(True, index=close.index)
    for rf in config.regime_filters:
        mask = compute_regime_mask(benchmark, None, rf)
        mask = mask.reindex(close.index).fillna(True)
        regime_mask = regime_mask & mask

    # ── Rebalancing dates ──────────────────────────────────────────────────
    rebal_dates = _get_rebal_dates(close.index, config.rebalance_frequency)

    # ── Position-level simulation ──────────────────────────────────────────
    total_cost_bps = config.transaction_cost_bps + config.slippage_bps
    cost_per_trade = total_cost_bps / 10_000

    daily_returns = []
    holdings: dict = {}          # ticker -> entry_price
    trailing_highs: dict = {}    # ticker -> highest price since entry (for trailing stop)
    prev_weights: dict = {}
    holdings_history = []
    trade_log = []

    dates = close.index.tolist()

    for i, date in enumerate(dates):
        is_rebal = date in rebal_dates
        day_ret = 0.0
        n_held = len(holdings)

        if n_held > 0:
            # Compute daily return for each holding
            position_rets = {}
            for ticker, entry_px in list(holdings.items()):
                if ticker not in close.columns:
                    continue
                cur_px = close.loc[date, ticker]
                if pd.isna(cur_px) or entry_px == 0:
                    continue

                # Update trailing high
                if config.trailing_stop is not None:
                    trailing_highs[ticker] = max(trailing_highs.get(ticker, cur_px), cur_px)

                pos_ret = (cur_px / entry_px) - 1
                one_day_ret = close.loc[date, ticker] / close.iloc[i - 1][ticker] - 1 if i > 0 else 0.0

                # Check stop loss
                stopped = False
                if config.stop_loss and pos_ret <= -config.stop_loss:
                    exit_px = entry_px * (1 - config.stop_loss)
                    actual_ret = (exit_px / entry_px) - 1
                    position_rets[ticker] = actual_ret * prev_weights.get(ticker, 1 / n_held)
                    trade_log.append({"date": str(date.date()), "ticker": ticker, "action": "stop_loss",
                                      "pnl": actual_ret})
                    del holdings[ticker]
                    trailing_highs.pop(ticker, None)
                    stopped = True

                elif config.trailing_stop and ticker in trailing_highs:
                    drawdown_from_high = (cur_px / trailing_highs[ticker]) - 1
                    if drawdown_from_high <= -config.trailing_stop:
                        actual_ret = (cur_px / entry_px) - 1
                        position_rets[ticker] = actual_ret * prev_weights.get(ticker, 1 / n_held)
                        trade_log.append({"date": str(date.date()), "ticker": ticker, "action": "trailing_stop",
                                          "pnl": actual_ret})
                        del holdings[ticker]
                        trailing_highs.pop(ticker, None)
                        stopped = True

                elif config.take_profit and pos_ret >= config.take_profit:
                    actual_ret = config.take_profit
                    position_rets[ticker] = actual_ret * prev_weights.get(ticker, 1 / n_held)
                    trade_log.append({"date": str(date.date()), "ticker": ticker, "action": "take_profit",
                                      "pnl": actual_ret})
                    del holdings[ticker]
                    trailing_highs.pop(ticker, None)
                    stopped = True

                if not stopped:
                    w = prev_weights.get(ticker, 1 / n_held)
                    position_rets[ticker] = one_day_ret * w

            day_ret = sum(position_rets.values())

        # Apply leverage
        day_ret *= config.leverage

        # Rebalance
        if is_rebal:
            in_regime = regime_mask.get(date, True)

            if in_regime and not composite.empty and date in composite.index:
                scores = composite.loc[date].dropna()
                avail = scores.index[scores.index.isin(close.columns)]
                scores = scores[avail]

                n = min(config.n_positions, len(scores))
                if n >= 1:
                    top = scores.nlargest(n).index.tolist()

                    # Position weights
                    if config.position_sizing == "signal_weighted":
                        raw = scores[top].clip(lower=0)
                        total = raw.sum()
                        new_weights = {t: float(raw[t] / total) if total > 0 else 1 / n for t in top}
                    elif config.position_sizing == "vol_target":
                        vols = close[top].pct_change().rolling(21).std().loc[date]
                        inv_vol = (1 / vols.replace(0, np.nan)).fillna(0)
                        total = inv_vol.sum()
                        new_weights = {t: float(inv_vol[t] / total) if total > 0 else 1 / n for t in top}
                    else:
                        new_weights = {t: 1.0 / n for t in top}

                    # Compute turnover cost
                    all_t = set(prev_weights) | set(new_weights)
                    turnover = sum(abs(new_weights.get(t, 0) - prev_weights.get(t, 0)) for t in all_t) / 2
                    day_ret -= turnover * cost_per_trade

                    # Update holdings
                    new_holdings = {}
                    for t in top:
                        if date in close.index and t in close.columns:
                            new_holdings[t] = float(close.loc[date, t])
                            trailing_highs[t] = float(close.loc[date, t])

                    # Log trades
                    for t in set(prev_weights) - set(new_weights):
                        trade_log.append({"date": str(date.date()), "ticker": t, "action": "sell", "pnl": None})
                    for t in set(new_weights) - set(prev_weights):
                        trade_log.append({"date": str(date.date()), "ticker": t, "action": "buy", "pnl": None})

                    holdings = new_holdings
                    prev_weights = new_weights

                    holdings_history.append({
                        "date": str(date.date()),
                        "tickers": top[:10],
                        "n": n,
                    })
            elif not in_regime:
                # Exit all positions (regime filter failed)
                if holdings:
                    all_t = set(prev_weights)
                    turnover = sum(prev_weights.get(t, 0) for t in all_t)
                    day_ret -= turnover * cost_per_trade
                    for t in holdings:
                        trade_log.append({"date": str(date.date()), "ticker": t, "action": "regime_exit", "pnl": None})
                holdings = {}
                prev_weights = {}

        daily_returns.append(day_ret)

    port_returns = pd.Series(daily_returns, index=close.index, name="portfolio")
    bm_returns = benchmark.pct_change().reindex(close.index).fillna(0)

    equity_curve = (1 + port_returns).cumprod()
    bm_equity = (1 + bm_returns).cumprod()
    drawdown = (equity_curve / equity_curve.cummax()) - 1

    return BacktestResult(
        returns=port_returns,
        benchmark_returns=bm_returns,
        equity_curve=equity_curve,
        benchmark_equity=bm_equity,
        drawdown=drawdown,
        metrics={},
        regime_metrics={},
        factor_attribution={},
        monthly_returns=[],
        annual_returns=[],
        rolling_sharpe=[],
        rolling_vol=[],
        holdings_history=holdings_history,
        trade_log=trade_log[-200:],  # Limit log size
        n_tickers=len(close.columns),
    )


def _get_rebal_dates(index: pd.DatetimeIndex, frequency: str) -> set:
    if frequency == "daily":
        return set(index)
    elif frequency == "weekly":
        return set(index[index.weekday == 4])  # Fridays
    else:  # monthly (default)
        return set(index[index.is_month_end])
