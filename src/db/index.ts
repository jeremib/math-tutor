import path from "node:path";
import fs from "node:fs";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/**
 * Postgres everywhere: production sets DATABASE_URL; without it, development uses
 * PGlite (Postgres compiled to WebAssembly) stored under DATA_DIR, so there's nothing to install.
 */
export const DATA_DIR = path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR ?? "./data");
const MIGRATIONS = path.join(/* turbopackIgnore: true */ process.cwd(), "drizzle");

export type Db = NodePgDatabase<typeof schema>;

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_SIZE ?? 10) });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = drizzle(new PGlite(path.join(DATA_DIR, "pglite")), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  // Both drivers expose the same query builder; only the result metadata differs.
  return db as unknown as Db;
}

// One connection per server process, shared across hot reloads in development.
const globalForDb = globalThis as unknown as { dbPromise?: Promise<Db> };

/** Connects and applies pending migrations on first use. */
export function getDb(): Promise<Db> {
  globalForDb.dbPromise ??= connect().catch((error) => {
    globalForDb.dbPromise = undefined;
    throw error;
  });
  return globalForDb.dbPromise;
}

export { schema };
