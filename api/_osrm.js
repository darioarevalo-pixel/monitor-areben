// **OSRM: los km POR CALLE desde el local hasta cada punto.** El servidor público del proyecto
// (`router.project-osrm.org`), gratis y sin clave — lo pidió Bruno: por calle y sin costo (15-nov-2026).
//
// ⛔ Archivo `_`: NO es una ruta. Lo usa `api/_envios.js` para la tarifa por km de Rosario.
//
// # Lo que hay que saber de este servidor
//
// Es un servidor de DEMOSTRACIÓN: sin garantía y con un pedido de no pasar de 1 consulta por
// segundo. Por eso va **una sola consulta por local** (`/table`, un origen contra todos los destinos),
// no una por envío: la bandeja entera son 1 o 2 llamados. Medido: ~1 s por consulta.
//
// 🔴 **Si no contesta, devuelve `null` para todos y NO tira error**: la cotización sale `sin_km` y se
// tipea, igual que cualquier dirección que el mapa no resuelve. ⛔ No hay fallback a línea recta
// (ver `lib/envios/tarifa.core.js`).

const URL_OSRM = 'https://router.project-osrm.org/table/v1/driving/';

/**
 * Metros por calle desde `origen` hasta cada uno de `destinos` (`{lat,lng}`), en el mismo orden.
 * Un destino sin ruta, o el servicio caído, da `null` en su lugar.
 */
export async function metrosPorCalle(origen, destinos) {
  if (!destinos.length) return [];
  const coords = [origen, ...destinos].map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const url = `${URL_OSRM}${coords}?sources=0&annotations=distance`;
  for (let intento = 0; intento < 2; intento++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`OSRM contestó ${r.status}`);
      const j = await r.json();
      const fila = j && j.code === 'Ok' && Array.isArray(j.distances) ? j.distances[0] : null;
      // 🔴 Largo distinto ⇒ todo `null`: acomodar como se pueda cruza los km de una clienta con los
      // de la siguiente (la misma trampa que `alinear` cuida en Georef).
      if (!Array.isArray(fila) || fila.length !== destinos.length + 1) throw new Error('OSRM devolvió otra cantidad de puntos');
      return fila.slice(1).map((m) => (typeof m === 'number' && Number.isFinite(m) ? m : null));
    } catch {
      // un reintento y después se rinde callado: ver el encabezado
    }
  }
  return destinos.map(() => null);
}
