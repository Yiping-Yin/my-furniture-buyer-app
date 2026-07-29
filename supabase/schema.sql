-- Furniture Buyer App schema. Safe to re-run.
-- Apply with: npm run db:apply

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
-- database so a user can never exist without a profile, even if the browser
-- closes halfway through signing up.
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

-- Row Level Security is the real security boundary. The anon key the app ships
-- with is public by design, so these policies are what actually keep users out
-- of each other's data.
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "own profile is readable" on public.profiles;
create policy "own profile is readable" on public.profiles
  for select to authenticated using (auth.uid() = id);
-- Deliberately NO update policy on profiles: a user who could update their own
-- row could raise their own budget and defeat the whole feature.

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

-- No insert/update/delete policies anywhere. All writes go through
-- place_order(), which is security definer and therefore bypasses these.


-- ---------------------------------------------------------------------------
-- Safety net: automatically enable RLS on any NEW table in public.
--
-- Why this matters here: the anon key this app ships with is public, so a table
-- in the public schema WITHOUT RLS is readable and writable by anyone on the
-- internet who views the page source. Forgetting `enable row level security`
-- once is a full data breach. This event trigger removes that failure mode by
-- making protection the default rather than something to remember.
--
-- Fail-closed by design: RLS with no policies denies ALL access to ordinary
-- users. So a new table will appear empty (and reject writes) until you add
-- policies for it. That is the intended behaviour, not a bug — but it is the
-- thing that will confuse you later, so: if a new table seems inexplicably
-- empty, it needs a policy.
--
-- Only affects tables created AFTER this runs; existing tables are untouched
-- (the four above enable RLS explicitly, so they are covered either way).
-- ---------------------------------------------------------------------------
create or replace function public.enable_rls_on_new_tables()
returns event_trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ddl record;
begin
  for ddl in select * from pg_event_trigger_ddl_commands() loop
    -- Restrict to ordinary and partitioned tables in public, skipping
    -- temporary tables and anything that already has RLS on.
    if exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.oid = ddl.objid
        and n.nspname = 'public'
        and c.relkind in ('r', 'p')     -- table, partitioned table
        and c.relpersistence <> 't'     -- not a temp table
        and not c.relrowsecurity
    ) then
      execute format('alter table %s enable row level security', ddl.object_identity);
      raise notice 'automatically enabled RLS on %', ddl.object_identity;
    end if;
  end loop;
end;
$$;

drop event trigger if exists enable_rls_on_new_tables_trigger;
create event trigger enable_rls_on_new_tables_trigger
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS')
  execute function public.enable_rls_on_new_tables();
