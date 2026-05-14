/**
 * auth-utils.ts
 *
 * Pure crypto and password utilities with NO Next.js or Prisma dependencies.
 * Importable from tests, seed scripts, and server code alike.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

// ---------------------------------------------------------------------------
// Session token (HMAC-signed, base64url)
// ---------------------------------------------------------------------------

export type SessionPayload = {
  userId: number;
  username: string;
  role: "admin" | "user";
  exp: number;
};

function base64Url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function getSecret(): string {
  return process.env.AUTH_SECRET || "development-only-auth-secret";
}

export function signPayload(encodedPayload: string): string {
  return createHmac("sha256", getSecret()).update(encodedPayload).digest("base64url");
}

export function createSessionToken(payload: Omit<SessionPayload, "exp">): string {
  const full: SessionPayload = {
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
  };
  const encodedPayload = base64Url(JSON.stringify(full));
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

/**
 * Verify HMAC signature + expiry only (no DB lookup).
 * Returns the decoded payload, or null if invalid/expired.
 */
export function verifyTokenSignature(token?: string): SessionPayload | null {
  if (!token) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expected = signPayload(encodedPayload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as SessionPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Password utilities
// ---------------------------------------------------------------------------

const SALT_ROUNDS = 12;

// Unambiguous characters — no 0/O, 1/l/I
const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function generatePassword(length = 12): string {
  const bytes = randomBytes(length);
  return Array.from(bytes)
    .map((b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length])
    .join("");
}

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
