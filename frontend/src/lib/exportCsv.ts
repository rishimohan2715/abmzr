import type { GenerationPoint } from "../types";

/** Escape a CSV field (quote if it contains a comma, quote or newline). */
function cell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Download the aligned timeline as CSV. This doubles as the accessible,
 * non-visual view of the chart data, and lets the desk take the numbers
 * into their own spreadsheet models.
 */
export function exportSeriesCsv(
  series: GenerationPoint[],
  startDate: string,
  endDate: string
): void {
  const headers = [
    "delivery_start_utc",
    "decision_date",
    "actual_mw",
    "forecast_mw",
    "error_mw",
    "abs_error_mw",
    "forecast_publish_utc",
    "forecast_lead_hours",
  ];

  const rows = series.map((p) =>
    [
      p.start_time,
      p.decision_date,
      p.actual,
      p.forecast,
      p.error,
      p.abs_error,
      p.forecast_publish_time,
      p.forecast_lead_hours,
    ]
      .map(cell)
      .join(",")
  );

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `wind-forecast-accuracy_${startDate}_to_${endDate}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
