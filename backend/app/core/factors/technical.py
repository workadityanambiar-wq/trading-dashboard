"""
Short-term technical signals computed from daily OHLCV data.

All functions accept a wide-format adj_close DataFrame (date × ticker).
Volume DataFrame is optional but required for volume-based signals.
"""
import pandas as pd
import numpy as np


# ── RSI ───────────────────────────────────────────────────────────────────────

def rsi(prices: pd.DataFrame, period: int = 14) -> pd.Series:
    """14-day RSI for each ticker at the latest date."""
    if len(prices) < period + 1:
        return pd.Series(dtype=float)
    delta = prices.diff()
    gain  = delta.clip(lower=0).rolling(period).mean()
    loss  = (-delta.clip(upper=0)).rolling(period).mean()
    rs    = gain.iloc[-1] / loss.iloc[-1].replace(0, np.nan)
    return (100 - 100 / (1 + rs)).rename("rsi")


# ── MACD ─────────────────────────────────────────────────────────────────────

def macd_signal(prices: pd.DataFrame, fast=12, slow=26, signal=9) -> pd.DataFrame:
    """
    Returns DataFrame with columns: macd_line, signal_line, histogram.
    macd_line > 0 and above signal_line = bullish.
    """
    if len(prices) < slow + signal:
        return pd.DataFrame()
    ema_fast   = prices.ewm(span=fast,   adjust=False).mean()
    ema_slow   = prices.ewm(span=slow,   adjust=False).mean()
    macd_line  = ema_fast - ema_slow
    sig_line   = macd_line.ewm(span=signal, adjust=False).mean()
    histogram  = macd_line - sig_line
    return pd.DataFrame({
        "macd":      macd_line.iloc[-1],
        "macd_sig":  sig_line.iloc[-1],
        "macd_hist": histogram.iloc[-1],
    })


# ── Bollinger Bands ───────────────────────────────────────────────────────────

def bollinger_pct_b(prices: pd.DataFrame, period: int = 20, n_std: float = 2.0) -> pd.Series:
    """
    %B = (price - lower_band) / (upper_band - lower_band).
    0 = at lower band, 0.5 = at midpoint, 1 = at upper band, >1 = above.
    """
    if len(prices) < period:
        return pd.Series(dtype=float)
    rolling = prices.rolling(period)
    mid  = rolling.mean()
    std  = rolling.std()
    upper = mid + n_std * std
    lower = mid - n_std * std
    price = prices.iloc[-1]
    bw    = (upper - lower).iloc[-1].replace(0, np.nan)
    return ((price - lower.iloc[-1]) / bw).rename("bb_pct_b")


def bollinger_width(prices: pd.DataFrame, period: int = 20, n_std: float = 2.0) -> pd.Series:
    """Band width normalized by middle band — proxy for vol expansion."""
    if len(prices) < period:
        return pd.Series(dtype=float)
    rolling = prices.rolling(period)
    mid = rolling.mean()
    std = rolling.std()
    width = (2 * n_std * std / mid.replace(0, np.nan)).iloc[-1]
    return width.rename("bb_width")


# ── ATR (Average True Range) ──────────────────────────────────────────────────

def atr_ratio(
    adj_close: pd.DataFrame,
    high: pd.DataFrame,
    low: pd.DataFrame,
    period: int = 14,
) -> pd.Series:
    """ATR / price — normalized intraday range. Higher = more volatile."""
    if len(adj_close) < period + 1 or high.empty or low.empty:
        return pd.Series(dtype=float)
    common = adj_close.columns.intersection(high.columns).intersection(low.columns)
    prev_close = adj_close[common].shift(1)
    tr = pd.concat([
        high[common] - low[common],
        (high[common] - prev_close).abs(),
        (low[common]  - prev_close).abs(),
    ]).groupby(level=0).max()
    atr = tr.rolling(period).mean().iloc[-1]
    price = adj_close[common].iloc[-1]
    return (atr / price.replace(0, np.nan)).rename("atr_ratio")


# ── Volume signals ────────────────────────────────────────────────────────────

def volume_surge(volume: pd.DataFrame, period: int = 20) -> pd.Series:
    """Current volume / rolling avg volume. >1 = above-average volume."""
    if len(volume) < period + 1:
        return pd.Series(dtype=float)
    avg_vol  = volume.rolling(period).mean().iloc[-1]
    cur_vol  = volume.iloc[-1]
    return (cur_vol / avg_vol.replace(0, np.nan)).rename("vol_surge")


def dollar_volume_rank(
    adj_close: pd.DataFrame,
    volume: pd.DataFrame,
    period: int = 20,
) -> pd.Series:
    """Log average dollar volume over `period` days."""
    if len(adj_close) < period or volume.empty:
        return pd.Series(dtype=float)
    common = adj_close.columns.intersection(volume.columns)
    dv = (adj_close[common].tail(period) * volume[common].tail(period)).mean()
    return np.log1p(dv.replace(0, np.nan)).rename("log_dollar_vol")


# ── Moving averages / trend ───────────────────────────────────────────────────

def ma_distance(prices: pd.DataFrame, window: int = 50) -> pd.Series:
    """(price / MA_n) - 1.  Positive = above MA (bullish trend)."""
    if len(prices) < window:
        return pd.Series(dtype=float)
    ma   = prices.rolling(window).mean().iloc[-1]
    p    = prices.iloc[-1]
    return ((p / ma.replace(0, np.nan)) - 1).rename(f"ma{window}_dist")


def above_ma(prices: pd.DataFrame, window: int = 200) -> pd.Series:
    """Boolean: 1 if price > MA_n, else 0."""
    d = ma_distance(prices, window)
    return (d > 0).astype(float).rename(f"above_ma{window}")


# ── Relative strength ─────────────────────────────────────────────────────────

def relative_strength_vs_spy(prices: pd.DataFrame, period: int = 20) -> pd.Series:
    """
    (stock return over period) - (SPY return over period).
    Positive = outperforming SPY.
    """
    if len(prices) < period + 1 or "SPY" not in prices.columns:
        return pd.Series(dtype=float)
    ret = prices.iloc[-1] / prices.iloc[-(period + 1)] - 1
    spy_ret = float(ret["SPY"]) if not np.isnan(ret.get("SPY", np.nan)) else 0.0
    stocks  = ret.drop("SPY", errors="ignore")
    return (stocks - spy_ret).rename(f"rs_spy_{period}d")


# ── Short-term reversal ───────────────────────────────────────────────────────

def short_term_reversal(prices: pd.DataFrame, period: int = 5) -> pd.Series:
    """Negative of N-day return — contrarian signal."""
    if len(prices) < period + 1:
        return pd.Series(dtype=float)
    ret = prices.iloc[-1] / prices.iloc[-(period + 1)] - 1
    return (-ret).rename(f"reversal_{period}d")


# ── Overnight gap ─────────────────────────────────────────────────────────────

def overnight_gap(open_prices: pd.DataFrame, adj_close: pd.DataFrame) -> pd.Series:
    """
    Most recent overnight gap = open[t] / close[t-1] - 1.
    Requires open_prices DataFrame.
    """
    if len(adj_close) < 2 or open_prices.empty:
        return pd.Series(dtype=float)
    common = adj_close.columns.intersection(open_prices.columns)
    prev_close = adj_close[common].iloc[-2]
    today_open = open_prices[common].iloc[-1]
    return (today_open / prev_close.replace(0, np.nan) - 1).rename("overnight_gap")


# ── Monthly Pivot Points ─────────────────────────────────────────────────────

def monthly_pivots(
    adj_close: pd.DataFrame,
    high: pd.DataFrame,
    low: pd.DataFrame,
) -> pd.DataFrame:
    """
    Floor-trader monthly pivot points from prior month high/low/close.

    Levels: PP, R1-R3, S1-S3.
    Returns ticker-indexed DataFrame with all level prices plus:
      nearest_pivot  — name of closest level (str)
      pivot_dist     — (price / level) - 1, signed: >0 = price above level
    """
    if high.empty or low.empty or adj_close.empty:
        return pd.DataFrame()
    common = adj_close.columns.intersection(high.columns).intersection(low.columns)
    if common.empty:
        return pd.DataFrame()
    idx = adj_close.index
    try:
        cur_period  = idx[-1].to_period("M")
        prior_mask  = idx.to_period("M") == (cur_period - 1)
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

    # dist[ticker, col] = (price - level) / level  (positive = above)
    dist = levels.apply(lambda col: price / col.replace(0, np.nan) - 1)

    abs_vals        = dist.abs().fillna(np.inf).values
    nearest_col_idx = np.argmin(abs_vals, axis=1)
    nearest_dists   = dist.values[np.arange(len(dist)), nearest_col_idx]
    nearest_names   = [dist.columns[i] for i in nearest_col_idx]

    out                  = levels.copy()
    out["nearest_pivot"] = nearest_names
    out["pivot_dist"]    = pd.array(nearest_dists, dtype=float)
    # mark rows that were all-inf as NaN
    all_inf = np.all(np.isinf(abs_vals), axis=1)
    out.loc[out.index[all_inf], ["nearest_pivot", "pivot_dist"]] = None
    return out


# ── Composite short-term score ────────────────────────────────────────────────

def compute_all_signals(
    adj_close: pd.DataFrame,
    high: pd.DataFrame | None = None,
    low:  pd.DataFrame | None = None,
    open_prices: pd.DataFrame | None = None,
    volume: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """
    Compute all short-term signals and return a ticker-indexed DataFrame.
    Gracefully skips signals that lack required data.
    """
    from app.core.factors.base import cross_section_zscore

    def _z(s: pd.Series, invert: bool = False) -> pd.Series:
        """Z-score with a lower minimum so small theme segments still get scores."""
        valid = (-s if invert else s).dropna()
        if len(valid) < 3:
            return pd.Series(np.nan, index=s.index)
        std = valid.std()
        if std == 0:
            return pd.Series(np.nan, index=s.index)
        z = ((valid - valid.mean()) / std).clip(-3, 3)
        return z.reindex(s.index)

    parts: dict[str, pd.Series] = {}

    parts["rsi"]        = rsi(adj_close)
    parts["bb_pct_b"]   = bollinger_pct_b(adj_close)
    parts["ma50_dist"]  = ma_distance(adj_close, 50)
    parts["ma200_dist"] = ma_distance(adj_close, 200)
    parts["rs_spy_20d"] = relative_strength_vs_spy(adj_close, 20)
    parts["rs_spy_5d"]  = relative_strength_vs_spy(adj_close, 5)
    parts["rev_5d"]     = short_term_reversal(adj_close, 5)

    if volume is not None and not volume.empty:
        parts["vol_surge"]     = volume_surge(volume)
        parts["log_dollar_vol"]= dollar_volume_rank(adj_close, volume)

    if high is not None and low is not None:
        parts["atr_ratio"] = atr_ratio(adj_close, high, low)

    if open_prices is not None:
        parts["overnight_gap"] = overnight_gap(open_prices, adj_close)

    macd_df = macd_signal(adj_close)
    if not macd_df.empty:
        parts["macd_hist"] = macd_df["macd_hist"]

    # Monthly pivots (requires high/low)
    piv_df = pd.DataFrame()
    if high is not None and low is not None:
        piv_df = monthly_pivots(adj_close, high, low)
        if not piv_df.empty and "pivot_dist" in piv_df.columns:
            parts["pivot_dist"] = piv_df["pivot_dist"]

    df = pd.DataFrame({k: v for k, v in parts.items() if isinstance(v, pd.Series)})
    if df.empty:
        return df

    # Momentum-directional composite: RSI, RS vs SPY, MA position, MACD, volume
    z = pd.DataFrame(index=df.index)
    for col in ["rs_spy_20d","rs_spy_5d","ma50_dist","ma200_dist","macd_hist"]:
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

    # Attach string pivot column (kept separate from numeric parts)
    if not piv_df.empty and "nearest_pivot" in piv_df.columns:
        result = result.join(piv_df[["nearest_pivot"]], how="left")

    return result
