import { z } from "zod";
import { dateOnly } from "./ledger-validation";
export const exportInput = z.object({ format: z.enum(["csv", "json"]), from: dateOnly.optional(), to: dateOnly.optional() }).strict().refine(v => !v.from || !v.to || v.from <= v.to, "Start date must be before end date.").refine(v => v.format !== "json" || (!v.from && !v.to), "JSON backups include the full workspace; remove date filters.");
/** Quote every field and neutralize spreadsheet formula prefixes, including leading whitespace. */
export function csvCell(value: string) {
  let safe = value.replace(/\u0000/g, "");
  if (/^[\s\uFEFF]*[=+\-@＝＋－＠]/u.test(safe) || /^[\t\r\n]/.test(safe)) safe = "'" + safe;
  return `"${safe.replace(/"/g, '""')}"`;
}
export const csvDocument = (rows: string[][]) => "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
