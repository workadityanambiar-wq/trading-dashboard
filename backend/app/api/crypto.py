from __future__ import annotations

import asyncio
import time
from datetime import datetime, timedelta

import pandas as pd
import yfinance as yf
from fastapi import APIRouter

router = APIRouter()

# ── Tickers ────────────────────────────────────────────────────────────────────
CRYPTO_TICKERS  = ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "AVAX-USD", "XRP-USD", "ADA-USD", "LINK-USD"]
ETF_BTC_TICKERS = ["IBIT", "FBTC", "ARKB", "GBTC", "BITB"]
ETF_ETH_TICKERS = ["ETHA", "FETH"]
MINER_TICKERS   = ["MARA", "RIOT", "CLSK", "CORZ", "BTDR"]
PROXY_TICKERS   = ["MSTR", "COIN", "SQ", "HOOD"]

_ALL = CRYPTO_TICKERS + ETF_BTC_TICKERS + ETF_ETH_TICKERS + MINER_TICKERS + PROXY_TICKERS

_mkt_cache: dict = {}
_CACHE_TTL = 300

# ── Curated data ───────────────────────────────────────────────────────────────

ONCHAIN_BTC = {
    "mvrv_zscore": 2.34, "sopr": 1.024, "nupl": 0.51,
    "realized_cap_b": 412.5, "supply_in_profit_pct": 76.4,
    "active_addresses_24h": 892_400,
    "exchange_outflow_btc": 24_500, "exchange_inflow_btc": 19_800,
    "net_exchange_flow_btc": -4_700,
    "hash_rate_eh": 682.4, "difficulty": 9.41e13,
    "miner_revenue_usd_24h": 42_800_000,
    "ssr": 8.2, "hodl_wave_1y_pct": 68.3,
    "illiquid_supply_pct": 76.1, "rhodl_ratio": 1.24,
    "longterm_holder_pct": 71.4, "shortterm_holder_pct": 28.6,
    "puell_multiple": 0.82,
    "history_mvrv": [1.84, 1.92, 2.08, 2.18, 2.24, 2.34],
    "history_nupl":  [0.40, 0.42, 0.46, 0.48, 0.50, 0.51],
    "history_labels": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
}

ONCHAIN_ETH = {
    "mvrv_zscore": 1.87, "sopr": 1.018, "nupl": 0.44,
    "realized_cap_b": 234.8, "supply_in_profit_pct": 68.2,
    "active_addresses_24h": 524_600,
    "exchange_outflow_eth": 82_400, "exchange_inflow_eth": 74_200,
    "net_exchange_flow_eth": -8_200,
    "staking_rate_pct": 28.4, "staked_eth": 34_200_000,
    "burn_rate_eth_day": 2_140, "supply_growth_annualized": -0.34,
    "gas_gwei_avg": 18.4, "l2_tvl_b": 42.8,
    "validators": 1_050_000, "staking_yield": 3.8,
    "history_staked": [28.1, 28.2, 28.3, 28.3, 28.4, 28.4],
    "history_burn":   [2480, 2210, 1980, 2140, 2240, 2140],
    "history_labels": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
}

DEFI_PROTOCOLS = [
    {"name": "Lido",          "ticker": "LDO",    "category": "Liquid Staking",  "tvl_b": 23.4, "tvl_chg_7d": 2.3,   "rev_ann_m": 284, "mcap_b": 1.2,  "ps": 4.2,   "chain": "Ethereum",  "dominance_pct": 31.2},
    {"name": "AAVE",          "ticker": "AAVE",   "category": "Lending",          "tvl_b": 12.8, "tvl_chg_7d": 1.7,   "rev_ann_m": 156, "mcap_b": 2.1,  "ps": 13.5,  "chain": "Multi",     "dominance_pct": 17.1},
    {"name": "Uniswap",       "ticker": "UNI",    "category": "DEX",              "tvl_b": 5.8,  "tvl_chg_7d": 3.2,   "rev_ann_m": 842, "mcap_b": 3.8,  "ps": 4.5,   "chain": "Multi",     "dominance_pct": 7.7},
    {"name": "MakerDAO",      "ticker": "MKR",    "category": "CDP",              "tvl_b": 8.4,  "tvl_chg_7d": 0.8,   "rev_ann_m": 218, "mcap_b": 1.8,  "ps": 8.3,   "chain": "Ethereum",  "dominance_pct": 11.2},
    {"name": "Pendle",        "ticker": "PENDLE", "category": "Yield Trading",    "tvl_b": 5.2,  "tvl_chg_7d": 8.4,   "rev_ann_m": 84,  "mcap_b": 0.82, "ps": 9.8,   "chain": "Multi",     "dominance_pct": 6.9},
    {"name": "Curve",         "ticker": "CRV",    "category": "DEX/Stableswap",   "tvl_b": 4.1,  "tvl_chg_7d": 1.1,   "rev_ann_m": 72,  "mcap_b": 0.54, "ps": 7.5,   "chain": "Multi",     "dominance_pct": 5.5},
    {"name": "GMX",           "ticker": "GMX",    "category": "Perp DEX",         "tvl_b": 0.64, "tvl_chg_7d": 4.2,   "rev_ann_m": 112, "mcap_b": 0.54, "ps": 4.8,   "chain": "Arbitrum",  "dominance_pct": 0.9},
    {"name": "Hyperliquid",   "ticker": "HYPE",   "category": "Perp DEX",         "tvl_b": 0.38, "tvl_chg_7d": 12.4,  "rev_ann_m": 86,  "mcap_b": 8.2,  "ps": 95.3,  "chain": "Custom L1", "dominance_pct": 0.5},
    {"name": "Compound",      "ticker": "COMP",   "category": "Lending",          "tvl_b": 2.4,  "tvl_chg_7d": -0.4,  "rev_ann_m": 34,  "mcap_b": 0.36, "ps": 10.6,  "chain": "Multi",     "dominance_pct": 3.2},
    {"name": "EigenLayer",    "ticker": "EIGEN",  "category": "Restaking",        "tvl_b": 14.8, "tvl_chg_7d": 5.2,   "rev_ann_m": 18,  "mcap_b": 1.2,  "ps": 66.7,  "chain": "Ethereum",  "dominance_pct": 19.7},
]

STABLECOINS = [
    {"name": "Tether USDT",   "symbol": "USDT",  "type": "Fiat-backed",           "mcap_b": 114.2, "chg_30d": 2.8,   "reserves": True,  "quality": "Moderate", "vol_24h_b": 84.2, "peg_bps": 4,  "share_pct": 63.4},
    {"name": "USD Coin",      "symbol": "USDC",  "type": "Fiat-backed",           "mcap_b": 44.8,  "chg_30d": 5.4,   "reserves": True,  "quality": "High",     "vol_24h_b": 12.4, "peg_bps": 2,  "share_pct": 24.9},
    {"name": "Ethena USDe",   "symbol": "USDE",  "type": "Synthetic/Delta-neutral","mcap_b": 7.8,  "chg_30d": 14.2,  "reserves": True,  "quality": "Novel",    "vol_24h_b": 1.4,  "peg_bps": 6,  "share_pct": 4.3},
    {"name": "Dai",           "symbol": "DAI",   "type": "CDP",                   "mcap_b": 5.2,   "chg_30d": -1.2,  "reserves": True,  "quality": "High",     "vol_24h_b": 0.84, "peg_bps": 3,  "share_pct": 2.9},
    {"name": "PayPal USD",    "symbol": "PYUSD", "type": "Fiat-backed",           "mcap_b": 0.64,  "chg_30d": 18.4,  "reserves": True,  "quality": "High",     "vol_24h_b": 0.12, "peg_bps": 2,  "share_pct": 0.4},
    {"name": "Frax",          "symbol": "FRAX",  "type": "Algorithmic-hybrid",    "mcap_b": 0.82,  "chg_30d": -4.8,  "reserves": True,  "quality": "Moderate", "vol_24h_b": 0.14, "peg_bps": 8,  "share_pct": 0.5},
]

MINING_POOLS = [
    {"name": "Foundry USA",   "ticker": None,   "hash_rate_eh": 84.2,  "share_pct": 12.3, "listed": False},
    {"name": "AntPool",       "ticker": None,   "hash_rate_eh": 76.8,  "share_pct": 11.3, "listed": False},
    {"name": "F2Pool",        "ticker": None,   "hash_rate_eh": 54.4,  "share_pct": 8.0,  "listed": False},
    {"name": "ViaBTC",        "ticker": None,   "hash_rate_eh": 42.8,  "share_pct": 6.3,  "listed": False},
    {"name": "Binance Pool",  "ticker": None,   "hash_rate_eh": 38.4,  "share_pct": 5.6,  "listed": False},
]

LISTED_MINERS = [
    {"name": "Marathon Digital", "ticker": "MARA", "hash_rate_eh": 28.4, "share_pct": 4.2, "energy_cost_kwh": 0.038, "breakeven_btc": 38400, "btc_held": 24700, "ai_pivot": False},
    {"name": "CleanSpark",       "ticker": "CLSK", "hash_rate_eh": 22.8, "share_pct": 3.3, "energy_cost_kwh": 0.031, "breakeven_btc": 36200, "btc_held": 11200, "ai_pivot": False},
    {"name": "Riot Platforms",   "ticker": "RIOT", "hash_rate_eh": 24.1, "share_pct": 3.5, "energy_cost_kwh": 0.025, "breakeven_btc": 34800, "btc_held": 18000, "ai_pivot": True},
    {"name": "Core Scientific",  "ticker": "CORZ", "hash_rate_eh": 20.4, "share_pct": 3.0, "energy_cost_kwh": 0.029, "breakeven_btc": 35600, "btc_held": 8200,  "ai_pivot": True},
    {"name": "Bitdeer",          "ticker": "BTDR", "hash_rate_eh": 18.2, "share_pct": 2.7, "energy_cost_kwh": 0.028, "breakeven_btc": 37800, "btc_held": 4800,  "ai_pivot": False},
]

L1_L2 = [
    {"name": "Ethereum",  "ticker": "ETH-USD", "type": "L1",          "tps": 28,   "active_devs": 5840, "dapps": 4200, "tvl_b": 48.2, "fees_7d_m": 24.4, "staking_yield": 3.8,  "l2_count": 42, "score": 94},
    {"name": "Solana",    "ticker": "SOL-USD", "type": "L1",          "tps": 2800, "active_devs": 1840, "dapps": 680,  "tvl_b": 8.4,  "fees_7d_m": 4.8,  "staking_yield": 7.2,  "l2_count": 0,  "score": 78},
    {"name": "BNB Chain", "ticker": "BNB-USD", "type": "L1",          "tps": 380,  "active_devs": 920,  "dapps": 1200, "tvl_b": 6.2,  "fees_7d_m": 2.8,  "staking_yield": 4.4,  "l2_count": 2,  "score": 68},
    {"name": "Avalanche", "ticker": "AVAX-USD","type": "L1",          "tps": 2000, "active_devs": 480,  "dapps": 340,  "tvl_b": 1.8,  "fees_7d_m": 0.84, "staking_yield": 8.1,  "l2_count": 0,  "score": 62},
    {"name": "Arbitrum",  "ticker": None,      "type": "L2 (Ethereum)","tps": 840, "active_devs": 1240, "dapps": 620,  "tvl_b": 14.8, "fees_7d_m": 1.4,  "staking_yield": None, "l2_count": 0,  "score": 82},
    {"name": "Base",      "ticker": None,      "type": "L2 (Ethereum)","tps": 640, "active_devs": 1840, "dapps": 420,  "tvl_b": 8.2,  "fees_7d_m": 0.84, "staking_yield": None, "l2_count": 0,  "score": 80},
    {"name": "Optimism",  "ticker": None,      "type": "L2 (Ethereum)","tps": 420, "active_devs": 840,  "dapps": 280,  "tvl_b": 6.4,  "fees_7d_m": 0.62, "staking_yield": None, "l2_count": 0,  "score": 74},
    {"name": "Polygon",   "ticker": "MATIC-USD","type":"L2/Sidechain", "tps": 650, "active_devs": 740,  "dapps": 380,  "tvl_b": 1.2,  "fees_7d_m": 0.28, "staking_yield": 5.2,  "l2_count": 0,  "score": 61},
]

INSTITUTIONAL = [
    {"entity": "MicroStrategy (MSTR)", "ticker": "MSTR",    "type": "Corporate",     "btc_held": 226500, "avg_price": 38423, "value_b": 14.8, "pnl_pct":  70.4},
    {"entity": "Marathon Digital",     "ticker": "MARA",    "type": "Miner",         "btc_held": 24700,  "avg_price": 58200, "value_b": 1.61, "pnl_pct": -23.4},
    {"entity": "Riot Platforms",       "ticker": "RIOT",    "type": "Miner",         "btc_held": 18000,  "avg_price": 52400, "value_b": 1.18, "pnl_pct": -16.9},
    {"entity": "Tesla (TSLA)",         "ticker": "TSLA",    "type": "Corporate",     "btc_held": 11509,  "avg_price": 34400, "value_b": 0.75, "pnl_pct":  71.9},
    {"entity": "Galaxy Digital",       "ticker": "GLXY.TO", "type": "Crypto Finance","btc_held": 18200,  "avg_price": 28400, "value_b": 1.19, "pnl_pct": 116.2},
    {"entity": "Coinbase (COIN)",      "ticker": "COIN",    "type": "Exchange",      "btc_held": 9000,   "avg_price": 24800, "value_b": 0.59, "pnl_pct": 165.2},
    {"entity": "Block Inc (SQ)",       "ticker": "SQ",      "type": "Corporate",     "btc_held": 8038,   "avg_price": 29300, "value_b": 0.53, "pnl_pct":  44.4},
]

VC_PIPELINE = [
    {"company": "Kraken",          "sector": "Exchange",     "val_b": 10.8, "stage": "Pre-IPO",  "ipo_prob": 0.70, "window": "2026"},
    {"company": "Stripe",          "sector": "Payments",     "val_b": 70.0, "stage": "Pre-IPO",  "ipo_prob": 0.65, "window": "2025-2026"},
    {"company": "Ripple",          "sector": "XRP/Payments", "val_b": 11.0, "stage": "Pre-IPO",  "ipo_prob": 0.55, "window": "2026"},
    {"company": "Anchorage Digital","sector": "Custody",     "val_b": 3.0,  "stage": "Series D", "ipo_prob": 0.40, "window": "2027"},
    {"company": "Figure",          "sector": "Blockchain Finance","val_b": 1.2,"stage": "Series D","ipo_prob": 0.45,"window": "2026-2027"},
    {"company": "EigenLayer",      "sector": "Restaking",    "val_b": 2.0,  "stage": "Series C", "ipo_prob": 0.20, "window": "2028+"},
    {"company": "Aztec Network",   "sector": "ZK Privacy",   "val_b": 0.5,  "stage": "Series B", "ipo_prob": 0.15, "window": "2028+"},
]

DERIVATIVES = {
    "btc": {
        "oi_b": 28.4, "oi_chg_24h": 2.8,
        "funding_rate_8h": 0.0082, "ann_funding": 8.98,
        "liq_long_24h_m": 42.4, "liq_short_24h_m": 28.2,
        "options_oi_b": 24.8, "call_pct": 58.4, "put_call_ratio": 0.72,
        "max_pain": 62000, "iv_30d": 68.4, "iv_90d": 62.2,
        "iv_skew": -8.4, "term_structure": "Contango",
        "basis_3m_ann": 12.4, "cme_oi_b": 8.4,
    },
    "eth": {
        "oi_b": 14.2, "oi_chg_24h": 1.4,
        "funding_rate_8h": 0.0064, "ann_funding": 7.01,
        "liq_long_24h_m": 18.4, "liq_short_24h_m": 12.8,
        "options_oi_b": 12.4, "call_pct": 54.2, "put_call_ratio": 0.84,
        "max_pain": 2800, "iv_30d": 72.4, "iv_90d": 64.8,
        "iv_skew": -6.2, "term_structure": "Contango",
        "basis_3m_ann": 10.8, "cme_oi_b": 2.8,
    },
}

BTC_ETFS = [
    {"name": "iShares Bitcoin Trust",   "ticker": "IBIT",  "issuer": "BlackRock",   "aum_b": 42.8, "btc_held": 554000,  "daily_flow_m": 184, "fee_pct": 0.25, "prem_bps": 4},
    {"name": "Fidelity Bitcoin ETF",    "ticker": "FBTC",  "issuer": "Fidelity",    "aum_b": 18.4, "btc_held": 238000,  "daily_flow_m": 82,  "fee_pct": 0.25, "prem_bps": 2},
    {"name": "ARK 21Shares Bitcoin",    "ticker": "ARKB",  "issuer": "ARK/21Shares","aum_b": 4.8,  "btc_held": 62000,   "daily_flow_m": 18,  "fee_pct": 0.21, "prem_bps": 8},
    {"name": "Grayscale Bitcoin Trust", "ticker": "GBTC",  "issuer": "Grayscale",   "aum_b": 20.4, "btc_held": 264000,  "daily_flow_m": -42, "fee_pct": 1.50, "prem_bps": -120},
    {"name": "Bitwise Bitcoin ETF",     "ticker": "BITB",  "issuer": "Bitwise",     "aum_b": 4.2,  "btc_held": 54000,   "daily_flow_m": 12,  "fee_pct": 0.20, "prem_bps": 6},
]

ETH_ETFS = [
    {"name": "iShares Ethereum Trust",  "ticker": "ETHA",  "issuer": "BlackRock", "aum_b": 2.8, "eth_held": 720000,  "daily_flow_m": 14,  "fee_pct": 0.25, "prem_bps": 8},
    {"name": "Fidelity Ethereum Fund",  "ticker": "FETH",  "issuer": "Fidelity",  "aum_b": 1.2, "eth_held": 310000,  "daily_flow_m": 6,   "fee_pct": 0.25, "prem_bps": 4},
]

RWA_DATA = [
    {"name": "BlackRock BUIDL",  "ticker": "BUIDL",  "cat": "Tokenized T-Bills",  "tvl_b": 0.48, "growth_90d": 840.0, "yield_pct": 5.08},
    {"name": "Ondo Finance",     "ticker": "ONDO",   "cat": "US Treasuries",      "tvl_b": 2.8,  "growth_90d": 184.2, "yield_pct": 5.12},
    {"name": "Maple Finance",    "ticker": "MPL",    "cat": "Private Credit",     "tvl_b": 0.82, "growth_90d": 68.4,  "yield_pct": 12.4},
    {"name": "Centrifuge",       "ticker": "CFG",    "cat": "Real-World Assets",  "tvl_b": 0.54, "growth_90d": 42.8,  "yield_pct": 8.4},
    {"name": "Goldfinch",        "ticker": "GFI",    "cat": "EM Credit",          "tvl_b": 0.11, "growth_90d": -8.4,  "yield_pct": 14.2},
]

MACRO = {
    "btc_gold_90d": 0.42, "btc_nasdaq_90d": 0.68, "btc_sp500_90d": 0.64,
    "btc_dxy_90d": -0.48, "btc_10y_90d": -0.38,   "btc_m2_90d": 0.58,
    "fear_greed": 72, "fear_greed_label": "Greed",
    "google_trends": 64, "social_volume_24h": 142000,
    "sentiment_score": 68.4, "global_liquidity_b": 108_400,
    "global_liquidity_chg_90d": 3.8,
    "cycle_phase": "Bull Market",
    "tailwinds": [
        "Fed rate cut expectations in Q1 2026",
        "M2 money supply expansion +4.2% YoY",
        "BTC spot ETF institutional inflows accelerating",
        "Regulatory clarity post-FIT21 and SAB 121 repeal",
        "Dollar weakening cycle supportive for hard assets",
    ],
    "headwinds": [
        "Global recession risk elevated 42%",
        "Geopolitical risk events → risk-off flows",
        "Tether reserve audit pending",
        "EU MiCA regulatory implementation friction",
    ],
}

ALERTS = [
    {"id": "C1", "priority": "CRITICAL", "title": "BTC MVRV Z-Score entering Euphoria Zone", "detail": "Z-score at 2.34 — historically precedes 30-60% corrections within 6 months", "tickers": ["IBIT", "FBTC", "MSTR"]},
    {"id": "C2", "priority": "HIGH",     "title": "BTC spot ETF inflows hit $1.84B weekly record", "detail": "BlackRock IBIT leads with $184M daily — institutional accumulation accelerating", "tickers": ["IBIT", "FBTC", "ARKB"]},
    {"id": "C3", "priority": "HIGH",     "title": "Stablecoin supply growth +12% 30d", "detail": "USDT+USDC combined market cap hit $159B — dry powder for potential rally", "tickers": ["COIN", "HOOD"]},
    {"id": "C4", "priority": "HIGH",     "title": "ETH/BTC dominance breakdown below 0.05", "detail": "ETH underperforming BTC sharply — altcoin rotation risk elevated", "tickers": ["ETHA", "FETH"]},
    {"id": "C5", "priority": "MEDIUM",   "title": "BTC futures funding rate elevated at +0.82% 8h", "detail": "Crowded longs — mean reversion risk elevated", "tickers": ["IBIT", "MSTR"]},
    {"id": "C6", "priority": "MEDIUM",   "title": "Ethereum staking yield declining to 3.8%", "detail": "Validator queue saturation — marginal stakers may exit", "tickers": ["ETHA"]},
    {"id": "C7", "priority": "MEDIUM",   "title": "Miner selling pressure elevated post-halving", "detail": "MARA, RIOT, CLSK may face margin pressure at current BTC price", "tickers": ["MARA", "RIOT", "CLSK"]},
]

# ── Market data helpers ────────────────────────────────────────────────────────

def _fetch_markets(tickers: list[str]) -> dict:
    end   = datetime.today()
    start = (end - timedelta(days=365)).strftime("%Y-%m-%d")
    raw   = yf.download(tickers, start=start, end=end.strftime("%Y-%m-%d"),
                        auto_adjust=True, progress=False)
    cl    = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw
    hi    = raw["High"]  if isinstance(raw.columns, pd.MultiIndex) else raw
    lo    = raw["Low"]   if isinstance(raw.columns, pd.MultiIndex) else raw
    result: dict = {}
    for tkr in tickers:
        try:
            s = cl[tkr].dropna() if isinstance(cl, pd.DataFrame) else cl.dropna()
            h = hi[tkr].dropna() if isinstance(hi, pd.DataFrame) else hi.dropna()
            l = lo[tkr].dropna() if isinstance(lo, pd.DataFrame) else lo.dropna()
            if len(s) < 20:
                continue
            price   = float(s.iloc[-1])
            chg_1d  = float((s.iloc[-1] / s.iloc[-2] - 1) * 100) if len(s) >= 2  else 0.0
            chg_7d  = float((s.iloc[-1] / s.iloc[-6] - 1) * 100) if len(s) >= 6  else 0.0
            chg_30d = float((s.iloc[-1] / s.iloc[-21] - 1) * 100) if len(s) >= 21 else 0.0
            chg_1y  = float((s.iloc[-1] / s.iloc[0]  - 1) * 100)

            # RSI(14)
            delta = s.diff()
            gain  = delta.clip(lower=0).rolling(14).mean()
            loss  = (-delta.clip(upper=0)).rolling(14).mean()
            rs    = gain / loss.replace(0, 1e-10)
            rsi   = float(100 - 100 / (1 + rs.iloc[-1]))

            # MACD
            ema12 = s.ewm(span=12, adjust=False).mean()
            ema26 = s.ewm(span=26, adjust=False).mean()
            macd  = ema12 - ema26
            sig   = macd.ewm(span=9, adjust=False).mean()

            # EMAs
            ema20  = float(s.ewm(span=20,  adjust=False).mean().iloc[-1])
            ema50  = float(s.ewm(span=50,  adjust=False).mean().iloc[-1]) if len(s) >= 50  else None
            ema200 = float(s.ewm(span=200, adjust=False).mean().iloc[-1]) if len(s) >= 200 else None

            # ADX(14)
            adx = None
            try:
                dm_p = h.diff().clip(lower=0)
                dm_m = (-l.diff()).clip(lower=0)
                mask = dm_p > dm_m
                dm_p = dm_p.where(mask, 0)
                dm_m = dm_m.where(~mask, 0)
                tr   = pd.concat([h - l, (h - s.shift()).abs(), (l - s.shift()).abs()], axis=1).max(axis=1)
                atr  = tr.rolling(14).mean()
                dip  = 100 * (dm_p.rolling(14).mean() / atr.replace(0, 1e-10))
                dim  = 100 * (dm_m.rolling(14).mean() / atr.replace(0, 1e-10))
                dx   = 100 * (dip - dim).abs() / (dip + dim + 1e-10)
                adx  = float(dx.rolling(14).mean().iloc[-1])
            except Exception:
                pass

            result[tkr] = {
                "price": price, "chg_1d": chg_1d, "chg_7d": chg_7d,
                "chg_30d": chg_30d, "chg_1y": chg_1y,
                "rsi": rsi, "macd": float(macd.iloc[-1]), "macd_signal": float(sig.iloc[-1]),
                "ema20": ema20, "ema50": ema50, "ema200": ema200, "adx": adx,
            }
        except Exception:
            continue
    return result


def _get_markets() -> dict:
    now = time.time()
    if "data" in _mkt_cache and now - _mkt_cache.get("ts", 0) < _CACHE_TTL:
        return _mkt_cache["data"]
    data = _fetch_markets(_ALL)
    _mkt_cache.update({"data": data, "ts": now})
    return data


def _tech_signal(m: dict) -> tuple[float, str]:
    rsi  = m.get("rsi", 50)
    macd = m.get("macd", 0)
    sig  = m.get("macd_signal", 0)
    p    = m.get("price", 1)
    e20  = m.get("ema20", p)
    e50  = m.get("ema50") or p
    adx  = m.get("adx") or 0

    score = 50.0
    score += (50 - abs(rsi - 50)) * 0.3
    if macd > sig:   score += 10
    else:            score -= 10
    if p > e20:      score += 8
    if p > e50:      score += 7
    if adx > 25:     score += 5
    score = max(0, min(100, score))
    label = "Strong Buy" if score >= 70 else "Buy" if score >= 55 else "Neutral" if score >= 45 else "Sell" if score >= 30 else "Strong Sell"
    return round(score, 1), label


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/overview")
async def get_overview():
    mkt = await asyncio.get_event_loop().run_in_executor(None, _get_markets)

    btc = mkt.get("BTC-USD", {})
    eth = mkt.get("ETH-USD", {})

    btc_price     = btc.get("price", 65000)
    eth_price     = eth.get("price", 3200)
    btc_mcap_b    = round(btc_price * 19_700_000 / 1e9, 1)
    eth_mcap_b    = round(eth_price * 120_000_000 / 1e9, 1)
    total_mcap_b  = round(btc_mcap_b * 1.84, 1)
    btc_dom       = round(btc_mcap_b / total_mcap_b * 100, 1)

    kpis = {
        "total_mcap_b":  total_mcap_b,
        "btc_mcap_b":    btc_mcap_b,
        "eth_mcap_b":    eth_mcap_b,
        "btc_dominance": btc_dom,
        "total_vol_24h_b": 148.4,
        "defi_tvl_b":    74.8,
        "stablecoin_mcap_b": 173.4,
        "active_addresses_24h": 1_416_000,
        "fear_greed": MACRO["fear_greed"],
        "fear_greed_label": MACRO["fear_greed_label"],
        "mvrv_zscore_btc": ONCHAIN_BTC["mvrv_zscore"],
        "funding_rate_btc": DERIVATIVES["btc"]["funding_rate_8h"],
        "etf_daily_flow_m": 274,
        "cycle_phase": MACRO["cycle_phase"],
    }

    btc_score, btc_sig = _tech_signal(btc)
    eth_score, eth_sig = _tech_signal(eth)

    crypto_score = round(
        ONCHAIN_BTC["nupl"] * 100 * 0.25 +
        MACRO["sentiment_score"] * 0.20 +
        btc_score * 0.30 +
        (100 - DERIVATIVES["btc"]["funding_rate_8h"] * 1000) * 0.15 +
        60 * 0.10,
        1
    )
    crypto_score = max(0, min(100, crypto_score))

    return {
        "crypto_score": crypto_score,
        "regime": MACRO["cycle_phase"],
        "kpis": kpis,
        "btc": {**btc, "ticker": "BTC-USD", "score": btc_score, "signal": btc_sig, "market_cap_b": btc_mcap_b},
        "eth": {**eth, "ticker": "ETH-USD", "score": eth_score, "signal": eth_sig, "market_cap_b": eth_mcap_b},
        "alerts": ALERTS,
        "macro": MACRO,
        "as_of": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }


@router.get("/assets")
async def get_assets():
    mkt = await asyncio.get_event_loop().run_in_executor(None, _get_markets)
    assets = []
    for tkr in CRYPTO_TICKERS:
        m = mkt.get(tkr, {})
        if not m:
            continue
        score, sig = _tech_signal(m)
        assets.append({
            "ticker": tkr,
            "name":   tkr.replace("-USD", ""),
            **m,
            "score": score, "signal": sig,
        })
    assets.sort(key=lambda x: x.get("price", 0), reverse=True)
    return {"assets": assets, "count": len(assets), "as_of": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}


@router.get("/onchain")
async def get_onchain():
    mkt    = await asyncio.get_event_loop().run_in_executor(None, _get_markets)
    btc_px = mkt.get("BTC-USD", {}).get("price", 65000)
    eth_px = mkt.get("ETH-USD", {}).get("price", 3200)
    return {
        "btc": {**ONCHAIN_BTC, "price": btc_px},
        "eth": {**ONCHAIN_ETH, "price": eth_px},
        "as_of": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }


@router.get("/defi")
async def get_defi():
    total_tvl   = round(sum(p["tvl_b"] for p in DEFI_PROTOCOLS), 2)
    top_by_tvl  = sorted(DEFI_PROTOCOLS, key=lambda x: x["tvl_b"], reverse=True)[:5]
    top_by_rev  = sorted(DEFI_PROTOCOLS, key=lambda x: x["rev_ann_m"], reverse=True)[:5]
    cat_tvl: dict[str, float] = {}
    for p in DEFI_PROTOCOLS:
        cat_tvl[p["category"]] = round(cat_tvl.get(p["category"], 0) + p["tvl_b"], 2)
    return {
        "protocols":     DEFI_PROTOCOLS,
        "total_tvl_b":   total_tvl,
        "top_by_tvl":    top_by_tvl,
        "top_by_revenue":top_by_rev,
        "by_category":   [{"category": k, "tvl_b": v} for k, v in sorted(cat_tvl.items(), key=lambda x: -x[1])],
        "rwa": RWA_DATA,
        "total_rwa_tvl_b": round(sum(r["tvl_b"] for r in RWA_DATA), 2),
        "as_of": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }


@router.get("/derivatives")
async def get_derivatives():
    mkt    = await asyncio.get_event_loop().run_in_executor(None, _get_markets)
    btc_px = mkt.get("BTC-USD", {}).get("price", 65000)
    eth_px = mkt.get("ETH-USD", {}).get("price", 3200)
    return {
        "btc": {**DERIVATIVES["btc"], "price": btc_px},
        "eth": {**DERIVATIVES["eth"], "price": eth_px},
        "total_crypto_oi_b": round(DERIVATIVES["btc"]["oi_b"] + DERIVATIVES["eth"]["oi_b"] + 8.4, 2),
        "as_of": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }


@router.get("/etf")
async def get_etf():
    mkt       = await asyncio.get_event_loop().run_in_executor(None, _get_markets)
    btc_etfs  = []
    for e in BTC_ETFS:
        m = mkt.get(e["ticker"], {})
        btc_etfs.append({**e, "price": m.get("price"), "chg_1d": m.get("chg_1d"),
                          "chg_7d": m.get("chg_7d"), "rsi": m.get("rsi")})
    eth_etfs = []
    for e in ETH_ETFS:
        m = mkt.get(e["ticker"], {})
        eth_etfs.append({**e, "price": m.get("price"), "chg_1d": m.get("chg_1d"),
                          "chg_7d": m.get("chg_7d"), "rsi": m.get("rsi")})

    btc_total_aum   = round(sum(e["aum_b"] for e in BTC_ETFS), 2)
    eth_total_aum   = round(sum(e["aum_b"] for e in ETH_ETFS), 2)
    btc_total_flow  = sum(e["daily_flow_m"] for e in BTC_ETFS)
    eth_total_flow  = sum(e["daily_flow_m"] for e in ETH_ETFS)
    btc_total_held  = sum(e["btc_held"] for e in BTC_ETFS)

    return {
        "btc_etfs": btc_etfs, "eth_etfs": eth_etfs,
        "btc_total_aum_b": btc_total_aum, "eth_total_aum_b": eth_total_aum,
        "btc_total_flow_m": btc_total_flow, "eth_total_flow_m": eth_total_flow,
        "btc_total_held": btc_total_held,
        "total_etf_aum_b": round(btc_total_aum + eth_total_aum, 2),
        "as_of": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }


@router.get("/stablecoins")
async def get_stablecoins():
    total = round(sum(s["mcap_b"] for s in STABLECOINS), 2)
    return {
        "stablecoins": STABLECOINS,
        "total_mcap_b": total,
        "top_3_share_pct": round(sum(s["mcap_b"] for s in STABLECOINS[:3]) / total * 100, 1),
        "fiat_backed_pct": round(sum(s["mcap_b"] for s in STABLECOINS if s["type"] == "Fiat-backed") / total * 100, 1),
        "as_of": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }


@router.get("/mining")
async def get_mining():
    mkt = await asyncio.get_event_loop().run_in_executor(None, _get_markets)
    miners = []
    for mn in LISTED_MINERS:
        m = mkt.get(mn["ticker"], {})
        score, sig = _tech_signal(m) if m else (50.0, "Neutral")
        miners.append({**mn, "price": m.get("price"), "chg_1d": m.get("chg_1d"),
                        "chg_7d": m.get("chg_7d"), "rsi": m.get("rsi"),
                        "score": score, "signal": sig})

    btc_px    = mkt.get("BTC-USD", {}).get("price", 65000)
    total_eh  = ONCHAIN_BTC["hash_rate_eh"]
    miner_eh  = sum(mn["hash_rate_eh"] for mn in LISTED_MINERS)
    return {
        "stats": {**{k: ONCHAIN_BTC[k] for k in ["hash_rate_eh","hash_rate_change_30d","difficulty","difficulty_change","block_reward_btc","miner_revenue_usd_24h","puell_multiple","halving_date"] if k in ONCHAIN_BTC},
                  "hash_rate_change_30d": 4.2, "difficulty_change": 2.8,
                  "block_reward_btc": 3.125, "halving_date": "2024-04-20",
                  "next_halving_est": "2028-04-15",
                  "breakeven_price": 38000,
                  "fee_rev_pct": 8.4,
                  "btc_price": btc_px},
        "miners": miners,
        "pools": MINING_POOLS,
        "listed_hash_share_pct": round(miner_eh / total_eh * 100, 1),
        "as_of": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }


@router.get("/ecosystems")
async def get_ecosystems():
    mkt = await asyncio.get_event_loop().run_in_executor(None, _get_markets)
    ecosystems = []
    for eco in L1_L2:
        m = mkt.get(eco["ticker"], {}) if eco.get("ticker") else {}
        ecosystems.append({**eco, "price": m.get("price"), "chg_1d": m.get("chg_1d"),
                           "chg_7d": m.get("chg_7d"), "rsi": m.get("rsi")})
    total_tvl = round(sum(e["tvl_b"] for e in L1_L2), 2)
    eth_tvl   = next((e["tvl_b"] for e in L1_L2 if e["name"] == "Ethereum"), 0)
    return {
        "ecosystems": ecosystems,
        "total_tvl_b": total_tvl,
        "eth_tvl_share": round(eth_tvl / total_tvl * 100, 1),
        "l2_tvl_b": round(sum(e["tvl_b"] for e in L1_L2 if "L2" in e["type"]), 2),
        "as_of": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }


@router.get("/institutional")
async def get_institutional():
    mkt = await asyncio.get_event_loop().run_in_executor(None, _get_markets)
    holdings = []
    for h in INSTITUTIONAL:
        m  = mkt.get(h["ticker"], {})
        px = mkt.get("BTC-USD", {}).get("price", 65000)
        current_val = round(h["btc_held"] * px / 1e9, 2)
        unrealized  = round(current_val - h["btc_held"] * h["avg_price"] / 1e9, 2)
        pnl_pct     = round((px / h["avg_price"] - 1) * 100, 1)
        holdings.append({**h, "current_val_b": current_val, "unrealized_b": unrealized,
                          "pnl_pct": pnl_pct,
                          "stock_price": m.get("price"), "stock_chg_1d": m.get("chg_1d")})

    btc_px        = mkt.get("BTC-USD", {}).get("price", 65000)
    total_btc     = sum(h["btc_held"] for h in INSTITUTIONAL)
    total_val_b   = round(total_btc * btc_px / 1e9, 2)

    proxies = []
    for tkr in PROXY_TICKERS:
        m = mkt.get(tkr, {})
        if m:
            score, sig = _tech_signal(m)
            proxies.append({"ticker": tkr, **m, "score": score, "signal": sig})

    return {
        "holdings": holdings,
        "vc_pipeline": VC_PIPELINE,
        "total_btc_held": total_btc,
        "total_val_b": total_val_b,
        "pct_circulating_supply": round(total_btc / 19_700_000 * 100, 2),
        "proxies": proxies,
        "as_of": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }


@router.get("/composite")
async def get_composite():
    mkt = await asyncio.get_event_loop().run_in_executor(None, _get_markets)
    btc = mkt.get("BTC-USD", {})
    eth = mkt.get("ETH-USD", {})

    btc_ts, _ = _tech_signal(btc)
    eth_ts, _ = _tech_signal(eth)

    nupl_score  = round(ONCHAIN_BTC["nupl"] * 100, 1)
    mvrv_score  = max(0, min(100, round((3.5 - ONCHAIN_BTC["mvrv_zscore"]) / 3.5 * 100, 1)))
    fund_score  = max(0, min(100, round(100 - DERIVATIVES["btc"]["funding_rate_8h"] * 5000, 1)))
    etf_score   = 78.0
    macro_score = round(MACRO["sentiment_score"], 1)
    tech_score  = round((btc_ts + eth_ts) / 2, 1)

    components = {
        "On-Chain (MVRV/NUPL)":   {"score": round((mvrv_score + nupl_score) / 2, 1), "weight": 0.25},
        "Technicals":             {"score": tech_score,  "weight": 0.20},
        "Macro/Sentiment":        {"score": macro_score, "weight": 0.20},
        "ETF Flows":              {"score": etf_score,   "weight": 0.15},
        "Derivatives/Funding":    {"score": fund_score,  "weight": 0.10},
        "Institutional":          {"score": 72.0,        "weight": 0.10},
    }

    composite = round(sum(v["score"] * v["weight"] for v in components.values()), 1)
    label = "Extreme Greed" if composite >= 80 else "Greed" if composite >= 65 else "Neutral" if composite >= 45 else "Fear" if composite >= 30 else "Extreme Fear"

    # Trading signals
    signals = []
    for tkr in CRYPTO_TICKERS[:4]:
        m = mkt.get(tkr, {})
        if not m:
            continue
        ts, sig = _tech_signal(m)
        px      = m.get("price", 1)
        target  = round(px * (1 + (ts - 50) / 200), 2)
        stop    = round(px * (1 - (50 - min(ts, 50)) / 400), 2)
        signals.append({
            "ticker": tkr, "price": px, "signal": sig, "score": ts,
            "tech_score": ts, "composite_score": round(ts * 0.7 + composite * 0.3, 1),
            "target": target, "stop": stop,
            "exp_return": round((target / px - 1) * 100, 1),
            "confidence": round(ts / 100, 2),
        })

    best_longs   = [{"ticker": "IBIT",  "reason": "BTC spot ETF leading inflows; BlackRock imprimatur",  "conviction": 82},
                    {"ticker": "MSTR",  "reason": "Leveraged BTC proxy; perpetual accumulation strategy", "conviction": 74},
                    {"ticker": "COIN",  "reason": "Volume-driven exchange; regulatory clarity tailwind",   "conviction": 71}]
    short_cands  = [{"ticker": "GBTC",  "reason": "2.5% fee bleed; ongoing ETF outflows",                 "risk": 72},
                    {"ticker": "MARA",  "reason": "Above breakeven but post-halving margin risk",           "risk": 64}]

    return {
        "composite_score": composite, "label": label,
        "components": components,
        "signals": signals,
        "alerts": ALERTS,
        "best_longs": best_longs,
        "short_candidates": short_cands,
        "macro": MACRO,
        "outlook": {
            "1m":  "Elevated. MVRV Z-score at 2.34 — watch for blow-off or consolidation.",
            "3m":  "Constructive. ETF inflows + macro tailwinds support prices.",
            "12m": "Bullish. Post-halving supply shock + institutional adoption cycle intact.",
        },
        "as_of": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }
