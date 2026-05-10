type CachedWhatsappGroup = {
  remote: string;
  name: string;
};

/** @deprecated /groupid dihapus dari Telegram bot — Group ID tidak diekspos ke user. */
export function formatWhatsappGroupIdList(groups: CachedWhatsappGroup[], limit = 50) {
  if (groups.length === 0) {
    return "Belum ada cached WhatsApp group. Refresh daftar group dari dashboard Groups terlebih dahulu.";
  }

  const lines = groups.slice(0, limit).map((group, index) => `${index + 1}. ${group.name}\nID: ${group.remote}`);
  const suffix =
    groups.length > limit
      ? `\n\nDitampilkan ${limit} dari ${groups.length} group.`
      : `\n\nTotal: ${groups.length} group.`;

  return `Cached WhatsApp Groups\n\n${lines.join("\n\n")}${suffix}`;
}

export function formatTelegramApprovalFeedback(input: {
  requestId: number;
  projectName: string;
  projectId: number;
  cronExpression: string;
}) {
  return [
    "Request disetujui admin.",
    "",
    `ID Request: ${input.requestId}`,
    `Project: ${input.projectName}`,
    `Project ID: ${input.projectId}`,
    `Jadwal: ${input.cronExpression}`,
    "",
    "Project sudah aktif dan akan berjalan sesuai jadwal.",
  ].join("\n");
}

export function formatTelegramRejectionFeedback(input: {
  requestId: number;
  projectName?: string | null;
  reason: string;
}) {
  return [
    "Request ditolak admin.",
    "",
    `ID Request: ${input.requestId}`,
    `Project: ${input.projectName || "-"}`,
    `Alasan: ${input.reason.trim() || "Tidak ada alasan tambahan."}`,
  ].join("\n");
}
