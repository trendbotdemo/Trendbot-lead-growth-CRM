import Link from "next/link";
import { redirect } from "next/navigation";
import { count } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { Logo } from "@/components/brand";
import { ActionForm, SubmitButton } from "@/components/forms";
import { loginAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const [{ n }] = await db.select({ n: count() }).from(schema.users);
  const canSignUp = n === 0 || env.ALLOW_SIGNUP === "true";
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="card p-6">
          <h1 className="text-lg font-semibold">Log in</h1>
          <p className="mt-1 text-ink-2">Calls, leads and reviews in one place.</p>
          <ActionForm action={loginAction} className="mt-5 space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required autoComplete="email" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
            </div>
            <SubmitButton className="w-full" pendingLabel="Logging in…">Log in</SubmitButton>
          </ActionForm>
        </div>
        {canSignUp && (
          <p className="mt-4 text-center text-ink-2">
            Setting up your agency? <Link href="/signup" className="font-medium text-brand">Create an account</Link>
          </p>
        )}
      </div>
    </main>
  );
}
