"""
Rare Earths & Critical Minerals Intelligence API.

GET /api/rare-earths/overview    supercycle score, KPIs, regime
GET /api/rare-earths/elements    RE element prices & metadata
GET /api/rare-earths/minerals    critical minerals data
GET /api/rare-earths/supply      country production + processing capacity
GET /api/rare-earths/china       China dependency dashboard
GET /api/rare-earths/demand      defense + EV/clean energy demand
GET /api/rare-earths/companies   mining stocks (real yfinance + technicals)
GET /api/rare-earths/projects    strategic projects + geo risks + inst flows
GET /api/rare-earths/composite   composite bullishness score + trading signals
"""
from __future__ import annotations

import asyncio
import concurrent.futures
import logging
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter()
_EXEC = concurrent.futures.ThreadPoolExecutor(max_workers=6)

# ── Rare Earth Elements ────────────────────────────────────────────────────────
RE_ELEMENTS = [
    {"symbol":"Nd","name":"Neodymium",    "type":"LREE","price_kg":68.5, "chg_7d":2.3, "chg_30d":-4.1,"chg_1y":12.5,"criticality":95,"deficit":True, "china_pct":85,"use":"NdFeB Permanent Magnets"},
    {"symbol":"Pr","name":"Praseodymium", "type":"LREE","price_kg":82.0, "chg_7d":1.8, "chg_30d":-3.2,"chg_1y":8.4, "criticality":92,"deficit":True, "china_pct":82,"use":"NdFeB Magnets, Alloys"},
    {"symbol":"Ce","name":"Cerium",       "type":"LREE","price_kg":2.1,  "chg_7d":-0.5,"chg_30d":1.2, "chg_1y":-8.3,"criticality":45,"deficit":False,"china_pct":70,"use":"Catalysts, Glass Polishing"},
    {"symbol":"La","name":"Lanthanum",    "type":"LREE","price_kg":1.8,  "chg_7d":-0.3,"chg_30d":0.8, "chg_1y":-5.2,"criticality":42,"deficit":False,"china_pct":70,"use":"Fluid Cracking Catalysts"},
    {"symbol":"Dy","name":"Dysprosium",   "type":"HREE","price_kg":278.0,"chg_7d":3.5, "chg_30d":8.2, "chg_1y":18.3,"criticality":98,"deficit":True, "china_pct":90,"use":"High-Temp NdFeB Magnets"},
    {"symbol":"Tb","name":"Terbium",      "type":"HREE","price_kg":920.0,"chg_7d":5.2, "chg_30d":12.1,"chg_1y":22.4,"criticality":99,"deficit":True, "china_pct":92,"use":"Magnets, Phosphors, Sensors"},
    {"symbol":"Y", "name":"Yttrium",      "type":"HREE","price_kg":34.5, "chg_7d":0.8, "chg_30d":-1.5,"chg_1y":4.2, "criticality":78,"deficit":False,"china_pct":75,"use":"Phosphors, Ceramics"},
]

# ── Critical Minerals ─────────────────────────────────────────────────────────
CRITICAL_MINERALS = [
    {"name":"Lithium",  "type":"Battery",  "unit":"$/t", "price":13500, "chg_7d":-2.1,"chg_30d":5.4, "chg_1y":-58.2,"prod_kt":180,  "demand_kt":195,  "deficit_kt":-15, "china_pct":65,"criticality":95},
    {"name":"Cobalt",   "type":"Battery",  "unit":"$/t", "price":27500, "chg_7d":1.5, "chg_30d":-3.2,"chg_1y":-32.1,"prod_kt":220,  "demand_kt":235,  "deficit_kt":-15, "china_pct":72,"criticality":88},
    {"name":"Nickel",   "type":"Battery",  "unit":"$/t", "price":16800, "chg_7d":-0.8,"chg_30d":4.1, "chg_1y":-18.5,"prod_kt":3300, "demand_kt":3200, "deficit_kt":100, "china_pct":45,"criticality":82},
    {"name":"Graphite", "type":"Battery",  "unit":"$/t", "price":720,   "chg_7d":0.5, "chg_30d":-1.8,"chg_1y":-24.3,"prod_kt":3500, "demand_kt":3300, "deficit_kt":200, "china_pct":85,"criticality":90},
    {"name":"Manganese","type":"Battery",  "unit":"$/t", "price":1850,  "chg_7d":-0.3,"chg_30d":2.1, "chg_1y":-12.8,"prod_kt":22000,"demand_kt":21500,"deficit_kt":500, "china_pct":38,"criticality":62},
    {"name":"Tungsten", "type":"Strategic","unit":"$/t", "price":32500, "chg_7d":2.8, "chg_30d":6.5, "chg_1y":24.2, "prod_kt":85,   "demand_kt":80,   "deficit_kt":5,   "china_pct":82,"criticality":94},
    {"name":"Gallium",  "type":"Strategic","unit":"$/kg","price":420,   "chg_7d":4.2, "chg_30d":15.8,"chg_1y":68.5, "prod_kt":0.32, "demand_kt":0.30, "deficit_kt":0.02,"china_pct":94,"criticality":96},
    {"name":"Germanium","type":"Strategic","unit":"$/kg","price":1680,  "chg_7d":3.1, "chg_30d":12.4,"chg_1y":85.2, "prod_kt":0.14, "demand_kt":0.13, "deficit_kt":0.01,"china_pct":80,"criticality":92},
    {"name":"Antimony", "type":"Strategic","unit":"$/t", "price":28000, "chg_7d":5.8, "chg_30d":22.3,"chg_1y":142.5,"prod_kt":82,   "demand_kt":78,   "deficit_kt":4,   "china_pct":48,"criticality":89},
    {"name":"Titanium", "type":"Strategic","unit":"$/t", "price":8500,  "chg_7d":0.4, "chg_30d":1.2, "chg_1y":6.8,  "prod_kt":7200, "demand_kt":7000, "deficit_kt":200, "china_pct":35,"criticality":76},
]

# ── Country Production ────────────────────────────────────────────────────────
COUNTRY_PRODUCTION = [
    {"country":"China",         "re_prod_kt":270, "share_pct":70.3,"yoy_pct":4.2, "restrictions":True, "risk":"CRITICAL"},
    {"country":"Australia",     "re_prod_kt":48,  "share_pct":12.5,"yoy_pct":8.5, "restrictions":False,"risk":"LOW"},
    {"country":"United States", "re_prod_kt":14,  "share_pct":3.6, "yoy_pct":25.0,"restrictions":False,"risk":"LOW"},
    {"country":"Myanmar",       "re_prod_kt":38,  "share_pct":9.9, "yoy_pct":-5.2,"restrictions":True, "risk":"HIGH"},
    {"country":"Vietnam",       "re_prod_kt":12,  "share_pct":3.1, "yoy_pct":15.0,"restrictions":False,"risk":"MEDIUM"},
    {"country":"India",         "re_prod_kt":2.9, "share_pct":0.6, "yoy_pct":40.0,"restrictions":False,"risk":"LOW"},
]

# ── Processing Capacity by Region ─────────────────────────────────────────────
PROCESSING = [
    {"region":"China",         "re_pct":85,"li_pct":65,"co_pct":72,"projects":12,"utilization":88,"score":95},
    {"region":"United States", "re_pct":4, "li_pct":8, "co_pct":5, "projects":8, "utilization":62,"score":45},
    {"region":"Australia",     "re_pct":6, "li_pct":18,"co_pct":3, "projects":6, "utilization":78,"score":38},
    {"region":"Europe",        "re_pct":2, "li_pct":5, "co_pct":12,"projects":10,"utilization":55,"score":52},
    {"region":"Japan",         "re_pct":3, "li_pct":4, "co_pct":8, "projects":3, "utilization":72,"score":48},
]

# ── China Dependency ──────────────────────────────────────────────────────────
CHINA = {
    "mining_pct":70.3,"refining_pct":87.0,"magnet_pct":92.0,"risk_score":88,
    "controls":[
        {"mineral":"Gallium",  "date":"2023-07-01","severity":"HIGH"},
        {"mineral":"Germanium","date":"2023-07-01","severity":"HIGH"},
        {"mineral":"Graphite", "date":"2023-10-20","severity":"HIGH"},
        {"mineral":"Antimony", "date":"2024-08-15","severity":"CRITICAL"},
    ],
    "alt_sources":[
        {"mineral":"Rare Earths","source":"Australia (Lynas), USA (MP Materials)","readiness_pct":15},
        {"mineral":"Lithium",    "source":"Chile, Argentina, Australia",           "readiness_pct":65},
        {"mineral":"Gallium",    "source":"Canada, Germany, Japan",                "readiness_pct":8},
        {"mineral":"Graphite",   "source":"Mozambique, Canada, Tanzania",          "readiness_pct":20},
    ],
}

# ── Defense Applications ──────────────────────────────────────────────────────
DEFENSE = [
    {"system":"F-35 Fighter",        "re_kg":418, "minerals":["Nd","Dy","Co","Ti"],"annual":156, "priority":"CRITICAL"},
    {"system":"Guided Missiles",      "re_kg":4.5, "minerals":["Nd","Dy","W"],       "annual":8000,"priority":"CRITICAL"},
    {"system":"Patriot Radar",        "re_kg":220, "minerals":["Nd","Tb","Ga","Ge"], "annual":12,  "priority":"HIGH"},
    {"system":"Electronic Warfare",   "re_kg":85,  "minerals":["Nd","Dy","Ga","Ge"], "annual":340, "priority":"HIGH"},
    {"system":"Military Satellites",  "re_kg":65,  "minerals":["Nd","Dy","Co","Y"],  "annual":200, "priority":"HIGH"},
    {"system":"Attack Submarines",    "re_kg":1200,"minerals":["Nd","Pr","Co","Ti"], "annual":2,   "priority":"CRITICAL"},
]

# ── EV / Clean Energy ─────────────────────────────────────────────────────────
EV_DEMAND = {
    "ev_sales_2024m":17.1,"ev_sales_2025em":22.5,"ev_sales_2030em":55.0,
    "ev_cagr_pct":21.5,
    "re_per_ev_kg":2.8,"li_per_ev_kg":8.5,"co_per_ev_kg":10.2,"ni_per_ev_kg":35.0,
    "wind_gw_2024":280,"wind_gw_2030e":650,"re_per_mw_kg":600,
    "solar_gw_2024":420,"solar_gw_2030e":1200,
    "storage_gwh_2024":45,"storage_gwh_2030e":280,
    "re_ev_demand_kt_2024":47.9,"re_ev_demand_kt_2030e":154.0,
    "re_wind_demand_kt_2024":168.0,"re_wind_demand_kt_2030e":390.0,
    "demand_forecast":[
        {"year":2024,"ev_m":17.1,"wind_gw":280,"re_demand_kt":216},
        {"year":2025,"ev_m":22.5,"wind_gw":320,"re_demand_kt":256},
        {"year":2026,"ev_m":28.0,"wind_gw":370,"re_demand_kt":302},
        {"year":2027,"ev_m":34.0,"wind_gw":430,"re_demand_kt":358},
        {"year":2028,"ev_m":40.5,"wind_gw":495,"re_demand_kt":418},
        {"year":2029,"ev_m":47.5,"wind_gw":570,"re_demand_kt":486},
        {"year":2030,"ev_m":55.0,"wind_gw":650,"re_demand_kt":562},
    ],
}

# ── Permanent Magnets ─────────────────────────────────────────────────────────
MAGNETS = {
    "market_b":24.8,"cagr_pct":11.2,"china_pct":92,
    "segments":{"EV Motors":38,"Wind Turbines":22,"Industrial":20,"Defense":8,"Consumer":12},
    "nd_demand_2024_kt":82,"nd_demand_2030e_kt":145,
    "dy_demand_2024_kt":1.8,"dy_demand_2030e_kt":3.2,
    "demand_index":82,"supply_risk":"HIGH",
    "key_producers":["Zhongke Sanhuan (CN)","Earth-Panda (CN)","VAC Germany","TDK Japan","Shin-Etsu (JP)"],
}

# ── Mining Stocks ─────────────────────────────────────────────────────────────
PUBLIC_STOCKS = [
    {"ticker":"MP",   "company":"MP Materials",       "type":"Pure-Play RE","exposure":95},
    {"ticker":"ALB",  "company":"Albemarle",           "type":"Lithium",     "exposure":85},
    {"ticker":"SQM",  "company":"SQM",                "type":"Lithium",     "exposure":80},
    {"ticker":"LAC",  "company":"Lithium Americas",    "type":"Li Developer","exposure":100},
    {"ticker":"RIO",  "company":"Rio Tinto",           "type":"Diversified", "exposure":25},
    {"ticker":"BHP",  "company":"BHP Group",           "type":"Diversified", "exposure":20},
    {"ticker":"VALE", "company":"Vale",                "type":"Nickel/Iron", "exposure":30},
    {"ticker":"FCX",  "company":"Freeport-McMoRan",    "type":"Copper",      "exposure":45},
    {"ticker":"REMX", "company":"VanEck RE ETF",       "type":"ETF",         "exposure":100},
    {"ticker":"PLL",  "company":"Piedmont Lithium",    "type":"Li Developer","exposure":100},
]

# ── Strategic Projects ────────────────────────────────────────────────────────
PROJECTS = [
    {"name":"Mountain Pass Expansion","company":"MP Materials",   "region":"USA",      "mineral":"Rare Earths","capex_m":700, "capacity_kt":5, "status":"CONSTRUCTION","year":2026,"govt_m":58},
    {"name":"Thacker Pass Mine",      "company":"Lithium Americas","region":"USA",     "mineral":"Lithium",    "capex_m":2260,"capacity_kt":40,"status":"CONSTRUCTION","year":2027,"govt_m":2260},
    {"name":"Kalgoorlie RE Refinery", "company":"Iluka Resources","region":"Australia","mineral":"Rare Earths","capex_m":1000,"capacity_kt":3, "status":"APPROVED",    "year":2026,"govt_m":400},
    {"name":"European RE Hub",        "company":"Solvay/REEtec",  "region":"Europe",   "mineral":"Rare Earths","capex_m":850, "capacity_kt":4, "status":"DEVELOPMENT", "year":2027,"govt_m":450},
    {"name":"India RE Mission",       "company":"IREL India",     "region":"India",    "mineral":"Rare Earths","capex_m":800, "capacity_kt":2, "status":"DEVELOPMENT", "year":2028,"govt_m":800},
    {"name":"Canada Lithium Project", "company":"Standard Lithium","region":"Canada",  "mineral":"Lithium",    "capex_m":320, "capacity_kt":8, "status":"APPROVED",    "year":2026,"govt_m":50},
    {"name":"Lynas Kalgoorlie Plant", "company":"Lynas",          "region":"Australia","mineral":"Rare Earths","capex_m":500, "capacity_kt":10,"status":"OPERATING",   "year":2024,"govt_m":0},
    {"name":"US DoD Cobalt Reserve",  "company":"US Government",  "region":"USA",      "mineral":"Cobalt",     "capex_m":150, "capacity_kt":3, "status":"APPROVED",    "year":2025,"govt_m":150},
]

# ── Geopolitical Risks ────────────────────────────────────────────────────────
GEO_RISKS = [
    {"risk":"China RE Export Controls",     "severity":"CRITICAL","prob":85,"impact":95,"detail":"China expanding export license requirements for RE oxides, metals and alloys"},
    {"risk":"Myanmar HREE Disruption",      "severity":"HIGH",    "prob":70,"impact":72,"detail":"Military junta controlling northern HREE mines; political instability accelerating"},
    {"risk":"US-China Trade War",           "severity":"HIGH",    "prob":65,"impact":88,"detail":"Section 232 tariffs and counter-restrictions on critical mineral supply chains"},
    {"risk":"DRC Cobalt Nationalisation",   "severity":"MEDIUM",  "prob":40,"impact":75,"detail":"DRC increasing royalties; CODELCO-style state control model under consideration"},
    {"risk":"South America Li Nationalism", "severity":"MEDIUM",  "prob":55,"impact":68,"detail":"Chile/Argentina lithium nationalization; state company expansion across LatAm"},
    {"risk":"Russia Titanium Sanctions",    "severity":"HIGH",    "prob":80,"impact":65,"detail":"Western sanctions limiting Russian aerospace-grade titanium sponge exports"},
    {"risk":"India-China Border Tensions",  "severity":"LOW",     "prob":30,"impact":50,"detail":"Indian RE deposits in contested northeastern border regions; access risk"},
    {"risk":"Seabed Mining Moratoriums",    "severity":"LOW",     "prob":25,"impact":45,"detail":"Regulatory opposition delaying polymetallic nodule deep-sea mineral extraction"},
]

# ── Institutional Flows ───────────────────────────────────────────────────────
FLOWS = {
    "fund_flow_30d_b":4.2,"etf_aum_b":28.5,"positioning":"LONG","smart_score":72,
    "etfs":[
        {"name":"REMX","full":"VanEck Rare Earth ETF","aum_b":0.82,"flow_30d_m":45, "ytd":18.5},
        {"name":"LIT", "full":"Global X Lithium ETF", "aum_b":1.24,"flow_30d_m":-12,"ytd":-8.2},
        {"name":"PICK","full":"iShares Mining ETF",   "aum_b":2.15,"flow_30d_m":85, "ytd":12.4},
        {"name":"XME", "full":"SPDR Metals & Mining", "aum_b":1.98,"flow_30d_m":62, "ytd":9.8},
        {"name":"COPX","full":"Global X Copper Miners","aum_b":0.75,"flow_30d_m":38,"ytd":22.1},
    ],
    "hedge_funds":[
        {"fund":"BlackRock",      "stance":"OVERWEIGHT","focus":"Rare Earths, Lithium"},
        {"fund":"Paulson & Co",   "stance":"LONG",      "focus":"MP Materials, Gold Royalties"},
        {"fund":"Soros Fund Mgmt","stance":"OVERWEIGHT","focus":"Lithium Supply Chain"},
        {"fund":"Glenview Capital","stance":"LONG",     "focus":"Copper, Critical Minerals"},
    ],
}


# ── Technical Analysis ────────────────────────────────────────────────────────

def _safe_float(v, default=None):
    try:
        f = float(v)
        return None if (f != f) else f
    except Exception:
        return default


def _compute_rsi(prices: pd.Series, period=14) -> float | None:
    if len(prices) < period + 1:
        return None
    delta = prices.diff().dropna()
    gain  = delta.clip(lower=0).rolling(period).mean()
    loss  = (-delta.clip(upper=0)).rolling(period).mean()
    if loss.iloc[-1] == 0:
        return 100.0
    return round(float(100 - 100 / (1 + gain.iloc[-1] / loss.iloc[-1])), 1)


def _compute_macd(prices: pd.Series) -> dict:
    ema12 = prices.ewm(span=12, adjust=False).mean()
    ema26 = prices.ewm(span=26, adjust=False).mean()
    macd  = ema12 - ema26
    sig   = macd.ewm(span=9, adjust=False).mean()
    hist  = macd - sig
    return {
        "macd": round(float(macd.iloc[-1]), 3),
        "signal": round(float(sig.iloc[-1]), 3),
        "histogram": round(float(hist.iloc[-1]), 3),
        "bullish": bool(hist.iloc[-1] > 0),
    }


def _compute_signal(rsi, macd_bull, price, ema20, ema50, ema200, ytd) -> dict:
    score = 50
    if rsi is not None:
        if rsi < 30:   score += 20
        elif rsi < 45: score += 10
        elif rsi > 70: score -= 20
        elif rsi > 60: score -= 8
    score += 10 if macd_bull else -10
    if price and ema200 and price > ema200: score += 10
    if price and ema50  and price > ema50:  score += 8
    if price and ema20  and price > ema20:  score += 5
    if ytd:
        if ytd > 50:    score += 8
        elif ytd > 20:  score += 4
        elif ytd < -30: score -= 10
        elif ytd < -10: score -= 5
    score = max(0, min(100, score))
    if   score >= 75: sig = "STRONG BUY"
    elif score >= 60: sig = "BUY"
    elif score >= 40: sig = "HOLD"
    elif score >= 25: sig = "SELL"
    else:             sig = "STRONG SELL"
    target = stop = None
    if price:
        if sig in ("BUY","STRONG BUY"):
            target = round(price * (1 + (score - 50) / 180), 2)
            stop   = round((ema50 or price * 0.9) * 0.97, 2)
        else:
            target = round(price * (1 - (50 - score) / 200), 2)
            stop   = round((ema20 or price * 1.05) * 1.03, 2)
    return {"signal": sig, "score": score, "target": target, "stop": stop,
            "exp_return_pct": round((target / price - 1) * 100, 1) if (target and price) else None}


# ── Market data cache ─────────────────────────────────────────────────────────
_mkt_cache: dict = {}
_CACHE_TTL = 300


def _fetch_mining_markets() -> list[dict]:
    now = datetime.now()
    if _mkt_cache.get("ts") and (now - _mkt_cache["ts"]).seconds < _CACHE_TTL and _mkt_cache.get("data"):
        return _mkt_cache["data"]

    tickers   = [s["ticker"] for s in PUBLIC_STOCKS]
    start_2y  = (datetime.today() - timedelta(days=730)).strftime("%Y-%m-%d")
    ytd_start = f"{datetime.today().year}-01-01"
    today     = datetime.today().strftime("%Y-%m-%d")

    try:
        raw = yf.download(tickers, start=start_2y, end=today, progress=False, auto_adjust=True, threads=True)
        cl  = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw
    except Exception as e:
        logger.warning(f"Mining market download failed: {e}")
        return []

    try:
        raw_ytd = yf.download(tickers, start=ytd_start, end=today, progress=False, auto_adjust=True, threads=True)
        cl_ytd  = raw_ytd["Close"] if isinstance(raw_ytd.columns, pd.MultiIndex) else raw_ytd
    except Exception:
        cl_ytd = pd.DataFrame()

    stock_meta = {s["ticker"]: s for s in PUBLIC_STOCKS}
    results = []

    for tk in tickers:
        if tk not in cl.columns:
            continue
        px = cl[tk].dropna()
        if px.empty:
            continue
        cur = _safe_float(px.iloc[-1])
        if not cur:
            continue

        def ret(n):
            if len(px) <= n:
                return None
            old = _safe_float(px.iloc[-1 - n])
            return round((cur / old - 1) * 100, 1) if old else None

        ytd_ref = None
        if not cl_ytd.empty and tk in cl_ytd.columns:
            ys = cl_ytd[tk].dropna()
            if not ys.empty:
                ytd_ref = _safe_float(ys.iloc[0])
        ytd = round((cur / ytd_ref - 1) * 100, 1) if ytd_ref else None

        rsi    = _compute_rsi(px)
        macd_d = _compute_macd(px) if len(px) >= 35 else {}
        ema20  = _safe_float(px.ewm(span=20,  adjust=False).mean().iloc[-1])
        ema50  = _safe_float(px.ewm(span=50,  adjust=False).mean().iloc[-1])
        ema200 = _safe_float(px.ewm(span=200, adjust=False).mean().iloc[-1])
        sig_d  = _compute_signal(rsi, macd_d.get("bullish", False), cur, ema20, ema50, ema200, ytd)

        mkt_cap = None
        try:
            info    = yf.Ticker(tk).fast_info
            mkt_cap = _safe_float(getattr(info, "market_cap", None))
        except Exception:
            pass

        results.append({
            **stock_meta[tk],
            "price":       round(cur, 2),
            "mkt_cap_b":   round(mkt_cap / 1e9, 2) if mkt_cap else None,
            "ret_1m":  ret(21), "ret_3m": ret(63), "ret_6m": ret(126),
            "ret_ytd": ytd, "ret_1y": ret(252),
            "rsi": rsi, "macd": macd_d,
            "ema20":  round(ema20,  2) if ema20  else None,
            "ema50":  round(ema50,  2) if ema50  else None,
            "ema200": round(ema200, 2) if ema200 else None,
            "vs_ema20":  round((cur / ema20  - 1) * 100, 1) if ema20  else None,
            "vs_ema50":  round((cur / ema50  - 1) * 100, 1) if ema50  else None,
            "vs_ema200": round((cur / ema200 - 1) * 100, 1) if ema200 else None,
            **sig_d,
        })

    _mkt_cache["ts"]   = now
    _mkt_cache["data"] = results
    return results


# ── Scoring ───────────────────────────────────────────────────────────────────

def _compute_supercycle() -> dict:
    hree_deficit = [e for e in RE_ELEMENTS if e["type"] == "HREE" and e["deficit"]]
    avg_1y = float(np.mean([e["chg_1y"] for e in hree_deficit])) if hree_deficit else 0
    price_comp = min(25, max(0, (avg_1y + 10) / 50 * 25))

    china_share = COUNTRY_PRODUCTION[0]["share_pct"]
    conc_comp   = min(25, (china_share / 90) * 25)

    deficit_count = sum(1 for m in CRITICAL_MINERALS if m["deficit_kt"] < 0) + \
                    sum(1 for e in RE_ELEMENTS if e["deficit"])
    total_items   = len(CRITICAL_MINERALS) + len(RE_ELEMENTS)
    deficit_comp  = min(25, (deficit_count / total_items) * 25 + 5)

    demand_comp = min(25, (EV_DEMAND["ev_cagr_pct"] / 30) * 20 + 3)

    total = int(round(price_comp + conc_comp + deficit_comp + demand_comp))
    total = max(0, min(100, total))

    if   total < 20: regime = "Oversupply"
    elif total < 40: regime = "Weak Demand"
    elif total < 60: regime = "Balanced Market"
    elif total < 80: regime = "Tight Supply"
    else:            regime = "Critical Shortage"

    return {
        "score": total, "regime": regime,
        "components": {
            "price_momentum":       round(price_comp, 1),
            "supply_concentration": round(conc_comp, 1),
            "mineral_deficit":      round(deficit_comp, 1),
            "demand_growth":        round(demand_comp, 1),
        }
    }


def _compute_composite(markets: list[dict]) -> dict:
    hree_crit = [e["criticality"] for e in RE_ELEMENTS if e["type"] == "HREE"]
    supply = float(np.mean(hree_crit)) * 0.25

    china = CHINA["risk_score"] * 0.20

    ev = min(100, EV_DEMAND["ev_cagr_pct"] / 30 * 100) * 0.15

    crit_systems = sum(1 for d in DEFENSE if d["priority"] == "CRITICAL")
    defense = min(100, (crit_systems / len(DEFENSE)) * 130) * 0.15

    proc = CHINA["refining_pct"] * 0.10

    flows_comp = FLOWS["smart_score"] * 0.05

    tech_scores = [m.get("score", 50) for m in markets]
    tech = (float(np.mean(tech_scores)) if tech_scores else 50) * 0.10

    total = int(round(supply + china + ev + defense + proc + flows_comp + tech))
    total = max(0, min(100, total))

    if   total < 20: label = "Extremely Bearish"
    elif total < 40: label = "Bearish"
    elif total < 60: label = "Neutral"
    elif total < 80: label = "Bullish"
    else:            label = "Rare Earth Supercycle"

    return {
        "score": total, "label": label,
        "components": {
            "supply_tightness":    round(supply, 1),
            "china_dependency":    round(china, 1),
            "ev_demand":           round(ev, 1),
            "defense_demand":      round(defense, 1),
            "processing_capacity": round(proc, 1),
            "inst_flows":          round(flows_comp, 1),
            "technicals":          round(tech, 1),
        },
        "weights": {
            "supply_tightness":    25,
            "china_dependency":    20,
            "ev_demand":           15,
            "defense_demand":      15,
            "processing_capacity": 10,
            "inst_flows":           5,
            "technicals":          10,
        }
    }


def _generate_signals(markets: list[dict]) -> list[dict]:
    results = []
    for m in markets:
        price = m.get("price")
        if not price:
            continue
        sig   = m.get("signal", "HOLD")
        score = m.get("score", 50)
        results.append({
            "ticker":        m["ticker"],
            "company":       m["company"],
            "type":          m["type"],
            "exposure_pct":  m["exposure"],
            "price":         price,
            "signal":        sig,
            "score":         score,
            "target":        m.get("target"),
            "stop":          m.get("stop"),
            "exp_return_pct":m.get("exp_return_pct"),
            "confidence":    min(95, max(30, score)),
            "rsi":           m.get("rsi"),
            "ret_ytd":       m.get("ret_ytd"),
            "mkt_cap_b":     m.get("mkt_cap_b"),
        })
    results.sort(key=lambda x: x["score"], reverse=True)
    return results


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/overview")
async def get_overview():
    loop    = asyncio.get_event_loop()
    markets = await loop.run_in_executor(_EXEC, _fetch_mining_markets)
    sc      = _compute_supercycle()
    comp    = _compute_composite(markets)
    total_prod = sum(c["re_prod_kt"] for c in COUNTRY_PRODUCTION)
    return {
        "supercycle": sc,
        "composite":  comp,
        "kpis": {
            "global_re_prod_kt":      round(total_prod, 1),
            "china_share_pct":        COUNTRY_PRODUCTION[0]["share_pct"],
            "china_refining_pct":     CHINA["refining_pct"],
            "deficit_minerals":       sum(1 for m in CRITICAL_MINERALS if m["deficit_kt"] < 0),
            "ev_demand_re_kt_2024":   EV_DEMAND["re_ev_demand_kt_2024"],
            "magnet_demand_index":    MAGNETS["demand_index"],
            "active_export_controls": len(CHINA["controls"]),
        },
        "as_of": datetime.today().strftime("%Y-%m-%d %H:%M"),
    }


@router.get("/elements")
async def get_elements():
    ranked = sorted(RE_ELEMENTS, key=lambda x: x["criticality"], reverse=True)
    pricing_score = int(np.mean([
        min(100, max(0, e["chg_1y"] + 50))
        for e in RE_ELEMENTS
    ]))
    return {"elements": ranked, "pricing_score": pricing_score}


@router.get("/minerals")
async def get_minerals():
    battery   = [m for m in CRITICAL_MINERALS if m["type"] == "Battery"]
    strategic = [m for m in CRITICAL_MINERALS if m["type"] == "Strategic"]
    strength  = int(np.mean([m["criticality"] for m in CRITICAL_MINERALS]))
    return {"battery": battery, "strategic": strategic, "strength_score": strength}


@router.get("/supply")
async def get_supply():
    concentration = CHINA["risk_score"]
    return {
        "production":         COUNTRY_PRODUCTION,
        "processing":         PROCESSING,
        "concentration_score":concentration,
        "total_prod_kt":      round(sum(c["re_prod_kt"] for c in COUNTRY_PRODUCTION), 1),
    }


@router.get("/china")
async def get_china():
    return {"china": CHINA}


@router.get("/demand")
async def get_demand():
    defense_score = int(np.mean([
        95 if d["priority"] == "CRITICAL" else 75 if d["priority"] == "HIGH" else 50
        for d in DEFENSE
    ]))
    ev_score = min(100, int(EV_DEMAND["ev_cagr_pct"] / 30 * 100) + 15)
    return {
        "defense":       DEFENSE,
        "ev":            EV_DEMAND,
        "magnets":       MAGNETS,
        "defense_score": defense_score,
        "green_score":   ev_score,
    }


@router.get("/companies")
async def get_companies():
    loop    = asyncio.get_event_loop()
    markets = await loop.run_in_executor(_EXEC, _fetch_mining_markets)
    return {"stocks": markets, "count": len(markets), "as_of": datetime.today().strftime("%Y-%m-%d %H:%M")}


@router.get("/projects")
async def get_projects():
    total_capex = sum(p["capex_m"] for p in PROJECTS)
    total_govt  = sum(p["govt_m"]  for p in PROJECTS)
    capacity_score = min(100, int(total_govt / total_capex * 100) + 30)
    return {
        "projects":        PROJECTS,
        "geo_risks":       GEO_RISKS,
        "flows":           FLOWS,
        "capacity_score":  capacity_score,
        "total_capex_b":   round(total_capex / 1000, 2),
        "total_govt_b":    round(total_govt  / 1000, 2),
    }


@router.get("/composite")
async def get_composite():
    loop    = asyncio.get_event_loop()
    markets = await loop.run_in_executor(_EXEC, _fetch_mining_markets)
    comp    = _compute_composite(markets)
    signals = _generate_signals(markets)
    return {
        "composite": comp,
        "signals":   signals,
        "as_of":     datetime.today().strftime("%Y-%m-%d %H:%M"),
    }
