/**
 * El saneado de los **costos por material** que llegan al guardado de Norte.
 *
 * 🔑 **Vive acá y no adentro del handler porque una regla encerrada en la capa de salida no se
 * puede ejercer.** Es el verbo que escribe la deuda de la empresa: tiene que poder probarse contra
 * los casos raros —un bloque repetido, un costo que no es número, unidades en cero— sin levantar
 * una sesión y una base.
 *
 * ⛔ **Acá NO se decide qué cuenta como «costeado».** Esa regla es una sola y vive en
 * `estadoDeCompra` (`lib/norte/core.ts`): un costo en 0 se guarda como vino y el motor lo lee como
 * «todavía no lo sé». Repetir el umbral acá sería tener dos lugares que pueden discrepar.
 *
 * `.js` porque lo importa `api/_norte.js`, que corre en el Node de Vercel y no compila TypeScript.
 */

/** Número finito, o `null`. El string vacío es «no vino», no cero. */
function aNumero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Deja la lista lista para guardar: un costo por bloque, sin repetidos y sin basura.
 *
 * - **Sin `bloqueId` no entra**: un costo que no cuelga de ningún material no se puede ni sumar ni
 *   nombrar.
 * - **Un costo negativo no entra.** No existe un material que devuelva plata, y guardarlo bajaría
 *   el total de la compra sin que nada se vea raro.
 * - ⚠️ **`unidades` distingue «no lo cargaron» (`null` ⇒ las del bloque, que son la fuente viva) de
 *   «cargaron cero»**. Por eso no se puede usar `|| 0`: un cero legítimo se perdería, y un `null`
 *   guardado como cero haría que ese material no sume nada.
 * - **El primero gana** entre dos filas del mismo bloque: la segunda pisaría a la primera en
 *   silencio, y no hay forma de saber cuál quiso quien la mandó.
 */
export function sanearCostos(raw) {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set();
  const out = [];
  for (const c of raw) {
    const bloqueId = String((c && c.bloqueId) || '').trim();
    if (!bloqueId || vistos.has(bloqueId)) continue;
    const costo = aNumero(c && c.costo);
    if (costo === null || costo < 0) continue;
    const cru = c && c.unidades;
    const unidades = cru === null || cru === undefined || cru === '' ? null : aNumero(cru);
    vistos.add(bloqueId);
    out.push({ bloqueId, nombre: String((c && c.nombre) || ''), costo, unidades });
    if (out.length >= 50) break;
  }
  return out;
}
