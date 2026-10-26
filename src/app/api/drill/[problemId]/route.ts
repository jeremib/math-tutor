import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudent } from "@/lib/auth";
import { actOnProblem } from "@/lib/learning";

const body = z.union([
  z.object({ type: z.literal("answer"), answer: z.string().max(50) }),
  z.object({ type: z.literal("hint") }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ problemId: string }> }) {
  const session = await getStudent();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const result = await actOnProblem(session.student.id, session.family.timezone, (await params).problemId, parsed.data);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result);
}
