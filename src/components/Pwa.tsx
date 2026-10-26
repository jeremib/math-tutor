"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DISMISS_KEY = "mb-install-dismissed";
/** Only suggest installing on the main screens, not mid-drill or mid-chat. */
const PROMPT_PATHS = ["/", "/parent", "/student"];

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Registers the service worker and offers an "Install app" banner where the browser supports it. */
export function Pwa() {
  const pathname = usePathname();
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
    if (isStandalone()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // iOS Safari has no install prompt; show Add to Home Screen steps instead.
    if (isIos()) setShowIosHelp(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    setInstallEvent(null);
    if (outcome === "dismissed") dismiss();
  }

  if (dismissed || !PROMPT_PATHS.includes(pathname) || (!installEvent && !showIosHelp)) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-slate-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="h-12 w-12 rounded-xl" />
        <div className="flex-1 text-sm">
          <div className="font-bold">Install Math Buddy</div>
          {installEvent ? (
            <div className="text-slate-600">Open it from your home screen like any other app.</div>
          ) : (
            <div className="text-slate-600">Tap <b>Share</b> <span aria-hidden>⎋</span> then <b>Add to Home Screen</b>.</div>
          )}
        </div>
        {installEvent && <button onClick={install} className="btn px-3 py-2 text-sm">Install</button>}
        <button onClick={dismiss} aria-label="Not now" className="rounded-lg px-2 py-1 text-xl text-slate-400 hover:bg-slate-100">×</button>
      </div>
    </div>
  );
}
