import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { Logo } from "@/components/ui";
import { studentLogin } from "@/app/actions/auth";

export default function StudentLoginPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Logo />
      <div className="card mt-6">
        <h1 className="text-2xl font-extrabold">Hi there! 👋</h1>
        <p className="mt-1 mb-5 text-slate-600">Ask a grown-up for your family code if you don&apos;t know it.</p>
        <AuthForm
          action={studentLogin}
          submit="Let's go!"
          fields={[
            { name: "code", label: "Family code", placeholder: "OWL-1234" },
            { name: "username", label: "Your username", autoComplete: "username" },
            { name: "pin", label: "PIN", type: "password", inputMode: "numeric", autoComplete: "current-password" },
          ]}
        />
      </div>
      <p className="mt-4 text-center text-sm text-slate-600">
        <Link href="/login" className="font-semibold text-brand-600">Parent login</Link>
      </p>
    </main>
  );
}
