# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Subscription Guardian is a Node.js/TypeScript REST API (Express v5) that tracks recurring credit card subscriptions. It uses Prisma ORM with PostgreSQL.

### Prerequisites

- **Node.js 20** (installed via nodesource)
- **PostgreSQL 16** (installed via apt)

### Starting Services

1. **PostgreSQL**: `pg_ctlcluster 16 main start`
2. **Create DB** (first run only): `su - postgres -c "psql -c \"CREATE DATABASE subscription_guardian;\"" && su - postgres -c "psql -c \"ALTER USER postgres PASSWORD 'postgres';\""` 
3. **Prisma migrations**: `npx prisma migrate deploy`
4. **Prisma client**: `npx prisma generate`
5. **Dev server**: `npm run dev` (runs on port 3001)

### Environment Variables

A `.env` file is needed at the project root with:
- `DATABASE_URL` — PostgreSQL connection string (e.g., `postgresql://postgres:postgres@localhost:5432/subscription_guardian`)
- `JWT_SECRET` — any string for JWT signing

### Key Caveats

- **No ESLint or test framework** is configured in this repo. Type checking is done via `npx tsc --noEmit`.
- **`npm run build` (tsc) fails** with a pre-existing TS6059 error because `prisma.config.ts` is at the project root but `tsconfig.json` sets `rootDir: "./src"` without excluding it. The dev server (`npm run dev` via `ts-node-dev --transpile-only`) is unaffected.
- **No frontend** exists — test the API using curl or an HTTP client.
- The dev server runs background cron jobs on startup (renewal alerts, unused subscription detection) via `node-cron`.

### Common API Test Flow

See `package.json` for available npm scripts. Quick API smoke test:
```bash
curl http://localhost:3001/health        # {"status":"OK"}
curl http://localhost:3001/db-test       # {"db":"connected"}
```
