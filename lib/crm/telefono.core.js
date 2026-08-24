/**
 * El teléfono del cliente, como dato que se compara.
 *
 * ⚠️ **Es JS plano y no TypeScript a propósito**: lo importa `api/_crm.js`, y los handlers de
 * `api/*.js` corren en Node sin pasar por el compilador de Next. Misma razón y misma disciplina
 * que `lib/permisos.core.js`: **una sola implementación, nunca copiada**. `lib/crm/core.ts` la
 * re-exporta para la app, así que los ~8 archivos que ya importaban `normalizeArgPhone` de ahí no
 * se enteran.
 *
 * Acá vive `normalizeArgPhone` —que estaba en `core.ts` desde el port del legacy (13122)— y lo que
 * hizo falta agregarle para el panel de WhatsApp: **buscar un cliente a partir del número del
 * chat**. Son dos problemas distintos y por eso son dos funciones:
 *
 *   - normalizar   : "0383 4270554" → "5493834270554". Es lo que ya hacía para armar los `wa.me`.
 *   - encontrar    : dado ese número, ¿cuál de los 12.500 clientes es? El padrón guarda el
 *                    teléfono **tal como se cargó en Gestión Nube**, sin normalizar, así que la
 *                    comparación es entre normalizados de los dos lados.
 */

/**
 * normalizeArgPhone (13122). Devuelve dígitos listos para wa.me, o '' si no se
 * puede normalizar. El '' es lo que cuenta como "sin teléfono" en los KPIs.
 */
export function normalizeArgPhone(phone) {
  if (!phone) return ''
  let p = String(phone).replace(/[^\d]/g, '')
  if (!p) return ''
  if (p.startsWith('00')) p = p.slice(2)
  if (p.startsWith('54')) {
    return p.startsWith('549') ? p : '549' + p.slice(2)
  }
  if (p.startsWith('0')) p = p.slice(1)
  if (p.length === 10) return '549' + p
  if (p.length === 11 && p.startsWith('9')) return '54' + p
  if (p.length >= 12 && p.length <= 13) return p
  return ''
}

/**
 * Cuántos dígitos del final se comparan en el segundo intento.
 *
 * Ocho es el abonado argentino completo (sin característica). Menos que eso empieza a chocar de
 * verdad entre 12.500 números; más, y deja de tolerar justamente lo que este intento existe para
 * tolerar.
 */
const COLA = 8

/**
 * Los últimos `COLA` dígitos de lo que sea que esté escrito, o '' si hay menos que eso.
 *
 * 🔑 **Sale de los dígitos CRUDOS y no del normalizado, y ahí está toda la gracia.** Los teléfonos
 * que este segundo intento existe para rescatar son justamente los que `normalizeArgPhone`
 * **rechaza**: '38834270554' tiene once dígitos y no arranca ni con 54 ni con 9, así que no hay
 * forma de leerlo y devuelve ''. Si la cola se calculara sobre eso, el cliente con el número mal
 * cargado ni siquiera entraría al índice y este intento no rescataría a nadie.
 *
 * Se exporta porque **los leads no pueden usar `indexarTelefonos`**: ese índice descarta todo lo
 * que no tenga id numérico entero (`Number.isInteger`), y los ids de los leads son texto
 * (`l1756…_12345`). Pasarlos por ahí no da error: devuelve vacío siempre, en silencio. Se hace el
 * mismo cruce de dos pasos sobre la lista, que son 40 y no 12.500.
 */
export function cola(texto) {
  const d = String(texto || '').replace(/[^\d]/g, '')
  return d.length >= COLA ? d.slice(-COLA) : ''
}

/**
 * Arma el índice teléfono → ids a partir de las filas del padrón (`[{id, phone}]`).
 *
 * Un teléfono puede caer en más de un cliente —el mismo local cargado dos veces, la dueña y su
 * hermana con el mismo celular— y eso no se resuelve acá: se devuelven todos y decide el que
 * consulta. Esconderlo eligiendo el primero es cómo se registra un contacto en la ficha equivocada.
 */
export function indexarTelefonos(filas) {
  const exacto = new Map()
  const porCola = new Map()
  for (const f of filas || []) {
    const id = Number(f && f.id)
    if (!Number.isInteger(id)) continue

    const n = normalizeArgPhone(f.phone)
    if (n) {
      const yaExacto = exacto.get(n)
      if (yaExacto) { if (!yaExacto.includes(id)) yaExacto.push(id) } else exacto.set(n, [id])
    }

    // La cola se indexa aunque el número no se haya podido normalizar: son los que este índice
    // tiene que rescatar.
    const c = cola(f.phone)
    if (!c) continue
    const yaCola = porCola.get(c)
    if (yaCola) { if (!yaCola.includes(id)) yaCola.push(id) } else porCola.set(c, [id])
  }
  return { exacto, porCola }
}

/**
 * Busca el cliente del número que está abierto en WhatsApp.
 *
 * Dos intentos, en este orden:
 *
 *  1. **Igualdad de normalizados.** Es el caso normal y el único que no puede equivocarse.
 *  2. **Los últimos 8 dígitos** —el abonado, sin característica—. Existe por los teléfonos que en
 *     Gestión Nube están cargados con un dígito de más o de menos adelante (medido el 23-ago-2026:
 *     Mariano Borgiattino, Octavio Passarini, Julieta Sosa), que **`normalizeArgPhone` ni siquiera
 *     puede leer**: para ellos el primer intento no existe. Con dos candidatos no se elige: se
 *     devuelven los dos y el panel pregunta, porque marcar un contacto en la ficha de otro es peor
 *     que no encontrar nada.
 *
 * Devuelve `{ ids, via }` — `via` es 'exacto' | 'cola' | '' y viaja hasta la pantalla: cuando el
 * cruce fue por la cola, el panel lo dice, porque es el único caso en el que puede estar mal.
 */
export function buscarPorTelefono(indice, telefono) {
  if (!indice) return { ids: [], via: '' }
  const n = normalizeArgPhone(telefono)
  if (n) {
    const exacto = indice.exacto.get(n)
    if (exacto && exacto.length) return { ids: [...exacto], via: 'exacto' }
  }
  const c = cola(telefono)
  const aprox = c ? indice.porCola.get(c) : null
  if (aprox && aprox.length) return { ids: [...aprox], via: 'cola' }
  return { ids: [], via: '' }
}
