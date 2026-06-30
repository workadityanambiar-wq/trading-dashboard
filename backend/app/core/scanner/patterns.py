"""
Institutional Market Pattern Detection Engine — 37 patterns, 5-factor confidence scoring.
Input: list of OHLCV dicts [{time, open, high, low, close, volume}, ...]
Output: list of detected pattern dicts with entry/stop/targets and scores.
"""
from __future__ import annotations
import math
from typing import Optional

# ─── Indicator helpers ──────────────────────────────────────────────────────

def _ema(values: list[float], period: int) -> list[float]:
    result: list[float] = []
    k = 2 / (period + 1)
    for i, v in enumerate(values):
        if i == 0:
            result.append(v)
        else:
            result.append(v * k + result[-1] * (1 - k))
    return result


def _sma(values: list[float], period: int) -> list[float]:
    out: list[float] = []
    for i in range(len(values)):
        if i < period - 1:
            out.append(float("nan"))
        else:
            out.append(sum(values[i - period + 1 : i + 1]) / period)
    return out


def _atr(bars: list[dict], period: int = 14) -> list[float]:
    trs: list[float] = []
    for i, b in enumerate(bars):
        if i == 0:
            trs.append(b["high"] - b["low"])
        else:
            prev_c = bars[i - 1]["close"]
            trs.append(max(b["high"] - b["low"], abs(b["high"] - prev_c), abs(b["low"] - prev_c)))
    atr: list[float] = []
    for i, tr in enumerate(trs):
        if i < period - 1:
            atr.append(float("nan"))
        elif i == period - 1:
            atr.append(sum(trs[:period]) / period)
        else:
            atr.append((atr[-1] * (period - 1) + tr) / period)
    return atr


def _rsi(closes: list[float], period: int = 14) -> list[float]:
    gains, losses = [], []
    for i in range(1, len(closes)):
        d = closes[i] - closes[i - 1]
        gains.append(max(d, 0))
        losses.append(max(-d, 0))
    rsi: list[float] = [float("nan")] * len(closes)
    if len(gains) < period:
        return rsi
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(closes)):
        avg_gain = (avg_gain * (period - 1) + gains[i - 1]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i - 1]) / period
        rs = avg_gain / avg_loss if avg_loss else float("inf")
        rsi[i] = 100 - 100 / (1 + rs)
    return rsi


def _macd(closes: list[float], fast=12, slow=26, signal=9) -> tuple[list[float], list[float], list[float]]:
    ema_fast = _ema(closes, fast)
    ema_slow = _ema(closes, slow)
    macd_line = [f - s for f, s in zip(ema_fast, ema_slow)]
    sig_line = _ema(macd_line, signal)
    hist = [m - s for m, s in zip(macd_line, sig_line)]
    return macd_line, sig_line, hist


def _adx(bars: list[dict], period: int = 14) -> list[float]:
    if len(bars) < period + 1:
        return [float("nan")] * len(bars)
    plus_dm, minus_dm, trs = [], [], []
    for i in range(1, len(bars)):
        up   = bars[i]["high"] - bars[i - 1]["high"]
        down = bars[i - 1]["low"] - bars[i]["low"]
        plus_dm.append(up if up > down and up > 0 else 0)
        minus_dm.append(down if down > up and down > 0 else 0)
        prev_c = bars[i - 1]["close"]
        trs.append(max(bars[i]["high"] - bars[i]["low"],
                       abs(bars[i]["high"] - prev_c),
                       abs(bars[i]["low"] - prev_c)))
    sm_tr = [sum(trs[:period])]
    sm_plus = [sum(plus_dm[:period])]
    sm_minus = [sum(minus_dm[:period])]
    for i in range(period, len(trs)):
        sm_tr.append(sm_tr[-1] - sm_tr[-1] / period + trs[i])
        sm_plus.append(sm_plus[-1] - sm_plus[-1] / period + plus_dm[i])
        sm_minus.append(sm_minus[-1] - sm_minus[-1] / period + minus_dm[i])
    dx = []
    for t, p, m in zip(sm_tr, sm_plus, sm_minus):
        if t == 0:
            dx.append(0.0)
        else:
            di_plus = 100 * p / t
            di_minus = 100 * m / t
            dx.append(100 * abs(di_plus - di_minus) / (di_plus + di_minus) if (di_plus + di_minus) else 0)
    adx_vals = [float("nan")] * (period + period)
    if len(dx) >= period:
        adx_vals[period * 2 - 1] = sum(dx[:period]) / period
        for i in range(period, len(dx)):
            adx_vals.append((adx_vals[-1] * (period - 1) + dx[i]) / period)
    return adx_vals


def _bollinger(closes: list[float], period: int = 20, mult: float = 2.0):
    sma = _sma(closes, period)
    upper, lower, width = [], [], []
    for i in range(len(closes)):
        if math.isnan(sma[i]):
            upper.append(float("nan"))
            lower.append(float("nan"))
            width.append(float("nan"))
        else:
            subset = closes[max(0, i - period + 1) : i + 1]
            std = (sum((x - sma[i]) ** 2 for x in subset) / len(subset)) ** 0.5
            upper.append(sma[i] + mult * std)
            lower.append(sma[i] - mult * std)
            w = (upper[-1] - lower[-1]) / sma[i] if sma[i] else 0
            width.append(w)
    return upper, sma, lower, width


# ─── Result builder ──────────────────────────────────────────────────────────

def _make_result(
    bars: list[dict],
    pattern: str,
    category: str,
    direction: str,
    entry: float,
    stop: float,
    atr_val: float,
    rsi_val: float,
    adx_val: float,
    pattern_quality: float,
    trend_quality: float,
    volume_conf: float,
    breakout_prob: float,
) -> dict:
    risk = abs(entry - stop)
    t1 = entry + risk * 1.5 if direction == "LONG" else entry - risk * 1.5
    t2 = entry + risk * 2.5 if direction == "LONG" else entry - risk * 2.5
    t3 = entry + risk * 4.0 if direction == "LONG" else entry - risk * 4.0
    rr = (abs(t2 - entry) / risk) if risk else 0
    rr_score = min(100, rr / 3.0 * 100)
    overall = (
        pattern_quality * 0.30
        + trend_quality  * 0.25
        + volume_conf    * 0.20
        + breakout_prob  * 0.15
        + rr_score       * 0.10
    )
    if rr < 1.5:
        overall *= 0.6
    classification = (
        "HIGH_CONVICTION" if overall >= 75
        else "MODERATE" if overall >= 50
        else "LOW_PROBABILITY"
    )
    last = bars[-1]
    return {
        "pattern":        pattern,
        "category":       category,
        "direction":      direction,
        "current_price":  round(last["close"], 5),
        "entry":          round(entry, 5),
        "stop":           round(stop, 5),
        "target1":        round(t1, 5),
        "target2":        round(t2, 5),
        "target3":        round(t3, 5),
        "rr_ratio":       round(rr, 2),
        "pattern_score":  round(overall, 1),
        "pattern_quality":round(pattern_quality, 1),
        "trend_quality":  round(trend_quality, 1),
        "volume_conf":    round(volume_conf, 1),
        "breakout_prob":  round(breakout_prob, 1),
        "rr_score":       round(rr_score, 1),
        "classification": classification,
        "atr":            round(atr_val, 5) if not math.isnan(atr_val) else None,
        "rsi":            round(rsi_val, 1) if not math.isnan(rsi_val) else None,
        "adx":            round(adx_val, 1) if not math.isnan(adx_val) else None,
    }


# ─── Volume helper ───────────────────────────────────────────────────────────

def _vol_score(bars: list[dict], lookback: int = 20) -> float:
    vols = [b["volume"] for b in bars[-lookback - 1:-1]]
    if not vols:
        return 50.0
    avg = sum(vols) / len(vols)
    last_vol = bars[-1]["volume"]
    ratio = last_vol / avg if avg else 1
    return min(100, max(0, 50 + (ratio - 1) * 50))


def _trend_score(sma20: float, sma50: float, sma200: float, direction: str) -> float:
    if math.isnan(sma20) or math.isnan(sma50) or math.isnan(sma200):
        return 50.0
    if direction == "LONG":
        score = 50
        if sma20 > sma50: score += 20
        if sma50 > sma200: score += 20
        if sma20 > sma200: score += 10
        return float(score)
    else:
        score = 50
        if sma20 < sma50: score += 20
        if sma50 < sma200: score += 20
        if sma20 < sma200: score += 10
        return float(score)


# ─── Candlestick Patterns (9) ────────────────────────────────────────────────

def _detect_bull_engulfing(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 3: return None
    p, c = bars[-2], bars[-1]
    if not (p["close"] < p["open"] and c["close"] > c["open"]): return None
    if not (c["open"] < p["close"] and c["close"] > p["open"]): return None
    if rsi[-1] > 60: return None
    body_ratio = (c["close"] - c["open"]) / (atr[-1] or 1)
    pq = min(100, 50 + body_ratio * 25)
    return _make_result(bars, "Bull Engulfing", "CANDLESTICK", "LONG",
                        entry=c["close"], stop=c["low"] - atr[-1] * 0.3,
                        atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                        pattern_quality=pq, trend_quality=_trend_score(sma20, sma50, sma200, "LONG"),
                        volume_conf=_vol_score(bars), breakout_prob=65)


def _detect_bear_engulfing(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 3: return None
    p, c = bars[-2], bars[-1]
    if not (p["close"] > p["open"] and c["close"] < c["open"]): return None
    if not (c["open"] > p["close"] and c["close"] < p["open"]): return None
    if rsi[-1] < 40: return None
    body_ratio = (c["open"] - c["close"]) / (atr[-1] or 1)
    pq = min(100, 50 + body_ratio * 25)
    return _make_result(bars, "Bear Engulfing", "CANDLESTICK", "SHORT",
                        entry=c["close"], stop=c["high"] + atr[-1] * 0.3,
                        atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                        pattern_quality=pq, trend_quality=_trend_score(sma20, sma50, sma200, "SHORT"),
                        volume_conf=_vol_score(bars), breakout_prob=65)


def _detect_hammer(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 10: return None
    c = bars[-1]
    body = abs(c["close"] - c["open"])
    lower_wick = min(c["close"], c["open"]) - c["low"]
    upper_wick = c["high"] - max(c["close"], c["open"])
    if lower_wick < body * 2 or upper_wick > body * 0.5: return None
    recent_lows = [b["low"] for b in bars[-10:-1]]
    if c["low"] > min(recent_lows) * 1.005: return None
    pq = min(100, 55 + (lower_wick / (atr[-1] or 1)) * 20)
    return _make_result(bars, "Hammer", "CANDLESTICK", "LONG",
                        entry=c["high"], stop=c["low"] - atr[-1] * 0.2,
                        atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                        pattern_quality=pq, trend_quality=_trend_score(sma20, sma50, sma200, "LONG"),
                        volume_conf=_vol_score(bars), breakout_prob=60)


def _detect_shooting_star(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 10: return None
    c = bars[-1]
    body = abs(c["close"] - c["open"])
    upper_wick = c["high"] - max(c["close"], c["open"])
    lower_wick = min(c["close"], c["open"]) - c["low"]
    if upper_wick < body * 2 or lower_wick > body * 0.5: return None
    recent_highs = [b["high"] for b in bars[-10:-1]]
    if c["high"] < max(recent_highs) * 0.995: return None
    pq = min(100, 55 + (upper_wick / (atr[-1] or 1)) * 20)
    return _make_result(bars, "Shooting Star", "CANDLESTICK", "SHORT",
                        entry=c["low"], stop=c["high"] + atr[-1] * 0.2,
                        atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                        pattern_quality=pq, trend_quality=_trend_score(sma20, sma50, sma200, "SHORT"),
                        volume_conf=_vol_score(bars), breakout_prob=60)


def _detect_doji_bull(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 5: return None
    c = bars[-1]
    body = abs(c["close"] - c["open"])
    if body > atr[-1] * 0.1: return None
    if rsi[-1] > 50: return None
    prev_trend = closes[-5] > closes[-1]
    if not prev_trend: return None
    return _make_result(bars, "Doji Reversal (Bull)", "CANDLESTICK", "LONG",
                        entry=c["close"] + atr[-1] * 0.1, stop=c["low"] - atr[-1] * 0.3,
                        atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                        pattern_quality=60, trend_quality=_trend_score(sma20, sma50, sma200, "LONG"),
                        volume_conf=_vol_score(bars), breakout_prob=55)


def _detect_doji_bear(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 5: return None
    c = bars[-1]
    body = abs(c["close"] - c["open"])
    if body > atr[-1] * 0.1: return None
    if rsi[-1] < 50: return None
    prev_trend = closes[-5] < closes[-1]
    if not prev_trend: return None
    return _make_result(bars, "Doji Reversal (Bear)", "CANDLESTICK", "SHORT",
                        entry=c["close"] - atr[-1] * 0.1, stop=c["high"] + atr[-1] * 0.3,
                        atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                        pattern_quality=60, trend_quality=_trend_score(sma20, sma50, sma200, "SHORT"),
                        volume_conf=_vol_score(bars), breakout_prob=55)


def _detect_morning_star(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 4: return None
    b1, b2, b3 = bars[-3], bars[-2], bars[-1]
    if not (b1["close"] < b1["open"]): return None
    if abs(b2["close"] - b2["open"]) > atr[-1] * 0.3: return None
    if not (b3["close"] > b3["open"] and b3["close"] > (b1["open"] + b1["close"]) / 2): return None
    return _make_result(bars, "Morning Star", "CANDLESTICK", "LONG",
                        entry=b3["close"], stop=b2["low"] - atr[-1] * 0.2,
                        atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                        pattern_quality=75, trend_quality=_trend_score(sma20, sma50, sma200, "LONG"),
                        volume_conf=_vol_score(bars), breakout_prob=68)


def _detect_evening_star(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 4: return None
    b1, b2, b3 = bars[-3], bars[-2], bars[-1]
    if not (b1["close"] > b1["open"]): return None
    if abs(b2["close"] - b2["open"]) > atr[-1] * 0.3: return None
    if not (b3["close"] < b3["open"] and b3["close"] < (b1["open"] + b1["close"]) / 2): return None
    return _make_result(bars, "Evening Star", "CANDLESTICK", "SHORT",
                        entry=b3["close"], stop=b2["high"] + atr[-1] * 0.2,
                        atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                        pattern_quality=75, trend_quality=_trend_score(sma20, sma50, sma200, "SHORT"),
                        volume_conf=_vol_score(bars), breakout_prob=68)


def _detect_piercing_dark_cloud(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 3: return None
    p, c = bars[-2], bars[-1]
    midpoint = (p["open"] + p["close"]) / 2
    if p["close"] < p["open"] and c["close"] > c["open"] and c["open"] < p["close"] and c["close"] > midpoint:
        return _make_result(bars, "Piercing Line", "CANDLESTICK", "LONG",
                            entry=c["close"], stop=c["low"] - atr[-1] * 0.3,
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=65, trend_quality=_trend_score(sma20, sma50, sma200, "LONG"),
                            volume_conf=_vol_score(bars), breakout_prob=60)
    if p["close"] > p["open"] and c["close"] < c["open"] and c["open"] > p["close"] and c["close"] < midpoint:
        return _make_result(bars, "Dark Cloud Cover", "CANDLESTICK", "SHORT",
                            entry=c["close"], stop=c["high"] + atr[-1] * 0.3,
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=65, trend_quality=_trend_score(sma20, sma50, sma200, "SHORT"),
                            volume_conf=_vol_score(bars), breakout_prob=60)
    return None


# ─── Chart Patterns (12) ─────────────────────────────────────────────────────

def _detect_bull_flag(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 25: return None
    pole_bars = bars[-25:-10]
    flag_bars = bars[-10:]
    pole_move = pole_bars[-1]["close"] - pole_bars[0]["close"]
    if pole_move < atr[-1] * 3: return None
    flag_high = max(b["high"] for b in flag_bars)
    flag_low  = min(b["low"]  for b in flag_bars)
    flag_range = flag_high - flag_low
    if flag_range > abs(pole_move) * 0.5: return None
    if flag_bars[-1]["close"] < flag_bars[0]["close"] * 0.98: return None
    breakout_level = flag_high
    if closes[-1] < breakout_level: return None
    pq = min(100, 60 + (pole_move / (atr[-1] or 1)) * 5)
    return _make_result(bars, "Bull Flag", "CHART", "LONG",
                        entry=breakout_level, stop=flag_low - atr[-1] * 0.2,
                        atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                        pattern_quality=pq, trend_quality=_trend_score(sma20, sma50, sma200, "LONG"),
                        volume_conf=_vol_score(bars), breakout_prob=70)


def _detect_bear_flag(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 25: return None
    pole_bars = bars[-25:-10]
    flag_bars = bars[-10:]
    pole_move = pole_bars[0]["close"] - pole_bars[-1]["close"]
    if pole_move < atr[-1] * 3: return None
    flag_high = max(b["high"] for b in flag_bars)
    flag_low  = min(b["low"]  for b in flag_bars)
    flag_range = flag_high - flag_low
    if flag_range > abs(pole_move) * 0.5: return None
    if flag_bars[-1]["close"] > flag_bars[0]["close"] * 1.02: return None
    breakout_level = flag_low
    if closes[-1] > breakout_level: return None
    pq = min(100, 60 + (pole_move / (atr[-1] or 1)) * 5)
    return _make_result(bars, "Bear Flag", "CHART", "SHORT",
                        entry=breakout_level, stop=flag_high + atr[-1] * 0.2,
                        atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                        pattern_quality=pq, trend_quality=_trend_score(sma20, sma50, sma200, "SHORT"),
                        volume_conf=_vol_score(bars), breakout_prob=70)


def _detect_head_shoulders(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 40: return None
    highs = [b["high"] for b in bars[-40:]]
    lows  = [b["low"]  for b in bars[-40:]]
    local_highs = [i for i in range(2, 38) if highs[i] > highs[i-1] and highs[i] > highs[i+1]]
    if len(local_highs) < 3: return None
    peaks = sorted(local_highs, key=lambda i: highs[i], reverse=True)[:3]
    peaks.sort()
    if len(peaks) < 3: return None
    ls, head, rs = peaks[0], peaks[1], peaks[2]
    if not (highs[head] > highs[ls] and highs[head] > highs[rs]): return None
    if abs(highs[ls] - highs[rs]) > atr[-1] * 2: return None
    neckline = min(lows[ls:head] + lows[head:rs]) if ls < head < rs else lows[ls]
    if closes[-1] < neckline * 0.995:
        return _make_result(bars, "Head & Shoulders", "CHART", "SHORT",
                            entry=closes[-1], stop=neckline + atr[-1],
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=78, trend_quality=_trend_score(sma20, sma50, sma200, "SHORT"),
                            volume_conf=_vol_score(bars), breakout_prob=72)
    return None


def _detect_inv_head_shoulders(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 40: return None
    lows = [b["low"] for b in bars[-40:]]
    local_lows = [i for i in range(2, 38) if lows[i] < lows[i-1] and lows[i] < lows[i+1]]
    if len(local_lows) < 3: return None
    troughs = sorted(local_lows, key=lambda i: lows[i])[:3]
    troughs.sort()
    if len(troughs) < 3: return None
    ls, head, rs = troughs[0], troughs[1], troughs[2]
    if not (lows[head] < lows[ls] and lows[head] < lows[rs]): return None
    if abs(lows[ls] - lows[rs]) > atr[-1] * 2: return None
    neckline = max([bars[-40 + i]["high"] for i in range(ls, rs + 1)]) if ls < rs else bars[-1]["high"]
    if closes[-1] > neckline * 1.005:
        return _make_result(bars, "Inv Head & Shoulders", "CHART", "LONG",
                            entry=closes[-1], stop=neckline - atr[-1],
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=78, trend_quality=_trend_score(sma20, sma50, sma200, "LONG"),
                            volume_conf=_vol_score(bars), breakout_prob=72)
    return None


def _detect_double_top(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 30: return None
    recent = bars[-30:]
    highs = [b["high"] for b in recent]
    peaks = sorted([i for i in range(2, 28) if highs[i] >= highs[i-1] and highs[i] >= highs[i+1]],
                   key=lambda i: highs[i], reverse=True)
    if len(peaks) < 2: return None
    p1, p2 = sorted(peaks[:2])
    if abs(highs[p1] - highs[p2]) > atr[-1] * 1.5: return None
    if p2 - p1 < 5: return None
    valley = min(b["low"] for b in recent[p1:p2 + 1])
    if closes[-1] < valley * 0.998:
        return _make_result(bars, "Double Top", "CHART", "SHORT",
                            entry=closes[-1], stop=max(highs[p1], highs[p2]) + atr[-1] * 0.5,
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=72, trend_quality=_trend_score(sma20, sma50, sma200, "SHORT"),
                            volume_conf=_vol_score(bars), breakout_prob=68)
    return None


def _detect_double_bottom(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 30: return None
    recent = bars[-30:]
    lows = [b["low"] for b in recent]
    troughs = sorted([i for i in range(2, 28) if lows[i] <= lows[i-1] and lows[i] <= lows[i+1]],
                     key=lambda i: lows[i])
    if len(troughs) < 2: return None
    t1, t2 = sorted(troughs[:2])
    if abs(lows[t1] - lows[t2]) > atr[-1] * 1.5: return None
    if t2 - t1 < 5: return None
    peak = max(b["high"] for b in recent[t1:t2 + 1])
    if closes[-1] > peak * 1.002:
        return _make_result(bars, "Double Bottom", "CHART", "LONG",
                            entry=closes[-1], stop=min(lows[t1], lows[t2]) - atr[-1] * 0.5,
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=72, trend_quality=_trend_score(sma20, sma50, sma200, "LONG"),
                            volume_conf=_vol_score(bars), breakout_prob=68)
    return None


def _detect_asc_triangle(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 20: return None
    recent = bars[-20:]
    highs = [b["high"] for b in recent]
    lows  = [b["low"]  for b in recent]
    resistance = max(highs)
    touches = sum(1 for h in highs if h > resistance * 0.997)
    if touches < 2: return None
    trough_levels = [lows[i] for i in range(2, 18) if lows[i] < lows[i-1] and lows[i] < lows[i+1]]
    if len(trough_levels) < 2 or trough_levels[-1] <= trough_levels[0]: return None
    if closes[-1] > resistance * 1.001:
        return _make_result(bars, "Ascending Triangle", "CHART", "LONG",
                            entry=resistance, stop=lows[-1] - atr[-1] * 0.3,
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=70, trend_quality=_trend_score(sma20, sma50, sma200, "LONG"),
                            volume_conf=_vol_score(bars), breakout_prob=72)
    return None


def _detect_desc_triangle(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 20: return None
    recent = bars[-20:]
    highs = [b["high"] for b in recent]
    lows  = [b["low"]  for b in recent]
    support = min(lows)
    touches = sum(1 for l in lows if l < support * 1.003)
    if touches < 2: return None
    peak_levels = [highs[i] for i in range(2, 18) if highs[i] > highs[i-1] and highs[i] > highs[i+1]]
    if len(peak_levels) < 2 or peak_levels[-1] >= peak_levels[0]: return None
    if closes[-1] < support * 0.999:
        return _make_result(bars, "Descending Triangle", "CHART", "SHORT",
                            entry=support, stop=highs[-1] + atr[-1] * 0.3,
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=70, trend_quality=_trend_score(sma20, sma50, sma200, "SHORT"),
                            volume_conf=_vol_score(bars), breakout_prob=72)
    return None


def _detect_sym_triangle(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 20: return None
    recent = bars[-20:]
    highs = [b["high"] for b in recent]
    lows  = [b["low"]  for b in recent]
    peaks = [highs[i] for i in range(2, 18) if highs[i] > highs[i-1] and highs[i] > highs[i+1]]
    troughs = [lows[i] for i in range(2, 18) if lows[i] < lows[i-1] and lows[i] < lows[i+1]]
    if len(peaks) < 2 or len(troughs) < 2: return None
    if peaks[-1] >= peaks[0] or troughs[-1] <= troughs[0]: return None
    resistance = max(highs[-5:])
    support = min(lows[-5:])
    mid = (resistance + support) / 2
    direction = "LONG" if closes[-1] > mid else "SHORT"
    entry = resistance if direction == "LONG" else support
    stop = support - atr[-1] * 0.2 if direction == "LONG" else resistance + atr[-1] * 0.2
    return _make_result(bars, "Symmetrical Triangle", "CHART", direction,
                        entry=entry, stop=stop,
                        atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                        pattern_quality=65, trend_quality=_trend_score(sma20, sma50, sma200, direction),
                        volume_conf=_vol_score(bars), breakout_prob=62)


def _detect_cup_handle(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 50: return None
    cup = bars[-50:-10]
    handle = bars[-10:]
    cup_highs = [b["high"] for b in cup]
    cup_lows  = [b["low"]  for b in cup]
    if not (cup_highs[0] > cup_highs[len(cup)//2] and cup_highs[-1] > cup_highs[len(cup)//2]):
        return None
    depth = (max(cup_highs) - min(cup_lows)) / (max(cup_highs) or 1)
    if depth < 0.10 or depth > 0.50: return None
    resistance = max(cup_highs)
    handle_low = min(b["low"] for b in handle)
    handle_retrace = (resistance - handle_low) / (resistance - min(cup_lows) or 1)
    if handle_retrace > 0.5: return None
    if closes[-1] > resistance * 1.001:
        return _make_result(bars, "Cup & Handle", "CHART", "LONG",
                            entry=resistance, stop=handle_low - atr[-1] * 0.3,
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=80, trend_quality=_trend_score(sma20, sma50, sma200, "LONG"),
                            volume_conf=_vol_score(bars), breakout_prob=75)
    return None


def _detect_rising_wedge(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 20: return None
    recent = bars[-20:]
    highs = [b["high"] for b in recent]
    lows  = [b["low"]  for b in recent]
    if not (highs[-1] > highs[0] and lows[-1] > lows[0]): return None
    high_slope = (highs[-1] - highs[0]) / len(highs)
    low_slope  = (lows[-1]  - lows[0])  / len(lows)
    if low_slope <= high_slope: return None
    if closes[-1] < lows[-3]:
        return _make_result(bars, "Rising Wedge", "CHART", "SHORT",
                            entry=closes[-1], stop=highs[-1] + atr[-1] * 0.3,
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=68, trend_quality=_trend_score(sma20, sma50, sma200, "SHORT"),
                            volume_conf=_vol_score(bars), breakout_prob=65)
    return None


def _detect_falling_wedge(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 20: return None
    recent = bars[-20:]
    highs = [b["high"] for b in recent]
    lows  = [b["low"]  for b in recent]
    if not (highs[-1] < highs[0] and lows[-1] < lows[0]): return None
    high_slope = (highs[-1] - highs[0]) / len(highs)
    low_slope  = (lows[-1]  - lows[0])  / len(lows)
    if high_slope <= low_slope: return None
    if closes[-1] > highs[-3]:
        return _make_result(bars, "Falling Wedge", "CHART", "LONG",
                            entry=closes[-1], stop=lows[-1] - atr[-1] * 0.3,
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=68, trend_quality=_trend_score(sma20, sma50, sma200, "LONG"),
                            volume_conf=_vol_score(bars), breakout_prob=65)
    return None


# ─── Indicator Patterns (8) ──────────────────────────────────────────────────

def _detect_golden_cross(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    s50 = _sma(closes, 50)
    s200 = _sma(closes, 200)
    if len(s50) < 2 or len(s200) < 2: return None
    if math.isnan(s50[-2]) or math.isnan(s200[-2]): return None
    if s50[-2] < s200[-2] and s50[-1] > s200[-1]:
        return _make_result(bars, "Golden Cross", "INDICATOR", "LONG",
                            entry=closes[-1], stop=s200[-1] - atr[-1],
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=82, trend_quality=90,
                            volume_conf=_vol_score(bars), breakout_prob=78)
    return None


def _detect_death_cross(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    s50 = _sma(closes, 50)
    s200 = _sma(closes, 200)
    if len(s50) < 2 or len(s200) < 2: return None
    if math.isnan(s50[-2]) or math.isnan(s200[-2]): return None
    if s50[-2] > s200[-2] and s50[-1] < s200[-1]:
        return _make_result(bars, "Death Cross", "INDICATOR", "SHORT",
                            entry=closes[-1], stop=s200[-1] + atr[-1],
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=82, trend_quality=90,
                            volume_conf=_vol_score(bars), breakout_prob=78)
    return None


def _detect_macd_bull(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    macd_line, sig_line, hist = _macd(closes)
    if len(hist) < 2: return None
    if hist[-2] < 0 and hist[-1] > 0 and macd_line[-1] < 0:
        pq = min(100, 60 + abs(macd_line[-1]) / (atr[-1] or 1) * 10)
        return _make_result(bars, "MACD Bull Cross", "INDICATOR", "LONG",
                            entry=closes[-1], stop=closes[-1] - atr[-1] * 1.5,
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=pq, trend_quality=_trend_score(sma20, sma50, sma200, "LONG"),
                            volume_conf=_vol_score(bars), breakout_prob=65)
    return None


def _detect_macd_bear(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    macd_line, sig_line, hist = _macd(closes)
    if len(hist) < 2: return None
    if hist[-2] > 0 and hist[-1] < 0 and macd_line[-1] > 0:
        pq = min(100, 60 + abs(macd_line[-1]) / (atr[-1] or 1) * 10)
        return _make_result(bars, "MACD Bear Cross", "INDICATOR", "SHORT",
                            entry=closes[-1], stop=closes[-1] + atr[-1] * 1.5,
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=pq, trend_quality=_trend_score(sma20, sma50, sma200, "SHORT"),
                            volume_conf=_vol_score(bars), breakout_prob=65)
    return None


def _detect_rsi_oversold(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if rsi[-1] < 30 and rsi[-2] < 30 and rsi[-1] > rsi[-2]:
        return _make_result(bars, "RSI Oversold Reversal", "INDICATOR", "LONG",
                            entry=closes[-1], stop=bars[-1]["low"] - atr[-1] * 0.5,
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=70, trend_quality=_trend_score(sma20, sma50, sma200, "LONG"),
                            volume_conf=_vol_score(bars), breakout_prob=60)
    return None


def _detect_rsi_overbought(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if rsi[-1] > 70 and rsi[-2] > 70 and rsi[-1] < rsi[-2]:
        return _make_result(bars, "RSI Overbought Reversal", "INDICATOR", "SHORT",
                            entry=closes[-1], stop=bars[-1]["high"] + atr[-1] * 0.5,
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=70, trend_quality=_trend_score(sma20, sma50, sma200, "SHORT"),
                            volume_conf=_vol_score(bars), breakout_prob=60)
    return None


def _detect_bb_squeeze(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    upper, mid, lower, width = _bollinger(closes)
    if len(width) < 20: return None
    if math.isnan(width[-1]): return None
    recent_widths = [w for w in width[-20:] if not math.isnan(w)]
    if not recent_widths: return None
    if width[-1] > min(recent_widths) * 1.2: return None
    if closes[-1] > mid[-1]:
        return _make_result(bars, "BB Squeeze (Bull)", "INDICATOR", "LONG",
                            entry=upper[-1], stop=lower[-1],
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=72, trend_quality=_trend_score(sma20, sma50, sma200, "LONG"),
                            volume_conf=_vol_score(bars), breakout_prob=70)
    else:
        return _make_result(bars, "BB Squeeze (Bear)", "INDICATOR", "SHORT",
                            entry=lower[-1], stop=upper[-1],
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=72, trend_quality=_trend_score(sma20, sma50, sma200, "SHORT"),
                            volume_conf=_vol_score(bars), breakout_prob=70)


def _detect_adx_trend(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    adx_val = adx[-1]
    if math.isnan(adx_val) or adx_val < 25: return None
    direction = "LONG" if closes[-1] > sma20 else "SHORT"
    entry = closes[-1]
    stop = (closes[-1] - atr[-1] * 1.5 if direction == "LONG" else closes[-1] + atr[-1] * 1.5)
    pq = min(100, 50 + (adx_val - 25) * 2)
    return _make_result(bars, "Strong ADX Trend", "INDICATOR", direction,
                        entry=entry, stop=stop,
                        atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx_val,
                        pattern_quality=pq, trend_quality=_trend_score(sma20, sma50, sma200, direction),
                        volume_conf=_vol_score(bars), breakout_prob=68)


# ─── Breakout Patterns (8) ───────────────────────────────────────────────────

def _detect_volume_breakout(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    vols = [b["volume"] for b in bars]
    avg_vol = sum(vols[-21:-1]) / 20 if len(vols) >= 21 else sum(vols[:-1]) / max(len(vols) - 1, 1)
    if vols[-1] < avg_vol * 2: return None
    price_move = abs(closes[-1] - closes[-2]) / (atr[-1] or 1)
    if price_move < 0.5: return None
    direction = "LONG" if closes[-1] > closes[-2] else "SHORT"
    entry = closes[-1]
    stop = (bars[-1]["low"] - atr[-1] * 0.5 if direction == "LONG" else bars[-1]["high"] + atr[-1] * 0.5)
    vol_ratio = vols[-1] / avg_vol
    pq = min(100, 50 + (vol_ratio - 2) * 15)
    return _make_result(bars, "Volume Breakout", "BREAKOUT", direction,
                        entry=entry, stop=stop,
                        atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                        pattern_quality=pq, trend_quality=_trend_score(sma20, sma50, sma200, direction),
                        volume_conf=min(100, vol_ratio * 33), breakout_prob=72)


def _detect_atr_expansion(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(atr) < 10: return None
    recent_atrs = [a for a in atr[-10:-1] if not math.isnan(a)]
    if not recent_atrs: return None
    avg_atr = sum(recent_atrs) / len(recent_atrs)
    if atr[-1] < avg_atr * 1.5: return None
    direction = "LONG" if closes[-1] > closes[-5] else "SHORT"
    entry = closes[-1]
    stop = (bars[-1]["low"] - atr[-1] * 0.3 if direction == "LONG" else bars[-1]["high"] + atr[-1] * 0.3)
    return _make_result(bars, "ATR Range Expansion", "BREAKOUT", direction,
                        entry=entry, stop=stop,
                        atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                        pattern_quality=68, trend_quality=_trend_score(sma20, sma50, sma200, direction),
                        volume_conf=_vol_score(bars), breakout_prob=65)


def _detect_momentum_burst(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(closes) < 6: return None
    move_3 = (closes[-1] - closes[-4]) / (closes[-4] or 1)
    if abs(move_3) < 0.02: return None
    direction = "LONG" if move_3 > 0 else "SHORT"
    entry = closes[-1]
    stop = (bars[-1]["low"] - atr[-1] if direction == "LONG" else bars[-1]["high"] + atr[-1])
    pq = min(100, 50 + abs(move_3) * 1000)
    return _make_result(bars, "Momentum Burst", "BREAKOUT", direction,
                        entry=entry, stop=stop,
                        atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                        pattern_quality=pq, trend_quality=_trend_score(sma20, sma50, sma200, direction),
                        volume_conf=_vol_score(bars), breakout_prob=65)


def _detect_support_break(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 20: return None
    support = min(b["low"] for b in bars[-20:-1])
    if closes[-1] < support * 0.998:
        return _make_result(bars, "Support Breakdown", "BREAKOUT", "SHORT",
                            entry=closes[-1], stop=support + atr[-1] * 0.5,
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=70, trend_quality=_trend_score(sma20, sma50, sma200, "SHORT"),
                            volume_conf=_vol_score(bars), breakout_prob=68)
    return None


def _detect_resistance_break(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 20: return None
    resistance = max(b["high"] for b in bars[-20:-1])
    if closes[-1] > resistance * 1.002:
        return _make_result(bars, "Resistance Breakout", "BREAKOUT", "LONG",
                            entry=closes[-1], stop=resistance - atr[-1] * 0.5,
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=70, trend_quality=_trend_score(sma20, sma50, sma200, "LONG"),
                            volume_conf=_vol_score(bars), breakout_prob=68)
    return None


def _detect_52w_high(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 100: return None
    yearly_high = max(b["high"] for b in bars[-260:-1]) if len(bars) >= 260 else max(b["high"] for b in bars[:-1])
    if closes[-1] > yearly_high:
        return _make_result(bars, "52-Week High Breakout", "BREAKOUT", "LONG",
                            entry=closes[-1], stop=closes[-1] - atr[-1] * 2,
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=85, trend_quality=95,
                            volume_conf=_vol_score(bars), breakout_prob=82)
    return None


def _detect_52w_low(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(bars) < 100: return None
    yearly_low = min(b["low"] for b in bars[-260:-1]) if len(bars) >= 260 else min(b["low"] for b in bars[:-1])
    if closes[-1] < yearly_low:
        return _make_result(bars, "52-Week Low Breakdown", "BREAKOUT", "SHORT",
                            entry=closes[-1], stop=closes[-1] + atr[-1] * 2,
                            atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                            pattern_quality=85, trend_quality=95,
                            volume_conf=_vol_score(bars), breakout_prob=82)
    return None


def _detect_range_compression(bars, closes, atr, rsi, adx, sma20, sma50, sma200):
    if len(atr) < 20: return None
    recent_atrs = [a for a in atr[-20:] if not math.isnan(a)]
    if not recent_atrs: return None
    avg_atr = sum(recent_atrs) / len(recent_atrs)
    if atr[-1] > avg_atr * 0.7: return None
    direction = "LONG" if closes[-1] > sma20 else "SHORT"
    entry = (max(b["high"] for b in bars[-5:]) if direction == "LONG" else min(b["low"] for b in bars[-5:]))
    stop = (min(b["low"] for b in bars[-5:]) - atr[-1] * 0.3 if direction == "LONG"
            else max(b["high"] for b in bars[-5:]) + atr[-1] * 0.3)
    return _make_result(bars, "Range Compression", "BREAKOUT", direction,
                        entry=entry, stop=stop,
                        atr_val=atr[-1], rsi_val=rsi[-1], adx_val=adx[-1] if not math.isnan(adx[-1]) else 0,
                        pattern_quality=65, trend_quality=_trend_score(sma20, sma50, sma200, direction),
                        volume_conf=_vol_score(bars), breakout_prob=67)


# ─── Master scan function ────────────────────────────────────────────────────

_ALL_DETECTORS = [
    _detect_bull_engulfing, _detect_bear_engulfing,
    _detect_hammer, _detect_shooting_star,
    _detect_doji_bull, _detect_doji_bear,
    _detect_morning_star, _detect_evening_star,
    _detect_piercing_dark_cloud,
    _detect_bull_flag, _detect_bear_flag,
    _detect_head_shoulders, _detect_inv_head_shoulders,
    _detect_double_top, _detect_double_bottom,
    _detect_asc_triangle, _detect_desc_triangle, _detect_sym_triangle,
    _detect_cup_handle,
    _detect_rising_wedge, _detect_falling_wedge,
    _detect_golden_cross, _detect_death_cross,
    _detect_macd_bull, _detect_macd_bear,
    _detect_rsi_oversold, _detect_rsi_overbought,
    _detect_bb_squeeze,
    _detect_adx_trend,
    _detect_volume_breakout, _detect_atr_expansion,
    _detect_momentum_burst,
    _detect_support_break, _detect_resistance_break,
    _detect_52w_high, _detect_52w_low,
    _detect_range_compression,
]


def scan_bars(bars: list[dict], min_score: float = 40.0) -> list[dict]:
    """Run all detectors against OHLCV bars, return scored pattern results."""
    if len(bars) < 5:
        return []
    closes = [b["close"] for b in bars]
    atr    = _atr(bars)
    rsi    = _rsi(closes)
    adx    = _adx(bars)
    sma20  = _sma(closes, 20)[-1]
    sma50  = _sma(closes, 50)[-1]
    sma200 = _sma(closes, 200)[-1]

    atr_val = atr[-1] if not math.isnan(atr[-1]) else 0
    rsi_val = rsi[-1] if not math.isnan(rsi[-1]) else 50
    adx_val = adx[-1] if len(adx) > 0 and not math.isnan(adx[-1]) else 0

    results = []
    seen_patterns: set[str] = set()
    for detector in _ALL_DETECTORS:
        try:
            r = detector(bars, closes, atr, rsi, adx, sma20, sma50, sma200)
            if r and r["pattern_score"] >= min_score and r["pattern"] not in seen_patterns:
                seen_patterns.add(r["pattern"])
                results.append(r)
        except Exception:
            pass
    results.sort(key=lambda x: x["pattern_score"], reverse=True)
    return results
