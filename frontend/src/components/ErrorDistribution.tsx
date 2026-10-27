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
import type { Distribution } from "../types";
import Panel from "./Panel";
import { useIsMobile } from "../hooks/useMediaQuery";
import { axisK, mw, signedMw } from "../lib/format";

interface Props {
  distribution: Distribution | null;
  loading: boolean;
}

function DistTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-edge bg-base/95 px-3 py-2 text-xs shadow-xl">
      <div className="text-slate-300">
        {mw(d.bin_start)} to {mw(d.bin_end)} MW
      </div>
      <div className="text-slate-400">{d.count} periods</div>
    </div>
  );
}

// Histogram of signed error. Bars left of zero = under-forecast (wind over-
// delivered); right of zero = over-forecast (desk short). P10/P50/P90 markers
// show the spread a risk-aware trader must plan around — not just the mean.
export default function ErrorDistribution({ distribution, loading }: Props) {
  const isMobile = useIsMobile();

  return (
    <Panel
      title="Forecast Error Distribution"
      subtitle="Signed error (MW) · spread around the bias, with P10 / P50 / P90"
      className="h-full"
    >
      <div className="h-[200px] sm:h-[230px] w-full">
        {loading || !distribution ? (
          <div className="h-full grid place-items-center text-slate-500 text-sm animate-pulse">
            Loading distribution…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={distribution.bins}
              margin={{ top: 4, right: 8, bottom: 0, left: -14 }}
              barCategoryGap={1}
            >
              <CartesianGrid stroke="#1f2b3e" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="center"
                stroke="#64748b"
                fontSize={isMobile ? 9 : 10}
                tickFormatter={axisK}
                interval={isMobile ? 4 : 2}
              />
              <YAxis
                stroke="#64748b"
                fontSize={isMobile ? 9 : 11}
                width={isMobile ? 32 : 40}
              />
              <Tooltip content={<DistTooltip />} cursor={{ fill: "#ffffff08" }} />
              <ReferenceLine x={0} stroke="#64748b" strokeDasharray="4 4" />
              <Bar dataKey="count" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                {distribution.bins.map((b, i) => (
                  <Cell key={i} fill={b.center >= 0 ? "#cf7f1f" : "#2b95d6"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      {distribution && (
        <div className="grid grid-cols-3 gap-2 mt-2.5">
          {[
            { k: "P10", v: distribution.p10 },
            { k: "P50", v: distribution.p50 },
            { k: "P90", v: distribution.p90 },
          ].map((p) => (
            <div
              key={p.k}
              className="rounded-lg bg-panel2 border border-edge py-1.5 text-center"
            >
              <div className="text-[10px] uppercase tracking-wide text-slate-500">{p.k}</div>
              <div className="text-xs sm:text-sm tabular-nums mt-0.5">{signedMw(p.v)}</div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
