"use client";
import { useEffect, useRef, useState } from "react";
import { ScanBarcode, Camera, X } from "lucide-react";
import { skuSchema } from "@/lib/validation";
export function BarcodeLookup({
  onLookup,
  clear,
  active,
}: {
  onLookup: (sku: string) => void;
  clear: () => void;
  active: string;
}) {
  const [value, setValue] = useState("");
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<{ stop: () => void } | null>(null);
  const generation = useRef(0);
  function stop() {
    generation.current++;
    controls.current?.stop();
    controls.current = null;
    const stream = video.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (video.current) video.current.srcObject = null;
    setCamera(false);
    setBusy(false);
  }
  useEffect(
    () => () => {
      generation.current++;
      controls.current?.stop();
      const stream = video.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  function lookup(text: string) {
    const sku = text.trim().toUpperCase();
    if (!sku) return;
    setValue(sku);
    if (!skuSchema.safeParse(sku).success) {
      setError(
        "Scan a Shapes & Pieces product barcode or enter its complete SKU.",
      );
      return;
    }
    setError("");
    onLookup(sku);
  }
  async function start() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Camera scanning needs HTTPS and a supported browser. You can still use a handheld scanner or type the SKU.",
      );
      return;
    }
    const current = ++generation.current;
    setCamera(true);
    setBusy(true);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (current !== generation.current) return;
      const reader = new BrowserMultiFormatReader();
      let found = false;
      const c = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        video.current!,
        (result, _error, control) => {
          if (result && !found && current === generation.current) {
            found = true;
            const text = result.getText();
            control.stop();
            stop();
            lookup(text);
          }
        },
      );
      if (current !== generation.current || found) c.stop();
      else {
        controls.current = c;
        setBusy(false);
      }
    } catch (e) {
      if (current === generation.current) {
        stop();
        setError(
          e instanceof Error && e.name === "NotAllowedError"
            ? "Camera access was denied. Allow camera access or use a handheld scanner."
            : "Unable to open the camera. Use a handheld scanner or enter the SKU.",
        );
      }
    }
  }
  return (
    <section className="scan-card">
      <form
        className="scan-form"
        onSubmit={(e) => {
          e.preventDefault();
          lookup(value);
        }}
      >
        <span className="scan-icon">
          <ScanBarcode size={23} />
        </span>
        <label className="grow">
          Scan barcode or enter SKU
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Click here, scan, then press Enter"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </label>
        <button className="button primary">Find product</button>
        <button
          type="button"
          className="button secondary"
          onClick={() => void start()}
          disabled={camera}
        >
          <Camera size={17} />
          Use camera
        </button>
        {active ? (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setValue("");
              clear();
            }}
          >
            Clear barcode
          </button>
        ) : null}
      </form>
      <p className="field-hint">
        USB and Bluetooth scanners work as keyboards. The barcode contains the
        full SKU.
      </p>
      <div className="camera-panel" hidden={!camera}>
        <video
          ref={video}
          muted
          playsInline
          aria-label="Barcode scanner camera"
        />
        <p>
          {busy
            ? "Opening camera…"
            : "Hold the label steady in front of the camera."}
        </p>
        <button className="button secondary" type="button" onClick={stop}>
          <X size={16} />
          Close camera
        </button>
      </div>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
