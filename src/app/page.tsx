import { redirect } from "next/navigation";
import { getCurrentUser, isAgencyUser, listAccessibleBusinesses } from "@/lib/auth";
import { logoutAction } from "./actions";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (isAgencyUser(user)) redirect("/agency");
  const [first] = await listAccessibleBusinesses(user);
  if (first) redirect(`/b/${first.id}`);
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <p className="font-medium">Your account isn&apos;t linked to a business yet.</p>
        <p className="mt-1 text-ink-2">Ask your agency to give you access.</p>
        <form action={logoutAction} className="mt-4">
          <button className="btn-ghost">Log out</button>
        </form>
      </div>
    </main>
  );
}
