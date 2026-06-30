from __future__ import annotations
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel
from app.core.scanner import scanner as sc

router = APIRouter(tags=["scanner"])


class UpdateBody(BaseModel):
    status: str | None = None
    is_starred: bool | None = None
    commentary: str | None = None


class ScanBody(BaseModel):
    symbols: list[str] | None = None
    timeframes: list[str] | None = None
    min_score: float = 40.0


@router.get("/results")
def get_results(
    direction:   str | None = Query(None),
    category:    str | None = Query(None),
    timeframe:   str | None = Query(None),
    asset_class: str | None = Query(None),
    status:      str | None = Query(None),
    min_score:   float | None = Query(None),
    sort_by:     str         = Query("pattern_score"),
    sort_dir:    str         = Query("desc"),
    limit:       int         = Query(200),
):
    return sc.get_results(
        direction=direction, category=category, timeframe=timeframe,
        asset_class=asset_class, status=status, min_score=min_score,
        sort_by=sort_by, sort_dir=sort_dir, limit=limit,
    )


@router.get("/results/{result_id}")
def get_result(result_id: str):
    r = sc.get_result_by_id(result_id)
    if not r:
        raise HTTPException(404, "Not found")
    return r


@router.patch("/results/{result_id}")
def update_result(result_id: str, body: UpdateBody):
    data = body.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(400, "Nothing to update")
    updated = sc.update_result(result_id, data)
    if not updated:
        raise HTTPException(404, "Not found")
    return updated


@router.post("/scan")
def trigger_scan(body: ScanBody, background_tasks: BackgroundTasks):
    if not _mt5_available():
        raise HTTPException(503, "MT5 terminal not connected")
    background_tasks.add_task(sc.run_scan, body.symbols, body.timeframes, body.min_score)
    return {"status": "scan_started", "symbols": body.symbols or sc.DEFAULT_SYMBOLS,
            "timeframes": body.timeframes or sc.DEFAULT_TIMEFRAMES}


@router.get("/scan/{symbol}")
def scan_single(symbol: str, timeframes: str = Query("M15,H1,H4,D1"), min_score: float = Query(40.0)):
    if not _mt5_available():
        raise HTTPException(503, "MT5 terminal not connected")
    tfs = [t.strip() for t in timeframes.split(",") if t.strip()]
    results = sc.scan_symbol(symbol.upper(), tfs, min_score)
    sc.init_scanner_db()
    import duckdb
    with duckdb.connect(sc._DB_PATH) as con:
        for r in results:
            sc._upsert_result(con, symbol.upper(), r["timeframe"], r)
    return {"symbol": symbol.upper(), "patterns": results, "count": len(results)}


@router.get("/symbols")
def get_symbols():
    return {"symbols": sc.DEFAULT_SYMBOLS, "asset_classes": sc.ASSET_CLASS_MAP}


@router.get("/alerts")
def get_alerts(unread_only: bool = Query(False), limit: int = Query(50)):
    alerts = sc.get_alerts(unread_only=unread_only, limit=limit)
    unread_count = sum(1 for a in alerts if not a.get("is_read"))
    return {"alerts": alerts, "unread_count": unread_count}


@router.patch("/alerts/read")
def mark_read(ids: list[str]):
    sc.mark_alerts_read(ids)
    return {"marked": len(ids)}


@router.get("/performance")
def performance():
    return sc.get_performance_stats()


@router.delete("/results")
def purge_results():
    n = sc.delete_all_results()
    return {"deleted": n}


def _mt5_available() -> bool:
    from app.core.mt5 import client as mt5c
    return mt5c.is_available() and mt5c._ensure_connected()
