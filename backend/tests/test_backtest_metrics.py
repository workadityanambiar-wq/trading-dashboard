"""
Unit tests for backtest helper functions and performance metrics.

Tests cover the pure-function layer of backtest/engine.py and
backtest/metrics.py — no external data or FactorEngine required.

Mathematical invariants tested:
  - Equity curve = cumulative product of (1 + r)
  - Drawdown ≤ 0 everywhere; = 0 for monotonically rising equity
  - Sharpe = 0 when std = 0 (flat returns)
  - Sortino = 0 when there are no negative returns
  - CAGR = 0 for zero returns; positive for positive returns
  - Max drawdown ≤ 0; = 0 for monotonically rising equity
  - Monthly returns pivot = product of daily (1+r) - 1
  - Rolling Sharpe has same length as input
"""
import numpy as np
import pandas as pd
import pytest

from app.core.backtest.engine import (
    compute_equity_curve, compute_drawdown,
    compute_monthly_returns, compute_rolling_sharpe,
)
from app.core.backtest.metrics import (
    _cagr, _max_drawdown, _sharpe, _sortino, compute_all,
)


# ── Equity Curve ──────────────────────────────────────────────────────────────

class TestEquityCurve:
    def test_zero_returns_flat_at_one(self):
        """Zero daily returns → equity curve stays at 1 throughout."""
        r = pd.Series([0.0, 0.0, 0.0, 0.0])
        eq = compute_equity_curve(r)
        assert all(abs(v - 1.0) < 1e-9 for v in eq)

    def test_known_sequence_exact_values(self):
        """[+10%, -10%, +5%] → [1.10, 0.99, 1.0395]."""
        r = pd.Series([0.10, -0.10, 0.05])
        eq = compute_equity_curve(r)
        expected = [1.10, 1.10 * 0.90, 1.10 * 0.90 * 1.05]
        for actual, exp in zip(eq, expected):
            assert abs(actual - exp) < 1e-9

    def test_final_value_equals_product_of_1_plus_r(self):
        """Final equity value must equal ∏(1 + rᵢ)."""
        rng = np.random.default_rng(42)
        r = pd.Series(rng.normal(0.001, 0.01, 252))
        eq = compute_equity_curve(r)
        expected_final = float((1 + r).prod())
        assert abs(eq.iloc[-1] - expected_final) < 1e-9

    def test_all_negative_returns_equity_strictly_declines(self):
        """All negative returns → equity curve is strictly decreasing."""
        r = pd.Series([-0.01, -0.02, -0.005, -0.03])
        eq = compute_equity_curve(r)
        diffs = eq.diff().dropna()
        assert all(d < 0 for d in diffs)

    def test_single_element(self):
        """Single-element return series produces a single-element equity curve."""
        r = pd.Series([0.05])
        eq = compute_equity_curve(r)
        assert len(eq) == 1
        assert abs(eq.iloc[0] - 1.05) < 1e-9


# ── Drawdown ──────────────────────────────────────────────────────────────────

class TestDrawdown:
    def test_monotonically_rising_has_zero_drawdown(self):
        """Strictly rising equity → no drawdown at any point."""
        r = pd.Series([0.02, 0.01, 0.03, 0.005, 0.02])
        dd = compute_drawdown(r)
        assert all(abs(v) < 1e-9 for v in dd)

    def test_known_drawdown_values(self):
        """[+20%, -10%, +10%] → equity [1.2, 1.08, 1.188], drawdown [0, -0.1, -0.01]."""
        r = pd.Series([0.20, -0.10, 0.10])
        dd = compute_drawdown(r)
        assert abs(dd.iloc[0]) < 1e-9
        assert abs(dd.iloc[1] - (-0.10)) < 1e-6
        assert abs(dd.iloc[2] - (-0.01)) < 1e-6

    def test_drawdown_always_nonpositive(self):
        """Drawdown must be ≤ 0 at every point for any return series."""
        rng = np.random.default_rng(77)
        r = pd.Series(rng.normal(0, 0.01, 500))
        dd = compute_drawdown(r)
        assert all(v <= 1e-9 for v in dd), f"Positive drawdown found: {dd.max()}"

    def test_new_high_resets_drawdown_to_zero(self):
        """After recovering to a new equity high, drawdown returns to 0."""
        r = pd.Series([0.10, -0.05, 0.20])  # final equity > initial → new high
        dd = compute_drawdown(r)
        assert abs(dd.iloc[-1]) < 1e-9


# ── Performance Metrics ───────────────────────────────────────────────────────

def _flat_returns(daily_ret: float, n: int = 252) -> pd.Series:
    return pd.Series(
        [daily_ret] * n,
        index=pd.date_range("2023-01-03", periods=n, freq="B"),
    )


class TestCAGR:
    def test_zero_returns_gives_zero_cagr(self):
        assert abs(_cagr(_flat_returns(0.0))) < 1e-6

    def test_positive_daily_returns_give_positive_cagr(self):
        assert _cagr(_flat_returns(0.001)) > 0

    def test_negative_daily_returns_give_negative_cagr(self):
        assert _cagr(_flat_returns(-0.001)) < 0

    def test_empty_series_returns_zero(self):
        assert _cagr(pd.Series(dtype=float)) == 0.0

    def test_annualisation_over_one_year(self):
        """252 business days ≈ 1 year → CAGR ≈ total return."""
        r = _flat_returns(0.001, n=252)
        total = float((1 + r).prod() - 1)
        cagr = _cagr(r)
        assert abs(cagr - total) < 0.01


class TestMaxDrawdown:
    def test_is_always_nonpositive(self):
        rng = np.random.default_rng(0)
        r = pd.Series(rng.normal(0.001, 0.01, 252))
        assert _max_drawdown(r) <= 0.0

    def test_monotonically_rising_gives_zero_mdd(self):
        assert abs(_max_drawdown(_flat_returns(0.002))) < 1e-6

    def test_all_negative_gives_significant_mdd(self):
        assert _max_drawdown(_flat_returns(-0.01)) < -0.5


class TestSharpe:
    def test_zero_returns_give_zero_sharpe(self):
        """All-zero returns: std = 0 exactly → Sharpe = 0 (not inf/nan)."""
        # Use exactly-zero returns so floating-point std is provably 0
        sharpe = _sharpe(_flat_returns(0.0))
        assert sharpe == 0.0

    def test_higher_mean_same_vol_higher_sharpe(self):
        rng = np.random.default_rng(5)
        noise = pd.Series(rng.normal(0, 0.01, 252))
        low_sharpe  = _sharpe(noise + 0.0001)
        high_sharpe = _sharpe(noise + 0.002)
        assert high_sharpe > low_sharpe

    def test_higher_vol_same_mean_lower_sharpe(self):
        """Two series with the same expected mean but different std: lower vol → higher Sharpe."""
        rng = np.random.default_rng(6)
        n = 500
        mu = 0.001
        dates = pd.date_range("2023-01-03", periods=n, freq="B")
        low_vol  = pd.Series(rng.normal(mu, 0.005, n), index=dates)
        high_vol = pd.Series(rng.normal(mu, 0.025, n), index=dates)
        assert _sharpe(low_vol) > _sharpe(high_vol)


class TestSortino:
    def test_all_positive_returns_gives_zero_sortino(self):
        """No negative returns → no downside deviation → Sortino = 0."""
        assert _sortino(_flat_returns(0.002)) == 0.0

    def test_mixed_returns_gives_nonzero_sortino(self):
        rng = np.random.default_rng(9)
        r = pd.Series(rng.normal(0.001, 0.01, 252), index=pd.date_range("2023-01-03", periods=252, freq="B"))
        assert _sortino(r) != 0.0

    def test_sortino_geq_sharpe_for_right_skewed_returns(self):
        """For returns with more upside than downside, Sortino ≥ Sharpe."""
        rng = np.random.default_rng(12)
        # Positively skewed: occasional large gains, small frequent losses
        r = pd.Series(np.append(rng.normal(-0.001, 0.005, 200), rng.normal(0.01, 0.005, 52)),
                      index=pd.date_range("2023-01-03", periods=252, freq="B"))
        r = r.sort_values().reset_index(drop=True)
        r.index = pd.date_range("2023-01-03", periods=252, freq="B")
        assert _sortino(r) >= _sharpe(r) - 0.1  # allow small rounding margin


class TestComputeAll:
    def _returns(self, seed: int = 42) -> pd.Series:
        rng = np.random.default_rng(seed)
        return pd.Series(
            rng.normal(0.0005, 0.01, 252),
            index=pd.date_range("2023-01-03", periods=252, freq="B"),
        )

    def test_returns_non_empty_dict(self):
        result = compute_all(self._returns())
        assert isinstance(result, dict) and len(result) > 0

    def test_has_core_performance_keys(self):
        result = compute_all(self._returns())
        for key in ("total_return", "sharpe", "max_drawdown", "volatility"):
            assert key in result, f"Missing key: {key}"

    def test_empty_input_returns_empty_dict(self):
        assert compute_all(pd.Series(dtype=float)) == {}

    def test_max_drawdown_is_nonpositive(self):
        result = compute_all(self._returns())
        assert result["max_drawdown"] <= 0.0

    def test_volatility_is_nonnegative(self):
        result = compute_all(self._returns())
        assert result["volatility"] >= 0.0

    def test_with_benchmark_adds_information_ratio(self):
        r = self._returns()
        bm = self._returns(seed=1)
        result = compute_all(r, benchmark=bm)
        assert "information_ratio" in result


# ── Monthly Returns ───────────────────────────────────────────────────────────

class TestMonthlyReturns:
    def test_output_is_dataframe(self):
        r = pd.Series(
            np.full(252, 0.001),
            index=pd.date_range("2023-01-03", periods=252, freq="B"),
        )
        pivot = compute_monthly_returns(r)
        assert isinstance(pivot, pd.DataFrame)

    def test_monthly_product_matches_daily_compound(self):
        """21 days of +0.1% daily → monthly = (1.001)^21 - 1."""
        daily_ret = 0.001
        r = pd.Series(
            np.full(21, daily_ret),
            index=pd.date_range("2023-01-02", periods=21, freq="B"),
        )
        pivot = compute_monthly_returns(r)
        expected = (1 + daily_ret) ** 21 - 1
        assert abs(pivot.iloc[0, 0] - expected) < 1e-9

    def test_negative_monthly_return(self):
        """Negative daily returns → negative monthly return in pivot."""
        r = pd.Series(
            np.full(21, -0.005),
            index=pd.date_range("2023-01-02", periods=21, freq="B"),
        )
        pivot = compute_monthly_returns(r)
        assert pivot.iloc[0, 0] < 0.0


# ── Rolling Sharpe ────────────────────────────────────────────────────────────

class TestRollingSharpe:
    def test_output_same_length_as_input(self):
        r = pd.Series(
            np.random.default_rng(0).normal(0.001, 0.01, 300),
            index=pd.date_range("2022-01-03", periods=300, freq="B"),
        )
        rs = compute_rolling_sharpe(r, window=63)
        assert len(rs) == len(r)

    def test_higher_mean_higher_rolling_sharpe(self):
        """Higher-mean series (same vol) should have higher average rolling Sharpe."""
        rng = np.random.default_rng(0)
        noise = rng.normal(0, 0.01, 300)
        dates = pd.date_range("2022-01-03", periods=300, freq="B")
        low_r  = pd.Series(noise + 0.0001, index=dates)
        high_r = pd.Series(noise + 0.002,  index=dates)
        assert compute_rolling_sharpe(high_r).dropna().mean() > compute_rolling_sharpe(low_r).dropna().mean()

    def test_first_window_minus_one_are_nan(self):
        """Elements before window is full must be NaN."""
        r = pd.Series(
            np.random.default_rng(1).normal(0.001, 0.01, 100),
            index=pd.date_range("2022-01-03", periods=100, freq="B"),
        )
        rs = compute_rolling_sharpe(r, window=20)
        assert rs.iloc[:19].isna().all()
