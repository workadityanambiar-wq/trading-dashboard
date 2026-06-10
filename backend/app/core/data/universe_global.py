"""
Global equity universes: European top stocks and popular ETFs.
European tickers use exchange suffixes required by yfinance (.DE/.PA/.L/.AS/.SW/.MC/.MI).
"""
from __future__ import annotations
import pandas as pd

EUROPE_BENCHMARK = "^STOXX50E"
ETF_BENCHMARK = "SPY"

EURO_TOP = [
    # Germany
    {"ticker": "RHM.DE",  "name": "Rheinmetall",             "sector": "Industrials",            "country": "DE"},
    {"ticker": "SAP.DE",  "name": "SAP",                     "sector": "Information Technology", "country": "DE"},
    {"ticker": "SIE.DE",  "name": "Siemens",                 "sector": "Industrials",            "country": "DE"},
    {"ticker": "ALV.DE",  "name": "Allianz",                 "sector": "Financials",             "country": "DE"},
    {"ticker": "MBG.DE",  "name": "Mercedes-Benz",           "sector": "Automobiles",            "country": "DE"},
    {"ticker": "BMW.DE",  "name": "BMW",                     "sector": "Automobiles",            "country": "DE"},
    {"ticker": "DTE.DE",  "name": "Deutsche Telekom",        "sector": "Communication Services", "country": "DE"},
    {"ticker": "BAYN.DE", "name": "Bayer",                   "sector": "Health Care",            "country": "DE"},
    {"ticker": "VOW3.DE", "name": "Volkswagen",              "sector": "Automobiles",            "country": "DE"},
    {"ticker": "ADS.DE",  "name": "Adidas",                  "sector": "Consumer Discretionary", "country": "DE"},
    {"ticker": "MRK.DE",  "name": "Merck KGaA",              "sector": "Health Care",            "country": "DE"},
    {"ticker": "DBK.DE",  "name": "Deutsche Bank",           "sector": "Financials",             "country": "DE"},
    # France
    {"ticker": "MC.PA",   "name": "LVMH",                    "sector": "Consumer Discretionary", "country": "FR"},
    {"ticker": "OR.PA",   "name": "L'Oreal",                 "sector": "Consumer Staples",       "country": "FR"},
    {"ticker": "TTE.PA",  "name": "TotalEnergies",           "sector": "Energy",                 "country": "FR"},
    {"ticker": "AIR.PA",  "name": "Airbus",                  "sector": "Industrials",            "country": "FR"},
    {"ticker": "SAN.PA",  "name": "Sanofi",                  "sector": "Health Care",            "country": "FR"},
    {"ticker": "BNP.PA",  "name": "BNP Paribas",             "sector": "Financials",             "country": "FR"},
    {"ticker": "RMS.PA",  "name": "Hermes",                  "sector": "Consumer Discretionary", "country": "FR"},
    {"ticker": "KER.PA",  "name": "Kering",                  "sector": "Consumer Discretionary", "country": "FR"},
    {"ticker": "SU.PA",   "name": "Schneider Electric",      "sector": "Industrials",            "country": "FR"},
    {"ticker": "RI.PA",   "name": "Pernod Ricard",           "sector": "Consumer Staples",       "country": "FR"},
    # Netherlands
    {"ticker": "ASML.AS", "name": "ASML",                    "sector": "Information Technology", "country": "NL"},
    {"ticker": "INGA.AS", "name": "ING Group",               "sector": "Financials",             "country": "NL"},
    {"ticker": "PHIA.AS", "name": "Philips",                 "sector": "Health Care",            "country": "NL"},
    {"ticker": "AD.AS",   "name": "Ahold Delhaize",          "sector": "Consumer Staples",       "country": "NL"},
    # Switzerland
    {"ticker": "NESN.SW", "name": "Nestle",                  "sector": "Consumer Staples",       "country": "CH"},
    {"ticker": "NOVN.SW", "name": "Novartis",                "sector": "Health Care",            "country": "CH"},
    {"ticker": "ROG.SW",  "name": "Roche",                   "sector": "Health Care",            "country": "CH"},
    {"ticker": "UBSG.SW", "name": "UBS Group",               "sector": "Financials",             "country": "CH"},
    {"ticker": "ABBN.SW", "name": "ABB",                     "sector": "Industrials",            "country": "CH"},
    # UK
    {"ticker": "SHEL.L",  "name": "Shell",                   "sector": "Energy",                 "country": "GB"},
    {"ticker": "AZN.L",   "name": "AstraZeneca",             "sector": "Health Care",            "country": "GB"},
    {"ticker": "BP.L",    "name": "BP",                      "sector": "Energy",                 "country": "GB"},
    {"ticker": "HSBA.L",  "name": "HSBC",                    "sector": "Financials",             "country": "GB"},
    {"ticker": "ULVR.L",  "name": "Unilever",                "sector": "Consumer Staples",       "country": "GB"},
    {"ticker": "GSK.L",   "name": "GSK",                     "sector": "Health Care",            "country": "GB"},
    {"ticker": "RIO.L",   "name": "Rio Tinto",               "sector": "Materials",              "country": "GB"},
    {"ticker": "BA.L",    "name": "BAE Systems",             "sector": "Industrials",            "country": "GB"},
    {"ticker": "REL.L",   "name": "RELX",                    "sector": "Industrials",            "country": "GB"},
    {"ticker": "LSEG.L",  "name": "London Stock Exchange",   "sector": "Financials",             "country": "GB"},
    # Spain
    {"ticker": "SAN.MC",  "name": "Banco Santander",         "sector": "Financials",             "country": "ES"},
    {"ticker": "IBE.MC",  "name": "Iberdrola",               "sector": "Utilities",              "country": "ES"},
    {"ticker": "BBVA.MC", "name": "BBVA",                    "sector": "Financials",             "country": "ES"},
    # Italy
    {"ticker": "ENEL.MI", "name": "Enel",                    "sector": "Utilities",              "country": "IT"},
    {"ticker": "ENI.MI",  "name": "ENI",                     "sector": "Energy",                 "country": "IT"},
    {"ticker": "ISP.MI",  "name": "Intesa Sanpaolo",         "sector": "Financials",             "country": "IT"},
]

POPULAR_ETFS = [
    # Broad market
    {"ticker": "SPY",   "name": "SPDR S&P 500",                   "sector": "Broad Market"},
    {"ticker": "QQQ",   "name": "Invesco Nasdaq 100",             "sector": "Broad Market"},
    {"ticker": "IWM",   "name": "iShares Russell 2000",           "sector": "Broad Market"},
    {"ticker": "VTI",   "name": "Vanguard Total Market",          "sector": "Broad Market"},
    {"ticker": "DIA",   "name": "SPDR Dow Jones",                 "sector": "Broad Market"},
    # Technology / Semiconductors
    {"ticker": "SMH",   "name": "VanEck Semiconductor",           "sector": "Technology"},
    {"ticker": "SOXX",  "name": "iShares Semiconductor",          "sector": "Technology"},
    {"ticker": "DRAM",  "name": "Defiance Pure Semi ETF",         "sector": "Technology"},
    {"ticker": "XLK",   "name": "SPDR Technology",                "sector": "Technology"},
    {"ticker": "ARKK",  "name": "ARK Innovation",                 "sector": "Technology"},
    {"ticker": "ARKW",  "name": "ARK Next Generation Internet",   "sector": "Technology"},
    {"ticker": "SOXL",  "name": "Direxion 3x Semis Bull",        "sector": "Technology"},
    # US sectors
    {"ticker": "XLF",   "name": "SPDR Financials",                "sector": "Financials"},
    {"ticker": "XLV",   "name": "SPDR Health Care",               "sector": "Health Care"},
    {"ticker": "XLE",   "name": "SPDR Energy",                    "sector": "Energy"},
    {"ticker": "XLI",   "name": "SPDR Industrials",               "sector": "Industrials"},
    {"ticker": "XLP",   "name": "SPDR Consumer Staples",          "sector": "Consumer Staples"},
    {"ticker": "XLY",   "name": "SPDR Consumer Disc.",            "sector": "Consumer Discretionary"},
    {"ticker": "XLC",   "name": "SPDR Comm. Services",            "sector": "Communication Services"},
    {"ticker": "XLU",   "name": "SPDR Utilities",                 "sector": "Utilities"},
    {"ticker": "XLB",   "name": "SPDR Materials",                 "sector": "Materials"},
    {"ticker": "XLRE",  "name": "SPDR Real Estate",               "sector": "Real Estate"},
    # International
    {"ticker": "EEM",   "name": "iShares Emerging Markets",       "sector": "International"},
    {"ticker": "EFA",   "name": "iShares EAFE",                   "sector": "International"},
    {"ticker": "VWO",   "name": "Vanguard Emerging Markets",      "sector": "International"},
    {"ticker": "FXI",   "name": "iShares China Large-Cap",        "sector": "International"},
    {"ticker": "EWJ",   "name": "iShares Japan",                  "sector": "International"},
    {"ticker": "EWZ",   "name": "iShares Brazil",                 "sector": "International"},
    {"ticker": "EWY",   "name": "iShares South Korea",            "sector": "International"},
    {"ticker": "INDA",  "name": "iShares MSCI India",             "sector": "International"},
    # Fixed Income
    {"ticker": "TLT",   "name": "iShares 20+ Year Treasury",      "sector": "Fixed Income"},
    {"ticker": "IEF",   "name": "iShares 7-10 Year Treasury",     "sector": "Fixed Income"},
    {"ticker": "SHY",   "name": "iShares 1-3 Year Treasury",      "sector": "Fixed Income"},
    {"ticker": "HYG",   "name": "iShares High Yield Corp",        "sector": "Fixed Income"},
    {"ticker": "LQD",   "name": "iShares Investment Grade Corp",  "sector": "Fixed Income"},
    # Commodities
    {"ticker": "GLD",   "name": "SPDR Gold",                      "sector": "Commodities"},
    {"ticker": "SLV",   "name": "iShares Silver",                 "sector": "Commodities"},
    {"ticker": "USO",   "name": "US Oil Fund",                    "sector": "Commodities"},
    {"ticker": "DBA",   "name": "Invesco Agriculture Fund",       "sector": "Commodities"},
    # Dividend / Value
    {"ticker": "SCHD",  "name": "Schwab US Dividend Equity",      "sector": "Dividend"},
    {"ticker": "VYM",   "name": "Vanguard High Dividend Yield",   "sector": "Dividend"},
    {"ticker": "DGRO",  "name": "iShares Core Dividend Growth",   "sector": "Dividend"},
    # Thematic
    {"ticker": "BOTZ",  "name": "Global X Robotics & AI",         "sector": "Thematic"},
    {"ticker": "ICLN",  "name": "iShares Global Clean Energy",    "sector": "Thematic"},
    {"ticker": "DRIV",  "name": "Global X Autonomous & EV",       "sector": "Thematic"},
    {"ticker": "ESPO",  "name": "VanEck Video Gaming & eSports",  "sector": "Thematic"},
    # Leveraged / Inverse / Volatility
    {"ticker": "TQQQ",  "name": "ProShares UltraPro QQQ",         "sector": "Leveraged"},
    {"ticker": "UPRO",  "name": "ProShares UltraPro S&P500",      "sector": "Leveraged"},
    {"ticker": "SQQQ",  "name": "ProShares UltraPro Short QQQ",   "sector": "Inverse"},
    {"ticker": "VXX",   "name": "iPath S&P 500 VIX ST Futures",   "sector": "Volatility"},
]


def get_euro_top() -> pd.DataFrame:
    return pd.DataFrame(EURO_TOP)


def get_popular_etfs() -> pd.DataFrame:
    return pd.DataFrame(POPULAR_ETFS)
