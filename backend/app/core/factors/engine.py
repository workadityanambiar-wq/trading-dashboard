"""
FactorEngine: orchestrates all factor computation, IC history, and quintile returns.

Price-based factors (full IC/quintile history):
  momentum_12_1, momentum_6_1, low_vol, liquidity, macro_regime

Fundamental factors (latest score only — no historical fundamental snapshots):
  value, size, quality, profitability, earnings_revisions, sentiment
"""
import pandas as pd
import numpy as np
from scipy import stats
from typing import Optional
import logging

from app.core.factors import base, momentum, volatility
from app.core.factors.liquidity import (
    liquidity_at, liquidity_latest, liquidity_history,
)
from app.core.factors.macro import (
    macro_regime_at, macro_regime_latest, macro_regime_history,
)

logger = logging.getLogger(__name__)

# ── Registry ──────────────────────────────────────────────────────────────────
# Each entry: label, whether full IC history is computable from prices alone.

FACTOR_REGISTRY: dict[str, dict] = {
    "momentum_12_1":    {"label": "Momentum 12-1M",      "ic_history": True},
    "momentum_6_1":     {"label": "Momentum 6-1M",       "ic_history": True},
    "low_vol":          {"label": "Low Volatility",      "ic_history": True},
    "liquidity":        {"label": "Liquidity",           "ic_history": True},
    "macro_regime":     {"label": "Macro Regime",        "ic_history": True},
    "value":            {"label": "Value",               "ic_history": False},
    "size":             {"label": "Size",                "ic_history": False},
    "quality":          {"label": "Quality",             "ic_history": False},
    "profitability":    {"label": "Profitability",       "ic_history": False},
    "earnings_revisions": {"label": "Earnings Revisions","ic_history": False},
    "sentiment":        {"label": "Sentiment",           "ic_history": False},
}

PRICE_BASED_FACTORS = {k for k, v in FACTOR_REGISTRY.items() if v["ic_history"]}


class FactorEngine:
    def __init__(
        self,
        prices: pd.DataFrame,
        fundamentals: Optional[pd.DataFrame] = None,
        volume: Optional[pd.DataFrame] = None,
    ):
        self.prices = prices
        self.fundamentals = fundamentals
        self.volume = volume
        self._me_idxs = base.get_month_end_indices(prices.index)

    # ── Latest scores (screener) ──────────────────────────────────────────────

    def latest_scores(self) -> pd.DataFrame:
        """Cross-sectional factor scores at the most recent date."""
        idx = len(self.prices) - 1

        raw: dict[str, pd.Series] = {
            "momentum_12_1": momentum.mom_12_1_latest(self.prices),
            "momentum_6_1":  momentum.mom_6_1_latest(self.prices),
            "realized_vol":  volatility.realized_vol_latest(self.prices),
        }

        if self.volume is not None:
            raw["liquidity_raw"] = liquidity_latest(self.prices, self.volume)

        raw["macro_beta"] = macro_regime_latest(self.prices)

        # Fundamental scores
        if self.fundamentals is not None and not self.fundamentals.empty:
            from app.core.factors.fundamentals import (
                value_scores, quality_scores, profitability_scores,
                revisions_scores, sentiment_scores, size_scores,
            )
            raw["value"]     = value_scores(self.fundamentals)
            raw["quality"]   = quality_scores(self.fundamentals)
            raw["profitability"] = profitability_scores(self.fundamentals)
            raw["revisions"] = revisions_scores(self.fundamentals)
            raw["sentiment"] = sentiment_scores(self.fundamentals)
            raw["size"]      = size_scores(self.fundamentals)

        df = pd.DataFrame({k: v for k, v in raw.items() if isinstance(v, pd.Series)})

        z = pd.DataFrame(index=df.index)
        def zs(col, invert=False):
            s = df[col] if col in df.columns else pd.Series(dtype=float)
            return base.cross_section_zscore(-s if invert else s)

        z["momentum_12_1_z"]       = zs("momentum_12_1")
        z["momentum_6_1_z"]        = zs("momentum_6_1")
        z["low_vol_z"]             = zs("realized_vol", invert=True)
        z["liquidity_z"]           = zs("liquidity_raw") if "liquidity_raw" in df.columns else pd.Series(np.nan, index=df.index)
        z["macro_regime_z"]        = zs("macro_beta")    # already negated beta
        z["value_z"]               = zs("value")         if "value"         in df.columns else pd.Series(np.nan, index=df.index)
        z["size_z"]                = zs("size")           if "size"          in df.columns else pd.Series(np.nan, index=df.index)
        z["quality_z"]             = zs("quality")        if "quality"       in df.columns else pd.Series(np.nan, index=df.index)
        z["profitability_z"]       = zs("profitability")  if "profitability" in df.columns else pd.Series(np.nan, index=df.index)
        z["earnings_revisions_z"]  = zs("revisions")      if "revisions"     in df.columns else pd.Series(np.nan, index=df.index)
        z["sentiment_z"]           = zs("sentiment")      if "sentiment"     in df.columns else pd.Series(np.nan, index=df.index)

        z_cols = [c for c in z.columns if c.endswith("_z")]
        z["composite"] = z[z_cols].mean(axis=1, skipna=True)

        # Surface the raw returns / vol too
        out = pd.DataFrame(index=df.index)
        out["momentum_12_1"] = df.get("momentum_12_1")
        out["momentum_6_1"]  = df.get("momentum_6_1")
        out["realized_vol"]  = df.get("realized_vol")
        return pd.concat([out, z], axis=1)

    # ── Factor score history (for IC / quintiles) ─────────────────────────────

    def factor_history(self, factor: str) -> pd.DataFrame:
        """Monthly (date × ticker) factor score matrix."""
        if factor == "momentum_12_1":
            return momentum.mom_12_1_history(self.prices, self._me_idxs)
        elif factor == "momentum_6_1":
            return momentum.mom_6_1_history(self.prices, self._me_idxs)
        elif factor == "low_vol":
            return volatility.low_vol_history(self.prices, self._me_idxs)
        elif factor == "liquidity":
            if self.volume is None:
                return pd.DataFrame()
            return liquidity_history(self.prices, self.volume, self._me_idxs)
        elif factor == "macro_regime":
            return macro_regime_history(self.prices, self._me_idxs)
        else:
            raise ValueError(f"No history available for fundamental factor '{factor}'")

    # ── IC time series ────────────────────────────────────────────────────────

    def ic_series(self, factor: str, horizon_days: int = 21) -> pd.DataFrame:
        """Monthly IC = Spearman(score[t], fwd_return[t+horizon])."""
        history = self.factor_history(factor)
        if history.empty:
            return pd.DataFrame(columns=["date", "ic", "ic_3m_ma", "cumulative_ic"])

        results = []
        for date in history.index:
            loc = self.prices.index.get_loc(date) if date in self.prices.index else None
            if loc is None or loc + horizon_days >= len(self.prices):
                continue

            fwd_date = self.prices.index[loc + horizon_days]
            scores   = history.loc[date].dropna()
            fwd_ret  = (self.prices.loc[fwd_date] / self.prices.loc[date] - 1).dropna()

            ic = base.compute_ic(scores, fwd_ret)
            if not np.isnan(ic):
                results.append({"date": date, "ic": ic})

        if not results:
            return pd.DataFrame(columns=["date", "ic", "ic_3m_ma", "cumulative_ic"])

        df = pd.DataFrame(results).set_index("date").sort_index()
        df["ic_3m_ma"]      = df["ic"].rolling(3, min_periods=1).mean()
        df["cumulative_ic"] = df["ic"].cumsum()
        return df.reset_index()

    # ── Quintile returns ──────────────────────────────────────────────────────

    def quintile_returns(self, factor: str, n_quintiles: int = 5) -> pd.DataFrame:
        """Monthly-rebalanced equal-weight Q1-Q5 cumulative returns."""
        history = self.factor_history(factor)
        if history.empty:
            return pd.DataFrame()

        month_ends = history.index.tolist()
        q_records: dict[str, list] = {f"Q{i+1}": [] for i in range(n_quintiles)}

        for i in range(len(month_ends) - 1):
            t0, t1 = month_ends[i], month_ends[i + 1]
            if t0 not in self.prices.index or t1 not in self.prices.index:
                continue

            scores = history.loc[t0].dropna()
            p0 = self.prices.loc[t0].dropna()
            p1 = self.prices.loc[t1].dropna()

            valid = scores.index.intersection(p0.index).intersection(p1.index)
            if len(valid) < n_quintiles * 2:
                continue

            rets = (p1[valid] / p0[valid] - 1)
            bins = pd.qcut(scores[valid].rank(method="first"), q=n_quintiles, labels=False)

            for q_idx in range(n_quintiles):
                tickers_q = bins[bins == q_idx].index
                q_ret = float(rets[tickers_q].mean())
                q_records[f"Q{q_idx + 1}"].append({"date": t1, "ret": q_ret})

        result = {}
        for q_label, records in q_records.items():
            if not records:
                continue
            s = pd.DataFrame(records).set_index("date")["ret"]
            result[q_label] = ((1 + s).cumprod() - 1).round(6)

        return pd.DataFrame(result)

    # ── Summary stats ─────────────────────────────────────────────────────────

    def factor_summary(self, factor: str) -> dict:
        base_dict = {"factor": factor, "mean_ic": None, "icir": None, "pct_positive": None, "n_obs": 0}
        if factor not in PRICE_BASED_FACTORS:
            return base_dict
        try:
            ic = self.ic_series(factor)
        except ValueError:
            return base_dict
        if ic.empty:
            return base_dict
        ic_vals = ic["ic"].dropna()
        return {
            "factor": factor,
            "mean_ic": round(float(ic_vals.mean()), 4),
            "icir": round(float(ic_vals.mean() / ic_vals.std()), 3) if ic_vals.std() > 0 else None,
            "pct_positive": round(float((ic_vals > 0).mean()), 4),
            "n_obs": len(ic_vals),
        }
