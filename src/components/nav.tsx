"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { BarChart3, Gauge, Inbox, LayoutDashboard, Phone, Settings, Star } from "lucide-react";

const icons = { dashboard: LayoutDashboard, leads: Inbox, calls: Phone, reviews: Star, score: Gauge, settings: Settings, agency: BarChart3 };

export type NavItem = { href: string; label: string; icon: keyof typeof icons; count?: number; exact?: boolean };

export function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {items.map((it) => {
        const Icon = icons[it.icon];
        const active = it.exact ? path === it.href : path === it.href || path.startsWith(`${it.href}/`);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={clsx(
              "flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition",
              active ? "bg-panel text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-ink-2 hover:bg-line-2 hover:text-ink",
            )}
          >
            <Icon size={16} strokeWidth={1.8} className={active ? "text-brand" : "text-ink-3"} />
            <span>{it.label}</span>
            {it.count ? (
              <span className="ml-auto rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-[18px] text-white">{it.count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
