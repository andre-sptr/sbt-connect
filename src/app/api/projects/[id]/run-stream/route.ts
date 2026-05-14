import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  const { id } = await context.params;
  const projectId = parseInt(id, 10);
  if (!Number.isInteger(projectId)) {
    return new Response("ID tidak valid.", { status: 400 });
  }

  // Ownership check
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return new Response("Project tidak ditemukan.", { status: 404 });
  if (session.role !== "admin" && project.createdByUserId !== session.userId) {
    return new Response("Project tidak ditemukan.", { status: 404 });
  }

  const run = await prisma.run.findFirst({
    where: { projectId, status: "running" },
    orderBy: { startedAt: "desc" },
  });

  const encoder = new TextEncoder();
  let lastLogId = 0;
  let closed = false;

  request.signal.addEventListener("abort", () => {
    closed = true;
  });

  const stream = new ReadableStream({
    async start(controller) {
      if (!run) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "no-run" })}\n\n`));
        controller.close();
        return;
      }

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "run-started", runId: run.id, action: run.action })}\n\n`)
      );

      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          try { controller.close(); } catch {}
          return;
        }

        try {
          const logs = await prisma.log.findMany({
            where: {
              runId: run.id,
              id: { gt: lastLogId },
            },
            orderBy: { id: "asc" },
            take: 20,
          });

          for (const log of logs) {
            lastLogId = log.id;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "log", id: log.id, level: log.level, message: log.message, createdAt: log.createdAt })}\n\n`
              )
            );
          }

          const updated = await prisma.run.findUnique({ where: { id: run.id } });
          if (updated && updated.status !== "running") {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "run-done", status: updated.status, errorSummary: updated.errorSummary })}\n\n`
              )
            );
            clearInterval(interval);
            try { controller.close(); } catch {}
          }
        } catch {
          clearInterval(interval);
          try { controller.close(); } catch {}
        }
      }, 500);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
