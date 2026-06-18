"""Generic chart history endpoint — stocks, memory prices, metals, metrics."""
from fastapi import APIRouter, HTTPException
import yfinance as yf
import numpy as np
from datetime import datetime
import time, logging

logger = logging.getLogger(__name__)
router = APIRouter()
_cache: dict = {}
CACHE_TTL = 3600

def _get(k):
    v = _cache.get(k)
    return v["data"] if v and time.time() - v["ts"] < CACHE_TTL else None

def _set(k, data):
    _cache[k] = {"ts": time.time(), "data": data}


# ── Interpolation helpers ──────────────────────────────────────────────────────

def _month_idx(date_str: str) -> int:
    """'Jan 2022' → integer months since Jan 2020."""
    abbrs = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    parts = date_str.split()
    return (int(parts[1]) - 2020) * 12 + abbrs.index(parts[0])

def _idx_to_str(idx: int) -> str:
    abbrs = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    year = 2020 + idx // 12
    month = idx % 12
    return f"{abbrs[month]} {year}"

def _interp_monthly(waypoints: list) -> list:
    """Linearly interpolate monthly values between (date_str, value) waypoints."""
    pts = [((_month_idx(d)), v) for d, v in waypoints]
    pts.sort(key=lambda x: x[0])
    result = []
    start, end = pts[0][0], pts[-1][0]
    for idx in range(start, end + 1):
        # find surrounding waypoints
        lo = hi = None
        for p in pts:
            if p[0] <= idx:
                lo = p
            elif hi is None:
                hi = p
                break
        if lo is None:
            val = pts[0][1]
        elif hi is None:
            val = pts[-1][1]
        elif lo[0] == hi[0]:
            val = lo[1]
        else:
            t = (idx - lo[0]) / (hi[0] - lo[0])
            val = lo[1] + t * (hi[1] - lo[1])
        result.append({"date": _idx_to_str(idx), "value": round(val, 4 if val < 0.1 else 3 if val < 1 else 2 if val < 100 else 1)})
    return result


# ── Memory price waypoints (realistic 2022-2026) ───────────────────────────────

_MEMORY_WAYPOINTS: dict = {
    # ── DRAM ──────────────────────────────────────────────────────────────────
    "ddr4-8gb": {
        "title": "DDR4 8GB Spot Price", "subtitle": "DRAM", "unit": "$/module",
        "waypoints": [
            ("Jan 2022",3.80),("Apr 2022",4.20),("Jul 2022",3.60),("Dec 2022",2.40),
            ("May 2023",1.40),("Oct 2023",0.95),("Jan 2024",1.00),("Jun 2024",1.18),
            ("Jan 2025",1.52),("Jul 2025",1.68),("Jan 2026",1.78),("Jun 2026",1.85),
        ],
    },
    "ddr4-16gb": {
        "title": "DDR4 16GB Spot Price", "subtitle": "DRAM", "unit": "$/module",
        "waypoints": [
            ("Jan 2022",7.20),("Apr 2022",7.80),("Jul 2022",6.80),("Dec 2022",4.60),
            ("May 2023",2.60),("Oct 2023",1.82),("Jan 2024",1.90),("Jun 2024",2.20),
            ("Jan 2025",2.80),("Jul 2025",3.10),("Jan 2026",3.35),("Jun 2026",3.45),
        ],
    },
    "ddr5-16gb": {
        "title": "DDR5 16GB Spot Price", "subtitle": "DRAM (Next-Gen)", "unit": "$/module",
        "waypoints": [
            ("Jan 2022",9.20),("Jun 2022",9.20),("Dec 2022",7.40),
            ("Jun 2023",4.20),("Dec 2023",2.90),("Jun 2024",3.40),
            ("Jan 2025",4.10),("Jul 2025",4.50),("Jan 2026",4.68),("Jun 2026",4.80),
        ],
    },
    "ddr5-32gb": {
        "title": "DDR5 32GB Spot Price", "subtitle": "DRAM (Next-Gen)", "unit": "$/module",
        "waypoints": [
            ("Jan 2022",18.00),("Jun 2022",18.50),("Dec 2022",14.20),
            ("Jun 2023",8.40),("Dec 2023",5.40),("Jun 2024",6.80),
            ("Jan 2025",8.20),("Jul 2025",8.80),("Jan 2026",9.20),("Jun 2026",9.40),
        ],
    },
    "server-dram": {
        "title": "Server DRAM Spot Price", "subtitle": "DRAM (Enterprise)", "unit": "$/module",
        "waypoints": [
            ("Jan 2022",68.0),("Apr 2022",72.0),("Dec 2022",52.0),
            ("Jun 2023",30.0),("Oct 2023",21.0),("Jan 2024",23.0),("Jun 2024",28.0),
            ("Jan 2025",34.0),("Jul 2025",37.0),("Jan 2026",38.0),("Jun 2026",38.5),
        ],
    },
    "mobile-dram": {
        "title": "Mobile DRAM Spot Price", "subtitle": "DRAM (LPDDR)", "unit": "$/GB",
        "waypoints": [
            ("Jan 2022",5.80),("Apr 2022",6.40),("Oct 2022",5.00),
            ("Apr 2023",3.20),("Oct 2023",1.80),("Jan 2024",1.90),("Jun 2024",2.40),
            ("Jan 2025",2.80),("Jul 2025",3.00),("Jan 2026",3.15),("Jun 2026",3.20),
        ],
    },
    "graphics-dram": {
        "title": "Graphics DRAM Spot Price", "subtitle": "GDDR6", "unit": "$/module",
        "waypoints": [
            ("Jan 2022",10.20),("May 2022",11.20),("Dec 2022",8.40),
            ("Jun 2023",4.80),("Dec 2023",3.20),("Jun 2024",3.90),
            ("Jan 2025",4.80),("Jul 2025",5.40),("Jan 2026",5.65),("Jun 2026",5.80),
        ],
    },
    # ── HBM ───────────────────────────────────────────────────────────────────
    "hbm2e": {
        "title": "HBM2E Price", "subtitle": "High Bandwidth Memory", "unit": "$/GB",
        "waypoints": [
            ("Jan 2022",15.0),("Dec 2022",15.5),("Jun 2023",16.0),("Dec 2023",15.8),
            ("Jun 2024",15.5),("Dec 2024",15.2),("Jun 2026",15.2),
        ],
    },
    "hbm3": {
        "title": "HBM3 Price", "subtitle": "High Bandwidth Memory", "unit": "$/GB",
        "waypoints": [
            ("Jan 2023",22.0),("Jun 2023",24.0),("Dec 2023",25.0),
            ("Jun 2024",26.0),("Dec 2024",27.0),("Jun 2025",27.5),("Jun 2026",26.4),
        ],
    },
    "hbm3e": {
        "title": "HBM3E Price", "subtitle": "AI Memory (Dominant Spec)", "unit": "$/GB",
        "waypoints": [
            ("Jan 2023",18.0),("Jun 2023",22.0),("Jan 2024",28.0),("Jun 2024",31.0),
            ("Dec 2024",33.0),("Jun 2025",35.0),("Jan 2026",35.8),("Jun 2026",34.8),
        ],
    },
    "hbm4": {
        "title": "HBM4 Price (Next-Gen)", "subtitle": "Emerging HBM", "unit": "$/GB",
        "waypoints": [
            ("Jan 2026",48.0),("Jun 2026",48.0),
        ],
    },
    # ── NAND ──────────────────────────────────────────────────────────────────
    "tlc-nand": {
        "title": "TLC NAND Wafer Price", "subtitle": "NAND Flash", "unit": "$/GB",
        "waypoints": [
            ("Jan 2022",0.110),("May 2022",0.120),("Dec 2022",0.082),
            ("May 2023",0.042),("Aug 2023",0.022),("Jan 2024",0.026),("Jun 2024",0.034),
            ("Jan 2025",0.042),("Jul 2025",0.048),("Jan 2026",0.050),("Jun 2026",0.052),
        ],
    },
    "qlc-nand": {
        "title": "QLC NAND Wafer Price", "subtitle": "NAND Flash", "unit": "$/GB",
        "waypoints": [
            ("Jan 2022",0.075),("May 2022",0.082),("Dec 2022",0.055),
            ("May 2023",0.028),("Aug 2023",0.016),("Jan 2024",0.019),("Jun 2024",0.024),
            ("Jan 2025",0.030),("Jul 2025",0.035),("Jan 2026",0.037),("Jun 2026",0.038),
        ],
    },
    "enterprise-nand": {
        "title": "Enterprise NAND Price", "subtitle": "NAND Flash", "unit": "$/GB",
        "waypoints": [
            ("Jan 2022",0.180),("May 2022",0.200),("Dec 2022",0.140),
            ("Jun 2023",0.080),("Dec 2023",0.042),("Jun 2024",0.055),
            ("Jan 2025",0.070),("Jul 2025",0.080),("Jan 2026",0.083),("Jun 2026",0.085),
        ],
    },
    "consumer-nand": {
        "title": "Consumer NAND Price", "subtitle": "NAND Flash", "unit": "$/GB",
        "waypoints": [
            ("Jan 2022",0.088),("May 2022",0.094),("Dec 2022",0.062),
            ("Jun 2023",0.032),("Oct 2023",0.018),("Jan 2024",0.022),("Jun 2024",0.028),
            ("Jan 2025",0.035),("Jul 2025",0.040),("Jan 2026",0.041),("Jun 2026",0.042),
        ],
    },
    # ── SSD ───────────────────────────────────────────────────────────────────
    "consumer-ssd": {
        "title": "Consumer SSD Price", "subtitle": "Storage", "unit": "$/TB",
        "waypoints": [
            ("Jan 2022",130.0),("Jun 2022",145.0),("Dec 2022",100.0),
            ("Jun 2023",70.0),("Dec 2023",48.0),("Jun 2024",56.0),
            ("Jan 2025",62.0),("Jul 2025",66.0),("Jan 2026",67.0),("Jun 2026",68.0),
        ],
    },
    "enterprise-ssd": {
        "title": "Enterprise SSD Price", "subtitle": "Storage", "unit": "$/TB",
        "waypoints": [
            ("Jan 2022",380.0),("Jun 2022",420.0),("Dec 2022",310.0),
            ("Jun 2023",220.0),("Dec 2023",160.0),("Jun 2024",188.0),
            ("Jan 2025",210.0),("Jul 2025",222.0),("Jan 2026",226.0),("Jun 2026",228.0),
        ],
    },
    "data-center-ssd": {
        "title": "Data Center SSD Price", "subtitle": "Storage (NVMe)", "unit": "$/TB",
        "waypoints": [
            ("Jan 2022",420.0),("Jun 2022",460.0),("Dec 2022",340.0),
            ("Jun 2023",240.0),("Dec 2023",175.0),("Jun 2024",205.0),
            ("Jan 2025",230.0),("Jul 2025",244.0),("Jan 2026",246.0),("Jun 2026",248.0),
        ],
    },
}

# ── Synthetic metric histories ─────────────────────────────────────────────────

_METRIC_WAYPOINTS: dict = {
    "hbm-tightness": {
        "title": "HBM Market Tightness Score", "subtitle": "Supply/Demand Balance", "unit": "/100",
        "waypoints": [
            ("Jan 2022",40),("Dec 2022",48),("Jun 2023",52),("Dec 2023",62),
            ("Jun 2024",74),("Dec 2024",82),("Jun 2025",88),("Dec 2025",92),("Jun 2026",94),
        ],
    },
    "inventory-samsung": {
        "title": "Samsung Inventory (DRAM)", "subtitle": "Weeks of Supply", "unit": "weeks",
        "waypoints": [
            ("Jan 2022",8),("Jun 2022",10),("Dec 2022",16),("Jun 2023",22),
            ("Oct 2023",22),("Dec 2023",20),("Jun 2024",16),
            ("Dec 2024",12),("Jun 2025",10),("Dec 2025",9.2),("Jun 2026",8.2),
        ],
    },
    "inventory-skhynix": {
        "title": "SK Hynix Inventory (DRAM)", "subtitle": "Weeks of Supply", "unit": "weeks",
        "waypoints": [
            ("Jan 2022",7),("Jun 2022",8),("Dec 2022",14),("Jun 2023",18),
            ("Oct 2023",18),("Dec 2023",16),("Jun 2024",12),
            ("Dec 2024",8),("Jun 2025",6.2),("Dec 2025",5.8),("Jun 2026",5.4),
        ],
    },
    "inventory-micron": {
        "title": "Micron Inventory (DRAM)", "subtitle": "Weeks of Supply", "unit": "weeks",
        "waypoints": [
            ("Jan 2022",7),("Jun 2022",9),("Dec 2022",15),("Jun 2023",20),
            ("Oct 2023",20),("Dec 2023",18),("Jun 2024",14),
            ("Dec 2024",10),("Jun 2025",7.8),("Dec 2025",7.2),("Jun 2026",6.8),
        ],
    },
    "memory-cycle-score": {
        "title": "Memory Cycle Bull Score", "subtitle": "Composite 0-100", "unit": "/100",
        "waypoints": [
            ("Jan 2022",68),("Jun 2022",72),("Dec 2022",45),("Jun 2023",25),
            ("Oct 2023",18),("Jan 2024",22),("Jun 2024",38),
            ("Dec 2024",52),("Jun 2025",62),("Dec 2025",70),("Jun 2026",76),
        ],
    },
    "sector-Technology": {
        "title": "Technology Sector Flows", "subtitle": "Net Institutional ($B)", "unit": "$B",
        "waypoints": [
            ("Jan 2022",28.0),("Jun 2022",-8.0),("Dec 2022",10.0),("Jun 2023",22.0),
            ("Dec 2023",38.0),("Jun 2024",42.0),("Dec 2024",44.0),("Jun 2026",48.2),
        ],
    },
    "sector-Healthcare": {
        "title": "Healthcare Sector Flows", "subtitle": "Net Institutional ($B)", "unit": "$B",
        "waypoints": [
            ("Jan 2022",12.0),("Jun 2022",8.0),("Dec 2022",14.0),("Jun 2023",16.0),
            ("Dec 2023",18.0),("Jun 2024",19.0),("Dec 2024",20.0),("Jun 2026",22.4),
        ],
    },
    "sector-Financials": {
        "title": "Financials Sector Flows", "subtitle": "Net Institutional ($B)", "unit": "$B",
        "waypoints": [
            ("Jan 2022",18.0),("Jun 2022",4.0),("Dec 2022",10.0),("Jun 2023",12.0),
            ("Dec 2023",12.0),("Jun 2024",13.0),("Dec 2024",14.0),("Jun 2026",14.8),
        ],
    },
    "sector-Industrials": {
        "title": "Industrials Sector Flows", "subtitle": "Net Institutional ($B)", "unit": "$B",
        "waypoints": [
            ("Jan 2022",6.0),("Jun 2022",2.0),("Dec 2022",5.0),("Jun 2023",6.0),
            ("Dec 2023",7.0),("Jun 2024",7.5),("Dec 2024",8.0),("Jun 2026",8.4),
        ],
    },
    "sector-Energy": {
        "title": "Energy Sector Flows", "subtitle": "Net Institutional ($B)", "unit": "$B",
        "waypoints": [
            ("Jan 2022",8.0),("Jun 2022",18.0),("Dec 2022",12.0),("Jun 2023",7.0),
            ("Dec 2023",5.0),("Jun 2024",4.5),("Dec 2024",4.2),("Jun 2026",4.2),
        ],
    },
    "sector-Utilities": {
        "title": "Utilities Sector Flows", "subtitle": "Net Institutional ($B)", "unit": "$B",
        "waypoints": [
            ("Jan 2022",2.0),("Jun 2022",3.0),("Dec 2022",3.5),("Jun 2023",3.8),
            ("Dec 2023",4.2),("Jun 2024",5.0),("Dec 2024",6.0),("Jun 2026",6.8),
        ],
    },
    "sector-Commodities/Gold": {
        "title": "Commodities/Gold Flows", "subtitle": "Net Institutional ($B)", "unit": "$B",
        "waypoints": [
            ("Jan 2022",8.0),("Jun 2022",14.0),("Dec 2022",10.0),("Jun 2023",12.0),
            ("Dec 2023",14.0),("Jun 2024",16.0),("Dec 2024",17.0),("Jun 2026",18.6),
        ],
    },
    "sector-Consumer Disc.": {
        "title": "Consumer Disc. Sector Flows", "subtitle": "Net Institutional ($B)", "unit": "$B",
        "waypoints": [
            ("Jan 2022",12.0),("Jun 2022",-2.0),("Dec 2022",4.0),("Jun 2023",2.0),
            ("Dec 2023",-2.0),("Jun 2024",-5.0),("Dec 2024",-7.0),("Jun 2026",-8.4),
        ],
    },
    "sector-Real Estate": {
        "title": "Real Estate Sector Flows", "subtitle": "Net Institutional ($B)", "unit": "$B",
        "waypoints": [
            ("Jan 2022",8.0),("Jun 2022",-4.0),("Dec 2022",-2.0),("Jun 2023",-3.0),
            ("Dec 2023",-4.0),("Jun 2024",-5.5),("Dec 2024",-6.0),("Jun 2026",-6.2),
        ],
    },
    "sector-Communication Svcs": {
        "title": "Communication Services Flows", "subtitle": "Net Institutional ($B)", "unit": "$B",
        "waypoints": [
            ("Jan 2022",6.0),("Jun 2022",-2.0),("Dec 2022",2.0),("Jun 2023",4.0),
            ("Dec 2023",6.0),("Jun 2024",8.0),("Dec 2024",9.5),("Jun 2026",10.2),
        ],
    },
    "sector-Materials": {
        "title": "Materials Sector Flows", "subtitle": "Net Institutional ($B)", "unit": "$B",
        "waypoints": [
            ("Jan 2022",4.0),("Jun 2022",6.0),("Dec 2022",3.0),("Jun 2023",2.0),
            ("Dec 2023",2.0),("Jun 2024",2.2),("Dec 2024",2.3),("Jun 2026",2.4),
        ],
    },
    "sector-Consumer Staples": {
        "title": "Consumer Staples Flows", "subtitle": "Net Institutional ($B)", "unit": "$B",
        "waypoints": [
            ("Jan 2022",4.0),("Jun 2022",6.0),("Dec 2022",4.0),("Jun 2023",2.0),
            ("Dec 2023",0.0),("Jun 2024",-1.5),("Dec 2024",-2.5),("Jun 2026",-2.8),
        ],
    },
    # Synthetic metals (no yfinance coverage)
    "nickel": {
        "title": "Nickel Price", "subtitle": "Industrial Metal (LME)", "unit": "$/t",
        "waypoints": [
            ("Jan 2022",21000),("Mar 2022",48000),("Jun 2022",28000),("Dec 2022",29000),
            ("Jun 2023",22000),("Dec 2023",16500),("Jun 2024",17000),
            ("Dec 2024",15800),("Jun 2025",15600),("Jan 2026",15450),("Jun 2026",15420),
        ],
    },
    "zinc": {
        "title": "Zinc Price", "subtitle": "Industrial Metal (LME)", "unit": "$/t",
        "waypoints": [
            ("Jan 2022",3400),("Apr 2022",4600),("Dec 2022",3000),
            ("Jun 2023",2400),("Dec 2023",2500),("Jun 2024",2700),
            ("Dec 2024",2750),("Jun 2025",2780),("Jun 2026",2785),
        ],
    },
    "lead": {
        "title": "Lead Price", "subtitle": "Industrial Metal (LME)", "unit": "$/t",
        "waypoints": [
            ("Jan 2022",2300),("Apr 2022",2580),("Dec 2022",2200),
            ("Jun 2023",2050),("Dec 2023",2000),("Jun 2024",1980),
            ("Dec 2024",1985),("Jun 2026",1985),
        ],
    },
    "tin": {
        "title": "Tin Price", "subtitle": "Industrial Metal (LME)", "unit": "$/t",
        "waypoints": [
            ("Jan 2022",42000),("Mar 2022",48000),("Dec 2022",24000),
            ("Jun 2023",26000),("Dec 2023",24000),("Jun 2024",30000),
            ("Dec 2024",29000),("Jun 2025",29200),("Jun 2026",28950),
        ],
    },
}

# Metal ticker → yfinance symbol
_METAL_TICKERS = {
    "gold": "GC=F", "silver": "SI=F", "platinum": "PL=F", "palladium": "PA=F",
    "copper": "HG=F", "aluminum": "ALI=F",
    # by yfinance symbol too
    "gc=f": "GC=F", "si=f": "SI=F", "pl=f": "PL=F", "pa=f": "PA=F",
    "hg=f": "HG=F", "ali=f": "ALI=F",
}


def _yf_history(ticker: str, period: str = "2y") -> dict | None:
    try:
        hist = yf.Ticker(ticker).history(period=period, interval="1wk")
        if hist.empty:
            return None
        c = hist["Close"].dropna()
        current = float(c.iloc[-1])
        data = [
            {"date": idx.strftime("%b %Y"), "value": round(float(v), 2)}
            for idx, v in zip(c.index[::1], c.values[::1])
        ]
        # deduplicate dates (keep last per month)
        seen = {}
        for d in data:
            seen[d["date"]] = d["value"]
        data = [{"date": k, "value": v} for k, v in seen.items()]

        mn = float(c.min())
        mx = float(c.max())
        chg_1m = float((c.iloc[-1] / c.iloc[-5] - 1) * 100) if len(c) >= 5 else 0
        chg_6m = float((c.iloc[-1] / c.iloc[-26] - 1) * 100) if len(c) >= 26 else 0
        chg_1y = float((c.iloc[-1] / c.iloc[-52] - 1) * 100) if len(c) >= 52 else 0

        return {
            "current": round(current, 2),
            "data": data,
            "stats": {
                "min": round(mn, 2), "max": round(mx, 2),
                "chg_1m": round(chg_1m, 1), "chg_6m": round(chg_6m, 1),
                "chg_1y": round(chg_1y, 1),
            }
        }
    except Exception as e:
        logger.warning(f"yf_history {ticker}: {e}")
        return None


def _synthetic_stats(data: list) -> dict:
    vals = [d["value"] for d in data]
    mn, mx = min(vals), max(vals)
    cur = vals[-1]
    chg_1m = round((cur / vals[-2] - 1) * 100, 1) if len(vals) >= 2 else 0
    chg_6m = round((cur / vals[-7] - 1) * 100, 1) if len(vals) >= 7 else 0
    chg_1y = round((cur / vals[-13] - 1) * 100, 1) if len(vals) >= 13 else 0
    return {"min": round(mn, 4), "max": round(mx, 4), "chg_1m": chg_1m, "chg_6m": chg_6m, "chg_1y": chg_1y}


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/stock/{ticker}")
def stock_history(ticker: str):
    k = f"chart_stock_{ticker}"
    c = _get(k)
    if c: return c
    info = yf.Ticker(ticker)
    name = ticker
    try:
        name = info.info.get("shortName", ticker)
    except Exception:
        pass
    hist = _yf_history(ticker)
    if not hist:
        raise HTTPException(404, f"No history for {ticker}")
    out = {
        "title": name,
        "subtitle": f"{ticker} • Stock Price",
        "unit": "USD",
        **hist,
    }
    _set(k, out)
    return out


@router.get("/memory/{slug}")
def memory_history(slug: str):
    k = f"chart_mem_{slug}"
    c = _get(k)
    if c: return c
    meta = _MEMORY_WAYPOINTS.get(slug)
    if not meta:
        raise HTTPException(404, f"Unknown memory slug: {slug}")
    data = _interp_monthly(meta["waypoints"])
    out = {
        "title": meta["title"],
        "subtitle": meta["subtitle"],
        "unit": meta["unit"],
        "current": data[-1]["value"],
        "data": data,
        "stats": _synthetic_stats(data),
    }
    _set(k, out)
    return out


@router.get("/metal/{slug}")
def metal_history(slug: str):
    k = f"chart_metal_{slug}"
    c = _get(k)
    if c: return c
    # Check synthetic first (Ni, Zn, Pb, Sn)
    syn = _METRIC_WAYPOINTS.get(slug.lower())
    if syn:
        data = _interp_monthly(syn["waypoints"])
        out = {"title": syn["title"], "subtitle": syn["subtitle"], "unit": syn["unit"],
               "current": data[-1]["value"], "data": data, "stats": _synthetic_stats(data)}
        _set(k, out); return out
    # yfinance lookup
    yt = _METAL_TICKERS.get(slug.lower()) or slug.upper()
    hist = _yf_history(yt)
    if not hist:
        raise HTTPException(404, f"No history for metal: {slug}")
    labels = {"GC=F":"Gold","SI=F":"Silver","PL=F":"Platinum","PA=F":"Palladium","HG=F":"Copper","ALI=F":"Aluminum"}
    nm = labels.get(yt, slug.title())
    units = {"GC=F":"$/toz","SI=F":"$/toz","PL=F":"$/toz","PA=F":"$/toz","HG=F":"$/lb","ALI=F":"$/t"}
    out = {"title": f"{nm} Price", "subtitle": "Metals Futures (yfinance)",
           "unit": units.get(yt, "USD"), **hist}
    _set(k, out); return out


@router.get("/metric/{slug}")
def metric_history(slug: str):
    k = f"chart_metric_{slug}"
    c = _get(k)
    if c: return c
    meta = _METRIC_WAYPOINTS.get(slug)
    if not meta:
        raise HTTPException(404, f"Unknown metric slug: {slug}")
    data = _interp_monthly(meta["waypoints"])
    out = {"title": meta["title"], "subtitle": meta["subtitle"], "unit": meta["unit"],
           "current": data[-1]["value"], "data": data, "stats": _synthetic_stats(data)}
    _set(k, out)
    return out
