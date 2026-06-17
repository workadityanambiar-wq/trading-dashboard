"""U.S. Treasury Yield Curve Intelligence Dashboard API"""
from fastapi import APIRouter
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import time, logging, warnings

logger = logging.getLogger(__name__)
router = APIRouter()

_cache: dict = {}
CACHE_TTL = 900

def _get(k):
    v = _cache.get(k)
    if v and time.time() - v["ts"] < CACHE_TTL:
        return v["data"]
    return None

def _set(k, data):
    _cache[k] = {"ts": time.time(), "data": data}

# ── Symbols ───────────────────────────────────────────────────────────────────
_YIELD_BASE = {"3M": "^IRX", "5Y": "^FVX", "10Y": "^TNX", "30Y": "^TYX"}
_W2Y  = (24 - 3) / (60 - 3)    # 0.368  — linear interp to 2Y tenor
_W20Y = (240 - 120) / (360 - 120)  # 0.500

CROSS_ASSET = {
    "DXY": "DX-Y.NYB", "Gold": "GC=F", "Oil": "CL=F",
    "S&P 500": "^GSPC", "Nasdaq": "^IXIC", "Bitcoin": "BTC-USD",
    "VIX": "^VIX", "TLT": "TLT", "HYG": "HYG",
}
MATURITY_ORDER  = ["2Y", "5Y", "10Y", "20Y", "30Y"]
MATURITY_MONTHS = {"3M": 3, "2Y": 24, "5Y": 60, "10Y": 120, "20Y": 240, "30Y": 360}

# ── Static monthly data ───────────────────────────────────────────────────────
INFLATION_STATIC = {
    "cpi": 3.4, "core_cpi": 3.6, "pce": 2.7, "core_pce": 2.8,
    "breakeven_5y": 2.28, "breakeven_10y": 2.32, "as_of": "2026-05-31",
}
FED_STATIC = {
    "current_rate": 3.625, "target_range": "3.50–3.75",
    "next_meeting": "2026-07-29",
    "cut_prob": 0, "hike_prob": 8, "hold_prob": 92,
    "cuts_priced_2026": 0.0, "dot_plot_eoy": 3.375, "market_rate_eoy": 3.625,
    "rate_path": [
        {"meeting": "Jul 2026", "rate": 3.625, "cut_prob": 0},
        {"meeting": "Sep 2026", "rate": 3.500, "cut_prob": 38},
        {"meeting": "Nov 2026", "rate": 3.375, "cut_prob": 55},
        {"meeting": "Dec 2026", "rate": 3.250, "cut_prob": 42},
        {"meeting": "Jan 2027", "rate": 3.125, "cut_prob": 35},
        {"meeting": "Mar 2027", "rate": 3.000, "cut_prob": 30},
    ],
    "dot_plot_2026": [3.125,3.375,3.375,3.625,3.625,3.625,3.875,3.875,3.875,4.125,4.125,4.375],
    "dot_plot_2027": [2.625,2.875,3.125,3.125,3.375,3.375,3.625,3.625,3.875,3.875,4.125,4.125],
    "dot_plot_longer": [2.375,2.375,2.500,2.500,2.500,2.625,2.875,2.875,3.000,3.125,3.250,3.375],
}
ECONOMIC_STATIC = {
    "gdp_qoq": 2.3, "gdp_yoy": 2.7,
    "ism_mfg": 48.7, "ism_services": 52.1,
    "retail_sales_mom": 0.1, "industrial_prod": 0.3,
    "nfp_k": 165, "unemployment": 4.1, "wage_growth_yoy": 3.9, "jolts_openings_m": 7.6,
    "as_of": "2026-05-31",
}
COT_STATIC = {
    "asset_managers_net": 52400, "leveraged_funds_net": -38200,
    "commercial_net": 8100, "open_interest": 4820000,
    "am_percentile": 62.4, "lf_percentile": 28.7, "as_of": "2026-06-10",
}
MOVE_STATIC = 88.4
AUCTION_STATIC = {
    "2Y":  {"date":"2026-06-24","size_b":69,"yield":3.895,"bid_cover":2.68,"indirect_pct":62.8,"primary_dealer_pct":17.2,"tail_bps": 0.3},
    "5Y":  {"date":"2026-06-25","size_b":70,"yield":4.075,"bid_cover":2.43,"indirect_pct":65.4,"primary_dealer_pct":23.1,"tail_bps": 0.5},
    "10Y": {"date":"2026-06-11","size_b":42,"yield":4.438,"bid_cover":2.67,"indirect_pct":69.3,"primary_dealer_pct":14.6,"tail_bps":-0.4},
    "20Y": {"date":"2026-06-18","size_b":16,"yield":4.812,"bid_cover":2.51,"indirect_pct":66.2,"primary_dealer_pct":22.1,"tail_bps": 0.9},
    "30Y": {"date":"2026-06-12","size_b":22,"yield":4.875,"bid_cover":2.38,"indirect_pct":63.1,"primary_dealer_pct":26.8,"tail_bps": 1.2},
}
SCENARIOS = [
    {"scenario":"Fed Rate Cut (−25bps)","probability":38,"2y":-18,"5y":-14,"10y":-8,"30y":-5,"curve_impact":"Steepener","analog":"Sep 2024"},
    {"scenario":"Fed Rate Hike (+25bps)","probability":8, "2y":+22,"5y":+18,"10y":+12,"30y":+8, "curve_impact":"Flattener","analog":"Jul 2023"},
    {"scenario":"Recession Signal",      "probability":25,"2y":-45,"5y":-38,"10y":-30,"30y":-20,"curve_impact":"Bull Steepener","analog":"Aug 2019"},
    {"scenario":"Inflation Shock (+1%)", "probability":15,"2y":+35,"5y":+30,"10y":+25,"30y":+20,"curve_impact":"Bear Flattener","analog":"Mar 2022"},
    {"scenario":"Oil Shock (+20%)",      "probability":10,"2y":+8, "5y":+12,"10y":+15,"30y":+18,"curve_impact":"Bear Steepener","analog":"Oct 2022"},
    {"scenario":"Fiscal Expansion",      "probability":20,"2y":+5, "5y":+12,"10y":+18,"30y":+25,"curve_impact":"Bear Steepener","analog":"Jan 2021"},
    {"scenario":"Banking Crisis",        "probability":5, "2y":-55,"5y":-45,"10y":-35,"30y":-20,"curve_impact":"Bull Steepener","analog":"Mar 2023"},
    {"scenario":"Quantitative Easing",   "probability":10,"2y":-10,"5y":-20,"10y":-30,"30y":-40,"curve_impact":"Bull Flattener","analog":"Mar 2020"},
]

# ── Download helpers ──────────────────────────────────────────────────────────
def _dl(sym, period="2y"):
    try:
        df = yf.download(sym, period=period, interval="1d", auto_adjust=True, progress=False)
        if df.empty: return None
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

def _last(s): return float(s.iloc[-1]) if len(s) else 0.0
def _bps(s, n): return round(float((s.iloc[-1] - s.iloc[-n-1]) * 100), 1) if len(s) > n else 0.0
def _ytd_bps(s):
    m = s.index.year < datetime.now().year
    return round(float((s.iloc[-1] - s[m].iloc[-1]) * 100), 1) if m.any() else 0.0

def _rsi(s, p=14):
    d = s.diff(); u = d.clip(lower=0).ewm(span=p,adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(span=p,adjust=False).mean()
    rs = u / dn.replace(0, np.nan)
    return float((100 - 100/(1+rs)).iloc[-1]) if len(s) > p else 50.0

def _macd(s):
    m = s.ewm(span=12,adjust=False).mean() - s.ewm(span=26,adjust=False).mean()
    sig = m.ewm(span=9,adjust=False).mean()
    return float(m.iloc[-1]), float(sig.iloc[-1]), float((m-sig).iloc[-1])

def _ema(s, span):
    if len(s) < span: return None
    return float(s.ewm(span=span,adjust=False).mean().iloc[-1])

def _bbands(s, p=20, mult=2.0):
    mid = s.rolling(p).mean(); std = s.rolling(p).std()
    u, m, l = float((mid+mult*std).iloc[-1]), float(mid.iloc[-1]), float((mid-mult*std).iloc[-1])
    pct = (float(s.iloc[-1])-l)/(u-l)*100 if (u-l) else 50
    return u, m, l, pct

def _adx(df, p=14):
    if df is None or len(df) < p+10: return 20.0, 20.0, 20.0
    try:
        h=df["High"].dropna(); l=df["Low"].dropna(); c=_cs(df)
        idx=c.index; h,l,c=h.reindex(idx),l.reindex(idx),c.reindex(idx)
        tr=pd.concat([h-l,(h-c.shift()).abs(),(l-c.shift()).abs()],axis=1).max(axis=1)
        dmp=((h-h.shift())>(l.shift()-l)).astype(float)*(h-h.shift()).clip(lower=0)
        dmm=((l.shift()-l)>(h-h.shift())).astype(float)*(l.shift()-l).clip(lower=0)
        atr=tr.ewm(span=p,adjust=False).mean()
        dip=100*dmp.ewm(span=p,adjust=False).mean()/atr.replace(0,np.nan)
        dim=100*dmm.ewm(span=p,adjust=False).mean()/atr.replace(0,np.nan)
        dx=100*(dip-dim).abs()/(dip+dim).replace(0,np.nan)
        return float(dx.ewm(span=p,adjust=False).mean().iloc[-1]), float(dip.iloc[-1]), float(dim.iloc[-1])
    except: return 20.0, 20.0, 20.0

# ── Shared yield loader ───────────────────────────────────────────────────────
def _load_yields():
    cached = _get("yield_data")
    if cached: return cached

    dfs = {}
    for key, sym in _YIELD_BASE.items():
        df = _dl(sym, period="2y")
        if df is not None:
            dfs[key] = df

    if not dfs: return None

    # Align on common index
    ref = _cs(list(dfs.values())[0])
    srs = {}
    for k, df in dfs.items():
        srs[k] = _cs(df).reindex(ref.index).ffill()

    if "3M" in srs and "5Y" in srs:
        srs["2Y"] = (1 - _W2Y) * srs["3M"] + _W2Y * srs["5Y"]
    if "10Y" in srs and "30Y" in srs:
        srs["20Y"] = (1 - _W20Y) * srs["10Y"] + _W20Y * srs["30Y"]

    result = {"series": srs, "dfs": dfs}
    _set("yield_data", result)
    return result

# ── Auction score helper ──────────────────────────────────────────────────────
def _auction_score():
    scores = []
    for a in AUCTION_STATIC.values():
        btc = 75 if a["bid_cover"] >= 2.5 else (50 if a["bid_cover"] >= 2.0 else 25)
        tail = 70 if a["tail_bps"] < 0 else (50 if a["tail_bps"] <= 0.5 else 30)
        ind  = 75 if a["indirect_pct"] >= 65 else (55 if a["indirect_pct"] >= 55 else 35)
        scores.append((btc + tail + ind) / 3)
    return round(sum(scores) / len(scores), 1) if scores else 50.0

# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/overview")
def get_overview():
    cached = _get("overview");
    if cached: return cached
    data = _load_yields()
    if not data: return {"error": "Data unavailable"}
    srs = data["series"]; mats = {}

    for mat in MATURITY_ORDER:
        s = srs.get(mat)
        if s is None: continue
        s = s.dropna()
        if len(s) < 10: continue
        cur = _last(s)
        hi52 = float(s.tail(252).max()); lo52 = float(s.tail(252).min())
        vol30 = float(s.diff().tail(30).std() * 100) if len(s) >= 30 else 0.0
        e20, e50, e200 = _ema(s,20), _ema(s,50), _ema(s,200)
        rsi = _rsi(s)
        chg1m = _bps(s,21)
        trend = ("Falling" if (e20 and cur < e20) else "Rising")
        momentum = ("Rising" if chg1m > 5 else "Falling" if chg1m < -5 else "Neutral")
        vol_hist = float(s.diff().tail(252).std() * 100) if len(s) >= 252 else vol30
        volatility = "High" if vol30 > vol_hist * 1.3 else ("Low" if vol30 < vol_hist * 0.7 else "Normal")
        mats[mat] = {
            "current": round(cur, 4),
            "chg_1d": _bps(s,1), "chg_1w": _bps(s,5),
            "chg_1m": chg1m,     "chg_ytd": _ytd_bps(s),
            "hi52": round(hi52,4), "lo52": round(lo52,4),
            "rsi": round(rsi,1),
            "ema20": round(e20,4) if e20 else None,
            "ema50": round(e50,4) if e50 else None,
            "ema200": round(e200,4) if e200 else None,
            "trend": trend, "momentum": momentum, "volatility": volatility,
            "vol_annualized": round(vol30 * (252**0.5), 2),
        }

    # 90-day history for sparklines
    ref_s = srs.get("10Y", pd.Series()).tail(90)
    history = []
    for i, (dt, _) in enumerate(ref_s.items()):
        row = {"date": dt.strftime("%Y-%m-%d")}
        for mat in MATURITY_ORDER:
            s = srs.get(mat)
            if s is not None:
                tail = s.tail(90)
                if i < len(tail):
                    row[mat] = round(float(tail.iloc[i]), 4)
        history.append(row)

    res = {"maturities": mats, "history": history, "as_of": datetime.now().strftime("%Y-%m-%d")}
    _set("overview", res); return res


@router.get("/curve")
def get_curve():
    cached = _get("curve")
    if cached: return cached
    data = _load_yields()
    if not data: return {"error": "Data unavailable"}
    srs = data["series"]

    tenors = ["3M","2Y","5Y","10Y","20Y","30Y"]
    current_curve = []
    for t in tenors:
        s = srs.get(t)
        if s is not None and len(s):
            current_curve.append({"tenor": t, "yield": round(float(s.dropna().iloc[-1]),4), "months": MATURITY_MONTHS.get(t,0)})

    hist_curves = []
    for label, days in [("1W ago",5),("1M ago",21),("3M ago",63),("6M ago",126),("1Y ago",252)]:
        curve = []
        for t in tenors:
            s = srs.get(t)
            if s is not None:
                s = s.dropna()
                if len(s) > days:
                    curve.append({"tenor": t, "yield": round(float(s.iloc[-days-1]),4), "months": MATURITY_MONTHS.get(t,0)})
        if curve:
            hist_curves.append({"label": label, "curve": curve})

    def sp(a, b):
        sa, sb = srs.get(a), srs.get(b)
        if sa is None or sb is None: return 0.0
        sa, sb = sa.dropna(), sb.dropna()
        return round((float(sb.iloc[-1]) - float(sa.iloc[-1])) * 100, 1) if len(sa) and len(sb) else 0.0

    spreads = {"2s10s": sp("2Y","10Y"), "2s30s": sp("2Y","30Y"),
               "5s30s": sp("5Y","30Y"), "10s30s": sp("10Y","30Y"), "5s10s": sp("5Y","10Y")}

    # 90-day spread history
    s2  = srs.get("2Y",  pd.Series()).dropna().tail(90)
    s10 = srs.get("10Y", pd.Series()).dropna().tail(90)
    s30 = srs.get("30Y", pd.Series()).dropna().tail(90)
    s5  = srs.get("5Y",  pd.Series()).dropna().tail(90)
    n = min(len(s2), len(s10), len(s30), len(s5))
    spread_hist = []
    for i in range(n):
        spread_hist.append({
            "date": s10.index[-n+i].strftime("%Y-%m-%d"),
            "2s10s": round((float(s10.iloc[-n+i]) - float(s2.iloc[-n+i])) * 100, 1),
            "5s30s": round((float(s30.iloc[-n+i]) - float(s5.iloc[-n+i])) * 100, 1),
            "10s30s": round((float(s30.iloc[-n+i]) - float(s10.iloc[-n+i])) * 100, 1),
        })

    # Regime
    spr = spreads["2s10s"]
    s10f = srs.get("10Y", pd.Series()).dropna()
    s2f  = srs.get("2Y",  pd.Series()).dropna()
    chg10_1m = float((s10f.iloc[-1] - s10f.iloc[-22]) * 100) if len(s10f) >= 22 else 0
    spr_1m_ago = round((float(s10f.iloc[-22]) - float(s2f.iloc[-22])) * 100, 1) if len(s2f) >= 22 else spr
    spr_chg = spr - spr_1m_ago

    if spr < -50:    regime = "Deep Inversion"
    elif spr < -10:  regime = "Inversion"
    elif chg10_1m > 10 and spr_chg > 5:   regime = "Bear Steepener"
    elif chg10_1m > 10 and spr_chg < -5:  regime = "Bear Flattener"
    elif chg10_1m < -10 and spr_chg > 5:  regime = "Bull Steepener"
    elif chg10_1m < -10 and spr_chg < -5: regime = "Bull Flattener"
    else: regime = "Normal"

    REGIME_COLORS = {
        "Normal":"#10b981","Bull Steepener":"#3b82f6","Bear Steepener":"#f59e0b",
        "Bull Flattener":"#8b5cf6","Bear Flattener":"#ef4444",
        "Inversion":"#dc2626","Deep Inversion":"#7f1d1d",
    }
    REGIME_FAVORS = {
        "Normal": ["Long Duration","IG Credit"],
        "Bull Steepener": ["Long Duration","Steepeners"],
        "Bear Steepener": ["Short Duration","Floating Rate"],
        "Bull Flattener": ["Long Duration","Flatteners"],
        "Bear Flattener": ["Short Duration","TIPS"],
        "Inversion": ["Cash","Short T-Bills"],
        "Deep Inversion": ["Cash","Short T-Bills"],
    }

    res = {
        "current_curve": current_curve,
        "historical_curves": hist_curves,
        "spreads": spreads,
        "spread_history": spread_hist,
        "regime": regime,
        "regime_color": REGIME_COLORS.get(regime,"#6b7280"),
        "regime_favors": REGIME_FAVORS.get(regime,[]),
        "steepening_signal": spr_chg > 10,
        "flattening_signal": spr_chg < -10,
        "inversion_alert": spr < -10,
        "as_of": datetime.now().strftime("%Y-%m-%d"),
    }
    _set("curve", res); return res


@router.get("/performance")
def get_performance():
    cached = _get("performance")
    if cached: return cached
    data = _load_yields()
    if not data: return {"error": "Data unavailable"}
    srs = data["series"]; perf = {}

    for mat in MATURITY_ORDER:
        s = srs.get(mat)
        if s is None: continue
        s = s.dropna()
        if len(s) < 5: continue
        perf[mat] = {
            "current": round(float(s.iloc[-1]),4),
            "chg_1d": _bps(s,1), "chg_1w": _bps(s,5),
            "chg_1m": _bps(s,21), "chg_3m": _bps(s,63),
            "chg_6m": _bps(s,126), "chg_ytd": _ytd_bps(s),
            "vol_30d": round(float(s.diff().tail(30).std()*100),2) if len(s)>=30 else 0,
        }

    ranked = sorted(perf.items(), key=lambda x: x[1]["chg_1m"])
    rv = {}
    for mat, p in perf.items():
        s = srs[mat].dropna()
        if len(s) >= 252:
            mu = float(s.tail(252).mean()); sig = float(s.tail(252).std()); cur = float(s.iloc[-1])
            z = (cur - mu) / sig if sig > 0 else 0
            rv[mat] = {"z_score": round(z,2), "signal": "Rich" if z < -1 else ("Cheap" if z > 1 else "Fair")}
        else:
            rv[mat] = {"z_score": 0.0, "signal": "Fair"}

    res = {
        "performance": perf,
        "best_1m": ranked[-1][0] if ranked else None,
        "worst_1m": ranked[0][0] if ranked else None,
        "relative_value": rv,
        "as_of": datetime.now().strftime("%Y-%m-%d"),
    }
    _set("performance", res); return res


@router.get("/inflation")
def get_inflation():
    cached = _get("inflation")
    if cached: return cached
    d = INFLATION_STATIC
    core_pce = d["core_pce"]; target = 2.0
    pressure = min(100, max(0, 50 + (core_pce - target) * 20))
    bond_signal = (
        "Strongly Bullish" if core_pce < 2.0 else
        "Bullish" if core_pce < 2.5 else
        "Neutral" if core_pce < 3.0 else
        "Bearish" if core_pce < 3.5 else "Strongly Bearish"
    )
    months = ["Jun 25","Jul 25","Aug 25","Sep 25","Oct 25","Nov 25","Dec 25","Jan 26","Feb 26","Mar 26","Apr 26","May 26"]
    history = [{"month":m,"cpi":c,"core_pce":p,"be10":b} for m,c,p,b in zip(
        months,
        [3.0,2.9,2.8,2.7,2.8,2.9,3.0,3.1,3.2,3.3,3.4,3.4],
        [2.5,2.4,2.4,2.5,2.6,2.6,2.7,2.7,2.8,2.8,2.8,2.8],
        [2.15,2.18,2.20,2.22,2.24,2.25,2.28,2.29,2.30,2.31,2.32,2.32],
    )]
    res = {**d, "inflation_pressure_score": round(pressure,1), "bond_signal": bond_signal,
           "fed_target": 2.0, "history": history}
    _set("inflation", res); return res


@router.get("/fed")
def get_fed():
    cached = _get("fed")
    if cached: return cached
    d = FED_STATIC; core_pce = INFLATION_STATIC["core_pce"]
    real_rate = d["current_rate"] - core_pce
    score = min(100, max(0, 50 + real_rate * 15))
    stance = (
        "Extremely Accommodative" if score < 30 else
        "Accommodative" if score < 45 else
        "Neutral" if score < 55 else
        "Restrictive" if score < 70 else "Extremely Restrictive"
    )
    # dot plot chart data
    dot_chart = (
        [{"year":"2026","rate":r} for r in d["dot_plot_2026"]] +
        [{"year":"2027","rate":r} for r in d["dot_plot_2027"]] +
        [{"year":"Longer Run","rate":r} for r in d["dot_plot_longer"]]
    )
    res = {
        **{k:v for k,v in d.items() if k not in ("dot_plot_2026","dot_plot_2027","dot_plot_longer")},
        "monetary_policy_score": round(score,1),
        "policy_stance": stance,
        "real_fed_funds": round(real_rate, 2),
        "neutral_rate": 2.5,
        "dot_plot_chart": dot_chart,
        "as_of": datetime.now().strftime("%Y-%m-%d"),
    }
    _set("fed", res); return res


@router.get("/economic")
def get_economic():
    cached = _get("economic")
    if cached: return cached
    d = ECONOMIC_STATIC
    pts = [
        70 if d["gdp_yoy"] >= 2.5 else (50 if d["gdp_yoy"] >= 1.5 else 30),
        70 if d["ism_mfg"] >= 52 else (45 if d["ism_mfg"] >= 48 else 25),
        70 if d["ism_services"] >= 54 else (50 if d["ism_services"] >= 50 else 30),
        70 if d["nfp_k"] >= 200 else (50 if d["nfp_k"] >= 100 else 30),
        70 if d["unemployment"] <= 4.0 else (55 if d["unemployment"] <= 4.5 else 35),
    ]
    growth_score = round(sum(pts)/len(pts), 1)
    growth_signal = ("Strong Growth" if growth_score >= 65 else
                     "Moderate Growth" if growth_score >= 50 else
                     "Slowing Growth" if growth_score >= 40 else "Contraction Risk")
    bond_signal = "Bearish Bonds" if growth_score >= 65 else ("Neutral" if growth_score >= 50 else "Bullish Bonds")
    res = {**d, "growth_score": growth_score, "growth_signal": growth_signal,
           "bond_signal": bond_signal, "recession_prob": round(max(0, 50 - growth_score), 1)}
    _set("economic", res); return res


@router.get("/positioning")
def get_positioning():
    cached = _get("positioning")
    if cached: return cached
    d = COT_STATIC
    am, lf = d["asset_managers_net"], d["leveraged_funds_net"]
    if am > 60000 and lf > 20000:    crowding, cs = "Extremely Long — Crowded", 85
    elif am > 40000:                  crowding, cs = "Long — Moderately Crowded", 65
    elif am < -40000 and lf < -20000: crowding, cs = "Extremely Short — Crowded", 15
    elif am < 0 and lf < -15000:      crowding, cs = "Short — Moderately Crowded", 35
    else:                             crowding, cs = "Balanced — Not Crowded", 50

    # 26-week mock history
    rng = np.random.default_rng(42)
    hist = []
    for w in range(26, 0, -1):
        dt = (datetime.now() - timedelta(weeks=w)).strftime("%Y-%m-%d")
        hist.append({"date":dt,"asset_managers":int(am + rng.normal(0,5000)),
                     "leveraged_funds":int(lf + rng.normal(0,4000))})
    hist.append({"date":datetime.now().strftime("%Y-%m-%d"),"asset_managers":am,"leveraged_funds":lf})

    res = {**d, "crowding_indicator": crowding, "crowding_score": cs, "history": hist}
    _set("positioning", res); return res


@router.get("/risk-sentiment")
def get_risk_sentiment():
    cached = _get("risk")
    if cached: return cached
    vix_df = _dl("^VIX","1y")
    vix_s = _cs(vix_df) if vix_df is not None else pd.Series()
    vix = _last(vix_s) if len(vix_s) else 15.0
    vix_1m = float(vix_s.iloc[-1] - vix_s.iloc[-22]) if len(vix_s) >= 22 else 0

    hy_spread, ig_spread = 320, 98
    vix_score = max(0, min(100, 100 - (vix - 10) * 3.5))
    move_score = max(0, min(100, 100 - (MOVE_STATIC - 60) * 1.5))
    hy_score   = max(0, min(100, 100 - (hy_spread - 200) * 0.2))
    risk_score = round(vix_score*0.4 + move_score*0.35 + hy_score*0.25, 1)

    risk_regime = ("Risk-On" if risk_score >= 70 else "Mild Risk-On" if risk_score >= 50
                   else "Mild Risk-Off" if risk_score >= 35 else "Risk-Off")

    data = _load_yields()
    s10 = data["series"].get("10Y", pd.Series()).dropna() if data else pd.Series()
    ten_1m = float((s10.iloc[-1] - s10.iloc[-22]) * 100) if len(s10) >= 22 else 0
    fts = min(100, max(0, (40 - risk_score) + max(0, -ten_1m)))

    vix_hist = [{"date": d.strftime("%Y-%m-%d"), "vix": round(float(v),2)}
                for d, v in vix_s.tail(60).items()] if len(vix_s) else []

    res = {
        "vix": round(vix,2), "vix_1m_change": round(vix_1m,2),
        "move_index": MOVE_STATIC,
        "hy_spread_bps": hy_spread, "ig_spread_bps": ig_spread,
        "risk_score": risk_score, "risk_regime": risk_regime,
        "flight_to_safety_score": round(fts,1),
        "flight_to_safety_active": fts > 50 and ten_1m < -10,
        "vix_history": vix_hist,
        "as_of": datetime.now().strftime("%Y-%m-%d"),
    }
    _set("risk", res); return res


@router.get("/correlations")
def get_correlations():
    cached = _get("corr")
    if cached: return cached
    data = _load_yields()
    if not data: return {"error": "Data unavailable"}
    s10 = data["series"].get("10Y", pd.Series()).dropna()
    if len(s10) < 30: return {"error": "Insufficient data"}

    corr30, corr90 = {}, {}
    for name, sym in CROSS_ASSET.items():
        df = _dl(sym, "1y")
        if df is None: continue
        s = _cs(df)
        ref_ret = s10.pct_change()
        asset_ret = s.pct_change()
        for n, d_corr in [(30, corr30),(90, corr90)]:
            ref_n = ref_ret.tail(n)
            aligned = pd.concat([ref_n, asset_ret.reindex(ref_n.index)], axis=1).dropna()
            if len(aligned) >= n * 0.7:
                d_corr[name] = round(float(aligned.iloc[:,0].corr(aligned.iloc[:,1])),3)

    res = {"corr_30d": corr30, "corr_90d": corr90,
           "note": "Correlation of 10Y yield changes vs asset returns",
           "as_of": datetime.now().strftime("%Y-%m-%d")}
    _set("corr", res); return res


@router.get("/fair-value")
def get_fair_value():
    cached = _get("fv")
    if cached: return cached
    data = _load_yields()
    if not data: return {"error": "Data unavailable"}
    srs = data["series"]
    ff = FED_STATIC["current_rate"]; cpce = INFLATION_STATIC["core_pce"]; gdp = ECONOMIC_STATIC["gdp_yoy"]
    inf_ex = cpce - 2.0; grw = (gdp - 2.0) * 0.15
    TP = {"2Y":0.10,"5Y":0.25,"10Y":0.50,"20Y":0.70,"30Y":0.90}
    IP = {"2Y":0.30,"5Y":0.50,"10Y":0.70,"20Y":0.80,"30Y":0.80}
    GP = {"2Y":0.5,"5Y":0.8,"10Y":1.0,"20Y":1.1,"30Y":1.2}
    fvs = {}
    for mat in MATURITY_ORDER:
        s = srs.get(mat)
        if s is None: continue
        s = s.dropna()
        if not len(s): continue
        cur = float(s.iloc[-1])
        fv = ff + IP.get(mat,0.5) * inf_ex + GP.get(mat,1.0) * grw + TP.get(mat,0.5)
        dev = round((cur - fv) * 100, 1)
        fvs[mat] = {
            "current": round(cur,4), "fair_value": round(fv,4),
            "deviation_bps": dev,
            "signal": "Expensive" if dev < -15 else ("Cheap" if dev > 15 else "Fair Value"),
        }
    res = {
        "fair_values": fvs,
        "inputs": {"fed_funds": ff, "core_pce": cpce, "gdp_yoy": gdp, "be_10y": INFLATION_STATIC["breakeven_10y"]},
        "as_of": datetime.now().strftime("%Y-%m-%d"),
    }
    _set("fv", res); return res


@router.get("/forecasts")
def get_forecasts():
    cached = _get("forecasts")
    if cached: return cached
    try:
        from statsmodels.tsa.arima.model import ARIMA
    except ImportError:
        return {"error": "statsmodels not available"}
    data = _load_yields()
    if not data: return {"error": "Data unavailable"}
    srs = data["series"]; horizons = {"1W":5,"1M":21,"3M":63,"6M":126}; fcasts = {}

    for mat in MATURITY_ORDER:
        s = srs.get(mat)
        if s is None: continue
        s = s.dropna()
        if len(s) < 60: continue
        cur = float(s.iloc[-1]); mat_fc = {}
        try:
            train = s.tail(252).values
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                fit = ARIMA(train, order=(2,1,2)).fit()
            for label, steps in horizons.items():
                fc = fit.get_forecast(steps=steps)
                fc_mean = float(fc.predicted_mean.iloc[-1])
                ci = fc.conf_int()
                mat_fc[label] = {
                    "yield": round(fc_mean,4),
                    "change_bps": round((fc_mean - cur)*100,1),
                    "lower_95": round(float(ci.iloc[-1,0]),4),
                    "upper_95": round(float(ci.iloc[-1,1]),4),
                    "direction": "Rising" if fc_mean > cur else "Falling",
                }
        except Exception:
            mu = float(s.tail(252).mean()); std = float(s.tail(252).std())
            for label, steps in horizons.items():
                alpha = steps / 252
                fc_mean = cur + alpha * (mu - cur)
                mat_fc[label] = {
                    "yield": round(fc_mean,4),
                    "change_bps": round((fc_mean - cur)*100,1),
                    "lower_95": round(fc_mean - 1.96*std*(alpha**0.5),4),
                    "upper_95": round(fc_mean + 1.96*std*(alpha**0.5),4),
                    "direction": "Rising" if fc_mean > cur else "Falling",
                }
        fcasts[mat] = {"current": round(cur,4), **mat_fc}

    res = {"forecasts": fcasts, "model": "ARIMA(2,1,2) + Mean Reversion",
           "as_of": datetime.now().strftime("%Y-%m-%d")}
    _set("forecasts", res); return res


@router.get("/composite")
def get_composite():
    cached = _get("composite")
    if cached: return cached
    inf_d  = get_inflation(); fed_d = get_fed()
    eco_d  = get_economic(); pos_d = get_positioning()
    risk_d = get_risk_sentiment()

    inf_score   = max(0, min(100, 100 - inf_d.get("inflation_pressure_score",50)))
    growth_score = max(0, min(100, 100 - eco_d.get("growth_score",50)))
    fed_score   = max(0, min(100, 100 - fed_d.get("monetary_policy_score",50) + 50))
    pos_score   = max(0, min(100, 100 - pos_d.get("crowding_score",50)))
    risk_score  = max(0, min(100, 100 - risk_d.get("risk_score",50)))
    auction_sc  = _auction_score()

    data = _load_yields(); tech_score = 50.0
    if data and "10Y" in data["series"]:
        s = data["series"]["10Y"].dropna()
        if len(s) >= 50:
            rsi = _rsi(s); e20 = _ema(s,20); e50 = _ema(s,50)
            cur = float(s.iloc[-1]); macd, msig, _ = _macd(s)
            tp = 0
            if rsi < 45: tp += 30
            if e20 and cur < e20: tp += 25
            if e50 and cur < e50: tp += 25
            if macd < msig: tp += 20
            tech_score = min(100, tp)

    weights = {"Inflation":0.20,"Growth":0.20,"Fed Policy":0.20,
               "Positioning":0.10,"Technicals":0.10,"Risk Sentiment":0.10,"Auctions":0.10}
    components = {"Inflation":inf_score,"Growth":growth_score,"Fed Policy":fed_score,
                  "Positioning":pos_score,"Technicals":tech_score,"Risk Sentiment":risk_score,"Auctions":auction_sc}
    score = round(sum(components[k]*weights[k] for k in weights), 1)
    label = ("Extremely Bullish Bonds" if score >= 80 else "Bullish Bonds" if score >= 60
             else "Neutral" if score >= 40 else "Bearish Bonds" if score >= 20 else "Strongly Bearish Bonds")

    res = {"composite_score": score, "label": label,
           "components": {k: round(v,1) for k,v in components.items()},
           "weights": weights, "as_of": datetime.now().strftime("%Y-%m-%d")}
    _set("composite", res); return res


@router.get("/signals")
def get_signals():
    cached = _get("signals")
    if cached: return cached
    comp_d  = get_composite(); curve_d = get_curve()
    score   = comp_d.get("composite_score",50)
    regime  = curve_d.get("regime","Normal")
    spr     = curve_d.get("spreads",{}).get("2s10s",0)
    steep   = curve_d.get("steepening_signal",False)
    flat    = curve_d.get("flattening_signal",False)

    data = _load_yields(); s10 = pd.Series()
    if data and "10Y" in data["series"]:
        s10 = data["series"]["10Y"].dropna()
    cur10 = round(float(s10.iloc[-1]),4) if len(s10) else 4.5

    sigs = []
    if score >= 65:
        sigs.append({"type":"Long Duration","direction":"BUY","instrument":"TLT / 10Y+ Treasuries",
            "entry":cur10,"stop":round(cur10+0.25,3),"target":round(cur10-0.50,3),
            "rr":"1:2.0","confidence":round(score,1),
            "rationale":f"Composite {score}/100 — macro setup bullish for bonds"})
    elif score <= 35:
        sigs.append({"type":"Short Duration","direction":"SELL","instrument":"TBF / Short 10Y",
            "entry":cur10,"stop":round(cur10-0.20,3),"target":round(cur10+0.40,3),
            "rr":"1:2.0","confidence":round(100-score,1),
            "rationale":f"Composite {score}/100 — macro setup bearish for bonds"})

    if steep or regime in ("Bull Steepener","Bear Steepener"):
        sigs.append({"type":"Curve Steepener","direction":"2s30s Long Spread","instrument":"Short 2Y / Long 30Y",
            "entry":spr,"stop":round(spr-20,1),"target":round(spr+40,1),
            "rr":"1:2.0","confidence":65.0,"rationale":f"{regime} — expect steepening"})
    elif flat or regime in ("Bull Flattener","Bear Flattener"):
        sigs.append({"type":"Curve Flattener","direction":"2s30s Short Spread","instrument":"Long 2Y / Short 30Y",
            "entry":spr,"stop":round(spr+20,1),"target":round(spr-40,1),
            "rr":"1:2.0","confidence":60.0,"rationale":f"{regime} — expect flattening"})

    if not sigs:
        sigs.append({"type":"Neutral","direction":"NO TRADE","instrument":"—",
            "entry":None,"stop":None,"target":None,"rr":"—","confidence":50.0,
            "rationale":"Composite in neutral zone — no clear directional edge"})

    res = {"signals": sigs, "composite_score": score, "regime": regime,
           "as_of": datetime.now().strftime("%Y-%m-%d")}
    _set("signals", res); return res


@router.get("/scenarios")
def get_scenarios():
    cached = _get("scenarios")
    if cached: return cached
    data = _load_yields(); base = {}
    if data:
        for mat in MATURITY_ORDER:
            s = data["series"].get(mat)
            if s is not None and len(s):
                base[mat] = round(float(s.dropna().iloc[-1]),4)

    enriched = []
    for sc in SCENARIOS:
        proj = {}
        for mat in MATURITY_ORDER:
            b = base.get(mat, 4.0)
            moves = {"2Y": sc["2y"], "5Y": int((sc["2y"]+sc["10y"])/2),
                     "10Y": sc["10y"], "20Y": int((sc["10y"]+sc["30y"])/2), "30Y": sc["30y"]}
            proj[mat] = round(b + moves.get(mat, sc["10y"]) / 100, 4)
        enriched.append({**{k:v for k,v in sc.items() if k not in ("2y","5y","10y","30y")},
                         "moves": {"2Y":sc["2y"],"5Y":int((sc["2y"]+sc["10y"])/2),
                                   "10Y":sc["10y"],"20Y":int((sc["10y"]+sc["30y"])/2),"30Y":sc["30y"]},
                         "projected_yields": proj, "base_yields": base})
    res = {"scenarios": enriched, "as_of": datetime.now().strftime("%Y-%m-%d")}
    _set("scenarios", res); return res


@router.get("/technicals")
def get_technicals():
    cached = _get("technicals")
    if cached: return cached
    data = _load_yields()
    if not data: return {"error": "Data unavailable"}
    srs = data["series"]; dfs = data["dfs"]; result = {}

    for mat in MATURITY_ORDER:
        s = srs.get(mat)
        if s is None: continue
        s = s.dropna()
        if len(s) < 50: continue
        cur = float(s.iloc[-1])
        e20,e50,e100,e200 = _ema(s,20),_ema(s,50),_ema(s,100),_ema(s,200)
        rsi = _rsi(s); macd,msig,mhist = _macd(s)
        bbu,bbm,bbl,bbp = _bbands(s)
        base_key = {"2Y":"3M","20Y":"30Y"}.get(mat, mat)
        raw_df = dfs.get(base_key)
        adx, dip, dim = _adx(raw_df) if raw_df is not None else (20.0,20.0,20.0)
        atr = float(s.diff().tail(21).abs().mean()) * 100  # in bps
        sup = float(s.tail(63).min()); res_val = float(s.tail(63).max())
        tp = 0
        if rsi < 45: tp += 20
        if e20 and cur < e20: tp += 15
        if e50 and cur < e50: tp += 20
        if e200 and cur < e200: tp += 20
        if macd < msig: tp += 15
        if bbp < 40: tp += 10
        result[mat] = {
            "current": round(cur,4),
            "ema20": round(e20,4) if e20 else None,
            "ema50": round(e50,4) if e50 else None,
            "ema100": round(e100,4) if e100 else None,
            "ema200": round(e200,4) if e200 else None,
            "rsi": round(rsi,1),
            "rsi_signal": "Overbought" if rsi > 70 else ("Oversold" if rsi < 30 else "Neutral"),
            "macd": round(macd,4), "macd_signal": round(msig,4), "macd_hist": round(mhist,4),
            "macd_bullish": macd > msig,
            "bb_upper": round(bbu,4), "bb_mid": round(bbm,4), "bb_lower": round(bbl,4), "bb_pct": round(bbp,1),
            "atr_bps": round(atr,2), "adx": round(adx,1), "di_plus": round(dip,1), "di_minus": round(dim,1),
            "trend_strength": ("Strong Uptrend" if adx > 30 and dip > dim else
                               "Strong Downtrend" if adx > 30 and dim > dip else "Ranging"),
            "support": round(sup,4), "resistance": round(res_val,4),
            "technical_score": min(100, tp),
        }
    final = {"technicals": result, "as_of": datetime.now().strftime("%Y-%m-%d")}
    _set("technicals", final); return final


@router.get("/auctions")
def get_auctions():
    cached = _get("auctions")
    if cached: return cached
    sc = _auction_score()
    strength = "Strong" if sc >= 70 else ("Average" if sc >= 50 else "Weak")
    res = {
        "auctions": AUCTION_STATIC,
        "auction_strength_score": sc,
        "strength": strength,
        "description": (
            "Broad demand, low tails, strong foreign participation" if sc >= 70
            else "Adequate demand with mixed technicals" if sc >= 50
            else "Below-average demand, elevated tails"
        ),
        "as_of": datetime.now().strftime("%Y-%m-%d"),
    }
    _set("auctions", res); return res
