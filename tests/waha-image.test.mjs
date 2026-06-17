/**
 * tests/waha-image.test.mjs
 *
 * Regression tests untuk penyiapan gambar WAHA (akar masalah "Target closed":
 * gambar terlalu besar membuat renderer Chromium WAHA tumbang).
 *
 * Membuktikan: gambar besar diturunkan dimensinya hingga <= maxDimension dan
 * dipaksa masuk anggaran byte; gambar kecil tetap PNG tajam tanpa diubah.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";

const { prepareImageForWaha, getWahaImageOptionsFromEnv } = await import("../src/lib/waha-image.ts");
const sharp = (await import("sharp")).default;

/** Gambar BISING (noise) yang sengaja tidak bisa dikompres → memaksa jalur JPEG. */
async function makeNoisyPng(width, height) {
  const raw = randomBytes(width * height * 3);
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

/** Gambar sederhana (warna rata) → kecil, harus tetap PNG. */
async function makeFlatPng(width, height) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 250, g: 250, b: 250 } },
  })
    .png()
    .toBuffer();
}

test("gambar besar & berat: diturunkan ke <= maxDimension dan masuk anggaran byte", async () => {
  const big = await makeNoisyPng(3000, 2000); // mirip screenshot lebar
  const maxDimension = 1280;
  const maxBytes = 400_000;

  const out = await prepareImageForWaha(big, { maxDimension, maxBytes });

  assert.ok(out.width <= maxDimension, `width ${out.width} <= ${maxDimension}`);
  assert.ok(out.height <= maxDimension, `height ${out.height} <= ${maxDimension}`);
  assert.equal(out.resized, true);
  // Noise tidak bisa kecil sebagai PNG → harus jadi JPEG
  assert.equal(out.convertedToJpeg, true);
  assert.equal(out.mimetype, "image/jpeg");
  assert.equal(out.ext, "jpeg");
  // Jauh lebih kecil dari aslinya, dan mendekati/masuk anggaran
  assert.ok(out.buffer.length < big.length, "hasil lebih kecil dari sumber");
  assert.ok(out.buffer.length <= maxBytes * 1.2, `byte ${out.buffer.length} ~<= ${maxBytes}`);
});

test("gambar kecil & ringan: tetap PNG, dimensi tidak berubah", async () => {
  const small = await makeFlatPng(800, 600);
  const out = await prepareImageForWaha(small, { maxDimension: 1600, maxBytes: 800_000 });

  assert.equal(out.mimetype, "image/png");
  assert.equal(out.ext, "png");
  assert.equal(out.resized, false);
  assert.equal(out.convertedToJpeg, false);
  assert.equal(out.width, 800);
  assert.equal(out.height, 600);
});

test("gambar lebar tapi ringan: diturunkan dimensinya namun tetap PNG", async () => {
  const wideFlat = await makeFlatPng(3000, 1000);
  const out = await prepareImageForWaha(wideFlat, { maxDimension: 1600, maxBytes: 800_000 });

  assert.ok(out.width <= 1600);
  assert.equal(out.resized, true);
  // warna rata tetap kompres kecil sebagai PNG
  assert.equal(out.mimetype, "image/png");
});

test("getWahaImageOptionsFromEnv membaca env dan mengabaikan nilai tak valid", () => {
  const prev = {
    dim: process.env.WAHA_IMAGE_MAX_DIM,
    bytes: process.env.WAHA_IMAGE_MAX_BYTES,
    q: process.env.WAHA_IMAGE_JPEG_QUALITY,
  };
  try {
    process.env.WAHA_IMAGE_MAX_DIM = "1280";
    process.env.WAHA_IMAGE_MAX_BYTES = "abc"; // invalid → undefined
    delete process.env.WAHA_IMAGE_JPEG_QUALITY;

    const opts = getWahaImageOptionsFromEnv();
    assert.equal(opts.maxDimension, 1280);
    assert.equal(opts.maxBytes, undefined);
    assert.equal(opts.jpegQuality, undefined);
  } finally {
    if (prev.dim === undefined) delete process.env.WAHA_IMAGE_MAX_DIM;
    else process.env.WAHA_IMAGE_MAX_DIM = prev.dim;
    if (prev.bytes === undefined) delete process.env.WAHA_IMAGE_MAX_BYTES;
    else process.env.WAHA_IMAGE_MAX_BYTES = prev.bytes;
    if (prev.q === undefined) delete process.env.WAHA_IMAGE_JPEG_QUALITY;
    else process.env.WAHA_IMAGE_JPEG_QUALITY = prev.q;
  }
});
