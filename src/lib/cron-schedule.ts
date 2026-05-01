export type Frequency = "daily" | "weekly" | "monthly" | "custom";

export type CronSchedule = {
  freq: Frequency;
  hour: number;
  minute: number;
  days: string[];
  dayOfMonth: number;
  customCron: string;
};

export const DEFAULT_DAYS = ["1", "2", "3", "4", "5"];

export function createDefaultCronSchedule(value = ""): CronSchedule {
  return {
    freq: "daily",
    hour: 8,
    minute: 0,
    days: [...DEFAULT_DAYS],
    dayOfMonth: 1,
    customCron: value,
  };
}

export function buildCron(freq: Frequency, hour: number, minute: number, days: string[], dayOfMonth: number): string {
  const m = minute.toString().padStart(2, "0");
  const h = hour.toString();
  if (freq === "daily") return `${m} ${h} * * *`;
  if (freq === "weekly") {
    const d = days.length === 0 ? "*" : [...days].sort((a, b) => Number(a) - Number(b)).join(",");
    return `${m} ${h} * * ${d}`;
  }
  if (freq === "monthly") return `${m} ${h} ${dayOfMonth} * *`;
  return "";
}

export function cronValuesEqual(left: string, right: string) {
  if (!left.trim() || !right.trim()) return left.trim() === right.trim();
  return normalizeCron(left) === normalizeCron(right);
}

export function parseCronSchedule(value: string): CronSchedule {
  const cron = value.trim();
  const fallback = createDefaultCronSchedule(cron);
  const parts = cron.split(/\s+/);

  if (parts.length !== 5) {
    return cron ? { ...fallback, freq: "custom" } : fallback;
  }

  const [minutePart, hourPart, dayOfMonthPart, monthPart, dayOfWeekPart] = parts;
  const minute = parseNumberPart(minutePart, 0, 59);
  const hour = parseNumberPart(hourPart, 0, 23);

  if (minute === null || hour === null || monthPart !== "*") {
    return { ...fallback, freq: cron ? "custom" : "daily" };
  }

  if (dayOfMonthPart === "*" && dayOfWeekPart === "*") {
    return { ...fallback, freq: "daily", hour, minute };
  }

  if (dayOfMonthPart === "*") {
    const days = parseDayList(dayOfWeekPart);
    if (days) return { ...fallback, freq: "weekly", hour, minute, days };
  }

  if (dayOfWeekPart === "*") {
    const dayOfMonth = parseNumberPart(dayOfMonthPart, 1, 28);
    if (dayOfMonth !== null) return { ...fallback, freq: "monthly", hour, minute, dayOfMonth };
  }

  return { ...fallback, freq: "custom" };
}

function parseNumberPart(value: string, min: number, max: number) {
  if (!/^\d+$/.test(value)) return null;
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) return null;
  return numberValue;
}

function parseDayList(value: string) {
  if (value === "*") return [];
  const days = value.split(",");
  const uniqueDays = new Set<string>();

  for (const day of days) {
    if (!DAYS.has(day) || uniqueDays.has(day)) return null;
    uniqueDays.add(day);
  }

  return Array.from(uniqueDays).sort((a, b) => Number(a) - Number(b));
}

function normalizeCron(value: string) {
  const schedule = parseCronSchedule(value);
  if (schedule.freq === "custom") return value.trim().replace(/\s+/g, " ");
  return buildCron(schedule.freq, schedule.hour, schedule.minute, schedule.days, schedule.dayOfMonth);
}

const DAYS = new Set(["0", "1", "2", "3", "4", "5", "6"]);
