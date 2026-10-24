"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/app/actions/auth";

/** A form bound to a server action that shows errors and a saved message, and optionally resets on success. */
export function ActionForm({ action, children, submit, resetOnSuccess, successText, className }: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  children: React.ReactNode;
  submit: string;
  resetOnSuccess?: boolean;
  successText?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const succeeded = state !== undefined && !state.error;
  useEffect(() => {
    if (succeeded && resetOnSuccess) ref.current?.reset();
  }, [state, succeeded, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className ?? "space-y-4"}>
      {state?.error && <p className="error">{state.error}</p>}
      {children}
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? "Saving…" : submit}</button>
        {succeeded && !pending && successText && <span className="text-sm font-semibold text-emerald-600">{successText}</span>}
      </div>
    </form>
  );
}
