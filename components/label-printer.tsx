"use client";
import { useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { BarcodePreview } from "./barcode-preview";
import { money } from "@/lib/client";
import type { Product } from "@/lib/types";
export function LabelPrinter({ product }: { product: Product }) {
  const [copies, setCopies] = useState("1");
  const [size, setSize] = useState("70x40");
  const [retail, setRetail] = useState(true);
  const [error, setError] = useState("");
  const [width, height] = size.split("x").map(Number);
  const count = Number(copies);
  const valid = Number.isInteger(count) && count >= 1 && count <= 1000;
  if (!product.sku || !product.barcode_svg)
    return (
      <div className="notice">
        This older product needs the SKU backfill before labels can be printed.{" "}
        <Link href={`/products/${product.id}`}>Back to product</Link>
      </div>
    );
  function print() {
    if (!valid) {
      setError("Choose between 1 and 1,000 labels.");
      return;
    }
    setError("");
    window.print();
  }
  return (
    <>
      <div className="print-controls">
        <div className="page-heading">
          <div>
            <span className="eyebrow">BARCODE LABELS</span>
            <h1>Print labels</h1>
            <p className="muted">{product.item_name}</p>
          </div>
          <Link href={`/products/${product.id}`} className="button secondary">
            Back to product
          </Link>
        </div>
        <section className="card label-options">
          <label>
            Number of labels
            <input
              type="number"
              min="1"
              max="1000"
              step="1"
              value={copies}
              onChange={(e) => setCopies(e.target.value)}
            />
          </label>
          <label>
            Label size
            <select value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="70x40">70 × 40 mm</option>
              <option value="100x50">100 × 50 mm</option>
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={retail}
              onChange={(e) => setRetail(e.target.checked)}
            />
            Show retail price
          </label>
          <button className="button primary" onClick={print} disabled={!valid}>
            <Printer size={17} />
            Print labels
          </button>
        </section>
        <p className="field-hint">
          Choose the matching paper size in your printer settings. Print at 100%
          scale with browser headers and footers off; test one label before
          printing the batch.
        </p>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <style>{`@media print{@page{size:${width}mm ${height}mm;margin:0}.printed-label{width:${width}mm!important;height:${height}mm!important;}}`}</style>
      <div
        className="labels-sheet"
        style={
          {
            "--label-width": `${width}mm`,
            "--label-height": `${height}mm`,
          } as React.CSSProperties
        }
      >
        {Array.from({ length: valid ? count : 1 }, (_, i) => (
          <article key={i} className="printed-label">
            <div className="label-brand">SHAPES & PIECES</div>
            <div className="label-name">{product.item_name}</div>
            <BarcodePreview sku={product.sku!} svg={product.barcode_svg!} />
            {retail ? (
              <strong className="label-price">
                {money(product.retail_gbp, "GBP")}
              </strong>
            ) : null}
          </article>
        ))}
      </div>
    </>
  );
}
