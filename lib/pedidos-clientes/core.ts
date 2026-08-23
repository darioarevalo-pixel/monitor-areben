/**
 * Faltantes, del lado de la pantalla. Puro y con tests.
 *
 * # La regla que importa es el AGREGADO, y por eso vive acá
 *
 * 🔴 **Agrupar repetidos no es un `reduce` adentro del JSX.** Es lo único que convierte una lista de
 * anotaciones en un número que decide una compra, y tiene que poder mutarse en un test: si
 * `claveDeTexto` afloja, dos productos distintos se suman en un renglón y el ranking miente **hacia
 * arriba**, que es el error que hace comprar. Escrito adentro del render no se puede ejercer, y la
 * segunda pantalla que lo necesite lo copia con un paso de menos.
 */

import { CANALES, claveDePedido } from './reglas.core.js'
import type { CanalPedido, GrupoFaltante, PedidoCliente, Ranking, TipoFaltante, Ventana } from './tipos'

export { CANALES, CAMPOS, ESTADOS, TIPOS, claveDePedido, claveDeTexto, filaDe, validarPedido } from './reglas.core.js'

/** Cómo se lee cada tipo en pantalla. El rótulo dice la decisión, no la categoría. */
export const ETIQUETA_TIPO: Record<TipoFaltante, string> = {
  no_trabajamos: 'No lo trabajamos',
  sin_stock: 'Sin stock',
}

export const ETIQUETA_CANAL: Record<CanalPedido, string> = {
  local: 'Local',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  mail: 'Mail',
  tienda: 'Tienda',
}

/**
 * La ventana de los últimos `dias` días.
 *
 * 🔴 **`ahora` es un parámetro obligatorio.** Un `Date.now()` acá adentro haría la función impura
 * —el lint la rechaza en un render, y con razón: dos llamadas del mismo dibujo se medirían contra
 * relojes distintos— y, sobre todo, haría imposible ejercer el borde de la ventana en un test, que
 * es justo donde una fila entra o no entra al número.
 */
export function ventanaDeDias(dias: number, ahora: number): Ventana {
  const d = Math.max(1, Math.floor(dias))
  return { desde: ahora - d * 86400000, hasta: ahora, dias: d }
}

/**
 * **Lo más pedido de la ventana**, agrupando repetidos.
 *
 * `ventana` es obligatoria por la misma razón que el índice de `lib/buzon/core.ts`: con un default
 * de 30 días, una pantalla nueva que se olvide de pasarla dibuja un número perfecto bajo un rótulo
 * que dice otra cosa, y no falla nada.
 *
 * # Qué cuenta y qué no
 *
 * - Cuenta **todas las veces que lo pidieron**, incluidas las ya `conseguido` y las `descartado`.
 *   Que después lo hayamos traído no borra que nos lo pidieron seis veces: el ranking mide demanda,
 *   no trabajo pendiente. Lo pendiente va al lado, en su propio contador.
 * - **No suma los dos tipos en un solo total ordenable.** El orden sale de `total` porque es lo que
 *   dice el título, pero cada grupo lleva el corte adentro y la pantalla filtra por tipo: son dos
 *   decisiones distintas (comprar variedad / reponer) y un ranking mezclado no contesta ninguna.
 * - Lo que queda afuera se **cuenta y se devuelve** (`fueraDeVentana`, `sinFecha`, `sinClave`). Sin
 *   eso, un ranking vacío dice «nadie pidió nada» cuando lo que pasó puede ser «nadie cargó nada» o
 *   «todo lo cargado es más viejo que la ventana», que son tres cosas distintas y una sola pantalla.
 */
export function rankear(pedidos: PedidoCliente[], ventana: Ventana): Ranking {
  const porClave = new Map<string, PedidoCliente[]>()
  let fueraDeVentana = 0
  let sinFecha = 0
  let sinClave = 0

  for (const p of pedidos || []) {
    const t = Date.parse(p.creado_en)
    if (!Number.isFinite(t)) {
      sinFecha++
      continue
    }
    if (t < ventana.desde || t > ventana.hasta) {
      fueraDeVentana++
      continue
    }
    // 🔑 La llave sale del ARTÍCULO cuando lo eligieron del catálogo, y del texto cuando lo
    // escribieron. Ver `claveDePedido`: un id nunca junta dos productos distintos, el texto sí.
    const clave = claveDePedido(p)
    if (!clave) {
      sinClave++
      continue
    }
    const ya = porClave.get(clave)
    if (ya) ya.push(p)
    else porClave.set(clave, [p])
  }

  const grupos = [...porClave.entries()].map(([clave, filas]) => grupoDe(clave, filas))
  grupos.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total
    // Empatados en cantidad, arriba el que se pidió más recién: es el que todavía está pasando.
    const ta = Date.parse(a.ultimo) || 0
    const tb = Date.parse(b.ultimo) || 0
    if (tb !== ta) return tb - ta
    // Y a igualdad de todo, alfabético: un orden estable es lo que hace que la lista no baile
    // entre dos recargas y que el test no dependa del orden en que llegaron las filas.
    return a.clave.localeCompare(b.clave)
  })

  const contadas = grupos.reduce((n, g) => n + g.total, 0)
  return { grupos, contadas, fueraDeVentana, sinFecha, sinClave, ventana }
}

/** Un grupo armado a partir de sus filas. La etiqueta es cómo lo llama la gente, no la clave. */
function grupoDe(clave: string, filas: PedidoCliente[]): GrupoFaltante {
  const ordenadas = [...filas].sort((a, b) => (Date.parse(b.creado_en) || 0) - (Date.parse(a.creado_en) || 0))
  const porTipo: Record<TipoFaltante, number> = { no_trabajamos: 0, sin_stock: 0 }
  let pendientes = 0
  let conseguidos = 0
  let descartados = 0
  const canales = new Set<CanalPedido>()
  const skus = new Set<string>()

  for (const p of ordenadas) {
    if (p.sku) skus.add(p.sku)
    if (p.tipo === 'sin_stock') porTipo.sin_stock++
    else porTipo.no_trabajamos++
    if (p.estado === 'conseguido') conseguidos++
    else if (p.estado === 'descartado') descartados++
    else pendientes++
    canales.add(p.canal)
  }

  return {
    clave,
    etiqueta: etiquetaDe(ordenadas),
    total: ordenadas.length,
    pendientes,
    conseguidos,
    descartados,
    porTipo,
    canales: CANALES.filter((c: string) => canales.has(c as CanalPedido)) as CanalPedido[],
    // El id sale de las filas y no de la clave: así el grupo de texto escrito a mano lo deja en
    // `null` sin ningún caso especial, que es exactamente lo que significa (nadie eligió artículo).
    productoId: ordenadas.find((p) => p.producto_id)?.producto_id ?? null,
    skus: [...skus].sort(),
    ultimo: ordenadas[0]?.creado_en ?? '',
    pedidos: ordenadas,
  }
}

/**
 * Cómo se muestra el grupo: **el texto más repetido, tal cual lo escribieron**.
 *
 * 🔑 No se muestra la clave normalizada y no es un detalle estético. La clave de «fundas iPhone 15»
 * es `15 funda iphone`: leído en una lista de compras parece un error de carga, y encima esconde el
 * dato que importa —cómo nombra la gente lo que pide—. A igualdad de repeticiones gana el más
 * reciente, que es el nombre que se está usando ahora.
 */
function etiquetaDe(ordenadasPorFechaDesc: PedidoCliente[]): string {
  const cuenta = new Map<string, number>()
  for (const p of ordenadasPorFechaDesc) {
    const t = p.texto.trim()
    cuenta.set(t, (cuenta.get(t) || 0) + 1)
  }
  let mejor = ordenadasPorFechaDesc[0]?.texto.trim() || ''
  let max = 0
  // Se recorre en orden de fecha descendente, así el `>` estricto deja ganar al más reciente
  // cuando dos formas de escribirlo aparecen la misma cantidad de veces.
  for (const p of ordenadasPorFechaDesc) {
    const t = p.texto.trim()
    const n = cuenta.get(t) || 0
    if (n > max) {
      max = n
      mejor = t
    }
  }
  return mejor
}

/**
 * La línea que va debajo del título del ranking.
 *
 * ⚠️ **No es decorativa: es el «qué se contó».** Un ranking sin esta línea afirma que sus grupos son
 * todo lo que pasó, y lo que quedó afuera —lo viejo, lo sin fecha, lo que no se puede agrupar— no
 * tiene ningún otro lugar donde decirse. Va siempre, incluso cuando los tres descartes son cero: es
 * lo que separa «no hay descartes» de «nadie los está mirando».
 */
export function comoSeConto(r: Ranking): string {
  const partes = [
    `${r.contadas} ${r.contadas === 1 ? 'pedido' : 'pedidos'} en ${r.ventana.dias} días`,
    `agrupados en ${r.grupos.length} ${r.grupos.length === 1 ? 'producto' : 'productos'}`,
  ]
  if (r.fueraDeVentana) partes.push(`${r.fueraDeVentana} más viejos, afuera`)
  if (r.sinFecha) partes.push(`${r.sinFecha} sin fecha, sin contar`)
  if (r.sinClave) partes.push(`${r.sinClave} sin texto que se pueda agrupar`)
  return partes.join(' · ')
}

/**
 * Lo que la pantalla tiene que decir cuando el ranking sale vacío.
 *
 * 🔴 **El cero afirma.** «No hay nada» se lee como «nadie pide nada que no tengamos» —que es una
 * conclusión sobre el negocio— cuando casi siempre significa «nadie cargó nada», que es una
 * conclusión sobre nosotros. Son tres estados distintos y la pantalla los tiene que separar, porque
 * la decisión que sigue a cada uno es otra: comprar, ir a cargar, o ampliar la ventana.
 */
export function porQueVacio(r: Ranking, totalCargado: number): string {
  if (totalCargado === 0) {
    return 'Todavía no cargó nadie. Esto no dice que no pidan cosas que no tenemos: dice que no se están anotando.'
  }
  if (r.fueraDeVentana > 0) {
    return `Nada en los últimos ${r.ventana.dias} días. Hay ${r.fueraDeVentana} anotados de antes — ampliá la ventana para verlos.`
  }
  return 'Nada para mostrar en esta ventana con este filtro.'
}

/** Hace cuánto, en palabras. `null` cuando la fecha no se entiende. Mismo criterio que el buzón. */
export function haceCuanto(iso: string, ahora: number): string | null {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const min = Math.floor((ahora - t) / 60000)
  if (min < 0) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return d === 1 ? 'hace 1 día' : `hace ${d} días`
}
