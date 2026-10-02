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
export function vendorPrefix(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3)
    .padEnd(3, "X");
}
export function buildSku(
  name: string,
  unitGbp: number | string,
  suffix: number,
) {
  if (!Number.isInteger(suffix) || suffix < 0 || suffix > 999)
    throw new Error("SKU suffix must have three digits.");
  return `${vendorPrefix(name)}-${encodePrice(unitGbp)}-${String(suffix).padStart(3, "0")}`;
}
