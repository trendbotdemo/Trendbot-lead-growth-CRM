import "server-only";
import twilio from "twilio";
import { env, features } from "./env";

let client: ReturnType<typeof twilio> | null = null;

export function twilioClient() {
  if (!features.twilio) throw new Error("Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).");
  client ??= twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!);
  return client;
}

/** Parses a Twilio webhook and verifies its X-Twilio-Signature against the public URL. */
export async function readTwilioWebhook(req: Request): Promise<Record<string, string> | null> {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = String(v)));

  if (env.TWILIO_VALIDATE_SIGNATURE === "false") return params;
  if (!env.TWILIO_AUTH_TOKEN) return null;

  const incoming = new URL(req.url);
  const publicUrl = `${env.APP_URL.replace(/\/$/, "")}${incoming.pathname}${incoming.search}`;
  const signature = req.headers.get("x-twilio-signature") ?? "";
  return twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, publicUrl, params) ? params : null;
}

export function twiml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { "Content-Type": "text/xml" },
  });
}

export function xmlEscape(s: string) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

export async function sendSms(from: string, to: string, body: string) {
  const msg = await twilioClient().messages.create({ from, to, body });
  return msg.sid;
}

export function webhookUrls() {
  const base = env.APP_URL.replace(/\/$/, "");
  return { voiceUrl: `${base}/api/twilio/voice`, smsUrl: `${base}/api/twilio/sms` };
}

/** Buys a local number in the given area code and points its webhooks at this app. */
export async function provisionLocalNumber(areaCode: string, friendlyName: string) {
  const c = twilioClient();
  const available = await c.availablePhoneNumbers("US").local.list({ areaCode: Number(areaCode), smsEnabled: true, voiceEnabled: true, limit: 1 });
  if (!available.length) throw new Error(`No numbers available in area code ${areaCode}. Try a nearby one.`);
  const { voiceUrl, smsUrl } = webhookUrls();
  const bought = await c.incomingPhoneNumbers.create({
    phoneNumber: available[0].phoneNumber,
    friendlyName,
    voiceUrl,
    voiceMethod: "POST",
    smsUrl,
    smsMethod: "POST",
  });
  return { phoneNumber: bought.phoneNumber, sid: bought.sid };
}

/** Points an existing Twilio number (already in the account) at this app. */
export async function attachExistingNumber(phoneNumber: string) {
  const c = twilioClient();
  const [found] = await c.incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
  if (!found) throw new Error("That number isn't in your Twilio account.");
  const { voiceUrl, smsUrl } = webhookUrls();
  await c.incomingPhoneNumbers(found.sid).update({ voiceUrl, voiceMethod: "POST", smsUrl, smsMethod: "POST" });
  return { phoneNumber: found.phoneNumber, sid: found.sid };
}
