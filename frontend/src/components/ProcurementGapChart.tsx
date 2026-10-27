import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AreaChart } from "recharts";
import type { GenerationPoint } from "../types";
import Panel, { LegendDot } from "./Panel";
import { useIsMobile } from "../hooks/useMediaQuery";
import { axisK, mw } from "../lib/format";

interface Props {
  series: GenerationPoint[];
  loading: boolean;
  multiDay: boolean;
}

interface Row {
  t: number;
  error: number;
}

function GapTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row: Row = payload[0].payload;
  const short = row.error > 0;
  return (
    <div className="rounded-lg border border-edge bg-base/95 px-3 py-2 text-xs shadow-xl">
      <div className="text-slate-300 mb-1">
        {new Date(row.t).toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
      <div className={short ? "text-errpos" : "text-errneg"}>
        {short ? "Short " : "Long "}
        {mw(Math.abs(row.error), true)}
      </div>
      <div className="text-[10px] text-slate-500">
        {short ? "wind under-delivered → procure more" : "wind over-delivered → surplus"}
      </div>
    </div>
  );
}

// Signed forecast error over time: a diverging area that is RED when the desk
// was short (wind under-delivered vs forecast → must procure extra) and GREEN
// when long. One split gradient at zero does the colour-by-sign.
export default function ProcurementGapChart({ series, loading, multiDay }: Props) {
  const isMobile = useIsMobile();
  const data = useMemo<Row[]>(
    () =>
      series
        .filter((p) => p.error != null)
        .map((p) => ({ t: new Date(p.start_time).getTime(), error: p.error as number })),
    [series]
  );

  // gradientOffset = fraction of the y-range that is >= 0, so the gradient flips
  // colour exactly at the zero line.
  const offset = useMemo(() => {
    if (!data.length) return 0.5;
    const max = Math.max(...data.map((d) => d.error));
    const min = Math.min(...data.map((d) => d.error));
    if (max <= 0) return 0;
    if (min >= 0) return 1;
    return max / (max - min);
  }, [data]);

  const fmtX = (t: number) => {
    const d = new Date(t);
    return multiDay
      ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })
      : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  };

  return (
    <Panel
      title="Procurement Gap Over Time"
      subtitle="Forecast − Actual (MW) · the position the desk had to cover each period"
      actions={
        <div className="hidden sm:flex items-center gap-3">
          <LegendDot color="bg-errpos" label="Short (buy more)" />
          <LegendDot color="bg-errneg" label="Long (surplus)" />
        </div>
      }
    >
      <div className="flex sm:hidden items-center gap-3 mb-2">
        <LegendDot color="bg-errpos" label="Short" />
        <LegendDot color="bg-errneg" label="Long" />
      </div>
      <div className="h-[170px] sm:h-[200px] w-full">
        {loading ? (
          <div className="h-full grid place-items-center text-slate-500 text-sm animate-pulse">
            Loading gap…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="gapSplit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={offset} stopColor="#c75563" stopOpacity={0.7} />
                  <stop offset={offset} stopColor="#2f9e6f" stopOpacity={0.7} />
                </linearGradient>
                <linearGradient id="gapStroke" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={offset} stopColor="#c75563" stopOpacity={1} />
                  <stop offset={offset} stopColor="#2f9e6f" stopOpacity={1} />
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
                width={isMobile ? 38 : 48}
                tickFormatter={axisK}
              />
              <Tooltip content={<GapTooltip />} />
              <ReferenceLine y={0} stroke="#64748b" />
              <Area
                type="monotone"
                dataKey="error"
                stroke="url(#gapStroke)"
                strokeWidth={1.5}
                fill="url(#gapSplit)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}
