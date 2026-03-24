# - --- Stage 1: Prune monorepo ----
FROM node:20-alpine AS pruner
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN pnpm add -g turbo@2

COPY . .

RUN turbo prune @ghostcast/api --docker

# ---- Stage 2: Install dependencies ----
FROM node:20-alpine AS installer
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# Copy Prisma schema for client generation
COPY --from=pruner /app/out/full/packages/database/prisma ./packages/database/prisma
RUN pnpm --filter @ghostcast/database generate

# ---- Stage 3: Build ----
FROM installer AS builder
WORKDIR /app

COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json

RUN pnpm turbo run build --filter=@ghostcast/api && \
    pnpm --filter @ghostcast/database run build:seed

# ---- Stage 4: Production runner ----
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate && \
    apk add --no-cache libc6-compat libstdc++ openssl

WORKDIR /app

# Create non-root user and backup directory
RUN addgroup --system --gid 1001 ghostcast && \
    adduser --system --uid 1001 ghostcast && \
    mkdir -p /app/backups && chown ghostcast:ghostcast /app/backups

# Copy package files and install production-only dependencies
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile --prod

# Copy Prisma schema and migrations (needed for migrate deploy at runtime)
COPY --from=pruner /app/out/full/packages/database/prisma ./packages/database/prisma

# Re-generate Prisma client in production node_modules
RUN pnpm --filter @ghostcast/database generate

# Copy built output from all workspace packages
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/plugin-sdk/dist ./packages/plugin-sdk/dist

# Copy entrypoint script and set ownership for non-root user
COPY docker/api-entrypoint.sh /app/docker/api-entrypoint.sh
RUN chmod +x /app/docker/api-entrypoint.sh && \
    chown -R ghostcast:ghostcast /app

# Switch to non-root user
USER ghostcast

ARG API_PORT=4000

EXPOSE ${API_PORT}

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget -qO- http://127.0.0.1:${API_PORT:-4000}/api/health || exit 1

ENTRYPOINT ["/app/docker/api-entrypoint.sh"]
