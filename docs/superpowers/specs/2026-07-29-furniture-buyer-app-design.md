# Furniture Buyer App — Design Spec

**Date:** 2026-07-29
**Status:** Approved
**Scope:** Day 1 of a multi-day hackathon

## 1. Purpose

A web app for buyers at a furniture shop. A user signs up or logs in, browses a catalogue of furniture, adds items to a cart, and places an order. Each user has a fixed spending budget; the app tracks what they have spent and refuses orders that would exceed their remaining budget.

The project owner has no coding background. All technical decisions are made by Claude Code, and all explanations to the owner are in plain English.

## 2. Confirmed decisions

| Decision | Choice |
|---|---|
| Deployment | Live public URL (not localhost only) |
| Budget model | Fixed budget per user, spent down by orders |
| Budget source | Same default for every user: **$5,000 USD** |
| Catalogue source | Fixed, pre-seeded sample data — no admin/CMS screens |
| Login | Email + password |
| Timeline | Day 1 of several; today builds a working foundation |

## 3. Out of scope

- Admin or seller tools for adding/editing products.
- Per-user custom budgets.
- Real payment processing — orders are recorded, not charged.
- Order cancellation, refunds, or budget top-ups.
- Automated test suite (see §9).

## 4. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js** (App Router, JavaScript) | Pages and server-side logic live in one codebase — one thing to build, deploy, and reason about. JavaScript rather than TypeScript to keep friction low. |
| Database | **Supabase Postgres** | Relational tables suit budget arithmetic. Comes with a browser-based table editor so the owner can inspect real data without writing SQL. |
| Login | **Supabase Auth** (email + password) | Password hashing, sessions, and login flows are handled by the service rather than hand-written. |
| Styling | **Tailwind CSS** | Utility classes; no separate stylesheets to keep in sync. |
| Hosting | **Vercel** | Connects to the GitHub repo and produces a live URL; free at this scale; built by the makers of Next.js. |
| Supabase client | **`@supabase/ssr`** | The official package for cookie-based Supabase sessions in Next.js server code. |

### 4.1 How security actually works

The browser never queries the database directly. Pages are rendered by the Next.js server, which reads the logged-in user's session from a cookie and queries Supabase on their behalf.

The key used for this is Supabase's **anon key**, which is public by design. The real security boundary is **Row Level Security (RLS)** — rules enforced inside the database itself, which restrict every query to rows the requesting user is allowed to see. This is stronger than hiding a privileged key in the app, because the restriction is enforced by the database no matter what the application code asks for.

Supabase's privileged **service role key** is never used by this app and is never deployed. The one-time database setup (§6.5) is done by the owner pasting SQL into Supabase's own browser-based editor, which is already authenticated.

## 5. Data model

Four tables in the `public` schema. Supabase's own `auth.users` table (managed by Supabase Auth) holds credentials.

### `profiles`
One row per user, created automatically at signup.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | Foreign key to `auth.users.id`, `on delete cascade` |
| `email` | text | Copied from the auth record for easy display |
| `budget` | numeric(10,2) | Default `5000.00` |
| `total_spent` | numeric(10,2) | Default `0.00` |
| `created_at` | timestamptz | Default `now()` |

**Remaining budget is never stored.** It is always computed as `budget - total_spent`, so the two figures cannot drift out of sync.

### `products`
The fixed catalogue. Seeded once; not editable in-app.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint, PK | Generated |
| `name` | text, not null | e.g. "Oak Dining Table" |
| `description` | text | One or two sentences |
| `price` | numeric(10,2), not null | Must be `> 0` |
| `image_url` | text | External image URL |
| `created_at` | timestamptz | Default `now()` |

### `orders`
One row per placed order.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint, PK | Generated |
| `user_id` | uuid, not null | FK to `profiles.id`, `on delete cascade` |
| `total_amount` | numeric(10,2), not null | Computed server-side at order time |
| `created_at` | timestamptz | Default `now()` |

### `order_items`
The line items inside an order.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint, PK | Generated |
| `order_id` | bigint, not null | FK to `orders.id`, `on delete cascade` |
| `product_id` | bigint, not null | FK to `products.id` |
| `quantity` | integer, not null | Must be `>= 1` |
| `price_at_purchase` | numeric(10,2), not null | Price copied in at order time |

`price_at_purchase` exists so that a later change to a product's price does not silently rewrite the value of past orders.

### 5.1 Automatic profile creation

A Postgres trigger on `auth.users` inserts a matching `profiles` row (with the default budget) whenever a new user signs up. Doing this in the database rather than in app code means a user can never end up logged in without a profile, even if the browser closes mid-signup.

### 5.2 Row Level Security policies

RLS is enabled on all four tables.

| Table | Policy |
|---|---|
| `profiles` | A user may `select` only the row where `id = auth.uid()`. **No update policy** — if users could update their own profile they could raise their own `budget`, defeating the whole feature. `total_spent` is changed only by the `place_order` function (§5.3). |
| `products` | Any authenticated user may `select`. No insert/update/delete policy exists, so the catalogue is read-only to the app. |
| `orders` | A user may `select` only rows where `user_id = auth.uid()`. No direct insert — orders are created only by the `place_order` function (§5.3). |
| `order_items` | A user may `select` only rows whose parent order belongs to them. No direct insert. |

## 6. Key flows

### 6.1 Signup / login

1. User submits email + password on `/signup` or `/login`.
2. Supabase Auth creates or verifies the account and sets a session cookie.
3. On signup, the §5.1 trigger creates the profile with a $5,000 budget.
4. User is redirected to `/catalogue`.

**Email confirmation is disabled** in the Supabase project settings, so a new signup is logged in immediately rather than having to click a link in an email. This is a deliberate hackathon-demo tradeoff and is noted in the README as something to re-enable for real use.

`middleware.js` protects `/catalogue`, `/cart`, and `/orders`: a request without a valid session is redirected to `/login`.

### 6.2 Browsing and the cart

The catalogue page lists all products as cards (image, name, description, price) with an "Add to cart" button. The cart lives in the browser's `localStorage` as a simple list of `{ productId, quantity }` — so it survives a page refresh, needs no database writes while shopping, and disappears if the user clears their browser. Prices are *not* stored in the cart; they are always read fresh from the database.

A budget bar is visible on every logged-in page showing `spent / budget` and the remaining amount.

### 6.3 Placing an order — the critical path

Checkout calls a Next.js **Server Action**, which calls a single Postgres function, `place_order(items jsonb)`. The function is declared `security definer` — that is how it can write to `orders` and `order_items` even though the RLS policies in §5.2 grant users no direct insert rights on those tables. It is the only path through which an order can be created, so the budget check below can never be bypassed. Everything in it happens inside one database transaction:

1. Look up the calling user via `auth.uid()`.
2. Re-read the current `price` of every product ID in the submitted cart, straight from `products`. Prices sent from the browser are ignored entirely.
3. Reject the order if any product ID does not exist, or any quantity is below 1.
4. Compute `total = sum(price * quantity)`.
5. Read the user's `budget` and `total_spent`, locking the profile row. Reject if `total > budget - total_spent`.
6. Insert the `orders` row, insert the `order_items` rows, and increase `profiles.total_spent` by `total`.
7. Return a small result object — either `{ ok: true, order_id, total, remaining }`, or `{ ok: false, error: 'OVER_BUDGET', over_by, remaining }`. Expected rejections are returned as data rather than raised as database errors, so the app can turn them into the plain-English messages in §8 without parsing error strings. All rejection checks happen before any write, so a rejection writes nothing.

Because steps 5–6 are one transaction with the profile row locked, two orders submitted at the same moment cannot both squeeze past the same remaining budget, and a failure partway through cannot leave a recorded order with an un-updated budget. Either the whole order lands or none of it does.

On success, the Server Action clears the cart and redirects to `/orders`. On rejection, nothing is written and the user sees a message (§8).

### 6.4 Order history

`/orders` lists the user's past orders, newest first — date, total, and the line items — plus their current remaining budget.

### 6.5 Seeding the catalogue

`supabase/schema.sql` creates the tables, trigger, RLS policies, and `place_order` function. `supabase/seed.sql` inserts 8–12 sample furniture products. Both are run once by pasting them into the Supabase SQL editor in the browser — no local database tooling for the owner to install.

Product images use external URLs rendered with plain `<img>` tags rather than Next.js's `<Image>` component, which avoids per-host image configuration. This is a small performance tradeoff, revisitable later.

## 7. Folder structure

```
my-furniture-buyer-app/
  app/
    layout.js              # shared shell: fonts, Navbar, budget bar
    page.js                # "/" — redirects to /catalogue or /login
    login/page.js
    signup/page.js
    catalogue/page.js      # browse products, add to cart
    cart/page.js           # review cart, checkout
    orders/page.js         # past orders + remaining budget
    actions/
      auth.js              # signup / login / logout Server Actions
      orders.js            # checkout Server Action -> place_order()
  components/
    Navbar.js
    ProductCard.js
    BudgetBar.js
    CartProvider.js        # holds cart state, syncs to localStorage
  lib/
    supabase-server.js     # server-side client (reads session cookie)
    supabase-browser.js    # browser client, used by the login forms
  supabase/
    schema.sql             # tables, trigger, RLS policies, place_order()
    seed.sql               # sample furniture products
  middleware.js            # redirects logged-out users to /login
  .env.local               # Supabase URL + anon key (never committed)
  .env.example             # documents which variables are needed
  CLAUDE.md
  README.md
```

Each unit has one job: a page renders a screen, a Server Action performs one write, `lib/` holds the two database connections, and all order correctness lives in `place_order()` in the database. Nothing needs to know how anything else works internally.

## 8. Error handling

Every failure surfaces as plain English on the page — nothing fails silently.

| Situation | What the user sees |
|---|---|
| Wrong email or password | "That email and password don't match an account." |
| Signup with an existing email | "An account with that email already exists — try logging in." |
| Password too short | "Password must be at least 6 characters." (Supabase's minimum) |
| Checkout over budget | "This order is $X over your remaining budget of $Y." |
| Checkout with an empty cart | "Your cart is empty." |
| Any unexpected error | A generic "Something went wrong — please try again." with the real detail logged server-side. |

## 9. Testing

No browser-based UI test suite for Day 1 — screens are verified by clicking through the running app.

**One exception, because it is cheap and guards the feature that matters most:** the budget rules in `place_order` get a real automated test script (`supabase/verify.mjs`). It signs up a throwaway user through the ordinary public path and calls `place_order` exactly as the app does, then asserts that an in-budget order succeeds and updates the balance by exactly the order total, that an over-budget order is refused with nothing written, that browser-supplied prices are ignored in favour of database prices, and that unknown products and zero quantities are rejected. Run with `npm run verify:db`.

This is worth the time because budget arithmetic is the one place where a silent bug would be both easy to miss in a demo and embarrassing to discover live.

## 10. Day 1 acceptance criteria

Day 1 is done when, on the deployed URL:

1. A brand new user can sign up and lands on the catalogue.
2. That user's profile exists with a $5,000 budget and $0 spent.
3. The catalogue shows the seeded products with images and prices.
4. Items can be added to a cart, and the cart survives a page refresh.
5. An order within budget succeeds, appears in order history, and reduces the remaining budget by exactly the order total.
6. An order exceeding the remaining budget is refused with a clear message, and neither an order nor a budget change is recorded.
7. Visiting `/catalogue` while logged out redirects to `/login`.
8. Logging out and back in preserves the user's spending and order history.
