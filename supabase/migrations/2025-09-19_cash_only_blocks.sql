
create type if not exists public.block_type as enum ('exact','prefix','contains');

create table if not exists public.address_blocks (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  pattern text not null,
  type public.block_type not null default 'exact',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_address_blocks_restaurant on public.address_blocks(restaurant_id, is_active);

create table if not exists public.closure_windows (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  start_time timestamptz,
  end_time timestamptz,
  weekday smallint,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_closures_restaurant on public.closure_windows(restaurant_id, is_active);

alter table public.orders
  alter column payment_method set default 'cash',
  alter column payment_status set default 'unpaid';

alter table public.address_blocks enable row level security;
alter table public.closure_windows enable row level security;

drop policy if exists address_blocks_admin_rw on public.address_blocks;
create policy address_blocks_admin_rw on public.address_blocks for all
  using (exists (select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.role in ('restaurant_admin','staff','super_admin') and ur.restaurant_id = address_blocks.restaurant_id))
  with check (exists (select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.role in ('restaurant_admin','staff','super_admin') and ur.restaurant_id = address_blocks.restaurant_id));

drop policy if exists closures_admin_rw on public.closure_windows;
create policy closures_admin_rw on public.closure_windows for all
  using (exists (select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.role in ('restaurant_admin','staff','super_admin') and ur.restaurant_id = closure_windows.restaurant_id))
  with check (exists (select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.role in ('restaurant_admin','staff','super_admin') and ur.restaurant_id = closure_windows.restaurant_id));
