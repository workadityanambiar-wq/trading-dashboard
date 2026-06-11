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

export type RotationQuadrant = "Leading" | "Improving" | "Weakening" | "Lagging";

export interface SectorRotationPoint {
  ticker: string;
  name: string;
  sector: string;
  rs_ratio: number;
  rs_momentum: number;
  quadrant: RotationQuadrant;
  rs_rank: number;
  trail: [number, number][];
  change_1d: number;
  change_1w: number;
  change_1m: number;
  change_3m: number;
  change_ytd: number;
}

export interface SectorRotationResponse {
  as_of: string;
  sectors: SectorRotationPoint[];
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

// ── RS Rankings types ─────────────────────────────────────────────────────────

export interface RSRankingEntry {
  ticker: string;
  price: number | null;
  chg_1d: number | null;
  sector: string;
  rs_5d: number | null;
  rs_20d: number | null;
  rs_63d: number | null;
  rs_126d: number | null;
  rs_252d: number | null;
  rs_composite: number;
  rs_rank: number;
  rs_trend: number | null;
}

export interface RSRankingsResponse {
  total: number;
  page: number;
  page_size: number;
  pages: number;
  universe_size: number;
  leaders: number;
  laggards: number;
  rising: number;
  falling: number;
  as_of: string | null;
  results: RSRankingEntry[];
}

export interface RSRankingsParams {
  universe?: string;
  min_rs_rank?: number;
  sector?: string;
  sort_by?: string;
  desc?: boolean;
  page?: number;
  page_size?: number;
}

// ── Earnings Calendar types ───────────────────────────────────────────────────

export interface EarningsCalendarStock {
  ticker: string;
  price: number | null;
  chg_1d: number | null;
  setup: string;
  stage: number | null;
  confluence_score: number | null;
  regime_adjusted_score: number | null;
  coiled_spring_score: number | null;
  rs_spy_20d: number | null;
  rs_sector_20d: number | null;
  triple_rs: boolean;
  rsi: number | null;
  vol_surge: number | null;
  dist_52w_high: number | null;
  ma50_dist: number | null;
  accum_score: number | null;
  days_to_earnings: number;
}

export interface EarningsCalendarDay {
  date: string;
  days_from_today: number;
  stocks: EarningsCalendarStock[];
}

export interface EarningsCalendarResponse {
  days: EarningsCalendarDay[];
  total_stocks: number;
  total_with_setups: number;
  prefetch_triggered: boolean;
  as_of: string;
}

export interface EarningsCalendarParams {
  universe?: string;
  days_ahead?: number;
  only_setups?: boolean;
  min_score?: number;
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

// ── Macro dashboard types ─────────────────────────────────────────────────────

export interface MacroAsset {
  ticker:   string;
  label:    string;
  category: string;
  ret_1d:   number | null;
  ret_1w:   number | null;
  ret_1m:   number | null;
  ret_3m:   number | null;
  ret_ytd:  number | null;
}

export interface YieldPoint {
  ticker:   string;
  label:    string;
  maturity: number;
  level:    number;
  prev_1m:  number | null;
  prev_1y:  number | null;
}

export interface MacroHistoryPoint {
  date:    string;
  y10:     number;
  spy_idx: number;
  tlt_idx: number;
}

export interface MacroResponse {
  as_of:         string | null;
  risk_mode:     string;
  assets:        MacroAsset[];
  yield_curve:   YieldPoint[];
  spread_3m_10y: number | null;
  history:       MacroHistoryPoint[];
}

// ── Volatility dashboard types ────────────────────────────────────────────────

export interface VolHistoryPoint {
  date:     string;
  vix:      number;
  vix_ma20: number | null;
  vix_ma50: number | null;
  vix3m:    number | null;
}

export interface VolatilityResponse {
  as_of:          string;
  vix:            number;
  vix_ma20:       number | null;
  vix_ma50:       number | null;
  regime:         string;
  regime_color:   string;
  vix_pct_1y:     number;
  vix_1y_low:     number;
  vix_1y_high:    number;
  vix3m:          number | null;
  term_structure: number | null;
  vvix:           number | null;
  vvix_pct_1y:    number | null;
  skew:           number | null;
  spy_1m:         number | null;
  spy_3m:         number | null;
  spy_ytd:        number | null;
  history:        VolHistoryPoint[];
  error?:         string;
}

// ── Correlations types ────────────────────────────────────────────────────────

export interface CorrPair {
  t1:   string;
  t2:   string;
  corr: number;
}

export interface CorrelationsResponse {
  universe:         string;
  period_days:      number;
  n_stocks:         number;
  as_of:            string | null;
  tickers:          string[];
  matrix:           number[][];
  avg_correlation:  number;
  most_correlated:  CorrPair[];
  least_correlated: CorrPair[];
  message?:         string;
}

export interface CorrelationsParams {
  universe?:    string;
  period_days?: number;
  top_n?:       number;
}

// ── Stock detail types ────────────────────────────────────────────────────────

export interface StockDetailSignals {
  setup:                 string;
  stage:                 number | null;
  chg_1d:                number | null;
  rsi:                   number | null;
  ma50_dist:             number | null;
  ma200_dist:            number | null;
  dist_52w_high:         number | null;
  vol_surge:             number | null;
  bb_width_pct:          number | null;
  atr_pct:               number | null;
  atr_dollar:            number | null;
  breakout_score:        number | null;
  confluence_score:      number | null;
  regime_alignment:      number | null;
  regime_adjusted_score: number | null;
  triple_rs:             boolean;
  accum_score:           number | null;
  nearest_pivot:         string | null;
  pivot_dist:            number | null;
  rs_spy_20d:            number | null;
  rs_sector_20d:         number | null;
}

export interface StockDetailResponse {
  ticker:            string;
  name:              string;
  sector:            string;
  price:             number | null;
  as_of:             string | null;
  bars:              OHLCVBar[];
  signals:           StockDetailSignals;
  trade: {
    entry:      number | null;
    stop:       number | null;
    target:     number | null;
    rr:         number | null;
    atr_dollar: number | null;
  };
  rs_periods: {
    rs_5d:   number | null;
    rs_20d:  number | null;
    rs_63d:  number | null;
    rs_252d: number | null;
  };
  earnings_date:    string | null;
  days_to_earnings: number | null;
  regime:           string;
}

// ── Breadth types ─────────────────────────────────────────────────────────────

export interface BreadthSnapshot {
  pct_above_20ma:  number;
  pct_above_50ma:  number;
  pct_above_200ma: number;
  pct_52w_high:    number;
  pct_52w_low:     number;
  net_new_highs:   number;
  advancing_4w:    number;
}

export interface BreadthHistoryPoint {
  date:            string;
  pct_above_20ma:  number | null;
  pct_above_50ma:  number | null;
  pct_above_200ma: number | null;
}

export interface BreadthSectorRow {
  sector:      string;
  above_50ma:  number;
  above_200ma: number;
  count:       number;
}

export interface BreadthResponse {
  universe:       string;
  n_stocks:       number;
  as_of:          string | null;
  snapshot:       BreadthSnapshot;
  history:        BreadthHistoryPoint[];
  sector_breadth: BreadthSectorRow[];
}

export interface BreadthParams {
  universe?:      string;
  lookback_days?: number;
}

// ── Options Analytics types ───────────────────────────────────────────────────

export interface OptionTermPoint {
  expiry: string;
  dte:    number;
  atm_iv: number | null;
}

export interface OptionSkewPoint {
  strike:    number;
  moneyness: number;
  put_iv:    number | null;
  call_iv:   number | null;
  put_vol:   number;
  put_oi:    number;
  call_vol:  number;
  call_oi:   number;
}

export interface OptionRow {
  strike: number;
  type:   "CALL" | "PUT";
  iv:     number | null;
  volume: number;
  oi:     number;
  bid:    number | null;
  ask:    number | null;
  itm:    boolean;
}

export interface OptionsResponse {
  ticker:          string;
  spot:            number;
  as_of:           string;
  expiries:        string[];
  nearest_expiry:  string;
  hv30:            number | null;
  atm_iv:          number | null;
  iv_vs_hv:        number | null;
  iv_rank:         number | null;
  pc_volume:       number | null;
  pc_oi:           number | null;
  max_pain:        number | null;
  term_structure:  OptionTermPoint[];
  skew:            OptionSkewPoint[];
  most_active:     OptionRow[];
}

// ── Hybrid Risk Engine types ──────────────────────────────────────────────────

export type RegimeName = "Strong Trend" | "Choppy" | "Bear" | "Panic";

export interface HybridRequest {
  tickers:    string[];
  regime?:    RegimeName;
  signals?:   Record<string, number>;
  cvar_limit?: number;
  max_weight?: number;
  tau?:        number;
  start_date?: string;
}

export interface HybridLayerWeights {
  hrp:    Record<string, number>;
  bl:     Record<string, number>;
  cvar:   Record<string, number>;
  regime: Record<string, number>;
}

export interface HybridMetrics {
  annualized_return:    number;
  annualized_volatility: number;
  sharpe_ratio:         number;
  max_drawdown:         number;
  cvar_95_daily:        number;
}

export interface HybridResponse {
  tickers_used:        string[];
  tickers_missing:     string[];
  price_history_start: string;
  price_history_end:   string;
  layers:              HybridLayerWeights;
  final_weights:       Record<string, number>;
  equity_fraction:     number;
  cash_pct:            number;
  cvar_95_daily:       number;
  regime:              string;
  n_holdings:          number;
  metrics:             HybridMetrics;
}

// ── MetaTrader 5 types ────────────────────────────────────────────────────────

export interface MT5AccountInfo {
  login: number;
  name: string;
  server: string;
  currency: string;
  balance: number;
  equity: number;
  margin: number;
  margin_free: number;
  margin_level: number;
  profit: number;
  leverage: number;
  company: string;
  trade_allowed: number;
}

export interface MT5Position {
  ticket: number;
  symbol: string;
  type: number;          // 0 = buy, 1 = sell
  volume: number;
  price_open: number;
  price_current: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  comment: string;
  time: string;
  time_update: string;
  magic: number;
}

export interface MT5Order {
  ticket: number;
  symbol: string;
  type: number;
  volume_initial: number;
  volume_current: number;
  price_open: number;
  sl: number;
  tp: number;
  price_stoplimit: number;
  comment: string;
  time_setup: string;
  time_expiration: string | null;
  magic: number;
}

export interface MT5Deal {
  ticket: number;
  order: number;
  symbol: string;
  type: number;
  entry: number;         // 0 = in, 1 = out, 2 = in/out
  volume: number;
  price: number;
  profit: number;
  commission: number;
  swap: number;
  fee: number;
  comment: string;
  time: string;
  magic: number;
}

export interface MT5Symbol {
  name: string;
  description: string;
  currency_base: string;
  currency_profit: string;
  digits: number;
  trade_contract_size: number;
  volume_min: number;
  volume_max: number;
  volume_step: number;
  bid: number;
  ask: number;
  spread: number;
}

export interface MT5Bar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MT5OrderRequest {
  symbol: string;
  order_type: "buy" | "sell";
  volume: number;
  sl?: number;
  tp?: number;
  comment?: string;
}

// ── API client ────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let msg = `API ${path} → ${res.status}`;
    try { const b = await res.json(); if (b?.detail) msg = b.detail; } catch {}
    throw new Error(msg);
  }
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
  getSectorRotation: () => apiFetch<SectorRotationResponse>("/data/sector-rotation"),
  getPrices: (ticker: string, period = "1y") =>
    apiFetch<PricesResponse>(`/data/prices/${ticker}?period=${period}`),
  getUniverse: () => apiFetch<{ ticker: string; name: string; sector: string; sub_industry: string }[]>("/data/universe"),
  searchUniverse: (q: string, pageSize = 8) =>
    apiFetch<{ total: number; results: { ticker: string; name: string; is_etf: boolean; exchange: string }[] }>(
      `/data/universe/search?q=${encodeURIComponent(q)}&page_size=${pageSize}`
    ),
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
  getSetups: (params: SetupsParams) => {
    const q = new URLSearchParams();
    if (params.universe)            q.set("universe",          params.universe);
    if (params.setup_filter)        q.set("setup_filter",      params.setup_filter);
    if (params.stage_filter)        q.set("stage_filter",      params.stage_filter);
    if (params.min_score)           q.set("min_score",         String(params.min_score));
    q.set("sort_by", params.sort_by ?? "regime_adjusted_score");
    if (params.desc != null)        q.set("desc",              String(params.desc));
    if (params.page)                q.set("page",              String(params.page));
    if (params.page_size)           q.set("page_size",         String(params.page_size));
    if (params.include_no_setup)    q.set("include_no_setup",  "true");
    return apiFetch<SetupsResponse>(`/technical/setups?${q.toString()}`);
  },
  getRegime: () => apiFetch<RegimeResponse>("/technical/regime"),
  getMTFAlignment: (params?: MTFParams) => {
    const q = new URLSearchParams();
    if (params?.universe)          q.set("universe",   params.universe);
    if (params?.min_align != null) q.set("min_align",  String(params.min_align));
    if (params?.sort_by)           q.set("sort_by",    params.sort_by);
    if (params?.desc != null)      q.set("desc",       String(params.desc));
    if (params?.page)              q.set("page",       String(params.page));
    if (params?.page_size)         q.set("page_size",  String(params.page_size));
    return apiFetch<MTFResponse>(`/technical/mtf?${q.toString()}`);
  },
  getPreBreakout: (params?: PreBreakoutParams) => {
    const q = new URLSearchParams();
    if (params?.universe)    q.set("universe",   params.universe);
    if (params?.min_score != null) q.set("min_score", String(params.min_score));
    if (params?.sort_by)     q.set("sort_by",    params.sort_by);
    if (params?.desc != null) q.set("desc",      String(params.desc));
    if (params?.page)        q.set("page",       String(params.page));
    if (params?.page_size)   q.set("page_size",  String(params.page_size));
    return apiFetch<PreBreakoutResponse>(`/technical/prebreakout?${q.toString()}`);
  },
  getRSRankings: (params?: RSRankingsParams) => {
    const q = new URLSearchParams();
    if (params?.universe)              q.set("universe",     params.universe);
    if (params?.min_rs_rank != null && params.min_rs_rank > 0) q.set("min_rs_rank", String(params.min_rs_rank));
    if (params?.sector)                q.set("sector",       params.sector);
    if (params?.sort_by)               q.set("sort_by",      params.sort_by);
    if (params?.desc != null)          q.set("desc",         String(params.desc));
    if (params?.page)                  q.set("page",         String(params.page));
    if (params?.page_size)             q.set("page_size",    String(params.page_size));
    return apiFetch<RSRankingsResponse>(`/technical/rs-rankings?${q.toString()}`);
  },
  getEarningsCalendar: (params?: EarningsCalendarParams) => {
    const q = new URLSearchParams();
    if (params?.universe)              q.set("universe",    params.universe);
    if (params?.days_ahead != null)    q.set("days_ahead",  String(params.days_ahead));
    if (params?.only_setups)           q.set("only_setups", "true");
    if (params?.min_score != null && params.min_score > 0) q.set("min_score", String(params.min_score));
    return apiFetch<EarningsCalendarResponse>(`/technical/earnings-calendar?${q.toString()}`);
  },
  getMacro: () => apiFetch<MacroResponse>("/technical/macro"),
  getVolatility: (lookback_days = 252) =>
    apiFetch<VolatilityResponse>(`/technical/volatility?lookback_days=${lookback_days}`),
  getCorrelations: (params?: CorrelationsParams) => {
    const q = new URLSearchParams();
    if (params?.universe)               q.set("universe",    params.universe);
    if (params?.period_days != null)    q.set("period_days", String(params.period_days));
    if (params?.top_n != null)          q.set("top_n",       String(params.top_n));
    return apiFetch<CorrelationsResponse>(`/technical/correlations?${q.toString()}`);
  },
  getStockDetail: (ticker: string) =>
    apiFetch<StockDetailResponse>(`/technical/stock/${encodeURIComponent(ticker)}`),
  forceRefresh: () =>
    fetch("/api/data/refresh", { method: "POST" }).then(r => r.json()),
  getOptions: (ticker: string) =>
    apiFetch<OptionsResponse>(`/technical/options/${encodeURIComponent(ticker.toUpperCase())}`),
  hybridOptimize: (req: HybridRequest) =>
    apiFetch<HybridResponse>("/portfolio/hybrid", { method: "POST", body: JSON.stringify(req) }),
  getBreadth: (params?: BreadthParams) => {
    const q = new URLSearchParams();
    if (params?.universe)               q.set("universe",      params.universe);
    if (params?.lookback_days != null)  q.set("lookback_days", String(params.lookback_days));
    return apiFetch<BreadthResponse>(`/technical/breadth?${q.toString()}`);
  },
  prefetchEvents: (universe = "sp500") =>
    fetch(`/api/technical/prefetch-events?universe=${universe}`, { method: "POST" }),
  getSetupWinRates: (recompute = false) =>
    apiFetch<SetupWinRatesResponse>(`/technical/setup-winrates${recompute ? "?recompute=true" : ""}`),

  // ── Pairs Trading & Stat Arb ────────────────────────────────────────────────
  discoverPairs: (req: {
    universe?: string; custom_tickers?: string[];
    min_correlation?: number; max_pvalue?: number;
    sector_filter?: string; spread_type?: string;
    hedge_method?: string; zscore_window?: number; top_n?: number;
  }) => apiFetch<any>("/pairs/discover", { method: "POST", body: JSON.stringify(req) }),

  getPairsRegime: () => apiFetch<any>("/pairs/regime"),

  getPairDetail: (
    ticker1: string, ticker2: string,
    params?: { period?: string; spread_type?: string; hedge_method?: string; zscore_window?: number },
  ) => {
    const q = new URLSearchParams();
    if (params?.period)        q.set("period",       params.period);
    if (params?.spread_type)   q.set("spread_type",  params.spread_type);
    if (params?.hedge_method)  q.set("hedge_method", params.hedge_method);
    if (params?.zscore_window) q.set("zscore_window", String(params.zscore_window));
    const qs = q.toString();
    return apiFetch<any>(`/pairs/detail/${ticker1}/${ticker2}${qs ? "?" + qs : ""}`);
  },

  runPairsBacktest: (req: {
    ticker1: string; ticker2: string; period?: string;
    spread_type?: string; hedge_method?: string; zscore_window?: number;
    entry_threshold?: number; exit_threshold?: number; stop_threshold?: number;
    max_holding_days?: number; cost_bps?: number; notional?: number;
  }) => apiFetch<any>("/pairs/backtest", { method: "POST", body: JSON.stringify(req) }),

  // ── MetaTrader 5 ────────────────────────────────────────────────────────────
  getMT5Status: () => apiFetch<{ available: boolean; connected: boolean }>("/mt5/status"),
  getMT5Account: () => apiFetch<MT5AccountInfo>("/mt5/account"),
  getMT5Positions: () => apiFetch<MT5Position[]>("/mt5/positions"),
  getMT5Orders: () => apiFetch<MT5Order[]>("/mt5/orders"),
  getMT5History: (days = 30) => apiFetch<MT5Deal[]>(`/mt5/history?days=${days}`),
  getMT5Symbols: (search = "") => apiFetch<MT5Symbol[]>(`/mt5/symbols${search ? "?search=" + encodeURIComponent(search) : ""}`),
  getMT5OHLCV: (symbol: string, tf = "H1", count = 500) =>
    apiFetch<MT5Bar[]>(`/mt5/ohlcv/${encodeURIComponent(symbol)}?tf=${tf}&count=${count}`),
  placeMT5Order: (req: MT5OrderRequest) =>
    apiFetch<{ success: boolean; order?: number; price?: number; volume?: number }>("/mt5/order", { method: "POST", body: JSON.stringify(req) }),
  closeMT5Position: (ticket: number) =>
    apiFetch<{ success: boolean; order?: number }>("/mt5/close", { method: "POST", body: JSON.stringify({ ticket }) }),
};

// ── Setups / Decision Engine types ───────────────────────────────────────────

export type SetupName =
  | "Early Breakout"
  | "Volatility Squeeze"
  | "Momentum Continuation"
  | "Institutional Accumulation"
  | "Mean Reversion Bounce"
  | "Failed Breakdown Reversal"
  | "No Setup";

export interface SetupSignal {
  ticker: string;
  price: number | null;
  chg_1d: number | null;
  setup: SetupName;
  stage: number | null;
  breakout_score: number | null;
  confluence_score: number | null;
  rsi: number | null;
  rs_spy_20d: number | null;
  rs_sector_20d: number | null;
  sector_vs_spy_20d: number | null;
  triple_rs: boolean | null;
  vol_surge: number | null;
  ma50_dist: number | null;
  ma200_dist: number | null;
  bb_width_pct: number | null;
  atr_pct: number | null;
  dist_52w_high: number | null;
  accum_score: number | null;
  nearest_pivot: string | null;
  pivot_dist: number | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  rr: number | null;
  atr_dollar: number | null;
  earnings_date: string | null;
  days_to_earnings: number | null;
  days_to_opex: number | null;
  regime_alignment: number | null;
  regime_fit: boolean | null;
  regime_adjusted_score: number | null;
}

export interface SetupsResponse {
  total: number;
  page: number;
  page_size: number;
  pages: number;
  universe_size: number;
  as_of: string | null;
  regime: string | null;
  regime_score: number | null;
  regime_strategy: string | null;
  results: SetupSignal[];
}

export interface SetupsParams {
  universe?: string;
  setup_filter?: string;
  stage_filter?: string;
  min_score?: number;
  sort_by?: string;
  desc?: boolean;
  page?: number;
  page_size?: number;
  include_no_setup?: boolean;
}

// ── Setup win-rate types ──────────────────────────────────────────────────────

export interface SetupWinRateStat {
  setup: string;
  n_5d?: number;   win_rate_5d?: number;   avg_ret_5d?: number;   median_ret_5d?: number;   expectancy_5d?: number;
  n_10d?: number;  win_rate_10d?: number;  avg_ret_10d?: number;  median_ret_10d?: number;  expectancy_10d?: number;
  n_20d?: number;  win_rate_20d?: number;  avg_ret_20d?: number;  median_ret_20d?: number;  expectancy_20d?: number;
}

export interface SetupWinRatesResponse {
  status: "ok" | "computing";
  results: Record<string, SetupWinRateStat> | null;
}

// ── Multi-Timeframe Alignment types ──────────────────────────────────────────

export interface MTFSignal {
  ticker: string;
  price: number | null;
  chg_1d: number | null;
  mtf_score: number | null;
  mtf_alignment: number;       // 0–3 timeframes bullish
  mtf_weekly_bull: boolean;
  mtf_daily_bull: boolean;
  mtf_short_bull: boolean;
  mtf_wk_signals: number;      // 0–3 weekly sub-signals
  mtf_d_signals: number;       // 0–3 daily sub-signals
  mtf_st_signals: number;      // 0–3 short-term sub-signals
  stage: number | null;
  rs_spy_20d: number | null;
  rs_sector_20d: number | null;
  triple_rs: boolean;
  rsi: number | null;
  vol_surge: number | null;
  ma50_dist: number | null;
  ma200_dist: number | null;
  dist_52w_high: number | null;
  confluence_score: number | null;
  setup: string;
}

export interface MTFResponse {
  total: number;
  page: number;
  page_size: number;
  pages: number;
  universe_size: number;
  as_of: string | null;
  results: MTFSignal[];
}

export interface MTFParams {
  universe?: string;
  min_align?: number;
  sort_by?: string;
  desc?: boolean;
  page?: number;
  page_size?: number;
}

// ── Pre-Breakout / Coiled-Spring types ───────────────────────────────────────

export interface CoiledSpringSignal {
  ticker: string;
  price: number | null;
  chg_1d: number | null;
  coiled_spring_score: number;
  stage: number | null;
  bb_width_pct: number | null;
  atr_pct: number | null;
  range_compression: number | null;
  vol_surge: number | null;
  dist_52w_high: number | null;
  rs_spy_20d: number | null;
  rs_sector_20d: number | null;
  triple_rs: boolean;
  accum_score: number | null;
  ma50_dist: number | null;
  ma200_dist: number | null;
  nr7: boolean;
  rsi: number | null;
  breakout_score: number | null;
  earnings_date: string | null;
  days_to_earnings: number | null;
  days_to_opex: number | null;
}

export interface PreBreakoutResponse {
  total: number;
  page: number;
  page_size: number;
  pages: number;
  universe_size: number;
  as_of: string | null;
  results: CoiledSpringSignal[];
}

export interface PreBreakoutParams {
  universe?: string;
  min_score?: number;
  sort_by?: string;
  desc?: boolean;
  page?: number;
  page_size?: number;
}

export interface RegimeResponse {
  regime: "Strong Trend" | "Choppy" | "Bear" | "Panic";
  description: string;
  best_strategy: string;
  score: number;
  vix: number | null;
  spy_vs_50d: number | null;
  spy_vs_200d: number | null;
  breadth_above_50d: number | null;
  breadth_above_200d: number | null;
}

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
  rs_sector_20d: number | null;
  sector_vs_spy_20d: number | null;
  triple_rs: boolean | null;
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
