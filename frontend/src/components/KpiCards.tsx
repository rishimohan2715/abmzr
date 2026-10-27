import type { MetricsResponse } from "../types";
import { mw, pct, signedMw, signedPct, utcStamp } from "../lib/format";

interface KpiCardsProps {
  metrics: MetricsResponse | null;
  loading: boolean;
}

function Card({
  label,
  value,
  unit,
  sub,
  accent,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  accent: string;
  hint?: string;
}) {
  return (
    <div
      title={hint}
      className="rounded-xl border border-edge bg-panel p-3 sm:p-4 flex flex-col gap-1 relative overflow-hidden transition-colors hover:border-slate-600/70"
    >
      <span className={`absolute left-0 top-0 h-full w-1 ${accent}`} />
      <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span className="text-xl sm:text-2xl lg:text-3xl font-semibold tabular-nums leading-none">
          {value}
        </span>
        {unit && <span className="text-xs sm:text-sm text-slate-400">{unit}</span>}
      </div>
      {sub && <span className="text-[11px] text-slate-500 leading-snug">{sub}</span>}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="rounded-xl border border-edge bg-panel p-4 h-[92px] sm:h-[104px] animate-pulse">
      <div className="h-2.5 w-16 bg-edge rounded mb-3" />
      <div className="h-6 w-24 bg-edge rounded mb-2" />
      <div className="h-2 w-20 bg-edge rounded" />
    </div>
  );
}

// Four headline accuracy KPIs for the trading desk.
export default function KpiCards({ metrics, loading }: KpiCardsProps) {
  if (loading || !metrics) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} />
        ))}
      </div>
    );
  }

  const over = metrics.bias > 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
      <Card
        label="MAE"
        value={mw(metrics.mae)}
        unit="MW"
        sub={`${pct(metrics.normalised_mae_pct)} of mean output`}
        accent="bg-actual"
        hint="Mean Absolute Error — the average size of the forecast miss."
      />
      <Card
        label="RMSE"
        value={mw(metrics.rmse)}
        unit="MW"
        sub="penalises large misses"
        accent="bg-forecast"
        hint="Root Mean Square Error — weights big misses more heavily than small ones."
      />
      <Card
        label="Peak Error"
        value={mw(metrics.peak_error)}
        unit="MW"
        sub={utcStamp(metrics.peak_error_time)}
        accent="bg-errpos"
        hint="The single worst half-hour miss in the window."
      />
      <Card
        label="Model Bias"
        value={signedPct(metrics.bias_pct)}
        sub={`${signedMw(metrics.bias)} MW · ${over ? "over-forecast" : "under-forecast"}`}
        accent={over ? "bg-forecast" : "bg-errneg"}
        hint="Systematic lean of the model, as a share of mean actual output."
      />
    </div>
  );
}
