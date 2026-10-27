"use client";

import { useFormStatus } from "react-dom";

/** A submit button that shows progress while its form's server action runs. */
export function PendingButton({ children, pendingText, className }: { children: React.ReactNode; pendingText: string; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending}>{pending ? pendingText : children}</button>;
}
