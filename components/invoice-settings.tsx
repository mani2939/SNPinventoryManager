"use client";
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { api } from "@/lib/client";
import {
  defaultInvoiceProfile,
  type InvoiceProfile,
} from "@/lib/invoices/types";
export function InvoiceSettings() {
  const [profile, setProfile] = useState<InvoiceProfile>(defaultInvoiceProfile),
    [ready, setReady] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    const c = new AbortController();
    api<{ profile: InvoiceProfile; whatsapp_ready: boolean }>(
      "/api/invoices/config",
      { signal: c.signal },
    )
      .then((v) => {
        if (c.signal.aborted) return;
        setProfile(v.profile);
        setReady(v.whatsapp_ready);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/api/invoices/config", {
        method: "PATCH",
        body: JSON.stringify(profile),
      });
      setMessage(
        "Invoice settings saved. Existing invoices keep their saved seller details.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function update(patch: Partial<InvoiceProfile>) {
    setProfile((p) => ({ ...p, ...patch }));
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">INVOICE PREFERENCES</span>
          <h1>Invoice settings</h1>
          <p className="muted">
            Business details and payment instructions for your PDFs.
          </p>
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
      <div className="settings-layout">
        <section className="card">
          <form onSubmit={save}>
            <fieldset className="invoice-fieldset" disabled={loading || busy}>
              <div className="invoice-fields">
                <label className="invoice-wide">
                  Business name
                  <input
                    required
                    maxLength={150}
                    value={profile.business_name}
                    onChange={(e) => update({ business_name: e.target.value })}
                  />
                </label>
                <label className="invoice-wide">
                  Business address
                  <textarea
                    rows={3}
                    maxLength={1000}
                    value={profile.address}
                    onChange={(e) => update({ address: e.target.value })}
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    maxLength={200}
                    value={profile.email}
                    onChange={(e) => update({ email: e.target.value })}
                  />
                </label>
                <label>
                  Business phone
                  <input
                    type="tel"
                    maxLength={50}
                    value={profile.phone}
                    onChange={(e) => update({ phone: e.target.value })}
                  />
                </label>
                <label>
                  Payment due after (days)
                  <input
                    type="number"
                    min={0}
                    max={365}
                    step={1}
                    required
                    value={profile.default_due_days}
                    onChange={(e) =>
                      update({ default_due_days: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="invoice-wide">
                  Payment details
                  <textarea
                    rows={4}
                    maxLength={1500}
                    value={profile.payment_details}
                    onChange={(e) =>
                      update({ payment_details: e.target.value })
                    }
                    placeholder="Bank details or payment instructions"
                  />
                </label>
                <label className="invoice-wide">
                  Invoice footer
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={profile.footer}
                    onChange={(e) => update({ footer: e.target.value })}
                  />
                </label>
              </div>
              <button className="button primary" disabled={loading || busy}>
                <Save size={17} />
                {busy ? "Saving…" : "Save invoice settings"}
              </button>
            </fieldset>
          </form>
        </section>
        <div className="settings-column">
          <section className="card">
            <h2>WhatsApp integration</h2>
            <p className="invoice-help">
              {ready
                ? "API credentials are configured. Send a saved invoice from its details screen."
                : "API sending is not configured yet. You can download the PDF and attach it manually in WhatsApp."}
            </p>
            <p className="field-hint">
              Automatic sending requires a WhatsApp Business account and an
              approved invoice template. Credentials are kept in Vercel, not in
              this page.
            </p>
          </section>
          <section className="card">
            <h2>Customer privacy</h2>
            <p className="invoice-help">
              Customer information, notes, item descriptions, business settings
              and WhatsApp recipients are encrypted before storage.
            </p>
            <p className="field-hint">
              Export or remove customer details from an invoice’s details
              screen. Name filtering matches prefixes of first or last names.
              Financial amounts and dates remain available after redaction.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
