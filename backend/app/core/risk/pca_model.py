"""
Institutional-grade statistical factor risk model.

Pipeline
--------
1.  Daily log-returns, winsorized at 5σ, EWMA-weighted covariance (S)
2.  Eigendecompose S = V Λ V'
3.  Marchenko-Pastur RMT denoising: clip noise eigenvalues to their mean
    (trace-preserving), keeping signal eigenvalues intact
4.  Ledoit-Wolf shrinkage on the denoised matrix
5.  Factor model:  Σ = B · Ωf · B' + D   (low-rank-plus-diagonal)
        B  = top-k eigenvectors   (N×k loadings)
        Ωf = diag(factor variances)
        D  = diag(shrunk specific variances)
6.  Portfolio analytics: vol, parametric VaR/CVaR, factor contribution

All covariances / vols are annualised (×252) in the output.
"""

from __future__ import annotations
import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Optional
from scipy.stats import norm as _norm


# ── Data classes ───────────────────────────────────────────────────────────────

@dataclass
class RiskModelResult:
    tickers: list[str]
    n_assets: int
    n_obs: int
    n_factors: int           # kept signal factors
    lambda_plus: float       # MP upper edge (daily, pre-annualisation)

    # Factor model — annualised
    loadings: np.ndarray     # N×k
    factor_vols: np.ndarray  # k  (annualised %)
    specific_vols: np.ndarray  # N
    total_vols: np.ndarray   # N
    systematic_pct: np.ndarray  # N  fraction of variance from factors

    # Full reconstructed covariance — annualised
    cov_matrix: np.ndarray   # N×N
    corr_matrix: np.ndarray  # N×N

    # Diagnostics
    all_eigenvalues: np.ndarray    # all N descending daily eigenvalues
    factor_expl_var: np.ndarray    # k  fraction of total variance per factor


@dataclass
class PortfolioRiskResult:
    port_vol: float          # annualised
    port_var: float
    var_95: float
    cvar_95: float
    var_99: float
    systematic_pct: float
    specific_pct: float
    factor_contributions: list[dict]   # [{factor, pct}]


# ── Helpers ────────────────────────────────────────────────────────────────────

def _ewma_cov(R: np.ndarray, half_life: int) -> np.ndarray:
    """Exponentially-weighted covariance, most recent observation most weight."""
    T, N = R.shape
    lam = 0.5 ** (1.0 / half_life)
    w = lam ** np.arange(T - 1, -1, -1)
    w /= w.sum()
    mu = (w[:, None] * R).sum(axis=0)
    centered = (R - mu) * np.sqrt(w[:, None])
    return centered.T @ centered


def _marchenko_pastur_edge(T: int, N: int, sigma2: float = 1.0) -> float:
    """Upper Marchenko-Pastur eigenvalue edge for an N×N matrix from T observations."""
    q = N / T
    return sigma2 * (1 + np.sqrt(q)) ** 2


def _rmt_denoise(eigenvalues: np.ndarray, T: int, N: int) -> tuple[np.ndarray, float]:
    """
    Clip sub-MP eigenvalues to their mean (trace-preserving Bouchaud-Potters denoising).
    Returns (clipped_eigenvalues, lambda_plus).
    """
    sigma2 = eigenvalues.mean()          # normalise so bulk is around 1×sigma2
    lp = _marchenko_pastur_edge(T, N, sigma2)
    noise = eigenvalues < lp
    ev = eigenvalues.copy()
    if noise.sum() > 0:
        ev[noise] = ev[noise].mean()     # replace noise bulk with its mean
    return ev, lp


def _lw_shrink(S: np.ndarray, n: int) -> np.ndarray:
    """
    Analytical Ledoit-Wolf shrinkage toward scaled identity (Oracle-Approx, 2004).
    Returns shrunk covariance matrix.
    """
    N = S.shape[0]
    mu = np.trace(S) / N
    F = mu * np.eye(N)
    diff = S - F
    frob2 = np.sum(diff ** 2)
    if frob2 < 1e-20:
        return S
    delta = min(1.0, ((n - 2) / n * frob2 + np.trace(S) ** 2) / ((n + 2) * frob2))
    return delta * F + (1 - delta) * S


# ── Main estimator ─────────────────────────────────────────────────────────────

def build_risk_model(
    prices: pd.DataFrame,
    half_life: int = 63,
    ann: int = 252,
    min_factors: int = 2,
    max_factors: int = 30,
    specific_shrink: float = 0.2,
) -> RiskModelResult:
    """
    Parameters
    ----------
    prices      : DataFrame  (T rows × N cols)  — adjusted-close prices
    half_life   : EWMA half-life in trading days
    ann         : trading days per year for annualisation
    min_factors : floor on signal-factor count
    max_factors : cap on signal-factor count
    specific_shrink : shrinkage of specific vols toward cross-sectional median
    """
    # ── 1. Log returns, drop columns with too many NaNs ──────────────────────
    rets = np.log(prices / prices.shift(1)).iloc[1:]
    # Drop tickers with >5% missing
    rets = rets.loc[:, rets.isna().mean() < 0.05].ffill().dropna(axis=1)
    rets = rets.fillna(0.0)

    tickers = list(rets.columns)
    R = rets.values.astype(float)
    T, N = R.shape

    # ── 2. Winsorise at 5σ per column ────────────────────────────────────────
    for j in range(N):
        c = R[:, j]
        mu, sig = c.mean(), c.std()
        if sig > 1e-12:
            R[:, j] = np.clip(c, mu - 5 * sig, mu + 5 * sig)

    # ── 3. EWMA covariance (daily) ────────────────────────────────────────────
    S = _ewma_cov(R, half_life)

    # ── 4. Eigendecompose (ascending → reverse to descending) ─────────────────
    ev_raw, V = np.linalg.eigh(S)
    order = np.argsort(ev_raw)[::-1]
    ev_raw, V = ev_raw[order], V[:, order]
    ev_raw = np.maximum(ev_raw, 0.0)     # numerical safety

    # ── 5. RMT denoising (Marchenko-Pastur clipping) ─────────────────────────
    ev_clipped, lp = _rmt_denoise(ev_raw, T, N)
    n_signal = int((ev_raw >= lp).sum())
    n_factors = max(min_factors, min(n_signal, max_factors))

    # Reconstruct denoised covariance
    S_denoised = V @ np.diag(ev_clipped) @ V.T
    S_denoised = (S_denoised + S_denoised.T) / 2

    # ── 6. Ledoit-Wolf shrinkage ───────────────────────────────────────────────
    S_shrunk = _lw_shrink(S_denoised, T)

    # Re-eigendecomp of shrunk matrix for stable loadings
    ev_s, V_s = np.linalg.eigh(S_shrunk)
    order_s = np.argsort(ev_s)[::-1]
    ev_s, V_s = ev_s[order_s], V_s[:, order_s]
    ev_s = np.maximum(ev_s, 0.0)

    # ── 7. Factor model decomposition ─────────────────────────────────────────
    Bk = V_s[:, :n_factors]            # N×k  loadings
    Lk = ev_s[:n_factors]              # k    factor daily variances

    # Residuals from factor reconstruction
    F = R @ Bk                         # T×k  factor returns
    R_hat = F @ Bk.T                   # T×N  explained part
    resid = R - R_hat                  # T×N  idiosyncratic

    D_daily = np.var(resid, axis=0, ddof=1)     # N specific daily variances

    # Shrink specific vols toward cross-sectional median
    D_med = np.median(D_daily)
    D_shrunk = (1 - specific_shrink) * D_daily + specific_shrink * D_med

    # ── 8. Annualise and assemble ─────────────────────────────────────────────
    Omega_f = np.diag(Lk * ann)                # k×k  factor cov (annualised)
    D_ann   = np.diag(D_shrunk * ann)          # N×N  specific (annualised)

    cov_ann = Bk @ Omega_f @ Bk.T + D_ann
    cov_ann = (cov_ann + cov_ann.T) / 2

    total_vols = np.sqrt(np.maximum(np.diag(cov_ann), 0.0))

    outer = np.outer(total_vols, total_vols)
    corr_ann = cov_ann / np.where(outer > 1e-12, outer, 1.0)
    np.fill_diagonal(corr_ann, 1.0)
    corr_ann = np.clip(corr_ann, -1.0, 1.0)

    factor_vols    = np.sqrt(Lk * ann)         # k
    specific_vols  = np.sqrt(D_shrunk * ann)   # N

    syst_var       = np.diag(Bk @ Omega_f @ Bk.T)
    total_var      = total_vols ** 2
    systematic_pct = syst_var / np.where(total_var > 1e-12, total_var, 1.0)

    total_trace    = total_var.sum()
    factor_expl    = (Lk * ann) / (total_trace if total_trace > 0 else 1.0)

    return RiskModelResult(
        tickers=tickers,
        n_assets=N,
        n_obs=T,
        n_factors=n_factors,
        lambda_plus=float(lp),
        loadings=Bk,
        factor_vols=factor_vols,
        specific_vols=specific_vols,
        total_vols=total_vols,
        systematic_pct=systematic_pct,
        cov_matrix=cov_ann,
        corr_matrix=corr_ann,
        all_eigenvalues=ev_raw,
        factor_expl_var=factor_expl,
    )


# ── Portfolio analytics ────────────────────────────────────────────────────────

def compute_portfolio_risk(
    model: RiskModelResult,
    weights: dict[str, float],
) -> PortfolioRiskResult:
    """
    Parameters
    ----------
    weights : {ticker: weight}  — need not sum to 1 (long-only or L/S)
    """
    w = np.array([weights.get(t, 0.0) for t in model.tickers])
    if np.abs(w).sum() < 1e-9:
        return PortfolioRiskResult(0, 0, 0, 0, 0, 0, 1, [])

    port_var = float(w @ model.cov_matrix @ w)
    port_vol = float(np.sqrt(max(port_var, 0.0)))

    # Factor contribution to portfolio variance
    Bw = model.loadings.T @ w                      # k
    factor_var = (Bw ** 2) * (model.factor_vols ** 2)
    specific_var = float(np.sum((w ** 2) * (model.specific_vols ** 2)))

    factor_pct = factor_var / (port_var + 1e-12)

    # Parametric VaR / CVaR (Normal)
    var_95  = port_vol * float(_norm.ppf(0.95))
    cvar_95 = port_vol * float(_norm.pdf(_norm.ppf(0.95)) / 0.05)
    var_99  = port_vol * float(_norm.ppf(0.99))

    return PortfolioRiskResult(
        port_vol=port_vol,
        port_var=port_var,
        var_95=var_95,
        cvar_95=cvar_95,
        var_99=var_99,
        systematic_pct=float(1 - specific_var / (port_var + 1e-12)),
        specific_pct=float(specific_var / (port_var + 1e-12)),
        factor_contributions=[
            {"factor": f"F{i+1}", "pct": float(factor_pct[i])}
            for i in range(model.n_factors)
        ],
    )
