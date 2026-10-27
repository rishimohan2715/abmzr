interface HeaderProps {
  health: "ok" | "error" | "loading";
}

// Top navigation bar with trading-desk branding and a live data-source status.
export default function Header({ health }: HeaderProps) {
  const dot =
    health === "ok" ? "bg-errneg" : health === "error" ? "bg-errpos" : "bg-forecast";
  const label =
    health === "ok" ? "Elexon feed live" : health === "error" ? "Feed error" : "Connecting…";

  return (
    <header className="border-b border-edge bg-panel/70 backdrop-blur sticky top-0 z-20">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-gradient-to-br from-actual to-forecast grid place-items-center font-bold text-base text-black">
            ⌁
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-semibold tracking-tight truncate">
              UK Wind Forecast Accuracy
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-400 truncate">
              Day-Ahead Power Trading Desk · National Wind · Jan 2026
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-300 shrink-0">
          <span className={`h-2 w-2 rounded-full ${dot} animate-pulse`} />
          <span className="hidden sm:inline">{label}</span>
        </div>
      </div>
    </header>
  );
}
