"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Tags } from "lucide-react";
import { categoryInput, categoryIcons } from "@/lib/ledger-validation";
import type { CategoryView } from "@/lib/ledger-types";
import { Modal, ErrorMessage, SaveButton, RecordActions, CategoryIcon, ledgerRequest } from "./ledger-ui";

function CategoryForm({ category, close }: { category: CategoryView | null; close: () => void }) {
  const router = useRouter(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const parsed = categoryInput.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true); setError("");
    try { await ledgerRequest("categories", category ? "PATCH" : "POST", parsed.data, category?.id); router.refresh(); close(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't save the category."); setBusy(false); }
  }
  return <Modal title={category ? "Edit category" : "New category"} close={close} busy={busy}><form className="dialog-body" onSubmit={submit}><label>Category name<input name="name" required maxLength={60} autoFocus defaultValue={category?.name} placeholder="Groceries"/></label><fieldset className="icon-picker"><legend>Choose an icon</legend><div>{categoryIcons.map(icon => <label key={icon} title={icon.replaceAll("-", " ")}><input type="radio" name="icon" value={icon} defaultChecked={icon === (category?.icon || "circle")} aria-label={icon.replaceAll("-", " ")}/><span><CategoryIcon name={icon}/></span></label>)}</div></fieldset><p className="field-hint">Renaming a category updates the label on its existing transactions.</p><ErrorMessage message={error}/><div className="dialog-actions"><button type="button" className="button secondary" onClick={close} disabled={busy}>Cancel</button><SaveButton busy={busy}>{category ? "Save category" : "Create category"}</SaveButton></div></form></Modal>;
}
export function CategoryManager({ categories }: { categories: CategoryView[] }) {
  const [editor, setEditor] = useState<CategoryView | null | undefined>(), [showArchived, setShowArchived] = useState(false);
  const visible = categories.filter(category => showArchived || !category.archived);
  return <><div className="page-heading"><div><span className="eyebrow">ORGANIZE YOUR EVERYDAY</span><h1>Categories</h1><p className="muted">Make your spending categories feel like your life.</p></div><button className="button primary" onClick={() => setEditor(null)}><Plus size={18}/>New category</button></div><div className="list-toolbar"><p className="muted">{visible.length} categories</p><label className="checkbox-label"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}/>Show archived</label></div>{visible.length ? <div className="category-grid">{visible.map(category => <article className={`panel category-card ${category.archived ? "archived" : ""}`} key={category.id}><div className="category-title"><span className="feature-icon"><CategoryIcon name={category.icon}/></span><div><h2>{category.name}</h2>{category.archived && <small className="muted">Archived</small>}</div></div><RecordActions resource="categories" id={category.id} name={category.name} archived={category.archived} edit={() => setEditor(category)}/></article>)}</div> : <section className="panel empty-state"><Tags size={34}/><h2>{categories.length ? "No active categories" : "Give your spending some structure"}</h2><p className="muted">Create categories like housing, groceries, or outings. Transactions can also be left uncategorized.</p><button className="button primary" onClick={() => setEditor(null)}>Create a category<Plus size={17}/></button></section>}{editor !== undefined && <CategoryForm category={editor} close={() => setEditor(undefined)}/>}</>;
}
