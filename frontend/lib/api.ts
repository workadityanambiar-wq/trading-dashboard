export interface IndexCard {
  ticker: string;
  name: string;
  price: number;
  change_1d: number;
  change_wtd: number;
  change_mtd: number;
  change_ytd: number;
  change_1y: number;
}

export interface SectorReturn {
  ticker: string;
  name: string;
  sector: string;
  change_1d: number;
  change_1w: number;
  change_1m: number;
  change_3m: number;
  change_ytd: number;
}

export interface BreadthData {
  above_50ma_pct: number;
  above_200ma_pct: number;
  sp500_count: number;
}

export interface OverviewResponse {
  indices: IndexCard[];
  sectors: SectorReturn[];
  breadth: BreadthData;
}

export interface OHLCVBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PricesResponse {
  ticker: string;
  bars: OHLCVBar[];
}

// ── Factor types ──────────────────────────────────────────────────────────────

export interface FactorScore {
  ticker: string;
  name: string;
  sector: string;
  exchange?: string;
  is_etf?: boolean;
  has_prices?: boolean;
  momentum_12_1: number | null;
  momentum_6_1: number | null;
  realized_vol: number | null;
  momentum_12_1_z: number | null;
  momentum_6_1_z: number | null;
  low_vol_z: number | null;
  liquidity_z: number | null;
  macro_regime_z: number | null;
  value_z: number | null;
  size_z: number | null;
  quality_z: number | null;
  profitability_z: number | null;
  earnings_revisions_z: number | null;
  sentiment_z: number | null;
  composite: number | null;
}

export interface ScoresResponse {
  status: "ok" | "partial" | "loading";
  universe?: string;
  cached_pct?: number;
  as_of?: string;
  message?: string;
  total?: number;
  page?: number;
  page_size?: number;
  pages?: number;
  scores: FactorScore[];
}

export interface ScoresParams {
  universe?: string;
  page?: number;
  page_size?: number;
  search?: string;
  exchange?: string;
  is_etf?: boolean;
  has_prices_only?: boolean;
}

export interface UniverseRow {
  ticker: string;
  name: string;
  exchange: string;
  is_etf: boolean;
  sector: string;
  sub_industry: string;
  market_cap: number | null;
  has_prices: boolean;
  last_price_date: string | null;
}

export interface UniverseSearchResponse {
  total: number;
  page: number;
  page_size: number;
  pages: number;
  results: UniverseRow[];
}

export const EXCHANGE_LABELS: Record<string, string> = {
  Q: "NASDAQ",
  G: "NASDAQ",
  S: "NASDAQ",
  N: "NYSE",
  A: "NYSE American",
  P: "NYSE Arca",
  Z: "CBOE",
  V: "CBOE",
  M: "CBOE",
};

export interface ICPoint {
  date: string;
  ic: number | null;
  ic_3m_ma: number | null;
  cumulative_ic: number | null;
}

export interface ICStats {
  mean_ic: number;
  icir: number | null;
  pct_positive: number;
  n_obs: number;
}

export interface ICResponse {
  factor: string;
  horizon: number;
  series: ICPoint[];
  stats: ICStats;
  no_history?: boolean;
}

export interface QuintileResponse {
  factor: string;
  series: QuintilePoint[];
  no_history?: boolean;
}

export interface QuintilePoint {
  date: string;
  Q1?: number;
  Q2?: number;
  Q3?: number;
  Q4?: number;
  Q5?: number;
}

export interface FactorSummary {
  factor: string;
  label: string;
  mean_ic: number | null;
  icir: number | null;
  pct_positive: number | null;
  n_obs: number;
}

export interface SummaryResponse {
  status: string;
  factors: FactorSummary[];
}

// ── Backtest types ────────────────────────────────────────────────────────────

export interface BacktestConfig {
  factor: string;
  top_n: number;
  cost_bps: number;
  start_date: string;
  end_date?: string;
}

export interface CurvePoint {
  date: string;
  portfolio?: number | null;
  benchmark?: number | null;
}

export interface DrawdownPoint {
  date: string;
  drawdown: number | null;
}

export interface MonthlyReturn {
  year: number;
  month: number;
  return_pct: number | null;
}

export interface RollingSharpPoint {
  date: string;
  sharpe: number | null;
}

export interface BacktestStats {
  total_return?: number;
  cagr?: number;
  sharpe?: number;
  sortino?: number;
  calmar?: number;
  max_drawdown?: number;
  volatility?: number;
  beta?: number;
  alpha?: number;
  information_ratio?: number;
  hit_rate?: number;
  avg_monthly_return?: number;
  best_month?: number;
  worst_month?: number;
}

export interface BacktestResult {
  config: BacktestConfig;
  stats: BacktestStats;
  equity_curve: CurvePoint[];
  drawdown_series: DrawdownPoint[];
  monthly_returns: MonthlyReturn[];
  rolling_sharpe: RollingSharpPoint[];
  n_dates: number;
  n_tickers_available: number;
}

// ── API client ────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const FACTOR_OPTIONS: { value: string; label: string; icHistory: boolean }[] = [
  // Price-based — full IC / quintile history
  { value: "momentum_12_1",     label: "Momentum 12-1M",      icHistory: true  },
  { value: "momentum_6_1",      label: "Momentum 6-1M",       icHistory: true  },
  { value: "low_vol",           label: "Low Volatility",      icHistory: true  },
  { value: "liquidity",         label: "Liquidity",           icHistory: true  },
  { value: "macro_regime",      label: "Macro Regime",        icHistory: true  },
  // Fundamental — latest scores only
  { value: "value",             label: "Value",               icHistory: false },
  { value: "size",              label: "Size",                icHistory: false },
  { value: "quality",           label: "Quality",             icHistory: false },
  { value: "profitability",     label: "Profitability",       icHistory: false },
  { value: "earnings_revisions",label: "Earnings Revisions",  icHistory: false },
  { value: "sentiment",         label: "Sentiment",           icHistory: false },
];

export const api = {
  getOverview: () => apiFetch<OverviewResponse>("/data/overview"),
  getPrices: (ticker: string, period = "1y") =>
    apiFetch<PricesResponse>(`/data/prices/${ticker}?period=${period}`),
  getUniverse: () => apiFetch<{ ticker: string; name: string; sector: string; sub_industry: string }[]>("/data/universe"),
  getFactorScores: (params?: ScoresParams) => {
    const q = new URLSearchParams();
    if (params?.universe)        q.set("universe", params.universe);
    if (params?.page)            q.set("page", String(params.page));
    if (params?.page_size)       q.set("page_size", String(params.page_size));
    if (params?.search)          q.set("search", params.search);
    if (params?.exchange)        q.set("exchange", params.exchange);
    if (params?.is_etf != null)  q.set("is_etf", String(params.is_etf));
    if (params?.has_prices_only) q.set("has_prices_only", "true");
    const qs = q.toString();
    return apiFetch<ScoresResponse>(`/factors/scores${qs ? "?" + qs : ""}`);
  },
  getIC: (factor: string, horizon = 21, universe = "sp500") =>
    apiFetch<ICResponse>(`/factors/ic?factor=${factor}&horizon=${horizon}&universe=${encodeURIComponent(universe)}`),
  getQuintiles: (factor: string, universe = "sp500") =>
    apiFetch<QuintileResponse>(`/factors/quintiles?factor=${factor}&universe=${encodeURIComponent(universe)}`),
  getFactorSummary: () => apiFetch<SummaryResponse>("/factors/summary"),
  triggerFundamentals: (maxTickers = 50) =>
    fetch(`/api/factors/fetch-fundamentals?max_tickers=${maxTickers}`, { method: "POST" }),
  prefetchUniverse: (exchange = "", limit = 500) =>
    fetch(`/api/data/universe/prefetch?exchange=${exchange}&limit=${limit}`, { method: "POST" }),
  runBacktest: (config: BacktestConfig) =>
    apiFetch<BacktestResult>("/backtest/run", { method: "POST", body: JSON.stringify(config) }),
  optimizePortfolio: (req: OptimizeRequest) =>
    apiFetch<OptimizeResponse>("/portfolio/optimize", { method: "POST", body: JSON.stringify(req) }),
  analyzeRisk: (req: RiskRequest) =>
    apiFetch<RiskResponse>("/risk/analyze", { method: "POST", body: JSON.stringify(req) }),
  getThemes: () =>
    apiFetch<{ themes: ThemeGroup[] }>("/technical/themes"),
  getTechnicalSignals: (params: TechnicalSignalsParams) => {
    const q = new URLSearchParams();
    if (params.universe)        q.set("universe", params.universe);
    if (params.theme)           q.set("theme", params.theme);
    if (params.segment)         q.set("segment", params.segment);
    if (params.search)          q.set("search", params.search);
    if (params.sort_by)         q.set("sort_by", params.sort_by);
    if (params.desc != null)    q.set("desc", String(params.desc));
    if (params.page)            q.set("page", String(params.page));
    if (params.page_size)       q.set("page_size", String(params.page_size));
    if (params.near_pivot)      q.set("near_pivot", "true");
    if (params.pivot_min != null) q.set("pivot_min", String(params.pivot_min));
    if (params.pivot_max != null) q.set("pivot_max", String(params.pivot_max));
    return apiFetch<TechnicalSignalsResponse>(`/technical/signals?${q.toString()}`);
  },
};

// ── Portfolio types ───────────────────────────────────────────────────────────

export interface OptimizeRequest {
  tickers: string[];
  methods?: string[];
  max_weight?: number;
  start_date?: string;
}

export interface PortfolioMetrics {
  expected_return: number;
  volatility: number;
  sharpe: number;
}

export interface FrontierPoint {
  volatility: number;
  expected_return: number;
}

export interface CorrelationMatrix {
  tickers: string[];
  matrix: number[][];
}

export interface OptimizeResponse {
  tickers_used: string[];
  tickers_missing: string[];
  price_history_start: string;
  price_history_end: string;
  allocations: Record<string, Record<string, number>>;
  metrics: Record<string, PortfolioMetrics>;
  frontier: FrontierPoint[];
  correlation: CorrelationMatrix;
}

// ── Risk types ────────────────────────────────────────────────────────────────

export interface RiskRequest {
  weights: Record<string, number>;
  start_date?: string;
  benchmark?: string;
}

export interface VarCvarPoint {
  confidence: number;
  var_hist: number;
  cvar_hist: number;
  var_param: number;
  cvar_param: number;
  n_obs: number;
}

export interface ConcentrationMetrics {
  n_holdings: number;
  hhi: number;
  effective_n: number;
  top5_weight: number;
  top10_weight: number;
}

export interface FF3Attribution {
  alpha: number | null;
  beta_mkt: number | null;
  beta_smb: number | null;
  beta_hml: number | null;
  r_squared: number | null;
  t_stats: Record<string, number>;
  p_values: Record<string, number>;
  residual_vol: number | null;
  n_obs: number;
  error: string | null;
}

export interface RollingBetaPoint {
  date: string;
  beta: number;
}

export interface RiskResponse {
  tickers_used: string[];
  tickers_missing: string[];
  price_history_start: string;
  price_history_end: string;
  portfolio_stats: {
    annualized_return: number;
    annualized_volatility: number;
    sharpe_ratio: number;
    n_obs: number;
  };
  var_cvar: VarCvarPoint[];
  concentration: ConcentrationMetrics;
  attribution: FF3Attribution;
  rolling_beta: RollingBetaPoint[];
  sector_exposure: Record<string, number>;
  correlation: CorrelationMatrix;
}

// ── Technical / Short-term signal types ──────────────────────────────────────

export interface TechnicalSignal {
  ticker: string;
  price: number | null;
  chg_1d: number | null;
  rsi: number | null;
  bb_pct_b: number | null;
  macd_hist: number | null;
  ma50_dist: number | null;
  ma200_dist: number | null;
  rs_spy_20d: number | null;
  rs_spy_5d: number | null;
  vol_surge: number | null;
  atr_ratio: number | null;
  overnight_gap: number | null;
  rev_5d: number | null;
  momentum_score: number | null;
  pivot_dist: number | null;
  nearest_pivot: string | null;
}

export interface ThemeSegment {
  id: string;
  name: string;
  ticker_count: number;
}

export interface ThemeGroup {
  id: string;
  name: string;
  color: string;
  segments: ThemeSegment[];
}

export interface TechnicalSignalsParams {
  universe?: string;
  theme?: string;
  segment?: string;
  search?: string;
  sort_by?: string;
  desc?: boolean;
  page?: number;
  page_size?: number;
  near_pivot?: boolean;
  pivot_min?: number;
  pivot_max?: number;
}

export interface TechnicalSignalsResponse {
  total: number;
  page: number;
  page_size: number;
  pages: number;
  universe_size: number;
  as_of: string | null;
  results: TechnicalSignal[];
  message?: string;
}
