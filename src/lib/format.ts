export function money(cents: number | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    (cents ?? 0) / 100,
  );
}

export function timeAgo(date: Date | string | null | undefined) {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function duration(sec: number | null | undefined) {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  return m ? `${m}m ${sec % 60}s` : `${sec}s`;
}

export function minutesLabel(min: number | null) {
  if (min === null) return "—";
  if (min < 1) return "< 1 min";
  if (min < 60) return `${Math.round(min)} min`;
  return `${(min / 60).toFixed(1)} hrs`;
}

export function fillTemplate(tpl: string, vars: Record<string, string | null | undefined>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] ?? "").toString().trim() || "there");
}
