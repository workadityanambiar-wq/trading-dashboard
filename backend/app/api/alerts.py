"""
Alerts REST API — CRUD for alert definitions + trigger history + unread count.
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.alerts.models import (
    create_alert, get_alerts, delete_alert,
    get_triggers, mark_read, get_unread_count,
)

router = APIRouter()


# ── Request / Response models ──────────────────────────────────────────────────

class AlertCreate(BaseModel):
    ticker: str
    name: str
    category: str
    condition: str
    params: dict = {}
    channels: List[str] = ["in_app"]
    repeat: bool = False
    user_id: str = "default"


class MarkReadRequest(BaseModel):
    trigger_ids: List[str]


# ── Alert CRUD ─────────────────────────────────────────────────────────────────

@router.post("/")
def api_create_alert(body: AlertCreate):
    alert_id = create_alert(
        ticker=body.ticker,
        name=body.name,
        category=body.category,
        condition=body.condition,
        params=body.params,
        channels=body.channels,
        repeat=body.repeat,
        user_id=body.user_id,
    )
    return {"id": alert_id, "status": "created"}


@router.get("/")
def api_get_alerts(
    user_id: str = Query("default"),
    active_only: bool = Query(True),
):
    return get_alerts(user_id=user_id, active_only=active_only)


@router.delete("/{alert_id}")
def api_delete_alert(alert_id: str, user_id: str = Query("default")):
    delete_alert(alert_id, user_id=user_id)
    return {"status": "deleted"}


# ── Trigger history ────────────────────────────────────────────────────────────

@router.get("/triggers")
def api_get_triggers(
    user_id: str = Query("default"),
    unread_only: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
):
    triggers = get_triggers(user_id=user_id, unread_only=unread_only, limit=limit)
    # Ensure datetime fields are serialisable strings
    for t in triggers:
        if hasattr(t.get("triggered_at"), "isoformat"):
            t["triggered_at"] = t["triggered_at"].isoformat()
    return triggers


@router.post("/triggers/mark-read")
def api_mark_read(body: MarkReadRequest):
    mark_read(body.trigger_ids)
    return {"status": "ok"}


@router.get("/unread-count")
def api_unread_count(user_id: str = Query("default")):
    return {"count": get_unread_count(user_id=user_id)}


# ── Condition catalogue (for frontend dropdowns) ───────────────────────────────

_CONDITIONS = [
    # Price conditions
    {"id": "price_above",           "label": "Price Above Level",       "category": "price",     "params": ["level"]},
    {"id": "price_below",           "label": "Price Below Level",       "category": "price",     "params": ["level"]},
    {"id": "pct_move",              "label": "% Move in One Session",   "category": "price",     "params": ["pct_threshold"]},
    {"id": "gap_up",                "label": "Gap Up at Open",          "category": "price",     "params": ["gap_pct"]},
    {"id": "gap_down",              "label": "Gap Down at Open",        "category": "price",     "params": ["gap_pct"]},
    {"id": "new_52w_high",          "label": "New 52-Week High",        "category": "price",     "params": []},
    {"id": "new_52w_low",           "label": "New 52-Week Low",         "category": "price",     "params": []},
    {"id": "breakout_resistance",   "label": "Resistance Breakout",     "category": "price",     "params": ["lookback"]},
    {"id": "breakdown_support",     "label": "Support Breakdown",       "category": "price",     "params": ["lookback"]},
    # Technical conditions
    {"id": "rsi_overbought",        "label": "RSI Overbought",          "category": "technical", "params": ["threshold"]},
    {"id": "rsi_oversold",          "label": "RSI Oversold",            "category": "technical", "params": ["threshold"]},
    {"id": "macd_bullish_cross",    "label": "MACD Bullish Crossover",  "category": "technical", "params": []},
    {"id": "macd_bearish_cross",    "label": "MACD Bearish Crossover",  "category": "technical", "params": []},
    {"id": "golden_cross",          "label": "Golden Cross (50/200)",   "category": "technical", "params": []},
    {"id": "death_cross",           "label": "Death Cross (50/200)",    "category": "technical", "params": []},
    {"id": "bb_breakout",           "label": "Bollinger Band Breakout", "category": "technical", "params": []},
    {"id": "atr_expansion",         "label": "Volatility Expansion",    "category": "technical", "params": ["ratio_threshold"]},
    {"id": "volume_spike",          "label": "Volume Spike",            "category": "technical", "params": ["vol_multiplier"]},
    {"id": "vwap_crossover",        "label": "VWAP Crossover",          "category": "technical", "params": []},
    # Momentum / MR
    {"id": "momentum_top10",        "label": "Top Momentum Decile",     "category": "momentum",  "params": ["lookback"]},
    {"id": "zscore_extreme",        "label": "Extreme Z-Score",         "category": "momentum",  "params": ["z_threshold"]},
    {"id": "price_far_above_ma",    "label": "Price Far Above 50d MA",  "category": "momentum",  "params": ["dist_pct"]},
    {"id": "price_far_below_ma",    "label": "Price Far Below 50d MA",  "category": "momentum",  "params": ["dist_pct"]},
    # Composite
    {"id": "breakout_composite",    "label": "High-Confidence Breakout","category": "composite", "params": []},
    {"id": "reversal_bullish",      "label": "Bullish Reversal",        "category": "composite", "params": []},
    {"id": "reversal_bearish",      "label": "Bearish Reversal",        "category": "composite", "params": []},
    {"id": "ai_signal",             "label": "AI Composite Signal",     "category": "composite", "params": []},
]


@router.get("/conditions")
def api_list_conditions():
    return _CONDITIONS
