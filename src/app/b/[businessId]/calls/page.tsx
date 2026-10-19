import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireBusiness } from "@/lib/auth";
import { duration, timeAgo } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { getBusinessMetrics } from "@/lib/metrics";
import { Badge, Empty, PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "Calls" };

export default async function CallsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { business } = await requireBusiness(businessId);
  const [rows, m] = await Promise.all([
    db.select().from(schema.calls).where(eq(schema.calls.businessId, business.id)).orderBy(desc(schema.calls.startedAt)).limit(200),
    getBusinessMetrics(business.id, 30),
  ]);

  return (
    <>
      <PageHeader title="Calls" subtitle="Calls to your tracking numbers. Missed callers get an automatic text." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Calls (30 days)" value={m.calls.total} />
        <Stat label="Answered" value={m.calls.answered} />
        <Stat label="Missed" value={m.calls.missed} tone={m.calls.missed ? "warn" : undefined} hint={m.calls.missed ? "Each one is a job at risk" : undefined} />
        <Stat label="Recovered by text-back" value={m.calls.recovered} tone="good" hint={`of ${m.calls.textedBack} texted`} />
      </div>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty title="No calls yet" body="Add a tracking number in Settings and put it on Google, your website or ads." action={<Link href={`/b/${business.id}/settings#calls`} className="btn-ghost">Set up call tracking</Link>} />
        ) : (
          <table className="table min-w-[640px]">
            <thead><tr><th>Caller</th><th>Source</th><th>Result</th><th>Duration</th><th>When</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.leadId ? <Link href={`/b/${business.id}/leads/${c.leadId}`} className="font-medium hover:text-brand">{formatPhone(c.fromNumber)}</Link> : formatPhone(c.fromNumber)}</td>
                  <td className="text-ink-2">{c.source}</td>
                  <td>
                    {c.status === "completed" && <Badge tone="good">Answered</Badge>}
                    {c.status === "missed" && <Badge tone="bad">Missed</Badge>}
                    {c.status === "ringing" && <Badge>Ringing</Badge>}
                    {c.textBackSent && <span className="ml-1.5 text-[12px] text-ink-3">texted back</span>}
                  </td>
                  <td className="tabular-nums text-ink-2">{duration(c.durationSec)}</td>
                  <td className="text-ink-2">{timeAgo(c.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
