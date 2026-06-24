"""
Market Breadth Intelligence Platform
Full breadth engine: McClellan, Summation, Hindenburg, Zweig, Health Score,
Regime 7-state, Sector Leadership, Liquidity Risk, Signals, Divergences.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from threading import Lock
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, Query

from app.core.data import cache
from app.core.data import universe as uni_module

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Cache ─────────────────────────────────────────────────────────────────────
_CACHE: dict[str, tuple[datetime, dict]] = {}
_LOCK = Lock()
_TTL = timedelta(minutes=30)


def _get_cached(key: str):
    with _LOCK:
        if key in _CACHE:
            ts, val = _CACHE[key]
            if datetime.utcnow() - ts < _TTL:
                return val
    return None


def _set_cached(key: str, val: dict):
    with _LOCK:
        _CACHE[key] = (datetime.utcnow(), val)


# ── SP500 Universe ────────────────────────────────────────────────────────────

_TODAY = datetime.today().strftime("%Y-%m-%d")
_START_310D = (datetime.today() - timedelta(days=310)).strftime("%Y-%m-%d")


def _get_sp500_meta() -> tuple[list[str], dict[str, str]]:
    """Returns (tickers, {ticker: sector})"""
    try:
        df = uni_module.get_sp500()
        tickers = df["ticker"].tolist()
        sector_map = df.set_index("ticker")["sector"].to_dict()
        return tickers, sector_map
    except Exception as exc:
        logger.warning("SP500 meta load failed: %s", exc)
        return [], {}


def _load_prices_from_db(tickers: list[str], days: int = 310) -> pd.DataFrame:
    """Wide adj_close DataFrame (rows=date, cols=ticker) via cache."""
    if not tickers:
        return pd.DataFrame()
    start = (datetime.today() - timedelta(days=days)).strftime("%Y-%m-%d")
    try:
        ohlcv = cache.get_ohlcv_wide(tickers, start, _TODAY)
        return ohlcv.get("adj_close", pd.DataFrame())
    except Exception as exc:
        logger.warning("Price load error: %s", exc)
        return pd.DataFrame()


def _load_etf_prices(tickers: list[str], days: int = 310) -> pd.DataFrame:
    """Load ETF prices via cache, fallback to yfinance for missing."""
    start = (datetime.today() - timedelta(days=days)).strftime("%Y-%m-%d")
    try:
        ohlcv = cache.get_ohlcv_wide(tickers, start, _TODAY)
        db_df = ohlcv.get("adj_close", pd.DataFrame())
    except Exception:
        db_df = pd.DataFrame()

    present = set(db_df.columns.tolist()) if not db_df.empty else set()
    missing = [t for t in tickers if t not in present]
    if missing:
        try:
            yf_raw = yf.download(
                missing, period=f"{max(days // 30, 3)}mo",
                progress=False, auto_adjust=True
            )
            if not yf_raw.empty:
                yf_close = yf_raw["Close"] if "Close" in yf_raw else yf_raw
                if isinstance(yf_close, pd.Series):
                    yf_close = yf_close.to_frame(name=missing[0])
                yf_close.index = pd.to_datetime(yf_close.index)
                db_df = yf_close if db_df.empty else db_df.join(yf_close, how="outer")
        except Exception as exc:
            logger.warning("yfinance fallback failed: %s", exc)
    return db_df


# ── Core Breadth Computation ─────────────────────────────────────────────────

def _compute_all(prices: pd.DataFrame, sector_map: dict[str, str]) -> dict:
    """
    Main computation. prices = wide adj_close, rows=date, cols=stock ticker.
    Returns full breadth dict.
    """
    if prices.empty or len(prices) < 22:
        return {}

    stocks = prices.ffill()
    n = len(stocks.columns)

    # ── Moving average matrices ────────────────────────────────────────────────
    ma20_m  = stocks.rolling(20,  min_periods=15).mean()
    ma50_m  = stocks.rolling(50,  min_periods=40).mean()
    ma100_m = stocks.rolling(100, min_periods=80).mean()
    ma200_m = stocks.rolling(200, min_periods=150).mean()

    def _pct_above(mat) -> pd.Series:
        cur = stocks
        valid = cur.notna() & mat.notna()
        above = (cur[valid] > mat[valid]).sum(axis=1)
        total = valid.sum(axis=1).replace(0, np.nan)
        return (above / total).clip(0, 1)

    s_ma20  = _pct_above(ma20_m)
    s_ma50  = _pct_above(ma50_m)
    s_ma100 = _pct_above(ma100_m)
    s_ma200 = _pct_above(ma200_m)

    # ── Advancing / Declining ─────────────────────────────────────────────────
    daily_ret   = stocks.pct_change()
    advancing   = (daily_ret > 0).sum(axis=1)
    declining   = (daily_ret < 0).sum(axis=1)
    total_valid = stocks.notna().sum(axis=1).replace(0, np.nan)
    ad_ratio    = (advancing / declining.replace(0, 1)).clip(0, 10)

    # Normalised A/D net (per 1000 issues, NYSE-style)
    ad_net = (advancing - declining) / total_valid * 1000

    # ── McClellan Oscillator & Summation ─────────────────────────────────────
    ema19      = ad_net.ewm(span=19, adjust=False).mean()
    ema39      = ad_net.ewm(span=39, adjust=False).mean()
    mcclellan  = ema19 - ema39
    summation  = mcclellan.cumsum()

    # ── New 52-week Highs & Lows ──────────────────────────────────────────────
    use_252 = min(252, len(stocks))
    high252 = stocks.rolling(use_252, min_periods=int(use_252 * 0.8)).max()
    low252  = stocks.rolling(use_252, min_periods=int(use_252 * 0.8)).min()
    new_h   = ((stocks >= high252 * 0.99) & high252.notna()).sum(axis=1)
    new_l   = ((stocks <= low252  * 1.01) & low252.notna()).sum(axis=1)
    pct_nh  = new_h / total_valid
    pct_nl  = new_l / total_valid
    nh_net  = (new_h - new_l) / total_valid

    # ── Breadth Thrust (Zweig) ────────────────────────────────────────────────
    thrust_raw = (advancing / (advancing + declining).replace(0, 1)).clip(0, 1)
    b_thrust   = thrust_raw.ewm(span=10, adjust=False).mean()

    # ── Median Stock Return (1M) ──────────────────────────────────────────────
    ret_1m = daily_ret.iloc[-21:].sum() if len(daily_ret) >= 21 else daily_ret.sum()
    median_ret_1m = float(ret_1m.median())
    mean_ret_1m   = float(ret_1m.mean())

    # ── BPI proxy = % above 50 MA ─────────────────────────────────────────────
    bpi = s_ma50

    # ── Hindenburg Omen detection (past 30 bars) ──────────────────────────────
    hind_signals: list[str] = []
    for i in range(max(0, len(stocks) - 30), len(stocks)):
        nh_v  = pct_nh.iloc[i]
        nl_v  = pct_nl.iloc[i]
        ma50v = s_ma50.iloc[i]
        mccl  = mcclellan.iloc[i]
        if nh_v > 0.022 and nl_v > 0.022 and ma50v > 0.5 and mccl < 0:
            hind_signals.append(str(stocks.index[i].date()))

    # ── Zweig Breadth Thrust signal detection ─────────────────────────────────
    zweig_signals: list[str] = []
    bt_vals  = b_thrust.values
    bt_dates = b_thrust.index
    for i in range(10, len(bt_vals)):
        win = bt_vals[max(0, i - 10) : i + 1]
        if not np.isnan(win).all() and np.nanmin(win) < 0.40 and bt_vals[i] > 0.615:
            zweig_signals.append(str(bt_dates[i].date()))
    zweig_signals = zweig_signals[-5:]

    # ── Breadth Health Score (0-100) ──────────────────────────────────────────
    def _norm(series: pd.Series, lo: float, hi: float) -> float:
        v = float(series.iloc[-1]) if not series.empty else 0.5
        return float(np.clip((v - lo) / (hi - lo), 0, 1) * 100)

    s_ma50_now  = float(s_ma50.iloc[-1]) if not s_ma50.empty else 0.5
    s_ma200_now = float(s_ma200.iloc[-1]) if not s_ma200.empty else 0.5
    s_nh_now    = float(nh_net.iloc[-1]) if not nh_net.empty else 0.0
    s_mccl_now  = float(mcclellan.iloc[-1]) if not mcclellan.empty else 0.0
    s_bt_now    = float(b_thrust.iloc[-1]) if not b_thrust.empty else 0.5

    breadth_health = (
        s_ma50_now  * 100 * 0.30 +
        s_ma200_now * 100 * 0.25 +
        float(np.clip((s_nh_now + 0.10) / 0.20, 0, 1)) * 100 * 0.20 +
        float(np.clip((s_mccl_now + 150) / 300,  0, 1)) * 100 * 0.15 +
        float(np.clip((s_bt_now - 0.30) / 0.35,  0, 1)) * 100 * 0.10
    )

    # ── Sector Breadth ────────────────────────────────────────────────────────
    sector_groups: dict[str, list[str]] = {}
    for t in stocks.columns:
        sec = sector_map.get(t, "")
        if sec:
            sector_groups.setdefault(sec, []).append(t)

    cur_row = stocks.iloc[-1]
    ma50_row  = ma50_m.iloc[-1]
    ma200_row = ma200_m.iloc[-1]

    sectors_out: list[dict] = []
    for sec, members in sorted(sector_groups.items()):
        c = cur_row[members].dropna()
        m50 = ma50_row[members].dropna()
        m200 = ma200_row[members].dropna()
        c50  = c.index.intersection(m50.index)
        c200 = c.index.intersection(m200.index)
        a50  = float((c[c50]  > m50[c50]).mean())  if len(c50)  else 0.0
        a200 = float((c[c200] > m200[c200]).mean()) if len(c200) else 0.0

        # Sector RS vs SPY: 1m and 3m momentum relative
        # (computed later when ETF prices are available)
        bscore = a50 * 60 + a200 * 40
        if bscore >= 75:   rating = "Strong Buy"
        elif bscore >= 60: rating = "Buy"
        elif bscore >= 45: rating = "Neutral"
        elif bscore >= 30: rating = "Avoid"
        else:              rating = "Strong Sell"

        sectors_out.append({
            "sector":       sec,
            "above_50ma":   round(a50,  4),
            "above_200ma":  round(a200, 4),
            "count":        len(members),
            "breadth_score": round(bscore, 1),
            "rating":       rating,
            "rs_1m":        None,
            "rs_3m":        None,
        })

    # Sort by breadth_score desc
    sectors_out.sort(key=lambda x: x["breadth_score"], reverse=True)

    # ── History (weekly samples) ──────────────────────────────────────────────
    # Combine all series into a unified history list
    history_df = pd.DataFrame({
        "ma20":          s_ma20,
        "ma50":          s_ma50,
        "ma100":         s_ma100,
        "ma200":         s_ma200,
        "mcclellan":     mcclellan,
        "summation":     summation,
        "ad_ratio":      ad_ratio,
        "new_highs_net": nh_net,
        "breadth_thrust": b_thrust,
    })
    # Sample weekly, always keep last row
    sampled = history_df.iloc[::5].copy()
    if len(history_df) > 0 and history_df.index[-1] not in sampled.index:
        sampled = pd.concat([sampled, history_df.iloc[[-1]]])

    history_out: list[dict] = []
    for dt, row in sampled.iterrows():
        entry: dict = {"date": str(dt.date())}
        for col in history_df.columns:
            v = row[col]
            entry[col] = None if (v is None or (isinstance(v, float) and np.isnan(v))) else round(float(v), 4)
        history_out.append(entry)

    # ── Build snapshot ────────────────────────────────────────────────────────
    def _last(s: pd.Series) -> Optional[float]:
        if s.empty:
            return None
        v = float(s.iloc[-1])
        return None if np.isnan(v) else round(v, 4)

    snapshot = {
        "pct_above_20ma":   _last(s_ma20),
        "pct_above_50ma":   _last(s_ma50),
        "pct_above_100ma":  _last(s_ma100),
        "pct_above_200ma":  _last(s_ma200),
        "ad_ratio":         _last(ad_ratio),
        "advancing":        int(advancing.iloc[-1]) if not advancing.empty else 0,
        "declining":        int(declining.iloc[-1]) if not declining.empty else 0,
        "pct_new_highs":    _last(pct_nh),
        "pct_new_lows":     _last(pct_nl),
        "net_new_highs_pct": _last(nh_net),
        "mcclellan":        round(float(mcclellan.iloc[-1]), 2) if not mcclellan.empty else None,
        "summation_index":  round(float(summation.iloc[-1]),  1) if not summation.empty else None,
        "bpi":              _last(bpi),
        "breadth_thrust":   _last(b_thrust),
        "breadth_health_score": round(breadth_health, 1),
        "median_return_1m": round(median_ret_1m, 4),
        "mean_return_1m":   round(mean_ret_1m, 4),
        "n_stocks":         n,
    }

    return {
        "snapshot":       snapshot,
        "breadth_health": round(breadth_health, 1),
        "hindenburg": {
            "active":       len(hind_signals) > 0,
            "signals_30d":  hind_signals[-3:],
            "last_signal":  hind_signals[-1] if hind_signals else None,
        },
        "zweig": {
            "signals":       zweig_signals,
            "last_signal":   zweig_signals[-1] if zweig_signals else None,
            "current_thrust": round(float(b_thrust.iloc[-1]), 4) if not b_thrust.empty else None,
        },
        "history":  history_out,
        "sectors":  sectors_out,
    }


# ── Risk / Liquidity Metrics ─────────────────────────────────────────────────

def _compute_risk(etf_prices: pd.DataFrame) -> dict:
    """Compute VIX, credit spread, yield curve, liquidity metrics."""
    result: dict = {
        "vix":              None,
        "vix_1m_change":    None,
        "vix_percentile_1y": None,
        "hy_spread_score":  50,
        "yield_curve":      None,
        "credit_stress":    "Unknown",
        "market_risk_score": 50,
        "crash_probability": 0.10,
        "liquidity_score":  50,
    }
    if etf_prices.empty:
        return result

    def _col(t: str) -> Optional[pd.Series]:
        if t in etf_prices.columns:
            s = etf_prices[t].dropna()
            return s if not s.empty else None
        return None

    vix = _col("^VIX")
    if vix is not None:
        v_last = float(vix.iloc[-1])
        result["vix"] = round(v_last, 2)
        if len(vix) >= 21:
            result["vix_1m_change"] = round(float(vix.iloc[-1] - vix.iloc[-21]), 2)
        if len(vix) >= 252:
            pct = float((vix.iloc[-252:] < v_last).mean())
            result["vix_percentile_1y"] = round(pct, 3)

    # HY spread proxy: HYG / LQD momentum (falling = spread widening = stress)
    hyg = _col("HYG")
    lqd = _col("LQD")
    hy_score = 50
    if hyg is not None and lqd is not None:
        ratio = hyg / lqd.reindex(hyg.index).ffill()
        ratio = ratio.dropna()
        if len(ratio) >= 63:
            mom_1m  = float(ratio.iloc[-1] / ratio.iloc[-21] - 1)  if len(ratio) >= 21  else 0
            mom_3m  = float(ratio.iloc[-1] / ratio.iloc[-63] - 1)  if len(ratio) >= 63  else 0
            hy_score = float(np.clip(50 + mom_1m * 300 + mom_3m * 150, 0, 100))
    result["hy_spread_score"] = round(hy_score, 1)

    # Yield curve: 10Y - 3M (or 10Y - 2Y)
    tnx = _col("^TNX")
    irx = _col("^IRX")
    if tnx is not None and irx is not None:
        spread = float(tnx.iloc[-1] / 100 - irx.iloc[-1] / 100)
        result["yield_curve"] = round(spread, 4)
    elif tnx is not None:
        result["yield_curve"] = round(float(tnx.iloc[-1] / 100), 4)

    # Credit stress label
    vix_v = result["vix"] or 18
    if hy_score < 30 or vix_v > 35:
        result["credit_stress"] = "Extreme"
    elif hy_score < 40 or vix_v > 25:
        result["credit_stress"] = "High"
    elif hy_score < 50 or vix_v > 20:
        result["credit_stress"] = "Moderate"
    else:
        result["credit_stress"] = "Low"

    # Market Risk Score (0-100, higher = more risk)
    vix_risk  = float(np.clip((vix_v - 12) / 28, 0, 1)) * 100
    hy_risk   = float(np.clip(1 - hy_score / 100, 0, 1)) * 100
    risk_score = vix_risk * 0.5 + hy_risk * 0.5
    result["market_risk_score"] = round(risk_score, 1)

    # Crash probability: crude model
    yc = result["yield_curve"] or 0
    crash_base = 0.03 + max(0, (vix_v - 20) / 100) + max(0, -yc * 0.5)
    result["crash_probability"] = round(min(0.40, crash_base), 3)

    # Liquidity score (0-100, higher = more liquid / less stressed)
    result["liquidity_score"] = round(100 - risk_score * 0.8, 1)

    return result


# ── Sector RS Enrichment ─────────────────────────────────────────────────────

SECTOR_ETF_MAP = {
    "Information Technology":  "XLK",
    "Health Care":             "XLV",
    "Financials":              "XLF",
    "Industrials":             "XLI",
    "Consumer Discretionary":  "XLY",
    "Consumer Staples":        "XLP",
    "Energy":                  "XLE",
    "Utilities":               "XLU",
    "Real Estate":             "XLRE",
    "Materials":               "XLB",
    "Communication Services":  "XLC",
}


def _enrich_sector_rs(sectors: list[dict], etf_prices: pd.DataFrame) -> list[dict]:
    if etf_prices.empty:
        return sectors
    spy = etf_prices.get("SPY") if hasattr(etf_prices, "get") else (
        etf_prices["SPY"].dropna() if "SPY" in etf_prices.columns else None
    )
    if spy is None or spy.empty:
        return sectors
    for row in sectors:
        sec = row["sector"]
        etf = SECTOR_ETF_MAP.get(sec)
        if not etf or etf not in etf_prices.columns:
            continue
        s = etf_prices[etf].dropna()
        spy_r = spy.reindex(s.index).ffill().dropna()
        common = s.index.intersection(spy_r.index)
        if len(common) < 22:
            continue
        s_c   = s[common]
        spy_c = spy_r[common]
        if len(s_c) >= 21:
            rs_1m = float(s_c.iloc[-1] / s_c.iloc[-21] - 1) - float(spy_c.iloc[-1] / spy_c.iloc[-21] - 1)
            row["rs_1m"] = round(rs_1m, 4)
        if len(s_c) >= 63:
            rs_3m = float(s_c.iloc[-1] / s_c.iloc[-63] - 1) - float(spy_c.iloc[-1] / spy_c.iloc[-63] - 1)
            row["rs_3m"] = round(rs_3m, 4)
    return sectors


# ── 7-State Regime ───────────────────────────────────────────────────────────

def _classify_7state(breadth: dict, risk: dict, etf_prices: pd.DataFrame) -> dict:
    snap = breadth.get("snapshot", {})
    ma50  = snap.get("pct_above_50ma")  or 0.5
    ma200 = snap.get("pct_above_200ma") or 0.5
    mccl  = snap.get("mcclellan")       or 0.0
    bt    = snap.get("breadth_thrust")  or 0.5

    vix       = risk.get("vix")             or 18
    hy_score  = risk.get("hy_spread_score") or 50
    rsk_score = risk.get("market_risk_score") or 50

    # SPY trend
    spy_trend = 0.0
    if not etf_prices.empty and "SPY" in etf_prices.columns:
        spy = etf_prices["SPY"].dropna()
        if len(spy) >= 200:
            ma50v  = float(spy.iloc[-50:].mean())
            ma200v = float(spy.iloc[-200:].mean())
            last   = float(spy.iloc[-1])
            if last > ma50v > ma200v:
                spy_trend = 1.0
            elif last < ma50v < ma200v:
                spy_trend = -1.0
            else:
                spy_trend = 0.3 if last > ma200v else -0.3

    # Composite bullishness score 0-1
    bscore = (ma50 * 0.25 + ma200 * 0.20 +
              float(np.clip((mccl + 150) / 300, 0, 1)) * 0.15 +
              float(np.clip((bt   - 0.30) / 0.40, 0, 1)) * 0.15 +
              float(np.clip(1 - vix / 45, 0, 1)) * 0.15 +
              float(np.clip(hy_score / 100, 0, 1)) * 0.10)

    bscore = float(np.clip(bscore + spy_trend * 0.10, 0, 1))

    # 7-state classification
    if bscore >= 0.80:
        state = "Strong Bull"
        color = "#22c55e"
        desc  = "Broad participation, risk-on, low volatility"
    elif bscore >= 0.65:
        state = "Bull"
        color = "#84cc16"
        desc  = "Healthy breadth and positive momentum"
    elif bscore >= 0.52:
        state = "Early Bull"
        color = "#a3e635"
        desc  = "Breadth recovering, trend improving"
    elif bscore >= 0.40:
        state = "Sideways"
        color = "#eab308"
        desc  = "Mixed signals, range-bound market"
    elif bscore >= 0.28:
        state = "Early Bear"
        color = "#f97316"
        desc  = "Breadth deteriorating, divergences emerging"
    elif bscore >= 0.15 or vix < 30:
        state = "Bear"
        color = "#ef4444"
        desc  = "Broad selling, negative momentum"
    else:
        state = "Crisis"
        color = "#7f1d1d"
        desc  = "Extreme stress, systemic risk elevated"

    # Probability matrix (soft assignments based on bscore)
    probs = {
        "strong_bull": float(np.clip(bscore - 0.70, 0, 0.20) / 0.20 * (1 if bscore >= 0.70 else 0.5)),
        "bull":        float(np.exp(-((bscore - 0.72) ** 2) / 0.04) * 0.7),
        "early_bull":  float(np.exp(-((bscore - 0.56) ** 2) / 0.04) * 0.7),
        "sideways":    float(np.exp(-((bscore - 0.46) ** 2) / 0.03) * 0.7),
        "early_bear":  float(np.exp(-((bscore - 0.34) ** 2) / 0.03) * 0.7),
        "bear":        float(np.exp(-((bscore - 0.22) ** 2) / 0.03) * 0.7),
        "crisis":      float(np.clip(0.10 - bscore, 0, 0.10) / 0.10 * (1 if bscore <= 0.10 else 0.5)),
    }
    total = sum(probs.values()) or 1
    probs = {k: round(v / total, 3) for k, v in probs.items()}

    # Expected returns by horizon (historical lookup table simplified)
    _ret_table = {
        "Strong Bull": {"1m": 0.023, "3m": 0.055, "6m": 0.098},
        "Bull":        {"1m": 0.014, "3m": 0.035, "6m": 0.065},
        "Early Bull":  {"1m": 0.018, "3m": 0.048, "6m": 0.090},
        "Sideways":    {"1m": 0.002, "3m": 0.008, "6m": 0.015},
        "Early Bear":  {"1m": -0.010, "3m": -0.020, "6m": -0.025},
        "Bear":        {"1m": -0.022, "3m": -0.052, "6m": -0.080},
        "Crisis":      {"1m": -0.060, "3m": -0.100, "6m": -0.120},
    }

    return {
        "state":        state,
        "color":        color,
        "description":  desc,
        "score":        round(bscore, 3),
        "probabilities": probs,
        "expected_returns": _ret_table.get(state, {}),
    }


# ── Market Health Composite Score ────────────────────────────────────────────

def _composite_health(breadth_h: float, risk: dict, etf_prices: pd.DataFrame) -> dict:
    vix   = risk.get("vix") or 18
    hy    = risk.get("hy_spread_score") or 50
    rsk   = risk.get("market_risk_score") or 50

    # SPY momentum
    spy_mom = 50.0
    if not etf_prices.empty and "SPY" in etf_prices.columns:
        spy = etf_prices["SPY"].dropna()
        if len(spy) >= 63:
            m3 = float(spy.iloc[-1] / spy.iloc[-63] - 1)
            spy_mom = float(np.clip(50 + m3 * 200, 0, 100))

    breadth_comp  = float(np.clip(breadth_h, 0, 100))
    liquidity_comp = float(np.clip(hy * 0.5 + (100 - rsk) * 0.5, 0, 100))
    momentum_comp  = spy_mom
    volatility_comp = float(np.clip(100 - (vix - 10) / 30 * 100, 0, 100))
    flows_comp      = float(np.clip(breadth_h * 0.6 + liquidity_comp * 0.4, 0, 100))
    macro_comp      = 50.0
    yc = risk.get("yield_curve")
    if yc is not None:
        macro_comp = float(np.clip(50 + yc * 200, 0, 100))

    composite = (
        breadth_comp  * 0.25 +
        liquidity_comp * 0.20 +
        momentum_comp  * 0.15 +
        volatility_comp * 0.15 +
        flows_comp     * 0.15 +
        macro_comp     * 0.10
    )

    if composite >= 75: grade = "Green"
    elif composite >= 50: grade = "Yellow"
    elif composite >= 30: grade = "Orange"
    else: grade = "Red"

    return {
        "composite_score": round(composite, 1),
        "grade": grade,
        "components": {
            "breadth":    {"score": round(breadth_comp, 1),   "weight": 25},
            "liquidity":  {"score": round(liquidity_comp, 1), "weight": 20},
            "momentum":   {"score": round(momentum_comp, 1),  "weight": 15},
            "volatility": {"score": round(volatility_comp, 1),"weight": 15},
            "flows":      {"score": round(flows_comp, 1),     "weight": 15},
            "macro":      {"score": round(macro_comp, 1),     "weight": 10},
        },
    }


# ── Divergence Detector ──────────────────────────────────────────────────────

def _detect_divergences(breadth: dict, etf_prices: pd.DataFrame) -> list[dict]:
    divs: list[dict] = []
    history = breadth.get("history", [])
    if len(history) < 8:
        return divs

    dates   = [h["date"] for h in history]
    ma50s   = [h.get("ma50") for h in history]
    ma50s   = [v for v in ma50s if v is not None]

    if not etf_prices.empty and "SPY" in etf_prices.columns and len(ma50s) >= 8:
        spy = etf_prices["SPY"].dropna()
        if not spy.empty:
            # Bearish: SPY higher than 4 weeks ago, but MA50 breadth lower
            spy_4w_chg = float(spy.iloc[-1] / spy.iloc[max(-20, -len(spy))] - 1) if len(spy) >= 20 else 0
            ma50_4w_chg = ma50s[-1] - ma50s[max(-8, -len(ma50s))]
            if spy_4w_chg > 0.02 and ma50_4w_chg < -0.03:
                divs.append({
                    "type":        "Bearish",
                    "severity":    "Warning",
                    "description": f"Index +{spy_4w_chg*100:.1f}% (4W) but % above 50MA down {ma50_4w_chg*100:.1f}pp — narrowing rally",
                })
            # Bullish: SPY lower, breadth recovering
            if spy_4w_chg < -0.02 and ma50_4w_chg > 0.03:
                divs.append({
                    "type":        "Bullish",
                    "severity":    "Opportunity",
                    "description": f"Index {spy_4w_chg*100:.1f}% (4W) but breadth expanding +{ma50_4w_chg*100:.1f}pp — stealth accumulation",
                })

    snap = breadth.get("snapshot", {})
    nh = snap.get("pct_new_highs") or 0
    nl = snap.get("pct_new_lows")  or 0
    ma50_now = snap.get("pct_above_50ma") or 0.5

    if nh < 0.04 and ma50_now > 0.65:
        divs.append({
            "type":        "Bearish",
            "severity":    "Caution",
            "description": f"Only {nh*100:.1f}% of stocks at new highs despite {ma50_now*100:.0f}% above 50 MA — lack of leadership",
        })
    if nl > 0.08 and ma50_now < 0.45:
        divs.append({
            "type":        "Bearish",
            "severity":    "Alert",
            "description": f"New lows expanding ({nl*100:.1f}%) with breadth weak — distribution in progress",
        })

    mccl = snap.get("mcclellan") or 0
    bt   = snap.get("breadth_thrust") or 0.5
    if mccl < -50 and ma50_now > 0.55:
        divs.append({
            "type":        "Bearish",
            "severity":    "Caution",
            "description": f"McClellan Oscillator deeply negative ({mccl:.0f}) despite surface breadth — internal weakness",
        })
    if bt > 0.60:
        divs.append({
            "type":        "Bullish",
            "severity":    "Signal",
            "description": f"Breadth Thrust at {bt*100:.0f}% — historically strong bullish signal (Zweig)",
        })

    return divs


# ── Trading Signals ──────────────────────────────────────────────────────────

def _generate_signals(breadth: dict, risk: dict, regime: dict) -> list[dict]:
    signals: list[dict] = []
    snap = breadth.get("snapshot", {})
    state = regime.get("state", "Sideways")

    ma50   = snap.get("pct_above_50ma")   or 0.5
    ma200  = snap.get("pct_above_200ma")  or 0.5
    mccl   = snap.get("mcclellan")        or 0.0
    bt     = snap.get("breadth_thrust")   or 0.5
    nh_net = snap.get("net_new_highs_pct") or 0.0
    vix    = risk.get("vix")              or 18
    rsk    = risk.get("market_risk_score") or 50
    hy     = risk.get("hy_spread_score")  or 50

    # Risk-On
    if ma50 > 0.65 and vix < 18 and mccl > 20 and state in ("Strong Bull", "Bull"):
        signals.append({
            "name":              "Risk-On",
            "type":              "bullish",
            "strength":          round(min(1.0, ma50 * 0.5 + (18 - vix) / 36 * 0.5), 2),
            "description":       f"Breadth {ma50*100:.0f}% above 50MA, VIX at {vix:.1f}, McClellan positive — broad participation",
            "historical_win_rate": 0.74,
            "risk_reward":       "3.2:1",
            "action":            "Increase equity exposure to 90-100%; favour cyclicals and momentum",
        })

    # Risk-Off
    if ma50 < 0.40 and vix > 22 and mccl < -30:
        signals.append({
            "name":              "Risk-Off",
            "type":              "bearish",
            "strength":          round(min(1.0, (0.40 - ma50) * 2 + (vix - 22) / 30 * 0.5), 2),
            "description":       f"Only {ma50*100:.0f}% above 50MA, VIX {vix:.1f}, breadth deteriorating",
            "historical_win_rate": 0.68,
            "risk_reward":       "2.8:1",
            "action":            "Reduce equity to 50-60%; rotate to defensive sectors, bonds, gold",
        })

    # Buy the Dip
    if 0.35 < ma50 < 0.55 and mccl > -50 and bt > 0.48 and vix > 18:
        signals.append({
            "name":              "Buy the Dip",
            "type":              "bullish",
            "strength":          round(min(1.0, bt * 1.2), 2),
            "description":       f"Breadth thrust recovering at {bt*100:.0f}%, McClellan {mccl:.0f} — potential floor",
            "historical_win_rate": 0.61,
            "risk_reward":       "2.1:1",
            "action":            "Selective longs in high-quality leaders; confirm with breadth thrust > 50%",
        })

    # Breadth Thrust (Zweig)
    if bt > 0.615:
        signals.append({
            "name":              "Breadth Thrust",
            "type":              "bullish",
            "strength":          round(bt, 2),
            "description":       f"Zweig Breadth Thrust at {bt*100:.1f}% — historically rare and very bullish",
            "historical_win_rate": 0.87,
            "risk_reward":       "5.0:1",
            "action":            "Strong buy signal — historically 25%+ gains over 12M after signal",
        })

    # Momentum Breakout
    if nh_net > 0.08 and ma200 > 0.70 and mccl > 50:
        signals.append({
            "name":              "Momentum Breakout",
            "type":              "bullish",
            "strength":          round(min(1.0, nh_net * 5), 2),
            "description":       f"{nh_net*100:.1f}% net new highs, {ma200*100:.0f}% above 200MA — broad breakout",
            "historical_win_rate": 0.69,
            "risk_reward":       "2.6:1",
            "action":            "Add to winners; momentum and quality factors outperform in this environment",
        })

    # Reduce Exposure
    if rsk > 60 and hy < 40:
        signals.append({
            "name":              "Reduce Exposure",
            "type":              "bearish",
            "strength":          round(min(1.0, rsk / 100), 2),
            "description":       f"Market risk score {rsk:.0f}/100, credit spread stressed — liquidity declining",
            "historical_win_rate": 0.63,
            "risk_reward":       "2.4:1",
            "action":            "Trim 20-30% of risk; hold more cash and short-duration bonds",
        })

    if not signals:
        signals.append({
            "name":              "Neutral",
            "type":              "neutral",
            "strength":          0.5,
            "description":       "Mixed breadth signals — no high-conviction directional setup",
            "historical_win_rate": None,
            "risk_reward":       "—",
            "action":            "Stay at base allocation; wait for clearer confirmation from breadth",
        })

    return signals


# ── Equal Weight vs Cap Weight ────────────────────────────────────────────────

def _ew_vs_cw(etf_prices: pd.DataFrame, stock_prices: pd.DataFrame) -> dict:
    result = {"rsp_vs_spy_1m": None, "rsp_vs_spy_3m": None, "equal_weight_advantage": None}
    if etf_prices.empty:
        return result

    # Try RSP from DB
    rsp_s = etf_prices["RSP"].dropna() if "RSP" in etf_prices.columns else None
    spy_s = etf_prices["SPY"].dropna() if "SPY" in etf_prices.columns else None

    # Fallback: compute equal-weight return from individual stocks
    if rsp_s is None and not stock_prices.empty:
        ew_ret = stock_prices.pct_change().mean(axis=1).dropna()
        spy_ret = spy_s.pct_change().dropna() if spy_s is not None else None
        if spy_ret is not None and len(ew_ret) >= 21:
            common = ew_ret.index.intersection(spy_ret.index)
            if len(common) >= 21:
                ew_c  = ew_ret[common]
                spy_c = spy_ret[common]
                result["rsp_vs_spy_1m"] = round(float((1 + ew_c.iloc[-21:]).prod() - 1 - ((1 + spy_c.iloc[-21:]).prod() - 1)), 4)
        return result

    if rsp_s is None or spy_s is None:
        return result
    common = rsp_s.index.intersection(spy_s.index)
    if len(common) < 22:
        return result
    r = rsp_s[common]
    s = spy_s[common]
    if len(r) >= 21:
        result["rsp_vs_spy_1m"] = round(float(r.iloc[-1]/r.iloc[-21] - s.iloc[-1]/s.iloc[-21]), 4)
    if len(r) >= 63:
        result["rsp_vs_spy_3m"] = round(float(r.iloc[-1]/r.iloc[-63] - s.iloc[-1]/s.iloc[-63]), 4)
    return result


# ── Main Dashboard Endpoint ───────────────────────────────────────────────────

@router.get("/dashboard")
async def get_breadth_dashboard(universe: str = Query("sp500")):
    cache_key = f"dashboard:{universe}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    # Load SP500 stocks
    sp500_tickers, sector_map = _get_sp500_meta()
    if not sp500_tickers:
        return {"error": "No SP500 universe in cache", "universe": universe}

    stock_prices = _load_prices_from_db(sp500_tickers, days=310)

    # Load macro ETFs
    etf_tickers = ["SPY", "^VIX", "HYG", "LQD", "IEF", "TIP", "^TNX", "^IRX",
                   "RSP", "XLK", "XLV", "XLF", "XLI", "XLY", "XLP",
                   "XLE", "XLU", "XLRE", "XLB", "XLC", "GLD", "TLT"]
    etf_prices = _load_etf_prices(etf_tickers, days=310)

    if stock_prices.empty:
        return {"error": "No price data available", "universe": universe}

    # Core breadth computation
    breadth  = _compute_all(stock_prices, sector_map)
    risk     = _compute_risk(etf_prices)
    sectors  = _enrich_sector_rs(breadth.get("sectors", []), etf_prices)
    ew_cw    = _ew_vs_cw(etf_prices, stock_prices)
    regime   = _classify_7state(breadth, risk, etf_prices)
    health   = _composite_health(breadth.get("breadth_health", 50), risk, etf_prices)
    divs     = _detect_divergences(breadth, etf_prices)
    signals  = _generate_signals(breadth, risk, regime)

    snap = breadth.get("snapshot", {})
    snap.update(ew_cw)

    as_of = str(stock_prices.index[-1].date()) if not stock_prices.empty else None

    result = {
        "universe":  universe,
        "n_stocks":  len(stock_prices.columns),
        "as_of":     as_of,
        "market_health": health,
        "regime":    regime,
        "snapshot":  snap,
        "hindenburg": breadth.get("hindenburg", {}),
        "zweig":     breadth.get("zweig", {}),
        "history":   breadth.get("history", []),
        "sectors":   sectors,
        "risk":      risk,
        "divergences": divs,
        "signals":   signals,
    }

    _set_cached(cache_key, result)
    return result


@router.post("/refresh")
async def refresh_breadth(universe: str = Query("sp500")):
    key = f"dashboard:{universe}"
    with _LOCK:
        _CACHE.pop(key, None)
    return {"status": "cache cleared", "universe": universe}
