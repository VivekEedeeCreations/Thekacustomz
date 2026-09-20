# Inventory System

A production-oriented Inventory Management System, set up as a TypeScript monorepo.

> **What's in it:** products, variants, barcodes and images; categories, vendors and
> locations; an append-only stock ledger with barcode/QR scanning; label printing; and
> order management (Amazon, Flipkart, Meesho, Shopify, Instagram) with AWB linking,
> scan-to-dispatch, returns and exchanges — all behind role-based access (RLS). Purchase
> orders exist in the schema but have no screens yet.

## Tech stack

| Area     | Choices                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------- |
| Frontend | React, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router, TanStack Query, React Hook Form, Zod |
| Backend  | Node.js, TypeScript, Express (REST API)                                                              |
| Database | Supabase PostgreSQL via `@supabase/supabase-js` (no ORM, no Prisma)                                  |
| Storage  | Supabase Storage (product images and other uploads)                                                  |
| Auth     | Supabase Auth                                                                                        |
| Tooling  | npm workspaces, ESLint, Prettier, tsup, tsx                                                          |

## Repository layout

```
inventory-system/
├─ apps/
│  ├─ web/        # React + Vite frontend  (@inventory/web)
│  └─ api/        # Node + Express REST API (@inventory/api)
├─ packages/
│  └─ shared/     # Framework-agnostic types + Zod schemas (@inventory/shared)
├─ .env.example   # Reference for every env var in the monorepo
├─ eslint.config.js
├─ tsconfig.base.json
└─ package.json   # npm workspaces root
```

The frontend and backend are deployed independently. They share types through
the `@inventory/shared` workspace package.

---

## 1. Local setup

### Prerequisites

- **Node.js 20+** (see `.nvmrc`)
- **npm 10+** (bundled with Node)
- A **Supabase** account and project (see below)

### Install

```bash
git clone <your-repo-url> inventory-system
cd inventory-system
npm install
```

`npm install` at the root installs dependencies for every workspace.

### Environment files

Each app reads its own `.env`. Copy the examples:

```bash
cp .env.example .env                    # optional: reference only
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
```

Then fill in the values from your Supabase project (next section).

---

## 2. Supabase project setup

1. Go to <https://supabase.com/dashboard> and **create a new project**.
   Choose a strong database password and a region close to you.
2. Wait for provisioning to finish.
3. Open **Project Settings → API** and note:
   - **Project URL** → `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - **`anon` public key** (a.k.a. publishable key) → `VITE_SUPABASE_ANON_KEY`
   - **`service_role` key** → `SUPABASE_SERVICE_ROLE_KEY` (backend only — see the
     security note below)
4. Open **Authentication → Providers** and enable the sign-in methods you want
   (Email is on by default). For local development, add
   `http://localhost:5173` under **Authentication → URL Configuration →
   Redirect URLs**.

### 🔒 Security rule

**Never expose the `service_role` / secret key to the frontend.**

- The React app (`apps/web`) may only use `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY`. Anything prefixed `VITE_` is bundled into the
  browser.
- The `service_role` key lives **only** in `apps/api/.env` as
  `SUPABASE_SERVICE_ROLE_KEY`. It bypasses Row Level Security and must stay on
  the server.
- `apps/web` has no code path that reads a service-role key, and `.env` files
  are git-ignored.

---

## 3. Environment variables

### `apps/web/.env` (frontend — shipped to the browser)

| Variable                 | Description                                 |
| ------------------------ | ------------------------------------------- |
| `VITE_SUPABASE_URL`      | Supabase project URL                        |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon / publishable key             |
| `VITE_API_URL`           | _Optional._ Backend API URL (unused so far) |

### `apps/api/.env` (backend — server only)

| Variable                    | Description                                            |
| --------------------------- | ------------------------------------------------------ |
| `NODE_ENV`                  | `development` \| `test` \| `production`                |
| `PORT`                      | Port the API listens on (default `4000`)               |
| `API_CORS_ORIGIN`           | Comma-separated list of allowed browser origins        |
| `SUPABASE_URL`              | Supabase project URL                                   |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Service-role key, bypasses RLS. Never ship |

Environment values are validated at startup with Zod
(`apps/api/src/config/env.ts`, `apps/web/src/lib/env.ts`); the process/app fails
fast with a readable message if something is missing or malformed.

---

## 4. Database setup

This project talks to Postgres directly through `@supabase/supabase-js` — there
is **no ORM and no Prisma**. The full schema lives as plain SQL migrations in
[`supabase/migrations/`](./supabase/migrations); see
[`supabase/README.md`](./supabase/README.md) for a file-by-file breakdown.

**Local (requires Docker):**

```bash
npx supabase start     # boots the local stack and applies every migration
npx supabase db reset  # re-applies migrations from scratch (while iterating)
npx supabase db lint   # static schema analysis
npx supabase stop
```

**Hosted project:**

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push   # runs the migrations against the linked project
```

You can also run ad-hoc SQL in the Supabase dashboard under **SQL Editor**.

Baked into the schema:

- **RLS is enabled on every table** with role-based policies
  (`VIEWER < STAFF < MANAGER < ADMIN < OWNER`); the first user to sign up becomes
  `OWNER`.
- **Stock is derived, not edited:** `inventory.quantity` is maintained only by a
  trigger on the append-only `inventory_movements` ledger.
- Privileged writes (service-role key) stay behind `apps/api`.

---

## 5. Storage setup

Product images and other uploads use **Supabase Storage**.

The `20260907120700_storage.sql` migration **creates the `product-images`
bucket** (public read, 5 MiB limit, image MIME types only) and adds
`storage.objects` policies so only STAFF+ can upload / replace / delete. No
manual dashboard steps are needed.

- Object paths: `product-images/products/<product_id>/<image_id>.<ext>` and
  `product-images/variants/<variant_id>/<image_id>.<ext>`.
- `public.product_images` stores the bucket + path (plus order, primary flag,
  dimensions) — never the bytes.
- To make images private instead: set `public = false` in that migration and
  have `apps/api` hand out signed URLs.

---

## 6. Development commands

Run from the repo root.

| Command                | What it does                                          |
| ---------------------- | ----------------------------------------------------- |
| `npm run dev`          | Runs the API and web dev servers together             |
| `npm run dev:web`      | Vite dev server → <http://localhost:5173>             |
| `npm run dev:api`      | API with hot reload (tsx) → <http://localhost:4000>   |
| `npm run build`        | Builds `shared`, then `api` (tsup), then `web` (Vite) |
| `npm run typecheck`    | Type-checks every workspace (`tsc --noEmit`)          |
| `npm run lint`         | ESLint across the monorepo                            |
| `npm run lint:fix`     | ESLint with `--fix`                                   |
| `npm run format`       | Prettier write                                        |
| `npm run format:check` | Prettier check                                        |
| `npm run clean`        | Removes build output                                  |

Per-workspace scripts are also available, e.g.
`npm run build -w @inventory/api`.

### Typical first run

```bash
npm install
cp apps/web/.env.example apps/web/.env   # then edit
cp apps/api/.env.example apps/api/.env   # then edit
npm run dev
```

Open <http://localhost:5173>.

### Testing on a phone

The app is responsive (sidebar collapses to a drawer, tables scroll
horizontally, dialogs adapt to small screens) and the **Scan** page's
USB/Bluetooth-scanner and manual-entry inputs work over plain HTTP. The
**camera** scanner, however, needs a [secure
context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) —
browsers disable `getUserMedia` on plain `http://` unless the host is
`localhost`, so opening `http://<your-lan-ip>:5173` from a phone will show a
clear error instead of a camera. To test the camera on a real device, either:

- run `npm run dev:web -- --host` and open the LAN URL over **HTTPS** (e.g.
  `vite --host --https` with a [mkcert](https://github.com/FiloSottile/mkcert)
  certificate), or
- deploy to any HTTPS-hosted preview and test there.

---

## 7. Deploying (HTTPS, works on phones)

Only the **web app** needs hosting. It is a static site that talks straight to
Supabase (auth, database, storage); the Express app in `apps/api` isn't used by any
feature yet, so you can leave it undeployed.

1. **Push the schema to your Supabase project** (once, and after every new migration):

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

2. **Host the web app** on any static host that gives you HTTPS — Vercel, Netlify or
   Cloudflare Pages all do, free. `vercel.json` and `netlify.toml` are already set up
   (build command, output folder, and the "serve `index.html` for every path" rule that
   makes links like `/orders/123` and page refreshes work). Import the repo and set
   **only these two environment variables**:

   | Variable                 | Value                           |
   | ------------------------ | ------------------------------- |
   | `VITE_SUPABASE_URL`      | your project URL                |
   | `VITE_SUPABASE_ANON_KEY` | your **anon / publishable** key |

   Never add the service-role / secret key to the host: everything prefixed `VITE_` is
   published inside the JavaScript bundle.

3. **Tell Supabase about the new address** — Authentication → URL Configuration: set
   **Site URL** to `https://your-app.example.com` and add it under **Redirect URLs**.
   Decide on **Authentication → Providers → Email → Confirm email**: on means new users
   must click an emailed link before signing in (Supabase's built-in mailer is heavily
   rate-limited, so configure custom SMTP for real use); off is simpler for a small team.

4. **Create your owner account first.** The first person to sign up becomes `OWNER`;
   everyone after starts as `STAFF`, who can create and edit products, orders and stock.
   Sign up yourself straight away, add your team, then **turn off public sign-ups**
   (Authentication → Sign In / Providers → _Allow new users to sign up_) so strangers who
   find the URL can't create accounts. Invite people from Authentication → Users instead.

5. **On a phone**, open the site and use _Add to Home Screen_. HTTPS is what allows the
   camera scanner on the Scan and Dispatch pages to work.

## Project conventions

- **Package manager:** npm workspaces. Install once at the root.
- **Shared code:** put cross-cutting types and Zod schemas in
  `packages/shared`; it is consumed as `@inventory/shared`. Rebuild it
  (`npm run build:shared`) after changing it, or rely on `npm run build` /
  `npm run typecheck` which build it first.
- **No ORM:** database access is plain `@supabase/supabase-js`.
- **Env safety:** only `VITE_*` vars reach the browser; secrets live in
  `apps/api/.env` only.
# Thekacustomz
