"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="empty-search not-found"><h1>No pudimos cargar esta página</h1><p>Vuelve a intentarlo en unos momentos.</p><button className="primary-button" onClick={reset}>Reintentar</button></div>; }
