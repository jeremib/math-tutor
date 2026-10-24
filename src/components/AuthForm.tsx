"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/app/actions/auth";

type Field = { name: string; label: string; type?: string; placeholder?: string; autoComplete?: string; inputMode?: "numeric" | "text" | "email" };

export function AuthForm({ action, fields, submit, withTimezone }: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  fields: Field[];
  submit: string;
  withTimezone?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const tz = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (tz.current) tz.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }, []);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && <p className="error">{state.error}</p>}
      {fields.map((f) => (
        <div key={f.name}>
          <label className="label" htmlFor={f.name}>{f.label}</label>
          <input id={f.name} name={f.name} type={f.type ?? "text"} placeholder={f.placeholder} autoComplete={f.autoComplete} inputMode={f.inputMode} required className="input" />
        </div>
      ))}
      {withTimezone && <input type="hidden" name="timezone" ref={tz} />}
      <button className="btn w-full" disabled={pending}>{pending ? "One moment…" : submit}</button>
    </form>
  );
}
