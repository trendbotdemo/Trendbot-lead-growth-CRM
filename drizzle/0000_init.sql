CREATE TYPE "public"."call_status" AS ENUM('ringing', 'completed', 'missed');--> statement-breakpoint
CREATE TYPE "public"."lead_channel" AS ENUM('call', 'sms', 'form', 'manual');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'booked', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('agency_owner', 'agency_member', 'client');--> statement-breakpoint
CREATE TABLE "agencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_users" (
	"business_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "business_users_business_id_user_id_pk" PRIMARY KEY("business_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"phone" text,
	"email" text,
	"website" text,
	"address" text,
	"city" text,
	"state" text,
	"zip" text,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"forward_to_phone" text,
	"form_key" text NOT NULL,
	"form_last_seen_at" timestamp with time zone,
	"text_back_enabled" boolean DEFAULT true NOT NULL,
	"text_back_message" text DEFAULT 'Hi, this is {business}. Sorry we missed your call! How can we help? Reply here and we''ll get right back to you.' NOT NULL,
	"form_auto_reply_message" text DEFAULT 'Hi {name}, thanks for contacting {business}! We got your request and will reach out shortly. Feel free to reply here with any details.' NOT NULL,
	"notify_owner_by_sms" boolean DEFAULT true NOT NULL,
	"reply_tone" text DEFAULT 'warm, professional and concise' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_form_key_unique" UNIQUE("form_key")
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"tracking_number_id" uuid,
	"lead_id" uuid,
	"twilio_call_sid" text,
	"from_number" text NOT NULL,
	"to_number" text NOT NULL,
	"source" text NOT NULL,
	"status" "call_status" DEFAULT 'ringing' NOT NULL,
	"duration_sec" integer,
	"text_back_sent" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calls_twilio_call_sid_unique" UNIQUE("twilio_call_sid")
);
--> statement-breakpoint
CREATE TABLE "google_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"google_email" text,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text,
	"expires_at" timestamp with time zone NOT NULL,
	"account_name" text,
	"location_name" text,
	"location_title" text,
	"profile_snapshot" jsonb,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_connections_business_id_unique" UNIQUE("business_id")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text,
	"phone" text,
	"email" text,
	"source" text NOT NULL,
	"channel" "lead_channel" NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"value_cents" integer,
	"notes" text,
	"first_response_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"direction" "message_direction" NOT NULL,
	"body" text NOT NULL,
	"from_number" text,
	"to_number" text,
	"twilio_sid" text,
	"automated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"source" text DEFAULT 'google' NOT NULL,
	"external_id" text NOT NULL,
	"reviewer_name" text,
	"rating" integer NOT NULL,
	"comment" text,
	"reviewed_at" timestamp with time zone NOT NULL,
	"reply_comment" text,
	"replied_at" timestamp with time zone,
	"ai_draft" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"total" integer NOT NULL,
	"categories" jsonb NOT NULL,
	"recommendations" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"phone_number" text NOT NULL,
	"source" text NOT NULL,
	"twilio_sid" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_numbers_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'client' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "business_users" ADD CONSTRAINT "business_users_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_users" ADD CONSTRAINT "business_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_tracking_number_id_tracking_numbers_id_fk" FOREIGN KEY ("tracking_number_id") REFERENCES "public"."tracking_numbers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_snapshots" ADD CONSTRAINT "score_snapshots_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_numbers" ADD CONSTRAINT "tracking_numbers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "businesses_agency_idx" ON "businesses" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "calls_business_idx" ON "calls" USING btree ("business_id","started_at");--> statement-breakpoint
CREATE INDEX "leads_business_idx" ON "leads" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_phone_idx" ON "leads" USING btree ("business_id","phone");--> statement-breakpoint
CREATE INDEX "messages_lead_idx" ON "messages" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_external_idx" ON "reviews" USING btree ("business_id","external_id");--> statement-breakpoint
CREATE INDEX "reviews_business_idx" ON "reviews" USING btree ("business_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "score_business_idx" ON "score_snapshots" USING btree ("business_id","created_at");