import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  createHmac,
  hkdfSync,
} from "node:crypto";
export class CustomerEncryptionError extends Error {}
function keys() {
  const current = process.env.CUSTOMER_DATA_ENCRYPTION_KEY;
  if (!current)
    throw new CustomerEncryptionError(
      "Set CUSTOMER_DATA_ENCRYPTION_KEY to a base64-encoded 32-byte key before using invoicing.",
    );
  const values = [current];
  if (process.env.CUSTOMER_DATA_PREVIOUS_KEYS) {
    try {
      const old = JSON.parse(process.env.CUSTOMER_DATA_PREVIOUS_KEYS);
      if (!Array.isArray(old) || old.some((v) => typeof v !== "string"))
        throw new Error();
      values.push(...old);
    } catch {
      throw new CustomerEncryptionError(
        "CUSTOMER_DATA_PREVIOUS_KEYS must be a JSON array of base64 keys.",
      );
    }
  }
  return values.map((value) => {
    const key = Buffer.from(value, "base64");
    if (key.length !== 32 || key.toString("base64") !== value)
      throw new CustomerEncryptionError(
        "Customer encryption keys must be canonical base64-encoded 32-byte keys.",
      );
    return {
      id: createHash("sha256").update(key).digest("hex").slice(0, 16),
      key,
    };
  });
}
export function assertCustomerEncryption() {
  keys();
}
export function encryptCustomer(value: unknown, context: string): string {
  const { id, key } = keys()[0],
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    id,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
export function decryptCustomer<T>(value: string, context: string): T {
  const parts = value.split(".");
  if (parts.length !== 5 || parts[0] !== "v1")
    throw new CustomerEncryptionError("Customer data format is invalid.");
  const key = keys().find((k) => k.id === parts[1]);
  if (!key)
    throw new CustomerEncryptionError(
      "The key for this customer data is unavailable. Restore the matching previous encryption key.",
    );
  try {
    const iv = Buffer.from(parts[2], "base64url"),
      tag = Buffer.from(parts[3], "base64url");
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key.key, iv);
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(parts[4], "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    throw new CustomerEncryptionError(
      "Customer data could not be authenticated.",
    );
  }
}
function digest(value: string, key: Buffer, purpose: string) {
  const derived = hkdfSync(
    "sha256",
    key,
    Buffer.alloc(0),
    `snp:${purpose}`,
    32,
  );
  return createHmac("sha256", Buffer.from(derived)).update(value).digest("hex");
}
export function payloadFingerprint(value: unknown) {
  const { id, key } = keys()[0];
  return `${id}:${digest(JSON.stringify(value), key, "invoice-idempotency")}`;
}
export function matchesFingerprint(value: unknown, fingerprint: string) {
  return keys().some(
    (k) =>
      fingerprint ===
      `${k.id}:${digest(JSON.stringify(value), k.key, "invoice-idempotency")}`,
  );
}
function words(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-GB")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}
export function nameIndex(value: string) {
  const { id, key } = keys()[0];
  const tokens = new Set<string>();
  for (const word of words(value)) {
    for (let n = 1; n <= word.length; n++)
      tokens.add(`${id}:${digest(word.slice(0, n), key, "name-search")}`);
  }
  return [...tokens];
}
export function nameQueryIndexes(value: string) {
  return keys().map(({ id, key }) =>
    words(value).map((word) => `${id}:${digest(word, key, "name-search")}`),
  );
}
export function recipientFingerprint(value: string) {
  const { key } = keys()[0];
  return digest(value, key, "recipient");
}
