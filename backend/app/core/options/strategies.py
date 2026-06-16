"""
Options strategy library: payoff computation and 25+ preset strategies.
"""
from __future__ import annotations

import numpy as np
from typing import List, Optional


# ── Payoff engine ─────────────────────────────────────────────────────────────

def payoff_at_expiry(legs: list, S_range: list) -> dict:
    """
    Compute P&L at expiry across a range of underlying prices.
    leg = {"type": "call"|"put"|"stock", "K": float, "premium": float,
           "position": 1|-1, "qty": int}
    Returns payoffs list + key analytics.
    """
    S_arr = np.array(S_range, dtype=float)
    total = np.zeros(len(S_arr))

    for leg in legs:
        pos    = float(leg.get("position", 1))
        qty    = float(leg.get("qty", 1))
        K      = float(leg.get("K", 0))
        prem   = float(leg.get("premium", 0))
        lt     = leg.get("type", "call")

        if lt == "stock":
            # Long/short stock
            entry = float(leg.get("entry", K))
            total += pos * qty * (S_arr - entry)
        elif lt == "call":
            total += pos * qty * (np.maximum(S_arr - K, 0) - prem)
        elif lt == "put":
            total += pos * qty * (np.maximum(K - S_arr, 0) - prem)

    # Breakevens (sign changes)
    breakevens = []
    for i in range(len(total) - 1):
        if total[i] * total[i + 1] < 0:
            be = S_arr[i] + (S_arr[i + 1] - S_arr[i]) * (-total[i]) / (total[i + 1] - total[i])
            breakevens.append(round(float(be), 2))
        elif abs(total[i]) < 0.01:
            breakevens.append(round(float(S_arr[i]), 2))

    max_profit = float(total.max())
    max_loss   = float(total.min())
    net_credit = -sum(leg.get("position", 1) * leg.get("qty", 1) * leg.get("premium", 0)
                      for leg in legs)

    return {
        "payoff": total.tolist(),
        "s_range": S_arr.tolist(),
        "breakevens": breakevens[:4],
        "max_profit": max_profit,
        "max_loss": max_loss,
        "net_credit": round(net_credit, 2),
        "risk_reward": round(abs(max_profit / max_loss), 2) if max_loss != 0 else None,
    }


def scenario_pnl(
    legs: list, S: float, sigma: float, T: float, r: float, q: float = 0.0,
    price_shocks: Optional[list] = None,
    vol_shocks: Optional[list] = None,
    time_shocks: Optional[list] = None,
) -> dict:
    """
    P&L matrix: each scenario = (price_shock%, vol_shock%, days_elapsed).
    Returns 2D grid for heatmap display.
    """
    from app.core.options.pricing import black_scholes

    if price_shocks is None:
        price_shocks = [-0.15, -0.10, -0.05, 0, 0.05, 0.10, 0.15]
    if vol_shocks is None:
        vol_shocks = [-0.30, -0.15, 0, 0.15, 0.30]
    if time_shocks is None:
        time_shocks = [0, 1, 7, 30]

    # Current strategy value
    def strategy_value(S_new, sigma_new, T_new):
        val = 0.0
        for leg in legs:
            if leg.get("type") in ("call", "put") and T_new > 0:
                bs = black_scholes(S_new, float(leg["K"]), max(T_new, 1e-6),
                                   r, max(sigma_new, 0.01), q, leg["type"])
                val += float(leg.get("position", 1)) * float(leg.get("qty", 1)) * bs["price"]
            elif leg.get("type") == "stock":
                entry = float(leg.get("entry", leg.get("K", S)))
                val += float(leg.get("position", 1)) * float(leg.get("qty", 1)) * (S_new - entry)
        return val

    current_val = strategy_value(S, sigma, T)
    # Net premium paid/received (at t=0)
    net_prem = sum(float(leg.get("position", 1)) * float(leg.get("qty", 1)) *
                   float(leg.get("premium", 0)) for leg in legs)

    grid = {}
    for days in time_shocks:
        T_new = max(T - days / 365, 1e-6)
        row = {}
        for ds in price_shocks:
            S_new = S * (1 + ds)
            pnl_vs = {}
            for dv in vol_shocks:
                sig_new = sigma * (1 + dv)
                val = strategy_value(S_new, sig_new, T_new)
                pnl_vs[f"{int(dv*100):+d}%"] = round(val - current_val, 2)
            row[f"{int(ds*100):+d}%"] = pnl_vs
        grid[f"{days}d"] = row

    return {
        "grid": grid,
        "current_value": round(current_val, 2),
        "net_premium": round(net_prem, 2),
        "price_shocks": [f"{int(x*100):+d}%" for x in price_shocks],
        "vol_shocks":   [f"{int(x*100):+d}%" for x in vol_shocks],
        "time_shocks":  [f"{x}d" for x in time_shocks],
    }


# ── Strategy presets ──────────────────────────────────────────────────────────
# Each preset is a function: (S, params) → list of legs with description

def _leg(lt, K, prem, pos, qty=1):
    return {"type": lt, "K": K, "premium": prem, "position": pos, "qty": qty}


STRATEGY_CATALOG = {
    # ── Single leg ────────────────────────────────────────────────────────────
    "long_call": {
        "label": "Long Call", "category": "Single Leg", "outlook": "Bullish",
        "description": "Unlimited upside, loss limited to premium paid.",
        "legs": lambda S, p: [_leg("call", S, p, 1)],
    },
    "long_put": {
        "label": "Long Put", "category": "Single Leg", "outlook": "Bearish",
        "description": "Profits if stock falls below strike minus premium.",
        "legs": lambda S, p: [_leg("put", S, p, 1)],
    },
    "short_call": {
        "label": "Short Call (Naked)", "category": "Single Leg", "outlook": "Neutral/Bearish",
        "description": "Maximum profit = premium. Unlimited risk if stock rises.",
        "legs": lambda S, p: [_leg("call", S, p, -1)],
    },
    "short_put": {
        "label": "Short Put", "category": "Single Leg", "outlook": "Neutral/Bullish",
        "description": "Collect premium. Must buy stock at K if exercised.",
        "legs": lambda S, p: [_leg("put", S, p, -1)],
    },
    # ── Vertical spreads ─────────────────────────────────────────────────────
    "bull_call_spread": {
        "label": "Bull Call Spread", "category": "Vertical", "outlook": "Moderately Bullish",
        "description": "Buy lower strike call, sell higher strike call. Limited risk/reward.",
        "legs": lambda S, p: [_leg("call", S*0.98, p, 1), _leg("call", S*1.04, p*0.4, -1)],
    },
    "bear_put_spread": {
        "label": "Bear Put Spread", "category": "Vertical", "outlook": "Moderately Bearish",
        "description": "Buy higher strike put, sell lower strike put.",
        "legs": lambda S, p: [_leg("put", S*1.02, p, 1), _leg("put", S*0.96, p*0.4, -1)],
    },
    "bull_put_spread": {
        "label": "Bull Put Spread (Credit)", "category": "Vertical", "outlook": "Bullish",
        "description": "Sell higher put, buy lower put for net credit.",
        "legs": lambda S, p: [_leg("put", S*0.98, p, -1), _leg("put", S*0.92, p*0.4, 1)],
    },
    "bear_call_spread": {
        "label": "Bear Call Spread (Credit)", "category": "Vertical", "outlook": "Bearish",
        "description": "Sell lower call, buy higher call for net credit.",
        "legs": lambda S, p: [_leg("call", S*1.02, p, -1), _leg("call", S*1.08, p*0.4, 1)],
    },
    # ── Income ────────────────────────────────────────────────────────────────
    "covered_call": {
        "label": "Covered Call", "category": "Income", "outlook": "Neutral/Mildly Bullish",
        "description": "Long stock + short OTM call. Generates premium income.",
        "legs": lambda S, p: [_leg("stock", S, 0, 1), _leg("call", S*1.05, p, -1)],
    },
    "cash_secured_put": {
        "label": "Cash-Secured Put", "category": "Income", "outlook": "Neutral/Bullish",
        "description": "Sell OTM put backed by cash. Acquire stock at discount or keep premium.",
        "legs": lambda S, p: [_leg("put", S*0.95, p, -1)],
    },
    # ── Volatility ────────────────────────────────────────────────────────────
    "long_straddle": {
        "label": "Long Straddle", "category": "Volatility", "outlook": "High Volatility",
        "description": "Buy ATM call and put. Profits from large moves in either direction.",
        "legs": lambda S, p: [_leg("call", S, p, 1), _leg("put", S, p, 1)],
    },
    "short_straddle": {
        "label": "Short Straddle", "category": "Volatility", "outlook": "Low Volatility",
        "description": "Sell ATM call and put. Profits if stock stays near strike.",
        "legs": lambda S, p: [_leg("call", S, p, -1), _leg("put", S, p, -1)],
    },
    "long_strangle": {
        "label": "Long Strangle", "category": "Volatility", "outlook": "Very High Volatility",
        "description": "Buy OTM call and OTM put. Cheaper than straddle, needs bigger move.",
        "legs": lambda S, p: [_leg("call", S*1.05, p*0.65, 1), _leg("put", S*0.95, p*0.65, 1)],
    },
    "short_strangle": {
        "label": "Short Strangle", "category": "Volatility", "outlook": "Range-Bound",
        "description": "Sell OTM call and OTM put. Collect premium in sideways markets.",
        "legs": lambda S, p: [_leg("call", S*1.05, p*0.65, -1), _leg("put", S*0.95, p*0.65, -1)],
    },
    # ── Advanced ──────────────────────────────────────────────────────────────
    "iron_condor": {
        "label": "Iron Condor", "category": "Advanced", "outlook": "Range-Bound",
        "description": "Sell OTM strangle, buy further OTM wings. Defined risk premium income.",
        "legs": lambda S, p: [
            _leg("put",  S*0.90, p*0.30, 1),
            _leg("put",  S*0.95, p*0.55, -1),
            _leg("call", S*1.05, p*0.55, -1),
            _leg("call", S*1.10, p*0.30, 1),
        ],
    },
    "iron_butterfly": {
        "label": "Iron Butterfly", "category": "Advanced", "outlook": "Pinning at Strike",
        "description": "Sell ATM straddle, buy OTM wings. High premium, narrow profit range.",
        "legs": lambda S, p: [
            _leg("put",  S*0.90, p*0.25, 1),
            _leg("put",  S, p, -1),
            _leg("call", S, p, -1),
            _leg("call", S*1.10, p*0.25, 1),
        ],
    },
    "calendar_spread": {
        "label": "Calendar Spread", "category": "Advanced", "outlook": "Neutral + Vol Rising",
        "description": "Sell near-term ATM option, buy longer-dated ATM option.",
        "legs": lambda S, p: [_leg("call", S, p*0.6, -1), _leg("call", S, p, 1)],
    },
    "jade_lizard": {
        "label": "Jade Lizard", "category": "Advanced", "outlook": "Neutral/Bullish",
        "description": "Short put + short call spread. No upside risk if credit > call spread width.",
        "legs": lambda S, p: [
            _leg("put",  S*0.95, p*0.55, -1),
            _leg("call", S*1.05, p*0.50, -1),
            _leg("call", S*1.10, p*0.20, 1),
        ],
    },
    "broken_wing_butterfly": {
        "label": "Broken Wing Butterfly", "category": "Advanced", "outlook": "Neutral/Slight Bias",
        "description": "Unbalanced butterfly that can be entered for even or credit.",
        "legs": lambda S, p: [
            _leg("put", S*0.88, p*0.20, 1),
            _leg("put", S*0.95, p*0.60, -2),
            _leg("put", S,      p*1.00, 1),
        ],
    },
    "ratio_spread": {
        "label": "1×2 Ratio Call Spread", "category": "Advanced", "outlook": "Moderately Bullish",
        "description": "Buy 1 call, sell 2 higher calls. Can be entered at no cost.",
        "legs": lambda S, p: [
            _leg("call", S*1.00, p, 1),
            _leg("call", S*1.05, p*0.55, -2),
        ],
    },
    "synthetic_long": {
        "label": "Synthetic Long", "category": "Advanced", "outlook": "Bullish",
        "description": "Buy ATM call, sell ATM put. Replicates long stock exposure.",
        "legs": lambda S, p: [_leg("call", S, p, 1), _leg("put", S, p, -1)],
    },
    "risk_reversal": {
        "label": "Risk Reversal", "category": "Advanced", "outlook": "Bullish",
        "description": "Sell OTM put, buy OTM call. Bull trade, often low/zero cost.",
        "legs": lambda S, p: [_leg("put", S*0.95, p*0.7, -1), _leg("call", S*1.05, p*0.7, 1)],
    },
}


def build_strategy(
    strategy_id: str, S: float, atm_premium: float,
    S_range: Optional[list] = None,
) -> dict:
    """Build strategy payoff for a preset strategy."""
    if strategy_id not in STRATEGY_CATALOG:
        raise ValueError(f"Unknown strategy: {strategy_id}")

    cat = STRATEGY_CATALOG[strategy_id]
    legs = cat["legs"](S, atm_premium)

    if S_range is None:
        S_range = [round(S * (0.7 + i * 0.02), 2) for i in range(31)]

    result = payoff_at_expiry(legs, S_range)
    result["strategy_id"]   = strategy_id
    result["label"]         = cat["label"]
    result["category"]      = cat["category"]
    result["outlook"]       = cat["outlook"]
    result["description"]   = cat["description"]
    result["legs"]          = legs
    return result
