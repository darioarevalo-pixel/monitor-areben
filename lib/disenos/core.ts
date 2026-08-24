/**
 * Lógica pura del tablero de diseños: normalizar lo que vuelve de la base, filtrar, ordenar y
 * decidir en lote.
 *
 * ⛔ Acá **no** está la aritmética de la votación: eso es `votacion.core.js`, y a propósito no
 * vuelca nada sobre el documento del diseño. El tally que vivía acá pisaba los votos que el equipo
 * ponía a mano — dos votaciones distintas tapándose una a la otra. Los puntajes entran a este
 * archivo **como parámetro** (`ordenar`), nunca como un campo del `Diseno`.
 */

import type { PuntajeDiseno, PuntajesDeRonda } from './votacion'
import { ESTADOS_VALIDOS, type Diseno, type EnvioAIngreso, type EstadoDiseno, type OrdenDiseno } from './tipos'

/**
 * Reduce una fila de la base a los campos vivos del `Diseno`. Devuelve `null` si no hay foto (sin
 * `url` no hay nada que mirar y nada que mandar).
 *
 * 🔴 **Esto es lo que evita la regresión más cara de la sección.** El efecto de persistencia manda
 * a la base sólo lo que cambió, comparando `JSON.stringify(diseño)` contra lo último guardado. Las
 * filas viejas todavía traen `up`, `down` y `nota` adentro de `datos`; si entraran al estado de
 * React, el primer `setDisenos` los perdería y el diff vería **los 37 como cambiados** — o sea el
 * tablero entero, con las 9 fotos en base64 adentro, de vuelta a la base en cada entrada a la
 * sección. Ese bug ya existió una vez por otro camino (el mapa de "último guardado" arrancaba
 * vacío) y está anotado en `docs/secciones/disenos.md`.
 *
 * ⚠️ Las claves viejas **no se borran de la base**: nadie las lee y migrar 37 filas con la nota
 * vacía y los votos en 0 es riesgo sin pago. Se ignoran acá, que es donde importa.
 */
export function normalizarDiseno(fila: unknown, nuevoId: () => string): Diseno | null {
  if (!fila || typeof fila !== 'object') return null
  const d = fila as Record<string, unknown>
  if (typeof d.url !== 'string' || !d.url) return null
  const estado = ESTADOS_VALIDOS.includes(d.estado as EstadoDiseno) ? (d.estado as EstadoDiseno) : 'revisar'
  const salida: Diseno = {
    id: typeof d.id === 'string' && d.id ? d.id : nuevoId(),
    name: typeof d.name === 'string' ? d.name : '',
    url: d.url,
    estado,
  }
  // `enviados` sólo entra si tiene forma. Un array roto que se cuele acá volvería a la base en el
  // próximo guardado y encima haría mentir a la chapita de "ya se mandó".
  const enviados = saneaEnviados(d.enviados)
  if (enviados.length) salida.enviados = enviados
  return salida
}

function saneaEnviados(bruto: unknown): EnvioAIngreso[] {
  if (!Array.isArray(bruto)) return []
  return bruto.flatMap((e) => {
    if (!e || typeof e !== 'object') return []
    const x = e as Record<string, unknown>
    if (typeof x.ingresoId !== 'string' || !x.ingresoId) return []
    return [{
      ingresoId: x.ingresoId,
      ingresoDesc: typeof x.ingresoDesc === 'string' ? x.ingresoDesc : '',
      bloqueId: typeof x.bloqueId === 'string' ? x.bloqueId : '',
      columnaId: typeof x.columnaId === 'string' ? x.columnaId : '',
      fecha: typeof x.fecha === 'string' ? x.fecha : '',
      por: typeof x.por === 'string' ? x.por : '',
    }]
  })
}

/** Cuántos hay de cada estado, más el total. Una sola pasada: los chips los piden los cinco juntos. */
export function conteos(disenos: Diseno[]): Record<EstadoDiseno | 'todos', number> {
  const out = { todos: 0, revisar: 0, confirmado: 0, duda: 0, rechazado: 0 }
  for (const d of disenos) {
    out.todos++
    out[d.estado]++
  }
  return out
}

/** Compat: se usa en el pie del tablero y en el selector del PDF. */
export function contarPorEstado(disenos: Diseno[], estado: EstadoDiseno): number {
  return disenos.filter((d) => d.estado === estado).length
}

/** Sin acentos y en minúsculas, para que "diseño" encuentre "DISENO". */
function plano(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function filtrarDisenos(disenos: Diseno[], { q, estado }: { q?: string; estado?: EstadoDiseno | 'todos' }): Diseno[] {
  const texto = plano((q || '').trim())
  return disenos.filter((d) => {
    if (estado && estado !== 'todos' && d.estado !== estado) return false
    if (texto && !plano(d.name).includes(texto)) return false
    return true
  })
}

/**
 * Copia ordenada (no toca el orden guardado).
 *
 * 🔑 **`'puntaje'` copia la regla de `ranking()` de `votacion.core.js`, no la reinventa**: sin
 * votos va **siempre al final** —en una escala de 1 a 5 el cero no es "sin datos", es la peor
 * nota—, desempata por cantidad de votos y después por nombre. Si las dos reglas divergieran, la
 * grilla y la tabla de resultados dirían cosas distintas del mismo lote, que es justo el defecto
 * que esta sección vino a cerrar.
 */
export function ordenar(disenos: Diseno[], orden: OrdenDiseno, puntajes?: PuntajesDeRonda | null): Diseno[] {
  const a = disenos.slice()
  const nm = (x: Diseno, y: Diseno) => (x.name || '').localeCompare(y.name || '', 'es')
  if (orden === 'nombre') return a.sort(nm)
  if (orden === 'carga') return a
  const pt = (d: Diseno): PuntajeDiseno => puntajes?.[d.id] || { n: 0, promedio: null }
  return a.sort((x, y) => {
    const px = pt(x)
    const py = pt(y)
    if ((px.promedio == null) !== (py.promedio == null)) return px.promedio == null ? 1 : -1
    if (px.promedio != null && py.promedio != null && px.promedio !== py.promedio) return py.promedio - px.promedio
    if (px.n !== py.n) return py.n - px.n
    return nm(x, y)
  })
}

/** Un promedio siempre con una decimal y coma, como se escribe acá. `null` es "sin votos". */
export function textoPromedio(p: number | null): string {
  return p == null ? '—' : p.toFixed(1).replace('.', ',')
}

/**
 * Lo que dice la chapita de la tarjeta y la línea del PDF.
 *
 * 🔑 Sin votos dice **"sin votos"**, con todas las letras. ⛔ Nunca `★ 0,0` ni `0`: en una escala
 * de 1 a 5 un cero es una afirmación, y la peor de todas.
 */
export function etiquetaPuntaje(pt?: PuntajeDiseno | null): string {
  if (!pt || pt.promedio == null) return 'sin votos'
  return `★ ${textoPromedio(pt.promedio)} (${pt.n})`
}

/** Mueve de estado sólo los ids dados. Los desconocidos se ignoran; no muta el array de entrada. */
export function aplicarEstadoALote(disenos: Diseno[], ids: Set<string>, estado: EstadoDiseno): Diseno[] {
  if (!ids.size) return disenos
  return disenos.map((d) => (ids.has(d.id) && d.estado !== estado ? { ...d, estado } : d))
}

/** Saca del tablero los ids dados. */
export function quitarLote(disenos: Diseno[], ids: Set<string>): Diseno[] {
  if (!ids.size) return disenos
  return disenos.filter((d) => !ids.has(d.id))
}

/**
 * Recorta la selección a lo que está en pantalla.
 *
 * 🔑 Existe porque «Confirmar los N» tiene que tocar **lo que se está viendo**. Si alguien tilda
 * 12, cambia el chip a "Rechazados" y aprieta, el botón estaría confirmando doce diseños que ya no
 * están a la vista — y diciendo un número que no es el que se ve. Se llama en cada cambio de
 * filtro, de búsqueda y de página.
 */
export function podarSeleccion(sel: Set<string>, visibles: Diseno[]): Set<string> {
  if (!sel.size) return sel
  const alaVista = new Set(visibles.map((d) => d.id))
  const out = new Set<string>()
  for (const id of sel) if (alaVista.has(id)) out.add(id)
  return out.size === sel.size ? sel : out
}

/**
 * Los diseños que se guardaron con la foto embebida en base64, de cuando la subida al Blob falló.
 * Funcionan en todos lados, pero engordan la fila, el snapshot de la ronda y el PDF.
 */
export function pesadas(disenos: Diseno[]): Diseno[] {
  return disenos.filter((d) => d.url.startsWith('data:'))
}

/** Anota en los diseños a qué importación se mandaron. Inmutable, y no duplica el mismo envío. */
export function marcarEnviados(disenos: Diseno[], marcas: { id: string; envio: EnvioAIngreso }[]): Diseno[] {
  if (!marcas.length) return disenos
  const porId = new Map(marcas.map((m) => [m.id, m.envio]))
  return disenos.map((d) => {
    const envio = porId.get(d.id)
    if (!envio) return d
    const previos = d.enviados || []
    if (previos.some((e) => e.ingresoId === envio.ingresoId && e.columnaId === envio.columnaId)) return d
    return { ...d, enviados: [...previos, envio] }
  })
}
