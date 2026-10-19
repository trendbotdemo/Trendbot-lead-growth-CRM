import Link from "next/link";
import { and, desc, eq, isNull, lte } from "drizzle-orm";
import clsx from "clsx";
import { db, schema } from "@/db";
import { requireBusiness } from "@/lib/auth";
import { features } from "@/lib/env";
import { getConnection } from "@/lib/google";
import { timeAgo } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Empty, Notice, PageHeader, Stars } from "@/components/ui";
import { draftReplyAction, postReplyAction } from "../../../actions";

export const metadata = { title: "Reviews" };
const FILTERS = { all: "All", unreplied: "Needs reply", negative: "1–3 stars" } as const;

export default async function ReviewsPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ filter?: string }> }) {
  const { businessId } = await params;
  const { filter: f } = await searchParams;
  const filter = (f && f in FILTERS ? f : "all") as keyof typeof FILTERS;
  const { business } = await requireBusiness(businessId);
  const base = `/b/${business.id}/reviews`;

  const where = and(
    eq(schema.reviews.businessId, business.id),
    filter === "unreplied" ? isNull(schema.reviews.replyComment) : undefined,
    filter === "negative" ? lte(schema.reviews.rating, 3) : undefined,
  );
  const [rows, conn] = await Promise.all([
    db.select().from(schema.reviews).where(where).orderBy(desc(schema.reviews.reviewedAt)).limit(200),
    getConnection(business.id),
  ]);

  return (
    <>
      <PageHeader title="Reviews" subtitle="Reply to every review — AI writes a personal draft you can edit before posting." />
      {!conn?.locationName && (
        <Notice tone="warn">
          Google isn&apos;t connected, so replies are saved here only. <Link href={`/b/${business.id}/settings#google`} className="font-medium underline">Connect Google Business Profile</Link> to sync reviews and publish replies.
        </Notice>
      )}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {Object.entries(FILTERS).map(([k, label]) => (
          <Link key={k} href={k === "all" ? base : `${base}?filter=${k}`} className={clsx("rounded-full border px-3 py-1 text-[13px]", k === filter ? "border-ink bg-ink text-white" : "border-line bg-panel text-ink-2 hover:text-ink")}>
            {label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card"><Empty title={filter === "unreplied" ? "All caught up" : "No reviews yet"} body={filter === "unreplied" ? "Every review has a reply." : undefined} /></div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <article key={r.id} className="card card-pad">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-line-2 text-[13px] font-semibold text-ink-2">{(r.reviewerName ?? "?").charAt(0)}</div>
                  <div>
                    <div className="font-medium">{r.reviewerName}</div>
                    <div className="text-[12px] text-ink-3">{timeAgo(r.reviewedAt)} · {r.source === "google" ? "Google" : r.source}</div>
                  </div>
                </div>
                <Stars rating={r.rating} />
              </div>
              {r.comment ? <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed">{r.comment}</p> : <p className="mt-3 text-ink-3">Rating only, no text.</p>}

              {r.replyComment ? (
                <div className="mt-4 rounded-lg border-l-2 border-brand bg-brand-soft/50 px-3.5 py-2.5">
                  <div className="text-[12px] font-medium text-brand-ink">Your reply · {timeAgo(r.repliedAt)}</div>
                  <p className="mt-1 whitespace-pre-wrap text-[13.5px]">{r.replyComment}</p>
                </div>
              ) : (
                <div className="mt-4 border-t border-line-2 pt-4">
                  <ActionForm action={postReplyAction} className="space-y-2">
                    <input type="hidden" name="businessId" value={business.id} />
                    <input type="hidden" name="reviewId" value={r.id} />
                    <textarea
                      key={r.aiDraft ?? "empty"}
                      name="comment"
                      rows={3}
                      defaultValue={r.aiDraft ?? ""}
                      className="input"
                      placeholder="Write a reply, or let AI draft one…"
                    />
                    <div className="flex flex-wrap gap-2">
                      <SubmitButton pendingLabel="Posting…">{conn?.locationName ? "Post reply to Google" : "Save reply"}</SubmitButton>
                      <button formAction={draftReplyAction} className="btn-ghost">{r.aiDraft ? "Redraft with AI" : "Draft with AI"}</button>
                    </div>
                  </ActionForm>
                  {!features.ai && !r.aiDraft && <p className="mt-2 text-[12px] text-ink-3">Add ANTHROPIC_API_KEY for fully personalised drafts — a smart template is used until then.</p>}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
