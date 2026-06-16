"""
Strategy Grader + AI Insights Generator.
Produces a 0-100 score, warnings, and natural-language insights.
"""
from typing import Optional
import numpy as np


def grade_strategy(
    metrics: dict,
    walk_forward: Optional[dict] = None,
) -> dict:
    """Score strategy 0-100 across multiple dimensions."""
    score = 0
    breakdown = {}

    # ── Sharpe Ratio (0-25 points) ────────────────────────────────────────
    sharpe = metrics.get("sharpe") or 0
    sharpe_score = min(25, max(0, (sharpe / 2.0) * 25))
    score += sharpe_score
    breakdown["sharpe"] = round(sharpe_score, 1)

    # ── Max Drawdown (0-20 points) ────────────────────────────────────────
    max_dd = abs(metrics.get("max_drawdown") or 1)
    if max_dd <= 0.10:
        dd_score = 20
    elif max_dd <= 0.20:
        dd_score = 15
    elif max_dd <= 0.30:
        dd_score = 10
    elif max_dd <= 0.40:
        dd_score = 5
    else:
        dd_score = 0
    score += dd_score
    breakdown["drawdown"] = round(dd_score, 1)

    # ── Consistency (0-20 points) — % positive months ─────────────────────
    win_rate = metrics.get("win_rate_monthly") or 0
    consistency_score = min(20, win_rate * 28)
    score += consistency_score
    breakdown["consistency"] = round(consistency_score, 1)

    # ── Calmar Ratio (0-15 points) ────────────────────────────────────────
    calmar = metrics.get("calmar") or 0
    calmar_score = min(15, max(0, (calmar / 3.0) * 15))
    score += calmar_score
    breakdown["calmar"] = round(calmar_score, 1)

    # ── Out-of-Sample (0-20 points, if available) ─────────────────────────
    if walk_forward and not walk_forward.get("error"):
        oos_sharpe = walk_forward.get("avg_oos_sharpe") or 0
        is_sharpe = walk_forward.get("avg_is_sharpe") or 1
        degradation = walk_forward.get("sharpe_degradation") or 0
        pct_positive = walk_forward.get("pct_windows_positive") or 0

        oos_score = min(20, max(0,
            (oos_sharpe / 1.5) * 10 +
            max(0, (1 + degradation / is_sharpe)) * 5 +
            pct_positive * 5
        ))
        score += oos_score
        breakdown["out_of_sample"] = round(oos_score, 1)
    else:
        breakdown["out_of_sample"] = None

    total = min(100, max(0, round(score, 1)))

    # ── Grade Letter ──────────────────────────────────────────────────────
    if total >= 85:
        grade = "A"
    elif total >= 70:
        grade = "B"
    elif total >= 55:
        grade = "C"
    elif total >= 40:
        grade = "D"
    else:
        grade = "F"

    return {
        "score": total,
        "grade": grade,
        "breakdown": breakdown,
    }


def generate_warnings(
    metrics: dict,
    walk_forward: Optional[dict] = None,
    config_dict: Optional[dict] = None,
) -> list:
    """Flag potential issues with the strategy."""
    warnings = []
    sharpe = metrics.get("sharpe") or 0
    max_dd = abs(metrics.get("max_drawdown") or 0)
    calmar = metrics.get("calmar") or 0
    win_rate = metrics.get("win_rate_monthly") or 0
    vol = metrics.get("volatility") or 0
    cagr = metrics.get("cagr") or 0
    sortino = metrics.get("sortino") or 0

    if sharpe < 0.5:
        warnings.append({
            "type": "poor_risk_adjusted_returns",
            "severity": "high",
            "message": f"Sharpe Ratio of {sharpe:.2f} is below acceptable threshold (0.5). Strategy generates insufficient return per unit of risk.",
        })

    if max_dd > 0.35:
        warnings.append({
            "type": "high_drawdown",
            "severity": "high",
            "message": f"Maximum drawdown of {max_dd:.1%} is severe. Most institutional mandates require drawdowns below 20-25%.",
        })

    if calmar < 0.3 and cagr > 0:
        warnings.append({
            "type": "poor_calmar",
            "severity": "medium",
            "message": f"Calmar ratio of {calmar:.2f} suggests risk-adjusted returns are poor relative to drawdown risk.",
        })

    if win_rate < 0.45:
        warnings.append({
            "type": "low_win_rate",
            "severity": "medium",
            "message": f"Monthly win rate of {win_rate:.1%} is below 45%. Strategy may rely on a few large wins.",
        })

    if walk_forward and not walk_forward.get("error"):
        degradation = walk_forward.get("sharpe_degradation") or 0
        pct_pos = walk_forward.get("pct_windows_positive") or 1
        if degradation < -0.5:
            warnings.append({
                "type": "overfitting",
                "severity": "high",
                "message": f"Out-of-sample Sharpe degradation of {degradation:.2f} suggests significant overfitting. Strategy performance may not replicate live.",
            })
        if pct_pos < 0.5:
            warnings.append({
                "type": "weak_oos",
                "severity": "high",
                "message": f"Only {pct_pos:.0%} of OOS windows are profitable. Strategy lacks robustness across market regimes.",
            })

    skew = metrics.get("skewness") or 0
    kurt = metrics.get("kurtosis") or 0
    if kurt > 5:
        warnings.append({
            "type": "tail_risk",
            "severity": "medium",
            "message": f"Return kurtosis of {kurt:.1f} indicates fat tails. Extreme losses more likely than a normal distribution suggests.",
        })
    if skew < -1:
        warnings.append({
            "type": "negative_skew",
            "severity": "medium",
            "message": f"Negative skewness ({skew:.2f}) means losses tend to be larger than gains. Asymmetric downside risk.",
        })

    if vol > 0.30:
        warnings.append({
            "type": "high_volatility",
            "severity": "medium",
            "message": f"Annualized volatility of {vol:.1%} is very high. This strategy may be difficult to hold through drawdowns.",
        })

    return warnings


def generate_insights(
    metrics: dict,
    regime_metrics: Optional[dict] = None,
    factor_attribution: Optional[dict] = None,
    walk_forward: Optional[dict] = None,
    config_dict: Optional[dict] = None,
) -> dict:
    """Generate AI-style insights from backtest results."""
    sharpe = metrics.get("sharpe") or 0
    cagr = metrics.get("cagr") or 0
    max_dd = abs(metrics.get("max_drawdown") or 0)
    vol = metrics.get("volatility") or 0
    beta = metrics.get("beta") or 0
    alpha = metrics.get("alpha") or 0
    win_rate = metrics.get("win_rate_monthly") or 0
    skew = metrics.get("skewness") or 0
    kurt = metrics.get("kurtosis") or 0
    info_ratio = metrics.get("information_ratio") or 0
    sortino = metrics.get("sortino") or 0

    # ── What drove returns? ──────────────────────────────────────────────
    if factor_attribution:
        mkt = factor_attribution.get("market_beta") or 0
        alp = factor_attribution.get("alpha") or 0
        mom = factor_attribution.get("momentum") or 0
        if abs(mkt) > abs(alp):
            driver = f"Market beta exposure ({mkt:.1%} annualized) was the primary return driver. Alpha generation contributed {alp:.1%}."
        else:
            driver = f"Alpha generation ({alp:.1%} annualized) was the primary return driver, suggesting the strategy captures genuine edge beyond market exposure."
        if mom and abs(mom) > 0.02:
            driver += f" Momentum factor contributed {mom:.1%}."
    else:
        if beta and abs(beta) > 1.2:
            driver = f"High market beta ({beta:.2f}) was the primary return driver. The strategy amplifies broad market moves."
        elif alpha and alpha > 0.03:
            driver = f"Positive alpha ({alpha:.1%} annualized) suggests genuine stock selection skill beyond benchmark exposure."
        else:
            driver = f"Returns appear driven by a balanced mix of market exposure (beta: {beta:.2f}) and stock-specific selection (alpha: {alpha:.1%})."

    # ── When strategy performs best ───────────────────────────────────────
    best_regime = None
    worst_regime = None
    if regime_metrics:
        valid = {k: v for k, v in regime_metrics.items() if v is not None}
        if valid:
            best_regime = max(valid, key=lambda k: valid[k].get("sharpe") or -99)
            worst_regime = min(valid, key=lambda k: valid[k].get("sharpe") or 99)

    regime_labels = {
        "bull_market": "trending bull markets",
        "bear_market": "bear/declining markets",
        "high_volatility": "high-volatility environments",
        "low_volatility": "low-volatility, trending markets",
    }
    best_env = regime_labels.get(best_regime, "trending markets") if best_regime else "trending, low-volatility markets"
    worst_env = regime_labels.get(worst_regime, "volatile/choppy conditions") if worst_regime else "volatile or sideways markets"

    # ── Key risks ─────────────────────────────────────────────────────────
    risks = []
    if max_dd > 0.25:
        risks.append(f"significant drawdown risk ({max_dd:.1%} historical maximum)")
    if kurt > 3:
        risks.append("fat-tailed return distribution with potential for extreme losses")
    if skew < -0.5:
        risks.append("negative return skew (losses tend to exceed gains in magnitude)")
    if not risks:
        risks.append("moderate volatility in adverse market conditions")

    # ── Suggested improvements ────────────────────────────────────────────
    improvements = []
    if sharpe < 1.0:
        improvements.append("Add a volatility targeting overlay to improve risk-adjusted returns")
    if max_dd > 0.20:
        improvements.append("Implement a regime filter (exit when SPY < 200-day SMA) to reduce drawdowns")
    if win_rate < 0.50:
        improvements.append("Combine with a mean-reversion signal to improve trade consistency")
    if beta and beta > 1.0:
        improvements.append("Consider a market-neutral variant using long/short construction to reduce beta")
    if info_ratio and info_ratio < 0.3:
        improvements.append("Increase factor diversification — combine momentum with quality or value factors")

    # ── Style classification ──────────────────────────────────────────────
    frequency = config_dict.get("rebalance_frequency", "monthly") if config_dict else "monthly"
    n_pos = config_dict.get("n_positions", 20) if config_dict else 20

    if beta and beta > 1.1:
        style_beta = "high-beta"
    elif beta and beta < 0.7:
        style_beta = "low-beta"
    else:
        style_beta = "moderate-beta"

    if sharpe > 1.5 and vol < 0.15:
        style_type = "systematic equity long/short"
    elif cagr > 0.15 and max_dd > 0.25:
        style_type = "aggressive growth"
    elif sharpe > 1.0 and max_dd < 0.15:
        style_type = "risk-managed systematic equity"
    else:
        style_type = "factor-based systematic equity"

    hedge_fund_style = (
        f"Strategy resembles a {frequency}-rebalanced {style_type} model with {style_beta} market exposure "
        f"and {n_pos}-stock concentration. "
        f"Most returns are generated during {best_env}. "
        f"Performance deteriorates during {worst_env}. "
        f"Sharpe of {sharpe:.2f} and maximum drawdown of {max_dd:.1%} place this in the "
        f"{'institutional-grade' if sharpe > 1.0 and max_dd < 0.25 else 'retail-grade'} strategy tier."
    )

    return {
        "what_drove_returns": driver,
        "best_environment": f"Strategy performs best during {best_env}, where signals generate the highest information ratio.",
        "worst_environment": f"Performance deteriorates during {worst_env}, where signal quality degrades and drawdowns increase.",
        "key_risks": f"Primary risks include: {'; '.join(risks)}.",
        "suggested_improvements": improvements[:3],
        "hedge_fund_classification": hedge_fund_style,
    }
