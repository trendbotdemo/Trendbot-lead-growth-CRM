import clsx from "clsx";
import Link from "next/link";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="card card-pad">
      <div className="text-[13px] text-ink-2">{label}</div>
      <div className="mt-1.5 text-[26px] font-semibold tabular-nums tracking-tight">{value}</div>
      {hint && (
        <div className={clsx("mt-1 text-[12.5px]", tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink-3")}>
          {hint}
        </div>
      )}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-line-2 text-ink-2",
  brand: "bg-brand-soft text-brand-ink",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof badgeTones; children: React.ReactNode }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium", badgeTones[tone])}>{children}</span>;
}

export const leadStatusTone: Record<string, keyof typeof badgeTones> = {
  new: "brand",
  contacted: "neutral",
  booked: "warn",
  won: "good",
  lost: "bad",
};

export function Empty({ title, body, action }: { title: string; body?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="font-medium">{title}</div>
      {body && <p className="mt-1 max-w-sm text-ink-2">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="tracking-[1px] text-[13px]" aria-label={`${rating} out of 5 stars`}>
      <span className="text-[#e3a008]">{"★".repeat(rating)}</span>
      <span className="text-line">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-[13px] font-medium text-brand hover:text-brand-ink">
      {children}
    </Link>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "good" | "bad" | "warn"; children: React.ReactNode }) {
  return (
    <div
      className={clsx(
        "mb-5 rounded-lg border px-4 py-3 text-[13.5px]",
        tone === "good" && "border-good/20 bg-good-soft text-good",
        tone === "bad" && "border-bad/20 bg-bad-soft text-bad",
        tone === "warn" && "border-warn/20 bg-warn-soft text-warn",
        tone === "neutral" && "border-line bg-panel text-ink-2",
      )}
    >
      {children}
    </div>
  );
}
