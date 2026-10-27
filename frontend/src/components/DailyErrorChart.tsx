import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyError } from "../types";
import Panel from "./Panel";
import { useIsMobile } from "../hooks/useMediaQuery";
import { axisK, mw, signedMw } from "../lib/format";

interface Props {
  daily: DailyError[];
  loading: boolean;
  worstDay: string | null;
  onSelectDay?: (date: string) => void;
}

function DayTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: DailyError = payload[0].payload;
  return (
    <div className="rounded-lg border border-edge bg-base/95 px-3 py-2 text-xs shadow-xl">
      <div className="text-slate-300 font-medium mb-1">
        {new Date(d.date + "T00:00:00Z").toLocaleDateString("en-GB", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          timeZone: "UTC",
        })}
      </div>
      <div className="flex gap-3">
        <span className="text-slate-400">MAE</span>
        <span className="ml-auto tabular-nums">{mw(d.mae, true)}</span>
      </div>
      <div className="flex gap-3">
        <span className="text-slate-400">RMSE</span>
        <span className="ml-auto tabular-nums">{mw(d.rmse, true)}</span>
      </div>
      <div className="flex gap-3">
        <span className="text-slate-400">Bias</span>
        <span className={`ml-auto tabular-nums ${d.bias > 0 ? "text-forecast" : "text-errneg"}`}>
          {signedMw(d.bias, true)}
        </span>
      </div>
      <div className="text-[10px] text-slate-500 mt-1">Click to zoom to this day</div>
    </div>
  );
}

// Day-by-day MAE across the window. The worst day is highlighted, and clicking
// any bar drills the whole dashboard into that single delivery day.
export default function DailyErrorChart({ daily, loading, worstDay, onSelectDay }: Props) {
  const isMobile = useIsMobile();
  const avg = daily.length ? daily.reduce((s, d) => s + d.mae, 0) / daily.length : 0;

  return (
    <Panel
      title="Daily Forecast Error"
      subtitle="MAE (MW) per delivery day · amber = worst day · click a bar to drill in"
    >
      <div className="h-[190px] sm:h-[220px] w-full">
        {loading ? (
          <div className="h-full grid place-items-center text-slate-500 text-sm animate-pulse">
            Loading daily error…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="#1f2b3e" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="#64748b"
                fontSize={isMobile ? 9 : 10}
                tickFormatter={(d) => d.slice(8)}
                interval={isMobile ? 3 : 0}
                minTickGap={2}
              />
              <YAxis
                stroke="#64748b"
                fontSize={isMobile ? 9 : 11}
                width={isMobile ? 38 : 48}
                tickFormatter={axisK}
              />
              <Tooltip content={<DayTooltip />} cursor={{ fill: "#ffffff08" }} />
              <ReferenceLine
                y={avg}
                stroke="#64748b"
                strokeDasharray="4 4"
                label={{ value: "avg", position: "right", fill: "#64748b", fontSize: 10 }}
              />
              <Bar
                dataKey="mae"
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
                onClick={(d: any) => onSelectDay?.(d.date)}
                className={onSelectDay ? "cursor-pointer" : undefined}
              >
                {daily.map((d) => (
                  <Cell key={d.date} fill={d.date === worstDay ? "#cf7f1f" : "#2b95d6"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}
