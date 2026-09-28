"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="error-page"><h1>Let&apos;s try that again.</h1><p>We couldn&apos;t load your workspace. Your information hasn&apos;t been changed.</p><button className="button primary" onClick={reset}>Try again</button></main>; }
