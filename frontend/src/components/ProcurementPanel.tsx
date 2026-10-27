import { useState } from "react";
import type { Procurement } from "../types";
import { energy, mw } from "../lib/format";

interface Props {
  procurement: Procurement | null;
  loading: boolean;
}

// Translates forecast error into the desk's procurement exposure, and lets the
// trader stress-test a £ cost against their own assumed imbalance price.
// The £ figure is explicitly an illustrative what-if (no external price data is
// used — the brief scopes us to Elexon wind only).
export default function ProcurementPanel({ procurement, loading }: Props) {
  const [price, setPrice] = useState(80); // £/MWh imbalance assumption

  if (loading || !procurement) {
    return <div className="rounded-xl border border-edge bg-panel p-4 min-h-[200px] animate-pulse" />;
  }

  const net = procurement.shortfall_energy_mwh - procurement.surplus_energy_mwh;
  // Illustrative exposure: energy the desk was short, valued at the assumed price.
  const exposure = (procurement.shortfall_energy_mwh * price) / 1_000_000; // £m

  return (
    <div className="rounded-xl border border-edge bg-panel p-3 sm:p-4 transition-colors hover:border-slate-600/70 h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Procurement Impact</h2>
        <span className="text-[10px] uppercase tracking-wide text-slate-500">from forecast error</span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg border border-errpos/40 bg-errpos/5 p-3">
          <div className="text-[11px] text-slate-400">Short (under-forecast)</div>
          <div className="text-lg font-semibold text-errpos tabular-nums">
            {energy(procurement.shortfall_energy_mwh)}
          </div>
          <div className="text-[10px] text-slate-500">extra power to procure</div>
        </div>
        <div className="rounded-lg border border-errneg/40 bg-errneg/5 p-3">
          <div className="text-[11px] text-slate-400">Long (over-forecast)</div>
          <div className="text-lg font-semibold text-errneg tabular-nums">
            {energy(procurement.surplus_energy_mwh)}
          </div>
          <div className="text-[10px] text-slate-500">surplus vs plan</div>
        </div>
      </div>

      <div className="flex items-center justify-between py-1.5 text-sm border-t border-edge">
        <span className="text-slate-400">Net position</span>
        <span className="tabular-nums">{net > 0 ? "Short " : "Long "}{energy(Math.abs(net))}</span>
      </div>
      <div className="flex items-center justify-between py-1.5 text-sm border-t border-edge">
        <span className="text-slate-400">P90 procurement buffer</span>
        <span className="tabular-nums">{mw(procurement.p90_buffer_mw, true)}</span>
      </div>

      {/* Illustrative £ exposure — trader sets their own imbalance price. */}
      <div className="mt-3 rounded-lg bg-panel2 border border-edge p-3">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-slate-400">Assumed imbalance price</label>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-500">£</span>
            <input
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))}
              className="w-16 bg-base border border-edge rounded px-1.5 py-0.5 text-right text-slate-100 tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-actual"
            />
            <span className="text-slate-500">/MWh</span>
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-slate-400">Illustrative shortfall exposure</span>
          <span className="text-xl font-semibold tabular-nums text-forecast">
            £{exposure.toFixed(2)}m
          </span>
        </div>
        <p className="text-[10px] text-slate-500 mt-1">
          What-if only · your price × energy the forecast left the desk short.
        </p>
      </div>
    </div>
  );
}
