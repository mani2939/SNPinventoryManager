"use client";
import { useState } from "react";
import { Plus, Save } from "lucide-react";
import { api } from "@/lib/client";
import type { ProductType, Vendor } from "@/lib/types";

export function ConfigurationList({ kind, entries, busy, action }: {
  kind: "vendor" | "type";
  entries: (Vendor | ProductType)[];
  busy: string;
  action: (key: string, fn: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const isVendor = kind === "vendor";
  const title = isVendor ? "Vendor" : "Product type";
  const endpoint = isVendor ? "/api/vendors" : "/api/product-types";
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  function reset() { setEditing(null); setName(""); setCode(""); }
  return (
    <>
      <form className="catalog-form" onSubmit={e => {
        e.preventDefault();
        void action(kind, async () => {
          await api(endpoint, {
            method: editing ? "PATCH" : "POST",
            body: JSON.stringify({ ...(editing ? { id: editing } : {}), name,
              ...(isVendor ? { pseudo_code: code } : {}) }),
          });
          reset();
        }, `${title} ${editing ? "updated" : "added"}.`);
      }}>
        <label>
          {title} name
          <input value={name} onChange={e => setName(e.target.value)} required maxLength={100}
            placeholder={isVendor ? "e.g. Jaipur Jewellery House" : "e.g. Necklace sets"} />
        </label>
        {isVendor ? (
          <label>
            Vendor code
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              required minLength={3} maxLength={3} pattern="[A-Za-z0-9]{3}" placeholder="e.g. V01"
              title="Exactly three letters or digits" autoCapitalize="characters" />
          </label>
        ) : null}
        <div className="catalog-actions">
          <button className="button primary" disabled={!!busy}>
            {editing ? <Save size={17} /> : <Plus size={17} />}
            {editing ? `Save ${kind === "type" ? "product type" : "vendor"}` : `Add ${kind === "type" ? "product type" : "vendor"}`}
          </button>
          {editing ? <button type="button" className="button secondary" onClick={reset} disabled={!!busy}>Cancel edit</button> : null}
        </div>
      </form>
      {isVendor ? <p className="field-hint">
        Choose a unique three-character pseudonym unrelated to the vendor name. New barcodes use this code.
        Changing it keeps existing printed barcodes valid.
      </p> : <p className="field-hint">Archive a type to remove it from new entries while keeping existing products.</p>}
      <div className="vendor-list">
        {entries.length ? entries.map(entry => (
          <div key={entry.id} className="vendor-row">
            <div className="grow">
              <strong>{entry.name}</strong>
              {isVendor ? <code className="vendor-code">{(entry as Vendor).pseudo_code}</code> : null}
              <small>{entry.active ? "Available for new products" : "Archived · history preserved"}</small>
            </div>
            <div className="catalog-row-actions">
              <button type="button" className="text-button" aria-label={`Edit ${entry.name}`} disabled={!!busy}
                onClick={() => { setEditing(entry.id); setName(entry.name); setCode(isVendor ? (entry as Vendor).pseudo_code : ""); }}>
                Edit
              </button>
              <button type="button" className="text-button" aria-label={`${entry.active ? "Archive" : "Restore"} ${entry.name}`}
                disabled={!!busy} onClick={() => void action(entry.id,
                  () => api(endpoint, {method:"PATCH",body:JSON.stringify({id:entry.id,active:!entry.active})}),
                  `${title} ${entry.active ? "archived. Existing entries are preserved." : "restored."}`)}>
                {entry.active ? "Archive" : "Restore"}
              </button>
            </div>
          </div>
        )) : <p className="empty-small">No {isVendor ? "vendors" : "product types"} yet. Add one above.</p>}
      </div>
    </>
  );
}
