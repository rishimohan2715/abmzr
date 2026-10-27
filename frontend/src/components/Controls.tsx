interface ControlsProps {
  startDate: string;
  endDate: string;
  worstDay: string | null;
  onChange: (start: string, end: string) => void;
  loading: boolean;
}

// Delivery dates. The brief scopes us to decisions made in January 2026; a
// decision on day D delivers on D+1, so January decisions span deliveries
// 2 Jan - 1 Feb. We allow 1 Jan too, for the delivery-month reading.
const MIN = "2026-01-01";
const MAX = "2026-02-01";

// Date-range selector + quick presets. All presets stay within January 2026,
// the delivery month the brief scopes us to.
export default function Controls({
  startDate,
  endDate,
  worstDay,
  onChange,
  loading,
}: ControlsProps) {
  const presets: {
    label: string;
    title?: string;
    start: string;
    end: string;
    disabled?: boolean;
  }[] = [
    {
      label: "Jan 2026 Decisions",
      title: "Purchase decisions made 1–31 Jan 2026 (delivery 2 Jan – 1 Feb)",
      start: "2026-01-02",
      end: "2026-02-01",
    },
    {
      label: "Jan 2026 Delivery",
      title: "Delivery days 1–31 Jan 2026 (decisions 31 Dec – 30 Jan)",
      start: "2026-01-01",
      end: "2026-01-31",
    },
    { label: "Week 1", start: "2026-01-02", end: "2026-01-08" },
    {
      label: "Worst Forecast Day",
      title: "Jump to the delivery day with the highest MAE",
      start: worstDay ?? MIN,
      end: worstDay ?? MIN,
      disabled: !worstDay,
    },
  ];

  const active = (s: string, e: string) => s === startDate && e === endDate;

  return (
    <div className="rounded-xl border border-edge bg-panel p-3 flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <button
            key={p.label}
            title={p.title}
            disabled={loading || p.disabled}
            onClick={() => onChange(p.start, p.end)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40
              ${
                active(p.start, p.end)
                  ? "bg-actual/15 border-actual/60 text-actual"
                  : "bg-panel2 border-edge text-slate-300 hover:border-slate-500"
              }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-300">
        <span className="text-slate-500 text-[11px] uppercase tracking-wide">Delivery</span>
        <label className="flex items-center gap-1.5">
          <span className="text-slate-400">From</span>
          <input
            type="date"
            min={MIN}
            max={MAX}
            value={startDate}
            disabled={loading}
            onChange={(e) => onChange(e.target.value, endDate)}
            className="bg-panel2 border border-edge rounded-md px-2 py-1 text-slate-100 [color-scheme:dark]"
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-slate-400">To</span>
          <input
            type="date"
            min={MIN}
            max={MAX}
            value={endDate}
            disabled={loading}
            onChange={(e) => onChange(startDate, e.target.value)}
            className="bg-panel2 border border-edge rounded-md px-2 py-1 text-slate-100 [color-scheme:dark]"
          />
        </label>
      </div>
    </div>
  );
}
