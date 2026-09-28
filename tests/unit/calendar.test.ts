import { describe, it, expect } from "vitest";
import { datesInMonth, type CalendarSchedule } from "@/lib/calendar";
const schedule: CalendarSchedule = { nextDueDate: "2020-01-31", frequency: "MONTHLY", anchorDay: 31, anchorMonth: 1, secondDay: null };
describe("calendar projections", () => {
  it("preserves month-end and leap anchors", () => { expect(datesInMonth(schedule, "2020-02")).toEqual(["2020-02-29"]); expect(datesInMonth(schedule, "2021-02")).toEqual(["2021-02-28"]); expect(datesInMonth(schedule, "2020-03")).toEqual(["2020-03-31"]); });
  it("does not project before the next due date", () => { expect(datesInMonth(schedule, "2019-12")).toEqual([]); expect(datesInMonth({ ...schedule, nextDueDate: "2020-02-15", anchorDay: 15 }, "2020-02")).toEqual(["2020-02-15"]); });
  it("jumps efficiently over long daily and biweekly histories", () => { expect(datesInMonth({ ...schedule, frequency: "DAILY", nextDueDate: "1900-01-01" }, "9999-12")).toHaveLength(31); expect(datesInMonth({ ...schedule, frequency: "BIWEEKLY", nextDueDate: "2020-01-01" }, "2020-02")).toEqual(["2020-02-12", "2020-02-26"]); });
  it("handles twice-monthly and yearly schedules", () => { expect(datesInMonth({ ...schedule, frequency: "SEMIMONTHLY", nextDueDate: "2020-01-15", anchorDay: 15, secondDay: 31 }, "2020-02")).toEqual(["2020-02-15", "2020-02-29"]); expect(datesInMonth({ ...schedule, frequency: "YEARLY", nextDueDate: "2020-02-29", anchorMonth: 2, anchorDay: 29 }, "2024-02")).toEqual(["2024-02-29"]); expect(datesInMonth({ ...schedule, frequency: "YEARLY" }, "2021-02")).toEqual([]); });
});
