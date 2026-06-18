"""Institutional Ownership & Positioning Tracker API — 13F, hedge funds, PE/VC, ownership"""
from fastapi import APIRouter
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import time, logging

logger = logging.getLogger(__name__)
router = APIRouter()

_cache: dict = {}
CACHE_TTL = 3600  # 1h — 13F data changes quarterly

def _get(k):
    v = _cache.get(k)
    return v["data"] if v and time.time() - v["ts"] < CACHE_TTL else None

def _set(k, data):
    _cache[k] = {"ts": time.time(), "data": data}

TODAY = "2026-06-18"
FILING_PERIOD = "Q1 2026 (13F as of 2026-03-31)"

# ── Hedge Funds ───────────────────────────────────────────────────────────────
HEDGE_FUNDS = [
    {"name": "Citadel LLC",            "manager": "Ken Griffin",      "aum_bn": 63,  "style": "Multi-Strategy",   "sentiment_score": 72,
     "top_holdings": [
         {"ticker":"NVDA","name":"NVIDIA","weight":4.8,"chg_qoq":+1.2,"conviction":"Very High","value_mn":3024},
         {"ticker":"MSFT","name":"Microsoft","weight":3.9,"chg_qoq":+0.3,"conviction":"High","value_mn":2457},
         {"ticker":"META","name":"Meta Platforms","weight":3.2,"chg_qoq":+0.8,"conviction":"High","value_mn":2016},
         {"ticker":"AAPL","name":"Apple","weight":2.8,"chg_qoq":-0.4,"conviction":"High","value_mn":1764},
         {"ticker":"GOOGL","name":"Alphabet","weight":2.4,"chg_qoq":+0.6,"conviction":"High","value_mn":1512},
     ],
     "new_positions": [{"ticker":"SMCI","name":"Super Micro Computer","value_mn":420,"weight":0.7}],
     "exits":         [{"ticker":"NFLX","name":"Netflix","proceeds_mn":280}],
     "sector_allocation": {"Technology":38,"Financials":18,"Healthcare":12,"Consumer":10,"Industrials":8,"Energy":5,"Other":9},
    },
    {"name": "Bridgewater Associates",  "manager": "Greg Jensen",      "aum_bn": 124, "style": "Global Macro",     "sentiment_score": 58,
     "top_holdings": [
         {"ticker":"SPY","name":"S&P 500 ETF","weight":8.2,"chg_qoq":-0.5,"conviction":"High","value_mn":10168},
         {"ticker":"GLD","name":"Gold ETF","weight":6.4,"chg_qoq":+1.8,"conviction":"Very High","value_mn":7936},
         {"ticker":"TLT","name":"20Y Treasury ETF","weight":5.1,"chg_qoq":+0.9,"conviction":"High","value_mn":6324},
         {"ticker":"EEM","name":"EM ETF","weight":4.8,"chg_qoq":+1.2,"conviction":"High","value_mn":5952},
         {"ticker":"IEF","name":"7-10Y Treasury ETF","weight":4.2,"chg_qoq":+0.6,"conviction":"High","value_mn":5208},
     ],
     "new_positions": [{"ticker":"IAU","name":"iShares Gold Trust","value_mn":890,"weight":0.7}],
     "exits":         [{"ticker":"AMZN","name":"Amazon","proceeds_mn":450}],
     "sector_allocation": {"Bonds":32,"Commodities":18,"International Equity":22,"US Equity":18,"Cash":10},
    },
    {"name": "Millennium Management",   "manager": "Izzy Englander",   "aum_bn": 68,  "style": "Multi-Strategy",   "sentiment_score": 65,
     "top_holdings": [
         {"ticker":"AVGO","name":"Broadcom","weight":3.4,"chg_qoq":+1.1,"conviction":"Very High","value_mn":2312},
         {"ticker":"LLY","name":"Eli Lilly","weight":3.1,"chg_qoq":+0.8,"conviction":"Very High","value_mn":2108},
         {"ticker":"JPM","name":"JP Morgan","weight":2.9,"chg_qoq":+0.3,"conviction":"High","value_mn":1972},
         {"ticker":"UNH","name":"UnitedHealth","weight":2.4,"chg_qoq":-0.6,"conviction":"Medium","value_mn":1632},
         {"ticker":"V","name":"Visa","weight":2.1,"chg_qoq":+0.2,"conviction":"High","value_mn":1428},
     ],
     "new_positions": [{"ticker":"ARM","name":"Arm Holdings","value_mn":310,"weight":0.5}],
     "exits":         [{"ticker":"INTC","name":"Intel","proceeds_mn":190}],
     "sector_allocation": {"Technology":32,"Financials":24,"Healthcare":18,"Consumer":12,"Industrials":8,"Other":6},
    },
    {"name": "Two Sigma Investments",   "manager": "John Overdeck",    "aum_bn": 60,  "style": "Quantitative",     "sentiment_score": 62,
     "top_holdings": [
         {"ticker":"NVDA","name":"NVIDIA","weight":5.2,"chg_qoq":+1.8,"conviction":"Very High","value_mn":3120},
         {"ticker":"AAPL","name":"Apple","weight":4.1,"chg_qoq":-0.2,"conviction":"High","value_mn":2460},
         {"ticker":"MSFT","name":"Microsoft","weight":3.8,"chg_qoq":+0.4,"conviction":"High","value_mn":2280},
         {"ticker":"AMZN","name":"Amazon","weight":3.2,"chg_qoq":+0.6,"conviction":"High","value_mn":1920},
         {"ticker":"GOOGL","name":"Alphabet","weight":2.9,"chg_qoq":+0.3,"conviction":"High","value_mn":1740},
     ],
     "new_positions": [{"ticker":"MRVL","name":"Marvell Technology","value_mn":280,"weight":0.5}],
     "exits":         [{"ticker":"T","name":"AT&T","proceeds_mn":120}],
     "sector_allocation": {"Technology":45,"Financials":16,"Healthcare":14,"Consumer":12,"Industrials":7,"Other":6},
    },
    {"name": "Pershing Square Capital", "manager": "Bill Ackman",      "aum_bn": 19,  "style": "Activist Long/Short","sentiment_score": 78,
     "top_holdings": [
         {"ticker":"GOOGL","name":"Alphabet","weight":18.2,"chg_qoq":+2.1,"conviction":"Highest","value_mn":3458},
         {"ticker":"BRK.B","name":"Berkshire Hathaway","weight":14.8,"chg_qoq":+1.2,"conviction":"Very High","value_mn":2812},
         {"ticker":"CMG","name":"Chipotle","weight":12.4,"chg_qoq":-1.0,"conviction":"Very High","value_mn":2356},
         {"ticker":"CP","name":"Canadian Pacific","weight":11.2,"chg_qoq":-0.5,"conviction":"High","value_mn":2128},
         {"ticker":"HHH","name":"Howard Hughes","weight":9.8,"chg_qoq":+0.8,"conviction":"High","value_mn":1862},
     ],
     "new_positions": [],
     "exits":         [],
     "sector_allocation": {"Technology":18,"Consumer":24,"Industrials":22,"Financials":18,"Real Estate":10,"Other":8},
    },
    {"name": "Third Point LLC",         "manager": "Dan Loeb",         "aum_bn": 15,  "style": "Event-Driven",     "sentiment_score": 69,
     "top_holdings": [
         {"ticker":"META","name":"Meta Platforms","weight":12.4,"chg_qoq":+2.8,"conviction":"Very High","value_mn":1860},
         {"ticker":"AMZN","name":"Amazon","weight":10.2,"chg_qoq":+1.4,"conviction":"High","value_mn":1530},
         {"ticker":"MSFT","name":"Microsoft","weight":8.8,"chg_qoq":+0.6,"conviction":"High","value_mn":1320},
         {"ticker":"TSLA","name":"Tesla","weight":6.4,"chg_qoq":+3.2,"conviction":"High","value_mn":960},
         {"ticker":"LLY","name":"Eli Lilly","weight":5.2,"chg_qoq":+1.8,"conviction":"High","value_mn":780},
     ],
     "new_positions": [{"ticker":"TSM","name":"TSMC","value_mn":420,"weight":2.8}],
     "exits":         [{"ticker":"BABA","name":"Alibaba","proceeds_mn":380}],
     "sector_allocation": {"Technology":42,"Healthcare":18,"Consumer":16,"Financials":12,"Other":12},
    },
    {"name": "D.E. Shaw & Co.",         "manager": "David Shaw",       "aum_bn": 60,  "style": "Quantitative",     "sentiment_score": 63,
     "top_holdings": [
         {"ticker":"AAPL","name":"Apple","weight":4.8,"chg_qoq":+0.2,"conviction":"High","value_mn":2880},
         {"ticker":"NVDA","name":"NVIDIA","weight":4.2,"chg_qoq":+1.4,"conviction":"Very High","value_mn":2520},
         {"ticker":"MSFT","name":"Microsoft","weight":3.9,"chg_qoq":-0.1,"conviction":"High","value_mn":2340},
         {"ticker":"AMZN","name":"Amazon","weight":3.4,"chg_qoq":+0.5,"conviction":"High","value_mn":2040},
         {"ticker":"JPM","name":"JP Morgan","weight":2.8,"chg_qoq":+0.4,"conviction":"High","value_mn":1680},
     ],
     "new_positions": [{"ticker":"VRT","name":"Vertiv Holdings","value_mn":360,"weight":0.6}],
     "exits":         [{"ticker":"WBD","name":"Warner Bros. Discovery","proceeds_mn":95}],
     "sector_allocation": {"Technology":42,"Financials":20,"Healthcare":14,"Consumer":12,"Other":12},
    },
    {"name": "AQR Capital Management",  "manager": "Cliff Asness",     "aum_bn": 120, "style": "Quantitative/Factor","sentiment_score": 56,
     "top_holdings": [
         {"ticker":"AAPL","name":"Apple","weight":3.2,"chg_qoq":-0.3,"conviction":"Medium","value_mn":3840},
         {"ticker":"MSFT","name":"Microsoft","weight":2.9,"chg_qoq":-0.2,"conviction":"Medium","value_mn":3480},
         {"ticker":"NVDA","name":"NVIDIA","weight":2.4,"chg_qoq":+0.8,"conviction":"Medium","value_mn":2880},
         {"ticker":"BRK.B","name":"Berkshire Hathaway","weight":2.1,"chg_qoq":+0.3,"conviction":"High","value_mn":2520},
         {"ticker":"JPM","name":"JP Morgan","weight":1.9,"chg_qoq":+0.2,"conviction":"High","value_mn":2280},
     ],
     "new_positions": [],
     "exits":         [{"ticker":"INTC","name":"Intel","proceeds_mn":240}],
     "sector_allocation": {"Technology":30,"Financials":22,"Healthcare":16,"Consumer":14,"Industrials":10,"Other":8},
    },
]

# ── Mutual Funds ──────────────────────────────────────────────────────────────
MUTUAL_FUNDS = [
    {"name": "Vanguard Group",          "type": "Passive",  "aum_tn": 8.6, "risk_appetite": 52,
     "sector_alloc": {"Technology":28,"Financials":13,"Healthcare":13,"Consumer Disc":10,"Industrials":9,"Energy":4,"Utilities":3,"Real Estate":3,"Other":17},
     "changes": {"Technology":+1.2,"Financials":-0.3,"Healthcare":+0.4,"Consumer Disc":-0.8,"Industrials":+0.2,"Energy":-0.5,"Utilities":+0.6,"Real Estate":-0.4}},
    {"name": "BlackRock",               "type": "Active/Passive","aum_tn": 10.5, "risk_appetite": 54,
     "sector_alloc": {"Technology":30,"Financials":14,"Healthcare":12,"Consumer Disc":9,"Industrials":10,"Energy":5,"Utilities":4,"Real Estate":3,"Other":13},
     "changes": {"Technology":+2.1,"Financials":+0.8,"Healthcare":-0.2,"Consumer Disc":-1.2,"Industrials":+0.5,"Energy":+0.4,"Utilities":+1.1,"Real Estate":-0.6}},
    {"name": "Fidelity Investments",    "type": "Active",   "aum_tn": 4.9, "risk_appetite": 61,
     "sector_alloc": {"Technology":32,"Financials":12,"Healthcare":14,"Consumer Disc":11,"Industrials":8,"Energy":5,"Utilities":3,"Real Estate":2,"Other":13},
     "changes": {"Technology":+3.2,"Financials":-0.5,"Healthcare":+1.8,"Consumer Disc":-1.5,"Industrials":+0.8,"Energy":-0.8,"Utilities":+0.4,"Real Estate":-0.2}},
    {"name": "T. Rowe Price",           "type": "Active",   "aum_tn": 1.6, "risk_appetite": 64,
     "sector_alloc": {"Technology":35,"Financials":11,"Healthcare":15,"Consumer Disc":12,"Industrials":8,"Energy":4,"Utilities":2,"Real Estate":2,"Other":11},
     "changes": {"Technology":+4.1,"Financials":-0.8,"Healthcare":+2.2,"Consumer Disc":-1.8,"Industrials":+0.5,"Energy":-1.0,"Utilities":+0.2,"Real Estate":-0.3}},
    {"name": "Capital Group",           "type": "Active",   "aum_tn": 2.2, "risk_appetite": 59,
     "sector_alloc": {"Technology":29,"Financials":15,"Healthcare":13,"Consumer Disc":10,"Industrials":11,"Energy":6,"Utilities":4,"Real Estate":3,"Other":9},
     "changes": {"Technology":+1.8,"Financials":+0.6,"Healthcare":+0.8,"Consumer Disc":-0.9,"Industrials":+1.2,"Energy":+0.5,"Utilities":+0.8,"Real Estate":-0.5}},
]

# ── PE Deals ──────────────────────────────────────────────────────────────────
PE_DEALS = [
    {"firm":"Blackstone","type":"Buyout","company":"CoreWeave","sector":"AI Infrastructure","size_bn":7.2,"status":"Closed","date":"2026-02-14","multiple":"8.4x EBITDA","irr_target":22},
    {"firm":"KKR","type":"Buyout","company":"Roper Technologies (Healthcare)","sector":"Healthcare IT","size_bn":4.8,"status":"Closed","date":"2026-01-28","multiple":"14.2x EBITDA","irr_target":20},
    {"firm":"Apollo","type":"Growth","company":"Arm Holdings Stake","sector":"Semiconductors","size_bn":3.2,"status":"Closed","date":"2026-03-05","multiple":"N/A","irr_target":18},
    {"firm":"Carlyle","type":"Infrastructure","company":"US Data Center Portfolio","sector":"Data Centers","size_bn":5.6,"status":"Closed","date":"2026-01-15","multiple":"12.8x EBITDA","irr_target":16},
    {"firm":"TPG","type":"Growth","company":"Waymo (secondary)","sector":"Autonomous Vehicles","size_bn":2.4,"status":"Pending","date":"2026-04-01","multiple":"N/A","irr_target":25},
    {"firm":"Thoma Bravo","type":"Buyout","company":"SailPoint","sector":"Cybersecurity","size_bn":1.8,"status":"Closed","date":"2026-03-20","multiple":"11.4x EBITDA","irr_target":23},
    {"firm":"Blackstone","type":"Infrastructure","company":"QTS Realty Trust","sector":"Data Centers","size_bn":10.0,"status":"Mature","date":"2021-08-22","multiple":"18.2x EBITDA","irr_target":28,"status_note":"Considering IPO 2026"},
    {"firm":"KKR","type":"Buyout","company":"Envision Healthcare","sector":"Healthcare Services","size_bn":3.5,"status":"Restructured","date":"2018-06-01","multiple":"9.2x EBITDA","irr_target":12},
    {"firm":"Apollo","type":"Buyout","company":"Tenneco","sector":"Auto Parts","size_bn":7.1,"status":"Active","date":"2022-11-17","multiple":"8.8x EBITDA","irr_target":15},
    {"firm":"Carlyle","type":"Buyout","company":"Veritas Technologies","sector":"Enterprise Software","size_bn":2.1,"status":"Active","date":"2015-01-12","multiple":"6.4x EBITDA","irr_target":14,"status_note":"Exploring sale 2026"},
]

PE_METRICS = {
    "dry_powder_bn": 2800,
    "ytd_deal_volume_bn": 285,
    "avg_entry_multiple": 11.8,
    "activity_index": 64,
    "top_sectors": ["AI Infrastructure","Healthcare","Cybersecurity","Energy Transition"],
    "exit_environment": "Selective",
    "ipo_pipeline": ["CoreWeave","Klarna","Databricks","Shein","Fanatics"],
}

# ── VC Rounds ─────────────────────────────────────────────────────────────────
VC_ROUNDS = [
    {"company":"Anthropic",       "stage":"Series E","amount_mn":4000,"lead":"Google","sector":"AI/LLM",            "date":"2026-03-12","valuation_bn":61.5},
    {"company":"xAI",             "stage":"Series C","amount_mn":6000,"lead":"Andreessen Horowitz","sector":"AI/LLM","date":"2026-02-20","valuation_bn":50.0},
    {"company":"OpenAI",          "stage":"Series G","amount_mn":6500,"lead":"SoftBank","sector":"AI/LLM",           "date":"2026-01-08","valuation_bn":157.0},
    {"company":"Scale AI",        "stage":"Series F","amount_mn":1000,"lead":"Accel","sector":"AI Infrastructure",   "date":"2026-03-28","valuation_bn":13.8},
    {"company":"Mistral AI",      "stage":"Series C","amount_mn":600, "lead":"General Atlantic","sector":"AI/LLM",   "date":"2026-02-14","valuation_bn":6.0},
    {"company":"Wayve",           "stage":"Series B","amount_mn":1050,"lead":"SoftBank","sector":"Autonomous Driving","date":"2026-01-22","valuation_bn":5.2},
    {"company":"Eikon Therapeutics","stage":"Series C","amount_mn":526,"lead":"Fidelity","sector":"Biotech",         "date":"2026-03-05","valuation_bn":2.8},
    {"company":"Groq",            "stage":"Series D","amount_mn":640, "lead":"BlackRock","sector":"AI Chips",        "date":"2026-02-28","valuation_bn":2.8},
    {"company":"Varda Space",     "stage":"Series B","amount_mn":90,  "lead":"Caffeinated Capital","sector":"Space", "date":"2026-03-18","valuation_bn":0.8},
    {"company":"Perplexity",      "stage":"Series D","amount_mn":500, "lead":"IVP","sector":"AI Search",            "date":"2026-04-02","valuation_bn":9.0},
    {"company":"Physical Intelligence","stage":"Series A","amount_mn":400,"lead":"Sequoia","sector":"Robotics AI",   "date":"2026-01-30","valuation_bn":2.7},
    {"company":"ElevenLabs",      "stage":"Series C","amount_mn":180, "lead":"a16z","sector":"AI Voice",            "date":"2026-03-25","valuation_bn":3.3},
]

VC_METRICS = {
    "ytd_deal_count": 3842,
    "ytd_volume_bn": 82.4,
    "unicorn_count_2026": 14,
    "down_round_pct": 18.4,
    "ai_pct_of_deals": 42,
    "risk_appetite": 68,
    "top_sectors": ["AI/LLM", "AI Infrastructure", "Biotech", "Defense Tech", "Climate Tech"],
    "avg_valuation_step_up": 2.4,
}

# ── Holdings Changes ──────────────────────────────────────────────────────────
NEW_POSITIONS = [
    {"institution":"Citadel","ticker":"SMCI","name":"Super Micro Computer","size_mn":420,"weight":0.7,"est_shares":142000,"catalyst":"AI server demand thesis"},
    {"institution":"Third Point","ticker":"TSM","name":"Taiwan Semiconductor","size_mn":420,"weight":2.8,"est_shares":280000,"catalyst":"AI chip supply chain control"},
    {"institution":"Bridgewater","ticker":"IAU","name":"iShares Gold Trust","size_mn":890,"weight":0.7,"est_shares":3100000,"catalyst":"Macro hedge / central bank buying"},
    {"institution":"D.E. Shaw","ticker":"VRT","name":"Vertiv Holdings","size_mn":360,"weight":0.6,"est_shares":2800000,"catalyst":"AI data center cooling infrastructure"},
    {"institution":"Millennium","ticker":"ARM","name":"Arm Holdings","size_mn":310,"weight":0.5,"est_shares":2100000,"catalyst":"AI chip architecture dominance"},
    {"institution":"Two Sigma","ticker":"MRVL","name":"Marvell Technology","size_mn":280,"weight":0.5,"est_shares":4200000,"catalyst":"Custom AI chip momentum"},
    {"institution":"AQR","ticker":"NVO","name":"Novo Nordisk","size_mn":240,"weight":0.2,"est_shares":1800000,"catalyst":"GLP-1 secular growth"},
    {"institution":"Pershing Square","ticker":"UBER","name":"Uber Technologies","size_mn":180,"weight":0.9,"est_shares":2100000,"catalyst":"Autonomous vehicle platform optionality"},
]

INCREASES = [
    {"institution":"Third Point","ticker":"TSLA","name":"Tesla","prev_weight":3.2,"curr_weight":6.4,"chg_pct":+100,"conviction":"High","rationale":"FSD & energy storage re-rating"},
    {"institution":"Third Point","ticker":"META","name":"Meta Platforms","prev_weight":9.6,"curr_weight":12.4,"chg_pct":+29,"conviction":"Very High","rationale":"AI monetization acceleration"},
    {"institution":"Bridgewater","ticker":"GLD","name":"Gold ETF","prev_weight":4.6,"curr_weight":6.4,"chg_pct":+39,"conviction":"Very High","rationale":"Central bank accumulation, de-dollarization"},
    {"institution":"Citadel","ticker":"NVDA","name":"NVIDIA","prev_weight":3.6,"curr_weight":4.8,"chg_pct":+33,"conviction":"Very High","rationale":"Blackwell GPU demand exceeds supply"},
    {"institution":"Citadel","ticker":"META","name":"Meta Platforms","prev_weight":2.4,"curr_weight":3.2,"chg_pct":+33,"conviction":"High","rationale":"Reality Labs inflection + AI ads"},
    {"institution":"Millennium","ticker":"LLY","name":"Eli Lilly","prev_weight":2.3,"curr_weight":3.1,"chg_pct":+35,"conviction":"Very High","rationale":"Mounjaro/tirzepatide global rollout"},
    {"institution":"Pershing Sq.","ticker":"GOOGL","name":"Alphabet","prev_weight":16.1,"curr_weight":18.2,"chg_pct":+13,"conviction":"Highest","rationale":"Search AI integration outperforming"},
    {"institution":"Two Sigma","ticker":"NVDA","name":"NVIDIA","prev_weight":3.4,"curr_weight":5.2,"chg_pct":+53,"conviction":"Very High","rationale":"Quant models signal continued GPU upcycle"},
]

REDUCTIONS = [
    {"institution":"Citadel","ticker":"AAPL","name":"Apple","prev_weight":3.2,"curr_weight":2.8,"chg_pct":-13,"impact":"Moderate","rationale":"China revenue risk / iPhone cycle plateau"},
    {"institution":"Bridgewater","ticker":"AMZN","name":"Amazon","prev_weight":1.8,"curr_weight":0.0,"chg_pct":-100,"impact":"Exit","rationale":"Macro rotation to real assets"},
    {"institution":"Millennium","ticker":"UNH","name":"UnitedHealth","prev_weight":3.0,"curr_weight":2.4,"chg_pct":-20,"impact":"Trim","rationale":"DOJ investigation overhang"},
    {"institution":"AQR","ticker":"INTC","name":"Intel","prev_weight":0.8,"curr_weight":0.0,"chg_pct":-100,"impact":"Exit","rationale":"Manufacturing delays, AMD/NVDA share gains"},
    {"institution":"T. Rowe Price","ticker":"COIN","name":"Coinbase","prev_weight":0.6,"curr_weight":0.3,"chg_pct":-50,"impact":"Trim","rationale":"Profit taking after regulatory clarity rally"},
    {"institution":"Fidelity","ticker":"MRK","name":"Merck","prev_weight":1.8,"curr_weight":1.2,"chg_pct":-33,"impact":"Reduction","rationale":"Keytruda patent cliff concern"},
]

FULL_EXITS = [
    {"institution":"Bridgewater","ticker":"AMZN","name":"Amazon","proceeds_mn":450,"reason":"Macro rotation"},
    {"institution":"AQR","ticker":"INTC","name":"Intel","proceeds_mn":240,"reason":"Structural decline"},
    {"institution":"Citadel","ticker":"NFLX","name":"Netflix","proceeds_mn":280,"reason":"Valuation, competition"},
    {"institution":"D.E. Shaw","ticker":"WBD","name":"Warner Bros. Discovery","proceeds_mn":95,"reason":"Streaming consolidation risk"},
    {"institution":"Third Point","ticker":"BABA","name":"Alibaba","proceeds_mn":380,"reason":"China regulatory / geopolitical"},
    {"institution":"Millennium","ticker":"CSCO","name":"Cisco","proceeds_mn":160,"reason":"Legacy networking commoditization"},
]

# ── Smart Money / Most Bought / Sold ─────────────────────────────────────────
MOST_BOUGHT = [
    {"ticker":"NVDA","name":"NVIDIA","net_buyers":142,"buy_mn":28400,"sell_mn":3200,"net_flow_mn":25200,"ownership_chg":+2.8,"sector":"Technology"},
    {"ticker":"AVGO","name":"Broadcom","net_buyers":98,"buy_mn":12800,"sell_mn":2100,"net_flow_mn":10700,"ownership_chg":+1.9,"sector":"Technology"},
    {"ticker":"LLY","name":"Eli Lilly","net_buyers":86,"buy_mn":11200,"sell_mn":1800,"net_flow_mn":9400,"ownership_chg":+1.6,"sector":"Healthcare"},
    {"ticker":"META","name":"Meta Platforms","net_buyers":74,"buy_mn":9800,"sell_mn":2400,"net_flow_mn":7400,"ownership_chg":+1.4,"sector":"Technology"},
    {"ticker":"GLD","name":"SPDR Gold ETF","net_buyers":68,"buy_mn":8400,"sell_mn":1200,"net_flow_mn":7200,"ownership_chg":+1.2,"sector":"Commodities"},
    {"ticker":"ARM","name":"Arm Holdings","net_buyers":62,"buy_mn":7200,"sell_mn":800,"net_flow_mn":6400,"ownership_chg":+1.1,"sector":"Technology"},
    {"ticker":"VRT","name":"Vertiv Holdings","net_buyers":54,"buy_mn":5800,"sell_mn":600,"net_flow_mn":5200,"ownership_chg":+0.9,"sector":"Industrials"},
    {"ticker":"NVO","name":"Novo Nordisk","net_buyers":48,"buy_mn":4800,"sell_mn":900,"net_flow_mn":3900,"ownership_chg":+0.7,"sector":"Healthcare"},
    {"ticker":"TSM","name":"TSMC","net_buyers":44,"buy_mn":4200,"sell_mn":700,"net_flow_mn":3500,"ownership_chg":+0.6,"sector":"Technology"},
    {"ticker":"SMCI","name":"Super Micro","net_buyers":38,"buy_mn":3600,"sell_mn":500,"net_flow_mn":3100,"ownership_chg":+0.5,"sector":"Technology"},
]

MOST_SOLD = [
    {"ticker":"INTC","name":"Intel","net_sellers":118,"sell_mn":14200,"buy_mn":2800,"net_outflow_mn":11400,"ownership_chg":-2.1,"sector":"Technology"},
    {"ticker":"AAPL","name":"Apple","net_sellers":82,"sell_mn":18400,"buy_mn":10200,"net_outflow_mn":8200,"ownership_chg":-0.8,"sector":"Technology"},
    {"ticker":"BABA","name":"Alibaba","net_sellers":76,"sell_mn":9800,"buy_mn":2200,"net_outflow_mn":7600,"ownership_chg":-1.4,"sector":"Technology"},
    {"ticker":"T","name":"AT&T","net_sellers":68,"sell_mn":7200,"buy_mn":1800,"net_outflow_mn":5400,"ownership_chg":-1.0,"sector":"Telecom"},
    {"ticker":"WBD","name":"Warner Bros.","net_sellers":64,"sell_mn":6400,"buy_mn":1600,"net_outflow_mn":4800,"ownership_chg":-0.9,"sector":"Media"},
    {"ticker":"PYPL","name":"PayPal","net_sellers":58,"sell_mn":5800,"buy_mn":1400,"net_outflow_mn":4400,"ownership_chg":-0.8,"sector":"Fintech"},
    {"ticker":"NKE","name":"Nike","net_sellers":52,"sell_mn":5200,"buy_mn":1200,"net_outflow_mn":4000,"ownership_chg":-0.7,"sector":"Consumer"},
    {"ticker":"CSCO","name":"Cisco","net_sellers":48,"sell_mn":4800,"buy_mn":1100,"net_outflow_mn":3700,"ownership_chg":-0.7,"sector":"Technology"},
    {"ticker":"UNH","name":"UnitedHealth","net_sellers":44,"sell_mn":4400,"buy_mn":1200,"net_outflow_mn":3200,"ownership_chg":-0.6,"sector":"Healthcare"},
    {"ticker":"MRK","name":"Merck","net_sellers":40,"sell_mn":3800,"buy_mn":1000,"net_outflow_mn":2800,"ownership_chg":-0.5,"sector":"Healthcare"},
]

# ── Sector Flows ──────────────────────────────────────────────────────────────
SECTOR_FLOWS = {
    "Technology":         {"net_flow_bn":+48.2,"hedge_funds":+18.4,"mutual_funds":+24.8,"pension":+3.2,"sovereign":+1.8,"momentum":"Accelerating","signal":"Strong Buy"},
    "Healthcare":         {"net_flow_bn":+22.4,"hedge_funds":+8.2,"mutual_funds":+11.8,"pension":+1.8,"sovereign":+0.6,"momentum":"Building",     "signal":"Buy"},
    "Financials":         {"net_flow_bn":+14.8,"hedge_funds":+4.8,"mutual_funds":+8.4,"pension":+1.2,"sovereign":+0.4,"momentum":"Stable",        "signal":"Neutral/Buy"},
    "Industrials":        {"net_flow_bn":+8.4, "hedge_funds":+2.4,"mutual_funds":+4.8,"pension":+0.8,"sovereign":+0.4,"momentum":"Emerging",      "signal":"Neutral"},
    "Energy":             {"net_flow_bn":+4.2, "hedge_funds":+2.8,"mutual_funds":+0.8,"pension":+0.4,"sovereign":+0.2,"momentum":"Slowing",       "signal":"Neutral"},
    "Utilities":          {"net_flow_bn":+6.8, "hedge_funds":+1.4,"mutual_funds":+4.2,"pension":+0.8,"sovereign":+0.4,"momentum":"Accelerating",  "signal":"Buy (AI power)"},
    "Commodities/Gold":   {"net_flow_bn":+18.6,"hedge_funds":+6.4,"mutual_funds":+8.2,"pension":+2.4,"sovereign":+1.6,"momentum":"Strong",        "signal":"Buy"},
    "Consumer Disc.":     {"net_flow_bn":-8.4, "hedge_funds":-4.2,"mutual_funds":-3.2,"pension":-0.6,"sovereign":-0.4,"momentum":"Declining",     "signal":"Reduce"},
    "Real Estate":        {"net_flow_bn":-6.2, "hedge_funds":-2.8,"mutual_funds":-2.4,"pension":-0.6,"sovereign":-0.4,"momentum":"Weak",          "signal":"Underweight"},
    "Consumer Staples":   {"net_flow_bn":-2.8, "hedge_funds":-1.2,"mutual_funds":-1.2,"pension":-0.2,"sovereign":-0.2,"momentum":"Flat",          "signal":"Neutral"},
    "Communication Svcs": {"net_flow_bn":+10.2,"hedge_funds":+4.8,"mutual_funds":+4.2,"pension":+0.8,"sovereign":+0.4,"momentum":"Building",      "signal":"Buy"},
    "Materials":          {"net_flow_bn":+2.4, "hedge_funds":+0.8,"mutual_funds":+1.2,"pension":+0.2,"sovereign":+0.2,"momentum":"Emerging",      "signal":"Neutral"},
}

# ── Top Institutional Holders ─────────────────────────────────────────────────
TOP_HOLDERS = {
    "NVDA": [
        {"institution":"Vanguard","type":"Mutual Fund","shares_mn":832,"value_bn":71.4,"pct_of_co":3.42,"chg_qoq":+0.28},
        {"institution":"BlackRock","type":"Mutual Fund","shares_mn":748,"value_bn":64.2,"pct_of_co":3.07,"chg_qoq":+0.41},
        {"institution":"Fidelity","type":"Mutual Fund","shares_mn":312,"value_bn":26.8,"pct_of_co":1.28,"chg_qoq":+0.18},
        {"institution":"State Street","type":"Mutual Fund","shares_mn":298,"value_bn":25.6,"pct_of_co":1.22,"chg_qoq":-0.08},
        {"institution":"Citadel","type":"Hedge Fund","shares_mn":142,"value_bn":12.2,"pct_of_co":0.58,"chg_qoq":+0.22},
    ],
    "AAPL": [
        {"institution":"Vanguard","type":"Mutual Fund","shares_mn":1284,"value_bn":241.8,"pct_of_co":8.28,"chg_qoq":-0.12},
        {"institution":"BlackRock","type":"Mutual Fund","shares_mn":1082,"value_bn":203.8,"pct_of_co":6.98,"chg_qoq":+0.08},
        {"institution":"Berkshire Hathaway","type":"Insurance/Holding","shares_mn":915,"value_bn":172.4,"pct_of_co":5.90,"chg_qoq":0.0},
        {"institution":"State Street","type":"Mutual Fund","shares_mn":594,"value_bn":111.9,"pct_of_co":3.83,"chg_qoq":-0.21},
        {"institution":"Fidelity","type":"Mutual Fund","shares_mn":352,"value_bn":66.3,"pct_of_co":2.27,"chg_qoq":-0.08},
    ],
    "META": [
        {"institution":"Vanguard","type":"Mutual Fund","shares_mn":368,"value_bn":212.1,"pct_of_co":7.42,"chg_qoq":+0.18},
        {"institution":"BlackRock","type":"Mutual Fund","shares_mn":318,"value_bn":183.3,"pct_of_co":6.41,"chg_qoq":+0.28},
        {"institution":"Fidelity","type":"Mutual Fund","shares_mn":142,"value_bn":81.8,"pct_of_co":2.86,"chg_qoq":+0.38},
        {"institution":"State Street","type":"Mutual Fund","shares_mn":138,"value_bn":79.5,"pct_of_co":2.78,"chg_qoq":+0.08},
        {"institution":"Third Point","type":"Hedge Fund","shares_mn":32,"value_bn":18.4,"pct_of_co":0.65,"chg_qoq":+0.48},
    ],
}

# ── Crowded Trades ────────────────────────────────────────────────────────────
CROWDED_TRADES = [
    {"ticker":"NVDA","name":"NVIDIA","crowding_score":92,"inst_count":1842,"pct_of_float":68.4,"consensus":"Long","risk":"Very High","zscore":2.8},
    {"ticker":"AAPL","name":"Apple","crowding_score":88,"inst_count":4218,"pct_of_float":72.1,"consensus":"Long","risk":"High","zscore":2.4},
    {"ticker":"MSFT","name":"Microsoft","crowding_score":85,"inst_count":3892,"pct_of_float":70.8,"consensus":"Long","risk":"High","zscore":2.2},
    {"ticker":"META","name":"Meta Platforms","crowding_score":82,"inst_count":2184,"pct_of_float":62.4,"consensus":"Long","risk":"High","zscore":2.0},
    {"ticker":"LLY","name":"Eli Lilly","crowding_score":78,"inst_count":1624,"pct_of_float":84.2,"consensus":"Long","risk":"Elevated","zscore":1.8},
    {"ticker":"INTC","name":"Intel","crowding_score":28,"inst_count":892,"pct_of_float":72.8,"consensus":"Short","risk":"High Short","zscore":-2.1},
    {"ticker":"BABA","name":"Alibaba","crowding_score":22,"inst_count":648,"pct_of_float":45.2,"consensus":"Short","risk":"High Short","zscore":-2.4},
    {"ticker":"NKE","name":"Nike","crowding_score":34,"inst_count":1248,"pct_of_float":68.4,"consensus":"Short","risk":"Elevated Short","zscore":-1.6},
]

# ── Sector Rotation ───────────────────────────────────────────────────────────
ROTATION_DATA = {
    "primary_rotation": "Consumer/Discretionary → Technology & Utilities",
    "secondary_rotation": "Legacy Tech (INTC, CSCO) → AI Infrastructure (NVDA, AVGO, VRT)",
    "emerging_rotation": "US Equities → International + Commodities",
    "as_of": TODAY,
    "weekly": {
        "into":  ["Technology","Utilities","Commodities"],
        "out_of":["Consumer Disc.","Real Estate","Legacy Telecom"],
        "magnitude_bn": {"Technology":+12.4,"Utilities":+3.2,"Commodities":+5.8,"Consumer Disc.":-4.2,"Real Estate":-2.8,"Telecom":-1.4},
    },
    "monthly": {
        "into":  ["Technology","Healthcare","Financials","Commodities"],
        "out_of":["Consumer Disc.","Real Estate","Materials"],
        "magnitude_bn": {"Technology":+48.2,"Healthcare":+22.4,"Financials":+14.8,"Commodities":+18.6,"Consumer Disc.":-8.4,"Real Estate":-6.2,"Materials":-2.1},
    },
    "quarterly": {
        "signal": "Risk-On with Quality Bias",
        "leaders": ["AI Infrastructure","GLP-1 Healthcare","Gold/Commodities","Financials"],
        "laggards": ["Legacy Technology","Consumer Discretionary","Biotech ex-GLP-1","REITs"],
    },
}

# ── Insider Overlay ───────────────────────────────────────────────────────────
INSIDER_TXNS = [
    {"ticker":"META","name":"Meta Platforms","insider":"Mark Zuckerberg","role":"CEO","type":"Buy","shares":120000,"value_mn":69.1,"date":"2026-05-14","signal":"Bullish"},
    {"ticker":"NVDA","name":"NVIDIA","insider":"Jen-Hsun Huang","role":"CEO","type":"Sell","shares":600000,"value_mn":73.2,"date":"2026-04-22","signal":"Neutral (RSU Plan)"},
    {"ticker":"JPM","name":"JP Morgan","insider":"Jamie Dimon","role":"CEO","type":"Buy","shares":500000,"value_mn":98.5,"date":"2026-03-18","signal":"Very Bullish"},
    {"ticker":"GOOGL","name":"Alphabet","insider":"Sundar Pichai","role":"CEO","type":"Sell","shares":80000,"value_mn":14.2,"date":"2026-04-08","signal":"Neutral (Tax)"},
    {"ticker":"NVO","name":"Novo Nordisk","insider":"Lars Fruergaard","role":"CEO","type":"Buy","shares":200000,"value_mn":14.8,"date":"2026-05-02","signal":"Bullish"},
    {"ticker":"COIN","name":"Coinbase","insider":"Brian Armstrong","role":"CEO","type":"Sell","shares":300000,"value_mn":52.8,"date":"2026-04-30","signal":"Mildly Bearish"},
    {"ticker":"AAPL","name":"Apple","insider":"Tim Cook","role":"CEO","type":"Sell","shares":511000,"value_mn":96.2,"date":"2026-04-01","signal":"Neutral (RSU Plan)"},
    {"ticker":"TSLA","name":"Tesla","insider":"Elon Musk","role":"CEO","type":"Buy","shares":1200000,"value_mn":340.8,"date":"2026-03-28","signal":"Bullish"},
    {"ticker":"FCX","name":"Freeport","insider":"Richard Adkerson","role":"CEO","type":"Buy","shares":400000,"value_mn":18.4,"date":"2026-05-20","signal":"Very Bullish"},
    {"ticker":"XOM","name":"Exxon","insider":"Darren Woods","role":"CEO","type":"Buy","shares":200000,"value_mn":22.4,"date":"2026-05-15","signal":"Bullish"},
]

# ── AI Insights ───────────────────────────────────────────────────────────────
AI_INSIGHTS = [
    {"id":1,"category":"Hedge Funds","headline":"Hedge funds aggressively building AI infrastructure positions",
     "detail":"Managed money has collectively added $28.4B in AI-related holdings (NVDA, AVGO, VRT, SMCI) in Q1 2026, representing the largest single-quarter accumulation since the 2023 ChatGPT surge. Citadel, Two Sigma, and Millennium lead the buying.",
     "what_changed":"NVDA institutional ownership increased 2.8% in a single quarter — the most since Q1 2023.",
     "why_it_matters":"When quantitative and multi-strategy funds align on a single theme, it creates powerful momentum that can persist 2-3 quarters.",
     "historical":"Similar hedging consensus in semiconductors last occurred in Q4 2023, preceding NVDA's 150% rally.",
     "impact":"Bullish for NVDA, AVGO, VRT short-term. Watch for crowding risk above 90/100 crowding score.",
     "severity":"High","icon":"🤖"},
    {"id":2,"category":"Mutual Funds","headline":"Mutual funds rotating out of consumer discretionary into utilities",
     "detail":"$8.4B net outflow from consumer discretionary in Q1 2026, with simultaneous $6.8B inflow into utilities. The primary driver is AI data center power demand creating a secular tailwind for power utilities.",
     "what_changed":"Utility sector weight in large mutual funds increased 0.8% QoQ — largest quarterly increase in 5 years.",
     "why_it_matters":"Mutual fund rotation typically precedes broader market re-rating of sectors by 1-2 quarters.",
     "historical":"Similar utility re-rating occurred in 2021 when infrastructure stimulus was passed.",
     "impact":"Bullish for NEE, AEP, SO, VST. Bearish for consumer discretionary names.",
     "severity":"Medium","icon":"⚡"},
    {"id":3,"category":"PE/VC","headline":"Private equity accelerating AI infrastructure bets",
     "detail":"Blackstone, KKR, and Carlyle collectively deployed $17.6B into AI infrastructure (data centers, energy, connectivity) in Q1 2026, representing 38% of their total deal volume.",
     "what_changed":"AI infrastructure's share of PE deal volume increased from 18% (Q1 2025) to 38% (Q1 2026).",
     "why_it_matters":"PE capital is patient and structural — this signals multi-year demand for data center real estate, power, and networking.",
     "historical":"PE's infrastructure buildout historically precedes 3-5 years of sustained capex cycles.",
     "impact":"Very bullish for data center REITs (EQIX, DLR), power utilities, fiber networks.",
     "severity":"High","icon":"🏗️"},
    {"id":4,"category":"Central Banks/SWF","headline":"Sovereign wealth funds increasing gold and commodity allocations",
     "detail":"Norway GPFG, GIC Singapore, and ADIA collectively increased commodity exposure by $48B in Q1 2026, with gold ETFs being the primary vehicle.",
     "what_changed":"SWF commodity allocation increased from 3.2% to 4.8% of AUM in a single quarter.",
     "why_it_matters":"SWF reallocation is structural and slow to reverse — this creates sustained bid for precious metals and commodity producers.",
     "historical":"Last major SWF commodity rotation in 2010-2011 preceded a 40% gold rally.",
     "impact":"Bullish for GLD, IAU, GDX, and commodity producers. Supports central bank gold thesis.",
     "severity":"High","icon":"🏛️"},
    {"id":5,"category":"Crowded Trades","headline":"NVDA crowding score reaches 92 — risk of position squeeze building",
     "detail":"Institutional ownership of NVDA has reached 68.4% of float with 1,842 institutional holders, the highest concentration since Apple's 2022 peak. At this level, any negative catalyst could trigger a rapid unwind.",
     "what_changed":"NVDA crowding score increased from 78 to 92 in Q1 2026 — approaching the danger zone.",
     "why_it_matters":"Historical analysis shows crowding scores above 90 are associated with 30% higher volatility in the subsequent quarter.",
     "historical":"AAPL in Q2 2022 had a crowding score of 91 — preceded a 27% decline over 6 months.",
     "impact":"NVDA remains fundamentally sound but risk/reward deteriorates at current crowding levels.",
     "severity":"Critical","icon":"⚠️"},
    {"id":6,"category":"Sector Rotation","headline":"Healthcare re-emerging as institutional favorite for H2 2026",
     "detail":"$22.4B net inflow into healthcare in Q1 2026, led by concentrated buying in GLP-1 winners (LLY, NVO) and AI-driven drug discovery names. This is the second consecutive quarter of accelerating healthcare inflows.",
     "what_changed":"Healthcare's share of hedge fund portfolios increased from 12% to 14% QoQ.",
     "why_it_matters":"Secular tailwinds from obesity treatment + AI drug discovery creating a multi-year growth opportunity.",
     "historical":"Previous healthcare super-cycles (2009-2015) created sustained 5-7 year outperformance.",
     "impact":"Bullish for LLY, NVO, ISRG, and AI-driven biotech platforms.",
     "severity":"Medium","icon":"💊"},
]

# ── Alerts ────────────────────────────────────────────────────────────────────
ALERTS = [
    {"id":1,"type":"New Major Position","severity":"Critical","metal":None,
     "title":"Third Point initiates $420M position in TSMC",
     "desc":"Third Point LLC established a new 2.8% portfolio position in Taiwan Semiconductor Manufacturing (TSM) valued at $420M in Q1 2026.",
     "action":"Monitor for position building in subsequent quarter. TSMC directly tied to NVDA supply chain.","time":"2h ago"},
    {"id":2,"type":"Position Increase >20%","severity":"High","metal":None,
     "title":"Two Sigma increases NVDA position by 53%",
     "desc":"Two Sigma raised NVIDIA position from 3.4% to 5.2% portfolio weight — a 53% increase in a single quarter.",
     "action":"Strong quantitative signal. Watch for sustained buying pressure on NVDA.","time":"4h ago"},
    {"id":3,"type":"Crowding Alert","severity":"Critical","metal":None,
     "title":"NVDA crowding score reaches 92 — elevated unwind risk",
     "desc":"NVDA institutional crowding score has reached 92/100, with 1,842 funds holding the stock at 68.4% of float.",
     "action":"Consider position sizing carefully. High-crowded stocks experience sharper drawdowns.","time":"6h ago"},
    {"id":4,"type":"Full Exit","severity":"High","metal":None,
     "title":"Bridgewater exits entire Amazon position",
     "desc":"Bridgewater Associates liquidated its full Amazon stake worth $450M in Q1 2026, reallocating to gold and international equities.",
     "action":"Macro rotation signal. Amazon may face headwinds from institutional rebalancing.","time":"1d ago"},
    {"id":5,"type":"Sector Rotation Signal","severity":"Medium","metal":None,
     "title":"$6.8B rotation into utilities — AI power demand thesis",
     "desc":"Mutual funds collectively added $6.8B to utilities sector in Q1 2026, citing AI data center power demand as the primary thesis.",
     "action":"Consider utility exposure (NEE, VST, AEP) as AI infrastructure play.","time":"1d ago"},
    {"id":6,"type":"VC Round","severity":"Medium","metal":None,
     "title":"Anthropic raises $4B Series E at $61.5B valuation",
     "desc":"Anthropic secured $4B from Google-led round, reaching $61.5B valuation. OpenAI competition intensifying.",
     "action":"Monitor for AI valuation spillover into public markets (GOOGL, MSFT, META).","time":"2d ago"},
    {"id":7,"type":"Insider Buy","severity":"Medium","metal":None,
     "title":"JPM CEO Jamie Dimon buys $98.5M of stock",
     "desc":"JP Morgan CEO Jamie Dimon purchased 500,000 shares ($98.5M) in the open market — largest insider purchase since 2019.",
     "action":"Historically bullish signal. Dimon's previous open market purchases preceded 20%+ returns.","time":"3d ago"},
    {"id":8,"type":"PE Deal","severity":"High","metal":None,
     "title":"Blackstone closes $7.2B CoreWeave acquisition",
     "desc":"Blackstone completed its acquisition of CoreWeave cloud computing infrastructure at $7.2B, betting on sustained AI compute demand.",
     "action":"Validates AI infrastructure as an institutional asset class. Positive for data center REITs.","time":"4d ago"},
]

# ── Sovereign Wealth Funds ────────────────────────────────────────────────────
SWF_DATA = [
    {"name":"Norway GPFG","country":"Norway","aum_tn":1.65,"equity_pct":71,"bond_pct":27,"re_pct":2,"top_sector":"Technology","chg_qoq":{"tech":+2.1,"bonds":-1.8,"gold":+0.8},"score":68},
    {"name":"Abu Dhabi ADIA","country":"UAE","aum_tn":0.85,"equity_pct":55,"bond_pct":22,"re_pct":15,"top_sector":"Diversified","chg_qoq":{"tech":+1.2,"bonds":-0.5,"gold":+1.4},"score":62},
    {"name":"China CIC","country":"China","aum_tn":1.24,"equity_pct":38,"bond_pct":35,"re_pct":12,"top_sector":"Financials","chg_qoq":{"tech":-0.8,"bonds":+0.4,"gold":+2.1},"score":52},
    {"name":"GIC Singapore","country":"Singapore","aum_tn":0.74,"equity_pct":44,"bond_pct":35,"re_pct":12,"top_sector":"Technology","chg_qoq":{"tech":+1.8,"bonds":-1.2,"gold":+0.9},"score":65},
    {"name":"Kuwait KIA","country":"Kuwait","aum_tn":0.80,"equity_pct":60,"bond_pct":25,"re_pct":8,"top_sector":"Diversified","chg_qoq":{"tech":+0.8,"bonds":-0.4,"gold":+1.2},"score":60},
]

# ── Endpoints ─────────────────────────────────────────────────────────────────
@router.get("/overview")
def overview():
    c = _get("it_overview");
    if c: return c
    # Compute flow score from sector flows
    total_net = sum(v["net_flow_bn"] for v in SECTOR_FLOWS.values())
    max_possible = 140
    flow_score = round(min(100, max(0, 50 + total_net / max_possible * 50)), 1)
    sentiment = ("Extremely Bullish" if flow_score >= 80 else "Bullish" if flow_score >= 60 else
                 "Neutral" if flow_score >= 40 else "Bearish" if flow_score >= 20 else "Extremely Bearish")
    heatmap = [
        {"asset":"Equities","flow_bn":+48.2+22.4+14.8+8.4+6.8+10.2,"signal":"Buy"},
        {"asset":"Bonds","flow_bn":+12.4,"signal":"Neutral"},
        {"asset":"Commodities","flow_bn":+18.6,"signal":"Buy"},
        {"asset":"Crypto","flow_bn":+3.2,"signal":"Neutral"},
        {"asset":"Private Mkts","flow_bn":+28.6,"signal":"Bullish"},
    ]
    top_insights = AI_INSIGHTS[:3]
    out = {
        "flow_score": flow_score, "sentiment": sentiment,
        "total_net_flow_bn": round(total_net, 1),
        "heatmap": heatmap,
        "top_insights": top_insights,
        "filing_period": FILING_PERIOD,
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }
    _set("it_overview", out); return out

@router.get("/holdings")
def holdings():
    return {
        "new_positions": NEW_POSITIONS, "increases": INCREASES,
        "reductions": REDUCTIONS, "full_exits": FULL_EXITS,
        "net_position_score": 64,
        "summary": {
            "new_count": len(NEW_POSITIONS), "increase_count": len(INCREASES),
            "reduction_count": len(REDUCTIONS), "exit_count": len(FULL_EXITS),
        },
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }

@router.get("/flows")
def flows():
    rows = []
    for sector, d in SECTOR_FLOWS.items():
        rows.append({
            "sector": sector, **d,
            "net_direction": "Inflow" if d["net_flow_bn"] > 0 else "Outflow",
        })
    rows.sort(key=lambda x: x["net_flow_bn"], reverse=True)
    return {"sectors": rows, "updated_at": datetime.utcnow().isoformat() + "Z"}

@router.get("/smart-money")
def smart_money():
    return {
        "most_bought": MOST_BOUGHT, "most_sold": MOST_SOLD,
        "conviction_longs": MOST_BOUGHT[:5],
        "conviction_exits": FULL_EXITS[:5],
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }

@router.get("/hedge-funds")
def hedge_funds():
    summary = []
    for hf in HEDGE_FUNDS:
        summary.append({
            "name": hf["name"], "manager": hf["manager"],
            "aum_bn": hf["aum_bn"], "style": hf["style"],
            "sentiment_score": hf["sentiment_score"],
            "top_holding": hf["top_holdings"][0]["ticker"] if hf["top_holdings"] else None,
            "new_positions": len(hf["new_positions"]), "exits": len(hf["exits"]),
        })
    return {
        "funds": HEDGE_FUNDS, "summary": summary,
        "hf_sentiment": round(sum(h["sentiment_score"] for h in HEDGE_FUNDS) / len(HEDGE_FUNDS), 1),
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }

@router.get("/mutual-funds")
def mutual_funds():
    return {
        "funds": MUTUAL_FUNDS,
        "avg_risk_appetite": round(sum(f["risk_appetite"] for f in MUTUAL_FUNDS) / len(MUTUAL_FUNDS), 1),
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }

@router.get("/pe")
def private_equity():
    return {
        "deals": PE_DEALS, "metrics": PE_METRICS,
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }

@router.get("/vc")
def venture_capital():
    by_stage = {}
    for r in VC_ROUNDS:
        s = r["stage"].split(" ")[0]  # Seed, Series, etc.
        by_stage.setdefault(s, []).append(r)
    total_deployed = sum(r["amount_mn"] for r in VC_ROUNDS)
    return {
        "rounds": VC_ROUNDS, "metrics": VC_METRICS,
        "by_stage": by_stage, "total_deployed_mn": total_deployed,
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }

@router.get("/ownership")
def ownership():
    c = _get("it_ownership");
    if c: return c
    result = {"holders": {}, "updated_at": datetime.utcnow().isoformat() + "Z"}
    # Try to get live institutional holders for key tickers
    live_tickers = ["NVDA", "AAPL", "META", "MSFT", "GOOGL"]
    live_data = {}
    for ticker in live_tickers:
        try:
            t = yf.Ticker(ticker)
            ih = t.institutional_holders
            if ih is not None and not ih.empty:
                rows = []
                for _, row in ih.head(5).iterrows():
                    rows.append({
                        "institution": str(row.get("Holder", "Unknown")),
                        "shares_mn": round(float(row.get("Shares", 0)) / 1e6, 2),
                        "value_bn": round(float(row.get("Value", 0)) / 1e9, 2),
                        "pct_held": round(float(row.get("% Out", 0)), 2),
                        "date_reported": str(row.get("Date Reported", "")),
                    })
                live_data[ticker] = rows
        except Exception as e:
            logger.warning(f"Ownership {ticker}: {e}")
    # Merge live with static
    for ticker in live_tickers:
        result["holders"][ticker] = live_data.get(ticker) or TOP_HOLDERS.get(ticker, [])
    # Add static only tickers
    for ticker, holders in TOP_HOLDERS.items():
        if ticker not in result["holders"]:
            result["holders"][ticker] = holders
    result["accumulation_score"] = 68
    _set("it_ownership", result); return result

@router.get("/crowded")
def crowded():
    scored = sorted(CROWDED_TRADES, key=lambda x: x["crowding_score"], reverse=True)
    longs   = [c for c in scored if c["consensus"] == "Long"]
    shorts  = [c for c in scored if c["consensus"] == "Short"]
    return {
        "trades": scored, "longs": longs, "shorts": shorts,
        "most_crowded": scored[0] if scored else None,
        "crowding_risk_index": round(sum(c["crowding_score"] for c in scored) / len(scored), 1) if scored else 0,
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }

@router.get("/rotation")
def sector_rotation():
    return {**ROTATION_DATA, "updated_at": datetime.utcnow().isoformat() + "Z"}

@router.get("/insider")
def insider_overlay():
    buys  = [t for t in INSIDER_TXNS if t["type"] == "Buy"]
    sells = [t for t in INSIDER_TXNS if t["type"] == "Sell"]
    # Composite score: buy volume vs sell volume
    buy_vol  = sum(t["value_mn"] for t in buys)
    sell_vol = sum(t["value_mn"] for t in sells)
    ratio = buy_vol / (buy_vol + sell_vol) * 100 if (buy_vol + sell_vol) > 0 else 50
    composite = round(ratio * 0.4 + 68 * 0.6, 1)  # blend with institutional flow score
    return {
        "transactions": INSIDER_TXNS,
        "buys": buys, "sells": sells,
        "buy_volume_mn": round(buy_vol, 1), "sell_volume_mn": round(sell_vol, 1),
        "smart_money_composite": composite,
        "composite_label": ("Bullish" if composite >= 60 else "Neutral" if composite >= 40 else "Bearish"),
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }

@router.get("/insights")
def ai_insights():
    return {"insights": AI_INSIGHTS, "updated_at": datetime.utcnow().isoformat() + "Z"}

@router.get("/alerts")
def alerts():
    sev = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    sorted_alerts = sorted(ALERTS, key=lambda a: sev.get(a["severity"], 4))
    return {"alerts": sorted_alerts, "updated_at": datetime.utcnow().isoformat() + "Z"}

@router.get("/screener")
def screener(
    inst_type: str = "",
    sector: str = "",
    min_value_mn: float = 0,
    activity: str = "",
):
    results = []
    # Screen new positions
    for p in NEW_POSITIONS:
        if min_value_mn and p["size_mn"] < min_value_mn: continue
        results.append({**p, "activity_type": "New Position",
                        "institution_type": "Hedge Fund"})
    for p in INCREASES:
        val = p.get("curr_weight", 0) * 630  # rough AUM proxy
        if min_value_mn and val < min_value_mn: continue
        results.append({**p, "activity_type": "Position Increase",
                        "institution_type": "Hedge Fund"})
    results.sort(key=lambda x: x.get("size_mn", x.get("curr_weight", 0)), reverse=True)
    return {
        "results": results[:50],
        "total": len(results),
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }

@router.get("/sovereign")
def sovereign_wealth():
    return {
        "funds": SWF_DATA,
        "total_aum_tn": round(sum(f["aum_tn"] for f in SWF_DATA), 2),
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }
