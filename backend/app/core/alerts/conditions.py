"""
Alert condition evaluators.
Each function accepts a price DataFrame (single ticker, DatetimeIndex) and
returns (triggered: bool, metadata: dict) where metadata feeds the AI explainer.
"""
import numpy as np
import pandas as pd
from typing import Optional, Tuple


def _rsi(close: pd.Series, period: int = 14) -> float:
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return float(rsi.iloc[-1]) if not rsi.empty else 50.0


def _macd(close: pd.Series) -> Tuple[float, float, float]:
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd_line = ema12 - ema26
    signal = macd_line.ewm(span=9, adjust=False).mean()
    hist = macd_line - signal
    return float(macd_line.iloc[-1]), float(signal.iloc[-1]), float(hist.iloc[-1])


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> float:
    hl = high - low
    hpc = (high - close.shift()).abs()
    lpc = (low - close.shift()).abs()
    tr = pd.concat([hl, hpc, lpc], axis=1).max(axis=1)
    return float(tr.rolling(period).mean().iloc[-1])


# ── Price Conditions ───────────────────────────────────────────────────────────

def price_above(df: pd.DataFrame, level: float, **_) -> Tuple[bool, dict]:
    price = float(df["close"].iloc[-1])
    return price > level, {"price": price, "level": level, "distance_pct": (price / level - 1) * 100}


def price_below(df: pd.DataFrame, level: float, **_) -> Tuple[bool, dict]:
    price = float(df["close"].iloc[-1])
    return price < level, {"price": price, "level": level, "distance_pct": (price / level - 1) * 100}


def pct_move(df: pd.DataFrame, threshold: float, **_) -> Tuple[bool, dict]:
    if len(df) < 2:
        return False, {}
    prev = float(df["close"].iloc[-2])
    cur = float(df["close"].iloc[-1])
    move = (cur / prev - 1) * 100 if prev > 0 else 0
    return abs(move) >= threshold, {"move_pct": move, "threshold": threshold, "direction": "up" if move > 0 else "down"}


def gap_up(df: pd.DataFrame, threshold: float = 1.0, **_) -> Tuple[bool, dict]:
    if len(df) < 2:
        return False, {}
    prev_close = float(df["close"].iloc[-2])
    today_open = float(df["open"].iloc[-1])
    gap = (today_open / prev_close - 1) * 100 if prev_close > 0 else 0
    return gap >= threshold, {"gap_pct": gap, "prev_close": prev_close, "open": today_open}


def gap_down(df: pd.DataFrame, threshold: float = 1.0, **_) -> Tuple[bool, dict]:
    if len(df) < 2:
        return False, {}
    prev_close = float(df["close"].iloc[-2])
    today_open = float(df["open"].iloc[-1])
    gap = (prev_close / today_open - 1) * 100 if today_open > 0 else 0
    return gap >= threshold, {"gap_pct": -gap, "prev_close": prev_close, "open": today_open}


def new_52w_high(df: pd.DataFrame, **_) -> Tuple[bool, dict]:
    if len(df) < 50:
        return False, {}
    lookback = df["high"].tail(252)
    cur_high = float(df["high"].iloc[-1])
    prev_max = float(lookback.iloc[:-1].max())
    return cur_high >= prev_max, {"price": cur_high, "prior_52w_high": prev_max}


def new_52w_low(df: pd.DataFrame, **_) -> Tuple[bool, dict]:
    if len(df) < 50:
        return False, {}
    lookback = df["low"].tail(252)
    cur_low = float(df["low"].iloc[-1])
    prev_min = float(lookback.iloc[:-1].min())
    return cur_low <= prev_min, {"price": cur_low, "prior_52w_low": prev_min}


def breakout_resistance(df: pd.DataFrame, period: int = 20, **_) -> Tuple[bool, dict]:
    if len(df) < period + 2:
        return False, {}
    close = df["close"]
    resistance = float(df["high"].iloc[-(period+1):-1].max())
    price = float(close.iloc[-1])
    vol = float(df["volume"].iloc[-1])
    avg_vol = float(df["volume"].tail(period).mean())
    vol_confirm = vol > 1.5 * avg_vol
    return price > resistance and vol_confirm, {
        "price": price, "resistance": resistance,
        "vol_ratio": vol / avg_vol if avg_vol > 0 else 1,
    }


def breakdown_support(df: pd.DataFrame, period: int = 20, **_) -> Tuple[bool, dict]:
    if len(df) < period + 2:
        return False, {}
    support = float(df["low"].iloc[-(period+1):-1].min())
    price = float(df["close"].iloc[-1])
    vol = float(df["volume"].iloc[-1])
    avg_vol = float(df["volume"].tail(period).mean())
    return price < support, {
        "price": price, "support": support,
        "vol_ratio": vol / avg_vol if avg_vol > 0 else 1,
    }


# ── Technical Conditions ───────────────────────────────────────────────────────

def rsi_overbought(df: pd.DataFrame, threshold: float = 70, **_) -> Tuple[bool, dict]:
    rsi = _rsi(df["close"])
    return rsi > threshold, {"rsi": rsi, "threshold": threshold}


def rsi_oversold(df: pd.DataFrame, threshold: float = 30, **_) -> Tuple[bool, dict]:
    rsi = _rsi(df["close"])
    return rsi < threshold, {"rsi": rsi, "threshold": threshold}


def macd_bullish_cross(df: pd.DataFrame, **_) -> Tuple[bool, dict]:
    if len(df) < 30:
        return False, {}
    c = df["close"]
    macd_now, sig_now, hist_now = _macd(c)
    macd_prev, sig_prev, hist_prev = _macd(c.iloc[:-1])
    crossed = hist_prev < 0 and hist_now > 0
    return crossed, {"macd": macd_now, "signal": sig_now, "histogram": hist_now}


def macd_bearish_cross(df: pd.DataFrame, **_) -> Tuple[bool, dict]:
    if len(df) < 30:
        return False, {}
    c = df["close"]
    macd_now, sig_now, hist_now = _macd(c)
    macd_prev, sig_prev, hist_prev = _macd(c.iloc[:-1])
    crossed = hist_prev > 0 and hist_now < 0
    return crossed, {"macd": macd_now, "signal": sig_now, "histogram": hist_now}


def golden_cross(df: pd.DataFrame, **_) -> Tuple[bool, dict]:
    if len(df) < 205:
        return False, {}
    c = df["close"]
    sma50 = c.rolling(50).mean()
    sma200 = c.rolling(200).mean()
    crossed = float(sma50.iloc[-2]) < float(sma200.iloc[-2]) and float(sma50.iloc[-1]) >= float(sma200.iloc[-1])
    return crossed, {"sma50": float(sma50.iloc[-1]), "sma200": float(sma200.iloc[-1])}


def death_cross(df: pd.DataFrame, **_) -> Tuple[bool, dict]:
    if len(df) < 205:
        return False, {}
    c = df["close"]
    sma50 = c.rolling(50).mean()
    sma200 = c.rolling(200).mean()
    crossed = float(sma50.iloc[-2]) > float(sma200.iloc[-2]) and float(sma50.iloc[-1]) <= float(sma200.iloc[-1])
    return crossed, {"sma50": float(sma50.iloc[-1]), "sma200": float(sma200.iloc[-1])}


def bb_breakout(df: pd.DataFrame, period: int = 20, std_dev: float = 2.0, **_) -> Tuple[bool, dict]:
    if len(df) < period:
        return False, {}
    c = df["close"]
    sma = c.rolling(period).mean()
    std = c.rolling(period).std()
    upper = sma + std_dev * std
    price = float(c.iloc[-1])
    upper_val = float(upper.iloc[-1])
    return price > upper_val, {"price": price, "upper_band": upper_val, "sma": float(sma.iloc[-1])}


def atr_expansion(df: pd.DataFrame, multiplier: float = 1.5, **_) -> Tuple[bool, dict]:
    if len(df) < 30:
        return False, {}
    atr_now = _atr(df["high"], df["low"], df["close"], 5)
    atr_avg = _atr(df["high"], df["low"], df["close"], 20)
    expanded = atr_now > multiplier * atr_avg
    return expanded, {"atr_5d": atr_now, "atr_20d": atr_avg, "ratio": atr_now / atr_avg if atr_avg > 0 else 1}


def volume_spike(df: pd.DataFrame, multiplier: float = 2.0, period: int = 20, **_) -> Tuple[bool, dict]:
    if len(df) < period:
        return False, {}
    cur_vol = float(df["volume"].iloc[-1])
    avg_vol = float(df["volume"].tail(period).mean())
    return cur_vol > multiplier * avg_vol, {"volume": cur_vol, "avg_volume": avg_vol, "ratio": cur_vol / avg_vol if avg_vol > 0 else 1}


def vwap_crossover(df: pd.DataFrame, period: int = 20, **_) -> Tuple[bool, dict]:
    if len(df) < period:
        return False, {}
    typical = (df["high"] + df["low"] + df["close"]) / 3
    vwap = (typical * df["volume"]).rolling(period).sum() / df["volume"].rolling(period).sum().replace(0, np.nan)
    price_now = float(df["close"].iloc[-1])
    price_prev = float(df["close"].iloc[-2])
    vwap_now = float(vwap.iloc[-1])
    vwap_prev = float(vwap.iloc[-2])
    crossed_up = price_prev < vwap_prev and price_now >= vwap_now
    return crossed_up, {"price": price_now, "vwap": vwap_now}


# ── Momentum / Mean Reversion Conditions ──────────────────────────────────────

def momentum_top10(df: pd.DataFrame, lookback: int = 252, **_) -> Tuple[bool, dict]:
    if len(df) < lookback:
        return False, {}
    ret = float(df["close"].iloc[-1] / df["close"].iloc[-lookback] - 1) * 100
    return ret > 15.0, {"momentum_pct": ret}


def zscore_extreme(df: pd.DataFrame, threshold: float = 2.0, period: int = 20, **_) -> Tuple[bool, dict]:
    if len(df) < period:
        return False, {}
    c = df["close"]
    mean = float(c.tail(period).mean())
    std = float(c.tail(period).std())
    z = (float(c.iloc[-1]) - mean) / std if std > 0 else 0
    return abs(z) >= threshold, {"zscore": z, "price": float(c.iloc[-1]), "mean": mean}


def price_far_above_ma(df: pd.DataFrame, threshold: float = 10.0, period: int = 50, **_) -> Tuple[bool, dict]:
    if len(df) < period:
        return False, {}
    price = float(df["close"].iloc[-1])
    ma = float(df["close"].rolling(period).mean().iloc[-1])
    dist = (price / ma - 1) * 100
    return dist >= threshold, {"price": price, "ma": ma, "dist_pct": dist}


def price_far_below_ma(df: pd.DataFrame, threshold: float = 10.0, period: int = 50, **_) -> Tuple[bool, dict]:
    if len(df) < period:
        return False, {}
    price = float(df["close"].iloc[-1])
    ma = float(df["close"].rolling(period).mean().iloc[-1])
    dist = (ma / price - 1) * 100
    return dist >= threshold, {"price": price, "ma": ma, "dist_pct": -dist}


# ── Composite / Smart Conditions ───────────────────────────────────────────────

def breakout_composite(df: pd.DataFrame, **_) -> Tuple[bool, dict]:
    """Smart breakout: price > resistance + volume 2x + RSI momentum + MACD positive."""
    if len(df) < 60:
        return False, {}
    price = float(df["close"].iloc[-1])
    resistance = float(df["high"].tail(60).iloc[:-1].max())
    vol = float(df["volume"].iloc[-1])
    avg_vol = float(df["volume"].tail(20).mean())
    vol_ratio = vol / avg_vol if avg_vol > 0 else 1
    rsi_val = _rsi(df["close"])
    _, _, macd_hist = _macd(df["close"])

    price_break = price > resistance
    vol_confirm = vol_ratio >= 1.8
    rsi_confirm = 50 <= rsi_val <= 80
    macd_confirm = macd_hist > 0

    conditions_met = sum([price_break, vol_confirm, rsi_confirm, macd_confirm])
    confidence = int(conditions_met / 4 * 100)
    triggered = price_break and conditions_met >= 3

    return triggered, {
        "price": price, "resistance": resistance, "vol_ratio": vol_ratio,
        "rsi": rsi_val, "macd_hist": macd_hist, "conditions_met": conditions_met,
        "confidence": confidence,
    }


def reversal_bullish(df: pd.DataFrame, **_) -> Tuple[bool, dict]:
    """RSI oversold + bullish MACD divergence + volume confirmation."""
    if len(df) < 30:
        return False, {}
    rsi_val = _rsi(df["close"])
    _, _, macd_hist = _macd(df["close"])
    _, _, macd_hist_prev = _macd(df["close"].iloc[:-3])
    vol_ratio = float(df["volume"].iloc[-1]) / float(df["volume"].tail(20).mean())

    oversold = rsi_val < 40
    macd_improving = macd_hist > macd_hist_prev
    vol_confirm = vol_ratio > 1.2

    conditions = sum([oversold, macd_improving, vol_confirm])
    triggered = conditions >= 2
    return triggered, {
        "rsi": rsi_val, "macd_hist": macd_hist, "vol_ratio": vol_ratio,
        "confidence": int(conditions / 3 * 100)
    }


def reversal_bearish(df: pd.DataFrame, **_) -> Tuple[bool, dict]:
    """RSI overbought + bearish MACD divergence."""
    if len(df) < 30:
        return False, {}
    rsi_val = _rsi(df["close"])
    _, _, macd_hist = _macd(df["close"])
    _, _, macd_hist_prev = _macd(df["close"].iloc[:-3])
    vol_ratio = float(df["volume"].iloc[-1]) / float(df["volume"].tail(20).mean())

    overbought = rsi_val > 65
    macd_weakening = macd_hist < macd_hist_prev
    vol_confirm = vol_ratio > 1.2

    conditions = sum([overbought, macd_weakening, vol_confirm])
    triggered = conditions >= 2
    return triggered, {
        "rsi": rsi_val, "macd_hist": macd_hist, "vol_ratio": vol_ratio,
        "confidence": int(conditions / 3 * 100)
    }


def ai_composite_signal(df: pd.DataFrame, signal_type: str = "buy", **_) -> Tuple[bool, dict]:
    """
    Multi-factor composite: trend + momentum + volatility + volume + RS.
    signal_type: 'strong_buy' | 'buy' | 'sell' | 'strong_sell'
    """
    if len(df) < 60:
        return False, {}
    close = df["close"]
    price = float(close.iloc[-1])
    sma50 = float(close.rolling(50).mean().iloc[-1])
    sma200 = float(close.rolling(200).mean().iloc[-1]) if len(df) >= 200 else sma50
    rsi_val = _rsi(close)
    _, _, macd_hist = _macd(close)
    vol_ratio = float(df["volume"].iloc[-1]) / float(df["volume"].tail(20).mean())
    mom_3m = float(close.iloc[-1] / close.iloc[-63] - 1) * 100 if len(df) >= 63 else 0
    vol_21 = float(close.pct_change().tail(21).std() * (252 ** 0.5))

    trend_score = (1 if price > sma50 else 0) + (1 if sma50 > sma200 else 0)
    mom_score = 1 if mom_3m > 5 else 0
    rsi_score = 1 if 40 < rsi_val < 70 else 0
    macd_score = 1 if macd_hist > 0 else 0
    vol_score = 1 if vol_ratio > 1.2 else 0
    low_vol_score = 1 if vol_21 < 0.30 else 0

    bull_score = trend_score + mom_score + rsi_score + macd_score + vol_score
    total = 7
    composite = bull_score / total

    if signal_type in ("strong_buy",):
        triggered = composite >= 0.75
    elif signal_type == "buy":
        triggered = composite >= 0.55
    elif signal_type == "sell":
        triggered = composite <= 0.40
    elif signal_type == "strong_sell":
        triggered = composite <= 0.25
    else:
        triggered = False

    confidence = int(composite * 100) if signal_type in ("strong_buy", "buy") else int((1 - composite) * 100)
    return triggered, {
        "composite_score": composite, "confidence": confidence,
        "trend": trend_score, "momentum": mom_score, "rsi": rsi_val,
        "macd": macd_hist, "vol_ratio": vol_ratio, "mom_3m": mom_3m,
    }


# ── Condition Registry ─────────────────────────────────────────────────────────

CONDITION_REGISTRY = {
    # Price
    "price_above": price_above,
    "price_below": price_below,
    "pct_move": pct_move,
    "gap_up": gap_up,
    "gap_down": gap_down,
    "new_52w_high": new_52w_high,
    "new_52w_low": new_52w_low,
    "breakout_resistance": breakout_resistance,
    "breakdown_support": breakdown_support,
    # Technical
    "rsi_overbought": rsi_overbought,
    "rsi_oversold": rsi_oversold,
    "macd_bullish_cross": macd_bullish_cross,
    "macd_bearish_cross": macd_bearish_cross,
    "golden_cross": golden_cross,
    "death_cross": death_cross,
    "bb_breakout": bb_breakout,
    "atr_expansion": atr_expansion,
    "volume_spike": volume_spike,
    "vwap_crossover": vwap_crossover,
    # Momentum / mean reversion
    "momentum_top10": momentum_top10,
    "zscore_extreme": zscore_extreme,
    "price_far_above_ma": price_far_above_ma,
    "price_far_below_ma": price_far_below_ma,
    # Composite
    "breakout_composite": breakout_composite,
    "reversal_bullish": reversal_bullish,
    "reversal_bearish": reversal_bearish,
    "ai_signal": ai_composite_signal,
}


def evaluate(condition: str, df: pd.DataFrame, params: dict) -> Tuple[bool, dict]:
    fn = CONDITION_REGISTRY.get(condition)
    if fn is None:
        return False, {}
    try:
        return fn(df, **params)
    except Exception:
        return False, {}
