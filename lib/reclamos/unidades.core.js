// La UNIDAD: qué se espera de cada producto de un reclamo, y cuál de ellos ya está en la mano.
//
// En `.js` plano porque la lee `api/_reclamos.js` (`recibir` tiene que saber en qué lista escribir)
// y también la app — mismo arreglo que `casos.core.js` y `efectos.core.js`.
//
// # Por qué existe
//
// Hasta el 25-ago-2026 un reclamo tenía **un solo destino y una sola recepción para todo**:
// `destino_prenda` en la fila, y `estado='recibido'` para el reclamo entero. Eso alcanza mientras
// vuelva un producto. Medido antes de tocar nada, en BDI **3 de los 10 reclamos tienen dos
// productos** (una falla, un `sin_stock` y el `mal_armado`) ⇒ el caso de dos no es hipotético, es
// el 30 %, y con una sola respuesta para los dos:
//
//   - no se puede decir que uno vuelve sano a stock y el otro entra como falla;
//   - no se puede decir que **llegó uno** y falta el otro: se recibe entero o nada.
//
// # Los dos ROLES, que ⛔ no son dos ítems de la misma lista
//
//   `items`            → lo que el cliente COMPRÓ.
//   `items_correctos`  → sólo en `mal_armado`: lo que le llegó POR ERROR.
//
// ⚠️ El nombre `items_correctos` miente y se conserva porque la columna ya está en producción: lo
// que guarda es lo INCORRECTO, lo que se mandó de más. Lo dice la pantalla que lo carga
// ("¿Qué recibió realmente?").
//
// 🔴 **Y de ahí salió el defecto que encontró construir esto: en un `mal_armado` lo que VUELVE es
// el equivocado, y la bandeja de retornos mostraba `items`** — o sea que Depósito abría la caja
// esperando el producto que el cliente había comprado, que es justo el único que nunca salió del
// depósito. Con el contenido equivocado a la vista, "llegó lo que esperábamos" no lo puede
// contestar nadie.

/** En qué lista viven las unidades que VUELVEN, según el caso. */
export function deDondeVuelve(motivo) {
  return motivo === 'mal_armado' ? 'items_correctos' : 'items';
}

/**
 * El destino de UNA unidad. **Ausente = el del reclamo**, que es el default explícito.
 *
 * Mismo patrón que el `disparador` de Solicitudes: el dato vive en la cabecera y el ítem lo puede
 * pisar. Sin el default habría que escribirle el destino a cada renglón de los reclamos de un solo
 * producto, que son la mayoría, para no cambiar nada.
 */
export function destinoDeUnidad(item, fila) {
  const propio = item && item.destino;
  return propio || (fila && fila.destino_prenda) || null;
}

/**
 * ¿Esta unidad vuelve al depósito?
 *
 * La regla estaba escrita adentro de `decidir` (`destino === 'stock' || (destino === 'falla' &&
 * retorno_decidido)`) y la pantalla la volvía a deducir por su cuenta. Es la que decide si el
 * reclamo queda esperando algo, así que vive en un solo lugar.
 *
 * ⚠️ `'falla'` sigue necesitando el segundo dato: una unidad fallada vuelve **sólo si se pidió el
 * retorno** — a veces se le dice al cliente que se la quede igual. Lo que ya ⛔ no depende del
 * retorno es `'regalada'`: si está sana y se la queda, no vuelve nunca. Hasta el 26-ago-2026 ese
 * caso también entraba por `'falla'`, y ésa era la sobrecarga.
 */
export function laUnidadVuelve(destino, retornoDecidido) {
  if (destino === 'stock') return true;
  return destino === 'falla' && retornoDecidido === true;
}

/**
 * Las unidades que hay que **sacar del stock de Gestión Nube** y todavía no se sacaron.
 *
 * Es la otra mitad de `loQueFaltaLlegar`: una no vuelve y la otra sí, pero las dos son un paso
 * físico pendiente sobre una unidad concreta. 🔑 **Sale de la misma lista que las que vuelven**
 * (`deDondeVuelve`) porque en un `mal_armado` la que se le regala es la que se mandó por error, no
 * la que compró — la que compró nunca salió del depósito.
 *
 * ⚠️ Sólo `'regalada'`. La unidad fallada que el cliente se queda ⛔ no entra acá: ésa la descuenta
 * el alta en Fallas, que es donde además queda valuada. Contarla en los dos lados la restaría dos
 * veces.
 */
export function loQueFaltaDescontar(fila) {
  const campo = deDondeVuelve(fila && fila.motivo);
  const lista = Array.isArray(fila && fila[campo]) ? fila[campo] : [];
  const unidades = [];
  lista.forEach((item, i) => {
    if (destinoDeUnidad(item, fila) !== 'regalada') return;
    if (item && item.baja_at) return;
    unidades.push({ i, item, destino: 'regalada' });
  });
  return { campo, unidades };
}

/**
 * Sella las unidades regaladas que ya salieron de Gestión Nube. `indices` en `null` = todas las que
 * faltaban.
 *
 * ⚠️ Volver a sellar una que ya estaba ⛔ no le pisa la fecha ni el número de venta, igual que
 * `recibirUnidades`: la primera vez que salió es el dato, y pisarlo borraría a qué venta técnica
 * hay que ir a mirar si algo no cierra.
 */
export function descontarUnidades(fila, indices, at, venta) {
  const campo = deDondeVuelve(fila && fila.motivo);
  const lista = Array.isArray(fila && fila[campo]) ? fila[campo] : [];
  const pendientes = new Set(loQueFaltaDescontar(fila).unidades.map((u) => u.i));
  // ⚠️ `Number` como en `recibirUnidades`: los índices llegan del JSON del POST y un "0" de texto
  // no matchea un 0 en un Set — sellaría cero unidades sin decir por qué.
  const elegidas = indices == null
    ? pendientes
    : new Set(indices.map((n) => Number(n)).filter((n) => pendientes.has(n)));
  let descontadas = 0;
  const nueva = lista.map((item, i) => {
    if (!elegidas.has(i)) return item;
    descontadas++;
    return { ...item, baja_at: at, baja_venta: venta == null ? null : String(venta) };
  });
  const faltan = loQueFaltaDescontar({ ...fila, [campo]: nueva }).unidades.length;
  return { campo, lista: nueva, descontadas, faltan, seDescontoTodo: faltan === 0 };
}

/**
 * Las unidades que estamos esperando, con su índice en la lista donde viven.
 *
 * @returns {{ campo: string, unidades: Array<{ i: number, item: object, destino: string|null }> }}
 */
export function unidadesQueVuelven(fila) {
  const campo = deDondeVuelve(fila && fila.motivo);
  const lista = Array.isArray(fila && fila[campo]) ? fila[campo] : [];
  const unidades = [];
  lista.forEach((item, i) => {
    const destino = destinoDeUnidad(item, fila);
    if (laUnidadVuelve(destino, fila && fila.retorno_decidido === true)) unidades.push({ i, item, destino });
  });
  return { campo, unidades };
}

/** Las que todavía no aparecieron. Es lo que el andén "esperando" tiene que mostrar. */
export function loQueFaltaLlegar(fila) {
  return unidadesQueVuelven(fila).unidades.filter((u) => !u.item.recibida_at);
}

/**
 * Marcar que llegaron algunas unidades (o todas, si no se dice cuáles).
 *
 * Devuelve la lista nueva para guardar y **si con eso ya no falta nada**, que es lo único que puede
 * mover el reclamo a `recibido`: mientras falte un producto, el reclamo sigue esperando aunque
 * alguien haya tildado el otro.
 *
 * ⚠️ Volver a tildar una que ya estaba ⛔ no le pisa la fecha: la primera vez que se vio es el dato.
 *
 * @param {object} fila
 * @param {number[]|null} indices índices en la lista que devuelve `unidadesQueVuelven`; null = todas
 * @param {string} at ISO del momento
 */
export function recibirUnidades(fila, indices, at) {
  const { campo, unidades } = unidadesQueVuelven(fila);
  const esperadas = new Set(unidades.map((u) => u.i));
  const pedidas = indices == null
    ? esperadas
    : new Set(indices.map((n) => Number(n)).filter((n) => esperadas.has(n)));
  const lista = (Array.isArray(fila[campo]) ? fila[campo] : []).map((item, i) => (
    pedidas.has(i) && !item.recibida_at ? { ...item, recibida_at: at } : item
  ));
  const faltan = unidades.filter((u) => !lista[u.i].recibida_at);
  return { campo, lista, recibidas: pedidas.size, faltan: faltan.length, todoLlego: faltan.length === 0 };
}

/**
 * Lo que impide recibir, en criollo, o `null` si se puede.
 *
 * 🔑 Existe porque **el cero afirma**: sin esto, un reclamo sin ninguna unidad esperada contestaría
 * "todo llegó" —`todoLlego` sobre una lista vacía es `true`— y el reclamo pasaría a `recibido` sin
 * que nadie haya abierto una caja. El caso más probable es el `mal_armado` al que no se le cargó
 * qué le llegó por error: ahí lo que vuelve es justamente eso, y sin el dato no se espera nada.
 */
export function trabaParaRecibir(fila) {
  const { unidades } = unidadesQueVuelven(fila);
  if (unidades.length) return null;
  if (fila && fila.motivo === 'mal_armado' && !(Array.isArray(fila.items_correctos) && fila.items_correctos.length)) {
    return 'falta cargar qué le llegó por error: en un pedido mal armado es lo único que vuelve';
  }
  return 'este reclamo no espera ningún producto de vuelta';
}

/**
 * Los cinco destinos posibles de una unidad. Vive acá porque ahora lo valida el handler **por
 * unidad** y no sólo para la fila; `DESTINO_LABEL` (`tipos.ts`) es la cara con nombre de cada uno y
 * el compilador exige que sean estos mismos.
 *
 * 🔴 **Es una lista blanca: lo que no está acá lo rechaza el handler.** `'regalada'` entró el
 * 26-ago-2026 con la partición del descuento, y olvidarla habría dejado la pantalla ofreciendo un
 * destino que el servidor contesta con un error.
 */
export const DESTINOS = ['stock', 'falla', 'regalada', 'no_salio', 'perdida'];

export function esDestino(v) {
  return DESTINOS.includes(String(v));
}

/**
 * Pisar el destino de algunas unidades, por índice.
 *
 * 🔑 **Va como un mapa índice → destino y ⛔ NO reenviando los productos.** Los productos salen de
 * la orden de Tienda Nube: dejar que la decisión los reescriba entera abre la puerta a que una
 * pantalla vieja los pise con menos datos de los que había. Acá sólo se toca el destino.
 *
 * `null` borra el propio y la unidad vuelve al destino del reclamo — ⛔ no es "sin destino".
 *
 * @returns {{ error: string }|{ lista: object[] }}
 */
export function aplicarDestinos(items, destinos) {
  const lista = Array.isArray(items) ? items : [];
  if (destinos == null) return { lista };
  if (typeof destinos !== 'object' || Array.isArray(destinos)) return { error: 'el destino por producto va como un mapa' };
  const entradas = Object.entries(destinos);
  for (const [k, v] of entradas) {
    const i = Number(k);
    if (!Number.isInteger(i) || i < 0 || i >= lista.length) return { error: `no hay ningún producto ${k} en este reclamo` };
    if (v != null && !esDestino(v)) return { error: `"${v}" no es un destino` };
  }
  const mapa = new Map(entradas.map(([k, v]) => [Number(k), v]));
  return {
    lista: lista.map((item, i) => {
      if (!mapa.has(i)) return item;
      const v = mapa.get(i);
      // Sacar la clave, y no dejarla en null, es lo que hace que "ausente = el del reclamo" siga
      // siendo la única lectura posible: un `destino: null` guardado se lee igual pero se ve como
      // una decisión tomada.
      const { destino, ...resto } = item;
      return v == null ? resto : { ...resto, destino: v };
    }),
  };
}
