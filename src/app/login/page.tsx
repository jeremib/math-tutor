import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { Logo } from "@/components/ui";
import { parentLogin } from "@/app/actions/auth";

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Logo />
      <div className="card mt-6">
        <h1 className="mb-5 text-2xl font-extrabold">Parent login</h1>
        <AuthForm
          action={parentLogin}
          submit="Log in"
          fields={[
            { name: "email", label: "Email", type: "email", autoComplete: "email" },
            { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
          ]}
        />
      </div>
      <p className="mt-4 text-center text-sm text-slate-600">
        New here? <Link href="/signup" className="font-semibold text-brand-600">Create a family account</Link>
        {" · "}
        <Link href="/student-login" className="font-semibold text-brand-600">Student login</Link>
      </p>
    </main>
  );
}
