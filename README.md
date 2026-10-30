# AYALANET · tienda web y Telegram

Primera versión funcional de una tienda web independiente con catálogo de muestra, buscador, filtros, carrito y borradores persistentes. Telegram se ha elegido para atención y avisos. El propietario prioriza USDT BEP20 y tiene una cuenta normal de Binance, sin acceso confirmado a Binance Pay para comercios.

**Es una demostración: no cobra dinero, no entrega productos y no está conectada a los proveedores ni a Telegram.** Todos los productos, precios y existencias son ficticios. No se modificó ayalanet.com.

## Iniciar

Requiere Node.js 24 (usa `node:sqlite`) y npm. Instalar las dependencias fijadas en el lockfile:

```bash
npm ci
NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1 npm run dev
```

En el entorno Codex actual se puede usar `npm ci --cache /workspace/.cache/npm` y el lanzador `bash /workspace/iniciar-ayalanet.sh`. La opción de certificados permite verificar Google Fonts a través del proxy del entorno; no desactiva TLS.

La base se guarda en `.data/store.sqlite`, fuera de Git. Puede elegirse otro archivo mediante `STORE_DATABASE_PATH`. El directorio debe ser escribible y persistente; los pedidos no sobreviven a la pérdida del archivo. No desplegar esta configuración en un sistema efímero o con varias instancias sin adaptar almacenamiento y concurrencia.

Detrás de un proxy, fijar `STORE_ORIGIN` al origen HTTPS exacto de la tienda, sin ruta ni barra final. En local, la comprobación de origen usa el Host de la petición; no confía en un encabezado X-Forwarded-Host arbitrario.

## Qué se puede probar

1. Filtrar o buscar un producto de ejemplo.
2. Añadirlo al carrito y cambiar cantidades.
3. Guardar un pedido de prueba.
4. Consultarlo en «Mis pedidos» y recargar la página.

El servidor calcula los importes enteros desde su catálogo; no acepta precios ni estados de pago del navegador. Conserva la misma referencia al reintentar una solicitud y rechaza reutilizarla con otro carrito. Cada sesión anónima solo puede consultar sus propios borradores, mediante cookie HttpOnly/SameSite; dura 24 horas. Los borradores se conservan en el servidor, pero no hay todavía cuentas de usuario ni recuperación entre dispositivos. No se reservan existencias reales.

## Validación

```bash
npm test
npm run lint
NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1 npm run build
npm run test:e2e
npm audit
```

Las pruebas E2E usan una base temporal y levantan su propio servidor en el puerto 3100. Usan Chromium instalado en `/usr/bin/chromium`, si existe; también admiten `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. En otro equipo puede instalarse el navegador de Playwright mediante `npx playwright install chromium`.

Las pruebas de dominio cubren cálculo de importes, entradas manipuladas, cantidades, persistencia, aislamiento de sesiones, reintentos, límites y tamaño de solicitud. Las pruebas de navegador/API cubren el carrito y creación de pedidos, vistas móviles, protección de origen y acceso de otra sesión. Se prueban únicamente datos ficticios y servicios locales.

Las capturas de escritorio y móvil se generan en `docs/screenshots/` durante los E2E. No sustituyen una prueba física en iPhone ni una prueba dentro de Telegram.

## Pagos y siguientes integraciones

Consultar [PAGOS-Y-TELEGRAM.md](docs/PAGOS-Y-TELEGRAM.md) para la decisión de arquitectura y los requisitos pendientes. Binance Pay y USDT BEP20 son integraciones distintas. El acceso comercial a Binance Pay no se obtiene simplemente por tener una cuenta normal.

Antes de aceptar dinero hay que configurar el receptor/procesador de USDT, verificar depósitos reales de manera inequívoca, integrar la entrega y comprobar reintentos y reembolsos. También faltan el bot y la vinculación segura entre comprador y chat, autenticación de clientes, protección contra abuso, alojamiento HTTPS y copias de seguridad. No existe ninguna ruta que marque estos borradores como pagados.

La compra de estos productos digitales ocurre en la web independiente. No implementar un checkout cripto dentro de un bot/Mini App para sustituir el requisito de Telegram Stars.

## Archivos principales

- `components/storefront.tsx` y `app/globals.css`: tienda y comportamiento responsive.
- `lib/catalog.ts`: productos ficticios; no usar como inventario comercial.
- `lib/order-domain.ts` y `lib/order-store.ts`: validación y almacenamiento de borradores.
- `app/api/session/` y `app/api/orders/`: sesión y API local.
- `tests/`: pruebas de dominio, API y navegador.

Los cambios de esta primera versión se prepararon en la rama `feat/tienda-ayalanet-crypto`. Preparar el código y compilarlo no publica la tienda ni guarda automáticamente los avances en GitHub.
