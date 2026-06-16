"""
Options pricing engines: Black-Scholes, Binomial Tree (CRR), Monte Carlo.
All prices in per-share dollar terms.
"""
from __future__ import annotations

import numpy as np
from scipy import stats
from typing import Optional


# ── Shared helpers ────────────────────────────────────────────────────────────

def _d1d2(S: float, K: float, T: float, r: float, sigma: float, q: float):
    if T <= 0 or sigma <= 0:
        return 0.0, 0.0
    d1 = (np.log(S / K) + (r - q + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
    return float(d1), float(d1 - sigma * np.sqrt(T))


# ── Black-Scholes ─────────────────────────────────────────────────────────────

def black_scholes(
    S: float, K: float, T: float, r: float, sigma: float,
    q: float = 0.0, option_type: str = "call",
) -> dict:
    """Analytical BSM price. T in years."""
    intrinsic = max(S - K, 0) if option_type == "call" else max(K - S, 0)
    if T <= 0 or sigma <= 0:
        return {"price": intrinsic, "intrinsic": intrinsic, "time_value": 0.0,
                "d1": 0.0, "d2": 0.0, "call": 0.0, "put": 0.0}

    d1, d2 = _d1d2(S, K, T, r, sigma, q)
    N = stats.norm.cdf

    call = S * np.exp(-q * T) * N(d1) - K * np.exp(-r * T) * N(d2)
    put  = K * np.exp(-r * T) * N(-d2) - S * np.exp(-q * T) * N(-d1)

    price = call if option_type == "call" else put
    time_value = max(float(price) - intrinsic, 0.0)

    return {
        "price": float(price),
        "call": float(call),
        "put": float(put),
        "intrinsic": float(intrinsic),
        "time_value": float(time_value),
        "d1": float(d1),
        "d2": float(d2),
        "prob_itm": float(N(d2) if option_type == "call" else N(-d2)),
    }


# ── Binomial Tree (Cox-Ross-Rubinstein) ───────────────────────────────────────

def binomial_tree(
    S: float, K: float, T: float, r: float, sigma: float,
    N: int = 100, option_type: str = "call",
    american: bool = False, q: float = 0.0,
) -> dict:
    dt = T / N
    u = float(np.exp(sigma * np.sqrt(dt)))
    d = 1.0 / u
    disc = float(np.exp(-r * dt))
    p = float((np.exp((r - q) * dt) - d) / (u - d))
    p = max(min(p, 1.0), 0.0)

    # Terminal stock prices
    j_arr = np.arange(N + 1)
    S_T = S * u ** (N - j_arr) * d ** j_arr

    # Terminal option values
    if option_type == "call":
        V = np.maximum(S_T - K, 0.0)
    else:
        V = np.maximum(K - S_T, 0.0)

    # Backward induction
    for i in range(N - 1, -1, -1):
        V = disc * (p * V[:-1] + (1 - p) * V[1:])
        if american:
            S_i = S * u ** (i - np.arange(i + 1)) * d ** np.arange(i + 1)
            intrinsic = np.maximum(S_i - K, 0.0) if option_type == "call" else np.maximum(K - S_i, 0.0)
            V = np.maximum(V, intrinsic)

    price = float(V[0])

    # Sample tree for display (first 6 steps)
    sN = min(6, N)
    S_tree, O_tree = [], []
    for i in range(sN + 1):
        j_i = np.arange(i + 1)
        s_row = (S * u ** (i - j_i) * d ** j_i).tolist()
        S_tree.append([round(x, 4) for x in s_row])
    # Recompute terminal + backward for small sample tree
    j_s = np.arange(sN + 1)
    S_sT = S * u ** (sN - j_s) * d ** j_s
    V_s = np.maximum(S_sT - K, 0.0) if option_type == "call" else np.maximum(K - S_sT, 0.0)
    O_tree.append([round(x, 4) for x in V_s.tolist()])
    for i in range(sN - 1, -1, -1):
        V_s = disc * (p * V_s[:-1] + (1 - p) * V_s[1:])
        O_tree.insert(0, [round(x, 4) for x in V_s.tolist()])

    return {
        "price": price,
        "u": u, "d": d, "p": p,
        "N": N,
        "stock_tree": S_tree,
        "option_tree": O_tree,
    }


# ── Monte Carlo ───────────────────────────────────────────────────────────────

def monte_carlo(
    S: float, K: float, T: float, r: float, sigma: float,
    n_sims: int = 10_000, option_type: str = "call",
    q: float = 0.0, exotic: str = "vanilla",
    barrier: Optional[float] = None, seed: Optional[int] = 42,
) -> dict:
    if seed is not None:
        np.random.seed(seed)

    n_steps = max(int(T * 252), 1)
    dt = T / n_steps
    drift = (r - q - 0.5 * sigma**2) * dt
    diff  = sigma * np.sqrt(dt)

    Z = np.random.standard_normal((n_sims, n_steps))
    log_rets = drift + diff * Z
    log_price = np.log(S) + np.cumsum(log_rets, axis=1)
    paths = np.exp(log_price)       # shape (n_sims, n_steps)
    S_T = paths[:, -1]

    # ── Payoff ────────────────────────────────────────────────────────────────
    if exotic == "asian":
        spot = paths.mean(axis=1)
        payoffs = np.maximum(spot - K, 0) if option_type == "call" else np.maximum(K - spot, 0)
    elif exotic == "barrier_ko" and barrier is not None:
        if option_type == "call":
            knocked = (paths >= barrier).any(axis=1)
            payoffs = np.where(knocked, 0, np.maximum(S_T - K, 0))
        else:
            knocked = (paths <= barrier).any(axis=1)
            payoffs = np.where(knocked, 0, np.maximum(K - S_T, 0))
    elif exotic == "barrier_ki" and barrier is not None:
        if option_type == "call":
            knocked = (paths >= barrier).any(axis=1)
            payoffs = np.where(knocked, np.maximum(S_T - K, 0), 0)
        else:
            knocked = (paths <= barrier).any(axis=1)
            payoffs = np.where(knocked, np.maximum(K - S_T, 0), 0)
    elif exotic == "lookback":
        if option_type == "call":
            payoffs = np.maximum(S_T - paths.min(axis=1), 0)
        else:
            payoffs = np.maximum(paths.max(axis=1) - S_T, 0)
    else:
        payoffs = np.maximum(S_T - K, 0) if option_type == "call" else np.maximum(K - S_T, 0)

    disc = np.exp(-r * T) * payoffs
    price = float(disc.mean())
    se    = float(disc.std() / np.sqrt(n_sims))

    # Sample paths (20 paths, downsampled to 50 points)
    step = max(1, n_steps // 50)
    sample = paths[:20, ::step].tolist()
    time_ax = [i * dt * step for i in range(len(sample[0]))]

    # Final price histogram
    hist, edges = np.histogram(S_T, bins=50)
    pnl_hist, pnl_edges = np.histogram(disc, bins=50)

    return {
        "price": price,
        "std_error": se,
        "ci_95": [round(price - 1.96 * se, 4), round(price + 1.96 * se, 4)],
        "n_sims": n_sims,
        "sample_paths": sample,
        "time_axis": time_ax,
        "price_distribution": {"counts": hist.tolist(), "bins": edges.tolist()},
        "pnl_distribution":   {"counts": pnl_hist.tolist(), "bins": pnl_edges.tolist()},
        "bs_price": float(black_scholes(S, K, T, r, sigma, q, option_type)["price"]),
    }
