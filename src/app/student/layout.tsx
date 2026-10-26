import Link from "next/link";
import { AppHeader } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { dailyCheckIn, totalXp } from "@/lib/achievements";
import { Celebration } from "@/components/Celebration";
import { levelInfo } from "@/lib/gamification";
import { getDb } from "@/db";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { student, family } = await requireStudent();
  // Any visit on a new day counts as the daily check-in.
  const checkIn = await dailyCheckIn(student.id, family.timezone);
  const { level, xp } = levelInfo(await totalXp(await getDb(), student.id));
  const links = [{ href: "/student", label: "Home" }, { href: "/student/drill", label: "Daily drill" }];
  if (student.homeworkEnabled) links.push({ href: "/student/homework", label: "Homework help" });
  links.push({ href: "/student/trophies", label: "Trophies" });
  return (
    <>
      <AppHeader
        who={`${student.avatar} ${student.name}`}
        links={links}
        extra={
          <Link href="/student/trophies" className="mr-1 rounded-full bg-amber-100 px-3 py-1.5 font-bold text-amber-800" title={`${xp} XP`}>
            Lv {level} · ⚡{xp}
          </Link>
        }
      />
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
      <Celebration award={checkIn} />
    </>
  );
}
