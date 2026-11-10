import "server-only";
import crypto from "node:crypto";
import { and, eq, gt, isNotNull, lt } from "drizzle-orm";
import QRCode from "qrcode";
import { getDb, schema } from "@/db";

/** How long a phone link works for taking a photo. */
const HANDOFF_MINUTES = 20;

type Handoff = typeof schema.photoHandoffs.$inferSelect;

/** The site's address as the phone should reach it: APP_URL if set, else the address the computer used. */
export function publicOrigin(req: Request): string {
  return headerOrigin(req.headers, new URL(req.url));
}

/** The same, from request headers alone (server components), falling back to `url` when headers lack the host. */
export function headerOrigin(headers: Headers, url?: URL): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? url?.host ?? "localhost";
  const proto = headers.get("x-forwarded-proto")?.split(",")[0] ?? url?.protocol.replace(":", "") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** An SVG QR code for a link. */
export const qrSvg = (url: string) => QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });

/** Starts a phone link for a student, clearing their expired ones. Returns its token, address and QR code (SVG). */
export async function createHandoff(studentId: string, origin: string) {
  const db = await getDb();
  await db.delete(schema.photoHandoffs)
    .where(and(eq(schema.photoHandoffs.studentId, studentId), lt(schema.photoHandoffs.expiresAt, new Date())));
  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + HANDOFF_MINUTES * 60_000);
  await db.insert(schema.photoHandoffs).values({ id: token, studentId, expiresAt });
  const url = `${origin}/phone/${token}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { token, url, qr, expiresAt };
}

/** A phone link that still works, for the phone (which isn't logged in). */
export async function liveHandoff(token: string): Promise<Handoff | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.photoHandoffs)
    .where(and(eq(schema.photoHandoffs.id, token), gt(schema.photoHandoffs.expiresAt, new Date())));
  return row ?? null;
}

/** A student's own phone link that has a photo, whether or not it has expired since. */
export async function handoffPhoto(token: string, studentId: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.photoHandoffs)
    .where(and(eq(schema.photoHandoffs.id, token), eq(schema.photoHandoffs.studentId, studentId), isNotNull(schema.photoHandoffs.imagePath)));
  return row ?? null;
}

/** A student's own phone link, for the computer to check on. */
export async function studentHandoff(token: string, studentId: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.photoHandoffs)
    .where(and(eq(schema.photoHandoffs.id, token), eq(schema.photoHandoffs.studentId, studentId)));
  return row ?? null;
}

/** Saves the phone's photo to the link; a retake replaces the last one. */
export async function attachHandoffPhoto(token: string, image: { imagePath: string; imageType: string }) {
  const db = await getDb();
  await db.update(schema.photoHandoffs).set(image).where(eq(schema.photoHandoffs.id, token));
}
