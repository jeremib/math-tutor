import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getStudent } from "@/lib/auth";
import { raceOpsFor } from "@/lib/race";

const body = z.object({ op: z.enum(["add", "sub", "mul", "div"]) });

/** Starts a race. The client builds the problems from the seed; the server re-checks them at the end. */
export async function POST(req: Request) {
  const auth = await getStudent();
  if (!auth) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !raceOpsFor(auth.student.grade).some((o) => o.op === parsed.data.op)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const db = await getDb();
  const seed = Math.floor(Math.random() * 2 ** 31);
  const [race] = await db.insert(schema.factRaces).values({ studentId: auth.student.id, op: parsed.data.op, seed }).returning();
  return NextResponse.json({ id: race.id, seed });
}
