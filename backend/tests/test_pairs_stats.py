"""
Unit tests for pairs trading statistical analysis.

Tests cover the core statistical functions used for pair selection:
  - _hurst_exponent: variance-of-differences method
  - _half_life: Ornstein-Uhlenbeck mean-reversion speed
  - compute_pair_stats: full statistical pipeline

Mathematical invariants tested:
  - Hurst ∈ [0, 1] for any input
  - Short series fallback returns exactly 0.5 (Hurst) or 999.0 (half-life)
  - Random walk Hurst is near 0.5
  - OU process half-life matches theoretical -ln(2)/λ
  - Quality score ∈ [0, 100]
  - Pearson correlation ∈ [-1, 1]
  - Boolean flags consistent with their underlying statistics
  - Insufficient data raises ValueError
"""
import numpy as np
import pandas as pd
import pytest

from app.core.pairs.stats import _hurst_exponent, _half_life, compute_pair_stats


# ── Hurst Exponent ────────────────────────────────────────────────────────────

class TestHurstExponent:
    def test_short_series_returns_half(self):
        """Series shorter than 20 observations → fallback H = 0.5."""
        assert _hurst_exponent(np.arange(10, dtype=float)) == 0.5
        assert _hurst_exponent(np.array([1.0])) == 0.5

    def test_output_always_in_zero_one(self):
        """Hurst exponent must be clipped to [0, 1] for any input."""
        rng = np.random.default_rng(42)
        for _ in range(5):
            series = rng.normal(0, 1, 500)
            h = _hurst_exponent(series)
            assert 0.0 <= h <= 1.0, f"Hurst {h} out of [0,1]"

    def test_random_walk_hurst_near_half(self):
        """A pure random walk should have H ≈ 0.5 (not strongly trending or reverting)."""
        rng = np.random.default_rng(0)
        rw = np.cumsum(rng.normal(0, 1, 2000))
        h = _hurst_exponent(rw)
        assert 0.3 <= h <= 0.7, f"Random walk Hurst = {h}, expected near 0.5"

    def test_stationary_series_lower_h_than_trending(self):
        """Stationary (i.i.d.) series should have lower H than a strong trend."""
        rng = np.random.default_rng(1)
        stationary = rng.normal(0, 1, 800)           # i.i.d., mean-reverting by construction
        trending   = np.cumsum(rng.normal(0.2, 0.5, 800))  # strong upward drift
        h_stat  = _hurst_exponent(stationary)
        h_trend = _hurst_exponent(trending)
        assert h_stat < h_trend, f"Expected H(stationary)={h_stat} < H(trending)={h_trend}"

    def test_minimum_series_boundary(self):
        """Exactly 20 observations should not fall back to 0.5."""
        rng = np.random.default_rng(3)
        series = rng.normal(0, 1, 20)
        h = _hurst_exponent(series)
        assert isinstance(h, float)
        assert 0.0 <= h <= 1.0


# ── Half-Life ─────────────────────────────────────────────────────────────────

class TestHalfLife:
    def test_short_series_returns_999(self):
        """Series shorter than 10 → returns 999.0 (no mean reversion detected)."""
        assert _half_life(np.arange(5, dtype=float)) == 999.0
        assert _half_life(np.array([1.0, 2.0])) == 999.0

    def test_output_always_in_1_to_999(self):
        """Half-life must be clipped to [1, 999]."""
        rng = np.random.default_rng(42)
        for _ in range(5):
            series = rng.normal(0, 1, 200)
            hl = _half_life(series)
            assert 1.0 <= hl <= 999.0, f"Half-life {hl} out of [1, 999]"

    def test_random_walk_has_very_large_half_life(self):
        """A random walk should have a very long half-life (weak/no mean reversion).

        Note: _half_life only returns 999 when the estimated λ ≥ 0. For finite samples
        of a random walk, λ is a noisy estimate and may be slightly negative, producing
        a large but finite half-life rather than exactly 999.
        """
        rng = np.random.default_rng(7)
        rw = np.cumsum(rng.normal(0, 1, 500))
        hl = _half_life(rw)
        assert hl >= 50, f"Expected large half-life for random walk, got {hl}"

    def test_known_ou_process_half_life(self):
        """
        Simulate OU process: Δs = λ·s_{t-1} + ε with λ = -0.15.
        Theoretical half-life = -ln(2) / λ ≈ 4.62 days.
        Estimated value should be within ±4 days.
        """
        rng = np.random.default_rng(99)
        lam = -0.15
        n = 3000
        spread = np.zeros(n)
        for i in range(1, n):
            spread[i] = spread[i - 1] + lam * spread[i - 1] + rng.normal(0, 0.1)
        hl = _half_life(spread)
        expected = -np.log(2) / lam  # ≈ 4.62
        assert abs(hl - expected) < 4.0, f"Half-life {hl:.2f}, expected ≈ {expected:.2f}"

    def test_constant_series_returns_999(self):
        """Constant spread (no variance) → var_lag ≈ 0 → returns 999."""
        hl = _half_life(np.ones(50))
        assert hl == 999.0


# ── compute_pair_stats ────────────────────────────────────────────────────────

class TestComputePairStats:
    def _make_prices(self, n: int = 250, correlated: bool = True,
                     seed: int = 42) -> tuple[pd.Series, pd.Series]:
        """Generate a pair of price series, optionally with a strong common factor."""
        rng = np.random.default_rng(seed)
        if correlated:
            common = rng.normal(0, 0.015, n)       # strong common component
            r1 = common + rng.normal(0, 0.002, n)  # 7.5:1 SNR → Pearson ≈ 0.98
            r2 = common + rng.normal(0, 0.002, n)
        else:
            r1 = rng.normal(0, 0.01, n)
            r2 = rng.normal(0, 0.01, n)
        p1 = pd.Series(100 * np.cumprod(1 + r1))
        p2 = pd.Series(100 * np.cumprod(1 + r2))
        return p1, p2

    def test_insufficient_data_raises_value_error(self):
        """Fewer than 60 observations → ValueError with informative message."""
        p1 = pd.Series(np.ones(50) * 100.0)
        p2 = pd.Series(np.ones(50) * 100.0)
        with pytest.raises(ValueError, match="(?i)insufficient"):
            compute_pair_stats("A", "B", p1, p2)

    def test_quality_score_bounded_zero_to_100(self):
        """Quality score must be in [0, 100] for any valid pair."""
        p1, p2 = self._make_prices()
        result = compute_pair_stats("X", "Y", p1, p2)
        assert 0.0 <= result.quality_score <= 100.0

    def test_pearson_corr_bounded(self):
        """Pearson correlation must be in [-1, 1]."""
        p1, p2 = self._make_prices()
        result = compute_pair_stats("X", "Y", p1, p2)
        assert -1.0 <= result.pearson_corr <= 1.0

    def test_correlated_pair_higher_quality_than_uncorrelated(self):
        """A pair with a strong common factor should score higher than an independent pair."""
        p1c, p2c = self._make_prices(correlated=True,  seed=10)
        p1u, p2u = self._make_prices(correlated=False, seed=11)
        score_corr  = compute_pair_stats("A", "B", p1c, p2c).quality_score
        score_uncorr = compute_pair_stats("C", "D", p1u, p2u).quality_score
        assert score_corr > score_uncorr, (
            f"Correlated score {score_corr:.1f} not higher than uncorrelated {score_uncorr:.1f}"
        )

    def test_n_obs_matches_input_length(self):
        """n_obs must equal the length of the aligned (non-NaN) price series."""
        p1, p2 = self._make_prices(n=200)
        result = compute_pair_stats("X", "Y", p1, p2)
        assert result.n_obs == 200

    def test_is_adf_stationary_matches_pvalue(self):
        """is_adf_stationary must equal (adf_pvalue < 0.05)."""
        p1, p2 = self._make_prices()
        result = compute_pair_stats("X", "Y", p1, p2)
        assert result.is_adf_stationary == (result.adf_pvalue < 0.05)

    def test_is_cointegrated_matches_johansen(self):
        """is_cointegrated must equal (johansen_trace_stat > johansen_crit_95)."""
        p1, p2 = self._make_prices()
        result = compute_pair_stats("X", "Y", p1, p2)
        assert result.is_cointegrated == (result.johansen_trace_stat > result.johansen_crit_95)

    def test_output_field_types(self):
        """All dataclass fields must have the correct Python types."""
        p1, p2 = self._make_prices()
        r = compute_pair_stats("X", "Y", p1, p2)
        assert isinstance(r.pearson_corr,        float)
        assert isinstance(r.spearman_corr,       float)
        assert isinstance(r.adf_pvalue,          float)
        assert isinstance(r.quality_score,       float)
        assert isinstance(r.hurst_exponent,      float)
        assert isinstance(r.half_life_days,      float)
        assert isinstance(r.volatility_ratio,    float)
        assert isinstance(r.is_adf_stationary,   bool)
        assert isinstance(r.is_cointegrated,     bool)
        assert isinstance(r.n_obs,               int)

    def test_ticker_names_preserved(self):
        """Ticker names in the result must match the inputs."""
        p1, p2 = self._make_prices()
        result = compute_pair_stats("AAPL", "MSFT", p1, p2)
        assert result.ticker1 == "AAPL"
        assert result.ticker2 == "MSFT"

    def test_hurst_exponent_bounded(self):
        """Hurst exponent in the result must be in [0, 1]."""
        p1, p2 = self._make_prices()
        result = compute_pair_stats("X", "Y", p1, p2)
        assert 0.0 <= result.hurst_exponent <= 1.0

    def test_half_life_bounded(self):
        """Half-life in the result must be in [1, 999]."""
        p1, p2 = self._make_prices()
        result = compute_pair_stats("X", "Y", p1, p2)
        assert 1.0 <= result.half_life_days <= 999.0
