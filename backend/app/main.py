import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import data, factors, backtest, portfolio, risk, technical
from app.core.data.cache import init_db

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Quant Dashboard API", version="0.1.0", lifespan=lifespan)

_raw_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003")
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data.router, prefix="/api/data")
app.include_router(factors.router, prefix="/api/factors")
app.include_router(backtest.router, prefix="/api/backtest")
app.include_router(portfolio.router, prefix="/api/portfolio")
app.include_router(risk.router, prefix="/api/risk")
app.include_router(technical.router, prefix="/api/technical")


@app.get("/health")
async def health():
    return {"status": "ok"}
