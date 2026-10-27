import { NextResponse } from "next/server";
import { and, eq, isNotNull, isNull, max, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getStudent } from "@/lib/auth";
import { awardForRace } from "@/lib/achievements";
import { MAX_RACE_PROBLEMS, RACE_SECONDS, scoreRace } from "@/lib/race";

const body = z.object({ answers: z.array(z.string().max(10)).max(MAX_RACE_PROBLEMS) });
/** Allowance for slow networks between the timer ending and the answers arriving. */
const GRACE_SECONDS = 20;

/** Finishes a race: scores the answers against the seed's problems and awards XP. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getStudent();
  if (!auth) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const db = await getDb();
  const id = (await params).id;
  const [race] = await db.select().from(schema.factRaces)
    .where(and(eq(schema.factRaces.id, id), eq(schema.factRaces.studentId, auth.student.id), isNull(schema.factRaces.finishedAt)));
  if (!race) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (Date.now() - race.startedAt.getTime() > (RACE_SECONDS + GRACE_SECONDS) * 1000) {
    return NextResponse.json({ error: "That race timed out. Start a new one!" }, { status: 400 });
  }

  const { attempted, correct } = scoreRace(race.op, race.seed, parsed.data.answers);
  const [[previous], [finished]] = await Promise.all([
    db.select({ best: max(schema.factRaces.correct) }).from(schema.factRaces).where(and(
      eq(schema.factRaces.studentId, auth.student.id), eq(schema.factRaces.op, race.op), isNotNull(schema.factRaces.finishedAt), ne(schema.factRaces.id, race.id),
    )),
    db.update(schema.factRaces).set({ attempted, correct, finishedAt: new Date() })
      .where(and(eq(schema.factRaces.id, race.id), isNull(schema.factRaces.finishedAt))).returning(),
  ]);
  if (!finished) return NextResponse.json({ error: "Already finished" }, { status: 409 });
  const rewards = await awardForRace(auth.student.id, auth.family.timezone, race.id, correct);
  const best = previous?.best ?? null;
  return NextResponse.json({ attempted, correct, previousBest: best, newBest: best === null || correct > best, rewards });
}
