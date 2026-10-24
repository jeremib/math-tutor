import { AppHeader } from "@/components/ui";
import { requireStudent } from "@/lib/auth";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { student } = await requireStudent();
  const links = [{ href: "/student", label: "Home" }, { href: "/student/drill", label: "Daily drill" }];
  if (student.homeworkEnabled) links.push({ href: "/student/homework", label: "Homework help" });
  return (
    <>
      <AppHeader who={`${student.avatar} ${student.name}`} links={links} />
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </>
  );
}
