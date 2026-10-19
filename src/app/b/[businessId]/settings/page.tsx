import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isAgencyUser, requireBusiness } from "@/lib/auth";
import { env, features } from "@/lib/env";
import { getConnection, listLocations, type LocationOption } from "@/lib/google";
import { formatPhone } from "@/lib/phone";
import { timeAgo } from "@/lib/format";
import { ActionForm, CopyButton, SubmitButton } from "@/components/forms";
import { Badge, Notice, PageHeader } from "@/components/ui";
import {
  addClientLoginAction,
  addTrackingNumberAction,
  chooseGoogleLocationAction,
  disconnectGoogleAction,
  removeClientLoginAction,
  syncGoogleAction,
  toggleTrackingNumberAction,
  updateAutomationAction,
  updateBusinessAction,
} from "../../../actions";

export const metadata = { title: "Settings" };

const NOTICES: Record<string, { tone: "good" | "bad" | "warn"; text: string }> = {
  created: { tone: "good", text: "Client created. Next: add a tracking number, connect Google, and install the website form." },
  "google=connected": { tone: "good", text: "Google Business Profile connected and synced." },
  "google=choose": { tone: "warn", text: "Pick which Google location belongs to this business." },
  "error=google-not-configured": { tone: "bad", text: "Google isn't configured on the server yet — add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
  "error=google-denied": { tone: "bad", text: "Google access was not granted." },
  "error=google-no-locations": { tone: "bad", text: "That Google account doesn't manage any Business Profile locations." },
  "error=google-failed": { tone: "bad", text: "Connecting Google failed. Check the server logs and try again." },
};

const SOURCES = ["Google Business Profile", "Website", "Google Ads", "Facebook / Instagram", "Yelp", "Truck / signage", "Flyers", "Other"];

function Section({ id, title, desc, children }: { id: string; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 grid gap-4 border-t border-line py-8 first:border-t-0 first:pt-0 lg:grid-cols-[260px_1fr]">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {desc && <p className="mt-1 text-[13px] text-ink-2">{desc}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { businessId } = await params;
  const sp = await searchParams;
  const { user, business: b } = await requireBusiness(businessId);
  const agency = isAgencyUser(user);

  const [numbers, conn, clients] = await Promise.all([
    db.select().from(schema.trackingNumbers).where(eq(schema.trackingNumbers.businessId, b.id)).orderBy(asc(schema.trackingNumbers.createdAt)),
    getConnection(b.id),
    db
      .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
      .from(schema.businessUsers)
      .innerJoin(schema.users, eq(schema.users.id, schema.businessUsers.userId))
      .where(eq(schema.businessUsers.businessId, b.id)),
  ]);

  let locations: LocationOption[] = [];
  let locationsError: string | null = null;
  if (conn && !conn.locationName) {
    try {
      locations = await listLocations(conn);
    } catch (err) {
      locationsError = err instanceof Error ? err.message : "Couldn't load locations.";
    }
  }

  const noticeKey = sp.created ? "created" : sp.google ? `google=${sp.google}` : sp.error ? `error=${sp.error}` : null;
  const notice = noticeKey ? NOTICES[noticeKey] : null;

  const endpoint = `${env.APP_URL.replace(/\/$/, "")}/api/forms/${b.formKey}`;
  const snippet = `<form action="${endpoint}" method="POST" style="display:grid;gap:10px;max-width:420px">
  <input name="name" placeholder="Your name" required>
  <input name="phone" type="tel" placeholder="Phone number" required>
  <input name="email" type="email" placeholder="Email (optional)">
  <textarea name="message" placeholder="What can we help with?"></textarea>
  <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
  <button type="submit">Get a free quote</button>
</form>`;

  return (
    <>
      <PageHeader title="Settings" subtitle={b.name} />
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <div className="card card-pad md:p-8">
        <Section id="profile" title="Business profile" desc="Used in automatic texts and AI review replies.">
          <ActionForm action={updateBusinessAction} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="businessId" value={b.id} />
            <div className="sm:col-span-2"><label className="label">Business name</label><input name="name" defaultValue={b.name} className="input" required /></div>
            <div><label className="label">Category</label><input name="category" defaultValue={b.category ?? ""} className="input" /></div>
            <div><label className="label">Public phone</label><input name="phone" defaultValue={b.phone ?? ""} className="input" /></div>
            <div><label className="label">Email</label><input name="email" defaultValue={b.email ?? ""} className="input" /></div>
            <div><label className="label">Website</label><input name="website" defaultValue={b.website ?? ""} className="input" /></div>
            <div className="sm:col-span-2"><label className="label">Street address</label><input name="address" defaultValue={b.address ?? ""} className="input" /></div>
            <div><label className="label">City</label><input name="city" defaultValue={b.city ?? ""} className="input" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">State</label><input name="state" defaultValue={b.state ?? ""} className="input" /></div>
              <div><label className="label">ZIP</label><input name="zip" defaultValue={b.zip ?? ""} className="input" /></div>
            </div>
            <div><label className="label">Time zone</label><input name="timezone" defaultValue={b.timezone} className="input" /></div>
            <div><label className="label">AI reply tone</label><input name="replyTone" defaultValue={b.replyTone} className="input" /></div>
            <div className="sm:col-span-2"><SubmitButton>Save profile</SubmitButton></div>
          </ActionForm>
        </Section>

        <Section id="calls" title="Calls & instant replies" desc="Tracked calls ring the owner's phone. If nobody answers, the caller gets a text within seconds.">
          <ActionForm action={updateAutomationAction} className="space-y-4">
            <input type="hidden" name="businessId" value={b.id} />
            <div className="max-w-sm">
              <label className="label">Owner&apos;s phone (calls forward here)</label>
              <input name="forwardToPhone" defaultValue={b.forwardToPhone ?? ""} className="input" placeholder="(555) 123-4567" />
            </div>
            <label className="flex items-center gap-2.5">
              <input type="checkbox" name="textBackEnabled" defaultChecked={b.textBackEnabled} className="h-4 w-4 accent-[var(--color-brand)]" />
              <span className="font-medium">Missed-call text-back &amp; instant form replies</span>
            </label>
            <div>
              <label className="label">Missed-call text</label>
              <textarea name="textBackMessage" defaultValue={b.textBackMessage} rows={2} maxLength={320} className="input" />
            </div>
            <div>
              <label className="label">Website form auto-reply</label>
              <textarea name="formAutoReplyMessage" defaultValue={b.formAutoReplyMessage} rows={2} maxLength={320} className="input" />
              <p className="mt-1 text-[12px] text-ink-3">Use {"{name}"} and {"{business}"} as placeholders.</p>
            </div>
            <label className="flex items-center gap-2.5">
              <input type="checkbox" name="notifyOwnerBySms" defaultChecked={b.notifyOwnerBySms} className="h-4 w-4 accent-[var(--color-brand)]" />
              <span>Text the owner about every new lead and missed call</span>
            </label>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>

          <div className="mt-8">
            <h3 className="mb-2 text-[13px] font-semibold">Tracking numbers</h3>
            <p className="mb-3 text-[13px] text-ink-2">Use a different number on each channel (Google profile, website, ads) to see which one brings the calls.</p>
            {numbers.length > 0 && (
              <div className="mb-4 overflow-x-auto rounded-lg border border-line">
                <table className="table">
                  <thead><tr><th>Number</th><th>Put it on</th><th>Status</th>{agency && <th />}</tr></thead>
                  <tbody>
                    {numbers.map((n) => (
                      <tr key={n.id}>
                        <td className="font-medium tabular-nums">{formatPhone(n.phoneNumber)}</td>
                        <td className="text-ink-2">{n.source}</td>
                        <td>{n.active ? <Badge tone="good">Active</Badge> : <Badge>Paused</Badge>}</td>
                        {agency && (
                          <td className="text-right">
                            <form action={toggleTrackingNumberAction}>
                              <input type="hidden" name="businessId" value={b.id} />
                              <input type="hidden" name="id" value={n.id} />
                              <button className="text-[13px] text-ink-2 hover:text-ink">{n.active ? "Pause" : "Resume"}</button>
                            </form>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {agency ? (
              <div className="grid gap-4 md:grid-cols-2">
                <ActionForm action={addTrackingNumberAction} className="rounded-lg border border-line p-4" resetOnSuccess>
                  <input type="hidden" name="businessId" value={b.id} />
                  <input type="hidden" name="mode" value="buy" />
                  <div className="mb-3 font-medium">Get a new local number</div>
                  <div className="grid grid-cols-[110px_1fr] gap-2">
                    <input name="areaCode" placeholder="Area code" maxLength={3} inputMode="numeric" className="input" />
                    <select name="source" className="input">{SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
                  </div>
                  <div className="mt-3"><SubmitButton pendingLabel="Buying…">Buy number</SubmitButton></div>
                  {!features.twilio && <p className="mt-2 text-[12px] text-ink-3">Needs Twilio credentials on the server.</p>}
                </ActionForm>
                <ActionForm action={addTrackingNumberAction} className="rounded-lg border border-line p-4" resetOnSuccess>
                  <input type="hidden" name="businessId" value={b.id} />
                  <input type="hidden" name="mode" value="existing" />
                  <div className="mb-3 font-medium">Use a number already in Twilio</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input name="phoneNumber" placeholder="+1 555 123 4567" className="input" />
                    <select name="source" className="input">{SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
                  </div>
                  <div className="mt-3"><SubmitButton variant="ghost">Connect number</SubmitButton></div>
                </ActionForm>
              </div>
            ) : (
              numbers.length === 0 && <p className="text-[13px] text-ink-3">Your agency will add tracking numbers for you.</p>
            )}
          </div>
        </Section>

        <Section id="google" title="Google Business Profile" desc="Syncs reviews and profile health, and lets you reply to reviews from here.">
          {!conn ? (
            <div>
              <a href={`/api/google/connect?businessId=${b.id}`} className="btn-primary">Connect Google</a>
              {!features.google && <p className="mt-2 text-[12px] text-ink-3">Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server.</p>}
            </div>
          ) : !conn.locationName ? (
            <div>
              {locationsError && <Notice tone="bad">{locationsError}</Notice>}
              {locations.length > 0 && (
                <form action={chooseGoogleLocationAction} className="space-y-2">
                  <input type="hidden" name="businessId" value={b.id} />
                  {locations.map((l) => (
                    <label key={l.locationName} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line p-3 hover:bg-line-2/50">
                      <input type="radio" name="location" value={`${l.accountName}|${l.locationName}|${l.title}`} required className="mt-1" />
                      <span><span className="font-medium">{l.title}</span><span className="block text-[12px] text-ink-3">{l.address || l.locationName}</span></span>
                    </label>
                  ))}
                  <button className="btn-primary">Use this location</button>
                </form>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{conn.locationTitle}</span>
                  <Badge tone={conn.lastError ? "bad" : "good"}>{conn.lastError ? "Sync error" : "Connected"}</Badge>
                </div>
                <div className="mt-1 text-[12.5px] text-ink-3">
                  {conn.googleEmail} · last synced {timeAgo(conn.lastSyncedAt)}
                </div>
                {conn.lastError && <p className="mt-2 text-[12.5px] text-bad">{conn.lastError}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionForm action={syncGoogleAction}>
                  <input type="hidden" name="businessId" value={b.id} />
                  <SubmitButton variant="ghost" pendingLabel="Syncing…">Sync now</SubmitButton>
                </ActionForm>
                <form action={disconnectGoogleAction}>
                  <input type="hidden" name="businessId" value={b.id} />
                  <button className="btn-danger">Disconnect</button>
                </form>
              </div>
            </div>
          )}
        </Section>

        <Section id="form" title="Website lead form" desc="Paste this on the client's website. Leads land in the inbox and get an instant text back.">
          <div className="rounded-lg border border-line bg-canvas">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="text-[12px] text-ink-3">HTML</span>
              <CopyButton text={snippet} label="Copy code" />
            </div>
            <pre className="overflow-x-auto p-3 text-[12px] leading-relaxed text-ink-2"><code>{snippet}</code></pre>
          </div>
          <p className="mt-3 text-[12.5px] text-ink-3">
            Already have a form? POST <code className="rounded bg-line-2 px-1">name</code>, <code className="rounded bg-line-2 px-1">phone</code>, <code className="rounded bg-line-2 px-1">email</code>, <code className="rounded bg-line-2 px-1">message</code> (JSON or form data) to <span className="break-all">{endpoint}</span>
          </p>
          <p className="mt-1 text-[12.5px] text-ink-3">Last submission: {b.formLastSeenAt ? timeAgo(b.formLastSeenAt) : "never"}</p>
        </Section>

        {agency && (
          <Section id="team" title="Client logins" desc="Give the owner their own login. They only see this business.">
            {clients.length > 0 && (
              <ul className="mb-4 divide-y divide-line-2 rounded-lg border border-line">
                {clients.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div><div className="font-medium">{c.name}</div><div className="text-[12px] text-ink-3">{c.email}</div></div>
                    <form action={removeClientLoginAction}>
                      <input type="hidden" name="businessId" value={b.id} />
                      <input type="hidden" name="userId" value={c.id} />
                      <button className="text-[13px] text-bad hover:underline">Remove access</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={addClientLoginAction} className="grid gap-2 sm:grid-cols-3" resetOnSuccess>
              <input type="hidden" name="businessId" value={b.id} />
              <input name="name" placeholder="Owner name" className="input" required />
              <input name="email" type="email" placeholder="Email" className="input" required />
              <input name="password" type="text" placeholder="Temporary password" className="input" minLength={8} />
              <div className="sm:col-span-3"><SubmitButton>Give access</SubmitButton></div>
            </ActionForm>
          </Section>
        )}
      </div>
    </>
  );
}
