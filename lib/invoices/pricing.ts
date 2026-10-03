import Decimal from "decimal.js";
import type { InvoiceLineInput } from "./types";
export function calculateInvoice(items: InvoiceLineInput[], shipping: number) {
  let subtotal = new Decimal(0),
    discount = new Decimal(0),
    net = new Decimal(0);
  const lines = items.map((item) => {
    const before = new Decimal(item.unit_price)
      .mul(item.quantity)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const line = before
      .mul(new Decimal(1).minus(new Decimal(item.discount_percent).div(100)))
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const reduction = before.minus(line);
    subtotal = subtotal.plus(before);
    discount = discount.plus(reduction);
    net = net.plus(line);
    return {
      ...item,
      line_total: line.toNumber(),
      discount_amount: reduction.toNumber(),
    };
  });
  return {
    items: lines,
    subtotal_gbp: subtotal.toNumber(),
    discount_gbp: discount.toNumber(),
    total_gbp: net
      .plus(shipping)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toNumber(),
  };
}
