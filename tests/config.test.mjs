/**
 * tests/config.test.mjs
 *
 * Tests for server-side configuration guards that must fail closed in
 * production-sensitive paths.
 */

import assert from "node:assert/strict";
import test from "node:test";

const config = await import("../src/lib/config.ts");

function withTemporaryEnv(name, value, callback) {
  const previous = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
  try {
    return callback();
  } finally {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  }
}

test("getAuthSecret rejects missing or placeholder AUTH_SECRET", () => {
  withTemporaryEnv("AUTH_SECRET", undefined, () => {
    assert.throws(() => config.getAuthSecret(), /AUTH_SECRET must be configured/);
  });

  withTemporaryEnv("AUTH_SECRET", "development-only-auth-secret", () => {
    assert.throws(() => config.getAuthSecret(), /AUTH_SECRET must be configured/);
  });

  withTemporaryEnv("AUTH_SECRET", "ganti-dengan-hasil-openssl-rand-base64-32", () => {
    assert.throws(() => config.getAuthSecret(), /AUTH_SECRET must be configured/);
  });
});

test("getWahaWebhookSecret requires WAHA_WEBHOOK_SECRET", () => {
  assert.equal(typeof config.getWahaWebhookSecret, "function");

  withTemporaryEnv("WAHA_WEBHOOK_SECRET", undefined, () => {
    assert.throws(() => config.getWahaWebhookSecret(), /WAHA_WEBHOOK_SECRET must be configured/);
  });

  withTemporaryEnv("WAHA_WEBHOOK_SECRET", "webhook-secret-value", () => {
    assert.equal(config.getWahaWebhookSecret(), "webhook-secret-value");
  });
});

test("getPublicBaseUrl requires a valid absolute URL", () => {
  assert.equal(typeof config.getPublicBaseUrl, "function");

  withTemporaryEnv("NEXT_PUBLIC_BASE_URL", undefined, () => {
    assert.throws(() => config.getPublicBaseUrl(), /NEXT_PUBLIC_BASE_URL must be configured/);
  });

  withTemporaryEnv("NEXT_PUBLIC_BASE_URL", "not-a-url", () => {
    assert.throws(() => config.getPublicBaseUrl(), /NEXT_PUBLIC_BASE_URL must be a valid absolute URL/);
  });

  withTemporaryEnv("NEXT_PUBLIC_BASE_URL", "https://bot.example.com/path", () => {
    assert.equal(config.getPublicBaseUrl(), "https://bot.example.com");
  });
});
