import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { Logo } from "@/components/ui";
import { studentLogin } from "@/app/actions/auth";

export default async function StudentLoginPage({ searchParams }: { searchParams: Promise<{ code?: string; u?: string }> }) {
  const params = await searchParams;
  const code = typeof params.code === "string" ? params.code.trim().toUpperCase().slice(0, 20) : "";
  const username = typeof params.u === "string" ? params.u.trim().toLowerCase().slice(0, 40) : "";
  // A login link from a parent fills in the family code and username, so only the PIN is left.
  const fromLink = !!(code && username);

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Logo />
      <div className="card mt-6">
        <h1 className="text-2xl font-extrabold">{fromLink ? `Hi, @${username}! 👋` : "Hi there! 👋"}</h1>
        <p className="mt-1 mb-5 text-slate-600">
          {fromLink ? "Type your PIN to start." : "Ask a grown-up for your family code if you don’t know it."}
        </p>
        <AuthForm
          action={studentLogin}
          submit="Let's go!"
          fields={[
            { name: "code", label: "Family code", placeholder: "OWL-1234", defaultValue: code || undefined, hidden: fromLink },
            { name: "username", label: "Your username", autoComplete: "username", defaultValue: username || undefined, hidden: fromLink },
            { name: "pin", label: "PIN", type: "password", inputMode: "numeric", autoComplete: "current-password", autoFocus: fromLink },
          ]}
        />
        {fromLink && (
          <p className="mt-4 text-center text-sm">
            <Link href="/student-login" className="font-semibold text-slate-500 hover:underline">Not you?</Link>
          </p>
        )}
      </div>
      <p className="mt-4 text-center text-sm text-slate-600">
        <Link href="/login" className="font-semibold text-brand-600">Parent login</Link>
      </p>
    </main>
  );
}
