"""
Rule-based AI commentary generator — produces hedge-fund-quality narrative
from computed metrics, no LLM required.
"""
from __future__ import annotations
from typing import Dict
from app.core.reports.data_collector import ReportMetrics


def _pct(v: float, dec: int = 1) -> str:
    return f"{v * 100:+.{dec}f}%"


def _f(v: float, dec: int = 2) -> str:
    return f"{v:.{dec}f}"


def _regime(sharpe: float, vol: float) -> str:
    if sharpe > 1.5 and vol < 0.15:
        return "low-volatility trending regime"
    if sharpe > 1.0:
        return "broadly favourable market environment"
    if sharpe < 0:
        return "challenging risk-off environment"
    return "mixed macro environment"


def generate_executive_summary(m: ReportMetrics) -> str:
    regime = _regime(m.sharpe, m.volatility)
    dd_comment = (
        "Drawdowns remained contained"
        if abs(m.max_drawdown) < 0.10 else
        "The strategy experienced elevated drawdowns"
        if abs(m.max_drawdown) > 0.25 else
        "Drawdowns were within acceptable risk parameters"
    )

    alpha_txt = (
        f"delivered alpha of {_pct(m.alpha)} over the benchmark"
        if m.alpha > 0.01 else
        "underperformed the benchmark on a risk-adjusted basis"
        if m.alpha < -0.01 else
        "tracked the benchmark closely on a risk-adjusted basis"
    )

    return (
        f"The portfolio generated a total return of {_pct(m.total_return)} "
        f"({_pct(m.cagr)} annualized) during the analysis period, operating within a {regime}. "
        f"The strategy {alpha_txt} (alpha: {_pct(m.alpha)}, beta: {_f(m.beta)}). "
        f"{dd_comment}, with a maximum drawdown of {_pct(m.max_drawdown)} "
        f"over {m.max_drawdown_duration} trading days. "
        f"The Sharpe Ratio of {_f(m.sharpe)} and Sortino Ratio of {_f(m.sortino)} "
        f"reflect {'strong' if m.sharpe > 1.2 else 'adequate' if m.sharpe > 0.6 else 'below-average'} "
        f"risk-adjusted performance relative to institutional benchmarks. "
        f"Win rate of {_pct(m.win_rate, 0)} on daily observations, with a profit factor of {_f(m.profit_factor)}."
    )


def generate_performance_insights(m: ReportMetrics) -> Dict[str, str]:
    # Best / worst tickers
    sorted_ret = sorted(m.individual_returns.items(), key=lambda x: x[1], reverse=True)
    best = sorted_ret[:3] if sorted_ret else []
    worst = sorted_ret[-3:][::-1] if sorted_ret else []

    best_str = ", ".join(
        f"{t} ({_pct(r)})" for t, r in best
    ) or "N/A"
    worst_str = ", ".join(
        f"{t} ({_pct(r)})" for t, r in worst
    ) or "N/A"

    cagr_quality = (
        "exceptional" if m.cagr > 0.20 else
        "strong" if m.cagr > 0.12 else
        "moderate" if m.cagr > 0.06 else
        "below-benchmark"
    )

    return {
        "headline": (
            f"The portfolio delivered a {cagr_quality} annualized return of {_pct(m.cagr)} "
            f"over the period, with annualized volatility of {_pct(m.volatility)}."
        ),
        "best_performers": f"Top contributors: {best_str}.",
        "worst_performers": f"Largest detractors: {worst_str}.",
        "monthly_consistency": (
            f"The strategy generated positive monthly returns "
            f"{_pct(m.win_rate, 0)} of the time, "
            f"with best single-day return of {_pct(m.best_day)} and "
            f"worst of {_pct(m.worst_day)}."
        ),
    }


def generate_risk_insights(m: ReportMetrics) -> Dict[str, str]:
    corr_risk = ""
    if not m.correlation_matrix.empty and len(m.correlation_matrix) > 1:
        corr_vals = m.correlation_matrix.values
        upper = [
            corr_vals[i, j]
            for i in range(len(corr_vals))
            for j in range(i + 1, len(corr_vals))
        ]
        avg_corr = sum(upper) / max(len(upper), 1)
        if avg_corr > 0.70:
            corr_risk = (
                f"Average pairwise correlation of {avg_corr:.2f} indicates high concentration risk — "
                "positions tend to move together, limiting diversification benefit."
            )
        elif avg_corr < 0.30:
            corr_risk = (
                f"Low average correlation ({avg_corr:.2f}) suggests strong diversification "
                "across holdings, buffering against idiosyncratic shocks."
            )
        else:
            corr_risk = (
                f"Average correlation of {avg_corr:.2f} reflects moderate diversification "
                "with some co-movement risk during stress periods."
            )

    dd_narrative = (
        f"The maximum drawdown of {_pct(m.max_drawdown)} "
        f"(lasting {m.max_drawdown_duration} days) represents the primary historical risk event. "
        + (
            "This level of drawdown is consistent with conservative institutional mandates."
            if abs(m.max_drawdown) < 0.10 else
            "This exceeds typical drawdown thresholds for balanced mandates and warrants review of position sizing."
            if abs(m.max_drawdown) > 0.25 else
            "The drawdown is within acceptable limits for growth-oriented mandates."
        )
    )

    return {
        "drawdown": dd_narrative,
        "tail_risk": (
            f"Daily VaR (95%) stands at {_pct(m.var_95)}, with CVaR (expected shortfall) "
            f"of {_pct(m.cvar_95)} — indicating "
            + ("limited" if abs(m.cvar_95) < 0.02 else "elevated" if abs(m.cvar_95) > 0.04 else "moderate")
            + " tail risk."
        ),
        "correlation": corr_risk,
        "volatility": (
            f"Realized annualized volatility of {_pct(m.volatility)} vs "
            f"downside-only volatility of {_pct(m.downside_vol)}, suggesting "
            + (
                "symmetric return distribution."
                if abs(m.volatility - m.downside_vol) < 0.02 else
                "positively skewed returns (more upside volatility)."
                if m.volatility > m.downside_vol else
                "negatively skewed returns (more downside volatility)."
            )
        ),
    }


def generate_strategy_insights(m: ReportMetrics) -> Dict[str, str]:
    sharpe_comment = (
        "Top-quartile risk-adjusted performance (Sharpe > 1.5) "
        "consistent with institutional-grade strategies."
        if m.sharpe > 1.5 else
        "Above-median risk-adjusted performance."
        if m.sharpe > 1.0 else
        "Risk-adjusted performance is below the institutional 1.0 threshold — "
        "consider volatility-scaling or factor refinements."
        if m.sharpe < 0.8 else
        "Adequate risk-adjusted return profile."
    )

    calmar_comment = (
        f"Calmar Ratio of {_f(m.calmar)} suggests "
        + (
            "exceptional drawdown efficiency — CAGR meaningfully exceeds max drawdown."
            if m.calmar > 1.5 else
            "acceptable return-to-drawdown relationship."
            if m.calmar > 0.5 else
            "the strategy earns inadequate return per unit of drawdown risk taken."
        )
    )

    improvement = []
    if m.sharpe < 1.0:
        improvement.append("Optimize factor weights to improve Sharpe toward 1.0+")
    if abs(m.max_drawdown) > 0.20:
        improvement.append("Implement trailing stop-loss or volatility targeting to cap drawdown")
    if m.volatility > 0.25:
        improvement.append("Consider position-level volatility scaling to reduce aggregate vol")
    if not improvement:
        improvement.append("Strategy metrics are within institutional quality parameters")
        improvement.append("Consider increasing position concentration in highest-Sharpe holdings")

    return {
        "sharpe": sharpe_comment,
        "calmar": calmar_comment,
        "improvements": improvement,
        "regime_fit": (
            "Strategy shows consistent returns across periods — low regime sensitivity."
            if m.win_rate > 0.55 else
            "Returns are regime-dependent — consider regime filters to improve consistency."
        ),
    }


def generate_all(m: ReportMetrics) -> Dict[str, object]:
    return {
        "executive_summary": generate_executive_summary(m),
        "performance": generate_performance_insights(m),
        "risk": generate_risk_insights(m),
        "strategy": generate_strategy_insights(m),
    }
