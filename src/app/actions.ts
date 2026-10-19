"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionState } from "@/components/forms";
import {
  createSession,
  destroySession,
  hashPassword,
  isAgencyUser,
  requireAgencyUser,
  requireBusiness,
  verifyPassword,
} from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { env, features } from "@/lib/env";
import { draftReviewReply } from "@/lib/ai";
import { getConnection, postReviewReply, selectLocation, syncGoogle } from "@/lib/google";
import { deliverSms, recordMessage, senderNumberFor } from "@/lib/leads";
import { toE164 } from "@/lib/phone";
import { refreshScore } from "@/lib/score";
import { attachExistingNumber, provisionLocalNumber } from "@/lib/twilio";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const opt = (v: FormDataEntryValue | null) => str(v) || null;
const fail = (error: string): ActionState => ({ error });

/* ── Auth ────────────────────────────────────────────────── */

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const email = str(form.get("email")).toLowerCase();
  const password = str(form.get("password"));
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) return fail("Wrong email or password.");
  await createSession(user.id);
  redirect("/");
}

export async function signupAction(_: ActionState, form: FormData): Promise<ActionState> {
  const [{ n }] = await db.select({ n: count() }).from(schema.users);
  if (n > 0 && env.ALLOW_SIGNUP !== "true") return fail("Sign-up is closed. Ask your agency admin for a login.");
  const parsed = z
    .object({
      agency: z.string().min(2, "Agency name is required"),
      name: z.string().min(2, "Your name is required"),
      email: z.string().email("Enter a valid email"),
      password: z.string().min(8, "Password must be at least 8 characters"),
    })
    .safeParse({ agency: str(form.get("agency")), name: str(form.get("name")), email: str(form.get("email")).toLowerCase(), password: str(form.get("password")) });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const d = parsed.data;
  const [exists] = await db.select().from(schema.users).where(eq(schema.users.email, d.email)).limit(1);
  if (exists) return fail("That email already has an account.");

  const [agency] = await db.insert(schema.agencies).values({ name: d.agency }).returning();
  const [user] = await db
    .insert(schema.users)
    .values({ agencyId: agency.id, name: d.name, email: d.email, passwordHash: await hashPassword(d.password), role: "agency_owner" })
    .returning();
  await createSession(user.id);
  redirect("/agency");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

/* ── Agency: clients ─────────────────────────────────────── */

export async function createBusinessAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireAgencyUser();
  const name = str(form.get("name"));
  if (name.length < 2) return fail("Business name is required.");
  const forward = opt(form.get("forwardToPhone"));
  if (forward && !toE164(forward)) return fail("Owner phone doesn't look like a valid number.");
  const [b] = await db
    .insert(schema.businesses)
    .values({
      agencyId: user.agencyId,
      name,
      category: opt(form.get("category")),
      phone: toE164(opt(form.get("phone"))) ?? opt(form.get("phone")),
      website: opt(form.get("website")),
      city: opt(form.get("city")),
      state: opt(form.get("state")),
      zip: opt(form.get("zip")),
      forwardToPhone: toE164(forward),
      timezone: str(form.get("timezone")) || "America/New_York",
      formKey: randomToken(12),
    })
    .returning();
  redirect(`/b/${b.id}/settings?created=1`);
}

/* ── Business settings ───────────────────────────────────── */

export async function updateBusinessAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { business } = await requireBusiness(str(form.get("businessId")));
  const name = str(form.get("name"));
  if (name.length < 2) return fail("Business name is required.");
  await db
    .update(schema.businesses)
    .set({
      name,
      category: opt(form.get("category")),
      phone: toE164(opt(form.get("phone"))) ?? opt(form.get("phone")),
      email: opt(form.get("email")),
      website: opt(form.get("website")),
      address: opt(form.get("address")),
      city: opt(form.get("city")),
      state: opt(form.get("state")),
      zip: opt(form.get("zip")),
      timezone: str(form.get("timezone")) || business.timezone,
      replyTone: str(form.get("replyTone")) || business.replyTone,
    })
    .where(eq(schema.businesses.id, business.id));
  revalidatePath(`/b/${business.id}`, "layout");
  return { ok: true, message: "Saved." };
}

export async function updateAutomationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { business } = await requireBusiness(str(form.get("businessId")));
  const forward = opt(form.get("forwardToPhone"));
  if (forward && !toE164(forward)) return fail("Forwarding phone doesn't look like a valid number.");
  const textBack = str(form.get("textBackMessage"));
  const formReply = str(form.get("formAutoReplyMessage"));
  if (textBack.length < 10 || formReply.length < 10) return fail("Messages need to be at least 10 characters.");
  if (textBack.length > 320 || formReply.length > 320) return fail("Keep messages under 320 characters (2 SMS segments).");
  await db
    .update(schema.businesses)
    .set({
      forwardToPhone: toE164(forward),
      textBackEnabled: form.get("textBackEnabled") === "on",
      notifyOwnerBySms: form.get("notifyOwnerBySms") === "on",
      textBackMessage: textBack,
      formAutoReplyMessage: formReply,
    })
    .where(eq(schema.businesses.id, business.id));
  revalidatePath(`/b/${business.id}`, "layout");
  return { ok: true, message: "Saved." };
}

export async function addTrackingNumberAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { user, business } = await requireBusiness(str(form.get("businessId")));
  if (!isAgencyUser(user)) return fail("Only your agency can add tracking numbers.");
  const source = str(form.get("source")) || "Google Business Profile";
  const mode = str(form.get("mode"));
  try {
    let phoneNumber: string;
    let sid: string | null = null;
    if (mode === "buy") {
      const area = str(form.get("areaCode"));
      if (!/^\d{3}$/.test(area)) return fail("Enter a 3-digit area code.");
      const r = await provisionLocalNumber(area, `${business.name} · ${source}`);
      phoneNumber = r.phoneNumber;
      sid = r.sid;
    } else {
      const n = toE164(str(form.get("phoneNumber")));
      if (!n) return fail("Enter a valid phone number.");
      if (features.twilio) {
        const r = await attachExistingNumber(n);
        phoneNumber = r.phoneNumber;
        sid = r.sid;
      } else {
        phoneNumber = n; // local/dev: register without Twilio
      }
    }
    await db.insert(schema.trackingNumbers).values({ businessId: business.id, phoneNumber, source, twilioSid: sid });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Couldn't add the number.";
    return fail(msg.includes("duplicate") ? "That number is already in use." : msg);
  }
  revalidatePath(`/b/${business.id}`, "layout");
  return { ok: true, message: "Tracking number added." };
}

export async function toggleTrackingNumberAction(form: FormData) {
  const { user, business } = await requireBusiness(str(form.get("businessId")));
  if (!isAgencyUser(user)) return;
  const id = str(form.get("id"));
  const [tn] = await db
    .select()
    .from(schema.trackingNumbers)
    .where(and(eq(schema.trackingNumbers.id, id), eq(schema.trackingNumbers.businessId, business.id)))
    .limit(1);
  if (!tn) return;
  await db.update(schema.trackingNumbers).set({ active: !tn.active }).where(eq(schema.trackingNumbers.id, tn.id));
  revalidatePath(`/b/${business.id}`, "layout");
}

/* ── Google ──────────────────────────────────────────────── */

export async function chooseGoogleLocationAction(form: FormData) {
  const { business } = await requireBusiness(str(form.get("businessId")));
  const [accountName, locationName, title] = str(form.get("location")).split("|");
  if (!accountName || !locationName) return;
  await selectLocation(business.id, accountName, locationName, title ?? locationName);
  await syncGoogle(business.id);
  await refreshScore(business, true);
  redirect(`/b/${business.id}/settings?google=connected#google`);
}

export async function syncGoogleAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { business } = await requireBusiness(str(form.get("businessId")));
  const r = await syncGoogle(business.id);
  if (!r.synced) return fail(r.reason ?? "Sync failed.");
  await refreshScore(business, true);
  revalidatePath(`/b/${business.id}`, "layout");
  return { ok: true, message: `Synced ${r.reviews} reviews.` };
}

export async function disconnectGoogleAction(form: FormData) {
  const { business } = await requireBusiness(str(form.get("businessId")));
  await db.delete(schema.googleConnections).where(eq(schema.googleConnections.businessId, business.id));
  revalidatePath(`/b/${business.id}`, "layout");
}

/* ── Reviews ─────────────────────────────────────────────── */

async function loadReview(businessId: string, reviewId: string) {
  const [review] = await db
    .select()
    .from(schema.reviews)
    .where(and(eq(schema.reviews.id, reviewId), eq(schema.reviews.businessId, businessId)))
    .limit(1);
  return review ?? null;
}

export async function draftReplyAction(form: FormData) {
  const { business } = await requireBusiness(str(form.get("businessId")));
  const review = await loadReview(business.id, str(form.get("reviewId")));
  if (!review) return;
  const draft = await draftReviewReply(business, review);
  await db.update(schema.reviews).set({ aiDraft: draft }).where(eq(schema.reviews.id, review.id));
  revalidatePath(`/b/${business.id}/reviews`);
}

export async function postReplyAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { business } = await requireBusiness(str(form.get("businessId")));
  const review = await loadReview(business.id, str(form.get("reviewId")));
  if (!review) return fail("Review not found.");
  const comment = str(form.get("comment"));
  if (comment.length < 2) return fail("Write a reply first.");
  if (comment.length > 4000) return fail("Google replies are limited to 4,000 characters.");

  const conn = await getConnection(business.id);
  if (review.source === "google" && conn?.locationName) {
    try {
      await postReviewReply(business.id, review.externalId, comment);
    } catch (err) {
      return fail(err instanceof Error ? err.message : "Google rejected the reply.");
    }
  }
  await db.update(schema.reviews).set({ replyComment: comment, repliedAt: new Date(), aiDraft: null }).where(eq(schema.reviews.id, review.id));
  revalidatePath(`/b/${business.id}`, "layout");
  return { ok: true, message: conn?.locationName ? "Reply posted to Google." : "Reply saved (connect Google to publish replies)." };
}

/* ── Leads ───────────────────────────────────────────────── */

export async function updateLeadAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { business } = await requireBusiness(str(form.get("businessId")));
  const leadId = str(form.get("leadId"));
  const status = str(form.get("status")) as (typeof schema.leadStatus.enumValues)[number];
  if (!schema.leadStatus.enumValues.includes(status)) return fail("Invalid status.");
  const valueRaw = str(form.get("value")).replace(/[$,]/g, "");
  const value = valueRaw ? Math.round(Number(valueRaw) * 100) : null;
  if (value !== null && (!Number.isFinite(value) || value < 0)) return fail("Job value must be a number.");
  await db
    .update(schema.leads)
    .set({ status, valueCents: value, notes: opt(form.get("notes")), name: opt(form.get("name")), email: opt(form.get("email")) })
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.businessId, business.id)));
  revalidatePath(`/b/${business.id}`, "layout");
  return { ok: true, message: "Lead updated." };
}

export async function sendLeadMessageAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { business } = await requireBusiness(str(form.get("businessId")));
  const leadId = str(form.get("leadId"));
  const body = str(form.get("body"));
  if (!body) return fail("Write a message first.");
  if (body.length > 1000) return fail("Keep texts under 1,000 characters.");
  const [lead] = await db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.businessId, business.id)))
    .limit(1);
  if (!lead?.phone) return fail("This lead has no phone number to text.");
  const from = await senderNumberFor(business.id, lead.id);
  if (!from) return fail("Add a tracking number in Settings to send texts.");
  try {
    const sid = await deliverSms(from, lead.phone, body);
    await recordMessage({ businessId: business.id, leadId: lead.id, direction: "outbound", body, fromNumber: from, toNumber: lead.phone, twilioSid: sid });
    if (lead.status === "new") await db.update(schema.leads).set({ status: "contacted" }).where(eq(schema.leads.id, lead.id));
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Text failed to send.");
  }
  revalidatePath(`/b/${business.id}/leads/${lead.id}`);
  return { ok: true };
}

export async function createLeadAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { business } = await requireBusiness(str(form.get("businessId")));
  const phone = toE164(opt(form.get("phone")));
  const email = opt(form.get("email"));
  if (!phone && !email) return fail("Add a phone number or email.");
  const [lead] = await db
    .insert(schema.leads)
    .values({
      businessId: business.id,
      name: opt(form.get("name")),
      phone,
      email,
      source: str(form.get("source")) || "Manual",
      channel: "manual",
      notes: opt(form.get("notes")),
    })
    .returning();
  redirect(`/b/${business.id}/leads/${lead.id}`);
}

/* ── Score ───────────────────────────────────────────────── */

export async function recalcScoreAction(form: FormData) {
  const { business } = await requireBusiness(str(form.get("businessId")));
  await refreshScore(business, true);
  revalidatePath(`/b/${business.id}`, "layout");
}

/* ── Team (client logins) ────────────────────────────────── */

export async function addClientLoginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { user, business } = await requireBusiness(str(form.get("businessId")));
  if (!isAgencyUser(user)) return fail("Only your agency can manage logins.");
  const email = str(form.get("email")).toLowerCase();
  const name = str(form.get("name"));
  const password = str(form.get("password"));
  if (!z.string().email().safeParse(email).success) return fail("Enter a valid email.");
  if (name.length < 2) return fail("Name is required.");

  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  let clientId: string;
  if (existing) {
    if (existing.agencyId !== user.agencyId) return fail("That email belongs to another account.");
    if (isAgencyUser(existing)) return fail("That's an agency teammate — they can already see every client.");
    clientId = existing.id;
  } else {
    if (password.length < 8) return fail("Set a temporary password of at least 8 characters.");
    const [u] = await db
      .insert(schema.users)
      .values({ agencyId: user.agencyId, email, name, passwordHash: await hashPassword(password), role: "client" })
      .returning();
    clientId = u.id;
  }
  await db.insert(schema.businessUsers).values({ businessId: business.id, userId: clientId }).onConflictDoNothing();
  revalidatePath(`/b/${business.id}/settings`);
  return { ok: true, message: existing ? "Access granted." : "Login created — share the email and temporary password with your client." };
}

export async function removeClientLoginAction(form: FormData) {
  const { user, business } = await requireBusiness(str(form.get("businessId")));
  if (!isAgencyUser(user)) return;
  await db
    .delete(schema.businessUsers)
    .where(and(eq(schema.businessUsers.businessId, business.id), eq(schema.businessUsers.userId, str(form.get("userId")))));
  revalidatePath(`/b/${business.id}/settings`);
}

export async function addTeammateAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireAgencyUser();
  if (user.role !== "agency_owner") return fail("Only the agency owner can add teammates.");
  const email = str(form.get("email")).toLowerCase();
  const name = str(form.get("name"));
  const password = str(form.get("password"));
  if (!z.string().email().safeParse(email).success) return fail("Enter a valid email.");
  if (name.length < 2 || password.length < 8) return fail("Name and an 8+ character password are required.");
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing) return fail("That email already has an account.");
  await db.insert(schema.users).values({ agencyId: user.agencyId, email, name, passwordHash: await hashPassword(password), role: "agency_member" });
  revalidatePath("/agency/team");
  return { ok: true, message: "Teammate added." };
}
