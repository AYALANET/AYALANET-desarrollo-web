# Validación de tienda y finanzas · 30/10/2026

Trabajo en `feat/tienda-ayalanet-crypto`, continuando la base `d495a93`. El entorno se desconectó durante la fase de cuentas/soporte y se recuperó conservando los cambios. La revisión final incluye las correcciones pendientes y el panel de compras, ventas y ganancias solicitado después.

## Ejecutado

- `npm test`: **27/27** pruebas de dominio, persistencia, cuentas y finanzas.
- `npm run lint`: correcto.
- Build de producción con certificados del sistema habilitados para Turbopack: correcto; TypeScript correcto.
- `npm run test:e2e`: **7/7** recorridos de navegador/API correctos.
- `git diff --check`: correcto.
- `npm audit --omit=dev`: cero vulnerabilidades conocidas en dependencias de producción.
- Gitleaks 8.30.1, directorios `lib`, `components` y `app`, con salida redactada: sin hallazgos. No equivale a una auditoría integral del historial.

## Cobertura relevante

Las pruebas cubren cálculo del precio en servidor, entradas manipuladas, idempotencia, precios históricos tras cambios de catálogo, cancelación, aislamiento entre sesiones/cuentas y límites. Registro/entrada/recuperación conservan el historial correcto, rotan sesiones y claves y rechazan escaladas de rol. El identificador público de una cuenta no puede convertirse en una cookie válida.

Consultas: pedido vinculado del propietario, mensajes sin duplicados, respuesta administrativa, persistencia y cierre. Se corrigió que actualizar la respuesta cerrase visualmente la conversación. La caché de interfaz se separa por cuenta.

Finanzas: importes exactos hasta seis decimales, ventas/compras/comisiones/gastos/devoluciones/reintegros, pérdidas, margen sin división por cero, límites inclusivos UTC, referencias únicas y persistencia. Borradores y costes estimados no generan ingresos. La API de finanzas y el CSV rechazan clientes sin rol administrativo. No existe una ruta para registrar dinero o marcar pagos. El CSV conserva la precisión y evita fórmulas.

Navegador: catálogo → ficha → carrito persistente → revisión → borrador → cancelación; cuenta y recuperación; consultas; administración de precios y respuestas; finanzas, período, exportación y estimaciones privadas. Las pruebas usan datos ficticios y una base SQLite temporal independiente, incluyendo la promoción local de sus administradores.

## Pantallas

Revisadas capturas de catálogo y panel financiero en escritorio/móvil. Los recorridos de cliente comprueban anchuras 320, 390 y 768 px sin desbordamiento horizontal; finanzas también a 390 px. Se generaron capturas de carrito/revisión, cuenta (sin la clave de recuperación), ayuda y administración. No equivale a probar físicamente Safari/iPhone ni Telegram.

`docs/screenshots/finance.png` muestra cero operaciones reales y un coste estimado ilustrativo de Steam. Los movimientos financieros sintéticos usados por la prueba se eliminan de su base temporal antes de capturar ese informe. No representan facturación de AYALANET.

## Límites

No se publicó la aplicación, configuró una cuenta real de administrador, conectó WordPress/Telegram/AyalaPay, consultó claves de otros chats ni realizó compras, pagos o envíos. Las cuentas de prueba no se guardan en Git. Las bases de desarrollo no son copias de producción.

Esta fase ofrece una tienda funcional de desarrollo. Permanecen pendientes fuentes de productos/costes reales, integraciones de cobro y entrega, infraestructura/monitorización/respaldos, endurecimiento para publicación y condiciones comerciales definitivas. Los documentos de la primera demostración conservan sus resultados históricos.
