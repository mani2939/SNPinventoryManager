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
