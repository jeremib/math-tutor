import { AppHeader } from "@/components/ui";
import { requireParent } from "@/lib/auth";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const { parent, family } = await requireParent();
  return (
    <>
      <AppHeader who={`${parent.name} · ${family.name}`} links={[{ href: "/parent", label: "Dashboard" }, { href: "/parent/reports", label: "Weekly reports" }]} />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </>
  );
}
