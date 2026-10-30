# AYALANET · tienda web y Telegram

Tienda web independiente en desarrollo. Incluye catálogo de ejemplo, fichas, carrito persistente, cuentas, recuperación de acceso, pedidos de prueba, consultas privadas y administración con compras, ventas y ganancias, inventario cifrado y billetera de saldo ficticio.

**No recibe dinero, compra a proveedores ni entrega productos reales.** AyalaPay se integrará al final, por decisión del propietario. Telegram se reserva para atención y avisos. No se modificó ayalanet.com, sus proveedores ni el repositorio de AyalaPay.

## Ejecutar

Node.js 24 y npm, con las versiones fijadas en el lockfile:

```bash
npm ci
NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1 npm run dev
```

En Codex se puede usar `npm ci --cache /workspace/.cache/npm`. La opción de certificados conserva la verificación TLS a través del proxy; no desactiva seguridad.

La base SQLite vive en `.data/store.sqlite`, ignorada por Git, con directorio privado y archivo de permisos 0600. `STORE_DATABASE_PATH` permite elegir otra ubicación persistente. Se usa WAL: los respaldos deben ser consistentes, mediante el mecanismo de backup de SQLite o una parada controlada; no copiar solo el archivo principal mientras hay escrituras. Las migraciones actuales añaden tablas/columnas y conservan los borradores anteriores.

Fijar `STORE_ORIGIN` al origen HTTPS canónico, sin ruta ni barra final, cuando se publique detrás de un proxy. La sesión usa cookies HttpOnly, SameSite Strict y Secure en producción. No se confía en un X-Forwarded-Host arbitrario.

## Recorrido de cliente

- `/`: búsqueda, categorías, filtro de disponibilidad, orden por precio/nombre y carrito.
- `/producto/{id}`: región, plataforma, requisitos, instrucciones y productos relacionados.
- `/checkout`: cantidades, total y revisión explícita antes de guardar el borrador.
- `/pedidos` y `/pedido/{id}`: búsqueda, filtro, detalle, seguimiento y cancelación de borradores.
- `/billetera`: saldo de prueba, historial, bono ficticio único y solicitudes de recarga pendientes de AyalaPay.
- `/cuenta`: registro con usuario/contraseña, entrada, salida y recuperación con clave de un solo uso.
- `/ayuda`: preguntas frecuentes, consultas vinculadas a pedidos propios, mensajes y cierre.
- `/condiciones`: descripción de la prueba y datos almacenados. Las condiciones comerciales definitivas siguen pendientes.

El carrito contiene únicamente referencias/cantidades y se guarda en el navegador. Los precios y existencias los valida el servidor. Los reintentos conservan el mismo pedido, incluso si el catálogo cambia después. Un borrador admite cancelación o una compra con saldo ficticio cuando hay códigos de prueba importados. Los estados `demo_delivered` y `demo_refunded` permiten probar entrega y devolución; nunca representan dinero real. Los borradores conservan `paymentStatus: not_configured`.

Las cuentas permiten recuperar pedidos en otros dispositivos. Al entrar se vinculan únicamente los borradores y consultas de la sesión invitada; los datos de otra cuenta no se trasladan. Las contraseñas usan scrypt y sal aleatoria. La recuperación rota la clave, cambia la contraseña y revoca todas las sesiones anteriores. La clave de recuperación se muestra una vez y no se almacena en texto claro. No existe recuperación por email ni envío de correos. Las sesiones nuevas duran hasta siete días.

## Panel privado

`/admin` necesita una cuenta con rol de administrador. No hay usuario predeterminado, contraseña inicial ni endpoint público para obtener ese rol.

1. Crear una cuenta desde la tienda.
2. El operador autorizado del servidor concede el rol desde la consola, usando la misma base que la aplicación:

```bash
node scripts/admin.ts nombre_de_usuario
# Retirar el rol:
node scripts/admin.ts nombre_de_usuario --revoke
```

En **Inventario y licencias** se importan lotes CSV/TXT de códigos DEMO-, se detectan duplicados, se calcula stock y se bloquean unidades. La compra con saldo descuenta y asigna los códigos en una transacción. La devolución administrativa no recicla códigos entregados. El archivo privado de cifrado debe respaldarse junto con una copia consistente de la base: perderlo impide recuperar los códigos. Ver [INVENTARIO-Y-BILLETERA.md](docs/INVENTARIO-Y-BILLETERA.md) para formatos, pruebas, clave y límites.

El panel permite consultar pedidos, responder/cerrar consultas, cambiar precio/disponibilidad/existencias del catálogo de prueba y ver la actividad administrativa. Los controles de autorización se ejecutan en el servidor, no solo en la interfaz. Las listas operativas están limitadas a los últimos 100 pedidos/consultas; las tarjetas indican ese alcance.

En **Compras y ganancias** se puede filtrar por fechas UTC, consultar cobros/compras/comisiones/devoluciones/gastos y exportar CSV. Los costes y márgenes del catálogo son privados. Consultar [FINANZAS.md](docs/FINANZAS.md) para fórmulas y límites. El informe real comienza vacío; los borradores, estimaciones, importaciones, recargas y compras con saldo ficticio jamás registran ingresos reales.

## Validación

```bash
npm test
npm run lint
NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1 npm run build
npm run test:e2e
```

E2E levanta un servidor de producción local en el puerto 3100 con una base temporal independiente. Usa Chromium `/usr/bin/chromium` si está instalado o `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. En otro equipo: `npx playwright install chromium`. La promoción de administradores, importaciones, saldo y movimientos financieros de prueba ocurren exclusivamente en esa base temporal. No se envían mensajes ni se hacen peticiones de pago.

Las capturas están en `docs/screenshots/`. El informe de validación de esta fase se registra en [VALIDACION-TIENDA.md](docs/VALIDACION-TIENDA.md).

## Pendientes para abrir al público

AyalaPay, proveedores y Telegram no están conectados. Faltan catálogo comercial validado, condiciones de venta/privacidad definitivas, alojamiento HTTPS persistente, operación de backups y monitorización, controles de abuso de producción y MFA administrativo. SQLite de una instancia y los límites locales de esta prueba no sustituyen una arquitectura de producción distribuida. Las sesiones invitadas pueden renovarse y no son una barrera global contra abuso.

No desplegar esta versión automáticamente ni anunciar pagos/entregas operativos. Antes de integrar dinero: completar y verificar AyalaPay, corregir las incidencias documentadas de proveedores y probar el recorrido completo, reintentos, conciliación y devoluciones. Ver [PAGOS-Y-TELEGRAM.md](docs/PAGOS-Y-TELEGRAM.md).

Rama de trabajo: `feat/tienda-ayalanet-crypto`. El código y sus commits no incluyen la base de datos ni publican la aplicación. Guardar una cuenta o consulta en una instancia no la guarda en GitHub.
