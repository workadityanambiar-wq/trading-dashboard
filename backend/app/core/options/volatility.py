"""
Volatility analytics: implied volatility (Newton-Raphson), vol surface,
IV rank/percentile, historical vol, skew metrics.
"""
from __future__ import annotations

import numpy as np
from scipy import stats
from typing import List, Optional


def _bs_price(S, K, T, r, sigma, q, opt_type):
    if T <= 0 or sigma <= 0:
        return max(S - K, 0) if opt_type == "call" else max(K - S, 0)
    d1 = (np.log(S / K) + (r - q + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)
    N  = stats.norm.cdf
    if opt_type == "call":
        return float(S * np.exp(-q * T) * N(d1) - K * np.exp(-r * T) * N(d2))
    return float(K * np.exp(-r * T) * N(-d2) - S * np.exp(-q * T) * N(-d1))


def implied_volatility(
    market_price: float, S: float, K: float, T: float,
    r: float, q: float = 0.0, opt_type: str = "call",
    max_iter: int = 200, tol: float = 1e-7,
) -> Optional[float]:
    """Newton-Raphson IV solver. Returns None if no solution found."""
    if T <= 0 or market_price <= 0:
        return None
    intrinsic = max(S - K, 0) if opt_type == "call" else max(K - S, 0)
    if market_price < intrinsic - 0.01:
        return None

    # Initial guess (Brenner-Subrahmanyam approximation)
    sigma = float(np.sqrt(2 * np.pi / T) * market_price / S)
    sigma = max(min(sigma, 10.0), 1e-4)

    for _ in range(max_iter):
        price = _bs_price(S, K, T, r, sigma, q, opt_type)
        d1    = (np.log(S / K) + (r - q + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
        vega  = S * np.exp(-q * T) * stats.norm.pdf(d1) * np.sqrt(T)
        if vega < 1e-12:
            break
        diff  = market_price - price
        if abs(diff) < tol:
            return float(sigma)
        sigma = sigma + diff / vega
        sigma = max(min(sigma, 10.0), 1e-6)
    return float(sigma) if 0 < sigma < 10 else None


def vol_smile(
    S: float, chain_calls: list, chain_puts: list,
    T: float, r: float, q: float = 0.0,
) -> dict:
    """
    Build volatility smile from an options chain.
    chain_calls/puts: list of {strike, mid} dicts.
    Returns {strikes, call_ivs, put_ivs, smile_iv} for plotting.
    """
    strikes, call_ivs, put_ivs = [], [], []

    all_strikes = sorted(set(
        [c.get("strike", 0) for c in chain_calls] +
        [p.get("strike", 0) for p in chain_puts]
    ))

    c_map = {c["strike"]: c.get("mid", 0) for c in chain_calls}
    p_map = {p["strike"]: p.get("mid", 0) for p in chain_puts}

    for K in all_strikes:
        if K <= 0:
            continue
        civ, piv = None, None
        if K in c_map and c_map[K] > 0:
            civ = implied_volatility(c_map[K], S, K, T, r, q, "call")
        if K in p_map and p_map[K] > 0:
            piv = implied_volatility(p_map[K], S, K, T, r, q, "put")

        if civ or piv:
            strikes.append(K)
            call_ivs.append(round(civ * 100, 2) if civ else None)
            put_ivs.append(round(piv * 100, 2) if piv else None)

    # Composite smile (prefer puts for OTM puts, calls for OTM calls)
    smile_iv = []
    for i, K in enumerate(strikes):
        if K < S:
            smile_iv.append(put_ivs[i] or call_ivs[i])
        else:
            smile_iv.append(call_ivs[i] or put_ivs[i])

    return {
        "strikes": strikes,
        "call_ivs": call_ivs,
        "put_ivs": put_ivs,
        "smile_iv": smile_iv,
        "atm_iv": _find_atm_iv(strikes, smile_iv, S),
    }


def _find_atm_iv(strikes, ivs, S):
    if not strikes:
        return None
    dists = [abs(K - S) for K in strikes]
    idx = dists.index(min(dists))
    return ivs[idx] if idx < len(ivs) else None


def historical_volatility(
    close_prices: list, window: int = 21, annualize: bool = True,
) -> List[float]:
    """Rolling historical volatility from a list of closing prices."""
    arr = np.array(close_prices, dtype=float)
    log_rets = np.log(arr[1:] / arr[:-1])
    hv = []
    for i in range(window, len(log_rets) + 1):
        window_rets = log_rets[i - window:i]
        vol = float(window_rets.std() * (np.sqrt(252) if annualize else 1))
        hv.append(vol)
    return hv


def iv_rank_percentile(
    current_iv: float, historical_ivs: List[float],
) -> dict:
    """
    IV Rank: (current - min) / (max - min) * 100
    IV Percentile: % of days current IV is above historical
    """
    if not historical_ivs:
        return {"iv_rank": 50.0, "iv_percentile": 50.0}
    lo, hi = min(historical_ivs), max(historical_ivs)
    rank = float((current_iv - lo) / (hi - lo) * 100) if hi > lo else 50.0
    pct  = float(sum(1 for iv in historical_ivs if iv < current_iv) / len(historical_ivs) * 100)
    return {
        "iv_rank": round(max(0, min(rank, 100)), 1),
        "iv_percentile": round(pct, 1),
        "iv_52w_low": round(lo * 100, 1),
        "iv_52w_high": round(hi * 100, 1),
    }


def skew_metrics(
    S: float, chain_calls: list, chain_puts: list,
    T: float, r: float, q: float = 0.0,
) -> dict:
    """
    Compute skew (25-delta put IV minus 25-delta call IV) and term structure.
    """
    smile = vol_smile(S, chain_calls, chain_puts, T, r, q)
    strikes = smile["strikes"]
    ivs     = smile["smile_iv"]
    atm_iv  = smile["atm_iv"] or 25.0

    if not strikes or not ivs:
        return {"skew": 0.0, "put_skew": 0.0, "call_skew": 0.0}

    # Find 90% and 110% strike IVs as proxy for 25-delta
    lo_target = S * 0.90
    hi_target = S * 1.10

    def closest_iv(target):
        dists = [abs(K - target) for K in strikes]
        idx   = dists.index(min(dists))
        return ivs[idx] if ivs[idx] else atm_iv

    iv_90  = closest_iv(lo_target) or atm_iv
    iv_110 = closest_iv(hi_target) or atm_iv

    skew = float(iv_90 - iv_110)   # positive = downside skew (normal for equities)
    return {
        "skew": round(skew, 2),
        "put_skew":  round(float(iv_90) - atm_iv, 2),
        "call_skew": round(float(iv_110) - atm_iv, 2),
        "atm_iv": atm_iv,
        "iv_90":  iv_90,
        "iv_110": iv_110,
    }
