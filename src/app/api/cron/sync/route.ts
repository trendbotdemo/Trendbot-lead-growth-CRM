import { isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { syncGoogle } from "@/lib/google";
import { refreshScore } from "@/lib/score";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Run every few hours (Vercel Cron / any scheduler): syncs Google data and snapshots scores. */
export async function GET(req: Request) {
  if (!env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const connected = await db
    .select({ businessId: schema.googleConnections.businessId })
    .from(schema.googleConnections)
    .where(isNotNull(schema.googleConnections.locationName));
  const results: Record<string, unknown> = {};
  for (const c of connected) results[c.businessId] = await syncGoogle(c.businessId);

  const all = await db.select().from(schema.businesses);
  for (const b of all) await refreshScore(b);
  return Response.json({ ok: true, google: results, scored: all.length });
}
