# Decisiones y conexión de pagos

## Decisión del propietario · 30/10/2026

- Priorizar cobros Binance/USDT en una **tienda web independiente**, con Telegram para atención y avisos.
- La cuenta disponible es una cuenta normal de Binance; todavía no hay acceso confirmado a Binance Pay para comercios.
- La versión actual es una demostración funcional de catálogo y borradores. No recibe dinero, consulta blockchain, reserva stock real, compra a proveedores ni envía mensajes por Telegram.

## Qué significa cada forma de pago

**Binance Pay para comercios** es una integración con su propia API y autorización comercial. La cuenta de Binance del comprador o vendedor no demuestra por sí sola que esa API esté disponible. El conector oficial de Binance indica expresamente que las claves se crean en el panel de comerciantes. Referencias: [SDK oficial](https://github.com/binance/binance-pay-connector-python), [introducción de la API](https://developers.binance.com/docs/binance-pay/introduction). Se revisó el README del SDK oficial, commit `a4f6f33f14f0533da5c227552cf395ab6903c705`.

**USDT BEP20** es una transferencia de tokens en BNB Smart Chain. El comprador puede enviarla desde Binance u otra billetera compatible. Eso no convierte la operación en un cobro de Binance Pay. Una dirección pública de recepción no basta para afirmar que la tienda ya verifica depósitos automáticamente.

La siguiente etapa necesita elegir y configurar una de estas vías para USDT:

1. Un procesador que permita crear facturas de USDT en BNB Smart Chain, consultar su estado y verificar sus notificaciones firmadas.
2. Una integración propia con un receptor de fondos definido y un nodo/API de blockchain, con asignación inequívoca de cada depósito a su pedido. Una dirección compartida y una captura de pantalla no cumplen ese requisito.

El destino de los fondos y el método de asociación de pagos deben quedar definidos antes de mostrar direcciones o QR. No solicitar frases semilla, claves privadas ni contraseñas por chat. Una integración que solo comprueba depósitos no necesita permiso de retiro. Las credenciales se introducen mediante el mecanismo seguro del entorno de despliegue.

## Comprobaciones exigidas antes de entregar productos

El servidor debe verificar el pedido exacto, moneda, red, contrato permitido del token, decimales, destinatario, importe recibido y vigencia de la factura. Los importes on-chain deben conservarse como enteros de unidad mínima, sin cálculos de coma flotante. No asumir que todos los tokens llamados USDT son el mismo activo.

En la vía blockchain, comprobar transacción exitosa y evento de transferencia del contrato previsto; esperar la política de finalidad/confirmaciones acordada y contemplar reorganizaciones. Una consulta de saldo o un hash proporcionado por el comprador no bastan. Guardar una restricción única por red/transacción/evento para que un depósito no pague dos pedidos. Revisar pagos insuficientes, excesivos, tardíos o en otra red sin liberar productos automáticamente.

En la vía de procesador o Binance Pay, comprobar la firma de la notificación y consultar el estado oficial del cobro desde el servidor. Validar identidad e importe contra la factura guardada; rechazar eventos alterados, desconocidos o duplicados. La pantalla de retorno del navegador no confirma un pago.

Una vez confirmado el cobro, una cola persistente podrá tramitar la entrega con una clave única por pedido/proveedor. Los reintentos no deben comprar otra vez. Antes de entregar o reintentar, revisar cancelaciones y reembolsos. La integración y sus pruebas deben cubrir los dos defectos documentados anteriormente para FazerCards y CentralOne cuando se conecten esos proveedores.

Flujo previsto: `borrador → factura pendiente → pago en verificación → pagado → entrega pendiente → entregado`. Los estados de expiración, revisión, cancelación y reembolso se tratarán explícitamente. **La implementación actual solo crea borradores y no contiene ninguna ruta que marque un pedido como pagado.**

## Telegram

Telegram exige Stars para la venta de bienes digitales realizada mediante bots o Mini Apps: [guía oficial](https://core.telegram.org/bots/payments-stars), [condiciones para desarrolladores](https://telegram.org/tos/bot-developers). La arquitectura elegida mantiene el catálogo y la compra en la web independiente. No introducir un checkout cripto ni una recarga de saldo en un bot/Mini App para sustituir Stars en esas ventas.

Para los avisos posteriores se necesita un bot creado por el propietario y vincular de forma verificable al comprador con su chat después de que este inicie el bot. No aceptar un chat_id arbitrario del navegador para enviar códigos o datos de pedidos. Mantener el token del bot en el servidor, autenticar su webhook, deduplicar eventos y enviar avisos solo sobre pedidos verificados. La primera integración puede limitarse a avisos de estado y atención; la entrega de códigos privados requiere comprobación adicional de identidad.

## Antes de abrir al público

Se necesitan un dominio HTTPS, alojamiento persistente, copias de seguridad, autenticación recuperable de clientes, protección contra abuso y una base de datos adecuada para concurrencia/varias instancias. SQLite y las sesiones anónimas de 24 horas de esta demostración no sustituyen esa preparación. Configurar productos, precios y stock reales solo mediante una conexión autorizada; la tienda existente no se ha modificado.

Las pruebas comerciales y cualquier cobro real deben hacerse con alcance e importes previamente definidos. Ninguna comprobación local de esta primera versión autoriza a anunciar pagos o entregas reales como operativos.
