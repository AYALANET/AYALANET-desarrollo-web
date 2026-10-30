# Decisión vigente: AyalaPay al final del desarrollo

El propietario eligió una tienda web independiente que cobrará USDT BEP20 y Binance mediante **AyalaPay**, desarrollado en «AYALANET Proveedores Codex Cloud». El 30/10/2026 indicó completar primero la tienda y dejar los medios de pago para el final.

Esta fase no conecta AyalaPay, no pide credenciales ni direcciones de recepción y no realiza pagos, compras a proveedores, entregas o mensajes. Los pedidos continúan como borradores. La sección financiera no registra esos borradores como ventas.

## Fuente de AyalaPay

Repositorio: https://github.com/AYALANET/ayalapay. Lectura de referencia: commit `811edbc2c4dc66e526a9e696b83d283966692816`, versión `0.2.0-sandbox`. Es una observación de esa revisión, no garantía del estado más reciente.

La API de pruebas ofrece creación y consulta de facturas autenticadas por comercio. Utiliza `binance_note` y `bep20_wallet`; sus identificadores y payloads no son compatibles con el conector WordPress AyalaSuite 0.4.0 antiguo. No apuntar ese conector al servidor nuevo. La revisión leída no permite ejecutar la aplicación en modo productivo y tiene integración real de Binance/BSC/WooCommerce pendiente. No reutilizar credenciales de otro chat ni copiar datos de su base local.

Una cuenta normal de Binance puede enviar USDT por BEP20. Eso es distinto de Binance Pay comercial. La vía de Binance por nota que desarrolla AyalaPay deberá demostrar acceso legítimo a la fuente de confirmación y validar destinatario, moneda, importe, nota y tiempo; no se presume operativa por existir su interfaz.

## Contrato pendiente para integrar la tienda

La integración final usará el contrato estable de AyalaPay, no una copia de su motor de pagos. Se necesitan URL productiva HTTPS, credencial exclusiva del comercio y entorno de pruebas separado. Las claves irán en secretos del servidor, nunca en navegador, Git ni chat.

Asociar el pedido exacto con su factura antes de aceptar confirmaciones. El servidor recalcula importes, conserva una cotización y debe consultar el estado autenticado de AyalaPay. Validar firma, fecha, nonce/evento y comercio; deduplicar eventos y bloquear dobles compras. Una página de retorno, una captura, un hash aportado por el comprador o un estado sandbox no confirman un pago real.

Definir pagos insuficientes, excesivos, tardíos, devoluciones y cambios de estado. La compra al proveedor y la entrega necesitan una cola persistente, comprobación tras respuestas inciertas y reanudación sin duplicar. Corregir/revalidar los problemas documentados en el control de reembolsos de FazerCards y reintentos de códigos CentralOne antes de automatizar operaciones reales.

La contabilidad recibirá únicamente cobros y costes verificados, con referencias únicas y moneda explícita. Ver FINANZAS.md. El libro financiero de esta tienda no debe duplicar un saldo de AyalaPay o WooCommerce: informe, saldo y fondos son conceptos diferentes.

## Telegram

Telegram exige Stars para bienes digitales vendidos mediante bots/Mini Apps: https://core.telegram.org/bots/payments-stars. La arquitectura aceptada mantiene catálogo y compra en la web independiente; Telegram se utilizará para atención y avisos. No introducir checkout cripto ni recarga de saldo en una Mini App para sustituir ese requisito.

La integración futura vinculará de forma verificable al comprador con su chat después de que inicie el bot. No aceptar un `chat_id` arbitrario del navegador para revelar pedidos o códigos. Mantener token y validación del webhook en el servidor. La entrega privada requiere comprobar autorización del destinatario.

## Paso a producción

Completar alojamiento persistente, copias restaurables, monitorización, controles de acceso/abuso, catálogo y condiciones comerciales reales. Probar el recorrido en un entorno aislado y después una operación real de alcance e importe expresamente autorizados. No activar despliegues automáticos ni anunciar que pagos/entregas funcionan con pruebas locales.
