"""
Signal generation for the Strategy Builder.

Each function accepts wide-format price DataFrames (DatetimeIndex × tickers)
and returns a score DataFrame of the same shape where higher = more bullish.
Scores are cross-sectionally z-scored before compositing.
"""
import pandas as pd
import numpy as np
from typing import Optional


# ── Helpers ────────────────────────────────────────────────────────────────────

def _zscore_cs(df: pd.DataFrame) -> pd.DataFrame:
    """Cross-sectional z-score row-wise."""
    m = df.mean(axis=1)
    s = df.std(axis=1).replace(0, np.nan)
    return df.sub(m, axis=0).div(s, axis=0)


def _rank_cs(df: pd.DataFrame) -> pd.DataFrame:
    """Cross-sectional rank (0-1)."""
    return df.rank(axis=1, pct=True)


# ── Technical Signals ──────────────────────────────────────────────────────────

def ma_crossover(close: pd.DataFrame, fast: int = 50, slow: int = 200) -> pd.DataFrame:
    """Fast MA / Slow MA ratio minus 1. Positive = fast above slow."""
    fast_ma = close.rolling(fast).mean()
    slow_ma = close.rolling(slow).mean()
    signal = (fast_ma / slow_ma.replace(0, np.nan)) - 1
    return _zscore_cs(signal)


def rsi_signal(close: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    """RSI-based signal. High RSI (momentum) flipped to z-score."""
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    # For momentum: higher RSI = stronger trend
    return _zscore_cs(rsi)


def macd_signal(close: pd.DataFrame, fast: int = 12, slow: int = 26, signal_period: int = 9) -> pd.DataFrame:
    """MACD histogram z-score. Positive = bullish momentum."""
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal_period, adjust=False).mean()
    histogram = macd_line - signal_line
    return _zscore_cs(histogram)


def bollinger_pct_b(close: pd.DataFrame, period: int = 20, std_dev: float = 2.0) -> pd.DataFrame:
    """Bollinger %B. 0=lower band, 1=upper band. Higher = stronger uptrend."""
    sma = close.rolling(period).mean()
    std = close.rolling(period).std()
    upper = sma + std_dev * std
    lower = sma - std_dev * std
    pct_b = (close - lower) / (upper - lower).replace(0, np.nan)
    return _zscore_cs(pct_b)


def atr_signal(close: pd.DataFrame, high: pd.DataFrame, low: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    """Normalized ATR (ATR/Price). Lower ATR = tighter range = higher signal for low-vol strategies."""
    tr = pd.concat([
        high - low,
        (high - close.shift()).abs(),
        (low - close.shift()).abs(),
    ], axis=1).max(axis=1, level=None) if False else None

    # Vectorized TR calculation
    hl = high - low
    hpc = (high - close.shift(1)).abs()
    lpc = (low - close.shift(1)).abs()

    # For each ticker separately — stack approach
    tickers = close.columns
    atr_dict = {}
    for t in tickers:
        tr_t = pd.concat([hl[t], hpc[t], lpc[t]], axis=1).max(axis=1)
        atr_dict[t] = tr_t.rolling(period).mean()

    atr_df = pd.DataFrame(atr_dict, index=close.index)
    normalized_atr = atr_df / close.replace(0, np.nan)
    # Invert: lower ATR gets higher score (less volatile = less risky)
    return _zscore_cs(-normalized_atr)


def adx_signal(close: pd.DataFrame, high: pd.DataFrame, low: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    """ADX trend strength. Higher ADX = stronger trend."""
    tickers = close.columns
    adx_dict = {}
    for t in tickers:
        h, l, c = high[t], low[t], close[t]
        up_move = h.diff()
        down_move = -l.diff()
        plus_dm = pd.Series(np.where((up_move > down_move) & (up_move > 0), up_move, 0), index=c.index)
        minus_dm = pd.Series(np.where((down_move > up_move) & (down_move > 0), down_move, 0), index=c.index)

        tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
        atr = tr.ewm(span=period, adjust=False).mean()

        plus_di = 100 * plus_dm.ewm(span=period, adjust=False).mean() / atr.replace(0, np.nan)
        minus_di = 100 * minus_dm.ewm(span=period, adjust=False).mean() / atr.replace(0, np.nan)
        dx = (100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan))
        adx_dict[t] = dx.ewm(span=period, adjust=False).mean()

    adx_df = pd.DataFrame(adx_dict, index=close.index)
    return _zscore_cs(adx_df)


def stochastic_signal(close: pd.DataFrame, high: pd.DataFrame, low: pd.DataFrame, k_period: int = 14, d_period: int = 3) -> pd.DataFrame:
    """Stochastic %K. Higher = price near top of range."""
    low_min = low.rolling(k_period).min()
    high_max = high.rolling(k_period).max()
    k = 100 * (close - low_min) / (high_max - low_min).replace(0, np.nan)
    d = k.rolling(d_period).mean()
    return _zscore_cs(d)


def donchian_signal(close: pd.DataFrame, high: pd.DataFrame, period: int = 20) -> pd.DataFrame:
    """Donchian channel breakout. 1 = at/near upper channel (breakout)."""
    upper = high.rolling(period).max()
    lower = close.rolling(period).min()
    position = (close - lower) / (upper - lower).replace(0, np.nan)
    return _zscore_cs(position)


def volume_breakout(close: pd.DataFrame, volume: pd.DataFrame, period: int = 20) -> pd.DataFrame:
    """Volume surge above average, weighted by positive price move."""
    vol_ratio = volume / volume.rolling(period).mean().replace(0, np.nan)
    price_change = close.pct_change()
    signal = vol_ratio * price_change.clip(lower=0)
    return _zscore_cs(signal)


def vwap_signal(close: pd.DataFrame, high: pd.DataFrame, low: pd.DataFrame, volume: pd.DataFrame, period: int = 20) -> pd.DataFrame:
    """Approximate rolling VWAP. Price above rolling VWAP = bullish."""
    typical_price = (high + low + close) / 3
    vwap = (typical_price * volume).rolling(period).sum() / volume.rolling(period).sum().replace(0, np.nan)
    signal = (close / vwap.replace(0, np.nan)) - 1
    return _zscore_cs(signal)


# ── Quantitative Signals ───────────────────────────────────────────────────────

def momentum(close: pd.DataFrame, lookback_days: int, skip_days: int = 21) -> pd.DataFrame:
    """Price momentum: return over lookback, skipping recent skip_days."""
    past = close.shift(skip_days)
    start = close.shift(lookback_days)
    signal = (past / start.replace(0, np.nan)) - 1
    return _zscore_cs(signal)


def relative_strength(close: pd.DataFrame, benchmark: pd.Series, period: int = 63) -> pd.DataFrame:
    """Return of each stock relative to benchmark over period."""
    stock_ret = close.pct_change(period)
    bm_ret = benchmark.pct_change(period)
    signal = stock_ret.sub(bm_ret, axis=0)
    return _zscore_cs(signal)


def volatility_signal(close: pd.DataFrame, period: int = 21) -> pd.DataFrame:
    """Low volatility signal: lower realized vol = higher score."""
    vol = close.pct_change().rolling(period).std() * np.sqrt(252)
    return _zscore_cs(-vol)


def mean_reversion(close: pd.DataFrame, period: int = 20) -> pd.DataFrame:
    """Mean reversion: price below rolling mean = higher score."""
    sma = close.rolling(period).mean()
    deviation = (close / sma.replace(0, np.nan)) - 1
    return _zscore_cs(-deviation)


def beta_signal(close: pd.DataFrame, benchmark: pd.Series, period: int = 126) -> pd.DataFrame:
    """Low beta signal: lower beta = higher score."""
    bm_ret = benchmark.pct_change()
    stock_ret = close.pct_change()
    tickers = close.columns
    beta_dict = {}
    for t in tickers:
        cov = stock_ret[t].rolling(period).cov(bm_ret)
        var = bm_ret.rolling(period).var()
        beta_dict[t] = cov / var.replace(0, np.nan)
    beta_df = pd.DataFrame(beta_dict, index=close.index)
    return _zscore_cs(-beta_df)


def correlation_signal(close: pd.DataFrame, benchmark: pd.Series, period: int = 63) -> pd.DataFrame:
    """Low correlation to benchmark = higher score (diversification)."""
    bm_ret = benchmark.pct_change()
    stock_ret = close.pct_change()
    tickers = close.columns
    corr_dict = {}
    for t in tickers:
        corr_dict[t] = stock_ret[t].rolling(period).corr(bm_ret)
    corr_df = pd.DataFrame(corr_dict, index=close.index)
    return _zscore_cs(-corr_df)


def earnings_momentum(close: pd.DataFrame, period: int = 63) -> pd.DataFrame:
    """Post-earnings price momentum (proxy: 3-month return acceleration)."""
    ret_3m = close.pct_change(63)
    ret_1m = close.pct_change(21)
    signal = ret_1m - (ret_3m / 3)
    return _zscore_cs(signal)


# ── Regime Signals (applied as portfolio-level filters) ───────────────────────

def compute_regime_mask(
    benchmark: pd.Series,
    vix: Optional[pd.Series],
    regime_filter: str,
) -> pd.Series:
    """
    Returns a boolean Series (index = dates) where True = filter passes (trade).
    """
    bm_ret = benchmark.pct_change()
    sma200 = benchmark.rolling(200).mean()
    sma50 = benchmark.rolling(50).mean()

    if regime_filter == "bull_market":
        return benchmark > sma200
    elif regime_filter == "bear_market":
        return benchmark < sma200
    elif regime_filter == "high_volatility":
        if vix is not None:
            return vix > 25
        rolling_vol = bm_ret.rolling(21).std() * np.sqrt(252)
        return rolling_vol > 0.25
    elif regime_filter == "low_volatility":
        if vix is not None:
            return vix < 15
        rolling_vol = bm_ret.rolling(21).std() * np.sqrt(252)
        return rolling_vol < 0.15
    elif regime_filter == "risk_on":
        return (benchmark > sma50) & (bm_ret.rolling(21).mean() > 0)
    elif regime_filter == "risk_off":
        return (benchmark < sma50) | (bm_ret.rolling(21).mean() < 0)
    else:
        return pd.Series(True, index=benchmark.index)


# ── Signal Registry ────────────────────────────────────────────────────────────

TECHNICAL_SIGNALS = {
    "ma_crossover": ma_crossover,
    "rsi": rsi_signal,
    "macd": macd_signal,
    "bollinger_bands": bollinger_pct_b,
    "atr": atr_signal,
    "adx": adx_signal,
    "stochastic": stochastic_signal,
    "donchian": donchian_signal,
    "volume_breakout": volume_breakout,
    "vwap": vwap_signal,
}

QUANT_SIGNALS = {
    "momentum_1m": lambda c, h, l, v, bm: momentum(c, 21, 0),
    "momentum_3m": lambda c, h, l, v, bm: momentum(c, 63, 21),
    "momentum_6m": lambda c, h, l, v, bm: momentum(c, 126, 21),
    "momentum_12m": lambda c, h, l, v, bm: momentum(c, 252, 21),
    "relative_strength": lambda c, h, l, v, bm: relative_strength(c, bm),
    "low_volatility": lambda c, h, l, v, bm: volatility_signal(c),
    "mean_reversion": lambda c, h, l, v, bm: mean_reversion(c),
    "low_beta": lambda c, h, l, v, bm: beta_signal(c, bm),
    "low_correlation": lambda c, h, l, v, bm: correlation_signal(c, bm),
    "earnings_momentum": lambda c, h, l, v, bm: earnings_momentum(c),
}


def compute_composite_signal(
    close: pd.DataFrame,
    high: pd.DataFrame,
    low: pd.DataFrame,
    volume: pd.DataFrame,
    benchmark: pd.Series,
    factor_weights: dict,
) -> pd.DataFrame:
    """
    Combine multiple signals into a composite score.
    factor_weights: {signal_name: weight, ...}
    Returns: DataFrame[date × ticker] composite z-scores.
    """
    signals = []

    for name, weight in factor_weights.items():
        if weight == 0:
            continue
        if name in TECHNICAL_SIGNALS:
            fn = TECHNICAL_SIGNALS[name]
            # Determine which signals need high/low/volume
            if name in ("atr", "adx", "stochastic", "donchian", "vwap"):
                sig = fn(close, high, low)
            elif name in ("volume_breakout",):
                sig = fn(close, volume)
            else:
                sig = fn(close)
        elif name in QUANT_SIGNALS:
            fn = QUANT_SIGNALS[name]
            sig = fn(close, high, low, volume, benchmark)
        else:
            continue

        signals.append(sig * weight)

    if not signals:
        return pd.DataFrame(0, index=close.index, columns=close.columns)

    total_weight = sum(abs(w) for w in factor_weights.values() if w != 0)
    composite = sum(signals) / (total_weight if total_weight > 0 else 1)
    return composite
