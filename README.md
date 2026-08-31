# Office Seat Booking & Management

A full-stack office seat booking system for two locations (50 seats each, 100
seats total, 90 employees) built with **Next.js 14 (App Router)**,
**TypeScript**, **Tailwind CSS**, **shadcn/ui**, and **Supabase**
(PostgreSQL + Auth + Realtime).

## Features

- Interactive floor map per location with live seat status (Available /
  Your seat / Occupied / Pending approval), colour-coded and updating in
  real time via Supabase Realtime.
- Employees can release their default seat for a date range, book an
  available seat elsewhere (auto-releasing their own default seat for the
  same dates when they book a seat at the other location), and request an
  occupied seat from its current holder — who gets a real-time in-app
  approve/reject prompt.
- Admins get a full map overview with date/location filters, a master seat
  reassignment tool, the ability to force-book/release/lock any seat on
  behalf of any employee, and an activity/analytics dashboard (daily
  occupancy + release trends, full audit log).
- All business rules (auto-release, transfer approval, admin overrides,
  double-booking prevention) are enforced in Postgres via
  `SECURITY DEFINER` RPC functions + Row Level Security, so the rules hold
  even if someone calls the API directly — not just through the UI.

## Tech stack

| Layer      | Choice                                            |
| ---------- | -------------------------------------------------- |
| Frontend   | Next.js 14 (App Router, RSC), TypeScript           |
| UI         | Tailwind CSS, shadcn/ui (Radix primitives)          |
| Charts     | Recharts                                            |
| Backend    | Supabase (PostgreSQL, Auth, Realtime, RLS)          |
| Deployment | Vercel (app) + Supabase (database)                  |

---

## 1. Prerequisites

- Node.js 18.18+ and npm
- A free [Supabase](https://supabase.com) account
- The [Supabase CLI](https://supabase.com/docs/guides/cli) (optional but
  recommended) **or** just the Supabase Dashboard's SQL editor

---

## 2. Create the Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New
   project**. Pick a name, database password, and region.
2. Once provisioned, go to **Project Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**server-only,
     never expose this in the browser**)
3. Go to **Authentication → URL Configuration** and add your local/deployed
   site URL (e.g. `http://localhost:3000` and your Vercel URL) to
   **Redirect URLs** so magic links work.
4. Go to **Authentication → Providers → Email** and make sure "Email"
   sign-in is enabled (both password and magic link use it).

---

## 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # only used by scripts/seed-users.mjs
SEED_USER_PASSWORD=ChangeMe123!                    # password for all seeded sample users
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`.env.local` is already gitignored — never commit it.

---

## 4. Run the database migrations

The SQL lives in [`supabase/migrations`](./supabase/migrations), applied in
order:

| File | Purpose |
| --- | --- |
| `0001_schema.sql` | Tables: `users`, `locations`, `seats`, `seat_releases`, `bookings`, `seat_requests`, `activity_log` |
| `0002_functions.sql` | `is_admin()`, new-user trigger, self-update guard trigger, and all business-logic RPCs (`get_seat_map`, `release_seat_range`, `book_seat_range`, `request_seat`, `respond_seat_request`, `admin_reassign_default_seat`, `admin_set_seat_active`, etc.) |
| `0003_rls.sql` | Row Level Security policies for every table |
| `0004_seed_locations_seats.sql` | Seeds 2 locations × 50 seats (idempotent) |
| `0005_realtime.sql` | Adds `bookings`, `seat_releases`, `seat_requests` to the Realtime publication |
| `0006_analytics.sql` | Admin analytics RPCs: `get_occupancy_trend`, `get_activity_log` |
| `0007_floor_plan.sql` | Custom per-location floor plan support: `locations.layout_mode`/`floor_plan_path`, `seats.pos_x`/`pos_y`, a public `floor-plans` Storage bucket with admin-only write policies, and the RPCs behind it |
| `0008_admin_master_data.sql` | `users.is_active` (+ a trigger syncing login-email changes into `public.users`), `admin_set_user_active`/`admin_upsert_seat` RPCs, deactivated-account checks in the booking/release/request RPCs, and the seat-release **merge fix** (see § 10 below) |
| `0009_sync_user_metadata.sql` | Trigger syncing `public.users.full_name`/`role` into `auth.users.raw_user_meta_data` both when edited via the app and via direct Supabase edits, plus a one-time backfill (see § 9.3) |

### Option A — Supabase CLI (recommended)

```bash
npm install -g supabase
supabase login
supabase link --project-ref your-project-ref
supabase db push
```

### Option B — SQL Editor (no CLI)

Open **SQL Editor** in the Supabase Dashboard and run each file in
`supabase/migrations/` **in numeric order**, one at a time.

---

## 5. Seed sample data

Locations and seats are already seeded by `0004_seed_locations_seats.sql`.
Sample **users** (2 admins + 90 employees, each pre-assigned a default seat
split across both locations) must be created through Supabase Auth, which
plain SQL can't do — this repo includes a script that uses the Auth Admin
API:

```bash
npm install
npm run seed:users
```

This creates:

- `admin1@seatbooking.dev`, `admin2@seatbooking.dev` — role `ADMIN`
- `employee.a01@seatbooking.dev` … `employee.a45@seatbooking.dev` — Location A, seats A-01..A-45
- `employee.b01@seatbooking.dev` … `employee.b45@seatbooking.dev` — Location B, seats B-01..B-45

All seeded users share the password from `SEED_USER_PASSWORD`
(`ChangeMe123!` by default). Seats A-46..A-50 and B-46..B-50 are left
unassigned (10 spare seats across 100, matching 90 employees). The script
is idempotent — re-running it skips users that already exist.

---

## 6. Setting up Microsoft (Azure AD / Entra ID) SSO

The login page already has a **Continue with Microsoft** button
([src/app/login/page.tsx](./src/app/login/page.tsx)) that calls
`supabase.auth.signInWithOAuth({ provider: 'azure' })`. It won't work until
you register an app in Microsoft Entra ID and enable the Azure provider in
Supabase — both are one-time admin steps outside this codebase:

### 6.1 Register an app in Microsoft Entra ID

1. Go to [entra.microsoft.com](https://entra.microsoft.com) (or the Azure
   Portal → **Microsoft Entra ID**) → **App registrations** → **New
   registration**.
2. Name it (e.g. "Office Seat Booking"). Under **Supported account types**,
   pick **Accounts in this organizational directory only** to restrict
   sign-in to your company's tenant (recommended for an internal tool).
3. Under **Redirect URI**, choose platform **Web** and enter your
   **Supabase project's** callback URL — not your app's:
   ```
   https://your-project-ref.supabase.co/auth/v1/callback
   ```
4. Click **Register**. On the app's **Overview** page, copy the
   **Application (client) ID** and **Directory (tenant) ID**.
5. Go to **Certificates & secrets** → **New client secret**, create one,
   and copy its **Value** immediately (it's hidden after you leave the
   page).
6. Go to **API permissions** and confirm `openid`, `profile`, and `email`
   (Microsoft Graph, delegated) are present — they're added by default for
   new registrations. Click **Grant admin consent** if your org requires it.

### 6.2 Enable the provider in Supabase

1. In the Supabase Dashboard, go to **Authentication → Providers → Azure**
   and toggle it on.
2. Fill in:
   - **Client ID** → the Application (client) ID from step 6.1.4
   - **Client Secret** → the secret value from step 6.1.5
   - **Azure Tenant URL** → your Directory (tenant) ID from step 6.1.4
     (single-tenant apps use just the GUID here, not a full URL)
3. Save. Supabase's callback URL (the one you set in Azure) is fixed at
   `https://your-project-ref.supabase.co/auth/v1/callback` — you don't need
   to change anything else here.
4. Under **Authentication → URL Configuration**, make sure your app's own
   URLs (`http://localhost:3000`, your Vercel URL) are already in
   **Redirect URLs** (step 2.3 above covers this) — Supabase redirects back
   to *this* app's `/auth/callback` route after completing the Microsoft
   handshake.

### 6.3 How a Microsoft sign-in maps to a user in this system

There's no custom mapping code in this app for this — it's entirely
Supabase Auth's built-in identity linking, keyed on **email**:

- **Email already exists** (e.g. you created the user via Master Data or
  `npm run seed:users` first, then they later click "Continue with
  Microsoft"): Supabase matches the email from the Microsoft token against
  the existing `auth.users` row and **links** the Microsoft identity to
  that *same* account — same `id`, same role, same default seat, same
  booking history. Nothing new is created. This works because every
  account this app creates already has `email_confirm: true` (see
  `adminCreateUserAction` / `scripts/seed-users.mjs`) — Supabase requires
  the existing account's email to be confirmed before it will auto-link a
  new provider to it, otherwise it treats it as a conflict.
- **Email doesn't exist yet**: Supabase creates a brand-new `auth.users`
  row with that email. Our `handle_new_user` trigger fires exactly like any
  other sign-up, creating a `public.users` row with role `EMPLOYEE` and no
  default seat. An admin then assigns their seat from **Master Data** or
  **Reassign Seats**.

**Which email Supabase actually reads from the Microsoft token**: with the
`scopes: 'email openid profile'` we request (see `src/app/login/page.tsx`),
Supabase's `azure` provider uses the `email` claim from Microsoft's ID
token. In most tenants this is the user's real mailbox address and matches
what you'd expect. The gotcha: some Entra ID tenants have a **User
Principal Name (UPN)** that differs from the user's actual email (e.g. a
guest account, or a UPN like `j.doe@tenant.onmicrosoft.com` while their real
mail is `j.doe@yourcompany.com`) — if the `email` claim ends up empty or
different from the address you used to create their account here, Supabase
won't find a match and will create a *second*, separate account instead of
linking to the existing one. To confirm this won't happen for your tenant:
in **Entra ID → App registrations → your app → Token configuration**, make
sure an `email` optional claim is added and that each user's `mail`
attribute (not just their UPN) is populated. If you do end up with a
duplicate account from a mismatch, an admin can fix it from **Master Data**
by updating the *older* (correct) account's default seat/role as needed and
deactivating the accidental duplicate.

### 6.4 First sign-in behavior & promoting an admin

A user signing in with Microsoft for the first time gets a `public.users`
row auto-created (via the `handle_new_user` trigger) with role `EMPLOYEE`
and no default seat — same as any new sign-up. Have an admin assign their
default seat from **Master Data** or **Reassign Seats**, or promote them to
`ADMIN` from the Master Data **Users** tab (editing role directly in
Supabase also works and now stays in sync — see § 9.3).

Password and magic-link sign-in stay available alongside Microsoft SSO — if
you want Microsoft to be the *only* way in, that's a follow-up (hide the
other tabs, and optionally enforce it via a Supabase Auth hook).

---

## 7. Run the app locally

```bash
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) and sign in with a
seeded account (password tab), or request a magic link for any real email
you've added to Supabase Auth manually.

- Employees land on **My Floor Map** (`/dashboard`).
- Admins land on **Admin Overview** (`/admin`), with **Master Data**,
  **Reassign Seats**, **Floor Layout**, and **Activity & Analytics** in the
  top nav.

---

## 8. Using a custom floor plan image instead of the default grid

Every location starts on a uniform 5×10 grid. To match a real floor plan
(a CAD export, a photo of your seating chart, etc.) instead:

1. As an admin, go to **Floor Layout** (`/admin/floor-plan`) and pick the
   location.
2. Upload the floor plan image. It's stored in the `floor-plans` Supabase
   Storage bucket (created by `0007_floor_plan.sql`) and the location
   switches to `layout_mode = 'image'`.
3. Every seat appears as a numbered pin, initially cascaded across the
   top-left of the image. Drag each pin onto its real position — pins with
   a dashed amber border haven't been manually placed yet.
4. Click **Save positions** to persist `seats.pos_x` / `seats.pos_y`
   (stored as a percentage of the image's width/height, so it stays
   correct at any zoom or screen size).
5. **Switch to grid** at any time to fall back to the uniform layout
   without losing the uploaded image or saved positions — switching back
   to "Custom" restores them.

Note: this feature only repositions existing seats on an image — it doesn't
rename them. To match seat codes on your own floor plan (e.g. `WS-008`,
`CB-006`), rename seats from **Master Data** (§ 9 below) instead of editing
the database directly.

---

## 9. Master Data: managing users & seats from the Admin Panel

Everything under **Master Data** (`/admin/master-data`) is meant to remove
any need to touch the database directly for day-to-day changes.

### Inline editing

- **Users tab**: add a user, edit their name/email/role/default seat, and
  flip **Active** on/off — all from a table with search.
- **Seats tab**: add a seat, edit its number/location/row/col, and flip
  **Active** on/off the same way.
- Deactivating a user immediately bans their Supabase Auth account (they're
  signed out and blocked from signing back in) in addition to hiding them
  from being treated as active in booking/release logic — see § 9.2.
- Creating a user provisions a real Supabase Auth account with a random
  password that's never shown or needed — the new user just signs in via
  **Magic Link** (or Microsoft SSO, once configured) using their email.

### 9.1 Export to Excel / bulk upload

- **Export to Excel** downloads one workbook with two sheets, **Users** and
  **Seats**, using exactly the columns the importer expects (including a
  hidden-in-plain-sight `User ID` / `Seat ID` column — leave it blank to
  create a new row, or keep it as-is to update that existing record, even if
  you also change its email or seat number in the same row).
- Edit the file in Excel/Google Sheets/etc. and use **Import from Excel** to
  upload it back. The importer:
  1. Validates every row first (unknown location codes, malformed emails,
     seat numbers that collide with another seat, etc.) and shows a report
     of exactly which sheet/row/field failed and why — nothing is written
     to the database at this stage.
  2. Lets you **Apply** the rows that passed validation; invalid rows are
     skipped (fix them and re-import separately, or re-upload the whole
     file after correcting it — the same row will just resolve cleanly next
     time).
  3. Shows a per-row result (created / updated / failed with the specific
     error) after applying, so bulk updates are auditable, not a black box.

### 9.2 Account deactivation, end to end

Setting a user **Active = false** (individually, or via bulk import):

- Bans their Supabase Auth account via the Admin API (immediate, hard block
  on future sign-ins).
- Blocks them at the app's middleware too (an already-open session is signed
  out on its next request, rather than waiting for their access token to
  naturally expire).
- Blocks them at the RPC level: `release_seat_range`, `book_seat_range`, and
  `request_seat` all reject a deactivated non-admin caller directly, so the
  rule holds even if something bypassed the UI/middleware.

Reactivating flips all of this back (`ban_duration: 'none'`).

### 9.3 Staying in sync with Authentication → Users

Editing a user from Master Data (or editing `public.users` directly in
Supabase — the Table Editor or a raw SQL `update`) keeps the account shown
under **Authentication → Users** consistent, with one asymmetry worth
understanding:

- **Full name & role**: sync **both ways**, automatically, via the
  `on_public_user_updated` trigger (`0009_sync_user_metadata.sql`). Change
  either one from Master Data, or edit `public.users.full_name` /
  `public.users.role` directly in Supabase — either path updates
  `auth.users.raw_user_meta_data` (visible in that user's detail view under
  Authentication → Users) to match, immediately.
- **Email**: sync **one way only** — from the Admin Panel down. Editing a
  user's email in Master Data calls the Auth Admin API
  (`admin.auth.admin.updateUserById`), which is the only correct way to
  change a *login* email — it's what enforces uniqueness, confirmation
  state, and keeps linked identities (password, Microsoft, magic link) all
  pointed at the right account. That API call is what actually updates
  Authentication → Users, and a trigger then mirrors the result back into
  `public.users.email` for display. Editing `public.users.email` directly
  in Supabase does **not** change the login email — the account will still
  sign in with its old address, now showing a different (unsynced) email in
  our table. Always change email through Master Data, not raw SQL.
- **Active/Inactive**: same asymmetry as email, for the same reason — Master
  Data's toggle both sets `public.users.is_active` and bans/unbans the
  account via the Admin API; flipping `is_active` directly in Supabase only
  affects this app's own enforcement (middleware + the RPC checks), not
  whether Supabase Auth itself still accepts their login.

---

## 10. How the core rules are implemented

- **Seat status** is derived on read, not stored, via the `get_seat_map(location_id, date)`
  SQL function: a seat is occupied if there's a `CONFIRMED` booking that
  day, or if its default owner hasn't released it for that day.
- **Auto-release on cross-location booking**: `book_seat_range()` checks
  whether the booked seat differs from the caller's `default_seat_id`; if
  so, it releases the caller's default seat for the same date range, in the
  same transaction.
- **No duplicate/overlapping releases**: both `release_seat_range()` and the
  auto-release path above go through a shared `_upsert_seat_release()`
  helper. Before inserting, it finds any existing release for that same
  seat + owner whose dates overlap or are adjacent to the new range, merges
  them into one row (extending start/end as needed), and deletes the
  now-redundant originals — so re-releasing or extending a period updates
  the existing record instead of creating a second, overlapping one. Two
  genuinely separate future release windows (e.g. one in September, another
  in November) correctly stay as two rows.
- **Peer transfer workflow**: `request_seat()` inserts a `PENDING`
  `seat_requests` row; the target user's browser is subscribed to
  Supabase Realtime `postgres_changes` on `seat_requests` filtered by
  `target_user_id`, so the approve/reject banner appears instantly.
  `respond_seat_request()` books the seat for the requester on approval.
- **Admin overrides** reuse the same RPCs — `book_seat_range` and
  `release_seat_range` both allow an admin to act on any user's behalf,
  bypassing the "already booked" conflict check that applies to regular
  employees.
- **Security**: every mutation is a `SECURITY DEFINER` Postgres function
  that re-checks `auth.uid()` / `is_admin()` itself, so the rules hold
  even if a client calls the RPC directly. RLS policies on the underlying
  tables provide defense-in-depth for direct reads/writes, and a trigger
  on `users` blocks employees from self-escalating their role or seat via
  a raw table update.

---

## 11. Deploying to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In [vercel.com/new](https://vercel.com/new), import the repo.
3. Set the **Root Directory** to `seat-booking` if your repo has it
   nested, otherwise leave as-is.
4. Add environment variables in **Project Settings → Environment
   Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` → **required at runtime** (not just for
     seeding): the Master Data page uses it server-side to create/deactivate
     users via the Auth Admin API. Mark it as a server-only/secret variable
     — never expose it to the browser.
   - `NEXT_PUBLIC_SITE_URL` → your production URL (e.g.
     `https://your-app.vercel.app`)
   - (`SEED_USER_PASSWORD` is only needed if you run `npm run seed:users`
     from CI/CD.)
5. Deploy. Then add the deployed URL to Supabase **Authentication → URL
   Configuration → Redirect URLs** so magic-link sign-in works in
   production.

---

## Project structure

```
supabase/migrations/           SQL schema, RLS, RPC functions, seed data
scripts/seed-users.mjs         Creates sample auth users + seat assignments
src/
  app/
    login/                     Email/password, magic link, and Microsoft SSO sign-in
    auth/callback/             Magic-link / OAuth session exchange
    (app)/dashboard/           Employee floor map + "My Seat" panel
    (app)/admin/               Overview, master data, reassignment, floor layout, analytics
    (app)/admin/master-data/export/route.ts   Excel export (server-side, exceljs)
    actions/seats.ts           Server actions wrapping the booking/release RPCs
    actions/admin-users.ts     Server actions for user CRUD + activate/deactivate (Auth Admin API)
    actions/admin-seats.ts     Server actions for seat CRUD
    actions/master-data-import.ts   Parses + validates an uploaded Excel file
  components/
    floor-map/                 Grid / image seat renderers, details dialog, admin overrides
    admin/master-data/         Users & seats tables, create/edit dialogs, import dialog
    notifications/             Realtime peer-request approval banner
    shared/                    From/Till date picker, date/location controls
  lib/
    supabase/                  Browser / server / middleware / service-role Supabase clients
    master-data/schema.ts      Excel column definitions + row validation (shared by export & import)
  types/database.ts            Hand-written types mirroring the SQL schema
```
