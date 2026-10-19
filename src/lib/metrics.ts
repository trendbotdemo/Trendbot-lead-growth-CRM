import "server-only";
import { and, avg, count, desc, eq, gte, isNull, sql, sum } from "drizzle-orm";
import { db, schema } from "@/db";

export type BusinessMetrics = Awaited<ReturnType<typeof getBusinessMetrics>>;

export async function getBusinessMetrics(businessId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400_000);
  const L = schema.leads;
  const C = schema.calls;
  const R = schema.reviews;

  const [leadAgg] = await db
    .select({
      total: count(),
      won: sql<number>`count(*) filter (where ${L.status} = 'won')`.mapWith(Number),
      revenueCents: sum(sql`case when ${L.status} = 'won' then ${L.valueCents} else 0 end`).mapWith(Number),
      medianResponseMin: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from (${L.firstResponseAt} - ${L.createdAt})) / 60) filter (where ${L.firstResponseAt} is not null)`.mapWith(
        (v) => (v === null ? null : Number(v)),
      ),
      unresponded: sql<number>`count(*) filter (where ${L.firstResponseAt} is null and ${L.status} = 'new')`.mapWith(Number),
    })
    .from(L)
    .where(and(eq(L.businessId, businessId), gte(L.createdAt, since)));

  const bySource = await db
    .select({ source: L.source, leads: count(), revenueCents: sum(sql`case when ${L.status} = 'won' then ${L.valueCents} else 0 end`).mapWith(Number) })
    .from(L)
    .where(and(eq(L.businessId, businessId), gte(L.createdAt, since)))
    .groupBy(L.source)
    .orderBy(desc(count()));

  const [callAgg] = await db
    .select({
      total: count(),
      answered: sql<number>`count(*) filter (where ${C.status} = 'completed')`.mapWith(Number),
      missed: sql<number>`count(*) filter (where ${C.status} = 'missed')`.mapWith(Number),
      textedBack: sql<number>`count(*) filter (where ${C.textBackSent})`.mapWith(Number),
      // a missed call is "recovered" when the caller replied to the text-back
      recovered: sql<number>`count(*) filter (where ${C.status} = 'missed' and exists (
        select 1 from ${schema.messages} m where m.lead_id = ${C.leadId} and m.direction = 'inbound' and m.created_at > ${C.startedAt}))`.mapWith(Number),
    })
    .from(C)
    .where(and(eq(C.businessId, businessId), gte(C.startedAt, since)));

  const [reviewAll] = await db
    .select({
      total: count(),
      avgRating: avg(R.rating).mapWith((v) => (v === null ? null : Number(v))),
      replied: sql<number>`count(*) filter (where ${R.replyComment} is not null)`.mapWith(Number),
      lastReviewAt: sql<Date | null>`max(${R.reviewedAt})`.mapWith((v) => (v ? new Date(v) : null)),
    })
    .from(R)
    .where(eq(R.businessId, businessId));

  const [reviewRecent] = await db
    .select({ total: count() })
    .from(R)
    .where(and(eq(R.businessId, businessId), gte(R.reviewedAt, since)));

  const [unreplied] = await db
    .select({ total: count() })
    .from(R)
    .where(and(eq(R.businessId, businessId), isNull(R.replyComment)));

  return {
    days,
    leads: {
      total: leadAgg.total,
      won: leadAgg.won,
      revenueCents: leadAgg.revenueCents ?? 0,
      medianResponseMin: leadAgg.medianResponseMin,
      unresponded: leadAgg.unresponded,
      bySource,
    },
    calls: callAgg,
    reviews: {
      total: reviewAll.total,
      avgRating: reviewAll.avgRating,
      responseRate: reviewAll.total ? reviewAll.replied / reviewAll.total : null,
      lastReviewAt: reviewAll.lastReviewAt,
      recent: reviewRecent.total,
      unreplied: unreplied.total,
    },
  };
}

/** Leads per day for the sparkline/bar chart. */
export async function leadsPerDay(businessId: string, days = 30) {
  const rows = await db.execute<{ day: string; leads: number }>(sql`
    select to_char(d.day, 'YYYY-MM-DD') as day, count(l.id)::int as leads
    from generate_series(current_date - ${days - 1}::int, current_date, interval '1 day') as d(day)
    left join ${schema.leads} l on l.business_id = ${businessId} and l.created_at::date = d.day::date
    group by d.day order by d.day`);
  return rows.map((r) => ({ day: r.day, leads: Number(r.leads) }));
}

export async function hasActiveTrackingNumber(businessId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(schema.trackingNumbers)
    .where(and(eq(schema.trackingNumbers.businessId, businessId), eq(schema.trackingNumbers.active, true)));
  return row.n > 0;
}

