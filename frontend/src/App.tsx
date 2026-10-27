import { useCallback, useEffect, useState } from "react";
import Header from "./components/Header";
import Controls from "./components/Controls";
import KpiCards from "./components/KpiCards";
import MainChart from "./components/MainChart";
import HourlyErrorChart from "./components/HourlyErrorChart";
import ProcurementGapChart from "./components/ProcurementGapChart";
import ErrorDistribution from "./components/ErrorDistribution";
import HorizonChart from "./components/HorizonChart";
import ProcurementPanel from "./components/ProcurementPanel";
import ForecastVintage from "./components/ForecastVintage";
import DailyErrorChart from "./components/DailyErrorChart";
import { fetchGeneration, fetchHorizon, fetchMetrics } from "./api/client";
import { exportSeriesCsv } from "./lib/exportCsv";
import { pct, mw } from "./lib/format";
import type {
  GenerationPoint,
  GenerationResponse,
  HorizonBucket,
  MetricsResponse,
} from "./types";

export default function App() {
  // Default = the brief's scope: decisions made 1-31 Jan 2026, which deliver
  // on 2 Jan - 1 Feb 2026.
  const [startDate, setStartDate] = useState("2026-01-02");
  const [endDate, setEndDate] = useState("2026-02-01");

  const [meta, setMeta] = useState<GenerationResponse | null>(null);
  const [series, setSeries] = useState<GenerationPoint[]>([]);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [horizon, setHorizon] = useState<HorizonBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<"ok" | "error" | "loading">("loading");

  const load = useCallback(async (start: string, end: string) => {
    setLoading(true);
    setError(null);
    try {
      const [gen, met, hz] = await Promise.all([
        fetchGeneration(start, end),
        fetchMetrics(start, end),
        fetchHorizon(start, end).catch(() => null),
      ]);
      setMeta(gen);
      setSeries(gen.series);
      setMetrics(met);
      setHorizon(hz?.buckets ?? []);
      setHealth("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
      setHealth("error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(startDate, endDate);
  }, [startDate, endDate, load]);

  const onChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
  };

  const multiDay = startDate !== endDate;

  return (
    <div className="min-h-full">
      <Header health={health} />

      <main className="mx-auto max-w-[1400px] px-4 sm:px-6 py-4 sm:py-5 flex flex-col gap-3 sm:gap-4">
        {/* Desk briefing line */}
        <div className="rounded-xl border border-edge bg-panel2 px-4 py-3 text-sm text-slate-300">
          <span className="text-slate-100 font-medium">Day-ahead procurement view.</span>{" "}
          Wind is self-dispatching and weather-driven — every MW the forecast misses is a MW the
          desk must cover from thermal plant or imbalance. A decision taken on day D is for
          delivery on D+1, so this view defaults to the{" "}
          <span className="text-slate-100">31 purchase decisions made in January 2026</span>. The
          metrics below quantify that forecast risk.
        </div>

        <Controls
          startDate={startDate}
          endDate={endDate}
          worstDay={metrics?.worst_day ?? null}
          onChange={onChange}
          loading={loading}
        />

        {error && (
          <div className="rounded-xl border border-errpos/50 bg-errpos/10 px-4 py-3 text-sm text-errpos">
            <span className="font-medium">Could not load Elexon data.</span> {error}
          </div>
        )}

        <ForecastVintage meta={meta} loading={loading} />

        <KpiCards metrics={metrics} loading={loading} />

        <MainChart
          series={series}
          loading={loading}
          multiDay={multiDay}
          onExport={
            series.length ? () => exportSeriesCsv(series, startDate, endDate) : undefined
          }
        />

        <ProcurementGapChart series={series} loading={loading} multiDay={multiDay} />

        {multiDay && (
          <DailyErrorChart
            daily={metrics?.daily ?? []}
            loading={loading}
            worstDay={metrics?.worst_day ?? null}
            onSelectDay={(d) => onChange(d, d)}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          <ErrorDistribution distribution={metrics?.distribution ?? null} loading={loading} />
          <HorizonChart buckets={horizon} loading={loading} />
          <div className="md:col-span-2 xl:col-span-1">
            <ProcurementPanel procurement={metrics?.procurement ?? null} loading={loading} />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 sm:gap-4">
          <div className="xl:col-span-2">
            <HourlyErrorChart hourly={metrics?.hourly ?? []} loading={loading} />
          </div>
          <SummaryPanel metrics={metrics} loading={loading} />
        </div>

        <footer className="text-xs text-slate-500 pt-2 pb-6">
          Data: Elexon BMRS Insights (FUELHH · WINDFOR). Forecast = latest day-ahead revision
          available before gate closure. Scope: national wind, January 2026. £ figures are
          illustrative what-ifs, not market prices.
        </footer>
      </main>
    </div>
  );
}

function SummaryPanel({
  metrics,
  loading,
}: {
  metrics: MetricsResponse | null;
  loading: boolean;
}) {
  if (loading || !metrics) {
    return <div className="rounded-xl border border-edge bg-panel p-4 h-full min-h-[200px] animate-pulse" />;
  }
  const rows: { k: string; v: string }[] = [
    { k: "Matched periods", v: metrics.sample_count.toLocaleString() },
    { k: "Mean actual output", v: mw(metrics.mean_actual, true) },
    { k: "MAPE", v: pct(metrics.mape) },
    { k: "Normalised MAE", v: pct(metrics.normalised_mae_pct) },
    { k: "Worst forecast day", v: metrics.worst_day ?? "—" },
  ];
  return (
    <div className="rounded-xl border border-edge bg-panel p-3 sm:p-4 h-full transition-colors hover:border-slate-600/70">
      <h2 className="text-sm font-semibold mb-2">Accuracy Summary</h2>
      <dl className="divide-y divide-edge">
        {rows.map((r) => (
          <div key={r.k} className="flex items-center justify-between gap-3 py-2 text-sm">
            <dt className="text-slate-400">{r.k}</dt>
            <dd className="tabular-nums text-slate-100 text-right">{r.v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-slate-500 mt-3 leading-relaxed">
        {metrics.bias > 0
          ? "On average the model over-forecasts wind, so the desk risks under-procuring thermal cover."
          : "On average the model under-forecasts wind, so the desk risks over-procuring thermal cover."}
      </p>
    </div>
  );
}
