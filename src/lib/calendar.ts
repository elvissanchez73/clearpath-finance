import { nextOccurrence, type ScheduleFrequency } from "./recurring";
import { monthBounds } from "./budget";
export type CalendarSchedule = { nextDueDate: string; frequency: ScheduleFrequency; anchorDay: number; anchorMonth: number; secondDay: number | null };
/** Jump close to the requested month before enumerating, even for decades-old daily plans. */
export function datesInMonth(schedule: CalendarSchedule, month: string) {
  const { start, end } = monthBounds(month), first = start.toISOString().slice(0, 10);
  let current = schedule.nextDueDate;
  if (new Date(current) >= end) return [];
  if (current < first) {
    const original = new Date(current), frequency = schedule.frequency;
    if (frequency === "DAILY" || frequency === "WEEKLY" || frequency === "BIWEEKLY") {
      const step = { DAILY: 1, WEEKLY: 7, BIWEEKLY: 14 }[frequency] * 86400000;
      current = new Date(original.valueOf() + Math.max(0, Math.floor((start.valueOf() - original.valueOf()) / step)) * step).toISOString().slice(0, 10);
    } else {
      const year = start.getUTCFullYear(), m = frequency === "YEARLY" ? schedule.anchorMonth - 1 : start.getUTCMonth();
      const candidate = new Date(Date.UTC(year, m, Math.min(schedule.anchorDay, new Date(Date.UTC(year, m + 1, 0)).getUTCDate()))).toISOString().slice(0, 10);
      if (candidate > current) current = candidate;
    }
  }
  const dates: string[] = [];
  while (current && new Date(current) < end) {
    if (current >= first) dates.push(current);
    const next = nextOccurrence(current, schedule.frequency, schedule.anchorDay, schedule.anchorMonth, schedule.secondDay);
    if (!next) break;
    current = next;
  }
  return dates;
}
export type CalendarEvent = { id: string; date: string; name: string; amount: string; type: string; state: "planned" | "recorded" | "skipped" | "removed"; account: string; destination: string | null; category: string | null; scheduleId: string | null; autoCreate: boolean; subscription: boolean; note: string | null };
export type CalendarView = { month: string; today: string; events: CalendarEvent[] };
