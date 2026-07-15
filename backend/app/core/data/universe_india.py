"""
Indian equity universe.

  get_nifty50()   → static list (50 stocks, updated manually each quarter)
  get_nifty500()  → dynamic download from NSE archive CSV
  get_fo_eligible() → dynamic download from NSE F&O lot-size file

Tickers use the .NS suffix required by yfinance.
"""
from __future__ import annotations

import logging
from threading import Lock
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)

NIFTY_BENCHMARK  = "^NSEI"
INDIA_VIX        = "^INDIAVIX"

# ── NSE industry string → unified sector label ────────────────────────────────

_INDUSTRY_TO_SECTOR: dict[str, str] = {
    # Financials
    "BANKS":                                   "Financials",
    "FINANCE":                                 "Financials",
    "FINANCIAL SERVICES":                      "Financials",
    "HOUSING FINANCE":                         "Financials",
    "INSURANCE":                               "Financials",
    "CAPITAL MARKETS":                         "Financials",
    "FINANCIAL TECHNOLOGY (FINTECH)":          "Financials",
    # IT
    "IT":                                      "Information Technology",
    "IT ENABLED SERVICES":                     "Information Technology",
    "COMPUTER EDUCATION":                      "Information Technology",
    "SOFTWARE & SERVICES":                     "Information Technology",
    # Health Care
    "PHARMACEUTICALS":                         "Health Care",
    "PHARMACEUTICALS & BIOTECHNOLOGY":         "Health Care",
    "HEALTHCARE SERVICES":                     "Health Care",
    "HOSPITAL & HEALTHCARE SERVICES":          "Health Care",
    "HEALTHCARE":                              "Health Care",
    # Automobiles
    "AUTOMOBILES":                             "Automobiles",
    "AUTO COMPONENTS":                         "Automobiles",
    "AUTO ANCILLARIES":                        "Automobiles",
    "AUTOMOBILE":                              "Automobiles",
    # Consumer Discretionary
    "CONSUMER DURABLES":                       "Consumer Discretionary",
    "ENTERTAINMENT":                           "Consumer Discretionary",
    "RETAILING":                               "Consumer Discretionary",
    "RETAIL":                                  "Consumer Discretionary",
    "TEXTILE":                                 "Consumer Discretionary",
    "TEXTILES":                                "Consumer Discretionary",
    "HOTELS & RESTAURANTS":                    "Consumer Discretionary",
    "GEMS JEWELLERY AND WATCHES":              "Consumer Discretionary",
    "DIAMOND, GEMS AND JEWELLERY":             "Consumer Discretionary",
    "LEISURE SERVICES":                        "Consumer Discretionary",
    # Consumer Staples
    "FMCG":                                    "Consumer Staples",
    "FAST MOVING CONSUMER GOODS":              "Consumer Staples",
    "CONSUMER NON DURABLES":                   "Consumer Staples",
    "CIGARETTES":                              "Consumer Staples",
    "FOOD & BEVERAGES":                        "Consumer Staples",
    "BEVERAGES":                               "Consumer Staples",
    "SUGAR":                                   "Consumer Staples",
    "AGRICULTURAL FOOD & OTHER PRODUCTS":      "Consumer Staples",
    # Energy
    "OIL & GAS":                               "Energy",
    "PETROCHEMICALS":                          "Energy",
    "OIL":                                     "Energy",
    "GAS":                                     "Energy",
    "ENERGY":                                  "Energy",
    # Utilities
    "POWER":                                   "Utilities",
    "UTILITIES":                               "Utilities",
    "ELECTRIC UTILITIES":                      "Utilities",
    "GAS UTILITIES":                           "Utilities",
    # Materials
    "METALS":                                  "Materials",
    "METALS & MINING":                         "Materials",
    "MINING":                                  "Materials",
    "STEEL":                                   "Materials",
    "CHEMICALS":                               "Materials",
    "FERTILISERS":                             "Materials",
    "FERTILISERS & AGROCHEMICALS":             "Materials",
    "CEMENT":                                  "Materials",
    "CEMENT & CEMENT PRODUCTS":                "Materials",
    "PAINT":                                   "Materials",
    "PAPER":                                   "Materials",
    "GLASS":                                   "Materials",
    "AGRI & AGRO CHEMICALS":                   "Materials",
    "AGROCHEMICALS":                           "Materials",
    # Industrials
    "INDUSTRIAL MANUFACTURING":                "Industrials",
    "CAPITAL GOODS":                           "Industrials",
    "CONSTRUCTION":                            "Industrials",
    "ENGINEERING":                             "Industrials",
    "INFRASTRUCTURE DEVELOPERS & OPERATORS":   "Industrials",
    "INFRASTRUCTURE":                          "Industrials",
    "DEFENCE":                                 "Industrials",
    "AEROSPACE & DEFENCE":                     "Industrials",
    "TRANSPORT":                               "Industrials",
    "SHIPPING":                                "Industrials",
    "LOGISTICS":                               "Industrials",
    "DIVERSIFIED":                             "Industrials",
    "CONGLOMERATE":                            "Industrials",
    "INDUSTRIAL PRODUCTS":                     "Industrials",
    "ELECTRICAL EQUIPMENT":                    "Industrials",
    "DIVERSIFIED INDUSTRIALS":                 "Industrials",
    # Real Estate
    "REALTY":                                  "Real Estate",
    "REAL ESTATE":                             "Real Estate",
    # Communication Services
    "TELECOM":                                 "Communication Services",
    "TELECOMMUNICATION":                       "Communication Services",
    "MEDIA & ENTERTAINMENT":                   "Communication Services",
    "MEDIA":                                   "Communication Services",
    "BROADCASTING & CABLE TV":                 "Communication Services",
}


def _industry_to_sector(industry: str) -> str:
    return _INDUSTRY_TO_SECTOR.get(industry.upper().strip(), "Other")


# ── Nifty 50 — static (quarterly manual update) ───────────────────────────────

NIFTY50_STATIC = [
    {"ticker": "ADANIENT.NS",    "name": "Adani Enterprises",           "sector": "Industrials"},
    {"ticker": "ADANIPORTS.NS",  "name": "Adani Ports & SEZ",           "sector": "Industrials"},
    {"ticker": "APOLLOHOSP.NS",  "name": "Apollo Hospitals",            "sector": "Health Care"},
    {"ticker": "ASIANPAINT.NS",  "name": "Asian Paints",                "sector": "Materials"},
    {"ticker": "AXISBANK.NS",    "name": "Axis Bank",                   "sector": "Financials"},
    {"ticker": "BAJAJ-AUTO.NS",  "name": "Bajaj Auto",                  "sector": "Automobiles"},
    {"ticker": "BAJFINANCE.NS",  "name": "Bajaj Finance",               "sector": "Financials"},
    {"ticker": "BAJAJFINSV.NS",  "name": "Bajaj Finserv",               "sector": "Financials"},
    {"ticker": "BEL.NS",         "name": "Bharat Electronics",          "sector": "Industrials"},
    {"ticker": "BHARTIARTL.NS",  "name": "Bharti Airtel",               "sector": "Communication Services"},
    {"ticker": "BPCL.NS",        "name": "BPCL",                        "sector": "Energy"},
    {"ticker": "BRITANNIA.NS",   "name": "Britannia Industries",        "sector": "Consumer Staples"},
    {"ticker": "CIPLA.NS",       "name": "Cipla",                       "sector": "Health Care"},
    {"ticker": "COALINDIA.NS",   "name": "Coal India",                  "sector": "Energy"},
    {"ticker": "DRREDDY.NS",     "name": "Dr. Reddy's Laboratories",    "sector": "Health Care"},
    {"ticker": "EICHERMOT.NS",   "name": "Eicher Motors",               "sector": "Automobiles"},
    {"ticker": "GRASIM.NS",      "name": "Grasim Industries",           "sector": "Materials"},
    {"ticker": "HCLTECH.NS",     "name": "HCL Technologies",            "sector": "Information Technology"},
    {"ticker": "HDFCBANK.NS",    "name": "HDFC Bank",                   "sector": "Financials"},
    {"ticker": "HDFCLIFE.NS",    "name": "HDFC Life Insurance",         "sector": "Financials"},
    {"ticker": "HEROMOTOCO.NS",  "name": "Hero MotoCorp",               "sector": "Automobiles"},
    {"ticker": "HINDALCO.NS",    "name": "Hindalco Industries",         "sector": "Materials"},
    {"ticker": "HINDUNILVR.NS",  "name": "Hindustan Unilever",          "sector": "Consumer Staples"},
    {"ticker": "ICICIBANK.NS",   "name": "ICICI Bank",                  "sector": "Financials"},
    {"ticker": "INDUSINDBK.NS",  "name": "IndusInd Bank",               "sector": "Financials"},
    {"ticker": "INFY.NS",        "name": "Infosys",                     "sector": "Information Technology"},
    {"ticker": "ITC.NS",         "name": "ITC",                         "sector": "Consumer Staples"},
    {"ticker": "JSWSTEEL.NS",    "name": "JSW Steel",                   "sector": "Materials"},
    {"ticker": "KOTAKBANK.NS",   "name": "Kotak Mahindra Bank",         "sector": "Financials"},
    {"ticker": "LICI.NS",        "name": "LIC India",                   "sector": "Financials"},
    {"ticker": "LT.NS",          "name": "Larsen & Toubro",             "sector": "Industrials"},
    {"ticker": "M&M.NS",         "name": "Mahindra & Mahindra",         "sector": "Automobiles"},
    {"ticker": "MARUTI.NS",      "name": "Maruti Suzuki",               "sector": "Automobiles"},
    {"ticker": "NESTLEIND.NS",   "name": "Nestle India",                "sector": "Consumer Staples"},
    {"ticker": "NTPC.NS",        "name": "NTPC",                        "sector": "Utilities"},
    {"ticker": "ONGC.NS",        "name": "ONGC",                        "sector": "Energy"},
    {"ticker": "POWERGRID.NS",   "name": "Power Grid Corporation",      "sector": "Utilities"},
    {"ticker": "RELIANCE.NS",    "name": "Reliance Industries",         "sector": "Energy"},
    {"ticker": "SBILIFE.NS",     "name": "SBI Life Insurance",          "sector": "Financials"},
    {"ticker": "SBIN.NS",        "name": "State Bank of India",         "sector": "Financials"},
    {"ticker": "SHRIRAMFIN.NS",  "name": "Shriram Finance",             "sector": "Financials"},
    {"ticker": "SUNPHARMA.NS",   "name": "Sun Pharmaceutical",          "sector": "Health Care"},
    {"ticker": "TATACONSUM.NS",  "name": "Tata Consumer Products",      "sector": "Consumer Staples"},
    {"ticker": "TATAMOTORS.NS",  "name": "Tata Motors",                 "sector": "Automobiles"},
    {"ticker": "TATASTEEL.NS",   "name": "Tata Steel",                  "sector": "Materials"},
    {"ticker": "TCS.NS",         "name": "Tata Consultancy Services",   "sector": "Information Technology"},
    {"ticker": "TECHM.NS",       "name": "Tech Mahindra",               "sector": "Information Technology"},
    {"ticker": "TITANCOMPANY.NS","name": "Titan Company",               "sector": "Consumer Discretionary"},
    {"ticker": "TRENT.NS",       "name": "Trent",                       "sector": "Consumer Discretionary"},
    {"ticker": "ULTRACEMCO.NS",  "name": "UltraTech Cement",            "sector": "Materials"},
    {"ticker": "WIPRO.NS",       "name": "Wipro",                       "sector": "Information Technology"},
]


def get_nifty50() -> pd.DataFrame:
    return pd.DataFrame(NIFTY50_STATIC)


# ── Nifty 500 — dynamic from NSE archive CSV ──────────────────────────────────

_nifty500_cache: Optional[pd.DataFrame] = None
_nifty500_lock  = Lock()


def get_nifty500(force_refresh: bool = False) -> pd.DataFrame:
    """
    Download the Nifty 500 constituent list from NSE archive.
    Falls back to Nifty 50 on failure.
    Result is cached for the process lifetime (refresh on restart or force_refresh=True).
    """
    global _nifty500_cache
    if _nifty500_cache is not None and not force_refresh:
        return _nifty500_cache

    with _nifty500_lock:
        if _nifty500_cache is not None and not force_refresh:
            return _nifty500_cache

        from app.core.data.nse_client import fetch_nifty500_csv
        raw = fetch_nifty500_csv()

        if raw is not None:
            try:
                records = []
                for _, row in raw.iterrows():
                    symbol   = str(row.get("Symbol", "")).strip()
                    industry = str(row.get("Industry", "")).strip()
                    name     = str(row.get("Company Name", "")).strip()
                    if symbol and symbol.lower() != "nan":
                        records.append({
                            "ticker": f"{symbol}.NS",
                            "name":   name,
                            "sector": _industry_to_sector(industry),
                        })
                df = pd.DataFrame(records)
                logger.info("Loaded %d Nifty 500 constituents from NSE", len(df))
                _nifty500_cache = df
                return _nifty500_cache
            except Exception as exc:
                logger.error("Failed to parse Nifty 500 CSV: %s", exc)

        logger.warning("Nifty 500 fetch failed — falling back to Nifty 50")
        _nifty500_cache = get_nifty50()
        return _nifty500_cache


# ── F&O eligible stocks — dynamic from NSE lot-size file ─────────────────────

_fo_cache: Optional[pd.DataFrame] = None
_fo_lock  = Lock()


def get_fo_eligible(force_refresh: bool = False) -> pd.DataFrame:
    """
    Download the NSE F&O eligible stock list from the lot-size file.
    Returns DataFrame with columns: ticker (.NS suffix), symbol, lot_size, name, sector.
    """
    global _fo_cache
    if _fo_cache is not None and not force_refresh:
        return _fo_cache

    with _fo_lock:
        if _fo_cache is not None and not force_refresh:
            return _fo_cache

        from app.core.data.nse_client import fetch_fo_lot_sizes
        raw = fetch_fo_lot_sizes()

        if raw is not None:
            try:
                # fo_mktlots.csv has variable column names across NSE updates.
                # Typical columns: UNDERLYING, SYMBOL, LOT SIZE (or variations)
                cols = {c.strip().upper(): c for c in raw.columns}
                symbol_col = next(
                    (cols[k] for k in ["SYMBOL", "UNDERLYING", "SCRIP SYMBOL"] if k in cols),
                    None,
                )
                lot_col = next(
                    (cols[k] for k in ["LOT SIZE", "LOTSIZE", "MARKET LOT"] if k in cols),
                    None,
                )
                if symbol_col is None:
                    raise ValueError(f"No symbol column found in fo_mktlots.csv. Columns: {list(raw.columns)}")

                records = []
                # Build a sector lookup from Nifty 500
                nifty500 = get_nifty500()
                sector_map = nifty500.set_index("ticker")["sector"].to_dict()

                for _, row in raw.iterrows():
                    symbol = str(row[symbol_col]).strip().upper()
                    if not symbol or symbol.lower() in ("nan", "symbol", "underlying"):
                        continue
                    # Skip index rows (NIFTY, BANKNIFTY, etc.) — handle separately
                    if "-" in symbol or len(symbol) > 15:
                        continue
                    ns_ticker = f"{symbol}.NS"
                    records.append({
                        "ticker":   ns_ticker,
                        "symbol":   symbol,
                        "lot_size": int(row[lot_col]) if lot_col and str(row[lot_col]).isdigit() else None,
                        "sector":   sector_map.get(ns_ticker, "Other"),
                    })

                df = pd.DataFrame(records).drop_duplicates("symbol").reset_index(drop=True)
                logger.info("Loaded %d F&O eligible stocks from NSE", len(df))
                _fo_cache = df
                return _fo_cache
            except Exception as exc:
                logger.error("Failed to parse F&O lot-size CSV: %s", exc)

        logger.warning("F&O lot-size fetch failed — returning empty DataFrame")
        _fo_cache = pd.DataFrame(columns=["ticker", "symbol", "lot_size", "sector"])
        return _fo_cache
