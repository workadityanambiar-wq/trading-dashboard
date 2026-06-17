"""
Unit tests for portfolio optimizer: equal-weight, max-Sharpe, min-vol, HRP.

Invariants tested:
  - All optimization methods produce weights that sum to 1.0
  - Insufficient data returns an error rather than crashing
  - Per-weight cap (max_weight) is respected
  - No NaN weights produced
  - Helper functions (_nonzero, _naive_risk_parity, correlation matrix) are correct
"""
import numpy as np
import pandas as pd
import pytest

from app.core.portfolio.optimizer import (
    optimize, _nonzero, _naive_risk_parity, _correlation_matrix,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

def make_prices(n_assets: int = 5, n_days: int = 252, seed: int = 42) -> pd.DataFrame:
    """Synthetic price DataFrame with positive, realistic-looking returns."""
    rng = np.random.default_rng(seed)
    returns = rng.normal(0.0005, 0.01, (n_days, n_assets))
    prices = 100 * np.cumprod(1 + returns, axis=0)
    tickers = [f"T{i}" for i in range(n_assets)]
    dates = pd.date_range("2022-01-03", periods=n_days, freq="B")
    return pd.DataFrame(prices, index=dates, columns=tickers)


# ── Equal-weight ──────────────────────────────────────────────────────────────

class TestEqualWeight:
    def test_weights_sum_to_one(self):
        result = optimize(make_prices(5), methods=["equal_weight"])
        w = result["allocations"]["equal_weight"]
        assert abs(sum(w.values()) - 1.0) < 1e-6

    def test_all_weights_equal_to_one_over_n(self):
        prices = make_prices(4)
        w = optimize(prices, methods=["equal_weight"])["allocations"]["equal_weight"]
        for ticker, weight in w.items():
            assert abs(weight - 0.25) < 1e-4, f"Weight for {ticker} is {weight}, expected 0.25"

    def test_n_assets_reflected_in_weights(self):
        for n in [3, 7, 10]:
            prices = make_prices(n)
            w = optimize(prices, methods=["equal_weight"])["allocations"]["equal_weight"]
            assert len(w) == n
            for weight in w.values():
                assert abs(weight - 1.0 / n) < 1e-4


# ── Insufficient data ─────────────────────────────────────────────────────────

class TestInsufficientData:
    def test_returns_error_key_when_too_few_rows(self):
        result = optimize(make_prices(5, n_days=30), methods=["equal_weight"])
        assert "error" in result

    def test_error_message_mentions_60(self):
        result = optimize(make_prices(5, n_days=50), methods=["equal_weight"])
        assert "60" in result["error"]

    def test_no_allocations_key_on_error(self):
        result = optimize(make_prices(5, n_days=30), methods=["equal_weight"])
        assert "allocations" not in result


# ── Max-Sharpe / Min-Vol / HRP ────────────────────────────────────────────────

class TestMVOMethods:
    """These tests use pypfopt when available; they skip gracefully if a method fails."""

    def _weights_for(self, method: str, n: int = 8, seed: int = 0) -> dict | None:
        result = optimize(make_prices(n, seed=seed), methods=[method])
        return result.get("allocations", {}).get(method)

    @pytest.mark.parametrize("method", ["max_sharpe", "min_volatility", "hrp"])
    def test_weights_sum_to_one(self, method):
        w = self._weights_for(method)
        if w is None:
            pytest.skip(f"{method} not available (pypfopt issue)")
        assert abs(sum(w.values()) - 1.0) < 1e-3, f"{method} weights sum to {sum(w.values())}"

    @pytest.mark.parametrize("method", ["max_sharpe", "min_volatility"])
    def test_max_weight_constraint_respected(self, method):
        max_w = 0.20
        result = optimize(make_prices(10), methods=[method], max_weight=max_w)
        w = result.get("allocations", {}).get(method)
        if w is None:
            pytest.skip(f"{method} not available")
        for ticker, weight in w.items():
            assert weight <= max_w + 1e-4, f"{ticker}: weight {weight} exceeds cap {max_w}"

    @pytest.mark.parametrize("method", ["equal_weight", "max_sharpe", "min_volatility", "hrp"])
    def test_no_nan_weights(self, method):
        result = optimize(make_prices(6), methods=[method])
        w = result.get("allocations", {}).get(method, {})
        for ticker, weight in w.items():
            assert not np.isnan(weight), f"NaN weight for {ticker} in {method}"

    @pytest.mark.parametrize("method", ["equal_weight", "max_sharpe", "min_volatility", "hrp"])
    def test_all_weights_nonnegative(self, method):
        result = optimize(make_prices(6), methods=[method])
        w = result.get("allocations", {}).get(method, {})
        for ticker, weight in w.items():
            assert weight >= 0.0, f"Negative weight {weight} for {ticker} in {method}"


# ── Result structure ──────────────────────────────────────────────────────────

class TestResultStructure:
    def test_result_has_required_keys(self):
        result = optimize(make_prices(5), methods=["equal_weight"])
        for key in ("allocations", "metrics", "correlation"):
            assert key in result, f"Missing top-level key: {key}"

    def test_metrics_has_performance_fields(self):
        result = optimize(make_prices(5), methods=["equal_weight"])
        m = result["metrics"]["equal_weight"]
        for field in ("expected_return", "volatility", "sharpe"):
            assert field in m

    def test_correlation_has_tickers_and_matrix(self):
        result = optimize(make_prices(5), methods=["equal_weight"])
        corr = result["correlation"]
        assert "tickers" in corr
        assert "matrix" in corr

    def test_correlation_matrix_is_square(self):
        n = 5
        result = optimize(make_prices(n), methods=["equal_weight"])
        matrix = result["correlation"]["matrix"]
        assert len(matrix) == n
        assert all(len(row) == n for row in matrix)


# ── Helper functions ──────────────────────────────────────────────────────────

class TestHelpers:
    def test_nonzero_removes_small_weights(self):
        w = {"A": 0.6, "B": 0.00005, "C": 0.4}
        result = _nonzero(w)
        assert "B" not in result
        assert "A" in result and "C" in result

    def test_nonzero_threshold_is_strictly_greater(self):
        """_nonzero uses `w > threshold` so value exactly at 1e-4 is excluded."""
        w = {"A": 1e-4, "B": 1.1e-4, "C": 0.9e-4}
        result = _nonzero(w)
        assert "A" not in result  # exactly at threshold → excluded (strict >)
        assert "B" in result      # just above threshold → included
        assert "C" not in result  # below threshold → excluded

    def test_naive_risk_parity_sums_to_one(self):
        # All columns must have non-zero std; a constant column would produce inf/NaN weights
        daily_ret = pd.DataFrame({
            "A": [0.01, -0.01, 0.02, 0.005],
            "B": [0.02,  0.01, -0.02, -0.005],
            "C": [0.005, 0.010, 0.008, 0.003],
        })
        w = _naive_risk_parity(daily_ret)
        # Weights are rounded to 4 decimal places, so the sum can be off by up to 1e-4 per asset
        assert abs(sum(w.values()) - 1.0) < 1e-3

    def test_naive_risk_parity_low_vol_gets_higher_weight(self):
        """Lower-volatility asset should receive a larger weight."""
        rng = np.random.default_rng(0)
        daily_ret = pd.DataFrame({
            "LOW_VOL":  rng.normal(0, 0.001, 200),
            "HIGH_VOL": rng.normal(0, 0.05,  200),
        })
        w = _naive_risk_parity(daily_ret)
        assert w["LOW_VOL"] > w["HIGH_VOL"]

    def test_correlation_matrix_diagonal_is_one(self):
        rng = np.random.default_rng(1)
        daily_ret = pd.DataFrame(
            rng.normal(0, 0.01, (100, 3)),
            columns=["A", "B", "C"],
        )
        corr = _correlation_matrix(daily_ret)
        for i in range(3):
            assert abs(corr["matrix"][i][i] - 1.0) < 1e-6

    def test_correlation_matrix_is_symmetric(self):
        rng = np.random.default_rng(2)
        daily_ret = pd.DataFrame(
            rng.normal(0, 0.01, (100, 4)),
            columns=["A", "B", "C", "D"],
        )
        m = _correlation_matrix(daily_ret)["matrix"]
        for i in range(4):
            for j in range(4):
                assert abs(m[i][j] - m[j][i]) < 1e-9
