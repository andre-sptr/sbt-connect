import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import crypto from "node:crypto";

type Context = { params: Promise<{ id: string }> };

async function resolveOwned(projectId: number, userId: number, isAdmin: boolean) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;
  if (!isAdmin && project.createdByUserId !== userId) return null;
  return project;
}

/** POST /api/projects/[id]/token — generate public token */
export async function POST(_request: Request, context: Context) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  const { id } = await context.params;
  const projectId = parseInt(id, 10);
  if (!Number.isInteger(projectId)) {
    return Response.json({ error: "ID tidak valid." }, { status: 400 });
  }

  const project = await resolveOwned(projectId, session.userId, session.role === "admin");
  if (!project) return Response.json({ error: "Project tidak ditemukan." }, { status: 404 });

  const token = crypto.randomBytes(20).toString("hex");
  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { publicToken: token },
  });

  return Response.json({ publicToken: updated.publicToken });
}

/** DELETE /api/projects/[id]/token — revoke public token */
export async function DELETE(_request: Request, context: Context) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  const { id } = await context.params;
  const projectId = parseInt(id, 10);
  if (!Number.isInteger(projectId)) {
    return Response.json({ error: "ID tidak valid." }, { status: 400 });
  }

  const project = await resolveOwned(projectId, session.userId, session.role === "admin");
  if (!project) return Response.json({ error: "Project tidak ditemukan." }, { status: 404 });

  await prisma.project.update({
    where: { id: projectId },
    data: { publicToken: null },
  });

  return Response.json({ ok: true });
}
