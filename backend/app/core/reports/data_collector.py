"""
Collects and computes all metrics needed for report generation.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from app.core.data.cache import _conn


@dataclass
class ReportMetrics:
    # Identity
    report_name: str = "Portfolio Report"
    tickers: List[str] = field(default_factory=list)
    benchmark: str = "SPY"
    start_date: str = ""
    end_date: str = ""
    portfolio_value: float = 1_000_000.0
    weights: Dict[str, float] = field(default_factory=dict)

    # Time series (for charts)
    daily_returns: pd.Series = field(default_factory=pd.Series)
    benchmark_returns: pd.Series = field(default_factory=pd.Series)
    equity_curve: pd.Series = field(default_factory=pd.Series)
    benchmark_curve: pd.Series = field(default_factory=pd.Series)
    drawdown_curve: pd.Series = field(default_factory=pd.Series)
    rolling_sharpe: pd.Series = field(default_factory=pd.Series)
    rolling_vol: pd.Series = field(default_factory=pd.Series)
    monthly_returns_table: pd.DataFrame = field(default_factory=pd.DataFrame)
    annual_returns: pd.Series = field(default_factory=pd.Series)
    benchmark_annual: pd.Series = field(default_factory=pd.Series)

    # Scalar metrics
    total_return: float = 0.0
    cagr: float = 0.0
    volatility: float = 0.0
    downside_vol: float = 0.0
    max_drawdown: float = 0.0
    max_drawdown_duration: int = 0
    var_95: float = 0.0
    cvar_95: float = 0.0

    sharpe: float = 0.0
    sortino: float = 0.0
    calmar: float = 0.0
    information_ratio: float = 0.0
    treynor: float = 0.0

    alpha: float = 0.0
    beta: float = 1.0

    win_rate: float = 0.0
    profit_factor: float = 0.0
    best_day: float = 0.0
    worst_day: float = 0.0
    avg_daily_return: float = 0.0

    risk_score: int = 50
    risk_label: str = "Moderate"

    # Cross-asset
    correlation_matrix: pd.DataFrame = field(default_factory=pd.DataFrame)
    individual_returns: Dict[str, float] = field(default_factory=dict)
    individual_vol: Dict[str, float] = field(default_factory=dict)
    individual_sharpe: Dict[str, float] = field(default_factory=dict)

    # Optional backtest/strategy fields
    trade_log: List[Dict] = field(default_factory=list)
    factor_exposures: Dict[str, float] = field(default_factory=dict)
    strategy_config: Dict = field(default_factory=dict)

    # Pre-computed override (from strategy builder)
    injected_metrics: Dict = field(default_factory=dict)


def _load_prices(tickers: List[str], start: str, end: str) -> pd.DataFrame:
    if not tickers:
        return pd.DataFrame()
    placeholders = ",".join(["?" for _ in tickers])
    with _conn() as con:
        df = con.execute(
            f"""SELECT date, ticker, adj_close
                FROM prices
                WHERE ticker IN ({placeholders}) AND date >= ? AND date <= ?
                ORDER BY date""",
            tickers + [start, end],
        ).fetchdf()
    if df.empty:
        return pd.DataFrame()
    pivot = df.pivot(index="date", columns="ticker", values="adj_close")
    pivot.index = pd.to_datetime(pivot.index)
    return pivot.sort_index().ffill().dropna(how="all")


def _drawdown_duration(dd_series: pd.Series) -> int:
    """Longest consecutive drawdown period in days."""
    in_dd = dd_series < 0
    max_run = 0
    current = 0
    for val in in_dd:
        if val:
            current += 1
            max_run = max(max_run, current)
        else:
            current = 0
    return max_run


def collect_metrics(
    tickers: List[str],
    start_date: str,
    end_date: str,
    weights: Optional[Dict[str, float]] = None,
    benchmark: str = "SPY",
    portfolio_value: float = 1_000_000.0,
    report_name: str = "Portfolio Report",
    injected: Optional[Dict] = None,
) -> ReportMetrics:
    m = ReportMetrics(
        report_name=report_name,
        tickers=tickers,
        benchmark=benchmark,
        start_date=start_date,
        end_date=end_date,
        portfolio_value=portfolio_value,
    )

    if injected:
        m.injected_metrics = injected
        _fill_from_injected(m, injected)
        return m

    all_t = list(dict.fromkeys(tickers + [benchmark]))
    prices = _load_prices(all_t, start_date, end_date)
    if prices.empty:
        return m

    port_t = [t for t in tickers if t in prices.columns]
    if not port_t:
        return m

    n = len(port_t)
    if not weights:
        w = {t: 1.0 / n for t in port_t}
    else:
        total = sum(weights.get(t, 0) for t in port_t) or 1.0
        w = {t: weights.get(t, 1.0 / n) / total for t in port_t}
    m.weights = w

    port_prices = prices[port_t]
    port_rets_df = port_prices.pct_change().dropna()
    port_ret = sum(port_rets_df[t] * w[t] for t in port_t)

    bench_ret = None
    if benchmark in prices.columns:
        bench_ret = prices[benchmark].pct_change().dropna()
        common = port_ret.index.intersection(bench_ret.index)
        port_ret = port_ret.loc[common]
        bench_ret = bench_ret.loc[common]
        m.benchmark_returns = bench_ret

    m.daily_returns = port_ret
    rf_daily = 0.05 / 252

    equity = (1 + port_ret).cumprod() * portfolio_value
    m.equity_curve = equity

    if bench_ret is not None:
        m.benchmark_curve = (1 + bench_ret).cumprod() * portfolio_value

    n_years = max(len(port_ret) / 252, 0.01)
    final_val = equity.iloc[-1] / portfolio_value if not equity.empty else 1.0
    m.total_return = final_val - 1.0
    m.cagr = (1 + m.total_return) ** (1 / n_years) - 1

    m.volatility = float(port_ret.std() * np.sqrt(252))
    neg = port_ret[port_ret < 0]
    m.downside_vol = float(neg.std() * np.sqrt(252)) if not neg.empty else 0.0

    roll_max = equity.cummax()
    dd = (equity - roll_max) / roll_max
    m.drawdown_curve = dd
    m.max_drawdown = float(dd.min())
    m.max_drawdown_duration = _drawdown_duration(dd)

    m.var_95 = float(np.percentile(port_ret, 5))
    tail = port_ret[port_ret <= m.var_95]
    m.cvar_95 = float(tail.mean()) if not tail.empty else m.var_95

    excess = port_ret - rf_daily
    std = port_ret.std()
    m.sharpe = float(excess.mean() / std * np.sqrt(252)) if std > 0 else 0.0
    m.sortino = float(excess.mean() / max(neg.std(), 1e-9) * np.sqrt(252)) if not neg.empty else 0.0
    m.calmar = float(m.cagr / abs(m.max_drawdown)) if m.max_drawdown != 0 else 0.0

    if bench_ret is not None and len(bench_ret) > 5:
        cov = np.cov(port_ret.values, bench_ret.values)
        m.beta = cov[0, 1] / max(cov[1, 1], 1e-9)
        bench_cagr = float((1 + bench_ret).prod() ** (252 / len(bench_ret)) - 1)
        m.alpha = m.cagr - (0.05 + m.beta * (bench_cagr - 0.05))
        active = port_ret - bench_ret
        m.information_ratio = float(active.mean() / active.std() * np.sqrt(252)) if active.std() > 0 else 0.0
        m.treynor = float((m.cagr - 0.05) / m.beta) if m.beta != 0 else 0.0

    m.win_rate = float((port_ret > 0).mean())
    m.best_day = float(port_ret.max())
    m.worst_day = float(port_ret.min())
    m.avg_daily_return = float(port_ret.mean())
    pos_sum = port_ret[port_ret > 0].sum()
    neg_sum = abs(port_ret[port_ret < 0].sum())
    m.profit_factor = float(pos_sum / neg_sum) if neg_sum > 0 else 999.0

    # Monthly returns table
    monthly = port_ret.resample("ME").apply(lambda x: (1 + x).prod() - 1)
    monthly.index = monthly.index.to_period("M")
    mdf = pd.DataFrame({"r": monthly})
    mdf["year"] = mdf.index.year
    mdf["month"] = mdf.index.month
    m.monthly_returns_table = mdf.pivot(index="year", columns="month", values="r")

    # Annual returns
    annual = port_ret.resample("YE").apply(lambda x: (1 + x).prod() - 1)
    m.annual_returns = annual

    if bench_ret is not None:
        m.benchmark_annual = bench_ret.resample("YE").apply(lambda x: (1 + x).prod() - 1)

    # Rolling
    m.rolling_sharpe = (port_ret.rolling(30).mean() - rf_daily) / port_ret.rolling(30).std() * np.sqrt(252)
    m.rolling_vol = port_ret.rolling(30).std() * np.sqrt(252)

    # Per-ticker stats
    for t in port_t:
        r = port_rets_df[t].dropna()
        m.individual_returns[t] = float((1 + r).prod() - 1)
        m.individual_vol[t] = float(r.std() * np.sqrt(252))
        s = (r - rf_daily).mean() / r.std() * np.sqrt(252) if r.std() > 0 else 0.0
        m.individual_sharpe[t] = float(s)

    if len(port_t) > 1:
        m.correlation_matrix = port_rets_df.corr()

    # Risk score
    vol_s = min(m.volatility / 0.40 * 40, 40)
    dd_s = min(abs(m.max_drawdown) / 0.60 * 35, 35)
    sharpe_s = max(25 - m.sharpe * 8, 0)
    m.risk_score = int(min(vol_s + dd_s + sharpe_s, 100))
    if m.risk_score < 25:
        m.risk_label = "Low"
    elif m.risk_score < 45:
        m.risk_label = "Low–Medium"
    elif m.risk_score < 60:
        m.risk_label = "Medium"
    elif m.risk_score < 75:
        m.risk_label = "Medium–High"
    else:
        m.risk_label = "High"

    return m


def _fill_from_injected(m: ReportMetrics, data: Dict):
    """Map pre-computed backtest/strategy result into ReportMetrics."""
    for key, val in data.items():
        if hasattr(m, key):
            try:
                setattr(m, key, val)
            except Exception:
                pass
