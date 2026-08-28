/**
 * **Lo que cuesta un reclamo.** En `.js` plano porque lo necesita `casos.core.js` —y por ahí
 * `api/_reclamos.js`, que ⛔ no puede importar TypeScript— además de la pantalla de Decidir.
 * Mismo arreglo que `destinoDe`, `perfilDe` y `permisos.core.js`: la regla que deriva plata vive en
 * el núcleo, ⛔ no en la pantalla.
 *
 * 🔴 **Por qué se mudó** (28-ago-2026): `costo_caso` es el único número que dice cuánto cuestan los
 * errores propios, y **lo calculaba SÓLO la pantalla**. Desde el 27-ago hay una rama que resuelve el
 * reclamo sin pasar por ella —el local contesta la oferta de retención— y ahí el costo se quedaba en
 * el de la decisión vieja: R-0022 mostraba *«Se le devuelve $13.491»* al lado de *«Lo que nos costó
 * $20.682»*, con $6.500 de un envío que ya no existe. La retención existe para **abaratar** el caso;
 * si funciona y el número no baja, ⛔ nunca se puede leer si valió la pena.
 */

/** Redondeo a dos decimales. La plata se compara, y `0.1 + 0.2` ⛔ no es `0.3`. */
export function redondear(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Número positivo, o 0. **Acepta strings a propósito**: Tienda Nube manda los precios y las
 * cantidades como texto (`price: "8990.00"`, `quantity: "1"`), así que exigir `number` acá hacía
 * que toda orden real calculara 0. Se descubrió probando contra una orden de verdad.
 */
export function positivo(n) {
  const v = typeof n === 'string' ? Number(n) : n;
  return typeof v === 'number' && isFinite(v) && v > 0 ? v : 0;
}

/**
 * Qué nos costó el caso. Sin esto no se puede responder después "cuánto nos costaron las
 * devoluciones este mes" ni con qué proveedor se van en fallas.
 *
 * La unidad perdida se valúa **a costo**: es lo que se fue por la puerta cuando el producto se le
 * regala al cliente. Si vuelve (a stock o a fallas) no se perdió, se recuperó.
 *
 * 🔑 **`destino: null` = no hay producto en juego** (una demora, una cancelación), y eso vale CERO.
 * Antes este parámetro no aceptaba `null` y la pantalla tapaba el hueco mandando `'falla'`: una
 * demora —donde el cliente recibió lo que compró y se lo queda porque es suyo— se contaba con el
 * costo entero de la mercadería como si la hubiéramos perdido.
 *
 * @param {{ montoDevuelto: number, envioVuelta?: number|null, envioReemplazo?: number|null,
 *           items: Array<{ costo?: unknown, cantidad?: unknown }>,
 *           destino: string|null }} opciones
 * @returns {number}
 */
export function costoDelCaso(opciones) {
  const { montoDevuelto, items, destino } = opciones;
  const envios = positivo(opciones.envioVuelta) + positivo(opciones.envioReemplazo);
  // Solo se pierde la unidad si el cliente se lo queda; si vuelve —sana o fallada— se recupera.
  const unidadPerdida = destino === null || destino === 'stock' || destino === 'no_salio'
    ? 0
    : (Array.isArray(items) ? items : []).reduce((s, it) => s + positivo(it && it.costo) * positivo(it && it.cantidad), 0);
  return redondear(positivo(montoDevuelto) + envios + unidadPerdida);
}

/**
 * **Lo que costó el caso, derivado de la FILA.** Es `costoDelCaso` con las tres condiciones que
 * decidían cuánto entra de cada envío — y que vivían **sueltas adentro de `DecidirReclamo.tsx`**.
 *
 * 🔴 Por eso el número se quedaba viejo en cuanto algo lo tocaba fuera de esa pantalla: la regla no
 * era de nadie más. Las tres condiciones, y por qué:
 *
 *  - **el envío de vuelta entra sólo si el producto vuelve** (`retorno_decidido`): si no vuelve, esa
 *    etiqueta ⛔ no se paga. Es lo que apaga aceptar la oferta de retención, y era el $6.500 que
 *    R-0022 seguía contando de una decisión que ya no existía;
 *  - **el envío de ida entra sólo en la reposición** (`otra_unidad`): es la única resolución que
 *    manda un paquete cuyo flete es un costo del caso;
 *  - **con cupón ⛔ no sale plata de la caja hoy**, igual que `monto_acordado` queda en `null`.
 *    Cuánto vale un cupón frente al reembolso sigue siendo **B6**, sin contestar.
 *
 * ⚠️ **La unidad se valúa a `costo`, y si el ítem ⛔ no lo tiene cargado vale CERO.** Las dos filas
 * reales de BDI lo tienen en `null`, así que hoy «Lo que nos costó» cuenta **sólo la plata**. No es
 * un defecto de esta cuenta: es un dato que falta, y el número se mueve solo el día que se cargue.
 *
 * @param {{ compensacion?: string|null, monto_total?: unknown, retorno_decidido?: boolean|null,
 *           envio_costo?: unknown, envio_ida_costo?: unknown,
 *           items?: Array<{ costo?: unknown, cantidad?: unknown }>, destino_prenda?: string|null }} fila
 * @returns {number}
 */
/**
 * **Las siete columnas que `costoDeLaFila` lee.** Es su contrato, escrito una sola vez: de acá sale
 * el `select` del handler y de acá sale la pregunta *«¿este gesto cambió el costo?»*. Con dos
 * listas escritas a mano, agregar una entrada y olvidarse de una de las dos deja el número viejo
 * **sin decir nada** — que es exactamente el defecto que esto vino a cerrar.
 */
export const ENTRADAS_DEL_COSTO = [
  'compensacion', 'monto_total', 'retorno_decidido', 'envio_costo', 'envio_ida_costo', 'items', 'destino_prenda',
];

export function costoDeLaFila(fila) {
  const f = fila || {};
  return costoDelCaso({
    montoDevuelto: f.compensacion === 'cupon' ? 0 : positivo(f.monto_total),
    envioVuelta: f.retorno_decidido === true ? positivo(f.envio_costo) : 0,
    envioReemplazo: f.compensacion === 'otra_unidad' ? positivo(f.envio_ida_costo) : 0,
    items: Array.isArray(f.items) ? f.items : [],
    destino: f.destino_prenda == null ? null : f.destino_prenda,
  });
}
