"""
Multi-symbol, multi-timeframe pattern scanner with DuckDB persistence.
Data source: Yahoo Finance (yfinance) — no MT5 dependency.
"""
from __future__ import annotations
import math
import uuid
import logging
import time
from datetime import datetime, timezone
from typing import Any

import os as _os
from pathlib import Path

import duckdb
import yfinance as yf
import pandas as pd

from app.core.scanner.patterns import scan_bars

logger = logging.getLogger(__name__)

_DATA_DIR = Path(_os.environ.get("DATA_DIR", str(Path(__file__).resolve().parents[4] / "data")))
_DB_PATH = str(_DATA_DIR / "scanner.duckdb")

# ── Yahoo Finance ticker mapping ──────────────────────────────────────────────

YF_TICKER_MAP: dict[str, str] = {
    # Forex
    "EURUSD": "EURUSD=X", "GBPUSD": "GBPUSD=X", "USDJPY": "JPY=X",
    "USDCHF": "CHF=X",    "AUDUSD": "AUDUSD=X", "NZDUSD": "NZDUSD=X",
    "USDCAD": "CAD=X",    "EURGBP": "EURGBP=X", "EURJPY": "EURJPY=X",
    "GBPJPY": "GBPJPY=X",
    # Metals
    "XAUUSD": "GC=F",     "XAGUSD": "SI=F",
    # Energy
    "USOIL":  "CL=F",     "UKOIL":  "BZ=F",
    # Indices
    "US30":   "^DJI",     "US500":  "^GSPC",
    "NAS100": "^NDX",     "GER40":  "^GDAXI",
    # Crypto
    "BTCUSD": "BTC-USD",  "ETHUSD": "ETH-USD",
    # Equities (pass-through)
    "AAPL": "AAPL",       "TSLA": "TSLA",
    "NVDA": "NVDA",       "MSFT": "MSFT",
    "AMZN": "AMZN",       "GOOGL": "GOOGL",
    "META": "META",       "SPY": "SPY",
    "QQQ": "QQQ",         "GLD": "GLD",
}

# yfinance interval + period for each scanner timeframe
_YF_TF: dict[str, tuple[str, str]] = {
    "M15": ("15m", "59d"),    # max 60 days for sub-hourly
    "H1":  ("1h",  "729d"),
    "H4":  ("1h",  "729d"),   # fetched as 1h then resampled
    "D1":  ("1d",  "5y"),
    "W1":  ("1wk", "10y"),
}

DEFAULT_SYMBOLS = [
    "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD",
    "EURGBP", "EURJPY", "GBPJPY",
    "XAUUSD", "XAGUSD",
    "USOIL", "UKOIL",
    "US30", "US500", "NAS100", "GER40",
    "BTCUSD", "ETHUSD",
    "AAPL", "TSLA", "NVDA", "MSFT", "SPY",
]

DEFAULT_TIMEFRAMES = ["H1", "H4", "D1"]

TF_LABEL = {
    "M1": "1m", "M5": "5m", "M15": "15m", "M30": "30m",
    "H1": "1H", "H4": "4H", "D1": "1D", "W1": "1W",
}

ASSET_CLASS_MAP = {
    "EURUSD": "FOREX", "GBPUSD": "FOREX", "USDJPY": "FOREX",
    "USDCHF": "FOREX", "AUDUSD": "FOREX", "NZDUSD": "FOREX", "USDCAD": "FOREX",
    "EURGBP": "FOREX", "EURJPY": "FOREX", "GBPJPY": "FOREX",
    "XAUUSD": "METALS", "XAGUSD": "METALS",
    "USOIL": "ENERGY", "UKOIL": "ENERGY",
    "US30": "INDEX", "US500": "INDEX", "NAS100": "INDEX", "GER40": "INDEX",
    "BTCUSD": "CRYPTO", "ETHUSD": "CRYPTO",
    "AAPL": "EQUITY", "TSLA": "EQUITY",
}


def _fetch_ohlcv(symbol: str, timeframe: str, count: int = 500) -> list[dict]:
    """Fetch OHLCV bars from Yahoo Finance. Returns [{time,open,high,low,close,volume}]."""
    yf_ticker = YF_TICKER_MAP.get(symbol, symbol)
    interval, period = _YF_TF.get(timeframe, ("1d", "2y"))
    try:
        df = yf.download(yf_ticker, period=period, interval=interval,
                         progress=False, auto_adjust=True)
        if df.empty:
            return []
        # Flatten MultiIndex columns (yfinance returns MultiIndex for single ticker too in newer versions)
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        df = df.rename(columns=str.lower)
        # For H4: resample 1h → 4h
        if timeframe == "H4":
            df = df.resample("4h").agg({
                "open": "first", "high": "max", "low": "min",
                "close": "last", "volume": "sum",
            }).dropna()
        df = df.dropna(subset=["open", "high", "low", "close"])
        df = df.tail(count)
        bars = []
        for ts, row in df.iterrows():
            bars.append({
                "time":   ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
                "open":   float(row["open"]),
                "high":   float(row["high"]),
                "low":    float(row["low"]),
                "close":  float(row["close"]),
                "volume": int(row.get("volume", 0) or 0),
            })
        return bars
    except Exception as e:
        logger.warning(f"yfinance fetch {symbol} ({yf_ticker}) {timeframe}: {e}")
        return []


def _get_conn() -> duckdb.DuckDBPyConnection:
    return duckdb.connect(_DB_PATH)


def init_scanner_db() -> None:
    with _get_conn() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS scanner_results (
                id           VARCHAR PRIMARY KEY,
                symbol       VARCHAR NOT NULL,
                asset_class  VARCHAR,
                pattern      VARCHAR NOT NULL,
                category     VARCHAR NOT NULL,
                direction    VARCHAR NOT NULL,
                timeframe    VARCHAR NOT NULL,
                tf_label     VARCHAR,
                current_price DOUBLE,
                entry        DOUBLE,
                stop         DOUBLE,
                target1      DOUBLE,
                target2      DOUBLE,
                target3      DOUBLE,
                rr_ratio     DOUBLE,
                pattern_score DOUBLE,
                pattern_quality DOUBLE,
                trend_quality DOUBLE,
                volume_conf  DOUBLE,
                breakout_prob DOUBLE,
                rr_score     DOUBLE,
                classification VARCHAR,
                status       VARCHAR DEFAULT 'WATCH',
                is_starred   BOOLEAN DEFAULT false,
                commentary   VARCHAR,
                atr          DOUBLE,
                rsi          DOUBLE,
                adx          DOUBLE,
                detected_at  TIMESTAMPTZ NOT NULL,
                expires_at   TIMESTAMPTZ,
                created_at   TIMESTAMPTZ DEFAULT now(),
                updated_at   TIMESTAMPTZ DEFAULT now()
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS scanner_alerts (
                id          VARCHAR PRIMARY KEY,
                result_id   VARCHAR NOT NULL,
                alert_type  VARCHAR NOT NULL,
                message     VARCHAR NOT NULL,
                is_read     BOOLEAN DEFAULT false,
                created_at  TIMESTAMPTZ DEFAULT now()
            )
        """)


def _upsert_result(con: duckdb.DuckDBPyConnection, symbol: str, timeframe: str, r: dict) -> str:
    existing = con.execute(
        "SELECT id FROM scanner_results WHERE symbol=? AND pattern=? AND timeframe=?",
        [symbol, r["pattern"], timeframe]
    ).fetchone()
    now = datetime.now(timezone.utc).isoformat()
    if existing:
        rid = existing[0]
        con.execute("""
            UPDATE scanner_results SET
                current_price=?, entry=?, stop=?, target1=?, target2=?, target3=?,
                rr_ratio=?, pattern_score=?, pattern_quality=?, trend_quality=?,
                volume_conf=?, breakout_prob=?, rr_score=?, classification=?,
                atr=?, rsi=?, adx=?, detected_at=?, updated_at=?
            WHERE id=?
        """, [
            r["current_price"], r["entry"], r["stop"], r["target1"], r["target2"], r["target3"],
            r["rr_ratio"], r["pattern_score"], r["pattern_quality"], r["trend_quality"],
            r["volume_conf"], r["breakout_prob"], r["rr_score"], r["classification"],
            r["atr"], r["rsi"], r["adx"], now, now, rid
        ])
        return rid
    else:
        rid = str(uuid.uuid4())
        con.execute("""
            INSERT INTO scanner_results (
                id, symbol, asset_class, pattern, category, direction,
                timeframe, tf_label, current_price, entry, stop,
                target1, target2, target3, rr_ratio, pattern_score,
                pattern_quality, trend_quality, volume_conf, breakout_prob,
                rr_score, classification, atr, rsi, adx, detected_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, [
            rid, symbol, ASSET_CLASS_MAP.get(symbol, "OTHER"),
            r["pattern"], r["category"], r["direction"],
            timeframe, TF_LABEL.get(timeframe, timeframe),
            r["current_price"], r["entry"], r["stop"],
            r["target1"], r["target2"], r["target3"],
            r["rr_ratio"], r["pattern_score"],
            r["pattern_quality"], r["trend_quality"], r["volume_conf"],
            r["breakout_prob"], r["rr_score"], r["classification"],
            r["atr"], r["rsi"], r["adx"], now,
        ])
        con.execute("""
            INSERT INTO scanner_alerts (id, result_id, alert_type, message)
            VALUES (?, ?, 'NEW_PATTERN', ?)
        """, [str(uuid.uuid4()), rid, f"New {r['classification']} pattern: {r['pattern']} on {symbol} [{TF_LABEL.get(timeframe, timeframe)}]"])
        return rid


def scan_symbol(symbol: str, timeframes: list[str] | None = None, min_score: float = 40.0) -> list[dict]:
    """Scan one symbol across specified timeframes via Yahoo Finance."""
    tfs = timeframes or DEFAULT_TIMEFRAMES
    all_results = []
    for tf in tfs:
        try:
            bars = _fetch_ohlcv(symbol, tf, 500)
            if len(bars) < 20:
                continue
            patterns = scan_bars(bars, min_score=min_score)
            for p in patterns:
                p["symbol"] = symbol
                p["timeframe"] = tf
                p["tf_label"] = TF_LABEL.get(tf, tf)
                p["asset_class"] = ASSET_CLASS_MAP.get(symbol, "OTHER")
                all_results.append(p)
        except Exception as e:
            logger.warning(f"scan_symbol {symbol} {tf}: {e}")
    return all_results


def run_scan(
    symbols: list[str] | None = None,
    timeframes: list[str] | None = None,
    min_score: float = 40.0,
) -> dict[str, Any]:
    """Full multi-symbol scan via Yahoo Finance. Returns summary stats."""
    syms = symbols or DEFAULT_SYMBOLS
    tfs = timeframes or DEFAULT_TIMEFRAMES
    total_new, total_updated, errors = 0, 0, 0

    init_scanner_db()
    with _get_conn() as con:
        for symbol in syms:
            for tf in tfs:
                try:
                    bars = _fetch_ohlcv(symbol, tf, 500)
                    if len(bars) < 20:
                        errors += 1
                        continue
                    patterns = scan_bars(bars, min_score=min_score)
                    for p in patterns:
                        existing = con.execute(
                            "SELECT id FROM scanner_results WHERE symbol=? AND pattern=? AND timeframe=?",
                            [symbol, p["pattern"], tf]
                        ).fetchone()
                        _upsert_result(con, symbol, tf, p)
                        if existing:
                            total_updated += 1
                        else:
                            total_new += 1
                    time.sleep(0.1)  # be polite to yfinance
                except Exception as e:
                    logger.warning(f"run_scan {symbol} {tf}: {e}")
                    errors += 1

    return {
        "scanned_symbols": len(syms),
        "scanned_timeframes": len(tfs),
        "new_patterns": total_new,
        "updated_patterns": total_updated,
        "errors": errors,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def get_results(
    direction: str | None = None,
    category: str | None = None,
    timeframe: str | None = None,
    asset_class: str | None = None,
    status: str | None = None,
    min_score: float | None = None,
    sort_by: str = "pattern_score",
    sort_dir: str = "desc",
    limit: int = 200,
) -> list[dict]:
    init_scanner_db()
    conditions = []
    params: list[Any] = []
    if direction:
        conditions.append("direction=?"); params.append(direction)
    if category:
        conditions.append("category=?"); params.append(category)
    if timeframe:
        conditions.append("timeframe=?"); params.append(timeframe)
    if asset_class:
        conditions.append("asset_class=?"); params.append(asset_class)
    if status:
        conditions.append("status=?"); params.append(status)
    if min_score is not None:
        conditions.append("pattern_score>=?"); params.append(min_score)

    allowed_sort = {"pattern_score", "rr_ratio", "detected_at", "symbol", "pattern", "created_at"}
    col = sort_by if sort_by in allowed_sort else "pattern_score"
    direction_sql = "DESC" if sort_dir.lower() == "desc" else "ASC"
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    params.append(limit)

    with _get_conn() as con:
        rows = con.execute(f"""
            SELECT * FROM scanner_results
            {where}
            ORDER BY {col} {direction_sql}
            LIMIT ?
        """, params).fetchall()
        cols = [d[0] for d in con.description]  # type: ignore[union-attr]
        return [dict(zip(cols, row)) for row in rows]


def get_result_by_id(result_id: str) -> dict | None:
    init_scanner_db()
    with _get_conn() as con:
        row = con.execute("SELECT * FROM scanner_results WHERE id=?", [result_id]).fetchone()
        if not row:
            return None
        cols = [d[0] for d in con.description]  # type: ignore[union-attr]
        return dict(zip(cols, row))


def update_result(result_id: str, data: dict) -> dict | None:
    init_scanner_db()
    allowed = {"status", "is_starred", "commentary"}
    fields = {k: v for k, v in data.items() if k in allowed}
    if not fields:
        return None
    now = datetime.now(timezone.utc).isoformat()
    fields["updated_at"] = now
    set_clause = ", ".join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [result_id]
    with _get_conn() as con:
        con.execute(f"UPDATE scanner_results SET {set_clause} WHERE id=?", vals)
        if "status" in fields and fields["status"] in ("TRIGGERED", "CONFIRMED", "FAILED"):
            label_map = {"TRIGGERED": "BREAKOUT_TRIGGERED", "CONFIRMED": "BREAKOUT_CONFIRMED", "FAILED": "PATTERN_FAILED"}
            row = con.execute("SELECT symbol, pattern FROM scanner_results WHERE id=?", [result_id]).fetchone()
            if row:
                con.execute("""
                    INSERT INTO scanner_alerts (id, result_id, alert_type, message)
                    VALUES (?, ?, ?, ?)
                """, [str(uuid.uuid4()), result_id, label_map[fields["status"]],
                      f"{row[1]} on {row[0]} → {fields['status']}"])
    return get_result_by_id(result_id)


def get_alerts(unread_only: bool = False, limit: int = 50) -> list[dict]:
    init_scanner_db()
    where = "WHERE is_read=false" if unread_only else ""
    with _get_conn() as con:
        rows = con.execute(f"""
            SELECT a.*, r.symbol, r.pattern, r.timeframe, r.direction, r.pattern_score
            FROM scanner_alerts a
            LEFT JOIN scanner_results r ON a.result_id=r.id
            {where}
            ORDER BY a.created_at DESC LIMIT ?
        """, [limit]).fetchall()
        cols = [d[0] for d in con.description]  # type: ignore[union-attr]
        return [dict(zip(cols, row)) for row in rows]


def mark_alerts_read(alert_ids: list[str]) -> None:
    init_scanner_db()
    if not alert_ids:
        return
    placeholders = ",".join("?" * len(alert_ids))
    with _get_conn() as con:
        con.execute(f"UPDATE scanner_alerts SET is_read=true WHERE id IN ({placeholders})", alert_ids)


def get_performance_stats() -> dict:
    init_scanner_db()
    with _get_conn() as con:
        total = con.execute("SELECT COUNT(*) FROM scanner_results").fetchone()[0]
        by_dir = con.execute("""
            SELECT direction, COUNT(*) as cnt, AVG(pattern_score) as avg_score
            FROM scanner_results GROUP BY direction
        """).fetchall()
        by_cat = con.execute("""
            SELECT category, COUNT(*) as cnt, AVG(pattern_score) as avg_score
            FROM scanner_results GROUP BY category
        """).fetchall()
        by_tf = con.execute("""
            SELECT timeframe, COUNT(*) as cnt, AVG(pattern_score) as avg_score
            FROM scanner_results GROUP BY timeframe
        """).fetchall()
        by_class = con.execute("""
            SELECT classification, COUNT(*) as cnt
            FROM scanner_results GROUP BY classification
        """).fetchall()
        by_status = con.execute("""
            SELECT status, COUNT(*) as cnt
            FROM scanner_results GROUP BY status
        """).fetchall()
        recent = con.execute("""
            SELECT symbol, pattern, tf_label, pattern_score, classification, direction, detected_at
            FROM scanner_results ORDER BY detected_at DESC LIMIT 5
        """).fetchall()
        recent_cols = ["symbol", "pattern", "tf_label", "pattern_score", "classification", "direction", "detected_at"]

    return {
        "total_detected": total,
        "by_direction":   [{"direction": r[0], "count": r[1], "avg_score": round(r[2] or 0, 1)} for r in by_dir],
        "by_category":    [{"category": r[0], "count": r[1], "avg_score": round(r[2] or 0, 1)} for r in by_cat],
        "by_timeframe":   [{"timeframe": r[0], "count": r[1], "avg_score": round(r[2] or 0, 1)} for r in by_tf],
        "by_classification": [{"classification": r[0], "count": r[1]} for r in by_class],
        "by_status":      [{"status": r[0], "count": r[1]} for r in by_status],
        "recent":         [dict(zip(recent_cols, r)) for r in recent],
    }


def delete_all_results() -> int:
    init_scanner_db()
    with _get_conn() as con:
        n = con.execute("SELECT COUNT(*) FROM scanner_results").fetchone()[0]
        con.execute("DELETE FROM scanner_results")
        con.execute("DELETE FROM scanner_alerts")
    return n
