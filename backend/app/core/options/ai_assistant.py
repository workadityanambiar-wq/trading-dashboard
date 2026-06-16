"""
Rule-based AI commentary for options strategies — institutional quality.
"""
from __future__ import annotations

from typing import Optional


def _iv_regime(iv_rank: float, iv_pct: float) -> str:
    if iv_rank >= 80:
        return "Very High"
    if iv_rank >= 60:
        return "High"
    if iv_rank >= 40:
        return "Average"
    if iv_rank >= 20:
        return "Low"
    return "Very Low"


def options_ai_analysis(
    S: float,
    K: float,
    T_days: int,
    sigma: float,
    iv_rank: float,
    iv_pct: float,
    delta: Optional[float] = None,
    pcr: Optional[float] = None,
    gex_regime: Optional[str] = None,
    max_pain_strike: Optional[float] = None,
    outlook: str = "neutral",    # "bullish" | "bearish" | "neutral"
    ticker: str = "",
) -> dict:
    iv_regime  = _iv_regime(iv_rank, iv_pct)
    iv_pct_str = f"{sigma*100:.1f}%"
    move_pct   = sigma * (T_days / 365) ** 0.5 * 100

    # ── Strategy recommendation ───────────────────────────────────────────────
    if iv_rank >= 70:
        if outlook == "neutral":
            primary   = "Iron Condor or Short Strangle"
            rationale = (
                "IV Rank is elevated, indicating options are historically expensive. "
                "Premium-selling strategies offer a statistical edge as elevated IV "
                "tends to mean-revert, creating IV crush that benefits short-vol trades."
            )
        elif outlook == "bullish":
            primary   = "Bull Put Spread (Credit)"
            rationale = (
                f"IV Rank of {iv_rank:.0f} favors premium selling. "
                "A bull put spread collects elevated credit while defining downside risk. "
                "The credit received provides downside cushion."
            )
        else:
            primary   = "Bear Call Spread (Credit)"
            rationale = (
                f"With IV Rank at {iv_rank:.0f}, selling a bear call spread "
                "collects inflated premium with defined upside risk."
            )
    elif iv_rank <= 30:
        if outlook == "bullish":
            primary   = "Long Call or Bull Call Spread"
            rationale = (
                "IV Rank is low, meaning options are historically cheap. "
                "Buying calls or call spreads benefits from any subsequent volatility "
                "expansion (vega tailwind) in addition to directional upside."
            )
        elif outlook == "bearish":
            primary   = "Long Put or Bear Put Spread"
            rationale = (
                "Low IV environment makes protective puts and bearish debit spreads "
                "cost-efficient. Any vol expansion amplifies gains."
            )
        else:
            primary   = "Long Straddle or Strangle"
            rationale = (
                f"IV Rank of {iv_rank:.0f} is historically depressed. "
                "Long volatility strategies are attractively priced "
                "and benefit from any expansion in implied vol or a large directional move."
            )
    else:
        if outlook == "bullish":
            primary   = "Bull Call Spread"
            rationale = "Balanced IV environment suits debit spreads with defined risk."
        elif outlook == "bearish":
            primary   = "Bear Put Spread"
            rationale = "Debit spreads offer asymmetric risk-reward in average-IV conditions."
        else:
            primary   = "Iron Condor"
            rationale = "Neutral IV regime suits range-bound income strategies."

    # ── Risk profile ──────────────────────────────────────────────────────────
    risk_notes = []
    if T_days < 14:
        risk_notes.append("⚠ Very short expiry — gamma risk is elevated; manage positions carefully.")
    if T_days > 60:
        risk_notes.append("⚡ Long-dated expiry — vega dominates P&L; vol changes are the primary risk.")
    if sigma > 0.60:
        risk_notes.append("🔴 Implied vol exceeds 60% — consider reducing position size.")
    if max_pain_strike and abs(S - max_pain_strike) / S < 0.03:
        risk_notes.append(f"📌 Stock near max pain ({max_pain_strike:.2f}) — potential pinning at expiry.")

    # ── GEX commentary ────────────────────────────────────────────────────────
    gex_note = ""
    if gex_regime:
        if "long gamma" in gex_regime:
            gex_note = "Dealer gamma positioning is net long — market makers are stabilizing, reducing realized volatility."
        else:
            gex_note = "Dealers are net short gamma — reflexive hedging may amplify price moves."

    # ── PCR commentary ───────────────────────────────────────────────────────
    pcr_note = ""
    if pcr:
        if pcr > 1.3:
            pcr_note = f"Put/Call ratio of {pcr:.2f} signals bearish sentiment — potential contrarian bullish setup."
        elif pcr < 0.6:
            pcr_note = f"Put/Call ratio of {pcr:.2f} reflects bullish complacency — watch for downside hedging activity."
        else:
            pcr_note = f"Put/Call ratio of {pcr:.2f} is within neutral range."

    # ── Full narrative ────────────────────────────────────────────────────────
    narrative = (
        f"{'For ' + ticker + ': ' if ticker else ''}"
        f"IV Rank is {iv_rank:.0f}/100 ({iv_regime}), placing current implied volatility "
        f"({iv_pct_str}) at the {iv_pct:.0f}th percentile of the trailing 52-week range. "
        f"The options market is pricing a ±{move_pct:.1f}% expected move through expiry "
        f"({T_days} days). {rationale}"
    )

    return {
        "primary_strategy":  primary,
        "rationale":         rationale,
        "narrative":         narrative,
        "iv_regime":         iv_regime,
        "expected_move_pct": round(move_pct, 2),
        "expected_move_up":  round(S * (1 + move_pct / 100), 2),
        "expected_move_dn":  round(S * (1 - move_pct / 100), 2),
        "risk_notes":        risk_notes,
        "gex_note":          gex_note,
        "pcr_note":          pcr_note,
        "key_levels":        {
            "max_pain":      max_pain_strike,
            "upper_1sd":     round(S * (1 + sigma * (T_days / 365) ** 0.5), 2),
            "lower_1sd":     round(S * (1 - sigma * (T_days / 365) ** 0.5), 2),
        },
        "score_card": {
            "iv_attractiveness": "Sell Premium" if iv_rank >= 60 else "Buy Premium" if iv_rank <= 30 else "Neutral",
            "timing":            "Short-term" if T_days < 21 else "Medium-term" if T_days < 60 else "Long-term",
            "complexity":        "Simple" if primary in ("Long Call","Long Put") else "Moderate" if "Spread" in primary else "Advanced",
        },
    }
