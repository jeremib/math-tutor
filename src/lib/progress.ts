// Pure progression logic: mastery tracking, unlocking and drill composition.
import { SKILLS, SKILLS_BY_ID } from "./curriculum.ts";

export const MASTERY_WEIGHT = 0.2;
export const MASTERY_THRESHOLD = 0.8;
export const MIN_ATTEMPTS_FOR_MASTERY = 8;
/** How many not-yet-mastered skills a student works on at once. */
export const ACTIVE_SKILLS = 2;

export type SkillState = {
  skillId: string;
  mastery: number;
  attempts: number;
  mastered: boolean;
  lastPracticedAt: number | null;
  /** When a mastered skill is next due for review (ms), or null if it has never been scheduled. */
  nextReviewAt?: number | null;
  reviewIntervalDays?: number;
};

const DAY_MS = 86_400_000;
/** Longest gap between reviews of a mastered skill. */
export const MAX_REVIEW_INTERVAL_DAYS = 60;
/** How much the gap grows after each review answered right on the first try. */
export const REVIEW_GROWTH = 2.5;

/**
 * Spaced review: each first-try-correct review pushes the next one further out;
 * a miss brings the skill back tomorrow.
 */
export function scheduleReview(intervalDays: number, correct: boolean, now = Date.now()): { reviewIntervalDays: number; nextReviewAt: number } {
  const next = correct ? Math.min(MAX_REVIEW_INTERVAL_DAYS, Math.max(2, intervalDays * REVIEW_GROWTH)) : 1;
  return { reviewIntervalDays: next, nextReviewAt: now + next * DAY_MS };
}

/**
 * Orders mastered skills for review: the most overdue (relative to their interval) first,
 * then never-scheduled skills weakest first, then skills not yet due, soonest first.
 */
export function reviewOrder(states: SkillState[], now = Date.now()): SkillState[] {
  const scheduled = (s: SkillState) => s.nextReviewAt != null;
  const overdue = (s: SkillState) => (now - s.nextReviewAt!) / ((s.reviewIntervalDays ?? 1) * DAY_MS);
  const due = states.filter((s) => scheduled(s) && s.nextReviewAt! <= now).sort((a, b) => overdue(b) - overdue(a));
  const unscheduled = states.filter((s) => !scheduled(s))
    // Weakest first; among equals, the most recent material in the curriculum.
    .sort((a, b) => a.mastery - b.mastery || order(b.skillId) - order(a.skillId));
  const later = states.filter((s) => scheduled(s) && s.nextReviewAt! > now).sort((a, b) => a.nextReviewAt! - b.nextReviewAt!);
  return [...due, ...unscheduled, ...later];
}

/** Exponentially weighted mastery: recent answers count more than old ones. */
export function updateMastery(mastery: number, correct: boolean): number {
  return mastery * (1 - MASTERY_WEIGHT) + (correct ? MASTERY_WEIGHT : 0);
}

export function isMastered(mastery: number, attempts: number): boolean {
  return attempts >= MIN_ATTEMPTS_FOR_MASTERY && mastery >= MASTERY_THRESHOLD;
}

/**
 * Mastered through practice, not just assumed from an earlier grade.
 * This is what counts toward skill totals and badges.
 */
export function earnedMastery(masteredAt: Date | null, attempts: number): boolean {
  return masteredAt !== null && attempts >= MIN_ATTEMPTS_FOR_MASTERY;
}

const order = (id: string) => SKILLS.findIndex((s) => s.id === id);

/** Skills a brand-new student starts with: earlier grades as review, plus the first skills of their grade. */
export function initialSkills(grade: number): { skillId: string; mastered: boolean }[] {
  const earlier = SKILLS.filter((s) => s.grade < grade).map((s) => ({ skillId: s.id, mastered: true }));
  const current = SKILLS.filter((s) => s.grade >= grade).slice(0, ACTIVE_SKILLS).map((s) => ({ skillId: s.id, mastered: false }));
  return [...earlier, ...current];
}

/** The skills to unlock so the student keeps ACTIVE_SKILLS skills in progress. */
export function skillsToUnlock(states: SkillState[]): string[] {
  const unlocked = new Set(states.map((s) => s.skillId));
  const learning = states.filter((s) => !s.mastered).length;
  const needed = ACTIVE_SKILLS - learning;
  if (needed <= 0) return [];
  // Move forward from the furthest skill reached, never back to earlier grades.
  const furthest = Math.max(-1, ...states.map((s) => order(s.skillId)));
  return SKILLS.slice(furthest + 1).filter((s) => !unlocked.has(s.id)).slice(0, needed).map((s) => s.id);
}

/**
 * Picks the skill for each problem in a daily drill.
 * Most problems practice skills being learned (or the parent's focus skills);
 * the rest review mastered skills that are due (see reviewOrder).
 */
export function chooseDrillSkills(states: SkillState[], count: number, focusSkillIds: string[] = [], now = Date.now()): string[] {
  const focus = focusSkillIds.filter((id) => SKILLS_BY_ID.has(id));
  const learning = states.filter((s) => !s.mastered).sort((a, b) => order(a.skillId) - order(b.skillId)).map((s) => s.skillId);
  const review = reviewOrder(states.filter((s) => s.mastered), now).map((s) => s.skillId);

  const primary = focus.length ? focus : learning.slice(0, ACTIVE_SKILLS);
  const reviewPool = review.slice(0, Math.max(3, Math.ceil(count / 2)));

  let primaryCount = Math.round(count * 0.7);
  if (!reviewPool.length) primaryCount = count;
  if (!primary.length) primaryCount = 0;

  const out: string[] = [];
  for (let i = 0; i < primaryCount; i++) out.push(primary[i % primary.length]);
  const pool = reviewPool.length ? reviewPool : primary;
  for (let i = 0; out.length < count && pool.length; i++) out.push(pool[i % pool.length]);
  if (!out.length) return Array.from({ length: count }, (_, i) => SKILLS[i % 2].id);

  // Interleave so the same skill doesn't appear back to back when avoidable.
  return interleave(out);
}

function interleave(ids: string[]): string[] {
  const buckets = new Map<string, number>();
  for (const id of ids) buckets.set(id, (buckets.get(id) ?? 0) + 1);
  const result: string[] = [];
  while (result.length < ids.length) {
    const candidates = [...buckets.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const next = candidates.find(([id]) => id !== result[result.length - 1]) ?? candidates[0];
    result.push(next[0]);
    buckets.set(next[0], next[1] - 1);
  }
  return result;
}

/** Number of consecutive days, ending today or yesterday, with a completed drill. */
export function computeStreak(completedDates: string[], today: string): number {
  const days = new Set(completedDates);
  const step = (d: string) => {
    const t = new Date(d + "T00:00:00Z");
    t.setUTCDate(t.getUTCDate() - 1);
    return t.toISOString().slice(0, 10);
  };
  let cursor = days.has(today) ? today : step(today);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = step(cursor);
  }
  return streak;
}

/** Today's date (YYYY-MM-DD) in the family's time zone. */
export function localDate(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
