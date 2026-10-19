import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { fillTemplate } from "./format";
import { formatPhone } from "./phone";
import { deliverSms, findOrCreateLead, notifyOwner, recordMessage } from "./leads";

/** Marks a call missed, texts the caller back (once), and alerts the owner. */
export async function handleMissedCall(callId: string) {
  const [call] = await db.select().from(schema.calls).where(eq(schema.calls.id, callId)).limit(1);
  if (!call || call.textBackSent) return;
  const [business] = await db.select().from(schema.businesses).where(eq(schema.businesses.id, call.businessId)).limit(1);
  if (!business) return;

  await db.update(schema.calls).set({ status: "missed" }).where(eq(schema.calls.id, call.id));

  // Skip text-back for anonymous / non-textable callers.
  const textable = /^\+\d{10,15}$/.test(call.fromNumber);
  const leadId = call.leadId;

  if (business.textBackEnabled && textable && leadId) {
    const body = fillTemplate(business.textBackMessage, { business: business.name, name: null });
    try {
      const sid = await deliverSms(call.toNumber, call.fromNumber, body);
      await recordMessage({
        businessId: business.id,
        leadId,
        direction: "outbound",
        body,
        fromNumber: call.toNumber,
        toNumber: call.fromNumber,
        twilioSid: sid,
        automated: true,
      });
      await db.update(schema.calls).set({ textBackSent: true }).where(eq(schema.calls.id, call.id));
      await db.update(schema.leads).set({ status: "contacted" }).where(eq(schema.leads.id, leadId));
    } catch (err) {
      console.error("text-back failed", err);
    }
  }

  await notifyOwner(
    business,
    call.toNumber,
    `Missed call from ${formatPhone(call.fromNumber)} (${call.source}).${business.textBackEnabled && textable ? " We texted them back automatically." : ""}`,
  );
}

/** Creates the call row and its lead when a tracked number rings. */
export async function startTrackedCall(params: { callSid: string; from: string; to: string }) {
  const [tn] = await db.select().from(schema.trackingNumbers).where(eq(schema.trackingNumbers.phoneNumber, params.to)).limit(1);
  if (!tn || !tn.active) return null;
  const [business] = await db.select().from(schema.businesses).where(eq(schema.businesses.id, tn.businessId)).limit(1);
  if (!business) return null;

  const textable = /^\+\d{10,15}$/.test(params.from);
  const { lead } = await findOrCreateLead({
    businessId: business.id,
    phone: textable ? params.from : null,
    source: tn.source,
    channel: "call",
  });

  const [call] = await db
    .insert(schema.calls)
    .values({
      businessId: business.id,
      trackingNumberId: tn.id,
      leadId: lead.id,
      twilioCallSid: params.callSid,
      fromNumber: params.from,
      toNumber: params.to,
      source: tn.source,
    })
    .onConflictDoNothing({ target: schema.calls.twilioCallSid })
    .returning();

  return { business, call: call ?? null };
}
