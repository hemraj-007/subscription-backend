# syntax=docker/dockerfile:1

# ---- Builder: install all deps, generate Prisma client, compile TS ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Build tooling for native modules (bcrypt) + openssl for Prisma engines.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ openssl \
  && rm -rf /var/lib/apt/lists/*

COPY prisma ./prisma
COPY package*.json ./
RUN npm ci

RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop dev dependencies but keep the already-built native modules and
# generated Prisma client, so the runtime stage needs no compilers.
RUN npm prune --omit=dev

# ---- Runtime: minimal image with only prod artifacts ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Prisma needs openssl at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist

# Run as the built-in non-root user shipped with the node image.
USER node

# Most platforms inject PORT; default matches src/config/env.ts.
ENV PORT=3001
EXPOSE 3001

# Apply pending migrations, then start the server.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
