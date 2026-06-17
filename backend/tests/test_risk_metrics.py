"""
Unit tests for portfolio risk metrics: VaR/CVaR, concentration (HHI),
rolling beta, and portfolio return calculation.

Mathematical invariants tested:
  - Parametric VaR matches scipy normal quantile formula
  - CVaR is always worse (more negative) than VaR at every confidence level
  - Higher confidence level → worse VaR (monotonicity)
  - HHI = 1/N for equal-weight portfolio
  - HHI = 1 for single-stock portfolio
  - Rolling beta of 2×benchmark = 2
  - 50/50 portfolio return = arithmetic mean of constituent returns
  - Unnormalized weights produce the same returns as normalized weights
"""
import numpy as np
import pandas as pd
import pytest
from scipy import stats

from app.core.risk.metrics import (
    var_cvar, concentration, rolling_beta, portfolio_returns_from_weights,
)


# ── VaR / CVaR ────────────────────────────────────────────────────────────────

class TestVaRCVaR:
    def _normal_returns(self, n: int = 50_000, mu: float = 0.0,
                        sigma: float = 0.01, seed: int = 42) -> pd.Series:
        return pd.Series(np.random.default_rng(seed).normal(mu, sigma, n))

    def test_parametric_var_matches_normal_formula(self):
        """Parametric 95% VaR ≈ norm.ppf(0.05, mu, sigma) for large N."""
        mu, sigma = 0.0002, 0.01
        returns = self._normal_returns(mu=mu, sigma=sigma, n=100_000)
        result = var_cvar(returns, confidence_levels=[0.95])[0]
        expected = stats.norm.ppf(0.05, loc=mu, scale=sigma)
        assert abs(result["var_param"] - expected) < 5e-4

    def test_cvar_worse_than_var_historical(self):
        """Historical CVaR must be ≤ historical VaR (loss in tail > threshold loss)."""
        returns = self._normal_returns()
        for entry in var_cvar(returns, confidence_levels=[0.95, 0.99]):
            assert entry["cvar_hist"] <= entry["var_hist"] + 1e-9, (
                f"CVaR {entry['cvar_hist']} > VaR {entry['var_hist']} at {entry['confidence']}"
            )

    def test_cvar_worse_than_var_parametric(self):
        """Parametric CVaR must be ≤ parametric VaR."""
        returns = self._normal_returns()
        for entry in var_cvar(returns, confidence_levels=[0.95, 0.99]):
            assert entry["cvar_param"] <= entry["var_param"] + 1e-9

    def test_higher_confidence_produces_worse_var(self):
        """99% VaR must be ≤ 95% VaR (further into the loss tail)."""
        returns = self._normal_returns(n=10_000)
        res = var_cvar(returns, confidence_levels=[0.95, 0.99])
        assert res[1]["var_hist"] <= res[0]["var_hist"]
        assert res[1]["var_param"] <= res[0]["var_param"]

    def test_n_obs_counts_non_nan(self):
        """n_obs should equal the number of finite returns, excluding NaN."""
        returns = pd.Series([0.01, -0.02, 0.005, np.nan, 0.03])
        result = var_cvar(returns, confidence_levels=[0.95])
        assert result[0]["n_obs"] == 4

    def test_returns_one_entry_per_confidence_level(self):
        """Output list length must equal the number of requested confidence levels."""
        returns = self._normal_returns()
        result = var_cvar(returns, [0.90, 0.95, 0.99])
        assert len(result) == 3

    def test_confidence_field_matches_request(self):
        """Each result entry must carry the confidence level it was computed for."""
        returns = self._normal_returns()
        for conf, entry in zip([0.90, 0.95, 0.99], var_cvar(returns, [0.90, 0.95, 0.99])):
            assert entry["confidence"] == conf


# ── Concentration ─────────────────────────────────────────────────────────────

class TestConcentration:
    def test_equal_weights_hhi_equals_one_over_n(self):
        """For N equal weights, HHI = 1/N exactly."""
        for n in [5, 10, 20]:
            w = {f"T{i}": 1.0 / n for i in range(n)}
            result = concentration(w)
            assert abs(result["hhi"] - 1.0 / n) < 1e-4, f"n={n}: HHI={result['hhi']}, expected {1/n}"

    def test_single_stock_hhi_is_one(self):
        """A fully concentrated (1-stock) portfolio has HHI = 1."""
        result = concentration({"AAPL": 1.0})
        assert abs(result["hhi"] - 1.0) < 1e-6

    def test_effective_n_is_inverse_hhi(self):
        """effective_n = 1/HHI = N for equal-weight portfolios."""
        for n in [4, 8, 16]:
            w = {f"T{i}": 1.0 / n for i in range(n)}
            result = concentration(w)
            assert abs(result["effective_n"] - n) < 0.2

    def test_top5_weight_bounded_zero_to_one(self):
        """top5_weight ∈ [0, 1] always."""
        w = {f"T{i}": 1.0 / 20 for i in range(20)}
        result = concentration(w)
        assert 0.0 <= result["top5_weight"] <= 1.0

    def test_top10_weight_geq_top5_weight(self):
        """top10_weight ≥ top5_weight (superset of holdings)."""
        w = {f"T{i}": float(i + 1) for i in range(15)}
        result = concentration(w)
        assert result["top10_weight"] >= result["top5_weight"]

    def test_more_concentrated_higher_hhi(self):
        """A 2-stock portfolio has higher HHI than a 10-stock equal-weight portfolio."""
        hhi_2  = concentration({"A": 0.5, "B": 0.5})["hhi"]
        hhi_10 = concentration({f"T{i}": 0.1 for i in range(10)})["hhi"]
        assert hhi_2 > hhi_10

    def test_weights_normalized_internally(self):
        """Concentration function should normalize weights before computing HHI."""
        w_norm   = concentration({"A": 0.5, "B": 0.5})
        w_unnorm = concentration({"A": 5.0, "B": 5.0})
        assert abs(w_norm["hhi"] - w_unnorm["hhi"]) < 1e-6


# ── Rolling Beta ──────────────────────────────────────────────────────────────

class TestRollingBeta:
    def _random_returns(self, n: int = 300, seed: int = 0) -> pd.Series:
        return pd.Series(np.random.default_rng(seed).normal(0.0005, 0.01, n))

    def test_beta_against_self_is_one(self):
        """Rolling beta of a series against itself must be 1 everywhere."""
        r = self._random_returns()
        beta = rolling_beta(r, r, window=63).dropna()
        assert len(beta) > 0
        assert all(abs(b - 1.0) < 1e-6 for b in beta)

    def test_double_benchmark_beta_is_two(self):
        """If portfolio = 2 × benchmark, rolling beta = 2 everywhere."""
        bm = self._random_returns()
        port = 2 * bm
        beta = rolling_beta(port, bm, window=63).dropna()
        assert len(beta) > 0
        assert all(abs(b - 2.0) < 1e-6 for b in beta), f"Max deviation: {max(abs(b - 2.0) for b in beta)}"

    def test_output_same_length_as_input(self):
        """Rolling beta must have the same number of elements as input."""
        r = self._random_returns(200)
        b = self._random_returns(200, seed=1)
        beta = rolling_beta(r, b, window=63)
        assert len(beta) == 200

    def test_first_window_minus_one_are_nan(self):
        """Elements before window is full must be NaN."""
        r  = self._random_returns(100)
        b  = self._random_returns(100, seed=1)
        beta = rolling_beta(r, b, window=30)
        assert beta.iloc[:29].isna().all()
        assert not beta.iloc[29:].isna().all()


# ── Portfolio returns from weights ────────────────────────────────────────────

class TestPortfolioReturnsFromWeights:
    def _prices(self, data: dict, start: str = "2023-01-02") -> pd.DataFrame:
        n = len(next(iter(data.values())))
        return pd.DataFrame(data, index=pd.date_range(start, periods=n, freq="B"))

    def test_50_50_portfolio_return_is_mean(self):
        """50/50 portfolio return = mean of the two assets' returns on valid trading days.

        Note: the function uses .sum(skipna=True) which converts the day-0 pct_change
        NaN row to 0.0; we verify correctness only on the trading days after day 0.
        """
        prices = self._prices({"A": [100.0, 110.0, 105.0], "B": [100.0, 90.0, 95.0]})
        port = portfolio_returns_from_weights(prices, {"A": 0.5, "B": 0.5})
        r_A = prices["A"].pct_change()
        r_B = prices["B"].pct_change()
        for date in prices.index[1:]:  # skip day 0 where pct_change = NaN → 0.0
            expected = 0.5 * r_A.loc[date] + 0.5 * r_B.loc[date]
            assert abs(port.loc[date] - expected) < 1e-9

    def test_unnormalized_weights_same_as_normalized(self):
        """Weights are normalized internally; doubling all weights changes nothing."""
        prices = self._prices({"A": [100.0, 110.0, 105.0], "B": [100.0, 90.0, 95.0]})
        r_norm   = portfolio_returns_from_weights(prices, {"A": 0.5, "B": 0.5})
        r_unnorm = portfolio_returns_from_weights(prices, {"A": 1.0, "B": 1.0})
        pd.testing.assert_series_equal(r_norm, r_unnorm)

    def test_unknown_tickers_silently_ignored(self):
        """Tickers not in the price DataFrame should be silently excluded."""
        prices = self._prices({"A": [100.0, 110.0, 105.0]})
        result = portfolio_returns_from_weights(prices, {"A": 0.7, "MISSING": 0.3})
        assert not result.empty

    def test_no_matching_tickers_returns_empty(self):
        """If no tickers match, return empty Series without error."""
        prices = self._prices({"A": [100.0, 110.0]})
        result = portfolio_returns_from_weights(prices, {"X": 1.0, "Z": 0.5})
        assert result.empty

    def test_single_asset_full_weight(self):
        """100% in one asset → portfolio return = that asset's return on valid days."""
        prices = self._prices({"A": [100.0, 120.0, 90.0], "B": [100.0, 100.0, 100.0]})
        port = portfolio_returns_from_weights(prices, {"A": 1.0})
        r_A = prices["A"].pct_change()
        for date in prices.index[1:]:  # skip day 0 (NaN → 0.0 artifact)
            assert abs(port.loc[date] - r_A.loc[date]) < 1e-9
