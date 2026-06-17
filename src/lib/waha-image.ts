/**
 * src/lib/waha-image.ts
 *
 * Menyiapkan gambar agar AMAN diproses engine WEBJS WAHA sebelum dikirim.
 *
 * Akar masalah "Target closed" (TargetCloseError) saat kirim gambar dari
 * dashboard: screenshot Google Sheets bisa sangat besar (lebar 3000px, tinggi
 * mengikuti seluruh tabel, hanya dibatasi 2500px). WAHA memproses media itu di
 * dalam page Chromium internalnya (canvas + blob di JS heap renderer). Gambar
 * yang terlalu besar membuat renderer kehabisan memori dan tumbang — persis
 * error yang muncul. Pesan TEKS dan gambar kecil (mis. dari script Python) di
 * session yang sama tetap aman karena tidak membebani renderer.
 *
 * Strategi: anggaran ukuran (size budget). Gambar kecil tetap PNG yang tajam.
 * Gambar besar diturunkan dimensinya (fit dalam maxDimension), dan jika masih
 * melebihi maxBytes, dikonversi ke JPEG dengan kualitas turun bertahap sampai
 * masuk anggaran. Ini menjaga laporan tetap terbaca sambil tetap di bawah
 * batas aman WAHA.
 *
 * Sengaja tanpa import alias "@/..." supaya bisa di-import langsung test runner.
 * sharp di-import dinamis (pola yang sama dipakai bot.ts).
 */

export interface PreparedImage {
  buffer: Buffer;
  /** "image/png" atau "image/jpeg" */
  mimetype: string;
  /** "png" atau "jpeg" — untuk ekstensi nama file */
  ext: string;
  width: number;
  height: number;
  /** true jika dimensi diturunkan dari aslinya */
  resized: boolean;
  /** true jika dikonversi ke JPEG untuk memenuhi anggaran ukuran */
  convertedToJpeg: boolean;
}

export interface PrepareImageOptions {
  /** Sisi terpanjang maksimum (px). Default 1600 (= batas tampilan WhatsApp). */
  maxDimension?: number;
  /** Ukuran byte maksimum hasil akhir. Default 800_000 (~800 KB). */
  maxBytes?: number;
  /** Kualitas JPEG awal saat perlu konversi. Default 90. */
  jpegQuality?: number;
  /** Batas bawah kualitas JPEG. Default 60. */
  minJpegQuality?: number;
}

const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_MAX_BYTES = 800_000;
const DEFAULT_JPEG_QUALITY = 90;
const DEFAULT_MIN_JPEG_QUALITY = 60;

export async function prepareImageForWaha(
  input: Buffer,
  opts: PrepareImageOptions = {}
): Promise<PreparedImage> {
  const sharp = (await import("sharp")).default;

  const maxDimension = opts.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const startQuality = opts.jpegQuality ?? DEFAULT_JPEG_QUALITY;
  const minQuality = opts.minJpegQuality ?? DEFAULT_MIN_JPEG_QUALITY;

  const meta = await sharp(input, { failOn: "none" }).metadata();
  const srcWidth = meta.width ?? 0;
  const srcHeight = meta.height ?? 0;
  const needsResize = srcWidth > maxDimension || srcHeight > maxDimension;

  // Pipeline baru tiap pemanggilan (pipeline sharp sekali pakai).
  const pipeline = () => {
    let p = sharp(input, { failOn: "none" });
    if (needsResize) {
      p = p.resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true });
    }
    return p;
  };

  const dimensionsOf = async (buf: Buffer) => {
    const m = await sharp(buf, { failOn: "none" }).metadata();
    return { width: m.width ?? 0, height: m.height ?? 0 };
  };

  // 1) Coba PNG terkuantisasi (palet) — kecil untuk konten spreadsheet, teks tetap tajam.
  const pngBuf = await pipeline().png({ compressionLevel: 9, palette: true }).toBuffer();
  if (pngBuf.length <= maxBytes) {
    const { width, height } = await dimensionsOf(pngBuf);
    return {
      buffer: pngBuf,
      mimetype: "image/png",
      ext: "png",
      width,
      height,
      resized: needsResize,
      convertedToJpeg: false,
    };
  }

  // 2) PNG masih terlalu besar → JPEG, turunkan kualitas bertahap sampai masuk anggaran.
  let quality = startQuality;
  let jpegBuf = await pipeline().jpeg({ quality, mozjpeg: true }).toBuffer();
  while (jpegBuf.length > maxBytes && quality > minQuality) {
    quality = Math.max(minQuality, quality - 10);
    jpegBuf = await pipeline().jpeg({ quality, mozjpeg: true }).toBuffer();
  }

  const { width, height } = await dimensionsOf(jpegBuf);
  return {
    buffer: jpegBuf,
    mimetype: "image/jpeg",
    ext: "jpeg",
    width,
    height,
    resized: needsResize,
    convertedToJpeg: true,
  };
}

/** Baca opsi ukuran gambar WAHA dari environment, dengan default aman. */
export function getWahaImageOptionsFromEnv(): PrepareImageOptions {
  const num = (v: string | undefined) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  return {
    maxDimension: num(process.env.WAHA_IMAGE_MAX_DIM),
    maxBytes: num(process.env.WAHA_IMAGE_MAX_BYTES),
    jpegQuality: num(process.env.WAHA_IMAGE_JPEG_QUALITY),
  };
}
