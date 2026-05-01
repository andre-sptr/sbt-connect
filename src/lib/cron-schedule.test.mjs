import assert from "node:assert/strict";
import test from "node:test";
import { buildCron, cronValuesEqual, parseCronSchedule } from "./cron-schedule.ts";

test("parses daily cron into editable schedule fields", () => {
  assert.deepEqual(parseCronSchedule("0 14 * * *"), {
    freq: "daily",
    hour: 14,
    minute: 0,
    days: ["1", "2", "3", "4", "5"],
    dayOfMonth: 1,
    customCron: "0 14 * * *",
  });
});

test("parses weekly cron with selected days", () => {
  assert.deepEqual(parseCronSchedule("30 9 * * 1,3,5"), {
    freq: "weekly",
    hour: 9,
    minute: 30,
    days: ["1", "3", "5"],
    dayOfMonth: 1,
    customCron: "30 9 * * 1,3,5",
  });
});

test("parses monthly cron with day of month", () => {
  assert.deepEqual(parseCronSchedule("15 7 12 * *"), {
    freq: "monthly",
    hour: 7,
    minute: 15,
    days: ["1", "2", "3", "4", "5"],
    dayOfMonth: 12,
    customCron: "15 7 12 * *",
  });
});

test("keeps unsupported cron expressions as custom", () => {
  assert.deepEqual(parseCronSchedule("*/15 8-17 * * 1-5"), {
    freq: "custom",
    hour: 8,
    minute: 0,
    days: ["1", "2", "3", "4", "5"],
    dayOfMonth: 1,
    customCron: "*/15 8-17 * * 1-5",
  });
});

test("treats equivalent cron values as equal", () => {
  assert.equal(cronValuesEqual("0 14 * * *", "00 14 * * *"), true);
  assert.equal(cronValuesEqual("30 9 * * 1,3,5", buildCron("weekly", 9, 30, ["5", "1", "3"], 1)), true);
});

test("does not treat empty cron as equal to the default schedule", () => {
  assert.equal(cronValuesEqual("", "00 8 * * *"), false);
});
