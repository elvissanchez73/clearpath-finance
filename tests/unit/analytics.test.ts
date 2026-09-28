import { describe, it, expect } from "vitest";
import { analyticsInput, firstMonth, buildTrend } from "@/lib/analytics";
describe("analytics ranges and exact trends", () => {
  it("validates ranges and owner/account inputs", () => {
    expect(analyticsInput.safeParse({ month: "2020-13" }).success).toBe(false);
    expect(analyticsInput.safeParse({ month: "2020-01", range: "2" }).success).toBe(false);
    expect(analyticsInput.safeParse({ month: "2020-01", userId: "foreign" }).success).toBe(false);
    expect(firstMonth("2020-02", "12")).toBe("2019-03");
    expect(firstMonth("1900-01", "12")).toBe("1900-01");
    expect(firstMonth("2020-02", "all", "2018-05")).toBe("2018-05");
    expect(firstMonth("2020-02", "all", "2021-05")).toBe("2020-02");
  });
  it("fills missing months while carrying balances and retaining undefined rates", () => {
    const r = buildTrend([{ month: "2019-12", income: 100n, expenses: 0n, savings: 0n, delta: 100n }, { month: "2020-02", income: 300n, expenses: 50n, savings: 400n, delta: 250n }], "2020-01", "2020-03", 1000n);
    expect(r.points.map(p => p.balance)).toEqual(["1100", "1350", "1350"]);
    expect(r.points.map(p => p.rate)).toEqual([null, "13333", null]);
    expect(r.points[1].remaining).toBe("-150");
  });
  it("uses weighted rates and closing balances for long ranges", () => {
    const r = buildTrend([{ month: "2020-01", income: 100n, expenses: 0n, savings: 100n, delta: 100n }, { month: "2020-02", income: 900n, expenses: 0n, savings: 0n, delta: 900n }], "2010-01", "2020-12", 0n);
    expect(r.yearly).toBe(true); expect(r.points).toHaveLength(11);
    expect(r.points.at(-1)).toMatchObject({ rate: "1000", balance: "1000", income: "1000" });
  });
  it("preserves cents above floating point integer precision and upper date boundary", () => {
    const exact = 9007199254740993n;
    expect(buildTrend([{ month: "9999-12", income: exact, expenses: 1n, savings: 0n, delta: exact - 1n }], "9999-12", "9999-12", 0n).points[0]).toMatchObject({ income: exact.toString(), balance: (exact - 1n).toString() });
  });
});
