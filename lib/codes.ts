import { randomBytes } from "node:crypto";

/** No 0/O/1/I so codes are easy to read aloud and type. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 4;

export function randomCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export function normalizeCode(input: string): string | null {
  const c = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.length !== CODE_LENGTH) return null;
  for (const ch of c) if (!CODE_ALPHABET.includes(ch)) return null;
  return c;
}

export function randomId(bytes = 8): string {
  return randomBytes(bytes).toString("base64url");
}

export function randomToken(): string {
  return randomBytes(24).toString("base64url");
}
