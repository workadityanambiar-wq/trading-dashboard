"""
NSE Index Options Dashboard
Covers NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY weekly/monthly option chains.
  GET /dashboard      — aggregate metrics: PCR, max pain, IV rank, gamma exposure
  GET /option-chain/{index}  — full option chain for a specific index
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from threading import Lock
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, HTTPException, Path

from app.core.data.nse_client import NSEClient

logger = logging.getLogger(__name__)
router = APIRouter()

_CACHE: dict[str, tuple[datetime, dict]] = {}
_LOCK  = Lock()
_TTL   = timedelta(minutes=5)

INDICES = {
    "NIFTY":       {"label": "Nifty 50",         "ticker": "^NSEI",      "lot": 25},
    "BANKNIFTY":   {"label": "Bank Nifty",        "ticker": "^NSEBANK",   "lot": 15},
    "FINNIFTY":    {"label": "Fin Nifty",         "ticker": "^CNXFIN",    "lot": 40},
    "MIDCPNIFTY":  {"label": "Midcap Nifty",      "ticker": "^CNXMIDCAP", "lot": 75},
    "SENSEX":      {"label": "BSE Sensex",        "ticker": "^BSESN",     "lot": 10},
}


def _safe_float(v) -> Optional[float]:
    try:
        f = float(v)
        return None if (np.isnan(f) or np.isinf(f)) else f
    except (TypeError, ValueError):
        return None


def _parse_index_chain(raw: dict, index_key: str) -> dict:
    records    = raw.get("records", {})
    expiries   = records.get("expiryDates", [])
    underlying = _safe_float(records.get("underlyingValue"))
    data_rows  = records.get("data", [])

    strikes_by_expiry: dict[str, list[dict]] = {}
    for row in data_rows:
        exp    = row.get("expiryDate", "")
        strike = _safe_float(row.get("strikePrice"))
        if not exp or strike is None:
            continue
        ce = row.get("CE", {}) or {}
        pe = row.get("PE", {}) or {}
        strikes_by_expiry.setdefault(exp, []).append({
            "strike":      strike,
            "ce_oi":       _safe_float(ce.get("openInterest")),
            "ce_oi_chg":   _safe_float(ce.get("changeinOpenInterest")),
            "ce_vol":      _safe_float(ce.get("totalTradedVolume")),
            "ce_iv":       _safe_float(ce.get("impliedVolatility")),
            "ce_ltp":      _safe_float(ce.get("lastPrice")),
            "pe_oi":       _safe_float(pe.get("openInterest")),
            "pe_oi_chg":   _safe_float(pe.get("changeinOpenInterest")),
            "pe_vol":      _safe_float(pe.get("totalTradedVolume")),
            "pe_iv":       _safe_float(pe.get("impliedVolatility")),
            "pe_ltp":      _safe_float(pe.get("lastPrice")),
        })

    for exp in strikes_by_expiry:
        strikes_by_expiry[exp].sort(key=lambda x: x["strike"])

    # Per-expiry PCR + max pain
    expiry_meta = []
    total_ce_oi = 0.0
    total_pe_oi = 0.0

    for exp in expiries:
        rows   = strikes_by_expiry.get(exp, [])
        ce_sum = sum(r["ce_oi"] or 0 for r in rows)
        pe_sum = sum(r["pe_oi"] or 0 for r in rows)
        pcr    = round(pe_sum / ce_sum, 4) if ce_sum else None
        total_ce_oi += ce_sum
        total_pe_oi += pe_sum

        # Max pain
        all_strikes = [r["strike"] for r in rows if r["strike"] is not None]
        max_pain = None
        if all_strikes:
            pain_vals: list[tuple[float, float]] = []
            for s in all_strikes:
                pain = 0.0
                for r in rows:
                    k = r["strike"]
                    if k is None:
                        continue
                    if k > s:
                        pain += (k - s) * (r["ce_oi"] or 0)
                    if k < s:
                        pain += (s - k) * (r["pe_oi"] or 0)
                pain_vals.append((s, pain))
            if pain_vals:
                max_pain = min(pain_vals, key=lambda x: x[1])[0]

        expiry_meta.append({
            "expiry":   exp,
            "ce_oi":    ce_sum,
            "pe_oi":    pe_sum,
            "pcr":      pcr,
            "max_pain": max_pain,
        })

    overall_pcr = round(total_pe_oi / total_ce_oi, 4) if total_ce_oi else None

    # IV rank: get ATM IV for nearest expiry
    atm_iv = None
    atm_iv_label = None
    if expiries and expiries[0] in strikes_by_expiry and underlying:
        rows = strikes_by_expiry[expiries[0]]
        if rows:
            atm_row = min(rows, key=lambda r: abs(r["strike"] - underlying))
            ce_iv = atm_row.get("ce_iv")
            pe_iv = atm_row.get("pe_iv")
            if ce_iv and pe_iv:
                atm_iv = round((ce_iv + pe_iv) / 2, 2)
            elif ce_iv:
                atm_iv = round(ce_iv, 2)
            elif pe_iv:
                atm_iv = round(pe_iv, 2)
            if atm_iv:
                if atm_iv > 25:
                    atm_iv_label = "Elevated"
                elif atm_iv > 15:
                    atm_iv_label = "Moderate"
                else:
                    atm_iv_label = "Low"

    # Gamma exposure: sum over strikes of (CE OI - PE OI) * notional
    # (simplified: positive = call wall, negative = put wall)
    gamma_exposure = []
    if expiries and expiries[0] in strikes_by_expiry:
        rows = strikes_by_expiry[expiries[0]]
        lot  = INDICES.get(index_key, {}).get("lot", 25)
        for r in rows:
            s = r["strike"]
            if s is None:
                continue
            net_oi = ((r["ce_oi"] or 0) - (r["pe_oi"] or 0)) * lot
            gamma_exposure.append({"strike": s, "net_gamma_oi": round(net_oi)})

    return {
        "index":        index_key,
        "label":        INDICES.get(index_key, {}).get("label", index_key),
        "underlying":   underlying,
        "timestamp":    records.get("timestamp"),
        "expiries":     expiries,
        "expiry_meta":  expiry_meta,
        "overall_pcr":  overall_pcr,
        "atm_iv":       atm_iv,
        "atm_iv_label": atm_iv_label,
        "gamma_exposure": gamma_exposure,
        "strikes":      strikes_by_expiry,
    }


@router.get("/dashboard")
async def get_index_fo_dashboard():
    key = "index_fo_dashboard"
    with _LOCK:
        if key in _CACHE:
            ts, val = _CACHE[key]
            if datetime.utcnow() - ts < _TTL:
                return val

    nse     = NSEClient.get()
    result  = {}
    for idx in ["NIFTY", "BANKNIFTY", "FINNIFTY"]:
        raw = nse.get_option_chain_index(idx)
        if raw:
            parsed = _parse_index_chain(raw, idx)
            result[idx] = {
                "label":       parsed["label"],
                "underlying":  parsed["underlying"],
                "overall_pcr": parsed["overall_pcr"],
                "atm_iv":      parsed["atm_iv"],
                "atm_iv_label": parsed["atm_iv_label"],
                "nearest_expiry": parsed["expiries"][0] if parsed["expiries"] else None,
                "nearest_max_pain": parsed["expiry_meta"][0]["max_pain"] if parsed["expiry_meta"] else None,
                "expiry_count": len(parsed["expiries"]),
            }

    # Fetch current prices for index tickers
    index_tickers = [info["ticker"] for idx, info in INDICES.items() if idx in result]
    prices: dict[str, float] = {}
    try:
        raw_prices = yf.download(index_tickers, period="2d", progress=False, auto_adjust=True)
        if not raw_prices.empty:
            close_df = raw_prices["Close"] if isinstance(raw_prices.columns, pd.MultiIndex) else raw_prices
            for ticker in close_df.columns:
                s = close_df[ticker].dropna()
                if not s.empty:
                    prices[ticker] = round(float(s.iloc[-1]), 2)
    except Exception as exc:
        logger.warning("Index price download failed: %s", exc)

    for idx_key, idx_data in result.items():
        ticker = INDICES[idx_key]["ticker"]
        idx_data["price"] = prices.get(ticker)

    out = {
        "as_of":   str(datetime.utcnow().date()),
        "indices": result,
    }

    with _LOCK:
        _CACHE[key] = (datetime.utcnow(), out)

    return out


@router.get("/option-chain/{index}")
async def get_index_option_chain(index: str = Path(..., description="NIFTY, BANKNIFTY, FINNIFTY, etc.")):
    idx = index.strip().upper()
    key = f"idx_chain:{idx}"

    with _LOCK:
        if key in _CACHE:
            ts, val = _CACHE[key]
            if datetime.utcnow() - ts < _TTL:
                return val

    nse = NSEClient.get()
    raw = nse.get_option_chain_index(idx)
    if not raw:
        raise HTTPException(status_code=503, detail=f"NSE index option chain unavailable for {idx}")

    chain = _parse_index_chain(raw, idx)

    with _LOCK:
        _CACHE[key] = (datetime.utcnow(), chain)

    return chain


@router.get("/indices")
async def list_indices():
    return [{"key": k, **v} for k, v in INDICES.items()]
