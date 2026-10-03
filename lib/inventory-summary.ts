import Decimal from "decimal.js";
import type { InventoryTotals, Product } from "./types";

export type ProductFilters = {
  vendor?: string;
  from?: string;
  to?: string;
  sku?: string;
  page: number;
};

export function productFilter(f: ProductFilters) {
  const params: string[] = [], where: string[] = [];
  for (const [field, operator, value] of [
    ["vendor_id", "=", f.vendor],
    ["entry_date", ">=", f.from],
    ["entry_date", "<=", f.to],
    ["sku", "=", f.sku],
  ]) {
    if (value) {
      params.push(value);
      where.push(`p.${field} ${operator} $${params.length}`);
    }
  }
  return { params, clause: where.length ? "where " + where.join(" and ") : "" };
}

export function inventorySummarySql(clause: string) {
  return `select count(*) as count,
    coalesce(sum(p.quantity),0) as quantity,
    coalesce(sum(p.total_before_discount),0) as total_before_discount,
    coalesce(sum(p.total_before_discount-p.total_after_discount),0) as discount_amount,
    coalesce(sum(p.total_after_discount),0) as total_after_discount,
    coalesce(sum(p.shipping_amount),0) as shipping_amount,
    coalesce(sum(p.final_total_inr),0) as final_total_inr,
    coalesce(sum(p.batch_gbp),0) as batch_gbp,
    coalesce(sum(p.retail_gbp*p.quantity),0) as retail_value_gbp
    from products p ${clause}`;
}

export function summarizeInventory(rows: Product[]): InventoryTotals {
  const totals = {
    quantity: new Decimal(0), total_before_discount: new Decimal(0),
    discount_amount: new Decimal(0), total_after_discount: new Decimal(0),
    shipping_amount: new Decimal(0), final_total_inr: new Decimal(0),
    batch_gbp: new Decimal(0), retail_value_gbp: new Decimal(0),
  };
  for (const p of rows) {
    for (const key of ["quantity", "total_before_discount", "total_after_discount",
      "shipping_amount", "final_total_inr", "batch_gbp"] as const) {
      totals[key] = totals[key].plus(p[key]);
    }
    totals.discount_amount = totals.discount_amount.plus(new Decimal(p.total_before_discount).minus(p.total_after_discount));
    totals.retail_value_gbp = totals.retail_value_gbp.plus(new Decimal(p.retail_gbp).mul(p.quantity));
  }
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value.toNumber()])) as InventoryTotals;
}
