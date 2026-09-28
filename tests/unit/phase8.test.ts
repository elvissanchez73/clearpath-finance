import { describe, expect, it } from "vitest";
import { csvCell, csvDocument, exportInput } from "@/lib/export";
import { retirementEstimate, retirementSettingsInput } from "@/lib/retirement";
import { onboardingInput } from "@/lib/preferences";
describe("exports and retirement planning", () => {
  it("neutralizes formula prefixes including whitespace and fullwidth variants", () => { for (const text of ["=SUM(A1)", "+cmd", "-1+2", "@SUM(A1)", "  =cmd", "\tformula", "\rtest", "\n=cmd", "＝cmd", "\uFEFF=cmd"]) expect(csvCell(text).startsWith('"\'')).toBe(true); });
  it("quotes commas, quotes and multiline data without changing safe text", () => { expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"'); expect(csvCell("ordinary text")).toBe('"ordinary text"'); expect(csvDocument([["Amount", "Name"], ["12.34", "safe"]])).toBe('\uFEFF"Amount","Name"\r\n"12.34","safe"\r\n'); });
  it("rejects reversed dates, owner injection and filtered JSON backups", () => { expect(exportInput.safeParse({ format: "csv", from: "2020-02-01", to: "2020-01-01" }).success).toBe(false); expect(exportInput.safeParse({ format: "json", userId: "other" }).success).toBe(false); expect(exportInput.safeParse({ format: "json", from: "2020-01-01" }).success).toBe(false); });
  it("estimates salary percentages in exact cents without assuming a match", () => { expect(retirementEstimate(5800000n, 600, 0, 0)).toEqual({ employee: { annual: "348000", monthly: "29000" }, match: { annual: "0", monthly: "0" }, other: { annual: "0", monthly: "0" } }); expect(retirementEstimate(101n, 5000, 0, 0).employee.annual).toBe("51"); });
  it("rejects invalid percentages and onboarding steps", () => { const base = { expectedRevision: null, annualSalary: "58000", employeePercent: "6", matchPercent: "0", otherPercent: "0", currentBalance: "0" }; expect(retirementSettingsInput.safeParse({ ...base, employeePercent: "100.01" }).success).toBe(false); expect(retirementSettingsInput.safeParse({ ...base, matchPercent: "-1" }).success).toBe(false); expect(onboardingInput.safeParse({ step: 5, complete: false }).success).toBe(false); });
});
