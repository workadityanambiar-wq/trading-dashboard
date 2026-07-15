"""
NSE Stock F&O Dashboard
Covers all ~180 NSE F&O-eligible stocks:
  GET /dashboard     — per-stock OI, PCR, build-up signals (cached 15 min)
  GET /option-chain/{symbol}  — full option chain from NSE API
  GET /oi-analysis   — OI spurts and OI change leaders from NSE
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from threading import Lock
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, HTTPException, Path, Query

from app.core.data.universe_india import get_fo_eligible
from app.core.data.nse_client import NSEClient

logger  = logging.getLogger(__name__)
router  = APIRouter()

# ── In-memory cache ────────────────────────────────────────────────────────────
_DASHBOARD_CACHE: dict[str, tuple[datetime, dict]] = {}
_CHAIN_CACHE:     dict[str, tuple[datetime, dict]] = {}
_OI_CACHE:        dict[str, tuple[datetime, dict]] = {}
_LOCK = Lock()
_DASHBOARD_TTL = timedelta(minutes=15)
_CHAIN_TTL     = timedelta(minutes=5)
_OI_TTL        = timedelta(minutes=10)

_TODAY      = datetime.today().strftime("%Y-%m-%d")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _build_up_signal(price_chg: Optional[float], oi_chg: Optional[float]) -> str:
    """
    Classic build-up classification:
      Price ↑ + OI ↑ → Long Build-up
      Price ↓ + OI ↑ → Short Build-up
      Price ↑ + OI ↓ → Short Covering
      Price ↓ + OI ↓ → Long Unwinding
    """
    if price_chg is None or oi_chg is None:
        return "N/A"
    price_up = price_chg >= 0
    oi_up    = oi_chg >= 0
    if price_up and oi_up:
        return "Long Build-up"
    if not price_up and oi_up:
        return "Short Build-up"
    if price_up and not oi_up:
        return "Short Covering"
    return "Long Unwinding"


def _safe_float(v) -> Optional[float]:
    try:
        f = float(v)
        return None if np.isnan(f) or np.isinf(f) else f
    except (TypeError, ValueError):
        return None


# ── NSE OI bulk fetch ──────────────────────────────────────────────────────────

def _fetch_nse_oi_all() -> dict[str, dict]:
    """
    Fetches OI change data for all F&O underlyings from NSE API.
    Returns {symbol: {oi, oi_change_pct, pcr, ...}} dict.
    Falls back gracefully to empty dict.
    """
    nse  = NSEClient.get()
    data = nse.get_json("/api/live-analysis-oi-underlyings-change")
    if not data:
        return {}
    records: dict[str, dict] = {}
    items = data if isinstance(data, list) else data.get("data", [])
    for item in items:
        sym = str(item.get("underlying", item.get("symbol", ""))).strip().upper()
        if not sym:
            continue
        records[sym] = {
            "oi":         _safe_float(item.get("openInterest") or item.get("oi")),
            "oi_prev":    _safe_float(item.get("openInterestPrevDay")),
            "oi_change":  _safe_float(item.get("oiChange") or item.get("oi_change")),
            "pcr":        _safe_float(item.get("pcr") or item.get("putCallRatio")),
            "volume":     _safe_float(item.get("totalTradedVolume") or item.get("volume")),
        }
    return records


def _fetch_nse_oi_spurts() -> list[dict]:
    """OI spurt stocks (high intraday OI change) from NSE."""
    nse  = NSEClient.get()
    data = nse.get_json("/api/live-analysis-oi-spurts-underlyings")
    if not data:
        return []
    items = data if isinstance(data, list) else data.get("data", [])
    result = []
    for item in items:
        sym = str(item.get("underlying", item.get("symbol", ""))).strip().upper()
        if sym:
            result.append({
                "symbol":    sym,
                "oi_change": _safe_float(item.get("oiChange") or item.get("oi_change")),
                "oi_pct":    _safe_float(item.get("oiPctChg") or item.get("oiChangePct")),
                "pcr":       _safe_float(item.get("pcr")),
                "price":     _safe_float(item.get("lastPrice") or item.get("ltp")),
                "price_chg": _safe_float(item.get("pChange") or item.get("priceChange")),
            })
    return result


# ── Price computation ──────────────────────────────────────────────────────────

def _compute_price_metrics(fo_df: pd.DataFrame) -> list[dict]:
    """Download 2M of prices via yfinance and compute per-stock metrics."""
    tickers = fo_df["ticker"].tolist()
    if not tickers:
        return []

    try:
        raw = yf.download(
            tickers,
            period="2mo",
            progress=False,
            auto_adjust=True,
            group_by="ticker",
        )
    except Exception as exc:
        logger.warning("yfinance download failed for F&O stocks: %s", exc)
        return []

    if raw.empty:
        return []

    # Handle MultiIndex columns (yfinance returns (field, ticker) when multiple tickers)
    if isinstance(raw.columns, pd.MultiIndex):
        close_df = raw["Close"] if "Close" in raw.columns.get_level_values(0) else pd.DataFrame()
        vol_df   = raw["Volume"] if "Volume" in raw.columns.get_level_values(0) else pd.DataFrame()
    else:
        # Single ticker (unlikely but handle)
        close_df = raw[["Close"]].rename(columns={"Close": tickers[0]})
        vol_df   = raw[["Volume"]].rename(columns={"Volume": tickers[0]})

    if close_df.empty:
        return []

    close_df = close_df.ffill()
    ma50_df  = close_df.rolling(50, min_periods=40).mean()

    sector_map  = fo_df.set_index("ticker")["sector"].to_dict()
    lot_map     = fo_df.set_index("ticker")["lot_size"].to_dict() if "lot_size" in fo_df.columns else {}

    metrics = []
    for ticker in close_df.columns:
        s = close_df[ticker].dropna()
        if s.empty:
            continue
        v    = vol_df[ticker].dropna() if ticker in vol_df.columns else pd.Series(dtype=float)

        price   = _safe_float(s.iloc[-1])
        price_y = _safe_float(s.iloc[-2]) if len(s) >= 2 else None
        price_1w = _safe_float(s.iloc[-6])  if len(s) >= 6  else None
        price_1m = _safe_float(s.iloc[-22]) if len(s) >= 22 else None

        ret_1d = round((price / price_y - 1) * 100, 2) if price and price_y else None
        ret_1w = round((price / price_1w - 1) * 100, 2) if price and price_1w else None
        ret_1m = round((price / price_1m - 1) * 100, 2) if price and price_1m else None

        ma50   = _safe_float(ma50_df[ticker].iloc[-1]) if ticker in ma50_df.columns else None
        above_50ma = bool(price > ma50) if (price and ma50) else None

        # Average daily volume (20d)
        avg_vol = None
        if not v.empty and len(v) >= 5:
            avg_vol = int(v.iloc[-min(20, len(v)):].mean())

        symbol  = ticker.replace(".NS", "")
        metrics.append({
            "ticker":    ticker,
            "symbol":    symbol,
            "sector":    sector_map.get(ticker, "Other"),
            "lot_size":  lot_map.get(ticker),
            "price":     round(price, 2) if price else None,
            "ret_1d":    ret_1d,
            "ret_1w":    ret_1w,
            "ret_1m":    ret_1m,
            "above_50ma": above_50ma,
            "ma50":      round(ma50, 2) if ma50 else None,
            "avg_volume": avg_vol,
            # OI fields — enriched later
            "oi":          None,
            "oi_change":   None,
            "pcr":         None,
            "buildup":     None,
        })

    return metrics


# ── Parse option chain ─────────────────────────────────────────────────────────

def _parse_option_chain(raw: dict, symbol: str) -> dict:
    """Parse NSE option chain API response into a clean structure."""
    records = raw.get("records", {})
    expiries = records.get("expiryDates", [])
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

    # Sort strikes within each expiry
    for exp in strikes_by_expiry:
        strikes_by_expiry[exp].sort(key=lambda x: x["strike"])

    # PCR per expiry + total
    expiry_meta = []
    total_ce_oi = 0.0
    total_pe_oi = 0.0
    for exp in expiries:
        rows = strikes_by_expiry.get(exp, [])
        ce_sum = sum(r["ce_oi"] or 0 for r in rows)
        pe_sum = sum(r["pe_oi"] or 0 for r in rows)
        pcr    = round(pe_sum / ce_sum, 4) if ce_sum else None
        total_ce_oi += ce_sum
        total_pe_oi += pe_sum
        expiry_meta.append({"expiry": exp, "ce_oi": ce_sum, "pe_oi": pe_sum, "pcr": pcr})

    overall_pcr = round(total_pe_oi / total_ce_oi, 4) if total_ce_oi else None

    # Max pain: strike where sum of (ITM call OI + ITM put OI) * notional is minimised
    max_pain = None
    if expiries and expiries[0] in strikes_by_expiry:
        rows  = strikes_by_expiry[expiries[0]]
        all_strikes = [r["strike"] for r in rows if r["strike"] is not None]
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

    return {
        "symbol":       symbol,
        "underlying":   underlying,
        "timestamp":    records.get("timestamp"),
        "expiries":     expiries,
        "expiry_meta":  expiry_meta,
        "overall_pcr":  overall_pcr,
        "max_pain":     max_pain,
        "strikes":      strikes_by_expiry,
    }


# ── Dashboard endpoint ─────────────────────────────────────────────────────────

@router.get("/dashboard")
async def get_fo_dashboard():
    key = "fo_dashboard"
    with _LOCK:
        if key in _DASHBOARD_CACHE:
            ts, val = _DASHBOARD_CACHE[key]
            if datetime.utcnow() - ts < _DASHBOARD_TTL:
                return val

    fo_df = get_fo_eligible()
    if fo_df.empty:
        return {"error": "F&O universe not available", "stocks": [], "as_of": None}

    # Price metrics via yfinance
    stocks = _compute_price_metrics(fo_df)

    # NSE OI enrichment (best-effort)
    nse_oi = {}
    try:
        nse_oi = _fetch_nse_oi_all()
    except Exception as exc:
        logger.warning("NSE OI fetch failed (non-fatal): %s", exc)

    # Merge OI into stocks
    for s in stocks:
        oi_data = nse_oi.get(s["symbol"], {})
        s["oi"]        = oi_data.get("oi")
        s["oi_change"] = oi_data.get("oi_change")
        s["pcr"]       = oi_data.get("pcr")
        s["buildup"]   = _build_up_signal(s.get("ret_1d"), s["oi_change"])

    # Sector aggregation
    sector_summary: dict[str, dict] = {}
    for s in stocks:
        sec = s["sector"] or "Other"
        if sec not in sector_summary:
            sector_summary[sec] = {"sector": sec, "count": 0, "long_buildup": 0, "short_buildup": 0,
                                   "long_unwinding": 0, "short_covering": 0, "avg_ret_1d": []}
        ss = sector_summary[sec]
        ss["count"] += 1
        if s["buildup"] == "Long Build-up":
            ss["long_buildup"] += 1
        elif s["buildup"] == "Short Build-up":
            ss["short_buildup"] += 1
        elif s["buildup"] == "Long Unwinding":
            ss["long_unwinding"] += 1
        elif s["buildup"] == "Short Covering":
            ss["short_covering"] += 1
        if s["ret_1d"] is not None:
            ss["avg_ret_1d"].append(s["ret_1d"])

    sectors = []
    for sec, ss in sorted(sector_summary.items()):
        vals = ss.pop("avg_ret_1d")
        ss["avg_ret_1d"] = round(float(np.mean(vals)), 2) if vals else None
        sectors.append(ss)

    # Signal counts
    signal_counts = {
        "long_buildup":    sum(1 for s in stocks if s["buildup"] == "Long Build-up"),
        "short_buildup":   sum(1 for s in stocks if s["buildup"] == "Short Build-up"),
        "short_covering":  sum(1 for s in stocks if s["buildup"] == "Short Covering"),
        "long_unwinding":  sum(1 for s in stocks if s["buildup"] == "Long Unwinding"),
        "total":           len(stocks),
    }

    # Sort by absolute OI (desc), then by abs ret_1d
    stocks.sort(key=lambda x: (-(x["oi"] or 0), -(abs(x["ret_1d"] or 0))))

    result = {
        "as_of":           str(datetime.utcnow().date()),
        "total_stocks":    len(stocks),
        "signal_counts":   signal_counts,
        "sectors":         sectors,
        "stocks":          stocks,
        "oi_data_available": bool(nse_oi),
    }

    with _LOCK:
        _DASHBOARD_CACHE[key] = (datetime.utcnow(), result)

    return result


@router.post("/refresh")
async def refresh_fo_dashboard():
    with _LOCK:
        _DASHBOARD_CACHE.clear()
        _CHAIN_CACHE.clear()
    return {"status": "cache cleared"}


# ── Option chain endpoint ──────────────────────────────────────────────────────

@router.get("/option-chain/{symbol}")
async def get_option_chain(symbol: str = Path(..., description="NSE stock symbol, e.g. RELIANCE")):
    sym = symbol.strip().upper()
    key = f"chain:{sym}"

    with _LOCK:
        if key in _CHAIN_CACHE:
            ts, val = _CHAIN_CACHE[key]
            if datetime.utcnow() - ts < _CHAIN_TTL:
                return val

    nse = NSEClient.get()
    raw = nse.get_option_chain_equity(sym)
    if not raw:
        raise HTTPException(status_code=503, detail=f"NSE option chain unavailable for {sym}")

    chain = _parse_option_chain(raw, sym)

    with _LOCK:
        _CHAIN_CACHE[key] = (datetime.utcnow(), chain)

    return chain


# ── OI analysis endpoint ───────────────────────────────────────────────────────

@router.get("/oi-analysis")
async def get_oi_analysis():
    key = "oi_analysis"
    with _LOCK:
        if key in _OI_CACHE:
            ts, val = _OI_CACHE[key]
            if datetime.utcnow() - ts < _OI_TTL:
                return val

    spurts: list[dict] = []
    try:
        spurts = _fetch_nse_oi_spurts()
    except Exception as exc:
        logger.warning("NSE OI spurts fetch failed: %s", exc)

    all_oi: dict[str, dict] = {}
    try:
        all_oi = _fetch_nse_oi_all()
    except Exception as exc:
        logger.warning("NSE all OI fetch failed: %s", exc)

    # Top gainers / losers by OI change
    oi_list = [
        {"symbol": sym, **data}
        for sym, data in all_oi.items()
        if data.get("oi_change") is not None
    ]
    oi_list.sort(key=lambda x: -(x["oi_change"] or 0))

    result = {
        "as_of":      str(datetime.utcnow().date()),
        "oi_spurts":  spurts[:30],
        "top_oi_gain": oi_list[:20],
        "top_oi_fall": list(reversed(oi_list))[:20],
        "total_tracked": len(all_oi),
    }

    with _LOCK:
        _OI_CACHE[key] = (datetime.utcnow(), result)

    return result


# ── F&O universe list ──────────────────────────────────────────────────────────

@router.get("/universe")
async def get_fo_universe():
    df = get_fo_eligible()
    if df.empty:
        return []
    return df.to_dict(orient="records")
