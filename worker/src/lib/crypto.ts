/**
 * Encryption + hashing helpers built on WebCrypto (available in Workers).
 *
 * Twilio credentials are encrypted at rest with AES-GCM. The key comes from the
 * `ENC_KEY` secret (base64 of 32 random bytes). Ciphertext is stored as
 * base64(iv[12] || ciphertext).
 */

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(encKeyB64: string): Promise<CryptoKey> {
  const raw = b64decode(encKeyB64);
  if (raw.length !== 32) {
    throw new Error("ENC_KEY must be base64 of exactly 32 bytes");
  }
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encrypt(encKeyB64: string, plaintext: string): Promise<string> {
  const key = await importKey(encKeyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  const combined = new Uint8Array(iv.length + ct.length);
  combined.set(iv, 0);
  combined.set(ct, iv.length);
  return b64encode(combined);
}

export async function decrypt(encKeyB64: string, blob: string): Promise<string> {
  const key = await importKey(encKeyB64);
  const combined = b64decode(blob);
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

/** SHA-256 hex digest — used to store ingest-token hashes (token is high-entropy). */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Generate a URL-safe high-entropy token (32 random bytes, base64url). */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return b64encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** HMAC-SHA256 hex, used for signing session cookies. */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
