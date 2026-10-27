import {
  Bar,
  Cell,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HorizonBucket } from "../types";
import Panel from "./Panel";
import { useIsMobile } from "../hooks/useMediaQuery";
import { axisK, mw, signedMw } from "../lib/format";

interface Props {
  buckets: HorizonBucket[];
  loading: boolean;
}

function HzTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: HorizonBucket = payload[0].payload;
  return (
    <div className="rounded-lg border border-edge bg-base/95 px-3 py-2 text-xs shadow-xl">
      <div className="text-slate-300 font-medium mb-1">Lead time {d.label}</div>
      <div className="flex gap-3">
        <span className="text-slate-400">MAE</span>
        <span className="ml-auto tabular-nums">{mw(d.mae, true)}</span>
      </div>
      <div className="flex gap-3">
        <span className="text-slate-400">Bias</span>
        <span className="ml-auto tabular-nums">{signedMw(d.bias, true)}</span>
      </div>
      <div className="text-[10px] text-slate-500">{d.count.toLocaleString()} forecasts</div>
    </div>
  );
}

// Forecast skill as a function of lead time. Accuracy decays the further ahead
// the forecast is issued — the "day-ahead" band (24-36h) is what the desk trades
// on, and is materially worse than intraday. This is the core justification for
// quantifying day-ahead error separately. Single measure (MAE) => single hue.
export default function HorizonChart({ buckets, loading }: Props) {
  const isMobile = useIsMobile();
  const isDayAhead = (b: HorizonBucket) => b.min_hours === 24;

  return (
    <Panel
      title="Forecast Skill vs. Lead Time"
      subtitle="MAE (MW) by how far ahead the forecast was issued · ← closer to delivery"
      className="h-full"
    >
      <div className="h-[200px] sm:h-[230px] w-full">
        {loading ? (
          <div className="h-full grid place-items-center text-slate-500 text-sm animate-pulse">
            Loading horizon…
          </div>
        ) : buckets.length === 0 ? (
          <div className="h-full grid place-items-center text-slate-500 text-sm">
            No revision data for this window.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={buckets} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="#1f2b3e" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="#64748b"
                fontSize={isMobile ? 9 : 11}
                interval={0}
              />
              <YAxis
                stroke="#64748b"
                fontSize={isMobile ? 9 : 11}
                width={isMobile ? 38 : 48}
                domain={["dataMin - 200", "dataMax + 200"]}
                tickFormatter={axisK}
              />
              <Tooltip content={<HzTooltip />} cursor={{ fill: "#ffffff08" }} />
              <Bar dataKey="mae" radius={[3, 3, 0, 0]} maxBarSize={44} isAnimationActive={false}>
                {buckets.map((b, i) => (
                  <Cell key={i} fill={isDayAhead(b) ? "#cf7f1f" : "#2b95d6"} />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="mae"
                stroke="#e5edf7"
                strokeWidth={1.5}
                dot={{ r: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="text-[11px] text-slate-500 mt-2 leading-snug">
        <span className="inline-block h-2 w-2 rounded-sm bg-forecast align-middle mr-1" />
        Day-ahead band (24–36h) — the horizon the desk actually trades on.
      </p>
    </Panel>
  );
}
