import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

// Kept in sync with schema.ts by hand; every statement is idempotent.
const INIT_SQL = `
CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE,
  timezone TEXT NOT NULL DEFAULT 'America/New_York', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS parents (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL, username TEXT NOT NULL, pin_hash TEXT NOT NULL, grade INTEGER NOT NULL,
  avatar TEXT NOT NULL DEFAULT '🦊', daily_problems INTEGER NOT NULL DEFAULT 8,
  focus_skills TEXT NOT NULL DEFAULT '[]', homework_enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS students_family_username ON students(family_id, username);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, subject_id TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS student_skills (
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE, skill_id TEXT NOT NULL,
  mastery REAL NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0,
  unlocked_at INTEGER NOT NULL, mastered_at INTEGER, last_practiced_at INTEGER,
  PRIMARY KEY (student_id, skill_id)
);
CREATE TABLE IF NOT EXISTS drills (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date TEXT NOT NULL, total INTEGER NOT NULL, correct_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, completed_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS drills_student_date ON drills(student_id, date);
CREATE TABLE IF NOT EXISTS drill_problems (
  id TEXT PRIMARY KEY, drill_id TEXT NOT NULL REFERENCES drills(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, skill_id TEXT NOT NULL, prompt TEXT NOT NULL, answer TEXT NOT NULL,
  answer_kind TEXT NOT NULL, choices TEXT, hint TEXT NOT NULL, explanation TEXT NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0, used_hint INTEGER NOT NULL DEFAULT 0, last_answer TEXT,
  first_try_correct INTEGER, solved INTEGER, answered_at INTEGER
);
CREATE INDEX IF NOT EXISTS drill_problems_drill ON drill_problems(drill_id);
CREATE TABLE IF NOT EXISTS homework_sessions (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL, problem_text TEXT, image_path TEXT, image_type TEXT,
  status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS homework_student ON homework_sessions(student_id);
CREATE TABLE IF NOT EXISTS homework_messages (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES homework_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS homework_messages_session ON homework_messages(session_id);
`;

export const DATA_DIR = path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR ?? "./data");

function open() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const sqlite = new Database(path.join(DATA_DIR, "math-tutor.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(INIT_SQL);
  return drizzle(sqlite, { schema });
}

// Reuse one connection across hot reloads in development.
const globalForDb = globalThis as unknown as { db?: ReturnType<typeof open> };
export const db = globalForDb.db ?? (globalForDb.db = open());
export { schema };
