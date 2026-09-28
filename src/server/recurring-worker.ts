import "server-only";
import { runAutomaticBatch } from "./recurring";
const worker = globalThis as unknown as { clearpathRecurringTimer?: ReturnType<typeof setInterval>; clearpathRecurringBusy?: boolean };
export function startRecurringWorker() {
  if (worker.clearpathRecurringTimer) return;
  const run = async () => {
    if (worker.clearpathRecurringBusy) return;
    worker.clearpathRecurringBusy = true;
    try { await runAutomaticBatch(); } catch { console.error("Recurring worker pass failed; will retry. No request data was logged."); }
    finally { worker.clearpathRecurringBusy = false; }
  };
  worker.clearpathRecurringTimer = setInterval(() => { void run(); }, 60000);
  worker.clearpathRecurringTimer.unref();
  setTimeout(() => { void run(); }, 5000).unref();
}
