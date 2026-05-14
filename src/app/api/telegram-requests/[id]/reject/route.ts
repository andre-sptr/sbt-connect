import { requireApiSession } from "@/lib/auth";
import { rejectTelegramRequest } from "@/lib/telegram-service";

type Context = { params: Promise<{ id: string }> };

function parseId(id: string) {
  const numericId = Number(id);
  return Number.isInteger(numericId) ? numericId : null;
}

export async function POST(request: Request, context: Context) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  const { id } = await context.params;
  const requestId = parseId(id);
  if (!requestId) return Response.json({ error: "ID request tidak valid." }, { status: 400 });

  const json = await request.json().catch(() => ({}));
  const reason = typeof json.reason === "string" ? json.reason : "";

  try {
    const telegramRequest = await rejectTelegramRequest(requestId, reason);
    return Response.json({ request: telegramRequest });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Gagal reject request." }, { status: 400 });
  }
}
