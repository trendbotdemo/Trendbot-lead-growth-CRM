# TrendBot Growth Center — Phase 1

A Thryv-style marketing dashboard for local service businesses, built for TrendBot Agency.
Agency staff see every client; each business owner can get their own login that only shows their business.

## What it does

| Module | What the owner gets |
|---|---|
| **Call tracking** | A Twilio number per channel (Google profile, website, ads…). Calls forward to the owner's cell and are logged with their source. |
| **Missed-call text-back** | If nobody answers, the caller gets a text within seconds and the owner gets an alert. Replies land in the inbox. |
| **Leads inbox** | Calls, texts and website forms in one place, with a two-way SMS thread per lead and statuses (new → contacted → booked → won/lost). |
| **Revenue attribution** | Enter the job value when a lead is won — the dashboard shows revenue by source. |
| **Website lead form** | Copy-paste HTML form (or POST from any existing form). Instant auto-reply text to the lead. Honeypot spam filter. |
| **Google Business Profile** | OAuth connect, profile health check, review sync every 6 hours. |
| **Reviews + AI replies** | One-click Claude-written reply drafts, edited and posted to Google from the dashboard. |
| **Growth Score (0–100)** | Google profile (25), Reviews (30), Lead capture (25), Speed to lead (20) — with fixes ranked by points gained. |
| **Agency view** | All clients side by side: score, leads, missed calls, revenue, reviews needing replies. |

## Run locally

```bash
cp .env.example .env          # set DATABASE_URL and APP_SECRET at minimum
npm install
npm run db:push               # create tables (or: npm run db:migrate)
npm run db:seed               # optional demo data
npm run dev
```

Demo logins after seeding (password `demo12345`):
- `admin@trendbot.local` — agency owner (sees all clients)
- `owner@trendbot.local` — client login (sees one business)

Without seeding, open `/signup` to create the first agency account (sign-up closes after that unless `ALLOW_SIGNUP=true`).

Without Twilio credentials, texts are logged as `[sms:dry-run]` in the server console so you can test every flow. Simulate a missed call locally (with `TWILIO_VALIDATE_SIGNATURE=false`):

```bash
curl -X POST localhost:3000/api/twilio/voice -d To=%2B1TRACKINGNUMBER -d From=%2B15551230001 -d CallSid=CA1
curl -X POST "localhost:3000/api/twilio/dial-status?callId=<id from calls table>" -d DialCallStatus=no-answer
```

## Production setup

1. **Database** — any Postgres 14+ (Neon, Supabase, Railway, RDS). Run `npm run db:migrate`.
2. **Hosting** — Vercel works out of the box (`vercel.json` schedules the 6-hourly sync). On other hosts, call `GET /api/cron/sync` with header `Authorization: Bearer $CRON_SECRET` every few hours.
3. **Twilio** — add Account SID + Auth Token. Buying a number from Settings sets its Voice and SMS webhooks automatically. For a number you already own, use "Use a number already in Twilio". For US SMS you must complete **A2P 10DLC registration** in Twilio or texts will be blocked.
4. **Google** — in Google Cloud: create an OAuth client (Web), add redirect URI `https://YOUR_APP_URL/api/google/callback`, enable *My Business Account Management API*, *My Business Business Information API* and *Google My Business API*. Business Profile APIs require an **access request approval from Google** (form in the GBP API docs) before they return data — apply early.
5. **Claude** — add `ANTHROPIC_API_KEY` for AI review replies. Without it, a smart template is used.

## Tech

Next.js 15 (App Router, server actions) · TypeScript · Postgres + Drizzle ORM · Tailwind v4 · Twilio · Google Business Profile APIs · Anthropic SDK.
Sessions are httpOnly cookies backed by the `sessions` table; Google tokens are AES-256-GCM encrypted at rest; Twilio webhooks are signature-verified; every page and action checks the user can access that business.

```
src/
  app/
    agency/            all-clients view, add client, team
    b/[businessId]/    dashboard, leads, calls, reviews, score, settings
    api/twilio/        voice, dial-status (missed-call logic), sms
    api/forms/         public website form endpoint
    api/google/        OAuth connect + callback
    api/cron/sync      Google sync + score snapshots
    actions.ts         all server actions
  lib/                 auth, twilio, google, ai, leads, calls, metrics, score
  db/schema.ts         full data model
scripts/seed.ts        demo data
```

## Next phases (planned)

- AI receptionist (answer instead of forwarding — plug in TrendBot AI OS voice agents)
- Review request SMS after a lead is marked won
- AI visibility tracker (ChatGPT / Gemini / AI Overviews mentions)
- Listings sync via a reseller API (BrightLocal / Yext), social scheduling, booking + deposits
