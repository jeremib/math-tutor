"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/app/actions/auth";

type Field = {
  name: string; label: string; type?: string; placeholder?: string; autoComplete?: string; inputMode?: "numeric" | "text" | "email";
  defaultValue?: string; autoFocus?: boolean;
  /** Sent with the form but not shown, e.g. values that came from a login link. */
  hidden?: boolean;
};

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
      {fields.map((f) => f.hidden ? <input key={f.name} type="hidden" name={f.name} value={f.defaultValue ?? ""} /> : (
        <div key={f.name}>
          <label className="label" htmlFor={f.name}>{f.label}</label>
          <input id={f.name} name={f.name} type={f.type ?? "text"} placeholder={f.placeholder} autoComplete={f.autoComplete} inputMode={f.inputMode}
            defaultValue={f.defaultValue} autoFocus={f.autoFocus} required className="input" />
        </div>
      ))}
      {withTimezone && <input type="hidden" name="timezone" ref={tz} />}
      <button className="btn w-full" disabled={pending}>{pending ? "One moment…" : submit}</button>
    </form>
  );
}
