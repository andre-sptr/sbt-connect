/**
 * tests/user-service.test.mjs
 *
 * Tests for pure password helpers in auth-utils.ts:
 *   - generatePassword: length, charset, uniqueness
 *   - verifyPassword: correct and incorrect plaintext vs bcrypt hash
 *
 * Imports auth-utils.ts directly — no Next.js or Prisma deps.
 */

import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";

const { generatePassword, verifyPassword } = await import("../src/lib/auth-utils.ts");

// ---------------------------------------------------------------------------
// generatePassword
// ---------------------------------------------------------------------------

const VALID_CHARS = new Set(
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789".split("")
);

test("generatePassword(12) returns a string of length 12", () => {
  const pw = generatePassword(12);
  assert.equal(typeof pw, "string");
  assert.equal(pw.length, 12);
});

test("generatePassword(20) returns a string of length 20", () => {
  assert.equal(generatePassword(20).length, 20);
});

test("generatePassword uses only unambiguous characters (no 0 O 1 l I)", () => {
  for (let i = 0; i < 50; i++) {
    const pw = generatePassword(32);
    for (const ch of pw) {
      assert.ok(VALID_CHARS.has(ch), `Character "${ch}" is not in the allowed charset`);
    }
  }
});

test("generatePassword produces different values on successive calls", () => {
  const a = generatePassword(12);
  const b = generatePassword(12);
  assert.notEqual(a, b, "two consecutive passwords should almost always differ");
});

// ---------------------------------------------------------------------------
// verifyPassword
// ---------------------------------------------------------------------------

test("verifyPassword returns true for correct plaintext", async () => {
  const plain = "MySecret123";
  const hash = await bcrypt.hash(plain, 4); // low rounds for test speed
  assert.equal(await verifyPassword(plain, hash), true);
});

test("verifyPassword returns false for incorrect plaintext", async () => {
  const hash = await bcrypt.hash("MySecret123", 4);
  assert.equal(await verifyPassword("WrongPassword!", hash), false);
});

test("verifyPassword returns false for empty string against real hash", async () => {
  const hash = await bcrypt.hash("RealPassword", 4);
  assert.equal(await verifyPassword("", hash), false);
});
