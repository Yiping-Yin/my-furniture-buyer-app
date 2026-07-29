# Furniture Buyer App

## What this is

A web app for a furniture shop's buyers, built across a multi-day hackathon (today is Day 1). A logged-in user browses a furniture catalogue and places orders, with the app tracking their spending against a personal budget.

The project owner has no coding background. Claude Code is responsible for all technical decisions and implementation; explanations should stay in plain English.

## Core features (Day 1 scope)

- **Login** — email + password signup/login for individual users.
- **Catalogue** — browse a fixed, pre-seeded list of furniture products (name, description, price, image). No admin/CMS screens — the catalogue is not user-editable in this phase.
- **Budget-tracked ordering** — every new user starts with the same default budget. Placing an order checks the order total against the user's *remaining* budget (starting budget minus amount already spent) and rejects orders that would exceed it. Successful orders reduce the remaining budget.

## Explicitly out of scope (for now)

- Admin/seller tools to add or edit products.
- Per-user custom starting budgets (everyone gets the same default).
- Payment processing (orders are simulated — no real payments).

## Deployment goal

Must be reachable via a live URL (not just localhost), so it can be demoed without the owner running anything locally.

## Tech stack

- **Next.js** (App Router, JavaScript — not TypeScript) — pages and server logic in one codebase.
- **Supabase** — Postgres database + Auth (email/password).
- **Tailwind CSS** — styling.
- **Vercel** — hosting, deployed from the GitHub repo.
- **`@supabase/ssr`** — cookie-based Supabase sessions in Next.js server code.

## Architecture rules

- The browser never queries Supabase directly for data. Pages render server-side and query on the user's behalf using the **anon key**; **Row Level Security policies in the database are the security boundary**. The service role key is not used anywhere in this app.
- **All order-placement correctness lives in one Postgres function, `place_order()`** (`supabase/schema.sql`) — it re-reads prices from the database, checks the budget, and writes the order and budget update in a single transaction. Never add a code path that inserts into `orders` directly.
- Prices sent from the browser are never trusted; always re-read from `products`.
- Remaining budget is never stored — always compute `budget - total_spent`.
- Database setup and seeding are run by pasting `supabase/schema.sql` and `supabase/seed.sql` into Supabase's browser SQL editor.

## Folder structure

```
app/            pages (login, signup, catalogue, cart, orders) + actions/ Server Actions
components/     Navbar, ProductCard, BudgetBar, CartProvider
lib/            supabase-server.js, supabase-browser.js
supabase/       schema.sql (tables, trigger, RLS, place_order), seed.sql (sample products)
middleware.js   redirects logged-out users to /login
```

## Working with this repo

- Design spec: `docs/superpowers/specs/2026-07-29-furniture-buyer-app-design.md` — read it before changing behaviour.
- Email confirmation is **disabled** in Supabase for demo convenience. Re-enable it for any real use.
