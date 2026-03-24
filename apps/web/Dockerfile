# ---- Stage 1: Prune monorepo ----
FROM node:20-alpine AS pruner
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN pnpm add -g turbo@2

COPY . .

RUN turbo prune @ghostcast/web --docker

# ---- Stage 2: Install dependencies ----
FROM node:20-alpine AS installer
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# ---- Stage 3: Build ----
FROM installer AS builder
WORKDIR /app

COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json

RUN pnpm turbo run build --filter=@ghostcast/web

# ---- Stage 4: nginx production image ----
FROM nginx:alpine AS runner

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Set up permissions for non-root nginx
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- --no-check-certificate https://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
