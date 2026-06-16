"""
Block trade detection from daily OHLCV data.

Without tick data we identify block-trade days using three conditions:
  - Volume exceeds threshold_mult × rolling average
  - Intraday range is not excessively wide (not a panic day)
  - Close position in the day's range reveals buy vs. sell pressure
"""
from __future__ import annotations
import numpy as np
from typing import List


def detect_block_days(
    dates:          List[str],
    volumes:        List[float],
    closes:         List[float],
    highs:          List[float],
    lows:           List[float],
    threshold_mult: float = 1.8,
    window:         int   = 20,
) -> List[dict]:
    if len(volumes) < window + 1:
        return []

    v = np.array(volumes, float)
    c = np.array(closes,  float)
    h = np.array(highs,   float)
    l = np.array(lows,    float)

    blocks = []
    for i in range(window, len(v)):
        roll_avg = v[i - window : i].mean()
        roll_rng = (
            (h[i - window : i] - l[i - window : i])
            / np.where(l[i - window : i] > 0, l[i - window : i], 1)
        ).mean() * 100

        vol_ratio  = v[i] / max(roll_avg, 1.0)
        day_rng    = (h[i] - l[i]) / max(l[i], 1.0) * 100
        close_pct  = (c[i] - l[i]) / max(h[i] - l[i], 0.001)

        if vol_ratio >= threshold_mult:
            conf = 0
            if day_rng < roll_rng * 1.5:
                conf += 40           # tight range = controlled flow
            if close_pct >= 0.5:
                conf += 40           # closed near high = buying
            conf += min(int((vol_ratio - threshold_mult) * 10), 20)

            blocks.append({
                "date":      dates[i] if i < len(dates) else f"Day {i}",
                "volume":    int(v[i]),
                "vol_ratio": round(vol_ratio, 1),
                "close":     round(float(c[i]), 2),
                "close_pct": round(close_pct * 100, 1),
                "day_range": round(day_rng, 2),
                "type":      "buying" if close_pct >= 0.5 else "selling",
                "confidence": min(conf, 100),
            })

    return sorted(blocks, key=lambda x: x["confidence"], reverse=True)[:10]


def block_trade_score(
    volumes: List[float],
    closes:  List[float],
    highs:   List[float],
    lows:    List[float],
    window:  int = 20,
) -> dict:
    if len(volumes) < window + 1:
        return {
            "score": 30.0, "block_days": 0, "buy_blocks": 0,
            "sell_blocks": 0, "buy_ratio": 0.5, "avg_vol_ratio": 1.0,
        }

    dates  = [f"Day {i}" for i in range(len(volumes))]
    blocks = detect_block_days(dates, volumes, closes, highs, lows, window=window)

    if not blocks:
        return {
            "score": 25.0, "block_days": 0, "buy_blocks": 0,
            "sell_blocks": 0, "buy_ratio": 0.5, "avg_vol_ratio": 1.0,
        }

    buys      = [b for b in blocks if b["type"] == "buying"]
    sells     = [b for b in blocks if b["type"] == "selling"]
    buy_ratio = len(buys) / max(len(blocks), 1)
    avg_conf  = float(np.mean([b["confidence"] for b in blocks]))
    avg_vr    = float(np.mean([b["vol_ratio"]   for b in blocks]))

    score = (
        buy_ratio            * 40.0 +
        (avg_conf / 100.0)   * 40.0 +
        min((avg_vr - 1.0) / 4.0, 1.0) * 20.0
    )

    return {
        "score":         round(float(np.clip(score, 0, 100)), 1),
        "block_days":    len(blocks),
        "buy_blocks":    len(buys),
        "sell_blocks":   len(sells),
        "buy_ratio":     round(buy_ratio, 2),
        "avg_vol_ratio": round(avg_vr, 2),
    }
