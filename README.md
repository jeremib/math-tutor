# Math Buddy

Family math tutoring: short daily drills that adapt to each child, plus a homework helper that guides kids to the answer without giving it away.

## Features

- **Multi-family accounts.** A parent signs up and creates a family. Other parents can be added to the same family.
- **Student logins.** Each child gets a username and PIN and logs in with the family code (e.g. `OWL-4821`).
- **Daily drills.** Each day's set is mostly the skills the child is learning now (or the parent's chosen focus skills), plus review of mastered skills. Kids get two tries, an optional hint, and a worked explanation.
- **Progression.** A skill is mastered after at least 8 attempts with high recent accuracy. Mastering a skill unlocks the next one in the K–8 curriculum (`src/lib/curriculum.ts`), across grade levels too.
- **Homework helper.** Kids upload a photo or type a problem. Claude tutors them step by step with questions and never gives the final answer. Parents can read every conversation.
- **Parent dashboard.** Shows streaks, first-try accuracy, mastery per skill, recent misses and homework sessions. Parents set drill length, grade, focus skills and PIN, and can turn the homework helper on or off.

## Running it

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

Drills work without an API key; the homework helper needs one.

```bash
npm test        # curriculum, answer checking and progression logic
npm run lint    # type-check
npm run build
```

## Database

The app uses Postgres everywhere, so development and production run the same SQL.

- **Development:** leave `DATABASE_URL` unset. The app uses [PGlite](https://pglite.dev), Postgres compiled to WebAssembly, stored in `DATA_DIR/pglite`. There's nothing to install. Only one process can open it at a time.
- **Production:** set `DATABASE_URL` to any Postgres 14+ server (RDS, Cloud SQL, Neon, Supabase, Railway, etc.). To try this locally, run `docker compose up -d`.

Migrations live in `drizzle/` and are applied automatically when the server first connects. After changing `src/db/schema.ts`, run `npm run db:generate` and commit the new migration file.

Uploaded homework photos are stored on disk in `DATA_DIR/uploads`. If you run more than one server, put that folder on shared storage (or move uploads to S3 or similar).

## Layout

| Path | What |
|---|---|
| `src/lib/curriculum.ts` | Skills K–8 and their problem generators |
| `src/lib/answers.ts` | Answer checking (fractions, decimals, mixed numbers, remainders) |
| `src/lib/progress.ts` | Mastery, unlocking, drill composition, streaks (pure, unit-tested) |
| `src/lib/learning.ts` | Database-backed drills and progress |
| `src/db/` | Schema and connection (Postgres or PGlite) |
| `drizzle/` | SQL migrations |
| `src/lib/tutor.ts` | Homework tutor prompt and Claude API call |
| `src/lib/auth.ts` | Cookie sessions for parents and students |
| `src/app/parent`, `src/app/student` | The two sides of the app |

## Before production

- Login rate limiting is in-memory, so it only works on a single instance. With several instances, move it into Postgres or Redis.
- If several instances start at the same moment, they each try to apply migrations. Deploy one instance first, or run migrations as a release step.
- There's no email verification or password reset yet.
