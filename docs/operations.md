# Operations — deployment, configuration, backups

How to run MyTraders for real customers. Development setup is in the [README](../README.md).

## 1. Shape of a deployment

```
browser ──HTTPS──▶ reverse proxy / load balancer (TLS)
                     ├── /        → apps/web build (static files)
                     └── /api/*   → apps/api (node dist/main.js), 1+ instances
                                     └── PostgreSQL 16 (managed, backups + point-in-time recovery)
```

- Web and API on **one domain** (`/api` behind the same host) — the refresh cookie is `SameSite=Strict`, `Path=/api/auth`, `httpOnly`, `Secure`.
- The API is stateless (JWT access tokens, refresh tokens in the database), so it can run several instances. All money rules that need serialization use database row locks, not process memory.
- Requirements: Node 22+, PostgreSQL 16.

## 2. Configuration (`apps/api`, environment variables)

Validated at startup (`src/config/env.ts`) — the API refuses to boot on an invalid value.

| Variable | Production value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Disables Swagger; turns on the production checks below |
| `PORT` | e.g. `3000` | |
| `DATABASE_URL` | managed Postgres URL with `sslmode=require` | The app user needs no superuser rights (DDL only for migrations) |
| `JWT_ACCESS_SECRET` | ≥ 32 random chars (`openssl rand -base64 48`) | **Refused** if it is still the `.env.example` value. Rotating it signs everyone out of their access token (refresh tokens keep working) |
| `JWT_ACCESS_TTL_SECONDS` | `900` | |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | |
| `CORS_ORIGIN` | `https://app.example.com` | Comma-separated list |
| `COOKIE_SECURE` | `true` | **Must** be true in production (startup refuses `false`) |
| `LOG_LEVEL` | `info` | JSON logs to stdout |
| `LOGIN_RATE_LIMIT` | `10` | Login attempts per client IP per minute |
| `TRUST_PROXY` | `1` behind one load balancer | Which proxies may set `X-Forwarded-For` (`loopback`, a hop count, IPs/CIDRs, `false`). Wrong values make every user share one IP for the login rate limit; `true` is refused (clients could spoof their IP) |

Secrets come from the platform's secret store, never from a committed file.

## 3. Database migrations

- Deploy with **`pnpm --filter @mytraders/api prisma:deploy`** (`prisma migrate deploy`) — applies committed migrations only. **Never** run `migrate dev`, `migrate reset` or `db push` against production.
- Run migrations as a release step **before** starting the new API version; the API itself never migrates.
- Migrations are hand-reviewed SQL in `apps/api/prisma/migrations` (timestamped, applied in order). Invoices, invoice items, ledger entries, payments and expenses are protected by append-only triggers; a migration that must correct such rows disables the trigger for that statement only and enables it again in the same migration (see `20261005180000_invoice_payable_value`, `20261005210000_invoice_area_snapshot`). Treat any such migration as a data change: take a backup first and check the counts after.
- Before each release: `prisma migrate status` (nothing pending in the repo that is not committed) and the drift check from the README (`migrate diff --from-migrations … --to-schema-datamodel … --exit-code`).
- Prefer additive changes (new nullable column → back-fill → `SET NOT NULL`) so the previous API version keeps working during a rolling deploy.

## 4. Backups and restore

The ledger and invoices are the customer's books — losing them is not acceptable.

**Backups**
- Managed PostgreSQL with **automated daily snapshots** and **point-in-time recovery** (WAL archiving), retention ≥ 30 days.
- Plus a **nightly logical dump** to separate storage (another account / region), retention 90 days:
  ```bash
  pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" > mytraders-$(date +%F).dump
  ```
- Encrypt dumps at rest; access limited to operators.

**Restore** (to a new database, never over the live one)
```bash
createdb mytraders_restore
pg_restore --no-owner --no-acl --dbname "$RESTORE_URL" mytraders-YYYY-MM-DD.dump
DATABASE_URL="$RESTORE_URL" pnpm --filter @mytraders/api exec prisma migrate status   # schema up to date?
```
Then check the books before switching over: for each organization, Σ ledger balances = Total Market Credit on the dashboard, invoice count and last invoice number per organization, payment count. Point the API at the restored database (`DATABASE_URL`) and restart.

**Restore drill**: restore the latest dump into a scratch database at least monthly and run the checks above; record the time it took (the recovery time objective).

Restoring one organization alone is not supported by the tools yet (all organizations share one database) — restore to a scratch database and copy that organization's rows with care, or restore everyone to a point in time.

## 5. Organizations, users and demo data

- **Create a customer** with the CLI (no sign-up page in the MVP):
  ```bash
  ADMIN_PASSWORD='…' pnpm --filter @mytraders/api org:create -- --name "Ali Akbar Traders" \
    --admin-name "Owner" --admin-email owner@example.com --invoice-prefix M- --invoice-digits 8
  ```
  It creates the organization, its number counters, the default expense categories and the first Admin in one transaction. Passing the password through `ADMIN_PASSWORD` keeps it out of the shell history.
- **Demo data never reaches production**: `prisma/seed.ts` refuses to run when `NODE_ENV=production` **or** when the database name does not end in `_dev` / `_test`. `prisma migrate deploy` never seeds.
- An Admin manages Order Bookers in the app (create, reset password, deactivate — deactivation and password reset end their sessions at once). Admin accounts and Admin password changes are CLI / database operations in the MVP (see the TODO in implementation-plan).

## 6. Monitoring and logs

- **Health**: `GET /api/health` → `200 {"status":"ok"}` when the API can query the database, `503` otherwise. Use it for the load balancer and an uptime monitor.
- **Logs**: one JSON line per request (pino) with `req.id` (also returned as `X-Request-Id`; an incoming `X-Request-Id` is kept), `userId`, `organizationId`, status and time. `Authorization`, cookies and `Set-Cookie` are redacted; request bodies (passwords, amounts) are not logged. Every 5xx logs its stack trace; clients only ever see `Internal server error`.
- Alert on: health check failures, any 5xx, a burst of 401/429 on `/api/auth/login`.

## 7. Security notes

- Passwords: argon2id. Refresh tokens: random, stored as SHA-256 hashes, rotated on every use, reuse revokes the whole family. Access tokens: 15 min; every request re-reads the user, so deactivation, a suspended organization or a role change apply immediately.
- Tenant isolation: every query on tenant data goes through the tenant-scoped Prisma client; raw SQL filters on `organizationId` explicitly; client-sent `organizationId` is ignored (tests: `tenant-isolation`, `hardening`).
- HTTP: helmet headers, CORS limited to `CORS_ORIGIN`, request bodies limited to 100 kB (413 above), login rate limit per IP.
- Order Bookers never receive prices, costs, balances or profit (D-24).
