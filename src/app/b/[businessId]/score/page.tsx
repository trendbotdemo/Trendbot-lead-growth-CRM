import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireBusiness } from "@/lib/auth";
import { refreshScore } from "@/lib/score";
import { CategoryBar, ScoreRing } from "@/components/charts";
import { Empty, PageHeader } from "@/components/ui";
import { recalcScoreAction } from "../../../actions";

export const metadata = { title: "Growth score" };

export default async function ScorePage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { business } = await requireBusiness(businessId);
  const score = await refreshScore(business);
  const history = await db
    .select({ total: schema.scoreSnapshots.total, at: schema.scoreSnapshots.createdAt })
    .from(schema.scoreSnapshots)
    .where(eq(schema.scoreSnapshots.businessId, business.id))
    .orderBy(desc(schema.scoreSnapshots.createdAt))
    .limit(8);

  const verdict = score.total >= 75 ? "Strong — keep the momentum." : score.total >= 50 ? "Decent, with clear wins available." : "Losing jobs to competitors — start with the top fixes below.";

  return (
    <>
      <PageHeader
        title="Growth score"
        subtitle="How well this business gets found, gets chosen, and catches every lead."
        actions={
          <form action={recalcScoreAction}>
            <input type="hidden" name="businessId" value={business.id} />
            <button className="btn-ghost">Recalculate</button>
          </form>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <div className="space-y-5">
          <div className="card card-pad text-center">
            <div className="flex justify-center"><ScoreRing score={score.total} size={156} /></div>
            <p className="mt-3 text-ink-2">{verdict}</p>
          </div>
          <div className="card card-pad space-y-4">
            {score.categories.map((c) => <CategoryBar key={c.key} label={c.label} score={c.score} max={c.max} />)}
          </div>
          {history.length > 1 && (
            <div className="card card-pad">
              <h3 className="mb-2 text-[13px] font-semibold">History</h3>
              <ul className="space-y-1 text-[13px]">
                {history.map((h, i) => (
                  <li key={i} className="flex justify-between text-ink-2">
                    <span>{h.at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    <span className="tabular-nums font-medium text-ink">{h.total}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="card">
          <div className="border-b border-line px-5 py-3.5">
            <h2 className="font-semibold">What to fix, in order</h2>
            <p className="text-[13px] text-ink-3">Sorted by points gained.</p>
          </div>
          {score.recommendations.length === 0 ? <Empty title="Nothing to fix" body="This profile is in great shape." /> : (
            <ol className="divide-y divide-line-2">
              {score.recommendations.map((r, i) => (
                <li key={r.key} className="flex gap-4 px-5 py-4">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-line-2 text-[12px] font-semibold text-ink-2">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{r.title}</span>
                      <span className="text-[12.5px] font-medium text-good">+{r.impact} pts</span>
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink-2">{r.detail}</p>
                    {r.href && <Link href={r.href} className="mt-1.5 inline-block text-[13px] font-medium text-brand">Fix this →</Link>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </>
  );
}
