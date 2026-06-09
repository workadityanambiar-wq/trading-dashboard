"""
Fama-French 3-factor OLS attribution.

Regresses (portfolio_return - RF) on (Mkt-RF, SMB, HML).
Returns annualised alpha, factor betas, R², and t-statistics.
"""
import pandas as pd
import numpy as np
from typing import Optional
import logging

import statsmodels.api as sm

from app.core.risk.ff_factors import get_ff3

logger = logging.getLogger(__name__)


def ff3_attribution(
    portfolio_returns: pd.Series,
    start_date: Optional[str] = None,
) -> dict:
    """
    Run Fama-French 3-factor regression on a daily return series.

    Returns:
        alpha        – annualised Jensen's alpha (intercept × 252)
        beta_mkt     – market factor loading
        beta_smb     – size factor loading
        beta_hml     – value factor loading
        r_squared    – regression R²
        t_stats      – {alpha, mkt, smb, hml}
        p_values     – {alpha, mkt, smb, hml}
        n_obs        – number of observations
        residual_vol – annualised tracking error (residual std × √252)
    """
    start = start_date or portfolio_returns.index[0].strftime("%Y-%m-%d")
    end = portfolio_returns.index[-1].strftime("%Y-%m-%d")

    ff3 = get_ff3(start, end)
    if ff3.empty:
        return _empty_result("FF3 data unavailable — check internet connection")

    # Excess portfolio returns
    excess = portfolio_returns - ff3["RF"].reindex(portfolio_returns.index).fillna(0)

    aligned = pd.concat(
        [excess.rename("excess"), ff3[["Mkt-RF", "SMB", "HML"]]], axis=1
    ).dropna()

    if len(aligned) < 30:
        return _empty_result(f"Only {len(aligned)} aligned observations — need ≥30")

    X = sm.add_constant(aligned[["Mkt-RF", "SMB", "HML"]])
    y = aligned["excess"]

    model = sm.OLS(y, X).fit()

    daily_alpha = float(model.params.get("const", 0.0))
    resid_vol = float(model.resid.std() * np.sqrt(252))

    return {
        "alpha": round(daily_alpha * 252, 4),
        "beta_mkt": round(float(model.params.get("Mkt-RF", 0.0)), 4),
        "beta_smb": round(float(model.params.get("SMB", 0.0)), 4),
        "beta_hml": round(float(model.params.get("HML", 0.0)), 4),
        "r_squared": round(float(model.rsquared), 4),
        "t_stats": {
            "alpha": round(float(model.tvalues.get("const", 0.0)), 3),
            "mkt":   round(float(model.tvalues.get("Mkt-RF", 0.0)), 3),
            "smb":   round(float(model.tvalues.get("SMB", 0.0)), 3),
            "hml":   round(float(model.tvalues.get("HML", 0.0)), 3),
        },
        "p_values": {
            "alpha": round(float(model.pvalues.get("const", 1.0)), 4),
            "mkt":   round(float(model.pvalues.get("Mkt-RF", 1.0)), 4),
            "smb":   round(float(model.pvalues.get("SMB", 1.0)), 4),
            "hml":   round(float(model.pvalues.get("HML", 1.0)), 4),
        },
        "residual_vol": round(resid_vol, 4),
        "n_obs": len(aligned),
        "error": None,
    }


def _empty_result(reason: str) -> dict:
    return {
        "alpha": None, "beta_mkt": None, "beta_smb": None, "beta_hml": None,
        "r_squared": None, "t_stats": {}, "p_values": {}, "residual_vol": None,
        "n_obs": 0, "error": reason,
    }
