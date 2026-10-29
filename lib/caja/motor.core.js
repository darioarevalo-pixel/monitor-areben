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
    // El depósito del ERP: el del TURNO de la venta (lo agrega `api/_caja.js`; el evento descuenta del Evento). Sin nada, el local.
    deposito: v.deposito === 'evento' ? 'evento' : 'local',
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
 * La venta de STUNNED que ⛔ pasa por GN (Bruno, 26-oct: Stunned va al ERP, ⛔ vuelta a GN): la misma forma de
 * `entradaDelMotor` pero de marca `stunned` y con `prueba` decidido por el que llama (`CAJA_STUNNED_PRUEBA`:
 * el ensayo general corre con `prueba: true`; la real, con `false`, SÍ mueve el libro). ⛔ lleva datos de GN.
 * @param {any} v la fila de `caja_venta` @param {{ prueba: boolean }} o
 */
export function entradaDelMotorErp(v, { prueba }) {
  const base = entradaDelMotor(v);
  const { gn_sale_id, gn_number, ...detalle } = base.detalle;
  return { ...base, marca: 'stunned', prueba: !!prueba, detalle };
}

/**
 * Las ventas en GN de los últimos días que el motor todavía ⛔ tiene, para el repaso.
 * @param {any[]} enGN filas de `caja_venta` en `en_gn` @param {Iterable<string>} yaEnMotor los `origen_ref` de `venta` con origen `caja`
 */
export function faltanEnMotor(enGN, yaEnMotor) {
  const ya = new Set(yaEnMotor);
  return enGN.filter((v) => v.estado === 'en_gn' && !ya.has(String(v.id)));
}

/**
 * 🔴 La venta que se ANULA EN GN (a mano en la web de GN; el cierre o el sync la anotan en
 * `caja_venta.anulada_en_gn`) se anula TAMBIÉN en el motor: si no, queda `confirmada` y el ERP la cuenta
 * vendida. Las que el motor tiene confirmadas y GN ya ⛔ tiene. La anulación es la del contrato
 * (`anularVenta`), con el motivo que dice quién la vio.
 * @param {Array<{ id: string, anulada_en_gn: { por?: string, en?: string } | null }>} anuladas filas de `caja_venta`
 * @param {Array<{ id: string, origen_ref: string, estado: string }>} enMotor las `venta` del motor con esos `origen_ref`
 * @returns {Array<{ venta_id: string, motivo: string, usuario: string }>}
 */
export function anularEnMotor(anuladas, enMotor) {
  const porRef = new Map(enMotor.map((v) => [String(v.origen_ref), v]));
  return anuladas
    .filter((a) => a.anulada_en_gn && porRef.get(String(a.id))?.estado === 'confirmada')
    .map((a) => ({
      venta_id: String(porRef.get(String(a.id)).id),
      motivo: `Anulada en GN (la vio ${a.anulada_en_gn.por === 'sync' ? 'el sync diario' : 'el cierre de caja'})`,
      usuario: 'gn',
    }));
}
