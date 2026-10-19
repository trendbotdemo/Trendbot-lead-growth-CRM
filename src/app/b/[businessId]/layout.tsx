import Link from "next/link";
import { and, count, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { isAgencyUser, listAccessibleBusinesses, requireBusiness } from "@/lib/auth";
import { Logo } from "@/components/brand";
import { SideNav } from "@/components/nav";
import { logoutAction } from "../../actions";

export default async function BusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, business } = await requireBusiness(businessId);
  const agency = isAgencyUser(user);
  const base = `/b/${business.id}`;

  const [[newLeads], [unreplied], others] = await Promise.all([
    db.select({ n: count() }).from(schema.leads).where(and(eq(schema.leads.businessId, business.id), eq(schema.leads.status, "new"))),
    db.select({ n: count() }).from(schema.reviews).where(and(eq(schema.reviews.businessId, business.id), isNull(schema.reviews.replyComment))),
    agency ? Promise.resolve([]) : listAccessibleBusinesses(user),
  ]);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col md:flex-row">
      <aside className="border-b border-line px-4 py-4 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:overflow-y-auto md:border-r md:border-b-0 md:py-5">
        <div className="mb-4 md:mb-5"><Logo href={agency ? "/agency" : base} /></div>
        {agency && (
          <Link href="/agency" className="mb-2 block text-[12.5px] text-ink-3 hover:text-ink">← All clients</Link>
        )}
        <div className="mb-4 rounded-lg border border-line bg-panel px-3 py-2.5">
          <div className="truncate text-[13.5px] font-semibold">{business.name}</div>
          <div className="truncate text-[12px] text-ink-3">{[business.category, business.city].filter(Boolean).join(" · ") || "Business"}</div>
        </div>
        <SideNav
          items={[
            { href: base, label: "Dashboard", icon: "dashboard", exact: true },
            { href: `${base}/leads`, label: "Leads", icon: "leads", count: newLeads.n },
            { href: `${base}/calls`, label: "Calls", icon: "calls" },
            { href: `${base}/reviews`, label: "Reviews", icon: "reviews", count: unreplied.n },
            { href: `${base}/score`, label: "Growth score", icon: "score" },
            { href: `${base}/settings`, label: "Settings", icon: "settings" },
          ]}
        />
        {others.length > 1 && (
          <div className="mt-6 hidden md:block">
            <div className="h-section mb-2">Your businesses</div>
            {others.map((o) => (
              <Link key={o.id} href={`/b/${o.id}`} className={`block truncate rounded-md px-2 py-1 text-[13px] ${o.id === business.id ? "font-medium text-ink" : "text-ink-2 hover:text-ink"}`}>
                {o.name}
              </Link>
            ))}
          </div>
        )}
        <div className="mt-6 hidden border-t border-line pt-4 md:block">
          <div className="text-[13px] font-medium">{user.name}</div>
          <div className="truncate text-[12px] text-ink-3">{user.email}</div>
          <form action={logoutAction}><button className="mt-2 text-[12.5px] text-ink-2 hover:text-ink">Log out</button></form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
