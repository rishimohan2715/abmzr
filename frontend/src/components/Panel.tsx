import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  subtitle?: string;
  /** Right-aligned slot: legend, actions, badges. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Shared card shell so every chart has the same header rhythm and chrome. */
export default function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: PanelProps) {
  return (
    <section
      className={`rounded-xl border border-edge bg-panel p-3 sm:p-4 transition-colors hover:border-slate-600/70 ${className}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-3">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Small colour-swatch legend item, used in panel headers. */
export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-300 whitespace-nowrap">
      <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}
