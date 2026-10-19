import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { fillTemplate } from "@/lib/format";
import { deliverSms, findOrCreateLead, notifyOwner, recordMessage, senderNumberFor } from "@/lib/leads";
import { toE164 } from "@/lib/phone";

export const dynamic = "force-dynamic";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const Body = z.object({
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional(),
  source: z.string().trim().max(60).optional(),
  website: z.string().optional(), // honeypot — real users never fill it
});

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

/** Public endpoint behind the embeddable website form. */
export async function POST(req: Request, ctx: { params: Promise<{ formKey: string }> }) {
  const { formKey } = await ctx.params;
  const [business] = await db.select().from(schema.businesses).where(eq(schema.businesses.formKey, formKey)).limit(1);
  if (!business) return Response.json({ ok: false, error: "Unknown form" }, { status: 404, headers: cors });

  const raw =
    req.headers.get("content-type")?.includes("application/json")
      ? await req.json().catch(() => ({}))
      : Object.fromEntries((await req.formData()).entries());
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return Response.json({ ok: false, error: "Please check the form fields." }, { status: 400, headers: cors });
  const f = parsed.data;

  await db.update(schema.businesses).set({ formLastSeenAt: new Date() }).where(eq(schema.businesses.id, business.id));
  if (f.website) return Response.json({ ok: true }, { headers: cors }); // bot

  const phone = toE164(f.phone);
  const email = f.email || null;
  if (!phone && !email) return Response.json({ ok: false, error: "Please add a phone number or email." }, { status: 400, headers: cors });

  const { lead } = await findOrCreateLead({
    businessId: business.id,
    phone,
    email,
    name: f.name || null,
    source: f.source || "Website form",
    channel: "form",
  });
  await recordMessage({
    businessId: business.id,
    leadId: lead.id,
    direction: "inbound",
    body: f.message || "(form submitted without a message)",
  });

  // Instant text reply — speed to lead.
  const sender = await senderNumberFor(business.id);
  if (phone && sender && business.textBackEnabled) {
    const body = fillTemplate(business.formAutoReplyMessage, { name: f.name?.split(" ")[0], business: business.name });
    try {
      const sid = await deliverSms(sender, phone, body);
      await recordMessage({ businessId: business.id, leadId: lead.id, direction: "outbound", body, fromNumber: sender, toNumber: phone, twilioSid: sid, automated: true });
      await db.update(schema.leads).set({ status: "contacted" }).where(eq(schema.leads.id, lead.id));
    } catch (err) {
      console.error("form auto-reply failed", err);
    }
  }

  await notifyOwner(business, sender, `New website lead: ${f.name || "someone"} ${phone ?? email ?? ""} — "${(f.message ?? "").slice(0, 160)}"`);

  const wantsHtml = req.headers.get("accept")?.includes("text/html") && !req.headers.get("content-type")?.includes("json");
  if (wantsHtml) {
    return new Response(
      `<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;padding:40px;text-align:center"><h2>Thanks! We got your request.</h2><p>${business.name.replace(/[<>&"']/g, "")} will be in touch shortly.</p></body>`,
      { headers: { "Content-Type": "text/html", ...cors } },
    );
  }
  return Response.json({ ok: true }, { headers: cors });
}
