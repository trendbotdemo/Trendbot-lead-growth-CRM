import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireBusiness } from "@/lib/auth";
import { getBusinessMetrics, leadsPerDay } from "@/lib/metrics";
import { refreshScore } from "@/lib/score";
import { minutesLabel, money, timeAgo } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { DailyBars, ScoreRing, SourceBars } from "@/components/charts";
import { Badge, Empty, PageHeader, Stars, Stat, TextLink, leadStatusTone } from "@/components/ui";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { business } = await requireBusiness(businessId);
  const base = `/b/${business.id}`;

  const [m, daily, score, recentLeads, recentReviews] = await Promise.all([
    getBusinessMetrics(business.id, 30),
    leadsPerDay(business.id, 30),
    refreshScore(business),
    db.select().from(schema.leads).where(eq(schema.leads.businessId, business.id)).orderBy(desc(schema.leads.lastActivityAt)).limit(6),
    db.select().from(schema.reviews).where(eq(schema.reviews.businessId, business.id)).orderBy(desc(schema.reviews.reviewedAt)).limit(3),
  ]);

  const answerRate = m.calls.total ? Math.round((m.calls.answered / m.calls.total) * 100) : null;
  const delta = score.previous !== null ? score.total - score.previous : 0;

  return (
    <>
      <PageHeader title={`Welcome back`} subtitle={`Here's how ${business.name} did in the last 30 days.`} />

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="New leads" value={m.leads.total} hint={m.leads.unresponded ? `${m.leads.unresponded} waiting for a reply` : "Everyone got a reply"} tone={m.leads.unresponded ? "warn" : "good"} />
        <Stat label="Calls answered" value={answerRate === null ? "—" : `${answerRate}%`} hint={`${m.calls.answered} answered · ${m.calls.missed} missed`} tone={answerRate !== null && answerRate < 85 ? "warn" : undefined} />
        <Stat label="Missed calls saved" value={m.calls.recovered} hint={`${m.calls.textedBack} texted back automatically`} tone="good" />
        <Stat label="Revenue tracked" value={money(m.leads.revenueCents)} hint={`${m.leads.won} job${m.leads.won === 1 ? "" : "s"} won · median reply ${minutesLabel(m.leads.medianResponseMin)}`} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="card card-pad">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Growth score</h2>
            {delta !== 0 && <Badge tone={delta > 0 ? "good" : "bad"}>{delta > 0 ? `+${delta}` : delta}</Badge>}
          </div>
          <div className="mt-3 flex justify-center"><ScoreRing score={score.total} /></div>
          <div className="mt-4 space-y-2">
            {score.recommendations.slice(0, 3).map((r) => (
              <div key={r.key} className="flex items-start justify-between gap-2 rounded-lg bg-line-2/60 px-3 py-2">
                <div className="text-[13px]">
                  {r.href ? <Link href={r.href} className="font-medium hover:text-brand">{r.title}</Link> : <span className="font-medium">{r.title}</span>}
                </div>
                <span className="shrink-0 text-[12px] font-medium text-good">+{r.impact}</span>
              </div>
            ))}
          </div>
          <div className="mt-3"><TextLink href={`${base}/score`}>See full breakdown →</TextLink></div>
        </div>

        <div className="card card-pad">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-semibold">Leads per day</h2>
            <span className="text-[13px] text-ink-3">Last 30 days</span>
          </div>
          <DailyBars data={daily} />
          <div className="mt-6 border-t border-line-2 pt-5">
            <h3 className="mb-3 text-[13px] font-semibold">Where leads came from</h3>
            {m.leads.bySource.length ? <SourceBars rows={m.leads.bySource} /> : <p className="text-ink-3">No leads yet — add a tracking number and the website form in Settings.</p>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="font-semibold">Recent leads</h2>
            <TextLink href={`${base}/leads`}>All leads →</TextLink>
          </div>
          {recentLeads.length === 0 ? <Empty title="No leads yet" /> : (
            <ul className="divide-y divide-line-2">
              {recentLeads.map((l) => (
                <li key={l.id}>
                  <Link href={`${base}/leads/${l.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-line-2/50">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{l.name || formatPhone(l.phone) || l.email}</div>
                      <div className="text-[12px] text-ink-3">{l.source} · {timeAgo(l.lastActivityAt)}</div>
                    </div>
                    <Badge tone={leadStatusTone[l.status]}>{l.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="font-semibold">
              Reviews {m.reviews.avgRating && <span className="ml-1 font-normal text-ink-2">{m.reviews.avgRating.toFixed(1)}★ · {m.reviews.total}</span>}
            </h2>
            <TextLink href={`${base}/reviews`}>All reviews →</TextLink>
          </div>
          {recentReviews.length === 0 ? (
            <Empty title="No reviews synced" body="Connect Google Business Profile to pull in reviews." action={<Link href={`${base}/settings#google`} className="btn-ghost">Connect Google</Link>} />
          ) : (
            <ul className="divide-y divide-line-2">
              {recentReviews.map((r) => (
                <li key={r.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.reviewerName}</span>
                    <Stars rating={r.rating} />
                  </div>
                  {r.comment && <p className="mt-1 line-clamp-2 text-[13px] text-ink-2">{r.comment}</p>}
                  <div className="mt-1.5 text-[12px] text-ink-3">
                    {timeAgo(r.reviewedAt)} · {r.replyComment ? <span className="text-good">Replied</span> : <Link href={`${base}/reviews?filter=unreplied`} className="text-warn">Needs reply</Link>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
