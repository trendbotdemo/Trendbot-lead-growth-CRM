import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { listAccessibleBusinesses, requireAgencyUser } from "@/lib/auth";
import { getBusinessMetrics } from "@/lib/metrics";
import { money } from "@/lib/format";
import { Badge, Empty, PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "Clients" };

export default async function AgencyHome() {
  const user = await requireAgencyUser();
  const businesses = await listAccessibleBusinesses(user);
  const ids = businesses.map((b) => b.id);

  const [metrics, snaps] = await Promise.all([
    Promise.all(businesses.map((b) => getBusinessMetrics(b.id, 30))),
    ids.length
      ? db.select().from(schema.scoreSnapshots).where(inArray(schema.scoreSnapshots.businessId, ids)).orderBy(desc(schema.scoreSnapshots.createdAt))
      : Promise.resolve([]),
  ]);
  const latestScore = new Map<string, number>();
  for (const s of snaps) if (!latestScore.has(s.businessId)) latestScore.set(s.businessId, s.total);

  const totals = metrics.reduce(
    (t, m) => ({
      leads: t.leads + m.leads.total,
      revenue: t.revenue + m.leads.revenueCents,
      textedBack: t.textedBack + m.calls.textedBack,
      recovered: t.recovered + m.calls.recovered,
      unreplied: t.unreplied + m.reviews.unreplied,
    }),
    { leads: 0, revenue: 0, textedBack: 0, recovered: 0, unreplied: 0 },
  );

  return (
    <>
      <PageHeader
        title="All clients"
        subtitle="Last 30 days across every business you manage."
        actions={<Link href="/agency/new" className="btn-primary">Add client</Link>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Leads captured" value={totals.leads} />
        <Stat label="Revenue tracked" value={money(totals.revenue)} hint="From leads marked won" />
        <Stat label="Missed calls texted back" value={totals.textedBack} hint={`${totals.recovered} replied and were recovered`} tone="good" />
        <Stat label="Reviews awaiting reply" value={totals.unreplied} tone={totals.unreplied ? "warn" : undefined} hint={totals.unreplied ? "Reply with AI in one click" : "All caught up"} />
      </div>

      <div className="card overflow-x-auto">
        {businesses.length === 0 ? (
          <Empty title="No clients yet" body="Add your first business to start tracking calls, leads and reviews." action={<Link href="/agency/new" className="btn-primary">Add client</Link>} />
        ) : (
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <th>Business</th>
                <th>Growth score</th>
                <th>Leads</th>
                <th>Missed calls</th>
                <th>Revenue</th>
                <th>Rating</th>
                <th>Needs reply</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((b, i) => {
                const m = metrics[i];
                const score = latestScore.get(b.id);
                return (
                  <tr key={b.id} className="hover:bg-line-2/50">
                    <td>
                      <Link href={`/b/${b.id}`} className="font-medium hover:text-brand">{b.name}</Link>
                      <div className="text-[12px] text-ink-3">{[b.category, b.city && `${b.city}${b.state ? `, ${b.state}` : ""}`].filter(Boolean).join(" · ") || "—"}</div>
                    </td>
                    <td>
                      {score === undefined ? <span className="text-ink-3">—</span> : (
                        <Badge tone={score >= 75 ? "good" : score >= 50 ? "warn" : "bad"}>{score}</Badge>
                      )}
                    </td>
                    <td className="tabular-nums">{m.leads.total}</td>
                    <td className="tabular-nums">
                      {m.calls.missed}
                      {m.calls.textedBack > 0 && <span className="text-[12px] text-ink-3"> · {m.calls.textedBack} texted</span>}
                    </td>
                    <td className="tabular-nums">{m.leads.revenueCents ? money(m.leads.revenueCents) : "—"}</td>
                    <td className="tabular-nums">
                      {m.reviews.avgRating ? `${m.reviews.avgRating.toFixed(1)}★` : "—"}
                      <span className="text-[12px] text-ink-3"> ({m.reviews.total})</span>
                    </td>
                    <td>{m.reviews.unreplied ? <Badge tone="warn">{m.reviews.unreplied}</Badge> : <span className="text-ink-3">0</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
