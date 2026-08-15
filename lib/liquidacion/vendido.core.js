/**
 * «Esto se vendió por sale» — el cruce entre la bitácora y las ventas.
 *
 * La pregunta que contesta, en las palabras con las que la pidió Bruno: *un pico de ventas no se
 * tiene que leer como demanda real si el producto estaba en oferta*. Concretamente: **¿hubo un
 * `poner` sin su `sacar` el día en que se hizo esa venta?**
 *
 * Va en `.js` plano por lo mismo que `bitacora.core.js`: lo corre `api/_liquidacion.js`, que es un
 * handler de Node sin el compilador de Next adelante y no puede importar TypeScript. `vendido.ts`
 * es el re-export tipado que usa la app. Una sola implementación: si el servidor y la pantalla
 * contaran distinto, la marca diría un número y la columna de al lado otro.
 *
 * ⛔ **Acá no se decide en qué ventana cae cada venta (7d / 30d / 90d / el mes).** El servidor
 * devuelve las líneas con su fecha y **el bucketing lo hace el navegador con los mismos cortes que
 * el ETL** (`lib/etl/computar.ts`), que es el que dibujó el número de al lado. Cortar acá con un
 * `now()` de servidor —UTC, y con la hora corrida— dejaría marcas de «9 de 8», que es peor que no
 * tener marca: obliga a desconfiar de las dos columnas.
 */

/**
 * Las ventanas en las que cada producto tuvo una oferta **escrita por el Monitor**.
 *
 * Abre en cada `poner` y cierra en el `sacar` siguiente. 🔑 **Cierra en `sacar` aunque el evento
 * deje un precio** (`precioA` no nulo): «volver a la oferta que tenían» es una salida del sale, y
 * lo que se vende después sale al precio de siempre de ese producto, no al de la campaña.
 *
 * Un `poner` sobre una ventana abierta **no abre otra** (reprecificar y volver a aplicar es un
 * cambio de precio adentro del mismo sale) y un `sacar` sin nada abierto se ignora.
 *
 * Se trabaja **por día**, no por hora: `date_sale` es una fecha pelada y el evento un timestamp,
 * así que preguntar si la venta de las 11 fue antes o después de la escritura de las 12:30 no se
 * puede contestar con lo que hay. El día del `poner` y el del `sacar` **cuentan como en sale**: el
 * error se paga marcando de más, que hace mirar un producto, y no de menos, que es no enterarse.
 *
 * @param {{pid: string|number, modo: string, cuando: string}[]} eventos en cualquier orden
 * @returns {Map<string, {desde: string, hasta: string|null}[]>} por pid, ventanas en `YYYY-MM-DD`
 */
export function ventanasDe(eventos) {
  const porPid = new Map();
  for (const e of eventos || []) {
    const pid = String(e.pid ?? '');
    if (!pid || !e.cuando) continue;
    const arr = porPid.get(pid) || [];
    arr.push(e);
    porPid.set(pid, arr);
  }

  const out = new Map();
  for (const [pid, lista] of porPid) {
    lista.sort((a, b) => String(a.cuando).localeCompare(String(b.cuando)));
    const ventanas = [];
    for (const e of lista) {
      const dia = String(e.cuando).slice(0, 10);
      const abierta = ventanas.length && ventanas[ventanas.length - 1].hasta === null
        ? ventanas[ventanas.length - 1]
        : null;
      if (e.modo === 'poner') {
        if (!abierta) ventanas.push({ desde: dia, hasta: null });
      } else if (abierta) {
        abierta.hasta = dia;
      }
    }
    if (ventanas.length) out.set(pid, ventanas);
  }
  return out;
}

/** ¿Ese producto tenía la oferta puesta ese día? Los dos extremos cuentan. */
export function enSale(ventanas, pid, fecha) {
  const vs = ventanas.get(String(pid));
  if (!vs || !fecha) return false;
  return vs.some((v) => fecha >= v.desde && (v.hasta === null || fecha <= v.hasta));
}

/** El día del primer `poner` de toda la bitácora, o `null`. Es desde dónde hay algo que cruzar. */
export function primerDiaEnSale(ventanas) {
  let min = null;
  for (const vs of ventanas.values()) {
    for (const v of vs) if (!min || v.desde < min) min = v.desde;
  }
  return min;
}

/**
 * Las líneas de venta que cayeron adentro de una ventana, agrupadas por producto, variante y día.
 *
 * Se agrupa —y no se devuelve línea por línea— porque dos unidades del mismo talle el mismo día son
 * el mismo hecho para todo lo que las va a mirar, y porque el payload lo paga el navegador.
 *
 * `quantity` en `null` es **una** unidad, igual que en Reposición y en el resultado de campaña: la
 * fila existe porque algo se vendió, descartarla perdería la venta.
 *
 * @param {{pid: string|number, sid: string|number, fecha: string, q: number|null}[]} lineas
 * @returns {{pid: string, sid: string, fecha: string, u: number}[]}
 */
export function lineasEnSale(lineas, ventanas) {
  const acc = new Map();
  for (const l of lineas || []) {
    const pid = String(l.pid ?? '');
    const fecha = String(l.fecha || '').slice(0, 10);
    if (!pid || !fecha) continue;
    if (!enSale(ventanas, pid, fecha)) continue;
    const u = Number(l.q ?? 1) || 0;
    if (u <= 0) continue;
    const sid = String(l.sid ?? '');
    const k = `${pid}|${sid}|${fecha}`;
    const ya = acc.get(k);
    if (ya) ya.u += u;
    else acc.set(k, { pid, sid, fecha, u });
  }
  return [...acc.values()];
}
