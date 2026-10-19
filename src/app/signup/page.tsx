import Link from "next/link";
import { count } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { Logo } from "@/components/brand";
import { ActionForm, SubmitButton } from "@/components/forms";
import { signupAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create agency account" };

export default async function SignupPage() {
  const [{ n }] = await db.select({ n: count() }).from(schema.users);
  const open = n === 0 || env.ALLOW_SIGNUP === "true";
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="card p-6">
          <h1 className="text-lg font-semibold">Create your agency account</h1>
          {open ? (
            <ActionForm action={signupAction} className="mt-5 space-y-4">
              <div><label className="label" htmlFor="agency">Agency name</label><input id="agency" name="agency" required className="input" placeholder="TrendBot Agency" /></div>
              <div><label className="label" htmlFor="name">Your name</label><input id="name" name="name" required className="input" /></div>
              <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="input" /></div>
              <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" minLength={8} required className="input" /></div>
              <SubmitButton className="w-full" pendingLabel="Creating…">Create account</SubmitButton>
            </ActionForm>
          ) : (
            <p className="mt-2 text-ink-2">Sign-up is closed. Ask your agency admin for a login.</p>
          )}
        </div>
        <p className="mt-4 text-center text-ink-2">Already have an account? <Link href="/login" className="font-medium text-brand">Log in</Link></p>
      </div>
    </main>
  );
}
