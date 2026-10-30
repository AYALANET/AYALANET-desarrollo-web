"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { Account } from "@/lib/identity-store";
import { api, useStore } from "./context";
import { ErrorMessage, PageHeading } from "./frame";
import { Icon } from "./icon";

export function AccountPage() {
  const { account, setAccount, ready } = useStore();
  const [mode, setMode] = useState<"login" | "register" | "recover">("login"), [busy, setBusy] = useState(false), [error, setError] = useState(""), [recoveryKey, setRecoveryKey] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ account: Account; recoveryKey?: string }>(`/api/auth/${mode}`, Object.fromEntries(form.entries()));
      setAccount(result.account); setRecoveryKey(result.recoveryKey || "");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function logout() { setBusy(true); setError(""); try { await api("/api/auth/logout", {}); setAccount(null); setRecoveryKey(""); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <><PageHeading eyebrow="TU ESPACIO AYALANET" title="Mi cuenta" />{!ready ? <p className="loading-state">Cargando sesión…</p> : account ? <div className="account-layout"><section className="surface"><div className="account-avatar">{account.name.slice(0, 1).toUpperCase()}</div><h2>Hola, {account.name}</h2><p className="muted">@{account.username}</p><p>Tu cuenta conserva los pedidos y consultas al entrar desde otro dispositivo.</p><div className="account-links"><Link href="/pedidos">Mis pedidos <Icon name="arrow" size={16} /></Link><Link href="/billetera">Mi billetera <Icon name="arrow" size={16} /></Link><Link href="/ayuda">Mis consultas <Icon name="arrow" size={16} /></Link>{account.role === "admin" && <Link href="/admin">Administrar tienda <Icon name="arrow" size={16} /></Link>}</div><button className="secondary-button" disabled={busy} onClick={logout}>Cerrar sesión</button><ErrorMessage text={error} /></section><section className="surface">{recoveryKey ? <><span className="overline">GUÁRDALA AHORA</span><h2>Tu clave de recuperación</h2><p>Se muestra una sola vez. Guárdala en tu gestor de contraseñas: permite recuperar tu cuenta si olvidas la contraseña. No la compartas en consultas ni chats.</p><code className="recovery-key">{recoveryKey}</code><p className="muted">Si recuperaste tu cuenta, esta clave reemplaza a la anterior y las sesiones anteriores se cerraron.</p><button className="secondary-button" onClick={() => setRecoveryKey("")}>Ya la guardé</button></> : <><h2>Acceso y recuperación</h2><p>Tu contraseña se guarda de forma protegida. Para recuperarla utiliza el usuario y la clave que recibiste al crear tu cuenta.</p><p className="muted">Esta versión no envía correos ni tiene recuperación por email. Las sesiones duran hasta siete días.</p><Link href="/condiciones">Información de privacidad de la prueba →</Link></>}</section></div> : <div className="account-layout"><section className="surface"><div className="account-tabs"><button aria-pressed={mode === "login"} onClick={() => { setMode("login"); setError(""); }}>Entrar</button><button aria-pressed={mode === "register"} onClick={() => { setMode("register"); setError(""); }}>Crear cuenta</button></div><h2>{mode === "register" ? "Todo lo tuyo, en un lugar" : mode === "recover" ? "Recuperar mi cuenta" : "Qué bueno verte de nuevo"}</h2><form key={mode} className="form-stack" onSubmit={submit}>
      {mode === "register" && <label>Nombre para mostrar<input name="name" autoComplete="nickname" minLength={2} maxLength={60} required /></label>}
      <label>Usuario<input name="username" autoComplete="username" minLength={3} maxLength={32} pattern="[a-zA-Z0-9_.\-]{3,32}" required /></label><p className="field-hint">De 3 a 32 letras, números, puntos o guiones. No necesitas escribir tu correo.</p>
      {mode === "recover" && <label>Clave de recuperación<input name="recoveryKey" type="password" autoComplete="off" required maxLength={100} /></label>}
      <label>{mode === "recover" ? "Nueva contraseña" : "Contraseña"}<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={12} maxLength={128} required /></label><p className="field-hint">Usa al menos 12 caracteres y una contraseña exclusiva.</p>
      <ErrorMessage text={error} /><button className="primary-button full-width" disabled={busy}>{busy ? "Un momento…" : mode === "register" ? "Crear mi cuenta" : mode === "recover" ? "Restablecer acceso" : "Iniciar sesión"}</button>
    </form><button className="text-button recovery-link" onClick={() => { setMode(mode === "recover" ? "login" : "recover"); setError(""); }}>{mode === "recover" ? "Volver al inicio de sesión" : "Olvidé mi contraseña"}</button></section><section className="account-intro"><span className="overline">UNA CUENTA, TODOS TUS PEDIDOS</span><h2>Tu mundo digital<br />te acompaña.</h2><p>Consulta tu historial, revisa cada detalle y conversa con atención desde el mismo lugar.</p><ul><li>Pedidos disponibles entre dispositivos.</li><li>Consultas privadas con seguimiento.</li><li>Los borradores de invitado se vinculan al entrar.</li></ul><p className="muted">La tienda sigue en pruebas. El saldo y las entregas son ficticios; no se realizan cobros reales.</p></section></div>}</>;
}
