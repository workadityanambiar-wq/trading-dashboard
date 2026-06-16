"""GET /api/country-macro — Hedge-fund style country macro dashboard."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx
import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)
router = APIRouter()

# ── In-memory cache (6-hour TTL) ─────────────────────────────────────────────
_CACHE: Dict[str, Tuple[float, Any]] = {}
_CACHE_TTL = 6 * 3600


def _cache_get(key: str) -> Optional[Any]:
    if key in _CACHE:
        ts, data = _CACHE[key]
        if time.time() - ts < _CACHE_TTL:
            return data
    return None


def _cache_set(key: str, data: Any) -> None:
    _CACHE[key] = (time.time(), data)


# ── Country metadata ──────────────────────────────────────────────────────────
COUNTRIES: Dict[str, Dict] = {
    "US": {"name": "United States", "currency": "USD", "flag": "🇺🇸", "region": "Americas"},
    "CN": {"name": "China",         "currency": "CNY", "flag": "🇨🇳", "region": "Asia-Pacific"},
    "JP": {"name": "Japan",         "currency": "JPY", "flag": "🇯🇵", "region": "Asia-Pacific"},
    "DE": {"name": "Germany",       "currency": "EUR", "flag": "🇩🇪", "region": "Europe"},
    "IN": {"name": "India",         "currency": "INR", "flag": "🇮🇳", "region": "Asia-Pacific"},
    "GB": {"name": "United Kingdom","currency": "GBP", "flag": "🇬🇧", "region": "Europe"},
    "FR": {"name": "France",        "currency": "EUR", "flag": "🇫🇷", "region": "Europe"},
    "IT": {"name": "Italy",         "currency": "EUR", "flag": "🇮🇹", "region": "Europe"},
    "CA": {"name": "Canada",        "currency": "CAD", "flag": "🇨🇦", "region": "Americas"},
    "KR": {"name": "South Korea",   "currency": "KRW", "flag": "🇰🇷", "region": "Asia-Pacific"},
    "BR": {"name": "Brazil",        "currency": "BRL", "flag": "🇧🇷", "region": "Americas"},
    "AU": {"name": "Australia",     "currency": "AUD", "flag": "🇦🇺", "region": "Asia-Pacific"},
    "MX": {"name": "Mexico",        "currency": "MXN", "flag": "🇲🇽", "region": "Americas"},
    "ES": {"name": "Spain",         "currency": "EUR", "flag": "🇪🇸", "region": "Europe"},
    "ID": {"name": "Indonesia",     "currency": "IDR", "flag": "🇮🇩", "region": "Asia-Pacific"},
    "NL": {"name": "Netherlands",   "currency": "EUR", "flag": "🇳🇱", "region": "Europe"},
    "SA": {"name": "Saudi Arabia",  "currency": "SAR", "flag": "🇸🇦", "region": "Middle East"},
    "TR": {"name": "Turkey",        "currency": "TRY", "flag": "🇹🇷", "region": "Europe"},
    "CH": {"name": "Switzerland",   "currency": "CHF", "flag": "🇨🇭", "region": "Europe"},
    "SE": {"name": "Sweden",        "currency": "SEK", "flag": "🇸🇪", "region": "Europe"},
    "NO": {"name": "Norway",        "currency": "NOK", "flag": "🇳🇴", "region": "Europe"},
    "AR": {"name": "Argentina",     "currency": "ARS", "flag": "🇦🇷", "region": "Americas"},
    "PL": {"name": "Poland",        "currency": "PLN", "flag": "🇵🇱", "region": "Europe"},
    "TH": {"name": "Thailand",      "currency": "THB", "flag": "🇹🇭", "region": "Asia-Pacific"},
    "ZA": {"name": "South Africa",  "currency": "ZAR", "flag": "🇿🇦", "region": "Africa"},
    "SG": {"name": "Singapore",     "currency": "SGD", "flag": "🇸🇬", "region": "Asia-Pacific"},
    "HK": {"name": "Hong Kong",     "currency": "HKD", "flag": "🇭🇰", "region": "Asia-Pacific"},
    "DK": {"name": "Denmark",       "currency": "DKK", "flag": "🇩🇰", "region": "Europe"},
    "MY": {"name": "Malaysia",      "currency": "MYR", "flag": "🇲🇾", "region": "Asia-Pacific"},
    "PH": {"name": "Philippines",   "currency": "PHP", "flag": "🇵🇭", "region": "Asia-Pacific"},
    "EG": {"name": "Egypt",         "currency": "EGP", "flag": "🇪🇬", "region": "Africa"},
    "CL": {"name": "Chile",         "currency": "CLP", "flag": "🇨🇱", "region": "Americas"},
    "CO": {"name": "Colombia",      "currency": "COP", "flag": "🇨🇴", "region": "Americas"},
    "VN": {"name": "Vietnam",       "currency": "VND", "flag": "🇻🇳", "region": "Asia-Pacific"},
    "NZ": {"name": "New Zealand",   "currency": "NZD", "flag": "🇳🇿", "region": "Asia-Pacific"},
    "GR": {"name": "Greece",        "currency": "EUR", "flag": "🇬🇷", "region": "Europe"},
    "CZ": {"name": "Czech Republic","currency": "CZK", "flag": "🇨🇿", "region": "Europe"},
    "HU": {"name": "Hungary",       "currency": "HUF", "flag": "🇭🇺", "region": "Europe"},
    "PT": {"name": "Portugal",      "currency": "EUR", "flag": "🇵🇹", "region": "Europe"},
    "PE": {"name": "Peru",          "currency": "PEN", "flag": "🇵🇪", "region": "Americas"},
    "RU": {"name": "Russia",        "currency": "RUB", "flag": "🇷🇺", "region": "Europe"},
    "NG": {"name": "Nigeria",       "currency": "NGN", "flag": "🇳🇬", "region": "Africa"},
    "AE": {"name": "UAE",           "currency": "AED", "flag": "🇦🇪", "region": "Middle East"},
    "IL": {"name": "Israel",        "currency": "ILS", "flag": "🇮🇱", "region": "Middle East"},
    "FI": {"name": "Finland",       "currency": "EUR", "flag": "🇫🇮", "region": "Europe"},
    "BE": {"name": "Belgium",       "currency": "EUR", "flag": "🇧🇪", "region": "Europe"},
    "PK": {"name": "Pakistan",      "currency": "PKR", "flag": "🇵🇰", "region": "Asia-Pacific"},
}

CREDIT_RATINGS: Dict[str, Dict] = {
    "US": {"moodys": "Aaa",  "sp": "AA+",  "fitch": "AAA",  "ig": True,  "score": 95},
    "DE": {"moodys": "Aaa",  "sp": "AAA",  "fitch": "AAA",  "ig": True,  "score": 100},
    "CA": {"moodys": "Aaa",  "sp": "AAA",  "fitch": "AA+",  "ig": True,  "score": 98},
    "AU": {"moodys": "Aaa",  "sp": "AAA",  "fitch": "AAA",  "ig": True,  "score": 100},
    "CH": {"moodys": "Aaa",  "sp": "AAA",  "fitch": "AAA",  "ig": True,  "score": 100},
    "NO": {"moodys": "Aaa",  "sp": "AAA",  "fitch": "AAA",  "ig": True,  "score": 100},
    "SE": {"moodys": "Aaa",  "sp": "AAA",  "fitch": "AAA",  "ig": True,  "score": 100},
    "DK": {"moodys": "Aaa",  "sp": "AAA",  "fitch": "AAA",  "ig": True,  "score": 100},
    "NZ": {"moodys": "Aaa",  "sp": "AA+",  "fitch": "AA",   "ig": True,  "score": 96},
    "SG": {"moodys": "Aaa",  "sp": "AAA",  "fitch": "AAA",  "ig": True,  "score": 100},
    "GB": {"moodys": "Aa3",  "sp": "AA",   "fitch": "AA-",  "ig": True,  "score": 85},
    "FR": {"moodys": "Aa2",  "sp": "AA-",  "fitch": "AA-",  "ig": True,  "score": 88},
    "AE": {"moodys": "Aa2",  "sp": "AA",   "fitch": "AA",   "ig": True,  "score": 87},
    "KR": {"moodys": "Aa2",  "sp": "AA",   "fitch": "AA-",  "ig": True,  "score": 87},
    "JP": {"moodys": "A1",   "sp": "A+",   "fitch": "A",    "ig": True,  "score": 70},
    "CN": {"moodys": "A1",   "sp": "A+",   "fitch": "A+",   "ig": True,  "score": 70},
    "SA": {"moodys": "A1",   "sp": "A",    "fitch": "A+",   "ig": True,  "score": 72},
    "CZ": {"moodys": "Aa3",  "sp": "AA-",  "fitch": "AA-",  "ig": True,  "score": 85},
    "MY": {"moodys": "A3",   "sp": "A-",   "fitch": "A-",   "ig": True,  "score": 65},
    "PL": {"moodys": "A2",   "sp": "A-",   "fitch": "A-",   "ig": True,  "score": 68},
    "IL": {"moodys": "A2",   "sp": "A+",   "fitch": "A",    "ig": True,  "score": 70},
    "CL": {"moodys": "A2",   "sp": "A",    "fitch": "A-",   "ig": True,  "score": 72},
    "HK": {"moodys": "Aa3",  "sp": "AA+",  "fitch": "AA-",  "ig": True,  "score": 85},
    "ES": {"moodys": "Baa1", "sp": "A",    "fitch": "A-",   "ig": True,  "score": 58},
    "MX": {"moodys": "Baa2", "sp": "BBB",  "fitch": "BBB-", "ig": True,  "score": 53},
    "ID": {"moodys": "Baa2", "sp": "BBB",  "fitch": "BBB",  "ig": True,  "score": 53},
    "PH": {"moodys": "Baa2", "sp": "BBB",  "fitch": "BBB",  "ig": True,  "score": 53},
    "IN": {"moodys": "Baa3", "sp": "BBB-", "fitch": "BBB-", "ig": True,  "score": 50},
    "IT": {"moodys": "Baa3", "sp": "BBB",  "fitch": "BBB",  "ig": True,  "score": 50},
    "PE": {"moodys": "Baa1", "sp": "BBB",  "fitch": "BBB",  "ig": True,  "score": 55},
    "TH": {"moodys": "Baa1", "sp": "BBB+", "fitch": "BBB+", "ig": True,  "score": 57},
    "HU": {"moodys": "Baa2", "sp": "BBB",  "fitch": "BBB-", "ig": True,  "score": 52},
    "GR": {"moodys": "Ba1",  "sp": "BBB-", "fitch": "BBB-", "ig": True,  "score": 48},
    "RO": {"moodys": "Baa3", "sp": "BBB-", "fitch": "BBB-", "ig": True,  "score": 50},
    "PT": {"moodys": "Baa2", "sp": "A-",   "fitch": "A-",   "ig": True,  "score": 60},
    "FI": {"moodys": "Aa1",  "sp": "AA+",  "fitch": "AA+",  "ig": True,  "score": 93},
    "BE": {"moodys": "Aa3",  "sp": "AA",   "fitch": "AA-",  "ig": True,  "score": 85},
    "BR": {"moodys": "Ba1",  "sp": "BB",   "fitch": "BB",   "ig": False, "score": 32},
    "ZA": {"moodys": "Ba2",  "sp": "BB-",  "fitch": "BB-",  "ig": False, "score": 28},
    "CO": {"moodys": "Baa2", "sp": "BB+",  "fitch": "BB+",  "ig": False, "score": 38},
    "VN": {"moodys": "Ba2",  "sp": "BB",   "fitch": "BB",   "ig": False, "score": 32},
    "TR": {"moodys": "B3",   "sp": "B",    "fitch": "B+",   "ig": False, "score": 22},
    "NG": {"moodys": "Caa1", "sp": "B-",   "fitch": "B-",   "ig": False, "score": 15},
    "EG": {"moodys": "Caa1", "sp": "B-",   "fitch": "B-",   "ig": False, "score": 18},
    "AR": {"moodys": "Ca",   "sp": "CCC",  "fitch": "CC",   "ig": False, "score": 3},
    "RU": {"moodys": "Ca",   "sp": "CC",   "fitch": "CC",   "ig": False, "score": 5},
    "PK": {"moodys": "Caa3", "sp": "CCC+", "fitch": "CCC-", "ig": False, "score": 8},
}
_DEFAULT_RATING = {"moodys": "N/A", "sp": "N/A", "fitch": "N/A", "ig": False, "score": 40}

COUNTRY_ETF: Dict[str, str] = {
    "US": "SPY",  "CN": "MCHI", "JP": "EWJ",  "DE": "EWG",  "IN": "INDA",
    "GB": "EWU",  "FR": "EWQ",  "IT": "EWI",  "CA": "EWC",  "KR": "EWY",
    "BR": "EWZ",  "AU": "EWA",  "MX": "EWW",  "ES": "EWP",  "ID": "EIDO",
    "NL": "EWN",  "SA": "KSA",  "TR": "TUR",  "CH": "EWL",  "SE": "EWD",
    "AR": "ARGT", "PL": "EPOL", "TH": "THD",  "NO": "NORW", "NG": "NGE",
    "ZA": "EZA",  "SG": "EWS",  "HK": "EWH",  "DK": "EDEN", "MY": "EWM",
    "PH": "EPHE", "EG": "EGPT", "CL": "ECH",  "CO": "GXG",  "FI": "EFNL",
    "NZ": "ENZL", "VN": "VNM",  "PE": "EPU",  "AE": "UAE",  "GR": "GREK",
    "BE": "EWK",  "IL": "EIS",
}

FX_TICKERS: Dict[str, str] = {
    "EUR": "EURUSD=X", "JPY": "JPY=X",    "GBP": "GBPUSD=X", "CAD": "CAD=X",
    "AUD": "AUDUSD=X", "CHF": "CHF=X",    "CNY": "CNY=X",    "KRW": "KRW=X",
    "INR": "INR=X",    "BRL": "BRL=X",    "MXN": "MXN=X",    "RUB": "RUB=X",
    "TRY": "TRY=X",    "ZAR": "ZAR=X",    "SGD": "SGD=X",    "HKD": "HKD=X",
    "NOK": "NOK=X",    "SEK": "SEK=X",    "DKK": "DKK=X",    "NZD": "NZDUSD=X",
    "PLN": "PLN=X",    "SAR": "SAR=X",    "AED": "AED=X",    "THB": "THB=X",
    "IDR": "IDR=X",    "MYR": "MYR=X",    "PHP": "PHP=X",    "CLP": "CLP=X",
    "COP": "COP=X",    "PEN": "PEN=X",    "NGN": "NGN=X",    "EGP": "EGP=X",
    "ILS": "ILS=X",    "CZK": "CZK=X",    "HUF": "HUF=X",    "RON": "RON=X",
    "PKR": "PKR=X",    "VND": "VND=X",    "ARS": "ARS=X",
}

# Approximate central bank policy rates (updated periodically)
POLICY_RATES: Dict[str, float] = {
    "US": 4.50, "CN": 3.10, "JP": 0.50, "DE": 2.65, "IN": 6.25,
    "GB": 4.25, "FR": 2.65, "IT": 2.65, "CA": 2.75, "KR": 2.75,
    "BR": 13.25, "AU": 4.10, "MX": 9.00, "ES": 2.65, "TR": 46.0,
    "CH": 0.25,  "SA": 5.50, "SE": 2.25, "NO": 4.25, "NZ": 3.50,
    "PL": 5.75,  "SG": 3.68, "ZA": 7.50, "ID": 5.75, "TH": 1.75,
    "MY": 3.00,  "PH": 5.50, "CL": 5.00, "CO": 9.25, "EG": 27.25,
    "HK": 4.75,  "DK": 2.60, "CZ": 3.75, "RO": 6.50, "HU": 6.50,
    "NG": 27.50, "VN": 4.50, "PE": 4.75, "AE": 4.65, "IL": 4.50,
    "BE": 2.65,  "GR": 2.65, "HU": 6.50, "PT": 2.65, "FI": 2.65,
    "AR": 35.0,  "RU": 21.0, "PK": 12.0, "NL": 2.65,
}

COMMODITY_EXPOSURE: Dict[str, Dict] = {
    "SA": {"oil": 85, "gas": 8,  "metals": 3,  "agriculture": 3,  "mining": 1},
    "RU": {"oil": 35, "gas": 30, "metals": 15, "agriculture": 12, "mining": 8},
    "NO": {"oil": 55, "gas": 30, "metals": 5,  "agriculture": 5,  "mining": 5},
    "AU": {"oil": 5,  "gas": 20, "metals": 12, "agriculture": 20, "mining": 43},
    "CA": {"oil": 30, "gas": 20, "metals": 10, "agriculture": 18, "mining": 22},
    "BR": {"oil": 18, "gas": 5,  "metals": 12, "agriculture": 45, "mining": 20},
    "CL": {"oil": 2,  "gas": 3,  "metals": 65, "agriculture": 15, "mining": 15},
    "ZA": {"oil": 0,  "gas": 3,  "metals": 22, "agriculture": 10, "mining": 65},
    "NG": {"oil": 85, "gas": 10, "metals": 2,  "agriculture": 2,  "mining": 1},
    "PE": {"oil": 8,  "gas": 8,  "metals": 35, "agriculture": 22, "mining": 27},
    "AE": {"oil": 75, "gas": 20, "metals": 2,  "agriculture": 1,  "mining": 2},
    "MY": {"oil": 20, "gas": 15, "metals": 5,  "agriculture": 45, "mining": 15},
    "VN": {"oil": 10, "gas": 5,  "metals": 5,  "agriculture": 70, "mining": 10},
    "ID": {"oil": 15, "gas": 10, "metals": 10, "agriculture": 45, "mining": 20},
    "CO": {"oil": 40, "gas": 15, "metals": 10, "agriculture": 20, "mining": 15},
    "EG": {"oil": 35, "gas": 30, "metals": 5,  "agriculture": 20, "mining": 10},
}
_DEFAULT_COMMODITY = {"oil": 5, "gas": 5, "metals": 5, "agriculture": 10, "mining": 5}

WB_INDICATORS: Dict[str, str] = {
    "gdp":                "NY.GDP.MKTP.CD",
    "gdp_growth":         "NY.GDP.MKTP.KD.ZG",
    "gdp_per_capita":     "NY.GDP.PCAP.CD",
    "population":         "SP.POP.TOTL",
    "cpi":                "FP.CPI.TOTL.ZG",
    "unemployment":       "SL.UEM.TOTL.ZS",
    "debt_gdp":           "GC.DOD.TOTL.GD.ZS",
    "current_account":    "BN.CAB.XOKA.GD.ZS",
    "fx_reserves":        "FI.RES.TOTL.CD",
    "industrial_prod":    "NV.IND.TOTL.KD.ZG",
    "labor_participation":"SL.TLF.ACTI.ZS",
    "exports_growth":     "NE.EXP.GNFS.KD.ZG",
    "imports_growth":     "NE.IMP.GNFS.KD.ZG",
    "political_stability":"PV.EST",
    "market_cap_gdp":     "CM.MKT.LCAP.GD.ZS",
    "gross_savings":      "NY.GNS.ICTR.ZS",
    "ext_debt_gni":       "DT.DOD.DECT.GN.ZS",
    "trade_gdp":          "NE.TRD.GNFS.ZS",
}


# ── Data fetching ──────────────────────────────────────────────────────────────

async def _fetch_wb(client: httpx.AsyncClient, country: str, indicator: str) -> List[Tuple[str, float]]:
    url = f"https://api.worldbank.org/v2/country/{country}/indicator/{indicator}"
    params = {"format": "json", "mrv": 15, "per_page": 15}
    try:
        r = await client.get(url, params=params, timeout=15.0)
        body = r.json()
        if not isinstance(body, list) or len(body) < 2 or not isinstance(body[1], list):
            return []
        return [
            (item["date"], float(item["value"]))
            for item in body[1]
            if item.get("value") is not None
        ]
    except Exception as e:
        logger.debug(f"WB fetch {indicator}/{country}: {e}")
        return []


async def _fetch_all_wb(country: str) -> Dict[str, List[Tuple[str, float]]]:
    async with httpx.AsyncClient() as client:
        tasks = {
            name: _fetch_wb(client, country, ind)
            for name, ind in WB_INDICATORS.items()
        }
        results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    return {
        name: ([] if isinstance(r, Exception) else r)
        for name, r in zip(tasks.keys(), results)
    }


def _latest(series: List[Tuple[str, float]]) -> Optional[float]:
    return series[0][1] if series else None


def _prev(series: List[Tuple[str, float]]) -> Optional[float]:
    return series[1][1] if len(series) > 1 else None


def _to_history(series: List[Tuple[str, float]], key: str = "year") -> List[Dict]:
    return [{key: d, "value": round(v, 2)} for d, v in reversed(series)]


def _fetch_market(code: str) -> Dict:
    """Sync: call in executor."""
    result: Dict[str, Any] = {}
    meta = COUNTRIES.get(code, {})
    currency = meta.get("currency", "USD")

    etf = COUNTRY_ETF.get(code)
    if etf:
        try:
            hist = yf.Ticker(etf).history(period="5y", interval="1mo")
            if not hist.empty:
                prices = hist["Close"].dropna()
                result["equity_ticker"] = etf
                result["equity_price"] = round(float(prices.iloc[-1]), 2)
                result["equity_history"] = [
                    {"date": str(d.date()), "value": round(float(v), 2)}
                    for d, v in prices.items()
                ]
                n = len(prices)
                if n >= 2:
                    result["equity_change_1m"] = round((prices.iloc[-1] / prices.iloc[-2] - 1) * 100, 2)
                if n >= 4:
                    result["equity_change_3m"] = round((prices.iloc[-1] / prices.iloc[-4] - 1) * 100, 2)
                if n >= 13:
                    result["equity_change_1y"] = round((prices.iloc[-1] / prices.iloc[-13] - 1) * 100, 2)
                if n >= 37:
                    result["equity_change_3y"] = round((prices.iloc[-1] / prices.iloc[-37] - 1) * 100, 2)
                if n >= 61:
                    result["equity_change_5y"] = round((prices.iloc[-1] / prices.iloc[-61] - 1) * 100, 2)
        except Exception as e:
            logger.debug(f"ETF {etf}: {e}")

    if currency != "USD":
        fx_tick = FX_TICKERS.get(currency)
        if fx_tick:
            try:
                hist = yf.Ticker(fx_tick).history(period="5y", interval="1mo")
                if not hist.empty:
                    prices = hist["Close"].dropna()
                    result["fx_ticker"] = fx_tick
                    result["fx_rate"] = round(float(prices.iloc[-1]), 4)
                    result["fx_history"] = [
                        {"date": str(d.date()), "value": round(float(v), 4)}
                        for d, v in prices.items()
                    ]
                    n = len(prices)
                    if n >= 2:
                        result["fx_change_1m"] = round((prices.iloc[-1] / prices.iloc[-2] - 1) * 100, 2)
                    if n >= 13:
                        result["fx_change_1y"] = round((prices.iloc[-1] / prices.iloc[-13] - 1) * 100, 2)
                    if n >= 61:
                        result["fx_change_5y"] = round((prices.iloc[-1] / prices.iloc[-61] - 1) * 100, 2)
            except Exception as e:
                logger.debug(f"FX {fx_tick}: {e}")

    return result


# ── Scoring ───────────────────────────────────────────────────────────────────

def _clamp(v: float) -> int:
    return max(0, min(100, round(v)))


def _score_growth(gdp: Optional[float], ind: Optional[float], exp: Optional[float],
                  unemp: Optional[float], unemp_prev: Optional[float]) -> int:
    s = 45.0
    if gdp is not None:
        if gdp > 6:    s += 30
        elif gdp > 4:  s += 22
        elif gdp > 2:  s += 14
        elif gdp > 0:  s += 5
        elif gdp > -2: s -= 10
        else:          s -= 25
    if ind is not None:
        s += min(10, max(-10, ind * 1.5))
    if exp is not None and exp > 0:
        s += 5
    if unemp is not None and unemp_prev is not None and unemp < unemp_prev:
        s += 8
    return _clamp(s)


def _score_inflation(cpi: Optional[float]) -> int:
    if cpi is None:
        return 50
    dist = abs(cpi - 2.0)
    if dist < 0.5:    return 95
    elif dist < 1.5:  return 82
    elif dist < 3.0:  return 65
    elif dist < 5.0:  return 48
    elif dist < 8.0:  return 30
    elif dist < 15.0: return 18
    else:             return 8


def _score_fiscal(debt: Optional[float], savings: Optional[float]) -> int:
    s = 65.0
    if debt is not None:
        if debt < 30:    s += 25
        elif debt < 60:  s += 10
        elif debt < 90:  pass
        elif debt < 120: s -= 20
        elif debt < 150: s -= 35
        else:            s -= 45
    if savings is not None:
        s += min(10, max(-10, (savings - 20) * 0.8))
    return _clamp(s)


def _score_external(ca: Optional[float], reserves_months: Optional[float],
                    ext_debt: Optional[float]) -> int:
    s = 50.0
    if ca is not None:
        if ca > 5:    s += 25
        elif ca > 2:  s += 15
        elif ca > 0:  s += 5
        elif ca > -3: s -= 5
        elif ca > -6: s -= 18
        else:         s -= 30
    if reserves_months is not None:
        if reserves_months > 9:  s += 15
        elif reserves_months > 6: s += 8
        elif reserves_months > 3: s += 0
        else:                    s -= 15
    if ext_debt is not None:
        if ext_debt < 50:   s += 10
        elif ext_debt < 80: pass
        elif ext_debt > 120: s -= 15
    return _clamp(s)


def _score_monetary(policy: Optional[float], cpi: Optional[float]) -> int:
    if policy is None:
        return 50
    real = policy - (cpi or 2.0)
    if real > 3:    return 65
    elif real > 1:  return 60
    elif real > 0:  return 55
    elif real > -1: return 48
    elif real > -3: return 38
    else:           return 25


def _score_political(stability: Optional[float]) -> int:
    if stability is None:
        return 50
    return _clamp((stability + 2.5) / 5.0 * 100)


def _inv_label(score: int) -> str:
    if score >= 78: return "Strong Buy"
    elif score >= 63: return "Buy"
    elif score >= 43: return "Neutral"
    elif score >= 28: return "Underweight"
    else: return "Avoid"


def _inv_label_color(label: str) -> str:
    return {
        "Strong Buy": "emerald", "Buy": "green",
        "Neutral": "yellow", "Underweight": "orange", "Avoid": "red",
    }.get(label, "gray")


# ── Regime & recommendations ──────────────────────────────────────────────────

def _classify_regime(gdp: Optional[float], cpi: Optional[float]) -> Dict:
    if gdp is None or cpi is None:
        return {"label": "Unknown", "growth_dir": "→", "inflation_dir": "→",
                "color": "gray", "description": "Insufficient data for regime classification."}
    g_up = gdp > 2.5
    i_up = cpi > 3.0
    if g_up and not i_up:
        return {"label": "Goldilocks", "growth_dir": "↑", "inflation_dir": "↓",
                "color": "emerald", "description": "Strong growth with contained inflation — ideal macro backdrop for risk assets."}
    elif g_up and i_up:
        return {"label": "Overheating", "growth_dir": "↑", "inflation_dir": "↑",
                "color": "amber", "description": "Growth running hot with rising inflation — central bank likely tightening."}
    elif not g_up and i_up:
        return {"label": "Stagflation", "growth_dir": "↓", "inflation_dir": "↑",
                "color": "red", "description": "Weak growth with elevated inflation — worst macro environment for most assets."}
    else:
        return {"label": "Recession", "growth_dir": "↓", "inflation_dir": "↓",
                "color": "orange", "description": "Contracting growth with falling inflation — expect monetary easing cycle."}


def _investment_scores(g: int, infl: int, fiscal: int, ext: int, mon: int, pol: int,
                        eq_1y: Optional[float], fx_1y: Optional[float]) -> Dict:
    eq_mom = min(20, max(-20, (eq_1y or 0) * 0.15))
    eq_s = _clamp(0.35 * g + 0.20 * (100 - infl) + 0.15 * fiscal + 0.15 * pol + 0.15 * 50 + eq_mom)
    bond_s = _clamp(0.35 * infl + 0.30 * fiscal + 0.20 * mon + 0.15 * pol)
    fx_mom = min(10, max(-10, (fx_1y or 0) * 0.15))
    fx_s = _clamp(0.30 * ext + 0.25 * g + 0.20 * mon + 0.15 * pol + 0.10 * 50 + fx_mom)
    re_s = _clamp(0.35 * (100 - mon) + 0.30 * g + 0.20 * (100 - infl) + 0.15 * fiscal)
    commodity = COMMODITY_EXPOSURE.get("", {})
    com_s = _clamp(0.40 * g + 0.30 * ext + 0.30 * 50)

    def entry(s: int) -> Dict:
        lab = _inv_label(s)
        return {"score": s, "label": lab, "color": _inv_label_color(lab)}

    return {
        "equities":    entry(eq_s),
        "bonds":       entry(bond_s),
        "currency":    entry(fx_s),
        "real_estate": entry(re_s),
        "commodities": entry(com_s),
    }


# ── AI insights (rule-based) ──────────────────────────────────────────────────

def _insights(name: str, gdp: Optional[float], cpi: Optional[float],
              unemp: Optional[float], debt: Optional[float], ca: Optional[float],
              policy: Optional[float], political: Optional[float],
              eq_1y: Optional[float], fx_1y: Optional[float], regime: str) -> List[Dict]:
    ins = []

    def add(type_: str, cat: str, text: str):
        ins.append({"type": type_, "category": cat, "text": text})

    # Regime
    if regime == "Goldilocks":
        add("positive", "Regime", f"{name} is in a Goldilocks environment: GDP growing at {gdp:.1f}% with inflation at {cpi:.1f}% — ideal for risk assets.")
    elif regime == "Overheating":
        add("warning", "Regime", f"Economy is overheating: {gdp:.1f}% growth but inflation at {cpi:.1f}% — expect central bank to remain restrictive.")
    elif regime == "Stagflation":
        add("negative", "Regime", f"Stagflation risk: growth slowing to {gdp:.1f}% while inflation runs at {cpi:.1f}% — challenging for both bonds and equities.")
    elif regime == "Recession":
        add("negative", "Regime", f"Recession environment: GDP contracting at {gdp:.1f}% with disinflation at {cpi:.1f}% — monetary easing likely.")

    # Inflation
    if cpi is not None:
        if cpi > 15:
            add("negative", "Inflation", f"Severe inflation crisis at {cpi:.1f}% — currency depreciation and financial instability risk elevated.")
        elif cpi > 7:
            add("warning", "Inflation", f"Elevated inflation at {cpi:.1f}% well above target — real incomes under pressure, policy rates likely restrictive.")
        elif 1.5 <= cpi <= 3.0:
            add("positive", "Inflation", f"Inflation near target at {cpi:.1f}% — price stability supports consumer spending and investment confidence.")
        elif cpi < 0:
            add("warning", "Inflation", f"Deflationary pressure at {cpi:.1f}% — risk of debt deflation spiral; central bank may ease aggressively.")

    # Fiscal
    if debt is not None:
        if debt > 120:
            add("negative", "Fiscal", f"Debt-to-GDP at {debt:.0f}% — sovereign risk elevated; limited fiscal space for stimulus if recession materialises.")
        elif debt > 80:
            add("warning", "Fiscal", f"Government debt at {debt:.0f}% of GDP — manageable but constrains fiscal flexibility.")
        elif debt < 35:
            add("positive", "Fiscal", f"Fiscal position is strong: debt at {debt:.0f}% of GDP provides substantial buffer for countercyclical policy.")

    # Current account
    if ca is not None:
        if ca > 4:
            add("positive", "External", f"Current account surplus of {ca:.1f}% of GDP signals strong external competitiveness and FX support.")
        elif ca < -5:
            add("negative", "External", f"Current account deficit of {ca:.1f}% of GDP increases reliance on foreign capital — currency vulnerability elevated.")

    # Monetary
    if policy is not None and cpi is not None:
        real = policy - cpi
        if real > 4:
            add("warning", "Monetary", f"Real interest rate at {real:.1f}% is highly restrictive — risk of overtightening; watch for rate cuts ahead.")
        elif real < -3:
            add("negative", "Monetary", f"Deeply negative real rate ({real:.1f}%) is behind the curve — inflation risk unaddressed, currency under pressure.")
        elif -0.5 <= real <= 1.5:
            add("positive", "Monetary", f"Real interest rate near neutral at {real:.1f}% — monetary policy roughly balanced.")

    # Unemployment
    if unemp is not None:
        if unemp > 15:
            add("negative", "Labor", f"Unemployment at {unemp:.1f}% is critically elevated — significant demand destruction and social risk.")
        elif unemp < 4:
            add("positive", "Labor", f"Labor market tight at {unemp:.1f}% unemployment — consumer spending resilient.")

    # Equity momentum
    if eq_1y is not None:
        if eq_1y > 25:
            add("positive", "Equity", f"Equity market up {eq_1y:.1f}% over 12 months — strong momentum; watch for valuation stretch.")
        elif eq_1y < -20:
            add("negative", "Equity", f"Equity market down {eq_1y:.1f}% year-on-year — potential value emerging for contrarian investors.")

    # FX
    if fx_1y is not None:
        if fx_1y < -15:
            add("negative", "Currency", f"Currency has depreciated {abs(fx_1y):.1f}% vs USD over 12 months — imported inflation risk and capital outflow pressure.")
        elif fx_1y > 10:
            add("warning", "Currency", f"Currency up {fx_1y:.1f}% vs USD — may compress export competitiveness.")

    return ins[:8]  # cap at 8 insights


# ── Forecasting (linear trend) ────────────────────────────────────────────────

def _forecast(series: List[Tuple[str, float]], steps: int = 3) -> Optional[float]:
    if len(series) < 3:
        return None
    try:
        ys = [v for _, v in reversed(series)]
        xs = list(range(len(ys)))
        coeffs = np.polyfit(xs, ys, 1)
        return round(float(np.polyval(coeffs, len(ys) - 1 + steps)), 2)
    except Exception:
        return None


def _recession_prob(gdp: Optional[float], cpi: Optional[float],
                    unemp: Optional[float], unemp_prev: Optional[float]) -> Optional[float]:
    if gdp is None:
        return None
    score = 0.0
    if gdp < 0: score += 40
    elif gdp < 1: score += 20
    elif gdp < 2: score += 8
    if unemp is not None and unemp_prev is not None and unemp > unemp_prev:
        score += min(20, (unemp - unemp_prev) * 10)
    if cpi is not None and cpi > 6:
        score += 10  # stagflation risk
    return round(min(95, max(5, score)), 1)


# ── Main endpoint ─────────────────────────────────────────────────────────────

@router.get("/countries")
async def list_countries():
    return [
        {"code": code, "name": meta["name"], "flag": meta["flag"], "region": meta["region"],
         "currency": meta["currency"]}
        for code, meta in sorted(COUNTRIES.items(), key=lambda x: x[1]["name"])
    ]


@router.get("/{country_code}")
async def get_country_macro(country_code: str):
    code = country_code.upper()
    if code not in COUNTRIES:
        raise HTTPException(404, f"Country code '{code}' not supported. Use GET /countries for valid codes.")

    cached = _cache_get(f"macro:{code}")
    if cached:
        return cached

    meta = COUNTRIES[code]
    rating = CREDIT_RATINGS.get(code, _DEFAULT_RATING)
    policy_rate = POLICY_RATES.get(code)
    commodity = COMMODITY_EXPOSURE.get(code, _DEFAULT_COMMODITY)
    loop = asyncio.get_event_loop()

    wb_data, market = await asyncio.gather(
        _fetch_all_wb(code),
        loop.run_in_executor(None, _fetch_market, code),
    )

    # Extract latest values
    gdp_series       = wb_data.get("gdp", [])
    gdp_g_series     = wb_data.get("gdp_growth", [])
    cpi_series       = wb_data.get("cpi", [])
    unemp_series     = wb_data.get("unemployment", [])
    debt_series      = wb_data.get("debt_gdp", [])
    ca_series        = wb_data.get("current_account", [])
    res_series       = wb_data.get("fx_reserves", [])
    ind_series       = wb_data.get("industrial_prod", [])
    lab_series       = wb_data.get("labor_participation", [])
    exp_series       = wb_data.get("exports_growth", [])
    imp_series       = wb_data.get("imports_growth", [])
    pol_series       = wb_data.get("political_stability", [])
    mktcap_series    = wb_data.get("market_cap_gdp", [])
    savings_series   = wb_data.get("gross_savings", [])
    extd_series      = wb_data.get("ext_debt_gni", [])
    trade_series     = wb_data.get("trade_gdp", [])
    gdppc_series     = wb_data.get("gdp_per_capita", [])
    pop_series       = wb_data.get("population", [])

    gdp_val      = _latest(gdp_series)
    gdp_g_val    = _latest(gdp_g_series)
    gdp_g_prev   = _prev(gdp_g_series)
    cpi_val      = _latest(cpi_series)
    unemp_val    = _latest(unemp_series)
    unemp_prev   = _prev(unemp_series)
    debt_val     = _latest(debt_series)
    ca_val       = _latest(ca_series)
    reserves_val = _latest(res_series)
    ind_val      = _latest(ind_series)
    lab_val      = _latest(lab_series)
    exp_val      = _latest(exp_series)
    pol_val      = _latest(pol_series)
    mktcap_val   = _latest(mktcap_series)
    savings_val  = _latest(savings_series)
    extd_val     = _latest(extd_series)
    trade_val    = _latest(trade_series)
    gdppc_val    = _latest(gdppc_series)
    pop_val      = _latest(pop_series)

    # Compute reserves in months of imports (rough)
    imports_gdp  = _latest(imp_series)
    res_months: Optional[float] = None
    if reserves_val is not None and gdp_val is not None and imports_gdp is not None and imports_gdp > 0:
        annual_imports = gdp_val * (imports_gdp / 100)
        res_months = round(reserves_val / annual_imports * 12, 1)

    real_rate = round(policy_rate - cpi_val, 2) if policy_rate is not None and cpi_val is not None else None

    # Scores
    g_score   = _score_growth(gdp_g_val, ind_val, exp_val, unemp_val, unemp_prev)
    i_score   = _score_inflation(cpi_val)
    f_score   = _score_fiscal(debt_val, savings_val)
    e_score   = _score_external(ca_val, res_months, extd_val)
    m_score   = _score_monetary(policy_rate, cpi_val)
    p_score   = _score_political(pol_val)
    composite = _clamp(0.25 * g_score + 0.20 * i_score + 0.15 * f_score +
                       0.15 * e_score + 0.15 * m_score + 0.10 * p_score)

    regime = _classify_regime(gdp_g_val, cpi_val)
    eq_1y  = market.get("equity_change_1y")
    fx_1y  = market.get("fx_change_1y")

    investment = _investment_scores(g_score, i_score, f_score, e_score, m_score, p_score, eq_1y, fx_1y)
    commodity_score = _clamp(sum(commodity.values()) * 0.5) if commodity else 30
    investment["commodities"]["score"] = commodity_score
    investment["commodities"]["label"] = _inv_label(commodity_score)
    investment["commodities"]["color"] = _inv_label_color(_inv_label(commodity_score))

    insights = _insights(
        meta["name"], gdp_g_val, cpi_val, unemp_val, debt_val, ca_val,
        policy_rate, pol_val, eq_1y, fx_1y, regime["label"],
    )

    # Monetary stance
    stance = "Unknown"
    if policy_rate is not None and cpi_val is not None:
        rr = policy_rate - cpi_val
        if rr > 2: stance = "Tightening"
        elif rr > 0: stance = "Neutral"
        else: stance = "Easing"

    # Growth momentum
    momentum = "Stable"
    if gdp_g_val is not None and gdp_g_prev is not None:
        diff = gdp_g_val - gdp_g_prev
        if diff > 0.5: momentum = "Accelerating"
        elif diff < -0.5: momentum = "Decelerating"

    # Inflation regime
    infl_regime = "Unknown"
    if cpi_val is not None:
        if cpi_val < 0: infl_regime = "Deflation"
        elif cpi_val < 2: infl_regime = "Low"
        elif cpi_val < 4: infl_regime = "Stable"
        elif cpi_val < 7: infl_regime = "Elevated"
        elif cpi_val < 15: infl_regime = "High"
        else: infl_regime = "Hyperinflation"

    result = {
        "meta": {
            "code": code,
            "name": meta["name"],
            "currency": meta["currency"],
            "flag": meta["flag"],
            "region": meta["region"],
        },
        "overview": {
            "gdp_usd_bn":       round(gdp_val / 1e9, 1) if gdp_val else None,
            "gdp_per_capita":   round(gdppc_val, 0) if gdppc_val else None,
            "population_mn":    round(pop_val / 1e6, 1) if pop_val else None,
            "credit_rating":    rating,
            "political_stability": round(pol_val, 2) if pol_val else None,
            "trade_pct_gdp":    round(trade_val, 1) if trade_val else None,
        },
        "growth": {
            "gdp_growth":       round(gdp_g_val, 2) if gdp_g_val else None,
            "gdp_growth_prev":  round(gdp_g_prev, 2) if gdp_g_prev else None,
            "industrial_prod":  round(ind_val, 2) if ind_val else None,
            "exports_growth":   round(exp_val, 2) if exp_val else None,
            "imports_growth":   round(_latest(imp_series), 2) if _latest(imp_series) else None,
            "momentum":         momentum,
            "score":            g_score,
            "history":          _to_history(gdp_g_series),
        },
        "inflation": {
            "cpi":              round(cpi_val, 2) if cpi_val else None,
            "cpi_prev":         round(_prev(cpi_series), 2) if _prev(cpi_series) else None,
            "regime":           infl_regime,
            "score":            i_score,
            "history":          _to_history(cpi_series),
        },
        "central_bank": {
            "policy_rate":      policy_rate,
            "real_rate":        real_rate,
            "stance":           stance,
            "hawkish_score":    _clamp(m_score),
        },
        "labor": {
            "unemployment":     round(unemp_val, 2) if unemp_val else None,
            "unemployment_prev":round(unemp_prev, 2) if unemp_prev else None,
            "labor_participation": round(lab_val, 2) if lab_val else None,
            "score":            _clamp(100 - (unemp_val or 7) * 5),
            "history":          _to_history(unemp_series),
        },
        "fiscal": {
            "debt_gdp":         round(debt_val, 1) if debt_val else None,
            "gross_savings":    round(savings_val, 1) if savings_val else None,
            "score":            f_score,
            "risk_level":       ("Critical" if (debt_val or 0) > 120 else
                                 "High" if (debt_val or 0) > 90 else
                                 "Moderate" if (debt_val or 0) > 60 else "Low"),
            "history":          _to_history(debt_series),
        },
        "external": {
            "current_account_gdp": round(ca_val, 2) if ca_val else None,
            "fx_reserves_usd_bn": round(reserves_val / 1e9, 1) if reserves_val else None,
            "fx_reserves_months": res_months,
            "ext_debt_gni":     round(extd_val, 1) if extd_val else None,
            "exports_growth":   round(exp_val, 2) if exp_val else None,
            "score":            e_score,
            "history":          _to_history(ca_series),
        },
        "currency": {
            "ticker":           FX_TICKERS.get(meta.get("currency", ""), "N/A"),
            "fx_rate":          market.get("fx_rate"),
            "fx_change_1m":     market.get("fx_change_1m"),
            "fx_change_1y":     market.get("fx_change_1y"),
            "fx_change_5y":     market.get("fx_change_5y"),
            "score":            _clamp(e_score * 0.4 + g_score * 0.3 + m_score * 0.3),
            "history":          market.get("fx_history", []),
        },
        "equity": {
            "ticker":           market.get("equity_ticker", COUNTRY_ETF.get(code, "N/A")),
            "price":            market.get("equity_price"),
            "change_1m":        market.get("equity_change_1m"),
            "change_3m":        market.get("equity_change_3m"),
            "change_1y":        market.get("equity_change_1y"),
            "change_3y":        market.get("equity_change_3y"),
            "change_5y":        market.get("equity_change_5y"),
            "market_cap_gdp":   round(mktcap_val, 1) if mktcap_val else None,
            "valuation_score":  _clamp(i_score * 0.3 + g_score * 0.4 + f_score * 0.3),
            "momentum_score":   _clamp(50 + (eq_1y or 0) * 0.8),
            "history":          market.get("equity_history", []),
        },
        "commodities": {
            "exposure":         commodity,
            "sensitivity_score": _clamp(sum(commodity.values()) * 0.8),
        },
        "risk": {
            "political":        _clamp(100 - p_score),
            "fiscal":           _clamp(100 - f_score),
            "currency":         _clamp(100 - _clamp(e_score * 0.5 + m_score * 0.5)),
            "sovereign":        _clamp(100 - rating.get("score", 40)),
            "inflation":        _clamp(100 - i_score),
            "overall":          _clamp(100 - composite),
        },
        "regime":   regime,
        "scores": {
            "growth":    g_score,
            "inflation": i_score,
            "fiscal":    f_score,
            "external":  e_score,
            "monetary":  m_score,
            "political": p_score,
            "composite": composite,
        },
        "investment": investment,
        "insights":   insights,
        "forecasts": {
            "gdp_3m":  _forecast(gdp_g_series, 1),
            "gdp_6m":  _forecast(gdp_g_series, 2),
            "gdp_12m": _forecast(gdp_g_series, 3),
            "cpi_3m":  _forecast(cpi_series, 1),
            "cpi_6m":  _forecast(cpi_series, 2),
            "cpi_12m": _forecast(cpi_series, 3),
            "recession_probability": _recession_prob(gdp_g_val, cpi_val, unemp_val, unemp_prev),
        },
        "data_note": "Fundamental data sourced from World Bank (annual, may lag 1-2 years). Market data from yfinance.",
    }

    _cache_set(f"macro:{code}", result)
    return result
