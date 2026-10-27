import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HourlyError } from "../types";
import Panel from "./Panel";
import { useIsMobile } from "../hooks/useMediaQuery";
import { axisK, mw, signedMw } from "../lib/format";

interface HourlyErrorChartProps {
  hourly: HourlyError[];
  loading: boolean;
}

function HourTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: HourlyError = payload[0].payload;
  const hh = String(d.hour).padStart(2, "0");
  return (
    <div className="rounded-lg border border-edge bg-base/95 px-3 py-2 text-xs shadow-xl">
      <div className="text-slate-300 font-medium mb-1">
        {hh}:00 – {hh}:30 UTC
      </div>
      <div className="flex items-center gap-3">
        <span className="text-slate-400">MAE</span>
        <span className="ml-auto tabular-nums">{mw(d.mae, true)}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-slate-400">Bias</span>
        <span className={`ml-auto tabular-nums ${d.bias > 0 ? "text-forecast" : "text-errneg"}`}>
          {signedMw(d.bias, true)}
        </span>
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5">{d.count} periods</div>
    </div>
  );
}

// MAE bucketed by hour-of-day — exposes systemic forecast drift at specific
// times (e.g. morning/evening). Single measure => single hue, no legend.
export default function HourlyErrorChart({ hourly, loading }: HourlyErrorChartProps) {
  const isMobile = useIsMobile();
  const withData = hourly.filter((h) => h.count > 0);
  const avg = withData.length
    ? withData.reduce((s, h) => s + h.mae, 0) / withData.length
    : 0;

  return (
    <Panel
      title="Forecast Error by Hour of Day"
      subtitle="Mean Absolute Error (MW) · bars above the dashed average flag systemic drift"
    >
      <div className="h-[220px] sm:h-[260px] w-full">
        {loading ? (
          <div className="h-full w-full grid place-items-center text-slate-500 text-sm animate-pulse">
            Loading error profile…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourly} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="#1f2b3e" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="hour"
                stroke="#64748b"
                fontSize={isMobile ? 9 : 11}
                tickFormatter={(h) => String(h).padStart(2, "0")}
                interval={isMobile ? 3 : 1}
              />
              <YAxis
                stroke="#64748b"
                fontSize={isMobile ? 9 : 11}
                width={isMobile ? 38 : 48}
                tickFormatter={axisK}
              />
              <Tooltip content={<HourTooltip />} cursor={{ fill: "#ffffff08" }} />
              <ReferenceLine
                y={avg}
                stroke="#64748b"
                strokeDasharray="4 4"
                label={{ value: "avg", position: "right", fill: "#64748b", fontSize: 10 }}
              />
              <Bar dataKey="mae" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false}>
                {hourly.map((h) => (
                  <Cell key={h.hour} fill={h.mae > avg ? "#cf7f1f" : "#2b95d6"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}
