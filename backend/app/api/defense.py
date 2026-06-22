from __future__ import annotations

import asyncio
import time
from datetime import datetime, timedelta

import pandas as pd
import yfinance as yf
from fastapi import APIRouter

router = APIRouter()

# ── Curated Data ──────────────────────────────────────────────────────────────

COUNTRY_SPENDING = [
    {"country": "United States",  "code": "US",  "flag": "🇺🇸", "budget_b": 886,  "yoy_pct": 6.8,  "gdp_pct": 3.38, "region": "NATO",        "trend": "Rising"},
    {"country": "China",          "code": "CN",  "flag": "🇨🇳", "budget_b": 296,  "yoy_pct": 7.2,  "gdp_pct": 1.71, "region": "Non-NATO",    "trend": "Surge"},
    {"country": "Russia",         "code": "RU",  "flag": "🇷🇺", "budget_b": 109,  "yoy_pct": 24.0, "gdp_pct": 6.80, "region": "Non-NATO",    "trend": "Wartime"},
    {"country": "India",          "code": "IN",  "flag": "🇮🇳", "budget_b": 83,   "yoy_pct": 4.7,  "gdp_pct": 2.44, "region": "Non-NATO",    "trend": "Rising"},
    {"country": "Saudi Arabia",   "code": "SA",  "flag": "🇸🇦", "budget_b": 75,   "yoy_pct": 4.2,  "gdp_pct": 7.10, "region": "Non-NATO",    "trend": "Stable"},
    {"country": "United Kingdom", "code": "GB",  "flag": "🇬🇧", "budget_b": 68,   "yoy_pct": 5.5,  "gdp_pct": 2.32, "region": "NATO",        "trend": "Rising"},
    {"country": "Germany",        "code": "DE",  "flag": "🇩🇪", "budget_b": 82,   "yoy_pct": 13.8, "gdp_pct": 1.97, "region": "NATO",        "trend": "Rearmament"},
    {"country": "France",         "code": "FR",  "flag": "🇫🇷", "budget_b": 55,   "yoy_pct": 7.4,  "gdp_pct": 2.06, "region": "NATO",        "trend": "Rising"},
    {"country": "Japan",          "code": "JP",  "flag": "🇯🇵", "budget_b": 51,   "yoy_pct": 26.3, "gdp_pct": 1.10, "region": "Non-NATO",    "trend": "Rearmament"},
    {"country": "South Korea",    "code": "KR",  "flag": "🇰🇷", "budget_b": 48,   "yoy_pct": 5.6,  "gdp_pct": 2.76, "region": "Non-NATO",    "trend": "Rising"},
    {"country": "Poland",         "code": "PL",  "flag": "🇵🇱", "budget_b": 32,   "yoy_pct": 22.4, "gdp_pct": 4.12, "region": "NATO",        "trend": "Surge"},
    {"country": "Australia",      "code": "AU",  "flag": "🇦🇺", "budget_b": 30,   "yoy_pct": 6.8,  "gdp_pct": 2.00, "region": "Non-NATO",    "trend": "Rising"},
]

GEOPOLITICAL = [
    {
        "region": "Eastern Europe / Russia-Ukraine", "score": 88, "category": "Active Conflict",
        "color": "#ef4444",
        "threats": ["Russia-Ukraine War (Day 850+)", "NATO Article 5 invocations debated", "Kalibr/Kh-101 strikes", "F-16 Ukraine deployments"],
        "beneficiaries": ["LMT", "RTX", "BA", "LHX"],
        "escalation_prob": 0.35, "deescalation_prob": 0.20,
        "procurement": ["HIMARS M270", "Patriot PAC-3 MSE", "JDAM-ER kits", "M1A1 Abrams"],
    },
    {
        "region": "Middle East / Gaza-Iran-Houthi", "score": 82, "category": "Active Conflict",
        "color": "#f97316",
        "threats": ["Gaza conflict ongoing", "Houthi Red Sea shipping attacks", "Iran nuclear threshold", "Israel-Hezbollah tensions"],
        "beneficiaries": ["LMT", "RTX", "GD", "BA"],
        "escalation_prob": 0.42, "deescalation_prob": 0.18,
        "procurement": ["Iron Dome interceptors", "THAAD batteries", "F-35I deliveries", "GBU-28 bunker busters"],
    },
    {
        "region": "Taiwan Strait", "score": 78, "category": "High Tension",
        "color": "#f59e0b",
        "threats": ["PLA encirclement exercises", "Strait centerline crossings", "Cyber/EW provocations", "PLAN carrier ops"],
        "beneficiaries": ["LMT", "NOC", "KTOS", "RTX"],
        "escalation_prob": 0.22, "deescalation_prob": 0.38,
        "procurement": ["F-35A (Taiwan blocked)", "Harpoon Block II", "HIMARS", "M1A2T Abrams"],
    },
    {
        "region": "South China Sea", "score": 72, "category": "Elevated Risk",
        "color": "#eab308",
        "threats": ["Philippine vessel harassment", "Reef/island construction", "FONOP confrontations", "AIS spoofing incidents"],
        "beneficiaries": ["GD", "HII", "NOC", "RTX"],
        "escalation_prob": 0.28, "deescalation_prob": 0.32,
        "procurement": ["Virginia SSN", "SM-6 Block IB", "P-8 Poseidon", "MQ-4C Triton"],
    },
    {
        "region": "Korean Peninsula", "score": 65, "category": "Elevated Risk",
        "color": "#84cc16",
        "threats": ["DPRK ICBM launches", "Tactical nuclear doctrine", "Russia-DPRK military cooperation", "Artillery provocations"],
        "beneficiaries": ["LMT", "RTX", "NOC"],
        "escalation_prob": 0.18, "deescalation_prob": 0.25,
        "procurement": ["THAAD", "Patriot PAC-3", "F-35A ROKAF", "SM-3 IIA"],
    },
    {
        "region": "Arctic", "score": 52, "category": "Moderate Risk",
        "color": "#22c55e",
        "threats": ["Russian Arctic militarization", "Northern Sea Route disputes", "Submarine activity increase", "Energy resource competition"],
        "beneficiaries": ["NOC", "LHX", "HII"],
        "escalation_prob": 0.12, "deescalation_prob": 0.45,
        "procurement": ["Arctic SSN upgrades", "P-8A cold weather ops", "Icebreaker fleet"],
    },
]

PROCUREMENT_PROGRAMS = [
    # Air
    {"cat": "Air",     "program": "F-35 Lightning II",          "contractor": "LMT",     "nations": "Multi-NATO",
     "contract_b": 2100, "annual_b": 18.2, "backlog_b": 95.0,  "deliveries": 155, "new_orders": 170, "status": "Full Rate Production", "score": 95},
    {"cat": "Air",     "program": "B-21 Raider Stealth Bomber", "contractor": "NOC",     "nations": "USA",
     "contract_b": 80,   "annual_b": 5.5,  "backlog_b": 55.0,  "deliveries": 0,   "new_orders": 5,   "status": "LRIP Phase",           "score": 88},
    {"cat": "Air",     "program": "MQ-9 / Next-Gen RPAS",       "contractor": "GA-ASI",  "nations": "Multi",
     "contract_b": 15,   "annual_b": 2.8,  "backlog_b": 18.0,  "deliveries": 35,  "new_orders": 52,  "status": "Production + Upgrade", "score": 82},
    {"cat": "Air",     "program": "AH-64E Apache Guardian",      "contractor": "BA",      "nations": "Multi",
     "contract_b": 12,   "annual_b": 1.8,  "backlog_b": 8.0,   "deliveries": 45,  "new_orders": 60,  "status": "Full Rate Production", "score": 78},
    # Naval
    {"cat": "Naval",   "program": "Ford-Class Carrier (CVN-80)", "contractor": "HII",    "nations": "USA",
     "contract_b": 26,   "annual_b": 4.2,  "backlog_b": 22.0,  "deliveries": 0,   "new_orders": 1,   "status": "Construction",         "score": 80},
    {"cat": "Naval",   "program": "Columbia-Class SSBN",         "contractor": "GD/HII", "nations": "USA",
     "contract_b": 128,  "annual_b": 7.8,  "backlog_b": 95.0,  "deliveries": 0,   "new_orders": 2,   "status": "Lead Ship Build",      "score": 90},
    {"cat": "Naval",   "program": "Virginia-Class SSN",          "contractor": "GD/HII", "nations": "USA",
     "contract_b": 17,   "annual_b": 6.8,  "backlog_b": 28.0,  "deliveries": 2,   "new_orders": 2,   "status": "Full Rate Production", "score": 88},
    {"cat": "Naval",   "program": "Constellation-Class FFG",     "contractor": "HII",    "nations": "USA",
     "contract_b": 22,   "annual_b": 3.1,  "backlog_b": 18.0,  "deliveries": 0,   "new_orders": 2,   "status": "Construction",         "score": 75},
    # Land
    {"cat": "Land",    "program": "M1A2 SEPv3/v4 Abrams",       "contractor": "GD",     "nations": "Multi",
     "contract_b": 10,   "annual_b": 2.4,  "backlog_b": 12.0,  "deliveries": 80,  "new_orders": 120, "status": "Production Surge",     "score": 82},
    {"cat": "Land",    "program": "HIMARS / M270 MLRS",          "contractor": "LMT",    "nations": "Multi-NATO",
     "contract_b": 15,   "annual_b": 2.8,  "backlog_b": 14.0,  "deliveries": 60,  "new_orders": 95,  "status": "Production Surge",     "score": 95},
    {"cat": "Land",    "program": "AMPV (Bradley Replacement)",  "contractor": "BAE",    "nations": "USA",
     "contract_b": 4.5,  "annual_b": 0.9,  "backlog_b": 3.5,   "deliveries": 110, "new_orders": 150, "status": "Full Rate Production", "score": 75},
    # Missiles
    {"cat": "Missile", "program": "Patriot PAC-3 MSE",           "contractor": "RTX/LMT","nations": "Multi",
     "contract_b": 48,   "annual_b": 8.2,  "backlog_b": 55.0,  "deliveries": 600, "new_orders": 1200,"status": "Production Surge",     "score": 98},
    {"cat": "Missile", "program": "THAAD Terminal Defense",       "contractor": "LMT",    "nations": "Multi",
     "contract_b": 22,   "annual_b": 3.8,  "backlog_b": 28.0,  "deliveries": 24,  "new_orders": 48,  "status": "Full Rate Production", "score": 92},
    {"cat": "Missile", "program": "SM-3 IIA / SM-6 Block IB",    "contractor": "RTX",    "nations": "Multi",
     "contract_b": 18,   "annual_b": 4.2,  "backlog_b": 22.0,  "deliveries": 180, "new_orders": 280, "status": "Production Surge",     "score": 94},
    {"cat": "Missile", "program": "JASSM-ER / LRASM",            "contractor": "LMT",    "nations": "Multi",
     "contract_b": 8,    "annual_b": 2.1,  "backlog_b": 12.0,  "deliveries": 450, "new_orders": 650, "status": "Production Surge",     "score": 90},
    {"cat": "Missile", "program": "Hypersonic (CPS/ARRW/HACM)",  "contractor": "LMT/RTX","nations": "USA",
     "contract_b": 12,   "annual_b": 3.5,  "backlog_b": 8.0,   "deliveries": 0,   "new_orders": 5,   "status": "Development",          "score": 72},
]

DEFENSE_STOCKS = [
    {"ticker": "LMT",  "company": "Lockheed Martin",      "segment": "Aeronautics / Missiles / Space",
     "rev_b": 67.6,  "rev_g": 0.051, "backlog_b": 159.9, "backlog_g": 0.068, "op_margin": 0.113, "fcf_b": 6.2,  "eps_g": 0.082, "div_yield": 0.027, "fwd_pe": 18.2, "ev_ebitda": 13.8, "gov_pct": 0.94, "rating": "STRONG BUY"},
    {"ticker": "RTX",  "company": "RTX Corporation",       "segment": "Missiles / Sensors / Pratt",
     "rev_b": 78.8,  "rev_g": 0.098, "backlog_b": 220.0, "backlog_g": 0.125, "op_margin": 0.105, "fcf_b": 7.8,  "eps_g": 0.145, "div_yield": 0.021, "fwd_pe": 22.1, "ev_ebitda": 15.2, "gov_pct": 0.54, "rating": "STRONG BUY"},
    {"ticker": "NOC",  "company": "Northrop Grumman",      "segment": "B-21 / Space / Cyber",
     "rev_b": 41.0,  "rev_g": 0.041, "backlog_b": 85.0,  "backlog_g": 0.058, "op_margin": 0.116, "fcf_b": 2.8,  "eps_g": 0.062, "div_yield": 0.016, "fwd_pe": 20.5, "ev_ebitda": 14.1, "gov_pct": 0.93, "rating": "BUY"},
    {"ticker": "GD",   "company": "General Dynamics",      "segment": "Submarines / Combat Systems / Gulfstream",
     "rev_b": 47.7,  "rev_g": 0.083, "backlog_b": 91.5,  "backlog_g": 0.093, "op_margin": 0.132, "fcf_b": 3.2,  "eps_g": 0.114, "div_yield": 0.019, "fwd_pe": 19.8, "ev_ebitda": 14.6, "gov_pct": 0.66, "rating": "BUY"},
    {"ticker": "LHX",  "company": "L3Harris Technologies", "segment": "ISR / Electronic Warfare",
     "rev_b": 21.3,  "rev_g": 0.023, "backlog_b": 32.0,  "backlog_g": 0.035, "op_margin": 0.142, "fcf_b": 2.4,  "eps_g": 0.078, "div_yield": 0.023, "fwd_pe": 16.8, "ev_ebitda": 12.4, "gov_pct": 0.87, "rating": "BUY"},
    {"ticker": "HII",  "company": "Huntington Ingalls",    "segment": "Naval / Aircraft Carriers",
     "rev_b": 11.4,  "rev_g": 0.032, "backlog_b": 48.0,  "backlog_g": 0.088, "op_margin": 0.076, "fcf_b": 0.8,  "eps_g": -0.025,"div_yield": 0.018, "fwd_pe": 14.2, "ev_ebitda": 9.8,  "gov_pct": 0.97, "rating": "HOLD"},
    {"ticker": "KTOS", "company": "Kratos Defense",        "segment": "Drones / Hypersonics",
     "rev_b": 2.8,   "rev_g": 0.185, "backlog_b": 1.6,   "backlog_g": 0.240, "op_margin": 0.048, "fcf_b": 0.18, "eps_g": 0.320, "div_yield": 0.00,  "fwd_pe": 68.0, "ev_ebitda": 42.0, "gov_pct": 0.85, "rating": "BUY"},
    {"ticker": "AVAV", "company": "AeroVironment",         "segment": "Small UAVs / Loitering Munitions",
     "rev_b": 0.85,  "rev_g": 0.225, "backlog_b": 0.65,  "backlog_g": 0.310, "op_margin": 0.082, "fcf_b": 0.09, "eps_g": 0.420, "div_yield": 0.00,  "fwd_pe": 52.0, "ev_ebitda": 38.0, "gov_pct": 0.92, "rating": "BUY"},
    {"ticker": "PLTR", "company": "Palantir Technologies", "segment": "AI / Data Analytics / Defense",
     "rev_b": 3.4,   "rev_g": 0.265, "backlog_b": 5.2,   "backlog_g": 0.380, "op_margin": 0.115, "fcf_b": 1.2,  "eps_g": 0.680, "div_yield": 0.00,  "fwd_pe": 148.0,"ev_ebitda": 88.0, "gov_pct": 0.55, "rating": "HOLD"},
    {"ticker": "LDOS", "company": "Leidos Holdings",       "segment": "Defense IT / Intelligence Systems",
     "rev_b": 15.8,  "rev_g": 0.046, "backlog_b": 36.0,  "backlog_g": 0.055, "op_margin": 0.098, "fcf_b": 1.4,  "eps_g": 0.092, "div_yield": 0.014, "fwd_pe": 15.8, "ev_ebitda": 11.2, "gov_pct": 0.91, "rating": "BUY"},
]

TECHNOLOGIES = [
    {"name": "AI & Machine Learning",       "cat": "AI/Autonomy",      "funding_b": 14.8, "growth": 0.38, "trl": 7, "maturity": "Fielding",       "adoption": 72, "companies": ["PLTR","MSFT","AMZN","GOOG"]},
    {"name": "Autonomous Drones / UAVs",    "cat": "Autonomy",         "funding_b": 10.2, "growth": 0.55, "trl": 8, "maturity": "Full Production", "adoption": 85, "companies": ["AVAV","KTOS","NOC","GD"]},
    {"name": "Space Defense / USSF",        "cat": "Space",            "funding_b": 28.2, "growth": 0.12, "trl": 8, "maturity": "Operational",     "adoption": 88, "companies": ["NOC","LMT","RTX","SPCE"]},
    {"name": "Electronic Warfare",          "cat": "EW/EMS",           "funding_b": 8.1,  "growth": 0.22, "trl": 8, "maturity": "Fielding",        "adoption": 78, "companies": ["LHX","LMT","RTX","NOC"]},
    {"name": "Cybersecurity / CyberCom",    "cat": "Cyber",            "funding_b": 12.8, "growth": 0.18, "trl": 9, "maturity": "Operational",     "adoption": 92, "companies": ["LDOS","CACI","SAIC","MSFT"]},
    {"name": "Hypersonic Systems",          "cat": "Missile Systems",  "funding_b": 7.4,  "growth": 0.42, "trl": 5, "maturity": "Development",     "adoption": 28, "companies": ["LMT","RTX","NOC","BA"]},
    {"name": "Directed Energy (Laser/HEM)", "cat": "Novel Weapons",    "funding_b": 3.2,  "growth": 0.48, "trl": 5, "maturity": "Demo/Testing",    "adoption": 22, "companies": ["RTX","LMT","NOC","BA"]},
    {"name": "Loitering Munitions",         "cat": "Autonomy",         "funding_b": 2.8,  "growth": 0.95, "trl": 8, "maturity": "Combat Proven",   "adoption": 88, "companies": ["AVAV","KTOS","LMT","BA"]},
    {"name": "Quantum Sensing / Comms",     "cat": "Advanced Computing","funding_b": 1.8, "growth": 0.52, "trl": 3, "maturity": "Research",         "adoption": 8,  "companies": ["IONQ","IBM","MSFT","NOC"]},
]

SUPPLY_CHAIN = [
    {"input": "Advanced Semiconductors (SiC/GaN/7nm)", "cat": "Electronics",
     "criticality": 95, "domestic_pct": 12, "constraint": "CRITICAL", "stockpile_days": 45,
     "risk": 88, "suppliers": ["TSMC","Samsung","Intel"], "mitigation": "CHIPS Act domestic fab investment"},
    {"input": "Gallium / GaAs for Radar / EW",         "cat": "Electronics",
     "criticality": 92, "domestic_pct": 5,  "constraint": "CRITICAL", "stockpile_days": 30,
     "risk": 92, "suppliers": ["China (98%)", "SK Siltron"], "mitigation": "China export controls risk; NRL alternatives"},
    {"input": "Rare Earth Elements (Nd, Dy, Pr)",      "cat": "Materials",
     "criticality": 90, "domestic_pct": 8,  "constraint": "HIGH",     "stockpile_days": 90,
     "risk": 82, "suppliers": ["China (70%)","MP Materials","Lynas"], "mitigation": "DoD stockpile + MP Materials contracts"},
    {"input": "Titanium / Aerospace Alloys",           "cat": "Materials",
     "criticality": 85, "domestic_pct": 35, "constraint": "HIGH",     "stockpile_days": 120,
     "risk": 72, "suppliers": ["Russia (26%)","Kazakhstan","ATI Inc."], "mitigation": "Sanctions workaround; ATI domestic ramp"},
    {"input": "Solid Rocket Propellant",               "cat": "Propulsion",
     "criticality": 92, "domestic_pct": 92, "constraint": "MODERATE", "stockpile_days": 180,
     "risk": 42, "suppliers": ["Aerojet Rocketdyne","NOC","L3Harris"], "mitigation": "Domestic capacity; DoD strategic reserve"},
    {"input": "Carbon Fiber (CFRP)",                   "cat": "Composites",
     "criticality": 80, "domestic_pct": 45, "constraint": "MODERATE", "stockpile_days": 90,
     "risk": 52, "suppliers": ["Toray (Japan)","Hexcel","SGL Carbon"], "mitigation": "Hexcel domestic expansion; DoD contracts"},
    {"input": "Explosives / Energetics (HMX, TATB)",   "cat": "Energetics",
     "criticality": 88, "domestic_pct": 85, "constraint": "MODERATE", "stockpile_days": 150,
     "risk": 38, "suppliers": ["Chemring","Alliant","BAE Systems"], "mitigation": "Pantex + Pine Bluff capacity expansion"},
    {"input": "Specialty Metals (Be, Co, Ta)",         "cat": "Materials",
     "criticality": 78, "domestic_pct": 20, "constraint": "HIGH",     "stockpile_days": 60,
     "risk": 68, "suppliers": ["DRC (Co)","China (Ta)","Kazakhstan"], "mitigation": "NDS review 2025 + cobalt sourcing shift"},
]

NATO_MEMBERS = [
    {"country": "United States",  "gdp_b": 27800, "defense_b": 886, "gdp_pct": 3.38, "meets": True,  "trend": "Stable",      "yoy": 6.8},
    {"country": "Poland",         "gdp_b": 850,   "defense_b": 32,  "gdp_pct": 4.12, "meets": True,  "trend": "Surge",       "yoy": 22.4},
    {"country": "Estonia",        "gdp_b": 42,    "defense_b": 1.6, "gdp_pct": 3.44, "meets": True,  "trend": "Rising",      "yoy": 18.0},
    {"country": "Latvia",         "gdp_b": 43,    "defense_b": 1.6, "gdp_pct": 3.15, "meets": True,  "trend": "Surge",       "yoy": 24.0},
    {"country": "Greece",         "gdp_b": 245,   "defense_b": 7.4, "gdp_pct": 3.08, "meets": True,  "trend": "Stable",      "yoy": 2.5},
    {"country": "Lithuania",      "gdp_b": 75,    "defense_b": 3.1, "gdp_pct": 2.85, "meets": True,  "trend": "Rising",      "yoy": 15.0},
    {"country": "Romania",        "gdp_b": 350,   "defense_b": 8.5, "gdp_pct": 2.44, "meets": True,  "trend": "Rising",      "yoy": 12.0},
    {"country": "Finland",        "gdp_b": 280,   "defense_b": 6.8, "gdp_pct": 2.41, "meets": True,  "trend": "Rising",      "yoy": 11.0},
    {"country": "United Kingdom", "gdp_b": 3100,  "defense_b": 68,  "gdp_pct": 2.32, "meets": True,  "trend": "Rising",      "yoy": 5.5},
    {"country": "Norway",         "gdp_b": 490,   "defense_b": 10.2,"gdp_pct": 2.15, "meets": True,  "trend": "Rising",      "yoy": 6.0},
    {"country": "Slovakia",       "gdp_b": 130,   "defense_b": 2.5, "gdp_pct": 2.10, "meets": True,  "trend": "Rising",      "yoy": 8.0},
    {"country": "Hungary",        "gdp_b": 210,   "defense_b": 4.2, "gdp_pct": 2.01, "meets": True,  "trend": "Rising",      "yoy": 5.0},
    {"country": "Netherlands",    "gdp_b": 1100,  "defense_b": 22.5,"gdp_pct": 2.05, "meets": True,  "trend": "Rising",      "yoy": 9.0},
    {"country": "France",         "gdp_b": 3100,  "defense_b": 55,  "gdp_pct": 2.06, "meets": True,  "trend": "Rising",      "yoy": 7.4},
    {"country": "Germany",        "gdp_b": 4500,  "defense_b": 82,  "gdp_pct": 1.97, "meets": False, "trend": "Rearmament",  "yoy": 13.8},
    {"country": "Turkey",         "gdp_b": 1100,  "defense_b": 20,  "gdp_pct": 1.82, "meets": False, "trend": "Stable",      "yoy": 3.0},
    {"country": "Italy",          "gdp_b": 2200,  "defense_b": 32,  "gdp_pct": 1.49, "meets": False, "trend": "Rising",      "yoy": 5.2},
    {"country": "Canada",         "gdp_b": 2200,  "defense_b": 30,  "gdp_pct": 1.37, "meets": False, "trend": "Rising",      "yoy": 8.0},
    {"country": "Spain",          "gdp_b": 1600,  "defense_b": 21,  "gdp_pct": 1.28, "meets": False, "trend": "Rising",      "yoy": 4.0},
    {"country": "Belgium",        "gdp_b": 620,   "defense_b": 8.2, "gdp_pct": 1.31, "meets": False, "trend": "Rising",      "yoy": 6.5},
]

ALERTS = [
    {"id": "D1", "priority": "CRITICAL",
     "title": "Patriot PAC-3 MSE at Production Capacity — 6-Month Backlog",
     "detail": "RTX/LMT producing 1,200+ missiles/yr vs pre-conflict 500/yr. DoD contracts +$8.2B in 90 days.",
     "tickers": ["RTX", "LMT"]},
    {"id": "D2", "priority": "CRITICAL",
     "title": "B-21 Raider Enters LRIP — NOC Margin Expansion Beginning",
     "detail": "First LRIP contract $5.5B/yr; cost ceiling negotiations underway for 100-aircraft program.",
     "tickers": ["NOC"]},
    {"id": "D3", "priority": "HIGH",
     "title": "European Rearmament Accelerating — Poland 4.12% GDP, Germany €100B Fund",
     "detail": "NATO Europe defense spending +12.5% YoY; highest since Cold War. Multi-year procurement cycle beginning.",
     "tickers": ["LMT", "RTX", "NOC", "GD", "LHX"]},
    {"id": "D4", "priority": "HIGH",
     "title": "Japan Defense Budget +26.3% YoY — Tomahawk, F-35, Patriot Procurement",
     "detail": "Japan doubling defense spending to 2% GDP by 2027. $16B in US weapons contracts signed.",
     "tickers": ["LMT", "RTX", "BA"]},
    {"id": "D5", "priority": "HIGH",
     "title": "HIMARS Demand Surge — 95 New Orders vs 60 Deliveries in FY26",
     "detail": "Ukraine war + NATO restocking driving 58% backlog growth. LMT production expanding to 96 units/yr.",
     "tickers": ["LMT"]},
    {"id": "D6", "priority": "MEDIUM",
     "title": "Drone/Loitering Munition Demand Explodes — AVAV/KTOS Backlogs +31%/+24%",
     "detail": "Ukraine conflict proving drone effectiveness. DoD FY26 UAV request +45% vs FY25.",
     "tickers": ["AVAV", "KTOS"]},
    {"id": "D7", "priority": "MEDIUM",
     "title": "GaN Supply Chain Risk — China Controls 98% of Gallium Production",
     "detail": "China export controls on Ga/Ge effective July 2024. Radar/EW production at risk within 18 months.",
     "tickers": ["LHX", "RTX", "NOC", "LMT"]},
]

DEFENSE_TICKERS = ["LMT", "RTX", "NOC", "GD", "LHX", "HII", "KTOS", "AVAV", "PLTR", "LDOS"]

_mkt_cache: dict = {}
_CACHE_TTL = 300


def _fetch_defense_markets(tickers: list[str]) -> dict:
    now = time.time()
    key = ",".join(sorted(tickers))
    if key in _mkt_cache and now - _mkt_cache[key]["ts"] < _CACHE_TTL:
        return _mkt_cache[key]["data"]

    end   = datetime.today().strftime("%Y-%m-%d")
    start = (datetime.today() - timedelta(days=200)).strftime("%Y-%m-%d")
    result: dict = {}
    try:
        raw = yf.download(tickers, start=start, end=end, auto_adjust=True, progress=False)
        cl = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw
        hi = raw["High"]  if isinstance(raw.columns, pd.MultiIndex) else raw
        lo = raw["Low"]   if isinstance(raw.columns, pd.MultiIndex) else raw

        for tkr in tickers:
            try:
                close = (cl[tkr] if tkr in cl.columns else cl.iloc[:, 0]).dropna()
                high  = (hi[tkr] if tkr in hi.columns else hi.iloc[:, 0]).dropna()
                low   = (lo[tkr] if tkr in lo.columns else lo.iloc[:, 0]).dropna()
                if len(close) < 20:
                    continue

                # RSI
                delta = close.diff()
                gain  = delta.clip(lower=0).rolling(14).mean()
                loss  = (-delta.clip(upper=0)).rolling(14).mean()
                rsi   = float((100 - 100 / (1 + gain / loss.replace(0, 1e-10))).iloc[-1])

                # MACD
                ema12 = close.ewm(span=12).mean()
                ema26 = close.ewm(span=26).mean()
                macd  = ema12 - ema26
                sig   = macd.ewm(span=9).mean()

                # EMAs
                ema20  = float(close.ewm(span=20).mean().iloc[-1])
                ema50  = float(close.ewm(span=50).mean().iloc[-1]) if len(close) >= 50  else None
                ema200 = float(close.ewm(span=200).mean().iloc[-1]) if len(close) >= 200 else None

                # ADX
                adx = None
                try:
                    dm_plus  = high.diff().clip(lower=0)
                    dm_minus = (-low.diff()).clip(lower=0)
                    mask     = dm_plus > dm_minus
                    dm_plus  = dm_plus.where(mask, 0)
                    dm_minus = dm_minus.where(~mask, 0)
                    tr_list  = pd.concat([
                        high - low,
                        (high - close.shift()).abs(),
                        (low - close.shift()).abs(),
                    ], axis=1).max(axis=1)
                    atr      = tr_list.rolling(14).mean()
                    di_p     = 100 * (dm_plus.rolling(14).mean() / atr.replace(0, 1e-10))
                    di_m     = 100 * (dm_minus.rolling(14).mean() / atr.replace(0, 1e-10))
                    dx       = 100 * (di_p - di_m).abs() / (di_p + di_m + 1e-10)
                    adx      = float(dx.rolling(14).mean().iloc[-1])
                except Exception:
                    pass

                price  = float(close.iloc[-1])
                prev   = float(close.iloc[-2]) if len(close) >= 2 else price
                chg    = (price - prev) / prev * 100

                # Score
                score = 50
                if rsi > 50:  score += 7
                if rsi > 60:  score += 5
                if float(macd.iloc[-1]) > float(sig.iloc[-1]): score += 13
                if price > ema20: score += 8
                if ema50  and price > ema50:  score += 8
                if ema200 and price > ema200: score += 9
                if adx and adx > 25: score += 5
                score = min(100, max(0, score))
                signal = ("STRONG BUY" if score >= 80 else "BUY" if score >= 65
                          else "HOLD" if score >= 45 else "SELL" if score >= 30 else "STRONG SELL")

                result[tkr] = {
                    "price": round(price, 2), "chg_pct": round(chg, 2),
                    "rsi": round(rsi, 1),
                    "macd": round(float(macd.iloc[-1]), 3),
                    "macd_signal": round(float(sig.iloc[-1]), 3),
                    "ema20": round(ema20, 2),
                    "ema50": round(ema50, 2) if ema50 else None,
                    "ema200": round(ema200, 2) if ema200 else None,
                    "adx": round(adx, 1) if adx else None,
                    "score": score, "signal": signal,
                }
            except Exception:
                pass
    except Exception:
        pass
    _mkt_cache[key] = {"ts": now, "data": result}
    return result


def _defense_score() -> dict:
    avg_geo  = sum(r["score"] for r in GEOPOLITICAL) / len(GEOPOLITICAL)
    proc_score = sum(p["score"] for p in PROCUREMENT_PROGRAMS) / len(PROCUREMENT_PROGRAMS)
    spending_growth = sum(c["yoy_pct"] for c in COUNTRY_SPENDING) / len(COUNTRY_SPENDING)
    tech_score = sum(t["adoption"] for t in TECHNOLOGIES) / len(TECHNOLOGIES)
    sc_risk = sum(s["risk"] for s in SUPPLY_CHAIN) / len(SUPPLY_CHAIN)

    overall = int(0.25 * min(100, avg_geo) + 0.20 * proc_score + 0.20 * min(100, spending_growth * 4)
                  + 0.20 * tech_score + 0.10 * (100 - sc_risk) + 0.05 * 80)

    if overall >= 80: regime = "Defense Supercycle"
    elif overall >= 65: regime = "Defense Expansion"
    elif overall >= 50: regime = "Military Modernization"
    elif overall >= 35: regime = "Rearmament Cycle"
    else: regime = "Stable Environment"

    return {"score": overall, "regime": regime}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/overview")
async def get_overview():
    ds = _defense_score()
    total_spending  = sum(c["budget_b"] for c in COUNTRY_SPENDING)
    avg_growth      = sum(c["yoy_pct"] for c in COUNTRY_SPENDING) / len(COUNTRY_SPENDING)
    active_conflicts = sum(1 for r in GEOPOLITICAL if r["category"] == "Active Conflict")
    procurement_score = sum(p["score"] for p in PROCUREMENT_PROGRAMS) / len(PROCUREMENT_PROGRAMS)
    top_programs = sorted(PROCUREMENT_PROGRAMS, key=lambda x: x["score"], reverse=True)[:5]

    return {
        "defense_score":   ds["score"],
        "regime":          ds["regime"],
        "kpis": {
            "global_spending_b":      total_spending,
            "avg_spending_growth_pct": round(avg_growth, 1),
            "active_conflicts":        active_conflicts,
            "procurement_score":       round(procurement_score, 0),
            "nato_members_tracked":    len(NATO_MEMBERS),
            "contractors_tracked":     len(DEFENSE_STOCKS),
            "programs_tracked":        len(PROCUREMENT_PROGRAMS),
            "top_geo_risk":            max(GEOPOLITICAL, key=lambda x: x["score"])["region"],
        },
        "alerts": ALERTS[:4],
        "top_programs": [
            {"program": p["program"], "contractor": p["contractor"], "annual_b": p["annual_b"],
             "backlog_b": p["backlog_b"], "score": p["score"]}
            for p in top_programs
        ],
        "top_risks": sorted(GEOPOLITICAL, key=lambda x: x["score"], reverse=True)[:3],
        "defense_cycle": {
            "current": "Expansion",
            "next_phase": "Peak Spending",
            "catalyst": "European rearmament + Indo-Pacific buildup + AI/drone modernization",
            "horizon_1y":  "Continued expansion; NDAA FY27 likely +6-8%",
            "horizon_3y":  "Peak spending; possible stabilization as EU programs mature",
            "horizon_5y":  "New cycle; AI/autonomous systems reshape procurement",
        },
    }


@router.get("/spending")
async def get_spending():
    total = sum(c["budget_b"] for c in COUNTRY_SPENDING)
    nato  = [c for c in COUNTRY_SPENDING if c["region"] == "NATO"]
    non_nato = [c for c in COUNTRY_SPENDING if c["region"] == "Non-NATO"]
    nato_total = sum(c["budget_b"] for c in nato)
    spending_history = [
        {"year": "2020", "global": 1981, "us": 738, "china": 245, "russia": 61,  "nato_ex_us": 285},
        {"year": "2021", "global": 2113, "us": 754, "china": 261, "russia": 65,  "nato_ex_us": 298},
        {"year": "2022", "global": 2240, "us": 782, "china": 270, "russia": 86,  "nato_ex_us": 338},
        {"year": "2023", "global": 2443, "us": 832, "china": 282, "russia": 94,  "nato_ex_us": 380},
        {"year": "2024", "global": 2559, "us": 858, "china": 291, "russia": 109, "nato_ex_us": 421},
        {"year": "2025E","global": 2720, "us": 895, "china": 305, "russia": 120, "nato_ex_us": 468},
        {"year": "2026E","global": 2900, "us": 930, "china": 322, "russia": 125, "nato_ex_us": 520},
    ]
    return {
        "countries": sorted(COUNTRY_SPENDING, key=lambda x: x["budget_b"], reverse=True),
        "total_tracked_b": total,
        "nato_total_b": nato_total,
        "history": spending_history,
        "fastest_growing": sorted(COUNTRY_SPENDING, key=lambda x: x["yoy_pct"], reverse=True)[:3],
    }


@router.get("/geopolitical")
async def get_geopolitical():
    overall = int(sum(r["score"] for r in GEOPOLITICAL) / len(GEOPOLITICAL))
    label = ("Active War" if overall >= 80 else "High Risk" if overall >= 65
             else "Elevated Risk" if overall >= 50 else "Moderate" if overall >= 35 else "Low Risk")
    return {
        "regions": sorted(GEOPOLITICAL, key=lambda x: x["score"], reverse=True),
        "composite_risk": overall,
        "composite_label": label,
        "escalation_model": [
            {"region": r["region"][:25], "prob": r["escalation_prob"], "de_prob": r["deescalation_prob"]}
            for r in sorted(GEOPOLITICAL, key=lambda x: x["escalation_prob"], reverse=True)
        ],
    }


@router.get("/procurement")
async def get_procurement():
    by_cat: dict = {}
    for p in PROCUREMENT_PROGRAMS:
        cat = p["cat"]
        if cat not in by_cat:
            by_cat[cat] = []
        by_cat[cat].append(p)

    total_backlog  = sum(p["backlog_b"] for p in PROCUREMENT_PROGRAMS)
    total_annual   = sum(p["annual_b"]  for p in PROCUREMENT_PROGRAMS)
    avg_score      = sum(p["score"]     for p in PROCUREMENT_PROGRAMS) / len(PROCUREMENT_PROGRAMS)

    return {
        "programs": sorted(PROCUREMENT_PROGRAMS, key=lambda x: x["score"], reverse=True),
        "by_category": by_cat,
        "total_backlog_b":  round(total_backlog, 1),
        "total_annual_b":   round(total_annual, 1),
        "avg_score":        round(avg_score, 0),
        "top_by_score":     sorted(PROCUREMENT_PROGRAMS, key=lambda x: x["score"], reverse=True)[:5],
    }


@router.get("/contractors")
async def get_contractors():
    loop = asyncio.get_event_loop()
    markets = await loop.run_in_executor(None, _fetch_defense_markets, DEFENSE_TICKERS)

    result = []
    fund_map = {s["ticker"]: s for s in DEFENSE_STOCKS}
    for tkr, mkt in markets.items():
        f = fund_map.get(tkr, {})
        if not f:
            continue
        rev_b = f.get("rev_b", 0)
        # Forecast model
        rev_g = f.get("rev_g", 0)
        result.append({
            "ticker":     tkr,
            "company":    f["company"],
            "segment":    f["segment"],
            "price":      mkt["price"],
            "chg_pct":    mkt["chg_pct"],
            "rsi":        mkt["rsi"],
            "macd":       mkt["macd"],
            "macd_signal":mkt["macd_signal"],
            "ema20":      mkt["ema20"],
            "ema50":      mkt["ema50"],
            "ema200":     mkt["ema200"],
            "adx":        mkt["adx"],
            "score":      mkt["score"],
            "signal":     mkt["signal"],
            # Fundamentals
            "rev_b":      f["rev_b"],
            "rev_g":      f["rev_g"],
            "backlog_b":  f["backlog_b"],
            "backlog_g":  f["backlog_g"],
            "op_margin":  f["op_margin"],
            "fcf_b":      f["fcf_b"],
            "eps_g":      f["eps_g"],
            "div_yield":  f["div_yield"],
            "fwd_pe":     f["fwd_pe"],
            "ev_ebitda":  f["ev_ebitda"],
            "gov_pct":    f["gov_pct"],
            "rating":     f["rating"],
            # Forecast
            "rev_1y":  round(rev_b * (1 + rev_g), 1),
            "rev_3y":  round(rev_b * (1 + rev_g) ** 3, 1),
            "rev_5y":  round(rev_b * (1 + rev_g * 0.8) ** 5, 1),
        })

    result.sort(key=lambda x: x["rev_b"], reverse=True)
    return {"contractors": result, "as_of": datetime.today().strftime("%Y-%m-%d")}


@router.get("/technology")
async def get_technology():
    total_funding = sum(t["funding_b"] for t in TECHNOLOGIES)
    avg_adoption  = sum(t["adoption"]  for t in TECHNOLOGIES) / len(TECHNOLOGIES)
    innovation_score = int(avg_adoption)
    drone_index = next((t["adoption"] for t in TECHNOLOGIES if "Drone" in t["name"]), 0)
    space_score = next((t["adoption"] for t in TECHNOLOGIES if "Space" in t["name"]), 0)
    return {
        "technologies":     sorted(TECHNOLOGIES, key=lambda x: x["funding_b"], reverse=True),
        "total_funding_b":  round(total_funding, 1),
        "innovation_score": innovation_score,
        "drone_index":      drone_index,
        "space_score":      space_score,
        "cyber_score":      next((t["adoption"] for t in TECHNOLOGIES if "Cyber" in t["name"]), 0),
        "ai_adoption":      next((t["adoption"] for t in TECHNOLOGIES if "AI" in t["name"]), 0),
    }


@router.get("/nato")
async def get_nato():
    meeting     = [m for m in NATO_MEMBERS if m["meets"]]
    not_meeting = [m for m in NATO_MEMBERS if not m["meets"]]
    total_nato  = sum(m["defense_b"] for m in NATO_MEMBERS)
    compliance_pct = len(meeting) / len(NATO_MEMBERS) * 100
    rearmament_pipeline = [m for m in not_meeting if m["yoy"] >= 5.0]
    allied_score = int(compliance_pct * 0.5 + sum(m["gdp_pct"] for m in meeting) / len(meeting) * 15)
    return {
        "members":              sorted(NATO_MEMBERS, key=lambda x: x["gdp_pct"], reverse=True),
        "meeting_target":       meeting,
        "below_target":         not_meeting,
        "compliance_pct":       round(compliance_pct, 0),
        "total_nato_spending_b": round(total_nato, 0),
        "allied_expansion_score": min(100, allied_score),
        "rearmament_pipeline":  rearmament_pipeline,
        "gdp_pct_avg":          round(sum(m["gdp_pct"] for m in NATO_MEMBERS) / len(NATO_MEMBERS), 2),
        "indo_pacific": [
            {"country": "Japan",       "budget_b": 51, "yoy": 26.3, "target_gdp_pct": 2.0, "key_buys": ["F-35A","Tomahawk","Patriot"]},
            {"country": "South Korea", "budget_b": 48, "yoy": 5.6,  "target_gdp_pct": 2.8, "key_buys": ["F-35A","HIMARS","SM-3"]},
            {"country": "Australia",   "budget_b": 30, "yoy": 6.8,  "target_gdp_pct": 2.0, "key_buys": ["F-35A","SSN (AUKUS)","HIMARS"]},
            {"country": "Taiwan",      "budget_b": 19, "yoy": 12.4, "target_gdp_pct": 2.5, "key_buys": ["F-16V","M1A2T","Harpoon"]},
        ],
    }


@router.get("/supply-chain")
async def get_supply_chain():
    resilience = int(100 - sum(s["risk"] for s in SUPPLY_CHAIN) / len(SUPPLY_CHAIN))
    critical   = [s for s in SUPPLY_CHAIN if s["constraint"] == "CRITICAL"]
    high_risk  = [s for s in SUPPLY_CHAIN if s["constraint"] == "HIGH"]
    return {
        "inputs":            sorted(SUPPLY_CHAIN, key=lambda x: x["risk"], reverse=True),
        "resilience_score":  resilience,
        "critical_count":    len(critical),
        "high_risk_count":   len(high_risk),
        "critical_inputs":   critical,
        "avg_domestic_pct":  round(sum(s["domestic_pct"] for s in SUPPLY_CHAIN) / len(SUPPLY_CHAIN), 0),
        "avg_stockpile_days":round(sum(s["stockpile_days"] for s in SUPPLY_CHAIN) / len(SUPPLY_CHAIN), 0),
    }


@router.get("/composite")
async def get_composite():
    loop = asyncio.get_event_loop()
    markets = await loop.run_in_executor(None, _fetch_defense_markets, DEFENSE_TICKERS)

    ds = _defense_score()
    spending_score  = min(100, int(sum(c["yoy_pct"] for c in COUNTRY_SPENDING) / len(COUNTRY_SPENDING) * 8))
    proc_score      = int(sum(p["score"] for p in PROCUREMENT_PROGRAMS) / len(PROCUREMENT_PROGRAMS))
    geo_score       = int(sum(r["score"] for r in GEOPOLITICAL) / len(GEOPOLITICAL))
    backlog_score   = min(100, int(sum(s["backlog_b"] / s["rev_b"] * 20
                                       for s in DEFENSE_STOCKS if s["rev_b"] > 0) / len(DEFENSE_STOCKS)))
    innovation_sc   = int(sum(t["adoption"] for t in TECHNOLOGIES) / len(TECHNOLOGIES))
    inst_sc         = 70
    tech_score      = int(sum(v["score"] for v in markets.values()) / len(markets)) if markets else 55

    weights = {
        "Defense Spending":   {"score": spending_score,  "weight": 0.25},
        "Procurement Growth": {"score": proc_score,      "weight": 0.20},
        "Geopolitical Risk":  {"score": geo_score,       "weight": 0.15},
        "Backlog Growth":     {"score": backlog_score,   "weight": 0.15},
        "Innovation Spending":{"score": innovation_sc,   "weight": 0.10},
        "Institutional Flows":{"score": inst_sc,         "weight": 0.05},
        "Technicals":         {"score": tech_score,      "weight": 0.10},
    }
    composite = round(sum(c["score"] * c["weight"] for c in weights.values()))
    label = ("Defense Supercycle" if composite >= 80 else "Bullish" if composite >= 60
             else "Neutral" if composite >= 40 else "Bearish" if composite >= 20 else "Extremely Bearish")

    # Trading signals
    fund_map = {s["ticker"]: s for s in DEFENSE_STOCKS}
    signals = []
    for tkr, mkt in markets.items():
        f = fund_map.get(tkr, {})
        if not f:
            continue
        fund_sc = min(100, int(
            min(100, f["rev_g"] * 400) * 0.25 +
            min(100, f["eps_g"] * 200) * 0.20 +
            min(100, f["backlog_g"] * 400) * 0.25 +
            min(100, f["op_margin"] * 600) * 0.15 +
            min(100, f["fcf_b"] / max(f["rev_b"], 0.1) * 500) * 0.15
        ))
        combined = int(fund_sc * 0.55 + mkt["score"] * 0.45)
        if combined >= 80:   sig, t_mult, s_mult = "STRONG BUY", 1.28, 0.91
        elif combined >= 65: sig, t_mult, s_mult = "BUY",        1.16, 0.93
        elif combined >= 45: sig, t_mult, s_mult = "HOLD",       1.08, 0.95
        else:                sig, t_mult, s_mult = "SELL",       0.92, 1.05

        signals.append({
            "ticker": tkr, "company": f["company"], "price": mkt["price"],
            "signal": sig, "score": combined, "fund_score": fund_sc, "tech_score": mkt["score"],
            "target": round(mkt["price"] * t_mult, 2), "stop": round(mkt["price"] * s_mult, 2),
            "exp_return": round((t_mult - 1) * 100, 1),
            "confidence": min(100, combined + 8),
            "backlog_b": f["backlog_b"], "fwd_pe": f["fwd_pe"],
        })
    signals.sort(key=lambda x: x["score"], reverse=True)

    return {
        "composite_score": composite,
        "label":           label,
        "defense_score":   ds["score"],
        "regime":          ds["regime"],
        "components":      weights,
        "signals":         signals,
        "alerts":          ALERTS,
        "best_longs": [
            {"ticker": "LMT",  "reason": "F-35 lifetime $2.1T, HIMARS surge, Patriot exports; largest missile backlog", "conviction": 94},
            {"ticker": "RTX",  "reason": "Patriot PAC-3 MSE at capacity, SM-3/SM-6 surge, Pratt GTF ramp",              "conviction": 93},
            {"ticker": "NOC",  "reason": "B-21 LRIP begins, USSF space monopoly, Sentinel ICBM $13.3B",                 "conviction": 89},
            {"ticker": "GD",   "reason": "Columbia SSBN $128B program, Virginia SSN 2/yr, Abrams tank exports",          "conviction": 87},
            {"ticker": "AVAV", "reason": "Switchblade/loitering munition demand; Ukraine+Indo-Pacific adoption",         "conviction": 88},
        ],
        "key_risks": [
            "Budget sequestration risk if US debt ceiling crisis",
            "China-Taiwan de-escalation would reduce procurement urgency",
            "Russia-Ukraine ceasefire could slow European rearmament",
            "GaN/semiconductor supply chain could bottleneck radar production",
            "Inflation eroding fixed-price contracts (especially HII shipbuilding)",
        ],
        "outlook": {
            "1y":  "Bullish — NDAA +6-8%, European rearmament in full swing, Japan doubling",
            "3y":  "Very Bullish — AI/drone revolution, hypersonics fielding, Indo-Pacific arms race",
            "5y":  "Neutral to Bullish — Stabilization risk post-Ukraine but new tech cycle begins",
        },
    }
