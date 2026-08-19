/**
 * Traer las ventas de HOY de Gestión Nube al espejo. **El trabajo, una sola vez.**
 *
 * # Por qué existe
 *
 * El espejo lo llena el sync diario a las 6 UTC (3 de la mañana en Argentina), así que durante todo
 * el día laboral cualquier pantalla que mire «lo de hoy» contesta con la foto de la madrugada. Pasó
 * de verdad el 13-ago-2026: el WINTER SALE arrancó a vender y el Resultado de la campaña decía
 * «no vendió» de todo, con el local vendiendo.
 *
 * La rama de `api/_liquidacion.js` lo resolvió para su pantalla. Cuando Ventas de Marketing necesitó
 * lo mismo para su contador diario, había dos caminos: copiar el bucle —el repo ya pagó eso con las
 * diez copias de `gnFetch`— o sacarlo acá. Salió acá **sin cambiar una línea de lo que hacía**.
 *
 * 🔑 **Lo que NO subió es el antirrebote, y es a propósito.** El de Liquidación vive en
 * `datos.ventasSync` de **la campaña**, y el de Marketing en una fila de `sync_state`: son dos
 * relojes distintos porque son dos preguntas distintas («¿ya sincronicé ESTA campaña?» vs «¿ya
 * traje las ventas de hoy?»). Fundirlos haría que apretar en una pantalla frene a la otra.
 *
 * ⚠️ **No es una función de Vercel**: el prefijo `_` lo garantiza.
 */

import { guardarVentasBatch } from '../scripts/lib/ventas-espejo.mjs';
import { dormir, GN_BASE, GN_TOKENS, gnFetch, PAUSA_GN } from './_gn.js';

/**
 * Cuántas páginas de 50 ventas se bajan como mucho. Es un techo de seguridad, no un tope esperado:
 * dos días de la marca más movida no llegan a una página. **Si muerde, se avisa** (`truncado`) en
 * vez de devolver un número corto que parece completo.
 */
export const TOPE_PAGINAS_VENTAS = 10;

/** La fecha de Argentina (YYYY-MM-DD) de un instante dado. */
function fechaAR(ms) {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

/**
 * Qué rango se le pide a Gestión Nube: **ayer y hoy**, no sólo hoy.
 *
 * 🔑 **El día lo decide Argentina, no el reloj de la función.** Vercel corre en UTC, así que a las
 * 21:30 de Buenos Aires `new Date().toISOString().slice(0,10)` ya devuelve el día siguiente: el
 * botón pediría las ventas de mañana y traería cero **justo a la hora en que el local cierra**, que
 * es cuando más se lo va a apretar.
 *
 * Ayer entra igual de gratis (una venta cargada pasada la medianoche puede quedar fechada el día
 * anterior) y el guardado es idempotente, así que retraerla no ensucia nada.
 */
export function ventanaVentasHoy(ahoraMs) {
  return { desde: fechaAR(ahoraMs - 86400000), hasta: fechaAR(ahoraMs) };
}

/**
 * Baja las ventas de la ventana y las escribe en el espejo.
 *
 * Devuelve `{ ok: true, ventas, detalles, clientes, truncado }`, o `{ ok: false, status, error }`
 * cuando Gestión Nube contesta mal — **no lanza por eso**: el llamador es un handler y el mensaje
 * de GN tiene que llegarle a la persona, no convertirse en un 500 anónimo.
 *
 * ⛔ **No mira permisos ni antirrebote**: los pone cada puerta. Acá adentro no hay forma de saber
 * quién llama, y una guarda a medias es peor que ninguna.
 */
export async function traerVentasDeHoy(supabase, store, ahoraMs) {
  const token = GN_TOKENS[store];
  if (!token) return { ok: false, status: 500, error: `Falta el token de Gestión Nube de ${store} en el servidor.` };

  const { desde, hasta } = ventanaVentasHoy(ahoraMs);
  const filas = [];
  let truncado = false;
  for (let pagina = 1; pagina <= TOPE_PAGINAS_VENTAS; pagina++) {
    const r = await gnFetch(
      `${GN_BASE}/ventas/obtener?from=${desde}&to=${hasta}&include_details=1&per_page=50&page=${pagina}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
    );
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      const detalle = j && (j.message || j.error) ? `: ${j.message || j.error}` : '';
      return { ok: false, status: 502, error: `Gestión Nube contestó ${r.status}${detalle}` };
    }
    const pag = Array.isArray(j?.data) ? j.data : [];
    filas.push(...pag);
    if (!j?.meta?.has_more_pages || !pag.length) break;
    if (pagina === TOPE_PAGINAS_VENTAS) { truncado = true; break; }
    await dormir(PAUSA_GN);
  }

  // `completo:false` es Zattia, cuya tabla `ventas` todavía no tiene cliente ni costo. El criterio
  // no se elige acá: es el mismo booleano que pasa su sync diario.
  const conteo = filas.length
    ? await guardarVentasBatch(supabase, filas, { completo: store !== 'zattia' })
    : { ventas: 0, detalles: 0, clientes: 0 };

  return { ok: true, truncado, ...conteo };
}
