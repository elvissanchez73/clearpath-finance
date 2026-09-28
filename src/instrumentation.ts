export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build" && process.env.RECURRING_WORKER_ENABLED !== "0" && (process.env.NODE_ENV === "development" || process.env.RECURRING_WORKER_ENABLED === "1")) {
    const { startRecurringWorker } = await import("./server/recurring-worker");
    startRecurringWorker();
  }
}
