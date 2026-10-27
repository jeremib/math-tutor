import { sql } from "drizzle-orm";
import type { Visual } from "../lib/visuals";
import { pgTable, text, integer, doublePrecision, boolean, timestamp, jsonb, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const families = pgTable("families", {
  id: id(),
  name: text("name").notNull(),
  /** Short code students type to log in, e.g. "OWL-4821". */
  code: text("code").notNull().unique(),
  timezone: text("timezone").notNull().default("America/New_York"),
  createdAt: createdAt(),
});

export const parents = pgTable("parents", {
  id: id(),
  familyId: text("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** Receives the weekly progress email. */
  weeklyEmail: boolean("weekly_email").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [index("parents_family").on(t.familyId)]);

export const students = pgTable("students", {
  id: id(),
  familyId: text("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  username: text("username").notNull(),
  pinHash: text("pin_hash").notNull(),
  grade: integer("grade").notNull(),
  avatar: text("avatar").notNull().default("🦊"),
  dailyProblems: integer("daily_problems").notNull().default(8),
  /** Skill ids the parent wants emphasized. */
  focusSkills: jsonb("focus_skills").$type<string[]>().notNull().default([]),
  /** Allows every Claude-powered feature: homework help, mistake explanations, explain-it-back and test prep. */
  aiEnabled: boolean("homework_enabled").notNull().default(true),
  /** Reads problems aloud and accepts spoken answers. On by default for K–2. */
  voiceEnabled: boolean("voice_enabled").notNull().default(false),
  /** Drills per week the student aims for. */
  weeklyGoal: integer("weekly_goal").notNull().default(5),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("students_family_username").on(t.familyId, t.username)]);

export const sessions = pgTable("sessions", {
  /** SHA-256 of the cookie token; the raw token is never stored. */
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["parent", "student"] }).notNull(),
  subjectId: text("subject_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const studentSkills = pgTable("student_skills", {
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  skillId: text("skill_id").notNull(),
  mastery: doublePrecision("mastery").notNull().default(0),
  attempts: integer("attempts").notNull().default(0),
  correct: integer("correct").notNull().default(0),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
  masteredAt: timestamp("mastered_at", { withTimezone: true }),
  lastPracticedAt: timestamp("last_practiced_at", { withTimezone: true }),
  /** Spaced review for mastered skills: days until the next review, growing with each right answer. */
  reviewIntervalDays: doublePrecision("review_interval_days").notNull().default(1),
  nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
}, (t) => [primaryKey({ columns: [t.studentId, t.skillId] })]);

export const drills = pgTable("drills", {
  id: id(),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  total: integer("total").notNull(),
  correctCount: integer("correct_count").notNull().default(0),
  createdAt: createdAt(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [uniqueIndex("drills_student_date").on(t.studentId, t.date)]);

export const drillProblems = pgTable("drill_problems", {
  id: id(),
  drillId: text("drill_id").notNull().references(() => drills.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  skillId: text("skill_id").notNull(),
  prompt: text("prompt").notNull(),
  answer: text("answer").notNull(),
  answerKind: text("answer_kind", { enum: ["number", "remainder", "choice"] }).notNull(),
  choices: jsonb("choices").$type<string[]>(),
  hint: text("hint").notNull(),
  explanation: text("explanation").notNull(),
  /** A picture model (fraction bar, number line, blocks...) shown with the hint and explanation. */
  visual: jsonb("visual").$type<Visual>(),
  tries: integer("tries").notNull().default(0),
  usedHint: boolean("used_hint").notNull().default(false),
  lastAnswer: text("last_answer"),
  /** Set once the problem is finished: true only if solved on the first try without a hint. */
  firstTryCorrect: boolean("first_try_correct"),
  solved: boolean("solved"),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  /** Where the problem came from: the curriculum generator, or a practice problem Claude wrote. */
  source: text("source", { enum: ["curriculum", "misconception", "homework", "test_prep", "textbook"] }).notNull().default("curriculum"),
  /** For practice problems: the misconception they target. For missed problems: what Claude found. */
  misconceptionId: text("misconception_id").references(() => misconceptions.id, { onDelete: "set null" }),
  /** For quiz-prep problems: the quiz they prepare for. */
  testPrepId: text("test_prep_id").references(() => testPreps.id, { onDelete: "set null" }),
  wrongAnswers: jsonb("wrong_answers").$type<string[]>().notNull().default([]),
  /** A drawing of the student's work, sent along when their answer is diagnosed. */
  workImagePath: text("work_image_path"),
  /** Claude's note to the student about their wrong answer. */
  feedback: text("feedback"),
  feedbackStatus: text("feedback_status", { enum: ["pending", "done", "failed"] }),
}, (t) => [index("drill_problems_drill").on(t.drillId), index("drill_problems_work_image").on(t.workImagePath)]);

export const homeworkSessions = pgTable("homework_sessions", {
  id: id(),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  problemText: text("problem_text"),
  imagePath: text("image_path"),
  imageType: text("image_type"),
  status: text("status", { enum: ["active", "solved"] }).notNull().default("active"),
  /** The curriculum skill Claude matched the problem to once it was solved. */
  skillId: text("skill_id"),
  /** Practice problems queued from this session for the next drill. */
  practiceAdded: integer("practice_added").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("homework_student").on(t.studentId), index("homework_image").on(t.imagePath)]);

export const homeworkMessages = pgTable("homework_messages", {
  id: id(),
  sessionId: text("session_id").notNull().references(() => homeworkSessions.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  /** A drawing of the student's work attached to this message. */
  imagePath: text("image_path"),
  imageType: text("image_type"),
  createdAt: createdAt(),
}, (t) => [index("homework_messages_session").on(t.sessionId, t.createdAt), index("homework_messages_image").on(t.imagePath)]);

/** A recurring mistake Claude spotted in a student's wrong answers, e.g. adding denominators. */
export const misconceptions = pgTable("misconceptions", {
  id: id(),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  skillId: text("skill_id").notNull(),
  /** Short kebab-case key Claude reuses when it sees the same mistake again. */
  tag: text("tag").notNull(),
  /** One sentence for parents. */
  label: text("label").notNull(),
  timesSeen: integer("times_seen").notNull().default(1),
  /** Targeted practice problems answered right on the first try. */
  practicedCorrect: integer("practiced_correct").notNull().default(0),
  /** Asks the student to explain the right idea in their own words once the mistake is fixed. */
  teachBackQuestion: text("teach_back_question"),
  createdAt: createdAt(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => [uniqueIndex("misconceptions_open_tag").on(t.studentId, t.tag).where(sql`${t.resolvedAt} is null`)]);

/** Practice problems Claude wrote, waiting to be mixed into the student's next drill. */
export const practiceProblems = pgTable("practice_problems", {
  id: id(),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  source: text("source", { enum: ["misconception", "homework", "test_prep", "textbook"] }).notNull(),
  testPrepId: text("test_prep_id").references(() => testPreps.id, { onDelete: "cascade" }),
  textbookId: text("textbook_id").references(() => textbooks.id, { onDelete: "cascade" }),
  misconceptionId: text("misconception_id").references(() => misconceptions.id, { onDelete: "set null" }),
  homeworkSessionId: text("homework_session_id").references(() => homeworkSessions.id, { onDelete: "set null" }),
  skillId: text("skill_id").notNull(),
  prompt: text("prompt").notNull(),
  answer: text("answer").notNull(),
  answerKind: text("answer_kind", { enum: ["number", "remainder"] }).notNull(),
  hint: text("hint").notNull(),
  explanation: text("explanation").notNull(),
  createdAt: createdAt(),
  /** Set when the problem is placed into a drill. */
  usedAt: timestamp("used_at", { withTimezone: true }),
}, (t) => [index("practice_problems_student").on(t.studentId, t.usedAt)]);

export const xpEvents = pgTable("xp_events", {
  id: id(),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  kind: text("kind", {
    enum: ["check_in", "problem", "drill", "perfect_drill", "mastery", "homework", "weekly_goal", "explain", "race"],
  }).notNull(),
  amount: integer("amount").notNull(),
  /** Unique per student, so the same achievement can never pay out twice. */
  refKey: text("ref_key").notNull(),
  /** The family's local date when it was earned. */
  date: text("date").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("xp_events_student_ref").on(t.studentId, t.refKey), index("xp_events_student_date").on(t.studentId, t.date)]);

export const studentBadges = pgTable("student_badges", {
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  badgeId: text("badge_id").notNull(),
  earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.studentId, t.badgeId] })]);

/** Real-world rewards a parent sets up, unlocked when the student's XP reaches the target. */
export const rewards = pgTable("rewards", {
  id: id(),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  xpTarget: integer("xp_target").notNull(),
  createdAt: createdAt(),
  givenAt: timestamp("given_at", { withTimezone: true }),
}, (t) => [index("rewards_student").on(t.studentId)]);

/** An upcoming quiz or test the student is preparing for, built from a study guide. */
export const testPreps = pgTable("test_preps", {
  id: id(),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  /** The family's local date of the quiz (YYYY-MM-DD). */
  quizDate: text("quiz_date").notNull(),
  notes: text("notes"),
  imagePath: text("image_path"),
  imageType: text("image_type"),
  /** Topics Claude found in the study guide, matched to curriculum skills where possible. */
  topics: jsonb("topics").$type<{ name: string; skillId: string | null }[]>().notNull().default([]),
  status: text("status", { enum: ["pending", "ready", "failed"] }).notNull().default("pending"),
  createdAt: createdAt(),
}, (t) => [index("test_preps_student").on(t.studentId), index("test_preps_image").on(t.imagePath)]);

/** A student explaining an idea back in their own words, and Claude's verdict. */
export const explanations = pgTable("explanations", {
  id: id(),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  source: text("source", { enum: ["misconception", "homework"] }).notNull(),
  /** The misconception or homework session being explained. */
  sourceId: text("source_id").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  verdict: text("verdict", { enum: ["got_it", "partly", "not_yet"] }).notNull(),
  feedback: text("feedback").notNull(),
  createdAt: createdAt(),
}, (t) => [index("explanations_source").on(t.studentId, t.source, t.sourceId)]);

/** A 60-second math facts race. Problems come from the seed, so the server can re-check the score. */
export const factRaces = pgTable("fact_races", {
  id: id(),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  op: text("op", { enum: ["add", "sub", "mul", "div"] }).notNull(),
  seed: integer("seed").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  attempted: integer("attempted").notNull().default(0),
  correct: integer("correct").notNull().default(0),
}, (t) => [index("fact_races_student").on(t.studentId, t.op)]);

/** The weekly progress summary for a family, written by Claude and emailed to parents. */
export const weeklyReports = pgTable("weekly_reports", {
  id: id(),
  familyId: text("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  /** Monday of the week covered (YYYY-MM-DD). */
  weekStart: text("week_start").notNull(),
  report: jsonb("report").$type<WeeklyReport>().notNull(),
  createdAt: createdAt(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (t) => [uniqueIndex("weekly_reports_family_week").on(t.familyId, t.weekStart)]);

export type WeeklyReport = {
  students: {
    studentId: string;
    name: string;
    stats: { drills: number; accuracy: number | null; xp: number; mastered: string[]; homeworkSolved: number; racesBest: number | null };
    headline: string;
    wins: string[];
    watch: string[];
    tryAtHome: string;
  }[];
};

export type TextbookChapter = {
  title: string;
  lessons: string[];
  /** Curriculum skills that practice this chapter, in the book's order. */
  skillIds: string[];
  /** How much of the chapter those skills cover; the rest gets practice problems Claude writes. */
  coverage: "full" | "partial" | "none";
};

export type TextbookImage = { path: string; type: string; kind: "cover" | "toc" };

/** The math textbook a student uses at school, with its chapters matched to curriculum skills. */
export const textbooks = pgTable("textbooks", {
  id: id(),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  /** What the parent typed; replaced by the full title once the book is identified. */
  title: text("title").notNull(),
  publisher: text("publisher"),
  /** The grade the book is for, if known. */
  grade: integer("grade"),
  /** Cover and table-of-contents photos. */
  images: jsonb("images").$type<TextbookImage[]>().notNull().default([]),
  /** needs_toc: the chapters couldn't be found online, so the parent is asked for table-of-contents photos. */
  status: text("status", { enum: ["pending", "ready", "needs_toc", "failed"] }).notNull().default("pending"),
  /** Where the chapter list came from. */
  source: text("source", { enum: ["web", "photos"] }),
  sources: jsonb("sources").$type<string[]>().notNull().default([]),
  chapters: jsonb("chapters").$type<TextbookChapter[]>().notNull().default([]),
  /** Index into chapters of what the class is working on now. */
  currentChapter: integer("current_chapter"),
  /** Chapters that already have practice problems written for them. */
  practiceChapters: jsonb("practice_chapters").$type<number[]>().notNull().default([]),
  /** Claude's note to the parent about the lookup. */
  note: text("note"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("textbooks_student").on(t.studentId)]);
