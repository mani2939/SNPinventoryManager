import type { PricingInput } from "./pricing";
export type Vendor = { id: string; name: string; pseudo_code: string; active: boolean };
export type ProductType = { id: string; name: string; active: boolean };
export type InventoryTotals = {
  quantity: number;
  total_before_discount: number;
  discount_amount: number;
  total_after_discount: number;
  shipping_amount: number;
  final_total_inr: number;
  batch_gbp: number;
  retail_value_gbp: number;
};
export type Settings = { id: number; exchange_rate: number | null };
export type Product = PricingInput & {
  id: string;
  sku: string | null;
  barcode_svg: string | null;
  item_name: string;
  description: string;
  vendor_id: string;
  product_type_id: string | null;
  entry_date: string;
  photo_key: string | null;
  created_at: string;
  updated_at: string;
  total_before_discount: number;
  total_after_discount: number;
  shipping_amount: number;
  final_total_inr: number;
  batch_gbp: number;
  unit_gbp: number;
  retail_gbp: number;
  vendors?: { name: string } | null;
  product_types?: { name: string } | null;
};

export type SkuReservation = {
  token: string;
  sku: string;
  barcode_svg: string;
  vendor_id: string;
  unit_gbp: number;
  exchange_rate: number;
  redeemed: boolean;
};
