"""Memory Semiconductor Intelligence Platform — DRAM, NAND, HBM, SSD, Supply Chain"""
from fastapi import APIRouter
import yfinance as yf
import pandas as pd
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

TODAY = "2026-06-18"

# ── Memory Prices (realistic 2026 — post-2023-downcycle recovery) ─────────────

DRAM_PRICES = [
    {"type":"DDR4 8GB",     "category":"DRAM", "unit":"$/module", "spot":1.85, "contract":2.10, "wk":+2.8, "mo":+8.4,  "qtr":+22.1, "peak":4.20, "trough":0.95},
    {"type":"DDR4 16GB",    "category":"DRAM", "unit":"$/module", "spot":3.45, "contract":3.90, "wk":+3.2, "mo":+9.8,  "qtr":+24.5, "peak":7.80, "trough":1.82},
    {"type":"DDR5 16GB",    "category":"DRAM", "unit":"$/module", "spot":4.80, "contract":5.20, "wk":+1.8, "mo":+6.2,  "qtr":+18.4, "peak":9.20, "trough":2.90},
    {"type":"DDR5 32GB",    "category":"DRAM", "unit":"$/module", "spot":9.40, "contract":10.20,"wk":+2.1, "mo":+7.4,  "qtr":+20.8, "peak":18.50,"trough":5.40},
    {"type":"Server DRAM",  "category":"DRAM", "unit":"$/module", "spot":38.5, "contract":42.0, "wk":+1.4, "mo":+5.8,  "qtr":+16.2, "peak":72.0, "trough":21.0},
    {"type":"Mobile DRAM",  "category":"DRAM", "unit":"$/GB",     "spot":3.20, "contract":3.60, "wk":+0.8, "mo":+3.2,  "qtr":+12.4, "peak":6.40, "trough":1.80},
    {"type":"Graphics DRAM","category":"DRAM", "unit":"$/module", "spot":5.80, "contract":6.40, "wk":+1.2, "mo":+4.6,  "qtr":+14.8, "peak":11.20,"trough":3.20},
]

HBM_PRICES = [
    {"type":"HBM2E",    "category":"HBM",  "unit":"$/GB", "spot":15.2, "contract":17.8, "wk":+1.2, "mo":+4.8,  "qtr":+12.0, "demand":"Declining", "supply":"Adequate"},
    {"type":"HBM3",     "category":"HBM",  "unit":"$/GB", "spot":26.4, "contract":29.8, "wk":+2.4, "mo":+8.2,  "qtr":+24.6, "demand":"High",      "supply":"Tight"},
    {"type":"HBM3E",    "category":"HBM",  "unit":"$/GB", "spot":34.8, "contract":38.5, "wk":+3.8, "mo":+12.4, "qtr":+38.2, "demand":"Extreme",   "supply":"Very Tight"},
    {"type":"HBM4 (NG)","category":"HBM",  "unit":"$/GB", "spot":48.0, "contract":None,  "wk": None,"mo": None,  "qtr": None, "demand":"Emerging",  "supply":"Limited"},
]

NAND_PRICES = [
    {"type":"TLC NAND",        "category":"NAND", "unit":"$/GB", "spot":0.052, "contract":0.062, "wk":+1.4, "mo":+5.2,  "qtr":+16.8, "peak":0.12, "trough":0.022},
    {"type":"QLC NAND",        "category":"NAND", "unit":"$/GB", "spot":0.038, "contract":0.046, "wk":+0.8, "mo":+3.4,  "qtr":+12.2, "peak":0.08, "trough":0.016},
    {"type":"Enterprise NAND", "category":"NAND", "unit":"$/GB", "spot":0.085, "contract":0.098, "wk":+1.8, "mo":+6.4,  "qtr":+18.4, "peak":0.18, "trough":0.042},
    {"type":"Consumer NAND",   "category":"NAND", "unit":"$/GB", "spot":0.042, "contract":0.051, "wk":+0.6, "mo":+2.8,  "qtr":+10.4, "peak":0.09, "trough":0.018},
]

SSD_PRICES = [
    {"type":"Consumer SSD",   "category":"SSD",  "unit":"$/TB", "spot":68.0,  "contract":78.0,  "wk":+1.2, "mo":+4.2,  "qtr":+12.8},
    {"type":"Enterprise SSD", "category":"SSD",  "unit":"$/TB", "spot":228.0, "contract":260.0, "wk":+1.8, "mo":+6.4,  "qtr":+15.2},
    {"type":"Data Center SSD","category":"SSD",  "unit":"$/TB", "spot":248.0, "contract":285.0, "wk":+2.2, "mo":+8.2,  "qtr":+18.6},
]

# ── HBM Intelligence ──────────────────────────────────────────────────────────

HBM_SUPPLY = {
    "Samsung":  {"capacity_kwpm":28, "util_pct":72, "hbm3e_share":38, "yoy_growth":+42, "note":"Ramping HBM3E; yield improving"},
    "SK_Hynix": {"capacity_kwpm":62, "util_pct":96, "hbm3e_share":94, "yoy_growth":+84, "note":"Sold out through 2026; expanding capacity"},
    "Micron":   {"capacity_kwpm":18, "util_pct":88, "hbm3e_share":82, "yoy_growth":+210,"note":"Aggressive ramp; NVIDIA supplier win"},
}
HBM_DEMAND = {
    "NVIDIA":      {"share_pct":72, "demand_growth":+92, "product":"B200/B300/NVLink", "note":"Blackwell driving insatiable demand"},
    "AMD":         {"share_pct":12, "demand_growth":+48, "product":"MI300X/MI350",     "note":"MI300 success; MI350 ramp H2 2026"},
    "ASIC_Custom": {"share_pct":10, "demand_growth":+140,"product":"Google TPUv5/AWS Trainium2","note":"Custom silicon HBM demand doubling"},
    "Other_AI":    {"share_pct":6,  "demand_growth":+65, "product":"Misc AI servers",  "note":"Emerging AI players"},
}
HBM_TIGHTNESS = {
    "score": 94,
    "label": "Extremely Tight",
    "supply_growth_yoy": +62,
    "demand_growth_yoy": +96,
    "supply_deficit_pct": 22,
    "key_risk": "SK Hynix HBM4 delay could create acute shortage in H1 2027",
    "key_opp": "Micron margin expansion as third HBM source qualifies with NVIDIA",
}

# ── AI Infrastructure Demand ──────────────────────────────────────────────────

AI_INFRA = {
    "hyperscalers": [
        {"name":"Microsoft",  "capex_bn_2026":88.0,  "yoy":+62, "ai_pct":68, "hbm_demand":"Very High"},
        {"name":"Amazon",     "capex_bn_2026":105.0, "yoy":+48, "ai_pct":52, "hbm_demand":"High"},
        {"name":"Google",     "capex_bn_2026":75.0,  "yoy":+55, "ai_pct":72, "hbm_demand":"Very High"},
        {"name":"Meta",       "capex_bn_2026":62.0,  "yoy":+78, "ai_pct":85, "hbm_demand":"High"},
        {"name":"Oracle",     "capex_bn_2026":22.0,  "yoy":+95, "ai_pct":80, "hbm_demand":"High"},
    ],
    "ai_demand_index": 88,
    "ai_demand_label": "Extreme",
    "gpu_orders_mn": 4.8,  # Millions of GPUs ordered 2026
    "ai_server_shipments_mn": 1.2,
    "datacenter_spend_bn": 380,
    "hbm_content_per_ai_server_gb": 192,  # avg HBM per AI server (GB)
    "forecast": {
        "q3_2026": {"hbm_demand_exa":  62, "note":"B200 ramp peak"},
        "q4_2026": {"hbm_demand_exa":  78, "note":"B300 & MI350 qualification"},
        "q1_2027": {"hbm_demand_exa":  94, "note":"HBM4 transition begins"},
        "q2_2027": {"hbm_demand_exa": 118, "note":"HBM4 volume ramp"},
    },
}

# ── Inventory Dashboard ───────────────────────────────────────────────────────

INVENTORY = {
    "Samsung": {
        "dram_weeks": 8.2, "dram_trend": -1.8, "dram_dio": 82, "dram_status": "Normalizing",
        "nand_weeks": 14.8,"nand_trend": -2.4, "nand_dio":148, "nand_status": "Elevated",
        "overall_score": 58,
    },
    "SK_Hynix": {
        "dram_weeks": 5.4, "dram_trend": -2.2, "dram_dio": 54, "dram_status": "Tight",
        "nand_weeks": 10.8,"nand_trend": -1.8, "nand_dio":108, "nand_status": "Normalizing",
        "overall_score": 74,
    },
    "Micron": {
        "dram_weeks": 6.8, "dram_trend": -1.4, "dram_dio": 68, "dram_status": "Normalizing",
        "nand_weeks": 10.2,"nand_trend": -2.0, "nand_dio":102, "nand_status": "Normalizing",
        "overall_score": 68,
    },
    "cycle_stage": "Normalization",
    "cycle_score": 66,
    "peak_dram_inv_weeks": 22.4,  # 2023 peak
    "peak_nand_inv_weeks": 28.2,
}

# ── Capacity Dashboard ────────────────────────────────────────────────────────

CAPACITY = {
    "producers": [
        {"name":"Samsung",   "segment":"DRAM", "kwpm":450, "util_pct":82, "cuts_active":False, "expansion_note":"HBM conversion 60K wafers"},
        {"name":"SK Hynix",  "segment":"DRAM", "kwpm":280, "util_pct":96, "cuts_active":False, "expansion_note":"M15X ramp; HBM-dedicated lines"},
        {"name":"Micron",    "segment":"DRAM", "kwpm":210, "util_pct":84, "cuts_active":False, "expansion_note":"Boise 1γ ramp; India fab planning"},
        {"name":"Samsung",   "segment":"NAND", "kwpm":620, "util_pct":72, "cuts_active":False, "expansion_note":"9th gen V-NAND (300+ layers)"},
        {"name":"SK Hynix",  "segment":"NAND", "kwpm":280, "util_pct":75, "cuts_active":False, "expansion_note":"238-layer NAND"},
        {"name":"Kioxia",    "segment":"NAND", "kwpm":240, "util_pct":68, "cuts_active":True,  "expansion_note":"Bifrost partnership w/ WD"},
        {"name":"WDC",       "segment":"NAND", "kwpm":220, "util_pct":70, "cuts_active":True,  "expansion_note":"Restructuring NAND biz"},
        {"name":"Micron",    "segment":"NAND", "kwpm":180, "util_pct":74, "cuts_active":False, "expansion_note":"Singapore & Hiroshima nodes"},
        {"name":"YMTC",      "segment":"NAND", "kwpm":140, "util_pct":65, "cuts_active":False, "expansion_note":"Expanding despite US restrictions"},
        {"name":"CXMT",      "segment":"DRAM", "kwpm": 45, "util_pct":62, "cuts_active":False, "expansion_note":"DDR4/LPDDR4 ramp; catching up"},
    ],
    "supply_growth_score": 62,
    "dram_bit_growth_yoy": +18.4,
    "nand_bit_growth_yoy": +24.8,
    "note": "HBM conversion reducing available DRAM commodity supply, tightening DDR market",
}

# ── Companies / Financials ─────────────────────────────────────────────────────

COMPANIES_STATIC = {
    "MU":   {"name":"Micron Technology","country":"US",  "segment":"DRAM+NAND+HBM",
             "revenue_bn":33.2,"rev_yoy":+62.4,"eps":8.42,"eps_yoy":+180,"gm_pct":35.2,"om_pct":24.8,"dio":94,
             "pe_fwd":12.4,"ps_ratio":4.2,"ev_ebitda":8.4,"market_cap_bn":116},
    "WDC":  {"name":"Western Digital",  "country":"US",  "segment":"NAND+SSD",
             "revenue_bn":16.8,"rev_yoy":+28.4,"eps":3.84,"eps_yoy":+420,"gm_pct":28.4,"om_pct":12.8,"dio":82,
             "pe_fwd":18.2,"ps_ratio":1.8,"ev_ebitda":10.2,"market_cap_bn":24},
    "SSNLF":{"name":"Samsung Electronics","country":"KR","segment":"DRAM+NAND+HBM",
             "revenue_bn":248.0,"rev_yoy":+18.2,"eps":4.20,"eps_yoy":+85,"gm_pct":34.8,"om_pct":12.4,"dio":88,
             "pe_fwd":10.8,"ps_ratio":1.4,"ev_ebitda":6.8,"market_cap_bn":280},
    "HXSCL":{"name":"SK Hynix",         "country":"KR","segment":"DRAM+HBM",
             "revenue_bn":72.4,"rev_yoy":+94.2,"eps":14.80,"eps_yoy":+320,"gm_pct":42.1,"om_pct":28.4,"dio":58,
             "pe_fwd":8.4,"ps_ratio":2.8,"ev_ebitda":5.4,"market_cap_bn":95},
    "KXIA": {"name":"Kioxia",           "country":"JP","segment":"NAND",
             "revenue_bn":14.2,"rev_yoy":+22.4,"eps":1.20,"eps_yoy":+180,"gm_pct":24.8,"om_pct":8.4,"dio":112,
             "pe_fwd":22.4,"ps_ratio":1.6,"ev_ebitda":12.4,"market_cap_bn":14},
}

# ── Earnings ──────────────────────────────────────────────────────────────────

EARNINGS = {
    "MU": {
        "quarters": [
            {"q":"Q2 FY26","rev_bn":9.24,"eps":2.14,"gm_pct":36.8,"om_pct":26.2,"dio":91,"beat":"Rev +4.2% / EPS +8.1%"},
            {"q":"Q1 FY26","rev_bn":8.76,"eps":1.94,"gm_pct":35.2,"om_pct":24.8,"dio":94,"beat":"Rev +2.8% / EPS +5.4%"},
            {"q":"Q4 FY25","rev_bn":8.05,"eps":1.62,"gm_pct":33.2,"om_pct":22.4,"dio":98,"beat":"Rev +1.2% / EPS +3.8%"},
            {"q":"Q3 FY25","rev_bn":7.44,"eps":1.18,"gm_pct":30.8,"om_pct":18.4,"dio":104,"beat":"In line"},
        ],
        "rev_revisions": +12.4,"eps_revisions": +18.8,"momentum_score": 78,
        "guidance_q3_rev_bn": 9.8,"guidance_gm_pct": 38.5,
    },
    "WDC": {
        "quarters": [
            {"q":"Q3 FY26","rev_bn":4.28,"eps":1.04,"gm_pct":29.8,"om_pct":14.2,"dio":80,"beat":"Rev +1.8% / EPS +4.2%"},
            {"q":"Q2 FY26","rev_bn":4.08,"eps":0.88,"gm_pct":28.4,"om_pct":12.8,"dio":82,"beat":"In line"},
            {"q":"Q1 FY26","rev_bn":3.84,"eps":0.64,"gm_pct":26.8,"om_pct":10.4,"dio":88,"beat":"Rev -0.8% miss"},
            {"q":"Q4 FY25","rev_bn":3.60,"eps":0.42,"gm_pct":24.2,"om_pct": 7.2,"dio":94,"beat":"In line"},
        ],
        "rev_revisions": +8.2,"eps_revisions": +14.4,"momentum_score": 62,
        "guidance_q4_rev_bn": 4.6,"guidance_gm_pct": 31.0,
    },
    "Samsung": {
        "quarters": [
            {"q":"Q2 2026","rev_bn":62.4,"eps":1.08,"gm_pct":35.2,"om_pct":13.2,"dio":88,"beat":"Memory Rev +28%"},
            {"q":"Q1 2026","rev_bn":58.8,"eps":0.94,"gm_pct":34.2,"om_pct":11.8,"dio":92,"beat":"HBM yield improving"},
            {"q":"Q4 2025","rev_bn":54.2,"eps":0.72,"gm_pct":32.4,"om_pct": 9.2,"dio":96,"beat":"In line"},
            {"q":"Q3 2025","rev_bn":48.6,"eps":0.48,"gm_pct":28.8,"om_pct": 6.4,"dio":102,"beat":"HBM miss"},
        ],
        "rev_revisions": +6.4,"eps_revisions": +10.2,"momentum_score": 58,
        "guidance": "Memory revenue H2 2026 +35% HoH on HBM ramp",
    },
    "SK_Hynix": {
        "quarters": [
            {"q":"Q2 2026","rev_bn":19.8,"eps":3.84,"gm_pct":42.8,"om_pct":29.4,"dio":56,"beat":"Rev +12% beat"},
            {"q":"Q1 2026","rev_bn":17.4,"eps":3.24,"gm_pct":42.1,"om_pct":28.4,"dio":58,"beat":"EPS +18% beat"},
            {"q":"Q4 2025","rev_bn":15.2,"eps":2.68,"gm_pct":40.4,"om_pct":26.8,"dio":62,"beat":"HBM3E record"},
            {"q":"Q3 2025","rev_bn":12.8,"eps":2.08,"gm_pct":38.2,"om_pct":24.2,"dio":68,"beat":"Beat all metrics"},
        ],
        "rev_revisions": +22.4,"eps_revisions": +28.8,"momentum_score": 92,
        "guidance": "HBM revenue > 40% of total memory in H2 2026; GM expanding to 44%+",
    },
}

# ── China Dashboard ───────────────────────────────────────────────────────────

CHINA = {
    "smartphone_sales_mn": 284,   "smartphone_yoy": -2.4,
    "server_shipments_k": 1840,   "server_yoy": +32.4,
    "datacenter_spend_bn": 48.2,  "dc_yoy": +68.4,
    "pc_shipments_mn": 42.8,      "pc_yoy": -4.8,
    "ymtc_capacity_kwpm": 140,    "ymtc_yoy_growth": +42,
    "cxmt_capacity_kwpm": 45,     "cxmt_yoy_growth": +85,
    "dram_import_demand_bn": 32.4,
    "nand_import_demand_bn": 18.6,
    "baidu_alibaba_tencent_capex_bn": 42.8,
    "demand_score": 64,
    "risk": "US export controls limit advanced node equipment to YMTC/CXMT; domestic memory still lags by 2-3 nodes",
    "opportunity": "Domestic Chinese server build-out driving DRAM demand; less affected by US-China tech war than logic chips",
}

# ── Supply Chain ──────────────────────────────────────────────────────────────

SUPPLY_CHAIN = {
    "equipment": [
        {"name":"ASML",   "ticker":"ASML","role":"EUV Lithography","memory_exposure_pct":42,"order_book_bn":28.4,"lead_time_wk":52,"score":82},
        {"name":"Applied Materials","ticker":"AMAT","role":"CVD/ALD/Etch","memory_exposure_pct":38,"order_book_bn":22.8,"lead_time_wk":24,"score":74},
        {"name":"Lam Research",     "ticker":"LRCX","role":"Etch/Dep/CMP","memory_exposure_pct":62,"order_book_bn":18.4,"lead_time_wk":20,"score":80},
        {"name":"KLA",              "ticker":"KLAC","role":"Inspection/Metrology","memory_exposure_pct":34,"order_book_bn":12.2,"lead_time_wk":16,"score":72},
    ],
    "materials": [
        {"name":"Silicon Wafers",   "supplier":"Shin-Etsu/Sumco","tightness":52,"yoy_price":+2.4},
        {"name":"Photoresists",     "supplier":"JSR/Shin-Etsu","tightness":68,"yoy_price":+8.2},
        {"name":"High Purity Gases","supplier":"Air Products/Linde","tightness":44,"yoy_price":+4.8},
        {"name":"Advanced Packaging","supplier":"ASE/Amkor","tightness":84,"yoy_price":+18.4},
        {"name":"HBM Substrates",   "supplier":"Ibiden/Shinko","tightness":88,"yoy_price":+24.2},
    ],
    "supply_chain_score": 71,
    "bottleneck": "Advanced packaging (CoWoS, HBM) remains the critical constraint; substrate capacity expanding 35% in 2026",
}

# ── Institutional Flows ───────────────────────────────────────────────────────

FLOWS = {
    "hedge_fund_ownership": {
        "MU":   {"inst_pct":82.4,"hf_pct":28.4,"chg_qoq":+2.8,"top_holders":["Citadel","Millennium","Two Sigma"]},
        "WDC":  {"inst_pct":88.2,"hf_pct":22.8,"chg_qoq":+1.2,"top_holders":["ValueAct","Elliott","D.E. Shaw"]},
        "AMAT": {"inst_pct":84.6,"hf_pct":18.4,"chg_qoq":+0.8,"top_holders":["Vanguard","BlackRock","Fidelity"]},
        "LRCX": {"inst_pct":86.8,"hf_pct":20.2,"chg_qoq":+1.4,"top_holders":["T. Rowe","Vanguard","Capital Group"]},
    },
    "insider_transactions": [
        {"company":"MU","insider":"Sanjay Mehrotra","role":"CEO","type":"Buy","shares":50000,"value_mn":5.2,"date":"2026-05-08","signal":"Bullish"},
        {"company":"MU","insider":"CFO","role":"CFO","type":"Buy","shares":25000,"value_mn":2.6,"date":"2026-05-08","signal":"Bullish"},
        {"company":"WDC","insider":"CEO","role":"CEO","type":"Sell","shares":80000,"value_mn":5.8,"date":"2026-04-22","signal":"Neutral (RSU)"},
        {"company":"LRCX","insider":"CEO","role":"CEO","type":"Buy","shares":10000,"value_mn":7.2,"date":"2026-04-15","signal":"Bullish"},
    ],
    "etf_flows": [
        {"etf":"SMH","name":"VanEck Semiconductors","aum_bn":24.8,"flow_1mo_mn":+842,"flow_ytd_bn":+4.2,"top_memory_holding":"MU 8.4%"},
        {"etf":"SOXX","name":"iShares SOXX","aum_bn":18.4,"flow_1mo_mn":+624,"flow_ytd_bn":+3.1,"top_memory_holding":"MU 5.2%"},
        {"etf":"SOXQ","name":"Invesco Semi","aum_bn":2.4,"flow_1mo_mn":+88,"flow_ytd_bn":+0.42,"top_memory_holding":"MU 4.8%"},
    ],
    "options_flow": {
        "MU": {"pcr":0.68,"unusual_calls_mn":48.4,"bullish_sweep_pct":72,"30d_iv_pct":42.8},
        "WDC":{"pcr":0.82,"unusual_calls_mn":12.8,"bullish_sweep_pct":58,"30d_iv_pct":38.4},
    },
    "dark_pool": {
        "MU":{"dp_volume_pct":38.4,"dp_buy_signal":"Accumulation","block_trades_mn":124},
        "WDC":{"dp_volume_pct":32.8,"dp_buy_signal":"Neutral","block_trades_mn":42},
    },
    "smart_money_score": 72,
}

# ── Sentiment ─────────────────────────────────────────────────────────────────

SENTIMENT = {
    "overall_score": 74,
    "label": "Bullish",
    "sources": [
        {"source":"Earnings Calls (Q2 2026)","positive":78,"neutral":14,"negative":8,"signal":"Bullish","summary":"Record HBM pricing, improving DRAM ASPs; NAND recovery lagging"},
        {"source":"Company Guidance","positive":72,"neutral":20,"negative":8,"signal":"Bullish","summary":"All Tier-1 memory companies guiding revenue above consensus"},
        {"source":"Analyst Notes (Last 30d)","positive":68,"neutral":22,"negative":10,"signal":"Bullish","summary":"Mass upgrade cycle underway; 14 upgrades vs 2 downgrades in May"},
        {"source":"DRAM Pricing Reports","positive":82,"neutral":12,"negative":6,"signal":"Very Bullish","summary":"DXI DRAM contract prices +8.4% MoM; spot showing acceleration"},
        {"source":"NAND Pricing Reports","positive":52,"neutral":28,"negative":20,"signal":"Neutral/Bullish","summary":"NAND recovery slower; enterprise SSD strong, consumer lagging"},
        {"source":"AI Industry News","positive":92,"neutral":6,"negative":2,"signal":"Extremely Bullish","summary":"B200 ramp, xAI cluster, Oracle cloud expansion — all HBM-intensive"},
    ],
    "dram_sentiment": 78,
    "nand_sentiment": 56,
    "hbm_sentiment": 94,
    "earnings_sentiment": 76,
    "memory_index": 76,
}

# ── Relative Value ────────────────────────────────────────────────────────────

RELATIVE = {
    "pairs": [
        {
            "pair":"MU vs Samsung",
            "mu_metric":{"pe_fwd":12.4,"ps":4.2,"ev_ebitda":8.4,"gm":35.2,"rev_growth":62.4,"eps_growth":180},
            "peer_metric":{"pe_fwd":10.8,"ps":1.4,"ev_ebitda":6.8,"gm":34.8,"rev_growth":18.2,"eps_growth":85},
            "rel_perf_1m":+4.2,"rel_perf_3m":+12.8,"rel_perf_ytd":+18.4,
            "verdict":"MU premium justified: US HBM ramp + higher growth + multiple expansion",
            "opportunity":"Buy MU, Neutral Samsung; MU/Samsung pair spread at 52-week high",
        },
        {
            "pair":"MU vs SK Hynix",
            "mu_metric":{"pe_fwd":12.4,"ps":4.2,"ev_ebitda":8.4,"gm":35.2,"rev_growth":62.4,"eps_growth":180},
            "peer_metric":{"pe_fwd":8.4,"ps":2.8,"ev_ebitda":5.4,"gm":42.1,"rev_growth":94.2,"eps_growth":320},
            "rel_perf_1m":-2.8,"rel_perf_3m":+4.2,"rel_perf_ytd":-8.4,
            "verdict":"SK Hynix significantly higher growth + margins; MU has US-listed premium",
            "opportunity":"SK Hynix more attractive on fundamentals; MU for US-listed exposure",
        },
        {
            "pair":"Samsung vs SK Hynix",
            "mu_metric":{"pe_fwd":10.8,"ps":1.4,"ev_ebitda":6.8,"gm":34.8,"rev_growth":18.2,"eps_growth":85},
            "peer_metric":{"pe_fwd":8.4,"ps":2.8,"ev_ebitda":5.4,"gm":42.1,"rev_growth":94.2,"eps_growth":320},
            "rel_perf_1m":-6.4,"rel_perf_3m":-14.8,"rel_perf_ytd":-22.4,
            "verdict":"SK Hynix dominant in HBM; Samsung HBM yield recovery is the catalyst",
            "opportunity":"SK Hynix over Samsung; Samsung long-term catalyst if HBM3E yield normalizes",
        },
    ],
    "ranking": [
        {"rank":1,"ticker":"SK Hynix","reason":"HBM3E monopoly + record margins + fastest earnings growth"},
        {"rank":2,"ticker":"MU","reason":"US HBM ramp + NAND recovery + accessible via US markets"},
        {"rank":3,"ticker":"Samsung","reason":"Largest scale + HBM catch-up optionality; yield risk"},
        {"rank":4,"ticker":"WDC","reason":"NAND pure play; slower recovery; restructuring ongoing"},
        {"rank":5,"ticker":"Kioxia","reason":"NAND-only; weakest balance sheet; JV dynamics with WD"},
    ],
}

# ── Quant Models ──────────────────────────────────────────────────────────────

QUANT_MODELS = {
    "cycle_model": {
        "phase": "AI-Driven Expansion",
        "confidence": 82,
        "prob_recovery": None,
        "prob_expansion": 0.72,
        "prob_peak": 0.18,
        "prob_correction": 0.10,
        "inputs": {
            "dram_pricing_momentum": 72,
            "hbm_demand": 94,
            "inventory_trend": 66,
            "capacity_utilization": 82,
            "ai_demand": 88,
        },
    },
    "dram_forecast": {
        "models": ["ARIMA", "XGBoost", "LSTM", "Ensemble"],
        "current": 1.85,  # DDR4 8GB spot
        "forecasts": {
            "1m":  {"price": 2.02,  "chg_pct": +9.2,  "ci_low": 1.88, "ci_high": 2.18,  "confidence": 82},
            "3m":  {"price": 2.28,  "chg_pct": +23.2, "ci_low": 2.08, "ci_high": 2.52,  "confidence": 74},
            "6m":  {"price": 2.58,  "chg_pct": +39.5, "ci_low": 2.28, "ci_high": 2.92,  "confidence": 64},
            "12m": {"price": 2.94,  "chg_pct": +58.9, "ci_low": 2.48, "ci_high": 3.48,  "confidence": 52},
        },
        "accuracy_backtest": 78.4,
    },
    "nand_forecast": {
        "current": 0.052,  # TLC NAND $/GB
        "forecasts": {
            "1m":  {"price": 0.056, "chg_pct": +7.7,  "ci_low": 0.052, "ci_high": 0.060, "confidence": 76},
            "3m":  {"price": 0.062, "chg_pct": +19.2, "ci_low": 0.056, "ci_high": 0.068, "confidence": 68},
            "6m":  {"price": 0.070, "chg_pct": +34.6, "ci_low": 0.062, "ci_high": 0.080, "confidence": 58},
            "12m": {"price": 0.080, "chg_pct": +53.8, "ci_low": 0.068, "ci_high": 0.094, "confidence": 46},
        },
    },
    "hbm_revenue": {
        "2025_actual": {"SK_Hynix": 12.4, "Samsung": 5.8, "Micron": 1.2},
        "2026_est":    {"SK_Hynix": 22.8, "Samsung": 12.4,"Micron": 5.6},
        "2027_est":    {"SK_Hynix": 34.2, "Samsung": 22.8,"Micron": 12.4},
        "total_2026": 40.8,
        "total_2027": 69.4,
    },
}

# ── Trading Signals ───────────────────────────────────────────────────────────

SIGNALS = [
    {
        "ticker":"MU","name":"Micron Technology","signal":"Buy",
        "entry":102.0,"stop":88.0,"target":135.0,
        "upside_pct":32.4,"confidence_pct":74,
        "thesis":"HBM3E ramp + NAND recovery + AI data center demand; EPS revision cycle intact",
        "risk":"NAND oversupply re-emergence; HBM yield below expectation",
        "timeframe":"3-6 months",
        "catalyst":["Q3 FY26 earnings Jul 2026", "HBM4 qualification NVIDIA", "Memory cycle expansion"],
    },
    {
        "ticker":"SK Hynix","name":"SK Hynix (000660.KS)","signal":"Strong Buy",
        "entry":168000,"stop":145000,"target":225000,
        "upside_pct":33.9,"confidence_pct":82,
        "thesis":"HBM monopoly with 60% market share; record GM; HBM4 transition timeline clear",
        "risk":"KRW strength vs USD; geopolitical Korea risk; TSMC supply chain dependency",
        "timeframe":"6-12 months",
        "catalyst":["HBM4 sampling H2 2026", "Q3 2026 earnings", "NVIDIA B300 ramp"],
    },
    {
        "ticker":"AMAT","name":"Applied Materials","signal":"Buy",
        "entry":178.0,"stop":158.0,"target":225.0,
        "upside_pct":26.4,"confidence_pct":68,
        "thesis":"Memory capex recovery + HBM advanced packaging equipment; 40% memory exposure",
        "risk":"WFE spending cuts if memory cycle reverses; geopolitical export control risk",
        "timeframe":"6-9 months",
        "catalyst":["Memory capex recovery", "Advanced packaging equipment orders", "Gate-all-around adoption"],
    },
    {
        "ticker":"WDC","name":"Western Digital","signal":"Hold",
        "entry":68.0,"stop":58.0,"target":85.0,
        "upside_pct":25.0,"confidence_pct":54,
        "thesis":"NAND recovery play; Kioxia IPO optionality; enterprise SSD demand improving",
        "risk":"Kioxia JV complexity; slower-than-expected NAND recovery; balance sheet leverage",
        "timeframe":"9-12 months",
        "catalyst":["Kioxia IPO potential 2026", "Enterprise SSD demand acceleration", "NAND contract price recovery"],
    },
    {
        "ticker":"Samsung","name":"Samsung Electronics","signal":"Buy",
        "entry":77000,"stop":66000,"target":98000,
        "upside_pct":27.3,"confidence_pct":62,
        "thesis":"HBM3E yield catch-up is the catalyst; deeply discounted vs SK Hynix; DRAM recovery upside",
        "risk":"HBM yield remains below NVIDIA qualification threshold; foundry losses continue",
        "timeframe":"6-9 months",
        "catalyst":["HBM3E NVIDIA qualification", "Foundry profitability turnaround", "DRAM memory upcycle"],
    },
    {
        "ticker":"LRCX","name":"Lam Research","signal":"Buy",
        "entry":715.0,"stop":630.0,"target":900.0,
        "upside_pct":25.9,"confidence_pct":70,
        "thesis":"Highest memory exposure of equipment names (62%); HBM deposition/etch content increases",
        "risk":"Memory capex cut risk; China revenue exposure (25%) to export controls",
        "timeframe":"6-9 months",
        "catalyst":["DRAM capex recovery", "HBM content growth per wafer", "3D NAND new layers"],
    },
]

# ── Technical Indicators ──────────────────────────────────────────────────────

TECH_TICKERS = ["MU", "WDC", "AMAT", "LRCX", "KLAC", "ASML"]

def _compute_tech(ticker: str) -> dict:
    try:
        hist = yf.Ticker(ticker).history(period="1y")
        if hist.empty or len(hist) < 30:
            return {}
        c = hist["Close"]
        hi = hist["High"]
        lo = hist["Low"]

        ema20  = float(c.ewm(span=20,  adjust=False).mean().iloc[-1])
        ema50  = float(c.ewm(span=50,  adjust=False).mean().iloc[-1])
        ema200 = float(c.ewm(span=200, adjust=False).mean().iloc[-1]) if len(c) >= 60 else None

        delta = c.diff()
        gain  = delta.clip(lower=0).rolling(14).mean()
        loss  = (-delta.clip(upper=0)).rolling(14).mean()
        rs    = gain / loss.replace(0, np.nan)
        rsi   = float(100 - 100 / (1 + rs.iloc[-1]))

        ema12  = c.ewm(span=12, adjust=False).mean()
        ema26  = c.ewm(span=26, adjust=False).mean()
        macd   = float((ema12 - ema26).iloc[-1])
        sig    = float((ema12 - ema26).ewm(span=9, adjust=False).mean().iloc[-1])

        ma20   = c.rolling(20).mean()
        std20  = c.rolling(20).std()
        bb_up  = float((ma20 + 2*std20).iloc[-1])
        bb_mid = float(ma20.iloc[-1])
        bb_lo  = float((ma20 - 2*std20).iloc[-1])

        # Simplified ADX
        tr     = pd.concat([hi - lo, (hi - c.shift()).abs(), (lo - c.shift()).abs()], axis=1).max(axis=1)
        dmp    = hi.diff().clip(lower=0)
        dmn    = (-lo.diff()).clip(lower=0)
        atr14  = tr.rolling(14).mean()
        di_p   = 100 * (dmp.rolling(14).mean() / atr14.replace(0, np.nan))
        di_n   = 100 * (dmn.rolling(14).mean() / atr14.replace(0, np.nan))
        dx     = (100 * (di_p - di_n).abs() / (di_p + di_n).replace(0, np.nan))
        adx    = float(dx.rolling(14).mean().iloc[-1]) if not dx.isna().all() else 0.0

        price  = float(c.iloc[-1])
        chg1d  = float((c.iloc[-1] / c.iloc[-2] - 1) * 100) if len(c) >= 2 else 0
        chg1m  = float((c.iloc[-1] / c.iloc[-21] - 1) * 100) if len(c) >= 21 else 0
        chg3m  = float((c.iloc[-1] / c.iloc[-63] - 1) * 100) if len(c) >= 63 else 0

        score = 50
        if price > ema20:  score += 10
        if price > ema50:  score += 10
        if ema200 and price > ema200: score += 10
        if rsi > 50:       score += 5
        if macd > sig:     score += 10
        if adx > 25:       score += 5

        return {
            "ticker": ticker, "price": round(price, 2),
            "chg_1d": round(chg1d, 2), "chg_1m": round(chg1m, 2), "chg_3m": round(chg3m, 2),
            "ema20": round(ema20, 2), "ema50": round(ema50, 2),
            "ema200": round(ema200, 2) if ema200 else None,
            "rsi": round(rsi, 1),
            "macd": round(macd, 3), "macd_signal": round(sig, 3), "macd_hist": round(macd - sig, 3),
            "bb_upper": round(bb_up, 2), "bb_mid": round(bb_mid, 2), "bb_lower": round(bb_lo, 2),
            "adx": round(adx, 1),
            "tech_score": min(100, max(0, score)),
        }
    except Exception as e:
        logger.warning(f"Mem tech {ticker}: {e}")
        return {}


def _compute_cycle_score() -> dict:
    dram_mom = round(sum(p.get("mo", 0) or 0 for p in DRAM_PRICES) / len(DRAM_PRICES), 1)
    dram_score = min(100, max(0, 50 + dram_mom * 3))
    hbm_score  = HBM_TIGHTNESS["score"]
    inv_score  = INVENTORY["cycle_score"]
    earn_score = round((EARNINGS["MU"]["momentum_score"] + EARNINGS["SK_Hynix"]["momentum_score"]) / 2, 1)
    flow_score = FLOWS["smart_money_score"]
    sent_score = SENTIMENT["overall_score"]

    weighted = (
        0.25 * dram_score +
        0.25 * hbm_score  +
        0.20 * inv_score  +
        0.10 * earn_score +
        0.10 * flow_score +
        0.10 * sent_score
    )
    score = round(weighted, 1)

    if score >= 80:   regime, bias = "Memory Supercycle", "Extreme Bullish"
    elif score >= 60: regime, bias = "AI-Driven Expansion", "Bullish"
    elif score >= 40: regime, bias = "Early Recovery", "Neutral/Bullish"
    elif score >= 20: regime, bias = "Inventory Correction", "Bearish"
    else:             regime, bias = "Deep Downcycle", "Extreme Bearish"

    return {
        "cycle_score": score,
        "regime": regime,
        "bias": bias,
        "inputs": {
            "dram_pricing": round(dram_score, 1),
            "hbm_demand":   hbm_score,
            "inventory":    inv_score,
            "earnings":     earn_score,
            "flows":        flow_score,
            "sentiment":    sent_score,
        },
        "weights": {
            "DRAM Pricing": 0.25, "HBM Demand": 0.25, "Inventory": 0.20,
            "Earnings": 0.10, "Flows": 0.10, "Sentiment": 0.10,
        },
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/overview")
def overview():
    c = _get("mem_overview")
    if c: return c
    cycle = _compute_cycle_score()
    out = {
        **cycle,
        "dram_trend":      "Recovery",
        "nand_trend":      "Slow Recovery",
        "hbm_trend":       "Extreme Demand",
        "inventory_trend": "Normalizing",
        "ai_demand_trend": "Accelerating",
        "earnings_trend":  "Revisions Up",
        "outlook": {
            "1m":  {"direction":"Up",    "prob_pct":78,"expected_return_pct":+6.5,  "scenario":"HBM pricing continues rising; DRAM spot recovery"},
            "3m":  {"direction":"Up",    "prob_pct":72,"expected_return_pct":+18.4, "scenario":"Q3 earnings beat; HBM content per GPU increases"},
            "6m":  {"direction":"Up",    "prob_pct":68,"expected_return_pct":+32.8, "scenario":"HBM4 transition; NAND fully recovered; broad memory rally"},
            "12m": {"direction":"Up",    "prob_pct":62,"expected_return_pct":+48.5, "scenario":"Full memory supercycle; potential 2x for leveraged names"},
        },
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }
    _set("mem_overview", out)
    return out


@router.get("/pricing")
def pricing():
    all_prices = DRAM_PRICES + HBM_PRICES + NAND_PRICES + SSD_PRICES
    dram_mom = round(sum(p.get("mo", 0) or 0 for p in DRAM_PRICES) / len(DRAM_PRICES), 1)
    nand_mom = round(sum(p.get("mo", 0) or 0 for p in NAND_PRICES) / len(NAND_PRICES), 1)
    hbm_mom  = round(sum(p.get("mo", 0) or 0 for p in HBM_PRICES if p.get("mo")), 1)
    return {
        "dram":  DRAM_PRICES,
        "hbm":   HBM_PRICES,
        "nand":  NAND_PRICES,
        "ssd":   SSD_PRICES,
        "momentum": {
            "dram_mo_avg": dram_mom,
            "nand_mo_avg": nand_mom,
            "hbm_mo_avg":  hbm_mom,
            "dram_score": min(100, max(0, 50 + dram_mom * 3)),
            "nand_score": min(100, max(0, 50 + nand_mom * 3)),
            "hbm_score":  min(100, max(0, 50 + hbm_mom  * 2)),
        },
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/hbm")
def hbm():
    return {
        "supply": HBM_SUPPLY,
        "demand": HBM_DEMAND,
        "tightness": HBM_TIGHTNESS,
        "prices": HBM_PRICES,
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/ai-infra")
def ai_infra():
    return {**AI_INFRA, "updated_at": datetime.utcnow().isoformat() + "Z"}


@router.get("/inventory")
def inventory():
    return {**INVENTORY, "updated_at": datetime.utcnow().isoformat() + "Z"}


@router.get("/capacity")
def capacity():
    return {**CAPACITY, "updated_at": datetime.utcnow().isoformat() + "Z"}


@router.get("/companies")
def companies():
    c = _get("mem_companies")
    if c: return c
    live_tickers = {"MU": "MU", "WDC": "WDC"}
    results = dict(COMPANIES_STATIC)
    for key, t in live_tickers.items():
        try:
            info = yf.Ticker(t).fast_info
            results[key] = {
                **COMPANIES_STATIC[key],
                "price":  round(info.last_price, 2),
                "chg_1d": round((info.last_price / info.previous_close - 1) * 100, 2),
                "mktcap_bn": round(info.market_cap / 1e9, 1),
            }
        except Exception as e:
            logger.warning(f"companies {t}: {e}")
    out = {"companies": results, "updated_at": datetime.utcnow().isoformat() + "Z"}
    _set("mem_companies", out)
    return out


@router.get("/earnings")
def earnings():
    return {"earnings": EARNINGS, "updated_at": datetime.utcnow().isoformat() + "Z"}


@router.get("/china")
def china():
    return {**CHINA, "updated_at": datetime.utcnow().isoformat() + "Z"}


@router.get("/supply-chain")
def supply_chain():
    return {**SUPPLY_CHAIN, "updated_at": datetime.utcnow().isoformat() + "Z"}


@router.get("/flows")
def flows():
    return {**FLOWS, "updated_at": datetime.utcnow().isoformat() + "Z"}


@router.get("/technicals")
def technicals():
    c = _get("mem_tech")
    if c: return c
    result = {}
    for t in TECH_TICKERS:
        result[t] = _compute_tech(t)
    out = {"stocks": result, "updated_at": datetime.utcnow().isoformat() + "Z"}
    _set("mem_tech", out)
    return out


@router.get("/quant")
def quant():
    return {**QUANT_MODELS, "updated_at": datetime.utcnow().isoformat() + "Z"}


@router.get("/relative")
def relative():
    return {**RELATIVE, "updated_at": datetime.utcnow().isoformat() + "Z"}


@router.get("/sentiment")
def sentiment():
    return {**SENTIMENT, "updated_at": datetime.utcnow().isoformat() + "Z"}


@router.get("/signals")
def signals():
    return {"signals": SIGNALS, "updated_at": datetime.utcnow().isoformat() + "Z"}
