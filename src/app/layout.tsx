import type { Metadata } from "next";
export const dynamic = "force-dynamic";
import "./globals.css";
import "./ledger.css";
import "./budget.css";
import "./goals.css";
import "./recurring.css";
import "./analytics.css";
import "./calendar.css";
import "./polish.css";
export const metadata: Metadata = { title: { default: "Clearpath · Personal finance", template: "%s · Clearpath" }, description: "A clearer picture of your money, your budget, and what comes next.", icons: { icon: "/favicon.svg" }, robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
