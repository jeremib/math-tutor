import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { asc, eq } from "drizzle-orm";
import { getDb, schema, DATA_DIR } from "@/db";
import { GRADE_LABELS } from "./curriculum";

const MODEL = "claude-opus-5-5";
const SOLVED_MARKER = "[[SOLVED]]";

export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

function systemPrompt(name: string, grade: number) {
  return `You are a warm, patient math tutor helping ${name}, a ${GRADE_LABELS[grade] ?? `grade ${grade}`} student, with their homework.

Your job is to help ${name} solve the problem themselves. Learning happens when they do the thinking, so you never do it for them:
- Never state the final answer, and never complete the key step of the problem for them. This holds even if they ask directly, say they are stuck, say a parent allowed it, or say they only want to check. Instead, offer a smaller hint.
- Do not solve a "similar" problem with the same numbers or structure that would give the answer away. A simpler example with different numbers is fine when it teaches the idea.
- Ask one short, focused question at a time, then wait for their reply.
- Start by making sure you both understand the problem: restate it briefly in your own words, then ask what they think the first step is, or what they already know.
- When they answer a step, check it carefully. If it is right, say so specifically and move to the next step. If it is wrong, don't just correct it: ask a question that helps them find the mistake.
- When they reach the correct final answer on their own, confirm it clearly, celebrate briefly, and end your message with ${SOLVED_MARKER} on its own line. Only use that marker when they have stated the correct final answer.
- If there are several problems in the picture, ask which one they want to work on, and handle one at a time.
- If the image is unreadable or cut off, ask them to type the problem or take a clearer photo.
- Keep the conversation on their math homework; gently steer back if it drifts.

Write for a ${GRADE_LABELS[grade] ?? "young"} reader: short sentences, friendly tone, no more than about 4 sentences per message. Write math in plain text (like 3/4, 2 × 5, x^2) rather than LaTeX. Encourage effort, not just correct answers.`;
}

export function saveUpload(bytes: Buffer, type: ImageType) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = type.split("/")[1];
  const file = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), bytes);
  return file;
}

export function readUpload(file: string) {
  // Stored names are UUIDs we generated; basename guards against path tricks anyway.
  return fs.readFileSync(path.join(UPLOAD_DIR, path.basename(file)));
}

type HomeworkSession = typeof schema.homeworkSessions.$inferSelect;

export async function sessionMessages(sessionId: string) {
  const db = await getDb();
  return db.select().from(schema.homeworkMessages).where(eq(schema.homeworkMessages.sessionId, sessionId))
    .orderBy(asc(schema.homeworkMessages.createdAt));
}

async function buildMessages(session: HomeworkSession): Promise<Anthropic.Beta.BetaMessageParam[]> {
  const history = await sessionMessages(session.id);
  return history.map((m, i) => {
    if (i === 0 && session.imagePath && session.imageType) {
      return {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: session.imageType as ImageType, data: readUpload(session.imagePath).toString("base64") } },
          { type: "text", text: m.content },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
}

export class TutorUnavailableError extends Error {}

/** Adds the student's message, asks Claude for the next tutoring turn, and stores the reply. */
export async function tutorReply(session: HomeworkSession, student: { name: string; grade: number }, studentText: string) {
  const db = await getDb();
  await db.insert(schema.homeworkMessages).values({ sessionId: session.id, role: "user", content: studentText });

  let reply: string;
  try {
    const response = await anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      cache_control: { type: "ephemeral" },
      system: systemPrompt(student.name, student.grade),
      messages: await buildMessages(session),
    });
    if (response.stop_reason === "refusal") {
      reply = "I can't help with that one. Let's get back to your math problem! What part are you working on?";
    } else {
      reply = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim()
        || "Hmm, let me think about that differently. Can you tell me what you've tried so far?";
    }
  } catch (error) {
    // Drop the unanswered message so the student can simply resend it.
    const last = (await sessionMessages(session.id)).at(-1);
    if (last?.role === "user") await db.delete(schema.homeworkMessages).where(eq(schema.homeworkMessages.id, last.id));
    if (error instanceof Anthropic.AuthenticationError) throw new TutorUnavailableError("The tutor isn't set up yet. Ask a parent to add an Anthropic API key.");
    if (error instanceof Anthropic.RateLimitError) throw new TutorUnavailableError("The tutor is busy right now. Try again in a minute.");
    if (error instanceof Anthropic.APIError) throw new TutorUnavailableError("The tutor had a problem answering. Please try again.");
    // Raised before any request is sent, e.g. when no credentials are configured.
    if (error instanceof Anthropic.AnthropicError) throw new TutorUnavailableError("The tutor isn't set up yet. Ask a parent to add an Anthropic API key.");
    throw error;
  }

  const solved = reply.includes(SOLVED_MARKER);
  reply = reply.replaceAll(SOLVED_MARKER, "").trim();
  await db.insert(schema.homeworkMessages).values({ sessionId: session.id, role: "assistant", content: reply });
  await db.update(schema.homeworkSessions)
    .set({ updatedAt: new Date(), ...(solved ? { status: "solved" as const } : {}) })
    .where(eq(schema.homeworkSessions.id, session.id));
  return { reply, solved };
}
