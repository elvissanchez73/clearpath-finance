"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RecurringCatchup() {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false, busy = false, lastRun = 0;
    async function catchUp() {
      if (busy || document.visibilityState !== "visible" || Date.now() - lastRun < 300000) return;
      busy = true; lastRun = Date.now();
      try {
        const response = await fetch("/api/recurring", { method: "PATCH" });
        if (response.ok) {
          const result = await response.json();
          if (!cancelled && result.posted > 0) router.refresh();
        }
      } catch { /* The daily job or manual action can retry when connectivity returns. */ }
      finally { busy = false; }
    }
    void catchUp();
    const interval = setInterval(() => void catchUp(), 300000);
    document.addEventListener("visibilitychange", catchUp);
    return () => { cancelled = true; clearInterval(interval); document.removeEventListener("visibilitychange", catchUp); };
  }, [router]);
  return null;
}
