"""
Seven alpha factors — each returns a score 0-100 with sub-metrics.

Factor          Weight
───────────────────────
Momentum          25 %
Relative Strength 20 %
Institutional     15 %
Earnings          10 %
Quality           10 %
Macro Tailwind    10 %
Volatility Regime 10 %
"""
from __future__ import annotations

import numpy as np
from typing import List, Optional, Dict, Any


# ── Utilities ──────────────────────────────────────────────────────────────────

def _lin(x: float, lo: float, hi: float) -> float:
    """Linear map x ∈ [lo, hi] → [0, 100], clamped."""
    if hi == lo:
        return 50.0
    return float(np.clip((x - lo) / (hi - lo) * 100, 0, 100))


def _ema(arr: np.ndarray, period: int) -> float:
    k, e = 2.0 / (period + 1), float(arr[0])
    for v in arr[1:]:
        e = float(v) * k + e * (1 - k)
    return e


def _rsi(closes: np.ndarray, period: int = 14) -> float:
    if len(closes) < period + 1:
        return 50.0
    delta = np.diff(closes)
    g  = np.maximum(delta, 0)[-period * 2:]
    l_ = np.maximum(-delta, 0)[-period * 2:]
    ag, al = g[-period:].mean(), l_[-period:].mean()
    return 100.0 if al == 0 else float(100 - 100 / (1 + ag / al))


def _hv(closes: np.ndarray, window: int) -> float:
    if len(closes) < window + 1:
        return 0.30
    r = np.diff(np.log(closes[-(window + 1):]))
    return float(np.std(r) * np.sqrt(252))


# ── 1. Momentum (25 %) ────────────────────────────────────────────────────────

def factor_momentum(closes: np.ndarray) -> dict:
    n = len(closes)

    # Classic 12-1 month momentum (skip last month to avoid short-term reversal)
    r12_1 = float(closes[-21] / closes[max(n - 252, 0)] - 1) if n >= 63 else 0.0
    r3    = float(closes[-1]  / closes[max(n - 63,  0)] - 1) if n >= 22 else 0.0
    r1    = float(closes[-1]  / closes[max(n - 21,  0)] - 1) if n >= 6  else 0.0

    rsi = _rsi(closes)
    rsi_s = (
        100.0 if 52 <= rsi <= 68 else
        _lin(rsi, 30, 52)   if rsi < 52 else
        _lin(rsi, 90, 68)            # inverted — overbought = penalty
    )

    macd_bull = _ema(closes[-52:], 12) > _ema(closes[-52:], 26) if n >= 52 else True

    s12 = _lin(r12_1, -0.25, 0.50)
    s3  = _lin(r3,    -0.15, 0.30)
    s1  = _lin(r1,    -0.08, 0.15)
    sm  = 100.0 if macd_bull else 20.0

    raw = s12 * 0.40 + s3 * 0.30 + rsi_s * 0.20 + sm * 0.10

    trend = (
        "Strong Uptrend"  if raw >= 75 else
        "Uptrend"         if raw >= 55 else
        "Neutral"         if raw >= 40 else
        "Downtrend"       if raw >= 20 else
        "Strong Downtrend"
    )

    return {
        "score":       round(float(np.clip(raw, 0, 100)), 1),
        "return_12_1": round(r12_1 * 100, 1),
        "return_3m":   round(r3    * 100, 1),
        "return_1m":   round(r1    * 100, 1),
        "rsi":         round(rsi, 1),
        "macd_bull":   bool(macd_bull),
        "trend":       trend,
    }


# ── 2. Relative Strength (20 %) ───────────────────────────────────────────────

def factor_relative_strength(closes: np.ndarray, spy_closes: np.ndarray) -> dict:
    n = min(len(closes), len(spy_closes))
    if n < 22:
        return {"score": 50.0, "rs_12m": 0.0, "rs_3m": 0.0, "rs_1m": 0.0,
                "rs_trend": "neutral", "rs_line_slope": 0.0}

    c = closes[-n:]
    s = spy_closes[-n:]

    rs_12m = float(c[-1] / c[max(n - 252, 0)] - s[-1] / s[max(n - 252, 0)]) if n >= 252 else 0.0
    rs_3m  = float(c[-1] / c[max(n - 63,  0)] - s[-1] / s[max(n - 63,  0)]) if n >= 63  else 0.0
    rs_1m  = float(c[-1] / c[max(n - 21,  0)] - s[-1] / s[max(n - 21,  0)]) if n >= 22  else 0.0

    rs_line  = c / np.where(s == 0, 1e-10, s)
    w20      = rs_line[-20:]
    rs_slope = float(np.polyfit(np.arange(20), w20, 1)[0]) if n >= 20 else 0.0
    slope_n  = rs_slope / (float(np.std(w20)) + 1e-10) * 10
    slope_s  = _lin(slope_n, -3.0, 3.0)

    s12 = _lin(rs_12m, -0.20, 0.30)
    s3  = _lin(rs_3m,  -0.10, 0.20)
    s1  = _lin(rs_1m,  -0.05, 0.10)
    raw = s12 * 0.35 + s3 * 0.30 + s1 * 0.15 + slope_s * 0.20

    return {
        "score":         round(float(np.clip(raw, 0, 100)), 1),
        "rs_12m":        round(rs_12m * 100, 1),
        "rs_3m":         round(rs_3m  * 100, 1),
        "rs_1m":         round(rs_1m  * 100, 1),
        "rs_trend":      "rising" if rs_slope > 0 else "falling",
        "rs_line_slope": round(rs_slope, 6),
    }


# ── 3. Institutional Flow (15 %) ──────────────────────────────────────────────

def factor_institutional(
    dates:   List[str],
    highs:   List[float],
    lows:    List[float],
    closes:  List[float],
    volumes: List[float],
) -> dict:
    try:
        from app.core.smart_money.scorer import compute_accumulation_score
        r = compute_accumulation_score(dates, highs, lows, closes, volumes)
        return {
            "score":       round(r.get("score", 50.0), 1),
            "obv_score":   round(r.get("obv",          {}).get("score", 50.0), 1),
            "cmf_score":   round(r.get("cmf",          {}).get("score", 50.0), 1),
            "dark_pool":   round(r.get("dark_pool",    {}).get("score", 50.0), 1),
            "block_score": round(r.get("block_trades", {}).get("score", 50.0), 1),
            "grade":       r.get("grade", "C"),
            "signal":      r.get("label", ""),
        }
    except Exception:
        return {"score": 50.0, "obv_score": 50.0, "cmf_score": 50.0,
                "dark_pool": 50.0, "block_score": 50.0, "grade": "C", "signal": "N/A"}


# ── 4. Earnings Revisions (10 %) ──────────────────────────────────────────────

def factor_earnings(info: Dict[str, Any]) -> dict:
    rec    = float(info.get("recommendationMean") or 3.0)
    n_anal = int(info.get("numberOfAnalystOpinions") or 0)
    r_gr   = float(info.get("revenueGrowth")           or 0.0)
    e_gr   = float(
        info.get("earningsGrowth") or
        info.get("earningsQuarterlyGrowth") or 0.0
    )

    # Analyst consensus: 1=Strong Buy → 100, 3=Hold → 50, 5=Sell → 0
    coverage = min(n_anal / 20.0, 1.0)
    rec_s    = _lin(5.0 - rec, 0.0, 4.0) * coverage + 50.0 * (1 - coverage)

    rev_s = _lin(r_gr, -0.10, 0.30)
    eps_s = _lin(e_gr, -0.10, 0.50)
    raw   = rec_s * 0.50 + rev_s * 0.25 + eps_s * 0.25

    labels = {1: "Strong Buy", 2: "Buy", 3: "Hold", 4: "Underperform", 5: "Sell"}

    return {
        "score":      round(float(np.clip(raw, 0, 100)), 1),
        "rec_mean":   round(rec, 2),
        "rec_label":  labels.get(round(rec), "Hold"),
        "n_analysts": n_anal,
        "rev_growth": round(r_gr * 100, 1),
        "eps_growth": round(e_gr * 100, 1),
    }


# ── 5. Quality (10 %) ─────────────────────────────────────────────────────────

def factor_quality(info: Dict[str, Any]) -> dict:
    roe   = info.get("returnOnEquity")
    gm    = info.get("grossMargins")
    de    = info.get("debtToEquity")
    cr    = info.get("currentRatio")
    pm    = info.get("profitMargins")
    fcf   = float(info.get("freeCashflow") or 0)
    mkcap = float(info.get("marketCap")    or 1)

    roe_s = _lin(float(roe or 0), -0.05, 0.35)      if roe is not None else 50.0
    gm_s  = _lin(float(gm  or 0),  0.10, 0.70)      if gm  is not None else 50.0
    de_s  = _lin(-float(de or 100), -200.0, 0.0)    if de  is not None else 50.0
    cr_s  = _lin(float(cr  or 1.0), 0.5,  3.0)      if cr  is not None else 50.0
    pm_s  = _lin(float(pm  or 0), -0.05, 0.30)      if pm  is not None else 50.0
    fcf_s = _lin(fcf / max(mkcap, 1), -0.02, 0.08)

    raw = roe_s * 0.25 + gm_s * 0.20 + de_s * 0.15 + cr_s * 0.15 + pm_s * 0.15 + fcf_s * 0.10

    return {
        "score":         round(float(np.clip(raw, 0, 100)), 1),
        "roe":           round(float(roe or 0) * 100, 1),
        "gross_margin":  round(float(gm  or 0) * 100, 1),
        "debt_equity":   round(float(de  or 0), 1),
        "current_ratio": round(float(cr  or 0), 2),
        "profit_margin": round(float(pm  or 0) * 100, 1),
        "fcf_yield":     round(fcf / max(mkcap, 1) * 100, 2),
    }


# ── 6. Macro Tailwind (10 %) ──────────────────────────────────────────────────

def factor_macro(
    sector_closes: Optional[np.ndarray],
    spy_closes:    np.ndarray,
    sector:        str = "",
) -> dict:
    neutral = {"score": 50.0, "sector_rs_3m": 0.0, "sector_rs_1m": 0.0,
               "above_sector_ma50": True, "tailwind": "Neutral", "sector": sector}

    if sector_closes is None or len(sector_closes) < 22 or len(spy_closes) < 22:
        return neutral

    n  = min(len(sector_closes), len(spy_closes))
    se = sector_closes[-n:]
    sp = spy_closes[-n:]

    rs_3m = float(se[-1] / se[max(n - 63, 0)] - sp[-1] / sp[max(n - 63, 0)]) if n >= 63 else 0.0
    rs_1m = float(se[-1] / se[max(n - 21, 0)] - sp[-1] / sp[max(n - 21, 0)]) if n >= 21 else 0.0

    ma50     = se[-50:].mean() if n >= 50 else se.mean()
    above_ma = bool(se[-1] > ma50)

    s3  = _lin(rs_3m, -0.10, 0.15)
    s1  = _lin(rs_1m, -0.05, 0.10)
    s_m = 100.0 if above_ma else 20.0
    raw = s3 * 0.50 + s1 * 0.30 + s_m * 0.20

    tailwind = (
        "Strong Tailwind"  if raw >= 70 else
        "Mild Tailwind"    if raw >= 55 else
        "Neutral"          if raw >= 40 else
        "Mild Headwind"    if raw >= 25 else
        "Strong Headwind"
    )

    return {
        "score":             round(float(np.clip(raw, 0, 100)), 1),
        "sector_rs_3m":      round(rs_3m * 100, 1),
        "sector_rs_1m":      round(rs_1m * 100, 1),
        "above_sector_ma50": above_ma,
        "tailwind":          tailwind,
        "sector":            sector,
    }


# ── 7. Volatility Regime (10 %) ───────────────────────────────────────────────

def factor_volatility(closes: np.ndarray) -> dict:
    n    = len(closes)
    hv21 = _hv(closes, 21)
    hv63 = _hv(closes, 63)
    ratio = hv21 / max(hv63, 0.01)

    ma200       = closes[-200:].mean() if n >= 200 else closes.mean()
    ma50        = closes[-50:].mean()  if n >= 50  else closes.mean()
    above_200   = bool(closes[-1] > ma200)
    above_50    = bool(closes[-1] > ma50)

    # Low HV level = good; contracting ratio = good; above MAs = good
    vol_s   = _lin(-hv21,   -0.80, -0.05)   # 80% Ann. HV → 0, 5% → 100
    ratio_s = _lin(-ratio,  -2.00, -0.50)   # expanding HV ratio → 0
    ma_s    = (80.0 if above_200 else 15.0) * 0.6 + (70.0 if above_50 else 30.0) * 0.4

    raw = vol_s * 0.40 + ratio_s * 0.25 + ma_s * 0.35

    regime = (
        "Ideal — Low Vol + Uptrend"  if hv21 < 0.18 and above_200 else
        "Low Vol / Mixed Trend"      if hv21 < 0.18 else
        "Moderate Vol / Uptrend"     if hv21 < 0.30 and above_200 else
        "Moderate Vol / Choppy"      if hv21 < 0.30 else
        "High Vol / Uptrend"         if above_200   else
        "High Vol / Downtrend"
    )

    return {
        "score":       round(float(np.clip(raw, 0, 100)), 1),
        "hv_21d":      round(hv21  * 100, 1),
        "hv_63d":      round(hv63  * 100, 1),
        "hv_ratio":    round(ratio, 2),
        "above_ma200": above_200,
        "above_ma50":  above_50,
        "regime":      regime,
    }
