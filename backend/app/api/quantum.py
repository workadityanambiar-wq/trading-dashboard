"""
Quantum Computing Intelligence API.

GET /api/quantum/overview    readiness score, KPIs, regime, composite
GET /api/quantum/markets     public quantum stocks — real yfinance prices + technicals
GET /api/quantum/hardware    hardware comparison (curated specs)
GET /api/quantum/government  government funding by country
GET /api/quantum/enterprise  enterprise adoption + cloud platforms
GET /api/quantum/vc          VC / private market data
GET /api/quantum/forecast    commercialization probability & qubit projections
GET /api/quantum/leaderboard quantum winner model + composite leaderboard
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

# ── Public quantum companies ──────────────────────────────────────────────────
PUBLIC_STOCKS = [
    {"ticker": "IONQ",  "company": "IonQ",               "type": "Pure-Play",  "approach": "Trapped Ion",        "exposure": 100},
    {"ticker": "RGTI",  "company": "Rigetti Computing",   "type": "Pure-Play",  "approach": "Superconducting",    "exposure": 100},
    {"ticker": "QBTS",  "company": "D-Wave Quantum",      "type": "Pure-Play",  "approach": "Quantum Annealing",  "exposure": 100},
    {"ticker": "QUBT",  "company": "Quantum Computing Inc","type": "Pure-Play", "approach": "Photonic/Software",  "exposure": 100},
    {"ticker": "IBM",   "company": "IBM",                 "type": "Diversified","approach": "Superconducting",    "exposure": 8},
    {"ticker": "GOOGL", "company": "Alphabet (Google QAI)","type":"Diversified","approach": "Superconducting",    "exposure": 3},
    {"ticker": "MSFT",  "company": "Microsoft",           "type": "Diversified","approach": "Topological",        "exposure": 3},
    {"ticker": "AMZN",  "company": "Amazon (Braket)",     "type": "Diversified","approach": "Cloud Platform",     "exposure": 2},
]

# ── Curated hardware data (as of 2025) ────────────────────────────────────────
HARDWARE_DATA = [
    {"company":"IBM",          "system":"IBM Heron/Condor",  "approach":"Superconducting", "qubits":1121, "aq":None, "qv":512,     "gate_fidelity":99.9,  "coherence_us":300,      "error_rate":0.001,   "logical_qubits":0,  "score":82},
    {"company":"Google QAI",   "system":"Willow (105q)",     "approach":"Superconducting", "qubits":105,  "aq":None, "qv":2048,    "gate_fidelity":99.85, "coherence_us":100,      "error_rate":0.0008,  "logical_qubits":1,  "score":91},
    {"company":"IonQ",         "system":"Forte Enterprise",  "approach":"Trapped Ion",     "qubits":35,   "aq":35,   "qv":4096,    "gate_fidelity":99.9,  "coherence_us":1_000_000,"error_rate":0.0003,  "logical_qubits":0,  "score":88},
    {"company":"Quantinuum",   "system":"H2-1",              "approach":"Trapped Ion",     "qubits":56,   "aq":56,   "qv":2_097_152,"gate_fidelity":99.9, "coherence_us":1_000_000,"error_rate":0.00015, "logical_qubits":12, "score":95},
    {"company":"Rigetti",      "system":"Ankaa-3 (84q)",     "approach":"Superconducting", "qubits":84,   "aq":None, "qv":512,     "gate_fidelity":99.5,  "coherence_us":50,       "error_rate":0.005,   "logical_qubits":0,  "score":61},
    {"company":"D-Wave",       "system":"Advantage2",        "approach":"Quantum Annealing","qubits":7000,"aq":None, "qv":None,    "gate_fidelity":None,  "coherence_us":None,     "error_rate":None,    "logical_qubits":0,  "score":54},
    {"company":"QuEra",        "system":"Aquila (256 atoms)", "approach":"Neutral Atom",   "qubits":256,  "aq":None, "qv":None,    "gate_fidelity":99.5,  "coherence_us":10_000,   "error_rate":0.005,   "logical_qubits":48, "score":79},
    {"company":"PsiQuantum",   "system":"In Development",    "approach":"Photonic",        "qubits":None, "aq":None, "qv":None,    "gate_fidelity":None,  "coherence_us":None,     "error_rate":None,    "logical_qubits":0,  "score":45},
    {"company":"Xanadu",       "system":"Borealis",          "approach":"Photonic",        "qubits":216,  "aq":None, "qv":None,    "gate_fidelity":None,  "coherence_us":None,     "error_rate":None,    "logical_qubits":0,  "score":48},
    {"company":"Pasqal",       "system":"EMU-C",             "approach":"Neutral Atom",    "qubits":100,  "aq":None, "qv":None,    "gate_fidelity":99.0,  "coherence_us":5_000,    "error_rate":0.01,    "logical_qubits":0,  "score":62},
]

# ── Government funding ────────────────────────────────────────────────────────
GOVT_FUNDING = [
    {"country":"United States", "program":"National Quantum Initiative", "annual_b":1.8,  "total_b":4.2,  "year":2018, "score":88},
    {"country":"China",         "program":"Quantum Science Center",       "annual_b":2.4,  "total_b":15.0, "year":2016, "score":94},
    {"country":"European Union","program":"Quantum Flagship",             "annual_b":0.2,  "total_b":1.0,  "year":2018, "score":72},
    {"country":"United Kingdom","program":"National Quantum Strategy",    "annual_b":0.5,  "total_b":2.5,  "year":2013, "score":78},
    {"country":"Germany",       "program":"Quantum Compute Initiative",   "annual_b":0.4,  "total_b":2.0,  "year":2020, "score":74},
    {"country":"Japan",         "program":"Quantum Moonshot",             "annual_b":0.3,  "total_b":0.7,  "year":2018, "score":65},
    {"country":"Canada",        "program":"Quantum Industry Canada",      "annual_b":0.36, "total_b":1.0,  "year":2021, "score":68},
    {"country":"India",         "program":"NM-QTA",                       "annual_b":0.15, "total_b":0.73, "year":2021, "score":54},
]

# ── VC / Private market ───────────────────────────────────────────────────────
VC_DATA = [
    {"company":"PsiQuantum",  "stage":"Series D",  "raised_m":665,  "val_b":3.15, "approach":"Photonic",      "hq":"Palo Alto",    "focus":"Fault-tolerant photonic QC"},
    {"company":"Quantinuum",  "stage":"Private",   "raised_m":625,  "val_b":5.0,  "approach":"Trapped Ion",   "hq":"Broomfield",   "focus":"Enterprise trapped-ion QC"},
    {"company":"SandboxAQ",   "stage":"Series B",  "raised_m":250,  "val_b":2.0,  "approach":"PQC/AI",        "hq":"Palo Alto",    "focus":"Post-quantum cryptography"},
    {"company":"QuEra",       "stage":"Series A",  "raised_m":230,  "val_b":0.8,  "approach":"Neutral Atom",  "hq":"Boston",       "focus":"Neutral atom & error correction"},
    {"company":"Xanadu",      "stage":"Series C",  "raised_m":215,  "val_b":1.0,  "approach":"Photonic",      "hq":"Toronto",      "focus":"Photonic QC & PennyLane"},
    {"company":"Pasqal",      "stage":"Series B",  "raised_m":145,  "val_b":0.5,  "approach":"Neutral Atom",  "hq":"Paris",        "focus":"Neutral atom commercial QC"},
    {"company":"Atom Computing","stage":"Series B","raised_m":100,  "val_b":0.4,  "approach":"Neutral Atom",  "hq":"Boulder",      "focus":"1180 atom neutral atom QC"},
    {"company":"Nord Quantique","stage":"Series A","raised_m":14,   "val_b":0.1,  "approach":"Superconducting","hq":"Sherbrooke",  "focus":"Cat qubits error suppression"},
]

# ── Enterprise adoption ───────────────────────────────────────────────────────
ENTERPRISE_DATA = [
    {"industry":"Financial Services", "pilots":42, "contracts":18, "partners":["JPMorgan","Goldman","HSBC","Barclays"],       "use_case":"Portfolio optimization, risk modeling",      "score":68},
    {"industry":"Pharmaceuticals",    "pilots":38, "contracts":12, "partners":["Roche","Pfizer","Merck","AstraZeneca"],       "use_case":"Drug discovery, protein folding",            "score":74},
    {"industry":"Chemicals",          "pilots":29, "contracts":9,  "partners":["BASF","Dow","LG Chem","Covestro"],            "use_case":"Molecular simulation, materials design",     "score":61},
    {"industry":"Aerospace",          "pilots":24, "contracts":14, "partners":["Boeing","Airbus","Lockheed","Raytheon"],      "use_case":"Materials, routing optimization",            "score":58},
    {"industry":"Defense",            "pilots":31, "contracts":22, "partners":["DARPA","Raytheon","L3Harris","Booz Allen"],   "use_case":"Cryptography, sensing, navigation",         "score":71},
    {"industry":"Logistics",          "pilots":19, "contracts":6,  "partners":["DHL","UPS","FedEx","Volkswagen"],             "use_case":"Route optimization, supply chain",           "score":44},
    {"industry":"Energy",             "pilots":16, "contracts":5,  "partners":["ExxonMobil","BP","Repsol","Total"],           "use_case":"Battery simulation, grid optimization",      "score":42},
    {"industry":"Telecoms",           "pilots":12, "contracts":8,  "partners":["Toshiba","SK Telecom","BT","Deutsche Telkom"],"use_case":"Quantum key distribution, networking",      "score":55},
]

# ── Software platforms ────────────────────────────────────────────────────────
SOFTWARE_DATA = [
    {"platform":"Qiskit",         "vendor":"IBM",       "stars_k":4.1, "downloads_m":1.8, "enterprise":True,  "languages":"Python",      "score":88},
    {"platform":"Cirq",           "vendor":"Google",    "stars_k":4.2, "downloads_m":0.9, "enterprise":True,  "languages":"Python",      "score":79},
    {"platform":"PennyLane",      "vendor":"Xanadu",    "stars_k":2.3, "downloads_m":0.7, "enterprise":False, "languages":"Python",      "score":74},
    {"platform":"Azure Quantum",  "vendor":"Microsoft", "stars_k":0.8, "downloads_m":0.3, "enterprise":True,  "languages":"Q#/Python",   "score":72},
    {"platform":"Amazon Braket",  "vendor":"Amazon",    "stars_k":0.7, "downloads_m":0.2, "enterprise":True,  "languages":"Python",      "score":65},
    {"platform":"CUDA-Q",         "vendor":"NVIDIA",    "stars_k":0.4, "downloads_m":0.1, "enterprise":True,  "languages":"C++/Python",  "score":58},
    {"platform":"Tket",           "vendor":"Quantinuum","stars_k":0.6, "downloads_m":0.15,"enterprise":True,  "languages":"Python",      "score":61},
]

# ── Patent leaders ────────────────────────────────────────────────────────────
PATENT_DATA = [
    {"entity":"IBM",          "type":"Company",    "patents_2024":312, "total_patents":1840, "pubs_2024":187, "citations":8420},
    {"entity":"Google",       "type":"Company",    "patents_2024":284, "total_patents":1210, "pubs_2024":142, "citations":6810},
    {"entity":"Microsoft",    "type":"Company",    "patents_2024":198, "total_patents":890,  "pubs_2024":98,  "citations":4320},
    {"entity":"Huawei",       "type":"Company",    "patents_2024":421, "total_patents":2100, "pubs_2024":201, "citations":3210},
    {"entity":"MIT",          "type":"University", "patents_2024":84,  "total_patents":410,  "pubs_2024":312, "citations":12400},
    {"entity":"Caltech",      "type":"University", "patents_2024":61,  "total_patents":290,  "pubs_2024":248, "citations":9800},
    {"entity":"TU Delft",     "type":"University", "patents_2024":48,  "total_patents":210,  "pubs_2024":186, "citations":7200},
    {"entity":"IonQ",         "type":"Company",    "patents_2024":42,  "total_patents":180,  "pubs_2024":38,  "citations":820},
]

# ── Qubit growth history (for trend chart) ────────────────────────────────────
QUBIT_HISTORY = [
    {"year":2016,"ibm":5,   "google":9,   "ionq":None,"qv_best":1},
    {"year":2017,"ibm":16,  "google":22,  "ionq":None,"qv_best":4},
    {"year":2018,"ibm":50,  "google":72,  "ionq":None,"qv_best":8},
    {"year":2019,"ibm":53,  "google":53,  "ionq":11,  "qv_best":16},
    {"year":2020,"ibm":65,  "google":53,  "ionq":25,  "qv_best":64},
    {"year":2021,"ibm":127, "google":53,  "ionq":32,  "qv_best":512},
    {"year":2022,"ibm":433, "google":72,  "ionq":35,  "qv_best":512},
    {"year":2023,"ibm":1121,"google":70,  "ionq":35,  "qv_best":4096},
    {"year":2024,"ibm":1121,"google":105, "ionq":35,  "qv_best":2097152},
    {"year":2025,"ibm":1121,"google":105, "ionq":35,  "qv_best":2097152},
]


# ── Technical analysis helpers ────────────────────────────────────────────────

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
    rs = gain.iloc[-1] / loss.iloc[-1]
    return round(float(100 - 100 / (1 + rs)), 1)


def _compute_macd(prices: pd.Series) -> dict:
    ema12  = prices.ewm(span=12, adjust=False).mean()
    ema26  = prices.ewm(span=26, adjust=False).mean()
    macd   = ema12 - ema26
    signal = macd.ewm(span=9, adjust=False).mean()
    hist   = macd - signal
    return {
        "macd":      round(float(macd.iloc[-1]),   3),
        "signal":    round(float(signal.iloc[-1]), 3),
        "histogram": round(float(hist.iloc[-1]),   3),
        "bullish":   bool(hist.iloc[-1] > 0),
    }


def _compute_signal(rsi, macd_bull, price, ema20, ema50, ema200, ytd) -> dict:
    score = 50
    if rsi is not None:
        if rsi < 30:   score += 20
        elif rsi < 45: score += 10
        elif rsi > 70: score -= 20
        elif rsi > 60: score -= 8
    if macd_bull:   score += 10
    else:           score -= 10
    if price and ema200 and price > ema200:  score += 10
    if price and ema50  and price > ema50:   score += 8
    if price and ema20  and price > ema20:   score += 5
    if ytd:
        if ytd > 50:   score += 8
        elif ytd > 20: score += 4
        elif ytd < -30:score -= 10
        elif ytd < -10:score -= 5

    score = max(0, min(100, score))
    if   score >= 75: sig = "STRONG BUY"
    elif score >= 60: sig = "BUY"
    elif score >= 40: sig = "HOLD"
    elif score >= 25: sig = "SELL"
    else:             sig = "STRONG SELL"

    # rough target / stop using EMA levels
    target = stop = None
    if price:
        if sig in ("BUY","STRONG BUY"):
            target = round(price * (1 + (score - 50) / 200), 2)
            stop   = round((ema50 or price * 0.9) * 0.97, 2)
        else:
            target = round(price * (1 - (50 - score) / 200), 2)
            stop   = round((ema20 or price * 1.05) * 1.03, 2)

    return {"signal": sig, "score": score, "target": target, "stop": stop,
            "expected_return_pct": round((target / price - 1)*100, 1) if (target and price) else None}


def _fetch_quantum_markets() -> list[dict]:
    tickers  = [s["ticker"] for s in PUBLIC_STOCKS]
    ytd_start= f"{datetime.today().year}-01-01"
    start_2y = (datetime.today() - timedelta(days=730)).strftime("%Y-%m-%d")
    today    = datetime.today().strftime("%Y-%m-%d")

    try:
        raw = yf.download(tickers, start=start_2y, end=today, progress=False,
                          auto_adjust=True, threads=True)
        if isinstance(raw.columns, pd.MultiIndex):
            cl = raw["Close"]
        else:
            cl = raw
    except Exception as e:
        logger.warning(f"Quantum market download failed: {e}")
        return []

    # YTD reference prices
    try:
        raw_ytd = yf.download(tickers, start=ytd_start, end=today, progress=False,
                              auto_adjust=True, threads=True)
        cl_ytd = raw_ytd["Close"] if isinstance(raw_ytd.columns, pd.MultiIndex) else raw_ytd
    except Exception:
        cl_ytd = pd.DataFrame()

    results = []
    for s in PUBLIC_STOCKS:
        tk = s["ticker"]
        if tk not in cl.columns:
            continue
        px = cl[tk].dropna()
        if px.empty:
            continue

        cur = _safe_float(px.iloc[-1])
        if not cur:
            continue

        def ret(n_days: int):
            if len(px) <= n_days:
                return None
            old = _safe_float(px.iloc[-1 - n_days])
            return round((cur / old - 1) * 100, 1) if old else None

        ytd_ref = None
        if tk in (cl_ytd.columns if not cl_ytd.empty else []):
            ys = cl_ytd[tk].dropna()
            if not ys.empty:
                ytd_ref = _safe_float(ys.iloc[0])
        ytd = round((cur / ytd_ref - 1) * 100, 1) if ytd_ref else None

        rsi      = _compute_rsi(px)
        macd_d   = _compute_macd(px) if len(px) >= 35 else {}

        ema20  = _safe_float(px.ewm(span=20,  adjust=False).mean().iloc[-1])
        ema50  = _safe_float(px.ewm(span=50,  adjust=False).mean().iloc[-1])
        ema200 = _safe_float(px.ewm(span=200, adjust=False).mean().iloc[-1])

        sig_d = _compute_signal(rsi, macd_d.get("bullish", False), cur, ema20, ema50, ema200, ytd)

        # get market cap
        mkt_cap = None
        try:
            info    = yf.Ticker(tk).fast_info
            mkt_cap = _safe_float(info.get("market_cap") or info.get("marketCap"))
        except Exception:
            pass

        results.append({
            **s,
            "price":        round(cur, 2),
            "mkt_cap_b":    round(mkt_cap / 1e9, 2) if mkt_cap else None,
            "ret_1m":  ret(21),
            "ret_3m":  ret(63),
            "ret_6m":  ret(126),
            "ret_ytd": ytd,
            "ret_1y":  ret(252),
            "rsi":     rsi,
            "macd":    macd_d,
            "ema20":   round(ema20,  2) if ema20  else None,
            "ema50":   round(ema50,  2) if ema50  else None,
            "ema200":  round(ema200, 2) if ema200 else None,
            "vs_ema20":  round((cur/ema20  - 1)*100, 1) if ema20  else None,
            "vs_ema50":  round((cur/ema50  - 1)*100, 1) if ema50  else None,
            "vs_ema200": round((cur/ema200 - 1)*100, 1) if ema200 else None,
            **sig_d,
        })

    return results


def _compute_readiness(markets: list[dict]) -> dict:
    # Hardware component: based on curated scores
    hw_scores   = [h["score"] for h in HARDWARE_DATA]
    hw          = float(np.mean(hw_scores)) * 0.25

    # Error correction: only a few systems have logical qubits
    lq_systems  = sum(1 for h in HARDWARE_DATA if h.get("logical_qubits", 0) > 0)
    ec          = min(20, lq_systems / len(HARDWARE_DATA) * 100 * 0.20)

    # Enterprise adoption
    ent_scores  = [e["score"] for e in ENTERPRISE_DATA]
    ent         = float(np.mean(ent_scores)) * 0.15

    # Government funding (scale: $10B total global = full score)
    total_fund  = sum(g["total_b"] for g in GOVT_FUNDING)
    govt        = min(10, total_fund / 40 * 100) * 0.10

    # Patents & research
    total_pats  = sum(p["patents_2024"] for p in PATENT_DATA)
    pat         = min(10, total_pats / 2000 * 100) * 0.10

    # Commercialization (public market revenue proxy)
    comm        = 6.5  # scaled: early commercial stage

    # Market sentiment (avg pure-play stock YTD)
    pure_ytds   = [m["ret_ytd"] for m in markets
                   if m.get("type") == "Pure-Play" and m.get("ret_ytd") is not None]
    avg_ytd     = float(np.mean(pure_ytds)) if pure_ytds else 0
    sent        = max(0, min(10, (avg_ytd + 30) / 60 * 10))

    total = int(round(hw + ec + ent + govt + pat + comm + sent))
    total = max(0, min(100, total))

    if   total < 20: regime = "Fundamental Research"
    elif total < 40: regime = "Hardware Race"
    elif total < 60: regime = "Early Commercialization"
    elif total < 80: regime = "Enterprise Adoption"
    else:            regime = "Quantum Breakthrough Cycle"

    return {
        "score":  total,
        "regime": regime,
        "components": {
            "hardware":        round(hw, 1),
            "error_correction":round(ec, 1),
            "enterprise":      round(ent, 1),
            "government":      round(govt, 1),
            "patents":         round(pat, 1),
            "commercialization":round(comm, 1),
            "sentiment":       round(sent, 1),
        }
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/markets")
async def get_markets():
    loop    = asyncio.get_event_loop()
    markets = await loop.run_in_executor(_EXEC, _fetch_quantum_markets)
    return {"stocks": markets, "count": len(markets), "as_of": datetime.today().strftime("%Y-%m-%d %H:%M")}


@router.get("/overview")
async def get_overview():
    loop    = asyncio.get_event_loop()
    markets = await loop.run_in_executor(_EXEC, _fetch_quantum_markets)
    readiness = _compute_readiness(markets)

    pure    = [m for m in markets if m.get("type") == "Pure-Play"]
    total_mktcap = sum(m["mkt_cap_b"] for m in markets if m.get("mkt_cap_b"))
    global_inv   = sum(g["total_b"] for g in GOVT_FUNDING)
    total_qubits = sum(h["qubits"] for h in HARDWARE_DATA if h.get("qubits"))
    total_lq     = sum(h.get("logical_qubits", 0) for h in HARDWARE_DATA)

    return {
        "readiness": readiness,
        "kpis": {
            "global_investment_b":  round(global_inv, 1),
            "total_qubits":         total_qubits,
            "logical_qubits":       total_lq,
            "enterprise_pilots":    sum(e["pilots"]    for e in ENTERPRISE_DATA),
            "enterprise_contracts": sum(e["contracts"] for e in ENTERPRISE_DATA),
            "public_mktcap_b":      round(total_mktcap, 1),
            "vc_raised_m":          sum(v["raised_m"] for v in VC_DATA),
        },
        "as_of": datetime.today().strftime("%Y-%m-%d %H:%M"),
    }


@router.get("/hardware")
async def get_hardware():
    ranked = sorted(HARDWARE_DATA, key=lambda x: x["score"], reverse=True)
    for i, h in enumerate(ranked):
        h["rank"] = i + 1
    return {"hardware": ranked, "history": QUBIT_HISTORY}


@router.get("/government")
async def get_government():
    ranked = sorted(GOVT_FUNDING, key=lambda x: x["total_b"], reverse=True)
    for i, g in enumerate(ranked):
        g["rank"] = i + 1
    total_annual  = sum(g["annual_b"] for g in ranked)
    total_overall = sum(g["total_b"]  for g in ranked)
    index_score   = int(min(100, total_overall / 30 * 100))
    return {
        "funding": ranked,
        "total_annual_b":  round(total_annual, 1),
        "total_overall_b": round(total_overall, 1),
        "investment_index": index_score,
    }


@router.get("/enterprise")
async def get_enterprise():
    ranked = sorted(ENTERPRISE_DATA, key=lambda x: x["score"], reverse=True)
    for i, e in enumerate(ranked):
        e["rank"] = i + 1
    adoption_score = int(np.mean([e["score"] for e in ENTERPRISE_DATA]))
    return {
        "industries": ranked,
        "software":   SOFTWARE_DATA,
        "adoption_score": adoption_score,
    }


@router.get("/vc")
async def get_vc():
    ranked = sorted(VC_DATA, key=lambda x: x["raised_m"], reverse=True)
    total_raised = sum(v["raised_m"] for v in VC_DATA)
    total_val    = sum(v["val_b"] for v in VC_DATA if v.get("val_b"))
    return {
        "startups":     ranked,
        "patents":      PATENT_DATA,
        "total_raised_m": total_raised,
        "total_val_b":    round(total_val, 1),
        "private_score":  72,
    }


@router.get("/forecast")
async def get_forecast():
    # Logistic commercialization probability curves
    readiness_now = 42  # ~current state

    def logistic(t, L=100, k=0.18, x0=8):
        return round(L / (1 + np.exp(-k * (t - x0))), 1)

    years_out = [1, 2, 3, 5, 7, 10]
    comm_probs = [{
        "years_out": y,
        "year": datetime.today().year + y,
        "broad_commercial_pct": logistic(y, L=85, k=0.25, x0=6),
        "fault_tolerant_pct":   logistic(y, L=80, k=0.20, x0=8),
        "quantum_advantage_pct":logistic(y, L=95, k=0.30, x0=4),
    } for y in years_out]

    # Qubit growth projection (Moore's law analog ~doubling every 18 months)
    base_qubits = 1121  # IBM Condor
    qubit_proj  = [{
        "year": datetime.today().year + y,
        "physical_qubits": int(base_qubits * (2 ** (y / 1.5))),
        "logical_qubits":  max(0, int(60 * (2 ** (y / 2)) - 60)),
        "qv_estimate":     int(2097152 * (4 ** (y / 2))),
    } for y in range(1, 8)]

    # Quantum volume historical + projected for chart
    qv_timeline = [
        {"year":2019,"qv":4},{"year":2020,"qv":64},{"year":2021,"qv":512},
        {"year":2022,"qv":512},{"year":2023,"qv":4096},{"year":2024,"qv":2097152},
    ] + [{"year":datetime.today().year + y, "qv":int(2097152 * (4**y)), "projected":True} for y in range(1, 6)]

    return {
        "commercialization_probs": comm_probs,
        "qubit_projections":       qubit_proj,
        "qv_timeline":             qv_timeline,
        "readiness_now":           readiness_now,
    }


@router.get("/leaderboard")
async def get_leaderboard():
    loop    = asyncio.get_event_loop()
    markets = await loop.run_in_executor(_EXEC, _fetch_quantum_markets)
    mkt_map = {m["ticker"]: m for m in markets}

    # Quantum Winner Model: rank by composite of tech, funding, adoption, ecosystem
    hw_map  = {h["company"].split()[0]: h for h in HARDWARE_DATA}

    leaders = []
    for s in PUBLIC_STOCKS:
        tk = s["ticker"]
        m  = mkt_map.get(tk, {})

        # tech score from hardware
        hw_key  = {"IONQ":"IonQ","RGTI":"Rigetti","QBTS":"D-Wave","IBM":"IBM",
                   "GOOGL":"Google","MSFT":"Microsoft","AMZN":"Amazon","QUBT":"Quantum"}.get(tk,"")
        hw_data = next((h for h in HARDWARE_DATA if hw_key and hw_key.lower() in h["company"].lower()), None)
        tech_s  = hw_data["score"] if hw_data else 30

        # funding score (pure plays: based on market cap; diversified: big)
        mc = m.get("mkt_cap_b", 0) or 0
        fund_s = min(100, int(mc / 10 * 100)) if s["type"] == "Pure-Play" else 95

        # adoption (diversified = cloud provider = high)
        adopt_s = 40 if s["type"] == "Pure-Play" else 80

        # ecosystem (github stars, SDK popularity)
        eco_map = {"IBM":90,"GOOGL":82,"MSFT":72,"AMZN":65,"IONQ":58,"RGTI":38,"QBTS":42,"QUBT":28}
        eco_s   = eco_map.get(tk, 35)

        composite = int(round(tech_s*0.35 + fund_s*0.25 + adopt_s*0.20 + eco_s*0.20))

        leaders.append({
            **s,
            "price":        m.get("price"),
            "mkt_cap_b":    m.get("mkt_cap_b"),
            "ret_ytd":      m.get("ret_ytd"),
            "signal":       m.get("signal"),
            "signal_score": m.get("score"),
            "tech_score":   tech_s,
            "fund_score":   fund_s,
            "adopt_score":  adopt_s,
            "eco_score":    eco_s,
            "composite":    composite,
        })

    leaders.sort(key=lambda x: x["composite"], reverse=True)
    for i, l in enumerate(leaders):
        l["rank"] = i + 1

    geopolitical = [
        {"region":"US-China Quantum Race", "risk":"HIGH",   "detail":"Export controls on quantum hardware & components tightening"},
        {"region":"NATO Quantum Advantage","risk":"MEDIUM", "detail":"Allied nations accelerating quantum comms & sensing programs"},
        {"region":"EU Tech Sovereignty",   "risk":"MEDIUM", "detail":"Quantum Flagship pushing European-only supply chains"},
        {"region":"India-China Competition","risk":"LOW",   "detail":"India NM-QTA ramping; early-stage vs China maturity gap"},
    ]

    return {
        "leaderboard":    leaders,
        "geopolitical":   geopolitical,
        "total_companies":len(leaders),
        "as_of":          datetime.today().strftime("%Y-%m-%d %H:%M"),
    }
