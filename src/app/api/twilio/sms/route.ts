import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readTwilioWebhook, twiml } from "@/lib/twilio";
import { findOrCreateLead, notifyOwner, recordMessage } from "@/lib/leads";
import { formatPhone, toE164 } from "@/lib/phone";

export const dynamic = "force-dynamic";

/** Inbound text to a tracking number → lead + conversation thread + owner alert. */
export async function POST(req: Request) {
  const p = await readTwilioWebhook(req);
  if (!p) return new Response("Invalid signature", { status: 403 });

  const to = toE164(p.To) ?? p.To;
  const from = toE164(p.From) ?? p.From;
  const body = (p.Body ?? "").trim();

  const [tn] = await db.select().from(schema.trackingNumbers).where(eq(schema.trackingNumbers.phoneNumber, to)).limit(1);
  if (!tn) return twiml("");
  const [business] = await db.select().from(schema.businesses).where(eq(schema.businesses.id, tn.businessId)).limit(1);
  if (!business) return twiml("");

  // Owner texting their own tracking line shouldn't create a lead.
  if (from === business.forwardToPhone) return twiml("");

  const { lead, created } = await findOrCreateLead({ businessId: business.id, phone: from, source: tn.source, channel: "sms" });
  await recordMessage({ businessId: business.id, leadId: lead.id, direction: "inbound", body: body || "(media message)", fromNumber: from, toNumber: to, twilioSid: p.MessageSid });

  await notifyOwner(business, to, `${created ? "New lead" : "Reply"} from ${formatPhone(from)}: "${body.slice(0, 200)}"`);
  return twiml("");
}
