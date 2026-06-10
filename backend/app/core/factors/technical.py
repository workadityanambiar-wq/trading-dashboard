"""
Short-term technical signals computed from daily OHLCV data.
"""
import pandas as pd
import numpy as np


# ── RSI ───────────────────────────────────────────────────────────────────────

def rsi(prices: pd.DataFrame, period: int = 14) -> pd.Series:
    if len(prices) < period + 1:
        return pd.Series(dtype=float)
    delta = prices.diff()
    gain  = delta.clip(lower=0).rolling(period).mean()
    loss  = (-delta.clip(upper=0)).rolling(period).mean()
    rs    = gain.iloc[-1] / loss.iloc[-1].replace(0, np.nan)
    return (100 - 100 / (1 + rs)).rename("rsi")


# ── MACD ─────────────────────────────────────────────────────────────────────

def macd_signal(prices: pd.DataFrame, fast=12, slow=26, signal=9) -> pd.DataFrame:
    if len(prices) < slow + signal:
        return pd.DataFrame()
    ema_fast  = prices.ewm(span=fast,   adjust=False).mean()
    ema_slow  = prices.ewm(span=slow,   adjust=False).mean()
    macd_line = ema_fast - ema_slow
    sig_line  = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - sig_line
    return pd.DataFrame({
        "macd":      macd_line.iloc[-1],
        "macd_sig":  sig_line.iloc[-1],
        "macd_hist": histogram.iloc[-1],
    })


# ── Bollinger Bands ───────────────────────────────────────────────────────────

def bollinger_pct_b(prices: pd.DataFrame, period: int = 20, n_std: float = 2.0) -> pd.Series:
    if len(prices) < period:
        return pd.Series(dtype=float)
    rolling = prices.rolling(period)
    mid   = rolling.mean()
    std   = rolling.std()
    upper = mid + n_std * std
    lower = mid - n_std * std
    price = prices.iloc[-1]
    bw    = (upper - lower).iloc[-1].replace(0, np.nan)
    return ((price - lower.iloc[-1]) / bw).rename("bb_pct_b")


def bollinger_width(prices: pd.DataFrame, period: int = 20, n_std: float = 2.0) -> pd.Series:
    if len(prices) < period:
        return pd.Series(dtype=float)
    rolling = prices.rolling(period)
    mid   = rolling.mean()
    std   = rolling.std()
    width = (2 * n_std * std / mid.replace(0, np.nan)).iloc[-1]
    return width.rename("bb_width")


# ── ATR ──────────────────────────────────────────────────────────────────────

def atr_ratio(
    adj_close: pd.DataFrame,
    high: pd.DataFrame,
    low: pd.DataFrame,
    period: int = 14,
) -> pd.Series:
    if len(adj_close) < period + 1 or high.empty or low.empty:
        return pd.Series(dtype=float)
    common     = adj_close.columns.intersection(high.columns).intersection(low.columns)
    prev_close = adj_close[common].shift(1)
    tr = pd.concat([
        high[common] - low[common],
        (high[common] - prev_close).abs(),
        (low[common]  - prev_close).abs(),
    ]).groupby(level=0).max()
    atr   = tr.rolling(period).mean().iloc[-1]
    price = adj_close[common].iloc[-1]
    return (atr / price.replace(0, np.nan)).rename("atr_ratio")


# ── Volume signals ────────────────────────────────────────────────────────────

def volume_surge(volume: pd.DataFrame, period: int = 20) -> pd.Series:
    if len(volume) < period + 1:
        return pd.Series(dtype=float)
    avg_vol = volume.rolling(period).mean().iloc[-1]
    cur_vol = volume.iloc[-1]
    return (cur_vol / avg_vol.replace(0, np.nan)).rename("vol_surge")


def dollar_volume_rank(
    adj_close: pd.DataFrame,
    volume: pd.DataFrame,
    period: int = 20,
) -> pd.Series:
    if len(adj_close) < period or volume.empty:
        return pd.Series(dtype=float)
    common = adj_close.columns.intersection(volume.columns)
    dv = (adj_close[common].tail(period) * volume[common].tail(period)).mean()
    return np.log1p(dv.replace(0, np.nan)).rename("log_dollar_vol")


# ── Moving averages ───────────────────────────────────────────────────────────

def ma_distance(prices: pd.DataFrame, window: int = 50) -> pd.Series:
    if len(prices) < window:
        return pd.Series(dtype=float)
    ma = prices.rolling(window).mean().iloc[-1]
    p  = prices.iloc[-1]
    return ((p / ma.replace(0, np.nan)) - 1).rename(f"ma{window}_dist")


def above_ma(prices: pd.DataFrame, window: int = 200) -> pd.Series:
    d = ma_distance(prices, window)
    return (d > 0).astype(float).rename(f"above_ma{window}")


# ── Relative strength ─────────────────────────────────────────────────────────

def relative_strength_vs_spy(prices: pd.DataFrame, period: int = 20) -> pd.Series:
    if len(prices) < period + 1 or "SPY" not in prices.columns:
        return pd.Series(dtype=float)
    ret     = prices.iloc[-1] / prices.iloc[-(period + 1)] - 1
    spy_ret = float(ret["SPY"]) if not np.isnan(ret.get("SPY", np.nan)) else 0.0
    stocks  = ret.drop("SPY", errors="ignore")
    return (stocks - spy_ret).rename(f"rs_spy_{period}d")


# ── Short-term reversal ───────────────────────────────────────────────────────

def short_term_reversal(prices: pd.DataFrame, period: int = 5) -> pd.Series:
    if len(prices) < period + 1:
        return pd.Series(dtype=float)
    ret = prices.iloc[-1] / prices.iloc[-(period + 1)] - 1
    return (-ret).rename(f"reversal_{period}d")


# ── Overnight gap ─────────────────────────────────────────────────────────────

def overnight_gap(open_prices: pd.DataFrame, adj_close: pd.DataFrame) -> pd.Series:
    if len(adj_close) < 2 or open_prices.empty:
        return pd.Series(dtype=float)
    common     = adj_close.columns.intersection(open_prices.columns)
    prev_close = adj_close[common].iloc[-2]
    today_open = open_prices[common].iloc[-1]
    return (today_open / prev_close.replace(0, np.nan) - 1).rename("overnight_gap")


# ── Monthly Pivot Points ─────────────────────────────────────────────────────

def monthly_pivots(
    adj_close: pd.DataFrame,
    high: pd.DataFrame,
    low: pd.DataFrame,
) -> pd.DataFrame:
    if high.empty or low.empty or adj_close.empty:
        return pd.DataFrame()
    common = adj_close.columns.intersection(high.columns).intersection(low.columns)
    if common.empty:
        return pd.DataFrame()
    idx = adj_close.index
    try:
        cur_period = idx[-1].to_period("M")
        prior_mask = idx.to_period("M") == (cur_period - 1)
    except Exception:
        return pd.DataFrame()
    if prior_mask.sum() == 0:
        return pd.DataFrame()

    h_prev = high[common][prior_mask].max()
    l_prev = low[common][prior_mask].min()
    c_prev = adj_close[common][prior_mask].iloc[-1]

    pp = (h_prev + l_prev + c_prev) / 3
    r1 = 2 * pp - l_prev
    r2 = pp + (h_prev - l_prev)
    r3 = h_prev + 2 * (pp - l_prev)
    s1 = 2 * pp - h_prev
    s2 = pp - (h_prev - l_prev)
    s3 = l_prev - 2 * (h_prev - pp)

    price  = adj_close[common].iloc[-1].replace(0, np.nan)
    levels = pd.DataFrame({"pp": pp, "r1": r1, "r2": r2, "r3": r3,
                           "s1": s1, "s2": s2, "s3": s3})
    dist   = levels.apply(lambda col: price / col.replace(0, np.nan) - 1)

    abs_vals        = dist.abs().fillna(np.inf).values
    nearest_col_idx = np.argmin(abs_vals, axis=1)
    nearest_dists   = dist.values[np.arange(len(dist)), nearest_col_idx]
    nearest_names   = [dist.columns[i] for i in nearest_col_idx]

    out                  = levels.copy()
    out["nearest_pivot"] = nearest_names
    out["pivot_dist"]    = pd.array(nearest_dists, dtype=float)
    all_inf              = np.all(np.isinf(abs_vals), axis=1)
    out.loc[out.index[all_inf], ["nearest_pivot", "pivot_dist"]] = None
    return out


# ── Stage Analysis (Weinstein) ────────────────────────────────────────────────

def stage_analysis(prices: pd.DataFrame) -> pd.Series:
    """
    Stage 1=Base, 2=Uptrend, 3=Topping, 4=Downtrend using 30W (150-day) MA.
    """
    if len(prices) < 150:
        return pd.Series(np.nan, index=prices.columns, name="stage")

    ma150   = prices.rolling(150).mean()
    ma_now  = ma150.iloc[-1]
    ma_prev = ma150.iloc[-21] if len(ma150) > 21 else ma150.iloc[0]
    ma_slope = ((ma_now - ma_prev) / ma_prev.replace(0, np.nan)).fillna(0)

    price_now = prices.iloc[-1]
    above_ma  = price_now > ma_now

    if len(prices) >= 120:
        recent       = prices.tail(60)
        prior        = prices.iloc[-120:-60]
        higher_highs = recent.max() > prior.max()
        higher_lows  = recent.min() > prior.min()
    else:
        higher_highs = pd.Series(False, index=prices.columns)
        higher_lows  = pd.Series(False, index=prices.columns)

    rising_ma  = ma_slope > 0.004
    falling_ma = ma_slope < -0.004

    stage = pd.Series(np.nan, index=prices.columns, name="stage")
    s2 = above_ma & rising_ma & (higher_highs | higher_lows)
    s3 = above_ma & ~s2
    s4 = ~above_ma & falling_ma
    s1 = ~above_ma & ~s4

    stage[s2] = 2.0
    stage[s3] = 3.0
    stage[s4] = 4.0
    stage[s1] = 1.0
    return stage


# ── Volatility percentiles ────────────────────────────────────────────────────

def bb_width_percentile(prices: pd.DataFrame, period: int = 20, lookback: int = 252) -> pd.Series:
    """BB width percentile over lookback days. Low = compressed (squeeze forming)."""
    if len(prices) < period + 10:
        return pd.Series(np.nan, index=prices.columns, name="bb_width_pct")

    rolling = prices.rolling(period)
    mid     = rolling.mean()
    std     = rolling.std()
    bb_w    = (4 * std / mid.replace(0, np.nan))

    actual  = min(lookback, len(bb_w) - period)
    if actual < 10:
        return pd.Series(np.nan, index=prices.columns, name="bb_width_pct")

    pct = bb_w.tail(actual).rank(pct=True).iloc[-1]
    return pct.rename("bb_width_pct")


def atr_percentile(
    adj_close: pd.DataFrame,
    high: pd.DataFrame,
    low: pd.DataFrame,
    period: int = 14,
    lookback: int = 252,
) -> pd.Series:
    """ATR percentile. Low = compressed, high = expanded."""
    if len(adj_close) < period + 5 or high.empty or low.empty:
        return pd.Series(np.nan, index=adj_close.columns, name="atr_pct")

    common     = adj_close.columns.intersection(high.columns).intersection(low.columns)
    prev_close = adj_close[common].shift(1)
    tr = pd.concat([
        high[common] - low[common],
        (high[common] - prev_close).abs(),
        (low[common]  - prev_close).abs(),
    ]).groupby(level=0).max()

    atr      = tr.rolling(period).mean()
    atr_norm = atr / adj_close[common].replace(0, np.nan)

    actual = min(lookback, len(atr_norm) - period)
    if actual < 10:
        return pd.Series(np.nan, index=adj_close.columns, name="atr_pct")

    pct    = atr_norm.tail(actual).rank(pct=True).iloc[-1]
    result = pd.Series(np.nan, index=adj_close.columns, name="atr_pct")
    result[common] = pct
    return result


# ── NR7 pattern ───────────────────────────────────────────────────────────────

def nr7_signal(high: pd.DataFrame, low: pd.DataFrame) -> pd.Series:
    """1 if today's H-L range is the narrowest of the last 7 days."""
    if len(high) < 7 or high.empty or low.empty:
        return pd.Series(dtype=float)
    common      = high.columns.intersection(low.columns)
    daily_range = (high[common] - low[common]).abs()
    today_range = daily_range.iloc[-1]
    min_7d      = daily_range.tail(7).min()
    return (today_range <= min_7d).astype(float).rename("nr7")


# ── Distance from 52-week high ────────────────────────────────────────────────

def dist_from_52w_high(prices: pd.DataFrame) -> pd.Series:
    """(price / 52W high) - 1. Near 0 = near all-time high."""
    lookback = min(252, len(prices))
    high_52w = prices.tail(lookback).max()
    price    = prices.iloc[-1]
    return ((price / high_52w.replace(0, np.nan)) - 1).rename("dist_52w_high")


# ── Range compression ─────────────────────────────────────────────────────────

def range_compression_ratio(
    high: pd.DataFrame,
    low: pd.DataFrame,
    short_window: int = 10,
    long_window: int = 63,
) -> pd.Series:
    """10-day range / 63-day range. Low = tight consolidation (coiled spring)."""
    if len(high) < long_window or high.empty or low.empty:
        return pd.Series(dtype=float)
    common    = high.columns.intersection(low.columns)
    rng_short = high[common].tail(short_window).max() - low[common].tail(short_window).min()
    rng_long  = high[common].tail(long_window).max() - low[common].tail(long_window).min()
    return (rng_short / rng_long.replace(0, np.nan)).rename("range_compression")


# ── Accumulation / Distribution score ────────────────────────────────────────

def accumulation_score(
    adj_close: pd.DataFrame,
    volume: pd.DataFrame,
    period: int = 20,
) -> pd.Series:
    """
    (acc_days - dist_days) / period ∈ [-1, 1].
    Acc day: price up + volume > 20d avg. Dist day: price down + same.
    """
    if len(adj_close) < period + 1 or volume.empty:
        return pd.Series(dtype=float)
    common   = adj_close.columns.intersection(volume.columns)
    price_chg = adj_close[common].diff()
    avg_vol   = volume[common].rolling(period).mean()
    above_avg = volume[common] > avg_vol

    acc_days  = ((price_chg.tail(period) > 0) & above_avg.tail(period)).sum()
    dist_days = ((price_chg.tail(period) < 0) & above_avg.tail(period)).sum()

    score  = (acc_days - dist_days) / period
    result = pd.Series(np.nan, index=adj_close.columns, name="accum_score")
    result[common] = score
    return result


# ── Setup classification ──────────────────────────────────────────────────────

_SETUP_PRIORITY = [
    "Early Breakout",
    "Volatility Squeeze",
    "Momentum Continuation",
    "Institutional Accumulation",
    "Mean Reversion Bounce",
    "Failed Breakdown Reversal",
]


def _col(df: pd.DataFrame, name: str, default=np.nan) -> pd.Series:
    return df[name] if name in df.columns else pd.Series(default, index=df.index)


def classify_setups(df: pd.DataFrame) -> pd.Series:
    """Classify each ticker into a named trading setup."""
    rsi_s     = _col(df, "rsi")
    rs20      = _col(df, "rs_spy_20d")
    rs5       = _col(df, "rs_spy_5d")
    vol_s     = _col(df, "vol_surge", 1.0)
    bb_pct_s  = _col(df, "bb_width_pct", 0.5)
    ma50_s    = _col(df, "ma50_dist")
    ma200_s   = _col(df, "ma200_dist")
    macd_s    = _col(df, "macd_hist")
    stage_s   = _col(df, "stage")
    pivot_s   = _col(df, "pivot_dist")
    range_c   = _col(df, "range_compression", 0.5)
    accum_s   = _col(df, "accum_score", 0.0)
    dist_52w  = _col(df, "dist_52w_high", -0.5)
    nr7_s     = _col(df, "nr7", 0.0)
    chg_1d_s  = _col(df, "chg_1d", 0.0)

    if "nearest_pivot" in df.columns:
        np_col = df["nearest_pivot"].fillna("")
        near_resistance = (pivot_s.fillna(-999) > -0.025) & (pivot_s.fillna(999) < 0.01) & np_col.isin(["r1", "r2", "pp"])
        near_support    = (pivot_s.fillna(999)  <  0.025) & (pivot_s.fillna(-999) > -0.01) & np_col.isin(["s1", "s2", "pp"])
    else:
        near_resistance = (pivot_s.fillna(-999) > -0.025) & (pivot_s.fillna(999) < 0.01)
        near_support    = (pivot_s.fillna(999)  <  0.025) & (pivot_s.fillna(-999) > -0.01)

    vol_squeeze = (bb_pct_s < 0.25) | (range_c < 0.35) | (nr7_s == 1.0)

    conditions = {
        "Early Breakout": (
            (rs20 > 0.01) & (rs20 > rs5) &
            (vol_s > 1.3) & near_resistance & (stage_s == 2.0)
        ),
        "Volatility Squeeze": (
            vol_squeeze & stage_s.isin([1.0, 2.0]) & (vol_s < 1.5)
        ),
        "Momentum Continuation": (
            (ma50_s > 0.02) & (ma200_s > 0.05) & (macd_s > 0) &
            (rs20 > 0.01) & (stage_s == 2.0) & (rsi_s > 50) & (rsi_s < 75)
        ),
        "Institutional Accumulation": (
            (vol_s > 1.5) & (chg_1d_s.abs() < 0.008) & (ma50_s > 0) & (accum_s > 0.1)
        ),
        "Mean Reversion Bounce": (
            (rsi_s < 35) & near_support & stage_s.isin([1.0, 2.0])
        ),
        "Failed Breakdown Reversal": (
            (dist_52w < -0.25) & (rsi_s > 35) & (rs20 > rs5) & (accum_s > 0)
        ),
    }

    setup = pd.Series("No Setup", index=df.index, name="setup")
    for name in reversed(_SETUP_PRIORITY):
        mask = conditions[name].fillna(False)
        setup[mask] = name

    return setup


# ── Breakout probability score ────────────────────────────────────────────────

def breakout_score(df: pd.DataFrame) -> pd.Series:
    """0–100 score for probability of a near-term breakout."""
    def norm(s: pd.Series, lo: float, hi: float) -> pd.Series:
        return ((s.clip(lo, hi) - lo) / (hi - lo) * 100).fillna(50)

    weights: list[tuple[str, pd.Series, float]] = []

    if "vol_surge" in df.columns:
        weights.append(("vol",   norm(df["vol_surge"],    0.5, 3.0),  0.20))
    if "rs_spy_20d" in df.columns:
        weights.append(("rs",    norm(df["rs_spy_20d"],  -0.05, 0.10), 0.15))
    if "atr_pct" in df.columns:
        weights.append(("atr",   norm(1 - df["atr_pct"],  0, 1),      0.15))
    if "bb_width_pct" in df.columns:
        weights.append(("bb",    norm(1 - df["bb_width_pct"], 0, 1),  0.15))
    if "dist_52w_high" in df.columns:
        weights.append(("d52",   norm(df["dist_52w_high"], -0.30, 0), 0.15))
    if "stage" in df.columns:
        weights.append(("stage", (df["stage"] == 2.0).astype(float) * 100, 0.10))
    if "accum_score" in df.columns:
        weights.append(("accum", norm(df["accum_score"], -1, 1),      0.10))

    if not weights:
        return pd.Series(50.0, index=df.index, name="breakout_score")

    total_w = sum(w for _, _, w in weights)
    score   = sum(s * w for _, s, w in weights) / total_w
    return score.clip(0, 100).rename("breakout_score")


# ── Confluence score ──────────────────────────────────────────────────────────

def confluence_score(df: pd.DataFrame) -> pd.Series:
    """Comprehensive conviction score 0–100 across trend, RS, volume, and volatility."""
    def norm(s: pd.Series, lo: float, hi: float) -> pd.Series:
        return ((s.clip(lo, hi) - lo) / (hi - lo) * 100).fillna(50)

    weights: list[tuple[str, pd.Series, float]] = []

    if "stage" in df.columns:
        stage_map = {1.0: 50.0, 2.0: 100.0, 3.0: 30.0, 4.0: 0.0}
        weights.append(("stage", df["stage"].map(stage_map).fillna(40), 0.15))
    if "rs_spy_20d" in df.columns:
        weights.append(("rs20",  norm(df["rs_spy_20d"],   -0.05, 0.10), 0.15))
    if "momentum_score" in df.columns:
        weights.append(("mom",   norm(df["momentum_score"], -2, 2),     0.15))
    if "vol_surge" in df.columns:
        weights.append(("vol",   norm(df["vol_surge"],      0.5, 3.0),  0.10))
    if "atr_pct" in df.columns:
        weights.append(("atr",   norm(1 - df["atr_pct"],   0, 1),      0.10))
    if "bb_width_pct" in df.columns:
        weights.append(("bb",    norm(1 - df["bb_width_pct"], 0, 1),   0.10))
    if "accum_score" in df.columns:
        weights.append(("accum", norm(df["accum_score"],   -1, 1),      0.10))
    if "dist_52w_high" in df.columns:
        weights.append(("d52",   norm(df["dist_52w_high"], -0.30, 0),  0.10))
    if "rsi" in df.columns:
        rsi_score = norm(df["rsi"], 30, 70)
        rsi_score = rsi_score.where(df["rsi"] < 80, 20).where(df["rsi"] > 20, 20)
        weights.append(("rsi",   rsi_score,                             0.05))

    if not weights:
        return pd.Series(50.0, index=df.index, name="confluence_score")

    total_w = sum(w for _, _, w in weights)
    score   = sum(s * w for _, s, w in weights) / total_w
    return score.clip(0, 100).rename("confluence_score")


# ── Master compute function ───────────────────────────────────────────────────

def compute_all_signals(
    adj_close: pd.DataFrame,
    high: pd.DataFrame | None = None,
    low:  pd.DataFrame | None = None,
    open_prices: pd.DataFrame | None = None,
    volume: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Compute all signals and return a ticker-indexed DataFrame."""

    def _z(s: pd.Series, invert: bool = False) -> pd.Series:
        valid = (-s if invert else s).dropna()
        if len(valid) < 3:
            return pd.Series(np.nan, index=s.index)
        std = valid.std()
        if std == 0:
            return pd.Series(np.nan, index=s.index)
        z = ((valid - valid.mean()) / std).clip(-3, 3)
        return z.reindex(s.index)

    parts: dict[str, pd.Series] = {}

    # ── Existing signals ──────────────────────────────────────────────────────
    parts["rsi"]        = rsi(adj_close)
    parts["bb_pct_b"]   = bollinger_pct_b(adj_close)
    parts["ma50_dist"]  = ma_distance(adj_close, 50)
    parts["ma200_dist"] = ma_distance(adj_close, 200)
    parts["rs_spy_20d"] = relative_strength_vs_spy(adj_close, 20)
    parts["rs_spy_5d"]  = relative_strength_vs_spy(adj_close, 5)
    parts["rev_5d"]     = short_term_reversal(adj_close, 5)

    if len(adj_close) >= 2:
        prev = adj_close.iloc[-2].replace(0, np.nan)
        parts["chg_1d"] = (adj_close.iloc[-1] / prev - 1).rename("chg_1d")

    if volume is not None and not volume.empty:
        parts["vol_surge"]      = volume_surge(volume)
        parts["log_dollar_vol"] = dollar_volume_rank(adj_close, volume)

    if high is not None and low is not None:
        parts["atr_ratio"] = atr_ratio(adj_close, high, low)

    if open_prices is not None:
        parts["overnight_gap"] = overnight_gap(open_prices, adj_close)

    macd_df = macd_signal(adj_close)
    if not macd_df.empty:
        parts["macd_hist"] = macd_df["macd_hist"]

    piv_df = pd.DataFrame()
    if high is not None and low is not None:
        piv_df = monthly_pivots(adj_close, high, low)
        if not piv_df.empty and "pivot_dist" in piv_df.columns:
            parts["pivot_dist"] = piv_df["pivot_dist"]

    # ── New signals ───────────────────────────────────────────────────────────
    parts["stage"]        = stage_analysis(adj_close)
    parts["dist_52w_high"] = dist_from_52w_high(adj_close)
    parts["bb_width_pct"] = bb_width_percentile(adj_close)

    if high is not None and low is not None:
        parts["atr_pct"]           = atr_percentile(adj_close, high, low)
        parts["nr7"]               = nr7_signal(high, low)
        parts["range_compression"] = range_compression_ratio(high, low)

    if volume is not None and not volume.empty:
        parts["accum_score"] = accumulation_score(adj_close, volume)

    df = pd.DataFrame({k: v for k, v in parts.items() if isinstance(v, pd.Series)})
    if df.empty:
        return df

    # ── Momentum composite ────────────────────────────────────────────────────
    z = pd.DataFrame(index=df.index)
    for col in ["rs_spy_20d", "rs_spy_5d", "ma50_dist", "ma200_dist", "macd_hist"]:
        if col in df.columns:
            z[f"{col}_z"] = _z(df[col])
    if "rsi" in df.columns:
        z["rsi_z"] = _z(df["rsi"])
    if "vol_surge" in df.columns:
        z["vol_surge_z"] = _z(df["vol_surge"])

    z_cols = [c for c in z.columns if c.endswith("_z")]
    if z_cols:
        z["momentum_score"] = z[z_cols].mean(axis=1, skipna=True)

    result = pd.concat([df, z], axis=1)

    if not piv_df.empty and "nearest_pivot" in piv_df.columns:
        result = result.join(piv_df[["nearest_pivot"]], how="left")

    # ── Setup engine + scores ─────────────────────────────────────────────────
    result["setup"]           = classify_setups(result)
    result["breakout_score"]  = breakout_score(result)
    result["confluence_score"] = confluence_score(result)

    return result
