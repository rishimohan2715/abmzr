import type { GenerationResponse } from "../types";
import { utcStamp } from "../lib/format";

interface Props {
  meta: GenerationResponse | null;
  loading: boolean;
}

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Answers the brief's FIRST purpose explicitly: "which forecast did the desk
// actually have when the decision was made?" Shows the decision window, the
// gate-closure rule, the vintage of the newest forecast used, and the average
// lead time of the forecasts in view.
export default function ForecastVintage({ meta, loading }: Props) {
  if (loading || !meta) {
    return <div className="rounded-xl border border-edge bg-panel2 p-4 h-[76px] animate-pulse" />;
  }

  const items = [
    { k: "Decision window", v: `${fmtDate(meta.decision_start)} → ${fmtDate(meta.decision_end)}` },
    { k: "Delivery window", v: `${fmtDate(meta.start_date)} → ${fmtDate(meta.end_date)}` },
    { k: "Latest forecast used", v: utcStamp(meta.latest_forecast_publish) },
    { k: "Avg lead time", v: meta.mean_lead_hours != null ? `${meta.mean_lead_hours} h` : "—" },
  ];

  return (
    <div className="rounded-xl border border-actual/30 bg-actual/5 p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="h-2 w-2 rounded-full bg-actual" />
        <h2 className="text-sm font-semibold">Forecast Used for These Decisions</h2>
        <span className="text-[11px] text-slate-400 ml-auto hidden sm:inline">
          latest WINDFOR revision published before the 11:00Z day-ahead gate
        </span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((i) => (
          <div key={i.k}>
            <div className="text-[11px] uppercase tracking-wide text-slate-400">{i.k}</div>
            <div className="text-sm text-slate-100 tabular-nums mt-0.5">{i.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
