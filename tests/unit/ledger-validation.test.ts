import { describe, expect, it } from "vitest";
import { accountInput, accountChanges, categoryChanges, dateOnly, decimalInput, todayInZone, transactionCreate, transactionFilters } from "@/lib/ledger-validation";

describe("ledger input boundaries", () => {
  it("does not apply creation defaults when archiving or partially updating", () => {
    expect(accountChanges.parse({ archived: true })).toEqual({ archived: true });
    expect(categoryChanges.parse({ name: "Renamed" })).toEqual({ name: "Renamed" });
  });
  it("checks actual calendar dates, including leap days", () => {
    expect(dateOnly.safeParse("2024-02-29").success).toBe(true);
    for (const value of ["2025-02-29", "2026-02-30", "2026-13-01", "1899-12-31"]) expect(dateOnly.safeParse(value).success).toBe(false);
  });
  it("preserves exact signed balances", () => {
    expect(accountInput.parse({ name: "Card", type: "CREDIT_CARD", startingBalance: "-123.45" }).startingBalance).toBe("-123.45");
    expect(decimalInput(-99999999999999n)).toBe("-999999999999.99");
    expect(decimalInput(1n)).toBe("0.01");
  });
  it("rejects invalid amounts and injected ownership", () => {
    const entry = { type: "EXPENSE", amount: "1.00", date: "2026-01-01", description: "Coffee", accountId: "account-id", requestId: crypto.randomUUID() };
    for (const amount of ["0", "-1", "1.001", "1e2", "NaN"]) expect(transactionCreate.safeParse({ ...entry, amount }).success).toBe(false);
    expect(transactionCreate.safeParse({ ...entry, userId: "other-user" }).success).toBe(false);
  });
  it("rejects reversed search ranges", () => {
    expect(transactionFilters.safeParse({ min: "2", max: "1" }).success).toBe(false);
    expect(transactionFilters.safeParse({ min: "invalid", max: "10" }).success).toBe(false);
    expect(transactionFilters.safeParse({ from: "2026-02-01", to: "2026-01-01" }).success).toBe(false);
    expect(transactionFilters.parse({}).page).toBe(1);
  });
  it("uses the user's timezone for today", () => {
    const instant = new Date("2026-09-27T02:00:00Z");
    expect(todayInZone("America/La_Paz", instant)).toBe("2026-09-26");
    expect(todayInZone("Asia/Tokyo", instant)).toBe("2026-09-27");
  });
});
