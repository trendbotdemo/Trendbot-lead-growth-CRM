import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

const key = createHash("sha256").update(`enc:${env.APP_SECRET}`).digest();

/** AES-256-GCM — used for OAuth tokens at rest. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

/** Signed, expiring payload (OAuth state etc.). */
export function sign(payload: object, ttlSec = 600): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlSec * 1000 })).toString("base64url");
  const mac = createHmac("sha256", env.APP_SECRET).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verify<T>(token: string): T | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", env.APP_SECRET).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const data = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp: number };
  return data.exp > Date.now() ? data : null;
}
