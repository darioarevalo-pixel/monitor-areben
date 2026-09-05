/**
 * El mail de la mañana: qué hay que decidir hoy en la pauta.
 *
 * # 🔴 Por qué existe, y es una cosa medida
 *
 * El 26-ago-2026 el motor escribió sus primeros cuatro hallazgos a las 07:50 —uno de ellos un
 * conjunto comprando al **156% del techo**— y a media tarde los cuatro seguían en `nuevo`. El mismo
 * día se los mandó al badge del sidebar, y el badge arregla la mitad: **sólo se ve si se abre el
 * monitor**. Éste es la otra mitad — sale a buscar a la persona donde ya está mirando.
 *
 * # 🔑 LA DECISIÓN QUE ORDENA TODO: van los ABIERTOS, ⛔ no los de hoy
 *
 * Lo natural sería mandar lo que la corrida de esta mañana acaba de escribir. **Sería el mismo
 * agujero con otra forma:** un hallazgo del lunes que nadie accionó desaparecería del mail del
 * martes, y el que más importa es justamente el que lleva días sin que nadie lo toque. El mail
 * lista **todo lo que está en `nuevo`**, y dice de cada uno **hace cuánto** (`desde`, la racha).
 * ⇒ La lista se vacía **accionando**, ⛔ no dejando pasar un día.
 *
 * # 🔑 Con cero hallazgos ⛔ NO se manda nada
 *
 * Un mail diario que dice «no hay nada» enseña a no abrirlo, y el día que traiga algo va a llegar a
 * una bandeja donde ese remitente ya se saltea. El silencio del mail significa «no hay nada que
 * decidir» **porque es la única razón por la que no llega** — y el que quiere confirmarlo tiene el
 * cartel de la pantalla, que sí distingue las tres causas del silencio (ver `silencioDeReglas`).
 *
 * # Puro, y con `hoy` por parámetro
 *
 * ⛔ Sin `Date.now()` adentro, por la misma razón que `silencioDeReglas`: un reloj escondido hace
 * que el texto no se pueda probar, y el texto es todo lo que este archivo produce.
 */

import { esParaDecidir, gravedadDeHallazgo, ORDEN_GRAVEDAD } from './reglas.core.js'
import { diasEntre } from '../fechas/dia.core.js'
import { ETIQUETA_LINEA } from './lineas.core.js'

/** Adónde manda el mail. Es la zona, que es donde se accionan. */
const BASE = 'https://monitorareben.vercel.app'

const MARCA_GRAVEDAD = { quema: '🔴', mirar: '🟡', oportunidad: '🔵' }

/** Cómo se lee la acción propuesta. Espejo de `rotuloAccion` de `HallazgosPanel`. */
function quePropone(s) {
  if (!s) return null
  if (s.accion === 'estado') return s.status === 'PAUSED' ? 'pausarlo' : 'reactivarlo'
  return 'subirle el presupuesto'
}

/**
 * Hace cuánto lo viene diciendo.
 *
 * 🔑 **Se cuenta desde `desde` —el primer día de la racha—, ⛔ no desde `fecha`.** Con la fecha del
 * último renglón, que la regla reescribe todas las mañanas, **todo hallazgo sería siempre de hoy** y
 * el mail nunca podría decir lo único que lo hace urgente: que hace cinco días que nadie lo mira.
 */
export function haceCuanto(h, hoy) {
  const d = diasEntre(h.desde || h.fecha, hoy)
  if (!Number.isFinite(d) || d <= 0) return 'hoy'
  if (d === 1) return 'desde ayer'
  return `hace ${d} días`
}

/** El orden de lectura: primero lo que cuesta plata, y dentro de eso lo que lleva más tiempo esperando. */
export function ordenar(hallazgos, hoy) {
  return hallazgos.slice().sort((a, b) => {
    const ga = ORDEN_GRAVEDAD[gravedadDeHallazgo(a.sugerencia)] ?? 9
    const gb = ORDEN_GRAVEDAD[gravedadDeHallazgo(b.sugerencia)] ?? 9
    if (ga !== gb) return ga - gb
    // A igual gravedad, el más viejo arriba: es el que más tiempo lleva sin que nadie lo toque.
    return diasEntre(b.desde || b.fecha, hoy) - diasEntre(a.desde || a.fecha, hoy)
  })
}

/**
 * El asunto. Se lee **en la pantalla bloqueada del teléfono, sin abrir nada**, así que lleva las dos
 * cosas que deciden si vale la pena abrirlo: **cuántas** y **si alguna está costando plata ahora**.
 */
export function asuntoDe(hallazgos) {
  const n = hallazgos.length
  // ⚠️ Los `dato` ya vienen filtrados por `armarMail`: acá `hallazgos` son sólo los accionables.
  const queman = hallazgos.filter((h) => gravedadDeHallazgo(h.sugerencia) === 'quema').length
  // 🔑 **El MISMO texto que el renglón de Rendimiento y el de la pantalla Decidir.** Bruno el
  // 5-sep-2026: *«toda la tipografía no está en infinitivo»* — «quemando plata» es un gerundio y
  // «cosas» ⛔ no nombra nada (`VOCABULARIO.md` §3.2). Se cambian los tres o ninguno: si el asunto
  // y la pantalla dijeran distinto, quien abre los dos ⛔ no sabría a cuál creerle.
  const cuantas = `${n} para decidir`
  if (!queman) return `Pauta · ${cuantas}`
  return `Pauta · ${cuantas}, ${queman} para pausar`
}

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Arma el mail, o **`null` si no hay nada que decidir** — ver el 🔑 de arriba: el que no tiene nada
 * que decir no manda un mail diciéndolo.
 *
 * @param {Array} hallazgos — los que están en `nuevo`, ya agrupados por (regla, objeto) con su
 *   `veces` y su `desde`. ⛔ No los de hoy: los ABIERTOS.
 * @param {string} hoy — `YYYY-MM-DD`.
 */
export function armarMail(hallazgos, hoy) {
  // 🔑 **La MISMA función que el contador de la pantalla y que el badge del sidebar.** Un hallazgo
  // que es DATO —la atribución tardía, la fatiga— ⛔ no es algo para decidir, y un mail que los
  // cuenta enseña a no abrir el mail. Ver `esParaDecidir`.
  const vivos = (hallazgos || []).filter(Boolean).filter(esParaDecidir)
  if (!vivos.length) return null

  const orden = ordenar(vivos, hoy)
  const renglones = orden.map((h) => {
    const g = gravedadDeHallazgo(h.sugerencia)
    const nombre = h.objeto_nombre || h.objetoNombre || h.objeto_id || h.objetoId
    const linea = ETIQUETA_LINEA[h.linea] || h.linea
    const propone = quePropone(h.sugerencia)
    return { g, nombre, linea, cuando: haceCuanto(h, hoy), motivo: h.motivo, propone, ruta: `${BASE}/meta-ads?linea=${h.linea}` }
  })

  const texto = [
    ...renglones.map((r) => [
      `${MARCA_GRAVEDAD[r.g]} ${r.nombre} · ${r.linea} · ${r.cuando}`,
      `   ${r.motivo}`,
      r.propone ? `   → ${r.propone}` : '   → no propone nada: hay que mirarlo',
      `   ${r.ruta}`,
    ].join('\n')),
    // Quién lo mandó y con qué, para que no haya que adivinar de dónde salió un mail automático.
    'Lo escribió el reloj de las 07:50, que lee la foto del día cerrado. Se vacía accionando.',
  ].join('\n\n')

  const html = [
    '<div style="font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a">',
    ...renglones.map((r) => [
      '<div style="margin:0 0 18px;padding:0 0 0 12px;border-left:3px solid #ddd">',
      `<div><strong>${MARCA_GRAVEDAD[r.g]} ${esc(r.nombre)}</strong> <span style="color:#777">· ${esc(r.linea)} · ${esc(r.cuando)}</span></div>`,
      `<div style="margin:3px 0;color:#444">${esc(r.motivo)}</div>`,
      `<div><a href="${esc(r.ruta)}">${r.propone ? esc(r.propone) : 'mirarlo'}</a></div>`,
      '</div>',
    ].join('')),
    '<p style="color:#777;font-size:13px">Lo escribió el reloj de las 07:50, que lee la foto del día cerrado. Se vacía accionando.</p>',
    '</div>',
  ].join('')

  return { asunto: asuntoDe(vivos), texto, html }
}
