/**
 * Las reglas duras de un canje: el grafo de estados y el tope. **Las comparten los dos handlers.**
 *
 * Existe por una razón concreta: desde la tanda 2 la creadora elige productos desde el link
 * público, así que `api/_canje-portal.js` tiene que poder frenarla cuando se pasa del acuerdo. Y el
 * control del tope **no puede vivir en la pantalla**: la pantalla se le puede pisar, y dos pestañas
 * abiertas se pasarían del tope sin que ninguna de las dos lo viera.
 *
 * Importarlo desde `_canjes.js` no servía: ese archivo arrastra `_auth.js` y `permisos.core.js`
 * enteros, que es todo el sistema de sesión del monitor, para usar una función de quince líneas en
 * el único endpoint del módulo que **no tiene sesión** y está abierto a internet. Es el mismo
 * movimiento que ya se hizo con `lib/canjes/marcas.js` por el mismo motivo.
 *
 * ⚠️ Sigue siendo un **espejo a mano** de `lib/canjes/tipos.ts`: los `api/*.js` corren en Node sin
 * pasar por el compilador de Next y no pueden importar TypeScript. `tests/canjes-flujo.test.ts`
 * compara los dos lados y es lo único que mantiene honesta la duplicación.
 *
 * No es una ruta: el prefijo `_` lo deja fuera de la cuenta de funciones serverless (el proyecto
 * está en el tope del plan Hobby).
 */

/**
 * El ciclo de vida. Espejo de `TRANSICIONES` en `lib/canjes/tipos.ts`.
 *
 * ⚠️ `propuesta` (nuestra firma) y `enviada` (su respuesta) son dos esperas distintas, y **no hay
 * atajo de `propuesta` a `acuerdo`**: firmar puertas adentro no es que ella haya dicho que sí.
 */
export const TRANSICIONES = {
  propuesta: ['enviada', 'rechazado'],
  enviada: ['acuerdo', 'no_acepto'],
  rechazado: [],
  no_acepto: [],
  acuerdo: ['preparando'],
  preparando: ['en_curso'],
  en_curso: ['cerrado'],
  cerrado: [],
  cancelado: [],
};

export const ESTADOS = Object.keys(TRANSICIONES);

export const TERMINALES = ['rechazado', 'no_acepto', 'cerrado', 'cancelado'];

/** Espejo de `puedeIr`. Cancelar sale de cualquier estado que no haya terminado. */
export function puedeIr(desde, hasta) {
  if (hasta === 'cancelado') return !TERMINALES.includes(desde);
  return (TRANSICIONES[desde] || []).includes(hasta);
}

/** Espejo de `itemsVivos`: un quitado o un sin stock no está en el pedido. */
export function itemsVivos(items) {
  return (items || []).filter((i) => i.estado === 'propuesto' || i.estado === 'confirmado');
}

/**
 * Espejo de `controlDelTope`. Devuelve `null` si entra, o el motivo en criollo si se pasa.
 *
 * El control es **duro** en los dos modos: sobre la suma de PVP, o sobre el TOTAL de unidades.
 * Sobre el *detalle* de las unidades (que sean un jean y no otra remera) es blando a propósito: la
 * categoría de Gestión Nube no es lo bastante prolija para colgar de ahí un bloqueo.
 *
 * El mensaje sale en criollo porque **ahora también lo lee ella**, en el teléfono, desde el portal.
 */
export function seVaDelTope(canje, items) {
  const vivos = itemsVivos(items);
  if (canje.tope_tipo === 'unidades') {
    const tope = (canje.tope_unidades || []).reduce((a, u) => a + (Number(u.cantidad) || 0), 0);
    if (!tope) return null;
    const usado = vivos.reduce((a, i) => a + (Number(i.cantidad) || 0), 0);
    return usado > tope
      ? `Se pasa del acuerdo: ${usado} ${usado === 1 ? 'unidad' : 'unidades'} contra las ${tope} acordadas.`
      : null;
  }
  if (canje.tope_pvp == null) return null;
  const usado = vivos.reduce((a, i) => a + (Number(i.pvp_unit) || 0) * (Number(i.cantidad) || 0), 0);
  const tope = Number(canje.tope_pvp);
  return usado > tope
    ? `Se pasa del tope: $${usado.toLocaleString('es-AR')} contra los $${tope.toLocaleString('es-AR')} acordados.`
    : null;
}

/** Espejo de `retiroLocalDisponible`. Hoy sólo BDI: es la única marca con local. */
export function retiroLocalDisponible(store) {
  return store === 'bdi';
}

/**
 * Espejo de `listoParaEntregar`. Devuelve `null` si el local ya puede entregarlo, o el motivo.
 *
 * Devuelve el motivo y no un booleano por lo mismo que `seVaDelTope`: el que lo lee es alguien
 * parado en el mostrador con la persona enfrente, y "no se puede" sin decir por qué lo deja
 * llamando por teléfono.
 *
 * ⛔ **No exige llegar al tope**: autorizar 3 y entregar 2 es un caso normal, no un error.
 */
export function noSePuedeEntregar(canje, items) {
  if (!canje.retiro_local) return 'Este canje no es de retiro en el local.';
  if (!retiroLocalDisponible(canje.store)) return 'Esta marca no tiene local.';
  if (canje.entregado_at) return 'Este canje ya figura entregado.';
  if (canje.estado !== 'acuerdo' && canje.estado !== 'preparando') return 'Todavía no está acordado.';
  const vivos = itemsVivos(items);
  if (!vivos.length) return 'Cargá lo que se lleva antes de entregarlo.';
  if (vivos.some((i) => !i.product_id || !i.size_id)) {
    return 'Hay un producto sin artículo de Gestión Nube: sin eso no se puede descontar el stock.';
  }
  return seVaDelTope(canje, items);
}

/**
 * Cuánto le queda, para mostrárselo mientras elige. Es `controlDelTope` visto desde su lado.
 *
 * ⚠️ **En modo unidades no viaja plata.** No es un olvido: el portal es lo único del módulo abierto
 * a internet, y el precio de lo que se le manda no es asunto de nadie más. En modo monto sí viaja,
 * porque sin el precio de cada cosa y el saldo ella no puede administrarse el tope sola.
 */
export function saldoDelTope(canje, items) {
  const vivos = itemsVivos(items);
  if (canje.tope_tipo === 'unidades') {
    const tope = (canje.tope_unidades || []).reduce((a, u) => a + (Number(u.cantidad) || 0), 0);
    const usado = vivos.reduce((a, i) => a + (Number(i.cantidad) || 0), 0);
    return { modo: 'unidades', tope: tope || null, usado };
  }
  const usado = vivos.reduce((a, i) => a + (Number(i.pvp_unit) || 0) * (Number(i.cantidad) || 0), 0);
  return { modo: 'monto', tope: canje.tope_pvp == null ? null : Number(canje.tope_pvp), usado };
}
