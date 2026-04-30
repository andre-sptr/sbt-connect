import { requireApiSession } from "@/lib/auth";
import { runProject } from "@/lib/bot";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  const projectId = Number(id);
  const body = (await request.json().catch(() => ({}))) as { action?: "full" | "screenshot" | "send" };
  const action = body.action || "full";
  if (!["full", "screenshot", "send"].includes(action)) {
    return Response.json({ error: "Action tidak valid." }, { status: 400 });
  }

  try {
    const run = await runProject(projectId, action);
    return Response.json({ run });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Run gagal." }, { status: 500 });
  }
}
