import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import clsx from "clsx";
import { db, schema } from "@/db";
import { requireBusiness } from "@/lib/auth";
import { duration, timeAgo } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, leadStatusTone } from "@/components/ui";
import { sendLeadMessageAction, updateLeadAction } from "../../../../actions";

export const metadata = { title: "Lead" };

export default async function LeadPage({ params }: { params: Promise<{ businessId: string; leadId: string }> }) {
  const { businessId, leadId } = await params;
  const { business } = await requireBusiness(businessId);
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) notFound();
  const [lead] = await db.select().from(schema.leads).where(and(eq(schema.leads.id, leadId), eq(schema.leads.businessId, business.id))).limit(1);
  if (!lead) notFound();

  const [msgs, leadCalls] = await Promise.all([
    db.select().from(schema.messages).where(eq(schema.messages.leadId, lead.id)).orderBy(asc(schema.messages.createdAt)),
    db.select().from(schema.calls).where(eq(schema.calls.leadId, lead.id)).orderBy(desc(schema.calls.startedAt)),
  ]);

  type Item = { at: Date; kind: "msg"; m: (typeof msgs)[number] } | { at: Date; kind: "call"; c: (typeof leadCalls)[number] };
  const timeline: Item[] = [
    ...msgs.map((m) => ({ at: m.createdAt, kind: "msg" as const, m })),
    ...leadCalls.map((c) => ({ at: c.startedAt, kind: "call" as const, c })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const title = lead.name || formatPhone(lead.phone) || lead.email || "Lead";

  return (
    <>
      <Link href={`/b/${business.id}/leads`} className="text-[13px] text-ink-3 hover:text-ink">← Leads</Link>
      <div className="mt-2 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        <Badge tone={leadStatusTone[lead.status]}>{lead.status}</Badge>
        <span className="text-ink-3">{lead.source} · created {timeAgo(lead.createdAt)}</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="card flex min-h-[420px] flex-col">
          <div className="border-b border-line px-5 py-3.5 font-semibold">Conversation</div>
          <div className="flex-1 space-y-3 px-5 py-4">
            {timeline.length === 0 && <p className="text-ink-3">No activity yet.</p>}
            {timeline.map((it) =>
              it.kind === "call" ? (
                <div key={`c${it.c.id}`} className="flex justify-center">
                  <span className={clsx("rounded-full px-3 py-1 text-[12px]", it.c.status === "missed" ? "bg-bad-soft text-bad" : "bg-line-2 text-ink-2")}>
                    {it.c.status === "missed" ? "Missed call" : it.c.status === "completed" ? `Call answered · ${duration(it.c.durationSec)}` : "Call ringing"} · {timeAgo(it.c.startedAt)}
                  </span>
                </div>
              ) : (
                <div key={it.m.id} className={clsx("flex", it.m.direction === "outbound" ? "justify-end" : "justify-start")}>
                  <div className={clsx("max-w-[80%] rounded-2xl px-3.5 py-2 text-[13.5px]", it.m.direction === "outbound" ? "rounded-br-md bg-brand text-white" : "rounded-bl-md bg-line-2")}>
                    <p className="whitespace-pre-wrap">{it.m.body}</p>
                    <div className={clsx("mt-1 text-[11px]", it.m.direction === "outbound" ? "text-white/70" : "text-ink-3")}>
                      {it.m.automated ? "Automatic · " : ""}{timeAgo(it.m.createdAt)}
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>
          <div className="border-t border-line p-4">
            {lead.phone ? (
              <ActionForm action={sendLeadMessageAction} resetOnSuccess className="flex gap-2">
                <input type="hidden" name="businessId" value={business.id} />
                <input type="hidden" name="leadId" value={lead.id} />
                <input name="body" className="input" placeholder={`Text ${formatPhone(lead.phone)}…`} autoComplete="off" />
                <SubmitButton variant="brand" pendingLabel="Sending…">Send</SubmitButton>
              </ActionForm>
            ) : (
              <p className="text-[13px] text-ink-3">No phone number — reply by email: {lead.email}</p>
            )}
          </div>
        </div>

        <div className="card card-pad h-fit">
          <h2 className="mb-4 font-semibold">Details</h2>
          <ActionForm action={updateLeadAction} className="space-y-3">
            <input type="hidden" name="businessId" value={business.id} />
            <input type="hidden" name="leadId" value={lead.id} />
            <div><label className="label">Name</label><input name="name" defaultValue={lead.name ?? ""} className="input" /></div>
            <div><label className="label">Phone</label><div className="text-[13.5px]">{formatPhone(lead.phone)}</div></div>
            <div><label className="label">Email</label><input name="email" defaultValue={lead.email ?? ""} className="input" /></div>
            <div>
              <label className="label">Status</label>
              <select name="status" defaultValue={lead.status} className="input capitalize">
                {schema.leadStatus.enumValues.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Job value ($)</label>
              <input name="value" inputMode="decimal" defaultValue={lead.valueCents ? (lead.valueCents / 100).toString() : ""} className="input" placeholder="e.g. 450" />
              <p className="mt-1 text-[12px] text-ink-3">Counts toward revenue when status is “won”.</p>
            </div>
            <div><label className="label">Notes</label><textarea name="notes" defaultValue={lead.notes ?? ""} rows={3} className="input" /></div>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </div>
      </div>
    </>
  );
}
