import Decimal from "decimal.js";
// 1 B, 2 A, 3 C, 4 K, 5 G, 6 R, 7 O, 8 U, 9 N, 0 D. Decimal point Z.
const mapping: Record<string, string> = {
  "1": "B",
  "2": "A",
  "3": "C",
  "4": "K",
  "5": "G",
  "6": "R",
  "7": "O",
  "8": "U",
  "9": "N",
  "0": "D",
  ".": "Z",
};
export function encodePrice(price: number | string) {
  const value = new Decimal(price);
  if (!value.isFinite() || value.isNegative())
    throw new Error("GBP cost must be a non-negative amount.");
  return value
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2)
    .split("")
    .map((c) => mapping[c])
    .join("");
}
export function vendorPrefix(pseudoCode: string) {
  const code = pseudoCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{3}$/.test(code))
    throw new Error("Vendor code must contain exactly three letters or digits.");
  return code;
}
// For upgrading existing vendors; independent of their names. Mirrors SQL.
export function anonymousVendorCode(id: string, attempt = 0) {
  const start = parseInt(id.replaceAll("-", "").slice(0, 6), 16);
  return ((start + attempt) % 46656).toString(36).toUpperCase().padStart(3, "0");
}
export function buildSku(
  pseudoCode: string,
  unitGbp: number | string,
  suffix: number,
) {
  if (!Number.isInteger(suffix) || suffix < 0 || suffix > 999)
    throw new Error("SKU suffix must have three digits.");
  return `${vendorPrefix(pseudoCode)}-${encodePrice(unitGbp)}-${String(suffix).padStart(3, "0")}`;
}
