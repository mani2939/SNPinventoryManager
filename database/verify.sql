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

-- The schema status is separate from values that you set in the app's Settings.
select 'schema verified' as schema_status,current_database() as database_name,current_user as sql_role,
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('vendors','settings','products','sku_reservations','login_limits') and c.relkind='r') as app_tables,
 (select exchange_rate from public.settings where id=1) as configured_inr_per_gbp,
 (select count(*) from public.vendors where active) as active_vendors,
 (select count(*) from public.products where sku is null or barcode_svg is null) as products_needing_sku_backfill;
