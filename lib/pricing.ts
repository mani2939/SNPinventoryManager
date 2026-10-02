import Decimal from "decimal.js";
export type PricingInput = {
  price_inr: number;
  quantity: number;
  discount_percent: number;
  shipping_percent: number;
  exchange_rate: number;
};
export function calculatePricing(input: PricingInput) {
  const round = (v: Decimal) => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const before = round(new Decimal(input.price_inr).mul(input.quantity));
  const after = round(
    before.mul(
      new Decimal(1).minus(new Decimal(input.discount_percent).div(100)),
    ),
  );
  const shipping = round(after.mul(input.shipping_percent).div(100));
  const final = after.plus(shipping);
  const unit = round(final.div(input.quantity).div(input.exchange_rate));
  return {
    total_before_discount: before.toNumber(),
    total_after_discount: after.toNumber(),
    shipping_amount: shipping.toNumber(),
    final_total_inr: final.toNumber(),
    batch_gbp: round(final.div(input.exchange_rate)).toNumber(),
    unit_gbp: unit.toNumber(),
    retail_gbp: unit.mul(3).toNumber(),
  };
}
