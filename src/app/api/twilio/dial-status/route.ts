import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { readTwilioWebhook, twiml, xmlEscape } from "@/lib/twilio";
import { handleMissedCall } from "@/lib/calls";

export const dynamic = "force-dynamic";

/** Called by Twilio when the forwarded leg ends — decides answered vs missed. */
export async function POST(req: Request) {
  const p = await readTwilioWebhook(req);
  if (!p) return new Response("Invalid signature", { status: 403 });

  const callId = new URL(req.url).searchParams.get("callId");
  if (!callId) return twiml("<Hangup/>");
  const [call] = await db.select().from(schema.calls).where(eq(schema.calls.id, callId)).limit(1);
  if (!call) return twiml("<Hangup/>");

  if (p.DialCallStatus === "completed") {
    await db
      .update(schema.calls)
      .set({ status: "completed", durationSec: Number(p.DialCallDuration ?? 0) || null })
      .where(eq(schema.calls.id, call.id));
    if (call.leadId) {
      await db
        .update(schema.leads)
        .set({ firstResponseAt: new Date() })
        .where(and(eq(schema.leads.id, call.leadId), isNull(schema.leads.firstResponseAt)));
      await db
        .update(schema.leads)
        .set({ status: "contacted" })
        .where(and(eq(schema.leads.id, call.leadId), eq(schema.leads.status, "new")));
    }
    return twiml("<Hangup/>");
  }

  // no-answer, busy, failed, canceled (caller hung up while ringing)
  await handleMissedCall(call.id);
  if (p.DialCallStatus === "canceled") return twiml("<Hangup/>");
  const [business] = await db.select().from(schema.businesses).where(eq(schema.businesses.id, call.businessId)).limit(1);
  const msg = business?.textBackEnabled
    ? "Sorry we missed you. We just sent you a text message, reply there and we will get right back to you."
    : "Sorry we missed you. Please try again shortly.";
  return twiml(`<Say>${xmlEscape(msg)}</Say><Hangup/>`);
}
