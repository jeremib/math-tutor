import { defineConfig } from "drizzle-kit";

// `npm run db:generate` turns schema changes into SQL migrations in ./drizzle.
// Migrations are applied automatically when the server starts.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
