import { useMemo } from "react";
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GenerationPoint } from "../types";
import Panel, { LegendDot } from "./Panel";
import { useIsMobile } from "../hooks/useMediaQuery";
import { axisK, mw, signedMw } from "../lib/format";

interface MainChartProps {
  series: GenerationPoint[];
  loading: boolean;
  multiDay: boolean;
  onExport?: () => void;
}

interface Row {
  t: number;
  label: string;
  actual: number | null;
  forecast: number | null;
  delta: number | null;
  publish: string | null;
  lead: number | null;
  decision: string | null;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row: Row = payload[0].payload;
  const delta = row.delta;
  return (
    <div className="rounded-lg border border-edge bg-base/95 px-3 py-2 text-xs shadow-xl max-w-[230px]">
      <div className="text-slate-300 font-medium mb-1">{row.label}</div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-sm bg-actual" />
        <span className="text-slate-400">Actual</span>
        <span className="ml-auto tabular-nums text-slate-100">{mw(row.actual, true)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-sm bg-forecast" />
        <span className="text-slate-400">Forecast</span>
        <span className="ml-auto tabular-nums text-slate-100">{mw(row.forecast, true)}</span>
      </div>
      {delta != null && (
        <div className="mt-1 pt-1 border-t border-edge flex items-center gap-2">
          <span className="text-slate-400">Δ (fcst − act)</span>
          <span
            className={`ml-auto tabular-nums font-medium ${
              delta > 0 ? "text-forecast" : "text-errneg"
            }`}
          >
            {signedMw(delta, true)}
          </span>
        </div>
      )}
      {/* Forecast provenance: exactly which vintage the desk traded on. */}
      {row.publish && (
        <div className="mt-1 pt-1 border-t border-edge text-[10px] text-slate-500 leading-relaxed">
          <div>
            Issued{" "}
            <span className="text-slate-300">
              {new Date(row.publish).toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "UTC",
              })}
              Z
            </span>
            {row.lead != null && <> · {row.lead}h ahead</>}
          </div>
          {row.decision && <div>Decision date {row.decision}</div>}
        </div>
      )}
    </div>
  );
}

// Interactive overlay of Actual vs. Day-ahead Forecast wind generation.
// Both series share a single MW axis (never dual-axis). The Brush provides
// zoom/scrub across the 30-minute grid.
export default function MainChart({ series, loading, multiDay, onExport }: MainChartProps) {
  const isMobile = useIsMobile();

  const data = useMemo<Row[]>(() => {
    return series.map((p) => {
      const d = new Date(p.start_time);
      return {
        t: d.getTime(),
        label: d.toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "UTC",
        }),
        actual: p.actual,
        forecast: p.forecast,
        delta: p.error,
        publish: p.forecast_publish_time,
        lead: p.forecast_lead_hours,
        decision: p.decision_date,
      };
    });
  }, [series]);

  const fmtX = (t: number) => {
    const d = new Date(t);
    return multiDay
      ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })
      : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  };

  return (
    <Panel
      title="Actual vs. Day-Ahead Forecast"
      subtitle="National wind generation · 30-min settlement periods (MW)"
      actions={
        <>
          <div className="hidden sm:flex items-center gap-3">
            <LegendDot color="bg-actual" label="Actual" />
            <LegendDot color="bg-forecast" label="Forecast" />
          </div>
          {onExport && (
            <button
              onClick={onExport}
              className="text-xs px-2.5 py-1 rounded-lg border border-edge bg-panel2 text-slate-300 hover:border-slate-500 hover:text-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-actual"
            >
              Export CSV
            </button>
          )}
        </>
      }
    >
      {/* Legend moves below the title on phones so it never squeezes the header. */}
      <div className="flex sm:hidden items-center gap-3 mb-2">
        <LegendDot color="bg-actual" label="Actual" />
        <LegendDot color="bg-forecast" label="Forecast" />
      </div>

      <div className="h-[260px] sm:h-[320px] lg:h-[360px] w-full">
        {loading ? (
          <div className="h-full w-full grid place-items-center text-slate-500 text-sm animate-pulse">
            Loading timeline…
          </div>
        ) : data.length === 0 ? (
          <div className="h-full w-full grid place-items-center text-slate-500 text-sm">
            No data for this window.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2b95d6" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#2b95d6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1f2b3e" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={fmtX}
                stroke="#64748b"
                fontSize={isMobile ? 9 : 11}
                minTickGap={isMobile ? 60 : 40}
              />
              <YAxis
                stroke="#64748b"
                fontSize={isMobile ? 9 : 11}
                width={isMobile ? 40 : 52}
                tickFormatter={axisK}
                label={
                  isMobile
                    ? undefined
                    : {
                        value: "MW",
                        angle: -90,
                        position: "insideLeft",
                        fill: "#64748b",
                        fontSize: 11,
                        dy: 20,
                      }
                }
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="actual"
                stroke="#2b95d6"
                strokeWidth={2}
                fill="url(#actualFill)"
                dot={false}
                connectNulls
                name="Actual"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="forecast"
                stroke="#cf7f1f"
                strokeWidth={2}
                dot={false}
                connectNulls
                name="Forecast"
                isAnimationActive={false}
              />
              <Brush
                dataKey="t"
                height={isMobile ? 18 : 22}
                travellerWidth={isMobile ? 12 : 8}
                stroke="#2b95d6"
                fill="#161f31"
                tickFormatter={fmtX}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}
