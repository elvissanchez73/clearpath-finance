import { describe, expect, it } from "vitest";
import { nextOccurrence, payrollValues, subscriptionEquivalent } from "@/lib/recurring";
import { incomeProjection } from "@/lib/income";
describe("recurrence and income calculations", () => {
  it("keeps monthly anchors across short months", () => {
    expect(nextOccurrence("2026-01-31", "MONTHLY", 31, 1)).toBe("2026-02-28");
    expect(nextOccurrence("2026-02-28", "MONTHLY", 31, 1)).toBe("2026-03-31");
    expect(nextOccurrence("2024-01-31", "MONTHLY", 31, 1)).toBe("2024-02-29");
  });
  it("preserves leap-year anchors and stops beyond supported dates", () => {
    expect(nextOccurrence("2024-02-29", "YEARLY", 29, 2)).toBe("2025-02-28");
    expect(nextOccurrence("2027-02-28", "YEARLY", 29, 2)).toBe("2028-02-29");
    expect(nextOccurrence("9999-12-31", "DAILY", 31, 12)).toBeNull();
  });
  it("advances twice-monthly, weekly, biweekly and daily dates", () => {
    expect(nextOccurrence("2026-02-15", "SEMIMONTHLY", 15, 2, 31)).toBe("2026-02-28");
    expect(nextOccurrence("2026-02-28", "SEMIMONTHLY", 15, 2, 31)).toBe("2026-03-15");
    expect(nextOccurrence("2026-12-28", "WEEKLY", 28, 12)).toBe("2027-01-04");
    expect(nextOccurrence("2026-12-28", "BIWEEKLY", 28, 12)).toBe("2027-01-11");
    expect(nextOccurrence("2026-12-31", "DAILY", 31, 12)).toBe("2027-01-01");
  });
  it("uses explicit yearly-equivalent subscription assumptions", () => {
    expect(subscriptionEquivalent(599n, "MONTHLY")).toEqual({ annualMinor: 7188n, monthlyMinor: 599n });
    expect(subscriptionEquivalent(10000n, "YEARLY")).toEqual({ annualMinor: 10000n, monthlyMinor: 833n });
    expect(subscriptionEquivalent(100n, "BIWEEKLY").annualMinor).toBe(2600n);
  });
  it("requires optional payroll details to reconcile with the net amount", () => {
    expect(payrollValues("INCOME", 15000n, "200", "50")).toEqual({ grossIncomeMinor: 20000n, deductionsMinor: 5000n });
    expect(payrollValues("INCOME", 15000n)).toEqual({ grossIncomeMinor: null, deductionsMinor: null });
    expect(() => payrollValues("INCOME", 15000n, "200", "40")).toThrow();
    expect(() => payrollValues("EXPENSE", 15000n, "150", "0")).toThrow();
  });
  it("does not infer take-home income from gross salary", () => {
    expect(incomeProjection(5800000n, 0n, "BIWEEKLY")).toEqual({ grossPerPaycheckMinor: "223077", annualNetMinor: "0", monthlyNetMinor: "0" });
    expect(incomeProjection(5800000n, 187500n, "SEMIMONTHLY").monthlyNetMinor).toBe("375000");
  });
});
