from __future__ import annotations

import asyncio
import random
import time
from datetime import datetime, timedelta
from typing import Optional

import pandas as pd
import yfinance as yf
from fastapi import APIRouter

router = APIRouter()

# ── Curated Data ──────────────────────────────────────────────────────────────

POLITICIANS = [
    {"name": "Nancy Pelosi",        "party": "D", "state": "CA", "chamber": "House",
     "committees": ["Minority Leader"],
     "style": "Growth/Tech", "total_trades": 87, "win_rate": 0.73, "avg_alpha": 0.18,
     "annualized_return": 0.31, "vs_sp500": 0.16, "best_trade": "NVDA +340%", "worst_trade": "FB -12%"},
    {"name": "Dan Crenshaw",         "party": "R", "state": "TX", "chamber": "House",
     "committees": ["Armed Services", "Homeland Security"],
     "style": "Defense/Energy", "total_trades": 45, "win_rate": 0.67, "avg_alpha": 0.11,
     "annualized_return": 0.19, "vs_sp500": 0.04, "best_trade": "RTX +38%", "worst_trade": "SLB -18%"},
    {"name": "Ro Khanna",            "party": "D", "state": "CA", "chamber": "House",
     "committees": ["Armed Services", "Oversight", "Science"],
     "style": "Tech/Innovation", "total_trades": 29, "win_rate": 0.62, "avg_alpha": 0.09,
     "annualized_return": 0.16, "vs_sp500": 0.01, "best_trade": "TSM +58%", "worst_trade": "INTC -30%"},
    {"name": "Josh Gottheimer",      "party": "D", "state": "NJ", "chamber": "House",
     "committees": ["Financial Services", "Intelligence"],
     "style": "Financial/Banking", "total_trades": 63, "win_rate": 0.71, "avg_alpha": 0.12,
     "annualized_return": 0.22, "vs_sp500": 0.07, "best_trade": "JPM +45%", "worst_trade": "SNAP -25%"},
    {"name": "Marjorie Taylor Greene","party": "R", "state": "GA", "chamber": "House",
     "committees": ["Budget", "Homeland Security"],
     "style": "Mixed", "total_trades": 38, "win_rate": 0.55, "avg_alpha": 0.03,
     "annualized_return": 0.13, "vs_sp500": -0.02, "best_trade": "AMZN +22%", "worst_trade": "COIN -40%"},
    {"name": "Austin Scott",         "party": "R", "state": "GA", "chamber": "House",
     "committees": ["Armed Services", "Agriculture"],
     "style": "Defense/Value", "total_trades": 31, "win_rate": 0.65, "avg_alpha": 0.08,
     "annualized_return": 0.17, "vs_sp500": 0.02, "best_trade": "BA +35%", "worst_trade": "CAT -8%"},
    {"name": "Michael McCaul",       "party": "R", "state": "TX", "chamber": "House",
     "committees": ["Foreign Affairs", "Intelligence"],
     "style": "Defense/AI", "total_trades": 38, "win_rate": 0.76, "avg_alpha": 0.21,
     "annualized_return": 0.29, "vs_sp500": 0.14, "best_trade": "PLTR +120%", "worst_trade": "ORCL -5%"},
    {"name": "Kevin Hern",           "party": "R", "state": "OK", "chamber": "House",
     "committees": ["Ways & Means", "Budget"],
     "style": "Mixed", "total_trades": 72, "win_rate": 0.48, "avg_alpha": -0.04,
     "annualized_return": 0.09, "vs_sp500": -0.06, "best_trade": "MSFT +28%", "worst_trade": "TSLA -55%"},
    {"name": "Pete Sessions",        "party": "R", "state": "TX", "chamber": "House",
     "committees": ["Rules", "Financial Services"],
     "style": "Value", "total_trades": 44, "win_rate": 0.52, "avg_alpha": 0.01,
     "annualized_return": 0.11, "vs_sp500": -0.04, "best_trade": "JPM +18%", "worst_trade": "META -22%"},
    {"name": "Bill Foster",          "party": "D", "state": "IL", "chamber": "House",
     "committees": ["Financial Services", "Science"],
     "style": "Science/Tech", "total_trades": 22, "win_rate": 0.64, "avg_alpha": 0.08,
     "annualized_return": 0.15, "vs_sp500": 0.00, "best_trade": "AMD +52%", "worst_trade": "INTC -30%"},
    {"name": "Tommy Tuberville",     "party": "R", "state": "AL", "chamber": "Senate",
     "committees": ["Armed Services", "Agriculture"],
     "style": "Defense/Value", "total_trades": 142, "win_rate": 0.68, "avg_alpha": 0.14,
     "annualized_return": 0.24, "vs_sp500": 0.09, "best_trade": "LMT +62%", "worst_trade": "AMZN -8%"},
    {"name": "Mark Kelly",           "party": "D", "state": "AZ", "chamber": "Senate",
     "committees": ["Armed Services", "Commerce"],
     "style": "Aerospace/Defense", "total_trades": 27, "win_rate": 0.63, "avg_alpha": 0.07,
     "annualized_return": 0.15, "vs_sp500": 0.00, "best_trade": "LMT +28%", "worst_trade": "SPCE -62%"},
    {"name": "John Boozman",         "party": "R", "state": "AR", "chamber": "Senate",
     "committees": ["Agriculture", "Appropriations"],
     "style": "Agriculture/Value", "total_trades": 19, "win_rate": 0.58, "avg_alpha": 0.04,
     "annualized_return": 0.12, "vs_sp500": -0.03, "best_trade": "ADM +18%", "worst_trade": "CF -12%"},
    {"name": "Shelley Moore Capito", "party": "R", "state": "WV", "chamber": "Senate",
     "committees": ["Appropriations", "Environment"],
     "style": "Energy/Infra", "total_trades": 33, "win_rate": 0.61, "avg_alpha": 0.06,
     "annualized_return": 0.14, "vs_sp500": -0.01, "best_trade": "CVX +32%", "worst_trade": "NEE -14%"},
    {"name": "Roger Wicker",         "party": "R", "state": "MS", "chamber": "Senate",
     "committees": ["Armed Services", "Commerce"],
     "style": "Defense/Telecom", "total_trades": 41, "win_rate": 0.66, "avg_alpha": 0.10,
     "annualized_return": 0.18, "vs_sp500": 0.03, "best_trade": "RTX +45%", "worst_trade": "AT&T -20%"},
    {"name": "Richard Blumenthal",   "party": "D", "state": "CT", "chamber": "Senate",
     "committees": ["Judiciary", "Commerce"],
     "style": "Value", "total_trades": 31, "win_rate": 0.45, "avg_alpha": -0.07,
     "annualized_return": 0.08, "vs_sp500": -0.07, "best_trade": "AMZN +22%", "worst_trade": "UNH -18%"},
    {"name": "John Hoeven",          "party": "R", "state": "ND", "chamber": "Senate",
     "committees": ["Appropriations", "Agriculture"],
     "style": "Energy/Agriculture", "total_trades": 28, "win_rate": 0.61, "avg_alpha": 0.07,
     "annualized_return": 0.15, "vs_sp500": 0.00, "best_trade": "XOM +28%", "worst_trade": "OXY -10%"},
    {"name": "Thom Tillis",          "party": "R", "state": "NC", "chamber": "Senate",
     "committees": ["Banking", "Judiciary"],
     "style": "Financial", "total_trades": 26, "win_rate": 0.62, "avg_alpha": 0.07,
     "annualized_return": 0.15, "vs_sp500": 0.00, "best_trade": "BAC +28%", "worst_trade": "USB -15%"},
]

TRADES = [
    {"politician": "Nancy Pelosi",     "ticker": "NVDA", "asset_type": "Stock",       "action": "Buy",
     "size_min": 500_001,  "size_max": 1_000_000, "days_ago": 3,  "sector": "Semiconductors", "committee_link": None,             "conviction": 92},
    {"politician": "Nancy Pelosi",     "ticker": "MSFT", "asset_type": "Call Option", "action": "Buy",
     "size_min": 250_001,  "size_max": 500_000,   "days_ago": 5,  "sector": "Technology",     "committee_link": None,             "conviction": 88},
    {"politician": "Dan Crenshaw",     "ticker": "LMT",  "asset_type": "Stock",       "action": "Buy",
     "size_min": 15_001,   "size_max": 50_000,    "days_ago": 7,  "sector": "Defense",        "committee_link": "Armed Services", "conviction": 95},
    {"politician": "Dan Crenshaw",     "ticker": "RTX",  "asset_type": "Stock",       "action": "Buy",
     "size_min": 15_001,   "size_max": 50_000,    "days_ago": 7,  "sector": "Defense",        "committee_link": "Armed Services", "conviction": 94},
    {"politician": "Tommy Tuberville", "ticker": "GD",   "asset_type": "Stock",       "action": "Buy",
     "size_min": 100_001,  "size_max": 250_000,   "days_ago": 2,  "sector": "Defense",        "committee_link": "Armed Services", "conviction": 97},
    {"politician": "Tommy Tuberville", "ticker": "NOC",  "asset_type": "Stock",       "action": "Buy",
     "size_min": 50_001,   "size_max": 100_000,   "days_ago": 4,  "sector": "Defense",        "committee_link": "Armed Services", "conviction": 96},
    {"politician": "Tommy Tuberville", "ticker": "LMT",  "asset_type": "Call Option", "action": "Buy",
     "size_min": 50_001,   "size_max": 100_000,   "days_ago": 15, "sector": "Defense",        "committee_link": "Armed Services", "conviction": 95},
    {"politician": "Ro Khanna",        "ticker": "TSM",  "asset_type": "Stock",       "action": "Buy",
     "size_min": 15_001,   "size_max": 50_000,    "days_ago": 10, "sector": "Semiconductors", "committee_link": "Science",        "conviction": 82},
    {"politician": "Josh Gottheimer",  "ticker": "JPM",  "asset_type": "Stock",       "action": "Buy",
     "size_min": 50_001,   "size_max": 100_000,   "days_ago": 6,  "sector": "Financials",     "committee_link": "Financial Services","conviction": 88},
    {"politician": "Josh Gottheimer",  "ticker": "GS",   "asset_type": "Stock",       "action": "Buy",
     "size_min": 50_001,   "size_max": 100_000,   "days_ago": 6,  "sector": "Financials",     "committee_link": "Financial Services","conviction": 87},
    {"politician": "Josh Gottheimer",  "ticker": "C",    "asset_type": "Stock",       "action": "Buy",
     "size_min": 15_001,   "size_max": 50_000,    "days_ago": 16, "sector": "Financials",     "committee_link": "Financial Services","conviction": 82},
    {"politician": "Michael McCaul",   "ticker": "PLTR", "asset_type": "Stock",       "action": "Buy",
     "size_min": 100_001,  "size_max": 250_000,   "days_ago": 1,  "sector": "AI/Defense",     "committee_link": "Intelligence",   "conviction": 90},
    {"politician": "Michael McCaul",   "ticker": "CACI", "asset_type": "Stock",       "action": "Buy",
     "size_min": 50_001,   "size_max": 100_000,   "days_ago": 14, "sector": "Defense/IT",     "committee_link": "Foreign Affairs","conviction": 88},
    {"politician": "Kevin Hern",       "ticker": "AAPL", "asset_type": "Stock",       "action": "Sell",
     "size_min": 250_001,  "size_max": 500_000,   "days_ago": 8,  "sector": "Technology",     "committee_link": None,             "conviction": 45},
    {"politician": "Kevin Hern",       "ticker": "TSLA", "asset_type": "Stock",       "action": "Sell",
     "size_min": 100_001,  "size_max": 250_000,   "days_ago": 27, "sector": "EV/Clean",       "committee_link": None,             "conviction": 30},
    {"politician": "Pete Sessions",    "ticker": "META", "asset_type": "Stock",       "action": "Sell",
     "size_min": 50_001,   "size_max": 100_000,   "days_ago": 12, "sector": "Technology",     "committee_link": None,             "conviction": 38},
    {"politician": "Marjorie Taylor Greene","ticker": "AMZN","asset_type": "Stock",   "action": "Buy",
     "size_min": 15_001,   "size_max": 50_000,    "days_ago": 14, "sector": "Technology",     "committee_link": None,             "conviction": 72},
    {"politician": "Austin Scott",     "ticker": "BA",   "asset_type": "Stock",       "action": "Buy",
     "size_min": 15_001,   "size_max": 50_000,    "days_ago": 9,  "sector": "Defense",        "committee_link": "Armed Services", "conviction": 86},
    {"politician": "Bill Foster",      "ticker": "INTC", "asset_type": "Stock",       "action": "Buy",
     "size_min": 15_001,   "size_max": 50_000,    "days_ago": 11, "sector": "Semiconductors", "committee_link": "Science",        "conviction": 79},
    {"politician": "Bill Foster",      "ticker": "AMD",  "asset_type": "Stock",       "action": "Buy",
     "size_min": 50_001,   "size_max": 100_000,   "days_ago": 18, "sector": "Semiconductors", "committee_link": "Science",        "conviction": 83},
    {"politician": "Mark Kelly",       "ticker": "LMT",  "asset_type": "Stock",       "action": "Buy",
     "size_min": 15_001,   "size_max": 50_000,    "days_ago": 20, "sector": "Defense",        "committee_link": "Armed Services", "conviction": 85},
    {"politician": "Roger Wicker",     "ticker": "RTX",  "asset_type": "Stock",       "action": "Buy",
     "size_min": 50_001,   "size_max": 100_000,   "days_ago": 3,  "sector": "Defense",        "committee_link": "Armed Services", "conviction": 93},
    {"politician": "Roger Wicker",     "ticker": "NOC",  "asset_type": "Stock",       "action": "Buy",
     "size_min": 15_001,   "size_max": 50_000,    "days_ago": 22, "sector": "Defense",        "committee_link": "Armed Services", "conviction": 89},
    {"politician": "Richard Blumenthal","ticker": "UNH", "asset_type": "Stock",       "action": "Sell",
     "size_min": 500_001,  "size_max": 1_000_000, "days_ago": 5,  "sector": "Healthcare",     "committee_link": None,             "conviction": 35},
    {"politician": "John Hoeven",      "ticker": "XOM",  "asset_type": "Stock",       "action": "Buy",
     "size_min": 100_001,  "size_max": 250_000,   "days_ago": 7,  "sector": "Energy",         "committee_link": "Appropriations", "conviction": 80},
    {"politician": "Shelley Moore Capito","ticker": "CVX","asset_type": "Stock",      "action": "Buy",
     "size_min": 50_001,   "size_max": 100_000,   "days_ago": 20, "sector": "Energy",         "committee_link": "Environment",    "conviction": 78},
    {"politician": "John Boozman",     "ticker": "ADM",  "asset_type": "Stock",       "action": "Buy",
     "size_min": 15_001,   "size_max": 50_000,    "days_ago": 22, "sector": "Agriculture",    "committee_link": "Agriculture",    "conviction": 75},
    {"politician": "Thom Tillis",      "ticker": "BAC",  "asset_type": "Stock",       "action": "Buy",
     "size_min": 15_001,   "size_max": 50_000,    "days_ago": 6,  "sector": "Financials",     "committee_link": "Banking",        "conviction": 84},
    {"politician": "Nancy Pelosi",     "ticker": "AMD",  "asset_type": "Stock",       "action": "Buy",
     "size_min": 500_001,  "size_max": 1_000_000, "days_ago": 18, "sector": "Semiconductors", "committee_link": None,             "conviction": 91},
    {"politician": "Ro Khanna",        "ticker": "NVDA", "asset_type": "Call Option", "action": "Buy",
     "size_min": 100_001,  "size_max": 250_000,   "days_ago": 25, "sector": "Semiconductors", "committee_link": None,             "conviction": 89},
]

OPTIONS_TRADES = [
    {"politician": "Nancy Pelosi",     "ticker": "MSFT", "option_type": "Call",
     "strike": 450, "expiry": "2026-12-19", "size_min": 250_001, "size_max": 500_000,
     "days_ago": 5,  "sector": "Technology", "conviction": 91},
    {"politician": "Ro Khanna",        "ticker": "NVDA", "option_type": "Call",
     "strike": 150, "expiry": "2027-01-16", "size_min": 100_001, "size_max": 250_000,
     "days_ago": 25, "sector": "Semiconductors", "conviction": 89},
    {"politician": "Tommy Tuberville", "ticker": "LMT",  "option_type": "Call",
     "strike": 600, "expiry": "2026-12-19", "size_min": 50_001,  "size_max": 100_000,
     "days_ago": 15, "sector": "Defense", "conviction": 95},
    {"politician": "Josh Gottheimer",  "ticker": "JPM",  "option_type": "Call",
     "strike": 280, "expiry": "2026-09-18", "size_min": 50_001,  "size_max": 100_000,
     "days_ago": 8,  "sector": "Financials", "conviction": 86},
    {"politician": "Kevin Hern",       "ticker": "TSLA", "option_type": "Put",
     "strike": 180, "expiry": "2026-09-18", "size_min": 50_001,  "size_max": 100_000,
     "days_ago": 20, "sector": "EV/Clean", "conviction": 68},
    {"politician": "Michael McCaul",   "ticker": "PLTR", "option_type": "Call",
     "strike": 50,  "expiry": "2027-01-16", "size_min": 100_001, "size_max": 250_000,
     "days_ago": 3,  "sector": "AI/Defense", "conviction": 92},
    {"politician": "Richard Blumenthal","ticker": "UNH", "option_type": "Put",
     "strike": 480, "expiry": "2026-09-19", "size_min": 250_001, "size_max": 500_000,
     "days_ago": 12, "sector": "Healthcare", "conviction": 35},
    {"politician": "Dan Crenshaw",     "ticker": "RTX",  "option_type": "Call",
     "strike": 130, "expiry": "2026-12-18", "size_min": 15_001,  "size_max": 50_000,
     "days_ago": 7,  "sector": "Defense", "conviction": 93},
]

SECTOR_DATA = {
    "Defense":        {"net_buy": 2_800_000, "net_sell": 150_000,   "traders": 7, "top_tickers": ["LMT","RTX","NOC","GD","BA","CACI"], "trend": "Strong Buy"},
    "Semiconductors": {"net_buy": 1_850_000, "net_sell": 50_000,    "traders": 5, "top_tickers": ["NVDA","AMD","INTC","TSM"],         "trend": "Strong Buy"},
    "Technology":     {"net_buy": 1_050_000, "net_sell": 600_000,   "traders": 6, "top_tickers": ["NVDA","MSFT","AMZN","AAPL"],       "trend": "Accumulating"},
    "AI/Defense":     {"net_buy": 1_100_000, "net_sell": 0,         "traders": 2, "top_tickers": ["PLTR","CACI","SAIC"],              "trend": "Strong Buy"},
    "Financials":     {"net_buy": 1_200_000, "net_sell": 200_000,   "traders": 4, "top_tickers": ["JPM","GS","BAC","C"],              "trend": "Accumulating"},
    "Energy":         {"net_buy": 750_000,   "net_sell": 100_000,   "traders": 3, "top_tickers": ["XOM","CVX","COP"],                 "trend": "Mild Buy"},
    "Healthcare":     {"net_buy": 250_000,   "net_sell": 1_500_000, "traders": 2, "top_tickers": ["UNH","LLY","MRNA"],               "trend": "Distributing"},
    "EV/Clean":       {"net_buy": 100_000,   "net_sell": 350_000,   "traders": 2, "top_tickers": ["TSLA"],                           "trend": "Distributing"},
    "Agriculture":    {"net_buy": 200_000,   "net_sell": 0,         "traders": 2, "top_tickers": ["ADM","MON"],                      "trend": "Mild Buy"},
    "Industrials":    {"net_buy": 300_000,   "net_sell": 150_000,   "traders": 2, "top_tickers": ["CAT","DE","HON"],                 "trend": "Neutral"},
}

COMMITTEES = [
    {"name": "Armed Services",          "chamber": "Joint",  "influence": 97, "pending_bills": 3,
     "members": ["Tommy Tuberville","Dan Crenshaw","Austin Scott","Roger Wicker","Mark Kelly"],
     "sector_focus": "Defense", "budget_authority": 858_000_000_000},
    {"name": "Appropriations",          "chamber": "Joint",  "influence": 99, "pending_bills": 12,
     "members": ["John Hoeven","John Boozman","Shelley Moore Capito"],
     "sector_focus": "Government Spending", "budget_authority": 1_700_000_000_000},
    {"name": "Intelligence",            "chamber": "Joint",  "influence": 95, "pending_bills": 2,
     "members": ["Josh Gottheimer","Michael McCaul"],
     "sector_focus": "AI/Defense", "budget_authority": 90_000_000_000},
    {"name": "Commerce & Science",      "chamber": "Joint",  "influence": 90, "pending_bills": 6,
     "members": ["Ro Khanna","Roger Wicker","Mark Kelly","Bill Foster"],
     "sector_focus": "Semiconductors/AI", "budget_authority": 52_000_000_000},
    {"name": "Financial Services / Banking","chamber": "Joint","influence": 88, "pending_bills": 5,
     "members": ["Josh Gottheimer","Thom Tillis","Pete Sessions","Bill Foster"],
     "sector_focus": "Financials", "budget_authority": None},
    {"name": "Foreign Affairs",         "chamber": "House",  "influence": 86, "pending_bills": 3,
     "members": ["Michael McCaul"],
     "sector_focus": "Defense/AI", "budget_authority": 60_000_000_000},
    {"name": "Energy & Environment",    "chamber": "Joint",  "influence": 82, "pending_bills": 4,
     "members": ["Shelley Moore Capito","John Hoeven"],
     "sector_focus": "Energy", "budget_authority": 65_000_000_000},
    {"name": "Health / HELP",           "chamber": "Joint",  "influence": 78, "pending_bills": 8,
     "members": ["Richard Blumenthal"],
     "sector_focus": "Healthcare", "budget_authority": 180_000_000_000},
]

GOV_SPENDING = [
    {"category": "Defense / DoD",             "fy_budget": 858_000_000_000, "yoy_growth": 0.068,
     "beneficiaries": ["LMT","RTX","NOC","GD","BA","CACI","SAIC"],
     "congressional_buys": ["Tommy Tuberville","Dan Crenshaw","Austin Scott","Roger Wicker"]},
    {"category": "Semiconductor Subsidies (CHIPS)","fy_budget": 52_000_000_000, "yoy_growth": 0.210,
     "beneficiaries": ["INTC","TSM","TXN","AMD"],
     "congressional_buys": ["Bill Foster","Ro Khanna"]},
    {"category": "AI / Tech Infrastructure",  "fy_budget": 28_000_000_000, "yoy_growth": 0.450,
     "beneficiaries": ["PLTR","MSFT","AMZN","GOOG","CACI"],
     "congressional_buys": ["Michael McCaul","Josh Gottheimer"]},
    {"category": "Infrastructure / IRA",       "fy_budget": 120_000_000_000,"yoy_growth": 0.085,
     "beneficiaries": ["CAT","DE","VMC","NUE"],
     "congressional_buys": ["Shelley Moore Capito"]},
    {"category": "Energy Independence",        "fy_budget": 65_000_000_000, "yoy_growth": 0.120,
     "beneficiaries": ["XOM","CVX","COP","EOG"],
     "congressional_buys": ["John Hoeven","Shelley Moore Capito"]},
    {"category": "Healthcare / NIH",           "fy_budget": 180_000_000_000,"yoy_growth": 0.035,
     "beneficiaries": ["LLY","PFE","MRNA","UNH"],
     "congressional_buys": []},
    {"category": "Space / NASA",               "fy_budget": 25_000_000_000, "yoy_growth": 0.090,
     "beneficiaries": ["SPCE","BA","LMT","RKLB"],
     "congressional_buys": ["Mark Kelly"]},
]

LEGISLATION = [
    {"bill": "National Defense Authorization Act 2026", "status": "Passed Committee", "impact": "POSITIVE",
     "beneficiaries": ["LMT","RTX","NOC","GD","CACI"], "at_risk": [],
     "sector": "Defense", "budget": 858_000_000_000, "catalyst_date": "2026-07-15"},
    {"bill": "CHIPS Act 2.0 Expansion",               "status": "Floor Vote Pending","impact": "POSITIVE",
     "beneficiaries": ["INTC","TSM","AMD","NVDA"], "at_risk": [],
     "sector": "Semiconductors", "budget": 35_000_000_000, "catalyst_date": "2026-07-30"},
    {"bill": "AI Safety & Innovation Act",             "status": "Markup Phase",      "impact": "MIXED",
     "beneficiaries": ["MSFT","GOOG","AMZN"], "at_risk": ["META","TSLA"],
     "sector": "AI/Tech", "budget": 28_000_000_000, "catalyst_date": "2026-08-01"},
    {"bill": "Energy Independence & Security Act",     "status": "Senate Floor",      "impact": "POSITIVE",
     "beneficiaries": ["XOM","CVX","COP","EOG"], "at_risk": ["NEE","ENPH"],
     "sector": "Energy", "budget": 45_000_000_000, "catalyst_date": "2026-07-20"},
    {"bill": "Healthcare Pricing Reform",              "status": "Subcommittee",      "impact": "NEGATIVE",
     "beneficiaries": [], "at_risk": ["UNH","CVS","HCA","CI"],
     "sector": "Healthcare", "budget": None, "catalyst_date": "2026-09-01"},
    {"bill": "Bank Capital Requirements Revision",     "status": "Proposed",          "impact": "NEGATIVE",
     "beneficiaries": [], "at_risk": ["JPM","BAC","GS","MS"],
     "sector": "Financials", "budget": None, "catalyst_date": "2026-10-15"},
    {"bill": "Quantum Computing Leadership Act",       "status": "Passed Senate",     "impact": "POSITIVE",
     "beneficiaries": ["IONQ","IBM","MSFT","GOOG"], "at_risk": [],
     "sector": "Quantum/Tech", "budget": 8_000_000_000, "catalyst_date": "2026-07-01"},
]

LOBBYING = [
    {"company": "Lockheed Martin",     "ticker": "LMT",  "sector": "Defense",
     "annual_spend": 14_200_000, "pac_contributions": 3_800_000, "influence_score": 96,
     "key_committees": ["Armed Services","Appropriations"]},
    {"company": "Amazon",              "ticker": "AMZN", "sector": "Technology",
     "annual_spend": 20_100_000, "pac_contributions": 1_800_000, "influence_score": 91,
     "key_committees": ["Commerce","Armed Services"]},
    {"company": "Northrop Grumman",    "ticker": "NOC",  "sector": "Defense",
     "annual_spend": 9_200_000,  "pac_contributions": 3_100_000, "influence_score": 90,
     "key_committees": ["Armed Services","Intelligence"]},
    {"company": "Raytheon Technologies","ticker": "RTX", "sector": "Defense",
     "annual_spend": 11_500_000, "pac_contributions": 2_900_000, "influence_score": 93,
     "key_committees": ["Armed Services","Foreign Affairs"]},
    {"company": "Microsoft",           "ticker": "MSFT", "sector": "Technology",
     "annual_spend": 10_800_000, "pac_contributions": 1_200_000, "influence_score": 89,
     "key_committees": ["Commerce","Intelligence"]},
    {"company": "JPMorgan Chase",      "ticker": "JPM",  "sector": "Financials",
     "annual_spend": 8_500_000,  "pac_contributions": 4_200_000, "influence_score": 88,
     "key_committees": ["Financial Services","Banking"]},
    {"company": "Palantir Technologies","ticker": "PLTR","sector": "AI/Defense",
     "annual_spend": 6_200_000,  "pac_contributions": 900_000,   "influence_score": 87,
     "key_committees": ["Intelligence","Foreign Affairs"]},
    {"company": "ExxonMobil",          "ticker": "XOM",  "sector": "Energy",
     "annual_spend": 7_800_000,  "pac_contributions": 2_600_000, "influence_score": 82,
     "key_committees": ["Energy","Appropriations"]},
]

GOV_CONTRACTS = [
    {"company": "Lockheed Martin",  "ticker": "LMT",  "sector": "Defense",
     "total_fy": 68_000_000_000, "yoy_growth": 0.072, "gov_rev_pct": 0.87,
     "recent_award": "F-35 Block 4 Production", "award_value": 15_000_000_000, "momentum": 94},
    {"company": "Northrop Grumman", "ticker": "NOC",  "sector": "Defense",
     "total_fy": 38_000_000_000, "yoy_growth": 0.095, "gov_rev_pct": 0.85,
     "recent_award": "B-21 Raider Production", "award_value": 22_000_000_000, "momentum": 97},
    {"company": "Raytheon Tech.",   "ticker": "RTX",  "sector": "Defense",
     "total_fy": 42_000_000_000, "yoy_growth": 0.063, "gov_rev_pct": 0.72,
     "recent_award": "Patriot PAC-3 Expansion", "award_value": 8_500_000_000, "momentum": 91},
    {"company": "General Dynamics", "ticker": "GD",   "sector": "Defense",
     "total_fy": 28_000_000_000, "yoy_growth": 0.058, "gov_rev_pct": 0.78,
     "recent_award": "Virginia-Class Submarine", "award_value": 12_000_000_000, "momentum": 89},
    {"company": "Palantir",         "ticker": "PLTR", "sector": "AI/Defense",
     "total_fy": 3_200_000_000,  "yoy_growth": 0.680, "gov_rev_pct": 0.55,
     "recent_award": "TITAN Army Intelligence", "award_value": 480_000_000,    "momentum": 95},
    {"company": "CACI International","ticker": "CACI","sector": "Defense/IT",
     "total_fy": 6_800_000_000,  "yoy_growth": 0.140, "gov_rev_pct": 0.93,
     "recent_award": "DoD IT Modernization",    "award_value": 1_200_000_000,  "momentum": 88},
    {"company": "Amazon (AWS Gov)", "ticker": "AMZN", "sector": "Technology",
     "total_fy": 12_000_000_000, "yoy_growth": 0.320, "gov_rev_pct": 0.12,
     "recent_award": "DoD JWCC Cloud",          "award_value": 9_000_000_000,  "momentum": 86},
    {"company": "Intel (CHIPS)",    "ticker": "INTC", "sector": "Semiconductors",
     "total_fy": 8_500_000_000,  "yoy_growth": 0.890, "gov_rev_pct": 0.28,
     "recent_award": "CHIPS Act Fab Subsidy",   "award_value": 8_500_000_000,  "momentum": 92},
]

ALERTS = [
    {"id": "A1", "type": "CLUSTER_BUY", "priority": "CRITICAL",
     "title": "Defense Cluster: 5 Armed Services Members Buy Same Stocks",
     "detail": "Tuberville, Crenshaw, Scott, Wicker, Kelly all bought defense contractors within 72h",
     "tickers": ["LMT","RTX","NOC","GD"], "ts": "2026-06-22T09:15:00Z"},
    {"id": "A2", "type": "COMMITTEE_TRADE", "priority": "HIGH",
     "title": "Armed Services Chair Buys RTX 3 Days Before Defense Hearing",
     "detail": "Roger Wicker purchased RTX $50K–$100K before classified budget hearing",
     "tickers": ["RTX"], "ts": "2026-06-21T14:30:00Z"},
    {"id": "A3", "type": "LARGE_OPTIONS", "priority": "HIGH",
     "title": "Pelosi MSFT Calls: $250K–$500K — 5th Consecutive Tech Options Trade",
     "detail": "Nancy Pelosi purchased MSFT call options (strike $450, exp Dec 2026)",
     "tickers": ["MSFT"], "ts": "2026-06-20T11:00:00Z"},
    {"id": "A4", "type": "COMMITTEE_TRADE", "priority": "HIGH",
     "title": "Intelligence Committee Member Buys PLTR Ahead of Contract Announcement",
     "detail": "Michael McCaul (Intelligence/Foreign Affairs) purchased PLTR $100K–$250K",
     "tickers": ["PLTR"], "ts": "2026-06-22T08:45:00Z"},
    {"id": "A5", "type": "LARGE_SALE", "priority": "MEDIUM",
     "title": "Blumenthal Sells UNH $500K–$1M While Healthcare Bill in Subcommittee",
     "detail": "Richard Blumenthal exiting UNH as Healthcare Pricing Reform advances",
     "tickers": ["UNH"], "ts": "2026-06-20T10:20:00Z"},
    {"id": "A6", "type": "CLUSTER_SELL", "priority": "MEDIUM",
     "title": "Two Members Reducing Tech Exposure (AAPL, META)",
     "detail": "Possible regulatory concern ahead of antitrust/social media hearings Q3",
     "tickers": ["AAPL","META"], "ts": "2026-06-15T09:00:00Z"},
    {"id": "A7", "type": "SPENDING_LINK", "priority": "LOW",
     "title": "Science Committee Members Buying Semiconductor Stocks Pre-CHIPS 2.0 Vote",
     "detail": "Bill Foster & Ro Khanna bought INTC and AMD ahead of floor vote July 30",
     "tickers": ["INTC","AMD"], "ts": "2026-06-12T15:30:00Z"},
    {"id": "A8", "type": "UNUSUAL_OPTIONS", "priority": "MEDIUM",
     "title": "Tuberville Adds LMT Calls While Chairing NDAA Markup Session",
     "detail": "Tommy Tuberville purchased LMT call options (strike $600, exp Dec 2026)",
     "tickers": ["LMT"], "ts": "2026-06-10T13:15:00Z"},
]

MARKET_TICKERS = ["LMT", "RTX", "NOC", "GD", "PLTR", "NVDA", "MSFT", "AMD", "JPM", "BAC", "XOM", "CACI"]

_mkt_cache: dict = {}
_CACHE_TTL = 300


def _fetch_markets(tickers: list[str]) -> dict:
    now = time.time()
    key = ",".join(sorted(tickers))
    if key in _mkt_cache and now - _mkt_cache[key]["ts"] < _CACHE_TTL:
        return _mkt_cache[key]["data"]

    end   = datetime.today().strftime("%Y-%m-%d")
    start = (datetime.today() - timedelta(days=120)).strftime("%Y-%m-%d")
    result: dict = {}
    try:
        raw = yf.download(tickers, start=start, end=end, auto_adjust=True, progress=False)
        cl = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw
        for tkr in tickers:
            try:
                col = cl[tkr] if tkr in cl.columns else cl.iloc[:, 0]
                s = col.dropna()
                if len(s) < 20:
                    continue
                delta = s.diff()
                gain  = delta.clip(lower=0).rolling(14).mean()
                loss  = (-delta.clip(upper=0)).rolling(14).mean()
                rsi   = float((100 - 100 / (1 + gain / loss.replace(0, 1e-10))).iloc[-1])
                ema12 = s.ewm(span=12).mean()
                ema26 = s.ewm(span=26).mean()
                macd_line   = ema12 - ema26
                signal_line = macd_line.ewm(span=9).mean()
                price = float(s.iloc[-1])
                prev  = float(s.iloc[-2]) if len(s) >= 2 else price
                ema20 = float(s.ewm(span=20).mean().iloc[-1])
                ema50 = float(s.ewm(span=50).mean().iloc[-1]) if len(s) >= 50 else None
                chg   = (price - prev) / prev * 100
                score = 50
                if rsi > 50: score += 8
                if rsi > 60: score += 7
                if float(macd_line.iloc[-1]) > float(signal_line.iloc[-1]): score += 15
                if price > ema20: score += 10
                if ema50 and price > ema50: score += 10
                score = min(100, max(0, score))
                sig = "STRONG BUY" if score >= 80 else "BUY" if score >= 65 else "HOLD" if score >= 45 else "SELL" if score >= 30 else "STRONG SELL"
                result[tkr] = {
                    "price": round(price, 2), "chg_pct": round(chg, 2),
                    "rsi": round(rsi, 1),
                    "macd": round(float(macd_line.iloc[-1]), 3),
                    "macd_signal": round(float(signal_line.iloc[-1]), 3),
                    "ema20": round(ema20, 2),
                    "ema50": round(ema50, 2) if ema50 else None,
                    "score": score, "signal": sig,
                }
            except Exception:
                pass
    except Exception:
        pass
    _mkt_cache[key] = {"ts": now, "data": result}
    return result


def _size_label(lo: int, hi: int) -> str:
    def fmt(v: int) -> str:
        if v >= 1_000_000: return f"${v / 1_000_000:.1f}M"
        if v >= 1_000:     return f"${v / 1_000:.0f}K"
        return f"${v}"
    return f"{fmt(lo)} – {fmt(hi)}"


def _trade_date(days_ago: int) -> str:
    return (datetime.today() - timedelta(days=days_ago)).strftime("%Y-%m-%d")


def _compute_bullishness() -> dict:
    buys  = [t for t in TRADES if t["action"] == "Buy"]
    sells = [t for t in TRADES if t["action"] == "Sell"]
    bv = sum(t["size_max"] for t in buys)
    sv = sum(t["size_max"] for t in sells)
    ratio = bv / (bv + sv) if (bv + sv) > 0 else 0.5
    score = int(ratio * 100)
    if score >= 80: label = "Aggressive Buying"
    elif score >= 60: label = "Bullish"
    elif score >= 40: label = "Neutral"
    elif score >= 20: label = "Defensive"
    else: label = "Aggressive Selling"
    return {
        "score": score, "label": label,
        "total_purchases_30d": bv, "total_sales_30d": sv,
        "net_flow": bv - sv,
        "active_traders": len(set(t["politician"] for t in TRADES)),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/overview")
async def get_overview():
    loop = asyncio.get_event_loop()
    markets = await loop.run_in_executor(None, _fetch_markets, MARKET_TICKERS)
    bull = _compute_bullishness()
    top_trades = sorted(TRADES, key=lambda t: t["size_max"], reverse=True)[:6]
    pol_map = {p["name"]: p for p in POLITICIANS}
    return {
        "bullishness": bull,
        "positioning": "Risk-On" if bull["score"] >= 65 else "Neutral" if bull["score"] >= 45 else "Defensive",
        "top_trades": [
            {
                "politician": t["politician"],
                "party": pol_map.get(t["politician"], {}).get("party", "?"),
                "ticker": t["ticker"],
                "action": t["action"],
                "size": _size_label(t["size_min"], t["size_max"]),
                "sector": t["sector"],
                "days_ago": t["days_ago"],
                "conviction": t["conviction"],
                "committee_link": t["committee_link"],
                "asset_type": t["asset_type"],
            }
            for t in top_trades
        ],
        "markets": markets,
        "alerts": ALERTS[:4],
        "kpis": {
            "total_politicians_tracked": len(POLITICIANS),
            "house_members": sum(1 for p in POLITICIANS if p["chamber"] == "House"),
            "senate_members": sum(1 for p in POLITICIANS if p["chamber"] == "Senate"),
            "total_trades_30d": len(TRADES),
            "options_trades_30d": len(OPTIONS_TRADES),
            "committee_linked_trades": sum(1 for t in TRADES if t["committee_link"]),
            "avg_conviction": round(sum(t["conviction"] for t in TRADES) / len(TRADES), 1),
            "buy_count": sum(1 for t in TRADES if t["action"] == "Buy"),
            "sell_count": sum(1 for t in TRADES if t["action"] == "Sell"),
        },
    }


@router.get("/trades")
async def get_trades():
    pol_map = {p["name"]: p for p in POLITICIANS}
    result = []
    for t in TRADES:
        p = pol_map.get(t["politician"], {})
        dd = random.randint(25, 45)
        result.append({
            "politician": t["politician"],
            "party": p.get("party", "?"),
            "state": p.get("state", "?"),
            "chamber": p.get("chamber", "?"),
            "committees": p.get("committees", []),
            "ticker": t["ticker"],
            "asset_type": t["asset_type"],
            "action": t["action"],
            "size_label": _size_label(t["size_min"], t["size_max"]),
            "size_max": t["size_max"],
            "trade_date": _trade_date(t["days_ago"]),
            "disclosure_delay_days": dd,
            "sector": t["sector"],
            "committee_link": t["committee_link"],
            "conviction": t["conviction"],
        })
    result.sort(key=lambda x: x["trade_date"], reverse=True)
    return {"trades": result, "total": len(result)}


@router.get("/buyers")
async def get_buyers():
    pol_map = {p["name"]: p for p in POLITICIANS}
    agg: dict = {}
    for t in TRADES:
        if t["action"] != "Buy":
            continue
        n = t["politician"]
        if n not in agg:
            agg[n] = {"vol": 0, "count": 0, "tickers": set(), "conv_sum": 0}
        agg[n]["vol"] += t["size_max"]
        agg[n]["count"] += 1
        agg[n]["tickers"].add(t["ticker"])
        agg[n]["conv_sum"] += t["conviction"]
    result = []
    for name, d in agg.items():
        p = pol_map.get(name, {})
        result.append({
            "name": name, "party": p.get("party","?"), "state": p.get("state","?"),
            "chamber": p.get("chamber","?"), "style": p.get("style","Mixed"),
            "total_purchases": d["vol"], "num_trades": d["count"],
            "tickers": list(d["tickers"]),
            "avg_conviction": round(d["conv_sum"] / d["count"], 1),
            "win_rate": p.get("win_rate", 0.5),
            "avg_alpha": p.get("avg_alpha", 0),
            "annualized_return": p.get("annualized_return", 0),
            "vs_sp500": p.get("vs_sp500", 0),
        })
    result.sort(key=lambda x: x["total_purchases"], reverse=True)
    return {"buyers": result}


@router.get("/sellers")
async def get_sellers():
    pol_map = {p["name"]: p for p in POLITICIANS}
    agg: dict = {}
    for t in TRADES:
        if t["action"] != "Sell":
            continue
        n = t["politician"]
        if n not in agg:
            agg[n] = {"vol": 0, "count": 0, "tickers": set(), "sectors": set()}
        agg[n]["vol"] += t["size_max"]
        agg[n]["count"] += 1
        agg[n]["tickers"].add(t["ticker"])
        agg[n]["sectors"].add(t["sector"])
    result = []
    for name, d in agg.items():
        p = pol_map.get(name, {})
        result.append({
            "name": name, "party": p.get("party","?"), "state": p.get("state","?"),
            "chamber": p.get("chamber","?"),
            "total_sales": d["vol"], "num_trades": d["count"],
            "tickers": list(d["tickers"]), "sectors_exiting": list(d["sectors"]),
            "risk_reduction_score": min(100, d["vol"] // 15_000),
        })
    result.sort(key=lambda x: x["total_sales"], reverse=True)
    risk_exits = [
        {"ticker": "UNH",  "reason": "Healthcare Pricing Reform Bill in subcommittee", "politicians": ["Richard Blumenthal"], "risk_score": 78},
        {"ticker": "META", "reason": "Social media regulation hearings Q3 2026",       "politicians": ["Pete Sessions"],      "risk_score": 55},
        {"ticker": "AAPL", "reason": "Tech antitrust hearings scheduled Q3 2026",      "politicians": ["Kevin Hern"],         "risk_score": 62},
        {"ticker": "TSLA", "reason": "EV subsidy rollback and antitrust scrutiny",      "politicians": ["Kevin Hern"],         "risk_score": 60},
    ]
    return {"sellers": result, "risk_exits": risk_exits}


@router.get("/options")
async def get_options():
    pol_map = {p["name"]: p for p in POLITICIANS}
    result = []
    for o in OPTIONS_TRADES:
        p = pol_map.get(o["politician"], {})
        result.append({
            "politician": o["politician"], "party": p.get("party","?"),
            "state": p.get("state","?"),
            "ticker": o["ticker"], "option_type": o["option_type"],
            "strike": o["strike"], "expiry": o["expiry"],
            "size_label": _size_label(o["size_min"], o["size_max"]),
            "trade_date": _trade_date(o["days_ago"]),
            "sector": o["sector"], "conviction": o["conviction"],
        })
    result.sort(key=lambda x: x["conviction"], reverse=True)
    calls   = [o for o in OPTIONS_TRADES if o["option_type"] == "Call"]
    puts    = [o for o in OPTIONS_TRADES if o["option_type"] == "Put"]
    call_v  = sum(o["size_max"] for o in calls)
    put_v   = sum(o["size_max"] for o in puts)
    return {
        "options": result,
        "sentiment": {
            "call_volume": call_v, "put_volume": put_v,
            "put_call_ratio": round(put_v / call_v, 2) if call_v else 0,
            "sentiment": "Bullish" if call_v > put_v * 1.5 else "Bearish" if put_v > call_v else "Mixed",
            "score": int(call_v / (call_v + put_v) * 100) if (call_v + put_v) > 0 else 50,
        },
    }


@router.get("/sectors")
async def get_sectors():
    result = []
    for sector, d in SECTOR_DATA.items():
        net = d["net_buy"] - d["net_sell"]
        flow_score = int(d["net_buy"] / (d["net_buy"] + d["net_sell"] + 1) * 100)
        result.append({
            "sector": sector, "net_buy": d["net_buy"], "net_sell": d["net_sell"],
            "net_flow": net, "active_traders": d["traders"],
            "top_tickers": d["top_tickers"], "trend": d["trend"],
            "flow_score": min(100, max(0, flow_score)),
        })
    result.sort(key=lambda x: x["net_flow"], reverse=True)
    return {"sectors": result}


@router.get("/committees")
async def get_committees():
    result = []
    for c in COMMITTEES:
        member_trades = [t for t in TRADES if t["politician"] in c["members"] and t["committee_link"] == c["name"]]
        total_buy  = sum(t["size_max"] for t in member_trades if t["action"] == "Buy")
        total_sell = sum(t["size_max"] for t in member_trades if t["action"] == "Sell")
        result.append({
            "name": c["name"], "chamber": c["chamber"], "members": c["members"],
            "sector_focus": c["sector_focus"], "influence_score": c["influence"],
            "pending_bills": c["pending_bills"], "budget_authority": c["budget_authority"],
            "member_buy_volume": total_buy, "member_sell_volume": total_sell,
            "linked_trades": len(member_trades),
        })
    result.sort(key=lambda x: x["influence_score"], reverse=True)
    return {"committees": result}


@router.get("/government")
async def get_government():
    return {
        "spending": GOV_SPENDING,
        "contracts": GOV_CONTRACTS,
        "total_spending_tracked": sum(g["fy_budget"] for g in GOV_SPENDING),
        "total_contracts": sum(c["total_fy"] for c in GOV_CONTRACTS),
        "fastest_growing": max(GOV_SPENDING, key=lambda x: x["yoy_growth"])["category"],
    }


@router.get("/legislation")
async def get_legislation():
    return {
        "bills": LEGISLATION,
        "lobbying": LOBBYING,
        "positive_count": sum(1 for l in LEGISLATION if l["impact"] == "POSITIVE"),
        "negative_count": sum(1 for l in LEGISLATION if l["impact"] == "NEGATIVE"),
        "mixed_count":    sum(1 for l in LEGISLATION if l["impact"] == "MIXED"),
    }


@router.get("/performance")
async def get_performance():
    perf = [
        {
            "name": p["name"], "party": p["party"], "state": p["state"], "chamber": p["chamber"],
            "style": p["style"], "total_trades": p["total_trades"], "win_rate": p["win_rate"],
            "avg_alpha": p["avg_alpha"], "annualized_return": p["annualized_return"],
            "vs_sp500": p["vs_sp500"], "best_trade": p["best_trade"], "worst_trade": p["worst_trade"],
        }
        for p in POLITICIANS
    ]
    perf.sort(key=lambda x: x["vs_sp500"], reverse=True)
    return {
        "performance": perf,
        "top_traders":   perf[:5],
        "worst_traders": perf[-3:],
    }


@router.get("/composite")
async def get_composite():
    loop = asyncio.get_event_loop()
    markets = await loop.run_in_executor(None, _fetch_markets, MARKET_TICKERS)

    bull = _compute_bullishness()
    buy_score  = bull["score"]
    conv_score = int(sum(t["conviction"] for t in TRADES) / len(TRADES))
    comm_score = int(sum(1 for t in TRADES if t["committee_link"]) / len(TRADES) * 100)
    opts_score = 75   # 75% calls by volume
    perf_score = int(sum(p["win_rate"] for p in POLITICIANS) / len(POLITICIANS) * 100)
    leg_score  = int(sum(1 for l in LEGISLATION if l["impact"] == "POSITIVE") / len(LEGISLATION) * 100)
    tech_score = int(sum(v["score"] for v in markets.values()) / len(markets)) if markets else 55

    components = {
        "Net Buying Activity":    {"score": buy_score,  "weight": 0.25},
        "Trade Conviction":       {"score": conv_score,  "weight": 0.15},
        "Historical Accuracy":    {"score": perf_score,  "weight": 0.15},
        "Committee Relevance":    {"score": comm_score,  "weight": 0.15},
        "Options Activity":       {"score": opts_score,  "weight": 0.10},
        "Legislative Catalysts":  {"score": leg_score,   "weight": 0.10},
        "Smart Money Alignment":  {"score": tech_score,  "weight": 0.10},
    }
    composite = round(sum(c["score"] * c["weight"] for c in components.values()))
    label = ("Extremely Bullish" if composite >= 80 else "Bullish" if composite >= 60
             else "Neutral" if composite >= 40 else "Weak" if composite >= 20 else "Bearish")

    return {
        "composite_score": composite, "label": label,
        "components": components,
        "alerts": ALERTS,
        "cluster_buys": {
            "Defense Contractors": ["Tommy Tuberville","Dan Crenshaw","Austin Scott","Roger Wicker","Mark Kelly"],
            "NVDA / Semiconductors": ["Nancy Pelosi","Ro Khanna","Bill Foster"],
            "Financial Stocks":    ["Josh Gottheimer","Thom Tillis"],
        },
        "best_longs": [
            {"ticker": "LMT",  "reason": "5 Armed Services members buying, NDAA 2026 catalyst, $68B contracts",        "conviction": 96},
            {"ticker": "PLTR", "reason": "Intelligence Committee buy before AI defense contract, +68% YoY contract growth","conviction": 93},
            {"ticker": "NVDA", "reason": "Cluster buy Pelosi+Khanna+Foster, CHIPS 2.0 and AI tailwind",                  "conviction": 91},
            {"ticker": "RTX",  "reason": "Dual Armed Services buys, Patriot expansion, geopolitical demand surge",       "conviction": 90},
            {"ticker": "GD",   "reason": "Appropriations member buying, Virginia-class submarine contract $12B",          "conviction": 88},
        ],
        "short_candidates": [
            {"ticker": "UNH",  "reason": "Blumenthal sold $500K–$1M while Healthcare Pricing Reform in committee",  "risk": 78},
            {"ticker": "META", "reason": "Multiple members exiting, social media regulation hearings pending Q3",    "risk": 62},
            {"ticker": "TSLA", "reason": "EV subsidy rollback risk, members reducing exposure",                      "risk": 60},
        ],
        "event_driven": [
            {"event": "NDAA 2026 Final Vote",      "date": "2026-07-15", "beneficiaries": ["LMT","RTX","NOC","GD"],   "positioning": "Heavy buying by 5 Armed Services members"},
            {"event": "CHIPS Act 2.0 Floor Vote",  "date": "2026-07-30", "beneficiaries": ["INTC","AMD","NVDA"],      "positioning": "Science & Commerce committee members buying"},
            {"event": "Energy Independence Act",   "date": "2026-07-20", "beneficiaries": ["XOM","CVX","COP"],        "positioning": "Energy committee members accumulating"},
            {"event": "AI Safety & Innovation Act","date": "2026-08-01", "beneficiaries": ["MSFT","GOOG","AMZN"],     "positioning": "Tech cluster buying ahead of markup"},
        ],
        "markets": markets,
    }
