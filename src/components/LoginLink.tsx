"use client";

import { useEffect, useState } from "react";

/** A student's login link (family code and username filled in) with a copy button. */
export function LoginLink({ code, username }: { code: string; username: string }) {
  const path = `/student-login?${new URLSearchParams({ code, u: username })}`;
  const [url, setUrl] = useState(path);
  const [copied, setCopied] = useState(false);
  useEffect(() => setUrl(window.location.origin + path), [path]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the link is still there to select by hand.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Login link"
        className="input min-w-0 flex-1 py-1.5 font-mono text-xs text-slate-600" />
      <button type="button" onClick={copy} className="btn-secondary py-1.5 text-sm">{copied ? "Copied!" : "Copy link"}</button>
    </div>
  );
}
