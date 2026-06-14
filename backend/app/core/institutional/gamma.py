"""
Dealer Gamma Exposure (GEX) computation.

Convention: Net GEX = Σ (Call_OI - Put_OI) * gamma * spot^2 * mult * 0.01
Positive GEX -> dealers net long gamma -> dampens moves (buy dips / sell rips).
Negative GEX -> dealers net short gamma -> amplifies moves.
Gamma flip   -> price level where Net GEX changes sign.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta, datetime

import numpy as np
import yfinance as yf

logger = logging.getLogger(__name__)

_cache: dict = {}
_cache_ts: dict[str, datetime] = {}
_TTL_SECS = 3600  # 1 hour


def _norm_pdf(x: float) -> float:
    return float(np.exp(-0.5 * x * x) / np.sqrt(2 * np.pi))


def _gamma_bs(S: float, K: float, T: float, sigma: float, r: float = 0.05) -> float:
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return 0.0
    d1 = (np.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * np.sqrt(T))
    return _norm_pdf(d1) / (S * sigma * np.sqrt(T))


def compute_gex(ticker: str = "SPY") -> dict:
    global _cache, _cache_ts
    now = datetime.now()
    if ticker in _cache_ts and (now - _cache_ts[ticker]).total_seconds() < _TTL_SECS:
        return _cache.get(ticker, {})

    result: dict = {
        "ticker":     ticker,
        "spot":       None,
        "total_gex":  None,      # $M
        "gamma_flip": None,
        "call_wall":  None,      # strike with highest call OI
        "put_wall":   None,
        "regime":     "unknown", # "positive" | "negative"
        "profile":    [],        # [{strike, gex_m, call_oi, put_oi}]
    }

    try:
        t    = yf.Ticker(ticker)
        spot = float(t.fast_info.get("last_price") or t.fast_info.get("lastPrice") or 0)
        if spot <= 0:
            return result
        result["spot"] = round(spot, 2)

        exps = t.options
        if not exps:
            return result

        today  = date.today()
        cutoff = today + timedelta(days=60)
        near   = [e for e in exps if date.fromisoformat(e) <= cutoff][:6]
        mult   = 100   # shares per contract

        gex_by_k:     dict[float, float] = {}
        call_oi_by_k: dict[float, float] = {}
        put_oi_by_k:  dict[float, float] = {}

        for exp in near:
            T = max((date.fromisoformat(exp) - today).days, 1) / 365.0
            chain = t.option_chain(exp)

            for _, row in chain.calls.iterrows():
                K  = float(row["strike"])
                oi = float(row.get("openInterest") or 0)
                iv = float(row.get("impliedVolatility") or 0)
                if oi <= 0 or iv <= 0:
                    continue
                g = _gamma_bs(spot, K, T, iv)
                gex_by_k[K]     = gex_by_k.get(K, 0)     + g * oi * mult * spot * spot * 0.01
                call_oi_by_k[K] = call_oi_by_k.get(K, 0) + oi

            for _, row in chain.puts.iterrows():
                K  = float(row["strike"])
                oi = float(row.get("openInterest") or 0)
                iv = float(row.get("impliedVolatility") or 0)
                if oi <= 0 or iv <= 0:
                    continue
                g = _gamma_bs(spot, K, T, iv)
                gex_by_k[K]    = gex_by_k.get(K, 0)    - g * oi * mult * spot * spot * 0.01
                put_oi_by_k[K] = put_oi_by_k.get(K, 0) + oi

        if not gex_by_k:
            return result

        total_gex = sum(gex_by_k.values())
        result["total_gex"] = round(total_gex / 1e6, 0)
        result["regime"]    = "positive" if total_gex > 0 else "negative"

        # Key walls
        if call_oi_by_k:
            result["call_wall"] = round(max(call_oi_by_k, key=lambda k: call_oi_by_k[k]), 1)
        if put_oi_by_k:
            result["put_wall"]  = round(max(put_oi_by_k,  key=lambda k: put_oi_by_k[k]),  1)

        # Gamma flip: find strike nearest to spot where cumulative GEX crosses 0
        strikes = sorted(gex_by_k.keys())
        cum = 0.0
        prev_k: float | None = None
        flip: float | None = None

        for k in strikes:
            prev_cum = cum
            cum += gex_by_k[k]
            if prev_k is not None and prev_cum * cum < 0 and abs(k - spot) / spot < 0.15:
                ratio = abs(prev_cum) / (abs(prev_cum) + abs(cum))
                flip  = round(prev_k + ratio * (k - prev_k), 1)
            prev_k = k

        result["gamma_flip"] = flip

        # Profile: ±15% around spot
        result["profile"] = [
            {
                "strike":  round(k, 1),
                "gex_m":   round(gex_by_k[k] / 1e6, 2),
                "call_oi": int(call_oi_by_k.get(k, 0)),
                "put_oi":  int(put_oi_by_k.get(k, 0)),
            }
            for k in strikes
            if abs(k - spot) / spot <= 0.15
        ]

    except Exception as e:
        logger.warning(f"GEX failed for {ticker}: {e}")

    _cache[ticker]    = result
    _cache_ts[ticker] = now
    return result
