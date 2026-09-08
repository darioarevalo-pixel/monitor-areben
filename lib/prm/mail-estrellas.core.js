/**
 * **El mail de la recompra: qué se está terminando de lo que entró hace poco.**
 *
 * # 🔴 Por qué existe
 *
 * Lo pidió Bruno el 8-sep-2026, en la misma frase donde pidió el bloque de la ficha: *«incluso una
 * alerta por mail podríamos ejecutar»*. Y la razón es la que hace distinta a esta pregunta de todas
 * las demás del PRM: **tiene fecha de vencimiento**. Un proveedor que entrega bien lo va a seguir
 * haciendo el mes que viene; un producto que se colocó entero en cinco días hay que ir a buscarlo
 * **esta semana**, y la ficha sólo lo dice si alguien la abre.
 *
 * # 🔑 Con cero ⛔ NO se manda nada
 *
 * Un mail que dice «no hay nada» enseña a no abrirlo, y el día que traiga algo va a llegar a una
 * bandeja donde ese remitente ya se saltea. Es la misma decisión que el mail de la pauta
 * (`lib/meta-ads/mail-hallazgos.core.js`), y por la misma razón.
 *
 * # 🔴 Lo que ⛔ NO hace: acordarse
 *
 * ⚠️ **Éste ⛔ no tiene estado, y ahí se diferencia del de la pauta.** Aquél manda **los abiertos**
 * porque un hallazgo se acciona y se marca; acá ⛔ no hay nada que marcar — el producto sale solo de
 * la lista cuando pasa la ventana o cuando la recompra entra y ya ⛔ no es nuevo. ⇒ **un mismo
 * producto puede aparecer dos semanas seguidas**, y eso ⛔ no es un bug: significa que se sigue
 * yendo y todavía nadie recompró.
 *
 * # Puro
 *
 * ⛔ Sin `Date.now()` adentro: un reloj escondido hace que el texto no se pueda probar, y el texto
 * es todo lo que este archivo produce. ⚠️ **Y ⛔ no recibe `hoy` de adorno**: las edades y los
 * plazos ya vienen calculados en cada fila por `estrellas()`, así que una fecha acá sería una
 * segunda oportunidad de contar los días distinto.
 */

/** Adónde manda. `?m=` elige la marca, que es lo que `app/[[...seccion]]/page.tsx` sabe leer. */
const BASE = 'https://monitorareben.vercel.app'

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const entero = (n) => Math.round(Number(n) || 0).toLocaleString('es-AR')

/**
 * «ya lo colocó» · «en 5 días».
 *
 * 🔴 **El cero ⛔ no es un plazo**: «se termina en 0 días» se lee como un dato roto, y lo que dice
 * es que de lo que trajo ⛔ no queda nada.
 */
export function cuandoSeTermina(dias) {
  if (dias == null) return null
  if (dias < 1) return 'ya lo colocó entero'
  return `se termina en ${entero(dias)} día${Math.round(dias) === 1 ? '' : 's'}`
}

/**
 * El renglón de un producto, en una línea. Es lo mismo que dice la fila de la ficha.
 *
 * 🔴 **El stock va SIEMPRE, incluso cuando parece redundante.** Es lo único que separa «se agotó,
 * andá a comprar» de «se agotó lo suyo pero todavía hay» — medido el 8-sep-2026: `TOP TERRA` colocó
 * las 5 que trajo y tiene 5 en el depósito. Sin ese número, el mail manda a Flores al pedo.
 */
export function renglonDe(f) {
  const pct = f.colocado == null ? null : `${Math.round(f.colocado * 100)}%`
  const partes = [
    `llegó hace ${entero(f.dias)} d`,
    `compró ${entero(f.unidades)}, vendió ${entero(f.vendidas)}${pct ? ` (${pct})` : ''}`,
    cuandoSeTermina(f.seAgotaEn),
    // ⛔ `null` ⛔ no es 0: es «no se pudo preguntar» o «no está en el espejo». Un 0 acá manda a
    // recomprar algo de lo que puede haber una pila.
    f.stock == null ? 'stock de hoy: no se pudo leer' : `stock de hoy: ${entero(f.stock)}`,
  ].filter(Boolean)
  return { nombre: f.nombre || f.sku || f.producto_id, detalle: partes.join(' · ') }
}

/**
 * **El asunto.** Se lee en la pantalla bloqueada del teléfono, sin abrir nada, así que lleva las dos
 * cosas que deciden si vale la pena abrirlo: **cuántos productos** y **de cuántos proveedores** —
 * porque un viaje a Flores por cinco productos de un proveedor ⛔ no es el mismo viaje que por cinco
 * de cinco.
 */
export function asuntoDe(proveedores) {
  const productos = proveedores.reduce((a, p) => a + p.filas.length, 0)
  const n = proveedores.length
  return `Proveedores · ${productos} para recomprar, de ${n} proveedor${n === 1 ? '' : 'es'}`
}

/**
 * Arma el mail, o **`null` si no hay nada** — ver el 🔑 de arriba.
 *
 * @param {Array<{nombre: string, marca: string, filas: Array}>} proveedores — ya filtrados con
 *   `paraAvisar` del núcleo. ⛔ El umbral ⛔ no se vuelve a escribir acá: si el mail avisara por una
 *   regla propia, la ficha resaltaría otras filas y quien abre las dos ⛔ no sabría a cuál creerle.
 * @param {number} ventana — los días de ingreso que se miraron. Va en el pie: sin él, «llegó hace
 *   28 d» ⛔ no dice si eso está adentro o al borde de lo que se preguntó.
 * @param {string} [stockAl] — ya formateado, cuándo se sincronizó el espejo de stock.
 *   🔴 **El sync de inventario ⛔ no tiene reloj: lo aprieta una persona** desde Reposición. Un
 *   stock sin fecha al lado se lee como «ahora» y puede ser de anteayer — y de eso depende si la
 *   recompra es urgente o si ya se hizo y todavía no se ve.
 */
export function armarMail(proveedores, ventana, stockAl) {
  const vivos = (proveedores || []).filter((p) => p && p.filas && p.filas.length)
  if (!vivos.length) return null

  // 🔑 **El orden es el del más urgente de cada uno**, ⛔ no alfabético ni por cantidad: lo que
  // decide a quién se va a ver primero es de quién me quedo sin antes.
  const orden = vivos
    .map((p) => ({
      ...p,
      filas: p.filas.slice().sort((a, b) => (a.seAgotaEn ?? Infinity) - (b.seAgotaEn ?? Infinity)),
    }))
    .sort((a, b) => (a.filas[0].seAgotaEn ?? Infinity) - (b.filas[0].seAgotaEn ?? Infinity))

  const pie =
    `Son los productos que entraron por primera vez en los últimos ${ventana} días y, al ritmo de ` +
    `estos días, se terminan en una semana. «Stock de hoy» es el del producto entero en Gestión ` +
    `Nube y ⛔ no el resto de esa compra: los dos no se restan entre sí. ` +
    (stockAl
      ? `Ese espejo se sincronizó el ${stockAl}, y lo aprieta una persona desde Reposición: no se actualiza solo. `
      : '') +
    `Lo escribe el reloj de los lunes; el detalle de cada proveedor está en su ficha, en «Cómo se ` +
    `mueve lo que le compro».`

  const texto = [
    ...orden.map((p) =>
      [
        `${p.nombre} · ${p.marca}`,
        ...p.filas.map((f) => {
          const r = renglonDe(f)
          return `   ⭐ ${r.nombre} — ${r.detalle}`
        }),
        `   ${BASE}/prm?m=${p.marca}`,
      ].join('\n'),
    ),
    pie,
  ].join('\n\n')

  const html = [
    '<div style="font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a">',
    ...orden.map((p) =>
      [
        '<div style="margin:0 0 18px;padding:0 0 0 12px;border-left:3px solid #ddd">',
        `<div><strong>${esc(p.nombre)}</strong> <span style="color:#777">· ${esc(p.marca)}</span></div>`,
        ...p.filas.map((f) => {
          const r = renglonDe(f)
          return `<div style="margin:3px 0;color:#444">⭐ <strong>${esc(r.nombre)}</strong> — ${esc(r.detalle)}</div>`
        }),
        `<div><a href="${BASE}/prm?m=${esc(p.marca)}">abrir el PRM de ${esc(p.marca)}</a></div>`,
        '</div>',
      ].join(''),
    ),
    `<p style="color:#777;font-size:13px">${esc(pie)}</p>`,
    '</div>',
  ].join('')

  return { asunto: asuntoDe(orden), texto, html }
}
