import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt, encrypt } from "./crypto";
import { env } from "./env";

const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/business.manage"];
const ACCOUNT_API = "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
const V4_API = "https://mybusiness.googleapis.com/v4";
const READ_MASK = "name,title,phoneNumbers,websiteUri,storefrontAddress,categories,regularHours,profile";

export function redirectUri() {
  return `${env.APP_URL.replace(/\/$/, "")}/api/google/callback`;
}

export function authUrl(state: string) {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; id_token?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, ...body }),
  });
  if (!res.ok) throw new Error(`Google token error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function exchangeCode(businessId: string, code: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  let email: string | null = null;
  const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${t.access_token}` },
  });
  if (info.ok) email = ((await info.json()) as { email?: string }).email ?? null;

  const values = {
    businessId,
    googleEmail: email,
    accessTokenEnc: encrypt(t.access_token),
    refreshTokenEnc: t.refresh_token ? encrypt(t.refresh_token) : null,
    expiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000),
    lastError: null,
  };
  await db
    .insert(schema.googleConnections)
    .values(values)
    .onConflictDoUpdate({
      target: schema.googleConnections.businessId,
      set: {
        ...values,
        // keep the old refresh token if Google didn't send a new one
        refreshTokenEnc: t.refresh_token ? values.refreshTokenEnc : sql`${schema.googleConnections.refreshTokenEnc}`,
      },
    });
}

type Connection = typeof schema.googleConnections.$inferSelect;

async function accessToken(conn: Connection) {
  if (conn.expiresAt.getTime() > Date.now()) return decrypt(conn.accessTokenEnc);
  if (!conn.refreshTokenEnc) throw new Error("Google connection expired — reconnect Google.");
  const t = await tokenRequest({ refresh_token: decrypt(conn.refreshTokenEnc), grant_type: "refresh_token" });
  await db
    .update(schema.googleConnections)
    .set({ accessTokenEnc: encrypt(t.access_token), expiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000) })
    .where(eq(schema.googleConnections.id, conn.id));
  return t.access_token;
}

async function gfetch<T>(conn: Connection, url: string, init?: RequestInit): Promise<T> {
  const token = await accessToken(conn);
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`Google API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? ({} as T) : res.json();
}

export async function getConnection(businessId: string) {
  const [conn] = await db.select().from(schema.googleConnections).where(eq(schema.googleConnections.businessId, businessId)).limit(1);
  return conn ?? null;
}

/* ── Locations ───────────────────────────────────────────── */

type GLocation = {
  name: string;
  title?: string;
  phoneNumbers?: { primaryPhone?: string };
  websiteUri?: string;
  storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string };
  categories?: { primaryCategory?: { displayName?: string }; additionalCategories?: unknown[] };
  regularHours?: { periods?: unknown[] };
  profile?: { description?: string };
};

export type LocationOption = { accountName: string; locationName: string; title: string; address: string };

function addressOf(l: GLocation) {
  const a = l.storefrontAddress;
  return a ? [...(a.addressLines ?? []), a.locality, a.administrativeArea, a.postalCode].filter(Boolean).join(", ") : "";
}

export async function listLocations(conn: Connection): Promise<LocationOption[]> {
  const { accounts = [] } = await gfetch<{ accounts?: { name: string }[] }>(conn, `${ACCOUNT_API}/accounts`);
  const out: LocationOption[] = [];
  for (const acct of accounts) {
    let pageToken = "";
    do {
      const q = new URLSearchParams({ readMask: "name,title,storefrontAddress", pageSize: "100", ...(pageToken && { pageToken }) });
      const page = await gfetch<{ locations?: GLocation[]; nextPageToken?: string }>(conn, `${INFO_API}/${acct.name}/locations?${q}`);
      for (const l of page.locations ?? []) {
        out.push({ accountName: acct.name, locationName: l.name, title: l.title ?? l.name, address: addressOf(l) });
      }
      pageToken = page.nextPageToken ?? "";
    } while (pageToken);
  }
  return out;
}

export async function selectLocation(businessId: string, accountName: string, locationName: string, title: string) {
  await db
    .update(schema.googleConnections)
    .set({ accountName, locationName, locationTitle: title })
    .where(eq(schema.googleConnections.businessId, businessId));
}

/* ── Sync ────────────────────────────────────────────────── */

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

type GReview = {
  name: string;
  reviewer?: { displayName?: string };
  starRating?: string;
  comment?: string;
  createTime: string;
  reviewReply?: { comment?: string; updateTime?: string };
};

/** Pulls profile details + all reviews for a business's connected location. */
export async function syncGoogle(businessId: string) {
  const conn = await getConnection(businessId);
  if (!conn?.locationName || !conn.accountName) return { synced: false, reason: "No Google location selected" };

  try {
    const loc = await gfetch<GLocation>(conn, `${INFO_API}/${conn.locationName}?readMask=${READ_MASK}`);
    const snapshot: schema.GbpProfileSnapshot = {
      title: loc.title,
      phone: loc.phoneNumbers?.primaryPhone,
      website: loc.websiteUri,
      address: addressOf(loc),
      primaryCategory: loc.categories?.primaryCategory?.displayName,
      additionalCategories: loc.categories?.additionalCategories?.length ?? 0,
      hasHours: Boolean(loc.regularHours?.periods?.length),
      description: loc.profile?.description,
    };

    let pageToken = "";
    let count = 0;
    do {
      const q = new URLSearchParams({ pageSize: "50", ...(pageToken && { pageToken }) });
      const page = await gfetch<{ reviews?: GReview[]; nextPageToken?: string }>(
        conn,
        `${V4_API}/${conn.accountName}/${conn.locationName}/reviews?${q}`,
      );
      for (const r of page.reviews ?? []) {
        const values = {
          businessId,
          source: "google",
          externalId: r.name,
          reviewerName: r.reviewer?.displayName ?? "Google user",
          rating: STARS[r.starRating ?? ""] ?? 0,
          comment: r.comment ?? null,
          reviewedAt: new Date(r.createTime),
          replyComment: r.reviewReply?.comment ?? null,
          repliedAt: r.reviewReply?.updateTime ? new Date(r.reviewReply.updateTime) : null,
        };
        await db
          .insert(schema.reviews)
          .values(values)
          .onConflictDoUpdate({
            target: [schema.reviews.businessId, schema.reviews.externalId],
            set: { rating: values.rating, comment: values.comment, replyComment: values.replyComment, repliedAt: values.repliedAt },
          });
        count++;
      }
      pageToken = page.nextPageToken ?? "";
    } while (pageToken);

    await db
      .update(schema.googleConnections)
      .set({ profileSnapshot: snapshot, lastSyncedAt: new Date(), lastError: null })
      .where(eq(schema.googleConnections.id, conn.id));
    return { synced: true, reviews: count };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(schema.googleConnections).set({ lastError: message }).where(eq(schema.googleConnections.id, conn.id));
    return { synced: false, reason: message };
  }
}

export async function postReviewReply(businessId: string, reviewExternalId: string, comment: string) {
  const conn = await getConnection(businessId);
  if (!conn) throw new Error("Google is not connected for this business.");
  await gfetch(conn, `${V4_API}/${reviewExternalId}/reply`, { method: "PUT", body: JSON.stringify({ comment }) });
}
