/**
 * La venta de la Caja, anotada TAMBIÉN en el motor (la venta propia del ERP, `motor/venta/`). 🔑 Bruno,
 * 14-oct, opción (a): después del ERP GN desaparece ⇒ la Caja vende al motor sí o sí; mientras conviven,
 * vende a GN como siempre y ADEMÁS al motor con `prueba: true` (se guarda entera y ⛔ mueve el libro: el
 * libro todavía cuenta las ventas de la Caja desde `caja_venta`, ver `contrato-venta.md` «Al cortar GN»).
 *
 * 🔴 El motor ⛔ frena a la cajera: si falla, la venta en GN sale igual y se anota el error en el log. La
 * que quedó afuera la sube el repaso (`pendientesDelMotor`) en la próxima vuelta del POS.
 *
 * Se anota la venta YA EN GN (`en_gn`): una que espera la transferencia ⛔ es venta todavía, y una con error
 * de GN se puede cancelar. Al cortar GN el momento pasa a ser el cobro.
 *
 * JS plano (sin red ni base): lo importa `api/_caja-motor.js`, que corre en Node sin el compilador de Next.
 */

/** Cuántos días para atrás mira el repaso: lo de más atrás que siga afuera es un error que hay que leer. */
export const DIAS_REPASO = 3;
/** Cuántas sube el repaso por vuelta (el techo de la función es 30 s y comparte la vuelta con GN). */
export const REPASO_POR_VUELTA = 20;

/** Las columnas de `caja_venta` que necesita `entradaDelMotor`. */
export const COLUMNAS_MOTOR = 'id, store, estado, renglones, pagos, subtotal, total, paga_con, usuario, creada_en, en_gn_en, gn_sale_id, gn_number, mp_pago_id';

/**
 * La entrada de `registrarVenta` (contrato §1) desde una fila de `caja_venta`: las líneas y los pagos
 * son los que la Caja ya guardó (la forma de `Fila` y `Pago`), ⛔ se rearman. La clave es `caja_venta.id`,
 * el mismo uuid que el `integration_id` de GN ⇒ anotarla dos veces devuelve la misma venta.
 * @param {any} v la fila de `caja_venta`
 */
export function entradaDelMotor(v) {
  const n = (x) => Number(x || 0);
  return {
    origen: 'caja',
    origen_ref: String(v.id),
    marca: String(v.store),
    canal: 'local',
    deposito: 'local',
    usuario: (v.usuario && String(v.usuario).trim()) || 'caja',
    prueba: true,
    ocurrida_en: v.creada_en,
    lineas: (v.renglones || []).map((r) => ({
      product_id: Number(r.product_id), size_id: Number(r.size_id), cantidad: Number(r.cantidad),
      precio: n(r.precio), descuento: n(r.descuento), rebaja: n(r.rebaja), importe: n(r.importe),
      ...(r.sku ? { sku: String(r.sku) } : {}),
    })),
    pagos: (v.pagos || []).map((p) => ({
      cuenta: Number(p.cuenta), base: n(p.base ?? p.monto), porcentaje: n(p.porcentaje), descuento: n(p.descuento), redondeo: n(p.redondeo), monto: n(p.monto),
    })),
    subtotal: n(v.subtotal),
    total: n(v.total),
    detalle: {
      gn_sale_id: v.gn_sale_id ?? null, gn_number: v.gn_number ?? null,
      ...(v.paga_con != null ? { paga_con: Number(v.paga_con) } : {}),
      ...(v.mp_pago_id ? { mp_pago_id: String(v.mp_pago_id) } : {}),
    },
  };
}

/**
 * Las ventas en GN de los últimos días que el motor todavía ⛔ tiene, para el repaso.
 * @param {any[]} enGN filas de `caja_venta` en `en_gn` @param {Iterable<string>} yaEnMotor los `origen_ref` de `venta` con origen `caja`
 */
export function faltanEnMotor(enGN, yaEnMotor) {
  const ya = new Set(yaEnMotor);
  return enGN.filter((v) => v.estado === 'en_gn' && !ya.has(String(v.id)));
}
