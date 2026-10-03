import { nameQueryIndexes } from "./crypto";
// One INSERT snapshots seller settings and prices; the database trigger calculates totals.
export const createInvoiceSql = `insert into invoices(id,request_token,payload_hash,invoice_date,due_date,customer_data,customer_name_index,shipping_gbp,items,seller)
 values($1,$2,$3,$4,$5,$6,$7::text[],$8,$9::jsonb,$10) on conflict(request_token) do nothing returning *`;
export function invoiceFilter(f: {
  name?: string;
  from?: string;
  to?: string;
}) {
  const params: unknown[] = [],
    where: string[] = [];
  if (f.name) {
    const alternatives = nameQueryIndexes(f.name).map((tokens) => {
      params.push(tokens);
      return `customer_name_index @> $${params.length}::text[]`;
    });
    where.push("(" + alternatives.join(" or ") + ")");
  }
  if (f.from) {
    params.push(f.from);
    where.push(`invoice_date >= $${params.length}`);
  }
  if (f.to) {
    params.push(f.to);
    where.push(`invoice_date <= $${params.length}`);
  }
  return { params, clause: where.length ? "where " + where.join(" and ") : "" };
}
export const claimDeliverySql = `with locked as (select id from invoices where id=$1 and status<>'void' and privacy_redacted_at is null for update) insert into invoice_deliveries(invoice_id,request_token,recipient,recipient_hash,status)
 select id,$2,$3,$4,'sending' from locked
 on conflict(request_token) do nothing returning *`;
