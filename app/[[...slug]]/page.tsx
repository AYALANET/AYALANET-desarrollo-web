import { notFound } from "next/navigation";
import Storefront from "@/components/storefront";
import { products } from "@/lib/catalog";

type Props = { params: Promise<{ slug?: string[] }>; searchParams: Promise<{ pedido?: string | string[] }> };
const titles: Record<string, string> = { checkout: "Revisar pedido", pedidos: "Mis pedidos", pedido: "Detalle del pedido", cuenta: "Mi cuenta", ayuda: "Centro de ayuda", condiciones: "Información de la tienda", admin: "Administración" };
export async function generateMetadata({ params }: Props) {
  const { slug = [] } = await params;
  const title = slug[0] === "producto" ? products.find(p => p.id === slug[1])?.name : titles[slug[0]];
  return { title: `${title || "Tu mundo digital"} | AYALANET` };
}
export default async function Page({ params, searchParams }: Props) {
  const { slug = [] } = await params, search = await searchParams;
  const [view = "", id = ""] = slug;
  if (slug.length > 2 || (view && !titles[view] && view !== "producto") || (["producto", "pedido"].includes(view) ? slug.length !== 2 : slug.length > 1)) notFound();
  if (view === "producto" && !products.some(p => p.id === id)) notFound();
  if (view === "pedido" && !/^DEMO-[a-f0-9-]{36}$/.test(id)) notFound();
  const orderId = typeof search.pedido === "string" && /^DEMO-[a-f0-9-]{36}$/.test(search.pedido) ? search.pedido : "";
  return <Storefront view={view} id={id} orderId={orderId} />;
}
