"""
Hybrid risk allocation engine — 5 layers:

  1. HRP     – hierarchical risk parity (base allocation)
  2. BL + ML – Black-Litterman tilts driven by factor/RS composite z-scores
  3. CVaR    – conditional value-at-risk budget enforcement
  4. (ML embedded in layer 2 as BL view magnitudes)
  5. Regime  – scale equity fraction based on market regime overlay
"""
import numpy as np
import pandas as pd
import logging
from typing import Optional

logger = logging.getLogger(__name__)

try:
    from pypfopt import (
        HRPOpt,
        BlackLittermanModel,
        EfficientFrontier,
        risk_models,
    )
    _HAS_PYPFOPT = True
except Exception:
    _HAS_PYPFOPT = False
    logger.warning("PyPortfolioOpt not available — hybrid engine uses fallbacks")

# ── Regime constants ──────────────────────────────────────────────────────────

REGIME_EQUITY_FRACTION: dict[str, float] = {
    "Strong Trend": 1.00,
    "Choppy":       0.80,
    "Bear":         0.60,
    "Panic":        0.40,
}

_DEFENSIVE_TICKERS = {"TLT", "GLD", "SHY", "IEF", "BND", "AGG"}


# ── Layer 1: HRP ──────────────────────────────────────────────────────────────

def hrp_weights(returns: pd.DataFrame) -> dict[str, float]:
    if not _HAS_PYPFOPT:
        return _inverse_vol(returns)
    try:
        hrp = HRPOpt(returns)
        w = dict(hrp.optimize())
        return _nonzero(w)
    except Exception as e:
        logger.warning(f"HRP failed: {e}")
        return _inverse_vol(returns)


# ── Layer 2+4: Black-Litterman with factor/RS signal views ───────────────────

def bl_tilted_weights(
    hrp_w:   dict[str, float],
    returns: pd.DataFrame,
    signals: dict[str, float],  # ticker → composite z-score (positive = bullish)
    tau:     float = 0.05,
) -> dict[str, float]:
    """
    Apply BL tilts on top of HRP allocation.

    Factor/RS composite z-scores become absolute-return views:
        Q_i = equilibrium_i + z_i * 0.03   (3% per z-score unit annually)

    Diagonal Omega (view uncertainty) is proportional to each asset's variance.
    """
    if not _HAS_PYPFOPT or not signals:
        return hrp_w

    tickers = list(hrp_w.keys())
    view_tickers = [t for t in tickers if t in signals]
    if not view_tickers:
        return hrp_w

    try:
        # Covariance from returns (annualised)
        cov = returns[tickers].cov() * 252
        try:
            S = risk_models.sample_cov(returns[tickers], returns_data=True)
        except Exception:
            S = cov

        # Reverse-optimise equilibrium returns from HRP weights: pi = delta * S @ w
        w_arr = np.array([hrp_w.get(t, 0.0) for t in tickers])
        w_arr /= w_arr.sum() if w_arr.sum() > 0 else 1.0
        pi_arr = 1.0 * S.values @ w_arr
        pi = pd.Series(pi_arr, index=tickers)

        # Absolute views from signals
        views: dict[str, float] = {}
        for t in view_tickers:
            z = float(signals[t])
            views[t] = float(pi[t]) + z * 0.03

        bl = BlackLittermanModel(S, pi=pi, absolute_views=views, tau=tau)
        mu_bl = bl.bl_returns()
        cov_bl = bl.bl_cov()

        # Max-Sharpe with BL estimates (unconstrained per-ticker upper bound;
        # max_weight cap applied later in run())
        ef = EfficientFrontier(mu_bl, cov_bl, weight_bounds=(0, None))
        ef.max_sharpe()
        w_bl = dict(ef.clean_weights())
        result = _nonzero(w_bl)
        # Preserve all tickers (some may be zeroed by max_sharpe)
        for t in tickers:
            if t not in result:
                result[t] = 0.0
        return result

    except Exception as e:
        logger.warning(f"BL tilting failed: {e}")
        return hrp_w


# ── Layer 3: CVaR budget enforcement ─────────────────────────────────────────

def cvar_scale(
    weights:    dict[str, float],
    returns:    pd.DataFrame,
    cvar_limit: float = 0.02,
    confidence: float = 0.95,
) -> dict[str, float]:
    """
    If portfolio daily CVaR at `confidence` exceeds `cvar_limit`, scale all
    weights down proportionally.  The residual (1 - scale) is implicitly cash.
    CVaR is linear in position size, so scaling is exact.
    """
    tickers = [t for t in weights if t in returns.columns and weights[t] > 1e-6]
    if not tickers:
        return weights

    w = np.array([weights[t] for t in tickers])
    total = w.sum()
    if total == 0:
        return weights
    w /= total

    port_ret = (returns[tickers].values * w).sum(axis=1)
    var_level = np.percentile(port_ret, (1 - confidence) * 100)
    tail = port_ret[port_ret <= var_level]
    current_cvar = float(-np.mean(tail)) if len(tail) > 0 else 0.0

    if current_cvar <= cvar_limit or current_cvar < 1e-9:
        return weights

    scale = cvar_limit / current_cvar
    return {t: round(weights.get(t, 0.0) * scale, 6) for t in weights}


# ── Layer 5: Regime overlay ───────────────────────────────────────────────────

def regime_overlay(
    weights:    dict[str, float],
    regime:     str,
    defensives: set[str] | None = None,
) -> dict[str, float]:
    """
    Scale non-defensive positions by the regime equity fraction.
    Defensive tickers (bonds/gold etc.) already in the portfolio are unchanged.
    """
    eq_frac = REGIME_EQUITY_FRACTION.get(regime, 1.0)
    if eq_frac >= 1.0:
        return weights
    def_set = defensives or _DEFENSIVE_TICKERS
    return {
        t: round(w if t in def_set else w * eq_frac, 6)
        for t, w in weights.items()
    }


# ── Full pipeline ─────────────────────────────────────────────────────────────

def run(
    prices:     pd.DataFrame,
    regime:     str              = "Strong Trend",
    signals:    dict[str, float] | None = None,
    cvar_limit: float            = 0.02,
    max_weight: float            = 0.20,
    tau:        float            = 0.05,
) -> dict:
    """
    Execute the full 5-layer pipeline and return weights at each stage.

    Returns:
        layers:         weights at hrp / bl / cvar / regime stages
        final_weights:  post-regime weights (normalised to equity fraction)
        metrics:        portfolio-level stats on final weights
        cash_pct:       implicit cash after CVaR + regime scaling
        cvar_95_daily:  final portfolio daily CVaR at 95%
    """
    prices = prices.dropna(axis=1, how="all").ffill().dropna()
    if prices.empty or len(prices) < 60:
        return {"error": "Insufficient price history (need ≥60 trading days)"}

    returns = prices.pct_change().dropna()
    tickers = list(prices.columns)
    signals = signals or {}

    # Layer 1: HRP
    w1 = hrp_weights(returns)

    # Layer 2+4: BL + ML signals
    w2 = bl_tilted_weights(w1, returns, signals, tau=tau)
    w2 = _cap_weight(w2, max_weight)

    # Layer 3: CVaR control
    w3 = cvar_scale(w2, returns, cvar_limit=cvar_limit)

    # Layer 5: Regime overlay
    w4 = regime_overlay(w3, regime)

    cash_pct = max(0.0, round(1.0 - sum(w4.values()), 4))
    final = {t: round(w, 4) for t, w in w4.items() if w > 1e-4}

    return {
        "layers": {
            "hrp":    _fill(w1, tickers),
            "bl":     _fill(w2, tickers),
            "cvar":   _fill(w3, tickers),
            "regime": _fill(w4, tickers),
        },
        "final_weights":   final,
        "equity_fraction": REGIME_EQUITY_FRACTION.get(regime, 1.0),
        "cash_pct":        cash_pct,
        "cvar_95_daily":   round(_portfolio_cvar(w4, returns), 6),
        "regime":          regime,
        "n_holdings":      len(final),
        "metrics":         _metrics(w4, returns),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _inverse_vol(returns: pd.DataFrame) -> dict[str, float]:
    vols = returns.std().replace(0, 1e-9)
    inv = 1.0 / vols
    w = inv / inv.sum()
    return {t: round(float(v), 6) for t, v in w.items()}


def _nonzero(w: dict, threshold: float = 1e-4) -> dict[str, float]:
    return {t: round(float(v), 6) for t, v in w.items() if float(v) > threshold}


def _cap_weight(weights: dict, max_w: float) -> dict[str, float]:
    if max_w >= 1.0:
        return weights
    w = {t: float(v) for t, v in weights.items()}
    for _ in range(30):
        excess = sum(max(0.0, v - max_w) for v in w.values())
        if excess < 1e-7:
            break
        capped = {t: min(max_w, v) for t, v in w.items()}
        free = [t for t, v in capped.items() if v < max_w]
        bump = excess / max(len(free), 1)
        w = {t: min(max_w, v + (bump if t in free else 0.0)) for t, v in capped.items()}
    return {t: round(v, 6) for t, v in w.items()}


def _fill(weights: dict, tickers: list) -> dict[str, float]:
    return {t: round(float(weights.get(t, 0.0)), 6) for t in tickers}


def _portfolio_cvar(weights: dict, returns: pd.DataFrame, confidence: float = 0.95) -> float:
    tickers = [t for t in weights if t in returns.columns and weights[t] > 1e-6]
    if not tickers:
        return 0.0
    w = np.array([weights[t] for t in tickers])
    if w.sum() == 0:
        return 0.0
    w /= w.sum()
    port_ret = (returns[tickers].values * w).sum(axis=1)
    var_level = np.percentile(port_ret, (1 - confidence) * 100)
    tail = port_ret[port_ret <= var_level]
    return float(-np.mean(tail)) if len(tail) > 0 else 0.0


def _metrics(weights: dict, returns: pd.DataFrame) -> dict:
    tickers = [t for t in weights if t in returns.columns and weights[t] > 1e-4]
    if not tickers:
        return {}
    w = np.array([weights[t] for t in tickers])
    if w.sum() == 0:
        return {}
    w /= w.sum()
    port_ret = pd.Series((returns[tickers].values * w).sum(axis=1))
    ann_ret = float(port_ret.mean() * 252)
    ann_vol = float(port_ret.std() * 252 ** 0.5)
    sharpe  = round(ann_ret / ann_vol, 4) if ann_vol > 1e-9 else 0.0
    cum = (1 + port_ret).cumprod()
    max_dd = float(((cum - cum.cummax()) / cum.cummax()).min())
    return {
        "annualized_return":    round(ann_ret, 4),
        "annualized_volatility": round(ann_vol, 4),
        "sharpe_ratio":         sharpe,
        "max_drawdown":         round(max_dd, 4),
        "cvar_95_daily":        round(_portfolio_cvar(weights, returns), 6),
    }
