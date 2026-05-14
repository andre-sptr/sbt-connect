import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/auth";
import { resetPassword } from "@/lib/user-service";
import { sendTelegramMessage } from "@/lib/telegram";

type Context = { params: Promise<{ id: string }> };

/**
 * POST — reset password + kirim kredensial baru ke Telegram user.
 * Digunakan ketika pengiriman otomatis saat approval gagal.
 */
export async function POST(_request: Request, context: Context) {
  const session = await requireAdminApi();
  if (session instanceof Response) return session;

  const { id } = await context.params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) {
    return Response.json({ error: "ID tidak valid." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return Response.json({ error: "User tidak ditemukan." }, { status: 404 });
  if (!user.isActive) return Response.json({ error: "User tidak aktif." }, { status: 400 });
  if (!user.telegramChatId) {
    return Response.json(
      { error: "User tidak memiliki Telegram chat ID. Kirim password secara manual." },
      { status: 400 }
    );
  }

  const newPassword = await resetPassword(userId);

  const msg = [
    `🔑 Kredensial dashboard kamu diperbarui oleh admin.`,
    ``,
    `Username: ${user.username}`,
    `Password baru: ${newPassword}`,
    ``,
    `Login di: ${process.env.NEXT_PUBLIC_APP_URL || "dashboard"}`,
    `Segera ganti password setelah login.`,
  ].join("\n");

  try {
    await sendTelegramMessage(user.telegramChatId, msg);
  } catch {
    // Kirim tetap berhasil dari sisi server, tapi Telegram gagal — kembalikan password ke admin
    return Response.json({
      ok: true,
      telegramSent: false,
      password: newPassword,
      warning: "Gagal mengirim ke Telegram. Sampaikan password berikut secara manual ke user.",
    });
  }

  return Response.json({ ok: true, telegramSent: true });
}
