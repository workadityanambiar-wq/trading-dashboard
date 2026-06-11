"""Compute trade performance metrics from MT5 deal history."""
from __future__ import annotations
import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Optional


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


# ── Session / Journal Analytics ────────────────────────────────────────────────

# Session definitions in server local hour (MetaQuotes-Demo ≈ UTC+2)
SESSIONS = {
    "Asian":    (0,  9),
    "London":   (7, 16),
    "New York": (13, 22),
}


def _get_session(hour: int) -> list[str]:
    return [name for name, (start, end) in SESSIONS.items() if start <= hour < end] or ["Other"]


def compute_journal_analytics(deals: list[dict]) -> dict:
    """
    Deep journal analytics:
    - Calendar heatmap, hourly heatmap, session breakdown
    - Long/Short split, duration buckets (scalp/intraday/swing)
    - P&L distribution histogram
    - Revenge trading & overtrading detection
    - Hold-time stats via position_id matching
    """
    if not deals:
        return {}

    closed = [d for d in deals if d.get("entry") in (1, 2) and d.get("symbol")]
    if not closed:
        closed = [d for d in deals if d.get("symbol") and d.get("profit") is not None]

    # Match IN→OUT by position_id to get hold times
    open_times: dict[float, datetime] = {}
    for d in deals:
        if d.get("entry") == 0 and d.get("position_id"):
            try:
                open_times[d["position_id"]] = datetime.fromisoformat(d["time"][:19])
            except Exception:
                pass

    # ── Calendar heatmap ──────────────────────────────────────────────────────
    calendar: dict[str, dict] = defaultdict(lambda: {"pnl": 0.0, "trades": 0})
    for d in closed:
        date = d["time"][:10]
        calendar[date]["pnl"]    += d["profit"]
        calendar[date]["trades"] += 1
    calendar_list = [{"date": k, "pnl": round(v["pnl"], 2), "trades": v["trades"]}
                     for k, v in sorted(calendar.items())]

    # ── Hourly heatmap ────────────────────────────────────────────────────────
    hourly: dict[int, dict] = defaultdict(lambda: {"pnl": 0.0, "trades": 0, "wins": 0})
    for d in closed:
        try:
            hour = datetime.fromisoformat(d["time"][:19]).hour
        except Exception:
            continue
        hourly[hour]["pnl"]    += d["profit"]
        hourly[hour]["trades"] += 1
        if d["profit"] > 0:
            hourly[hour]["wins"] += 1
    hourly_list = [
        {
            "hour":     h,
            "label":    f"{h:02d}:00",
            "pnl":      round(v["pnl"], 2),
            "trades":   v["trades"],
            "win_rate": round(v["wins"] / v["trades"] * 100, 1) if v["trades"] else 0,
        }
        for h, v in sorted(hourly.items())
    ]

    # ── Session breakdown ─────────────────────────────────────────────────────
    sess_map: dict[str, dict] = defaultdict(lambda: {"pnl": 0.0, "trades": 0, "wins": 0})
    for d in closed:
        try:
            hour = datetime.fromisoformat(d["time"][:19]).hour
        except Exception:
            continue
        for sname in _get_session(hour):
            sess_map[sname]["pnl"]    += d["profit"]
            sess_map[sname]["trades"] += 1
            if d["profit"] > 0:
                sess_map[sname]["wins"] += 1
    sessions_list = [
        {
            "session":  s,
            "pnl":      round(v["pnl"], 2),
            "trades":   v["trades"],
            "win_rate": round(v["wins"] / v["trades"] * 100, 1) if v["trades"] else 0,
            "avg_pnl":  round(v["pnl"] / v["trades"], 2) if v["trades"] else 0,
        }
        for s, v in sess_map.items()
    ]

    # ── Long / Short split ────────────────────────────────────────────────────
    long_pnl = short_pnl = 0.0
    long_wins = short_wins = long_total = short_total = 0
    for d in closed:
        t = d.get("type", -1)
        if t == 0:   # buy (DEAL_TYPE_BUY)
            long_total += 1
            long_pnl   += d["profit"]
            if d["profit"] > 0: long_wins += 1
        elif t == 1: # sell (DEAL_TYPE_SELL)
            short_total += 1
            short_pnl   += d["profit"]
            if d["profit"] > 0: short_wins += 1

    long_short = {
        "long":  {"trades": long_total,  "pnl": round(long_pnl,  2),
                  "win_rate": round(long_wins / long_total * 100, 1) if long_total else 0},
        "short": {"trades": short_total, "pnl": round(short_pnl, 2),
                  "win_rate": round(short_wins / short_total * 100, 1) if short_total else 0},
    }

    # ── Duration buckets (using position_id hold time) ────────────────────────
    buckets: dict[str, dict] = defaultdict(lambda: {"pnl": 0.0, "trades": 0, "wins": 0})
    hold_times: list[float] = []
    for d in closed:
        pos_id  = d.get("position_id")
        hold_m: Optional[float] = None
        if pos_id and pos_id in open_times:
            try:
                close_t = datetime.fromisoformat(d["time"][:19])
                hold_m  = (close_t - open_times[pos_id]).total_seconds() / 60
            except Exception:
                pass
        if hold_m is not None:
            hold_times.append(hold_m)
            if hold_m < 30:
                bucket = "Scalp (<30m)"
            elif hold_m < 1440:
                bucket = "Intraday (<1d)"
            else:
                bucket = "Swing (1d+)"
            buckets[bucket]["trades"] += 1
            buckets[bucket]["pnl"]    += d["profit"]
            if d["profit"] > 0:
                buckets[bucket]["wins"] += 1

    duration_list = [
        {
            "bucket":   b,
            "trades":   v["trades"],
            "pnl":      round(v["pnl"], 2),
            "win_rate": round(v["wins"] / v["trades"] * 100, 1) if v["trades"] else 0,
        }
        for b, v in buckets.items()
    ]
    avg_hold_min = round(sum(hold_times) / len(hold_times), 1) if hold_times else None

    # ── P&L distribution histogram ────────────────────────────────────────────
    profits = [d["profit"] for d in closed]
    if profits:
        lo, hi = min(profits), max(profits)
        n_bins  = min(20, max(5, len(profits) // 3))
        width   = (hi - lo) / n_bins if hi != lo else 1.0
        bins: dict[int, int] = defaultdict(int)
        for p in profits:
            b = int((p - lo) / width)
            b = min(b, n_bins - 1)
            bins[b] += 1
        histogram = [
            {"from": round(lo + i * width, 2), "to": round(lo + (i + 1) * width, 2), "count": bins[i]}
            for i in range(n_bins)
        ]
    else:
        histogram = []

    # ── Revenge trading detection ─────────────────────────────────────────────
    REVENGE_WINDOW_MIN = 30
    revenge_trades: list[dict] = []
    sorted_closed = sorted(closed, key=lambda d: d["time"])
    for i, d in enumerate(sorted_closed):
        if d["profit"] >= 0:
            continue
        # Loss — check if next trade(s) opened within window
        try:
            loss_time = datetime.fromisoformat(d["time"][:19])
        except Exception:
            continue
        for j in range(i + 1, min(i + 4, len(sorted_closed))):
            nd = sorted_closed[j]
            try:
                next_time = datetime.fromisoformat(nd["time"][:19])
            except Exception:
                continue
            delta_min = (next_time - loss_time).total_seconds() / 60
            if 0 < delta_min <= REVENGE_WINDOW_MIN:
                revenge_trades.append({
                    "loss_ticket":  d["ticket"],
                    "loss_pnl":     round(d["profit"], 2),
                    "loss_time":    d["time"][:16],
                    "next_ticket":  nd["ticket"],
                    "next_symbol":  nd["symbol"],
                    "minutes_after": round(delta_min, 1),
                    "next_pnl":     round(nd["profit"], 2),
                })

    # ── Overtrading detection ─────────────────────────────────────────────────
    daily_counts = defaultdict(int)
    for d in closed:
        daily_counts[d["time"][:10]] += 1
    if daily_counts:
        vals   = list(daily_counts.values())
        mean_t = sum(vals) / len(vals)
        var_t  = sum((v - mean_t) ** 2 for v in vals) / len(vals)
        std_t  = math.sqrt(var_t)
        thresh = mean_t + 2 * std_t
        overtrading_days = [
            {"date": date, "trades": cnt, "threshold": round(thresh, 1)}
            for date, cnt in sorted(daily_counts.items()) if cnt > thresh
        ]
    else:
        overtrading_days = []

    return {
        "calendar":        calendar_list,
        "hourly":          hourly_list,
        "sessions":        sessions_list,
        "long_short":      long_short,
        "duration_buckets": duration_list,
        "avg_hold_minutes": avg_hold_min,
        "pnl_histogram":   histogram,
        "revenge_trades":  revenge_trades,
        "overtrading_days": overtrading_days,
        "total_closed":    len(closed),
    }


def compute_drawdown_periods(closed_deals: list[dict]) -> dict:
    """
    Identify every distinct drawdown period in the trade history.
    Returns list of {start, end, depth, depth_pct, duration_trades, recovered}.
    """
    if not closed_deals:
        return {"periods": [], "total_time_in_drawdown_pct": 0}

    sorted_deals = sorted(closed_deals, key=lambda d: d["time"])
    profits = [d["profit"] for d in sorted_deals if d.get("entry") in (1, 2) or d.get("symbol")]

    cum = 0.0
    peak = 0.0
    periods = []
    in_dd = False
    dd_start_idx = 0
    dd_peak = 0.0

    for i, pnl in enumerate(profits):
        cum  += pnl
        if cum > peak:
            if in_dd:
                periods.append({
                    "start":            sorted_deals[dd_start_idx]["time"][:10],
                    "end":              sorted_deals[i]["time"][:10],
                    "depth":            round(dd_peak - (cum - pnl), 2),
                    "depth_pct":        round((dd_peak - (cum - pnl)) / dd_peak * 100, 1) if dd_peak > 0 else 0,
                    "duration_trades":  i - dd_start_idx,
                    "recovered":        True,
                })
                in_dd = False
            peak = cum
        else:
            if not in_dd and i > 0:
                in_dd       = True
                dd_start_idx = i
                dd_peak     = peak

    # Ongoing drawdown
    if in_dd:
        periods.append({
            "start":           sorted_deals[dd_start_idx]["time"][:10],
            "end":             sorted_deals[-1]["time"][:10],
            "depth":           round(peak - cum, 2),
            "depth_pct":       round((peak - cum) / peak * 100, 1) if peak > 0 else 0,
            "duration_trades": len(profits) - dd_start_idx,
            "recovered":       False,
        })

    in_dd_trades = sum(p["duration_trades"] for p in periods)
    total_pct = round(in_dd_trades / len(profits) * 100, 1) if profits else 0

    return {
        "periods": sorted(periods, key=lambda x: -x["depth"]),
        "n_periods": len(periods),
        "total_time_in_drawdown_pct": total_pct,
        "avg_depth": round(sum(p["depth"] for p in periods) / len(periods), 2) if periods else 0,
        "avg_duration_trades": round(sum(p["duration_trades"] for p in periods) / len(periods), 1) if periods else 0,
        "longest_dd_trades": max((p["duration_trades"] for p in periods), default=0),
        "deepest_dd": max((p["depth"] for p in periods), default=0),
    }
