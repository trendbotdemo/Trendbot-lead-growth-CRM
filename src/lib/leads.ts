import "server-only";
import { and, desc, eq, gte, notInArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { features } from "./env";
import { sendSms } from "./twilio";

type Channel = (typeof schema.leadChannel.enumValues)[number];

/**
 * Sends an SMS. Without Twilio credentials (local dev) it logs a dry run instead,
 * so the rest of the flow — messages, leads, timelines — can still be exercised.
 */
export async function deliverSms(from: string, to: string, body: string): Promise<string | null> {
  if (!features.twilio) {
    console.info(`[sms:dry-run] ${from} → ${to}: ${body}`);
    return null;
  }
  return sendSms(from, to, body);
}

/** Re-uses an open lead from the same phone/email in the last 30 days, otherwise creates one. */
export async function findOrCreateLead(input: {
  businessId: string;
  phone?: string | null;
  email?: string | null;
  name?: string | null;
  source: string;
  channel: Channel;
}) {
  const since = new Date(Date.now() - 30 * 86400_000);
  const match = input.phone
    ? eq(schema.leads.phone, input.phone)
    : input.email
      ? eq(schema.leads.email, input.email.toLowerCase())
      : null;

  if (match) {
    const [existing] = await db
      .select()
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.businessId, input.businessId),
          match,
          gte(schema.leads.createdAt, since),
          notInArray(schema.leads.status, ["won", "lost"]),
        ),
      )
      .orderBy(desc(schema.leads.createdAt))
      .limit(1);
    if (existing) {
      const [updated] = await db
        .update(schema.leads)
        .set({
          lastActivityAt: new Date(),
          name: existing.name ?? input.name ?? null,
          email: existing.email ?? input.email?.toLowerCase() ?? null,
          phone: existing.phone ?? input.phone ?? null,
        })
        .where(eq(schema.leads.id, existing.id))
        .returning();
      return { lead: updated, created: false };
    }
  }

  const [lead] = await db
    .insert(schema.leads)
    .values({
      businessId: input.businessId,
      phone: input.phone ?? null,
      email: input.email?.toLowerCase() ?? null,
      name: input.name ?? null,
      source: input.source,
      channel: input.channel,
    })
    .returning();
  return { lead, created: true };
}

export async function recordMessage(values: typeof schema.messages.$inferInsert) {
  const [msg] = await db.insert(schema.messages).values(values).returning();
  await db.update(schema.leads).set({ lastActivityAt: new Date() }).where(eq(schema.leads.id, values.leadId));
  if (values.direction === "outbound") {
    // First human-or-automated touch counts toward speed-to-lead.
    await db
      .update(schema.leads)
      .set({ firstResponseAt: new Date() })
      .where(and(eq(schema.leads.id, values.leadId), isNull(schema.leads.firstResponseAt)));
  }
  return msg;
}

/** The number a lead should be texted from: the tracking line they reached, else the business's first active line. */
export async function senderNumberFor(businessId: string, leadId?: string) {
  if (leadId) {
    const [lastInbound] = await db
      .select({ to: schema.messages.toNumber })
      .from(schema.messages)
      .where(and(eq(schema.messages.leadId, leadId), eq(schema.messages.direction, "inbound")))
      .orderBy(desc(schema.messages.createdAt))
      .limit(1);
    if (lastInbound?.to) return lastInbound.to;
    const [lastCall] = await db
      .select({ to: schema.calls.toNumber })
      .from(schema.calls)
      .where(eq(schema.calls.leadId, leadId))
      .orderBy(desc(schema.calls.startedAt))
      .limit(1);
    if (lastCall?.to) return lastCall.to;
  }
  const [tn] = await db
    .select()
    .from(schema.trackingNumbers)
    .where(and(eq(schema.trackingNumbers.businessId, businessId), eq(schema.trackingNumbers.active, true)))
    .orderBy(schema.trackingNumbers.createdAt)
    .limit(1);
  return tn?.phoneNumber ?? null;
}

/** Short SMS alert to the owner's real phone so no lead sits unseen. */
export async function notifyOwner(business: schema.Business, from: string | null, text: string) {
  if (!business.notifyOwnerBySms || !business.forwardToPhone) return;
  const sender = from ?? (await senderNumberFor(business.id));
  if (!sender) return;
  try {
    await deliverSms(sender, business.forwardToPhone, `TrendBot: ${text}`.slice(0, 600));
  } catch (err) {
    console.error("owner notification failed", err);
  }
}
