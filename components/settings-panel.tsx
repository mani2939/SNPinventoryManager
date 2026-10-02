"use client";
import { useState, useEffect } from "react";
import { Store, ArrowRightLeft, Plus, Save } from "lucide-react";
import { api } from "@/lib/client";
import type { Vendor, Settings } from "@/lib/types";
export function SettingsPanel() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [rate, setRate] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function load() {
    const v = await api<{ vendors: Vendor[]; settings: Settings }>(
      "/api/config",
    );
    setVendors(v.vendors);
    setRate(v.settings.exchange_rate ? String(v.settings.exchange_rate) : "");
  }
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function action(
    kind: string,
    fn: () => Promise<unknown>,
    message: string,
  ) {
    setBusy(kind);
    setError("");
    setSuccess("");
    try {
      await fn();
      await load();
      setSuccess(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">WORKSPACE PREFERENCES</span>
          <h1>Settings</h1>
          <p className="muted">The foundations of your product pricing.</p>
        </div>
      </div>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="success">
          {success}
        </p>
      ) : null}
      {loading ? (
        <div className="card" role="status">
          Loading settings…
        </div>
      ) : (
        <div className="settings-layout">
          <section className="card">
            <div className="section-title">
              <span className="section-icon">
                <ArrowRightLeft size={19} />
              </span>
              <div>
                <h2>Exchange rate</h2>
                <p>Convert your purchase costs to pounds.</p>
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(
                  "rate",
                  () =>
                    api("/api/config", {
                      method: "PATCH",
                      body: JSON.stringify({ exchange_rate: Number(rate) }),
                    }),
                  "Exchange rate updated. Existing products keep their saved rate.",
                );
              }}
            >
              <div className="exchange-display">
                <span>£1</span>
                <span>=</span>
                <span>₹</span>
                <input
                  aria-label="INR per 1 GBP"
                  type="number"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  step="0.0001"
                  min="0.0001"
                  max="100000"
                  required
                  placeholder="Enter rate"
                />
              </div>
              <p className="field-hint">
                INR per £1 · Enter your purchase exchange rate.
              </p>
              <div className="rule-note">
                <strong>Your pricing rule</strong>
                <p>
                  Final INR total ÷ quantity ÷ exchange rate = GBP cost per
                  piece.
                  <br />
                  Retail price = GBP cost per piece × 3.
                </p>
              </div>
              <button className="button primary" disabled={!!busy}>
                <Save size={17} />
                {busy === "rate" ? "Saving…" : "Save exchange rate"}
              </button>
            </form>
          </section>
          <section className="card">
            <div className="section-title">
              <span className="section-icon">
                <Store size={19} />
              </span>
              <div>
                <h2>Vendors</h2>
                <p>Available in the product entry dropdown.</p>
              </div>
            </div>
            <form
              className="vendor-form"
              onSubmit={(e) => {
                e.preventDefault();
                void action(
                  "vendor",
                  async () => {
                    await api("/api/vendors", {
                      method: "POST",
                      body: JSON.stringify({ name }),
                    });
                    setName("");
                  },
                  "Vendor added.",
                );
              }}
            >
              <label className="grow">
                Vendor name
                <input
                  placeholder="e.g. Jaipur Jewellery House"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={100}
                />
              </label>
              <button className="button primary" disabled={!!busy}>
                <Plus size={17} />
                Add vendor
              </button>
            </form>
            <div className="vendor-list">
              {vendors.length ? (
                vendors.map((v) => (
                  <div key={v.id} className="vendor-row">
                    <span className="vendor-initial">
                      {v.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="grow">
                      <strong>{v.name}</strong>
                      <small>
                        {v.active
                          ? "Available for new products"
                          : "Archived · history preserved"}
                      </small>
                    </div>
                    <button
                      className="text-button"
                      disabled={!!busy}
                      onClick={() =>
                        void action(
                          v.id,
                          () =>
                            api("/api/vendors", {
                              method: "PATCH",
                              body: JSON.stringify({
                                id: v.id,
                                active: !v.active,
                              }),
                            }),
                          v.active
                            ? "Vendor archived. Existing entries are preserved."
                            : "Vendor restored.",
                        )
                      }
                    >
                      {busy === v.id
                        ? "Updating…"
                        : v.active
                          ? "Archive"
                          : "Restore"}
                    </button>
                  </div>
                ))
              ) : (
                <p className="empty-small">
                  No vendors yet. Add your first supplier above.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
