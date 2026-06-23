from __future__ import annotations

import asyncio
import time
from datetime import datetime, timedelta

import pandas as pd
import yfinance as yf
from fastapi import APIRouter

router = APIRouter()

# ── Curated Data ───────────────────────────────────────────────────────────────

LAUNCH_PROVIDERS = [
    {"name": "SpaceX",              "country": "US",  "flag": "🇺🇸", "launches_ytd": 52,  "launches_2024": 96,  "success_rate": 99.1, "payload_capacity_kg": 22800, "cost_per_kg": 2720,  "reusable": True,  "reuse_rate": 0.92, "backlog_est": 60,  "vehicles": ["Falcon 9","Falcon Heavy","Starship"],  "market_share": 0.62, "status": "Dominant"},
    {"name": "Rocket Lab",          "country": "US",  "flag": "🇺🇸", "launches_ytd": 12,  "launches_2024": 16,  "success_rate": 95.0, "payload_capacity_kg": 320,   "cost_per_kg": 28000, "reusable": True,  "reuse_rate": 0.25, "backlog_est": 30,  "vehicles": ["Electron","Neutron(dev)"],              "market_share": 0.07, "status": "Growing"},
    {"name": "ULA",                 "country": "US",  "flag": "🇺🇸", "launches_ytd": 5,   "launches_2024": 8,   "success_rate": 100.0,"payload_capacity_kg": 20520, "cost_per_kg": 14000, "reusable": False, "reuse_rate": 0.00, "backlog_est": 25,  "vehicles": ["Atlas V","Vulcan Centaur"],             "market_share": 0.05, "status": "Transitioning"},
    {"name": "Blue Origin",         "country": "US",  "flag": "🇺🇸", "launches_ytd": 4,   "launches_2024": 6,   "success_rate": 83.3, "payload_capacity_kg": 45000, "cost_per_kg": 4000,  "reusable": True,  "reuse_rate": 0.70, "backlog_est": 15,  "vehicles": ["New Shepard","New Glenn"],              "market_share": 0.04, "status": "Emerging"},
    {"name": "Arianespace / ArianeGroup","country":"EU","flag":"🇪🇺","launches_ytd": 3,  "launches_2024": 4,   "success_rate": 97.8, "payload_capacity_kg": 10500, "cost_per_kg": 10000, "reusable": False, "reuse_rate": 0.00, "backlog_est": 18,  "vehicles": ["Ariane 6","Vega-C"],                   "market_share": 0.04, "status": "Rebuilding"},
    {"name": "ISRO / NewSpace India","country": "IN", "flag": "🇮🇳", "launches_ytd": 5,   "launches_2024": 7,   "success_rate": 92.0, "payload_capacity_kg": 8000,  "cost_per_kg": 5000,  "reusable": False, "reuse_rate": 0.00, "backlog_est": 20,  "vehicles": ["GSLV Mk3","PSLV","LVM3"],              "market_share": 0.04, "status": "Expanding"},
    {"name": "Firefly Aerospace",   "country": "US",  "flag": "🇺🇸", "launches_ytd": 2,   "launches_2024": 4,   "success_rate": 75.0, "payload_capacity_kg": 1030,  "cost_per_kg": 15000, "reusable": False, "reuse_rate": 0.00, "backlog_est": 10,  "vehicles": ["Alpha","MLM"],                         "market_share": 0.02, "status": "Establishing"},
    {"name": "Mitsubishi / JAXA",   "country": "JP",  "flag": "🇯🇵", "launches_ytd": 2,   "launches_2024": 3,   "success_rate": 88.9, "payload_capacity_kg": 6500,  "cost_per_kg": 9000,  "reusable": False, "reuse_rate": 0.00, "backlog_est": 8,   "vehicles": ["H3","H-IIA"],                          "market_share": 0.02, "status": "Recovering"},
    {"name": "CASC (China)",        "country": "CN",  "flag": "🇨🇳", "launches_ytd": 22,  "launches_2024": 48,  "success_rate": 97.9, "payload_capacity_kg": 23000, "cost_per_kg": 3500,  "reusable": False, "reuse_rate": 0.00, "backlog_est": 40,  "vehicles": ["Long March 5","Long March 7","CZ-6A"],  "market_share": 0.14, "status": "Expanding"},
]

SATELLITE_CONSTELLATIONS = [
    # Broadband
    {"name": "Starlink",    "operator": "SpaceX",     "category": "Broadband",       "sats_operational": 6750, "sats_planned": 42000, "orbit_km": 550,  "subscribers_m": 4.2,  "rev_ann_b": 8.4,  "coverage": "Global",    "status": "Operational",  "growth": "Hypergrowth"},
    {"name": "Amazon Kuiper","operator": "Amazon",    "category": "Broadband",       "sats_operational": 12,   "sats_planned": 3236,  "orbit_km": 630,  "subscribers_m": 0.01, "rev_ann_b": 0.1,  "coverage": "Partial",   "status": "Beta",         "growth": "Pre-Revenue"},
    {"name": "OneWeb",      "operator": "Eutelsat",   "category": "Broadband",       "sats_operational": 634,  "sats_planned": 648,   "orbit_km": 1200, "subscribers_m": 0.15, "rev_ann_b": 0.45, "coverage": "Near-Global","status": "Operational",  "growth": "Early"},
    {"name": "SES O3b mPOWER","operator":"SES",       "category": "Broadband",       "sats_operational": 20,   "sats_planned": 36,    "orbit_km": 8000, "subscribers_m": 0.8,  "rev_ann_b": 2.2,  "coverage": "Mid-lat",   "status": "Operational",  "growth": "Stable"},
    # Earth Observation
    {"name": "Planet SkySat+Dove","operator":"Planet Labs","category": "Earth Obs","sats_operational": 220,  "sats_planned": 500,   "orbit_km": 475,  "subscribers_m": 0.0,  "rev_ann_b": 0.22, "coverage": "Daily Global","status": "Operational", "growth": "Growing"},
    {"name": "BlackSky",    "operator": "BlackSky",   "category": "Earth Obs",       "sats_operational": 16,   "sats_planned": 48,    "orbit_km": 430,  "subscribers_m": 0.0,  "rev_ann_b": 0.08, "coverage": "On-demand", "status": "Operational",  "growth": "Growing"},
    {"name": "Maxar WorldView","operator":"Maxar/Advent","category":"Earth Obs",     "sats_operational": 5,    "sats_planned": 10,    "orbit_km": 617,  "subscribers_m": 0.0,  "rev_ann_b": 0.85, "coverage": "Global",    "status": "Operational",  "growth": "Stable"},
    # Navigation
    {"name": "GPS (US)",    "operator": "USSF",       "category": "Navigation",      "sats_operational": 31,   "sats_planned": 36,    "orbit_km": 20200,"subscribers_m": 6000, "rev_ann_b": 0.0,  "coverage": "Global",    "status": "Operational",  "growth": "Modernizing"},
    {"name": "Galileo (EU)","operator": "ESA/EU",     "category": "Navigation",      "sats_operational": 28,   "sats_planned": 30,    "orbit_km": 23222,"subscribers_m": 4000, "rev_ann_b": 0.0,  "coverage": "Global",    "status": "Operational",  "growth": "Stable"},
    {"name": "BeiDou (CN)", "operator": "CNSA",       "category": "Navigation",      "sats_operational": 47,   "sats_planned": 47,    "orbit_km": 21500,"subscribers_m": 1000, "rev_ann_b": 0.0,  "coverage": "Global",    "status": "Complete",     "growth": "Stable"},
]

DEFENSE_SPACE = [
    {"program": "USSF Budget",               "country": "US",  "budget_b": 30.0,  "yoy_pct": 15.0, "category": "Overall",      "priority": "CRITICAL", "status": "Accelerating"},
    {"program": "GPS III / OCX Ground",      "country": "US",  "budget_b": 1.8,   "yoy_pct": 8.0,  "category": "Navigation",   "priority": "HIGH",     "status": "Production"},
    {"program": "SBIRS / Next-Gen OPIR",     "country": "US",  "budget_b": 2.4,   "yoy_pct": 12.0, "category": "Missile Warn", "priority": "CRITICAL", "status": "Expanding"},
    {"program": "SATCOM (WGS / AEHF / MILSATCOM)","country":"US","budget_b": 3.2, "yoy_pct": 6.0,  "category": "Communications","priority": "HIGH",    "status": "Operational"},
    {"program": "Space Domain Awareness (SDA)","country":"US", "budget_b": 1.6,   "yoy_pct": 22.0, "category": "Surveillance", "priority": "CRITICAL", "status": "Surge"},
    {"program": "Starshield (SpaceX/DoD)",   "country": "US",  "budget_b": 1.8,   "yoy_pct": 45.0, "category": "Comm/Intel",   "priority": "CRITICAL", "status": "Expanding"},
    {"program": "China Yaogan/Tianlian",     "country": "CN",  "budget_b": 5.0,   "yoy_pct": 18.0, "category": "Recon/Comm",   "priority": "HIGH",     "status": "Expanding"},
    {"program": "EU GOVSATCOM / IRIS²",      "country": "EU",  "budget_b": 0.6,   "yoy_pct": 40.0, "category": "Comm",         "priority": "HIGH",     "status": "Development"},
    {"program": "Japan QZSS Expansion",      "country": "JP",  "budget_b": 0.8,   "yoy_pct": 25.0, "category": "Navigation",   "priority": "MEDIUM",   "status": "Expanding"},
    {"program": "India IRNSS/GSAT-20",       "country": "IN",  "budget_b": 0.5,   "yoy_pct": 20.0, "category": "Navigation",   "priority": "MEDIUM",   "status": "Growing"},
]

GOVT_AGENCIES = [
    {"name": "NASA",   "country": "US",  "flag": "🇺🇸", "budget_b": 25.4,  "yoy_pct": 3.2,  "headcount": 18000, "key_programs": ["Artemis","SLS/Orion","Gateway","Mars 2030","Commercial Crew"],           "focus": "Exploration + Science",   "commercial_pct": 0.45},
    {"name": "USSF",   "country": "US",  "flag": "🇺🇸", "budget_b": 30.0,  "yoy_pct": 15.0, "headcount": 15000, "key_programs": ["GPS III","SBIRS","SDA Tranche 2","Starshield","AEHF"],                  "focus": "Military Space",          "commercial_pct": 0.60},
    {"name": "ESA",    "country": "EU",  "flag": "🇪🇺", "budget_b": 10.0,  "yoy_pct": 18.0, "headcount": 2400,  "key_programs": ["Ariane 6","Galileo","Copernicus","IRIS²","ExoMars"],                    "focus": "Science + Applications",  "commercial_pct": 0.30},
    {"name": "CNSA",   "country": "CN",  "flag": "🇨🇳", "budget_b": 14.0,  "yoy_pct": 12.0, "headcount": 20000, "key_programs": ["CSS Tiangong","Lunar Chang'e 7","Mars Tianwen-2","BeiDou III"],         "focus": "Comprehensive",           "commercial_pct": 0.15},
    {"name": "ISRO",   "country": "IN",  "flag": "🇮🇳", "budget_b": 2.4,   "yoy_pct": 8.5,  "headcount": 17000, "key_programs": ["Chandrayaan-4","Gaganyaan","LVM3","OneWeb launches"],                  "focus": "Launch + Exploration",    "commercial_pct": 0.35},
    {"name": "JAXA",   "country": "JP",  "flag": "🇯🇵", "budget_b": 2.8,   "yoy_pct": 11.0, "headcount": 1700,  "key_programs": ["H3","SLIM Lunar","MMX Phobos","QZSS","HTV-X"],                        "focus": "Technology + Exploration","commercial_pct": 0.25},
    {"name": "Roscosmos","country": "RU","flag": "🇷🇺", "budget_b": 3.5,   "yoy_pct": -8.0, "headcount": 170000,"key_programs": ["Soyuz (declining)","GLONASS","Luna-25 (failed)","Angara"],              "focus": "Legacy Operations",       "commercial_pct": 0.05},
    {"name": "UKSA",   "country": "GB",  "flag": "🇬🇧", "budget_b": 0.75,  "yoy_pct": 22.0, "headcount": 600,   "key_programs": ["OneWeb","Spaceport Cornwall","UKSA Science"],                         "focus": "Commercial + Science",    "commercial_pct": 0.55},
]

VC_FUNDING = [
    {"company": "SpaceX",          "category": "Launch",           "stage": "Growth",   "val_b": 350.0, "funding_b": 35.0,  "investors": ["Google","Andreessen","Founders Fund"],      "status": "Pre-IPO"},
    {"company": "Starlink (SpaceX)","category": "Broadband",       "stage": "Revenue",  "val_b": 120.0, "funding_b": 8.0,   "investors": ["SpaceX Internal"],                          "status": "IPO Candidate"},
    {"company": "Blue Origin",     "category": "Launch",           "stage": "Growth",   "val_b": 15.0,  "funding_b": 14.0,  "investors": ["Jeff Bezos (private)"],                     "status": "Private"},
    {"company": "Vast",            "category": "Space Stations",   "stage": "Series B", "val_b": 5.0,   "funding_b": 1.1,   "investors": ["Jed McCaleb"],                              "status": "Funded"},
    {"company": "Axiom Space",     "category": "Space Stations",   "stage": "Series C", "val_b": 4.0,   "funding_b": 0.5,   "investors": ["C5 Capital","Voyager","Saudi Aramco"],      "status": "Growing"},
    {"company": "Relativity Space","category": "Launch",           "stage": "Series E", "val_b": 4.2,   "funding_b": 1.3,   "investors": ["Tiger Global","Fidelity","Baillie Gifford"],"status": "Pivoting"},
    {"company": "K2 Space",        "category": "Satellites",       "stage": "Series A", "val_b": 0.85,  "funding_b": 0.085, "investors": ["a16z","General Catalyst"],                  "status": "Building"},
    {"company": "Apex Space",      "category": "Sat Manufacturing","stage": "Series A", "val_b": 0.75,  "funding_b": 0.095, "investors": ["a16z","8VC","Shield Capital"],               "status": "Manufacturing"},
    {"company": "HEO Robotics",    "category": "Space Situational","stage": "Series A", "val_b": 0.22,  "funding_b": 0.037, "investors": ["In-Q-Tel","Horizons Ventures"],             "status": "Operational"},
    {"company": "Orbit Fab",       "category": "In-Orbit Services","stage": "Series A", "val_b": 0.35,  "funding_b": 0.05,  "investors": ["Lockheed","RTX","SNC"],                     "status": "Early Revenue"},
    {"company": "Slingshot Aerospace","category":"Space Ops/AI",   "stage": "Series B", "val_b": 0.55,  "funding_b": 0.08,  "investors": ["Shield Capital","USAF AFWERX"],             "status": "Growing"},
    {"company": "True Anomaly",    "category": "Defense Space",    "stage": "Series B", "val_b": 0.95,  "funding_b": 0.15,  "investors": ["a16z","8VC","Shield Capital"],               "status": "DoD Funded"},
    {"company": "Stoke Space",     "category": "Launch (Fully Reusable)","stage":"Series A","val_b": 0.90,"funding_b": 0.106,"investors": ["Eclipse Ventures","Addition"],            "status": "Dev"},
    {"company": "Ursa Space",      "category": "Earth Obs/Analytics","stage":"Series B","val_b": 0.45,  "funding_b": 0.057, "investors": ["Airbus Ventures","National Grid"],          "status": "Revenue"},
]

SPACE_ECONOMY_SEGMENTS = [
    {"segment": "Satellite Services",     "rev_2024_b": 118.0, "rev_2023_b": 111.0, "cagr_5y": 0.08, "share_pct": 41.5, "sub_segments": ["Broadband","DirectTV","GPS Services","Weather"]},
    {"segment": "Launch Services",        "rev_2024_b": 12.5,  "rev_2023_b": 10.8,  "cagr_5y": 0.18, "share_pct": 4.4,  "sub_segments": ["Commercial","Government","Rideshare","Heavy Lift"]},
    {"segment": "Ground Equipment",       "rev_2024_b": 47.0,  "rev_2023_b": 44.5,  "cagr_5y": 0.06, "share_pct": 16.5, "sub_segments": ["Consumer Devices","Network Infra","Terminals"]},
    {"segment": "Satellite Manufacturing","rev_2024_b": 19.5,  "rev_2023_b": 17.8,  "cagr_5y": 0.12, "share_pct": 6.8,  "sub_segments": ["Commercial Sats","Government Sats","SmallSats"]},
    {"segment": "Defense Space",          "rev_2024_b": 52.0,  "rev_2023_b": 46.0,  "cagr_5y": 0.14, "share_pct": 18.3, "sub_segments": ["USSF","Intel Sats","GPS Military","SBIRS"]},
    {"segment": "Space Tourism",          "rev_2024_b": 0.85,  "rev_2023_b": 0.62,  "cagr_5y": 0.32, "share_pct": 0.3,  "sub_segments": ["Suborbital","Orbital","LEO Stations"]},
    {"segment": "In-Space Services",      "rev_2024_b": 1.8,   "rev_2023_b": 1.1,   "cagr_5y": 0.45, "share_pct": 0.6,  "sub_segments": ["Refueling","Servicing","Debris Removal"]},
    {"segment": "Earth Observation",      "rev_2024_b": 5.2,   "rev_2023_b": 4.4,   "cagr_5y": 0.22, "share_pct": 1.8,  "sub_segments": ["Commercial EO","Defense EO","Analytics"]},
    {"segment": "Deep Space / R&D",       "rev_2024_b": 27.0,  "rev_2023_b": 25.5,  "cagr_5y": 0.05, "share_pct": 9.5,  "sub_segments": ["NASA Science","ESA Science","Government R&D"]},
    {"segment": "Lunar Economy",          "rev_2024_b": 1.0,   "rev_2023_b": 0.4,   "cagr_5y": 0.80, "share_pct": 0.4,  "sub_segments": ["Artemis","CLPS","Lunar Landers"]},
]

SPACE_TOURISM = [
    {"operator": "Blue Origin",       "vehicle": "New Shepard",    "type": "Suborbital", "ticket_usd": 450000,  "flights_total": 7,   "passengers_total": 31, "status": "Active",     "revenue_m": 14.0},
    {"operator": "Virgin Galactic",   "vehicle": "VSS Unity",      "type": "Suborbital", "ticket_usd": 450000,  "flights_total": 6,   "passengers_total": 38, "status": "Suspended",  "revenue_m": 4.5},
    {"operator": "SpaceX",            "vehicle": "Crew Dragon",    "type": "Orbital",    "ticket_usd": 55000000,"flights_total": 3,   "passengers_total": 12, "status": "Active",     "revenue_m": 420.0},
    {"operator": "Axiom Space",       "vehicle": "ISS (via SpaceX)","type": "Orbital",   "ticket_usd": 55000000,"flights_total": 4,   "passengers_total": 12, "status": "Active",     "revenue_m": 330.0},
    {"operator": "Vast / SpaceX",     "vehicle": "Haven-1 Station","type": "Orbital",    "ticket_usd": 40000000,"flights_total": 0,   "passengers_total": 0,  "status": "2026 Target","revenue_m": 0.0},
]

LUNAR_PROGRAMS = [
    {"mission": "Artemis III",         "agency": "NASA",      "year": 2026, "budget_b": 8.4,  "status": "Development",  "objective": "Human lunar landing south pole", "commercial_partners": ["SpaceX HLS","Axiom Suits"]},
    {"mission": "CLPS - IM-2/3",       "agency": "NASA",      "year": 2025, "budget_b": 0.7,  "status": "Pre-launch",   "objective": "Polar ice confirmation",         "commercial_partners": ["Intuitive Machines"]},
    {"mission": "Chang'e 7",           "agency": "CNSA",      "year": 2026, "budget_b": 1.2,  "status": "Development",  "objective": "South pole resource survey",     "commercial_partners": []},
    {"mission": "Lunar Gateway Phase 1","agency":"NASA/ESA",   "year": 2027, "budget_b": 5.0,  "status": "Development",  "objective": "Lunar orbit station PPE+HALO",  "commercial_partners": ["Maxar","Northrop Grumman"]},
    {"mission": "Luna-28 (Russia)",     "agency": "Roscosmos", "year": 2028, "budget_b": 0.4,  "status": "Delayed",      "objective": "Lunar soil return",              "commercial_partners": []},
    {"mission": "JAXA SLIM-2",         "agency": "JAXA",      "year": 2026, "budget_b": 0.15, "status": "Planning",     "objective": "High-precision lunar landing",   "commercial_partners": ["ispace"]},
]

SUPPLY_CHAIN_SPACE = [
    {"input": "Solar Arrays (High-Eff GaAs)", "cat": "Power",        "criticality": 92, "domestic_pct": 35, "constraint": "HIGH",     "risk": 68, "suppliers": ["Spectrolab (Boeing)","Azur Space","SolAero (Rocket Lab)"]},
    {"input": "RF Components / Phased Arrays", "cat": "Communications","criticality": 90, "domestic_pct": 40, "constraint": "HIGH",     "risk": 65, "suppliers": ["L3Harris","Raytheon","Ball Aerospace"]},
    {"input": "Xenon Propellant (Ion Thrusters)","cat": "Propulsion", "criticality": 85, "domestic_pct": 25, "constraint": "HIGH",     "risk": 78, "suppliers": ["Air Liquide","Messer","Linde"]},
    {"input": "Carbon Composites (Fairing/Structure)","cat":"Structures","criticality": 80,"domestic_pct": 55, "constraint": "MODERATE", "risk": 42, "suppliers": ["Hexcel","Toray","Albany Composites"]},
    {"input": "Advanced Semiconductors (Rad-Hard)","cat":"Electronics","criticality": 95,"domestic_pct": 60, "constraint": "CRITICAL", "risk": 55, "suppliers": ["Microchip Tech","Renesas","BAE Sys Electronics"]},
    {"input": "LOX / LH2 Propellant",          "cat": "Propulsion",  "criticality": 75, "domestic_pct": 90, "constraint": "LOW",      "risk": 18, "suppliers": ["Air Products","Linde","Chart Industries"]},
    {"input": "Avionics / Star Trackers",       "cat": "Navigation",  "criticality": 88, "domestic_pct": 70, "constraint": "MODERATE", "risk": 32, "suppliers": ["Sodern","Berlin Space","L3Harris"]},
]

SPACE_ALERTS = [
    {"id": "S1", "priority": "CRITICAL",  "title": "Starlink Subscribers Hit 4.2M — $8B+ Annual Run Rate",          "detail": "SpaceX Starlink accelerating globally; maritime/aviation verticals driving 40% of new revenue. IPO signals increasing.","tickers": ["IRDM","VSAT","GSAT"]},
    {"id": "S2", "priority": "CRITICAL",  "title": "USSF Budget +15% YoY — Space Domain Awareness Surging",         "detail": "Space Force FY2026 request $30B; SDA Tranche 2 proliferated LEO constellation accelerating; True Anomaly/Rocket Lab beneficiaries.","tickers": ["RKLB","NOC","LMT","RTX"]},
    {"id": "S3", "priority": "HIGH",      "title": "Artemis III Slips to 2026 — Commercial Space Beneficiaries Rise","detail": "NASA delay increases commercial contracts. SpaceX HLS, Axiom EVA suits, Intuitive Machines CLPS all see contract expansions.","tickers": ["RKLB","PL"]},
    {"id": "S4", "priority": "HIGH",      "title": "Rocket Lab Neutron Development on Track — Revenue Inflection 2027","detail": "RKLB on path to triple revenue with Neutron medium launch vehicle. Backlog growing at 45% YoY. Space Systems segment profitable.","tickers": ["RKLB"]},
    {"id": "S5", "priority": "HIGH",      "title": "Planet Labs Winning Government EO Contracts — DoD NGA Pipeline","detail": "PL securing multi-year DoD/NGA contracts for daily-revisit Earth observation. Subscription revenue mix improves margins.","tickers": ["PL"]},
    {"id": "S6", "priority": "MEDIUM",    "title": "Xenon Supply Tight — Ion Thruster Bottleneck for LEO Constellations","detail": "Kuiper + Starlink v2 Gen2 both ion-propelled; xenon supply tightening. Air Liquide / Messer key beneficiaries.","tickers": ["RKLB","PL"]},
    {"id": "S7", "priority": "MEDIUM",    "title": "EU Space Sovereignty Push — IRIS² Constellation €6B Program",    "detail": "EU funding €6B sovereign broadband constellation to compete with Starlink; Eutelsat/Arianespace key beneficiaries.","tickers": ["RKLB"]},
]

SPACE_STOCK_FUNDAMENTALS = [
    {"ticker": "RKLB",  "name": "Rocket Lab USA",          "segment": "Launch + Space Systems",      "rev_b": 0.60, "rev_g": 0.75, "backlog_b": 1.1,  "op_margin": -0.25, "is_profitable": False, "gov_pct": 0.72, "rating": "BUY"},
    {"ticker": "PL",    "name": "Planet Labs PBC",          "segment": "Earth Observation",           "rev_b": 0.24, "rev_g": 0.18, "backlog_b": 0.35, "op_margin": -0.40, "is_profitable": False, "gov_pct": 0.55, "rating": "HOLD"},
    {"ticker": "BKSY",  "name": "BlackSky Technology",     "segment": "EO Analytics / Defense",      "rev_b": 0.10, "rev_g": 0.22, "backlog_b": 0.12, "op_margin": -0.55, "is_profitable": False, "gov_pct": 0.80, "rating": "HOLD"},
    {"ticker": "IRDM",  "name": "Iridium Communications",  "segment": "Satellite IoT / L-Band",      "rev_b": 0.86, "rev_g": 0.07, "backlog_b": 3.2,  "op_margin": 0.25,  "is_profitable": True,  "gov_pct": 0.30, "rating": "BUY"},
    {"ticker": "VSAT",  "name": "Viasat",                  "segment": "Satellite Broadband",         "rev_b": 4.15, "rev_g": 0.12, "backlog_b": 5.8,  "op_margin": 0.06,  "is_profitable": False, "gov_pct": 0.42, "rating": "HOLD"},
    {"ticker": "GSAT",  "name": "Globalstar",              "segment": "Mobile Satellite Services",   "rev_b": 0.25, "rev_g": 0.18, "backlog_b": 0.62, "op_margin": -0.05, "is_profitable": False, "gov_pct": 0.05, "rating": "HOLD"},
    {"ticker": "RDW",   "name": "Redwire Space",           "segment": "Space Infrastructure / Power","rev_b": 0.34, "rev_g": 0.28, "backlog_b": 0.55, "op_margin": -0.18, "is_profitable": False, "gov_pct": 0.88, "rating": "BUY"},
    {"ticker": "SATL",  "name": "Satellogic",              "segment": "EO + Analytics",              "rev_b": 0.055,"rev_g": 0.35, "backlog_b": 0.05, "op_margin": -0.80, "is_profitable": False, "gov_pct": 0.60, "rating": "SPECULATIVE"},
    # Defense with space exposure
    {"ticker": "NOC",   "name": "Northrop Grumman",        "segment": "Space / B-21 / Cyber",        "rev_b": 41.0, "rev_g": 0.04, "backlog_b": 85.0, "op_margin": 0.116, "is_profitable": True,  "gov_pct": 0.93, "rating": "BUY"},
    {"ticker": "LMT",   "name": "Lockheed Martin",         "segment": "Space / Aeronautics / Missiles","rev_b": 67.6,"rev_g": 0.05, "backlog_b": 159.9,"op_margin": 0.113, "is_profitable": True,  "gov_pct": 0.94, "rating": "BUY"},
    {"ticker": "BA",    "name": "Boeing",                  "segment": "Space / Commercial Aviation", "rev_b": 78.0, "rev_g": 0.08, "backlog_b": 520.0,"op_margin": -0.02, "is_profitable": False, "gov_pct": 0.50, "rating": "HOLD"},
    {"ticker": "RTX",   "name": "RTX Corporation",         "segment": "Missiles / Space / Engines",  "rev_b": 78.8, "rev_g": 0.10, "backlog_b": 220.0,"op_margin": 0.105, "is_profitable": True,  "gov_pct": 0.54, "rating": "BUY"},
]

SPACE_TICKERS = ["RKLB", "PL", "BKSY", "IRDM", "VSAT", "GSAT", "RDW", "SATL", "NOC", "LMT", "BA", "RTX"]

SPENDING_HISTORY = [
    {"year": "2019", "global_b": 366, "commercial_b": 281, "govt_b": 85, "launch_b": 7.6, "sat_services_b": 122},
    {"year": "2020", "global_b": 385, "commercial_b": 298, "govt_b": 87, "launch_b": 8.1, "sat_services_b": 128},
    {"year": "2021", "global_b": 386, "commercial_b": 296, "govt_b": 90, "launch_b": 9.0, "sat_services_b": 113},
    {"year": "2022", "global_b": 424, "commercial_b": 326, "govt_b": 98, "launch_b": 9.8, "sat_services_b": 117},
    {"year": "2023", "global_b": 466, "commercial_b": 357, "govt_b": 109,"launch_b": 10.8,"sat_services_b": 111},
    {"year": "2024E","global_b": 570, "commercial_b": 440, "govt_b": 130,"launch_b": 12.5,"sat_services_b": 118},
    {"year": "2025E","global_b": 680, "commercial_b": 525, "govt_b": 155,"launch_b": 15.0,"sat_services_b": 128},
    {"year": "2026E","global_b": 810, "commercial_b": 625, "govt_b": 185,"launch_b": 18.0,"sat_services_b": 140},
]

# ── Market Data Cache ──────────────────────────────────────────────────────────

_mkt_cache: dict = {}
_CACHE_TTL = 300


def _fetch_space_markets(tickers: list[str]) -> dict:
    now = time.time()
    key = ",".join(sorted(tickers))
    if key in _mkt_cache and now - _mkt_cache[key]["ts"] < _CACHE_TTL:
        return _mkt_cache[key]["data"]

    end   = datetime.today().strftime("%Y-%m-%d")
    start = (datetime.today() - timedelta(days=252)).strftime("%Y-%m-%d")
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

                delta = close.diff()
                gain  = delta.clip(lower=0).rolling(14).mean()
                loss  = (-delta.clip(upper=0)).rolling(14).mean()
                rsi   = float((100 - 100 / (1 + gain / loss.replace(0, 1e-10))).iloc[-1])

                ema12 = close.ewm(span=12).mean()
                ema26 = close.ewm(span=26).mean()
                macd  = ema12 - ema26
                sig   = macd.ewm(span=9).mean()

                ema20  = float(close.ewm(span=20).mean().iloc[-1])
                ema50  = float(close.ewm(span=50).mean().iloc[-1])  if len(close) >= 50  else None
                ema200 = float(close.ewm(span=200).mean().iloc[-1]) if len(close) >= 200 else None

                adx = None
                try:
                    dm_p = high.diff().clip(lower=0); dm_m = (-low.diff()).clip(lower=0)
                    mask = dm_p > dm_m; dm_p = dm_p.where(mask, 0); dm_m = dm_m.where(~mask, 0)
                    tr = pd.concat([high-low,(high-close.shift()).abs(),(low-close.shift()).abs()],axis=1).max(axis=1)
                    atr = tr.rolling(14).mean()
                    di_p = 100*(dm_p.rolling(14).mean()/atr.replace(0,1e-10))
                    di_m = 100*(dm_m.rolling(14).mean()/atr.replace(0,1e-10))
                    dx = 100*(di_p-di_m).abs()/(di_p+di_m+1e-10)
                    adx = float(dx.rolling(14).mean().iloc[-1])
                except Exception:
                    pass

                price = float(close.iloc[-1])
                prev  = float(close.iloc[-2]) if len(close) >= 2 else price
                chg   = (price - prev) / prev * 100

                ytd_start = close[close.index >= f"{datetime.today().year}-01-01"]
                chg_ytd   = float((price / ytd_start.iloc[0] - 1) * 100) if len(ytd_start) > 1 else 0.0

                score = 50
                if rsi > 50:  score += 7
                if rsi > 60:  score += 5
                if float(macd.iloc[-1]) > float(sig.iloc[-1]): score += 13
                if price > ema20:  score += 8
                if ema50  and price > ema50:  score += 8
                if ema200 and price > ema200: score += 9
                if adx and adx > 25: score += 5
                score = min(100, max(0, score))
                signal = ("STRONG BUY" if score >= 80 else "BUY" if score >= 65
                          else "HOLD" if score >= 45 else "SELL" if score >= 30 else "STRONG SELL")

                result[tkr] = {
                    "price": round(price, 2), "chg_pct": round(chg, 2), "chg_ytd": round(chg_ytd, 1),
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


# ── Score Computation ──────────────────────────────────────────────────────────

def _compute_space_score() -> dict:
    # Launch activity score
    total_launches = sum(p["launches_2024"] for p in LAUNCH_PROVIDERS)
    launch_score   = min(100, int(total_launches * 0.6))

    # Satellite growth score
    total_sats = sum(c["sats_operational"] for c in SATELLITE_CONSTELLATIONS)
    sat_score  = min(100, int(total_sats / 120))

    # Defense space spending
    defense_b = sum(p["budget_b"] for p in DEFENSE_SPACE[:6])  # US programs
    defense_score = min(100, int(defense_b / 0.45))

    # Govt spending growth
    total_govt_b = sum(a["budget_b"] for a in GOVT_AGENCIES)
    avg_yoy = sum(a["yoy_pct"] for a in GOVT_AGENCIES) / len(GOVT_AGENCIES)
    govt_score = min(100, int(avg_yoy * 5 + 20))

    # VC activity
    total_vc = sum(v["funding_b"] for v in VC_FUNDING)
    vc_score = min(100, int(total_vc / 5))

    # Economy growth
    latest = SPENDING_HISTORY[-1]
    prev   = SPENDING_HISTORY[-2]
    economy_growth_pct = (latest["global_b"] - prev["global_b"]) / prev["global_b"] * 100
    economy_score = min(100, int(economy_growth_pct * 4))

    weights = {
        "Launch Activity":    {"score": launch_score,   "weight": 0.20},
        "Satellite Growth":   {"score": sat_score,      "weight": 0.20},
        "Defense Spending":   {"score": defense_score,  "weight": 0.15},
        "Infrastructure":     {"score": 72,             "weight": 0.15},
        "Government Funding": {"score": govt_score,     "weight": 0.10},
        "Venture Capital":    {"score": vc_score,       "weight": 0.10},
        "Institutional Flows":{"score": 68,             "weight": 0.10},
    }
    composite = round(sum(c["score"] * c["weight"] for c in weights.values()))

    if composite >= 80:   label = "Space Supercycle"
    elif composite >= 60: label = "Bullish"
    elif composite >= 40: label = "Neutral"
    elif composite >= 20: label = "Bearish"
    else:                 label = "Extremely Bearish"

    total_global_b = latest["global_b"]
    if total_global_b >= 700:     regime = "Space Supercycle"
    elif total_global_b >= 500:   regime = "Commercial Expansion"
    elif total_global_b >= 400:   regime = "Satellite Boom"
    elif total_global_b >= 300:   regime = "Defense Expansion"
    else:                          regime = "Early Development"

    return {
        "composite": composite, "label": label, "regime": regime,
        "components": weights,
        "sub_scores": {
            "launch":   launch_score,   "satellite": sat_score,
            "defense":  defense_score,  "govt":      govt_score,
            "vc":       vc_score,       "economy":   economy_score,
        },
        "economy_value_b": total_global_b,
        "economy_growth_pct": round(economy_growth_pct, 1),
        "total_govt_b": round(total_govt_b, 1),
        "total_vc_b": round(total_vc, 1),
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/overview")
async def get_overview():
    sc = _compute_space_score()
    total_launches_ytd = sum(p["launches_ytd"] for p in LAUNCH_PROVIDERS)
    total_sats = sum(c["sats_operational"] for c in SATELLITE_CONSTELLATIONS)
    starlink = next(c for c in SATELLITE_CONSTELLATIONS if c["name"] == "Starlink")
    total_revenue_b = sum(s["rev_2024_b"] for s in SPACE_ECONOMY_SEGMENTS)

    return {
        "space_score": sc["composite"],
        "label": sc["label"],
        "regime": sc["regime"],
        "kpis": {
            "economy_value_b":       sc["economy_value_b"],
            "economy_growth_pct":    sc["economy_growth_pct"],
            "total_launches_ytd":    total_launches_ytd,
            "total_sats_operational":total_sats,
            "starlink_subscribers_m":starlink["subscribers_m"],
            "defense_space_b":       sum(p["budget_b"] for p in DEFENSE_SPACE[:6]),
            "commercial_rev_b":      total_revenue_b,
            "govt_spending_b":       sc["total_govt_b"],
            "vc_invested_b":         sc["total_vc_b"],
            "providers_tracked":     len(LAUNCH_PROVIDERS),
        },
        "components": sc["components"],
        "sub_scores": sc["sub_scores"],
        "alerts": SPACE_ALERTS[:4],
        "space_cycle": {
            "current": sc["regime"],
            "next_phase": "Space Supercycle",
            "catalysts": ["Starlink global penetration","Artemis lunar economy","USSF constellation surge","SpaceX Starship reuse"],
            "horizon_1y": "Commercial broadband + defense SDA driving $680B economy",
            "horizon_3y": "Lunar economy begins; Neutron/New Glenn compete; $1T milestone approaching",
            "horizon_5y": "In-orbit manufacturing, lunar mining, Mars transport layer",
            "horizon_10y": "Trillion-dollar space economy; interplanetary supply chains",
        },
        "top_opportunities": [
            {"ticker": "RKLB", "thesis": "Neutron + Space Systems = 10x revenue path; DoD preferred provider", "conviction": 91},
            {"ticker": "PL",   "thesis": "Daily Earth observation monopoly; AI analytics revenue inflection",   "conviction": 78},
            {"ticker": "IRDM", "thesis": "Sole L-Band provider; Apple/IoT subscription moat; 3x PE re-rate",   "conviction": 83},
            {"ticker": "NOC",  "thesis": "USSF #1 space contractor; SDA + OPIR + B-21; defensive growth",      "conviction": 87},
        ],
    }


@router.get("/launch")
async def get_launch():
    total_2024 = sum(p["launches_2024"] for p in LAUNCH_PROVIDERS)
    total_ytd  = sum(p["launches_ytd"]  for p in LAUNCH_PROVIDERS)
    spacex     = next(p for p in LAUNCH_PROVIDERS if p["name"] == "SpaceX")
    us_share   = sum(p["market_share"] for p in LAUNCH_PROVIDERS if p["country"] == "US")

    launch_index  = min(100, int(total_2024 / 2.2))
    capacity_score= min(100, int(spacex["market_share"] * 80 + us_share * 20))

    history = [
        {"year": 2018, "total": 111, "spacex": 21, "china": 39, "other": 51},
        {"year": 2019, "total": 103, "spacex": 21, "china": 34, "other": 48},
        {"year": 2020, "total": 114, "spacex": 26, "china": 39, "other": 49},
        {"year": 2021, "total": 146, "spacex": 31, "china": 55, "other": 60},
        {"year": 2022, "total": 186, "spacex": 61, "china": 64, "other": 61},
        {"year": 2023, "total": 223, "spacex": 96, "china": 67, "other": 60},
        {"year": 2024, "total": total_2024, "spacex": spacex["launches_2024"], "china": 48, "other": total_2024 - spacex["launches_2024"] - 48},
    ]

    return {
        "providers": sorted(LAUNCH_PROVIDERS, key=lambda x: x["launches_2024"], reverse=True),
        "total_launches_2024": total_2024,
        "total_launches_ytd":  total_ytd,
        "launch_activity_index": launch_index,
        "launch_capacity_score": capacity_score,
        "spacex_dominance_pct": round(spacex["market_share"] * 100, 1),
        "us_market_share_pct": round(us_share * 100, 1),
        "history": history,
        "cheapest_provider": min(LAUNCH_PROVIDERS, key=lambda x: x["cost_per_kg"])["name"],
        "highest_success": max(LAUNCH_PROVIDERS, key=lambda x: x["success_rate"])["name"],
        "market_share_data": [
            {"name": p["name"], "value": round(p["market_share"] * 100, 1)}
            for p in sorted(LAUNCH_PROVIDERS, key=lambda x: x["market_share"], reverse=True)
        ],
    }


@router.get("/satellite")
async def get_satellite():
    broadband = [c for c in SATELLITE_CONSTELLATIONS if c["category"] == "Broadband"]
    eo        = [c for c in SATELLITE_CONSTELLATIONS if c["category"] == "Earth Obs"]
    nav       = [c for c in SATELLITE_CONSTELLATIONS if c["category"] == "Navigation"]
    total_op  = sum(c["sats_operational"] for c in SATELLITE_CONSTELLATIONS)
    total_plan= sum(c["sats_planned"]     for c in SATELLITE_CONSTELLATIONS)
    total_rev = sum(c["rev_ann_b"] for c in SATELLITE_CONSTELLATIONS)
    starlink  = next(c for c in SATELLITE_CONSTELLATIONS if c["name"] == "Starlink")

    demand_score = min(100, int(
        (starlink["subscribers_m"] / 0.05) * 0.4 +
        (total_op / 100) * 0.3 +
        (total_rev / 0.3) * 0.3
    ))

    sat_history = [
        {"year": 2019, "leo_total": 480,  "starlink": 60,   "other": 420},
        {"year": 2020, "leo_total": 860,  "starlink": 422,  "other": 438},
        {"year": 2021, "leo_total": 1800, "starlink": 1469, "other": 331},
        {"year": 2022, "leo_total": 4200, "starlink": 3580, "other": 620},
        {"year": 2023, "leo_total": 7200, "starlink": 5500, "other": 1700},
        {"year": 2024, "leo_total": total_op, "starlink": starlink["sats_operational"], "other": total_op - starlink["sats_operational"]},
    ]

    return {
        "constellations": SATELLITE_CONSTELLATIONS,
        "broadband":      broadband,
        "earth_obs":      eo,
        "navigation":     nav,
        "total_operational": total_op,
        "total_planned":     total_plan,
        "total_revenue_b":   round(total_rev, 2),
        "demand_score":      demand_score,
        "starlink_subscribers_m": starlink["subscribers_m"],
        "starlink_arpu_usd": 120,
        "history": sat_history,
        "broadband_penetration_pct": round(starlink["subscribers_m"] / 600 * 100, 2),
    }


@router.get("/defense-space")
async def get_defense_space():
    total_b = sum(p["budget_b"] for p in DEFENSE_SPACE)
    us_b    = sum(p["budget_b"] for p in DEFENSE_SPACE if p["country"] == "US")
    avg_growth = sum(p["yoy_pct"] for p in DEFENSE_SPACE) / len(DEFENSE_SPACE)
    spend_score = min(100, int(us_b / 0.45))
    militarization = min(100, int(avg_growth * 3 + 50))

    country_space_budgets = [
        {"country": "United States", "flag": "🇺🇸", "space_mil_b": 30.0, "yoy": 15.0, "programs": 6,  "focus": "USSF / GPS / SBIRS / SDA"},
        {"country": "China",         "flag": "🇨🇳", "space_mil_b": 12.0, "yoy": 18.0, "programs": 4,  "focus": "Anti-Sat / Recon / BeiDou III"},
        {"country": "Russia",        "flag": "🇷🇺", "space_mil_b": 4.5,  "yoy": 5.0,  "programs": 3,  "focus": "GLONASS / ASAT / EW Sats"},
        {"country": "Europe",        "flag": "🇪🇺", "space_mil_b": 2.8,  "yoy": 35.0, "programs": 3,  "focus": "Galileo Military / IRIS² / CSP"},
        {"country": "India",         "flag": "🇮🇳", "space_mil_b": 0.9,  "yoy": 22.0, "programs": 2,  "focus": "NAVIC / IRNSS / EO Recon"},
        {"country": "Japan",         "flag": "🇯🇵", "space_mil_b": 1.8,  "yoy": 28.0, "programs": 2,  "focus": "QZSS Military / ISR Sats"},
    ]

    return {
        "programs": sorted(DEFENSE_SPACE, key=lambda x: x["budget_b"], reverse=True),
        "total_defense_space_b": round(total_b, 1),
        "us_defense_space_b": round(us_b, 1),
        "avg_growth_pct": round(avg_growth, 1),
        "spending_index": spend_score,
        "militarization_score": militarization,
        "country_budgets": sorted(country_space_budgets, key=lambda x: x["space_mil_b"], reverse=True),
        "critical_programs": [p for p in DEFENSE_SPACE if p["priority"] == "CRITICAL"],
        "anti_sat_concern": 78,
        "space_race_label": "Cold War 2.0",
        "us_advantages": ["GPS coverage","SBIRS warning","SDA proliferation","Starshield commercial"],
        "china_threats": ["ASAT weapons","Satellite jamming","Counterspace","BeiDou denial"],
    }


@router.get("/broadband")
async def get_broadband():
    starlink = next(c for c in SATELLITE_CONSTELLATIONS if c["name"] == "Starlink")
    kuiper   = next(c for c in SATELLITE_CONSTELLATIONS if c["name"] == "Amazon Kuiper")
    oneweb   = next(c for c in SATELLITE_CONSTELLATIONS if c["name"] == "OneWeb")
    ses_o3b  = next(c for c in SATELLITE_CONSTELLATIONS if "O3b" in c["name"])

    subscriber_history = [
        {"year": 2021, "starlink": 0.1,  "oneweb": 0.0,  "kuiper": 0.0,  "ses_o3b": 0.6},
        {"year": 2022, "starlink": 0.65, "oneweb": 0.0,  "kuiper": 0.0,  "ses_o3b": 0.65},
        {"year": 2023, "starlink": 2.3,  "oneweb": 0.08, "kuiper": 0.0,  "ses_o3b": 0.72},
        {"year": 2024, "starlink": 4.2,  "oneweb": 0.15, "kuiper": 0.01, "ses_o3b": 0.80},
    ]

    demand_score = min(100, int(starlink["subscribers_m"] / 0.04 + 10))

    return {
        "starlink":  starlink,
        "kuiper":    kuiper,
        "oneweb":    oneweb,
        "ses_o3b":   ses_o3b,
        "total_broadband_subs_m": round(starlink["subscribers_m"] + oneweb["subscribers_m"] + ses_o3b["subscribers_m"], 2),
        "total_rev_b": round(starlink["rev_ann_b"] + oneweb["rev_ann_b"] + ses_o3b["rev_ann_b"], 2),
        "demand_score": demand_score,
        "starlink_arpu_usd": 120,
        "starlink_market_share_pct": round(starlink["subscribers_m"] / (starlink["subscribers_m"] + oneweb["subscribers_m"] + 0.01) * 100, 1),
        "global_unserved_b": 3.7,
        "addressable_market_b": 50,
        "penetration_pct": round(starlink["subscribers_m"] / 3700 * 100, 3),
        "history": subscriber_history,
        "verticals": [
            {"name": "Residential",   "share_pct": 52, "arpu": 120, "growth": "Strong"},
            {"name": "Maritime",      "share_pct": 18, "arpu": 5000,"growth": "Hypergrowth"},
            {"name": "Aviation",      "share_pct": 12, "arpu": 3000,"growth": "Hypergrowth"},
            {"name": "Enterprise/Gov","share_pct": 10, "arpu": 2000,"growth": "Growing"},
            {"name": "RV / Mobile",   "share_pct": 8,  "arpu": 150, "growth": "Growing"},
        ],
    }


@router.get("/economy")
async def get_economy():
    total = sum(s["rev_2024_b"] for s in SPACE_ECONOMY_SEGMENTS)
    fastest = sorted(SPACE_ECONOMY_SEGMENTS, key=lambda x: x["cagr_5y"], reverse=True)[:3]

    forecasts = [
        {"year": 2024, "total": 570,  "commercial": 440, "govt": 130},
        {"year": 2025, "total": 680,  "commercial": 525, "govt": 155},
        {"year": 2026, "total": 810,  "commercial": 625, "govt": 185},
        {"year": 2027, "total": 950,  "commercial": 735, "govt": 215},
        {"year": 2028, "total": 1100, "commercial": 855, "govt": 245},
        {"year": 2029, "total": 1250, "commercial": 975, "govt": 275},
        {"year": 2030, "total": 1400, "commercial": 1100,"govt": 300},
    ]

    return {
        "segments": sorted(SPACE_ECONOMY_SEGMENTS, key=lambda x: x["rev_2024_b"], reverse=True),
        "total_rev_2024_b": round(total, 1),
        "total_rev_2023_b": round(sum(s["rev_2023_b"] for s in SPACE_ECONOMY_SEGMENTS), 1),
        "yoy_growth_pct": round((total - sum(s["rev_2023_b"] for s in SPACE_ECONOMY_SEGMENTS)) / sum(s["rev_2023_b"] for s in SPACE_ECONOMY_SEGMENTS) * 100, 1),
        "fastest_growing": fastest,
        "history": SPENDING_HISTORY,
        "forecasts": forecasts,
        "trillion_dollar_year": 2030,
        "momentum_score": min(100, int(total / 6.5)),
        "sector_mix": [
            {"name": s["segment"], "value": round(s["rev_2024_b"] / total * 100, 1)}
            for s in sorted(SPACE_ECONOMY_SEGMENTS, key=lambda x: x["rev_2024_b"], reverse=True)
        ],
    }


@router.get("/government")
async def get_government():
    total_b  = sum(a["budget_b"] for a in GOVT_AGENCIES)
    avg_yoy  = sum(a["yoy_pct"] for a in GOVT_AGENCIES) / len(GOVT_AGENCIES)
    civil_spending = sum(a["budget_b"] for a in GOVT_AGENCIES if a["name"] != "USSF")
    spending_index = min(100, int(avg_yoy * 4 + 30))

    history = [
        {"year": "2020", "nasa": 22.6, "esa": 7.2, "cnsa": 9.8, "isro": 1.8, "jaxa": 2.4, "other": 8.0},
        {"year": "2021", "nasa": 23.3, "esa": 7.8, "cnsa": 10.5,"isro": 2.0, "jaxa": 2.5, "other": 8.5},
        {"year": "2022", "nasa": 24.0, "esa": 8.2, "cnsa": 11.8,"isro": 2.1, "jaxa": 2.6, "other": 9.2},
        {"year": "2023", "nasa": 25.4, "esa": 8.8, "cnsa": 12.5,"isro": 2.2, "jaxa": 2.7, "other": 9.8},
        {"year": "2024E","nasa": 25.4, "esa": 10.0,"cnsa": 14.0,"isro": 2.4, "jaxa": 2.8, "other": 10.5},
    ]

    return {
        "agencies":           sorted(GOVT_AGENCIES, key=lambda x: x["budget_b"], reverse=True),
        "total_budget_b":     round(total_b, 1),
        "civil_spending_b":   round(civil_spending, 1),
        "avg_growth_pct":     round(avg_yoy, 1),
        "spending_index":     spending_index,
        "nasa_artemis_cost_b":93.0,
        "commercial_crew_b":  4.5,
        "history":            history,
        "fastest_growing":    sorted(GOVT_AGENCIES, key=lambda x: x["yoy_pct"], reverse=True)[:3],
        "commercial_shift":   "Governments shifting 40-60% of spending to commercial contracts",
        "commercial_winners": ["SpaceX","Rocket Lab","Northrop Grumman","Boeing","Sierra Space"],
    }


@router.get("/tourism-lunar")
async def get_tourism_lunar():
    total_tourism_rev = sum(t["revenue_m"] for t in SPACE_TOURISM)
    total_passengers  = sum(t["passengers_total"] for t in SPACE_TOURISM)
    lunar_budget_b    = sum(p["budget_b"] for p in LUNAR_PROGRAMS)

    tourism_score = min(100, int(total_tourism_rev / 10 + total_passengers * 2))
    lunar_score   = min(100, int(lunar_budget_b / 0.18))

    return {
        "tourism": SPACE_TOURISM,
        "total_tourism_rev_m":   round(total_tourism_rev, 1),
        "total_passengers":      total_passengers,
        "tourism_score":         tourism_score,
        "ticket_price_trend":    "Declining for suborbital; stable for orbital",
        "first_orbital_hotel":   "Vast Haven-1 (2026 target)",
        "lunar_programs":        LUNAR_PROGRAMS,
        "total_lunar_budget_b":  round(lunar_budget_b, 1),
        "lunar_score":           lunar_score,
        "artemis_status":        "Delayed to 2026; SLS costs inflating; SpaceX HLS contract intact",
        "clps_contracts_b":      2.6,
        "next_moon_landing_year": 2026,
        "deep_space": {
            "mars_missions": [
                {"name": "Mars Sample Return", "agency": "NASA/ESA", "year": 2033, "budget_b": 11.0, "status": "Under Review"},
                {"name": "Tianwen-2",           "agency": "CNSA",    "year": 2025, "budget_b": 1.5,  "status": "Pre-launch"},
                {"name": "ISRO Mars 2",         "agency": "ISRO",    "year": 2027, "budget_b": 0.3,  "status": "Planning"},
            ],
            "asteroid_mining": "Pre-commercial; AstroForge first mission 2025",
            "deep_space_score": 28,
        },
    }


@router.get("/vc")
async def get_vc():
    total_val = sum(v["val_b"] for v in VC_FUNDING)
    total_raised = sum(v["funding_b"] for v in VC_FUNDING)
    by_category: dict = {}
    for v in VC_FUNDING:
        cat = v["category"]
        if cat not in by_category:
            by_category[cat] = {"count": 0, "total_val_b": 0.0, "total_raised_b": 0.0}
        by_category[cat]["count"] += 1
        by_category[cat]["total_val_b"]    += v["val_b"]
        by_category[cat]["total_raised_b"] += v["funding_b"]

    vc_score = min(100, int(total_val / 5.5))

    vc_history = [
        {"year": 2019, "total_b": 5.8,  "deal_count": 165},
        {"year": 2020, "total_b": 8.9,  "deal_count": 185},
        {"year": 2021, "total_b": 15.4, "deal_count": 232},
        {"year": 2022, "total_b": 7.7,  "deal_count": 167},
        {"year": 2023, "total_b": 8.1,  "deal_count": 178},
        {"year": 2024, "total_b": 11.5, "deal_count": 210},
    ]

    return {
        "companies": sorted(VC_FUNDING, key=lambda x: x["val_b"], reverse=True),
        "total_portfolio_val_b":  round(total_val, 1),
        "total_raised_b":         round(total_raised, 1),
        "vc_score":               vc_score,
        "by_category":            by_category,
        "history":                vc_history,
        "top_by_val":             sorted(VC_FUNDING, key=lambda x: x["val_b"], reverse=True)[:5],
        "hottest_categories":     ["Defense Space","In-Orbit Services","Earth Obs","Launch"],
        "ipo_candidates":         [v["company"] for v in VC_FUNDING if v["status"] in ["Pre-IPO","IPO Candidate"]],
        "a16z_thesis":            "Every satellite is a node in the AI inference network",
    }


@router.get("/stocks")
async def get_stocks():
    loop = asyncio.get_event_loop()
    markets = await loop.run_in_executor(None, _fetch_space_markets, SPACE_TICKERS)

    fund_map = {s["ticker"]: s for s in SPACE_STOCK_FUNDAMENTALS}
    result = []
    for tkr, mkt in markets.items():
        f = fund_map.get(tkr, {})
        if not f:
            continue
        rev_b = f.get("rev_b", 0)
        rev_g = f.get("rev_g", 0)
        fund_score = min(100, int(
            min(100, rev_g * 200) * 0.35 +
            min(100, (f.get("backlog_b", 0) / max(rev_b, 0.01)) * 25) * 0.30 +
            min(100, (1 - max(0, -f.get("op_margin", 0))) * 100) * 0.20 +
            f.get("gov_pct", 0) * 15
        ))
        combined = int(fund_score * 0.55 + mkt["score"] * 0.45)
        if combined >= 80:   sig, t_mult, s_mult = "STRONG BUY", 1.35, 0.90
        elif combined >= 65: sig, t_mult, s_mult = "BUY",        1.20, 0.92
        elif combined >= 45: sig, t_mult, s_mult = "HOLD",       1.10, 0.94
        else:                sig, t_mult, s_mult = "SELL",       0.90, 1.06

        result.append({
            "ticker":      tkr,
            "name":        f["name"],
            "segment":     f["segment"],
            "price":       mkt["price"],
            "chg_pct":     mkt["chg_pct"],
            "chg_ytd":     mkt["chg_ytd"],
            "rsi":         mkt["rsi"],
            "macd":        mkt["macd"],
            "macd_signal": mkt["macd_signal"],
            "ema20":       mkt["ema20"],
            "ema50":       mkt["ema50"],
            "ema200":      mkt["ema200"],
            "adx":         mkt["adx"],
            "tech_score":  mkt["score"],
            "fund_score":  fund_score,
            "score":       combined,
            "signal":      sig,
            # Fundamentals
            "rev_b":       f["rev_b"],
            "rev_g":       f["rev_g"],
            "backlog_b":   f.get("backlog_b", 0),
            "op_margin":   f["op_margin"],
            "is_profitable": f["is_profitable"],
            "gov_pct":     f["gov_pct"],
            "rating":      f["rating"],
            "rev_1y":      round(rev_b * (1 + rev_g), 2),
            "rev_3y":      round(rev_b * (1 + rev_g) ** 3, 2),
            # Signals
            "target":      round(mkt["price"] * t_mult, 2),
            "stop":        round(mkt["price"] * s_mult, 2),
            "exp_return":  round((t_mult - 1) * 100, 1),
            "confidence":  min(100, combined + 7),
        })

    result.sort(key=lambda x: x["score"], reverse=True)
    return {
        "stocks":  result,
        "pure_play_count": len([s for s in result if s["ticker"] in ["RKLB","PL","BKSY","IRDM","VSAT","GSAT","RDW","SATL"]]),
        "defense_exposure_count": len([s for s in result if s["ticker"] in ["NOC","LMT","BA","RTX"]]),
        "as_of": datetime.today().strftime("%Y-%m-%d"),
    }


@router.get("/supply-chain")
async def get_supply_chain():
    resilience = int(100 - sum(s["risk"] for s in SUPPLY_CHAIN_SPACE) / len(SUPPLY_CHAIN_SPACE))
    critical   = [s for s in SUPPLY_CHAIN_SPACE if s["constraint"] == "CRITICAL"]
    high_risk  = [s for s in SUPPLY_CHAIN_SPACE if s["constraint"] == "HIGH"]
    return {
        "inputs":            sorted(SUPPLY_CHAIN_SPACE, key=lambda x: x["risk"], reverse=True),
        "resilience_score":  resilience,
        "critical_count":    len(critical),
        "high_risk_count":   len(high_risk),
        "critical_inputs":   critical,
        "avg_domestic_pct":  round(sum(s["domestic_pct"] for s in SUPPLY_CHAIN_SPACE) / len(SUPPLY_CHAIN_SPACE), 0),
        "xenon_bottleneck":  True,
        "rad_hard_chip_risk":True,
        "china_dependency_items": ["Solar arrays (GaAs)", "Rare earths for thrusters"],
    }


@router.get("/composite")
async def get_composite():
    loop = asyncio.get_event_loop()
    markets = await loop.run_in_executor(None, _fetch_space_markets, SPACE_TICKERS)
    sc = _compute_space_score()

    fund_map = {s["ticker"]: s for s in SPACE_STOCK_FUNDAMENTALS}
    signals = []
    for tkr, mkt in markets.items():
        f = fund_map.get(tkr, {})
        if not f:
            continue
        rev_g = f.get("rev_g", 0)
        gov_pct = f.get("gov_pct", 0)
        fund_score = min(100, int(
            min(100, rev_g * 200) * 0.35 +
            min(100, (f.get("backlog_b", 0) / max(f.get("rev_b", 0.01), 0.01)) * 25) * 0.30 +
            min(100, (1 - max(0, -f.get("op_margin", 0))) * 100) * 0.20 +
            gov_pct * 15
        ))
        combined = int(fund_score * 0.55 + mkt["score"] * 0.45)
        if combined >= 80:   sig, t_mult, s_mult = "STRONG BUY", 1.35, 0.90
        elif combined >= 65: sig, t_mult, s_mult = "BUY",        1.20, 0.92
        elif combined >= 45: sig, t_mult, s_mult = "HOLD",       1.10, 0.94
        else:                sig, t_mult, s_mult = "SELL",       0.90, 1.06

        signals.append({
            "ticker":  tkr, "name": f["name"], "segment": f["segment"],
            "price":   mkt["price"], "signal": sig, "score": combined,
            "fund_score": fund_score, "tech_score": mkt["score"],
            "target":  round(mkt["price"] * t_mult, 2),
            "stop":    round(mkt["price"] * s_mult, 2),
            "exp_return": round((t_mult - 1) * 100, 1),
            "confidence": min(100, combined + 7),
            "rating":  f["rating"],
        })
    signals.sort(key=lambda x: x["score"], reverse=True)

    return {
        "composite_score": sc["composite"],
        "label":           sc["label"],
        "regime":          sc["regime"],
        "economy_value_b": sc["economy_value_b"],
        "economy_growth_pct": sc["economy_growth_pct"],
        "components":      sc["components"],
        "sub_scores":      sc["sub_scores"],
        "signals":         signals,
        "alerts":          SPACE_ALERTS,
        "best_longs": [
            {"ticker": "RKLB", "reason": "Neutron dev + Space Systems profitability; USSF preferred vendor; backlog surging",  "conviction": 91},
            {"ticker": "IRDM", "reason": "Apple satellite SOS moat + L-Band monopoly + maritime IoT; path to FCF positive",   "conviction": 83},
            {"ticker": "NOC",  "reason": "USSF largest contractor; SDA proliferated LEO + OPIR next-gen; B-21 LRIP begins",   "conviction": 87},
            {"ticker": "PL",   "reason": "Daily Earth obs + AI analytics platform; DoD/NGA multi-year pipeline growing",       "conviction": 76},
            {"ticker": "RDW",  "reason": "Space power + structures on every major NASA/USSF program; profitable space systems","conviction": 79},
        ],
        "key_risks": [
            "SpaceX Starship delays could compress launch cost advantage timeline",
            "Government budget sequestration risk if debt ceiling impasse",
            "China ASAT escalation could trigger debris cascade (Kessler syndrome risk)",
            "Kuiper launch ramp creates Starlink pricing pressure in 2026-2027",
            "Rocket Lab Neutron delays — still critical risk to RKLB thesis",
            "LEO spectrum congestion may limit constellation expansion",
        ],
        "supercycle_probability": 72,
        "supercycle_triggers": ["$1T economy by 2030","Starship fully reusable ops","Lunar base economics proven","In-orbit manufacturing"],
        "outlook": {
            "1y":  "Bullish — Starlink revenue inflection + USSF SDA surge + Artemis commercial spend",
            "3y":  "Very Bullish — Neutron/New Glenn compete; lunar economy begins; in-orbit services emerge",
            "5y":  "Space Supercycle — $1T+ economy; interplanetary supply chains; AI-satellite convergence",
        },
        "institutional_flow": {
            "hedge_fund_ownership_b": 28.5,
            "etf_aum_b": 12.4,
            "etfs": ["UFO","ROKT","ARKX","SPAC"],
            "smart_money_score": 68,
            "recent_buys": ["RKLB","IRDM","NOC"],
            "recent_sells": ["SPCE","SATL"],
        },
        "sentiment": {
            "overall_score": 71,
            "label": "Bullish",
            "launch_announcements": 88,
            "defense_contracts":    85,
            "earnings_tone":        62,
            "vc_activity":          78,
            "media_coverage":       70,
        },
    }
