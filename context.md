# Trading Dashboard — Project Context

## How to Start

```powershell
# Backend (run from trading-dashboard\backend\)
python -m uvicorn app.main:app --port 8000

# Frontend (run from trading-dashboard\frontend\)
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- **Always start backend from `backend/` subfolder**, not the repo root — `app/` module lives there.
- `frontend/.env.local` must exist with `BACKEND_URL=http://localhost:8000`. Without it, Next.js proxies to the stale Railway production URL.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 App Router, React Query, Tailwind CSS, lucide-react |
| Backend | FastAPI, Python, DuckDB (price cache), yfinance |
| Data | yfinance → DuckDB (`data/market_data.duckdb`) |

---

## Project Structure

```
trading-dashboard/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── data.py          # Universe search, prices, sector rotation
│   │   │   ├── portfolio.py     # /hybrid and /optimize endpoints
│   │   │   ├── factors.py       # Factor scores, IC, quintiles
│   │   │   ├── risk.py          # Risk attribution
│   │   │   ├── backtest.py      # Backtest engine
│   │   │   └── technical.py     # Options, breadth, technical indicators
│   │   ├── core/
│   │   │   ├── data/
│   │   │   │   ├── fetcher.py   # yfinance download + MultiIndex fix
│   │   │   │   ├── cache.py     # DuckDB read/write helpers
│   │   │   │   └── universe.py  # S&P500, US-listed tickers
│   │   │   └── portfolio/
│   │   │       ├── hybrid.py    # 5-layer risk engine
│   │   │       └── optimizer.py # Standard MVO optimizer
│   │   └── main.py
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── risk-engine/page.tsx  # Hybrid Risk Engine UI ← main work
│   │   ├── factors/
│   │   ├── backtest/
│   │   ├── portfolio/
│   │   └── ... (many other pages)
│   ├── lib/
│   │   └── api.ts               # All API client functions
│   └── .env.local               # BACKEND_URL=http://localhost:8000
└── data/
    └── market_data.duckdb       # Price cache (auto-populated)
```

---

## Hybrid Risk Engine (`/risk-engine`)

### What it does
5-layer portfolio optimization:
1. **HRP** — Hierarchical Risk Parity base allocation
2. **BL** — Black-Litterman tilts from user signals or factor z-scores
3. **CVaR** — Scale weights down if 95% daily CVaR exceeds limit
4. **(ML embedded in BL views)**
5. **Regime overlay** — Scale equity fraction based on market regime

### Backend endpoint
`POST /api/portfolio/hybrid`

```json
{
  "tickers": ["SPY", "QQQ", "TLT"],
  "regime": "Strong Trend",
  "signals": { "NVDA": 2.0, "TLT": -1.5 },
  "cvar_limit": 0.02,
  "max_weight": 0.20,
  "start_date": "2020-01-01"
}
```

Returns: `tickers_used`, `tickers_missing`, `layers` (hrp/bl/cvar/regime weights), `final_weights`, `metrics`, `cash_pct`, `cvar_95_daily`.

### Key fixes applied this session

**1. `backend/app/core/portfolio/hybrid.py` — price trimming**
When a newly-listed ticker is added (e.g., ARM IPO Sept 2023), the old `ffill().dropna()` would cut all history before the IPO date, sometimes leaving < 60 rows and returning a 422. Fixed by trimming to the latest common first-valid date across all tickers:
```python
first_valids = prices.apply(lambda col: col.first_valid_index())
common_start = first_valids.max()
if common_start is not None:
    prices = prices.loc[common_start:]
prices = prices.ffill().dropna()
```

**2. `frontend/lib/api.ts` — error messages**
`apiFetch` was throwing `"API /portfolio/hybrid → 422"` without reading the body. Fixed to extract `body.detail`:
```typescript
if (!res.ok) {
  let msg = `API ${path} → ${res.status}`;
  try { const b = await res.json(); if (b?.detail) msg = b.detail; } catch {}
  throw new Error(msg);
}
```

**3. `backend/app/core/data/fetcher.py` — yfinance MultiIndex**
Newer yfinance returns MultiIndex columns even for single-ticker downloads. Both `_parse_single` and `_parse_multi` handle this.

### UI features (risk-engine/page.tsx)

- **Preset buttons**: Global ETF / Tech Growth / Defensive / 60-40
- **Ticker search autocomplete**: Uses `/api/data/universe/search?q=...` — type company name or symbol
- **Per-ticker sentiment**: Collapsible "Your Market Views" with Bull/Neutral/Bear buttons per ticker (maps to BL signal ±2.0)
- **Stale indicator**: After a run, changing any param turns Run button amber → "Update Results"
- **Loading animation**: 5 named steps with progress bar
- **Inline tooltips**: `ⓘ` icons on CVaR limit, Max position, Market Views
- **Missing tickers banner**: Amber warning if any tickers had no price data
- **Empty state**: 3-step numbered guide
- **Auto-scroll**: Scrolls to results after run

### Universe search
`GET /api/data/universe/search?q=nvidia&page_size=8`
- Backed by `us_universe` table in DuckDB
- Populated on first request from yfinance/other sources
- Returns: `{ ticker, name, is_etf, exchange, has_prices }`

---

## API Client (`frontend/lib/api.ts`)

Key functions:
- `api.hybridOptimize(req)` → POST /portfolio/hybrid
- `api.searchUniverse(q, pageSize)` → GET /data/universe/search
- `api.getUniverse()` → GET /data/universe (S&P500 list)
- `api.runBacktest(config)` → POST /backtest/run
- `api.getFactorScores(params)` → GET /factors/scores
- `api.getPrices(ticker, period)` → GET /data/prices/:ticker

---

## Git Remote

**ALWAYS push to `wq` remote** (`workadityanambiar-wq/tradingdashboard`), never `origin`.

```powershell
git push wq main
```

---

## Known Issues / Notes

- `app/rs/page.tsx` has a pre-existing TypeScript error (unrelated to risk engine work)
- `start_date` in the hybrid engine is hardcoded to `"2020-01-01"` in the frontend
- If the universe table is empty on first run, `/universe/search` populates it automatically (may be slow first time)
- DuckDB is single-writer: don't run two backend instances simultaneously against the same `.duckdb` file
