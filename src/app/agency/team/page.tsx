import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAgencyUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, PageHeader } from "@/components/ui";
import { addTeammateAction } from "../../actions";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const user = await requireAgencyUser();
  const people = await db.select().from(schema.users).where(eq(schema.users.agencyId, user.agencyId)).orderBy(schema.users.createdAt);
  const label = { agency_owner: "Owner", agency_member: "Agency", client: "Client" } as const;
  return (
    <>
      <PageHeader title="Team" subtitle="Agency teammates see every client. Client logins are managed per business in its Settings." />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.name}</td>
                  <td className="text-ink-2">{p.email}</td>
                  <td><Badge tone={p.role === "client" ? "neutral" : "brand"}>{label[p.role]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {user.role === "agency_owner" && (
          <div className="card card-pad h-fit">
            <h2 className="font-semibold">Add a teammate</h2>
            <ActionForm action={addTeammateAction} className="mt-4 space-y-3" resetOnSuccess>
              <input name="name" placeholder="Name" className="input" required />
              <input name="email" type="email" placeholder="Email" className="input" required />
              <input name="password" type="text" placeholder="Temporary password (8+ chars)" className="input" required minLength={8} />
              <SubmitButton>Add teammate</SubmitButton>
            </ActionForm>
          </div>
        )}
      </div>
    </>
  );
}
