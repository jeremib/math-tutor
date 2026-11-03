import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { GRADE_LABELS, SKILLS_BY_ID } from "./curriculum";
import { askStructured } from "./ai";
import { revealsAnswer } from "./practice";
import { lessonTitles } from "./textbook";

const WhySchema = z.object({
  why: z.string().describe("Two or three short sentences, to the student, on why the hint's idea works for this problem. Never the answer or the final step."),
});

/**
 * Explains why a drill problem's hint works, once the student has asked for the hint. Saved on the
 * problem, so asking again returns the same explanation. Null if it couldn't be written safely.
 */
export async function explainHint(studentId: string, grade: number, problemId: string): Promise<string | null | undefined> {
  const db = await getDb();
  const [found] = await db.select({ problem: schema.drillProblems })
    .from(schema.drillProblems).innerJoin(schema.drills, eq(schema.drills.id, schema.drillProblems.drillId))
    .where(and(eq(schema.drillProblems.id, problemId), eq(schema.drills.studentId, studentId)));
  if (!found) return undefined;
  const p = found.problem;
  if (p.hintWhy || !p.usedHint) return p.hintWhy;

  const skill = SKILLS_BY_ID.get(p.skillId);
  const topic = skill ? `${skill.name} (${skill.description})` : (await lessonTitles([p.skillId])).get(p.skillId) ?? "";
  const level = GRADE_LABELS[grade] ?? `grade ${grade}`;
  const result = await askStructured({
    effort: "low",
    schema: WhySchema,
    system: `You are a math tutor. A ${level} student working on a practice problem asked for a hint. They can see the hint already. Explain why the hint's idea works, so they understand the reasoning and can take the next step themselves.

- Explain the math idea behind the hint: why that step is the right move for this kind of problem, or what it means.
- Never give the answer, and never do the final step or the arithmetic that produces the answer. The student does that.
- Two or three short sentences for a ${level} reader, warm and plain. Write math in plain text like 3/4, 2 × 5, x^2, never LaTeX.
- Don't repeat the hint word for word.`,
    content: [{ type: "text", text: [
      topic ? `Topic: ${topic}` : "",
      `Problem: ${p.prompt}`,
      `Hint the student sees: ${p.hint}`,
      `For you only, never to reveal: the answer is ${p.answer}. Worked solution: ${p.explanation}`,
    ].filter(Boolean).join("\n") }],
  });
  const why = result?.why.trim().slice(0, 600);
  if (!why || revealsAnswer(why, p.answer)) return null;
  await db.update(schema.drillProblems).set({ hintWhy: why }).where(eq(schema.drillProblems.id, p.id));
  return why;
}
