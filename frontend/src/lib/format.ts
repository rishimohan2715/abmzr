// Consistent number formatting across the dashboard.
// Traders read MW as whole numbers — sub-MW precision is noise, so we round.

export function mw(v: number | null | undefined, withUnit = false): string {
  if (v == null || Number.isNaN(v)) return "—";
  const s = Math.round(v).toLocaleString("en-GB");
  return withUnit ? `${s} MW` : s;
}

/** Signed MW, always showing the sign (for bias / delta figures). */
export function signedMw(v: number | null | undefined, withUnit = false): string {
  if (v == null || Number.isNaN(v)) return "—";
  const s = `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v)).toLocaleString("en-GB")}`;
  return withUnit ? `${s} MW` : s;
}

export function pct(v: number | null | undefined, dp = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v.toFixed(dp)}%`;
}

export function signedPct(v: number | null | undefined, dp = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(dp)}%`;
}

/** Energy in MWh, promoted to GWh once it gets large. */
export function energy(mwh: number | null | undefined): string {
  if (mwh == null || Number.isNaN(mwh)) return "—";
  const a = Math.abs(mwh);
  if (a >= 1000) return `${(mwh / 1000).toFixed(1)} GWh`;
  return `${Math.round(mwh).toLocaleString("en-GB")} MWh`;
}

/** Compact axis tick: 12345 -> "12.3k". */
export function axisK(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}

export function utcStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  return (
    new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }) + "Z"
  );
}

export function dayLabel(isoDate: string): string {
  return new Date(isoDate + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}
