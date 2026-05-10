import assert from "node:assert/strict";
import test from "node:test";

const { parseTelegramRequestPayload } = await import("../src/lib/telegram-request-parser.ts");

const validPayload = [
  "PIC Pengaju: Budi Santoso / 123456 / Sales",
  "Nama Project: Sales Daily",
  "Group ID Tujuan: 120363123456789@g.us",
  "URL Spreadsheet: https://docs.google.com/spreadsheets/d/example/edit",
  "GID Sheet: 0",
  "Rentang Cell: A1:K22",
  "Caption: *Laporan {projectName}*",
  "Tanggal: {date}",
  "Jam Running: 0 8 * * *",
].join("\n");

test("parses a valid label-based Telegram request payload", () => {
  const result = parseTelegramRequestPayload(validPayload);

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.pic, {
    name: "Budi Santoso",
    nik: "123456",
    unit: "Sales",
  });
  assert.equal(result.data.name, "Sales Daily");
  assert.deepEqual(result.data.groupIds, ["120363123456789@g.us"]);
  assert.equal(result.data.spreadsheetUrl, "https://docs.google.com/spreadsheets/d/example/edit");
  assert.equal(result.data.gid, "0");
  assert.equal(result.data.cellRange, "A1:K22");
  assert.equal(result.data.caption, "*Laporan {projectName}*\nTanggal: {date}");
  assert.equal(result.data.cronExpression, "0 8 * * *");
});

test("reports missing required fields", () => {
  const result = parseTelegramRequestPayload("Nama Project: Sales Daily");

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /PIC Pengaju/);
  assert.match(result.errors.join("\n"), /Group ID Tujuan/);
  assert.match(result.errors.join("\n"), /Jam Running/);
});

test("splits partial PIC values without inventing missing parts", () => {
  const result = parseTelegramRequestPayload(validPayload.replace("Budi Santoso / 123456 / Sales", "Budi Santoso / Sales"));

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.pic, {
    name: "Budi Santoso",
    nik: "Sales",
    unit: "",
  });
});

test("rejects invalid cron expressions", () => {
  const result = parseTelegramRequestPayload(validPayload.replace("0 8 * * *", "not a cron"));

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Jam Running/);
});
