import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { Logo } from "@/components/ui";
import { liveHandoff } from "@/lib/handoff";
import { PhonePhoto } from "./PhonePhoto";

export const metadata = { title: "Send a homework photo", robots: { index: false } };

/** Opened on a phone from the QR code on the computer: takes a homework photo and sends it over. */
export default async function PhonePhotoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const handoff = await liveHandoff(token);
  const [student] = handoff
    ? await (await getDb()).select({ name: schema.students.name }).from(schema.students).where(eq(schema.students.id, handoff.studentId))
    : [];

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <Logo />
      <div className="card mt-6 space-y-4">
        {handoff && student ? (
          <>
            <div>
              <h1 className="text-2xl font-extrabold">Hi {student.name}! 📷</h1>
              <p className="mt-1 text-slate-600">Take a photo of your homework. It will show up on your computer.</p>
            </div>
            <PhonePhoto token={token} />
          </>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold">This link has expired</h1>
            <p className="text-slate-600">On your computer, click &ldquo;Use my phone&rdquo; again to get a new code.</p>
          </>
        )}
      </div>
    </main>
  );
}
