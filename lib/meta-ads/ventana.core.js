// Qué ventana de tiempo se puede pedir, y qué pasa cuando se pide una que no existe.
//
// # 🔴 El defecto que este archivo existe para cerrar
//
// Había cuatro lugares con la misma decisión escrita a mano —tres `dias` en `api/meta-ads.js` y el
// `Set` de `api/_meta-tendencia.js`—, y los cuatro hacían lo mismo con un pedido que no podían
// servir: **lo reemplazaban por el defecto, en silencio**. `?recurso=etapas&dias=7` contestaba los
// últimos 30 días y `dias: 30` en el cuerpo, sin una palabra sobre que la pregunta había sido otra.
//
// 🔑 **Lo caro no es la ventana equivocada, es que el número es plausible.** Un 170.674,98 de gasto
// no se ve distinto de otro: quien pidió 7 días leyó 30 y no tenía cómo enterarse. Se descubrió el
// 11-ago-2026 armando el segundo informe del analista de pauta, midiendo 1, 3, 7, 14, 30 y 90 —sólo
// 90 cambiaba—. Es la misma forma del calibrador que miraba 2 días de 90, y la misma de un ensayo
// que da verde con el defecto puesto: **ninguna prueba de lógica puede ver un dato plausible**.
//
// ⚠️ Ninguna pantalla lo sufría, y por eso duró: el selector ofrece 30 y 90 (`VentanaEtapas.tsx`) y
// `PresetMetaAds` amarra el otro lado por tipo. Lo sufre quien llama a la API sin pasar por la
// pantalla, que es exactamente el caso para el que la API sirve.
//
// # La regla, que es una sola
//
// **Ausente → el defecto. Servible → eso. Pedido y no servible → 400 nombrando lo que sí hay.**
// Sustituir en silencio es la única de las tres que miente, y es la que estaba.
import { UMBRALES_ETAPA } from './etapas.core.js';

/**
 * Las ventanas del censo de campañas (etapas, creativos, conjuntos). **Derivadas de
 * `UMBRALES_ETAPA`, no escritas de nuevo**: son las mismas dos que dibuja el selector, y escritas
 * aparte se despegan al primer cambio de criterio. La primera es el defecto.
 *
 * ⚠️ No es un rango libre a propósito: la ventana del censo decide si una pauta **está al aire**, y
 * con "Hoy" a las 9 de la mañana las tres etapas darían cero y la pantalla avisaría de un agujero
 * que no existe. Ver `VentanaEtapas.tsx`.
 */
export const DIAS_CENSO = [UMBRALES_ETAPA.dias, UMBRALES_ETAPA.diasAmplio];

/**
 * Los períodos del modo rendimiento (`?account=` y el overview). Son los `date_preset` de Graph que
 * la sección usa, y **el espejo del tipo `PresetMetaAds`** del cliente: un test amarra que no se
 * despeguen, porque el día que se despeguen la pantalla va a pedir algo que la puerta rechaza.
 */
export const PRESETS_RENDIMIENTO = [
  'today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'last_90d',
  'this_month', 'last_month', 'maximum',
];

/** `last_30d`: el período de siempre cuando no se pide ninguno. */
export const PRESET_DEFECTO = 'last_30d';

/** Ausente = no vino, vino vacío, o vino sólo con espacios. Un `0` NO es ausente: es un pedido. */
function ausente(crudo) {
  return crudo === undefined || crudo === null || String(crudo).trim() === '';
}

/** Enumera en criollo: `30 o 90`, `7, 14 o 30`. Va en el error, que lo lee una persona. */
function enumerar(valores) {
  const v = valores.map(String);
  if (v.length <= 1) return v.join('');
  return `${v.slice(0, -1).join(', ')} o ${v[v.length - 1]}`;
}

/**
 * La ventana en días de un pedido, o el motivo por el que no se puede servir.
 *
 * Recibe el valor **CRUDO** de la query, no un `parseInt` ya hecho: con el número ya parseado,
 * `dias=` (vacío) y `dias=abc` llegan los dos como `NaN` y se vuelven indistinguibles de no haber
 * pedido nada. La diferencia entre esos dos casos es justamente la que había que recuperar.
 *
 * Es estricto con la forma: `30abc` no es 30. `parseInt` lo aceptaría —lee hasta donde entiende y
 * descarta el resto—, que es la misma indulgencia que nos trajo hasta acá.
 *
 * @returns `{ dias }` o `{ error }`.
 */
export function elegirDias(crudo, permitidos = DIAS_CENSO) {
  const defecto = permitidos[0];
  if (ausente(crudo)) return { dias: defecto };
  const n = Number(String(crudo).trim());
  if (Number.isInteger(n) && permitidos.includes(n)) return { dias: n };
  return {
    error: `No puedo mirar una ventana de «${String(crudo)}» días acá. Las que hay son ${enumerar(permitidos)}.`,
  };
}

/**
 * El rango del modo rendimiento: `since`/`until` si vienen los dos bien formados, si no el preset.
 *
 * Devuelve las **dos** formas del mismo rango porque el handler necesita las dos y calcularlas por
 * separado era la quinta copia de esta decisión: `qs` es lo que viaja a Graph y `eco` es lo que se
 * devuelve en el cuerpo para que quien lee sepa qué se miró.
 *
 * 🔴 Una fecha mal formada **también** es un error, no un motivo para caer al preset: `since=ayer`
 * contestando los últimos 30 días es exactamente el defecto de arriba con otra ropa.
 *
 * @returns `{ qs, eco }` o `{ error }`.
 */
export function elegirRango(q) {
  const hayFechas = !ausente(q.since) || !ausente(q.until);
  if (hayFechas) {
    const since = String(q.since || '').trim();
    const until = String(q.until || '').trim();
    const fecha = /^\d{4}-\d{2}-\d{2}$/;
    if (!fecha.test(since) || !fecha.test(until)) {
      return { error: 'Un rango va con `since` y `until`, las dos en formato AAAA-MM-DD.' };
    }
    if (since > until) return { error: `El rango arranca después de terminar: ${since} → ${until}.` };
    return { qs: `time_range=${encodeURIComponent(JSON.stringify({ since, until }))}`, eco: { since, until } };
  }
  if (ausente(q.preset)) return { qs: `date_preset=${PRESET_DEFECTO}`, eco: PRESET_DEFECTO };
  const preset = String(q.preset).trim();
  if (!PRESETS_RENDIMIENTO.includes(preset)) {
    return { error: `No existe el período «${preset}». Los que hay: ${PRESETS_RENDIMIENTO.join(', ')}.` };
  }
  return { qs: `date_preset=${preset}`, eco: preset };
}
