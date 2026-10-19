import { money } from "@/lib/format";

/** Single-series daily bars with a per-bar hover tooltip. */
export function DailyBars({ data }: { data: { day: string; leads: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.leads));
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <div>
      <div className="flex h-36 items-end gap-[2px]" role="img" aria-label="Leads per day, last 30 days">
        {data.map((d) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t-[4px] bg-brand/85 transition group-hover:bg-brand-ink"
              style={{ height: d.leads ? `${Math.max(4, (d.leads / max) * 100)}%` : "2px", opacity: d.leads ? 1 : 0.25 }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[12px] text-white shadow group-hover:block">
              {fmt(d.day)} · <span className="font-semibold">{d.leads}</span> lead{d.leads === 1 ? "" : "s"}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-ink-3">
        <span>{data[0] && fmt(data[0].day)}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

/** Horizontal bars: leads by source, with revenue alongside. */
export function SourceBars({ rows }: { rows: { source: string; leads: number; revenueCents: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.leads));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.source}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate font-medium">{r.source}</span>
            <span className="shrink-0 tabular-nums text-ink-2">
              {r.leads} lead{r.leads === 1 ? "" : "s"}
              {r.revenueCents > 0 && <span className="text-good"> · {money(r.revenueCents)}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-line-2">
            <div className="h-2 rounded-full bg-brand/85" style={{ width: `${(r.leads / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ScoreRing({ score, size = 128 }: { score: number; size?: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? "var(--color-good)" : score >= 50 ? "var(--color-warn)" : "var(--color-bad)";
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" role="img" aria-label={`Growth score ${score} out of 100`}>
      <circle cx="64" cy="64" r={r} fill="none" stroke="var(--color-line-2)" strokeWidth="10" />
      <circle
        cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 64 64)"
      />
      <text x="64" y="62" textAnchor="middle" fontSize="34" fontWeight="600" fill="var(--color-ink)">{score}</text>
      <text x="64" y="84" textAnchor="middle" fontSize="12" fill="var(--color-ink-3)">of 100</text>
    </svg>
  );
}

export function CategoryBar({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = (score / max) * 100;
  const color = pct >= 75 ? "bg-good" : pct >= 50 ? "bg-warn" : "bg-bad";
  return (
    <div>
      <div className="mb-1 flex justify-between text-[13px]">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-ink-2">{score} / {max}</span>
      </div>
      <div className="h-2 rounded-full bg-line-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
