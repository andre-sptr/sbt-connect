type CachedWhatsappGroup = {
  remote: string;
  name: string;
};

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
