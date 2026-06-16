"""
Options market scanner: max pain, GEX, put/call ratio, unusual activity,
probability analytics, expected move.
"""
from __future__ import annotations

import numpy as np
from scipy import stats
from typing import List, Optional


# ── Probability analytics ─────────────────────────────────────────────────────

def probability_itm(S: float, K: float, T: float, r: float, sigma: float,
                    q: float = 0.0, opt_type: str = "call") -> float:
    """Risk-neutral probability of expiring ITM."""
    if T <= 0 or sigma <= 0:
        return float(S > K if opt_type == "call" else S < K)
    d2 = (np.log(S / K) + (r - q - 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
    return float(stats.norm.cdf(d2) if opt_type == "call" else stats.norm.cdf(-d2))


def probability_touch(S: float, K: float, T: float, r: float, sigma: float,
                      q: float = 0.0) -> float:
    """Probability that the stock touches K at any point before expiry (barrier formula)."""
    if T <= 0 or sigma <= 0:
        return 0.0
    mu    = (r - q - 0.5 * sigma**2)
    d     = (np.log(K / S)) / (sigma * np.sqrt(T))
    upper = stats.norm.cdf(-abs(d) + mu / sigma * np.sqrt(T))
    lower = np.exp(2 * mu * np.log(K / S) / sigma**2) * stats.norm.cdf(-abs(d) - mu / sigma * np.sqrt(T))
    return float(min(upper + lower, 1.0))


def expected_move(S: float, T: float, sigma: float) -> dict:
    """1-SD expected move (±) in dollars and percent."""
    move_pct = float(sigma * np.sqrt(T))
    return {
        "move_pct": round(move_pct * 100, 2),
        "move_up":  round(S * move_pct, 2),
        "move_dn":  round(S * move_pct, 2),
        "upper":    round(S * (1 + move_pct), 2),
        "lower":    round(S * (1 - move_pct), 2),
    }


def probability_analysis(
    S: float, K: float, T: float, r: float, sigma: float,
    q: float = 0.0, opt_type: str = "call",
) -> dict:
    """Full probability dashboard."""
    p_itm   = probability_itm(S, K, T, r, sigma, q, opt_type)
    p_otm   = 1 - p_itm
    p_touch = probability_touch(S, K, T, r, sigma, q)
    exp_mv  = expected_move(S, T, sigma)
    return {
        "prob_itm":   round(p_itm * 100, 1),
        "prob_otm":   round(p_otm * 100, 1),
        "prob_touch": round(p_touch * 100, 1),
        **exp_mv,
    }


# ── Max Pain ──────────────────────────────────────────────────────────────────

def max_pain(chain_calls: list, chain_puts: list) -> dict:
    """
    Max pain = strike where total option writer P&L is maximised
    (i.e., total holder loss is maximised).
    """
    strikes = sorted(set(
        [c.get("strike", 0) for c in chain_calls] +
        [p.get("strike", 0) for p in chain_puts]
    ))
    if not strikes:
        return {"max_pain_strike": 0.0, "pain_curve": []}

    c_map = {c["strike"]: c.get("openInterest", 0) for c in chain_calls}
    p_map = {p["strike"]: p.get("openInterest", 0) for p in chain_puts}

    pain = []
    for pin in strikes:
        call_pain = sum(max(pin - K, 0) * c_map.get(K, 0) for K in strikes)
        put_pain  = sum(max(K - pin, 0) * p_map.get(K, 0) for K in strikes)
        pain.append(call_pain + put_pain)

    idx = pain.index(min(pain))
    return {
        "max_pain_strike": float(strikes[idx]),
        "pain_curve": [{"strike": k, "pain": p} for k, p in zip(strikes, pain)],
    }


# ── Gamma Exposure (GEX) ──────────────────────────────────────────────────────

def gamma_exposure(
    chain_calls: list, chain_puts: list,
    S: float, r: float = 0.05, T_days: int = 30, sigma: float = 0.25,
    multiplier: int = 100,
) -> dict:
    """
    Net Dealer GEX.  Dealers are typically short calls → long gamma from calls,
    short puts → short gamma from puts (but put OI is signed -1 for dealers).
    GEX = Σ(Gamma × OI × multiplier × S²) per strike
    """
    from app.core.options.greeks import compute_greeks

    T = max(T_days / 365, 1e-4)
    gex_by_strike = {}

    for c in chain_calls:
        K    = float(c.get("strike", 0))
        oi   = float(c.get("openInterest", 0))
        sig  = float(c.get("impliedVolatility", sigma))
        g    = compute_greeks(S, K, T, r, max(sig, 0.01), 0, "call")["gamma"]
        gex  = g * oi * multiplier * S * S * 0.01   # $ gamma per 1% move
        gex_by_strike[K] = gex_by_strike.get(K, 0) + gex

    for p in chain_puts:
        K   = float(p.get("strike", 0))
        oi  = float(p.get("openInterest", 0))
        sig = float(p.get("impliedVolatility", sigma))
        g   = compute_greeks(S, K, T, r, max(sig, 0.01), 0, "put")["gamma"]
        gex = -g * oi * multiplier * S * S * 0.01   # puts flip sign
        gex_by_strike[K] = gex_by_strike.get(K, 0) + gex

    total_gex = sum(gex_by_strike.values())
    curve = sorted([{"strike": k, "gex": round(v, 0)}
                    for k, v in gex_by_strike.items()], key=lambda x: x["strike"])

    # Flip points: where GEX changes sign
    flips = []
    prev  = None
    for row in curve:
        if prev is not None and prev * row["gex"] < 0:
            flips.append(row["strike"])
        prev = row["gex"]

    return {
        "total_gex": round(total_gex, 0),
        "gex_curve": curve,
        "flip_points": flips,
        "regime": "long gamma (stabilizing)" if total_gex > 0 else "short gamma (amplifying)",
    }


# ── Put/Call Ratio & Unusual Activity ─────────────────────────────────────────

def put_call_ratio(chain_calls: list, chain_puts: list) -> dict:
    call_vol = sum(c.get("volume", 0) or 0 for c in chain_calls)
    put_vol  = sum(p.get("volume", 0) or 0 for p in chain_puts)
    call_oi  = sum(c.get("openInterest", 0) or 0 for c in chain_calls)
    put_oi   = sum(p.get("openInterest", 0) or 0 for p in chain_puts)

    vol_pcr = round(put_vol / max(call_vol, 1), 3)
    oi_pcr  = round(put_oi  / max(call_oi,  1), 3)

    sentiment = (
        "Very Bullish" if vol_pcr < 0.5 else
        "Bullish"      if vol_pcr < 0.7 else
        "Neutral"      if vol_pcr < 1.0 else
        "Bearish"      if vol_pcr < 1.3 else
        "Very Bearish"
    )

    return {
        "vol_pcr": vol_pcr,
        "oi_pcr":  oi_pcr,
        "call_volume": int(call_vol),
        "put_volume":  int(put_vol),
        "call_oi":     int(call_oi),
        "put_oi":      int(put_oi),
        "sentiment":   sentiment,
    }


def unusual_activity(
    chain_calls: list, chain_puts: list,
    avg_vol_multiplier: float = 5.0,
) -> List[dict]:
    """Detect unusual options activity: sweeps, large blocks, vol/OI divergence."""
    results = []

    for opt_type, chain in [("call", chain_calls), ("put", chain_puts)]:
        vols  = [c.get("volume", 0) or 0 for c in chain]
        avg_v = np.mean(vols) if vols else 1

        for c in chain:
            vol = c.get("volume", 0) or 0
            oi  = c.get("openInterest", 1) or 1
            K   = c.get("strike", 0)
            iv  = c.get("impliedVolatility", 0)

            signals = []
            score   = 0

            if vol > avg_vol_multiplier * avg_v and vol > 500:
                signals.append(f"Volume {vol:,} is {vol/max(avg_v,1):.0f}× average")
                score += 40
            if vol > oi * 0.5:
                signals.append(f"Vol/OI ratio {vol/oi:.1f} — likely new positioning")
                score += 25
            if iv > 0.80:
                signals.append(f"Elevated IV {iv*100:.0f}% suggests demand")
                score += 20
            if vol > 5000:
                signals.append("Block trade / sweep order detected")
                score += 15

            if score >= 40:
                results.append({
                    "type":    opt_type,
                    "strike":  K,
                    "volume":  int(vol),
                    "oi":      int(oi),
                    "iv":      round(iv * 100, 1),
                    "signals": signals,
                    "score":   min(score, 100),
                    "label": (
                        "High Conviction" if score >= 70 else
                        "Notable"         if score >= 50 else
                        "Moderate"
                    ),
                })

    return sorted(results, key=lambda x: x["score"], reverse=True)[:20]
