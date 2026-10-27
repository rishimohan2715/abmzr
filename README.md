# UK Wind Forecast Accuracy — Day-Ahead Trading Desk

A full-stack web app for a **UK energy utility's day-ahead power-trading desk**. It quantifies how accurate Elexon's **day-ahead wind generation forecasts** are versus **actual wind generation**, so the desk can size the forecast risk before buying thermal cover from the day-ahead market.

> **Business context.** Wind is weather-driven and self-dispatching. Every MW the forecast misses is a MW the desk must cover from thermal plant or pay for as an imbalance. This tool turns the raw Elexon feeds into the forecast-error numbers a trader actually needs at gate closure.

**Scope (per the brief):** national-level wind only, **Elexon data only**, delivery month **January 2026**.

---

## 1. Executive overview

The portal answers the two questions from the brief — and then goes a step further, translating forecast error into the desk's actual **procurement exposure**.

1. **What is the latest forecast when the decision is made?** — An interactive overlay of **Actual vs. Day-Ahead Forecast** generation across every 30-minute settlement period, with zoom/scrub and per-period tooltips showing the absolute delta.
2. **How accurate is that forecast, quantitatively?** — Headline KPIs (**MAE, RMSE, Peak Error, Mean Bias**), the full **error distribution** with P10/P50/P90, and an **error-by-hour-of-day** profile that exposes systemic drift.

**Standout analytics (the differentiators):**

- **Procurement Gap over time** — the signed error as a diverging timeline: red when the desk was *short* (wind under-delivered → must buy more), green when *long*. This is the brief's literal question — "how much power needs to be additionally procured" — made visible.
- **Forecast Skill vs. Lead Time** — using every WINDFOR revision's `publishTime`, MAE bucketed by how far ahead each forecast was issued. Skill decays monotonically with horizon (≈1.77 GW at 0–6h → ≈2.34 GW at 36–48h), which is the quantitative justification for treating *day-ahead* error as its own risk.
- **Procurement Impact panel** — total shortfall/surplus energy (GWh), a **P90 procurement buffer** (what a risk-aware desk sizes against, not the mean), and a trader-editable **illustrative £ exposure** (your assumed imbalance price × the energy the forecast left you short). The £ figure is explicitly a what-if — no external price data is used, keeping within the Elexon-wind-only scope.
- **Forecast provenance everywhere** — the dashboard names the exact WINDFOR revision behind every number: a header panel showing the decision window, latest vintage and average lead time, and a per-period tooltip giving the issue time, lead hours and decision date.
- **Drill-down & export** — clicking any bar in the daily-error chart zooms the whole dashboard to that delivery day; **Export CSV** hands the desk the aligned series (including forecast publish time and lead hours) for their own models, and serves as the accessible, non-visual view of the chart data.

---

## 2. System architecture

```
                 ┌──────────────────────────────────────────────┐
                 │   Elexon BMRS Insights API (data.elexon.co.uk)│
                 │   • FUELHH  (actual generation, fuelType WIND) │
                 │   • WINDFOR (day-ahead wind forecasts)         │
                 └───────────────────────┬──────────────────────┘
                                         │ async httpx (parallel)
                                         ▼
      ┌───────────────────────────────────────────────────────────────┐
      │  BACKEND — FastAPI (Python)                                     │
      │  elexon_service.py                                              │
      │    • fetch FUELHH + all WINDFOR revisions (in-memory cache)     │
      │    • pick the day-ahead forecast revision per target time       │
      │    • align Actual vs Forecast on the 30-min startTime grid      │
      │    • MAE / RMSE / Bias / MAPE · distribution (P10/50/90)        │
      │    • procurement energy exposure · skill-vs-lead-time           │
      │  main.py                                                        │
      │    • /api/generation · /api/metrics · /api/horizon · /api/health│
      │    • Pydantic schemas · CORS · validation · logging             │
      └───────────────────────────────┬───────────────────────────────┘
                                       │ JSON over HTTP
                                       ▼
      ┌───────────────────────────────────────────────────────────────┐
      │  FRONTEND — React + TypeScript + Tailwind + Recharts            │
      │  Header · Controls (date range + presets) · KPI cards           │
      │  MainChart (Actual vs Forecast overlay) · HourlyErrorChart      │
      │  Accuracy summary panel                                         │
      └───────────────────────────────────────────────────────────────┘

   Both services are containerised; `docker compose up` runs the whole stack.
```

### Which "January 2026"? (an explicit reading of the brief)

The brief says to use *"data relevant only for purchase decisions to be made in January 2026."* That is a statement about **decision dates**, not delivery dates — and because a day-ahead decision taken on day **D** is for delivery on **D+1**, the two differ by one day:

| Reading | Decisions | Delivery days |
|---|---|---|
| **"Decisions in Jan 2026"** (the brief's wording — **our default**) | 1 – 31 Jan 2026 | 2 Jan – 1 Feb 2026 |
| "Delivery in Jan 2026" (the looser reading) | 31 Dec – 30 Jan | 1 – 31 Jan 2026 |

Rather than pick one silently, **both are one-click presets in the UI**, and the app always shows the decision window and the delivery window side by side so the two are never confused. The API's `startDate`/`endDate` are **delivery** dates; `/api/generation` returns the matching `decision_start` / `decision_end`. Data availability was verified at both boundaries (forecasts exist before the 31 Dec gate for a 1 Jan delivery; actuals exist for 1 Feb).

### A note on the Elexon host

The brief links to `https://bmrs.elexon.co.uk/api-documentation/...`. That host serves the **documentation portal** (it returns HTML, not data). The underlying JSON API those docs describe is served from **`https://data.elexon.co.uk/bmrs/api/v1`**, which is what this app calls — same datasets (`FUELHH`, `WINDFOR`), same fields. Both hosts were checked directly to confirm this.

### Key design decisions

- **Day-ahead forecast selection.** WINDFOR publishes many revisions per target time. For each delivery period we keep the **latest revision available at day-ahead gate closure** (11:00 UTC on the day before delivery) — the information a trader actually had — falling back to the latest pre-delivery revision if none exists that early. This makes the "accuracy" number decision-relevant rather than hindsight.
- **Honest alignment.** In the live Elexon data, **FUELHH actuals are half-hourly** (`:00` and `:30`) while **WINDFOR forecasts are hourly** (`:00` only). We align on the exact `startTime` and compute error **only where both series exist** (on the hour) rather than interpolating — the metrics reflect real matched data.
- **Single Y-axis.** Actual and Forecast are both MW, so they share one axis (no misleading dual-scale chart).
- **Caching.** Each window is fetched once and cached in-memory for 15 minutes, keeping the UI responsive and respecting Elexon fair-use.

---

## 3. Error metrics

For each matched 30-minute period $i$, with forecast $F_i$ and actual $A_i$, error $e_i = F_i - A_i$:

**Mean Absolute Error** — average miss size (MW):

$$\mathrm{MAE} = \frac{1}{n}\sum_{i=1}^{n}\lvert F_i - A_i\rvert$$

**Root Mean Square Error** — penalises large misses more heavily (MW):

$$\mathrm{RMSE} = \sqrt{\frac{1}{n}\sum_{i=1}^{n}(F_i - A_i)^2}$$

**Mean Bias** — direction of systematic error (MW); positive ⇒ the model **over-forecasts** wind:

$$\mathrm{Bias} = \frac{1}{n}\sum_{i=1}^{n}(F_i - A_i)$$

**Mean Absolute Percentage Error** — scale-free miss (%), computed over periods with meaningful output ($A_i > 1$ MW):

$$\mathrm{MAPE} = \frac{100}{n}\sum_{i=1}^{n}\frac{\lvert F_i - A_i\rvert}{A_i}$$

**Normalised MAE** — MAE as a share of mean actual output: $\mathrm{MAE} / \bar{A} \times 100\%$.

**Model bias %** — the signed bias as a share of mean actual output, i.e. "the model over-forecasts by X%":

$$\mathrm{Bias\%} = \frac{\mathrm{Bias}}{\bar{A}} \times 100$$

**Error percentiles** — P10 / P50 / P90 of the signed error, and the **P90 of |error|** as a prudent procurement buffer (the desk plans against the tail, not the mean).

**Procurement exposure** — error translated to energy over the window ($0.5\,\text{h}$ per period): **shortfall** $=\sum_{e_i>0} e_i \times 0.5$ (wind under-delivered → extra power to buy) and **surplus** $=\sum_{e_i<0} |e_i| \times 0.5$.

The API also returns **peak error** (largest single-period miss + its timestamp), the **worst forecast day** (highest daily MAE), per-hour / per-day error arrays, and **MAE/bias by forecast lead time** (`/api/horizon`).

---

## 4. Project structure

```
.
├── backend/                     # FastAPI service (Python)
│   ├── main.py                  # App, routes, CORS, validation, logging
│   ├── elexon_service.py        # Fetch, cache, align, compute metrics
│   ├── schemas.py               # Pydantic response models
│   ├── test_metrics.py          # Hand-worked unit tests for the metric maths
│   ├── requirements.txt
│   ├── requirements-dev.txt     # pytest
│   ├── Dockerfile               # Multi-stage, non-root, healthcheck
│   ├── Procfile / runtime.txt   # Heroku/Render start command
│   └── .dockerignore
├── frontend/                    # React + TypeScript + Tailwind + Recharts
│   ├── src/
│   │   ├── App.tsx              # Layout + data orchestration
│   │   ├── api/client.ts        # Typed API client
│   │   ├── types.ts             # Shared types (mirror backend schemas)
│   │   ├── lib/
│   │   │   ├── format.ts        # Consistent MW / % / GWh formatting
│   │   │   └── exportCsv.ts     # CSV download (also the accessible data view)
│   │   ├── hooks/
│   │   │   └── useMediaQuery.ts # Drives responsive chart density
│   │   └── components/
│   │       ├── Panel.tsx               # Shared card shell + legend
│   │       ├── Header.tsx
│   │       ├── Controls.tsx            # Date range + both January presets
│   │       ├── ForecastVintage.tsx     # Which forecast the desk actually had
│   │       ├── KpiCards.tsx            # MAE / RMSE / Peak / Bias %
│   │       ├── MainChart.tsx           # Actual vs Forecast overlay (+ Brush)
│   │       ├── DailyErrorChart.tsx     # MAE per delivery day (click to drill)
│   │       ├── ProcurementGapChart.tsx # Signed error over time (short/long)
│   │       ├── ErrorDistribution.tsx   # Error histogram + P10/P50/P90
│   │       ├── HorizonChart.tsx        # MAE by forecast lead time
│   │       ├── ProcurementPanel.tsx    # Energy exposure + £ what-if
│   │       └── HourlyErrorChart.tsx    # MAE by hour of day
│   ├── Dockerfile               # Multi-stage build → Nginx
│   ├── nginx.conf               # Serves SPA + proxies /api → backend
│   ├── vite.config.ts           # Dev proxy to :8000
│   └── tailwind.config.js       # Validated telemetry palette
├── api/
│   └── index.py                 # Vercel serverless entry (imports backend app)
├── vercel.json                  # Full-stack Vercel config (static + Python fn)
├── requirements.txt             # Python deps for the Vercel function
├── docker-compose.yml           # One-command full stack (local)
├── render.yaml                  # Optional split-deploy: backend on Render
└── README.md
```

---

## 5. Running the application

### Option A — Docker (recommended, one command)

```bash
docker compose up --build
```

> Verified: both images build and the stack serves end-to-end, with the backend container reporting `healthy` and Nginx proxying `/api/*` to it.

- Frontend: **http://localhost:3000**
- Backend API + docs: **http://localhost:8000** · **http://localhost:8000/docs**

Nginx serves the built frontend and proxies `/api/*` to the backend, so everything is same-origin.

### Option B — Local dev

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend** (new terminal)

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000 (proxies /api → :8000)
```

### Tests

The metric maths is covered by unit tests whose expected values are **worked out by hand in the test body**, so a reviewer can verify the statistics without trusting the implementation (e.g. errors `[+100,−200,+300,−400]` ⇒ MAE 250, Bias −50, RMSE √75000 ≈ 273.86).

```bash
cd backend
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -v          # 14 tests: gate closure, forecast selection, MAE/RMSE/bias,
                   # bias %, percentiles, distribution, procurement, hourly/daily
```

Coverage includes the invariants a reviewer should care about: **RMSE ≥ MAE** always, **shortfall + surplus = total gap**, histogram bins conserve the sample count, and the day-ahead selector never picks a revision published after gate closure.

### API quick reference

| Endpoint | Description |
|---|---|
| `GET /api/generation?startDate=2026-01-01&endDate=2026-01-31` | Aligned Actual vs Forecast timeline |
| `GET /api/metrics?startDate=2026-01-01&endDate=2026-01-31` | Aggregated metrics + distribution + procurement + hourly/daily arrays |
| `GET /api/horizon?startDate=2026-01-01&endDate=2026-01-31` | Forecast MAE/bias by lead-time bucket (all revisions) |
| `GET /api/health` | Service + data-source status |

---

## 6. Deployment

The repo is wired to deploy the **whole app on Vercel** in one shot — the Vite
frontend as static assets, and the FastAPI backend as a Python serverless
function. No `VITE_API_BASE` is needed: the frontend calls same-origin `/api/*`,
which `vercel.json` rewrites to the function.

- `api/index.py` — serverless entry; imports the FastAPI `app` from `backend/`.
- `requirements.txt` (root) — Python deps Vercel installs for the function.
- `vercel.json` — builds `frontend/` (served as the static site), and routes `/api/*` to the Python function while everything else falls back to the SPA's `index.html`.

**To deploy:** import the GitHub repo at [vercel.com/new](https://vercel.com/new) and click **Deploy** (the settings come from `vercel.json`, so no manual config). Or from the repo root: `npx vercel --prod`. **Live now** at the link below.

> An optional **Render** path for the backend alone is also included (`render.yaml`, `backend/Procfile`) if you prefer a split deploy; set `VITE_API_BASE` on the frontend to the Render URL in that case.

| Component | Link |
|---|---|
| GitHub repo | https://github.com/rishimohan2715/abmzr |
| Live app (Vercel) | https://grid-bricks-assignment-xi.vercel.app |

---

## 7. AI tool usage

As permitted and required to be disclosed by the challenge brief: **AI coding assistance (Claude / Claude Code) was used** to help scaffold the project structure, draft the FastAPI and React components, the Dockerfiles, and this README. All code was reviewed, run, and verified by the author — the Elexon endpoints, field names, data resolution (WINDFOR hourly vs FUELHH half-hourly), and the computed metrics were validated against the live January 2026 data.

---

## 8. Data source

Elexon BMRS Insights API — `https://data.elexon.co.uk/bmrs/api/v1`
- Actuals: `datasets/FUELHH/stream` (filtered to `fuelType == "WIND"`)
- Forecasts: `datasets/WINDFOR/stream`
