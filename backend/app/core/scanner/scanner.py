"""
Multi-symbol, multi-timeframe pattern scanner with DuckDB persistence.
Data source: Yahoo Finance (yfinance) — no MT5 dependency.
"""
from __future__ import annotations
import math
import uuid
import logging
import threading
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

_db_lock = threading.Lock()
_db_conn: duckdb.DuckDBPyConnection | None = None


def _get_conn() -> duckdb.DuckDBPyConnection:
    global _db_conn
    if _db_conn is None:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        _db_conn = duckdb.connect(_DB_PATH)
    return _db_conn


# ── Yahoo Finance ticker mapping ──────────────────────────────────────────────

YF_TICKER_MAP: dict[str, str] = {
    "EURUSD": "EURUSD=X", "GBPUSD": "GBPUSD=X", "USDJPY": "JPY=X",
    "USDCHF": "CHF=X",    "AUDUSD": "AUDUSD=X", "NZDUSD": "NZDUSD=X",
    "USDCAD": "CAD=X",    "EURGBP": "EURGBP=X", "EURJPY": "EURJPY=X",
    "GBPJPY": "GBPJPY=X",
    "XAUUSD": "GC=F",     "XAGUSD": "SI=F",
    "USOIL":  "CL=F",     "UKOIL":  "BZ=F",
    "US30":   "^DJI",     "US500":  "^GSPC",
    "NAS100": "^NDX",     "GER40":  "^GDAXI",
    "BTCUSD": "BTC-USD",  "ETHUSD": "ETH-USD",
    "AAPL": "AAPL", "TSLA": "TSLA", "NVDA": "NVDA",
    "MSFT": "MSFT", "AMZN": "AMZN", "GOOGL": "GOOGL",
    "META": "META", "SPY": "SPY",   "QQQ": "QQQ", "GLD": "GLD",
}

_YF_TF: dict[str, tuple[str, str]] = {
    "M15": ("15m", "59d"),
    "H1":  ("1h",  "729d"),
    "H4":  ("1h",  "729d"),
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
    "AAPL": "EQUITY", "TSLA": "EQUITY", "NVDA": "EQUITY",
    "MSFT": "EQUITY", "AMZN": "EQUITY", "GOOGL": "EQUITY",
    "META": "EQUITY", "SPY": "EQUITY",  "QQQ": "EQUITY", "GLD": "METALS",
}


# ── Yahoo Finance data fetcher ────────────────────────────────────────────────

def _fetch_ohlcv(symbol: str, timeframe: str, count: int = 500) -> list[dict]:
    yf_ticker = YF_TICKER_MAP.get(symbol, symbol)
    interval, period = _YF_TF.get(timeframe, ("1d", "2y"))
    try:
        df = yf.download(yf_ticker, period=period, interval=interval,
                         progress=False, auto_adjust=True)
        if df.empty:
            return []
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        df.columns = [c.lower() for c in df.columns]
        if timeframe == "H4":
            df = df.resample("4h").agg({
                "open": "first", "high": "max", "low": "min",
                "close": "last", "volume": "sum",
            }).dropna()
        df = df.dropna(subset=["open", "high", "low", "close"])
        df = df.tail(count)
        return [
            {
                "time":   ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
                "open":   float(row["open"]),
                "high":   float(row["high"]),
                "low":    float(row["low"]),
                "close":  float(row["close"]),
                "volume": int(row.get("volume", 0) or 0),
            }
            for ts, row in df.iterrows()
        ]
    except Exception as e:
        logger.warning(f"yfinance fetch {symbol} ({yf_ticker}) {timeframe}: {e}")
        return []


# ── DB helpers ────────────────────────────────────────────────────────────────

def init_scanner_db() -> None:
    with _db_lock:
        con = _get_conn()
        con.execute("""
            CREATE TABLE IF NOT EXISTS scanner_results (
                id            VARCHAR PRIMARY KEY,
                symbol        VARCHAR NOT NULL,
                asset_class   VARCHAR,
                pattern       VARCHAR NOT NULL,
                category      VARCHAR NOT NULL,
                direction     VARCHAR NOT NULL,
                timeframe     VARCHAR NOT NULL,
                tf_label      VARCHAR,
                current_price DOUBLE,
                entry         DOUBLE,
                stop          DOUBLE,
                target1       DOUBLE,
                target2       DOUBLE,
                target3       DOUBLE,
                rr_ratio      DOUBLE,
                pattern_score DOUBLE,
                pattern_quality DOUBLE,
                trend_quality DOUBLE,
                volume_conf   DOUBLE,
                breakout_prob DOUBLE,
                rr_score      DOUBLE,
                classification VARCHAR,
                status        VARCHAR DEFAULT 'WATCH',
                is_starred    BOOLEAN DEFAULT false,
                commentary    VARCHAR,
                atr           DOUBLE,
                rsi           DOUBLE,
                adx           DOUBLE,
                detected_at   TIMESTAMP NOT NULL,
                expires_at    TIMESTAMP,
                created_at    TIMESTAMP DEFAULT now(),
                updated_at    TIMESTAMP DEFAULT now()
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS scanner_alerts (
                id          VARCHAR PRIMARY KEY,
                result_id   VARCHAR NOT NULL,
                alert_type  VARCHAR NOT NULL,
                message     VARCHAR NOT NULL,
                is_read     BOOLEAN DEFAULT false,
                created_at  TIMESTAMP DEFAULT now()
            )
        """)


def _row_to_dict(result, rows: list) -> list[dict]:
    cols = [d[0] for d in result.description]
    return [dict(zip(cols, row)) for row in rows]


def _upsert_result(con: duckdb.DuckDBPyConnection, symbol: str, timeframe: str, r: dict) -> str:
    res = con.execute(
        "SELECT id FROM scanner_results WHERE symbol=? AND pattern=? AND timeframe=?",
        [symbol, r["pattern"], timeframe]
    )
    existing = res.fetchone()
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
            r["atr"], r["rsi"], r["adx"], now, now, rid,
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
        """, [
            str(uuid.uuid4()), rid,
            f"New {r['classification']} pattern: {r['pattern']} on {symbol} [{TF_LABEL.get(timeframe, timeframe)}]",
        ])
        return rid


# ── Public API ────────────────────────────────────────────────────────────────

def scan_symbol(symbol: str, timeframes: list[str] | None = None, min_score: float = 40.0) -> list[dict]:
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
    syms = symbols or DEFAULT_SYMBOLS
    tfs = timeframes or DEFAULT_TIMEFRAMES
    total_new, total_updated, errors = 0, 0, 0
    init_scanner_db()
    for symbol in syms:
        for tf in tfs:
            try:
                bars = _fetch_ohlcv(symbol, tf, 500)
                if len(bars) < 20:
                    errors += 1
                    continue
                patterns = scan_bars(bars, min_score=min_score)
                with _db_lock:
                    con = _get_conn()
                    for p in patterns:
                        res = con.execute(
                            "SELECT id FROM scanner_results WHERE symbol=? AND pattern=? AND timeframe=?",
                            [symbol, p["pattern"], tf]
                        )
                        existed = res.fetchone() is not None
                        _upsert_result(con, symbol, tf, p)
                        if existed:
                            total_updated += 1
                        else:
                            total_new += 1
                time.sleep(0.1)
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
    conditions: list[str] = []
    params: list[Any] = []
    if direction:   conditions.append("direction=?");    params.append(direction)
    if category:    conditions.append("category=?");     params.append(category)
    if timeframe:   conditions.append("timeframe=?");    params.append(timeframe)
    if asset_class: conditions.append("asset_class=?"); params.append(asset_class)
    if status:      conditions.append("status=?");       params.append(status)
    if min_score is not None:
        conditions.append("pattern_score>=?"); params.append(min_score)

    allowed = {"pattern_score", "rr_ratio", "detected_at", "symbol", "pattern", "created_at"}
    col = sort_by if sort_by in allowed else "pattern_score"
    dir_sql = "DESC" if sort_dir.lower() == "desc" else "ASC"
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    params.append(limit)

    with _db_lock:
        con = _get_conn()
        res = con.execute(
            f"SELECT * FROM scanner_results {where} ORDER BY {col} {dir_sql} LIMIT ?",
            params,
        )
        rows = res.fetchall()
        cols = [d[0] for d in res.description]
    return [dict(zip(cols, row)) for row in rows]


def get_result_by_id(result_id: str) -> dict | None:
    init_scanner_db()
    with _db_lock:
        con = _get_conn()
        res = con.execute("SELECT * FROM scanner_results WHERE id=?", [result_id])
        row = res.fetchone()
        if not row:
            return None
        cols = [d[0] for d in res.description]
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
    with _db_lock:
        con = _get_conn()
        con.execute(f"UPDATE scanner_results SET {set_clause} WHERE id=?", vals)
        if "status" in fields and fields["status"] in ("TRIGGERED", "CONFIRMED", "FAILED"):
            label_map = {
                "TRIGGERED": "BREAKOUT_TRIGGERED",
                "CONFIRMED": "BREAKOUT_CONFIRMED",
                "FAILED":    "PATTERN_FAILED",
            }
            res = con.execute("SELECT symbol, pattern FROM scanner_results WHERE id=?", [result_id])
            row = res.fetchone()
            if row:
                con.execute(
                    "INSERT INTO scanner_alerts (id, result_id, alert_type, message) VALUES (?,?,?,?)",
                    [str(uuid.uuid4()), result_id, label_map[fields["status"]],
                     f"{row[1]} on {row[0]} → {fields['status']}"],
                )
    return get_result_by_id(result_id)


def get_alerts(unread_only: bool = False, limit: int = 50) -> list[dict]:
    init_scanner_db()
    where = "WHERE a.is_read=false" if unread_only else ""
    with _db_lock:
        con = _get_conn()
        res = con.execute(f"""
            SELECT a.*, r.symbol, r.pattern, r.timeframe, r.direction, r.pattern_score
            FROM scanner_alerts a
            LEFT JOIN scanner_results r ON a.result_id=r.id
            {where}
            ORDER BY a.created_at DESC LIMIT ?
        """, [limit])
        rows = res.fetchall()
        cols = [d[0] for d in res.description]
    return [dict(zip(cols, row)) for row in rows]


def mark_alerts_read(alert_ids: list[str]) -> None:
    init_scanner_db()
    if not alert_ids:
        return
    placeholders = ",".join("?" * len(alert_ids))
    with _db_lock:
        con = _get_conn()
        con.execute(f"UPDATE scanner_alerts SET is_read=true WHERE id IN ({placeholders})", alert_ids)


def get_performance_stats() -> dict:
    init_scanner_db()
    with _db_lock:
        con = _get_conn()
        total = con.execute("SELECT COUNT(*) FROM scanner_results").fetchone()[0]
        by_dir   = con.execute("SELECT direction, COUNT(*), AVG(pattern_score) FROM scanner_results GROUP BY direction").fetchall()
        by_cat   = con.execute("SELECT category, COUNT(*), AVG(pattern_score) FROM scanner_results GROUP BY category").fetchall()
        by_tf    = con.execute("SELECT timeframe, COUNT(*), AVG(pattern_score) FROM scanner_results GROUP BY timeframe").fetchall()
        by_class = con.execute("SELECT classification, COUNT(*) FROM scanner_results GROUP BY classification").fetchall()
        by_stat  = con.execute("SELECT status, COUNT(*) FROM scanner_results GROUP BY status").fetchall()
        recent   = con.execute("""
            SELECT symbol, pattern, tf_label, pattern_score, classification, direction, detected_at
            FROM scanner_results ORDER BY detected_at DESC LIMIT 5
        """).fetchall()
    recent_cols = ["symbol", "pattern", "tf_label", "pattern_score", "classification", "direction", "detected_at"]
    return {
        "total_detected":    total,
        "by_direction":      [{"direction": r[0],      "count": r[1], "avg_score": round(r[2] or 0, 1)} for r in by_dir],
        "by_category":       [{"category": r[0],       "count": r[1], "avg_score": round(r[2] or 0, 1)} for r in by_cat],
        "by_timeframe":      [{"timeframe": r[0],      "count": r[1], "avg_score": round(r[2] or 0, 1)} for r in by_tf],
        "by_classification": [{"classification": r[0], "count": r[1]} for r in by_class],
        "by_status":         [{"status": r[0],         "count": r[1]} for r in by_stat],
        "recent":            [dict(zip(recent_cols, r)) for r in recent],
    }


def delete_all_results() -> int:
    init_scanner_db()
    with _db_lock:
        con = _get_conn()
        n = con.execute("SELECT COUNT(*) FROM scanner_results").fetchone()[0]
        con.execute("DELETE FROM scanner_results")
        con.execute("DELETE FROM scanner_alerts")
    return n
