import Image from "next/image";
export function BarcodePreview({ sku, svg }: { sku: string; svg: string }) {
  return (
    <div className="barcode-preview">
      <Image
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
        alt={`Barcode ${sku}`}
        width={440}
        height={120}
        unoptimized
      />
      <code>{sku}</code>
    </div>
  );
}
