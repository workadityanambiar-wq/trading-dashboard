"""Compute trade performance metrics from MT5 deal history."""
from __future__ import annotations
import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any


@dataclass
class TradeMetrics:
    total_trades: int = 0
    winners: int = 0
    losers: int = 0
    breakeven: int = 0
    win_rate: float = 0.0
    total_pnl: float = 0.0
    gross_profit: float = 0.0
    gross_loss: float = 0.0
    profit_factor: float = 0.0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    expectancy: float = 0.0
    max_win: float = 0.0
    max_loss: float = 0.0
    avg_trade_pnl: float = 0.0
    max_drawdown: float = 0.0
    max_drawdown_pct: float = 0.0
    sharpe: float = 0.0
    sortino: float = 0.0
    total_commission: float = 0.0
    total_swap: float = 0.0
    avg_hold_minutes: float = 0.0
    equity_curve: list[dict] = field(default_factory=list)
    drawdown_series: list[dict] = field(default_factory=list)
    daily_returns: list[dict] = field(default_factory=list)
    per_symbol: list[dict] = field(default_factory=list)
    weekday_pnl: list[dict] = field(default_factory=list)
    monthly_pnl: list[dict] = field(default_factory=list)
    consecutive_wins: int = 0
    consecutive_losses: int = 0
    recovery_factor: float = 0.0


def compute_performance(deals: list[dict]) -> TradeMetrics:
    m = TradeMetrics()
    if not deals:
        return m

    # DEAL_ENTRY_OUT = 1, DEAL_ENTRY_INOUT = 2
    closed = [d for d in deals if d.get("entry") in (1, 2) and d.get("symbol")]
    if not closed:
        closed = [d for d in deals if d.get("symbol") and d.get("profit") is not None]

    closed.sort(key=lambda d: d["time"])

    m.total_trades = len(closed)
    m.total_commission = sum(d.get("commission", 0) for d in closed)
    m.total_swap = sum(d.get("swap", 0) for d in closed)

    profits = [d["profit"] for d in closed]
    wins  = [p for p in profits if p > 0]
    loses = [p for p in profits if p < 0]

    m.winners   = len(wins)
    m.losers    = len(loses)
    m.breakeven = m.total_trades - m.winners - m.losers
    m.win_rate  = m.winners / m.total_trades if m.total_trades else 0.0

    m.gross_profit = sum(wins)
    m.gross_loss   = abs(sum(loses))
    m.total_pnl    = sum(profits)
    m.avg_trade_pnl = m.total_pnl / m.total_trades if m.total_trades else 0.0

    m.profit_factor = m.gross_profit / m.gross_loss if m.gross_loss else float("inf") if m.gross_profit > 0 else 0.0
    m.avg_win  = m.gross_profit / m.winners if m.winners else 0.0
    m.avg_loss = m.gross_loss   / m.losers  if m.losers  else 0.0
    m.expectancy = m.win_rate * m.avg_win - (1 - m.win_rate) * m.avg_loss
    m.max_win  = max(profits) if profits else 0.0
    m.max_loss = min(profits) if profits else 0.0

    # Equity curve (cumulative P&L per trade)
    cum = 0.0
    peak = 0.0
    max_dd = 0.0
    eq_curve = []
    dd_series = []
    for i, d in enumerate(closed):
        cum += d["profit"]
        if cum > peak:
            peak = cum
        dd = peak - cum
        if dd > max_dd:
            max_dd = dd
        eq_curve.append({"idx": i + 1, "time": d["time"][:16].replace("T", " "), "equity": round(cum, 2)})
        dd_series.append({"idx": i + 1, "time": d["time"][:16].replace("T", " "), "drawdown": round(-dd, 2)})

    m.equity_curve = eq_curve
    m.drawdown_series = dd_series
    m.max_drawdown = max_dd
    m.max_drawdown_pct = (max_dd / peak * 100) if peak > 0 else 0.0
    m.recovery_factor = m.total_pnl / max_dd if max_dd > 0 else 0.0

    # Daily returns (group by date)
    daily: dict[str, float] = defaultdict(float)
    for d in closed:
        date = d["time"][:10]
        daily[date] += d["profit"]
    daily_ret = sorted(daily.items())
    m.daily_returns = [{"date": k, "pnl": round(v, 2)} for k, v in daily_ret]

    # Sharpe / Sortino (annualised, assumes each trading day = 1 obs)
    if len(daily_ret) >= 2:
        pnls = [v for _, v in daily_ret]
        n = len(pnls)
        mean_ = sum(pnls) / n
        var_  = sum((x - mean_) ** 2 for x in pnls) / n
        std_  = math.sqrt(var_) if var_ > 0 else 0.0
        neg   = [x for x in pnls if x < 0]
        dvar_ = sum(x ** 2 for x in neg) / n if neg else 0.0
        dstd_ = math.sqrt(dvar_) if dvar_ > 0 else 0.0
        ann   = math.sqrt(252)
        m.sharpe  = (mean_ / std_  * ann) if std_  > 0 else 0.0
        m.sortino = (mean_ / dstd_ * ann) if dstd_ > 0 else 0.0

    # Per-symbol breakdown
    sym_map: dict[str, dict] = defaultdict(lambda: {"trades": 0, "wins": 0, "pnl": 0.0, "gross_profit": 0.0, "gross_loss": 0.0})
    for d in closed:
        s = d["symbol"]
        sym_map[s]["trades"] += 1
        sym_map[s]["pnl"] += d["profit"]
        if d["profit"] > 0:
            sym_map[s]["wins"] += 1
            sym_map[s]["gross_profit"] += d["profit"]
        elif d["profit"] < 0:
            sym_map[s]["gross_loss"] += abs(d["profit"])
    per_sym = []
    for sym, v in sorted(sym_map.items(), key=lambda x: -abs(x[1]["pnl"])):
        pf = v["gross_profit"] / v["gross_loss"] if v["gross_loss"] > 0 else 0.0
        per_sym.append({
            "symbol": sym,
            "trades": v["trades"],
            "win_rate": round(v["wins"] / v["trades"] * 100, 1) if v["trades"] else 0.0,
            "pnl": round(v["pnl"], 2),
            "profit_factor": round(pf, 2),
        })
    m.per_symbol = per_sym

    # Weekday P&L
    wd_map: dict[int, float] = defaultdict(float)
    for d in closed:
        wd = datetime.fromisoformat(d["time"][:19]).weekday()
        wd_map[wd] += d["profit"]
    DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    m.weekday_pnl = [{"day": DAYS[i], "pnl": round(wd_map.get(i, 0), 2)} for i in range(5)]

    # Monthly P&L
    mo_map: dict[str, float] = defaultdict(float)
    for d in closed:
        key = d["time"][:7]
        mo_map[key] += d["profit"]
    m.monthly_pnl = [{"month": k, "pnl": round(v, 2)} for k, v in sorted(mo_map.items())]

    # Consecutive wins/losses
    max_cw = cw = 0
    max_cl = cl = 0
    for p in profits:
        if p > 0:
            cw += 1; cl = 0
            max_cw = max(max_cw, cw)
        elif p < 0:
            cl += 1; cw = 0
            max_cl = max(max_cl, cl)
        else:
            cw = cl = 0
    m.consecutive_wins   = max_cw
    m.consecutive_losses = max_cl

    return m
