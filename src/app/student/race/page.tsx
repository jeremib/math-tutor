import { and, eq, isNotNull, max } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStudent } from "@/lib/auth";
import { raceOpsFor } from "@/lib/race";
import { RaceRunner } from "./RaceRunner";

export const dynamic = "force-dynamic";

export default async function RacePage() {
  const { student } = await requireStudent();
  const db = await getDb();
  const bests = await db.select({ op: schema.factRaces.op, best: max(schema.factRaces.correct) }).from(schema.factRaces)
    .where(and(eq(schema.factRaces.studentId, student.id), isNotNull(schema.factRaces.finishedAt)))
    .groupBy(schema.factRaces.op);
  const bestByOp = Object.fromEntries(bests.map((b) => [b.op, b.best ?? 0]));
  return <RaceRunner ops={raceOpsFor(student.grade).map((o) => ({ ...o, best: bestByOp[o.op] ?? null }))} />;
}
