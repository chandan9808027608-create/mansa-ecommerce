-- Mansa Technology store: Supabase schema.
-- Run once in Supabase: SQL Editor → New query → paste this file → Run.
-- Safe to re-run: it only creates what is missing and replaces functions and policies.

-- ---------------------------------------------------------------------------
-- Admins: only accounts listed here can change the store.
-- Add yourself after creating your user (see SUPABASE_SETUP.md):
--   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
-- ---------------------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;  -- no policies: not readable through the API

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id          text primary key check (id ~ '^[A-Za-z0-9_-]{1,60}$'),
  name        text not null check (char_length(name) between 1 and 300),
  category    text not null default 'Other' check (char_length(category) between 1 and 40),
  brand       text not null default '' check (char_length(brand) <= 40),
  price       integer not null default 0 check (price >= 0),
  discount    numeric(9,6) not null default 0 check (discount >= 0 and discount < 100),
  description text not null default '' check (char_length(description) <= 1000),
  badge       text not null default '' check (badge in ('', 'New', 'Best seller', 'Sale')),
  image       text not null default '' check (char_length(image) <= 500),
  img_scale   integer not null default 100 check (img_scale between 40 and 200),
  img_rotate  integer not null default 0 check (img_rotate in (0, 90, 180, 270)),
  img_flip    boolean not null default false,
  img_fit     text not null default '' check (img_fit in ('', 'cover', 'contain')),
  specs       jsonb not null default '[]' check (jsonb_typeof(specs) = 'array'),
  sort_order  integer not null default 0,
  updated_at  timestamptz not null default now()
);
alter table public.products enable row level security;

drop policy if exists "products are public" on public.products;
create policy "products are public" on public.products for select using (true);
drop policy if exists "admins manage products" on public.products;
create policy "admins manage products" on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Settings: key/value documents. 'store' = { featured, heroImage }, 'ad' = popup ad, 'company' = contact details.
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  key        text primary key check (key in ('store', 'ad', 'company')),
  value      jsonb not null default '{}' check (jsonb_typeof(value) = 'object' and pg_column_size(value) < 20000),
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;

drop policy if exists "settings are public" on public.settings;
create policy "settings are public" on public.settings for select using (true);
drop policy if exists "admins manage settings" on public.settings;
create policy "admins manage settings" on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Orders: anyone can place one (the checkout form); only admins can read or update them.
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name       text not null check (char_length(name) between 1 and 120),
  phone      text not null check (char_length(phone) between 3 and 40),
  method     text not null default 'delivery' check (method in ('delivery', 'pickup')),
  address    text not null default '' check (char_length(address) <= 500),
  note       text not null default '' check (char_length(note) <= 300),
  items      jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 100),
  total      integer not null default 0 check (total >= 0),
  status     text not null default 'new' check (status in ('new', 'confirmed', 'done', 'cancelled'))
);
alter table public.orders enable row level security;

drop policy if exists "anyone can place an order" on public.orders;
create policy "anyone can place an order" on public.orders for insert to anon, authenticated
  with check (status = 'new');
drop policy if exists "admins read orders" on public.orders;
create policy "admins read orders" on public.orders for select to authenticated using (public.is_admin());
drop policy if exists "admins update orders" on public.orders;
create policy "admins update orders" on public.orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete orders" on public.orders;
create policy "admins delete orders" on public.orders for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- save_store: replaces the whole catalogue (order included) and the hero settings in one go.
-- Runs with the caller's rights, so the RLS policies above still apply.
-- ---------------------------------------------------------------------------
create or replace function public.save_store(p_products jsonb, p_featured text, p_hero_image text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not allowed';
  end if;
  if jsonb_typeof(p_products) <> 'array' then
    raise exception 'Products must be a list';
  end if;

  delete from public.products
  where id not in (select x ->> 'id' from jsonb_array_elements(p_products) x where x ->> 'id' is not null);

  insert into public.products (id, name, category, brand, price, discount, description, badge, image,
                               img_scale, img_rotate, img_flip, img_fit, specs, sort_order, updated_at)
  select x ->> 'id', x ->> 'name', coalesce(x ->> 'category', 'Other'), coalesce(x ->> 'brand', ''),
         coalesce((x ->> 'price')::integer, 0), coalesce((x ->> 'discount')::numeric, 0),
         coalesce(x ->> 'description', ''), coalesce(x ->> 'badge', ''), coalesce(x ->> 'image', ''),
         coalesce((x ->> 'img_scale')::integer, 100), coalesce((x ->> 'img_rotate')::integer, 0),
         coalesce((x ->> 'img_flip')::boolean, false), coalesce(x ->> 'img_fit', ''),
         coalesce(x -> 'specs', '[]'::jsonb), (n - 1)::integer, now()
  from jsonb_array_elements(p_products) with ordinality as t(x, n)
  on conflict (id) do update set
    name = excluded.name, category = excluded.category, brand = excluded.brand, price = excluded.price,
    discount = excluded.discount, description = excluded.description, badge = excluded.badge,
    image = excluded.image, img_scale = excluded.img_scale, img_rotate = excluded.img_rotate,
    img_flip = excluded.img_flip, img_fit = excluded.img_fit, specs = excluded.specs,
    sort_order = excluded.sort_order, updated_at = now();

  insert into public.settings (key, value, updated_at)
  values ('store', jsonb_build_object('featured', coalesce(p_featured, ''), 'heroImage', coalesce(p_hero_image, '')), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;
revoke execute on function public.save_store(jsonb, text, text) from anon, public;
grant execute on function public.save_store(jsonb, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: public "media" bucket for uploaded images (max 4 MB, images only).
-- Anyone can view the images; only admins can upload, list or delete.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 4194304, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins list media" on storage.objects;
create policy "admins list media" on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.is_admin());
drop policy if exists "admins upload media" on storage.objects;
create policy "admins upload media" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_admin());
drop policy if exists "admins update media" on storage.objects;
create policy "admins update media" on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_admin());
drop policy if exists "admins delete media" on storage.objects;
create policy "admins delete media" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_admin());

-- If you created the tables before the 'company' setting existed, this lets it be saved:
alter table public.settings drop constraint if exists settings_key_check;
alter table public.settings add constraint settings_key_check check (key in ('store', 'ad', 'company'));
