/**
 * tests/auth.test.mjs
 *
 * Tests for auth-utils: token creation and signature verification.
 * Imports auth-utils.ts directly — no Next.js or Prisma deps.
 */

import assert from "node:assert/strict";
import test from "node:test";

const { createSessionToken, verifyTokenSignature, signPayload } = await import("../src/lib/auth-utils.ts");
process.env.AUTH_SECRET = "test-auth-secret-at-least-32-characters";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validPayload() {
  return { userId: 1, username: "testadmin", role: "admin" };
}

function withTemporaryAuthSecret(value, callback) {
  const previous = process.env.AUTH_SECRET;
  if (value === undefined) {
    delete process.env.AUTH_SECRET;
  } else {
    process.env.AUTH_SECRET = value;
  }
  try {
    return callback();
  } finally {
    if (previous === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = previous;
    }
  }
}

// ---------------------------------------------------------------------------
// Token structure
// ---------------------------------------------------------------------------

test("createSessionToken returns a two-part dot-separated string", () => {
  const token = createSessionToken(validPayload());
  const parts = token.split(".");
  assert.equal(parts.length, 2, "token should have exactly two parts separated by '.'");
  assert.ok(parts[0].length > 0, "payload part should not be empty");
  assert.ok(parts[1].length > 0, "signature part should not be empty");
});

test("createSessionToken embeds userId, username, role and a future exp", () => {
  const token = createSessionToken(validPayload());
  const [encodedPayload] = token.split(".");
  const decoded = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  assert.equal(decoded.userId, 1);
  assert.equal(decoded.username, "testadmin");
  assert.equal(decoded.role, "admin");
  assert.ok(decoded.exp > Date.now(), "exp should be in the future");
});

test("createSessionToken rejects a missing AUTH_SECRET", () => {
  withTemporaryAuthSecret(undefined, () => {
    assert.throws(
      () => createSessionToken(validPayload()),
      /AUTH_SECRET must be configured/
    );
  });
});

test("createSessionToken rejects the development fallback secret", () => {
  withTemporaryAuthSecret("development-only-auth-secret", () => {
    assert.throws(
      () => createSessionToken(validPayload()),
      /AUTH_SECRET must be configured/
    );
  });
});

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

test("verifyTokenSignature accepts a freshly-created valid token", () => {
  const token = createSessionToken(validPayload());
  const result = verifyTokenSignature(token);
  assert.ok(result !== null, "valid token should be accepted");
  assert.equal(result.userId, 1);
  assert.equal(result.username, "testadmin");
  assert.equal(result.role, "admin");
});

test("verifyTokenSignature rejects undefined", () => {
  assert.equal(verifyTokenSignature(undefined), null);
});

test("verifyTokenSignature rejects empty string", () => {
  assert.equal(verifyTokenSignature(""), null);
});

test("verifyTokenSignature rejects token with no dot separator", () => {
  assert.equal(verifyTokenSignature("nodotsinhere"), null);
});

test("verifyTokenSignature rejects token with tampered signature", () => {
  const token = createSessionToken(validPayload());
  const [encodedPayload] = token.split(".");
  const tampered = `${encodedPayload}.invalidsignatureXXXXXXX`;
  assert.equal(verifyTokenSignature(tampered), null, "tampered signature should be rejected");
});

test("verifyTokenSignature rejects forged payload with original signature", () => {
  const token = createSessionToken(validPayload());
  const [, sig] = token.split(".");
  const fakePayload = Buffer.from(
    JSON.stringify({ userId: 999, username: "hacker", role: "admin", exp: Date.now() + 1e9 })
  ).toString("base64url");
  assert.equal(verifyTokenSignature(`${fakePayload}.${sig}`), null);
});

test("verifyTokenSignature rejects expired token", () => {
  // Build a token with a past exp, re-sign it correctly so HMAC passes — expiry check must fire
  const expiredPayload = { userId: 1, username: "x", role: "user", exp: Date.now() - 5000 };
  const encoded = Buffer.from(JSON.stringify(expiredPayload)).toString("base64url");
  const sig = signPayload(encoded);
  assert.equal(verifyTokenSignature(`${encoded}.${sig}`), null, "expired token should return null");
});

test("verifyTokenSignature rejects non-JSON payload that passes HMAC", () => {
  const badEncoded = Buffer.from("not-json!!!").toString("base64url");
  const sig = signPayload(badEncoded);
  assert.equal(verifyTokenSignature(`${badEncoded}.${sig}`), null);
});
