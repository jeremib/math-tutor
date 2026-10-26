import { Logo } from "@/components/ui";
import { RetryButton } from "./RetryButton";

export const dynamic = "force-static";

/** Shown by the service worker when a page can't load without a connection. */
export default function OfflinePage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10 text-center">
      <div className="flex justify-center"><Logo /></div>
      <div className="card mt-8">
        <div className="text-6xl">📡</div>
        <h1 className="mt-3 text-2xl font-extrabold">You&apos;re offline</h1>
        <p className="mt-2 text-slate-600">Math Buddy needs the internet to load your drills and save your progress. Check your Wi-Fi and try again.</p>
        <RetryButton />
      </div>
    </main>
  );
}
