import Link from "next/link";
export default function NotFound() { return <div className="empty-search not-found"><h1>No encontramos esta página</h1><p>Vuelve al catálogo para seguir explorando.</p><Link href="/" className="primary-button">Ir a la tienda</Link></div>; }
