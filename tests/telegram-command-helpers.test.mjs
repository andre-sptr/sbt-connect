import assert from "node:assert/strict";
import test from "node:test";

const {
  formatTelegramApprovalFeedback,
  formatTelegramRejectionFeedback,
  formatWhatsappGroupIdList,
} = await import("../src/lib/telegram-command-helpers.ts");

test("formats cached WhatsApp group IDs for Telegram /groupid", () => {
  const text = formatWhatsappGroupIdList([
    { id: 1, name: "Sales Daily", remote: "120363111@g.us", refreshedAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
    { id: 2, name: "Ops Report", remote: "120363222@g.us", refreshedAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
  ]);

  assert.match(text, /Cached WhatsApp Groups/);
  assert.match(text, /1\. Sales Daily/);
  assert.match(text, /ID: 120363111@g\.us/);
  assert.match(text, /2\. Ops Report/);
  assert.match(text, /Total: 2 group/);
});

test("formats empty cached WhatsApp group list with refresh instruction", () => {
  const text = formatWhatsappGroupIdList([]);

  assert.match(text, /Belum ada cached WhatsApp group/);
  assert.match(text, /dashboard Groups/);
});

test("limits cached WhatsApp group list output", () => {
  const groups = Array.from({ length: 52 }, (_, index) => ({
    id: index + 1,
    name: `Group ${index + 1}`,
    remote: `120363${index + 1}@g.us`,
    refreshedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const text = formatWhatsappGroupIdList(groups, 50);

  assert.match(text, /Ditampilkan 50 dari 52 group/);
  assert.doesNotMatch(text, /Group 51/);
});

test("formats approval feedback for the requester", () => {
  const text = formatTelegramApprovalFeedback({
    requestId: 12,
    projectName: "Sales Daily",
    projectId: 34,
    cronExpression: "0 8 * * *",
  });

  assert.match(text, /Request disetujui admin/);
  assert.match(text, /ID Request: 12/);
  assert.match(text, /Project: Sales Daily/);
  assert.match(text, /Project ID: 34/);
  assert.match(text, /Jadwal: 0 8 \* \* \*/);
});

test("formats rejection feedback for the requester", () => {
  const text = formatTelegramRejectionFeedback({
    requestId: 15,
    projectName: "Ops Daily",
    reason: "Range cell belum benar.",
  });

  assert.match(text, /Request ditolak admin/);
  assert.match(text, /ID Request: 15/);
  assert.match(text, /Project: Ops Daily/);
  assert.match(text, /Alasan: Range cell belum benar\./);
});
