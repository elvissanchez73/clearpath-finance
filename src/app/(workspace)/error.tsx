"use client";
export default function WorkspaceError({ reset }: { reset: () => void }) { return <main className="page"><section className="panel setup-welcome" role="alert"><h1>We couldn’t load this view.</h1><p className="muted">Please try again. Your saved records are still in your workspace.</p><button className="button primary" onClick={reset}>Try again</button></section></main>; }
