import fs from "node:fs/promises";
import path from "node:path";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  const { id } = await context.params;
  const run = await prisma.run.findUnique({ where: { id: Number(id) } });
  if (!run?.screenshotPath) return Response.json({ error: "Screenshot tidak tersedia." }, { status: 404 });

  const storageRoot = path.resolve(process.cwd(), "storage", "screenshots");
  const imagePath = path.resolve(run.screenshotPath);
  if (!imagePath.startsWith(storageRoot)) return Response.json({ error: "Path tidak valid." }, { status: 400 });

  try {
    const file = await fs.readFile(imagePath);
    return new Response(file, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "File screenshot tidak ditemukan." }, { status: 404 });
  }
}
