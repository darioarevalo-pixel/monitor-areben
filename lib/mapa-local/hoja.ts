/**
 * La hoja de un módulo: el papel que se lleva el local al perchero para colgarlo como dice el mapa.
 *
 * 🔑 **Va por módulo y barra por barra, en el orden en que se mira** (de frente, arriba, abajo):
 * es como se cuelga, parado delante del mueble. Cada prenda con su casillero para tildar.
 *
 * 🔑 **Si hay un cambio de armado, la hoja dice de dónde viene cada prenda nueva y a dónde se va
 * cada una que sale.** Sin eso, la persona tiene la lista de lo que debería estar, pero no sabe
 * dónde buscarlo ni qué hacer con lo que sobra. Sin cambio, es la hoja para armar el módulo de cero.
 */

import { cupoDe, idNivel, type Movimiento, type Ubicacion } from './core'
import type { LineaBarra, MapaLocal, ModoCupo, Modulo, PosNivel, Prenda } from './tipos'

const POS_CORTA: Record<PosNivel, string> = { alta: 'arriba', baja: 'abajo', simple: 'barra simple', frente: 'de frente' }
const POS_LARGA: Record<PosNivel, string> = { alta: 'Barra de arriba', baja: 'Barra de abajo', simple: 'Barra simple', frente: 'De frente' }
const LINEA: Record<LineaBarra, string> = { nc: 'Colección', sale: 'Sale', ambas: 'Colección y sale' }
const ORDEN_POS: Record<PosNivel, number> = { frente: 0, alta: 1, simple: 2, baja: 3 }

/** «D03 arriba» a partir de `D03-alta`. `null` es el depósito. */
export function nombreBarra(id: string | null): string {
  if (id == null) return 'depósito'
  const i = id.lastIndexOf('-')
  const pos = id.slice(i + 1) as PosNivel
  return `${id.slice(0, i)} ${POS_CORTA[pos] ?? pos}`
}

/** El renglón de una prenda: el nombre, y el color si lo tiene. */
export const rotuloPrenda = (p: Pick<Prenda, 'nombre' | 'color'>) => (p.color ? `${p.nombre} · ${p.color}` : p.nombre)

export type RenglonHoja = {
  prenda: Prenda
  /** Ausente = ya estaba en esta barra. `null` = viene del depósito. Si no, la barra de donde viene. */
  viene?: string | null
}

export type BarraHoja = {
  id: string
  titulo: string
  detalle: string
  prendas: RenglonHoja[]
  /** Lo que estaba en esta barra y se va: a otra barra, o al depósito (`null`). */
  salen: { prenda: Prenda; a: string | null }[]
}

export type Hoja = { codigo: string; subtitulo: string; barras: BarraHoja[] }

/**
 * Lo que va en la hoja de un módulo. `movs` es la lista «Mover» del cambio en curso, o `null` si no
 * hay cambio (entonces la hoja es sólo lo que va en cada barra).
 */
export function hojaDeModulo(mapa: MapaLocal, modulo: Modulo, u: Ubicacion, movs: Movimiento[] | null, modo: ModoCupo): Hoja {
  const entra = new Map<string, string | null>()
  const salen = new Map<string, { prenda: Prenda; a: string | null }[]>()
  for (const m of movs || []) {
    if (m.a) entra.set(`${m.a}|${m.prenda.clave}`, m.de)
    if (m.de) salen.set(m.de, [...(salen.get(m.de) || []), { prenda: m.prenda, a: m.a }])
  }
  return {
    codigo: modulo.codigo,
    subtitulo: `${modulo.anchoCm} cm de ancho · ${modulo.orden}° en el recorrido · cupo ${modo === 'tope' ? 'al tope' : 'cómodo'}`,
    barras: [...modulo.niveles]
      .sort((a, b) => ORDEN_POS[a.pos] - ORDEN_POS[b.pos])
      .map((n) => {
        const id = idNivel(modulo, n)
        const ps = u.porBarra[id] || []
        return {
          id,
          titulo: `${POS_LARGA[n.pos]} · a ${n.alturaCm} cm`,
          detalle: `${LINEA[n.linea]} · ${n.tipos.length ? n.tipos.join(', ') : 'sin tipos'} · ${ps.length} de ${cupoDe(mapa, modulo, n, modo)} perchas`,
          prendas: ps.map((p) => {
            const k = `${id}|${p.clave}`
            return entra.has(k) ? { prenda: p, viene: entra.get(k) } : { prenda: p }
          }),
          salen: salen.get(id) || [],
        }
      }),
  }
}

/** Manda a la impresora las hojas de varios módulos, sin abrir una pestaña nueva. */
export async function imprimirHojas(hojas: Hoja[], titulo: string) {
  const { imprimirPdf } = await import('../etiquetas/pdf')
  imprimirPdf(await armarPdfHojas(hojas, titulo))
}

/** Las hojas de varios módulos en un solo PDF A4, un módulo por página (o más, si no entra). */
export async function armarPdfHojas(hojas: Hoja[], titulo: string) {
  const { jsPDF } = await import('jspdf')
  // ⛔ Sin flechas: la Helvetica de jsPDF no tiene «←» ni «→» y salen como basura en el papel.
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const M = 15
  const ANCHO = 210 - M * 2
  const PIE = 285
  let y = M
  const salto = (alto: number) => {
    if (y + alto <= PIE) return
    pdf.addPage()
    y = M
  }
  const texto = (t: string, tam: number, bold: boolean, x = M, gris = 0) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(tam)
    pdf.setTextColor(gris)
    const lineas: string[] = pdf.splitTextToSize(t, ANCHO - (x - M))
    for (const l of lineas) {
      salto(tam * 0.42)
      pdf.text(l, x, y + tam * 0.3)
      y += tam * 0.42
    }
  }
  const renglon = (t: string, bold: boolean, gris = 0) => {
    salto(5)
    pdf.setDrawColor(80)
    pdf.rect(M, y + 0.6, 3.4, 3.4)
    texto(t, 10, bold, M + 6, gris)
    y += 0.6
  }

  hojas.forEach((h, i) => {
    if (i > 0) pdf.addPage()
    y = M
    texto(titulo, 9, false, M, 110)
    texto(`Módulo ${h.codigo}`, 20, true)
    texto(h.subtitulo, 10, false, M, 90)
    y += 3
    for (const b of h.barras) {
      salto(16)
      pdf.setDrawColor(180)
      pdf.line(M, y, M + ANCHO, y)
      y += 2.5
      texto(b.titulo, 13, true)
      texto(b.detalle, 9, false, M, 90)
      y += 1.5
      if (!b.prendas.length) texto('No cae ninguna prenda en esta barra.', 10, false, M, 110)
      // Lo nuevo en negrita: es lo que hay que ir a buscar.
      for (const r of b.prendas) {
        const de = r.viene === undefined ? '' : `   (${r.viene == null ? 'traer del depósito' : `viene de ${nombreBarra(r.viene)}`})`
        renglon(`${rotuloPrenda(r.prenda)}${de}`, r.viene !== undefined)
      }
      if (b.salen.length) {
        y += 1.5
        texto('Sacar de esta barra:', 10, true, M, 60)
        for (const s of b.salen) renglon(`${rotuloPrenda(s.prenda)}   (${s.a == null ? 'va al depósito' : `va a ${nombreBarra(s.a)}`})`, false, 60)
      }
      y += 4
    }
  })
  return pdf
}
