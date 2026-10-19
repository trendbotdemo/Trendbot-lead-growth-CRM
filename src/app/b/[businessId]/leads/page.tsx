import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import clsx from "clsx";
import { db, schema } from "@/db";
import { requireBusiness } from "@/lib/auth";
import { money, timeAgo } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Empty, PageHeader, leadStatusTone } from "@/components/ui";
import { createLeadAction } from "../../../actions";

export const metadata = { title: "Leads" };
const STATUSES = ["all", ...schema.leadStatus.enumValues] as const;

export default async function LeadsPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ status?: string; add?: string }> }) {
  const { businessId } = await params;
  const sp = await searchParams;
  const { business } = await requireBusiness(businessId);
  const status = STATUSES.includes(sp.status as never) ? (sp.status as (typeof STATUSES)[number]) : "all";
  const base = `/b/${business.id}/leads`;

  const rows = await db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.businessId, business.id), status === "all" ? undefined : eq(schema.leads.status, status)))
    .orderBy(desc(schema.leads.lastActivityAt))
    .limit(200);

  const channelLabel = { call: "Call", sms: "Text", form: "Web form", manual: "Manual" } as const;

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle="Every call, text and form in one inbox. Mark jobs won with their value to track revenue."
        actions={<Link href={`${base}?add=1`} className="btn-primary">Add lead</Link>}
      />

      {sp.add && (
        <div className="card card-pad mb-5">
          <h2 className="mb-3 font-semibold">Add a lead manually</h2>
          <ActionForm action={createLeadAction} className="grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="businessId" value={business.id} />
            <input name="name" placeholder="Name" className="input" />
            <input name="phone" placeholder="Phone" className="input" />
            <input name="email" placeholder="Email" className="input" />
            <input name="source" placeholder="Source (e.g. Referral)" className="input" />
            <textarea name="notes" placeholder="Notes" className="input sm:col-span-4" rows={2} />
            <div className="flex gap-2 sm:col-span-4">
              <SubmitButton>Save lead</SubmitButton>
              <Link href={base} className="btn-ghost">Cancel</Link>
            </div>
          </ActionForm>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={s === "all" ? base : `${base}?status=${s}`}
            className={clsx("rounded-full border px-3 py-1 text-[13px] capitalize", s === status ? "border-ink bg-ink text-white" : "border-line bg-panel text-ink-2 hover:text-ink")}
          >
            {s}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty title="No leads here" body="New calls, texts and website forms will show up automatically." /> : (
          <table className="table min-w-[680px]">
            <thead><tr><th>Lead</th><th>Source</th><th>Channel</th><th>Status</th><th>Value</th><th>Last activity</th></tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="hover:bg-line-2/50">
                  <td>
                    <Link href={`${base}/${l.id}`} className="font-medium hover:text-brand">{l.name || formatPhone(l.phone) || l.email}</Link>
                    {l.name && <div className="text-[12px] text-ink-3">{formatPhone(l.phone) !== "—" ? formatPhone(l.phone) : l.email}</div>}
                  </td>
                  <td className="text-ink-2">{l.source}</td>
                  <td className="text-ink-2">{channelLabel[l.channel]}</td>
                  <td>
                    <Badge tone={leadStatusTone[l.status]}>{l.status}</Badge>
                    {!l.firstResponseAt && l.status === "new" && <span className="ml-1.5 text-[12px] text-warn">no reply yet</span>}
                  </td>
                  <td className="tabular-nums">{l.valueCents ? money(l.valueCents) : "—"}</td>
                  <td className="text-ink-2">{timeAgo(l.lastActivityAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
