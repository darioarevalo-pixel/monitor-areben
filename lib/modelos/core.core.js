/**
 * Modelos — las listas cerradas, la normalización y la validación, para los dos mundos.
 *
 * # Por qué este archivo es `.js` y no `.ts`
 *
 * Mismo motivo que `lib/permisos.core.js`, `lib/crm/telefono.core.js` y `lib/insumos/core.core.js`:
 * `api/_modelos.js` corre en Node sin pasar por el compilador de Next y **no puede importar
 * TypeScript**. El handler tiene que normalizar **antes** de escribir, no después: un talle
 * guardado como `m` y otro como `Talle M` son dos talles distintos para cualquier cosa que después
 * agrupe, y eso ⛔ no se arregla en la pantalla.
 *
 * # 🔑 Acá vive la normalización del TALLE y de la ALTURA, que antes vivía en la sesión de fotos
 *
 * `talleNormalizado` y `alturaNormalizada` nacieron el 3-sep-2026 en `lib/sesionfotos/modelo.ts`,
 * cuando la modelo se tipeaba a mano porque este padrón no existía. Ahora hay dos lugares donde se
 * escribe el talle de una modelo —su ficha y la sesión— y **la misma regla escrita dos veces se
 * lee como un descuido**: el próximo que viera las dos las iba a emparejar mal. Se mudaron acá y
 * `lib/sesionfotos/modelo.ts` las **re-exporta**, así que sus consumidores no se enteran.
 * `tests/modelos-core.test.ts` fija que las dos puntas devuelvan lo mismo.
 *
 * ⛔ **El teléfono ⛔ no se normaliza acá**: eso es `normalizeArgPhone` de `lib/crm/telefono.core.js`,
 * que ya lo usan el CRM, Envíos, Canjes y el portal del cadete. Se guarda **como se tipeó** —igual
 * que el padrón de Gestión Nube— y se normaliza recién para armar el `wa.me`.
 */

const limpiar = (s) => String(s ?? '').trim().replace(/\s+/g, ' ')

/**
 * El talle, normalizado a MAYÚSCULAS.
 *
 * ⛔ No es cosmético y ⛔ no es una lista cerrada. Los talles de Zattia conviven en dos alfabetos
 * —`S`/`M`/`L` y `38`/`40`/`42`— y encima aparecen como `Talle M` o `m` según quién escriba. Sin
 * normalizar, «m» y «M» son dos talles distintos para cualquier cosa que después quiera agrupar.
 * Cerrar la lista sería peor: el día que entre un `XXL` o un `Único` el campo lo rechazaría y la
 * ficha quedaría sin el dato, que es el único fracaso que este módulo no puede permitirse.
 */
export function talleNormalizado(v) {
  return limpiar(v).replace(/^talles?\s+/i, '').toUpperCase()
}

/**
 * La altura, siempre en metros y con coma: `1,70 m`.
 *
 * Se escribe de cuatro maneras (`170`, `1.70`, `1,70`, `1,70 m`) y las cuatro quieren decir lo
 * mismo. La que se guarda es una sola, porque este texto sale tal cual a la ficha del producto.
 * ⛔ Lo que no parsea se descarta en vez de guardarse crudo: una altura que no es una altura
 * escrita en la descripción de una prenda es peor que no tenerla.
 */
export function alturaNormalizada(v) {
  const t = limpiar(v).replace(/\s*m\.?$/i, '').replace(',', '.')
  if (!t) return ''
  const n = Number(t)
  if (!Number.isFinite(n) || n <= 0) return ''
  // 170 y 1,70 son la misma persona: arriba de 3 se lee como centímetros.
  const metros = n > 3 ? n / 100 : n
  if (metros < 1.2 || metros > 2.2) return ''
  return `${metros.toFixed(2).replace('.', ',')} m`
}

/**
 * El Instagram, siempre como usuario y sin `@`.
 *
 * Se pega de tres formas —`@juana`, `juana`, `https://instagram.com/juana?igshid=…`— y las tres son
 * la misma cuenta. Se guarda una sola porque de acá sale el enlace, y porque es la única forma de
 * darse cuenta de que una modelo ya está cargada con otro nombre.
 */
export function instagramNormalizado(v) {
  let t = limpiar(v).toLowerCase()
  if (!t) return ''
  t = t.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/^instagram\.com\//, '').replace(/^ig\.me\//, '')
  t = t.split(/[/?#]/)[0].replace(/^@+/, '')
  // Lo que Instagram admite: letras, números, punto y guion bajo. Lo demás no es un usuario.
  return /^[a-z0-9._]{1,30}$/.test(t) ? t : ''
}

/**
 * Los estados de una ficha. Son DOS y no tres a propósito.
 *
 * ⛔ **No existe «no trabajar más» como estado**: el motivo por el que no se la vuelve a llamar lo
 * escribe una persona en la nota, y un rótulo cerrado sobre una persona es lo único que esta
 * sección ⛔ no puede tener. `archivada` dice sólo que sale de la lista de a quién llamar —sigue
 * existiendo, y lo que fotografió sigue en las sesiones (VOCABULARIO.md §1.4).
 */
export const ESTADOS = [
  { key: 'activa', label: 'Activa' },
  { key: 'archivada', label: 'Archivada' },
]

export const CLAVES_ESTADO = ESTADOS.map((e) => e.key)

/**
 * Las medidas que se anotan, en centímetros. `calzado` es número argentino de calzado.
 *
 * 🔴 **Ninguna es obligatoria y un vacío es AUSENTE, ⛔ nunca 0.** `Number('')` es 0: dejarlo pasar
 * escribiría «cintura 0 cm» y después nadie sabe si se midió o no. Es la misma trampa que ya mordió
 * en Insumos con el precio y en el PRM con el `proveedor_id`.
 */
export const CLAVES_MEDIDA = ['busto', 'cintura', 'cadera', 'calzado']

/** El rango de cada medida. Fuera de rango ⛔ no se guarda: es un tipeo, no una persona. */
const RANGO_MEDIDA = { busto: [50, 160], cintura: [40, 150], cadera: [50, 170], calzado: [30, 46] }

export function medidasNormalizadas(m) {
  const out = {}
  if (!m || typeof m !== 'object') return out
  for (const k of CLAVES_MEDIDA) {
    const v = m[k]
    if (v == null || v === '') continue
    const n = Number(String(v).replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) continue
    const [min, max] = RANGO_MEDIDA[k]
    if (n < min || n > max) continue
    out[k] = Math.round(n)
  }
  return out
}

/**
 * ¿Tiene quién la represente?
 *
 * 🔑 **Las tres vacías quieren decir DIRECTA, ⛔ no «falta el dato»** — y acá es lo más común. La
 * pantalla lo escribe con todas las letras en vez de dejar tres guiones, que es lo que hace que una
 * ficha completa se lea como una ficha a medio cargar.
 */
export function esDirecta(m) {
  return !limpiar(m?.agencia) && !limpiar(m?.booker) && !limpiar(m?.bookerContacto ?? m?.booker_contacto)
}

/**
 * La clave con la que se detecta que una modelo ya está cargada.
 *
 * Sin tildes, sin mayúsculas y sin dobles espacios: «Juana Pérez» y «juana perez» son la misma
 * persona y ⛔ no pueden ser dos fichas. El Instagram es una segunda llave y es **la fuerte**: dos
 * personas se pueden llamar igual, dos cuentas no.
 */
export function claveDeNombre(nombre) {
  return limpiar(nombre)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * ¿Ya hay una ficha que es ésta? Devuelve la que choca, o `null`.
 *
 * ⚠️ **Avisa, ⛔ no bloquea.** Dos modelos que se llaman igual existen; lo que ⛔ no puede pasar es
 * que nadie se entere. Por eso esto lo usa la pantalla para preguntar, y el handler para nada.
 */
export function fichaQueChoca(nueva, existentes) {
  const nom = claveDeNombre(nueva?.nombre)
  const ig = instagramNormalizado(nueva?.instagram)
  for (const m of existentes || []) {
    if (m.id && m.id === nueva?.id) continue
    if (ig && instagramNormalizado(m.instagram) === ig) return m
    if (nom && claveDeNombre(m.nombre) === nom) return m
  }
  return null
}

/**
 * Lo que hace que una ficha ⛔ no se pueda guardar. Devuelve el motivo en criollo, o `null`.
 *
 * 🔑 **Lo único obligatorio es el NOMBRE**, y eso es al revés de la sesión de fotos, donde lo
 * obligatorio es el talle. ⛔ No es una inconsistencia: allá el dato que sirve es el que sale a la
 * descripción del producto —y el nombre puede no saberse en el momento—, acá el nombre **es** la
 * ficha. Exigir el talle dejaría sin cargar a la modelo que todavía no vino.
 */
export function motivoModeloInvalido(m) {
  if (!m || typeof m !== 'object') return 'Falta la ficha.'
  if (!limpiar(m.nombre)) return 'Poné el nombre de la modelo.'
  if (m.estado != null && m.estado !== '' && !CLAVES_ESTADO.includes(m.estado)) return `Estado inválido: ${m.estado}`
  if (m.marcas != null && !Array.isArray(m.marcas)) return 'Las marcas tienen que ser una lista.'
  if (m.instagram && !instagramNormalizado(m.instagram)) return 'Ese Instagram no parece un usuario.'
  if (m.altura && !alturaNormalizada(m.altura)) return 'Esa altura no se entiende. Escribila como 1,70.'
  return null
}
