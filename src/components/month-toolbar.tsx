import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { neighboringMonth, monthLabel } from "@/lib/budget";

export function MonthToolbar({ month, path }: { month: string; path: string }) {
  const previous = neighboringMonth(month, -1), next = neighboringMonth(month, 1);
  return <div className="month-toolbar">
    <div className="month-navigation">
      {previous ? <Link href={`${path}?month=${previous}`} aria-label="Previous month"><ChevronLeft size={19}/></Link> : <span/>}
      <strong>{monthLabel(month)}</strong>
      {next ? <Link href={`${path}?month=${next}`} aria-label="Next month"><ChevronRight size={19}/></Link> : <span/>}
    </div>
    <form action={path} method="get"><label className="sr-only" htmlFor="selected-month">Choose month</label><input id="selected-month" name="month" type="month" defaultValue={month} min="1900-01" max="9999-12" required/><button className="button secondary" type="submit">View</button></form>
  </div>;
}
