import { describe, expect, it } from "vitest";
import { budgetInput, budgetTotals, monthBounds, neighboringMonth } from "@/lib/budget";

describe("monthly planning rules", () => {
  it("keeps planned allocation and remaining-to-spend formulas distinct", () => {
    expect(budgetTotals(375000n, 150000n, 201500n, 188600n)).toEqual({ plannedRemainder: 23500n, remainingToSpend: 36400n, categoryRemainder: 12900n });
    expect(budgetTotals(0n, 100n, 200n, 300n).remainingToSpend).toBe(-400n);
  });
  it("handles year and leap-month boundaries without timezone shifts", () => {
    expect(monthBounds("2024-02").end.toISOString()).toBe("2024-03-01T00:00:00.000Z");
    expect(neighboringMonth("2026-01", -1)).toBe("2025-12");
    expect(neighboringMonth("2026-12", 1)).toBe("2027-01");
    expect(neighboringMonth("1900-01", -1)).toBeNull();
    expect(neighboringMonth("9999-12", 1)).toBeNull();
  });
  it("rejects duplicate categories, negative/fractional-cent amounts and owner injection", () => {
    const item = { categoryId: "category", amount: "10.00", recurring: false };
    const valid = { expectedRevision: null, income: "100", savings: "0", items: [item] };
    expect(budgetInput.safeParse(valid).success).toBe(true);
    for (const changed of [{ income: "-1" }, { savings: "1.001" }, { items: [item, item] }, { userId: "foreign" }, { expectedRevision: "invalid" }]) expect(budgetInput.safeParse({ ...valid, ...changed }).success).toBe(false);
  });
});
