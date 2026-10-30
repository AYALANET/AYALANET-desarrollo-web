# Compras, ventas y ganancias

## Separación de datos

La sección financiera es privada del administrador. Su API, CSV y actualización de costes comprueban el rol en servidor. No se incluyen costes ni márgenes en el catálogo público, los pedidos del comprador o las respuestas de sesión.

Hay dos fuentes separadas:

- **Movimientos registrados:** cobros, compras al proveedor, comisiones, devoluciones al cliente, reintegros del proveedor y gastos. La tabla comienza vacía. No hay una ruta HTTP para crear estos movimientos, marcar un pedido pagado ni simular dinero. `createFinanceStore.record` es una frontera interna para futuros adaptadores de evidencia verificada; hoy solo se ejercita desde pruebas aisladas.
- **Estimaciones por producto:** coste del proveedor y comisión por unidad introducidos por administración. No modifican el precio de venta, no registran compras y no generan ingresos. Un coste desconocido es `null`, no cero. El resultado puede ser negativo; la interfaz lo muestra como pérdida estimada.

Los borradores, incluidos los cancelados, nunca entran en la contabilidad. Las pruebas de navegador usan una base separada y eliminan solo los movimientos con origen `e2e-fixture` antes de capturar el panel financiero vacío. La captura muestra costes ilustrativos de prueba, no costes obtenidos de proveedores.

## Fórmulas

- Ventas netas = cobros − devoluciones al cliente.
- Compras netas = compras al proveedor − reintegros del proveedor.
- Ganancia registrada = ventas netas − compras netas − comisiones − gastos.
- Margen = ganancia registrada / ventas netas × 100. Se omite cuando las ventas netas son cero o negativas.
- Ganancia estimada por unidad = precio de ejemplo − coste estimado − comisión estimada.

El margen no es el recargo sobre el coste. Ejemplo: venta 10, compra 6 y comisión 1 dejan 3 USDT y un margen del 30 %.

El informe utiliza la fecha del movimiento en UTC, con ambos días seleccionados incluidos. Es un resultado de movimientos por período: una devolución posterior aparece en su período, sin reescribir el pasado. No es una cuenta de resultados por devengo ni una liquidación fiscal. Es provisional si faltan costes, impuestos u otros gastos. Una compra de inventario y su venta en períodos distintos pueden alterar el resultado temporal. No anunciar beneficio definitivo sin conciliación.

## Exactitud, historial y futuras integraciones

Los movimientos usan enteros en millonésimas de USDT, con hasta seis decimales. Se rechazan importes inválidos, referencias inconsistentes, fechas no canónicas y monedas diferentes; no se convierte USD a USDT automáticamente. Los totales verifican el rango de cálculo seguro. El margen se expresa en puntos básicos truncados; los importes no se redondean en CSV.

La clave única `(source, external_id)` hace idempotente el registro: una repetición idéntica no duplica dinero y cambiar su contenido devuelve conflicto. Cada movimiento conserva el pedido, importe y fecha originales. El catálogo actual no recalcula costes históricos. Una devolución es un movimiento separado, nunca una edición destructiva del cobro.

Antes de conectar un adaptador se debe validar el origen, la confirmación real, el pedido exacto, la moneda y la referencia externa. Una comisión ya descontada en una liquidación no debe restarse otra vez: definir si el evento contiene bruto o neto. Los importes on-chain de 18 decimales requieren una política explícita y auditable para normalizarlos a seis; no truncarlos silenciosamente. El sistema no demuestra ingresos solo porque una API acepte JSON.

Se permiten períodos de 1 a 366 días y hasta 100.000 movimientos. Un exceso pide reducir el período, no recorta silenciosamente los totales. CSV exporta movimientos del período, incluidos origen y referencia, con protección frente a fórmulas de hoja de cálculo. Nunca incluye credenciales ni datos de clientes.

AyalaPay y los proveedores se integrarán al final del desarrollo. La consulta financiera es funcional, pero no tiene una fuente de operaciones reales conectada.
