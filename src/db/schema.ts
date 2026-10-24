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
  homeworkEnabled: boolean("homework_enabled").notNull().default(true),
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
  tries: integer("tries").notNull().default(0),
  usedHint: boolean("used_hint").notNull().default(false),
  lastAnswer: text("last_answer"),
  /** Set once the problem is finished: true only if solved on the first try without a hint. */
  firstTryCorrect: boolean("first_try_correct"),
  solved: boolean("solved"),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
}, (t) => [index("drill_problems_drill").on(t.drillId)]);

export const homeworkSessions = pgTable("homework_sessions", {
  id: id(),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  problemText: text("problem_text"),
  imagePath: text("image_path"),
  imageType: text("image_type"),
  status: text("status", { enum: ["active", "solved"] }).notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("homework_student").on(t.studentId), index("homework_image").on(t.imagePath)]);

export const homeworkMessages = pgTable("homework_messages", {
  id: id(),
  sessionId: text("session_id").notNull().references(() => homeworkSessions.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  createdAt: createdAt(),
}, (t) => [index("homework_messages_session").on(t.sessionId, t.createdAt)]);
