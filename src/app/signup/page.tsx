import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { Logo } from "@/components/ui";
import { signup } from "@/app/actions/auth";

export default function SignupPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Logo />
      <div className="card mt-6">
        <h1 className="text-2xl font-extrabold">Create your family account</h1>
        <p className="mt-1 mb-5 text-slate-600">You&apos;ll add your kids next. Each child gets their own login.</p>
        <AuthForm
          action={signup}
          withTimezone
          submit="Create account"
          fields={[
            { name: "familyName", label: "Family name", placeholder: "The Rivera Family" },
            { name: "name", label: "Your name", autoComplete: "name" },
            { name: "email", label: "Email", type: "email", autoComplete: "email" },
            { name: "password", label: "Password (8+ characters)", type: "password", autoComplete: "new-password" },
          ]}
        />
      </div>
      <p className="mt-4 text-center text-sm text-slate-600">
        Already have an account? <Link href="/login" className="font-semibold text-brand-600">Log in</Link>
      </p>
    </main>
  );
}
