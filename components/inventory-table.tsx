"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Plus,
  SlidersHorizontal,
  Gem,
  Package,
  IndianRupee,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  Printer,
} from "lucide-react";
import { api, money, displayDate } from "@/lib/client";
import { BarcodeLookup } from "./barcode-lookup";
import type { Product, Vendor } from "@/lib/types";
export function InventoryTable() {
  const [rows, setRows] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [sku, setSku] = useState("");
  const [vendor, setVendor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    api<{ vendors: Vendor[] }>("/api/config")
      .then((v) => {
        if (live) setVendors(v.vendors);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    if (new URLSearchParams(window.location.search).get("saved")) {
      setMessage("Product saved to your inventory.");
      window.history.replaceState(null, "", "/inventory");
    }
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const q = new URLSearchParams({ page: String(page) });
    if (sku) q.set("sku", sku);
    if (vendor) q.set("vendor", vendor);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    api<{ products: Product[]; count: number }>(`/api/products?${q}`, {
      signal: controller.signal,
    })
      .then((v) => {
        setRows(v.products);
        setCount(v.count);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setRows([]);
          setCount(0);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, vendor, from, to, sku, refresh]);
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/products/${deleting.id}`, {
        method: "DELETE",
        body: JSON.stringify({ updated_at: deleting.updated_at }),
      });
      setDeleting(null);
      setMessage("Product deleted.");
      if (rows.length === 1 && page > 1) setPage(page - 1);
      else setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const quantity = rows.reduce((n, p) => n + p.quantity, 0),
    cost = rows.reduce((n, p) => n + Number(p.final_total_inr), 0);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">THE COLLECTION</span>
          <h1>Your inventory</h1>
          <p className="muted">
            A clear view of every piece and what it costs.
          </p>
        </div>
        <Link className="button primary" href="/products/new">
          <Plus size={18} />
          Add product
        </Link>
      </div>
      {message ? (
        <div className="success" role="status">
          {message}
          <button aria-label="Dismiss message" onClick={() => setMessage("")}>
            <X size={16} />
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <BarcodeLookup
        active={sku}
        clear={() => {
          setSku("");
          setPage(1);
        }}
        onLookup={(code) => {
          setSku(code);
          setVendor("");
          setFrom("");
          setTo("");
          setPage(1);
        }}
      />
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-icon">
            <Gem size={22} />
          </span>
          <div>
            <span>Matching products</span>
            <strong>{loading ? "—" : count}</strong>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon rose">
            <Package size={22} />
          </span>
          <div>
            <span>Pieces on this page</span>
            <strong>{loading ? "—" : quantity}</strong>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon blue">
            <IndianRupee size={22} />
          </span>
          <div>
            <span>Landed cost on this page</span>
            <strong>{loading ? "—" : money(cost, "INR")}</strong>
          </div>
        </div>
      </div>
      <section className="card inventory-card">
        <div className="table-title">
          <div>
            <h2>Product register</h2>
            <p>Purchase amounts in INR · cost and retail per piece in GBP</p>
          </div>
          <span className="count-pill">{count} products</span>
        </div>
        <div className="filters">
          <span className="filter-label">
            <SlidersHorizontal size={17} />
            Filter
          </span>
          <label>
            Vendor
            <select
              aria-label="Vendor"
              value={vendor}
              onChange={(e) => {
                setVendor(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All vendors</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {!v.active ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            From date
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            To date
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </label>
          {vendor || from || to || sku ? (
            <button
              className="text-button"
              onClick={() => {
                setVendor("");
                setFrom("");
                setTo("");
                setSku("");
                setPage(1);
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
        {loading ? (
          <div className="table-empty" role="status">
            <Package size={32} />
            <h3>Loading your collection…</h3>
          </div>
        ) : !rows.length ? (
          <div className="table-empty">
            <Gem size={42} />
            <h3>
              {count === 0 && (vendor || from || to || sku)
                ? "No products match these filters"
                : "Your collection starts here"}
            </h3>
            <p>
              {vendor || from || to || sku
                ? "Try another barcode, vendor or date range."
                : "Add a vendor and exchange rate in Settings, then record your first piece."}
            </p>
            <Link href="/products/new" className="button primary">
              <Plus size={17} />
              Add product
            </Link>
          </div>
        ) : (
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Product inventory; scroll horizontally to see all costs"
          >
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Vendor</th>
                  <th>Product type</th>
                  <th>Date</th>
                  <th>Price · INR</th>
                  <th>Qty</th>
                  <th>Before discount</th>
                  <th>Discount %</th>
                  <th>After discount</th>
                  <th>Shipping %</th>
                  <th>Shipping · INR</th>
                  <th>Final total · INR</th>
                  <th>Rate · ₹/£</th>
                  <th>Batch · GBP</th>
                  <th>Cost / piece · GBP</th>
                  <th>Retail / piece · GBP</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="product-cell">
                      <div className="product-cell-inner">
                        <span className="table-photo">
                          {p.photo_key ? (
                            <Image
                              src={`/api/products/${p.id}/photo?v=${encodeURIComponent(p.updated_at)}`}
                              alt={p.item_name}
                              fill
                              unoptimized
                              sizes="48px"
                            />
                          ) : (
                            <Gem size={22} />
                          )}
                        </span>
                        <div>
                          <Link href={`/products/${p.id}`}>{p.item_name}</Link>
                          <span className="description" title={p.description}>
                            {p.description || "—"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <code className="sku-cell">
                        {p.sku || "Awaiting SKU backfill"}
                      </code>
                    </td>
                    <td>{p.vendors?.name || "—"}</td>
                    <td>{p.product_types?.name || "Unclassified"}</td>
                    <td>{displayDate(p.entry_date)}</td>
                    <td>{money(p.price_inr, "INR")}</td>
                    <td>{p.quantity}</td>
                    <td>{money(p.total_before_discount, "INR")}</td>
                    <td>{p.discount_percent}%</td>
                    <td>{money(p.total_after_discount, "INR")}</td>
                    <td>{p.shipping_percent}%</td>
                    <td>{money(p.shipping_amount, "INR")}</td>
                    <td className="number-strong">
                      {money(p.final_total_inr, "INR")}
                    </td>
                    <td>{p.exchange_rate}</td>
                    <td>{money(p.batch_gbp, "GBP")}</td>
                    <td className="number-strong">
                      {money(p.unit_gbp, "GBP")}
                    </td>
                    <td>
                      <span className="retail-pill">
                        {money(p.retail_gbp, "GBP")}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        {p.sku ? (
                          <Link
                            href={`/products/${p.id}/labels`}
                            className="icon-button"
                            aria-label={`Print labels for ${p.item_name}`}
                          >
                            <Printer size={16} />
                          </Link>
                        ) : null}
                        <Link
                          href={`/products/${p.id}`}
                          className="icon-button"
                          aria-label={`Edit ${p.item_name}`}
                        >
                          <Pencil size={16} />
                        </Link>
                        <button
                          className="icon-button danger"
                          aria-label={`Delete ${p.item_name}`}
                          onClick={() => setDeleting(p)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            {count
              ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, count)} of ${count}`
              : "0 products"}
          </span>
          <div>
            <button
              className="icon-button"
              aria-label="Previous page"
              disabled={page === 1 || loading}
              onClick={() => setPage((n) => n - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <span>
              Page {page} of {Math.max(1, Math.ceil(count / 25))}
            </span>
            <button
              className="icon-button"
              aria-label="Next page"
              disabled={page * 25 >= count || loading}
              onClick={() => setPage((n) => n + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>
      <p className="inventory-footnote">
        Each product retains its purchase exchange rate. Retail prices are
        always 3× the rounded GBP cost per piece.
      </p>
      {deleting ? (
        <DeleteDialog
          product={deleting}
          busy={busy}
          close={() => setDeleting(null)}
          remove={() => void remove()}
        />
      ) : null}
    </>
  );
}
function DeleteDialog({
  product,
  busy,
  close,
  remove,
}: {
  product: Product;
  busy: boolean;
  close: () => void;
  remove: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="delete-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <h2 id="delete-title">Delete this product?</h2>
      <p>
        “{product.item_name}” and its photo will be removed from your inventory.
      </p>
      <div className="modal-actions">
        <button
          autoFocus
          className="button secondary"
          onClick={close}
          disabled={busy}
        >
          Keep product
        </button>
        <button
          className="button delete-button"
          onClick={remove}
          disabled={busy}
        >
          {busy ? "Deleting…" : "Delete product"}
        </button>
      </div>
    </dialog>
  );
}
