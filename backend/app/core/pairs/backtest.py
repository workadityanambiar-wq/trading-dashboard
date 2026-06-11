"""
Pairs trading backtester.
Strategy: enter on |z| > entry_threshold, exit on |z| < exit_threshold.
Dollar-neutral sizing. Handles transaction costs, time stops, hard stops.
"""
from dataclasses import dataclass, field
from typing import Literal
import numpy as np
import pandas as pd

from app.core.pairs.spread import build_spread


@dataclass
class TradeRecord:
    entry_date: str
    exit_date: str
    side: Literal["long_spread", "short_spread"]
    entry_z: float
    exit_z: float
    pnl: float
    holding_days: int
    exit_reason: str


@dataclass
class PairsBacktestResult:
    ticker1: str
    ticker2: str
    total_return: float
    cagr: float
    sharpe: float
    sortino: float
    max_drawdown: float
    win_rate: float
    avg_holding_days: float
    profit_factor: float
    n_trades: int
    exposure: float
    equity_curve: list[dict]
    drawdown_series: list[dict]
    trade_log: list[dict]
    monthly_returns: list[dict]


def run_pairs_backtest(
    ticker1: str,
    ticker2: str,
    prices1: pd.Series,
    prices2: pd.Series,
    spread_type: str = "log",
    hedge_method: str = "kalman",
    zscore_window: int = 30,
    entry_threshold: float = 2.0,
    exit_threshold: float = 0.5,
    stop_threshold: float = 3.5,
    max_holding_days: int = 60,
    cost_bps: float = 5.0,
    notional: float = 10_000.0,
) -> PairsBacktestResult:

    sr = build_spread(
        prices1, prices2,
        spread_type=spread_type,
        hedge_method=hedge_method,
        zscore_window=zscore_window,
    )

    dates  = sr.dates
    z      = sr.z_score
    beta   = sr.hedge_ratio_series
    p1_arr = prices1.reindex(dates).values
    p2_arr = prices2.reindex(dates).values
    n      = len(dates)

    cost_factor = cost_bps / 10_000.0
    init_cap    = notional * 2.0

    equity   = np.full(n, init_cap)
    daily_pnl = np.zeros(n)

    in_trade     = False
    trade_side   = None
    entry_idx    = 0
    entry_p1 = entry_p2 = entry_z_val = 0.0
    shares1 = shares2 = 0.0
    hold_days = 0
    trades: list[TradeRecord] = []

    for i in range(zscore_window, n):
        if any(np.isnan(v) for v in [z[i], p1_arr[i], p2_arr[i]]):
            equity[i]    = equity[i - 1]
            daily_pnl[i] = 0.0
            continue

        zi    = float(z[i])
        cp1   = float(p1_arr[i])
        cp2   = float(p2_arr[i])
        hr    = float(beta[i])
        pp1   = float(p1_arr[i - 1]) if i > 0 else cp1
        pp2   = float(p2_arr[i - 1]) if i > 0 else cp2

        if not in_trade:
            equity[i]    = equity[i - 1]
            daily_pnl[i] = 0.0
            if zi < -entry_threshold:
                shares1    = notional / cp1
                shares2    = (notional * hr) / cp2
                cost       = cost_factor * notional * 2.0
                in_trade   = True
                trade_side = "long_spread"
                entry_idx  = i
                entry_p1, entry_p2, entry_z_val = cp1, cp2, zi
                hold_days  = 0
                equity[i]    -= cost
                daily_pnl[i] -= cost
            elif zi > entry_threshold:
                shares1    = notional / cp1
                shares2    = (notional * hr) / cp2
                cost       = cost_factor * notional * 2.0
                in_trade   = True
                trade_side = "short_spread"
                entry_idx  = i
                entry_p1, entry_p2, entry_z_val = cp1, cp2, zi
                hold_days  = 0
                equity[i]    -= cost
                daily_pnl[i] -= cost
        else:
            hold_days += 1
            if trade_side == "long_spread":
                pnl_i = shares1 * (cp1 - pp1) - shares2 * (cp2 - pp2)
            else:
                pnl_i = -shares1 * (cp1 - pp1) + shares2 * (cp2 - pp2)

            equity[i]    = equity[i - 1] + pnl_i
            daily_pnl[i] = pnl_i

            exit_reason = None
            if abs(zi) < exit_threshold:
                exit_reason = "mean_reversion"
            elif abs(zi) > stop_threshold:
                exit_reason = "stop_loss"
            elif hold_days >= max_holding_days:
                exit_reason = "time_stop"

            if exit_reason:
                cost          = cost_factor * notional * 2.0
                equity[i]    -= cost
                daily_pnl[i] -= cost
                trade_pnl     = equity[i] - equity[entry_idx]
                trades.append(TradeRecord(
                    entry_date=str(dates[entry_idx].date()),
                    exit_date=str(dates[i].date()),
                    side=trade_side,
                    entry_z=round(entry_z_val, 3),
                    exit_z=round(zi, 3),
                    pnl=round(float(trade_pnl), 2),
                    holding_days=hold_days,
                    exit_reason=exit_reason,
                ))
                in_trade = False

    # ── Metrics ────────────────────────────────────────────────────────────────
    total_ret  = float(equity[-1] / init_cap - 1.0)
    years      = n / 252.0
    cagr       = float((equity[-1] / init_cap) ** (1.0 / max(years, 0.01)) - 1.0)

    dr         = np.diff(equity) / np.where(equity[:-1] > 0, equity[:-1], 1.0)
    sharpe     = float(dr.mean() / (dr.std() + 1e-12) * np.sqrt(252))
    down_r     = dr[dr < 0]
    sortino    = float(dr.mean() / (down_r.std() + 1e-12) * np.sqrt(252) if len(down_r) > 0 else 0.0)

    peak       = np.maximum.accumulate(equity)
    dd_arr     = (equity - peak) / np.where(peak > 0, peak, 1.0)
    max_dd     = float(dd_arr.min())

    wins       = [t for t in trades if t.pnl > 0]
    losses     = [t for t in trades if t.pnl <= 0]
    win_rate   = float(len(wins) / max(len(trades), 1))
    avg_hold   = float(np.mean([t.holding_days for t in trades]) if trades else 0.0)
    gp         = sum(t.pnl for t in wins)
    gl         = abs(sum(t.pnl for t in losses))
    profit_fac = float(gp / max(gl, 1.0))

    in_mkt     = int(np.sum(daily_pnl[zscore_window:] != 0.0))
    exposure   = float(in_mkt / max(n - zscore_window, 1))

    # ── Format for frontend ────────────────────────────────────────────────────
    equity_out = [
        {"date": str(dates[i].date()), "equity": round(float(equity[i]), 2)}
        for i in range(n)
    ]
    dd_out = [
        {"date": str(dates[i].date()), "drawdown": round(float(dd_arr[i] * 100), 3)}
        for i in range(n)
    ]
    monthly_s = pd.Series(equity, index=dates).resample("ME").last().pct_change().dropna()
    monthly_out = [
        {"year": int(d.year), "month": int(d.month), "return": round(float(v * 100), 2)}
        for d, v in monthly_s.items()
    ]
    trade_log_out = [
        {
            "entry_date": t.entry_date, "exit_date": t.exit_date,
            "side": t.side, "entry_z": t.entry_z, "exit_z": t.exit_z,
            "pnl": t.pnl, "holding_days": t.holding_days, "exit_reason": t.exit_reason,
        }
        for t in trades
    ]

    return PairsBacktestResult(
        ticker1=ticker1, ticker2=ticker2,
        total_return=round(total_ret * 100, 2),
        cagr=round(cagr * 100, 2),
        sharpe=round(sharpe, 3),
        sortino=round(sortino, 3),
        max_drawdown=round(max_dd * 100, 2),
        win_rate=round(win_rate * 100, 1),
        avg_holding_days=round(avg_hold, 1),
        profit_factor=round(profit_fac, 2),
        n_trades=len(trades),
        exposure=round(exposure * 100, 1),
        equity_curve=equity_out,
        drawdown_series=dd_out,
        trade_log=trade_log_out,
        monthly_returns=monthly_out,
    )
