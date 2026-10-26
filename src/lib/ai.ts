import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const MODEL = "claude-opus-5-5";
/** Routes refused requests to a fallback model instead of failing them. */
export const FALLBACK: { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: "default" } = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

let client: Anthropic | null = null;
export const anthropic = () => (client ??= new Anthropic());

export class TutorUnavailableError extends Error {}

/** Turns an SDK error into a message a student can read; rethrows anything else. */
export function tutorError(error: unknown): TutorUnavailableError {
  if (error instanceof Anthropic.AuthenticationError) return new TutorUnavailableError("The tutor isn't set up yet. Ask a parent to add an Anthropic API key.");
  if (error instanceof Anthropic.RateLimitError) return new TutorUnavailableError("The tutor is busy right now. Try again in a minute.");
  if (error instanceof Anthropic.APIError) return new TutorUnavailableError("The tutor had a problem answering. Please try again.");
  // Raised before any request is sent, e.g. when no credentials are configured.
  if (error instanceof Anthropic.AnthropicError) return new TutorUnavailableError("The tutor isn't set up yet. Ask a parent to add an Anthropic API key.");
  throw error;
}

export type ImageInput = { data: Buffer; type: "image/jpeg" | "image/png" | "image/gif" | "image/webp" };

export const imageBlock = (image: ImageInput): Anthropic.Beta.BetaImageBlockParam => ({
  type: "image", source: { type: "base64", media_type: image.type, data: image.data.toString("base64") },
});

/** One request that returns JSON matching `schema`, or null if Claude declined or the output didn't parse. */
export async function askStructured<S extends z.ZodType>(args: {
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: S;
  effort: "low" | "medium" | "high";
}): Promise<z.infer<S> | null> {
  const response = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: args.effort, format: betaZodOutputFormat(args.schema) },
    system: args.system,
    messages: [{ role: "user", content: args.content }],
  });
  if (response.stop_reason === "refusal") return null;
  return response.parsed_output ?? null;
}
