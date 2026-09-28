import "server-only";
import { withOwner } from "./db";
import { lockOwner } from "./owner-lock";
import { ApiError } from "./errors";
import { incomeInput, incomeProjection, retirementInput, type IncomeView } from "@/lib/income";
import { parseMoney } from "@/lib/finance";
import { monthBounds } from "@/lib/budget";
import { todayInZone } from "@/lib/ledger-validation";
export async function saveIncomeSettings(userId: string, input: unknown) {
  const data = incomeInput.parse(input);
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const previous = await tx.incomeSettings.findUnique({ where: { userId } });
    if ((previous?.updatedAt.toISOString() ?? null) !== data.expectedRevision) throw new ApiError(409, "Income settings changed. Reload before saving.");
    const values = { annualSalaryMinor: parseMoney(data.annualSalary), netPaycheckMinor: parseMoney(data.netPaycheck), payFrequency: data.payFrequency, updatedAt: new Date(Math.max(Date.now(), (previous?.updatedAt.valueOf() ?? 0) + 1)) };
    await tx.incomeSettings.upsert({ where: { userId }, create: { userId, ...values }, update: values }); return { ok: true };
  });
}
export async function incomeView(userId: string, month: string): Promise<IncomeView> {
  const { start, end } = monthBounds(month);
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const settings = await tx.incomeSettings.findUnique({ where: { userId } });
    const actual = await tx.transaction.aggregate({ where: { userId, type: "INCOME", date: { gte: start, lt: end } }, _sum: { amountMinor: true, grossIncomeMinor: true, deductionsMinor: true }, _count: { id: true, grossIncomeMinor: true } });
    const frequency = settings?.payFrequency as NonNullable<IncomeView["settings"]>["payFrequency"];
    return { month, settings: settings ? { revision: settings.updatedAt.toISOString(), annualSalaryMinor: settings.annualSalaryMinor.toString(), netPaycheckMinor: settings.netPaycheckMinor.toString(), payFrequency: frequency } : null, projection: settings ? incomeProjection(settings.annualSalaryMinor, settings.netPaycheckMinor, frequency) : null, actualNetMinor: (actual._sum.amountMinor ?? 0n).toString(), documentedGrossMinor: (actual._sum.grossIncomeMinor ?? 0n).toString(), documentedDeductionsMinor: (actual._sum.deductionsMinor ?? 0n).toString(), count: actual._count.id, documentedCount: actual._count.grossIncomeMinor };
  });
}
export async function createRetirementContribution(userId: string, input: unknown) {
  const data = retirementInput.parse(input);
  const employeeMinor = parseMoney(data.employee), employerMatchMinor = parseMoney(data.employerMatch), employerOtherMinor = parseMoney(data.employerOther);
  if (employeeMinor + employerMatchMinor + employerOtherMinor === 0n) throw new ApiError(400, "Record at least one positive contribution amount.");
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const settings = await tx.userSettings.findUniqueOrThrow({ where: { userId } });
    if (data.date > todayInZone(settings.timezone)) throw new ApiError(400, "Actual contributions cannot be future dated.");
    const values = { userId, date: new Date(data.date), employeeMinor, employerMatchMinor, employerOtherMinor, notes: data.notes || null };
    if (data.requestId) {
      const previous = await tx.retirementContribution.findUnique({ where: { userId_clientRequestId: { userId, clientRequestId: data.requestId } } });
      if (previous) {
        if (previous.date.valueOf() !== values.date.valueOf() || previous.employeeMinor !== employeeMinor || previous.employerMatchMinor !== employerMatchMinor || previous.employerOtherMinor !== employerOtherMinor || previous.notes !== values.notes) throw new ApiError(409, "This save request was already used for different contribution details.");
        return previous;
      }
    }
    return tx.retirementContribution.create({ data: { ...values, clientRequestId: data.requestId } });
  });
}
export async function retirementSummary(userId: string, month: string) {
  const { start, end } = monthBounds(month), yearStart = new Date(`${month.slice(0, 4)}-01-01`);
  return withOwner(userId, async tx => {
    const aggregate = async (from: Date) => {
      const r = await tx.retirementContribution.aggregate({ where: { userId, date: { gte: from, lt: end } }, _sum: { employeeMinor: true, employerMatchMinor: true, employerOtherMinor: true } });
      return { employeeMinor: r._sum.employeeMinor ?? 0n, employerMatchMinor: r._sum.employerMatchMinor ?? 0n, employerOtherMinor: r._sum.employerOtherMinor ?? 0n };
    };
    await lockOwner(tx, userId);
    return { month, monthly: await aggregate(start), yearToSelectedMonth: await aggregate(yearStart) };
  });
}
