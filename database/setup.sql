begin;
create table if not exists public.vendors (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100), active boolean not null default true,
 created_at timestamptz not null default now()
);
create unique index if not exists vendors_name_unique on public.vendors(lower(name));
-- Anonymous codes for existing vendors; never derive a code from a name.
alter table public.vendors add column if not exists pseudo_code text;
do $$
declare v record; attempt integer; candidate integer; code text; alphabet text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
begin
 for v in select id from public.vendors where pseudo_code is null order by id loop
  attempt := 0;
  loop
   if attempt >= 46656 then raise exception 'All three-character vendor codes are used'; end if;
   candidate := ((('x'||substr(replace(v.id::text,'-',''),1,6))::bit(24)::integer)+attempt) % 46656;
   code := substr(alphabet,candidate/1296+1,1)||substr(alphabet,(candidate/36)%36+1,1)||substr(alphabet,candidate%36+1,1);
   exit when not exists(select 1 from public.vendors where pseudo_code=code);
   attempt := attempt+1;
  end loop;
  update public.vendors set pseudo_code=code where id=v.id;
 end loop;
end $$;
alter table public.vendors alter column pseudo_code set not null;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.vendors'::regclass and conname='vendors_pseudo_code_check') then
  alter table public.vendors add constraint vendors_pseudo_code_check check(pseudo_code ~ '^[A-Z0-9]{3}$');
 end if;
end $$;
create unique index if not exists vendors_pseudo_code_unique on public.vendors(pseudo_code);
create table if not exists public.product_types (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100),
 active boolean not null default true, created_at timestamptz not null default now()
);
create unique index if not exists product_types_name_unique on public.product_types(lower(name));
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
alter table public.products add column if not exists product_type_id uuid references public.product_types(id);
create index if not exists products_product_type_idx on public.products(product_type_id);
create or replace function public.validate_product_type() returns trigger language plpgsql set search_path=public as $$
begin
 if new.product_type_id is not null and (TG_OP='INSERT' or new.product_type_id is distinct from old.product_type_id) then
  if not exists(select 1 from public.product_types where id=new.product_type_id and active) then
   raise exception 'Select an active product type' using errcode='23514';
  end if;
 end if;
 return new;
end; $$;
drop trigger if exists product_type_guard on public.products;
create trigger product_type_guard before insert or update on public.products for each row execute function public.validate_product_type();
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
alter table public.product_types enable row level security;
alter table public.settings enable row level security;
alter table public.products enable row level security;
alter table public.login_limits enable row level security;
-- Only the database owner/backend credential may access these tables.
revoke all on public.vendors,public.settings,public.products,public.login_limits from public;
revoke all on public.product_types from public;
revoke all on function public.validate_product_type() from public;
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
create table if not exists public.invoice_settings (
 id integer primary key check(id=1), profile text check(profile is null or profile like 'v1.%')
);
insert into public.invoice_settings(id,profile) values(1,null) on conflict(id) do nothing;
create sequence if not exists public.invoice_number_sequence;
create table if not exists public.invoices (
 id uuid primary key default gen_random_uuid(), request_token uuid not null unique, payload_hash text not null,
 invoice_number text not null unique, invoice_date date not null, due_date date not null check(due_date>=invoice_date),
 customer_data text not null check(customer_data like 'v1.%'), customer_name_index text[] not null, privacy_redacted_at timestamptz,
 shipping_gbp numeric(20,2) not null default 0 check(shipping_gbp>=0), items jsonb not null, seller text not null check(seller like 'v1.%'),
 subtotal_gbp numeric(20,2) not null default 0, discount_gbp numeric(20,2) not null default 0, total_gbp numeric(20,2) not null default 0,
 status text not null default 'unpaid' check(status in ('unpaid','paid','void')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists invoices_date_idx on public.invoices(invoice_date desc,created_at desc,id);
create index if not exists invoices_customer_name_idx on public.invoices using gin(customer_name_index);
create table if not exists public.invoice_deliveries (
 id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.invoices(id), request_token uuid not null unique,
 recipient text check(recipient like 'v1.%'), recipient_hash text,
 status text not null check(status in ('sending','accepted','failed','uncertain')),
 message_id text, error text, consent_confirmed_at timestamptz not null default now(), created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists invoice_deliveries_invoice_idx on public.invoice_deliveries(invoice_id,created_at desc);
create unique index if not exists invoice_delivery_active_unique on public.invoice_deliveries(invoice_id,recipient_hash) where status='sending';
create or replace function public.calculate_invoice() returns trigger language plpgsql set search_path=public as $$
declare item jsonb; enriched jsonb:='[]'; before_amount numeric; after_amount numeric; qty numeric; price numeric; discount numeric; sequence_number text;
begin
 if TG_OP='UPDATE' then
  if (new.id,new.request_token,new.invoice_number,new.invoice_date,new.due_date,new.shipping_gbp,new.seller,new.subtotal_gbp,new.discount_gbp,new.total_gbp,new.created_at)
   is distinct from (old.id,old.request_token,old.invoice_number,old.invoice_date,old.due_date,old.shipping_gbp,old.seller,old.subtotal_gbp,old.discount_gbp,old.total_gbp,old.created_at) then
   raise exception 'Saved invoice financial details are immutable.';
  end if;
  if old.privacy_redacted_at is null and new.privacy_redacted_at is not null and cardinality(new.customer_name_index)=0 then
   if exists(select 1 from invoice_deliveries where invoice_id=old.id and status='sending') then raise exception 'A WhatsApp send is in progress';end if;
   if new.payload_hash<>'redacted' or jsonb_array_length(new.items)<>jsonb_array_length(old.items) then raise exception 'Invalid customer redaction';end if;
   if exists(select 1 from jsonb_array_elements(new.items) with ordinality n(item,pos) join jsonb_array_elements(old.items) with ordinality o(item,pos) using(pos) where (n.item-'description') is distinct from (o.item-'description')) then raise exception 'Redaction cannot change item financial details';end if;
  elsif (new.customer_data,new.customer_name_index,new.privacy_redacted_at,new.items,new.payload_hash) is distinct from (old.customer_data,old.customer_name_index,old.privacy_redacted_at,old.items,old.payload_hash) then
   raise exception 'Customer data and items can only be changed by explicit redaction.';
  end if;
  if new.status='void' and old.status<>'void' and exists(select 1 from invoice_deliveries where invoice_id=old.id and status='sending') then raise exception 'A WhatsApp send is in progress';end if;
  if old.status='void' and new.status<>'void' then raise exception 'A void invoice cannot be reopened.';end if;
  new.updated_at:=clock_timestamp();return new;
 end if;
 if jsonb_typeof(new.items)<>'array' or jsonb_array_length(new.items) not between 1 and 200 then raise exception 'Invoice requires between 1 and 200 items';end if;
 if new.seller not like 'v1.%' then raise exception 'Encrypted invoice seller is required';end if;
 sequence_number:=nextval('public.invoice_number_sequence')::text;
 new.invoice_number:='SNP-'||to_char(new.invoice_date,'YYYYMMDD')||'-'||lpad(sequence_number,greatest(8,length(sequence_number)),'0');
 new.subtotal_gbp:=0;new.discount_gbp:=0;new.total_gbp:=0;
 for item in select * from jsonb_array_elements(new.items) loop
  if jsonb_typeof(item->'quantity') is distinct from 'number' or jsonb_typeof(item->'unit_price') is distinct from 'number' or jsonb_typeof(item->'discount_percent') is distinct from 'number'
   or coalesce(length(item->>'description'),0) not between 12 and 3000 or (item->>'description') not like 'v1.%' then raise exception 'Invalid invoice item';end if;
  qty:=(item->>'quantity')::numeric;price:=(item->>'unit_price')::numeric;discount:=(item->>'discount_percent')::numeric;
  if qty not between 1 and 100000 or qty<>trunc(qty) or price not between 0 and 100000000 or price<>round(price,2)
   or discount not between 0 and 100 or discount<>round(discount,2) then raise exception 'Invalid invoice quantity, price or discount';end if;
  before_amount:=round(price*qty,2);after_amount:=round(before_amount*(1-discount/100),2);
  enriched:=enriched||jsonb_build_array(item||jsonb_build_object('line_total',after_amount,'discount_amount',before_amount-after_amount));
  new.subtotal_gbp:=new.subtotal_gbp+before_amount;new.discount_gbp:=new.discount_gbp+before_amount-after_amount;new.total_gbp:=new.total_gbp+after_amount;
 end loop;
 new.items:=enriched;new.total_gbp:=new.total_gbp+new.shipping_gbp;
 return new;
end $$;
drop trigger if exists invoice_calculation_guard on public.invoices;
create trigger invoice_calculation_guard before insert or update on public.invoices for each row execute function public.calculate_invoice();
alter table public.invoice_settings enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_deliveries enable row level security;
revoke all on public.invoice_settings,public.invoices,public.invoice_deliveries from public;
revoke all on sequence public.invoice_number_sequence from public;
revoke all on function public.calculate_invoice() from public;

-- Read-only schema checks. Also included inside setup.sql's transaction.
do $$
declare
 required record;
 actual_type text;
 relation_id regclass;
begin
 for required in
  select * from (values
   ('vendors','id','uuid'),('vendors','name','text'),('vendors','pseudo_code','text'),('vendors','active','boolean'),('vendors','created_at','timestamp with time zone'),
   ('product_types','id','uuid'),('product_types','name','text'),('product_types','active','boolean'),('product_types','created_at','timestamp with time zone'),('products','product_type_id','uuid'),
   ('invoice_settings','id','integer'),('invoice_settings','profile','text'),('invoices','id','uuid'),('invoices','invoice_number','text'),('invoices','items','jsonb'),('invoices','seller','text'),('invoices','customer_data','text'),('invoices','customer_name_index','text[]'),('invoices','privacy_redacted_at','timestamp with time zone'),('invoices','total_gbp','numeric(20,2)'),('invoice_deliveries','id','uuid'),('invoice_deliveries','request_token','uuid'),('invoice_deliveries','invoice_id','uuid'),('invoice_deliveries','status','text'),('invoice_deliveries','recipient','text'),('invoice_deliveries','recipient_hash','text'),('invoice_deliveries','consent_confirmed_at','timestamp with time zone'),('invoices','request_token','uuid'),('invoices','payload_hash','text'),('invoices','invoice_date','date'),('invoices','due_date','date'),('invoices','status','text'),
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

 for required in select unnest(array['vendors','product_types','settings','products','sku_reservations','login_limits','invoice_settings','invoices','invoice_deliveries']) as table_name loop
  relation_id:=to_regclass('public.'||required.table_name);
  if not exists(select 1 from pg_constraint where conrelid=relation_id and contype='p') then
   raise exception 'Missing primary key on %',required.table_name;
  end if;
  if not exists(select 1 from pg_class where oid=relation_id and relrowsecurity) then
   raise exception 'Row-level security is disabled on %',required.table_name;
  end if;
 end loop;

 for required in select * from (values
  ('invoice_deliveries','invoice_id','invoices'),('products','vendor_id','vendors'),('products','product_type_id','product_types'),('products','sku','sku_reservations'),('sku_reservations','vendor_id','vendors')
 ) as expected(table_name,column_name,parent_table) loop
  if not exists(
   select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
   where c.contype='f' and c.conrelid=to_regclass('public.'||required.table_name)
    and c.confrelid=to_regclass('public.'||required.parent_table) and a.attname=required.column_name and c.convalidated
  ) then raise exception 'Missing foreign key: %.% -> %',required.table_name,required.column_name,required.parent_table;end if;
 end loop;

 for required in select * from (values
  ('invoices_request_token_key',true),('invoices_invoice_number_key',true),('invoices_date_idx',false),('invoice_deliveries_request_token_key',true),('invoice_deliveries_invoice_idx',false),('vendors_name_unique',true),('products_photo_unique',true),('products_sku_unique',true),
  ('vendors_pseudo_code_unique',true),('product_types_name_unique',true),('products_product_type_idx',false),
  ('sku_reservations_token_key',true),('products_vendor_date_idx',false),('products_date_idx',false)
 ) as expected(index_name,must_be_unique) loop
  if not exists(select 1 from pg_index where indexrelid=to_regclass('public.'||required.index_name) and indisvalid and indisready and (not required.must_be_unique or indisunique)) then
   raise exception 'Missing or invalid index: %',required.index_name;
  end if;
 end loop;

 for required in select * from (values
  ('product_price_calculation','calculate_product_prices()'),('product_identity_guard','protect_product_identity()'),('product_type_guard','validate_product_type()')
 ) as expected(trigger_name,function_signature) loop
  if not exists(select 1 from pg_trigger where tgrelid='public.products'::regclass and tgname=required.trigger_name and tgenabled in ('O','A') and tgfoid=to_regprocedure('public.'||required.function_signature)) then
   raise exception 'Missing or disabled product trigger: %',required.trigger_name;
  end if;
 end loop;
 if not exists(select 1 from pg_trigger where tgrelid='public.invoices'::regclass and tgname='invoice_calculation_guard' and tgenabled in ('O','A') and tgfoid=to_regprocedure('public.calculate_invoice()')) then raise exception 'Missing invoice pricing/identity trigger';end if;
 if not exists(select 1 from invoice_settings where id=1) then raise exception 'Missing invoice settings';end if;
 if to_regprocedure('public.consume_login_attempt(text)') is null then raise exception 'Missing persistent login limiter';end if;
 if not exists(select 1 from public.settings where id=1) then raise exception 'Missing settings singleton';end if;
 if not exists(select 1 from pg_attribute where attrelid='public.vendors'::regclass and attname='pseudo_code' and attnotnull)
  or not exists(select 1 from pg_constraint where conrelid='public.vendors'::regclass and conname='vendors_pseudo_code_check' and convalidated)
  or exists(select 1 from public.vendors where pseudo_code is null or pseudo_code !~ '^[A-Z0-9]{3}$') then
  raise exception 'Vendor codes must be present and valid';
 end if;

 if exists(
  select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where p.oid=any(array[to_regprocedure('public.consume_login_attempt(text)'),to_regprocedure('public.calculate_product_prices()'),to_regprocedure('public.protect_product_identity()'),to_regprocedure('public.validate_product_type()'),to_regprocedure('public.calculate_invoice()')])
   and a.grantee=0 and a.privilege_type='EXECUTE'
 ) then raise exception 'Public execution is enabled on an app function';end if;
end $$;

-- The schema status is separate from values that you set in the app's Settings.
select 'schema verified' as schema_status,current_database() as database_name,current_user as sql_role,
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('vendors','product_types','settings','products','sku_reservations','login_limits','invoice_settings','invoices','invoice_deliveries') and c.relkind='r') as app_tables,
 (select exchange_rate from public.settings where id=1) as configured_inr_per_gbp,
 (select count(*) from public.vendors where active) as active_vendors,
 (select count(*) from public.product_types where active) as active_product_types,
 (select count(*) from public.products where sku is null or barcode_svg is null) as products_needing_sku_backfill;

COMMIT;
