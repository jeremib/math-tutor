import { sqliteTable, text, integer, real, primaryKey, uniqueIndex, index } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date());

export const families = sqliteTable("families", {
  id: id(),
  name: text("name").notNull(),
  /** Short code students type to log in, e.g. "OWL-4821". */
  code: text("code").notNull().unique(),
  timezone: text("timezone").notNull().default("America/New_York"),
  createdAt: createdAt(),
});

export const parents = sqliteTable("parents", {
  id: id(),
  familyId: text("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const students = sqliteTable("students", {
  id: id(),
  familyId: text("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  username: text("username").notNull(),
  pinHash: text("pin_hash").notNull(),
  grade: integer("grade").notNull(),
  avatar: text("avatar").notNull().default("🦊"),
  dailyProblems: integer("daily_problems").notNull().default(8),
  /** JSON array of skill ids the parent wants emphasized. */
  focusSkills: text("focus_skills").notNull().default("[]"),
  homeworkEnabled: integer("homework_enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("students_family_username").on(t.familyId, t.username)]);

export const sessions = sqliteTable("sessions", {
  /** SHA-256 of the cookie token; the raw token is never stored. */
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["parent", "student"] }).notNull(),
  subjectId: text("subject_id").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

export const studentSkills = sqliteTable("student_skills", {
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  skillId: text("skill_id").notNull(),
  mastery: real("mastery").notNull().default(0),
  attempts: integer("attempts").notNull().default(0),
  correct: integer("correct").notNull().default(0),
  unlockedAt: integer("unlocked_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  masteredAt: integer("mastered_at", { mode: "timestamp_ms" }),
  lastPracticedAt: integer("last_practiced_at", { mode: "timestamp_ms" }),
}, (t) => [primaryKey({ columns: [t.studentId, t.skillId] })]);

export const drills = sqliteTable("drills", {
  id: id(),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  total: integer("total").notNull(),
  correctCount: integer("correct_count").notNull().default(0),
  createdAt: createdAt(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
}, (t) => [uniqueIndex("drills_student_date").on(t.studentId, t.date)]);

export const drillProblems = sqliteTable("drill_problems", {
  id: id(),
  drillId: text("drill_id").notNull().references(() => drills.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  skillId: text("skill_id").notNull(),
  prompt: text("prompt").notNull(),
  answer: text("answer").notNull(),
  answerKind: text("answer_kind", { enum: ["number", "remainder", "choice"] }).notNull(),
  choices: text("choices"),
  hint: text("hint").notNull(),
  explanation: text("explanation").notNull(),
  tries: integer("tries").notNull().default(0),
  usedHint: integer("used_hint", { mode: "boolean" }).notNull().default(false),
  lastAnswer: text("last_answer"),
  /** Set once the problem is finished: true only if solved on the first try without a hint. */
  firstTryCorrect: integer("first_try_correct", { mode: "boolean" }),
  solved: integer("solved", { mode: "boolean" }),
  answeredAt: integer("answered_at", { mode: "timestamp_ms" }),
}, (t) => [index("drill_problems_drill").on(t.drillId)]);

export const homeworkSessions = sqliteTable("homework_sessions", {
  id: id(),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  problemText: text("problem_text"),
  imagePath: text("image_path"),
  imageType: text("image_type"),
  status: text("status", { enum: ["active", "solved"] }).notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (t) => [index("homework_student").on(t.studentId)]);

export const homeworkMessages = sqliteTable("homework_messages", {
  id: id(),
  sessionId: text("session_id").notNull().references(() => homeworkSessions.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  createdAt: createdAt(),
}, (t) => [index("homework_messages_session").on(t.sessionId)]);
