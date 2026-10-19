"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import clsx from "clsx";

const PendingContext = createContext(false);

export type ActionState = { ok?: boolean; error?: string; message?: string } | null;
type Action = (prev: ActionState, data: FormData) => Promise<ActionState>;

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        // Submit manually so React doesn't auto-clear the fields (e.g. keep the email after a failed login).
        // Buttons with their own formAction keep the native behaviour.
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        if (submitter?.hasAttribute("formaction")) return;
        e.preventDefault();
        const data = new FormData(e.currentTarget, submitter);
        startTransition(() => formAction(data));
      }}
    >
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
      {state?.error && <p className="mt-2 text-[13px] text-bad">{state.error}</p>}
      {state?.ok && state.message && <p className="mt-2 text-[13px] text-good">{state.message}</p>}
    </form>
  );
}

export function SubmitButton({ children, variant = "primary", className, pendingLabel, name, value }: {
  children: React.ReactNode;
  variant?: "primary" | "brand" | "ghost" | "danger";
  className?: string;
  pendingLabel?: string;
  name?: string;
  value?: string;
}) {
  const status = useFormStatus();
  const ctxPending = useContext(PendingContext);
  const pending = status.pending || ctxPending;
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={clsx(`btn-${variant}`, className)}>
      {pending ? pendingLabel ?? "Saving…" : children}
    </button>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
