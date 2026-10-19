import { readTwilioWebhook, twiml, xmlEscape } from "@/lib/twilio";
import { handleMissedCall, startTrackedCall } from "@/lib/calls";
import { toE164 } from "@/lib/phone";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Incoming call on a tracking number → log it, then ring the owner's real phone. */
export async function POST(req: Request) {
  const p = await readTwilioWebhook(req);
  if (!p) return new Response("Invalid signature", { status: 403 });

  const to = toE164(p.To) ?? p.To;
  const from = toE164(p.From) ?? p.From ?? "anonymous";
  const started = await startTrackedCall({ callSid: p.CallSid, from, to });
  if (!started?.call) {
    return twiml(`<Say>Sorry, this number is not in service.</Say><Hangup/>`);
  }
  const { business, call } = started;

  if (!business.forwardToPhone) {
    await handleMissedCall(call.id);
    return twiml(
      `<Say>Thanks for calling ${xmlEscape(business.name)}. We can't take your call right now, but we've just sent you a text message so we can help you.</Say><Hangup/>`,
    );
  }

  const action = `${env.APP_URL.replace(/\/$/, "")}/api/twilio/dial-status?callId=${call.id}`;
  return twiml(
    `<Dial timeout="20" answerOnBridge="true" action="${xmlEscape(action)}" method="POST">${xmlEscape(business.forwardToPhone)}</Dial>`,
  );
}
