"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, LoaderCircle, Home, ShoppingBasket, Car, Utensils, Heart, Zap, Music, Briefcase, Gift, Circle } from "lucide-react";

export async function ledgerRequest(resource: string, method: string, data?: unknown, id?: string) {
  const response = await fetch(`/api/ledger/${resource}${id ? `/${id}` : ""}`, { method, headers: { "Content-Type": "application/json" }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "This change couldn't be saved. Please try again.");
  return result;
}
export function Modal({ title, subtitle, close, busy = false, children }: { title: string; subtitle?: string; close: () => void; busy?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="ledger-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) close(); }}><div className="dialog-heading"><div><h2 id={titleId}>{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}</div><button type="button" className="quiet-button" onClick={close} disabled={busy} aria-label="Close dialog"><X size={21}/></button></div>{children}</dialog>;
}
export function SaveButton({ busy, children = "Save changes" }: { busy: boolean; children?: React.ReactNode }) { return <button className="button primary" disabled={busy} type="submit">{busy && <LoaderCircle size={16} className="spin"/>}{busy ? "Saving…" : children}</button>; }
export function ErrorMessage({ message }: { message: string }) { return message ? <p className="notice error" role="alert">{message}</p> : null; }
export function CategoryIcon({ name, size = 20 }: { name: string; size?: number }) {
  const icons = { home: Home, "shopping-basket": ShoppingBasket, car: Car, utensils: Utensils, heart: Heart, zap: Zap, music: Music, briefcase: Briefcase, gift: Gift, circle: Circle };
  const Icon = icons[name as keyof typeof icons] || Circle;
  return <Icon size={size} aria-hidden="true"/>;
}
export function RecordActions({ resource, id, name, archived, edit }: { resource: "accounts" | "categories" | "transactions"; id: string; name: string; archived?: boolean; edit: () => void }) {
  const [remove, setRemove] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const router = useRouter();
  async function change(method: string, data?: unknown) {
    setBusy(true); setError("");
    try { await ledgerRequest(resource, method, data, id); setRemove(false); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't save this change."); }
    finally { setBusy(false); }
  }
  return <><div className="record-actions"><button type="button" onClick={edit} disabled={busy} aria-label={`Edit ${name}`}>Edit</button>{resource !== "transactions" && <button type="button" onClick={() => change("PATCH", { archived: !archived })} disabled={busy} aria-label={`${archived ? "Restore" : "Archive"} ${name}`}>{archived ? "Restore" : "Archive"}</button>}<button type="button" onClick={() => { setError(""); setRemove(true); }} disabled={busy} aria-label={`Delete ${name}`}>Delete</button></div>{!remove && <ErrorMessage message={error}/>} {remove && <Modal title={`Delete ${resource === "transactions" ? "transaction" : resource === "accounts" ? "account" : "category"}?`} close={() => setRemove(false)} busy={busy}><div className="dialog-body"><p><strong>{name}</strong> will be permanently deleted.</p><p className="muted">{resource === "transactions" ? "Account balances and any linked savings goal will recalculate. This cannot be undone." : "Items used by existing transactions or plans cannot be deleted. Archive them instead to keep your history."}</p><ErrorMessage message={error}/><div className="dialog-actions"><button className="button secondary" onClick={() => setRemove(false)} disabled={busy}>Keep it</button><button className="button danger" onClick={() => change("DELETE")} disabled={busy}>{busy ? "Deleting…" : "Delete permanently"}</button></div></div></Modal>}</>;
}
