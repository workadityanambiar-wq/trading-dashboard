"""
Full BSM Greeks: first-order (Delta, Gamma, Theta, Vega, Rho) and
second-order (Vanna, Charm, Vomma, Speed, Color, Zomma).
All per-share, annualized where applicable; Theta and Charm are per-day.
"""
from __future__ import annotations

import numpy as np
from scipy import stats
from typing import List


def _d1d2(S, K, T, r, sigma, q):
    d1 = (np.log(S / K) + (r - q + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
    return float(d1), float(d1 - sigma * np.sqrt(T))


def compute_greeks(
    S: float, K: float, T: float, r: float, sigma: float,
    q: float = 0.0, option_type: str = "call",
) -> dict:
    """Return all Greeks for a single option."""
    if T <= 0 or sigma <= 0:
        return {g: 0.0 for g in
                ["delta","gamma","theta","vega","rho",
                 "vanna","charm","vomma","speed","color","zomma"]}

    d1, d2 = _d1d2(S, K, T, r, sigma, q)
    sqT   = np.sqrt(T)
    N, n  = stats.norm.cdf, stats.norm.pdf
    e_q   = np.exp(-q * T)
    e_r   = np.exp(-r * T)
    nd1   = float(n(d1))

    # ── First-order ───────────────────────────────────────────────────────────
    if option_type == "call":
        delta = float(e_q * N(d1))
        theta = float(
            (-S * sigma * e_q * nd1 / (2 * sqT)
             - r * K * e_r * N(d2)
             + q * S * e_q * N(d1)) / 365
        )
        rho   = float(K * T * e_r * N(d2) / 100)
    else:
        delta = float(-e_q * N(-d1))
        theta = float(
            (-S * sigma * e_q * nd1 / (2 * sqT)
             + r * K * e_r * N(-d2)
             - q * S * e_q * N(-d1)) / 365
        )
        rho   = float(-K * T * e_r * N(-d2) / 100)

    gamma  = float(e_q * nd1 / (S * sigma * sqT))
    vega   = float(S * e_q * nd1 * sqT / 100)  # per 1% move in vol

    # ── Second-order ──────────────────────────────────────────────────────────
    # Vanna: ∂Δ/∂σ = ∂Vega/∂S
    vanna  = float(-e_q * nd1 * d2 / sigma)

    # Charm: ∂Δ/∂T (delta decay per day)
    inner  = (2 * (r - q) * T - d2 * sigma * sqT) / (2 * T * sigma * sqT)
    if option_type == "call":
        charm = float((-e_q * (nd1 * inner - q * N(d1))) / 365)
    else:
        charm = float((-e_q * (nd1 * inner + q * N(-d1))) / 365)

    # Vomma / Volga: ∂Vega/∂σ
    vomma  = float(vega * d1 * d2 / sigma)

    # Speed: ∂Γ/∂S
    speed  = float(-gamma / S * (d1 / (sigma * sqT) + 1))

    # Color: ∂Γ/∂T (per day)
    color  = float(
        -e_q * nd1 / (2 * S * T * sigma * sqT)
        * (2 * q * T + 1 + d1 * (2 * (r - q) * T - d2 * sigma * sqT) / (sigma * sqT))
        / 365
    )

    # Zomma: ∂Γ/∂σ
    zomma  = float(gamma * (d1 * d2 - 1) / sigma)

    return {
        # First-order
        "delta": delta,
        "gamma": gamma,
        "theta": theta,
        "vega":  vega,
        "rho":   rho,
        # Second-order
        "vanna": vanna,
        "charm": charm,
        "vomma": vomma,
        "speed": speed,
        "color": color,
        "zomma": zomma,
    }


def greeks_profile(
    S: float, strikes: List[float], T: float, r: float, sigma: float,
    q: float = 0.0, option_type: str = "call",
) -> dict:
    """Greeks across a range of strikes for smile visualization."""
    rows = []
    for K in strikes:
        g = compute_greeks(S, K, T, r, sigma, q, option_type)
        g["strike"] = K
        rows.append(g)
    return rows


def portfolio_greeks(legs: list) -> dict:
    """
    Aggregate net Greeks across strategy legs.
    Each leg: {greeks: dict, position: 1/-1, qty: int, multiplier: int}
    """
    net = {g: 0.0 for g in ["delta","gamma","theta","vega","rho",
                              "vanna","charm","vomma","speed","color","zomma"]}
    for leg in legs:
        g = leg.get("greeks", {})
        sign = leg.get("position", 1) * leg.get("qty", 1) * leg.get("multiplier", 100)
        for key in net:
            net[key] += g.get(key, 0.0) * sign
    return net
