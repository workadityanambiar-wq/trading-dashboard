"""
COT (Commitment of Traders) data from CFTC — Traders in Financial Futures (TFF).
Tracks Dealer, Asset Manager, and Leveraged Fund positioning in key markets.
"""
from __future__ import annotations

import io
import logging
import zipfile
from datetime import datetime

import numpy as np
import pandas as pd
import requests

logger = logging.getLogger(__name__)

_COT_URL = "https://www.cftc.gov/files/dea/history/fut_fin_txt_{year}.zip"

TRACKED = {
    "S&P 500":   ["S&P 500 Consol", "E-MINI S&P 500"],
    "Nasdaq 100": ["NASDAQ-100 STOCK", "E-MINI NASDAQ"],
    "10Y Treasury": ["10-YEAR U.S.", "10 YEAR T-NOTE"],
    "USD Index":  ["U.S. DOLLAR INDEX", "USD INDEX"],
    "Euro FX":    ["EURO FX -"],
}

_LONG  = {"dealer": "Dealer_Positions_Long_All",   "am": "Asset_Mgr_Positions_Long_All",  "lev": "Lev_Money_Positions_Long_All"}
_SHORT = {"dealer": "Dealer_Positions_Short_All",  "am": "Asset_Mgr_Positions_Short_All", "lev": "Lev_Money_Positions_Short_All"}
_CHG_L = {"am": "Change_in_Asset_Mgr_Long_All",   "lev": "Change_in_Lev_Money_Long_All"}
_CHG_S = {"am": "Change_in_Asset_Mgr_Short_All",  "lev": "Change_in_Lev_Money_Short_All"}

_cache: dict = {}
_cache_ts: datetime | None = None
_TTL_H = 24


def _download(year: int) -> pd.DataFrame | None:
    try:
        r = requests.get(_COT_URL.format(year=year), timeout=30)
        if r.status_code != 200:
            return None
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            txt = z.read(z.namelist()[0]).decode("utf-8", errors="ignore")
        return pd.read_csv(io.StringIO(txt), low_memory=False)
    except Exception as e:
        logger.warning(f"COT download failed {year}: {e}")
        return None


def _safe_float(val) -> float:
    try:
        f = float(val)
        return 0.0 if np.isnan(f) else f
    except Exception:
        return 0.0


def _parse(df: pd.DataFrame) -> dict:
    if df is None or df.empty:
        return {}

    df["_date"] = pd.to_datetime(df["Report_Date_as_YYYY-MM-DD"], errors="coerce")
    df = df.dropna(subset=["_date"])
    oi_col = "Open_Interest_All"

    result: dict = {}

    for friendly, patterns in TRACKED.items():
        mask = pd.Series(False, index=df.index)
        for p in patterns:
            mask |= df["Market_and_Exchange_Names"].str.contains(p, case=False, na=False)
        sub = df[mask].copy().sort_values("_date").tail(104)  # 2 years
        if sub.empty:
            continue

        rows = []
        for _, r in sub.iterrows():
            oi = _safe_float(r.get(oi_col, 0)) or 1
            dl = _safe_float(r.get(_LONG["dealer"],  0))
            ds = _safe_float(r.get(_SHORT["dealer"], 0))
            al = _safe_float(r.get(_LONG["am"],  0))
            as_ = _safe_float(r.get(_SHORT["am"], 0))
            ll = _safe_float(r.get(_LONG["lev"],  0))
            ls = _safe_float(r.get(_SHORT["lev"], 0))

            rows.append({
                "date":              r["_date"].strftime("%Y-%m-%d"),
                "oi":                int(oi),
                "dealer_net":        int(dl - ds),
                "dealer_net_pct":    round((dl - ds) / oi * 100, 2),
                "am_net":            int(al - as_),
                "am_net_pct":        round((al - as_) / oi * 100, 2),
                "lev_net":           int(ll - ls),
                "lev_net_pct":       round((ll - ls) / oi * 100, 2),
                "wk_chg_lev":        int(_safe_float(r.get(_CHG_L["lev"], 0)) - _safe_float(r.get(_CHG_S["lev"], 0))),
                "wk_chg_am":         int(_safe_float(r.get(_CHG_L["am"],  0)) - _safe_float(r.get(_CHG_S["am"],  0))),
            })

        if not rows:
            continue

        # Z-scores over available history
        lev_pcts = [r["lev_net_pct"] for r in rows]
        am_pcts  = [r["am_net_pct"]  for r in rows]
        mean_l, std_l = float(np.mean(lev_pcts)), float(np.std(lev_pcts)) or 1
        mean_a, std_a = float(np.mean(am_pcts)),  float(np.std(am_pcts))  or 1

        latest = rows[-1]
        lev_z  = round((latest["lev_net_pct"] - mean_l) / std_l, 2)
        am_z   = round((latest["am_net_pct"]  - mean_a) / std_a, 2)

        # 52-week percentile of lev fund net
        arr = np.array(lev_pcts[-52:])
        pct_rank = float(np.mean(arr <= latest["lev_net_pct"])) * 100

        result[friendly] = {
            "as_of":            latest["date"],
            "lev_net_pct":      latest["lev_net_pct"],
            "lev_z":            lev_z,
            "lev_pct_rank":     round(pct_rank, 0),
            "am_net_pct":       latest["am_net_pct"],
            "am_z":             am_z,
            "dealer_net_pct":   latest["dealer_net_pct"],
            "wk_chg_lev":       latest["wk_chg_lev"],
            "wk_chg_am":        latest["wk_chg_am"],
            "history":          rows[-26:],    # last 26 weeks for charts
        }

    return result


def get_cot() -> dict:
    global _cache, _cache_ts
    now = datetime.now()
    if _cache_ts and (now - _cache_ts).total_seconds() < _TTL_H * 3600 and _cache:
        return _cache

    year = now.year
    df = _download(year)
    if df is None or df.empty:
        df = _download(year - 1)

    _cache = _parse(df) if df is not None else {}
    _cache_ts = now
    return _cache
