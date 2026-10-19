import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["agency_owner", "agency_member", "client"]);
export const leadStatus = pgEnum("lead_status", ["new", "contacted", "booked", "won", "lost"]);
export const leadChannel = pgEnum("lead_channel", ["call", "sms", "form", "manual"]);
export const callStatus = pgEnum("call_status", ["ringing", "completed", "missed"]);
export const messageDirection = pgEnum("message_direction", ["inbound", "outbound"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/* ── Tenancy ─────────────────────────────────────────────── */

export const agencies = pgTable("agencies", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  agencyId: uuid("agency_id").references(() => agencies.id, { onDelete: "cascade" }).notNull(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("client"),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the cookie token
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const businesses = pgTable(
  "businesses",
  {
    id: id(),
    agencyId: uuid("agency_id").references(() => agencies.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    category: text("category"),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    timezone: text("timezone").notNull().default("America/New_York"),
    /** The owner's real phone — tracked calls forward here. */
    forwardToPhone: text("forward_to_phone"),
    /** Public key used by the embeddable lead form. */
    formKey: text("form_key").notNull().unique(),
    formLastSeenAt: timestamp("form_last_seen_at", { withTimezone: true }),
    textBackEnabled: boolean("text_back_enabled").notNull().default(true),
    textBackMessage: text("text_back_message")
      .notNull()
      .default("Hi, this is {business}. Sorry we missed your call! How can we help? Reply here and we'll get right back to you."),
    formAutoReplyMessage: text("form_auto_reply_message")
      .notNull()
      .default("Hi {name}, thanks for contacting {business}! We got your request and will reach out shortly. Feel free to reply here with any details."),
    notifyOwnerBySms: boolean("notify_owner_by_sms").notNull().default(true),
    replyTone: text("reply_tone").notNull().default("warm, professional and concise"),
    createdAt: createdAt(),
  },
  (t) => [index("businesses_agency_idx").on(t.agencyId)],
);

/** Client logins → the businesses they can see. Agency users see every business in their agency. */
export const businessUsers = pgTable(
  "business_users",
  {
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.businessId, t.userId] })],
);

/* ── Calls, leads, messages ──────────────────────────────── */

export const trackingNumbers = pgTable("tracking_numbers", {
  id: id(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
  phoneNumber: text("phone_number").notNull().unique(), // E.164
  source: text("source").notNull(), // e.g. "Google Business Profile", "Website", "Yelp"
  twilioSid: text("twilio_sid"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const leads = pgTable(
  "leads",
  {
    id: id(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
    name: text("name"),
    phone: text("phone"),
    email: text("email"),
    source: text("source").notNull(),
    channel: leadChannel("channel").notNull(),
    status: leadStatus("status").notNull().default("new"),
    /** Job value in cents, entered when the lead is won — powers revenue attribution. */
    valueCents: integer("value_cents"),
    notes: text("notes"),
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    index("leads_business_idx").on(t.businessId, t.createdAt),
    index("leads_phone_idx").on(t.businessId, t.phone),
  ],
);

export const calls = pgTable(
  "calls",
  {
    id: id(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
    trackingNumberId: uuid("tracking_number_id").references(() => trackingNumbers.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    twilioCallSid: text("twilio_call_sid").unique(),
    fromNumber: text("from_number").notNull(),
    toNumber: text("to_number").notNull(),
    source: text("source").notNull(),
    status: callStatus("status").notNull().default("ringing"),
    durationSec: integer("duration_sec"),
    textBackSent: boolean("text_back_sent").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("calls_business_idx").on(t.businessId, t.startedAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }).notNull(),
    direction: messageDirection("direction").notNull(),
    body: text("body").notNull(),
    fromNumber: text("from_number"),
    toNumber: text("to_number"),
    twilioSid: text("twilio_sid"),
    automated: boolean("automated").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("messages_lead_idx").on(t.leadId, t.createdAt)],
);

/* ── Google Business Profile + reviews ───────────────────── */

export const googleConnections = pgTable("google_connections", {
  id: id(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull().unique(),
  googleEmail: text("google_email"),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  accountName: text("account_name"), // accounts/123
  locationName: text("location_name"), // locations/456
  locationTitle: text("location_title"),
  profileSnapshot: jsonb("profile_snapshot").$type<GbpProfileSnapshot>(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: createdAt(),
});

export type GbpProfileSnapshot = {
  title?: string;
  phone?: string;
  website?: string;
  address?: string;
  primaryCategory?: string;
  additionalCategories?: number;
  hasHours?: boolean;
  description?: string;
};

export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
    source: text("source").notNull().default("google"),
    externalId: text("external_id").notNull(), // full Google review resource name
    reviewerName: text("reviewer_name"),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
    replyComment: text("reply_comment"),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    aiDraft: text("ai_draft"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("reviews_external_idx").on(t.businessId, t.externalId),
    index("reviews_business_idx").on(t.businessId, t.reviewedAt),
  ],
);

/* ── Marketing score history ─────────────────────────────── */

export type ScoreCategory = { key: string; label: string; score: number; max: number };
export type ScoreRecommendation = { key: string; title: string; detail: string; impact: number; href?: string };

export const scoreSnapshots = pgTable(
  "score_snapshots",
  {
    id: id(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
    total: integer("total").notNull(),
    categories: jsonb("categories").$type<ScoreCategory[]>().notNull(),
    recommendations: jsonb("recommendations").$type<ScoreRecommendation[]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("score_business_idx").on(t.businessId, t.createdAt)],
);

export type Business = typeof businesses.$inferSelect;
export type User = typeof users.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type TrackingNumber = typeof trackingNumbers.$inferSelect;
