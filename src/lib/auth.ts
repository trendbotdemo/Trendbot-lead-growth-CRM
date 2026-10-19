import "server-only";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { randomToken, sha256 } from "./crypto";
import { env } from "./env";

const COOKIE = "tb_session";
const SESSION_DAYS = 30;

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(schema.sessions).values({ id: sha256(token), userId, expiresAt });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.APP_URL.startsWith("https"),
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  jar.delete(COOKIE);
}

export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0]?.user ?? null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function isAgencyUser(user: { role: string }) {
  return user.role === "agency_owner" || user.role === "agency_member";
}

export async function requireAgencyUser() {
  const user = await requireUser();
  if (!isAgencyUser(user)) redirect("/");
  return user;
}

/** Businesses this user may see: everything in the agency for agency staff, assigned ones for clients. */
export async function listAccessibleBusinesses(user: schema.User) {
  if (isAgencyUser(user)) {
    return db.select().from(schema.businesses).where(eq(schema.businesses.agencyId, user.agencyId)).orderBy(schema.businesses.name);
  }
  const rows = await db
    .select({ b: schema.businesses })
    .from(schema.businessUsers)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.businessUsers.businessId))
    .where(eq(schema.businessUsers.userId, user.id))
    .orderBy(schema.businesses.name);
  return rows.map((r) => r.b);
}

/** Loads a business and verifies the current user may access it. 404s otherwise (no existence leak). */
export const requireBusiness = cache(async (businessId: string) => {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) notFound();
  const [business] = await db.select().from(schema.businesses).where(eq(schema.businesses.id, businessId)).limit(1);
  if (!business || business.agencyId !== user.agencyId) notFound();
  if (!isAgencyUser(user)) {
    const [link] = await db
      .select()
      .from(schema.businessUsers)
      .where(and(eq(schema.businessUsers.businessId, businessId), eq(schema.businessUsers.userId, user.id)))
      .limit(1);
    if (!link) notFound();
  }
  return { user, business };
});
