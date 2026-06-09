# Quant Desk — User Guide

## Starting the Application

You need two terminals running simultaneously.

**Terminal 1 — Backend (Python / FastAPI)**
```
cd C:\Users\aditya.nambiar\trading-dashboard\backend
python -m uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — Frontend (Next.js)**
```
cd C:\Users\aditya.nambiar\trading-dashboard\frontend
npm run dev
```

Then open **http://localhost:3000** in your browser (or whichever port Next.js reports).

> Data is sourced from **yfinance** and cached locally in a DuckDB file
> (`backend/market_data.duckdb`). The first load of any page fetches and
> caches price history in the background — subsequent loads are fast.

---

## Pages

### 1. Market Overview  `/`

The home screen. Shows the state of the market at a glance.

| Section | What it shows |
|---------|--------------|
| **Index Cards** | SPY, QQQ, IWM, VIX — price and returns for 1D / WTD / MTD / YTD / 1Y. Click any card to load its chart. |
| **Candlestick Chart** | 1-year daily OHLCV chart for the selected index. |
| **Market Breadth** | % of S&P 500 stocks trading above their 50-day and 200-day moving averages. Green = broad participation, red = narrow. |
| **Sector Heatmap** | 11 GICS sectors, colour-coded by return. Toggle the time period (1D / 1W / 1M / 3M / YTD) using the buttons above the grid. |

> **Breadth note:** breadth populates once the Screener has loaded S&P 500
> price data. On first launch, visit the Screener page first, wait a minute,
> then come back to the Overview.

---

### 2. Universe Screener  `/screener`

A sortable, filterable factor-score table for stocks.

#### Universe selector

| Mode | Coverage |
|------|----------|
| **S&P 500** | ~503 large-cap US stocks, scores updated every 5 min |
| **All US Listed** | ~12 000 securities from NASDAQ Trader FTP |
| **Themes** | Curated thematic baskets (see below) |

#### Theme universe
Click **Themes**, then pick a **theme group** (e.g. *AI Infrastructure*), then
optionally narrow to a **segment** (e.g. *Photonics / Optical* or *Chip Equipment*).
Z-scores are computed within the selected segment so rankings reflect
relative strength inside the theme, not vs the full S&P 500.

Available theme groups:
- AI Infrastructure · Semiconductors · Cloud & Software · Healthcare
- Finance · Energy · Consumer & Media · Emerging Tech · Real Assets

Each group contains 5–10 granular segments with curated ticker lists.

#### Factor score columns

| Column | Meaning |
|--------|---------|
| Momentum 12-1M | 12-month return skipping the most recent month (classic momentum) |
| Momentum 6-1M | 6-month version of the same |
| Low Vol Z | Higher = lower realised volatility (defensive) |
| Liquidity Z | Higher = higher average dollar volume (easier to trade) |
| Macro Regime Z | Higher = lower beta to SPY (less market-sensitive) |
| Value Z | Higher = cheaper on P/B, P/E, P/S *(requires fundamentals fetch)* |
| Quality Z | Higher = better ROE and margins *(requires fundamentals fetch)* |
| Profitability Z | Higher = stronger operating margins and ROA |
| Earnings Rev Z | Higher = positive analyst estimate revisions |
| Sentiment Z | Higher = strong buy ratings + price target upside |
| **Composite** | Equal-weight average of all available z-scores |

All Z-score columns: mean = 0, std = 1, winsorised at ±3.
Green = top of universe, red = bottom.

#### Fetching fundamental data
Click **Fundamentals** (top-right header button) to fetch Value / Quality /
Sentiment data from yfinance for the top 100 tickers. This runs in the
background — refresh the table after ~30 seconds.

#### Filters (All US Listed mode only)
- Exchange: NASDAQ / NYSE / Arca / CBOE / NYSE American
- Asset type: All / Stocks / ETFs
- **Fetch prices** button: queues a background download of prices for stocks
  not yet cached, enabling score computation on the next refresh

---

### 3. Factor Explorer  `/factors`

Analyses the statistical quality of each factor signal over time.

#### Universe selector
S&P 500, S&P 1500, All Cached, or **Custom** (type comma/space-separated
tickers — minimum 10 for meaningful z-scores).

#### Factor tabs
- **Price-based** (solid border) — full IC history available:
  Momentum 12-1, Momentum 6-1, Low Volatility, Liquidity, Macro Regime
- **Fundamental** (dashed border) — only current cross-sectional scores;
  historical IC requires time-series fundamental snapshots not yet stored

#### Key statistics

| Stat | What it means | Good range |
|------|--------------|-----------|
| **Mean IC** | Average monthly Spearman rank correlation between factor score and 21-day forward return | 0.02 – 0.08 |
| **ICIR** | IC ÷ std(IC) — signal-to-noise ratio | > 0.5 |
| **% Positive IC** | Fraction of months where IC > 0 | > 55% |

#### Charts
- **IC Chart** — rolling monthly IC with 3-month moving average overlay.
  Consistent positive values above the zero line = reliable factor.
- **Quintile Returns** — equal-weight, monthly-rebalanced cumulative returns
  for Q1 (bottom 20%) through Q5 (top 20% by factor score).
  A wide Q5–Q1 spread = strong factor with good long-short spread.

---

### 4. Short-Term Signals  `/intraday`

Technical screener for short-horizon setups. Signals are computed from
daily OHLCV data — RSI, MACD, Bollinger Bands, relative strength vs SPY,
volume, and monthly pivot points.

#### Universe selector

| Mode | Use case |
|------|----------|
| S&P 500 | Broad market scan |
| S&P 1500 | Mid and small-cap included |
| **Themes** | Scan within a specific theme or segment |
| Custom | Your own ticker list (min 3 for a composite score) |

#### Near Pivot filter
Click the **Near Pivot** button (target icon) to show only stocks within
**1–3% of their nearest monthly pivot point**. Adjust the range with the
number inputs that appear next to the button.

**How monthly pivots are calculated** (from prior month's OHLC):

```
PP  = (High + Low + Close) / 3          ← pivot point
R1  = 2×PP − Low                         ← resistance 1
R2  = PP + (High − Low)                  ← resistance 2
R3  = High + 2×(PP − Low)               ← resistance 3
S1  = 2×PP − High                        ← support 1
S2  = PP − (High − Low)                  ← support 2
S3  = Low − 2×(High − PP)               ← support 3
```

Stocks approaching a pivot level often react (bounce off support or
break through resistance), making this a useful entry/exit timing filter.

#### Signal columns

| Column | Formula / Definition | Reading the signal |
|--------|---------------------|-------------------|
| **RSI** | 14-day Relative Strength Index | > 70 overbought (red) · < 30 oversold (blue) |
| **MACD** | MACD histogram = MACD line − signal line | Positive (green) = building momentum · Negative (red) = fading |
| **BB%B** | (Price − Lower Band) / Bandwidth | > 1 above upper band · < 0 below lower band |
| **MA50%** | (Price / 50-day MA) − 1 | Positive = above MA, short-term uptrend |
| **MA200%** | (Price / 200-day MA) − 1 | Key long-term trend filter |
| **RS 20d** | Stock return − SPY return over 20 days | Positive = outperforming market |
| **RS 5d** | Same over 5 days | Short-term relative strength |
| **Vol×** | Today volume / 20-day avg volume | > 2× unusual activity (yellow) |
| **ATR%** | Average True Range / Price | Higher = more volatile stock |
| **Gap** | Open[t] / Close[t−1] − 1 | Overnight gap direction |
| **Rev5d** | Negative of 5-day return | Contrarian mean-reversion signal |
| **Pivot** | Nearest monthly pivot level name | PP / R1 / R2 / R3 / S1 / S2 / S3 |
| **Pvt Dist** | (Price / Pivot level) − 1 | Yellow highlight = within the 1–3% zone |
| **Score** | Composite z-score of RS, MA, MACD, volume | Green = bullish setup · Red = bearish |

Click any column header to sort. Hover headers for full tooltips.
Rows with pivot proximity are highlighted with a subtle amber background.

---

### 5. Strategy Backtester  `/backtest`

Tests a factor-based long-only strategy on historical S&P 500 data.

#### Configuration

| Parameter | Description |
|-----------|-------------|
| Factor | Signal used to rank and select stocks |
| Top N | Number of stocks to hold (top N by factor score) |
| Transaction cost (bps) | Round-trip cost per trade. 10 bps = 0.10% |
| Start date | Beginning of the test period |

Click **Run Backtest**. Results take 5–20 seconds to compute.

#### Results tearsheet

| Panel | What to look for |
|-------|-----------------|
| **Equity Curve** | Portfolio vs SPY benchmark. Consistent line above benchmark = outperformance |
| **Drawdown Chart** | Underwater equity from peak. Shallower and shorter drawdowns = better risk management |
| **Monthly Returns Heatmap** | Year × Month grid coloured by return. Spot seasonal patterns and bad years |
| **Rolling 12M Sharpe** | Should stay consistently above zero; spikes downward signal regime changes |

#### Key statistics

| Stat | Benchmark to beat |
|------|------------------|
| CAGR | > SPY CAGR (~10% historically) |
| Sharpe | > 0.7 |
| Sortino | > 1.0 |
| Max Drawdown | < −25% |
| Calmar (CAGR / MaxDD) | > 0.5 |
| Information Ratio vs SPY | > 0.5 |
| Hit Rate | % of months strategy beats SPY; > 55% is solid |

---

### 6. Portfolio Optimizer  `/portfolio`

Finds optimal weights for a basket of stocks using Modern Portfolio Theory.

#### Input
Enter comma-separated tickers in the text box, set an optional maximum
single-position weight (default 25%), and pick a start date for the
historical covariance estimation. Click **Optimize**.

#### Methods compared side-by-side

| Method | What it optimises |
|--------|------------------|
| **Equal Weight** | 1/N baseline — simple, hard to beat |
| **Max Sharpe** | Highest Sharpe ratio on the efficient frontier |
| **Min Volatility** | Lowest portfolio variance |
| **Risk Parity** | Each holding contributes equally to total risk |

#### Output
- **Efficient Frontier** — scatter of all risk/return combinations;
  coloured markers show each method's portfolio
- **Weight Table** — exact allocation per ticker for each method
- **Correlation Heatmap** — identify which holdings are redundant

---

### 7. Risk Dashboard  `/risk`

Decomposes a portfolio's risk and return attribution.

#### Input
Enter holdings as `TICKER: weight` pairs, one per line or comma-separated:
```
AAPL: 0.25, MSFT: 0.20, NVDA: 0.20, GOOGL: 0.15, AMZN: 0.10, CASH: 0.10
```
Weights should sum to 1.0. Click **Analyze Risk**.

#### Outputs

| Panel | What it tells you |
|-------|-----------------|
| **Portfolio Stats** | Annualised return, volatility, and Sharpe ratio |
| **VaR / CVaR** | At 95% and 99% confidence: maximum 1-day loss (Value at Risk) and expected loss in the worst 1–5% of days (Conditional VaR). Both historical and parametric methods shown |
| **Fama-French Attribution** | Regression on Mkt-RF, SMB, HML factors. Shows how much return comes from market exposure, size tilt, or value tilt vs genuine alpha (intercept) |
| **Rolling Beta** | 60-day trailing beta to SPY. Stable near 1.0 = market-like; rising = increasing market sensitivity |
| **Sector Exposure** | % allocation by GICS sector based on holdings |
| **Correlation Heatmap** | Pairwise return correlations; dark red = highly correlated (concentration risk) |

---

## Data & Caching

All market data is stored in `backend/market_data.duckdb`. Tables:

| Table | Contents |
|-------|----------|
| `prices` | Daily OHLCV for all fetched tickers |
| `fundamentals` | P/B, P/E, P/S, ROE, margins, analyst data per ticker |
| `sp500_universe` | S&P 500 constituent list (name, sector, sub-industry) |
| `us_universe` | ~12 000 US-listed securities with exchange / ETF flag |

On first access, prices are fetched from yfinance and stored. On subsequent
loads, only the delta since the last cached date is fetched — making refreshes
much faster than the initial load.

**Rate limits:** yfinance has informal rate limits (~2 000 requests/hour).
If bulk fetching causes errors, wait 60 seconds and retry.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Failed to load market data" on Overview | Backend is not running. Start `uvicorn` on port 8000. |
| Market Breadth shows 0% | Visit the **Screener** page first to trigger S&P 500 price caching, wait ~1 min, refresh Overview. |
| Factor scores / Composite all null | Click **Fundamentals** on the Screener page and wait ~30 sec. |
| Screener shows "Fetching price data…" progress bar | Normal on first launch. Wait 2–5 minutes for yfinance to cache S&P 500 history. |
| Theme segment shows no signals | Prices for those tickers are not yet cached. Visit Screener → Themes to trigger caching. |
| Port 3000 already in use | Run `Get-Process -Name node \| Stop-Process -Force` then `npm run dev`. |
| `market_data.duckdb` locked error | Only one process can write. Stop all uvicorn instances then restart one. |
