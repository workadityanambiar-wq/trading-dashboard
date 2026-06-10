"""
Historical setup win-rate engine.

Vectorized: all signals computed in one pass over the full price history,
then setup assignments are classified for every (date, ticker) simultaneously.
Month-end snapshots avoid look-ahead bias and overlap inflation.
"""
import json
import logging
import os
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_DATA_DIR  = Path(os.environ.get("DATA_DIR", str(Path(__file__).resolve().parents[4] / "data")))
_CACHE_FILE = _DATA_DIR / "setup_winrates.json"
_CACHE_TTL_HOURS = 168   # 7 days
_HORIZONS  = [5, 10, 20] # forward-return windows in trading days
_MIN_HISTORY = 252        # rows of price history needed before first snapshot


# ── Signal computation (vectorized) ──────────────────────────────────────────

def _compute_signals(
    adj_close: pd.DataFrame,
    high: pd.DataFrame,
    low: pd.DataFrame,
    volume: pd.DataFrame,
) -> dict:
    """
    Compute every setup-relevant signal as a full time-series DataFrame.
    index = dates, columns = tickers.  All operations are vectorised (no Python loops).
    """
    common = (
        adj_close.columns
        .intersection(high.columns)
        .intersection(low.columns)
        .intersection(volume.columns)
    )
    ac = adj_close[common].copy()
    hi = high[common].copy()
    lo = low[common].copy()
    vo = volume[common].copy()

    s: dict = {}

    # ── RSI (14) ──────────────────────────────────────────────────────────────
    delta = ac.diff()
    gain  = delta.clip(lower=0).rolling(14).mean()
    loss  = (-delta.clip(upper=0)).rolling(14).mean()
    s["rsi"] = 100 - 100 / (1 + gain / loss.replace(0, np.nan))

    # ── RS vs SPY ─────────────────────────────────────────────────────────────
    if "SPY" in ac.columns:
        ret20 = ac / ac.shift(20) - 1
        s["rs_spy_20d"] = ret20.sub(ret20["SPY"], axis=0)
        ret5  = ac / ac.shift(5)  - 1
        s["rs_spy_5d"]  = ret5.sub(ret5["SPY"],  axis=0)

    # ── Volume surge (20d avg) ────────────────────────────────────────────────
    avg_vol = vo.rolling(20).mean()
    s["vol_surge"] = vo / avg_vol.replace(0, np.nan)

    # ── MA distances ──────────────────────────────────────────────────────────
    s["ma50_dist"]  = ac / ac.rolling(50).mean()  - 1
    s["ma200_dist"] = ac / ac.rolling(200).mean() - 1

    # ── MACD histogram ────────────────────────────────────────────────────────
    ema12 = ac.ewm(span=12, adjust=False).mean()
    ema26 = ac.ewm(span=26, adjust=False).mean()
    macd  = ema12 - ema26
    s["macd_hist"] = macd - macd.ewm(span=9, adjust=False).mean()

    # ── Stage (Weinstein 4-stage, 150d MA) ───────────────────────────────────
    ma150      = ac.rolling(150).mean()
    ma_slope   = ma150 / ma150.shift(21) - 1
    above_ma   = ac > ma150
    rising_ma  = ma_slope >  0.004
    falling_ma = ma_slope < -0.004

    rmax60 = ac.rolling(60).max()
    rmin60 = ac.rolling(60).min()
    pmax60 = ac.shift(60).rolling(60).max()
    pmin60 = ac.shift(60).rolling(60).min()
    hh = rmax60 > pmax60
    hl = rmin60 > pmin60

    s2 = above_ma  &  rising_ma & (hh | hl)
    s3 = above_ma  & ~s2
    s4 = ~above_ma &  falling_ma
    s1 = ~above_ma & ~s4

    stage = pd.DataFrame(np.nan, index=ac.index, columns=ac.columns)
    stage[s2] = 2.0
    stage[s3] = 3.0
    stage[s4] = 4.0
    stage[s1] = 1.0
    s["stage"] = stage

    # ── Bollinger band width ──────────────────────────────────────────────────
    ma20  = ac.rolling(20).mean()
    std20 = ac.rolling(20).std()
    bb_w  = 4 * std20 / ma20.replace(0, np.nan)
    # Low percentile = compressed volatility (coiled spring)
    s["bb_width_pct"] = bb_w.rolling(126, min_periods=30).rank(pct=True)

    # ── ATR ratio ─────────────────────────────────────────────────────────────
    prev_c = ac.shift(1)
    tr = pd.concat([
        hi - lo,
        (hi - prev_c).abs(),
        (lo - prev_c).abs(),
    ]).groupby(level=0).max()
    s["atr_ratio"] = tr.rolling(14).mean() / ac.replace(0, np.nan)

    # ── Accumulation score ────────────────────────────────────────────────────
    price_chg = ac.diff()
    above_avg = vo > avg_vol
    acc_days  = ((price_chg > 0) & above_avg).rolling(20).sum()
    dist_days = ((price_chg < 0) & above_avg).rolling(20).sum()
    s["accum_score"] = (acc_days - dist_days) / 20

    # ── Range compression (10d vs 63d) ────────────────────────────────────────
    rng10 = hi.rolling(10).max() - lo.rolling(10).min()
    rng63 = hi.rolling(63).max() - lo.rolling(63).min()
    s["range_compression"] = rng10 / rng63.replace(0, np.nan)

    # ── NR7 ──────────────────────────────────────────────────────────────────
    daily_rng = hi - lo
    s["nr7"] = (daily_rng == daily_rng.rolling(7).min()).astype(float)

    # ── Distance from 52W high ────────────────────────────────────────────────
    hi52 = ac.rolling(252, min_periods=50).max()
    s["dist_52w_high"] = ac / hi52.replace(0, np.nan) - 1

    # ── 1-day change ──────────────────────────────────────────────────────────
    s["chg_1d"] = ac / ac.shift(1) - 1

    return s


# ── Setup classification (fully vectorized) ───────────────────────────────────

def _apply_mask(df: pd.DataFrame, mask: pd.DataFrame, name: str) -> None:
    """Where mask is True, overwrite df with name. Handles NaN and shape mismatches."""
    if not isinstance(mask, pd.DataFrame) or mask.empty or df.empty:
        return
    aligned = mask.reindex_like(df).fillna(False).astype(bool)
    df.where(~aligned, other=name, inplace=True)


def _classify_setups_vec(sig: dict, tickers: list) -> pd.DataFrame:
    """
    Returns DataFrame(index=dates, columns=tickers) of setup names.
    Setups are applied in reverse priority order so the highest-priority
    setup (Early Breakout) wins on conflict.
    """
    def g(key) -> pd.DataFrame:
        v = sig.get(key, pd.DataFrame())
        return v[tickers] if not v.empty and all(t in v.columns for t in tickers[:3]) else v

    rsi    = g("rsi")
    rs20   = g("rs_spy_20d")
    rs5    = g("rs_spy_5d")
    vol_s  = g("vol_surge")
    ma50   = g("ma50_dist")
    ma200  = g("ma200_dist")
    macd   = g("macd_hist")
    stage  = g("stage")
    accum  = g("accum_score")
    dist52 = g("dist_52w_high")
    rangec = g("range_compression")
    nr7    = g("nr7")
    bb_pct = g("bb_width_pct")
    chg1d  = g("chg_1d")

    if rsi.empty:
        return pd.DataFrame()

    setup = pd.DataFrame("No Setup", index=rsi.index, columns=rsi.columns)

    squeeze   = (bb_pct < 0.25) | (rangec < 0.35) | (nr7 == 1.0)
    near_res  = (dist52 > -0.05)  & (dist52 <= 0.005)
    near_sup  = (ma50   >= -0.05) & (ma50 < 0)
    s_in_12   = (stage == 1.0) | (stage == 2.0)

    # Lowest priority first (will be overwritten by higher priority below)
    _apply_mask(setup, (dist52 < -0.25) & (rsi > 35) & (rs20 > rs5) & (accum > 0),
                "Failed Breakdown Reversal")
    _apply_mask(setup, (rsi < 35) & near_sup & s_in_12,
                "Mean Reversion Bounce")
    _apply_mask(setup, (vol_s > 1.5) & (chg1d.abs() < 0.008) & (ma50 > 0) & (accum > 0.1),
                "Institutional Accumulation")
    _apply_mask(setup, (ma50 > 0.02) & (ma200 > 0.05) & (macd > 0) & (rs20 > 0.01)
                       & (stage == 2.0) & (rsi > 50) & (rsi < 75),
                "Momentum Continuation")
    _apply_mask(setup, squeeze & s_in_12 & (vol_s < 1.5),
                "Volatility Squeeze")
    _apply_mask(setup, (rs20 > 0.01) & (rs20 > rs5) & (vol_s > 1.3)
                       & near_res & (stage == 2.0),
                "Early Breakout")

    return setup


# ── Win-rate aggregation ──────────────────────────────────────────────────────

def _aggregate_win_rates(
    setups_df: pd.DataFrame,
    adj_close: pd.DataFrame,
    horizons: list = _HORIZONS,
) -> dict:
    """
    Sample at month-end dates, compute forward returns, aggregate per setup.
    Drops SPY from the ticker universe.
    """
    max_h  = max(horizons)
    prices = adj_close.drop(columns=["SPY"], errors="ignore")
    all_dates = setups_df.index

    # Month-end sample dates: must have enough future data
    cutoff = all_dates[-max_h - 5] if len(all_dates) > max_h + 5 else all_dates[-1]
    monthly = pd.date_range(
        start=all_dates[_MIN_HISTORY] if len(all_dates) > _MIN_HISTORY else all_dates[0],
        end=cutoff,
        freq="ME",
    )

    # Snap each month-end to the nearest actual trading date (at or before)
    sample_dates: list = []
    for md in monthly:
        avail = all_dates[all_dates <= md]
        if len(avail):
            sample_dates.append(avail[-1])
    sample_dates = list(dict.fromkeys(sample_dates))  # deduplicate

    records: list = []
    for dt in sample_dates:
        if dt not in setups_df.index:
            continue
        setup_row  = setups_df.loc[dt]
        future_idx = prices.index[prices.index > dt]

        fwd: dict = {}
        for h in horizons:
            if len(future_idx) >= h:
                fwd_dt = future_idx[h - 1]
                fwd[h] = prices.loc[fwd_dt] / prices.loc[dt] - 1

        for ticker in setup_row.index:
            if ticker not in prices.columns:
                continue
            setup_name = setup_row[ticker]
            if setup_name == "No Setup" or pd.isna(setup_name):
                continue
            for h, ret_series in fwd.items():
                ret = ret_series.get(ticker, np.nan)
                if pd.isna(ret):
                    continue
                records.append({"setup": setup_name, "horizon": h, "ret": float(ret)})

    if not records:
        return {}

    df  = pd.DataFrame(records)
    out: dict = {}

    for setup_name in df["setup"].unique():
        sdf  = df[df["setup"] == setup_name]
        stat: dict = {"setup": setup_name}

        for h in horizons:
            hdf = sdf[sdf["horizon"] == h]["ret"].dropna()
            n   = len(hdf)
            if n == 0:
                continue
            wins     = (hdf > 0).sum()
            wr       = wins / n
            avg_win  = float(hdf[hdf > 0].mean()) if wins > 0 else 0.0
            avg_loss = float(hdf[hdf <= 0].mean()) if (n - wins) > 0 else 0.0
            stat[f"n_{h}d"]           = int(n)
            stat[f"win_rate_{h}d"]    = round(float(wr), 4)
            stat[f"avg_ret_{h}d"]     = round(float(hdf.mean()), 4)
            stat[f"median_ret_{h}d"]  = round(float(hdf.median()), 4)
            stat[f"avg_win_{h}d"]     = round(avg_win, 4)
            stat[f"avg_loss_{h}d"]    = round(avg_loss, 4)
            stat[f"expectancy_{h}d"]  = round(wr * avg_win + (1 - wr) * avg_loss, 4)

        out[setup_name] = stat

    return out


# ── Main entry point ──────────────────────────────────────────────────────────

def run_setup_backtest(
    adj_close: pd.DataFrame,
    high: pd.DataFrame,
    low: pd.DataFrame,
    volume: pd.DataFrame,
) -> dict:
    """
    Full pipeline: signal computation → setup classification → win-rate aggregation.
    Returns dict keyed by setup name.
    """
    logger.info(f"Setup backtest: {len(adj_close.columns)} tickers, {len(adj_close)} days")

    stock_cols = [c for c in adj_close.columns if c != "SPY"]

    sig      = _compute_signals(adj_close, high, low, volume)
    setup_df = _classify_setups_vec(sig, stock_cols)
    result   = _aggregate_win_rates(setup_df, adj_close)

    logger.info(f"Setup backtest complete: {len(result)} setups analysed")
    return result


# ── JSON cache ────────────────────────────────────────────────────────────────

def load_cached_winrates() -> Optional[dict]:
    """Returns cached results if fresh, else None."""
    try:
        if not _CACHE_FILE.exists():
            return None
        payload = json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
        fetched_at = datetime.fromisoformat(payload.get("fetched_at", "2000-01-01"))
        if datetime.now() - fetched_at > timedelta(hours=_CACHE_TTL_HOURS):
            return None
        return payload.get("results")
    except Exception:
        return None


def save_winrates_cache(results: dict) -> None:
    try:
        _CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        _CACHE_FILE.write_text(
            json.dumps({"fetched_at": datetime.now().isoformat(), "results": results}),
            encoding="utf-8",
        )
    except Exception as e:
        logger.warning(f"Failed to save win-rate cache: {e}")
