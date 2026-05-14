import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runProject } from "@/lib/bot";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  const { id } = await context.params;
  const projectId = Number(id);

  // Ownership check
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return Response.json({ error: "Project tidak ditemukan." }, { status: 404 });
  if (session.role !== "admin" && project.createdByUserId !== session.userId) {
    return Response.json({ error: "Project tidak ditemukan." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { action?: "full" | "screenshot" | "send" | "dry-run" };
  const action = body.action || "full";
  if (!["full", "screenshot", "send", "dry-run"].includes(action)) {
    return Response.json({ error: "Action tidak valid." }, { status: 400 });
  }

  try {
    const run = await runProject(projectId, action);
    return Response.json({ run });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Run gagal." }, { status: 500 });
  }
}
