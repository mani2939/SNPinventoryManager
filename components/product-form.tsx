"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ImagePlus,
  Save,
  IndianRupee,
  Check,
  Package,
  Trash2,
} from "lucide-react";
import { api, money, today } from "@/lib/client";
import { calculatePricing } from "@/lib/pricing";
import { BarcodePreview } from "./barcode-preview";
import { reservationSchema } from "@/lib/validation";
import type { SkuReservation, Product, Vendor, Settings } from "@/lib/types";
type Form = {
  item_name: string;
  description: string;
  vendor_id: string;
  entry_date: string;
  price_inr: string;
  quantity: string;
  discount_percent: string;
  shipping_percent: string;
};
const blank = (): Form => ({
  item_name: "",
  description: "",
  vendor_id: "",
  entry_date: today(),
  price_inr: "",
  quantity: "1",
  discount_percent: "0",
  shipping_percent: "0",
});
async function resizePhoto(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPG, PNG or WebP photo.");
  if (file.size > 15 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 15 MB.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Photo resizing is unavailable in this browser.");
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const result = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("Could not prepare the photo.")),
      "image/webp",
      0.85,
    ),
  );
  if (result.type !== "image/webp")
    throw new Error(
      "Your browser does not support WebP uploads. Try a current browser.",
    );
  if (result.size > 2097152)
    throw new Error(
      "Photo is still too large after resizing. Choose a smaller image.",
    );
  return result;
}
export function ProductForm({ initial }: { initial?: Product }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(() =>
    initial
      ? {
          item_name: initial.item_name,
          description: initial.description,
          vendor_id: initial.vendor_id,
          entry_date: initial.entry_date,
          price_inr: String(initial.price_inr),
          quantity: String(initial.quantity),
          discount_percent: String(initial.discount_percent),
          shipping_percent: String(initial.shipping_percent),
        }
      : blank(),
  );
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [rate, setRate] = useState<number | null>(
    initial?.exchange_rate || null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoKey, setPhotoKey] = useState(initial?.photo_key || null);
  const [preview, setPreview] = useState(
    initial?.photo_key ? `/api/products/${initial.id}/photo` : "",
  );
  const [reservation, setReservation] = useState<SkuReservation | null>(null);
  const [skuBusy, setSkuBusy] = useState(false);
  const [skuError, setSkuError] = useState("");
  const [skuRetry, setSkuRetry] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const blobUrl = useRef("");
  useEffect(() => {
    let live = true;
    api<{ vendors: Vendor[]; settings: Settings }>("/api/config")
      .then((v) => {
        if (live) {
          setVendors(v.vendors);
          if (!initial) setRate(v.settings.exchange_rate);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [initial]);
  useEffect(
    () => () => {
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    },
    [],
  );
  function update(name: keyof Form, value: string) {
    setForm((f) => ({ ...f, [name]: value }));
  }
  const numbers = {
    price_inr: Number(form.price_inr) || 0,
    quantity: Math.max(1, Number(form.quantity) || 1),
    discount_percent: Number(form.discount_percent) || 0,
    shipping_percent: Number(form.shipping_percent) || 0,
    exchange_rate: rate || 1,
  };
  const safe =
    Object.values(numbers).every(Number.isFinite) &&
    numbers.discount_percent >= 0 &&
    numbers.discount_percent <= 100 &&
    numbers.shipping_percent >= 0 &&
    numbers.quantity >= 1;
  const totals = calculatePricing(
    safe
      ? numbers
      : {
          price_inr: 0,
          quantity: 1,
          discount_percent: 0,
          shipping_percent: 0,
          exchange_rate: 1,
        },
  );
  const reservationInput = {
    vendor_id: form.vendor_id,
    price_inr: Number(form.price_inr),
    quantity: Number(form.quantity),
    discount_percent: Number(form.discount_percent),
    shipping_percent: Number(form.shipping_percent),
  };
  const canReserve =
    !loading && !!rate && reservationSchema.safeParse(reservationInput).success;
  const identityFingerprint = JSON.stringify([
    form.vendor_id,
    totals.unit_gbp,
    canReserve,
  ]);
  const reservationReady =
    !!reservation &&
    reservation.vendor_id === form.vendor_id &&
    reservation.unit_gbp === totals.unit_gbp;
  useEffect(() => {
    if (initial) return;
    if (!canReserve) {
      setReservation(null);
      setSkuBusy(false);
      return;
    }
    if (reservationReady) return;
    const controller = new AbortController();
    setSkuBusy(true);
    setSkuError("");
    setReservation(null);
    const timer = setTimeout(() => {
      api<SkuReservation>("/api/skus", {
        method: "POST",
        body: JSON.stringify(reservationInput),
        signal: controller.signal,
      })
        .then((r) => {
          if (!controller.signal.aborted) {
            setReservation(r);
            setRate(r.exchange_rate);
          }
        })
        .catch((e) => {
          if (e.name !== "AbortError") setSkuError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSkuBusy(false);
        });
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // The cost and vendor define the SKU; other detail edits do not reserve new numbers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityFingerprint, initial, skuRetry]);
  async function selectPhoto(file?: File) {
    if (!file) return;
    setPhotoBusy(true);
    setError("");
    try {
      const blob = await resizePhoto(file);
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      blobUrl.current = URL.createObjectURL(blob);
      setPreview(blobUrl.current);
      setPhoto(blob);
      setPhotoKey(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!initial && (!reservationReady || skuBusy))
        throw new Error(
          "Wait for the SKU and barcode to be generated before saving.",
        );
      let key = photoKey;
      if (photo) {
        const upload = await api<{
          key: string;
          url: string;
          headers: Record<string, string>;
        }>("/api/uploads", {
          method: "POST",
          body: JSON.stringify({ size: photo.size }),
        });
        const r = await fetch(upload.url, {
          method: "PUT",
          headers: upload.headers,
          body: photo,
        });
        if (!r.ok)
          throw new Error(
            "Photo upload failed. Check storage permissions and try again.",
          );
        key = upload.key;
        setPhotoKey(key);
        setPhoto(null);
      }
      const body = {
        ...form,
        ...numbers,
        photo_key: key,
        updated_at: initial?.updated_at,
        sku_token: reservation?.token,
      };
      await api(initial ? `/api/products/${initial.id}` : "/api/products", {
        method: initial ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      router.push("/inventory?saved=1");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const numericField = (
    name: keyof Form,
    label: string,
    options: { min: number; max: number; step: string; prefix?: string },
  ) => (
    <label>
      {label}
      <div className="input-affix">
        {options.prefix ? <span>{options.prefix}</span> : null}
        <input
          type="number"
          value={form[name]}
          onChange={(e) => update(name, e.target.value)}
          min={options.min}
          max={options.max}
          step={options.step}
          required
        />
      </div>
    </label>
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">THE COLLECTION</span>
          <h1>{initial ? "Edit product" : "Add a new piece"}</h1>
          <p className="muted">Capture the details. See the landed cost.</p>
        </div>
        <Link className="button secondary" href="/inventory">
          View inventory
        </Link>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && (!rate || !vendors.some((v) => v.active)) ? (
        <div className="notice">
          Add an active vendor and your exchange rate in{" "}
          <Link href="/settings">Settings</Link> before saving a product.
        </div>
      ) : null}
      <form onSubmit={save} className="product-layout">
        <div className="product-fields">
          <section className="card">
            <div className="section-title">
              <span className="section-icon">
                <Package size={19} />
              </span>
              <div>
                <h2>Product details</h2>
                <p>Give this piece a place in your collection.</p>
              </div>
            </div>
            <div className="details-grid">
              <div>
                <label className="photo-label">
                  Product photo <span className="optional">optional</span>
                </label>
                <button
                  type="button"
                  className={"photo-upload " + (preview ? "has-photo" : "")}
                  onClick={() => fileRef.current?.click()}
                  disabled={photoBusy || busy}
                  aria-label="Upload product photo"
                >
                  {preview ? (
                    <Image
                      src={preview}
                      alt="Product photo preview"
                      fill
                      unoptimized
                      sizes="240px"
                    />
                  ) : (
                    <>
                      <ImagePlus size={34} />
                      <strong>
                        {photoBusy ? "Preparing photo…" : "Add a product photo"}
                      </strong>
                      <span>JPG, PNG or WebP · up to 15 MB</span>
                    </>
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={(e) => {
                    void selectPhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                {preview ? (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setPhoto(null);
                      setPhotoKey(null);
                      setPreview("");
                    }}
                  >
                    <Trash2 size={14} />
                    Remove photo
                  </button>
                ) : null}
              </div>
              <div className="field-stack">
                <label>
                  Item name
                  <input
                    value={form.item_name}
                    onChange={(e) => update("item_name", e.target.value)}
                    maxLength={200}
                    placeholder="e.g. Pearl & Kundan necklace set"
                    required
                  />
                </label>
                <div className="field-grid">
                  <label>
                    Vendor
                    <select
                      aria-label="Vendor"
                      value={form.vendor_id}
                      onChange={(e) => update("vendor_id", e.target.value)}
                      required
                      disabled={loading}
                    >
                      <option value="">
                        {loading ? "Loading vendors…" : "Select a vendor"}
                      </option>
                      {vendors
                        .filter((v) => v.active || v.id === initial?.vendor_id)
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                            {!v.active ? " (archived)" : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Date
                    <input
                      type="date"
                      value={form.entry_date}
                      required
                      onChange={(e) => update("entry_date", e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  Item description
                  <textarea
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                    maxLength={2000}
                    rows={3}
                    placeholder="Materials, colour, finish or other details…"
                  />
                </label>
              </div>
            </div>
          </section>
          <section className="card">
            <div className="section-title">
              <span className="section-icon">
                <IndianRupee size={19} />
              </span>
              <div>
                <h2>Purchase & shipping</h2>
                <p>Enter purchase amounts in Indian rupees.</p>
              </div>
            </div>
            <div className="field-grid">
              {numericField("price_inr", "Price per piece (INR)", {
                min: 0.01,
                max: 10000000,
                step: "0.01",
                prefix: "₹",
              })}
              {numericField("quantity", "Quantity", {
                min: 1,
                max: 100000,
                step: "1",
              })}
              {numericField("discount_percent", "Discount (%)", {
                min: 0,
                max: 100,
                step: "0.01",
                prefix: "%",
              })}
              {numericField("shipping_percent", "Shipping (%)", {
                min: 0,
                max: 1000,
                step: "0.01",
                prefix: "%",
              })}
            </div>
            <p className="field-hint">
              Shipping is calculated on the total after discount.
            </p>
          </section>
          <section className="card sku-card">
            <div className="section-title">
              <span className="section-icon">
                <Package size={19} />
              </span>
              <div>
                <h2>SKU & barcode</h2>
                <p>
                  {initial
                    ? "Your saved product identifier."
                    : "Generated automatically from vendor and GBP cost per piece."}
                </p>
              </div>
            </div>
            <label>
              SKU code
              <input
                readOnly
                value={
                  initial?.sku || (reservationReady ? reservation!.sku : "")
                }
                placeholder={
                  skuBusy
                    ? "Generating SKU…"
                    : "Enter vendor and purchase costs first"
                }
              />
            </label>
            {initial?.barcode_svg && initial.sku ? (
              <BarcodePreview sku={initial.sku} svg={initial.barcode_svg} />
            ) : reservationReady ? (
              <BarcodePreview
                sku={reservation!.sku}
                svg={reservation!.barcode_svg}
              />
            ) : (
              <p className="field-hint" role="status">
                {skuBusy
                  ? "Reserving a unique SKU and saving its barcode…"
                  : "The barcode will appear here before you save the product."}
              </p>
            )}
            {skuError ? (
              <>
                <p role="alert" className="error">
                  {skuError}
                </p>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setSkuRetry((n) => n + 1)}
                >
                  Retry barcode
                </button>
              </>
            ) : null}
            <p className="field-hint">
              BACKGROUND encodes digits 1–9, 0. Z represents the decimal point;
              pence always have two digits.
              {initial
                ? " This SKU remains fixed when you edit the product."
                : " The SKU and barcode are reserved before product saving."}
            </p>
            {initial?.sku ? (
              <Link
                className="button secondary"
                href={`/products/${initial.id}/labels`}
              >
                Print barcode labels
              </Link>
            ) : null}
            {initial && !initial.sku ? (
              <p className="notice">
                Run the SKU backfill to assign a barcode to this older product.
              </p>
            ) : null}
          </section>
        </div>
        <aside className="cost-summary">
          <div className="cost-summary-top">
            <span className="eyebrow">LANDED COST</span>
            <h2>Every detail adds up.</h2>
          </div>
          <dl className="cost-lines">
            <div>
              <dt>Total before discount</dt>
              <dd>{money(totals.total_before_discount, "INR")}</dd>
            </div>
            <div>
              <dt>Discount ({form.discount_percent || 0}%)</dt>
              <dd className="discount-value">
                −
                {money(
                  totals.total_before_discount - totals.total_after_discount,
                  "INR",
                )}
              </dd>
            </div>
            <div>
              <dt>Total after discount</dt>
              <dd>{money(totals.total_after_discount, "INR")}</dd>
            </div>
            <div>
              <dt>Shipping ({form.shipping_percent || 0}%)</dt>
              <dd>{money(totals.shipping_amount, "INR")}</dd>
            </div>
            <div className="final-line">
              <dt>Final total · INR</dt>
              <dd>{money(totals.final_total_inr, "INR")}</dd>
            </div>
          </dl>
          <div className="exchange-note">
            {rate
              ? `£1 = ₹${rate} · ${initial ? "saved" : "current"} rate`
              : "Set your exchange rate in Settings"}
          </div>
          <div className="gbp-cost">
            <span>Cost per piece · GBP</span>
            <strong>{rate ? money(totals.unit_gbp, "GBP") : "—"}</strong>
            <small>
              Batch total: {rate ? money(totals.batch_gbp, "GBP") : "—"}
            </small>
          </div>
          <div className="retail-cost">
            <div>
              <span>Retail per piece</span>
              <small>3× GBP cost</small>
            </div>
            <strong>{rate ? money(totals.retail_gbp, "GBP") : "—"}</strong>
          </div>
          <button
            className="button primary full-width"
            disabled={
              busy ||
              photoBusy ||
              loading ||
              (!initial && (!reservationReady || skuBusy)) ||
              !rate ||
              !vendors.some((v) => v.active || v.id === initial?.vendor_id)
            }
          >
            <Save size={17} />
            {busy
              ? "Saving product…"
              : initial
                ? "Save changes"
                : "Save product"}
          </button>
          <p className="summary-foot">
            <Check size={14} /> Exchange rate saved with this entry
          </p>
        </aside>
      </form>
    </>
  );
}
