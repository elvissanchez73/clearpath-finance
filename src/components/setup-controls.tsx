"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorMessage } from "./ledger-ui";
export function SetupControls({ step, complete = false }: { step: number; complete?: boolean }) {
  const router = useRouter(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function move(next: number, finish: boolean) { setBusy(true); setError(""); try { const response = await fetch("/api/onboarding", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: next, complete: finish }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); if (finish) router.push("/dashboard"); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Could not save setup progress."); } finally { setBusy(false); } }
  return <><ErrorMessage message={error}/><div className="setup-controls">{step > 0 && <button className="button secondary" disabled={busy} onClick={() => move(step - 1, false)}>Back</button>}<button className="button secondary" disabled={busy} onClick={() => move(step, true)}>Skip setup</button><button className="button primary" disabled={busy} onClick={() => move(Math.min(4, step + 1), step === 4)}>{busy ? "Saving…" : step === 4 ? "Finish setup" : complete ? "Continue setup" : "Continue"}</button></div><p className="field-hint">Save any form changes before continuing. Each step is optional; you can return from Settings.</p></>;
}
