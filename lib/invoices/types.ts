export type InvoiceLineInput = {
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  product_id: string | null;
  sku: string | null;
};
export type InvoiceLine = InvoiceLineInput & {
  line_total: number;
  discount_amount: number;
};
export type InvoiceProfile = {
  business_name: string;
  address: string;
  email: string;
  phone: string;
  payment_details: string;
  footer: string;
  default_due_days: number;
};
export type Invoice = {
  id: string;
  invoice_number: string;
  request_token: string;
  payload_hash: string;
  invoice_date: string;
  due_date: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  notes: string;
  shipping_gbp: number;
  seller: InvoiceProfile;
  items: InvoiceLine[];
  subtotal_gbp: number;
  discount_gbp: number;
  total_gbp: number;
  privacy_redacted_at: string | null;
  status: "unpaid" | "paid" | "void";
  created_at: string;
  updated_at: string;
};
export type Delivery = {
  id: string;
  invoice_id: string;
  request_token: string;
  recipient: string | null;
  status: "sending" | "accepted" | "failed" | "uncertain";
  consent_confirmed_at: string;
  message_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};
export const defaultInvoiceProfile: InvoiceProfile = {
  business_name: "Shapes & Pieces",
  address: "",
  email: "",
  phone: "",
  payment_details: "",
  footer: "Thank you for shopping with Shapes & Pieces.",
  default_due_days: 1,
};
