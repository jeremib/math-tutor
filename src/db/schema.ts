import { sql } from "drizzle-orm";
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
  /** Where the problem came from: the curriculum generator, or a practice problem Claude wrote. */
  source: text("source", { enum: ["curriculum", "misconception", "homework"] }).notNull().default("curriculum"),
  /** For practice problems: the misconception they target. For missed problems: what Claude found. */
  misconceptionId: text("misconception_id").references(() => misconceptions.id, { onDelete: "set null" }),
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
  createdAt: createdAt(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => [uniqueIndex("misconceptions_open_tag").on(t.studentId, t.tag).where(sql`${t.resolvedAt} is null`)]);

/** Practice problems Claude wrote, waiting to be mixed into the student's next drill. */
export const practiceProblems = pgTable("practice_problems", {
  id: id(),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  source: text("source", { enum: ["misconception", "homework"] }).notNull(),
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
    enum: ["check_in", "problem", "drill", "perfect_drill", "mastery", "homework", "weekly_goal"],
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
