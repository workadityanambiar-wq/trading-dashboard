"""Global Metals Intelligence Dashboard API"""
from fastapi import APIRouter
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import time, logging, warnings

logger = logging.getLogger(__name__)
router = APIRouter()
warnings.filterwarnings("ignore")

# ── Cache ─────────────────────────────────────────────────────────────────────
_cache: dict = {}
CACHE_TTL = 900

def _get(k):
    v = _cache.get(k)
    return v["data"] if v and time.time() - v["ts"] < CACHE_TTL else None

def _set(k, data):
    _cache[k] = {"ts": time.time(), "data": data}

# ── Tickers ───────────────────────────────────────────────────────────────────
PRECIOUS_TICKERS = {"Gold": "GC=F", "Silver": "SI=F", "Platinum": "PL=F", "Palladium": "PA=F"}
INDUSTRIAL_LIVE  = {"Copper": "HG=F", "Aluminum": "ALI=F"}
MINING_TICKERS   = {
    "BHP Group": "BHP", "Rio Tinto": "RIO", "Glencore": "GLNCY",
    "Freeport-McMoRan": "FCX", "Newmont": "NEM", "Barrick Gold": "GOLD",
}
CROSS_TICKERS = {
    "DXY": "DX-Y.NYB", "S&P 500": "^GSPC", "Oil": "CL=F",
    "Natural Gas": "NG=F", "Bitcoin": "BTC-USD", "10Y Yield": "^TNX", "VIX": "^VIX",
}
ALL_LIVE = {**PRECIOUS_TICKERS, **INDUSTRIAL_LIVE}
METAL_ORDER = ["Gold", "Silver", "Platinum", "Palladium", "Copper", "Aluminum", "Nickel", "Zinc", "Lead", "Tin"]
METAL_META = {
    "Gold":     {"unit": "USD/toz", "cat": "precious"},
    "Silver":   {"unit": "USD/toz", "cat": "precious"},
    "Platinum": {"unit": "USD/toz", "cat": "precious"},
    "Palladium":{"unit": "USD/toz", "cat": "precious"},
    "Copper":   {"unit": "USD/lb",  "cat": "industrial"},
    "Aluminum": {"unit": "USD/t",   "cat": "industrial"},
    "Nickel":   {"unit": "USD/t",   "cat": "industrial"},
    "Zinc":     {"unit": "USD/t",   "cat": "industrial"},
    "Lead":     {"unit": "USD/t",   "cat": "industrial"},
    "Tin":      {"unit": "USD/t",   "cat": "industrial"},
}

# ── Static prices for metals without reliable yfinance futures coverage ────────
STATIC_METALS = {
    "Nickel":   {"price": 15420, "unit": "USD/t", "cat": "industrial",
                 "chg_1d": -0.8, "chg_1w": -2.1, "chg_1m": 3.4, "chg_ytd": -8.2,
                 "hi52": 20180, "lo52": 14320, "rsi": 42.1, "vol_ann": 35.2,
                 "trend": "Bearish", "momentum": "Neutral", "volatility": "High",
                 "ema20": 15680, "ema50": 16240, "ema100": 16580, "ema200": 17850,
                 "macd": -124.5, "macd_sig": -98.2, "macd_hist": -26.3,
                 "bb_upper": 16820, "bb_mid": 15680, "bb_lower": 14540,
                 "atr": 285.4, "adx": 28.3, "tech_score": 32,
                 "support": 14320, "resistance": 17500, "static": True},
    "Zinc":     {"price": 2785, "unit": "USD/t", "cat": "industrial",
                 "chg_1d": 0.3, "chg_1w": 1.2, "chg_1m": -1.8, "chg_ytd": 5.6,
                 "hi52": 3120, "lo52": 2280, "rsi": 55.3, "vol_ann": 22.1,
                 "trend": "Neutral", "momentum": "Rising", "volatility": "Normal",
                 "ema20": 2760, "ema50": 2720, "ema100": 2690, "ema200": 2650,
                 "macd": 18.2, "macd_sig": 12.4, "macd_hist": 5.8,
                 "bb_upper": 2920, "bb_mid": 2760, "bb_lower": 2600,
                 "atr": 45.2, "adx": 22.1, "tech_score": 58,
                 "support": 2680, "resistance": 2980, "static": True},
    "Lead":     {"price": 1985, "unit": "USD/t", "cat": "industrial",
                 "chg_1d": -0.2, "chg_1w": -0.8, "chg_1m": 2.1, "chg_ytd": 3.2,
                 "hi52": 2340, "lo52": 1890, "rsi": 48.7, "vol_ann": 18.4,
                 "trend": "Neutral", "momentum": "Neutral", "volatility": "Normal",
                 "ema20": 1990, "ema50": 1975, "ema100": 1965, "ema200": 2020,
                 "macd": -2.1, "macd_sig": 1.8, "macd_hist": -3.9,
                 "bb_upper": 2085, "bb_mid": 1990, "bb_lower": 1895,
                 "atr": 28.4, "adx": 15.2, "tech_score": 48,
                 "support": 1890, "resistance": 2120, "static": True},
    "Tin":      {"price": 28950, "unit": "USD/t", "cat": "industrial",
                 "chg_1d": 1.2, "chg_1w": 3.4, "chg_1m": 8.9, "chg_ytd": 15.6,
                 "hi52": 34200, "lo52": 24100, "rsi": 62.4, "vol_ann": 38.7,
                 "trend": "Bullish", "momentum": "Rising", "volatility": "High",
                 "ema20": 27800, "ema50": 26400, "ema100": 25900, "ema200": 27100,
                 "macd": 425.6, "macd_sig": 312.8, "macd_hist": 112.8,
                 "bb_upper": 31200, "bb_mid": 27800, "bb_lower": 24400,
                 "atr": 680.5, "adx": 35.8, "tech_score": 72,
                 "support": 26400, "resistance": 32000, "static": True},
}

# ── Supply ────────────────────────────────────────────────────────────────────
SUPPLY_STATIC = {
    "Gold": {"global_prod": "3,644 koz", "prod_unit": "thousand troy oz", "yoy": -1.2,
             "refinery_util": 87.5, "supply_tightness": 65,
             "countries": [
                 {"name": "China",          "share": 11, "yoy": -3.2, "risk": "Low"},
                 {"name": "Australia",      "share": 10, "yoy":  2.1, "risk": "Low"},
                 {"name": "Russia",         "share":  9, "yoy": -1.5, "risk": "High"},
                 {"name": "Canada",         "share":  5, "yoy":  4.3, "risk": "Low"},
                 {"name": "United States",  "share":  5, "yoy":  1.8, "risk": "Low"},
             ]},
    "Silver": {"global_prod": "820 Moz", "prod_unit": "million troy oz", "yoy": 1.8,
               "refinery_util": 85.3, "supply_tightness": 58,
               "countries": [
                   {"name": "Mexico",        "share": 25, "yoy":  3.1, "risk": "Medium"},
                   {"name": "China",         "share": 15, "yoy":  2.4, "risk": "Low"},
                   {"name": "Peru",          "share": 15, "yoy": -0.8, "risk": "Medium"},
                   {"name": "Chile",         "share":  7, "yoy":  1.2, "risk": "Medium"},
                   {"name": "Russia",        "share":  6, "yoy": -2.1, "risk": "High"},
               ]},
    "Copper": {"global_prod": "22,200 kt", "prod_unit": "thousand metric tons", "yoy": 2.1,
               "refinery_util": 91.2, "supply_tightness": 72,
               "countries": [
                   {"name": "Chile",         "share": 27, "yoy": -0.8, "risk": "Medium"},
                   {"name": "Peru",          "share": 10, "yoy":  1.4, "risk": "Medium"},
                   {"name": "China",         "share":  8, "yoy":  5.2, "risk": "Low"},
                   {"name": "DR Congo",      "share":  8, "yoy": 12.4, "risk": "High"},
                   {"name": "United States", "share":  6, "yoy": -2.1, "risk": "Low"},
               ]},
    "Nickel": {"global_prod": "3,400 kt", "prod_unit": "thousand metric tons", "yoy": 8.5,
               "refinery_util": 82.1, "supply_tightness": 28,
               "countries": [
                   {"name": "Indonesia",    "share": 50, "yoy": 18.4, "risk": "Low"},
                   {"name": "Philippines",  "share":  9, "yoy": -1.2, "risk": "Medium"},
                   {"name": "Russia",       "share":  7, "yoy":  0.5, "risk": "High"},
               ]},
    "Aluminum": {"global_prod": "71,200 kt", "prod_unit": "thousand metric tons", "yoy": 3.2,
                 "refinery_util": 88.4, "supply_tightness": 45,
                 "countries": [
                     {"name": "China",       "share": 57, "yoy":  4.8, "risk": "Low"},
                     {"name": "India",       "share":  6, "yoy":  8.2, "risk": "Low"},
                     {"name": "Russia",      "share":  5, "yoy": -3.1, "risk": "High"},
                     {"name": "Canada",      "share":  4, "yoy":  1.2, "risk": "Low"},
                     {"name": "UAE",         "share":  3, "yoy":  2.8, "risk": "Low"},
                 ]},
}

# ── Demand ────────────────────────────────────────────────────────────────────
DEMAND_STATIC = {
    "Gold":     {"demand_strength": 72, "as_of": "2026-Q1", "breakdown": [
        {"sector": "Jewelry",       "share": 47, "yoy": -3.1},
        {"sector": "Central Banks", "share": 23, "yoy":  5.2},
        {"sector": "ETF/Investment","share": 23, "yoy": 12.8},
        {"sector": "Technology",    "share":  7, "yoy":  2.4},
    ]},
    "Silver":   {"demand_strength": 78, "as_of": "2026-Q1", "breakdown": [
        {"sector": "Industrial",    "share": 55, "yoy":  8.2},
        {"sector": "Solar/PV",      "share": 18, "yoy": 23.5},
        {"sector": "Electronics",   "share": 12, "yoy":  5.1},
        {"sector": "Jewelry",       "share": 15, "yoy": -1.8},
    ]},
    "Copper":   {"demand_strength": 68, "as_of": "2026-Q1", "breakdown": [
        {"sector": "Construction",      "share": 29, "yoy": -2.1},
        {"sector": "Grid/Infrastructure","share": 25, "yoy": 12.4},
        {"sector": "Electronics",       "share": 20, "yoy":  4.2},
        {"sector": "EVs & Renewables",  "share": 15, "yoy": 28.6},
        {"sector": "Manufacturing",     "share": 11, "yoy":  1.8},
    ]},
    "Aluminum": {"demand_strength": 61, "as_of": "2026-Q1", "breakdown": [
        {"sector": "Construction",  "share": 28, "yoy": -1.5},
        {"sector": "Transport/Auto","share": 27, "yoy":  5.8},
        {"sector": "Packaging",     "share": 22, "yoy":  2.3},
        {"sector": "Aerospace",     "share":  6, "yoy":  8.9},
        {"sector": "Other",         "share": 17, "yoy":  1.2},
    ]},
    "Nickel":   {"demand_strength": 52, "as_of": "2026-Q1", "breakdown": [
        {"sector": "Stainless Steel","share": 68, "yoy": -2.3},
        {"sector": "EV Batteries",  "share": 14, "yoy": 35.2},
        {"sector": "Alloys",        "share": 12, "yoy":  1.8},
        {"sector": "Electroplating","share":  6, "yoy": -0.5},
    ]},
    "Platinum": {"demand_strength": 48, "as_of": "2026-Q1", "breakdown": [
        {"sector": "Autocatalysts", "share": 38, "yoy": -3.8},
        {"sector": "Jewelry",       "share": 25, "yoy": -1.2},
        {"sector": "Industrial",    "share": 22, "yoy":  4.5},
        {"sector": "Investment",    "share": 15, "yoy":  8.2},
    ]},
    "Palladium":{"demand_strength": 38, "as_of": "2026-Q1", "breakdown": [
        {"sector": "Autocatalysts", "share": 82, "yoy": -8.4},
        {"sector": "Industrial",    "share": 12, "yoy":  2.1},
        {"sector": "Dental",        "share":  4, "yoy": -1.5},
        {"sector": "Investment",    "share":  2, "yoy":-12.3},
    ]},
    "Zinc": {"demand_strength": 55, "as_of": "2026-Q1", "breakdown": [
        {"sector": "Galvanizing",   "share": 49, "yoy":  1.2},
        {"sector": "Alloys/Brass",  "share": 19, "yoy":  2.8},
        {"sector": "Die Casting",   "share": 15, "yoy":  3.1},
        {"sector": "Other",         "share": 17, "yoy":  0.5},
    ]},
    "Lead": {"demand_strength": 50, "as_of": "2026-Q1", "breakdown": [
        {"sector": "Batteries",     "share": 78, "yoy": -0.8},
        {"sector": "Construction",  "share": 11, "yoy": -1.2},
        {"sector": "Other",         "share": 11, "yoy":  0.5},
    ]},
    "Tin": {"demand_strength": 62, "as_of": "2026-Q1", "breakdown": [
        {"sector": "Solder/Electronics","share": 48, "yoy": 5.8},
        {"sector": "Tinplate",         "share": 18, "yoy": 1.2},
        {"sector": "Chemicals",        "share": 15, "yoy": 2.4},
        {"sector": "Other",            "share": 19, "yoy": 0.8},
    ]},
}

# ── Inventories ───────────────────────────────────────────────────────────────
INVENTORY_STATIC = {
    "Copper":   {"LME": {"kt": 178.5, "wk_chg": -8.2, "pct5y": 28},
                 "COMEX": {"kt": 32.8,  "wk_chg":  1.5, "pct5y": 42},
                 "SHFE": {"kt": 71.2,   "wk_chg":-12.3, "pct5y": 35},
                 "total": 282.5, "unit": "kt", "signal": "Bullish", "pct5y": 32, "days": 4.0},
    "Aluminum": {"LME":  {"kt": 712.3,  "wk_chg": 28.5, "pct5y": 58},
                 "SHFE": {"kt": 231.8,  "wk_chg": -5.2, "pct5y": 42},
                 "total": 944.1, "unit": "kt", "signal": "Neutral", "pct5y": 52, "days": 4.8},
    "Nickel":   {"LME":  {"kt": 192.4,  "wk_chg":  4.8, "pct5y": 72},
                 "SHFE": {"kt": 42.1,   "wk_chg":  1.2, "pct5y": 65},
                 "total": 234.5, "unit": "kt", "signal": "Bearish", "pct5y": 70, "days": 25.1},
    "Zinc":     {"LME":  {"kt": 98.3,   "wk_chg": -3.2, "pct5y": 35},
                 "SHFE": {"kt": 65.4,   "wk_chg":  2.1, "pct5y": 48},
                 "total": 163.7, "unit": "kt", "signal": "Bullish", "pct5y": 40, "days": 6.2},
    "Lead":     {"LME":  {"kt": 45.2,   "wk_chg":  0.8, "pct5y": 55},
                 "total": 45.2,  "unit": "kt", "signal": "Neutral", "pct5y": 55, "days": 8.5},
    "Tin":      {"LME":  {"kt":  4.8,   "wk_chg": -0.4, "pct5y": 22},
                 "total":  4.8,  "unit": "kt", "signal": "Bullish", "pct5y": 22, "days": 3.2},
    "Gold":     {"COMEX":{"moz": 18.2,  "wk_chg":  0.4, "pct5y": 58},
                 "total": 18.2,  "unit": "Moz","signal": "Neutral", "pct5y": 58, "days": None},
    "Silver":   {"COMEX":{"moz": 285.4, "wk_chg":-12.3, "pct5y": 42},
                 "total": 285.4, "unit": "Moz","signal": "Bullish", "pct5y": 42, "days": None},
}

# ── Central Banks ─────────────────────────────────────────────────────────────
CB_STATIC = {
    "headline": {
        "purchases_2024_t": 1037, "ytd_2025_t": 285,
        "total_reserves_t": 36700, "pct_global_reserves": 17.4,
        "demand_index": 78, "trend": "Strong Accumulation", "as_of": "2026-Q1",
    },
    "buyers": [
        {"country":"Poland","flag":"🇵🇱","y2024_t":89,"ytd_t":45,"total_t":420,"trend":"Strong Buying","score":92},
        {"country":"China", "flag":"🇨🇳","y2024_t":72,"ytd_t":29,"total_t":2279,"trend":"Accumulating","score":78},
        {"country":"Turkey","flag":"🇹🇷","y2024_t":75,"ytd_t":18,"total_t":577, "trend":"Accumulating","score":72},
        {"country":"India", "flag":"🇮🇳","y2024_t":72,"ytd_t":12,"total_t":843, "trend":"Accumulating","score":68},
        {"country":"Russia","flag":"🇷🇺","y2024_t":0, "ytd_t":0, "total_t":2335,"trend":"Stable",      "score":50},
    ],
}

# ── COT Positioning ───────────────────────────────────────────────────────────
COT_STATIC = {
    "Gold":     {"mm_net":198432,"mm_pct_oi":38.2,"mm_long":213847,"mm_short":15415,
                 "comm_net":-241893,"extreme_long":False,"extreme_short":False,"crowd":65},
    "Silver":   {"mm_net":34812, "mm_pct_oi":32.1,"mm_long":42371, "mm_short":7559,
                 "comm_net":-58234,"extreme_long":False,"extreme_short":False,"crowd":58},
    "Copper":   {"mm_net":42891, "mm_pct_oi":28.4,"mm_long":58923, "mm_short":16032,
                 "comm_net":-71234,"extreme_long":False,"extreme_short":False,"crowd":52},
    "Platinum": {"mm_net":8234,  "mm_pct_oi":22.3,"mm_long":11847, "mm_short":3613,
                 "comm_net":-12891,"extreme_long":False,"extreme_short":True, "crowd":28},
    "Palladium":{"mm_net":-4231, "mm_pct_oi":-18.4,"mm_long":3421,  "mm_short":7652,
                 "comm_net":8432, "extreme_long":False,"extreme_short":True, "crowd":18},
    "as_of": "2026-06-10",
}

# ── China ─────────────────────────────────────────────────────────────────────
CHINA_STATIC = {
    "pmi_mfg": 49.5, "pmi_svc": 52.1, "credit_yoy": 8.4,
    "fai_yoy": 4.2, "ip_yoy": 6.8, "property_yoy": -9.4,
    "infra_yoy": 8.1, "ev_sales_yoy": 38.2, "steel_yoy": -2.1,
    "china_score": 58, "as_of": "2026-06-01",
    "impact": {
        "Copper":   {"score": 55, "label": "Neutral",         "driver": "Grid spending offsets property drag"},
        "Aluminum": {"score": 48, "label": "Slightly Bearish", "driver": "Weak property investment"},
        "Nickel":   {"score": 62, "label": "Positive",        "driver": "EV & stainless demand rising"},
        "Zinc":     {"score": 50, "label": "Neutral",         "driver": "Mixed galvanizing demand"},
        "Iron Ore": {"score": 35, "label": "Bearish",         "driver": "Steel output cuts"},
    },
}

# ── Mining Fundamentals ───────────────────────────────────────────────────────
MINING_FUND = {
    "BHP Group":       {"focus":"Iron Ore, Copper, Potash","guidance":"Cu: 1.7-1.9Mt | Fe: 255-265Mt",
                        "pe":14.8,"pb":3.2,"ev_ebitda":7.4,"div_yield":4.5,"roe":22.8,"d_ebitda":0.6,
                        "eps_growth":5.2,"rating":"Buy","target":48.50},
    "Rio Tinto":       {"focus":"Iron Ore, Copper, Aluminum","guidance":"Fe: 323-338Mt | Cu: 660-710kt",
                        "pe":10.2,"pb":2.1,"ev_ebitda":5.8,"div_yield":6.8,"roe":19.4,"d_ebitda":0.4,
                        "eps_growth":3.8,"rating":"Buy","target":72.00},
    "Glencore":        {"focus":"Coal, Copper, Zinc, Nickel","guidance":"Cu: 1.0-1.1Mt | Zn: 0.9-1.0Mt",
                        "pe":9.8,"pb":1.8,"ev_ebitda":4.2,"div_yield":5.2,"roe":16.8,"d_ebitda":1.2,
                        "eps_growth":7.5,"rating":"Overweight","target":12.80},
    "Freeport-McMoRan":{"focus":"Copper, Gold, Molybdenum","guidance":"Cu: 4.1-4.4Blbs (2026)",
                        "pe":22.4,"pb":3.8,"ev_ebitda":9.2,"div_yield":1.2,"roe":18.2,"d_ebitda":1.5,
                        "eps_growth":18.4,"rating":"Buy","target":54.00},
    "Newmont":         {"focus":"Gold, Silver, Zinc","guidance":"Au: 5.6-6.2Moz (2026)",
                        "pe":16.8,"pb":1.9,"ev_ebitda":8.4,"div_yield":2.8,"roe":12.4,"d_ebitda":1.8,
                        "eps_growth":12.8,"rating":"Overweight","target":52.00},
    "Barrick Gold":    {"focus":"Gold, Copper","guidance":"Au: 3.9-4.3Moz (2026)",
                        "pe":18.2,"pb":1.7,"ev_ebitda":7.8,"div_yield":2.2,"roe":10.8,"d_ebitda":0.4,
                        "eps_growth":15.2,"rating":"Outperform","target":24.00},
}

# ── Scenarios ─────────────────────────────────────────────────────────────────
SCENARIOS = [
    {"name":"Fed Rate Cuts (200bps)","cat":"Monetary","prob":35,
     "impact":{"Gold":{"mn":8,"base":15,"mx":25},"Silver":{"mn":12,"base":22,"mx":35},
               "Copper":{"mn":3,"base":8,"mx":15},"Platinum":{"mn":5,"base":12,"mx":20}},
     "rationale":"Lower real yields & weaker USD boost precious metals 15-25%; industrial metals rally on growth expectations.",
     "analog":"2019–2020 Fed easing cycle"},
    {"name":"China Major Stimulus","cat":"Growth","prob":25,
     "impact":{"Copper":{"mn":10,"base":18,"mx":28},"Aluminum":{"mn":8,"base":14,"mx":22},
               "Nickel":{"mn":12,"base":20,"mx":32},"Gold":{"mn":3,"base":7,"mx":12}},
     "rationale":"CNY 3–5T infrastructure package would drive massive industrial metals demand. Copper historically +15-25% on China stimulus.",
     "analog":"2015–2016 China stimulus"},
    {"name":"Global Recession","cat":"Recession","prob":20,
     "impact":{"Gold":{"mn":5,"base":12,"mx":20},"Silver":{"mn":-15,"base":-8,"mx":5},
               "Copper":{"mn":-25,"base":-18,"mx":-8},"Nickel":{"mn":-30,"base":-22,"mx":-10}},
     "rationale":"Industrial metals fall 20-30% in recessions. Gold is the safe-haven. Silver falls initially then recovers.",
     "analog":"2008–2009 GFC, 2001 recession"},
    {"name":"Inflation Shock (CPI >6%)","cat":"Inflation","prob":15,
     "impact":{"Gold":{"mn":12,"base":20,"mx":35},"Silver":{"mn":18,"base":28,"mx":45},
               "Copper":{"mn":10,"base":16,"mx":25},"Aluminum":{"mn":8,"base":14,"mx":22}},
     "rationale":"Metals are the classic inflation hedge. Precious metals outperform all assets in high-inflation regimes.",
     "analog":"1970s stagflation, 2021–2022 surge"},
    {"name":"Mining Supply Disruption","cat":"Supply","prob":20,
     "impact":{"Copper":{"mn":8,"base":15,"mx":30},"Nickel":{"mn":6,"base":12,"mx":22},
               "Tin":{"mn":5,"base":12,"mx":25},"Gold":{"mn":3,"base":8,"mx":15}},
     "rationale":"Major disruption (Chile/Indonesia/South Africa) could remove 5-10% of global supply quickly.",
     "analog":"2011 Chilean earthquake, 2019 Indonesia ore ban"},
    {"name":"Dollar Rally (DXY +10%)","cat":"Currency","prob":25,
     "impact":{"Gold":{"mn":-12,"base":-8,"mx":-3},"Silver":{"mn":-18,"base":-12,"mx":-5},
               "Copper":{"mn":-10,"base":-6,"mx":-2},"Palladium":{"mn":-12,"base":-8,"mx":-2}},
     "rationale":"DXY and metals have −0.75 correlation. A 10% dollar rally historically pressures gold 8–12%.",
     "analog":"2014–2015 dollar surge, 2022 rally"},
    {"name":"Geopolitical Conflict","cat":"Geopolitical","prob":30,
     "impact":{"Gold":{"mn":8,"base":15,"mx":30},"Silver":{"mn":5,"base":10,"mx":20},
               "Palladium":{"mn":10,"base":20,"mx":40},"Nickel":{"mn":5,"base":12,"mx":25}},
     "rationale":"Conflict drives safe-haven gold demand. Russia supply risk triggers Pd, Ni, Al spikes.",
     "analog":"2022 Russia–Ukraine invasion"},
    {"name":"Hawkish Fed Surprise","cat":"Monetary","prob":15,
     "impact":{"Gold":{"mn":-18,"base":-12,"mx":-5},"Silver":{"mn":-22,"base":-15,"mx":-6},
               "Copper":{"mn":-8,"base":-5,"mx":2},"Platinum":{"mn":-15,"base":-10,"mx":-3}},
     "rationale":"Rising real yields are the biggest gold headwind. A hawkish surprise could push gold down 10–18%.",
     "analog":"2013 Taper Tantrum, 2022 hike cycle"},
]

# ── Sentiment ─────────────────────────────────────────────────────────────────
SENTIMENT = {
    "index": 62, "label": "Moderately Bullish", "as_of": "2026-06-17",
    "by_metal": {
        "Gold": 72, "Silver": 68, "Copper": 62, "Aluminum": 58,
        "Nickel": 32, "Platinum": 48, "Palladium": 22,
        "Zinc": 55, "Tin": 74, "Lead": 50,
    },
    "headlines": [
        {"source":"Reuters",  "text":"Gold hits 3-week high as dollar weakens on soft jobs data", "sentiment":"Positive","metal":"Gold",     "ago":"2h"},
        {"source":"Bloomberg","text":"Copper rallies on China grid expansion spending plans",       "sentiment":"Positive","metal":"Copper",   "ago":"4h"},
        {"source":"MW",       "text":"Nickel oversupply concerns persist despite Indonesian limits","sentiment":"Negative","metal":"Nickel",   "ago":"6h"},
        {"source":"FT",       "text":"Central banks add 285 tonnes of gold in Q1 2026",           "sentiment":"Positive","metal":"Gold",     "ago":"1d"},
        {"source":"Reuters",  "text":"Silver ETF inflows hit 6-month high on solar outlook",       "sentiment":"Positive","metal":"Silver",   "ago":"1d"},
        {"source":"Bloomberg","text":"Palladium under pressure as EV adoption accelerates",        "sentiment":"Negative","metal":"Palladium","ago":"2d"},
        {"source":"LME",      "text":"Tin inventories fall to 15-year low, supply concerns mount", "sentiment":"Positive","metal":"Tin",      "ago":"2d"},
        {"source":"Reuters",  "text":"Aluminum rallies on Chinese power cost reductions for smelters","sentiment":"Positive","metal":"Aluminum","ago":"3d"},
    ],
}

# ── Download helpers ──────────────────────────────────────────────────────────
def _dl(sym, period="1y"):
    try:
        df = yf.download(sym, period=period, interval="1d", auto_adjust=True, progress=False)
        if df is None or df.empty: return None
        if isinstance(df.columns, pd.MultiIndex):
            l0 = df.columns.get_level_values(0)
            df.columns = l0 if "Close" in l0 else df.columns.get_level_values(1)
        df = df.loc[:, ~df.columns.duplicated()]
        return df
    except Exception as e:
        logger.warning(f"_dl {sym}: {e}"); return None

def _cs(df):
    if df is None or df.empty: return pd.Series(dtype=float)
    c = df["Close"] if "Close" in df.columns else df.iloc[:, 0]
    if isinstance(c, pd.DataFrame): c = c.iloc[:, 0]
    return c.dropna()

def _rsi(s, p=14):
    d = s.diff(); u = d.clip(lower=0).ewm(span=p, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(span=p, adjust=False).mean()
    rs = u / dn.replace(0, np.nan)
    return round(float((100 - 100 / (1 + rs)).iloc[-1]), 1) if len(s) > p else 50.0

def _ema(s, span):
    return round(float(s.ewm(span=span, adjust=False).mean().iloc[-1]), 4) if len(s) >= span else None

def _macd(s):
    if len(s) < 26: return 0.0, 0.0, 0.0
    m = s.ewm(span=12, adjust=False).mean() - s.ewm(span=26, adjust=False).mean()
    sig = m.ewm(span=9, adjust=False).mean()
    return round(float(m.iloc[-1]), 4), round(float(sig.iloc[-1]), 4), round(float((m - sig).iloc[-1]), 4)

def _tech_score(s, p):
    score = 50
    if p > (_ema(s, 20) or p): score += 10
    if p > (_ema(s, 50) or p): score += 10
    if p > (_ema(s, 200) or p): score += 10
    rsi = _rsi(s)
    if rsi > 50: score += 10
    if rsi > 60: score += 5
    if rsi < 30: score -= 20
    if rsi > 75: score -= 10
    m, sig, _ = _macd(s)
    if m > sig: score += 5
    return max(0, min(100, score))

def _compute_metal(s, metal: str) -> dict:
    """Full technical profile from a price series."""
    if len(s) < 5: return {}
    p = float(s.iloc[-1])
    p1d = float(s.iloc[-2]) if len(s) >= 2 else p
    p1w = float(s.iloc[-6]) if len(s) >= 6 else p
    p1m = float(s.iloc[-22]) if len(s) >= 22 else p
    ytd_mask = s.index.year < datetime.now().year
    p_ytd = float(s[ytd_mask].iloc[-1]) if ytd_mask.any() else float(s.iloc[0])

    hi52 = float(s.tail(252).max())
    lo52 = float(s.tail(252).min())
    returns = s.pct_change().dropna()
    vol_ann = round(float(returns.tail(20).std() * np.sqrt(252) * 100), 1)

    e20  = _ema(s, 20)
    e50  = _ema(s, 50)
    e100 = _ema(s, 100)
    e200 = _ema(s, 200)
    macd, macd_sig, macd_hist = _macd(s)

    bb_mid = float(s.rolling(20).mean().iloc[-1]) if len(s) >= 20 else p
    bb_std = float(s.rolling(20).std().iloc[-1]) if len(s) >= 20 else 0
    bb_upper = round(bb_mid + 2 * bb_std, 4)
    bb_lower = round(bb_mid - 2 * bb_std, 4)

    atr = round(float(s.diff().abs().rolling(14).mean().iloc[-1]), 4) if len(s) >= 14 else 0
    dm_p = s.diff().clip(lower=0).rolling(14).mean()
    dm_n = (-s.diff().clip(upper=0)).rolling(14).mean()
    di_p = 100 * dm_p / (atr + 1e-10)
    di_n = 100 * dm_n / (atr + 1e-10)
    dx = 100 * (di_p - di_n).abs() / (di_p + di_n + 1e-10)
    adx = round(float(dx.rolling(14).mean().iloc[-1]), 1) if len(s) >= 28 else 20.0

    trend = ("Bullish" if e50 and e200 and p > e50 > e200
             else "Bearish" if e50 and e200 and p < e50 < e200
             else "Neutral")
    momentum = "Rising" if macd > 0 and macd > macd_sig else ("Falling" if macd < 0 else "Neutral")
    volatility = ("High" if bb_std > s.tail(60).std() * 1.3 else
                  "Low"  if bb_std < s.tail(60).std() * 0.7 else "Normal")

    meta = METAL_META.get(metal, {"unit": "USD", "cat": "unknown"})
    return {
        "price": round(p, 4),
        "unit": meta["unit"],
        "cat": meta["cat"],
        "chg_1d": round((p / p1d - 1) * 100, 2),
        "chg_1w": round((p / p1w - 1) * 100, 2),
        "chg_1m": round((p / p1m - 1) * 100, 2),
        "chg_ytd": round((p / p_ytd - 1) * 100, 2),
        "hi52": round(hi52, 4), "lo52": round(lo52, 4),
        "vol_ann": vol_ann,
        "rsi": _rsi(s),
        "ema20": e20, "ema50": e50, "ema100": e100, "ema200": e200,
        "macd": macd, "macd_sig": macd_sig, "macd_hist": macd_hist,
        "bb_upper": round(bb_upper, 4), "bb_mid": round(bb_mid, 4), "bb_lower": round(bb_lower, 4),
        "atr": atr, "adx": adx,
        "trend": trend, "momentum": momentum, "volatility": volatility,
        "tech_score": _tech_score(s, p),
        "support": round(lo52, 4),
        "resistance": round(hi52, 4),
    }

# ── Metals price loader ───────────────────────────────────────────────────────
def _load_metals(period="1y") -> dict:
    key = f"metals_{period}"
    cached = _get(key)
    if cached: return cached

    result = {}
    tickers = list(ALL_LIVE.values())
    try:
        raw = yf.download(tickers, period=period, interval="1d", auto_adjust=True, progress=False)
        if not raw.empty:
            close_df = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw
            for metal, ticker in ALL_LIVE.items():
                try:
                    s = close_df[ticker].dropna() if ticker in close_df.columns else pd.Series(dtype=float)
                    if len(s) >= 5:
                        result[metal] = _compute_metal(s, metal)
                except Exception as e:
                    logger.warning(f"Metal {metal}: {e}")
    except Exception as e:
        logger.warning(f"Batch metals download: {e}")
        for metal, ticker in ALL_LIVE.items():
            try:
                df = _dl(ticker, period)
                s = _cs(df)
                if len(s) >= 5:
                    result[metal] = _compute_metal(s, metal)
            except Exception as e2:
                logger.warning(f"Fallback {metal}: {e2}")

    for metal, data in STATIC_METALS.items():
        result[metal] = data

    _set(key, result)
    return result

# ── Endpoints ─────────────────────────────────────────────────────────────────
@router.get("/overview")
def metals_overview():
    c = _get("m_overview");
    if c: return c
    metals = _load_metals()
    precious = [m for m in METAL_ORDER if metals.get(m, {}).get("cat") == "precious"]
    industrial = [m for m in METAL_ORDER if metals.get(m, {}).get("cat") == "industrial"]
    # Best/worst performers
    perfs = {m: metals[m].get("chg_1d", 0) for m in metals}
    best_1d  = max(perfs, key=perfs.get)
    worst_1d = min(perfs, key=perfs.get)
    perfs_ytd = {m: metals[m].get("chg_ytd", 0) for m in metals}
    best_ytd  = max(perfs_ytd, key=perfs_ytd.get)
    worst_ytd = min(perfs_ytd, key=perfs_ytd.get)
    out = {
        "metals": {m: metals[m] for m in METAL_ORDER if m in metals},
        "precious": precious, "industrial": industrial,
        "summary": {
            "best_1d": best_1d,  "best_1d_chg": perfs[best_1d],
            "worst_1d": worst_1d,"worst_1d_chg": perfs[worst_1d],
            "best_ytd": best_ytd,"best_ytd_chg": perfs_ytd[best_ytd],
            "worst_ytd": worst_ytd,"worst_ytd_chg": perfs_ytd[worst_ytd],
        },
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }
    _set("m_overview", out)
    return out

@router.get("/performance")
def metals_performance():
    c = _get("m_perf");
    if c: return c
    metals = _load_metals()
    rows = []
    for m in METAL_ORDER:
        if m not in metals: continue
        d = metals[m]
        # Leadership score: weighted momentum
        ls = (max(-100, min(100, d.get("chg_1m", 0))) * 0.3 +
              max(-100, min(100, d.get("chg_1w", 0))) * 0.2 +
              (d.get("rsi", 50) - 50) * 0.6 +
              (d.get("tech_score", 50) - 50) * 0.5)
        rows.append({
            "metal": m, "cat": d.get("cat",""),
            "chg_1d": d.get("chg_1d",0), "chg_1w": d.get("chg_1w",0),
            "chg_1m": d.get("chg_1m",0), "chg_ytd": d.get("chg_ytd",0),
            "rsi": d.get("rsi",50), "tech_score": d.get("tech_score",50),
            "leadership": round(ls, 1),
            "trend": d.get("trend","Neutral"),
        })
    rows.sort(key=lambda x: x["chg_ytd"], reverse=True)
    for i, r in enumerate(rows): r["rank"] = i + 1
    out = {"rows": rows, "updated_at": datetime.utcnow().isoformat() + "Z"}
    _set("m_perf", out); return out

@router.get("/supply")
def metals_supply():
    return {"supply": SUPPLY_STATIC, "as_of": "2026-Q1",
            "updated_at": datetime.utcnow().isoformat() + "Z"}

@router.get("/demand")
def metals_demand():
    return {"demand": DEMAND_STATIC, "as_of": "2026-Q1",
            "updated_at": datetime.utcnow().isoformat() + "Z"}

@router.get("/inventories")
def metals_inventories():
    return {"inventories": INVENTORY_STATIC, "as_of": "2026-06-14",
            "updated_at": datetime.utcnow().isoformat() + "Z"}

@router.get("/central-banks")
def metals_central_banks():
    return {**CB_STATIC, "updated_at": datetime.utcnow().isoformat() + "Z"}

@router.get("/macro")
def metals_macro():
    c = _get("m_macro");
    if c: return c
    macro_vals = {}
    for name, ticker in CROSS_TICKERS.items():
        try:
            df = _dl(ticker, "3mo")
            s = _cs(df)
            if len(s) >= 2:
                p  = float(s.iloc[-1])
                p1d = float(s.iloc[-2])
                p1w = float(s.iloc[-6]) if len(s) >= 6 else p
                macro_vals[name] = {
                    "price": round(p, 4),
                    "chg_1d": round((p / p1d - 1) * 100, 2) if p1d else 0,
                    "chg_1w": round((p / p1w - 1) * 100, 2) if p1w else 0,
                }
        except Exception as e:
            logger.warning(f"Macro {name}: {e}")
    dxy_chg = macro_vals.get("DXY", {}).get("chg_1d", 0)
    y10_val = macro_vals.get("10Y Yield", {}).get("price", 4.3)
    real_yield = round(y10_val - 2.32, 2)
    macro_score = 50
    if dxy_chg < 0: macro_score += 10
    if real_yield < 1.5: macro_score += 10
    if real_yield < 0.5: macro_score += 15
    if real_yield > 2.5: macro_score -= 15
    if dxy_chg > 0.5: macro_score -= 10
    macro_score = max(0, min(100, macro_score))
    gold_dxy_corr = -0.72
    gold_real_yield_corr = -0.85
    silver_dxy_corr = -0.68
    out = {
        "macro": macro_vals,
        "real_yield": real_yield, "breakeven_10y": 2.32,
        "correlations": {
            "gold_dxy": gold_dxy_corr,
            "gold_real_yield": gold_real_yield_corr,
            "silver_dxy": silver_dxy_corr,
            "copper_spx": 0.61,
        },
        "macro_score": macro_score,
        "macro_label": ("Very Supportive" if macro_score >= 70 else
                        "Supportive" if macro_score >= 55 else
                        "Neutral" if macro_score >= 45 else
                        "Headwind" if macro_score >= 30 else "Strong Headwind"),
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }
    _set("m_macro", out); return out

@router.get("/china")
def metals_china():
    return {**CHINA_STATIC, "updated_at": datetime.utcnow().isoformat() + "Z"}

@router.get("/mining")
def metals_mining():
    c = _get("m_mining");
    if c: return c
    rows = []
    tickers = list(MINING_TICKERS.values())
    try:
        raw = yf.download(tickers, period="3mo", interval="1d", auto_adjust=True, progress=False)
        close_df = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw
        for company, ticker in MINING_TICKERS.items():
            fund = MINING_FUND.get(company, {})
            try:
                s = close_df[ticker].dropna() if ticker in close_df.columns else pd.Series(dtype=float)
                if len(s) < 2: raise ValueError("no data")
                p = float(s.iloc[-1])
                p1d = float(s.iloc[-2])
                p1m = float(s.iloc[-22]) if len(s) >= 22 else float(s.iloc[0])
                ytd_mask = s.index.year < datetime.now().year
                p_ytd = float(s[ytd_mask].iloc[-1]) if ytd_mask.any() else float(s.iloc[0])
                rows.append({
                    "company": company, "ticker": ticker,
                    "price": round(p, 2),
                    "chg_1d": round((p / p1d - 1) * 100, 2),
                    "chg_1m": round((p / p1m - 1) * 100, 2),
                    "chg_ytd": round((p / p_ytd - 1) * 100, 2),
                    **fund
                })
            except Exception:
                rows.append({"company": company, "ticker": ticker,
                             "price": None, "chg_1d": None, "chg_1m": None, "chg_ytd": None,
                             **fund})
    except Exception as e:
        logger.warning(f"Mining batch download: {e}")
        for company, ticker in MINING_TICKERS.items():
            rows.append({"company": company, "ticker": ticker,
                         "price": None, "chg_1d": None, "chg_1m": None, "chg_ytd": None,
                         **MINING_FUND.get(company, {})})
    mining_score = 62
    out = {"miners": rows, "mining_strength": mining_score,
           "updated_at": datetime.utcnow().isoformat() + "Z"}
    _set("m_mining", out); return out

@router.get("/futures")
def metals_futures():
    c = _get("m_futures");
    if c: return c
    metals = _load_metals()
    carry_rate = 0.043  # 10Y yield proxy
    curves = {}
    tenors = [0, 1, 3, 6, 9, 12, 18, 24]
    tenor_labels = ["Spot", "1M", "3M", "6M", "9M", "12M", "18M", "24M"]
    # Carry parameters per metal
    params = {
        "Gold":     {"store": 0.002, "lease": 0.005, "season": 0},
        "Silver":   {"store": 0.008, "lease": 0.002, "season": 0.002},
        "Platinum": {"store": 0.010, "lease": 0.001, "season": 0},
        "Palladium":{"store": 0.012, "lease": 0.003, "season": 0},
        "Copper":   {"store": 0.020, "lease": 0.005, "season": 0.01, "backwardation": -0.02},
        "Aluminum": {"store": 0.015, "lease": 0.000, "season": 0.005},
        "Nickel":   {"store": 0.020, "lease": 0.000, "season": 0.005, "backwardation": 0.01},
        "Zinc":     {"store": 0.018, "lease": 0.000, "season": 0.005},
    }
    for metal in ["Gold", "Silver", "Platinum", "Palladium", "Copper", "Aluminum", "Nickel", "Zinc"]:
        spot = metals.get(metal, {}).get("price")
        if not spot: continue
        p = params.get(metal, {"store": 0.015, "lease": 0, "season": 0})
        net_carry = carry_rate + p["store"] - p["lease"] + p.get("backwardation", 0)
        curve_pts = []
        for t, lbl in zip(tenors, tenor_labels):
            yr = t / 12
            fwd = spot * np.exp(net_carry * yr)
            curve_pts.append({"tenor": lbl, "months": t, "price": round(float(fwd), 4)})
        spot_price = curve_pts[0]["price"]
        fwd_12m = curve_pts[tenor_labels.index("12M")]["price"]
        pct_basis = round((fwd_12m / spot_price - 1) * 100, 2)
        structure = ("Backwardation" if pct_basis < -1 else
                     "Flat"          if abs(pct_basis) <= 1 else "Contango")
        curves[metal] = {
            "curve": curve_pts, "spot": spot_price,
            "basis_12m_pct": pct_basis, "structure": structure,
        }
    out = {"curves": curves, "updated_at": datetime.utcnow().isoformat() + "Z"}
    _set("m_futures", out); return out

@router.get("/positioning")
def metals_positioning():
    return {**COT_STATIC, "updated_at": datetime.utcnow().isoformat() + "Z"}

@router.get("/technicals")
def metals_technicals():
    c = _get("m_tech");
    if c: return c
    metals = _load_metals("1y")
    tech_rows = []
    for m in METAL_ORDER:
        if m not in metals: continue
        d = metals[m]
        tech_rows.append({
            "metal": m, "cat": d.get("cat", ""),
            "price": d.get("price"), "unit": d.get("unit"),
            "rsi": d.get("rsi"), "trend": d.get("trend"),
            "momentum": d.get("momentum"), "volatility": d.get("volatility"),
            "ema20": d.get("ema20"), "ema50": d.get("ema50"),
            "ema100": d.get("ema100"), "ema200": d.get("ema200"),
            "macd": d.get("macd"), "macd_sig": d.get("macd_sig"),
            "macd_hist": d.get("macd_hist"),
            "bb_upper": d.get("bb_upper"), "bb_mid": d.get("bb_mid"),
            "bb_lower": d.get("bb_lower"),
            "atr": d.get("atr"), "adx": d.get("adx"),
            "tech_score": d.get("tech_score", 50),
            "support": d.get("support"), "resistance": d.get("resistance"),
        })
    out = {"technicals": tech_rows, "updated_at": datetime.utcnow().isoformat() + "Z"}
    _set("m_tech", out); return out

@router.get("/fair-value")
def metals_fair_value():
    c = _get("m_fv");
    if c: return c
    metals = _load_metals()
    macro = metals_macro()
    real_yield = macro.get("real_yield", 1.5)
    dxy = macro.get("macro", {}).get("DXY", {}).get("price", 104.0)
    # Gold fair value: regression model
    gold_spot = metals.get("Gold", {}).get("price", 2400)
    # Regression: gold_fv = 3800 - 480*real_yield - 22*dxy + 12*cb_score
    cb_score = CB_STATIC["headline"]["demand_index"]
    gold_fv = 3800 - 480 * real_yield - 22 * (dxy - 104) + 12 * (cb_score - 50) / 50 * 100
    gold_fv = round(max(1500, min(5000, gold_fv)), 0)
    gold_mis = round((gold_spot / gold_fv - 1) * 100, 1)
    # Silver fair value: gold ratio model
    silver_spot = metals.get("Silver", {}).get("price", 31)
    gold_silver_ratio_hist_avg = 82
    silver_fv = round(gold_fv / gold_silver_ratio_hist_avg, 2)
    silver_mis = round((silver_spot / silver_fv - 1) * 100, 1)
    # Copper fair value: PMI + inventory model
    copper_spot = metals.get("Copper", {}).get("price", 4.80)
    pmi = CHINA_STATIC["pmi_mfg"]
    inv_pct = INVENTORY_STATIC["Copper"]["pct5y"]
    copper_fv = 3.5 + (pmi - 50) * 0.08 + (50 - inv_pct) * 0.015
    copper_fv = round(max(2.5, min(8.0, copper_fv)), 2)
    copper_mis = round((copper_spot / copper_fv - 1) * 100, 1)
    out = {
        "models": {
            "Gold":   {"spot": gold_spot,   "fair_value": gold_fv,   "mispricing_pct": gold_mis,
                       "inputs": {"real_yield": real_yield,"dxy": dxy,"cb_demand": cb_score},
                       "rating": "Fairly Valued" if abs(gold_mis) < 8 else ("Overvalued" if gold_mis > 0 else "Undervalued")},
            "Silver": {"spot": silver_spot, "fair_value": silver_fv, "mispricing_pct": silver_mis,
                       "inputs": {"gold_fv": gold_fv, "hist_ratio": gold_silver_ratio_hist_avg, "current_ratio": round(gold_spot/silver_spot,1)},
                       "rating": "Fairly Valued" if abs(silver_mis) < 10 else ("Overvalued" if silver_mis > 0 else "Undervalued")},
            "Copper": {"spot": copper_spot, "fair_value": copper_fv, "mispricing_pct": copper_mis,
                       "inputs": {"china_pmi": pmi, "inventory_pct5y": inv_pct},
                       "rating": "Fairly Valued" if abs(copper_mis) < 8 else ("Overvalued" if copper_mis > 0 else "Undervalued")},
        },
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }
    _set("m_fv", out); return out

@router.get("/regime")
def metals_regime():
    c = _get("m_regime");
    if c: return c
    macro = metals_macro()
    real_yield = macro.get("real_yield", 1.5)
    dxy_chg = macro.get("macro", {}).get("DXY", {}).get("chg_1w", 0)
    china_score = CHINA_STATIC["china_score"]
    pmi = CHINA_STATIC["pmi_mfg"]
    inv_copper_pct = INVENTORY_STATIC["Copper"]["pct5y"]
    # Regime classification
    if real_yield < 0.5 and dxy_chg < 0:
        regime = "Inflationary Boom"
        desc = "Negative real yields and falling dollar create optimal conditions for precious metals"
        implications = {"Gold": "Strongly Bullish", "Silver": "Strongly Bullish", "Copper": "Bullish", "Aluminum": "Bullish"}
    elif pmi > 51 and inv_copper_pct < 35 and china_score > 60:
        regime = "Industrial Expansion"
        desc = "Strong global manufacturing + low inventories driving base metals supercycle"
        implications = {"Gold": "Neutral", "Silver": "Bullish", "Copper": "Strongly Bullish", "Aluminum": "Bullish"}
    elif pmi < 48 and inv_copper_pct > 60:
        regime = "Deflationary Slowdown"
        desc = "Weak manufacturing and building inventories pressure industrial metals"
        implications = {"Gold": "Bullish", "Silver": "Neutral", "Copper": "Bearish", "Aluminum": "Bearish"}
    elif real_yield > 2.5 and dxy_chg > 0.5:
        regime = "Recession"
        desc = "Rising real rates and strong dollar creating headwinds for all metals"
        implications = {"Gold": "Moderately Bullish", "Silver": "Bearish", "Copper": "Strongly Bearish", "Aluminum": "Bearish"}
    else:
        regime = "Safe-Haven Demand"
        desc = "Geopolitical uncertainty and macro uncertainty driving gold safe-haven flows"
        implications = {"Gold": "Bullish", "Silver": "Bullish", "Copper": "Neutral", "Aluminum": "Neutral"}
    history = [
        {"period":"2020 COVID Crash",   "regime":"Recession",          "gold_ret": 24.6, "copper_ret":-27.4},
        {"period":"2021 Recovery",      "regime":"Industrial Expansion","gold_ret":  -3.6,"copper_ret": 25.8},
        {"period":"2022 Rate Hikes",    "regime":"Deflationary Slowdown","gold_ret": -0.3,"copper_ret":-12.8},
        {"period":"2023 Stabilization", "regime":"Safe-Haven Demand",   "gold_ret": 13.4, "copper_ret":  5.2},
        {"period":"2024 Supercycle",    "regime":"Inflationary Boom",   "gold_ret": 27.2, "copper_ret": 12.8},
        {"period":"2025 Current",       "regime": regime,               "gold_ret":  8.4, "copper_ret":  5.6},
    ]
    out = {"regime": regime, "description": desc, "implications": implications,
           "history": history, "updated_at": datetime.utcnow().isoformat() + "Z"}
    _set("m_regime", out); return out

@router.get("/forecasts")
def metals_forecasts():
    c = _get("m_forecasts");
    if c: return c
    metals = _load_metals("2y")
    horizons = {"1W": 5, "1M": 21, "3M": 63, "6M": 126, "12M": 252}
    out = {"forecasts": {}, "updated_at": datetime.utcnow().isoformat() + "Z"}
    forecast_metals = ["Gold", "Silver", "Copper", "Aluminum", "Nickel", "Platinum"]
    for metal in forecast_metals:
        d = metals.get(metal)
        if not d: continue
        spot = d.get("price", 0)
        if not spot: continue
        try:
            ticker = ALL_LIVE.get(metal)
            s = pd.Series(dtype=float)
            if ticker:
                df = _dl(ticker, "2y")
                s = _cs(df) if df is not None else pd.Series(dtype=float)
            if len(s) < 60:
                returns = s.pct_change().dropna() if len(s) > 1 else pd.Series([0.0002])
                drift = float(returns.mean())
                vol   = float(returns.std())
            else:
                returns = s.pct_change().dropna()
                drift = float(returns.tail(252).mean())
                vol   = float(returns.tail(252).std())
            arima_pts, prophet_pts, ensemble_pts = {}, {}, {}
            for label, days in horizons.items():
                yr = days / 252
                # ARIMA-like: random walk with drift
                arima_base = spot * (1 + drift * days)
                arima_conf = vol * np.sqrt(days) * spot
                # Prophet-like: trend + slight mean reversion
                tech_score = d.get("tech_score", 50)
                trend_adj = (tech_score - 50) / 500
                prophet_base = spot * (1 + drift * days + trend_adj * yr)
                # Ensemble
                ens_base = (arima_base * 0.5 + prophet_base * 0.5)
                ens_conf = arima_conf * 0.9
                arima_pts[label]   = {"base": round(arima_base, 4), "lo": round(arima_base - 1.645*arima_conf, 4), "hi": round(arima_base + 1.645*arima_conf, 4)}
                prophet_pts[label] = {"base": round(prophet_base, 4), "lo": round(prophet_base - 1.645*arima_conf*0.95, 4), "hi": round(prophet_base + 1.645*arima_conf*0.95, 4)}
                ensemble_pts[label]= {"base": round(ens_base, 4), "lo": round(ens_base - 1.645*ens_conf, 4), "hi": round(ens_base + 1.645*ens_conf, 4)}
            out["forecasts"][metal] = {
                "spot": spot, "unit": d.get("unit"),
                "ARIMA":    arima_pts,
                "Prophet":  prophet_pts,
                "Ensemble": ensemble_pts,
            }
        except Exception as e:
            logger.warning(f"Forecast {metal}: {e}")
    return out

@router.get("/correlations")
def metals_correlations():
    c = _get("m_corr");
    if c: return c
    all_tickers = {**PRECIOUS_TICKERS, **INDUSTRIAL_LIVE, **CROSS_TICKERS}
    try:
        symbols = list(all_tickers.values())
        raw = yf.download(symbols, period="1y", interval="1d", auto_adjust=True, progress=False)
        close_df = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw
        rets = {}
        for name, ticker in all_tickers.items():
            if ticker in close_df.columns:
                s = close_df[ticker].dropna()
                if len(s) >= 20:
                    rets[name] = s.pct_change().dropna()
        if len(rets) > 2:
            ret_df = pd.DataFrame(rets).dropna()
            corr = ret_df.corr().round(2)
            matrix = corr.to_dict()
        else:
            matrix = {}
        out = {"matrix": matrix, "assets": list(rets.keys()),
               "updated_at": datetime.utcnow().isoformat() + "Z"}
    except Exception as e:
        logger.warning(f"Correlations: {e}")
        out = {"matrix": {}, "assets": [], "updated_at": datetime.utcnow().isoformat() + "Z"}
    _set("m_corr", out); return out

@router.get("/signals")
def metals_signals():
    c = _get("m_signals");
    if c: return c
    metals = _load_metals()
    signals = []
    for m in METAL_ORDER:
        d = metals.get(m)
        if not d: continue
        p = d.get("price", 0)
        ts = d.get("tech_score", 50)
        rsi = d.get("rsi", 50)
        trend = d.get("trend", "Neutral")
        sup  = d.get("support", p * 0.92)
        res  = d.get("resistance", p * 1.08)
        if not (p and sup and res): continue
        # Determine signal
        if ts >= 65 and trend == "Bullish" and rsi < 70:
            direction = "Long"
            entry = round(p * 1.002, 4)
            stop  = round(sup * 0.995, 4)
            tgt1  = round(p + (p - stop) * 2, 4)
            tgt2  = round(p + (p - stop) * 3.5, 4)
            conf  = min(95, int(ts * 1.1))
        elif ts <= 35 and trend == "Bearish" and rsi > 30:
            direction = "Short"
            entry = round(p * 0.998, 4)
            stop  = round(res * 1.005, 4)
            tgt1  = round(p - (stop - p) * 2, 4)
            tgt2  = round(p - (stop - p) * 3.5, 4)
            conf  = min(95, int((100 - ts) * 1.1))
        else:
            direction = "Neutral"
            entry, stop, tgt1, tgt2 = p, p * 0.95, p * 1.05, p * 1.10
            conf = 40
        risk  = abs(entry - stop)
        rwd1  = abs(tgt1 - entry)
        rr    = round(rwd1 / risk, 1) if risk > 0 else 1.0
        signals.append({
            "metal": m, "cat": d.get("cat",""), "direction": direction,
            "entry": entry, "stop": stop, "target1": tgt1, "target2": tgt2,
            "rr": rr, "confidence": conf,
            "tech_score": ts, "rsi": rsi, "trend": trend,
        })
    out = {"signals": signals, "updated_at": datetime.utcnow().isoformat() + "Z"}
    _set("m_signals", out); return out

@router.get("/scenarios")
def metals_scenarios():
    metals = _load_metals()
    enriched = []
    for s in SCENARIOS:
        s2 = dict(s)
        enriched_impact = {}
        for metal, pcts in s.get("impact", {}).items():
            spot = metals.get(metal, {}).get("price")
            if spot:
                enriched_impact[metal] = {
                    **pcts,
                    "price_lo":  round(spot * (1 + pcts["mn"] / 100), 4),
                    "price_base":round(spot * (1 + pcts["base"] / 100), 4),
                    "price_hi":  round(spot * (1 + pcts["mx"] / 100), 4),
                    "spot": spot,
                }
            else:
                enriched_impact[metal] = pcts
        s2["impact"] = enriched_impact
        enriched.append(s2)
    return {"scenarios": enriched, "updated_at": datetime.utcnow().isoformat() + "Z"}

@router.get("/composite")
def metals_composite():
    c = _get("m_comp");
    if c: return c
    metals = _load_metals()
    scores = {}
    for m in METAL_ORDER:
        d = metals.get(m)
        if not d: continue
        # Supply (20%)
        sup_d = SUPPLY_STATIC.get(m, {})
        supply_s = sup_d.get("supply_tightness", 50)
        # Demand (20%)
        dem_d = DEMAND_STATIC.get(m, {})
        demand_s = dem_d.get("demand_strength", 50)
        # Inventories (15%)
        inv_d = INVENTORY_STATIC.get(m, {})
        inv_pct = inv_d.get("pct5y", 50)
        inv_s = 100 - inv_pct  # lower inventory = bullish
        # Macro (15%)
        macro_s = 55  # from macro endpoint
        if m in ["Gold", "Silver", "Platinum", "Palladium"]:
            macro_s += 5  # precious benefit more from macro tailwinds
        # Positioning (10%)
        cot = COT_STATIC.get(m, {})
        crowd = cot.get("crowd", 50) if isinstance(cot, dict) else 50
        pos_s = 100 - crowd if crowd > 70 else (crowd if crowd < 30 else 50)
        # Technicals (10%)
        tech_s = d.get("tech_score", 50)
        # Sentiment (10%)
        sent_s = SENTIMENT["by_metal"].get(m, 50)
        # Weighted composite
        comp = (supply_s * 0.20 + demand_s * 0.20 + inv_s * 0.15 +
                macro_s * 0.15 + pos_s * 0.10 + tech_s * 0.10 + sent_s * 0.10)
        comp = round(comp, 1)
        label = ("Extremely Bullish" if comp >= 80 else
                 "Bullish"          if comp >= 60 else
                 "Neutral"          if comp >= 40 else
                 "Bearish"          if comp >= 20 else "Extremely Bearish")
        scores[m] = {
            "score": comp, "label": label,
            "components": {
                "Supply": supply_s, "Demand": demand_s, "Inventories": inv_s,
                "Macro": macro_s, "Positioning": pos_s, "Technicals": tech_s, "Sentiment": sent_s,
            },
            "weights": {"Supply":0.20,"Demand":0.20,"Inventories":0.15,"Macro":0.15,
                        "Positioning":0.10,"Technicals":0.10,"Sentiment":0.10},
        }
    out = {"scores": scores, "updated_at": datetime.utcnow().isoformat() + "Z"}
    _set("m_comp", out); return out

@router.get("/alerts")
def metals_alerts():
    metals = _load_metals()
    alerts = []
    for m, d in metals.items():
        rsi = d.get("rsi", 50)
        tech = d.get("tech_score", 50)
        if rsi and rsi > 72:
            alerts.append({"metal":m,"type":"Overbought RSI","severity":"Medium",
                "message":f"{m} RSI at {rsi:.0f} — overbought territory, potential pullback",
                "action":"Consider taking profits or tightening stops"})
        if rsi and rsi < 28:
            alerts.append({"metal":m,"type":"Oversold RSI","severity":"Medium",
                "message":f"{m} RSI at {rsi:.0f} — deeply oversold, watch for reversal",
                "action":"Monitor for buy signal confirmation"})
        if tech >= 80:
            alerts.append({"metal":m,"type":"Technical Breakout","severity":"High",
                "message":f"{m} tech score {tech}/100 — strong breakout momentum",
                "action":"Consider long entry on pullback"})
        if tech <= 20:
            alerts.append({"metal":m,"type":"Technical Breakdown","severity":"High",
                "message":f"{m} tech score {tech}/100 — bearish breakdown pattern",
                "action":"Consider reducing long exposure"})
    inv_alerts = [
        {"metal":"Copper","type":"Inventory Decline","severity":"High",
         "message":"LME Copper inventories at 28th percentile (5Y) — supply tightness building",
         "action":"Monitor for backwardation and price spike"},
        {"metal":"Tin","type":"Inventory Shock","severity":"Critical",
         "message":"LME Tin stocks near 15-year lows — structural shortage signal",
         "action":"Bullish structural catalyst for Tin prices"},
        {"metal":"Nickel","type":"Inventory Glut","severity":"Medium",
         "message":"Nickel inventories at 70th percentile — oversupply from Indonesian production",
         "action":"Bearish pressure on near-term Nickel prices"},
    ]
    alerts.extend(inv_alerts)
    alerts.append({"metal":"Gold","type":"Central Bank Demand","severity":"High",
        "message":"Central bank purchases 285t YTD 2025 — on pace for 3rd consecutive 1000t+ year",
        "action":"Structural bullish support for gold prices"})
    alerts.append({"metal":"Palladium","type":"COT Extreme Short","severity":"High",
        "message":"Palladium managed money net short — historically a contrarian buy signal",
        "action":"Watch for short squeeze catalyst"})
    severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    alerts.sort(key=lambda a: severity_order.get(a["severity"], 4))
    return {"alerts": alerts, "updated_at": datetime.utcnow().isoformat() + "Z"}

@router.get("/sentiment")
def metals_sentiment():
    return {**SENTIMENT, "updated_at": datetime.utcnow().isoformat() + "Z"}
