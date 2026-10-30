# Inventario, licencias y saldo de tienda

Esta fase permite probar el recorrido completo con **códigos ficticios y saldo sin valor monetario**. No acepta depósitos, no contiene claves de billeteras cripto y no se comunica con Binance, proveedores o AyalaPay.

## Recorrido de prueba

1. Crear una cuenta y conceder el rol administrativo mediante `node scripts/admin.ts usuario`, utilizando la misma base que la aplicación. No hay administrador predeterminado.
2. En Administración → Inventario y licencias, elegir un producto de códigos, completar lote/proveedor/coste/instrucciones y cargar un CSV/TXT. Solo se aceptan códigos `DEMO-`.
3. Validar el lote y confirmar la importación. El stock del producto pasa a calcularse a partir del inventario.
4. Con una cuenta de cliente, abrir `/billetera` y añadir los 50 USDT ficticios disponibles una sola vez por cuenta.
5. Guardar un pedido desde el carrito. En su detalle, confirmar **Comprar con saldo de prueba**. Si hay saldo y códigos válidos suficientes, se descuenta el saldo y se asignan todos los códigos en la misma transacción.
6. Pulsar **Mostrar mis códigos de prueba** en el detalle. Solo la cuenta propietaria puede recuperarlos; la administración ve referencias y estados, no códigos.
7. Para probar una devolución, Administración → Pedidos → Devolver saldo de prueba. Se repone exactamente el descuento original una sola vez. Las unidades quedan bloqueadas y jamás vuelven a venderse.

Los productos de recarga de juegos no son licencias: Free Fire y PUBG esperan la integración de sus proveedores. Un pedido mixto que incluya un producto sin códigos importados falla completo, sin descuento ni asignación parcial.

## Importación

Formato UTF-8, BOM opcional; comas o punto y coma, comillas CSV y CRLF admitidos. No se admiten campos multilínea. Alternativa: un código por línea, sin cabecera ni fecha.

```csv
code,expires_on
DEMO-STEAM-PRUEBA-001,2099-12-31
DEMO-STEAM-PRUEBA-002,
```

Hasta 500 unidades y 240 KB de texto por lote (cuerpo JSON máximo 256 KiB). Código `DEMO-` seguido de 4–180 letras ASCII, números, guiones o guiones bajos. La región debe coincidir con el producto. Caducidad opcional ISO `AAAA-MM-DD`, hasta el final de ese día UTC. Se rechazan fechas imposibles o ya vencidas.

La importación es completa o no se guarda ninguna fila. La detección global de duplicados usa una huella HMAC sin distinguir mayúsculas/minúsculas; incluye otros productos y códigos ya entregados/bloqueados. No se eliminan esos registros para permitir reimportarlos. La referencia de importación es idempotente; un reintento con otros datos devuelve conflicto. Los errores identifican filas sin repetir códigos.

Los costes de lote tienen seis decimales y acceso administrativo. No crean compras ni ganancias reales. La pantalla muestra los últimos 100 lotes y 200 unidades. El indicador de stock bajo usa un umbral fijo de tres códigos o menos; no envía notificaciones. No existe aún un importador programado de APIs ni sincronización con License Manager de WordPress.

## Stock y entrega

- Antes del primer lote, el catálogo conserva existencias ilustrativas. Estas no sirven para comprar con saldo.
- Después del primer lote, el stock procede de unidades disponibles y no vencidas; ya no se puede inflar desde el editor manual del catálogo.
- Se asignan primero las unidades con caducidad más próxima; después, las sin fecha. La lectura de existencias excluye vencidas sin depender de una tarea programada.
- SQLite `BEGIN IMMEDIATE` serializa compra, asignación y descuento. Dos conexiones que compiten por una unidad no pueden venderla dos veces.
- Se comprueba que los códigos se pueden descifrar antes de confirmar. Si falta stock, saldo o la clave no permite leer un código, se revierte la operación completa.
- La entrega local se realiza dentro de la transacción; no hay llamadas de red, trabajos externos pendientes ni una cola de proveedores implementada.
- Reintentar la compra del mismo pedido entregado devuelve el mismo pedido, sin repetir cargos ni entregar más unidades.
- Entregado no significa canjeado. Una devolución bloquea futuras entregas desde esta tienda, pero no revoca un código que el cliente ya conoce en otra plataforma.

Estados de pedido: `draft`, `cancelled`, `demo_delivered`, `demo_refunded`. Estado de pago: `not_configured`, `demo_debited`, `demo_refunded`. Ningún flujo marca un pago real como verificado. Cancelar solo aplica a borradores; una entrega exige devolución administrativa.

## Cifrado y recuperación

Los códigos se almacenan mediante AES-256-GCM con nonce aleatorio y datos autenticados que vinculan unidad/producto. Las claves de cifrado y de deduplicación se derivan por separado mediante HKDF. Los listados, auditoría y catálogo no incluyen el código ni el texto cifrado. La entrega se consulta por POST, con sesión propietaria y origen validado; las respuestas son `no-store`. La interfaz no copia códigos a localStorage, sesión del navegador ni archivos de exportación.

En el primer uso de inventario, el servidor genera una clave aleatoria de 32 bytes en `${STORE_DATABASE_PATH}.inventory.key`; por defecto `.data/store.sqlite.inventory.key`. Directorio 0700, archivo 0600. `INVENTORY_KEY_FILE` permite indicar otro archivo persistente privado. No debe estar en un directorio público ni en Git. La huella de la clave se conserva en SQLite para detectar una clave distinta.

**Respaldar la base y la clave original por separado y bajo control de acceso.** Perder la clave implica perder la posibilidad de leer las licencias. Si ya existe inventario y falta la clave, el servidor falla sin crear otra. No borrar ni regenerar la clave para corregir un error. Restaurar su copia original y comprobar entregas ficticias antes de continuar. La copia SQLite debe ser consistente con WAL; usar backup de SQLite o una parada controlada. Esta fase no incluye backups programados, recuperación automática, KMS ni rotación de clave.

## Billetera

Saldo de tienda por cuenta, no billetera criptográfica de custodia. Los importes son enteros en micro-USDT, sin cálculos monetarios en coma flotante. Movimientos `demo_credit`, `demo_purchase`, `demo_refund`, únicos por cuenta/tipo/referencia. Las rutas no permiten editar el saldo ni aceptar un importe de descuento del cliente.

El bono de 50 USDT es fijo y único, aunque se gaste o se repita la petición. Las compras toman el total calculado y guardado por el servidor. Las devoluciones invierten el descuento original. El historial muestra los últimos 100 movimientos; el saldo considera todos. La cuenta mantiene su identidad al recuperar acceso.

Una solicitud de recarga admite 1–1.000 USDT, hasta seis decimales, cinco solicitudes diarias por cuenta e idempotencia. Solo crea un registro `awaiting_integration`: **no acredita saldo, no genera una dirección, no solicita un envío y no se procesará como pago al integrar AyalaPay**. Las solicitudes de esta prueba deberán conservarse como pruebas o archivarse, nunca convertirse en depósitos reales.

## Integración posterior

AyalaPay será la última fase acordada. Antes de habilitar dinero hay que definir una sola fuente de verdad del saldo: no acreditar simultáneamente una billetera de AyalaPay, FSWW/WooCommerce y esta tienda por el mismo depósito. La adaptación real exige autenticidad de eventos, importe/red/token/destino exactos, confirmaciones, prevención de replays, conciliación y devoluciones controladas. No basta quitar el prefijo `demo` o aceptar un campo `paid` enviado por el cliente.

El informe financiero real permanece separado del saldo ficticio. Además, una recarga de saldo real no deberá contabilizarse automáticamente como ingreso por venta: distinguir depósitos, saldo pendiente de consumir, consumo, coste del producto y devoluciones antes de definir las reglas contables con el responsable del negocio.

Para vender el mismo catálogo en WordPress y esta tienda se necesitará un inventario autoritativo compartido o lotes completamente separados. No copiar las mismas licencias entre ambos. Automatizar APIs requerirá credenciales e integración con el contrato real del proveedor, reservas, reintentos idempotentes, conciliación y alertas. Telegram sigue pendiente y se usará según el modelo web/avisos acordado.
