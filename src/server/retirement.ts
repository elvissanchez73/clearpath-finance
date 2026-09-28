import "server-only";
import { withOwner } from "./db";
import { lockOwner } from "./owner-lock";
import { ApiError } from "./errors";
import { retirementSettingsInput, contributionUpdate, contributionDelete, retirementEstimate, type ContributionView, type RetirementSettingsView } from "@/lib/retirement";
import { parseMoney } from "@/lib/finance";
import { decimalInput, todayInZone } from "@/lib/ledger-validation";
import { monthBounds } from "@/lib/budget";
export async function saveRetirementSettings(userId: string, input: unknown) {
  const data = retirementSettingsInput.parse(input);
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const previous = await tx.retirementSettings.findUnique({ where: { userId } });
    if ((previous?.updatedAt.toISOString() ?? null) !== data.expectedRevision) throw new ApiError(409, "Retirement settings changed. Reload before saving.");
    const values = { annualSalaryMinor: parseMoney(data.annualSalary), employeeBasisPoints: Number(parseMoney(data.employeePercent)), employerMatchBasisPoints: Number(parseMoney(data.matchPercent)), employerContributionBasisPoints: Number(parseMoney(data.otherPercent)), currentBalanceMinor: parseMoney(data.currentBalance), updatedAt: new Date(Math.max(Date.now(), (previous?.updatedAt.valueOf() ?? 0) + 1)) };
    await tx.retirementSettings.upsert({ where: { userId }, create: { userId, ...values }, update: values }); return { ok: true };
  });
}
export async function changeContribution(userId: string, id: string, input: unknown, remove = false) {
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const previous = await tx.retirementContribution.findFirst({ where: { id, userId } });
    if (!previous) throw new ApiError(404, "Contribution not found.");
    const revision = contributionDelete.parse({ expectedRevision: (input as { expectedRevision?: unknown })?.expectedRevision });
    if (revision.expectedRevision !== previous.updatedAt.toISOString()) throw new ApiError(409, "Contribution changed. Reload before saving.");
    if (remove) { contributionDelete.parse(input); await tx.retirementContribution.delete({ where: { id_userId: { id, userId } } }); return { ok: true }; }
    const data = contributionUpdate.parse(input), settings = await tx.userSettings.findUniqueOrThrow({ where: { userId } });
    if (data.date > todayInZone(settings.timezone)) throw new ApiError(400, "Actual contributions cannot be future dated.");
    const employeeMinor = parseMoney(data.employee), employerMatchMinor = parseMoney(data.employerMatch), employerOtherMinor = parseMoney(data.employerOther);
    if (employeeMinor + employerMatchMinor + employerOtherMinor === 0n) throw new ApiError(400, "Record at least one positive contribution amount.");
    await tx.retirementContribution.update({ where: { id_userId: { id, userId } }, data: { date: new Date(data.date), employeeMinor, employerMatchMinor, employerOtherMinor, notes: data.notes || null, updatedAt: new Date(Math.max(Date.now(), previous.updatedAt.valueOf() + 1)) } }); return { ok: true };
  });
}
export async function retirementView(userId: string, month: string) {
  const { start, end } = monthBounds(month);
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const s = await tx.retirementSettings.findUnique({ where: { userId } });
    const preferences = await tx.userSettings.findUniqueOrThrow({ where: { userId } });
    const rows = await tx.retirementContribution.findMany({ where: { userId, date: { gte: start, lt: end } }, orderBy: [{ date: "desc" }, { id: "asc" }] });
    const totals = async (from: Date) => { const r = await tx.retirementContribution.aggregate({ where: { userId, date: { gte: from, lt: end } }, _sum: { employeeMinor: true, employerMatchMinor: true, employerOtherMinor: true } }); return { employee: (r._sum.employeeMinor ?? 0n).toString(), match: (r._sum.employerMatchMinor ?? 0n).toString(), other: (r._sum.employerOtherMinor ?? 0n).toString() }; };
    const settings: RetirementSettingsView | null = s ? { revision: s.updatedAt.toISOString(), annualSalary: decimalInput(s.annualSalaryMinor), employeePercent: decimalInput(BigInt(s.employeeBasisPoints)), matchPercent: decimalInput(BigInt(s.employerMatchBasisPoints)), otherPercent: decimalInput(BigInt(s.employerContributionBasisPoints)), currentBalance: decimalInput(s.currentBalanceMinor) } : null;
    const records: ContributionView[] = rows.map(r => ({ id: r.id, revision: r.updatedAt.toISOString(), date: r.date.toISOString().slice(0, 10), employee: decimalInput(r.employeeMinor), employerMatch: decimalInput(r.employerMatchMinor), employerOther: decimalInput(r.employerOtherMinor), notes: r.notes ?? "" }));
    return { month, today: todayInZone(preferences.timezone), settings, records, monthly: await totals(start), ytd: await totals(new Date(`${month.slice(0, 4)}-01-01`)), estimate: s ? retirementEstimate(s.annualSalaryMinor, s.employeeBasisPoints, s.employerMatchBasisPoints, s.employerContributionBasisPoints) : null };
  });
}
