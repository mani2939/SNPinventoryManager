begin;
create table if not exists public.vendors (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100), active boolean not null default true,
 created_at timestamptz not null default now()
);
create unique index if not exists vendors_name_unique on public.vendors(lower(name));
create table if not exists public.settings (
 id integer primary key check(id=1), exchange_rate numeric(12,4) check(exchange_rate>0 and exchange_rate<=100000)
);
insert into public.settings(id,exchange_rate) values(1,null) on conflict(id) do nothing;
create table if not exists public.products (
 id uuid primary key default gen_random_uuid(), item_name text not null check(length(item_name) between 1 and 200), description text not null default '' check(length(description)<=2000),
 vendor_id uuid not null references public.vendors(id), entry_date date not null default current_date,
 price_inr numeric(12,2) not null check(price_inr>0 and price_inr<=10000000), quantity integer not null check(quantity between 1 and 100000),
 discount_percent numeric(5,2) not null default 0 check(discount_percent between 0 and 100), shipping_percent numeric(6,2) not null default 0 check(shipping_percent between 0 and 1000),
 exchange_rate numeric(12,4) not null check(exchange_rate>0 and exchange_rate<=100000), photo_key text check(photo_key ~ '^products/[0-9a-f-]{36}\.webp$'),
 total_before_discount numeric(16,2) not null, total_after_discount numeric(16,2) not null, shipping_amount numeric(16,2) not null,
 final_total_inr numeric(16,2) not null, batch_gbp numeric(20,2) not null, unit_gbp numeric(20,2) not null, retail_gbp numeric(20,2) not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists products_vendor_date_idx on public.products(vendor_id,entry_date desc);
create index if not exists products_date_idx on public.products(entry_date desc,created_at desc);
create unique index if not exists products_photo_unique on public.products(photo_key) where photo_key is not null;
create or replace function public.calculate_product_prices() returns trigger language plpgsql set search_path=public as $$
begin
 new.total_before_discount := round(new.price_inr*new.quantity,2);
 new.total_after_discount := round(new.total_before_discount*(1-new.discount_percent/100),2);
 new.shipping_amount := round(new.total_after_discount*new.shipping_percent/100,2);
 new.final_total_inr := new.total_after_discount+new.shipping_amount;
 new.batch_gbp := round(new.final_total_inr/new.exchange_rate,2);
 new.unit_gbp := round(new.final_total_inr/new.quantity/new.exchange_rate,2);
 new.retail_gbp := new.unit_gbp*3;
 new.updated_at := clock_timestamp();
 return new;
end; $$;
drop trigger if exists product_price_calculation on public.products;
create trigger product_price_calculation before insert or update on public.products for each row execute function public.calculate_product_prices();
create table if not exists public.login_limits (
 key text primary key, attempts integer not null, window_start timestamptz not null
);
create or replace function public.consume_login_attempt(attempt_key text) returns boolean
language plpgsql security definer set search_path=public as $$
declare result_count integer;
begin
 -- Expired entries are removed to bound storage growth.
 delete from public.login_limits where window_start < now()-interval '1 day';
 insert into public.login_limits(key,attempts,window_start) values(attempt_key,1,now())
 on conflict(key) do update set
 attempts=case when login_limits.window_start<now()-interval '15 minutes' then 1 else login_limits.attempts+1 end,
 window_start=case when login_limits.window_start<now()-interval '15 minutes' then now() else login_limits.window_start end
 returning attempts into result_count;
 return result_count<=10;
end; $$;
alter table public.vendors enable row level security;
alter table public.settings enable row level security;
alter table public.products enable row level security;
alter table public.login_limits enable row level security;
-- This single-admin app accesses data only through authenticated Next.js routes.
-- No browser/anon/authenticated policies or table privileges are granted.
revoke all on public.vendors,public.settings,public.products,public.login_limits from anon,authenticated;
grant all on public.vendors,public.settings,public.products,public.login_limits to service_role;
revoke all on function public.consume_login_attempt(text) from public,anon,authenticated;
grant execute on function public.consume_login_attempt(text) to service_role;
revoke all on function public.calculate_product_prices() from public,anon,authenticated;
commit;
