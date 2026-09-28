import "server-only";
import { withOwner } from "./db";
import { lockOwner } from "./owner-lock";
import { monthBounds } from "@/lib/budget";
import { todayInZone } from "@/lib/ledger-validation";
import { datesInMonth, type CalendarEvent, type CalendarView } from "@/lib/calendar";
export async function calendarView(userId: string, month: string): Promise<CalendarView> {
  const { start, end } = monthBounds(month);
  return withOwner(userId, async tx => {
    await lockOwner(tx, userId);
    const settings = await tx.userSettings.findUniqueOrThrow({ where: { userId } });
    const transactions = await tx.transaction.findMany({ where: { userId, date: { gte: start, lt: end } }, include: { account: true, destinationAccount: true, category: true, recurring: true }, orderBy: [{ date: "asc" }, { id: "asc" }] });
    const schedules = await tx.recurringTransaction.findMany({ where: { userId, active: true }, include: { account: true, destinationAccount: true, category: true } });
    const handled = await tx.recurringOccurrence.findMany({ where: { userId, date: { gte: start, lt: end } }, include: { recurring: { include: { account: true, destinationAccount: true, category: true } } } });
    // A generated entry can be moved to another date. Its original occurrence remains handled.
    const generated = await tx.transaction.findMany({ where: { userId, occurrenceDate: { gte: start, lt: end }, recurringId: { not: null } }, select: { recurringId: true, occurrenceDate: true } });
    const iso = (date: Date) => date.toISOString().slice(0, 10);
    const events: CalendarEvent[] = transactions.map(t => ({ id: t.id, date: iso(t.date), name: t.description, amount: t.amountMinor.toString(), type: t.type, state: "recorded", account: t.account.name, destination: t.destinationAccount?.name ?? null, category: t.category?.name ?? null, scheduleId: t.recurringId, autoCreate: false, subscription: t.recurring?.subscription ?? false, note: t.note }));
    for (const s of schedules) {
      const dates = datesInMonth({ nextDueDate: iso(s.nextDueDate), frequency: s.secondDay ? "SEMIMONTHLY" : s.frequency, anchorDay: s.anchorDay, anchorMonth: s.anchorMonth, secondDay: s.secondDay }, month);
      for (const date of dates) if (!handled.some(h => h.recurringId === s.id && iso(h.date) === date)) events.push({ id: `${s.id}-${date}`, date, name: s.name, amount: s.amountMinor.toString(), type: s.type, state: "planned", account: s.account.name, destination: s.destinationAccount?.name ?? null, category: s.category?.name ?? null, scheduleId: s.id, autoCreate: s.autoCreate, subscription: s.subscription, note: s.lastError });
    }
    for (const h of handled) if (h.skipped || !generated.some(t => t.recurringId === h.recurringId && t.occurrenceDate && iso(t.occurrenceDate) === iso(h.date))) {
      const s = h.recurring;
      events.push({ id: h.id, date: iso(h.date), name: s.name, amount: s.amountMinor.toString(), type: s.type, state: h.skipped ? "skipped" : "removed", account: s.account.name, destination: s.destinationAccount?.name ?? null, category: s.category?.name ?? null, scheduleId: s.id, autoCreate: false, subscription: s.subscription, note: "Schedule details reflect its current settings. This item does not count as actual spending or income." });
    }
    return { month, today: todayInZone(settings.timezone), events: events.sort((a, b) => a.date.localeCompare(b.date) || a.state.localeCompare(b.state) || a.name.localeCompare(b.name)) };
  });
}
