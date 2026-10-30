# Validación de la primera versión · 30/10/2026

Rama: `feat/tienda-ayalanet-crypto`. Trabajo sobre el repositorio `AYALANET/AYALANET-Desarrollo-web`; no se modificó el repositorio de proveedores ni la tienda WordPress.

## Resultados ejecutados

| Comprobación | Resultado |
| --- | --- |
| `npm test` | 10 pruebas correctas |
| `npm run lint` | Correcto |
| `npm run build` con certificados del sistema | Compilación y TypeScript correctos |
| `npm run test:e2e` | 3 casos correctos en Chromium: escritorio, móvil y API |
| `npm audit` | 0 vulnerabilidades conocidas en el resultado actual |
| `git diff --check` | Correcto |

Se actualizaron Next.js a 16.4.3 y React/React DOM a 19.3.1 y las dependencias vulnerables que npm pudo corregir sin forzar cambios incompatibles. Una auditoría sin coincidencias no certifica la seguridad completa del producto.

Se comprobó el recorrido de catálogo → filtro/buscador → carrito → pedido de prueba → historial → recarga. Se verificaron respuestas de API ante origen ajeno, precio manipulado, estado `paid` enviado por el cliente, reintentos con el mismo identificador, reutilización del identificador con otro carrito y consulta desde otra sesión. La persistencia tras cerrar y volver a abrir SQLite está cubierta por una prueba de dominio.

En el primer pase, una expectativa de formato de moneda utilizaba coma decimal; se corrigió a punto, según `es-PE`. También se detectó que Next.js normaliza la URL de loopback a localhost, lo que impedía guardar desde 127.0.0.1; se corrigió la comprobación de origen manteniendo el rechazo de solicitudes ajenas y permitiendo fijar el origen del despliegue. Se repitieron las pruebas afectadas y la suite final pasó.

Se comprobaron anchos de 320, 390, 768 y 1440 píxeles. No se detectó desbordamiento horizontal en los anchos móviles. Se inspeccionaron las capturas de escritorio y móvil; no se probó un dispositivo iPhone físico ni una interfaz dentro de Telegram.

## Evidencia visual

- [Escritorio](screenshots/desktop.png)
- [Móvil](screenshots/mobile.png)

## Límites

Todo el catálogo es ficticio. Los pedidos tienen prefijo DEMO, quedan como borrador y su pago permanece sin configurar. No hay facturas, direcciones de depósito, QR de pago, llamadas a proveedores, verificación de blockchain ni mensajes de bot. No se utilizaron credenciales de producción ni se hicieron transacciones reales.

La arquitectura y requisitos de la siguiente etapa están en [PAGOS-Y-TELEGRAM.md](PAGOS-Y-TELEGRAM.md). Esta versión no debe abrirse al público como tienda con cobros operativos. El almacenamiento SQLite y las sesiones anónimas son parte de la demostración; no hay todavía cuentas recuperables, protección global contra abuso ni configuración de producción.
