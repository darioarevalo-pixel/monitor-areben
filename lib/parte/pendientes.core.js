/**
 * **Lo sin terminar** del parte de la mañana: lo abierto de los `PENDIENTES.md` de los proyectos.
 * Puro: recibe el texto del archivo y devuelve renglones.
 *
 * # 🔑 La convención que se lee es la que ya se usa: un título que empieza con ▶️
 *
 * Medido el 30-sep-2026 sobre los cinco `PENDIENTES.md`: el único marcador que vale en más de uno
 * es «un título `##`/`###` que arranca con ▶️ está abierto» (15 en monitor-areben, 4 en
 * areben-marketing). areben-produccion usa otra forma —casillas `- [ ]` bajo `## 🔴 Pendiente`— y
 * tiene su propio lector. ⛔ Se inventa una convención nueva: el mail tiene que leer lo que las
 * sesiones YA escriben, o arranca vacío y nadie se entera.
 *
 * ⚠️ Un `### ▶️ Lo que falta` suelto ⛔ dice nada en un mail. Por eso un subtítulo lleva adelante
 * el título `##` que lo contiene, y la fecha sale de ahí si el subtítulo ⛔ la tiene.
 */

const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 }

/** La primera fecha `d-mmm-aaaa` (o `d-mmm`, con el año de `hoy`) de un texto, como ISO. */
export function fechaDe(texto, hoy) {
  const m = /(\d{1,2})-(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)(?:-(\d{4}))?/i.exec(String(texto || ''))
  if (!m) return null
  const anio = m[3] || String(hoy || '').slice(0, 4)
  if (!anio) return null
  return `${anio}-${String(MESES[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/** Saca el markdown de un título: negritas, cursivas, código, links y el ▶️ del principio. */
export function limpiar(t, largo = 120) {
  const s = String(t || '')
    .replace(/^#+\s*/, '')
    // Los marcadores de estado de adelante (▶️ 🆕 🏁 🔴 🚧 ✅ …) ⛔ dicen nada en el mail: todo lo
    // que llega acá ya está abierto.
    .replace(/^(?:[\p{Extended_Pictographic}\u{FE0F}\u{200D}]+\s*)+/u, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*`_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > largo ? `${s.slice(0, largo - 1)}…` : s
}

/**
 * Los títulos ▶️ de un `PENDIENTES.md`.
 * @returns `[{ titulo, fecha }]` en el orden del archivo (que es el de las sesiones: lo nuevo arriba).
 */
export function abiertosPorTitulo(md, hoy) {
  const out = []
  let padre = null
  let fechaPadre = null
  for (const linea of String(md || '').split('\n')) {
    const m = /^(#{2,4})\s+(.*)$/.exec(linea)
    if (!m) continue
    const nivel = m[1].length
    const texto = m[2]
    if (nivel === 2) {
      padre = texto
      fechaPadre = fechaDe(texto, hoy)
    }
    if (!/^▶️/u.test(texto.trim())) continue
    const propio = limpiar(texto)
    const titulo = nivel === 2 || !padre ? propio : `${limpiar(padre, 70)} › ${propio}`
    out.push({ titulo: limpiar(titulo, 150), fecha: fechaDe(texto, hoy) || (nivel === 2 ? null : fechaPadre) })
  }
  return out
}

/**
 * Las casillas sin tildar de la sección `## 🔴 Pendiente` (la forma de areben-produccion). De cada
 * una va la primera frase en negrita, que es donde esas casillas ponen el título.
 */
export function abiertosPorCasilla(md, hoy) {
  const out = []
  let dentro = false
  for (const linea of String(md || '').split('\n')) {
    if (/^##\s/.test(linea)) {
      dentro = /^##\s+🔴\s*Pendiente/u.test(linea)
      continue
    }
    if (!dentro) continue
    const m = /^- \[ \]\s+(.*)$/.exec(linea)
    if (!m) continue
    const negrita = /\*\*(.+?)\*\*/.exec(m[1])
    out.push({ titulo: limpiar(negrita ? negrita[1] : m[1]), fecha: fechaDe(m[1], hoy) })
  }
  return out
}
