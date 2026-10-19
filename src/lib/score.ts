import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ScoreCategory, ScoreRecommendation } from "@/db/schema";
import { getConnection } from "./google";
import { getBusinessMetrics, hasActiveTrackingNumber } from "./metrics";

/**
 * Growth Score (0–100). Weighted toward the things that actually turn into booked jobs:
 * a complete Google profile, strong + fresh reviews, capturing every lead, and replying fast.
 */
export async function computeScore(business: schema.Business) {
  const [conn, metrics, tracking] = await Promise.all([
    getConnection(business.id),
    getBusinessMetrics(business.id, 30),
    hasActiveTrackingNumber(business.id),
  ]);
  const base = `/b/${business.id}`;
  const recs: ScoreRecommendation[] = [];
  const add = (r: ScoreRecommendation) => r.impact > 0 && recs.push(r);

  /* Google profile — 25 */
  let profile = 0;
  const p = conn?.profileSnapshot;
  if (!conn?.locationName) {
    add({ key: "gbp-connect", title: "Connect Google Business Profile", detail: "Most local customers find you on Google Maps. Connect it to track reviews and profile health.", impact: 25, href: `${base}/settings#google` });
  } else {
    profile += 5;
    const checks: [boolean, number, string, string][] = [
      [Boolean(p?.primaryCategory), 4, "Set a primary category", "Your category is the #1 signal Google uses to decide which searches you show up for."],
      [Boolean(p?.phone), 3, "Add a phone number to Google", "Customers can't call you straight from Maps without it."],
      [Boolean(p?.website), 3, "Add your website to Google", "A website link builds trust and sends visitors to your booking page."],
      [Boolean(p?.address), 3, "Add your service address / area", "Needed to rank in the local map pack."],
      [Boolean(p?.hasHours), 4, "Add business hours", "Profiles without hours get fewer calls and can be flagged as closed."],
      [(p?.description?.length ?? 0) >= 250, 3, "Write a full business description", "Use 250+ characters describing your services and the cities you cover."],
    ];
    for (const [ok, pts, title, detail] of checks) {
      if (ok) profile += pts;
      else add({ key: title, title, detail, impact: pts, href: `${base}/settings#google` });
    }
  }

  /* Reviews — 30 */
  const rv = metrics.reviews;
  let reviewPts = Math.round(Math.min(rv.total / 50, 1) * 10);
  if (rv.total < 50) add({ key: "review-count", title: `Get to 50 reviews (you have ${rv.total})`, detail: "Ask every happy customer. Businesses with 50+ reviews win far more of the map pack.", impact: 10 - reviewPts });
  const r = rv.avgRating;
  const ratingPts = r === null ? 0 : r >= 4.7 ? 8 : r >= 4.5 ? 6 : r >= 4.0 ? 4 : 2;
  reviewPts += ratingPts;
  if (ratingPts < 8) add({ key: "rating", title: r === null ? "Get your first reviews" : `Raise your rating above 4.7 (now ${r.toFixed(1)})`, detail: "Most customers filter for 4.5★ and up. Fresh 5★ reviews lift the average quickly.", impact: 8 - ratingPts });
  const daysSince = rv.lastReviewAt ? (Date.now() - rv.lastReviewAt.getTime()) / 86400_000 : Infinity;
  const recencyPts = daysSince <= 30 ? 6 : daysSince <= 90 ? 3 : 0;
  reviewPts += recencyPts;
  if (recencyPts < 6) add({ key: "recency", title: "Get a new review this month", detail: "Google and customers both favour businesses with recent reviews.", impact: 6 - recencyPts });
  const respPts = rv.responseRate === null ? 0 : Math.round(rv.responseRate * 6);
  reviewPts += respPts;
  if (rv.unreplied > 0) add({ key: "reply", title: `Reply to ${rv.unreplied} review${rv.unreplied === 1 ? "" : "s"}`, detail: "Replying shows customers you care. AI drafts the reply for you in one click.", impact: Math.max(1, 6 - respPts), href: `${base}/reviews?filter=unreplied` });

  /* Lead capture — 25 */
  let capture = 0;
  if (business.forwardToPhone) capture += 4;
  else add({ key: "forward", title: "Set the owner's forwarding phone", detail: "Tracked calls ring through to this number.", impact: 4, href: `${base}/settings#calls` });
  if (tracking) capture += 8;
  else add({ key: "tracking", title: "Add a tracking phone number", detail: "See exactly which calls come from Google, your website and ads — and catch every missed call.", impact: 8, href: `${base}/settings#calls` });
  if (tracking && business.textBackEnabled) capture += 7;
  else add({ key: "textback", title: "Turn on missed-call text-back", detail: "Texts every missed caller within seconds so they don't call your competitor next.", impact: 7, href: `${base}/settings#calls` });
  const formLive = business.formLastSeenAt && Date.now() - business.formLastSeenAt.getTime() < 30 * 86400_000;
  if (formLive) capture += 6;
  else add({ key: "form", title: "Install the lead form on your website", detail: "Form leads land in your inbox and get an instant text reply.", impact: 6, href: `${base}/settings#form` });

  /* Speed to lead — 20 */
  let speed = 0;
  const med = metrics.leads.medianResponseMin;
  const medPts = metrics.leads.total === 0 ? 6 : med === null ? 0 : med < 5 ? 12 : med < 30 ? 8 : med < 120 ? 4 : 0;
  speed += medPts;
  if (medPts < 12 && metrics.leads.total > 0) add({ key: "speed", title: "Reply to new leads within 5 minutes", detail: "The first business to respond wins most local jobs. Text-back and instant form replies make this automatic.", impact: 12 - medPts, href: `${base}/leads` });
  const calls = metrics.calls;
  const missRate = calls.total ? calls.missed / calls.total : null;
  const missPts = missRate === null ? 4 : missRate <= 0.1 ? 8 : missRate <= 0.25 ? 5 : 2;
  speed += missPts;
  if (missRate !== null && missRate > 0.1) add({ key: "missed", title: `You missed ${Math.round(missRate * 100)}% of calls`, detail: "Every missed call is a job at risk. Consider an AI receptionist to answer 24/7.", impact: 8 - missPts, href: `${base}/calls` });

  const categories: ScoreCategory[] = [
    { key: "profile", label: "Google profile", score: profile, max: 25 },
    { key: "reviews", label: "Reviews", score: reviewPts, max: 30 },
    { key: "capture", label: "Lead capture", score: capture, max: 25 },
    { key: "speed", label: "Speed to lead", score: speed, max: 20 },
  ];
  const total = categories.reduce((s, c) => s + c.score, 0);
  recs.sort((a, b) => b.impact - a.impact);
  return { total, categories, recommendations: recs };
}

/** Computes the score and stores a snapshot (at most one per 6h unless forced). */
export async function refreshScore(business: schema.Business, force = false) {
  const [latest] = await db
    .select()
    .from(schema.scoreSnapshots)
    .where(eq(schema.scoreSnapshots.businessId, business.id))
    .orderBy(desc(schema.scoreSnapshots.createdAt))
    .limit(1);
  const result = await computeScore(business);
  if (force || !latest || Date.now() - latest.createdAt.getTime() > 6 * 3600_000) {
    await db.insert(schema.scoreSnapshots).values({ businessId: business.id, ...result });
  }
  return { ...result, previous: latest?.total ?? null };
}
