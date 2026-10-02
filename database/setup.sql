-- Shapes & Pieces: Neon PostgreSQL creation and readiness checks.
-- Run this ENTIRE file in the Neon SQL Editor using the database owner role.
-- Select the branch/database connected to Vercel's Production DATABASE_URL.
-- Existing app rows are preserved. Safe to rerun with the expected app schema.
-- No vendors, exchange rates or sample products are invented.
-- Verification is inside the transaction: errors roll back this setup run.

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
-- Only the database owner/backend credential may access these tables.
revoke all on public.vendors,public.settings,public.products,public.login_limits from public;
revoke all on function public.consume_login_attempt(text) from public;
revoke all on function public.calculate_product_prices() from public;
create table if not exists public.sku_reservations (
 token uuid not null unique default gen_random_uuid(), sku text primary key check(sku ~ '^[A-Z0-9]{3}-[BACKGROUND]+Z[BACKGROUND]{2}-[0-9]{3}$'),
 vendor_id uuid not null references public.vendors(id), unit_gbp numeric(20,2) not null check(unit_gbp>=0),
 exchange_rate numeric(12,4) not null check(exchange_rate>0), barcode_svg text not null,
 redeemed boolean not null default false, created_at timestamptz not null default now()
);
alter table public.sku_reservations enable row level security;
revoke all on public.sku_reservations from public;
alter table public.products add column if not exists sku text references public.sku_reservations(sku);
alter table public.products add column if not exists barcode_svg text;
create unique index if not exists products_sku_unique on public.products(sku) where sku is not null;
-- Existing products may have null identifiers until the backfill script is run.
create or replace function public.protect_product_identity() returns trigger language plpgsql set search_path=public as $$
begin
 if TG_OP='INSERT' and (new.sku is null or new.barcode_svg is null) then
  raise exception 'A reserved SKU and barcode are required';
 end if;
 if TG_OP='UPDATE' and old.sku is not null then
  if new.sku is distinct from old.sku or new.barcode_svg is distinct from old.barcode_svg then
   raise exception 'A saved SKU and barcode cannot be changed';
  end if;
 end if;
 return new;
end; $$;
drop trigger if exists product_identity_guard on public.products;
create trigger product_identity_guard before insert or update on public.products for each row execute function public.protect_product_identity();
revoke all on function public.protect_product_identity() from public;

-- Read-only schema checks. Also included inside setup.sql's transaction.
do $$
declare
 required record;
 actual_type text;
 relation_id regclass;
begin
 for required in
  select * from (values
   ('vendors','id','uuid'),('vendors','name','text'),('vendors','active','boolean'),('vendors','created_at','timestamp with time zone'),
   ('settings','id','integer'),('settings','exchange_rate','numeric(12,4)'),
   ('products','id','uuid'),('products','item_name','text'),('products','description','text'),('products','vendor_id','uuid'),('products','entry_date','date'),
   ('products','price_inr','numeric(12,2)'),('products','quantity','integer'),('products','discount_percent','numeric(5,2)'),('products','shipping_percent','numeric(6,2)'),
   ('products','exchange_rate','numeric(12,4)'),('products','photo_key','text'),('products','total_before_discount','numeric(16,2)'),('products','total_after_discount','numeric(16,2)'),
   ('products','shipping_amount','numeric(16,2)'),('products','final_total_inr','numeric(16,2)'),('products','batch_gbp','numeric(20,2)'),('products','unit_gbp','numeric(20,2)'),('products','retail_gbp','numeric(20,2)'),
   ('products','created_at','timestamp with time zone'),('products','updated_at','timestamp with time zone'),('products','sku','text'),('products','barcode_svg','text'),
   ('sku_reservations','token','uuid'),('sku_reservations','sku','text'),('sku_reservations','vendor_id','uuid'),('sku_reservations','unit_gbp','numeric(20,2)'),
   ('sku_reservations','exchange_rate','numeric(12,4)'),('sku_reservations','barcode_svg','text'),('sku_reservations','redeemed','boolean'),('sku_reservations','created_at','timestamp with time zone'),
   ('login_limits','key','text'),('login_limits','attempts','integer'),('login_limits','window_start','timestamp with time zone')
  ) as expected(table_name,column_name,column_type)
 loop
  select format_type(a.atttypid,a.atttypmod) into actual_type
   from pg_attribute a
   where a.attrelid=to_regclass('public.'||required.table_name)
    and a.attname=required.column_name and a.attnum>0 and not a.attisdropped;
  if actual_type is distinct from required.column_type then
   raise exception 'Schema mismatch: %.% requires %, found %',required.table_name,required.column_name,required.column_type,coalesce(actual_type,'missing');
  end if;
 end loop;

 for required in select unnest(array['vendors','settings','products','sku_reservations','login_limits']) as table_name loop
  relation_id:=to_regclass('public.'||required.table_name);
  if not exists(select 1 from pg_constraint where conrelid=relation_id and contype='p') then
   raise exception 'Missing primary key on %',required.table_name;
  end if;
  if not exists(select 1 from pg_class where oid=relation_id and relrowsecurity) then
   raise exception 'Row-level security is disabled on %',required.table_name;
  end if;
 end loop;

 for required in select * from (values
  ('products','vendor_id','vendors'),('products','sku','sku_reservations'),('sku_reservations','vendor_id','vendors')
 ) as expected(table_name,column_name,parent_table) loop
  if not exists(
   select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
   where c.contype='f' and c.conrelid=to_regclass('public.'||required.table_name)
    and c.confrelid=to_regclass('public.'||required.parent_table) and a.attname=required.column_name and c.convalidated
  ) then raise exception 'Missing foreign key: %.% -> %',required.table_name,required.column_name,required.parent_table;end if;
 end loop;

 for required in select * from (values
  ('vendors_name_unique',true),('products_photo_unique',true),('products_sku_unique',true),
  ('sku_reservations_token_key',true),('products_vendor_date_idx',false),('products_date_idx',false)
 ) as expected(index_name,must_be_unique) loop
  if not exists(select 1 from pg_index where indexrelid=to_regclass('public.'||required.index_name) and indisvalid and indisready and (not required.must_be_unique or indisunique)) then
   raise exception 'Missing or invalid index: %',required.index_name;
  end if;
 end loop;

 for required in select * from (values
  ('product_price_calculation','calculate_product_prices()'),('product_identity_guard','protect_product_identity()')
 ) as expected(trigger_name,function_signature) loop
  if not exists(select 1 from pg_trigger where tgrelid='public.products'::regclass and tgname=required.trigger_name and tgenabled in ('O','A') and tgfoid=to_regprocedure('public.'||required.function_signature)) then
   raise exception 'Missing or disabled product trigger: %',required.trigger_name;
  end if;
 end loop;
 if to_regprocedure('public.consume_login_attempt(text)') is null then raise exception 'Missing persistent login limiter';end if;
 if not exists(select 1 from public.settings where id=1) then raise exception 'Missing settings singleton';end if;

 if exists(
  select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where p.oid=any(array[to_regprocedure('public.consume_login_attempt(text)'),to_regprocedure('public.calculate_product_prices()'),to_regprocedure('public.protect_product_identity()')])
   and a.grantee=0 and a.privilege_type='EXECUTE'
 ) then raise exception 'Public execution is enabled on an app function';end if;
end $$;


commit;

-- Final readiness report; configure vendor/rate values in the app Settings.
select 'schema verified' as schema_status,current_database() as database_name,current_user as sql_role,
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('vendors','settings','products','sku_reservations','login_limits') and c.relkind='r') as app_tables,
 (select exchange_rate from public.settings where id=1) as configured_inr_per_gbp,
 (select count(*) from public.vendors where active) as active_vendors,
 (select count(*) from public.products where sku is null or barcode_svg is null) as products_needing_sku_backfill;
