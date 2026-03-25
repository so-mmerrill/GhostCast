<p align="center">
  <img src="apps/web/public/favicon.png" alt="GhostCast" width="150" />
</p>

<h1 align="center">GhostCast</h1>

<p align="center">
  A full-stack application built with NestJS, React, PostgreSQL, and Redis — orchestrated as a pnpm + Turbo monorepo.
</p>

---

## Project Structure

```
GhostCast/
├── apps/
│   ├── api/          # NestJS backend (port 4000)
│   └── web/          # React + Vite frontend (port 5173 dev / 443 prod)
├── packages/
│   ├── database/     # Prisma schema & client
│   ├── plugin-sdk/   # Plugin development SDK
│   └── shared/       # Shared types, utilities, constants
├── docker/           # Docker entrypoint scripts
└── docker-compose.yml
```

## Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.14.2
- **PostgreSQL** 16
- **Redis** 7
- **Docker & Docker Compose** (for production)

---

## Development

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Copy the `.env` file at the project root and update values as needed (see [Environment Variables](#environment-variables) below).

### 3. Set up the database

```bash
pnpm db:generate   # Generate Prisma client
pnpm db:migrate    # Run database migrations
```

### 4. Start the dev servers

```bash
# Start both API and Web simultaneously
pnpm dev
```

Or start them individually:

```bash
pnpm --filter @ghostcast/api dev   # NestJS API on http://localhost:4000
pnpm --filter @ghostcast/web dev   # Vite dev server on https://localhost:5173
```

### Other useful commands

```bash
pnpm build            # Build all packages
pnpm lint             # Lint all packages
pnpm test             # Run tests
pnpm typecheck        # TypeScript type checking
pnpm format           # Format code with Prettier
pnpm db:studio        # Open Prisma Studio
pnpm db:push          # Push schema changes to DB
```

---

## Production (Docker)

### Start all services

```bash
docker-compose up -d
```

This starts four containers:

| Service | Container | Port |
|---------|-----------|------|
| PostgreSQL 16 | `ghostcast-postgres` | 5432 |
| Redis 7 | `ghostcast-redis` | 6379 |
| NestJS API | `ghostcast-api` | 4000 (internal) |
| Nginx (Web) | `ghostcast-web` | 443 (HTTPS), 80 (HTTP redirect) |

### Rebuild and restart

```bash
docker-compose up --build -d
```

### View logs

```bash
docker-compose logs -f
```

### Stop services

```bash
docker-compose down
```

### SSL Certificates

The Nginx container expects SSL certificates mounted at `./certs/`:

```
certs/
├── ghostcast_crp_specterops_io.crt
└── ghostcast_crp_specterops_io.key
```

---

## Environment Variables

### Core

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `NODE_ENV` | `production` | No | `development`, `production`, or `test` |
| `APP_URL` | `http://localhost:5173` | Yes | Frontend application URL |
| `API_URL` | `http://localhost:4000` | Yes | API server URL |
| `API_PORT` | `4000` | No | API server listen port |

### Database

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DATABASE_URL` | — | Yes | Full PostgreSQL connection string |
| `POSTGRES_USER` | `ghostcast` | Yes | PostgreSQL username |
| `POSTGRES_PASSWORD` | `ghostcast_dev` | Yes | PostgreSQL password |
| `POSTGRES_DB` | `ghostcast` | Yes | PostgreSQL database name |
| `POSTGRES_PORT` | `5432` | No | PostgreSQL port |

### Redis

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `REDIS_URL` | `redis://redis:6379` | No | Redis connection URL |
| `REDIS_PORT` | `6379` | No | Redis port |

### Authentication

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `JWT_SECRET` | — | Yes | JWT signing secret (min 32 characters) |
| `JWT_EXPIRES_IN` | `15m` | No | JWT token expiration |
| `JWT_REFRESH_SECRET` | — | Yes | JWT refresh token secret (min 32 characters) |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | No | Refresh token expiration |
| `SESSION_SECRET` | — | Yes | Session encryption secret (min 32 characters) |
| `ENCRYPTION_KEY` | — | No | Data encryption key |

### SAML/SSO (Optional)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `SAML_ENABLED` | `false` | No | Enable SAML 2.0 authentication |
| `SAML_ENTRY_POINT` | — | If SAML enabled | SAML IdP entry point URL |
| `SAML_ISSUER` | `ghostcast` | No | SAML issuer identifier |
| `SAML_CERT` | — | If SAML enabled | SAML certificate (PEM format) |
| `SAML_CALLBACK_URL` | `http://localhost:4000/api/auth/saml/callback` | If SAML enabled | SAML callback URL |

### Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `THROTTLE_SHORT_TTL` | `1000` | Short throttle window (ms) |
| `THROTTLE_SHORT_MAX` | `100` | Max requests in short window |
| `THROTTLE_MEDIUM_TTL` | `10000` | Medium throttle window (ms) |
| `THROTTLE_MEDIUM_MAX` | `200` | Max requests in medium window |
| `THROTTLE_LONG_TTL` | `60000` | Long throttle window (ms) |
| `THROTTLE_LONG_MAX` | `1000` | Max requests in long window |
| `LOGIN_RATE_LIMIT_TTL` | `60000` | Login attempt window (ms) |
| `LOGIN_RATE_LIMIT_MAX` | `5` | Max login attempts per window |

### Other

| Variable | Default | Description |
|----------|---------|-------------|
| `CORS_ORIGIN` | `http://localhost:5173` | CORS allowed origin |
| `LOG_LEVEL` | `debug` | Logging level (`error`, `warn`, `info`, `debug`, `verbose`) |
| `BACKUP_DIRECTORY` | `./backups` | Database backup directory |
| `WEB_PORT` | `443` | Nginx web server port (production) |

### Vite / Frontend Development Only

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_PORT` | `5173` | Vite dev server port |
| `VITE_API_TARGET` | `http://127.0.0.1:4000` | Vite proxy target for `/api` routes |
| `VITE_WS_TARGET` | `ws://127.0.0.1:4000` | Vite proxy target for WebSocket |
| `VITE_SSL_KEY` | `./certs/key.pem` | Path to SSL key for HTTPS dev server |
| `VITE_SSL_CERT` | `./certs/cert.pem` | Path to SSL cert for HTTPS dev server |
