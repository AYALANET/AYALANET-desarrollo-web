"use client";
import { Catalog, ProductPage } from "./store/catalog";
import { Checkout, Orders, OrderDetail } from "./store/orders";
import { AccountPage } from "./store/account";
import { Support, Information } from "./store/support";
import { WalletPage } from "./store/wallet";
import { Admin } from "./store/admin";

export default function Storefront({ view = "", id = "", orderId = "" }: { view?: string; id?: string; orderId?: string }) {
  switch (view) {
    case "producto": return <ProductPage key={id} id={id} />;
    case "checkout": return <Checkout />;
    case "pedidos": return <Orders />;
    case "pedido": return <OrderDetail key={id} id={id} />;
    case "cuenta": return <AccountPage />;
    case "ayuda": return <Support orderId={orderId} />;
    case "condiciones": return <Information />;
    case "billetera": return <WalletPage />;
    case "admin": return <Admin />;
    default: return <Catalog />;
  }
}
