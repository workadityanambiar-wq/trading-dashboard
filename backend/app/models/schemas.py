from pydantic import BaseModel
from typing import List, Optional
from datetime import date


class IndexCard(BaseModel):
    ticker: str
    name: str
    price: float
    change_1d: float
    change_wtd: float
    change_mtd: float
    change_ytd: float
    change_1y: float


class SectorReturn(BaseModel):
    ticker: str
    name: str
    sector: str
    change_1d: float
    change_1w: float
    change_1m: float
    change_3m: float
    change_ytd: float


class BreadthData(BaseModel):
    above_50ma_pct: float
    above_200ma_pct: float
    sp500_count: int


class OverviewResponse(BaseModel):
    indices: List[IndexCard]
    sectors: List[SectorReturn]
    breadth: BreadthData


class OHLCVBar(BaseModel):
    time: str  # ISO date string for Lightweight Charts
    open: float
    high: float
    low: float
    close: float
    volume: int


class PricesResponse(BaseModel):
    ticker: str
    bars: List[OHLCVBar]


class UniverseTicker(BaseModel):
    ticker: str
    name: str
    sector: str
    sub_industry: str


class FactorScores(BaseModel):
    ticker: str
    name: Optional[str]
    sector: Optional[str]
    market_cap: Optional[float]
    momentum_12_1: Optional[float]
    momentum_6_1: Optional[float]
    realized_vol: Optional[float]
    composite_score: Optional[float]


class BacktestConfig(BaseModel):
    universe: str = "sp500"
    factor: str = "momentum_12_1"
    top_n: int = 50
    rebal_freq: str = "M"
    cost_bps: float = 10.0
    start_date: str = "2015-01-01"
    end_date: Optional[str] = None


class MonthlyReturn(BaseModel):
    year: int
    month: int
    return_pct: float


class BacktestStats(BaseModel):
    total_return: float
    cagr: float
    sharpe: float
    sortino: float
    calmar: float
    max_drawdown: float
    beta: float
    alpha: float
    volatility: float
    hit_rate: float


class BacktestResult(BaseModel):
    config: BacktestConfig
    stats: BacktestStats
    equity_curve: List[dict]
    drawdown_series: List[dict]
    monthly_returns: List[MonthlyReturn]
    benchmark_curve: List[dict]
