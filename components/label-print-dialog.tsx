"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { LabelPrinter } from "./label-printer";
import type { ProductLabelData } from "./product-label";

export function LabelPrintDialog({
  product,
  onClose,
}: {
  product: ProductLabelData;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    // Removing the portal closes the native dialog. Calling close in cleanup
    // would dismiss it during React's development effect replay.
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="barcode-print-dialog"
      aria-label="Print barcode labels"
      onClose={onClose}
    >
      <LabelPrinter product={product} onClose={() => ref.current?.close()} />
    </dialog>,
    document.body,
  );
}
