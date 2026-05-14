import fs from "node:fs/promises";
import path from "node:path";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const storageDir = path.join(process.cwd(), "storage", "thumbnails");

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  const { id } = await context.params;
  const runId = parseInt(id, 10);
  if (!Number.isInteger(runId)) {
    return new Response("ID tidak valid.", { status: 400 });
  }

  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run?.thumbnailPath) {
    return new Response("Thumbnail tidak ditemukan.", { status: 404 });
  }

  const absPath = path.isAbsolute(run.thumbnailPath)
    ? run.thumbnailPath
    : path.join(storageDir, path.basename(run.thumbnailPath));

  try {
    const file = await fs.readFile(absPath);
    return new Response(file, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("File tidak ditemukan di disk.", { status: 404 });
  }
}
