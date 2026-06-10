"""
Indian equity universe — Nifty 50 constituents.
Tickers use the NSE (.NS) suffix required by yfinance.
Update periodically as NSE reconstitutes the index.
"""
from __future__ import annotations
import pandas as pd

NIFTY_BENCHMARK = "^NSEI"

NIFTY50 = [
    {"ticker": "ADANIENT.NS",    "name": "Adani Enterprises",          "sector": "Industrials"},
    {"ticker": "ADANIPORTS.NS",  "name": "Adani Ports & SEZ",          "sector": "Industrials"},
    {"ticker": "APOLLOHOSP.NS",  "name": "Apollo Hospitals",           "sector": "Health Care"},
    {"ticker": "ASIANPAINT.NS",  "name": "Asian Paints",               "sector": "Materials"},
    {"ticker": "AXISBANK.NS",    "name": "Axis Bank",                  "sector": "Financials"},
    {"ticker": "BAJAJ-AUTO.NS",  "name": "Bajaj Auto",                 "sector": "Automobiles"},
    {"ticker": "BAJFINANCE.NS",  "name": "Bajaj Finance",              "sector": "Financials"},
    {"ticker": "BAJAJFINSV.NS",  "name": "Bajaj Finserv",              "sector": "Financials"},
    {"ticker": "BEL.NS",         "name": "Bharat Electronics",         "sector": "Industrials"},
    {"ticker": "BHARTIARTL.NS",  "name": "Bharti Airtel",              "sector": "Communication Services"},
    {"ticker": "BPCL.NS",        "name": "BPCL",                       "sector": "Energy"},
    {"ticker": "BRITANNIA.NS",   "name": "Britannia Industries",       "sector": "Consumer Staples"},
    {"ticker": "CIPLA.NS",       "name": "Cipla",                      "sector": "Health Care"},
    {"ticker": "COALINDIA.NS",   "name": "Coal India",                 "sector": "Energy"},
    {"ticker": "DRREDDY.NS",     "name": "Dr. Reddy's Laboratories",   "sector": "Health Care"},
    {"ticker": "EICHERMOT.NS",   "name": "Eicher Motors",              "sector": "Automobiles"},
    {"ticker": "GRASIM.NS",      "name": "Grasim Industries",          "sector": "Materials"},
    {"ticker": "HCLTECH.NS",     "name": "HCL Technologies",           "sector": "Information Technology"},
    {"ticker": "HDFCBANK.NS",    "name": "HDFC Bank",                  "sector": "Financials"},
    {"ticker": "HDFCLIFE.NS",    "name": "HDFC Life Insurance",        "sector": "Financials"},
    {"ticker": "HEROMOTOCO.NS",  "name": "Hero MotoCorp",              "sector": "Automobiles"},
    {"ticker": "HINDALCO.NS",    "name": "Hindalco Industries",        "sector": "Materials"},
    {"ticker": "HINDUNILVR.NS",  "name": "Hindustan Unilever",         "sector": "Consumer Staples"},
    {"ticker": "ICICIBANK.NS",   "name": "ICICI Bank",                 "sector": "Financials"},
    {"ticker": "INDUSINDBK.NS",  "name": "IndusInd Bank",              "sector": "Financials"},
    {"ticker": "INFY.NS",        "name": "Infosys",                    "sector": "Information Technology"},
    {"ticker": "ITC.NS",         "name": "ITC",                        "sector": "Consumer Staples"},
    {"ticker": "JSWSTEEL.NS",    "name": "JSW Steel",                  "sector": "Materials"},
    {"ticker": "KOTAKBANK.NS",   "name": "Kotak Mahindra Bank",        "sector": "Financials"},
    {"ticker": "LICI.NS",        "name": "LIC India",                  "sector": "Financials"},
    {"ticker": "LT.NS",          "name": "Larsen & Toubro",            "sector": "Industrials"},
    {"ticker": "M&M.NS",         "name": "Mahindra & Mahindra",        "sector": "Automobiles"},
    {"ticker": "MARUTI.NS",      "name": "Maruti Suzuki",              "sector": "Automobiles"},
    {"ticker": "NESTLEIND.NS",   "name": "Nestle India",               "sector": "Consumer Staples"},
    {"ticker": "NTPC.NS",        "name": "NTPC",                       "sector": "Utilities"},
    {"ticker": "ONGC.NS",        "name": "ONGC",                       "sector": "Energy"},
    {"ticker": "POWERGRID.NS",   "name": "Power Grid Corporation",     "sector": "Utilities"},
    {"ticker": "RELIANCE.NS",    "name": "Reliance Industries",        "sector": "Energy"},
    {"ticker": "SBILIFE.NS",     "name": "SBI Life Insurance",         "sector": "Financials"},
    {"ticker": "SBIN.NS",        "name": "State Bank of India",        "sector": "Financials"},
    {"ticker": "SHRIRAMFIN.NS",  "name": "Shriram Finance",            "sector": "Financials"},
    {"ticker": "SUNPHARMA.NS",   "name": "Sun Pharmaceutical",         "sector": "Health Care"},
    {"ticker": "TATACONSUM.NS",  "name": "Tata Consumer Products",     "sector": "Consumer Staples"},
    {"ticker": "TATAMOTORS.NS",  "name": "Tata Motors",                "sector": "Automobiles"},
    {"ticker": "TATASTEEL.NS",   "name": "Tata Steel",                 "sector": "Materials"},
    {"ticker": "TCS.NS",         "name": "Tata Consultancy Services",  "sector": "Information Technology"},
    {"ticker": "TECHM.NS",       "name": "Tech Mahindra",              "sector": "Information Technology"},
    {"ticker": "TITANCOMPANY.NS","name": "Titan Company",              "sector": "Consumer Discretionary"},
    {"ticker": "TRENT.NS",       "name": "Trent",                      "sector": "Consumer Discretionary"},
    {"ticker": "ULTRACEMCO.NS",  "name": "UltraTech Cement",           "sector": "Materials"},
    {"ticker": "WIPRO.NS",       "name": "Wipro",                      "sector": "Information Technology"},
]


def get_nifty50() -> pd.DataFrame:
    return pd.DataFrame(NIFTY50)
