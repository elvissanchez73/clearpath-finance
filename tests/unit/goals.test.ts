import { describe, expect, it } from "vitest";
import { goalInput, goalProjection, projectedDate, roadmap, type GoalView } from "@/lib/goals";
describe("goal projections", () => {
  it("rounds completion upward and monthly requirements to whole cents", () => {
    expect(goalProjection(450000n, 1000000n, 150000n, "2026-09-27", "2027-01-27")).toMatchObject({ remainingMinor: "550000", months: "4", estimatedDate: "2027-01-27", requiredMonthlyMinor: "137500", sufficient: true });
    expect(goalProjection(0n, 10000n, 3000n, "2026-01-15", "2026-04-15").requiredMonthlyMinor).toBe("3334");
  });
  it("handles unfunded plans, funded goals, missing targets and overdue dates", () => {
    expect(goalProjection(0n, 100n, 0n, "2026-09-27", null).estimatedDate).toBeNull();
    expect(goalProjection(100n, 100n, 0n, "2026-09-27", "2020-01-01")).toMatchObject({ months: "0", requiredMonthlyMinor: "0", sufficient: true });
    expect(goalProjection(0n, null, 100n, "2026-09-27", null).remainingMinor).toBeNull();
    expect(goalProjection(0n, 100n, 10n, "2026-09-27", "2026-09-26").requiredMonthlyMinor).toBeNull();
  });
  it("clamps monthly anniversaries at month end and caps unsupported dates", () => {
    expect(projectedDate("2024-01-31", 1n)).toBe("2024-02-29");
    expect(projectedDate("2026-01-31", 1n)).toBe("2026-02-28");
    expect(goalProjection(0n, 100n, 100n, "2026-01-31", "2026-02-28").requiredMonthlyMinor).toBe("100");
    expect(goalProjection(0n, 100n, 100n, "2026-01-31", "2026-02-27").requiredMonthlyMinor).toBeNull();
    expect(projectedDate("9999-12-01", 1n)).toBeNull();
    expect(projectedDate("2026-01-01", 10000000000000n)).toBeNull();
  });
  it("uses cumulative remaining amounts, ignores paused/completed goals, and carries monthly surplus", () => {
    const goals = [
      { id: "a", status: "ACTIVE", projection: { remainingMinor: "150" } },
      { id: "b", status: "PAUSED", projection: { remainingMinor: "900" } },
      { id: "c", status: "COMPLETED", projection: { remainingMinor: "0" } },
      { id: "d", status: "ACTIVE", projection: { remainingMinor: "50" } },
    ] as GoalView[];
    expect(roadmap(goals, 100n, "2026-01-01").map(m => m.months)).toEqual(["2", null, null, "2"]);
    expect(roadmap(goals, 0n, "2026-01-01")[0].estimatedDate).toBeNull();
  });
  it("only permits an unset target on a paused goal", () => {
    const data = { name: "Future", target: null, startingAmount: "0", monthlyContribution: "0", targetDate: null, accountId: null, status: "PAUSED", icon: "target", notes: "" };
    expect(goalInput.safeParse(data).success).toBe(true);
    for (const change of [{ status: "ACTIVE" }, { target: "0" }, { startingAmount: "-1" }, { monthlyContribution: "1.001" }, { userId: "foreign" }]) expect(goalInput.safeParse({ ...data, ...change }).success).toBe(false);
  });
});
