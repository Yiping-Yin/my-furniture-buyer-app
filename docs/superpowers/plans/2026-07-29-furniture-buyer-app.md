# Furniture Buyer App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deployed web app where a user signs up, browses a seeded furniture catalogue, and places orders that are checked and recorded against a fixed $5,000 personal budget.

**Architecture:** One Next.js App Router project renders every screen server-side and talks to Supabase (Postgres + Auth) using the public anon key, with Row Level Security in the database as the actual security boundary. All order-placement correctness — price lookup, budget check, order write, balance update — lives inside a single `security definer` Postgres function, `place_order()`, so it happens atomically and cannot be bypassed by the client.

**Tech Stack:** Next.js (App Router, JavaScript), React 19 Server Actions, Tailwind CSS v4, Supabase (`@supabase/ssr`, `@supabase/supabase-js`), `pg` (dev-only, for applying SQL), Vercel.

**Spec:** `docs/superpowers/specs/2026-07-29-furniture-buyer-app-design.md`

## Global Constraints

- **JavaScript, not TypeScript.** No `.ts`/`.tsx` files. No type annotations.
- **Currency is USD**, displayed as `$` with exactly two decimal places (`$1,299.00`). Money is `numeric(10,2)` in Postgres and is never handled as a float in JavaScript for arithmetic that affects a stored value — all money arithmetic happens in Postgres.
- **Default budget: `5000.00`** for every new user. Set once, as the column default on `profiles.budget`.
- **The service role key is never used and never stored.** Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` reach the app. `SUPABASE_DB_URL` exists only in local `.env.local` for the SQL-applying script and is never referenced by app code.
- **`.env.local` is never committed.** Verify it is gitignored before the first commit that creates it.
- **Prices from the browser are never trusted.** Only `productId` and `quantity` ever leave the browser.
- **Never insert into `orders` or `order_items` from application code.** The only writer is `place_order()`.
- **Remaining budget is never stored** — always `budget - total_spent`.
- **User-facing error text must match §8 of the spec verbatim.**
- Package manager: **npm**. Node 24 is installed; `--env-file` is available and should be used instead of a dotenv dependency for scripts.

## Prerequisites — owner actions (cannot be automated)

These need the owner's own browser login. Do these at the start of Task 1 and Task 2 respectively; everything else is automated.

- **Vercel account** — sign up at vercel.com using "Continue with GitHub" (the GitHub account `Yiping-Yin` is already authenticated locally).
- **Supabase account and project** — sign up at supabase.com with GitHub, create a project (any name; pick the region closest to the demo location), and save the database password shown at creation time.

## File Structure

| File | Responsibility |
|---|---|
| `app/layout.js` | HTML shell, Tailwind import, `Navbar` |
| `app/page.js` | `/` — redirect to `/catalogue` or `/login` |
| `app/login/page.js` | Login form |
| `app/signup/page.js` | Signup form |
| `app/catalogue/page.js` | Fetch products, render grid of `ProductCard` |
| `app/cart/page.js` | Cart contents, totals, checkout button |
| `app/orders/page.js` | Order history + remaining budget |
| `app/actions/auth.js` | `signup`, `login`, `logout` Server Actions |
| `app/actions/orders.js` | `checkout` Server Action → `place_order()` RPC |
| `components/Navbar.js` | Nav links, logout button, hosts `BudgetBar` |
| `components/BudgetBar.js` | Presentational: spent / budget / remaining |
| `components/ProductCard.js` | Presentational product tile + add-to-cart |
| `components/CartProvider.js` | Client cart state, `localStorage` persistence |
| `components/CartSummary.js` | Client component: cart lines priced from server-supplied products |
| `lib/supabase-server.js` | Server Supabase client (reads session cookie) |
| `lib/supabase-browser.js` | Browser Supabase client |
| `lib/money.js` | `formatMoney(value)` — the single place money is formatted |
| `middleware.js` | Session refresh + redirect logged-out users |
| `supabase/schema.sql` | Tables, trigger, RLS policies, `place_order()` |
| `supabase/seed.sql` | 10 sample products |
| `supabase/apply.mjs` | Runs schema.sql + seed.sql over `SUPABASE_DB_URL` |
| `supabase/verify.mjs` | Automated budget-rule tests against the real RPC |
| `scripts/make-images.mjs` | Generates the 10 product placeholder SVGs |

---

### Task 1: Scaffold the app and get a live URL

Deploying on Day 1 rather than at the end means hosting problems surface now, while there is time.

**Files:**
- Create: whole Next.js scaffold, `lib/money.js`, `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing
- Produces: `formatMoney(value)` from `lib/money.js` → string like `$1,299.00`; a deployed Vercel project auto-deploying from `main`

- [ ] **Step 1: Scaffold Next.js in place**

The directory already contains `.git`, `README.md`, `CLAUDE.md`, and `docs/`, so scaffold into a temp dir and move the files in.

```bash
cd /Users/yinyiping/Projects/my-furniture-buyer-app
npx --yes create-next-app@latest .tmp-scaffold \
  --js --tailwind --app --eslint --no-src-dir --no-turbopack \
  --import-alias "@/*" --use-npm --yes
# move everything including dotfiles, but not the scaffold's own git dir
shopt -s dotglob
mv .tmp-scaffold/* .
shopt -u dotglob
rm -rf .tmp-scaffold
```

- [ ] **Step 2: Confirm the dev server boots**

```bash
npm run dev
```
Expected: `Ready in ...` and a local URL. Fetch it to confirm, then stop the server:
```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000
```
Expected: `200`

- [ ] **Step 3: Confirm `.env.local` is gitignored**

```bash
grep -n 'env' .gitignore
```
Expected: a line covering `.env*`. If absent, append `.env*.local` to `.gitignore`.

- [ ] **Step 4: Create `.env.example`**

```
# Copy to .env.local and fill in from your Supabase project dashboard.
# Project Settings -> Data API  (URL and anon/public key)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Project Settings -> Database -> Connection string -> URI
# Local use only: applying schema.sql/seed.sql and running verify:db.
# Never needed by the deployed app; never commit this value.
SUPABASE_DB_URL=
```

- [ ] **Step 5: Create `lib/money.js`**

```js
export function formatMoney(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value))
}
```

- [ ] **Step 6: Replace `app/page.js` with a placeholder that proves the deploy works**

```js
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-stone-800">Furniture Buyer</h1>
        <p className="mt-2 text-stone-500">Setting up — check back shortly.</p>
      </div>
    </main>
  )
}
```

- [ ] **Step 7: Verify the production build compiles**

```bash
npm run build
```
Expected: build completes with no errors. A build failure here must be fixed before deploying.

- [ ] **Step 8: Commit and push**

```bash
git add -A
git commit -m "feat: scaffold Next.js app with Tailwind"
git push origin main
```

- [ ] **Step 9: Owner action — import the repo into Vercel**

Ask the owner to: go to vercel.com → **Add New… → Project** → import `Yiping-Yin/my-furniture-buyer-app` → leave every setting at its default → **Deploy**. Then have them paste back the live URL.

- [ ] **Step 10: Verify the deployed URL serves the placeholder**

```bash
curl -sS <live-url> | grep -o 'Furniture Buyer'
```
Expected: `Furniture Buyer`

- [ ] **Step 11: Record the URL in README and commit**

Add a `## Live app` section to `README.md` with the URL, then:
```bash
git add README.md && git commit -m "docs: record live deployment URL"
```

---

### Task 2: Database schema, seed data, and product images

**Files:**
- Create: `supabase/schema.sql`, `supabase/seed.sql`, `supabase/apply.mjs`, `scripts/make-images.mjs`, `public/images/*.svg`
- Modify: `package.json` (scripts), `.env.local` (owner-supplied values)

**Interfaces:**
- Consumes: `SUPABASE_DB_URL` from `.env.local`
- Produces: tables `profiles`, `products`, `orders`, `order_items`; trigger `on_auth_user_created`; RLS policies; 10 rows in `products` whose `image_url` values are `/images/<slug>.svg`. `place_order()` is Task 3.

- [ ] **Step 1: Owner action — create the Supabase project and disable email confirmation**

Ask the owner to:
1. Create the project at supabase.com (save the database password).
2. Go to **Authentication → Sign In / Providers → Email** and turn **Confirm email** OFF. (Without this, signup demands an inbox click and the demo stalls.)
3. From **Project Settings → Data API**, copy the **Project URL** and the **anon public** key.
4. From **Project Settings → Database → Connection string → URI**, copy the URI and substitute the saved database password for `[YOUR-PASSWORD]`.

Write all three values into `.env.local`.

- [ ] **Step 2: Install the SQL-applying dependency**

```bash
npm install --save-dev pg
```

- [ ] **Step 3: Write `scripts/make-images.mjs`**

Generates one flat-illustration SVG per product. Deliberately simple line-and-block shapes on a warm background — they read as intentional placeholders rather than broken images, and they never 404 or depend on an external host.

```js
import { mkdirSync, writeFileSync } from 'node:fs'

const BG = '#f5f1ea'
const INK = '#8a7f70'
const ACCENT = '#b8a68f'

// Each shape is drawn inside a 600x400 viewBox.
const SHAPES = {
  sofa: `<rect x="120" y="200" width="360" height="90" rx="14" fill="${ACCENT}"/>
         <rect x="100" y="170" width="60" height="120" rx="16" fill="${INK}"/>
         <rect x="440" y="170" width="60" height="120" rx="16" fill="${INK}"/>
         <rect x="170" y="175" width="130" height="40" rx="10" fill="${INK}" opacity="0.5"/>
         <rect x="310" y="175" width="130" height="40" rx="10" fill="${INK}" opacity="0.5"/>
         <rect x="150" y="290" width="16" height="30" fill="${INK}"/>
         <rect x="434" y="290" width="16" height="30" fill="${INK}"/>`,
  table: `<rect x="110" y="180" width="380" height="22" rx="8" fill="${INK}"/>
          <rect x="140" y="202" width="18" height="120" fill="${ACCENT}"/>
          <rect x="442" y="202" width="18" height="120" fill="${ACCENT}"/>
          <rect x="140" y="300" width="320" height="14" rx="6" fill="${ACCENT}"/>`,
  chair: `<rect x="240" y="120" width="120" height="130" rx="14" fill="${ACCENT}"/>
          <rect x="225" y="245" width="150" height="24" rx="8" fill="${INK}"/>
          <rect x="235" y="269" width="16" height="70" fill="${INK}"/>
          <rect x="349" y="269" width="16" height="70" fill="${INK}"/>`,
  bed: `<rect x="90" y="150" width="90" height="150" rx="14" fill="${INK}"/>
        <rect x="180" y="230" width="330" height="70" rx="12" fill="${ACCENT}"/>
        <rect x="200" y="200" width="110" height="40" rx="12" fill="#fff" opacity="0.8"/>
        <rect x="180" y="300" width="16" height="26" fill="${INK}"/>
        <rect x="494" y="300" width="16" height="26" fill="${INK}"/>`,
  shelf: `<rect x="180" y="110" width="240" height="16" fill="${INK}"/>
          <rect x="180" y="180" width="240" height="16" fill="${INK}"/>
          <rect x="180" y="250" width="240" height="16" fill="${INK}"/>
          <rect x="180" y="110" width="16" height="210" fill="${ACCENT}"/>
          <rect x="404" y="110" width="16" height="210" fill="${ACCENT}"/>`,
  lamp: `<path d="M300 90 L360 170 L240 170 Z" fill="${ACCENT}"/>
         <rect x="294" y="170" width="12" height="140" fill="${INK}"/>
         <rect x="255" y="308" width="90" height="14" rx="6" fill="${INK}"/>`,
  desk: `<rect x="120" y="190" width="360" height="20" rx="8" fill="${INK}"/>
         <rect x="140" y="210" width="120" height="90" rx="8" fill="${ACCENT}"/>
         <rect x="170" y="240" width="60" height="8" rx="4" fill="${BG}"/>
         <rect x="450" y="210" width="16" height="110" fill="${ACCENT}"/>
         <rect x="140" y="300" width="120" height="20" rx="6" fill="${INK}"/>`,
  stool: `<rect x="245" y="200" width="110" height="22" rx="10" fill="${ACCENT}"/>
          <rect x="258" y="222" width="14" height="100" fill="${INK}"/>
          <rect x="328" y="222" width="14" height="100" fill="${INK}"/>
          <rect x="258" y="270" width="84" height="10" fill="${INK}" opacity="0.6"/>`,
  wardrobe: `<rect x="200" y="100" width="200" height="220" rx="10" fill="${ACCENT}"/>
             <rect x="298" y="100" width="4" height="220" fill="${BG}"/>
             <circle cx="288" cy="210" r="7" fill="${INK}"/>
             <circle cx="312" cy="210" r="7" fill="${INK}"/>
             <rect x="200" y="320" width="200" height="12" rx="4" fill="${INK}"/>`,
  rug: `<ellipse cx="300" cy="230" rx="170" ry="70" fill="${ACCENT}"/>
        <ellipse cx="300" cy="230" rx="120" ry="46" fill="none" stroke="${BG}" stroke-width="10"/>
        <ellipse cx="300" cy="230" rx="70" ry="24" fill="none" stroke="${BG}" stroke-width="10"/>`,
}

const PRODUCTS = [
  ['oak-dining-table', 'table'],
  ['linen-three-seat-sofa', 'sofa'],
  ['walnut-dining-chair', 'chair'],
  ['upholstered-bed-frame', 'bed'],
  ['open-oak-bookshelf', 'shelf'],
  ['brass-floor-lamp', 'lamp'],
  ['compact-writing-desk', 'desk'],
  ['ash-counter-stool', 'stool'],
  ['two-door-wardrobe', 'wardrobe'],
  ['handwoven-wool-rug', 'rug'],
]

mkdirSync('public/images', { recursive: true })
for (const [slug, shape] of PRODUCTS) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400" role="img"><rect width="600" height="400" fill="${BG}"/>${SHAPES[shape]}</svg>`
  writeFileSync(`public/images/${slug}.svg`, svg)
}
console.log(`wrote ${PRODUCTS.length} images`)
```

- [ ] **Step 4: Generate the images and confirm all 10 exist**

```bash
node scripts/make-images.mjs && ls public/images | wc -l
```
Expected: `wrote 10 images` then `10`

- [ ] **Step 5: Write `supabase/schema.sql` (tables, trigger, RLS)**

`place_order()` is appended in Task 3. This file is written to be safely re-runnable.

```sql
-- Furniture Buyer App schema. Safe to re-run.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  budget numeric(10,2) not null default 5000.00 check (budget >= 0),
  total_spent numeric(10,2) not null default 0.00 check (total_spent >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id bigint generated always as identity primary key,
  name text not null,
  description text,
  price numeric(10,2) not null check (price > 0),
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  total_amount numeric(10,2) not null check (total_amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  product_id bigint not null references public.products(id),
  quantity integer not null check (quantity >= 1),
  price_at_purchase numeric(10,2) not null check (price_at_purchase > 0)
);

create index if not exists orders_user_id_created_at_idx
  on public.orders (user_id, created_at desc);
create index if not exists order_items_order_id_idx
  on public.order_items (order_id);

-- Give every new signup a profile with the default budget. Done in the
-- database so a user can never exist without a profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security is the real security boundary: the anon key is public,
-- so these policies are what actually keep users out of each other's data.
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "own profile is readable" on public.profiles;
create policy "own profile is readable" on public.profiles
  for select to authenticated using (auth.uid() = id);
-- Deliberately NO update policy on profiles: a user who could update their
-- own row could raise their own budget.

drop policy if exists "products are readable" on public.products;
create policy "products are readable" on public.products
  for select to authenticated using (true);

drop policy if exists "own orders are readable" on public.orders;
create policy "own orders are readable" on public.orders
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "own order items are readable" on public.order_items;
create policy "own order items are readable" on public.order_items
  for select to authenticated using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.user_id = auth.uid()
    )
  );
-- No insert/update/delete policies anywhere: all writes go through
-- place_order(), which is security definer.
```

- [ ] **Step 6: Write `supabase/seed.sql`**

Re-runnable: clears and reinserts the catalogue. `truncate ... restart identity cascade` also clears orders, which is correct for a seed — order line items reference product ids.

```sql
truncate table public.order_items, public.orders, public.products restart identity cascade;
update public.profiles set total_spent = 0.00;

insert into public.products (name, description, price, image_url) values
  ('Oak Dining Table',        'Solid oak table seating six, with a hand-oiled finish.',        1249.00, '/images/oak-dining-table.svg'),
  ('Linen Three-Seat Sofa',   'Deep-seated sofa in stone-grey linen with feather cushions.',   1899.00, '/images/linen-three-seat-sofa.svg'),
  ('Walnut Dining Chair',     'Curved walnut frame with a woven cord seat.',                    329.00, '/images/walnut-dining-chair.svg'),
  ('Upholstered Bed Frame',   'Queen frame with a padded headboard in oatmeal weave.',         1450.00, '/images/upholstered-bed-frame.svg'),
  ('Open Oak Bookshelf',      'Five-shelf open unit, wall-anchored, in pale oak.',              675.00, '/images/open-oak-bookshelf.svg'),
  ('Brass Floor Lamp',        'Adjustable arc lamp with an antique brass shade.',               245.00, '/images/brass-floor-lamp.svg'),
  ('Compact Writing Desk',    'Two-drawer desk sized for small rooms.',                         540.00, '/images/compact-writing-desk.svg'),
  ('Ash Counter Stool',       'Backless stool in solid ash, kitchen-counter height.',           185.00, '/images/ash-counter-stool.svg'),
  ('Two-Door Wardrobe',       'Full-height wardrobe with hanging rail and shelf.',             1620.00, '/images/two-door-wardrobe.svg'),
  ('Handwoven Wool Rug',      'Undyed wool rug, 200 x 300 cm, woven in concentric bands.',      780.00, '/images/handwoven-wool-rug.svg');
```

- [ ] **Step 7: Write `supabase/apply.mjs`**

```js
import { readFileSync } from 'node:fs'
import pg from 'pg'

const connectionString = process.env.SUPABASE_DB_URL
if (!connectionString) {
  console.error('SUPABASE_DB_URL is not set. Add it to .env.local (see .env.example).')
  process.exit(1)
}

const files = process.argv.slice(2)
if (files.length === 0) files.push('supabase/schema.sql', 'supabase/seed.sql')

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  for (const file of files) {
    await client.query(readFileSync(file, 'utf8'))
    console.log(`applied ${file}`)
  }
} finally {
  await client.end()
}
```

- [ ] **Step 8: Add npm scripts to `package.json`**

Add to the `"scripts"` object:
```json
"db:apply": "node --env-file=.env.local supabase/apply.mjs",
"verify:db": "node --env-file=.env.local supabase/verify.mjs",
"images": "node scripts/make-images.mjs"
```

- [ ] **Step 9: Apply the schema and seed**

```bash
npm run db:apply
```
Expected: `applied supabase/schema.sql` then `applied supabase/seed.sql`

- [ ] **Step 10: Verify the database contents**

```bash
node --env-file=.env.local -e "
import('pg').then(async ({default: pg}) => {
  const c = new pg.Client({connectionString: process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false}});
  await c.connect();
  const t = await c.query(\"select table_name from information_schema.tables where table_schema='public' order by 1\");
  console.log('tables:', t.rows.map(r=>r.table_name).join(', '));
  const p = await c.query('select count(*)::int n, min(price) lo, max(price) hi from products');
  console.log('products:', JSON.stringify(p.rows[0]));
  const r = await c.query(\"select relname, relrowsecurity from pg_class where relname in ('profiles','products','orders','order_items')\");
  console.log('rls:', r.rows.map(x=>x.relname+'='+x.relrowsecurity).join(' '));
  await c.end();
})"
```
Expected: tables include `order_items, orders, products, profiles`; `products` count is `10`; every table shows `=true` for RLS.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add database schema, seed catalogue, and product images"
```

---

### Task 3: `place_order()` and its automated budget tests

The correctness-critical task. Everything the budget feature promises is enforced here.

**Files:**
- Modify: `supabase/schema.sql` (append the function)
- Create: `supabase/verify.mjs`

**Interfaces:**
- Consumes: tables from Task 2; `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`
- Produces: RPC `place_order(items jsonb) returns jsonb`, where `items` is `[{ "product_id": <int>, "quantity": <int> }, ...]`. Returns `{ ok: true, order_id, total, remaining }` or `{ ok: false, error, over_by?, remaining? }` with `error` one of `EMPTY_CART`, `INVALID_QUANTITY`, `UNKNOWN_PRODUCT`, `OVER_BUDGET`, `NOT_LOGGED_IN`, `NO_PROFILE`.

- [ ] **Step 1: Install the Supabase JS client (needed by the test script and by Task 4)**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Append `place_order()` to `supabase/schema.sql`**

```sql
-- The single writer of orders. security definer, so it can insert into
-- orders/order_items despite users having no insert policy there. Every
-- rejection path returns before any write, so a refused order writes nothing.
create or replace function public.place_order(items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_bad int;
  v_total numeric(10,2);
  v_budget numeric(10,2);
  v_spent numeric(10,2);
  v_remaining numeric(10,2);
  v_order_id bigint;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_LOGGED_IN');
  end if;

  if items is null
     or jsonb_typeof(items) <> 'array'
     or jsonb_array_length(items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'EMPTY_CART');
  end if;

  -- Reject non-positive or non-integer quantities.
  select count(*) into v_bad
  from jsonb_array_elements(items) e
  where e->>'quantity' is null
     or e->>'quantity' !~ '^[0-9]+$'
     or (e->>'quantity')::int < 1;
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_QUANTITY');
  end if;

  -- Reject product ids that do not exist.
  select count(*) into v_bad
  from jsonb_array_elements(items) e
  left join products p on p.id = (e->>'product_id')::bigint
  where p.id is null;
  if v_bad > 0 then
    return jsonb_build_object('ok', false, 'error', 'UNKNOWN_PRODUCT');
  end if;

  -- Total from DATABASE prices. Anything the client sent about price is ignored.
  -- Duplicate product ids in the cart are merged.
  select sum(p.price * i.quantity) into v_total
  from (
    select (e->>'product_id')::bigint as product_id,
           sum((e->>'quantity')::int) as quantity
    from jsonb_array_elements(items) e
    group by 1
  ) i
  join products p on p.id = i.product_id;

  -- Lock the profile row so two simultaneous orders cannot both pass the
  -- same remaining-budget check.
  select budget, total_spent into v_budget, v_spent
  from profiles where id = v_user_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NO_PROFILE');
  end if;

  v_remaining := v_budget - v_spent;
  if v_total > v_remaining then
    return jsonb_build_object(
      'ok', false, 'error', 'OVER_BUDGET',
      'over_by', v_total - v_remaining, 'remaining', v_remaining);
  end if;

  insert into orders (user_id, total_amount)
  values (v_user_id, v_total)
  returning id into v_order_id;

  insert into order_items (order_id, product_id, quantity, price_at_purchase)
  select v_order_id, p.id, i.quantity, p.price
  from (
    select (e->>'product_id')::bigint as product_id,
           sum((e->>'quantity')::int) as quantity
    from jsonb_array_elements(items) e
    group by 1
  ) i
  join products p on p.id = i.product_id;

  update profiles set total_spent = total_spent + v_total where id = v_user_id;

  return jsonb_build_object(
    'ok', true, 'order_id', v_order_id,
    'total', v_total, 'remaining', v_remaining - v_total);
end;
$$;

-- Only logged-in users may call it.
revoke all on function public.place_order(jsonb) from public, anon;
grant execute on function public.place_order(jsonb) to authenticated;
```

- [ ] **Step 3: Write `supabase/verify.mjs`**

Signs up a throwaway user through the ordinary public path — so the test exercises real auth, real RLS, and the real RPC, not a simulation.

```js
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const DB = process.env.SUPABASE_DB_URL
if (!URL || !ANON || !DB) {
  console.error('Missing env. Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_DB_URL in .env.local')
  process.exit(1)
}

let failures = 0
function check(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!pass) failures++
}

const email = `verify-${Date.now()}@example.com`
const supabase = createClient(URL, ANON)
const db = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await db.connect()

async function profile(userId) {
  const { rows } = await db.query(
    'select budget::float8 budget, total_spent::float8 total_spent from profiles where id = $1',
    [userId])
  return rows[0]
}
async function counts(userId) {
  const { rows } = await db.query(
    `select (select count(*)::int from orders where user_id = $1) orders,
            (select count(*)::int from order_items oi
               join orders o on o.id = oi.order_id where o.user_id = $1) items`,
    [userId])
  return rows[0]
}

try {
  const { data: signUp, error: signUpError } = await supabase.auth.signUp({
    email, password: 'verify-password-123',
  })
  if (signUpError) throw new Error(`signup failed: ${signUpError.message}`)
  const userId = signUp.user.id
  if (!signUp.session) {
    throw new Error('signup produced no session — is "Confirm email" still ON in Supabase?')
  }

  // The trigger must have created a profile with the default budget.
  const start = await profile(userId)
  check('new user gets a profile with a $5000 budget and $0 spent',
    start && start.budget === 5000 && start.total_spent === 0, JSON.stringify(start))

  const { rows: products } = await db.query(
    'select id, price::float8 price from products order by price')
  const cheapest = products[0]
  const dearest = products[products.length - 1]

  // 1. In-budget order succeeds and debits exactly the order total.
  let { data: r1, error: e1 } = await supabase.rpc('place_order', {
    items: [{ product_id: cheapest.id, quantity: 2 }],
  })
  check('in-budget order is accepted', !e1 && r1?.ok === true, e1?.message ?? JSON.stringify(r1))
  const expectedTotal = cheapest.price * 2
  check('order total uses database prices', r1?.ok && Number(r1.total) === expectedTotal,
    `expected ${expectedTotal}, got ${r1?.total}`)
  let after = await profile(userId)
  check('total_spent increases by exactly the order total',
    after && after.total_spent === expectedTotal, JSON.stringify(after))
  check('reported remaining matches budget minus spent',
    r1?.ok && Number(r1.remaining) === 5000 - expectedTotal, `got ${r1?.remaining}`)

  // 2. A price sent by the client is ignored.
  const { data: r2 } = await supabase.rpc('place_order', {
    items: [{ product_id: cheapest.id, quantity: 1, price: 0.01 }],
  })
  check('client-supplied price is ignored', r2?.ok === true && Number(r2.total) === cheapest.price,
    `expected ${cheapest.price}, got ${r2?.total}`)
  const spentAfterTwo = expectedTotal + cheapest.price

  // 3. Over-budget order is refused and writes nothing.
  const before = await counts(userId)
  const { data: r3 } = await supabase.rpc('place_order', {
    items: [{ product_id: dearest.id, quantity: 100 }],
  })
  check('over-budget order is refused', r3?.ok === false && r3?.error === 'OVER_BUDGET',
    JSON.stringify(r3))
  const afterReject = await profile(userId)
  check('refused order leaves total_spent unchanged',
    afterReject && afterReject.total_spent === spentAfterTwo, JSON.stringify(afterReject))
  const afterCounts = await counts(userId)
  check('refused order writes no order rows',
    afterCounts.orders === before.orders && afterCounts.items === before.items,
    JSON.stringify(afterCounts))

  // 4. Bad input is refused.
  const { data: r4 } = await supabase.rpc('place_order', { items: [] })
  check('empty cart is refused', r4?.error === 'EMPTY_CART', JSON.stringify(r4))

  const { data: r5 } = await supabase.rpc('place_order', {
    items: [{ product_id: cheapest.id, quantity: 0 }],
  })
  check('zero quantity is refused', r5?.error === 'INVALID_QUANTITY', JSON.stringify(r5))

  const { data: r6 } = await supabase.rpc('place_order', {
    items: [{ product_id: 999999, quantity: 1 }],
  })
  check('unknown product is refused', r6?.error === 'UNKNOWN_PRODUCT', JSON.stringify(r6))

  // 5. RLS keeps other users' rows invisible.
  const { data: otherProfiles } = await supabase.from('profiles').select('id')
  check('user can only see their own profile row',
    Array.isArray(otherProfiles) && otherProfiles.length === 1, JSON.stringify(otherProfiles))

  // 6. A user cannot raise their own budget.
  const { error: updateError } = await supabase
    .from('profiles').update({ budget: 999999 }).eq('id', userId)
  const stillCorrect = await profile(userId)
  check('user cannot raise their own budget',
    stillCorrect.budget === 5000, `error=${updateError?.message} budget=${stillCorrect.budget}`)

  // Clean up the throwaway user (cascades to profile, orders, order_items).
  await db.query('delete from auth.users where id = $1', [userId])
} catch (err) {
  check('test script ran to completion', false, err.message)
} finally {
  await db.query('delete from auth.users where email like $1', ['verify-%@example.com'])
  await db.end()
}

console.log(failures === 0 ? '\nAll budget rules verified.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
```

- [ ] **Step 4: Run the tests before the function exists, to confirm they actually test something**

```bash
npm run verify:db
```
Expected: FAIL lines mentioning that `place_order` could not be found (the function has not been applied yet). If this passes, the tests are not exercising the function and must be fixed before continuing.

- [ ] **Step 5: Apply the updated schema**

```bash
npm run db:apply -- supabase/schema.sql
```
Expected: `applied supabase/schema.sql`

- [ ] **Step 6: Run the tests again**

```bash
npm run verify:db
```
Expected: every line `PASS`, ending with `All budget rules verified.` and exit code 0. Do not proceed past this step until that is true — this is the feature the whole app exists to demonstrate.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add place_order with atomic budget enforcement and verification tests"
```

---

### Task 4: Authentication

**Files:**
- Create: `lib/supabase-server.js`, `lib/supabase-browser.js`, `app/actions/auth.js`, `app/login/page.js`, `app/signup/page.js`, `components/AuthForm.js`, `middleware.js`
- Modify: `app/page.js`

**Interfaces:**
- Consumes: `formatMoney` (unused here), Supabase env vars
- Produces: `createServerSupabase()` from `lib/supabase-server.js` (async, returns a Supabase client); `createBrowserSupabase()` from `lib/supabase-browser.js`; Server Actions `signup(prevState, formData)`, `login(prevState, formData)`, `logout()` from `app/actions/auth.js`. Both form actions return `{ error: string }` on failure and redirect on success.

- [ ] **Step 1: Create `lib/supabase-server.js`**

```js
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // middleware.js refreshes the session, so this is safe to ignore.
          }
        },
      },
    }
  )
}
```

- [ ] **Step 2: Create `lib/supabase-browser.js`**

```js
import { createBrowserClient } from '@supabase/ssr'

export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}
```

- [ ] **Step 3: Create `app/actions/auth.js`**

Error strings must match spec §8 exactly.

```js
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase-server'

export async function login(prevState, formData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  if (!email || !password) {
    return { error: 'Please enter both your email and password.' }
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return { error: "That email and password don't match an account." }
  }

  revalidatePath('/', 'layout')
  redirect('/catalogue')
}

export async function signup(prevState, formData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  if (!email || !password) {
    return { error: 'Please enter both your email and password.' }
  }
  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters.' }
  }

  const supabase = await createServerSupabase()
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) {
    if (/already registered|already exists|User already/i.test(error.message)) {
      return { error: 'An account with that email already exists — try logging in.' }
    }
    if (/at least 6/i.test(error.message)) {
      return { error: 'Password must be at least 6 characters.' }
    }
    console.error('signup failed:', error.message)
    return { error: 'Something went wrong — please try again.' }
  }
  if (!data.session) {
    return { error: 'Account created, but sign-in did not complete. Please log in.' }
  }

  revalidatePath('/', 'layout')
  redirect('/catalogue')
}

export async function logout() {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
```

Note: `redirect()` throws a control-flow signal, so it must sit outside any `try` block that would swallow it. The code above has no `try` around it — keep it that way.

- [ ] **Step 4: Create `components/AuthForm.js`**

One client component serving both login and signup, so the markup exists once.

```js
'use client'

import { useActionState } from 'react'
import Link from 'next/link'

export default function AuthForm({ action, heading, submitLabel, altPrompt, altHref, altLabel }) {
  const [state, formAction, pending] = useActionState(action, { error: null })

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-stone-800">{heading}</h1>

        <form action={formAction} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-stone-600">
              Email
            </label>
            <input
              id="email" name="email" type="email" required autoComplete="email"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 outline-none focus:border-stone-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-stone-600">
              Password
            </label>
            <input
              id="password" name="password" type="password" required minLength={6}
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800 outline-none focus:border-stone-500"
            />
          </div>

          {state?.error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          )}

          <button
            type="submit" disabled={pending}
            className="w-full rounded-lg bg-stone-800 px-4 py-2 font-medium text-white hover:bg-stone-700 disabled:opacity-60"
          >
            {pending ? 'Please wait…' : submitLabel}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-stone-500">
          {altPrompt}{' '}
          <Link href={altHref} className="font-medium text-stone-800 underline">
            {altLabel}
          </Link>
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Create `app/login/page.js` and `app/signup/page.js`**

`app/login/page.js`:
```js
import AuthForm from '@/components/AuthForm'
import { login } from '@/app/actions/auth'

export default function LoginPage() {
  return (
    <AuthForm
      action={login}
      heading="Log in"
      submitLabel="Log in"
      altPrompt="No account yet?"
      altHref="/signup"
      altLabel="Sign up"
    />
  )
}
```

`app/signup/page.js`:
```js
import AuthForm from '@/components/AuthForm'
import { signup } from '@/app/actions/auth'

export default function SignupPage() {
  return (
    <AuthForm
      action={signup}
      heading="Create your account"
      submitLabel="Sign up"
      altPrompt="Already have an account?"
      altHref="/login"
      altLabel="Log in"
    />
  )
}
```

- [ ] **Step 6: Create `middleware.js`**

```js
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

const PROTECTED = ['/catalogue', '/cart', '/orders']

export async function middleware(request) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  // Refreshes an expiring session cookie as a side effect. Do not remove.
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (!user && needsAuth) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/catalogue'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|images|favicon.ico).*)'],
}
```

- [ ] **Step 7: Replace `app/page.js` with a router**

```js
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'

export default async function Home() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  redirect(user ? '/catalogue' : '/login')
}
```

- [ ] **Step 8: Verify signup, protection, and login in a browser**

Start `npm run dev`, then check each of these:

| Action | Expected |
|---|---|
| Visit `/catalogue` logged out | Redirected to `/login` |
| Visit `/` logged out | Redirected to `/login` |
| Sign up with a fresh email + `testpass123` | Redirected to `/catalogue` (currently a 404 — Task 5 builds it) |
| Sign up again with the same email | "An account with that email already exists — try logging in." |
| Sign up with password `abc` | "Password must be at least 6 characters." |
| Log in with a wrong password | "That email and password don't match an account." |
| Visit `/login` while logged in | Redirected to `/catalogue` |

- [ ] **Step 9: Confirm the profile row was created for the signed-up user**

```bash
node --env-file=.env.local -e "
import('pg').then(async ({default: pg}) => {
  const c = new pg.Client({connectionString: process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false}});
  await c.connect();
  const r = await c.query('select email, budget::float8, total_spent::float8 from profiles order by created_at desc limit 3');
  console.log(r.rows);
  await c.end();
})"
```
Expected: the new account listed with `budget: 5000, total_spent: 0`

- [ ] **Step 10: Build, commit, push, verify deploy**

```bash
npm run build
git add -A
git commit -m "feat: add email/password auth with route protection"
git push origin main
```

Then ask the owner to add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel under **Project → Settings → Environment Variables** (all environments), and redeploy. Confirm the live URL now redirects to a working `/login`:
```bash
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' <live-url>
```
Expected: a redirect to `/login`, and `/login` returns 200 with the form.

---

### Task 5: Catalogue, cart state, and shared chrome

**Files:**
- Create: `components/CartProvider.js`, `components/ProductCard.js`, `components/BudgetBar.js`, `components/Navbar.js`, `app/catalogue/page.js`, `lib/user.js`
- Modify: `app/layout.js`

**Interfaces:**
- Consumes: `createServerSupabase`, `formatMoney`, `logout`
- Produces: `getSessionUserAndProfile()` from `lib/user.js` → `{ user, profile }` or `{ user: null, profile: null }`, where `profile` is `{ id, email, budget, total_spent }`; `useCart()` from `components/CartProvider.js` → `{ items, addItem, setQuantity, removeItem, clear, count }` where `items` is `[{ productId, quantity }]`

- [ ] **Step 1: Create `lib/user.js`**

```js
import { createServerSupabase } from '@/lib/supabase-server'

export async function getSessionUserAndProfile() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, profile: null }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, budget, total_spent')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('could not load profile:', error.message)
    return { user, profile: null }
  }
  return { user, profile }
}
```

- [ ] **Step 2: Create `components/CartProvider.js`**

```js
'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'furniture-cart-v1'
const CartContext = createContext(null)

function readStored() {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((i) => ({ productId: Number(i.productId), quantity: Number(i.quantity) }))
      .filter((i) => Number.isInteger(i.productId) && Number.isInteger(i.quantity) && i.quantity > 0)
  } catch {
    return []
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState([])
  const [loaded, setLoaded] = useState(false)

  // Read localStorage after mount so server and client render the same HTML.
  useEffect(() => {
    setItems(readStored())
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (loaded) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items, loaded])

  function addItem(productId, quantity = 1) {
    setItems((current) => {
      const existing = current.find((i) => i.productId === productId)
      if (existing) {
        return current.map((i) =>
          i.productId === productId ? { ...i, quantity: i.quantity + quantity } : i)
      }
      return [...current, { productId, quantity }]
    })
  }

  function setQuantity(productId, quantity) {
    if (quantity < 1) return removeItem(productId)
    setItems((current) =>
      current.map((i) => (i.productId === productId ? { ...i, quantity } : i)))
  }

  function removeItem(productId) {
    setItems((current) => current.filter((i) => i.productId !== productId))
  }

  function clear() {
    setItems([])
  }

  const count = items.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <CartContext.Provider value={{ items, addItem, setQuantity, removeItem, clear, count, loaded }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used inside CartProvider')
  return context
}
```

- [ ] **Step 3: Create `components/BudgetBar.js`**

```js
import { formatMoney } from '@/lib/money'

export default function BudgetBar({ budget, totalSpent }) {
  const spent = Number(totalSpent)
  const total = Number(budget)
  const remaining = total - spent
  const usedPercent = total > 0 ? Math.min(100, (spent / total) * 100) : 0
  const low = remaining <= total * 0.1

  return (
    <div className="w-full max-w-xs">
      <div className="flex items-baseline justify-between text-xs text-stone-500">
        <span>Budget remaining</span>
        <span className={`font-semibold ${low ? 'text-amber-700' : 'text-stone-800'}`}>
          {formatMoney(remaining)}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-stone-200">
        <div
          className={`h-full rounded-full ${low ? 'bg-amber-500' : 'bg-stone-700'}`}
          style={{ width: `${usedPercent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-stone-400">
        {formatMoney(spent)} spent of {formatMoney(total)}
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Create `components/Navbar.js`**

```js
import Link from 'next/link'
import { getSessionUserAndProfile } from '@/lib/user'
import { logout } from '@/app/actions/auth'
import BudgetBar from '@/components/BudgetBar'
import CartCount from '@/components/CartCount'

export default async function Navbar() {
  const { user, profile } = await getSessionUserAndProfile()
  if (!user) return null

  return (
    <header className="border-b border-stone-200 bg-white">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-6 px-6 py-4">
        <Link href="/catalogue" className="text-lg font-semibold text-stone-800">
          Furniture Buyer
        </Link>

        <div className="flex items-center gap-5 text-sm text-stone-600">
          <Link href="/catalogue" className="hover:text-stone-900">Catalogue</Link>
          <Link href="/cart" className="hover:text-stone-900">
            Cart <CartCount />
          </Link>
          <Link href="/orders" className="hover:text-stone-900">Orders</Link>
        </div>

        <div className="ml-auto flex items-center gap-6">
          {profile && <BudgetBar budget={profile.budget} totalSpent={profile.total_spent} />}
          <form action={logout}>
            <button type="submit" className="text-sm text-stone-500 underline hover:text-stone-800">
              Log out
            </button>
          </form>
        </div>
      </nav>
    </header>
  )
}
```

- [ ] **Step 5: Create `components/CartCount.js`**

A tiny client component so the server-rendered Navbar can still show a live cart count.

```js
'use client'

import { useCart } from '@/components/CartProvider'

export default function CartCount() {
  const { count, loaded } = useCart()
  if (!loaded || count === 0) return null
  return (
    <span className="ml-1 rounded-full bg-stone-800 px-2 py-0.5 text-xs text-white">
      {count}
    </span>
  )
}
```

Add `components/CartCount.js` to the File Structure table's understanding: it is a presentational client badge with no props.

- [ ] **Step 6: Modify `app/layout.js`**

Keep whatever font setup the scaffold generated; wrap the body contents as below.

```js
import './globals.css'
import { CartProvider } from '@/components/CartProvider'
import Navbar from '@/components/Navbar'

export const metadata = {
  title: 'Furniture Buyer',
  description: 'Browse the catalogue and order within your budget.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-100 text-stone-800 antialiased">
        <CartProvider>
          <Navbar />
          {children}
        </CartProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 7: Create `components/ProductCard.js`**

```js
'use client'

import { useState } from 'react'
import { formatMoney } from '@/lib/money'
import { useCart } from '@/components/CartProvider'

export default function ProductCard({ product }) {
  const { addItem } = useCart()
  const [added, setAdded] = useState(false)

  function handleAdd() {
    addItem(product.id, 1)
    setAdded(true)
    setTimeout(() => setAdded(false), 1200)
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={product.image_url}
        alt={product.name}
        width={600}
        height={400}
        className="aspect-3/2 w-full object-cover"
      />
      <div className="flex flex-1 flex-col p-5">
        <h2 className="font-semibold text-stone-800">{product.name}</h2>
        <p className="mt-1 flex-1 text-sm text-stone-500">{product.description}</p>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-lg font-semibold text-stone-900">
            {formatMoney(product.price)}
          </span>
          <button
            type="button"
            onClick={handleAdd}
            className="rounded-lg bg-stone-800 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700"
          >
            {added ? 'Added ✓' : 'Add to cart'}
          </button>
        </div>
      </div>
    </article>
  )
}
```

- [ ] **Step 8: Create `app/catalogue/page.js`**

```js
import { createServerSupabase } from '@/lib/supabase-server'
import ProductCard from '@/components/ProductCard'

export default async function CataloguePage() {
  const supabase = await createServerSupabase()
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, description, price, image_url')
    .order('id')

  if (error) {
    console.error('could not load products:', error.message)
    return (
      <main className="mx-auto max-w-6xl p-6">
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-red-700">
          Something went wrong — please try again.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold text-stone-800">Catalogue</h1>
      <p className="mt-1 text-stone-500">Add pieces to your cart, then check out within your budget.</p>

      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 9: Verify in a browser**

Run `npm run dev`, log in, then confirm:

| Check | Expected |
|---|---|
| `/catalogue` | 10 product cards, each with an image, name, description, price |
| Nav bar | Budget bar showing `$5,000.00` remaining and `$0.00 spent of $5,000.00` |
| Click "Add to cart" twice on one product, once on another | Cart badge in the nav reads `3` |
| Refresh the page | Badge still reads `3` |
| Check the browser console | No errors, and specifically no hydration warnings |

- [ ] **Step 10: Build and commit**

```bash
npm run build
git add -A
git commit -m "feat: add catalogue, cart state, and shared navigation"
git push origin main
```

---

### Task 6: Cart page and checkout

**Files:**
- Create: `app/cart/page.js`, `components/CartSummary.js`, `app/actions/orders.js`
- Modify: none

**Interfaces:**
- Consumes: `useCart`, `formatMoney`, `getSessionUserAndProfile`, `place_order` RPC
- Produces: `checkout(items)` Server Action from `app/actions/orders.js`, taking `[{ productId, quantity }]` and returning `{ ok: true, orderId }` or `{ ok: false, message }` where `message` is display-ready text from spec §8

- [ ] **Step 1: Create `app/actions/orders.js`**

```js
'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase-server'
import { formatMoney } from '@/lib/money'

export async function checkout(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, message: 'Your cart is empty.' }
  }

  // Only ids and quantities are sent on. Prices come from the database.
  const payload = items.map((i) => ({
    product_id: Number(i.productId),
    quantity: Number(i.quantity),
  }))

  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('place_order', { items: payload })

  if (error) {
    console.error('place_order failed:', error.message)
    return { ok: false, message: 'Something went wrong — please try again.' }
  }

  if (!data?.ok) {
    switch (data?.error) {
      case 'OVER_BUDGET':
        return {
          ok: false,
          message: `This order is ${formatMoney(data.over_by)} over your remaining budget of ${formatMoney(data.remaining)}.`,
        }
      case 'EMPTY_CART':
        return { ok: false, message: 'Your cart is empty.' }
      case 'UNKNOWN_PRODUCT':
        return { ok: false, message: 'One of the items in your cart is no longer available.' }
      case 'INVALID_QUANTITY':
        return { ok: false, message: 'Please choose a quantity of at least 1 for every item.' }
      case 'NOT_LOGGED_IN':
        return { ok: false, message: 'Please log in again to place your order.' }
      default:
        console.error('place_order rejected:', JSON.stringify(data))
        return { ok: false, message: 'Something went wrong — please try again.' }
    }
  }

  revalidatePath('/', 'layout')
  revalidatePath('/orders')
  return { ok: true, orderId: data.order_id }
}
```

- [ ] **Step 2: Create `components/CartSummary.js`**

Prices come from the server-rendered `products` prop; the cart itself only ever holds ids and quantities.

```js
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatMoney } from '@/lib/money'
import { useCart } from '@/components/CartProvider'
import { checkout } from '@/app/actions/orders'

export default function CartSummary({ products, remaining }) {
  const { items, setQuantity, removeItem, clear, loaded } = useCart()
  const [message, setMessage] = useState(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const byId = new Map(products.map((p) => [p.id, p]))
  const lines = items
    .map((i) => ({ ...i, product: byId.get(i.productId) }))
    .filter((line) => line.product)

  const total = lines.reduce((sum, l) => sum + Number(l.product.price) * l.quantity, 0)
  const overBy = total - Number(remaining)

  function handleCheckout() {
    setMessage(null)
    startTransition(async () => {
      const result = await checkout(items)
      if (result.ok) {
        clear()
        router.push('/orders')
      } else {
        setMessage(result.message)
      }
    })
  }

  if (!loaded) {
    return <p className="mt-6 text-stone-500">Loading your cart…</p>
  }

  if (lines.length === 0) {
    return (
      <div className="mt-6 rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-stone-600">Your cart is empty.</p>
        <Link href="/catalogue" className="mt-3 inline-block font-medium text-stone-800 underline">
          Browse the catalogue
        </Link>
      </div>
    )
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-3">
      <ul className="space-y-3 lg:col-span-2">
        {lines.map(({ product, quantity }) => (
          <li key={product.id} className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.image_url} alt={product.name} width={96} height={64}
                 className="h-16 w-24 rounded-lg object-cover" />
            <div className="flex-1">
              <p className="font-medium text-stone-800">{product.name}</p>
              <p className="text-sm text-stone-500">{formatMoney(product.price)} each</p>
            </div>
            <label className="sr-only" htmlFor={`qty-${product.id}`}>
              Quantity of {product.name}
            </label>
            <input
              id={`qty-${product.id}`} type="number" min={1} max={99} value={quantity}
              onChange={(e) => setQuantity(product.id, Number(e.target.value))}
              className="w-16 rounded-lg border border-stone-300 px-2 py-1 text-center"
            />
            <span className="w-24 text-right font-semibold text-stone-900">
              {formatMoney(Number(product.price) * quantity)}
            </span>
            <button type="button" onClick={() => removeItem(product.id)}
                    className="text-sm text-stone-400 underline hover:text-red-700">
              Remove
            </button>
          </li>
        ))}
      </ul>

      <aside className="h-fit rounded-2xl bg-white p-6 shadow-sm">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-500">Order total</dt>
            <dd className="font-semibold text-stone-900">{formatMoney(total)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">Budget remaining</dt>
            <dd className="text-stone-700">{formatMoney(remaining)}</dd>
          </div>
        </dl>

        {overBy > 0 && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {formatMoney(overBy)} over budget — remove something to continue.
          </p>
        )}

        {message && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {message}
          </p>
        )}

        <button
          type="button" onClick={handleCheckout} disabled={pending}
          className="mt-5 w-full rounded-lg bg-stone-800 px-4 py-2 font-medium text-white hover:bg-stone-700 disabled:opacity-60"
        >
          {pending ? 'Placing order…' : 'Place order'}
        </button>
        <p className="mt-2 text-center text-xs text-stone-400">
          No payment is taken — this is a demo.
        </p>
      </aside>
    </div>
  )
}
```

The button stays enabled when over budget on purpose: the server is the authority, and pressing it produces the exact §8 message. The amber warning is a courtesy, not the check.

- [ ] **Step 3: Create `app/cart/page.js`**

```js
import { createServerSupabase } from '@/lib/supabase-server'
import { getSessionUserAndProfile } from '@/lib/user'
import CartSummary from '@/components/CartSummary'

export default async function CartPage() {
  const supabase = await createServerSupabase()
  const [{ data: products }, { profile }] = await Promise.all([
    supabase.from('products').select('id, name, price, image_url').order('id'),
    getSessionUserAndProfile(),
  ])

  const remaining = profile ? Number(profile.budget) - Number(profile.total_spent) : 0

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold text-stone-800">Your cart</h1>
      <CartSummary products={products ?? []} remaining={remaining} />
    </main>
  )
}
```

- [ ] **Step 4: Verify the happy path in a browser**

Log in as a fresh user, add the Ash Counter Stool ($185.00) ×2, go to `/cart`.

| Check | Expected |
|---|---|
| Line total | `$370.00` |
| Order total | `$370.00`, budget remaining `$5,000.00` |
| Press "Place order" | Redirected to `/orders` (404 until Task 7 — that is expected here) |
| Nav budget bar after redirect | `$4,630.00` remaining, `$370.00 spent of $5,000.00` |
| Cart badge | Gone (cart cleared) |

- [ ] **Step 5: Verify the over-budget path in a browser**

Set the Linen Three-Seat Sofa ($1,899.00) quantity to `3` (= $5,697.00) as that same user, whose remaining budget is now $4,630.00.

| Check | Expected |
|---|---|
| Amber warning | `$1,067.00 over budget — remove something to continue.` |
| Press "Place order" anyway | Red message: `This order is $1,067.00 over your remaining budget of $4,630.00.` |
| Nav budget bar | Still `$4,630.00` remaining — unchanged |
| Cart | Still populated, nothing cleared |

- [ ] **Step 6: Confirm the database agrees**

```bash
node --env-file=.env.local -e "
import('pg').then(async ({default: pg}) => {
  const c = new pg.Client({connectionString: process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false}});
  await c.connect();
  const r = await c.query('select o.id, o.total_amount::float8 total, count(oi.id)::int lines from orders o join order_items oi on oi.order_id=o.id group by o.id order by o.id desc limit 5');
  console.log(r.rows);
  await c.end();
})"
```
Expected: exactly one order at `370`, with `1` line — the refused order created nothing.

- [ ] **Step 7: Build and commit**

```bash
npm run build
git add -A
git commit -m "feat: add cart page and budget-checked checkout"
git push origin main
```

---

### Task 7: Order history

**Files:**
- Create: `app/orders/page.js`
- Modify: none

**Interfaces:**
- Consumes: `createServerSupabase`, `getSessionUserAndProfile`, `formatMoney`, `BudgetBar`
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Create `app/orders/page.js`**

```js
import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase-server'
import { getSessionUserAndProfile } from '@/lib/user'
import { formatMoney } from '@/lib/money'

export const dynamic = 'force-dynamic'

export default async function OrdersPage() {
  const supabase = await createServerSupabase()
  const [{ profile }, { data: orders, error }] = await Promise.all([
    getSessionUserAndProfile(),
    supabase
      .from('orders')
      .select('id, total_amount, created_at, order_items(quantity, price_at_purchase, products(name))')
      .order('created_at', { ascending: false }),
  ])

  if (error) {
    console.error('could not load orders:', error.message)
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-red-700">
          Something went wrong — please try again.
        </p>
      </main>
    )
  }

  const spent = profile ? Number(profile.total_spent) : 0
  const budget = profile ? Number(profile.budget) : 0

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold text-stone-800">Your orders</h1>

      <div className="mt-4 flex flex-wrap gap-8 rounded-2xl bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-400">Budget</p>
          <p className="text-xl font-semibold text-stone-900">{formatMoney(budget)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-400">Spent</p>
          <p className="text-xl font-semibold text-stone-900">{formatMoney(spent)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-400">Remaining</p>
          <p className="text-xl font-semibold text-emerald-700">{formatMoney(budget - spent)}</p>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="text-stone-600">You haven&apos;t placed any orders yet.</p>
          <Link href="/catalogue" className="mt-3 inline-block font-medium text-stone-800 underline">
            Browse the catalogue
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {orders.map((order) => (
            <li key={order.id} className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-semibold text-stone-800">Order #{order.id}</p>
                  <p className="text-sm text-stone-500">
                    {new Date(order.created_at).toLocaleString('en-US', {
                      dateStyle: 'medium', timeStyle: 'short',
                    })}
                  </p>
                </div>
                <p className="text-lg font-semibold text-stone-900">
                  {formatMoney(order.total_amount)}
                </p>
              </div>

              <ul className="mt-4 divide-y divide-stone-100 border-t border-stone-100">
                {order.order_items.map((item, index) => (
                  <li key={index} className="flex justify-between py-2 text-sm">
                    <span className="text-stone-700">
                      {item.products?.name ?? 'Item'} × {item.quantity}
                    </span>
                    <span className="text-stone-500">
                      {formatMoney(Number(item.price_at_purchase) * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Verify in a browser**

As the user from Task 6 (who has one $370.00 order):

| Check | Expected |
|---|---|
| `/orders` | Budget `$5,000.00`, Spent `$370.00`, Remaining `$4,630.00` |
| Order card | `Order #<n>`, a readable date/time, total `$370.00` |
| Line item | `Ash Counter Stool × 2` and `$370.00` |
| Log out, log back in | Same order and same spend still shown |
| Sign up as a brand-new user, visit `/orders` | "You haven't placed any orders yet." and `$5,000.00` remaining — **no sign of the other user's order** |

The last row is the RLS check in the real app. If a new user sees someone else's order, stop and fix the policies before continuing.

- [ ] **Step 3: Build and commit**

```bash
npm run build
git add -A
git commit -m "feat: add order history page"
git push origin main
```

---

### Task 8: Final polish and acceptance run on the live URL

**Files:**
- Modify: `README.md`, `CLAUDE.md`
- Create: `app/not-found.js`

**Interfaces:**
- Consumes: everything above
- Produces: a demo-ready deployed app

- [ ] **Step 1: Create `app/not-found.js`**

```js
import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-stone-800">Page not found</h1>
        <Link href="/catalogue" className="mt-3 inline-block font-medium text-stone-700 underline">
          Back to the catalogue
        </Link>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Re-run the automated budget tests against the current database**

```bash
npm run verify:db
```
Expected: all `PASS`, `All budget rules verified.` Nothing in Tasks 4–7 should have changed this; if it has, the regression matters more than the polish.

- [ ] **Step 3: Rewrite `README.md`**

Must contain: what the app is; the live URL; the tech stack; local setup (`npm install`, copy `.env.example` to `.env.local`, `npm run db:apply`, `npm run dev`); the npm scripts and what each does; a "Known demo tradeoffs" section stating that **email confirmation is disabled in Supabase and must be re-enabled for real use**, that orders take no payment, and that product images are generated placeholders (regenerate with `npm run images`).

- [ ] **Step 4: Update `CLAUDE.md` to match what was built**

Add `components/CartCount.js`, `components/CartSummary.js`, `lib/user.js`, `lib/money.js`, `scripts/make-images.mjs`, and `app/not-found.js` to the folder-structure section, and note `npm run verify:db` as the command that guards the budget rules.

- [ ] **Step 5: Push and wait for the deploy**

```bash
npm run build
git add -A
git commit -m "docs: document setup and demo tradeoffs; add not-found page"
git push origin main
```

Confirm the new deploy is live:
```bash
curl -sS -o /dev/null -w '%{http_code}\n' <live-url>/login
```
Expected: `200`

- [ ] **Step 6: Run every spec §10 acceptance criterion against the live URL**

Use a brand-new email, in a fresh browser profile or private window. Record the actual result of each — do not mark this complete on assumption.

| # | Criterion | How to check |
|---|---|---|
| 1 | New user can sign up and lands on the catalogue | Sign up at `<live-url>/signup` |
| 2 | Profile exists with $5,000 budget, $0 spent | Nav budget bar reads `$5,000.00` remaining |
| 3 | Catalogue shows seeded products with images and prices | 10 cards render, no broken images |
| 4 | Cart survives a page refresh | Add 2 items, refresh, badge unchanged |
| 5 | In-budget order succeeds, appears in history, debits exactly the total | Order the $185.00 stool ×1 → history shows `$185.00`, remaining `$4,815.00` |
| 6 | Over-budget order is refused, nothing recorded | Sofa ×3 → §8 message, remaining still `$4,815.00`, no new order in history |
| 7 | `/catalogue` while logged out redirects to `/login` | Log out, visit `<live-url>/catalogue` |
| 8 | Log out and back in preserves spend and history | Log in again → `$4,815.00` remaining, the $185.00 order still listed |

- [ ] **Step 7: Report results honestly and commit any fixes**

State which criteria passed with their observed values. If any failed, fix it and re-run that criterion rather than reporting it as done.

---

## Self-Review

**Spec coverage:**

| Spec section | Covered by |
|---|---|
| §2 decisions — live URL | Task 1 (deploy on Day 1), Task 8 Step 6 |
| §2 — fixed budget spent down, $5,000 default | Task 2 (column default), Task 3 (`place_order`) |
| §2 — seeded catalogue, no admin | Task 2 `seed.sql`; no admin routes anywhere |
| §2 — email + password | Task 4 |
| §4 tech stack | Task 1 (Next/Tailwind/Vercel), Task 3 Step 1 (Supabase clients), Task 2 Step 2 (`pg`) |
| §4.1 anon key + RLS as boundary, no service role key | Task 2 Step 5 policies; `.env.example` comments; verify.mjs RLS checks |
| §5 four tables, computed remaining, `price_at_purchase` | Task 2 Step 5 |
| §5.1 signup trigger | Task 2 Step 5; verified Task 3 Step 6, Task 4 Step 9 |
| §5.2 RLS policies, no profiles update | Task 2 Step 5; tested in verify.mjs ("cannot raise their own budget") |
| §6.1 signup/login/redirect, confirmation disabled, middleware | Task 2 Step 1, Task 4 |
| §6.2 localStorage cart, ids+quantities only, budget bar everywhere | Task 5 |
| §6.3 seven-step order flow, atomic, security definer | Task 3 Step 2; each rule asserted in verify.mjs |
| §6.4 order history | Task 7 |
| §6.5 seeding, plain `<img>` | Task 2; `<img>` in ProductCard and CartSummary |
| §7 folder structure | File Structure table (plus three files the spec did not name: `lib/money.js`, `lib/user.js`, `components/CartCount.js`, `components/CartSummary.js`) |
| §8 error messages | Task 4 Step 3, Task 6 Step 1 — strings copied verbatim |
| §9 testing approach | Task 3 (automated budget tests), browser checks in Tasks 4–8 |
| §10 acceptance criteria | Task 8 Step 6, one row per criterion |

No gaps found.

**Placeholder scan:** No TBD/TODO. Every code step contains complete runnable code. Every verification step names an exact command or click-path plus its expected output. The one deliberately prose-only step is Task 8 Step 3 (README contents), which enumerates exactly what must appear.

**Type consistency:** `createServerSupabase()` (async) and `createBrowserSupabase()` are used under those names in Tasks 4–7. `useCart()` exposes `items/addItem/setQuantity/removeItem/clear/count/loaded` — `loaded` is consumed by `CartCount` and `CartSummary` and is present in the provider's value. `getSessionUserAndProfile()` returns `{ user, profile }` with `profile.budget`/`profile.total_spent`, matching Navbar, cart page, and orders page. `place_order` takes `items` with snake_case `product_id`/`quantity` (mapped from camelCase in `checkout`) and returns `ok`/`order_id`/`total`/`remaining`/`error`/`over_by`, matching the switch in `app/actions/orders.js`. `formatMoney` is the sole money formatter throughout.
