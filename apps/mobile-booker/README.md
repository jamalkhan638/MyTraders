# SupplyBeacon Booker (Android)

Offline-first Order Booker app — React Native + Expo (SDK 57) + TypeScript, in the SupplyBeacon
monorepo. It uses the existing SupplyBeacon NestJS API only (no second backend). Decision D-46.

The booker can sign in, see their assigned shops (search, area filter), open a shop, book an order
— **also with no internet** — and see their orders with a clear sync state. Orders booked offline
are saved on the phone and sent automatically when the connection returns. No Admin features.

## Folder structure

```
apps/mobile-booker/
  app.config.ts          app name, Android package / versionCode, splash, plugins, API URL
  eas.json               build profiles: development / preview (APK) / production (AAB)
  assets/                icon, adaptive icon, splash, favicon (SupplyBeacon beacon)
  src/
    app/                 screens (Expo Router — every file is a route)
      _layout.tsx        providers (React Query, app state), root stack, splash
      login.tsx          1. Login
      (tabs)/index.tsx   2. My Shops (search, area chips, pull-to-refresh, last synced)
      (tabs)/orders.tsx  5+6. My Orders + Sync Center (pending / failed / last sync / Sync now)
      (tabs)/profile.tsx 7. Profile (name, email, company, last sync, Sync now, Log out)
      shop/[id].tsx      3. Shop Details (Create Order / Continue draft)
      order/new.tsx      4. Create Order (cached products, quantities only; correct a failed order)
      order/[id].tsx     order details: sync state, reason, Retry / Correct / Discard
    api/                 ApiClient (tokens, refresh, errors) — talks to the existing API
    auth/                SecureStore wrapper (refresh token + user; never SQLite)
    db/                  SQLite schema (sql.ts), expo-sqlite adapter, all queries (repo.ts)
    orders/book.ts       local-first booking (validation, clientOrderId, PENDING_SYNC)
    sync/                SyncService (how), SyncController (when), failure → plain reasons
    state/               app context (session, NetInfo, timers), local React Query hooks
    ui/                  theme, components, banner, dialogs
    test/                Node SQLite adapter, in-memory secure store, fake API server
```

## Run it (development)

```bash
pnpm install                                   # from the repo root
pnpm --filter @mytraders/shared-types build    # shared schemas used by the app
cp apps/mobile-booker/.env.example apps/mobile-booker/.env   # set EXPO_PUBLIC_API_URL
pnpm --filter @mytraders/mobile-booker start   # Metro; open on a phone / emulator
```

- `EXPO_PUBLIC_API_URL` includes `/api`. Android emulator → `http://10.0.2.2:3000/api`; a real
  phone on the same Wi-Fi → `http://<computer-LAN-IP>:3000/api`; production →
  `https://api.supplybeacon.com/api`. Plain `http` is only allowed in builds whose API URL is
  `http` (development).
- One build works for every tenant: the organization always comes from the signed-in user.
- Demo login: `booker@demo.test` / `Booker@12345`. Admin / Super Admin accounts are refused.

Checks: `pnpm --filter @mytraders/mobile-booker typecheck | lint | test | build:check`
(`build:check` bundles the whole app for Android with Metro).

## Build an installable APK (internal / manual distribution)

**Cloud (recommended, no Android Studio needed)** — needs a free Expo account:

```bash
cd apps/mobile-booker
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview   # → .apk download link
```

The `preview` profile builds an **APK** (`android.buildType: "apk"`) against
`https://api.supplybeacon.com/api`. Send the link / file to bookers; they allow "Install unknown
apps" once and install it. EAS manages the signing key (keep it — every update must use the same key).

**Local (Android SDK + JDK 17 installed)**:

```bash
cd apps/mobile-booker
EXPO_PUBLIC_API_URL=https://api.supplybeacon.com/api npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease     # → android/app/build/outputs/apk/release/app-release.apk
```

(Configure a release keystore in `android/app/build.gradle` first; the generated project signs
release builds with the debug key, which is fine for testing only.)

**Future Play Store build (.aab)**: `npx eas-cli@latest build --platform android --profile production`
(or `./gradlew bundleRelease` locally). Before each release bump `version` and `android.versionCode`
in `app.config.ts` (versionCode must always increase).

## Local database (SQLite, `supplybeacon-booker.db`)

Every row carries `owner_id` (the signed-in user's id) and every query filters on it, so another
booker or organization signing in on the same phone never sees it. Tokens are **not** stored here.

| Table           | Contents                                                                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `meta`          | per user: `last_sync`, `last_master_sync`, `local_seq` (Local-001 numbering)                                                                                                                                                                           |
| `areas`         | id, name, shop_count — areas of my shops (read-only copy)                                                                                                                                                                                              |
| `shops`         | id, name, contact, phone, address, area — my active assigned shops (read-only copy)                                                                                                                                                                    |
| `products`      | id, name, code, type (TIN / POUCH), pieces per carton — active products, **no prices**                                                                                                                                                                 |
| `orders`        | `local_id` (= clientOrderId UUID), local_number, shop, notes, `status` (DRAFT / PENDING_SYNC / SYNCING / SYNCED / FAILED), retryable, attempts, next_attempt_at, last_error, server_id, server_number, server_status, created / updated / synced times |
| `order_items`   | order_local_id, line_no, product id / name / type, quantity                                                                                                                                                                                            |
| `server_orders` | my recent server orders (number, shop, status, counts, clientOrderId) for My Orders offline                                                                                                                                                            |

## Synchronisation

- **Master data**: on every online sync (sign-in, reconnect, pull-to-refresh, Sync now) shops,
  areas and products are downloaded (all pages) and replace the local copy in one transaction.
  Shops / products / prices / assignments are never changed on the phone.
- **Orders (local-first)**: Submit → new UUID `clientOrderId` → order + lines saved in SQLite as
  `PENDING_SYNC` → sent now if online, otherwise later. The order in progress is kept as a `DRAFT`.
- **When**: connection comes back (NetInfo; reachability = the API's `/health`), right after an
  order is saved, Sync now / pull-to-refresh, app back to foreground, and a 60 s timer for due
  retries; while offline the app re-checks connectivity every 15 s.
- **How**: one sync run at a time (concurrent triggers share it); orders oldest first; each sent with
  its `clientOrderId`.

| Outcome                                                 | Local status                               | Next                              |
| ------------------------------------------------------- | ------------------------------------------ | --------------------------------- |
| 201                                                     | `SYNCED` + server id / number / time       | —                                 |
| No connection / timeout                                 | stays `PENDING_SYNC`                       | next trigger                      |
| 5xx / 429                                               | `FAILED`, retryable, backoff 30 s → 15 min | automatic                         |
| 400 / 409 / 422 (refused)                               | `FAILED`, not retried, plain reason        | booker: Correct / Retry / Discard |
| Session ended (disabled booker, suspended org, expired) | stays `PENDING_SYNC`                       | sign in again                     |

An order left `SYNCING` by a closed app goes back to `PENDING_SYNC` on start (safe: see below).

## Duplicate protection (`clientOrderId`)

`POST /orders` accepts `clientOrderId` (UUID). The server stores it, unique per organization
(`@@unique([organizationId, clientOrderId])`). Sending the same id again returns the order already
created (also for simultaneous sends — the unique index lets one through and the others return it);
another booker using the same id gets 409. So a weak connection that loses the reply can retry
safely: one booking = one server order. A refused order (422) created nothing on the server, so the
corrected order is sent again with the **same** id.

## Error messages the booker sees

- `Product <name> is no longer active. Edit the order and try again.`
- `<shop> is no longer active. / no longer assigned to you. This order cannot be sent.`
- `Your account is inactive` / `Your organization is suspended` — shown on the sign-in screen; the
  orders stay on the phone.
- Banners: `You are offline. Orders will be saved and synced automatically.` ·
  `Back online. Syncing pending orders...` · `3 orders synced successfully.`

## Sign-out and shared phones

Sign-out revokes the refresh token (when online), clears SecureStore and deletes this user's cached
shops / areas / products / order history and synced orders. Unsent orders (draft / pending / failed)
are kept, still owned by this user only, and sync the next time this user signs in — nothing booked
is ever lost, and no other user can see them.
