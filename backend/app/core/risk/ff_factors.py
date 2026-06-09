"""
Fama-French 3-factor daily data.

Downloads directly from Kenneth French's Data Library and caches locally.
No pandas-datareader dependency (it breaks on Python 3.14).
"""
import zipfile
import io
from datetime import datetime
from pathlib import Path
from typing import Optional
import logging

import pandas as pd
import requests

logger = logging.getLogger(__name__)

_URL = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_daily_CSV.zip"
_CACHE_DIR = Path(__file__).resolve().parents[4] / "data"
_CACHE_CSV = _CACHE_DIR / "ff3_daily.csv.gz"
_TIMEOUT = 30


def get_ff3(start: str, end: Optional[str] = None) -> pd.DataFrame:
    """
    Return FF3 daily factors (Mkt-RF, SMB, HML, RF) as fractional returns.
    Downloads and caches on first call; subsequent calls read from local CSV.
    """
    df = _load_cache()

    if df.empty or _needs_refresh(df):
        fresh = _download()
        if not fresh.empty:
            df = fresh
            try:
                _save_cache(fresh)
            except Exception as e:
                logger.warning(f"FF3 cache save failed (non-fatal): {e}")

    if df.empty:
        return pd.DataFrame()

    df = df.loc[start:]
    if end:
        df = df.loc[:end]
    return df


# ── Download + parse ──────────────────────────────────────────────────────────

def _download() -> pd.DataFrame:
    try:
        logger.info("Downloading FF3 daily factors from Ken French website...")
        resp = requests.get(_URL, timeout=_TIMEOUT)
        resp.raise_for_status()

        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            csv_name = next(n for n in zf.namelist() if n.upper().endswith(".CSV"))
            raw = zf.read(csv_name).decode("latin-1")

        df = _parse(raw)
        logger.info(f"FF3 factors loaded: {len(df)} obs ({df.index[0].date()} to {df.index[-1].date()})")
        return df

    except Exception as e:
        logger.error(f"FF3 download failed: {e}")
        return pd.DataFrame()


def _parse(content: str) -> pd.DataFrame:
    lines = content.strip().splitlines()

    header_idx = next(
        (i for i, l in enumerate(lines) if "Mkt-RF" in l and "SMB" in l), None
    )
    if header_idx is None:
        return pd.DataFrame()

    records = []
    for line in lines[header_idx + 1:]:
        s = line.strip()
        if not s:
            continue
        # File is comma-separated with optional spaces around values
        parts = [p.strip() for p in s.split(",")]
        if len(parts) < 5:
            continue
        try:
            date = datetime.strptime(parts[0], "%Y%m%d")
            vals = [float(x) for x in parts[1:5]]
            records.append([date] + vals)
        except (ValueError, IndexError):
            break  # reached the annual section

    if not records:
        return pd.DataFrame()

    df = pd.DataFrame(records, columns=["date", "Mkt-RF", "SMB", "HML", "RF"])
    df = df.set_index("date")
    df.index = pd.to_datetime(df.index)
    return df / 100.0  # percent → decimal


# ── Cache helpers ─────────────────────────────────────────────────────────────

def _load_cache() -> pd.DataFrame:
    if _CACHE_CSV.exists():
        try:
            return pd.read_csv(_CACHE_CSV, index_col=0, parse_dates=True)
        except Exception:
            pass
    return pd.DataFrame()


def _save_cache(df: pd.DataFrame) -> None:
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(_CACHE_CSV, compression="gzip")


def _needs_refresh(df: pd.DataFrame) -> bool:
    from datetime import date, timedelta
    last = df.index[-1].date()
    return last < date.today() - timedelta(days=5)
