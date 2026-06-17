"""
Unit tests for options pricing: Black-Scholes, Binomial Tree (CRR), Monte Carlo.

Mathematical invariants tested:
  - ATM call price against the closed-form formula
  - Put-call parity: C - P = S·e^(-qT) - K·e^(-rT)
  - Boundary conditions at expiry and zero volatility
  - Monotonicity of call/put prices in spot
  - CRR convergence to Black-Scholes
  - American put early-exercise premium
  - Monte Carlo within statistical tolerance of Black-Scholes
"""
import numpy as np
import pytest

from app.core.options.pricing import black_scholes, binomial_tree, monte_carlo


class TestBlackScholes:
    def test_atm_call_known_value(self):
        """ATM call (S=K=100, T=1, r=0, σ=0.2): d1=0.1, d2=-0.1 → price ≈ 7.966."""
        result = black_scholes(S=100, K=100, T=1.0, r=0.0, sigma=0.2)
        assert abs(result["price"] - 7.966) < 0.01

    def test_put_call_parity(self):
        """C - P = S·e^(-qT) - K·e^(-rT) must hold to floating-point precision."""
        S, K, T, r, sigma, q = 100.0, 100.0, 1.0, 0.05, 0.2, 0.02
        call = black_scholes(S, K, T, r, sigma, q, "call")["price"]
        put  = black_scholes(S, K, T, r, sigma, q, "put")["price"]
        parity = S * np.exp(-q * T) - K * np.exp(-r * T)
        assert abs((call - put) - parity) < 1e-6

    def test_zero_time_to_expiry_returns_intrinsic(self):
        """At expiry (T=0) price equals intrinsic value."""
        assert black_scholes(S=110, K=100, T=0.0, r=0.05, sigma=0.2, option_type="call")["price"] == pytest.approx(10.0)
        assert black_scholes(S=90,  K=100, T=0.0, r=0.05, sigma=0.2, option_type="call")["price"] == pytest.approx(0.0)
        assert black_scholes(S=90,  K=100, T=0.0, r=0.05, sigma=0.2, option_type="put")["price"]  == pytest.approx(10.0)

    def test_zero_volatility_returns_intrinsic(self):
        """Zero volatility: ITM call price equals intrinsic, OTM is 0."""
        assert black_scholes(S=110, K=100, T=1.0, r=0.0, sigma=0.0, option_type="call")["price"] == pytest.approx(10.0)
        assert black_scholes(S=90,  K=100, T=1.0, r=0.0, sigma=0.0, option_type="call")["price"] == pytest.approx(0.0)

    def test_deep_itm_call_prob_itm_near_one(self):
        """Deep ITM call: probability of expiring in-the-money approaches 1."""
        result = black_scholes(S=200, K=100, T=1.0, r=0.05, sigma=0.2, option_type="call")
        assert result["prob_itm"] > 0.99

    def test_deep_otm_call_price_near_zero(self):
        """Deep OTM call: price approaches 0."""
        result = black_scholes(S=50, K=200, T=1.0, r=0.05, sigma=0.2, option_type="call")
        assert result["price"] < 0.01

    def test_output_contains_all_keys(self):
        """Result dict must contain every documented key."""
        result = black_scholes(100, 100, 1.0, 0.05, 0.2)
        for key in ("price", "call", "put", "intrinsic", "time_value", "d1", "d2", "prob_itm"):
            assert key in result, f"Missing key: {key}"

    def test_time_value_always_nonnegative(self):
        """Time value = price - intrinsic must be ≥ 0 for any valid inputs."""
        scenarios = [
            (100, 100, 1.0, 0.05, 0.20, "call"),
            (100, 110, 1.0, 0.05, 0.30, "put"),
            (150, 100, 0.5, 0.02, 0.25, "call"),
            (80,  100, 2.0, 0.01, 0.15, "put"),
        ]
        for S, K, T, r, sigma, opt in scenarios:
            result = black_scholes(S, K, T, r, sigma, option_type=opt)
            assert result["time_value"] >= 0.0, f"Negative time value for {opt} S={S} K={K}"

    def test_call_monotonically_increasing_in_spot(self):
        """Call price must rise as spot rises (all else equal)."""
        prices = [black_scholes(S=s, K=100, T=1.0, r=0.05, sigma=0.2)["price"]
                  for s in range(60, 160, 10)]
        assert prices == sorted(prices)

    def test_put_monotonically_decreasing_in_spot(self):
        """Put price must fall as spot rises (all else equal)."""
        prices = [black_scholes(S=s, K=100, T=1.0, r=0.05, sigma=0.2, option_type="put")["price"]
                  for s in range(60, 160, 10)]
        assert prices == sorted(prices, reverse=True)

    def test_higher_vol_higher_option_price(self):
        """Option price (both call and put) is monotonically increasing in volatility."""
        call_prices = [black_scholes(100, 100, 1.0, 0.05, sig)["price"] for sig in [0.1, 0.2, 0.3, 0.4]]
        put_prices  = [black_scholes(100, 100, 1.0, 0.05, sig, option_type="put")["price"] for sig in [0.1, 0.2, 0.3, 0.4]]
        assert call_prices == sorted(call_prices)
        assert put_prices  == sorted(put_prices)

    def test_call_and_put_keys_consistent(self):
        """result['call'] and result['put'] should be consistent with put-call parity."""
        result = black_scholes(S=100, K=100, T=1.0, r=0.05, sigma=0.2)
        parity = 100 - 100 * np.exp(-0.05)
        assert abs((result["call"] - result["put"]) - parity) < 1e-6


class TestBinomialTree:
    def test_converges_to_black_scholes(self):
        """CRR with N=500 steps must match Black-Scholes within $0.01."""
        S, K, T, r, sigma = 100.0, 100.0, 1.0, 0.05, 0.2
        bs_price = black_scholes(S, K, T, r, sigma)["price"]
        bt_price = binomial_tree(S, K, T, r, sigma, N=500)["price"]
        assert abs(bt_price - bs_price) < 0.01

    def test_american_put_geq_european_put(self):
        """American put ≥ European put due to early-exercise value."""
        S, K, T, r, sigma = 100.0, 110.0, 1.0, 0.05, 0.2
        american = binomial_tree(S, K, T, r, sigma, N=300, option_type="put", american=True)["price"]
        european = binomial_tree(S, K, T, r, sigma, N=300, option_type="put", american=False)["price"]
        assert american >= european - 1e-9

    def test_output_contains_tree_arrays(self):
        """Result must include stock_tree and option_tree lists."""
        result = binomial_tree(100, 100, 1.0, 0.05, 0.2, N=10)
        assert "stock_tree" in result and "option_tree" in result
        assert isinstance(result["stock_tree"], list)
        assert isinstance(result["option_tree"], list)

    def test_deep_otm_price_near_zero(self):
        """Deep OTM option: binomial price should be negligible."""
        price = binomial_tree(50, 200, 1.0, 0.05, 0.2, N=100)["price"]
        assert price < 0.01

    def test_european_put_call_parity(self):
        """European binomial tree satisfies put-call parity within discretization error."""
        S, K, T, r = 100.0, 100.0, 1.0, 0.05
        call = binomial_tree(S, K, T, r, 0.2, N=300, option_type="call")["price"]
        put  = binomial_tree(S, K, T, r, 0.2, N=300, option_type="put")["price"]
        parity = S - K * np.exp(-r * T)
        assert abs((call - put) - parity) < 0.05  # binomial has O(1/N) discretization error

    def test_risk_neutral_prob_bounded(self):
        """Risk-neutral probability p must be in [0, 1]."""
        result = binomial_tree(100, 100, 1.0, 0.05, 0.2, N=50)
        assert 0.0 <= result["p"] <= 1.0


class TestMonteCarlo:
    def test_vanilla_within_black_scholes_tolerance(self):
        """Vanilla MC price must fall within 3 standard errors of Black-Scholes."""
        result = monte_carlo(100.0, 100.0, 1.0, 0.05, 0.2, n_sims=100_000, seed=42)
        bs_price = result["bs_price"]
        mc_price = result["price"]
        se = result["std_error"]
        assert abs(mc_price - bs_price) < 3 * se

    def test_deterministic_with_fixed_seed(self):
        """Same seed must produce identical prices."""
        p1 = monte_carlo(100, 100, 1.0, 0.05, 0.2, seed=7)["price"]
        p2 = monte_carlo(100, 100, 1.0, 0.05, 0.2, seed=7)["price"]
        assert p1 == p2

    def test_output_contains_required_keys(self):
        """Result must contain all documented output keys."""
        result = monte_carlo(100, 100, 1.0, 0.05, 0.2)
        for key in ("price", "std_error", "ci_95", "n_sims", "bs_price"):
            assert key in result

    def test_ci_contains_bs_price(self):
        """95% confidence interval should bracket the Black-Scholes price."""
        result = monte_carlo(100, 100, 1.0, 0.05, 0.2, n_sims=200_000, seed=42)
        lo, hi = result["ci_95"]
        assert lo <= result["bs_price"] <= hi

    def test_ci_lower_less_than_upper(self):
        """CI must be properly ordered."""
        result = monte_carlo(100, 100, 1.0, 0.05, 0.2)
        assert result["ci_95"][0] < result["ci_95"][1]

    def test_asian_at_most_vanilla_price(self):
        """Asian (average-price) option ≤ vanilla option: averaging reduces effective volatility."""
        S, K, T, r, sigma = 100.0, 100.0, 1.0, 0.05, 0.2
        vanilla = monte_carlo(S, K, T, r, sigma, n_sims=50_000, seed=0, exotic="vanilla")["price"]
        asian   = monte_carlo(S, K, T, r, sigma, n_sims=50_000, seed=0, exotic="asian")["price"]
        assert asian <= vanilla + 0.5  # allow small MC variance margin

    def test_n_sims_reflected_in_output(self):
        """Reported n_sims must match the requested count."""
        result = monte_carlo(100, 100, 1.0, 0.05, 0.2, n_sims=5_000)
        assert result["n_sims"] == 5_000
