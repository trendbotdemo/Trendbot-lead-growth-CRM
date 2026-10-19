/**
 * Demo data so the dashboard looks alive on day one.
 *   npm run db:seed            → creates the agency, logins and 3 sample businesses
 * Safe to re-run: it wipes and recreates only the demo agency.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";

const DAY = 86400_000;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * 3600_000);
const rand = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const phone = () => `+1${rand(["213", "408", "602", "702", "716", "801"])}${String(Math.floor(2000000 + Math.random() * 7999999))}`;

const FIRST = ["Maria", "James", "Linda", "Robert", "Patricia", "Michael", "Jennifer", "David", "Susan", "Chris", "Angela", "Kevin", "Denise", "Marcus", "Tina"];
const LAST = ["Garcia", "Smith", "Johnson", "Brown", "Lee", "Martinez", "Davis", "Wilson", "Clark", "Lopez", "Young", "Hall"];

const DEMO = [
  {
    name: "Summit Peak Plumbing",
    category: "Plumber",
    city: "Phoenix",
    state: "AZ",
    sources: ["Google Business Profile", "Website", "Google Ads"],
    reviews: [
      [5, "Showed up within the hour for a burst pipe and fixed it fast. Fair price and very professional."],
      [5, "Replaced our water heater same day. Clean, friendly and explained everything."],
      [4, "Good work on the kitchen drain. Arrived a little later than the window but called ahead."],
      [2, "Quote was higher than expected and it took two visits to fix the leak."],
      [5, "Best plumber in Phoenix, period. Will use again."],
    ],
  },
  {
    name: "Brightline Auto Detailing",
    category: "Car detailing",
    city: "Las Vegas",
    state: "NV",
    sources: ["Google Business Profile", "Yelp", "Facebook / Instagram"],
    reviews: [
      [5, "My truck looks brand new. The ceramic coating is unreal."],
      [5, "Mobile service came to my office, super convenient."],
      [3, "Interior was great, a few water spots left on the windows."],
    ],
  },
  {
    name: "Evergreen Home Remodeling",
    category: "Remodeler",
    city: "Salt Lake City",
    state: "UT",
    sources: ["Google Business Profile", "Website"],
    reviews: [
      [5, "They redid our bathroom on time and on budget. Communication was excellent."],
      [4, "Beautiful kitchen. Small delay with the countertop supplier but they handled it."],
    ],
  },
] as const;

async function main() {
  const [existing] = await db.select().from(schema.agencies).where(eq(schema.agencies.name, "TrendBot Agency")).limit(1);
  if (existing) await db.delete(schema.agencies).where(eq(schema.agencies.id, existing.id));

  const [agency] = await db.insert(schema.agencies).values({ name: "TrendBot Agency" }).returning();
  const hash = await bcrypt.hash("demo12345", 12);
  await db.insert(schema.users).values({ agencyId: agency.id, name: "Agency Admin", email: "admin@trendbot.local", passwordHash: hash, role: "agency_owner" });
  const [client] = await db
    .insert(schema.users)
    .values({ agencyId: agency.id, name: "Demo Owner", email: "owner@trendbot.local", passwordHash: hash, role: "client" })
    .returning();

  for (const [i, d] of DEMO.entries()) {
    const [b] = await db
      .insert(schema.businesses)
      .values({
        agencyId: agency.id,
        name: d.name,
        category: d.category,
        city: d.city,
        state: d.state,
        phone: phone(),
        forwardToPhone: phone(),
        formKey: randomBytes(9).toString("base64url"),
        formLastSeenAt: i === 0 ? ago(1) : null,
        timezone: "America/Phoenix",
      })
      .returning();
    if (i === 0) await db.insert(schema.businessUsers).values({ businessId: b.id, userId: client.id });

    const trackingRows = d.sources.slice(0, i === 2 ? 0 : 2).map((source) => ({ businessId: b.id, phoneNumber: phone(), source }));
    const tracking = trackingRows.length ? await db.insert(schema.trackingNumbers).values(trackingRows).returning() : [];

    const leadCount = [34, 19, 7][i];
    for (let n = 0; n < leadCount; n++) {
      const created = ago(Math.random() * 29, Math.random() * 10);
      const channel = rand(["call", "call", "call", "sms", "form"] as const);
      const source = channel === "form" ? "Website form" : rand([...d.sources]);
      const status = rand(["new", "contacted", "contacted", "booked", "won", "won", "lost"] as const);
      const caller = phone();
      const responseMin = rand([0.3, 1, 2, 4, 12, 45, 180]);
      const [lead] = await db
        .insert(schema.leads)
        .values({
          businessId: b.id,
          name: Math.random() > 0.3 ? `${rand(FIRST)} ${rand(LAST)}` : null,
          phone: caller,
          source,
          channel,
          status,
          valueCents: status === "won" ? rand([18000, 35000, 65000, 120000, 240000]) : null,
          firstResponseAt: status === "new" ? null : new Date(created.getTime() + responseMin * 60_000),
          createdAt: created,
          lastActivityAt: new Date(created.getTime() + responseMin * 60_000),
        })
        .returning();

      const tn = tracking[n % Math.max(1, tracking.length)];
      if (channel === "call" && tn) {
        const missed = Math.random() < 0.28;
        await db.insert(schema.calls).values({
          businessId: b.id,
          trackingNumberId: tn.id,
          leadId: lead.id,
          twilioCallSid: `CAdemo${randomBytes(12).toString("hex")}`,
          fromNumber: caller,
          toNumber: tn.phoneNumber,
          source: tn.source,
          status: missed ? "missed" : "completed",
          durationSec: missed ? null : 40 + Math.floor(Math.random() * 400),
          textBackSent: missed,
          startedAt: created,
        });
        if (missed) {
          await db.insert(schema.messages).values([
            { businessId: b.id, leadId: lead.id, direction: "outbound", automated: true, body: `Hi, this is ${d.name}. Sorry we missed your call! How can we help? Reply here and we'll get right back to you.`, fromNumber: tn.phoneNumber, toNumber: caller, createdAt: new Date(created.getTime() + 20_000) },
            ...(Math.random() < 0.6
              ? [{ businessId: b.id, leadId: lead.id, direction: "inbound" as const, body: rand(["Hi! Need a quote for this week.", "Can someone come out tomorrow morning?", "What do you charge for this?", "Yes please call me back when you can"]), fromNumber: caller, toNumber: tn.phoneNumber, createdAt: new Date(created.getTime() + 6 * 60_000) }]
              : []),
          ]);
        }
      } else if (channel !== "call") {
        await db.insert(schema.messages).values({
          businessId: b.id,
          leadId: lead.id,
          direction: "inbound",
          body: rand(["Looking for a quote please.", "Do you service my area?", "How soon can you come out?", "Interested — what's your availability next week?"]),
          fromNumber: caller,
          toNumber: tn?.phoneNumber ?? null,
          createdAt: created,
        });
      }
    }

    for (const [k, [rating, comment]] of d.reviews.entries()) {
      const replied = k % 2 === 1;
      await db.insert(schema.reviews).values({
        businessId: b.id,
        externalId: `demo/${b.id}/${k}`,
        source: "demo",
        reviewerName: `${rand(FIRST)} ${rand(LAST).charAt(0)}.`,
        rating,
        comment,
        reviewedAt: ago(k * 9 + 2),
        replyComment: replied ? "Thank you so much for the kind words — we appreciate your business!" : null,
        repliedAt: replied ? ago(k * 9) : null,
      });
    }
  }

  console.log("Seeded. Log in as admin@trendbot.local / demo12345 (agency) or owner@trendbot.local / demo12345 (client).");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
