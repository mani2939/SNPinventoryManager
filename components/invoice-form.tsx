"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, Save } from "lucide-react";
import { api, money, today } from "@/lib/client";
import { BarcodeLookup } from "./barcode-lookup";
import { calculateInvoice } from "@/lib/invoices/pricing";
import {
  defaultInvoiceProfile,
  type InvoiceLineInput,
  type Invoice,
  type InvoiceProfile,
} from "@/lib/invoices/types";
import type { Product } from "@/lib/types";
const emptyLine = (): InvoiceLineInput => ({
  description: "",
  quantity: 1,
  unit_price: 0,
  discount_percent: 0,
  product_id: null,
  sku: null,
});
function dueDate(date: string, days: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function InvoiceForm() {
  const router = useRouter(),
    token = useRef(""),
    scanLock = useRef(false);
  const [profile, setProfile] = useState<InvoiceProfile>(defaultInvoiceProfile),
    [lines, setLines] = useState<InvoiceLineInput[]>([emptyLine()]);
  const [invoiceDate, setInvoiceDate] = useState(today),
    [due, setDue] = useState(() => dueDate(today(), 1)),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [address, setAddress] = useState(""),
    [notes, setNotes] = useState(""),
    [shipping, setShipping] = useState(0),
    [sku, setSku] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [scanBusy, setScanBusy] = useState(false),
    [scanMessage, setScanMessage] = useState("");
  useEffect(() => {
    const c = new AbortController();
    api<{ profile: InvoiceProfile }>("/api/invoices/config", {
      signal: c.signal,
    })
      .then((v) => {
        if (c.signal.aborted) return;
        setProfile(v.profile);
        setDue(dueDate(today(), v.profile.default_due_days));
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, []);
  const totals = calculateInvoice(lines, shipping);
  function update(n: number, patch: Partial<InvoiceLineInput>) {
    setLines((rows) => rows.map((r, i) => (i === n ? { ...r, ...patch } : r)));
  }
  async function scan(code: string) {
    if (busy || scanLock.current) return;
    if (lines.length >= 200 && !lines.some((r) => r.sku === code)) {
      setError("An invoice supports up to 200 items.");
      return;
    }
    scanLock.current = true;
    setScanBusy(true);
    setError("");
    setScanMessage("");
    try {
      const v = await api<{ products: Product[] }>(
        `/api/products?sku=${encodeURIComponent(code)}`,
      );
      const p = v.products[0];
      if (!p)
        throw new Error(
          "No inventory product matches this barcode. Add a manual item if needed.",
        );
      setLines((rows) => {
        const existing = rows.findIndex((r) => r.product_id === p.id);
        if (existing >= 0)
          return rows.map((r, i) =>
            i === existing
              ? { ...r, quantity: Math.min(100000, r.quantity + 1) }
              : r,
          );
        const line = {
          description: p.item_name,
          quantity: 1,
          unit_price: p.retail_gbp,
          discount_percent: 0,
          product_id: p.id,
          sku: p.sku,
        };
        return rows.length === 1 && !rows[0].description && !rows[0].unit_price
          ? [line]
          : [...rows, line];
      });
      setSku(code);
      setScanMessage(
        `Added ${p.item_name}. Scan it again to add another piece.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      scanLock.current = false;
      setScanBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (scanBusy) return;
    setBusy(true);
    setError("");
    if (!token.current) token.current = crypto.randomUUID();
    try {
      const invoice = await api<Invoice>("/api/invoices", {
        method: "POST",
        body: JSON.stringify({
          request_token: token.current,
          invoice_date: invoiceDate,
          due_date: due,
          customer_name: name,
          customer_phone: phone,
          customer_address: address,
          notes,
          shipping_gbp: shipping,
          items: lines,
        }),
      });
      router.push(`/invoices/${invoice.id}?saved=1`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">AFTER THE LIVE</span>
          <h1>Create invoice</h1>
          <p className="muted">Scan jewellery labels or add items by hand.</p>
        </div>
        <Link className="button secondary" href="/invoices">
          Invoice register
        </Link>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <BarcodeLookup
        active={sku}
        clear={() => setSku("")}
        onLookup={(code) => void scan(code)}
      />
      {scanBusy ? (
        <p role="status" className="notice">
          Finding product…
        </p>
      ) : scanMessage ? (
        <p role="status" className="success">
          {scanMessage}
        </p>
      ) : null}
      <form onSubmit={save} className="invoice-entry">
        <fieldset
          disabled={busy || loading || scanBusy}
          className="invoice-fieldset"
        >
          <section className="card">
            <div className="section-title">
              <div>
                <h2>Customer & dates</h2>
                <p>Invoice numbers are assigned when you save.</p>
              </div>
            </div>
            <div className="invoice-fields">
              <label>
                Customer name
                <input
                  required
                  maxLength={150}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label>
                WhatsApp number
                <input
                  type="tel"
                  maxLength={30}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+447700900123"
                  autoComplete="off"
                />
                <span className="field-hint">
                  Include the country code. Optional until sending.
                </span>
              </label>
              <label>
                Invoice date
                <input
                  type="date"
                  required
                  value={invoiceDate}
                  onChange={(e) => {
                    setInvoiceDate(e.target.value);
                    if (e.target.value)
                      setDue(dueDate(e.target.value, profile.default_due_days));
                  }}
                />
              </label>
              <label>
                Due date
                <input
                  type="date"
                  required
                  min={invoiceDate}
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </label>
              <label className="invoice-wide">
                Customer address
                <textarea
                  maxLength={1000}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={3}
                />
              </label>
            </div>
          </section>
          <section className="card">
            <div className="table-title invoice-section-heading">
              <div>
                <h2>Invoice items</h2>
                <p>GBP prices · no VAT breakdown</p>
              </div>
              <button
                type="button"
                className="button secondary"
                onClick={() => setLines((rows) => [...rows, emptyLine()])}
                disabled={lines.length >= 200}
              >
                <Plus size={17} />
                Add manual item
              </button>
            </div>
            <div className="invoice-lines">
              {lines.map((item, n) => (
                <div key={n} className="invoice-line">
                  <label className="invoice-line-description">
                    Item description
                    <input
                      aria-label={`Item ${n + 1} description`}
                      required
                      maxLength={300}
                      value={item.description}
                      onChange={(e) =>
                        update(n, { description: e.target.value })
                      }
                    />
                    {item.sku ? (
                      <span className="field-hint">{item.sku}</span>
                    ) : null}
                  </label>
                  <label>
                    Qty
                    <input
                      aria-label={`Item ${n + 1} quantity`}
                      type="number"
                      min={1}
                      max={100000}
                      step={1}
                      required
                      value={item.quantity}
                      onChange={(e) =>
                        update(n, { quantity: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Price · GBP
                    <input
                      aria-label={`Item ${n + 1} price`}
                      type="number"
                      min={0}
                      max={100000000}
                      step="0.01"
                      required
                      value={item.unit_price}
                      onChange={(e) =>
                        update(n, { unit_price: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Discount %
                    <input
                      aria-label={`Item ${n + 1} discount`}
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      required
                      value={item.discount_percent}
                      onChange={(e) =>
                        update(n, { discount_percent: Number(e.target.value) })
                      }
                    />
                  </label>
                  <div className="invoice-line-total">
                    <span>Line total</span>
                    <strong>{money(totals.items[n].line_total, "GBP")}</strong>
                  </div>
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label={`Remove item ${n + 1}`}
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((rows) => rows.filter((_, i) => i !== n))
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
          </section>
          <section className="card">
            <div className="invoice-fields">
              <label>
                Shipping · GBP
                <input
                  type="number"
                  min={0}
                  max={100000000}
                  step="0.01"
                  value={shipping}
                  onChange={(e) => setShipping(Number(e.target.value))}
                  required
                />
              </label>
              <label className="invoice-wide">
                Invoice notes
                <textarea
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Payment or order notes for this customer"
                />
              </label>
            </div>
            <dl className="invoice-summary">
              <div>
                <dt>Subtotal</dt>
                <dd>{money(totals.subtotal_gbp, "GBP")}</dd>
              </div>
              <div>
                <dt>Discount</dt>
                <dd>{money(totals.discount_gbp, "GBP")}</dd>
              </div>
              <div>
                <dt>Shipping</dt>
                <dd>{money(shipping, "GBP")}</dd>
              </div>
              <div className="invoice-grand-total">
                <dt>Total due</dt>
                <dd>{money(totals.total_gbp, "GBP")}</dd>
              </div>
            </dl>
            <p className="field-hint">
              Saving preserves item prices and customer details. Inventory
              quantities are not deducted. Download or send the PDF on the next
              screen.
            </p>
            <button
              className="button primary"
              disabled={busy || loading || scanBusy}
            >
              <Save size={17} />
              {busy ? "Saving…" : "Save invoice"}
            </button>
          </section>
        </fieldset>
      </form>
    </>
  );
}
