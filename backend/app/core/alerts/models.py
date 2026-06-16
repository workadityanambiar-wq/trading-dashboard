"""
Alert storage layer — DuckDB tables for alerts and triggers.
"""
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List

from app.core.data.cache import _conn

logger = logging.getLogger(__name__)


def init_alert_tables():
    with _conn() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS alerts (
                id          VARCHAR PRIMARY KEY,
                user_id     VARCHAR DEFAULT 'default',
                ticker      VARCHAR NOT NULL,
                name        VARCHAR,
                category    VARCHAR NOT NULL,
                condition   VARCHAR NOT NULL,
                params      VARCHAR,
                channels    VARCHAR DEFAULT 'in_app',
                is_active   BOOLEAN DEFAULT true,
                repeat      BOOLEAN DEFAULT false,
                created_at  TIMESTAMPTZ DEFAULT now()
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS alert_triggers (
                id              VARCHAR PRIMARY KEY,
                alert_id        VARCHAR NOT NULL,
                ticker          VARCHAR NOT NULL,
                category        VARCHAR,
                condition       VARCHAR,
                trigger_price   DOUBLE,
                confidence      INTEGER,
                signal_type     VARCHAR,
                explanation     VARCHAR,
                suggestion      VARCHAR,
                risk_level      VARCHAR,
                success_rate    VARCHAR,
                is_read         BOOLEAN DEFAULT false,
                triggered_at    TIMESTAMPTZ DEFAULT now()
            )
        """)


# ── Alert CRUD ─────────────────────────────────────────────────────────────────

def create_alert(
    ticker: str,
    name: str,
    category: str,
    condition: str,
    params: dict,
    channels: List[str] = None,
    repeat: bool = False,
    user_id: str = "default",
) -> str:
    alert_id = str(uuid.uuid4())
    params_json = json.dumps(params)
    channels_str = ",".join(channels or ["in_app"])
    with _conn() as con:
        con.execute(
            "INSERT INTO alerts(id,user_id,ticker,name,category,condition,params,channels,repeat) VALUES(?,?,?,?,?,?,?,?,?)",
            [alert_id, user_id, ticker.upper(), name, category, condition, params_json, channels_str, repeat]
        )
    return alert_id


def get_alerts(user_id: str = "default", active_only: bool = True) -> List[dict]:
    with _conn() as con:
        q = "SELECT * FROM alerts WHERE user_id=?"
        if active_only:
            q += " AND is_active=true"
        q += " ORDER BY created_at DESC"
        rows = con.execute(q, [user_id]).fetchall()
        cols = [d[0] for d in con.execute(q, [user_id]).description] if rows else []

    if not rows:
        with _conn() as con:
            rows = con.execute(q, [user_id]).fetchall()
            desc = con.execute("SELECT * FROM alerts LIMIT 0").description
            cols = [d[0] for d in desc]

    result = []
    for row in rows:
        d = dict(zip(cols, row))
        try:
            d["params"] = json.loads(d.get("params") or "{}")
        except Exception:
            d["params"] = {}
        d["channels"] = (d.get("channels") or "in_app").split(",")
        result.append(d)
    return result


def get_all_active_alerts() -> List[dict]:
    with _conn() as con:
        desc = con.execute("SELECT * FROM alerts LIMIT 0").description
        cols = [d[0] for d in desc]
        rows = con.execute("SELECT * FROM alerts WHERE is_active=true").fetchall()
    result = []
    for row in rows:
        d = dict(zip(cols, row))
        try:
            d["params"] = json.loads(d.get("params") or "{}")
        except Exception:
            d["params"] = {}
        d["channels"] = (d.get("channels") or "in_app").split(",")
        result.append(d)
    return result


def delete_alert(alert_id: str, user_id: str = "default"):
    with _conn() as con:
        con.execute("UPDATE alerts SET is_active=false WHERE id=? AND user_id=?", [alert_id, user_id])


def record_trigger(
    alert_id: str,
    ticker: str,
    category: str,
    condition: str,
    trigger_price: float,
    confidence: int,
    signal_type: str,
    explanation: str,
    suggestion: str,
    risk_level: str,
    success_rate: str,
    repeat: bool = False,
):
    trigger_id = str(uuid.uuid4())
    with _conn() as con:
        con.execute(
            """INSERT INTO alert_triggers
               (id,alert_id,ticker,category,condition,trigger_price,confidence,signal_type,
                explanation,suggestion,risk_level,success_rate,triggered_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            [trigger_id, alert_id, ticker, category, condition, trigger_price, confidence,
             signal_type, explanation, suggestion, risk_level, success_rate,
             datetime.now(timezone.utc).isoformat()]
        )
        if not repeat:
            con.execute("UPDATE alerts SET is_active=false WHERE id=?", [alert_id])


def get_triggers(user_id: str = "default", unread_only: bool = False, limit: int = 100) -> List[dict]:
    with _conn() as con:
        desc = con.execute("SELECT * FROM alert_triggers LIMIT 0").description
        cols = [d[0] for d in desc]
        q = """
            SELECT t.* FROM alert_triggers t
            JOIN alerts a ON t.alert_id = a.id
            WHERE a.user_id=?
        """
        params = [user_id]
        if unread_only:
            q += " AND t.is_read=false"
        q += " ORDER BY t.triggered_at DESC LIMIT ?"
        params.append(limit)
        rows = con.execute(q, params).fetchall()
    return [dict(zip(cols, row)) for row in rows]


def mark_read(trigger_ids: List[str]):
    if not trigger_ids:
        return
    placeholders = ",".join("?" for _ in trigger_ids)
    with _conn() as con:
        con.execute(f"UPDATE alert_triggers SET is_read=true WHERE id IN ({placeholders})", trigger_ids)


def get_unread_count(user_id: str = "default") -> int:
    with _conn() as con:
        row = con.execute(
            "SELECT COUNT(*) FROM alert_triggers t JOIN alerts a ON t.alert_id=a.id WHERE a.user_id=? AND t.is_read=false",
            [user_id]
        ).fetchone()
    return int(row[0]) if row else 0
