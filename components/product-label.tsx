import { BarcodePreview } from "./barcode-preview";
import { money } from "@/lib/client";

export type ProductLabelData = {
  id?: string;
  item_name: string;
  retail_gbp: number;
  sku: string | null;
  barcode_svg: string | null;
};

export function ProductLabel({
  product,
  showRetail = true,
}: {
  product: ProductLabelData;
  showRetail?: boolean;
}) {
  if (!product.sku || !product.barcode_svg) return null;
  return (
    <div className="product-label">
      <div className="label-name" title={product.item_name}>
        {product.item_name || "Product name"}
      </div>
      {showRetail ? (
        <strong className="label-price">{money(product.retail_gbp, "GBP")}</strong>
      ) : null}
      <BarcodePreview sku={product.sku} svg={product.barcode_svg} />
    </div>
  );
}
