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

export interface FFPoint {
  date: string;
  mkt_rf?: number | null;
  smb?: number | null;
  hml?: number | null;
  rmw?: number | null;
  cma?: number | null;
  mom?: number | null;
  spx?: number | null;
}

export interface FFSummary {
  ann_return: number;
  ann_vol: number;
  sharpe: number;
  max_dd: number;
  n_months: number;
}

export interface FFResponse {
  series: FFPoint[];
  drawdown: FFPoint[];
  summaries: Record<string, FFSummary>;
  factors: Record<string, string>;
  start: string | null;
  end: string | null;
  n_months: number;
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

export interface MT5Performance {
  days: number;
  total_trades: number;
  winners: number;
  losers: number;
  breakeven: number;
  win_rate: number;
  total_pnl: number;
  gross_profit: number;
  gross_loss: number;
  profit_factor: number;
  avg_win: number;
  avg_loss: number;
  expectancy: number;
  max_win: number;
  max_loss: number;
  avg_trade_pnl: number;
  max_drawdown: number;
  max_drawdown_pct: number;
  sharpe: number;
  sortino: number;
  recovery_factor: number;
  consecutive_wins: number;
  consecutive_losses: number;
  total_commission: number;
  total_swap: number;
  equity_curve: { idx: number; time: string; equity: number }[];
  drawdown_series: { idx: number; time: string; drawdown: number }[];
  daily_returns: { date: string; pnl: number }[];
  per_symbol: { symbol: string; trades: number; win_rate: number; pnl: number; profit_factor: number }[];
  weekday_pnl: { day: string; pnl: number }[];
  monthly_pnl: { month: string; pnl: number }[];
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

// ── Earnings Intelligence types ───────────────────────────────────────────────

export interface EarningsHistoryPoint {
  date:     string;
  day_ret:  number;
  pre_5d:   number | null;
  post_5d:  number | null;
  post_10d: number | null;
  beat:     boolean | null;
}

export interface EarningsIntelligenceItem {
  pre_drift_5d:        number | null;
  pre_drift_10d:       number | null;
  hist_avg_abs_move:   number | null;
  hist_avg_move:       number | null;
  beat_rate:           number | null;
  gap_persistence_5d:  number | null;
  gap_persistence_10d: number | null;
  revisions_up_30d:    number;
  revisions_down_30d:  number;
  n_quarters:          number;
  history:             EarningsHistoryPoint[];
}

export interface EarningsIntelligenceResponse {
  intelligence: Record<string, EarningsIntelligenceItem>;
}

export interface OptionsFlowItem {
  expected_move_pct:    number | null;
  expected_move_dollar: number | null;
  atm_iv:               number | null;
  put_call_vol_ratio:   number | null;
  call_volume:          number | null;
  put_volume:           number | null;
  expiry_used:          string | null;
  error:                string | null;
}

export interface EarningsOptionsFlowResponse {
  options_flow: Record<string, OptionsFlowItem>;
  count: number;
}

export interface MarketRegimeResponse {
  as_of: string;
  regime: {
    risk:       string;
    inflation:  string;
    growth:     string;
    trend:      string;
    volatility: string;
    label:      string;
    bias:       string;
    confidence: number;
  };
  scores: {
    risk:       number;
    inflation:  number;
    growth:     number;
    trend:      number;
    volatility: number;
  };
  signals: Record<string, number | null>;
  recommendations: {
    best_factors:  string[];
    avoid_factors: string[];
    best_sectors:  string[];
    avoid_sectors: string[];
    sizing:        string;
  };
}

// ── Crowding Dashboard types ──────────────────────────────────────────────────

export interface CrowdingResult {
  rank:               number;
  ticker:             string;
  name:               string;
  sector:             string;
  crowding_score:     number | null;
  crowding_label:     string;
  // Institutional
  inst_pct:           number | null;
  insider_pct:        number | null;
  // Analyst
  num_analysts:       number;
  buy_pct:            number | null;
  hold_pct:           number | null;
  sell_pct:           number | null;
  rec_mean:           number | null;
  target_upside:      number | null;
  upgrades_90d:       number;
  downgrades_90d:     number;
  net_upgrades:       number;
  // Short interest
  short_pct:          number | null;
  short_ratio:        number | null;
  // Social / media
  news_count:         number;
  // Price momentum
  mo_1m:              number | null;
  mo_3m:              number | null;
  // Flags
  squeeze_candidate:  boolean;
}

export interface SectorCrowding {
  sector:    string;
  avg_score: number;
  count:     number;
}

export interface CrowdingResponse {
  results:          CrowdingResult[];
  universe_size:    number;
  computed:         number;
  sector_crowding:  SectorCrowding[];
  as_of:            string;
}

// ── Expected Return Engine types ──────────────────────────────────────────────

export interface ERComponents {
  base: number;
  momentum:  number;
  value:     number;
  quality:   number;
  macro:     number;
  sentiment: number;
  low_vol:   number;
}

export interface ERZScores {
  momentum:  number;
  value:     number;
  quality:   number;
  macro:     number;
  sentiment: number;
  low_vol:   number;
}

export interface ERResult {
  ticker:          string;
  name:            string;
  sector:          string;
  price:           number | null;
  chg_1d:          number | null;
  expected_return: number;
  components:      ERComponents;
  z_scores:        ERZScores;
  momentum_score:  number | null;
  composite_score: number | null;
  rank:            number;
}

export interface ERFactorSpec {
  label:       string;
  premium:     number;
  description: string;
}

export interface ExpectedReturnResponse {
  results:       ERResult[];
  universe_size: number;
  computed:      number;
  factor_specs:  Record<string, ERFactorSpec>;
  base_return:   number;
  as_of:         string;
}

// ── Defense & Military Intelligence types ────────────────────────────────────

export interface DefenseCountry { country: string; code: string; flag: string; budget_b: number; yoy_pct: number; gdp_pct: number; region: string; trend: string }
export interface DefenseGeoRegion { region: string; score: number; category: string; color: string; threats: string[]; beneficiaries: string[]; escalation_prob: number; deescalation_prob: number; procurement: string[] }
export interface DefenseProcurementProgram { cat: string; program: string; contractor: string; nations: string; contract_b: number; annual_b: number; backlog_b: number; deliveries: number; new_orders: number; status: string; score: number }
export interface DefenseTechnology { name: string; cat: string; funding_b: number; growth: number; trl: number; maturity: string; adoption: number; companies: string[] }
export interface DefenseSupplyInput { input: string; cat: string; criticality: number; domestic_pct: number; constraint: string; stockpile_days: number; risk: number; suppliers: string[]; mitigation: string }
export interface DefenseNATOMember { country: string; gdp_b: number; defense_b: number; gdp_pct: number; meets: boolean; trend: string; yoy: number }
export interface DefenseAlert { id: string; priority: string; title: string; detail: string; tickers: string[] }
export interface DefenseContractor {
  ticker: string; company: string; segment: string;
  price: number; chg_pct: number; rsi: number; macd: number; macd_signal: number;
  ema20: number; ema50: number | null; ema200: number | null; adx: number | null;
  score: number; signal: string;
  rev_b: number; rev_g: number; backlog_b: number; backlog_g: number;
  op_margin: number; fcf_b: number; eps_g: number; div_yield: number;
  fwd_pe: number; ev_ebitda: number; gov_pct: number; rating: string;
  rev_1y: number; rev_3y: number; rev_5y: number;
}
export interface DefenseSignal { ticker: string; company: string; price: number; signal: string; score: number; fund_score: number; tech_score: number; target: number; stop: number; exp_return: number; confidence: number; backlog_b: number; fwd_pe: number }
export interface DefenseBestLong { ticker: string; reason: string; conviction: number }
export interface DefenseComponent { score: number; weight: number }

export interface DefenseOverviewResponse {
  defense_score: number; regime: string;
  kpis: { global_spending_b: number; avg_spending_growth_pct: number; active_conflicts: number; procurement_score: number; nato_members_tracked: number; contractors_tracked: number; programs_tracked: number; top_geo_risk: string };
  alerts: DefenseAlert[];
  top_programs: { program: string; contractor: string; annual_b: number; backlog_b: number; score: number }[];
  top_risks: DefenseGeoRegion[];
  defense_cycle: { current: string; next_phase: string; catalyst: string; horizon_1y: string; horizon_3y: string; horizon_5y: string };
}
export interface DefenseSpendingResponse { countries: DefenseCountry[]; total_tracked_b: number; nato_total_b: number; history: { year: string; global: number; us: number; china: number; russia: number; nato_ex_us: number }[]; fastest_growing: DefenseCountry[] }
export interface DefenseGeoResponse { regions: DefenseGeoRegion[]; composite_risk: number; composite_label: string; escalation_model: { region: string; prob: number; de_prob: number }[] }
export interface DefenseProcurementResponse { programs: DefenseProcurementProgram[]; by_category: Record<string, DefenseProcurementProgram[]>; total_backlog_b: number; total_annual_b: number; avg_score: number; top_by_score: DefenseProcurementProgram[] }
export interface DefenseContractorsResponse { contractors: DefenseContractor[]; as_of: string }
export interface DefenseTechResponse { technologies: DefenseTechnology[]; total_funding_b: number; innovation_score: number; drone_index: number; space_score: number; cyber_score: number; ai_adoption: number }
export interface DefenseNATOResponse { members: DefenseNATOMember[]; meeting_target: DefenseNATOMember[]; below_target: DefenseNATOMember[]; compliance_pct: number; total_nato_spending_b: number; allied_expansion_score: number; rearmament_pipeline: DefenseNATOMember[]; gdp_pct_avg: number; indo_pacific: { country: string; budget_b: number; yoy: number; target_gdp_pct: number; key_buys: string[] }[] }
export interface DefenseSupplyChainResponse { inputs: DefenseSupplyInput[]; resilience_score: number; critical_count: number; high_risk_count: number; critical_inputs: DefenseSupplyInput[]; avg_domestic_pct: number; avg_stockpile_days: number }
export interface DefenseCompositeResponse {
  composite_score: number; label: string; defense_score: number; regime: string;
  components: Record<string, DefenseComponent>;
  signals: DefenseSignal[];
  alerts: DefenseAlert[];
  best_longs: DefenseBestLong[];
  key_risks: string[];
  outlook: { "1y": string; "3y": string; "5y": string };
}

// ── Congressional Trading Intelligence types ──────────────────────────────────

export interface CongressionalBullishness {
  score: number; label: string;
  total_purchases_30d: number; total_sales_30d: number;
  net_flow: number; active_traders: number;
}
export interface CongressionalKPIs {
  total_politicians_tracked: number; house_members: number; senate_members: number;
  total_trades_30d: number; options_trades_30d: number;
  committee_linked_trades: number; avg_conviction: number;
  buy_count: number; sell_count: number;
}
export interface CongressionalTopTrade {
  politician: string; party: string; ticker: string; action: string;
  size: string; sector: string; days_ago: number; conviction: number;
  committee_link: string | null; asset_type: string;
}
export interface CongressionalAlert {
  id: string; type: string; priority: string; title: string;
  detail: string; tickers: string[]; ts: string;
}
export interface CongressionalMarketData {
  price: number; chg_pct: number; rsi: number; macd: number;
  macd_signal: number; ema20: number; ema50: number | null;
  score: number; signal: string;
}
export interface CongressionalOverviewResponse {
  bullishness: CongressionalBullishness;
  positioning: string;
  top_trades: CongressionalTopTrade[];
  markets: Record<string, CongressionalMarketData>;
  alerts: CongressionalAlert[];
  kpis: CongressionalKPIs;
}

export interface CongressionalTrade {
  politician: string; party: string; state: string; chamber: string;
  committees: string[]; ticker: string; asset_type: string; action: string;
  size_label: string; size_max: number; trade_date: string;
  disclosure_delay_days: number; sector: string;
  committee_link: string | null; conviction: number;
}
export interface CongressionalTradesResponse { trades: CongressionalTrade[]; total: number }

export interface CongressionalBuyer {
  name: string; party: string; state: string; chamber: string; style: string;
  total_purchases: number; num_trades: number; tickers: string[];
  avg_conviction: number; win_rate: number; avg_alpha: number;
  annualized_return: number; vs_sp500: number;
}
export interface CongressionalBuyersResponse { buyers: CongressionalBuyer[] }

export interface CongressionalRiskExit { ticker: string; reason: string; politicians: string[]; risk_score: number }
export interface CongressionalSeller {
  name: string; party: string; state: string; chamber: string;
  total_sales: number; num_trades: number; tickers: string[];
  sectors_exiting: string[]; risk_reduction_score: number;
}
export interface CongressionalSellersResponse { sellers: CongressionalSeller[]; risk_exits: CongressionalRiskExit[] }

export interface CongressionalOption {
  politician: string; party: string; state: string; ticker: string;
  option_type: string; strike: number; expiry: string;
  size_label: string; trade_date: string; sector: string; conviction: number;
}
export interface CongressionalOptionsSentiment {
  call_volume: number; put_volume: number; put_call_ratio: number;
  sentiment: string; score: number;
}
export interface CongressionalOptionsResponse { options: CongressionalOption[]; sentiment: CongressionalOptionsSentiment }

export interface CongressionalSector {
  sector: string; net_buy: number; net_sell: number; net_flow: number;
  active_traders: number; top_tickers: string[]; trend: string; flow_score: number;
}
export interface CongressionalSectorsResponse { sectors: CongressionalSector[] }

export interface CongressionalCommittee {
  name: string; chamber: string; members: string[]; sector_focus: string;
  influence_score: number; pending_bills: number; budget_authority: number | null;
  member_buy_volume: number; member_sell_volume: number; linked_trades: number;
}
export interface CongressionalCommitteesResponse { committees: CongressionalCommittee[] }

export interface CongressionalSpending {
  category: string; fy_budget: number; yoy_growth: number;
  beneficiaries: string[]; congressional_buys: string[];
}
export interface CongressionalContract {
  company: string; ticker: string; sector: string;
  total_fy: number; yoy_growth: number; gov_rev_pct: number;
  recent_award: string; award_value: number; momentum: number;
}
export interface CongressionalGovernmentResponse {
  spending: CongressionalSpending[]; contracts: CongressionalContract[];
  total_spending_tracked: number; total_contracts: number; fastest_growing: string;
}

export interface CongressionalBill {
  bill: string; status: string; impact: string;
  beneficiaries: string[]; at_risk: string[];
  sector: string; budget: number | null; catalyst_date: string;
}
export interface CongressionalLobbying {
  company: string; ticker: string; sector: string;
  annual_spend: number; pac_contributions: number; influence_score: number;
  key_committees: string[];
}
export interface CongressionalLegislationResponse {
  bills: CongressionalBill[]; lobbying: CongressionalLobbying[];
  positive_count: number; negative_count: number; mixed_count: number;
}

export interface CongressionalPerf {
  name: string; party: string; state: string; chamber: string; style: string;
  total_trades: number; win_rate: number; avg_alpha: number;
  annualized_return: number; vs_sp500: number;
  best_trade: string; worst_trade: string;
}
export interface CongressionalPerformanceResponse {
  performance: CongressionalPerf[]; top_traders: CongressionalPerf[]; worst_traders: CongressionalPerf[];
}

export interface CongressionalComponent { score: number; weight: number }
export interface CongressionalBestLong { ticker: string; reason: string; conviction: number }
export interface CongressionalShortCandidate { ticker: string; reason: string; risk: number }
export interface CongressionalEventDriven { event: string; date: string; beneficiaries: string[]; positioning: string }
export interface CongressionalCompositeResponse {
  composite_score: number; label: string;
  components: Record<string, CongressionalComponent>;
  alerts: CongressionalAlert[];
  cluster_buys: Record<string, string[]>;
  best_longs: CongressionalBestLong[];
  short_candidates: CongressionalShortCandidate[];
  event_driven: CongressionalEventDriven[];
  markets: Record<string, CongressionalMarketData>;
}

// ── Crypto & Digital Assets types ─────────────────────────────────────────────

export interface CryptoAlert { id: string; priority: string; title: string; detail: string; tickers: string[] }

export interface CryptoAsset {
  ticker: string; name: string;
  price: number; chg_1d: number; chg_7d: number; chg_30d: number; chg_1y: number;
  rsi: number; macd: number; macd_signal: number;
  ema20: number; ema50: number | null; ema200: number | null; adx: number | null;
  score: number; signal: string;
}
export interface CryptoKPIs {
  total_mcap_b: number; btc_mcap_b: number; eth_mcap_b: number; btc_dominance: number;
  total_vol_24h_b: number; defi_tvl_b: number; stablecoin_mcap_b: number;
  active_addresses_24h: number; fear_greed: number; fear_greed_label: string;
  mvrv_zscore_btc: number; funding_rate_btc: number; etf_daily_flow_m: number; cycle_phase: string;
}
export interface CryptoMacro {
  btc_gold_90d: number; btc_nasdaq_90d: number; btc_sp500_90d: number;
  btc_dxy_90d: number; btc_10y_90d: number; btc_m2_90d: number;
  fear_greed: number; fear_greed_label: string; google_trends: number;
  sentiment_score: number; global_liquidity_b: number; global_liquidity_chg_90d: number;
  cycle_phase: string; tailwinds: string[]; headwinds: string[];
}
export interface CryptoOverviewResponse {
  crypto_score: number; regime: string; kpis: CryptoKPIs;
  btc: CryptoAsset & { market_cap_b: number };
  eth: CryptoAsset & { market_cap_b: number };
  alerts: CryptoAlert[]; macro: CryptoMacro; as_of: string;
}
export interface CryptoAssetsResponse { assets: CryptoAsset[]; count: number; as_of: string }

export interface CryptoOnChainBTC {
  mvrv_zscore: number; sopr: number; nupl: number; realized_cap_b: number;
  supply_in_profit_pct: number; active_addresses_24h: number;
  exchange_outflow_btc: number; exchange_inflow_btc: number; net_exchange_flow_btc: number;
  hash_rate_eh: number; difficulty: number; miner_revenue_usd_24h: number;
  ssr: number; hodl_wave_1y_pct: number; illiquid_supply_pct: number;
  rhodl_ratio: number; longterm_holder_pct: number; shortterm_holder_pct: number;
  puell_multiple: number; price: number;
  history_mvrv: number[]; history_nupl: number[]; history_labels: string[];
}
export interface CryptoOnChainETH {
  mvrv_zscore: number; sopr: number; nupl: number; realized_cap_b: number;
  supply_in_profit_pct: number; active_addresses_24h: number;
  exchange_outflow_eth: number; exchange_inflow_eth: number; net_exchange_flow_eth: number;
  staking_rate_pct: number; staked_eth: number; burn_rate_eth_day: number;
  supply_growth_annualized: number; gas_gwei_avg: number; l2_tvl_b: number;
  validators: number; staking_yield: number; price: number;
  history_staked: number[]; history_burn: number[]; history_labels: string[];
}
export interface CryptoOnChainResponse { btc: CryptoOnChainBTC; eth: CryptoOnChainETH; as_of: string }

export interface DeFiProtocol {
  name: string; ticker: string; category: string;
  tvl_b: number; tvl_chg_7d: number; rev_ann_m: number;
  mcap_b: number; ps: number; chain: string; dominance_pct: number;
}
export interface RWAAsset { name: string; ticker: string; cat: string; tvl_b: number; growth_90d: number; yield_pct: number }
export interface CryptoDeFiResponse {
  protocols: DeFiProtocol[]; total_tvl_b: number;
  top_by_tvl: DeFiProtocol[]; top_by_revenue: DeFiProtocol[];
  by_category: { category: string; tvl_b: number }[];
  rwa: RWAAsset[]; total_rwa_tvl_b: number; as_of: string;
}

export interface CryptoDerivAsset {
  oi_b: number; oi_chg_24h: number; funding_rate_8h: number; ann_funding: number;
  liq_long_24h_m: number; liq_short_24h_m: number;
  options_oi_b: number; call_pct: number; put_call_ratio: number;
  max_pain: number; iv_30d: number; iv_90d: number; iv_skew: number;
  term_structure: string; basis_3m_ann: number; cme_oi_b: number; price: number;
}
export interface CryptoDerivativesResponse { btc: CryptoDerivAsset; eth: CryptoDerivAsset; total_crypto_oi_b: number; as_of: string }

export interface CryptoBTCETF {
  name: string; ticker: string; issuer: string; aum_b: number; btc_held: number;
  daily_flow_m: number; fee_pct: number; prem_bps: number;
  price?: number; chg_1d?: number; chg_7d?: number; rsi?: number;
}
export interface CryptoETHETF {
  name: string; ticker: string; issuer: string; aum_b: number; eth_held: number;
  daily_flow_m: number; fee_pct: number; prem_bps: number;
  price?: number; chg_1d?: number; chg_7d?: number; rsi?: number;
}
export interface CryptoETFResponse {
  btc_etfs: CryptoBTCETF[]; eth_etfs: CryptoETHETF[];
  btc_total_aum_b: number; eth_total_aum_b: number;
  btc_total_flow_m: number; eth_total_flow_m: number;
  btc_total_held: number; total_etf_aum_b: number; as_of: string;
}

export interface Stablecoin {
  name: string; symbol: string; type: string; mcap_b: number; chg_30d: number;
  reserves: boolean; quality: string; vol_24h_b: number; peg_bps: number; share_pct: number;
}
export interface CryptoStablecoinsResponse {
  stablecoins: Stablecoin[]; total_mcap_b: number; top_3_share_pct: number; fiat_backed_pct: number; as_of: string;
}

export interface ListedMiner {
  name: string; ticker: string; hash_rate_eh: number; share_pct: number;
  energy_cost_kwh: number; breakeven_btc: number; btc_held: number; ai_pivot: boolean;
  price?: number; chg_1d?: number; chg_7d?: number; rsi?: number; score: number; signal: string;
}
export interface MiningPool { name: string; ticker: string | null; hash_rate_eh: number; share_pct: number; listed: boolean }
export interface MiningStats {
  hash_rate_eh: number; hash_rate_change_30d: number; difficulty: number; difficulty_change: number;
  block_reward_btc: number; halving_date: string; next_halving_est: string;
  miner_revenue_usd_24h: number; puell_multiple: number; fee_rev_pct: number;
  breakeven_price: number; btc_price: number;
}
export interface CryptoMiningResponse {
  stats: MiningStats; miners: ListedMiner[]; pools: MiningPool[];
  listed_hash_share_pct: number; as_of: string;
}

export interface L1L2Ecosystem {
  name: string; ticker: string | null; type: string; tps: number;
  active_devs: number; dapps: number; tvl_b: number; fees_7d_m: number;
  staking_yield: number | null; l2_count: number; score: number;
  price?: number; chg_1d?: number; chg_7d?: number; rsi?: number;
}
export interface CryptoEcosystemsResponse {
  ecosystems: L1L2Ecosystem[]; total_tvl_b: number; eth_tvl_share: number; l2_tvl_b: number; as_of: string;
}

export interface InstitutionalHolding {
  entity: string; ticker: string; type: string; btc_held: number; avg_price: number;
  value_b: number; pnl_pct: number; current_val_b: number; unrealized_b: number;
  stock_price?: number; stock_chg_1d?: number;
}
export interface VCPipeline { company: string; sector: string; val_b: number; stage: string; ipo_prob: number; window: string }
export interface CryptoProxy { ticker: string; price: number; chg_1d: number; score: number; signal: string }
export interface CryptoInstitutionalResponse {
  holdings: InstitutionalHolding[]; vc_pipeline: VCPipeline[];
  total_btc_held: number; total_val_b: number; pct_circulating_supply: number;
  proxies: CryptoProxy[]; as_of: string;
}

export interface CryptoSignal {
  ticker: string; price: number; signal: string; score: number;
  tech_score: number; composite_score: number; target: number; stop: number;
  exp_return: number; confidence: number;
}
export interface CryptoComponent { score: number; weight: number }
export interface CryptoBestLong { ticker: string; reason: string; conviction: number }
export interface CryptoShortCandidate { ticker: string; reason: string; risk: number }
export interface CryptoCompositeResponse {
  composite_score: number; label: string;
  components: Record<string, CryptoComponent>;
  signals: CryptoSignal[];
  alerts: CryptoAlert[];
  best_longs: CryptoBestLong[];
  short_candidates: CryptoShortCandidate[];
  macro: CryptoMacro;
  outlook: { "1m": string; "3m": string; "12m": string };
  as_of: string;
}

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
  getFamaFrench: () => apiFetch<FFResponse>("/factors/fama-french"),
  getFFQuintiles: (factor: string) =>
    apiFetch<QuintileResponse>(`/factors/ff-quintiles?factor=${factor}`),
  getFFIC: (factor: string) =>
    apiFetch<ICResponse>(`/factors/ff-ic?factor=${factor}`),
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
    period?: string;
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
  getMT5Performance: (days = 90) => apiFetch<MT5Performance>(`/mt5/performance?days=${days}`),
  getMT5Risk: () => apiFetch<any>("/mt5/risk"),
  getMT5Journal: (days = 90) => apiFetch<any>(`/mt5/journal?days=${days}`),
  getMT5Drawdown: (days = 180) => apiFetch<any>(`/mt5/drawdown?days=${days}`),
  getMT5MonteCarlo: (days = 180, paths = 500, forward = 100) =>
    apiFetch<any>(`/mt5/montecarlo?days=${days}&paths=${paths}&forward=${forward}`),

  // ── PCA Risk Model ──────────────────────────────────────────────────────────
  estimateRiskModel: (req: { tickers: string[]; period?: string; half_life?: number; max_tickers?: number }) =>
    apiFetch<any>("/risk-model/estimate", { method: "POST", body: JSON.stringify(req) }),

  // ── AI Compute Infrastructure ─────────────────────────────────────────────────
  getAICompute: () => apiFetch<AIComputeData>("/ai-compute/overview"),

  // ── Market Regime ────────────────────────────────────────────────────────────
  getMarketRegime: () => apiFetch<MarketRegimeResponse>("/regime/current"),

  // ── Institutional Flow ───────────────────────────────────────────────────────
  getInstitutionalOverview: () => apiFetch<any>("/institutional/overview"),

  // ── Crowding Dashboard ────────────────────────────────────────────────────────
  getCrowding: (universe = "sp500", top_n = 100) =>
    apiFetch<CrowdingResponse>(`/crowding/scan?universe=${encodeURIComponent(universe)}&top_n=${top_n}`),

  // ── Expected Return Engine ────────────────────────────────────────────────────
  getExpectedReturn: (universe = "sp500", top_n = 200) =>
    apiFetch<ExpectedReturnResponse>(`/expected-return/compute?universe=${encodeURIComponent(universe)}&top_n=${top_n}`),

  // ── Earnings Options Flow ─────────────────────────────────────────────────────
  getEarningsOptionsFlow: (tickers: string[], earningsDates?: string[]) => {
    const q = new URLSearchParams();
    q.set("tickers", tickers.join(","));
    if (earningsDates?.length) q.set("earnings_dates", earningsDates.join(","));
    return apiFetch<EarningsOptionsFlowResponse>(`/earnings/options-flow?${q}`);
  },

  // ── Earnings Intelligence ─────────────────────────────────────────────────────
  getEarningsIntelligence: (tickers: string[], earningsDates?: string[]) => {
    const q = new URLSearchParams();
    q.set("tickers", tickers.join(","));
    if (earningsDates?.length) q.set("earnings_dates", earningsDates.join(","));
    return apiFetch<EarningsIntelligenceResponse>(`/earnings/intelligence?${q}`);
  },

  // ── Earnings Drift / PEAD ─────────────────────────────────────────────────────
  getEarningsDrift: (universe = "sp500", top_n = 200) =>
    apiFetch<EarningsDriftResponse>(`/earnings-drift/scan?universe=${encodeURIComponent(universe)}&top_n=${top_n}`),

  // ── Country Macro Dashboard ───────────────────────────────────────────────────
  getCountryList: () =>
    apiFetch<CountryListItem[]>("/country-macro/countries"),
  getCountryMacro: (code: string) =>
    apiFetch<CountryMacroResponse>(`/country-macro/${encodeURIComponent(code)}`),

  // ── Quality Factor ────────────────────────────────────────────────────────────
  getQuality: (universe = "sp500", top_n = 200) =>
    apiFetch<QualityResponse>(`/quality/scan?universe=${encodeURIComponent(universe)}&top_n=${top_n}`),

  // ── IPO Intelligence ──────────────────────────────────────────────────────────
  getIPOOverview:     () => apiFetch<IPOOverviewResponse>("/ipo/overview"),
  getIPOPerformance:  () => apiFetch<IPOPerformanceResponse>("/ipo/performance"),
  getIPOCalendar:     () => apiFetch<IPOCalendarResponse>("/ipo/calendar"),
  getIPOLockup:       () => apiFetch<IPOLockupResponse>("/ipo/lockup"),
  getIPOValuation:    () => apiFetch<IPOValuationResponse>("/ipo/valuation"),
  getIPOSectors:      () => apiFetch<IPOSectorsResponse>("/ipo/sectors"),
  getIPOScreener:     () => apiFetch<IPOScreenerResponse>("/ipo/screener"),
  getIPOPrivate:      () => apiFetch<IPOPrivateResponse>("/ipo/private"),

  // ── Quantum Computing Intelligence ────────────────────────────────────────────
  getQuantumMarkets:    () => apiFetch<QuantumMarketsResponse>("/quantum/markets"),
  getQuantumOverview:   () => apiFetch<QuantumOverviewResponse>("/quantum/overview"),
  getQuantumHardware:   () => apiFetch<QuantumHardwareResponse>("/quantum/hardware"),
  getQuantumGovernment: () => apiFetch<QuantumGovernmentResponse>("/quantum/government"),
  getQuantumEnterprise: () => apiFetch<QuantumEnterpriseResponse>("/quantum/enterprise"),
  getQuantumVC:         () => apiFetch<QuantumVCResponse>("/quantum/vc"),
  getQuantumForecast:   () => apiFetch<QuantumForecastResponse>("/quantum/forecast"),
  getQuantumLeaderboard:() => apiFetch<QuantumLeaderboardResponse>("/quantum/leaderboard"),

  // ── Rare Earths & Critical Minerals ──────────────────────────────────────────
  getREOverview:   () => apiFetch<REOverviewResponse>("/rare-earths/overview"),
  getREElements:   () => apiFetch<REElementsResponse>("/rare-earths/elements"),
  getREMinerals:   () => apiFetch<REMineralsResponse>("/rare-earths/minerals"),
  getRESupply:     () => apiFetch<RESupplyResponse>("/rare-earths/supply"),
  getREChina:      () => apiFetch<REChinaResponse>("/rare-earths/china"),
  getREDemand:     () => apiFetch<REDemandResponse>("/rare-earths/demand"),
  getRECompanies:  () => apiFetch<RECompaniesResponse>("/rare-earths/companies"),
  getREProjects:   () => apiFetch<REProjectsResponse>("/rare-earths/projects"),
  getREComposite:  () => apiFetch<RECompositeResponse>("/rare-earths/composite"),

  // ── Defense & Military Intelligence ──────────────────────────────────────
  getDefenseOverview:    () => apiFetch<DefenseOverviewResponse>("/defense/overview"),
  getDefenseSpending:    () => apiFetch<DefenseSpendingResponse>("/defense/spending"),
  getDefenseGeo:         () => apiFetch<DefenseGeoResponse>("/defense/geopolitical"),
  getDefenseProcurement: () => apiFetch<DefenseProcurementResponse>("/defense/procurement"),
  getDefenseContractors: () => apiFetch<DefenseContractorsResponse>("/defense/contractors"),
  getDefenseTech:        () => apiFetch<DefenseTechResponse>("/defense/technology"),
  getDefenseNATO:        () => apiFetch<DefenseNATOResponse>("/defense/nato"),
  getDefenseSupplyChain: () => apiFetch<DefenseSupplyChainResponse>("/defense/supply-chain"),
  getDefenseComposite:   () => apiFetch<DefenseCompositeResponse>("/defense/composite"),

  // ── Crypto & Digital Assets ───────────────────────────────────────────────
  getCryptoOverview:    () => apiFetch<CryptoOverviewResponse>("/crypto/overview"),
  getCryptoAssets:      () => apiFetch<CryptoAssetsResponse>("/crypto/assets"),
  getCryptoOnChain:     () => apiFetch<CryptoOnChainResponse>("/crypto/onchain"),
  getCryptoDeFi:        () => apiFetch<CryptoDeFiResponse>("/crypto/defi"),
  getCryptoDerivatives: () => apiFetch<CryptoDerivativesResponse>("/crypto/derivatives"),
  getCryptoETF:         () => apiFetch<CryptoETFResponse>("/crypto/etf"),
  getCryptoStablecoins: () => apiFetch<CryptoStablecoinsResponse>("/crypto/stablecoins"),
  getCryptoMining:      () => apiFetch<CryptoMiningResponse>("/crypto/mining"),
  getCryptoEcosystems:  () => apiFetch<CryptoEcosystemsResponse>("/crypto/ecosystems"),
  getCryptoInstitutional:() => apiFetch<CryptoInstitutionalResponse>("/crypto/institutional"),
  getCryptoComposite:   () => apiFetch<CryptoCompositeResponse>("/crypto/composite"),

  // ── Congressional Trading ─────────────────────────────────────────────────
  getCongressionalOverview:    () => apiFetch<CongressionalOverviewResponse>("/congressional/overview"),
  getCongressionalTrades:      () => apiFetch<CongressionalTradesResponse>("/congressional/trades"),
  getCongressionalBuyers:      () => apiFetch<CongressionalBuyersResponse>("/congressional/buyers"),
  getCongressionalSellers:     () => apiFetch<CongressionalSellersResponse>("/congressional/sellers"),
  getCongressionalOptions:     () => apiFetch<CongressionalOptionsResponse>("/congressional/options"),
  getCongressionalSectors:     () => apiFetch<CongressionalSectorsResponse>("/congressional/sectors"),
  getCongressionalCommittees:  () => apiFetch<CongressionalCommitteesResponse>("/congressional/committees"),
  getCongressionalGovernment:  () => apiFetch<CongressionalGovernmentResponse>("/congressional/government"),
  getCongressionalLegislation: () => apiFetch<CongressionalLegislationResponse>("/congressional/legislation"),
  getCongressionalPerformance: () => apiFetch<CongressionalPerformanceResponse>("/congressional/performance"),
  getCongressionalComposite:   () => apiFetch<CongressionalCompositeResponse>("/congressional/composite"),

  // ── AI CapEx Intelligence ──────────────────────────────────────────────────
  getAICapEx: () => apiFetch<AICapExDashboard>("/ai-capex/dashboard"),
  refreshAICapEx: () => fetch("/api/ai-capex/refresh", { method: "POST" }).then(r => r.json()),

  // ── Space Sector Intelligence ─────────────────────────────────────────────
  getSpaceOverview:    () => apiFetch<any>("/space/overview"),
  getSpaceLaunch:      () => apiFetch<any>("/space/launch"),
  getSpaceSatellite:   () => apiFetch<any>("/space/satellite"),
  getSpaceDefense:     () => apiFetch<any>("/space/defense-space"),
  getSpaceBroadband:   () => apiFetch<any>("/space/broadband"),
  getSpaceEconomy:     () => apiFetch<any>("/space/economy"),
  getSpaceGovernment:  () => apiFetch<any>("/space/government"),
  getSpaceTourismLunar:() => apiFetch<any>("/space/tourism-lunar"),
  getSpaceVC:          () => apiFetch<any>("/space/vc"),
  getSpaceStocks:      () => apiFetch<any>("/space/stocks"),
  getSpaceSupplyChain: () => apiFetch<any>("/space/supply-chain"),
  getSpaceComposite:   () => apiFetch<any>("/space/composite"),

  // ── AI Copilot ────────────────────────────────────────────────────────────
  copilotChat: (message: string, history: { role: string; content: string }[], modelRole = "primary") =>
    apiFetch<any>("/copilot/chat", {
      method: "POST",
      body: JSON.stringify({ message, history, role: modelRole }),
    }),
  getCopilotInsights:     () => apiFetch<any>("/copilot/insights"),
  getCopilotOpportunities:() => apiFetch<any>("/copilot/opportunities"),
  getCopilotPMCommand:    () => apiFetch<any>("/copilot/pm-command"),
  getCopilotStatus:       () => apiFetch<any>("/copilot/status"),
  getCopilotModels:       () => apiFetch<any>("/copilot/models"),

  // ── Breadth Intelligence Platform ────────────────────────────────────────────
  getBreadthDashboard: (universe = "sp500") =>
    apiFetch<BreadthDashboard>(`/breadth/dashboard?universe=${universe}`),
  refreshBreadthDashboard: (universe = "sp500") =>
    apiFetch<any>(`/breadth/refresh?universe=${universe}`, { method: "POST" }),

  // ── Pattern Scanner ───────────────────────────────────────────────────────
  getScannerResults: (params?: {
    direction?: string; category?: string; timeframe?: string;
    asset_class?: string; status?: string; min_score?: number;
    sort_by?: string; sort_dir?: string; limit?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.direction)   q.set("direction",   params.direction);
    if (params?.category)    q.set("category",    params.category);
    if (params?.timeframe)   q.set("timeframe",   params.timeframe);
    if (params?.asset_class) q.set("asset_class", params.asset_class);
    if (params?.status)      q.set("status",      params.status);
    if (params?.min_score != null) q.set("min_score", String(params.min_score));
    if (params?.sort_by)     q.set("sort_by",     params.sort_by);
    if (params?.sort_dir)    q.set("sort_dir",    params.sort_dir);
    if (params?.limit != null) q.set("limit",     String(params.limit));
    return apiFetch<ScannerResult[]>(`/scanner/results?${q}`);
  },
  triggerScan: (body: { symbols?: string[]; timeframes?: string[]; min_score?: number }) =>
    apiFetch<any>("/scanner/scan", { method: "POST", body: JSON.stringify(body) }),
  scanSymbol: (symbol: string, timeframes = "H1,H4,D1") =>
    apiFetch<any>(`/scanner/scan/${encodeURIComponent(symbol)}?timeframes=${timeframes}`),
  getScannerAlerts: (unread_only = false) =>
    apiFetch<{ alerts: ScannerAlert[]; unread_count: number }>(`/scanner/alerts?unread_only=${unread_only}`),
  markAlertsRead: (ids: string[]) =>
    apiFetch<any>("/scanner/alerts/read", { method: "PATCH", body: JSON.stringify(ids) }),
  updateScannerResult: (id: string, data: { status?: string; is_starred?: boolean; commentary?: string }) =>
    apiFetch<ScannerResult>(`/scanner/results/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  getScannerPerformance: () => apiFetch<any>("/scanner/performance"),
  purgeScannerResults: () => apiFetch<any>("/scanner/results", { method: "DELETE" }),
};

// ── Pattern Scanner types ──────────────────────────────────────────────────────

export interface ScannerResult {
  id: string;
  symbol: string;
  asset_class: string;
  pattern: string;
  category: "CANDLESTICK" | "CHART" | "INDICATOR" | "BREAKOUT";
  direction: "LONG" | "SHORT";
  timeframe: string;
  tf_label: string;
  current_price: number;
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  target3: number;
  rr_ratio: number;
  pattern_score: number;
  pattern_quality: number;
  trend_quality: number;
  volume_conf: number;
  breakout_prob: number;
  rr_score: number;
  classification: "HIGH_CONVICTION" | "MODERATE" | "LOW_PROBABILITY";
  status: "WATCH" | "TRIGGERED" | "CONFIRMED" | "FAILED" | "EXPIRED";
  is_starred: boolean;
  commentary: string | null;
  atr: number | null;
  rsi: number | null;
  adx: number | null;
  detected_at: string;
  created_at: string;
}

export interface ScannerAlert {
  id: string;
  result_id: string;
  alert_type: string;
  message: string;
  is_read: boolean;
  created_at: string;
  symbol?: string;
  pattern?: string;
  timeframe?: string;
  direction?: string;
  pattern_score?: number;
}

// ── Quality Factor types ───────────────────────────────────────────────────────

export interface QualityResult {
  rank:             number;
  ticker:           string;
  name:             string;
  sector:           string;
  roic:             number | null;
  roe:              number | null;
  roa:              number | null;
  gross_margin:     number | null;
  op_margin:        number | null;
  earnings_growth:  number | null;
  fcf_ttm:          number | null;
  fcf_growth:       number | null;
  gm_trend:         number | null;
  quality_score:    number | null;
  momentum_pctile:  number | null;
  combined_score:   number | null;
  quality_momentum: boolean;
}

export interface SectorQuality {
  sector:      string;
  avg_quality: number;
  count:       number;
}

export interface QualityResponse {
  results:        QualityResult[];
  universe_size:  number;
  computed:       number;
  sector_quality: SectorQuality[];
  as_of:          string;
}

// ── Earnings Drift / PEAD types ───────────────────────────────────────────────

export interface DriftResult {
  rank:             number;
  ticker:           string;
  name:             string;
  sector:           string;
  earn_date:        string;
  days_since:       number;
  eps_surprise_pct: number | null;
  eps_actual:       number | null;
  eps_estimate:     number | null;
  rev_growth_yoy:   number | null;
  revisions_up:     number;
  revisions_down:   number;
  drift_5d:         number | null;
  drift_21d:        number | null;
  drift_63d:        number | null;
  drift_126d:       number | null;
  drift_current:    number | null;
  pead_score:       number | null;
  sweet_spot:       boolean;
}

export interface EarningsDriftResponse {
  results:       DriftResult[];
  universe_size: number;
  computed:      number;
  as_of:         string;
}

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

// ── IPO Intelligence types ────────────────────────────────────────────────────

export interface IPOPerf {
  ticker: string; company: string; ipo_date: string; ipo_price: number;
  current_price: number | null; exchange: string; sector: string;
  raise_m: number; val_b: number; vc: string; vc_pct: number; insider_pct: number;
  d1: number | null; w1: number | null; m1: number | null;
  m3: number | null; m6: number | null; y1: number | null;
}
export interface IPOPerformanceResponse { performance: IPOPerf[]; count: number; as_of: string }

export interface IPOHealthScore {
  score: number; cycle: string;
  components: { vix_score: number; mkt_score: number; ipo_score: number; rate_score: number };
}
export interface IPOMarket { vix: number; spy_ytd: number; qqq_ytd: number; ten_yr: number; spy_price: number | null; qqq_price: number | null }
export interface IPOKPIs { ipos_ytd: number; capital_raised_b: number; avg_d1_return: number | null; unicorn_ipos: number; avg_d1_positive: number | null }
export interface IPOOverviewResponse { health: IPOHealthScore; market: IPOMarket; kpis: IPOKPIs; as_of: string }

export interface IPOCalendarItem { company: string; ticker: string; exchange: string; expected_date: string; sector: string; val_b: number; raise_m: number; interest: number; days_to_ipo: number }
export interface IPOCalendarResponse { upcoming: IPOCalendarItem[]; anticipated: IPOCalendarItem[]; count: number }

export interface IPOLockup { ticker: string; company: string; ipo_date: string; expiry_date: string; days_left: number; insider_pct: number; vc_pct: number; vc: string; unlock_shares_m: number | null; current_price: number | null; risk: string }
export interface IPOLockupResponse { lockups: IPOLockup[]; risk_score: number; as_of: string }

export interface IPOVal { ticker: string; company: string; sector: string; ev_sales: number | null; fwd_pe: number | null; ev_ebitda: number | null; price_book: number | null; rev_growth: number | null; gross_margin: number | null; vs_peer_pct: number | null; rating: string }
export interface IPOValuationResponse { valuation: IPOVal[]; as_of: string }

export interface IPOSector { sector: string; ipo_count: number; capital_b: number; avg_d1: number | null; avg_m3: number | null; rank: number }
export interface IPOSectorsResponse { sectors: IPOSector[] }

export interface IPOComposite extends IPOPerf { scores: { demand: number; momentum: number; market: number; lockup: number; insider: number; value: number }; composite: number; rating: string; lockup_days: number }
export interface IPOScreenerResponse { composite_scores: IPOComposite[]; best_longs: IPOComposite[]; lockup_shorts: IPOComposite[]; high_conviction: IPOComposite[]; overvalued: IPOComposite[]; undervalued: IPOComposite[]; health_score: number; as_of: string }

export interface IPOPrivateCandidate { name: string; val_b: number; round: string; raised_b: number; stage: string; ipo_prob: number; timeline: string }
export interface IPOExchange { name: string; region: string; ipos: number; cap_b: number }
export interface IPOPrivateResponse { candidates: IPOPrivateCandidate[]; exchanges: IPOExchange[]; pipeline_score: number }

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

// ── AI Compute Infrastructure types ──────────────────────────────────────────

export interface AIComputeStock {
  ticker: string; name: string; cat: string; sub: string;
  price: number; d1: number; w1: number; m1: number; m3: number; ytd: number;
  rsi: number; above_50: boolean; above_200: boolean; rel_3m: number;
  signal: string; sig_color: string; conf: number; strength: number;
  stop: number | null; target: number | null; upside: number | null;
  ma50: number; ma200: number;
}

export interface AIComputeData {
  score: number;
  regime: string;
  regime_color: string;
  sub_scores: Record<string, number>;
  stocks: AIComputeStock[];
  best_longs: AIComputeStock[];
  key_risks: string[];
  hyperscaler_capex: Record<string, {
    name: string; color: string;
    quarters: string[]; capex: number[]; ai_pct: number[];
    capex_guide_2025_bn: number; capex_guide_2026_bn: number; gpu_vendor: string;
  }>;
  gpu_products: Record<string, {
    name: string; color: string; gpu_score: number; supply_tightness: number;
    products: { name: string; status: string; asp_k: number; lead_wk: number | null; demand: string; note: string }[];
  }>;
  memory_tiers: { name: string; cat: string; status: string; supplier: string; util: number | null; tightness: string; price_trend: string; note: string }[];
  foundry_nodes: Record<string, {
    name: string; constraint_score: number;
    nodes: { node: string; util: number; clients: string; status: string; cowos: boolean }[];
  }>;
  scenarios: {
    id: string; name: string; color: string; prob: number; desc: string;
    impacts: Record<string, { rev: number; eps: number; stk: number }>;
  }[];
  as_of: string;
}

// ── AI CapEx Intelligence types ───────────────────────────────────────────────

export interface AICapExComponent {
  score: number;
  max: number;
  weight: string;
  input: number;
  label: string;
}

export interface AICapExScore {
  composite: number;
  regime: string;
  cycle: string;
  components: Record<string, AICapExComponent>;
}

export interface HyperscalerData {
  sym: string;
  name: string;
  cloud: string;
  capex_latest_bn: number | null;
  capex_annual_bn: number | null;
  capex_yoy: number | null;
  rev_latest_bn: number | null;
  rev_yoy: number | null;
  mktcap_bn: number | null;
  price: number | null;
  chg_6m: number | null;
  chg_1y: number | null;
  capex_chart: { q: string; capex: number }[];
  rev_chart: { q: string; rev: number }[];
}

export interface AIStockSignal {
  sym: string;
  name: string;
  sector: string;
  sub: string;
  ai_pct: number;
  signal: string;
  score: number;
  price: number | null;
  entry: number | null;
  stop_loss: number | null;
  target: number | null;
  upside_pct: number;
  confidence: number;
  factors: string[];
  chg_3m: number | null;
  chg_6m: number | null;
  chg_1y: number | null;
  rev_yoy: number | null;
  mktcap_bn: number | null;
  pe_fwd: number | null;
  analyst_rec: string;
}

export interface HeatmapRow {
  sym: string;
  name: string;
  sector: string;
  ai_pct: number;
  chg_3m: number | null;
  chg_6m: number | null;
  chg_1y: number | null;
  rev_yoy: number | null;
  mktcap_bn: number | null;
  momentum: "Accelerating" | "Stable" | "Slowing";
}

export interface InfraCategory {
  category: string;
  pct: number;
  bn: number;
  label: string;
}

export interface RVPair {
  pair: string;
  sym_a: string; name_a: string;
  sym_b: string; name_b: string;
  score_a: number; score_b: number;
  chg_6m_a: number | null; chg_6m_b: number | null;
  rev_yoy_a: number | null; rev_yoy_b: number | null;
  pe_fwd_a: number | null; pe_fwd_b: number | null;
  mktcap_a: number | null; mktcap_b: number | null;
  preferred: string;
}

export interface AICapExDashboard {
  as_of: string;
  capex_score: AICapExScore;
  global_ai_capex_annual_bn: number;
  hyperscalers: HyperscalerData[];
  stocks: AIStockSignal[];
  heatmap: HeatmapRow[];
  infra_breakdown: InfraCategory[];
  top_longs: AIStockSignal[];
  relative_value: RVPair[];
  cloud_data: { sym: string; label: string; rev_latest_bn: number | null; rev_yoy: number | null; rev_chart: {q: string; rev: number}[] }[];
  gpu_data: { sym: string; name: string; sub: string; ai_pct: number; rev_latest_bn: number | null; rev_yoy: number | null; chg_6m: number | null; chg_1y: number | null; mktcap_bn: number | null; pe_fwd: number | null; rev_chart: {q: string; rev: number}[] }[];
}

// ── Country Macro Dashboard types ─────────────────────────────────────────────

export interface CountryListItem {
  code: string;
  name: string;
  flag: string;
  region: string;
  currency: string;
}

interface HistoryPoint { year: string; value: number; }
interface DatePoint    { date: string; value: number; }

interface InvEntry { score: number; label: string; color: string; }

export interface CountryMacroResponse {
  meta: {
    code: string; name: string; currency: string; flag: string; region: string;
  };
  overview: {
    gdp_usd_bn: number | null;
    gdp_per_capita: number | null;
    population_mn: number | null;
    credit_rating: { moodys: string; sp: string; fitch: string; ig: boolean; score: number };
    political_stability: number | null;
    trade_pct_gdp: number | null;
  };
  growth: {
    gdp_growth: number | null;
    gdp_growth_prev: number | null;
    industrial_prod: number | null;
    exports_growth: number | null;
    imports_growth: number | null;
    momentum: string;
    score: number;
    history: HistoryPoint[];
  };
  inflation: {
    cpi: number | null;
    cpi_prev: number | null;
    regime: string;
    score: number;
    history: HistoryPoint[];
  };
  central_bank: {
    policy_rate: number | null;
    real_rate: number | null;
    stance: string;
    hawkish_score: number;
  };
  labor: {
    unemployment: number | null;
    unemployment_prev: number | null;
    labor_participation: number | null;
    score: number;
    history: HistoryPoint[];
  };
  fiscal: {
    debt_gdp: number | null;
    gross_savings: number | null;
    score: number;
    risk_level: string;
    history: HistoryPoint[];
  };
  external: {
    current_account_gdp: number | null;
    fx_reserves_usd_bn: number | null;
    fx_reserves_months: number | null;
    ext_debt_gni: number | null;
    exports_growth: number | null;
    score: number;
    history: HistoryPoint[];
  };
  currency: {
    ticker: string;
    fx_rate: number | null;
    fx_change_1m: number | null;
    fx_change_1y: number | null;
    fx_change_5y: number | null;
    score: number;
    history: DatePoint[];
  };
  equity: {
    ticker: string;
    price: number | null;
    change_1m: number | null;
    change_3m: number | null;
    change_1y: number | null;
    change_3y: number | null;
    change_5y: number | null;
    market_cap_gdp: number | null;
    valuation_score: number;
    momentum_score: number;
    history: DatePoint[];
  };
  commodities: {
    exposure: Record<string, number>;
    sensitivity_score: number;
  };
  risk: {
    political: number; fiscal: number; currency: number;
    sovereign: number; inflation: number; overall: number;
  };
  regime: {
    label: string; growth_dir: string; inflation_dir: string;
    color: string; description: string;
  };
  scores: {
    growth: number; inflation: number; fiscal: number;
    external: number; monetary: number; political: number; composite: number;
  };
  investment: {
    equities: InvEntry; bonds: InvEntry; currency: InvEntry;
    real_estate: InvEntry; commodities: InvEntry;
  };
  insights: { type: string; category: string; text: string }[];
  forecasts: {
    gdp_3m: number | null; gdp_6m: number | null; gdp_12m: number | null;
    cpi_3m: number | null; cpi_6m: number | null; cpi_12m: number | null;
    recession_probability: number | null;
  };
  data_note: string;
}

// ── Quantum Computing Intelligence types ──────────────────────────────────────

export interface QuantumMacd { macd: number; signal: number; histogram: number; bullish: boolean }

export interface QuantumStock {
  ticker: string; company: string; type: string; approach: string; exposure: number;
  price: number; mkt_cap_b: number | null;
  ret_1m: number | null; ret_3m: number | null; ret_6m: number | null; ret_ytd: number | null; ret_1y: number | null;
  rsi: number | null; macd: QuantumMacd | null;
  ema20: number | null; ema50: number | null; ema200: number | null;
  vs_ema20: number | null; vs_ema50: number | null; vs_ema200: number | null;
  signal: string; score: number; target: number | null; stop: number | null; expected_return_pct: number | null;
}
export interface QuantumMarketsResponse { stocks: QuantumStock[]; count: number; as_of: string }

export interface QuantumReadiness {
  score: number; regime: string;
  components: { hardware: number; error_correction: number; enterprise: number; government: number; patents: number; commercialization: number; sentiment: number };
}
export interface QuantumKPIs {
  global_investment_b: number; total_qubits: number; logical_qubits: number;
  enterprise_pilots: number; enterprise_contracts: number; public_mktcap_b: number; vc_raised_m: number;
}
export interface QuantumOverviewResponse { readiness: QuantumReadiness; kpis: QuantumKPIs; as_of: string }

export interface QuantumHardwareItem {
  company: string; system: string; approach: string;
  qubits: number | null; aq: number | null; qv: number | null;
  gate_fidelity: number | null; coherence_us: number | null; error_rate: number | null;
  logical_qubits: number; score: number; rank: number;
}
export interface QuantumQubitHistory { year: number; ibm: number | null; google: number | null; ionq: number | null; qv_best: number | null }
export interface QuantumHardwareResponse { hardware: QuantumHardwareItem[]; history: QuantumQubitHistory[] }

export interface QuantumGovtFunding { country: string; program: string; annual_b: number; total_b: number; year: number; score: number; rank: number }
export interface QuantumGovernmentResponse { funding: QuantumGovtFunding[]; total_annual_b: number; total_overall_b: number; investment_index: number }

export interface QuantumIndustry { industry: string; pilots: number; contracts: number; partners: string[]; use_case: string; score: number; rank: number }
export interface QuantumSoftware { platform: string; vendor: string; stars_k: number; downloads_m: number; enterprise: boolean; languages: string; score: number }
export interface QuantumEnterpriseResponse { industries: QuantumIndustry[]; software: QuantumSoftware[]; adoption_score: number }

export interface QuantumStartup { company: string; stage: string; raised_m: number; val_b: number; approach: string; hq: string; focus: string }
export interface QuantumPatent { entity: string; type: string; patents_2024: number; total_patents: number; pubs_2024: number; citations: number }
export interface QuantumVCResponse { startups: QuantumStartup[]; patents: QuantumPatent[]; total_raised_m: number; total_val_b: number; private_score: number }

export interface QuantumCommProb { years_out: number; year: number; broad_commercial_pct: number; fault_tolerant_pct: number; quantum_advantage_pct: number }
export interface QuantumQubitProj { year: number; physical_qubits: number; logical_qubits: number; qv_estimate: number }
export interface QuantumQVPoint { year: number; qv: number; projected?: boolean }
export interface QuantumForecastResponse { commercialization_probs: QuantumCommProb[]; qubit_projections: QuantumQubitProj[]; qv_timeline: QuantumQVPoint[]; readiness_now: number }

export interface QuantumLeader {
  ticker: string; company: string; type: string; approach: string; exposure: number;
  price: number | null; mkt_cap_b: number | null; ret_ytd: number | null;
  signal: string | null; signal_score: number | null;
  tech_score: number; fund_score: number; adopt_score: number; eco_score: number; composite: number; rank: number;
}
export interface QuantumGeoRisk { region: string; risk: string; detail: string }
export interface QuantumLeaderboardResponse { leaderboard: QuantumLeader[]; geopolitical: QuantumGeoRisk[]; total_companies: number; as_of: string }

// ── Rare Earths & Critical Minerals types ─────────────────────────────────────

export interface REElement { symbol: string; name: string; type: string; price_kg: number; chg_7d: number; chg_30d: number; chg_1y: number; criticality: number; deficit: boolean; china_pct: number; use: string }
export interface REElementsResponse { elements: REElement[]; pricing_score: number }

export interface REMineral { name: string; type: string; unit: string; price: number; chg_7d: number; chg_30d: number; chg_1y: number; prod_kt: number; demand_kt: number; deficit_kt: number; china_pct: number; criticality: number }
export interface REMineralsResponse { battery: REMineral[]; strategic: REMineral[]; strength_score: number }

export interface RECountry { country: string; re_prod_kt: number; share_pct: number; yoy_pct: number; restrictions: boolean; risk: string }
export interface REProcessing { region: string; re_pct: number; li_pct: number; co_pct: number; projects: number; utilization: number; score: number }
export interface RESupplyResponse { production: RECountry[]; processing: REProcessing[]; concentration_score: number; total_prod_kt: number }

export interface REControl { mineral: string; date: string; severity: string }
export interface REAltSource { mineral: string; source: string; readiness_pct: number }
export interface REChinaData { mining_pct: number; refining_pct: number; magnet_pct: number; risk_score: number; controls: REControl[]; alt_sources: REAltSource[] }
export interface REChinaResponse { china: REChinaData }

export interface REDefenseItem { system: string; re_kg: number; minerals: string[]; annual: number; priority: string }
export interface REDemandForecast { year: number; ev_m: number; wind_gw: number; re_demand_kt: number }
export interface REEvData { ev_sales_2024m: number; ev_sales_2025em: number; ev_sales_2030em: number; ev_cagr_pct: number; re_per_ev_kg: number; wind_gw_2024: number; wind_gw_2030e: number; re_ev_demand_kt_2024: number; re_ev_demand_kt_2030e: number; re_wind_demand_kt_2024: number; re_wind_demand_kt_2030e: number; demand_forecast: REDemandForecast[] }
export interface REMagnetData { market_b: number; cagr_pct: number; china_pct: number; segments: Record<string, number>; nd_demand_2024_kt: number; nd_demand_2030e_kt: number; dy_demand_2024_kt: number; dy_demand_2030e_kt: number; demand_index: number; supply_risk: string; key_producers: string[] }
export interface REDemandResponse { defense: REDefenseItem[]; ev: REEvData; magnets: REMagnetData; defense_score: number; green_score: number }

export interface REMacd { macd: number; signal: number; histogram: number; bullish: boolean }
export interface REStock { ticker: string; company: string; type: string; exposure: number; price: number; mkt_cap_b: number | null; ret_1m: number | null; ret_3m: number | null; ret_6m: number | null; ret_ytd: number | null; ret_1y: number | null; rsi: number | null; macd: REMacd | null; ema20: number | null; ema50: number | null; ema200: number | null; vs_ema20: number | null; vs_ema50: number | null; vs_ema200: number | null; signal: string; score: number; target: number | null; stop: number | null; exp_return_pct: number | null }
export interface RECompaniesResponse { stocks: REStock[]; count: number; as_of: string }

export interface REProject { name: string; company: string; region: string; mineral: string; capex_m: number; capacity_kt: number; status: string; year: number; govt_m: number }
export interface REGeoRisk { risk: string; severity: string; prob: number; impact: number; detail: string }
export interface REFlowETF { name: string; full: string; aum_b: number; flow_30d_m: number; ytd: number }
export interface REFlowHF { fund: string; stance: string; focus: string }
export interface REFlows { fund_flow_30d_b: number; etf_aum_b: number; positioning: string; smart_score: number; etfs: REFlowETF[]; hedge_funds: REFlowHF[] }
export interface REProjectsResponse { projects: REProject[]; geo_risks: REGeoRisk[]; flows: REFlows; capacity_score: number; total_capex_b: number; total_govt_b: number }

export interface RECompositeScore { score: number; label: string; components: Record<string, number>; weights: Record<string, number> }
export interface RESignal { ticker: string; company: string; type: string; exposure_pct: number; price: number; signal: string; score: number; target: number | null; stop: number | null; exp_return_pct: number | null; confidence: number; rsi: number | null; ret_ytd: number | null; mkt_cap_b: number | null }
export interface RECompositeResponse { composite: RECompositeScore; signals: RESignal[]; as_of: string }

export interface RESupercycle { score: number; regime: string; components: Record<string, number> }
export interface REKPIs { global_re_prod_kt: number; china_share_pct: number; china_refining_pct: number; deficit_minerals: number; ev_demand_re_kt_2024: number; magnet_demand_index: number; active_export_controls: number }
export interface REOverviewResponse { supercycle: RESupercycle; composite: RECompositeScore; kpis: REKPIs; as_of: string }

// ── Breadth Intelligence Platform types ───────────────────────────────────────

export interface BreadthSnapshotFull {
  pct_above_20ma:   number | null;
  pct_above_50ma:   number | null;
  pct_above_100ma:  number | null;
  pct_above_200ma:  number | null;
  ad_ratio:         number | null;
  advancing:        number;
  declining:        number;
  pct_new_highs:    number | null;
  pct_new_lows:     number | null;
  net_new_highs_pct: number | null;
  mcclellan:        number | null;
  summation_index:  number | null;
  bpi:              number | null;
  breadth_thrust:   number | null;
  breadth_health_score: number | null;
  median_return_1m: number | null;
  mean_return_1m:   number | null;
  rsp_vs_spy_1m:    number | null;
  rsp_vs_spy_3m:    number | null;
  n_stocks:         number;
}

export interface BreadthHistoryPoint {
  date:          string;
  ma20:          number | null;
  ma50:          number | null;
  ma100:         number | null;
  ma200:         number | null;
  mcclellan:     number | null;
  summation:     number | null;
  ad_ratio:      number | null;
  new_highs_net: number | null;
  breadth_thrust: number | null;
}

export interface BreadthSector {
  sector:        string;
  above_50ma:    number;
  above_200ma:   number;
  count:         number;
  breadth_score: number;
  rating:        string;
  rs_1m:         number | null;
  rs_3m:         number | null;
}

export interface BreadthSignal {
  name:                string;
  type:                "bullish" | "bearish" | "neutral";
  strength:            number;
  description:         string;
  historical_win_rate: number | null;
  risk_reward:         string;
  action:              string;
}

export interface BreadthDivergence {
  type:        "Bullish" | "Bearish";
  severity:    string;
  description: string;
}

export interface MarketHealthComponent {
  score:  number;
  weight: number;
}

export interface MarketHealth {
  composite_score: number;
  grade:           "Green" | "Yellow" | "Orange" | "Red";
  components: {
    breadth:    MarketHealthComponent;
    liquidity:  MarketHealthComponent;
    momentum:   MarketHealthComponent;
    volatility: MarketHealthComponent;
    flows:      MarketHealthComponent;
    macro:      MarketHealthComponent;
  };
}

export interface RegimeState {
  state:           string;
  color:           string;
  description:     string;
  score:           number;
  probabilities:   Record<string, number>;
  expected_returns: Record<string, number>;
}

export interface RiskMetrics {
  vix:                 number | null;
  vix_1m_change:       number | null;
  vix_percentile_1y:   number | null;
  hy_spread_score:     number;
  yield_curve:         number | null;
  credit_stress:       string;
  market_risk_score:   number;
  crash_probability:   number;
  liquidity_score:     number;
}

export interface BreadthDashboard {
  universe:   string;
  n_stocks:   number;
  as_of:      string | null;
  market_health: MarketHealth;
  regime:     RegimeState;
  snapshot:   BreadthSnapshotFull;
  hindenburg: { active: boolean; signals_30d: string[]; last_signal: string | null };
  zweig:      { signals: string[]; last_signal: string | null; current_thrust: number | null };
  history:    BreadthHistoryPoint[];
  sectors:    BreadthSector[];
  risk:       RiskMetrics;
  divergences: BreadthDivergence[];
  signals:    BreadthSignal[];
}
