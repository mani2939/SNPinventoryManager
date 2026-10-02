import "server-only";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { demoMode } from "./auth";
import { HttpError } from "./http";
const maxSize = 2 * 1024 * 1024;
function s3() {
  const endpoint = process.env.PEASOUP_ENDPOINT,
    region = process.env.PEASOUP_REGION,
    bucket = process.env.PEASOUP_BUCKET,
    accessKeyId = process.env.PEASOUP_ACCESS_KEY_ID,
    secretAccessKey = process.env.PEASOUP_SECRET_ACCESS_KEY;
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey)
    throw new Error("Configure PeaSoup storage credentials.");
  return {
    client: new S3Client({
      endpoint,
      region,
      forcePathStyle: process.env.PEASOUP_FORCE_PATH_STYLE !== "false",
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
    bucket,
  };
}
export const validKey = (key: string) =>
  /^products\/[0-9a-f-]{36}\.webp$/.test(key);
function localPath(key: string) {
  if (!validKey(key)) throw new HttpError("Invalid photo key.");
  return path.join(process.cwd(), ".demo-data", key);
}
export async function prepareUpload(size: number) {
  if (size <= 0 || size > maxSize)
    throw new HttpError("Photo must be under 2 MB after resizing.");
  const key = `products/${randomUUID()}.webp`;
  if (demoMode())
    return {
      key,
      url: `/api/uploads?key=${encodeURIComponent(key)}`,
      headers: { "Content-Type": "image/webp" },
    };
  const { client, bucket } = s3();
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: "image/webp",
      ContentLength: size,
    }),
    { expiresIn: 300 },
  );
  return { key, url, headers: { "Content-Type": "image/webp" } };
}
function isWebp(bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  return (
    b.subarray(0, 4).toString() === "RIFF" &&
    b.subarray(8, 12).toString() === "WEBP"
  );
}
export async function saveDemoPhoto(key: string, bytes: Buffer) {
  if (!demoMode()) throw new HttpError("Local photo storage is disabled.", 403);
  if (bytes.length > maxSize || !isWebp(bytes))
    throw new HttpError("Upload a valid WebP photo under 2 MB.");
  const p = localPath(key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, bytes, { flag: "wx" });
}
export async function verifyPhoto(key: string) {
  if (!validKey(key)) throw new HttpError("Invalid photo key.");
  if (demoMode()) {
    const b = await readFile(localPath(key));
    if (!isWebp(b) || b.length > maxSize) throw new HttpError("Invalid photo.");
    return;
  }
  const { client, bucket } = s3();
  const head = await client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (
    !head.ContentLength ||
    head.ContentLength > maxSize ||
    head.ContentType !== "image/webp"
  )
    throw new HttpError("Photo upload is invalid. Upload again.");
  const r = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key, Range: "bytes=0-11" }),
  );
  if (!r.Body || !isWebp(await r.Body.transformToByteArray()))
    throw new HttpError("Photo is not a valid WebP image.");
}
export async function photoResponse(key: string) {
  if (demoMode())
    return new Response(new Uint8Array(await readFile(localPath(key))), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
      },
    });
  const { client, bucket } = s3();
  const r = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (!r.Body) throw new HttpError("Photo not found.", 404);
  return new Response(r.Body.transformToWebStream(), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
    },
  });
}
export async function removePhoto(key: string) {
  if (demoMode()) return; // Local demo files are removed when .demo-data is reset.
  const { client, bucket } = s3();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
