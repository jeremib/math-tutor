"use client";

import { useEffect, useState } from "react";

/**
 * Registers the production service worker and offers a refresh when a new
 * build takes control. Development skips registration so HMR isn't cached.
 * The first install does not prompt; a later controller change does, so a
 * drill in progress isn't reloaded until someone taps Refresh.
 */
export function ServiceWorkerRegister() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let hadController = !!navigator.serviceWorker.controller;

    const onControllerChange = () => {
      if (hadController) setUpdateReady(true);
      hadController = true;
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Private mode and older browsers can reject registration. The site still works online.
    });

    const checkForUpdate = () => {
      navigator.serviceWorker.getRegistration("/").then((registration) => registration?.update()).catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", checkForUpdate);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", checkForUpdate);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <>
      <div className="h-12" aria-hidden />
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-x-0 top-0 z-[70] flex h-12 items-center justify-center gap-3 bg-brand-700 px-4 text-sm font-semibold text-white"
      >
        <span>A new version of Math Buddy is ready.</span>
        <button
          type="button"
          className="rounded-lg bg-white px-3 py-1 font-bold text-brand-700"
          onClick={() => window.location.reload()}
        >
          Refresh
        </button>
      </div>
    </>
  );
}
