# Validación de tienda, inventario y billetera · 30/10/2026

Trabajo en `feat/tienda-ayalanet-crypto`. Esta fase continúa `a42deca` y añade inventario cifrado, importación por lotes, billetera de prueba y entrega privada. Las pruebas se ejecutaron con SQLite temporal, códigos ficticios y saldo sin valor monetario.

## Ejecutado

- `npm test`: **38/38** pruebas de dominio, persistencia, cuentas, finanzas, inventario y billetera.
- `npm run lint`: correcto.
- Build de producción con certificados del sistema habilitados para Turbopack: correcto; TypeScript correcto.
- `npm run test:e2e`: **8/8** recorridos de navegador/API correctos.
- `git diff --check`: correcto.
- Dependencias y lockfile sin cambios. La comprobación previa `npm audit --omit=dev` dio cero vulnerabilidades conocidas en producción; no se repitió en esta fase.
- Gitleaks 8.30.1, directorios `lib`, `components` y `app`, con salida redactada: sin hallazgos. No equivale a una auditoría integral del historial.

## Cobertura relevante

Las pruebas cubren cálculo del precio en servidor, entradas manipuladas, idempotencia, precios históricos tras cambios de catálogo, cancelación, aislamiento entre sesiones/cuentas y límites. Registro/entrada/recuperación conservan el historial correcto, rotan sesiones y claves y rechazan escaladas de rol. El identificador público de una cuenta no puede convertirse en una cookie válida.

Consultas: pedido vinculado del propietario, mensajes sin duplicados, respuesta administrativa, persistencia y cierre. Se corrigió que actualizar la respuesta cerrase visualmente la conversación. La caché de interfaz se separa por cuenta.

Finanzas: importes exactos hasta seis decimales, ventas/compras/comisiones/gastos/devoluciones/reintegros, pérdidas, margen sin división por cero, límites inclusivos UTC, referencias únicas y persistencia. Borradores y costes estimados no generan ingresos. La API de finanzas y el CSV rechazan clientes sin rol administrativo. No existe una ruta para registrar dinero real o marcar pagos reales. El bono fijo de billetera solo crea saldo ficticio. El CSV conserva la precisión y evita fórmulas.

Navegador: catálogo → ficha → carrito persistente → revisión → borrador → cancelación; cuenta y recuperación; consultas; administración de precios y respuestas; finanzas, período, exportación y estimaciones privadas. Las pruebas usan datos ficticios y una base SQLite temporal independiente, incluyendo la promoción local de sus administradores.

Inventario y billetera: CSV con BOM/comillas/separadores, validación de filas, región, fecha, duplicados globales y límite de 500 unidades; importación completa o rechazada; cifrado autenticado y detección de clave errónea/datos alterados; pérdida de clave sin regeneración; costes privados y stock derivado; vencimientos y selección FEFO; saldo insuficiente y fallo a mitad de entrega con rollback; recargas pendientes sin acreditar; bono único; compras y devoluciones idempotentes; códigos no reutilizables tras entrega/devolución; persistencia tras reabrir SQLite y recuperar cuenta. Dos workers con conexiones SQLite independientes compiten por el último código: una sola compra obtiene la unidad y descuenta saldo.

El recorrido nuevo de navegador carga un CSV, valida e importa, crea una cuenta, añade saldo ficticio, prepara una recarga sin crédito, guarda un pedido, compra con saldo, consulta la entrega privada y ejecuta una devolución administrativa. Verifica aislamiento entre cuentas, permisos de inventario/devolución, origen ajeno, rechazo de importes manipulados, respuestas sin caché, ausencia de códigos en listados/localStorage y separación del informe financiero real.

## Pantallas

Revisadas capturas de billetera en escritorio/móvil e inventario en escritorio, además de las capturas previas de catálogo y finanzas. Los recorridos de cliente comprueban anchuras 320, 390 y 768 px sin desbordamiento horizontal; finanzas también a 390 px; billetera e inventario a 320 y 390 px. Se corrigió el desbordamiento del encabezado administrativo en 320 px. Se generaron capturas de carrito/revisión, cuenta (sin la clave de recuperación), ayuda y administración. No equivale a probar físicamente Safari/iPhone ni Telegram.

`docs/screenshots/finance.png` muestra cero operaciones reales y un coste estimado ilustrativo de Steam. Los movimientos financieros sintéticos usados por la prueba se eliminan de su base temporal antes de capturar ese informe. No representan facturación de AYALANET.

Las capturas `wallet.png`, `wallet-mobile.png`, `inventory.png`, `inventory-mobile.png` y `delivery.png` documentan el recorrido nuevo. El saldo de 28,50 USDT mostrado resulta de 50 ficticios menos una compra de prueba de 21,50. La solicitud de recarga de 20 USDT permanece sin acreditar. Las capturas no representan depósitos, ventas ni existencias reales.

## Límites

No se publicó la aplicación, configuró una cuenta real de administrador, conectó WordPress/Telegram/AyalaPay, consultó claves de otros chats ni realizó compras, pagos o envíos. Las cuentas de prueba no se guardan en Git. Las bases de desarrollo no son copias de producción.

Esta fase ofrece una tienda funcional de desarrollo. Permanecen pendientes fuentes de productos/costes reales, integraciones de cobro y entrega, infraestructura/monitorización/respaldos, endurecimiento para publicación y condiciones comerciales definitivas. Los documentos de la primera demostración conservan sus resultados históricos.
