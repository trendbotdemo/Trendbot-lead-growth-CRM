import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
        <rect width="24" height="24" rx="6" fill="var(--color-ink)" />
        <path d="M6 15.5 10 11l3 3 5-6" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="18" cy="8" r="1.6" fill="#8b96ff" />
      </svg>
      <span className="text-[14.5px] font-semibold tracking-tight">
        TrendBot <span className="font-normal text-ink-3">Growth</span>
      </span>
    </Link>
  );
}
