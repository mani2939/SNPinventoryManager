"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Download, Send, Plus, Check, Shield } from "lucide-react";
import { api, money, displayDate } from "@/lib/client";
import type { Invoice, Delivery } from "@/lib/invoices/types";
export function InvoiceDetails({ id }: { id: string }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null),
    [deliveries, setDeliveries] = useState<Delivery[]>([]),
    [recipient, setRecipient] = useState(""),
    [ready, setReady] = useState(false),
    [optIn, setOptIn] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [confirm, setConfirm] = useState<"void" | "redact" | null>(null);
  const sendToken = useRef("");
  async function load() {
    const v = await api<{ invoice: Invoice; deliveries: Delivery[] }>(
      `/api/invoices/${id}`,
    );
    setInvoice(v.invoice);
    setDeliveries(v.deliveries);
    return v.invoice;
  }
  useEffect(() => {
    const c = new AbortController();
    Promise.all([
      api<{ invoice: Invoice; deliveries: Delivery[] }>(`/api/invoices/${id}`, {
        signal: c.signal,
      }),
      api<{ whatsapp_ready: boolean }>("/api/invoices/config", {
        signal: c.signal,
      }),
    ])
      .then(([v, cfg]) => {
        if (c.signal.aborted) return;
        setInvoice(v.invoice);
        setDeliveries(v.deliveries);
        setRecipient(v.invoice.customer_phone);
        setReady(cfg.whatsapp_ready);
        if (new URLSearchParams(window.location.search).get("saved")) {
          setMessage(
            "Invoice saved. Download the PDF or send it to the customer.",
          );
          window.history.replaceState(null, "", `/invoices/${id}`);
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, [id]);
  async function status(value: Invoice["status"]) {
    if (!invoice) return;
    setBusy("status");
    setError("");
    try {
      const saved = await api<Invoice>(`/api/invoices/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: value, updated_at: invoice.updated_at }),
      });
      setInvoice(saved);
      setConfirm(null);
      setMessage(`Invoice marked ${value}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function redact() {
    if (!invoice) return;
    setBusy("redact");
    setError("");
    try {
      await api(`/api/invoices/${id}/privacy`, {
        method: "POST",
        body: JSON.stringify({ updated_at: invoice.updated_at, confirm: true }),
      });
      await load();
      setRecipient("");
      setConfirm(null);
      setMessage(
        "Customer details removed. Financial amounts and dates are preserved.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    setBusy("send");
    setError("");
    setMessage("");
    if (!sendToken.current) sendToken.current = crypto.randomUUID();
    try {
      const v = await api<{ delivery: Delivery }>(`/api/invoices/${id}/send`, {
        method: "POST",
        body: JSON.stringify({
          recipient,
          request_token: sendToken.current,
          customer_opt_in_confirmed: optIn,
        }),
      });
      setMessage(
        v.delivery.status === "accepted"
          ? "WhatsApp accepted the invoice. This does not yet confirm delivery."
          : v.delivery.status === "sending"
            ? "This send is already in progress. Refresh the send history shortly."
            : v.delivery.error ||
              "The previous send did not complete. Check WhatsApp before starting a new attempt.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      try {
        await load();
      } catch {}
      setBusy("");
    }
  }
  if (!invoice)
    return (
      <>
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : (
          <div className="card" role="status">
            Loading invoice…
          </div>
        )}
        <Link className="button secondary" href="/invoices">
          Invoice register
        </Link>
      </>
    );
  const available = invoice.status !== "void" && !invoice.privacy_redacted_at;
  const phoneDigits = recipient.replace(/\D/g, "");
  const validPhone = /^\+[1-9]\d{7,14}$/.test(
    recipient.replace(/[\s()-]/g, ""),
  );
  const chatText = `Hello ${invoice.customer_name}, your Shapes & Pieces invoice ${invoice.invoice_number} is ${money(invoice.total_gbp, "GBP")}. Please see the attached invoice PDF. Payment is due ${displayDate(invoice.due_date)}.`;
  return (
    <>
      <div className="page-heading invoice-detail-heading">
        <div>
          <span className="eyebrow">CUSTOMER INVOICE</span>
          <h1>{invoice.invoice_number}</h1>
          <p className="muted">
            {invoice.customer_name} · {displayDate(invoice.invoice_date)}
          </p>
        </div>
        <div className="invoice-actions">
          <a className="button primary" href={`/api/invoices/${id}/pdf`}>
            <Download size={17} />
            Download PDF
          </a>
          <Link className="button secondary" href="/invoices/new">
            <Plus size={17} />
            New invoice
          </Link>
        </div>
      </div>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="success">
          {message}
        </p>
      ) : null}
      <div className="invoice-detail-layout">
        <section className="card">
          <div className="table-title invoice-section-heading">
            <div>
              <h2>{invoice.customer_name}</h2>
              <p>{invoice.customer_phone || "No WhatsApp number saved"}</p>
            </div>
            <span className={`invoice-status ${invoice.status}`}>
              {invoice.status}
            </span>
          </div>
          {invoice.customer_address ? (
            <p className="invoice-address">{invoice.customer_address}</p>
          ) : null}
          <p className="invoice-help">Due {displayDate(invoice.due_date)}</p>
          <div
            className="table-scroll"
            role="region"
            tabIndex={0}
            aria-label="Invoice items"
          >
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Discount</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, n) => (
                  <tr key={n}>
                    <td className="invoice-description">
                      {item.description}
                      {item.sku ? <small>{item.sku}</small> : null}
                    </td>
                    <td>{item.quantity}</td>
                    <td>{money(item.unit_price, "GBP")}</td>
                    <td>{item.discount_percent}%</td>
                    <td>{money(item.line_total, "GBP")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="invoice-summary">
            <div>
              <dt>Subtotal</dt>
              <dd>{money(invoice.subtotal_gbp, "GBP")}</dd>
            </div>
            <div>
              <dt>Discount</dt>
              <dd>{money(invoice.discount_gbp, "GBP")}</dd>
            </div>
            <div>
              <dt>Shipping</dt>
              <dd>{money(invoice.shipping_gbp, "GBP")}</dd>
            </div>
            <div className="invoice-grand-total">
              <dt>Total due</dt>
              <dd>{money(invoice.total_gbp, "GBP")}</dd>
            </div>
          </dl>
          {invoice.notes ? (
            <p className="invoice-address">{invoice.notes}</p>
          ) : null}
          <p className="field-hint">Saved prices · GBP · no VAT breakdown</p>
          {invoice.status !== "void" ? (
            <div className="invoice-actions">
              <button
                className="button secondary"
                disabled={!!busy}
                onClick={() =>
                  void status(invoice.status === "paid" ? "unpaid" : "paid")
                }
              >
                <Check size={17} />
                {invoice.status === "paid" ? "Mark unpaid" : "Mark paid"}
              </button>
              <button
                className="text-button"
                disabled={!!busy}
                onClick={() => {
                  setError("");
                  setConfirm("void");
                }}
              >
                Void invoice
              </button>
            </div>
          ) : null}
        </section>
        <div className="settings-column">
          <section className="card">
            <h2>Send on WhatsApp</h2>
            <form onSubmit={send} className="invoice-send-form">
              <label>
                Recipient WhatsApp number
                <input
                  type="tel"
                  maxLength={30}
                  value={recipient}
                  disabled={!!busy || !available}
                  onChange={(e) => {
                    setRecipient(e.target.value);
                    sendToken.current = "";
                    setOptIn(false);
                    setMessage("");
                  }}
                  placeholder="+447700900123"
                  required
                />
              </label>
              <label className="invoice-opt-in">
                <input
                  type="checkbox"
                  checked={optIn}
                  onChange={(e) => setOptIn(e.target.checked)}
                  disabled={!!busy || !available}
                />
                Customer agreed to receive their invoice on WhatsApp
              </label>
              <button
                className="button primary"
                disabled={
                  !!busy || !ready || !available || !optIn || !validPhone
                }
              >
                <Send size={17} />
                {busy === "send" ? "Sending…" : "Send PDF via WhatsApp"}
              </button>
              {!ready ? (
                <p className="field-hint">
                  API sending needs Meta credentials and an approved invoice
                  template. Use the manual option below until configured.
                </p>
              ) : null}
              {available && validPhone && optIn ? (
                <a
                  className="button secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                  href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(chatText)}`}
                >
                  Open WhatsApp (attach PDF)
                </a>
              ) : null}
              <p className="field-hint">
                The manual option opens a message. Download the PDF and attach
                it yourself; it does not send automatically.
              </p>
              {!available ? (
                <p className="notice">
                  Void or redacted invoices cannot be sent.
                </p>
              ) : null}
            </form>
            {deliveries.length ? (
              <div className="invoice-deliveries">
                <h3>Send history</h3>
                {deliveries.map((d) => (
                  <div key={d.id}>
                    <strong>
                      {d.status === "accepted"
                        ? "Accepted by WhatsApp"
                        : d.status}
                    </strong>
                    <span>
                      {d.recipient || "Recipient removed"} ·{" "}
                      {new Date(d.created_at).toLocaleString("en-GB", {
                        timeZone: "Europe/London",
                      })}
                    </span>
                    {d.error ? <p>{d.error}</p> : null}
                  </div>
                ))}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void load().catch((e) => setError(e.message))}
                  disabled={!!busy}
                >
                  Refresh send history
                </button>
                {sendToken.current ? (
                  <button
                    type="button"
                    className="text-button"
                    disabled={!!busy || !available}
                    onClick={() => {
                      sendToken.current = "";
                      setOptIn(false);
                      setMessage(
                        "New send attempt prepared. Check WhatsApp for an existing copy, then confirm the recipient again before sending.",
                      );
                    }}
                  >
                    Prepare new send attempt
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
          <section className="card">
            <h2>Customer data</h2>
            <p className="invoice-help">
              Encrypted at rest; accessible only after admin login.
            </p>
            <a className="button secondary" href={`/api/invoices/${id}/export`}>
              <Download size={17} />
              Export customer data
            </a>
            {!invoice.privacy_redacted_at ? (
              <button
                className="text-button invoice-redact"
                disabled={!!busy}
                onClick={() => {
                  setError("");
                  setConfirm("redact");
                }}
              >
                <Shield size={16} />
                Remove customer details
              </button>
            ) : (
              <p className="field-hint">
                Customer details removed on{" "}
                {new Date(invoice.privacy_redacted_at).toLocaleDateString(
                  "en-GB",
                )}
                .
              </p>
            )}
          </section>
        </div>
      </div>
      {confirm ? (
        <InvoiceConfirmation
          kind={confirm}
          busy={!!busy}
          error={error}
          close={() => setConfirm(null)}
          action={() => void (confirm === "void" ? status("void") : redact())}
        />
      ) : null}
    </>
  );
}
function InvoiceConfirmation({
  kind,
  busy,
  error,
  close,
  action,
}: {
  kind: "void" | "redact";
  busy: boolean;
  error: string;
  close: () => void;
  action: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="invoice-confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <h2 id="invoice-confirm-title">
        {kind === "void" ? "Void this invoice?" : "Remove customer details?"}
      </h2>
      <p>
        {kind === "void"
          ? "The invoice will remain in the register but cannot be sent or reopened."
          : "This permanently removes the customer name, phone, address, notes, item descriptions and recipients from this invoice’s active records. Financial amounts remain. Downloaded PDFs, WhatsApp copies and backups need separate handling."}
      </p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="modal-actions">
        <button
          className="button secondary"
          autoFocus
          onClick={close}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          className="button delete-button"
          onClick={action}
          disabled={busy}
        >
          {busy
            ? "Updating…"
            : kind === "void"
              ? "Confirm void"
              : "Remove customer details"}
        </button>
      </div>
    </dialog>
  );
}
