"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "./icon";
import { useStore } from "./context";

export function Frame({ children }: { children: ReactNode }) {
  const { quantity, account, error, reload } = useStore(), path = usePathname();
  return <>
    <a href="#contenido" className="skip-link">Saltar al contenido</a>
    <div className="preview-strip"><span className="status-dot" /> Tienda en pruebas <span className="strip-divider">·</span> Catálogo de ejemplo. Sin cobros ni entregas reales.</div>
    <header className="site-header"><div className="header-inner">
      <Link className="brand" href="/" aria-label="AYALANET, ir al catálogo"><span className="brand-symbol"><Icon name="bolt" size={24} /></span>AYALANET<span className="brand-dot">.</span></Link>
      <nav aria-label="Navegación principal">{[["/", "Tienda"], ["/pedidos", "Mis pedidos"], ["/billetera", "Billetera"], ["/ayuda", "Ayuda"]].map(([href, label]) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined} className={path === href ? "nav-active" : ""}>{label}</Link>)}</nav>
      <div className="header-actions"><Link href="/cuenta" className="account-link">{account ? account.name.split(" ")[0] : "Mi cuenta"}</Link><Link className="header-cart" href="/checkout" aria-label={`Ver carrito, ${quantity} productos`}><Icon name="bag" /><span className="cart-word">Carrito</span><span className="cart-count">{quantity}</span></Link></div>
    </div></header>
    <main className="store-shell" id="contenido">{error && <div className="error-message" role="alert">{error} <button className="text-button" onClick={() => reload().catch(() => undefined)}>Reintentar</button></div>}{children}</main>
    <footer className="site-footer"><div><Link href="/" className="footer-brand">AYALANET<span>.</span></Link><p>Tu mundo digital, a tu manera.</p></div><nav aria-label="Enlaces del pie"><Link href="/ayuda">Centro de ayuda</Link><Link href="/condiciones">Información de la tienda</Link><Link href="/cuenta">Mi cuenta</Link>{account?.role === "admin" && <Link href="/admin">Administración</Link>}</nav><span>Pagos con AyalaPay · Próximamente</span></footer>
  </>;
}
export function PageHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <><div className="breadcrumb"><Link href="/">Inicio</Link><span>/</span>{title}</div><div className="section-heading page-heading"><div><span className="overline">{eyebrow}</span><h1>{title}<span>.</span></h1></div>{children}</div></>;
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) { return <div className="empty-search"><Icon name="bag" size={30} /><h2>{title}</h2>{children}</div>; }
export function ErrorMessage({ text }: { text: string }) { return text ? <p className="error-message" role="alert">{text}</p> : null; }
