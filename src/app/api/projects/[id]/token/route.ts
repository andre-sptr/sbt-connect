import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import crypto from "node:crypto";

type Context = { params: Promise<{ id: string }> };

/** POST /api/projects/[id]/token — generate public token */
export async function POST(_request: Request, context: Context) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  const projectId = parseInt(id, 10);
  if (!Number.isInteger(projectId)) {
    return Response.json({ error: "ID tidak valid." }, { status: 400 });
  }

  const token = crypto.randomBytes(20).toString("hex");
  const project = await prisma.project.update({
    where: { id: projectId },
    data: { publicToken: token },
  });

  return Response.json({ publicToken: project.publicToken });
}

/** DELETE /api/projects/[id]/token — revoke public token */
export async function DELETE(_request: Request, context: Context) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  const projectId = parseInt(id, 10);
  if (!Number.isInteger(projectId)) {
    return Response.json({ error: "ID tidak valid." }, { status: 400 });
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { publicToken: null },
  });

  return Response.json({ ok: true });
}
