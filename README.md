# MyTraders

Multi-tenant Distribution Management SaaS for distributors / wholesalers: areas, shops, products, order booking from the market (mobile), invoicing, shop credit ledger, expenses, profit and reports.

**Status:** Phase 1 (platform foundation) — authentication, roles, tenant isolation, Admin shell and Order Booker shell. Business modules start in Phase 2 ([plan](docs/implementation-plan.md)).

## Documentation (source of truth)

- [Product requirements](docs/product-requirements.md) — business rules, decisions, open questions
- [Invoice specification](docs/invoice-specification.md) — invoice structure; formulas pending owner confirmation
- [Architecture](docs/architecture.md)
- [Database design](docs/database-design.md)
- [Backend guidelines](docs/backend-guidelines.md)
- [Frontend guidelines](docs/frontend-guidelines.md)
- [Permissions](docs/permissions.md)
- [Implementation plan](docs/implementation-plan.md)

## Repository layout

```
apps/api               NestJS + Prisma (REST API, /api prefix, Swagger at /api/docs)
apps/web               React + Vite + Tailwind + shadcn/ui (Admin desktop + Order Booker mobile)
packages/shared-types  zod schemas + enums shared by api and web
packages/config        shared tsconfig + ESLint config
docker-compose.yml     PostgreSQL 16 (mytraders_dev + mytraders_test)
```

## Run locally

Requirements: **Node 22+**, **pnpm 10** (`corepack enable`), **PostgreSQL 16** (Docker or a local install).

```bash
# 1. Install dependencies
pnpm install

# 2. Start PostgreSQL (creates mytraders_dev and mytraders_test, user/password mytraders/mytraders)
docker compose up -d
#    Without Docker: create a role `mytraders` (password `mytraders`, CREATEDB) and the two databases yourself.

# 3. API environment
cp apps/api/.env.example apps/api/.env     # then set a long random JWT_ACCESS_SECRET

# 4. Create tables and demo data
pnpm --filter @mytraders/api prisma:deploy
pnpm --filter @mytraders/api db:seed

# 5. Run API (http://localhost:3000) and web (http://localhost:5173) together
pnpm dev
```

Open http://localhost:5173. Swagger: http://localhost:3000/api/docs.

### Demo accounts (dev seed only)

| Role | Email | Password | Lands on |
|---|---|---|---|
| Admin — Demo Traders | admin@demo.test | Admin@12345 | `/dashboard` |
| Order Booker — Demo Traders | booker@demo.test | Booker@12345 | `/booker` (open on a phone-size window) |
| Admin — Other Distributor | admin@other.test | Admin@12345 | `/dashboard` (a second, isolated organization) |
| Super Admin (platform) | super@mytraders.test | Super@12345 | `/platform` |

### Create a real organization

```bash
ADMIN_PASSWORD='choose-a-strong-one' pnpm --filter @mytraders/api org:create -- \
  --name "Ali Akbar Traders" --admin-name "Owner" --admin-email owner@example.com \
  --invoice-prefix M- --invoice-digits 8
```

Production deployment, configuration, migrations and backup / restore: [docs/operations.md](docs/operations.md).

## Checks

```bash
pnpm build        # shared-types, api, web
pnpm typecheck
pnpm lint
pnpm test         # api unit tests
pnpm test:e2e     # api e2e tests against mytraders_test (auth, roles, tenant isolation)
```

`test:e2e` uses `apps/api/.env.test`; it applies migrations to `mytraders_test` and empties its tables. It refuses to run against a database whose name does not contain `_test`.
