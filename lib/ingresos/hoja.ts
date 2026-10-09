/**
 * La hoja para la pizarra: lo que viene en cada importación, en papel A4 apaisado, una tarjeta por
 * diseño con su foto, su nombre y cuántas vienen de cada modelo.
 *
 * Este módulo es la parte pura —qué importaciones entran, qué tarjetas, cómo se reparten en
 * páginas—; el dibujo con jsPDF vive en `./pdf.ts`.
 *
 * 🔑 **Cada material arranca en hoja nueva.** El papel se pega en un corcho, y lo que se mira junto
 * es lo de un mismo material: una hoja que mezcla el final de los encapsulados con el principio de
 * los IMD no se puede colgar en ningún lado.
 */

import { celdaGet, estadoDe, ordenarPorFecha, totalDiseno } from './core'
import type { Bloque, Ingreso } from './tipos'

/**
 * Tres papeles para tres usos:
 * - `cantidades`: la tarjeta completa, para saber qué llega (4 × 2 por hoja).
 * - `disenos`: foto, número y nombre, sin cantidades (5 × 2).
 * - `imagenes`: sólo las fotos, de corrido y sin texto, para hacer el paneo y armar colecciones
 *   (6 × 3). Acá ⛔ no se corta por material: lo que se busca es ver todo junto.
 */
export type ModoHoja = 'cantidades' | 'disenos' | 'imagenes'

export const GRILLA: Record<ModoHoja, { columnas: number; filas: number }> = {
  cantidades: { columnas: 4, filas: 2 },
  disenos: { columnas: 5, filas: 2 },
  imagenes: { columnas: 6, filas: 3 },
}
export const porHoja = (modo: ModoHoja) => GRILLA[modo].columnas * GRILLA[modo].filas
/** La de cantidades, que es la de siempre. */
export const POR_HOJA = porHoja('cantidades')

export type LineaModelo = { modelo: string; cantidad: number }

export type Tarjeta = {
  /** Número del diseño dentro de su material (1, 2, 3…), para poder decir «el 7» frente al corcho. */
  numero: number
  nombre: string
  /** Sin nombre comercial todavía: el papel lo dice en vez de dejar el hueco. */
  sinNombre: boolean
  img: string
  total: number
  modelos: LineaModelo[]
}

export type Pagina = {
  ingresoId: string
  titulo: string
  proveedor: string
  fecha: string
  estado: string
  material: string
  /** Unidades de todo el material (no sólo de esta hoja). */
  unidadesMaterial: number
  /** Si los modelos se acortaron («16 Pro» por «iPhone 16 Pro»), la marca que se sacó. */
  marcaModelos: string
  /** «hoja 2 de 3» dentro del material; 1 de 1 cuando entra en una. */
  parte: number
  partes: number
  tarjetas: Tarjeta[]
}

/** Las que todavía no llegaron. Las arribadas ya están en el depósito: no son «lo que viene». */
export function ingresosPorLlegar(ingresos: Ingreso[]): Ingreso[] {
  return ordenarPorFecha(ingresos.filter((g) => g.estado !== 'arribado'))
}

/**
 * Si todos los modelos del material son de la misma marca, la marca se dice una vez y en la tarjeta
 * queda lo que los distingue: «iPhone 16 Pro Max» no entra dos veces por renglón en 6 cm.
 */
export function marcaComun(modelos: string[]): string {
  const limpios = modelos.map((m) => m.trim()).filter(Boolean)
  if (!limpios.length) return ''
  const primera = limpios[0].split(/\s+/)[0]
  if (!primera) return ''
  return limpios.every((m) => m.split(/\s+/)[0] === primera && m.split(/\s+/).length > 1) ? primera : ''
}

function corto(modelo: string, marca: string): string {
  const m = modelo.trim()
  return marca && m.startsWith(marca + ' ') ? m.slice(marca.length + 1) : m
}

/** Un diseño vacío —sin foto, sin nombre y sin unidades— es una columna que sobró en la grilla. */
function esVacio(b: Bloque, did: string, img: string, nombre: string): boolean {
  return !img && !nombre.trim() && totalDiseno(b, did) === 0
}

/** Las tarjetas de un material, en el orden de la grilla. Sólo los modelos que vienen (> 0). */
export function tarjetasDe(b: Bloque): { tarjetas: Tarjeta[]; marca: string } {
  const usados = (b.modelos || []).filter((m) => (b.disenos || []).some((d) => celdaGet(b, m.id, d.id) > 0))
  const marca = marcaComun(usados.map((m) => m.model))
  const tarjetas: Tarjeta[] = []
  ;(b.disenos || []).forEach((d) => {
    const nombre = String(d.nombre || '').trim()
    if (esVacio(b, d.id, d.img, nombre)) return
    const modelos = (b.modelos || [])
      .map((m) => ({ modelo: corto(m.model, marca), cantidad: celdaGet(b, m.id, d.id) }))
      .filter((l) => l.cantidad > 0)
    tarjetas.push({
      numero: tarjetas.length + 1,
      nombre: nombre || `Diseño ${tarjetas.length + 1}`,
      sinNombre: !nombre,
      img: d.img || '',
      total: totalDiseno(b, d.id),
      modelos,
    })
  })
  return { tarjetas, marca }
}

/** Todas las hojas de las importaciones dadas, en su orden: importación → material → de a N. */
export function paginasHoja(ingresos: Ingreso[], modo: ModoHoja = 'cantidades'): Pagina[] {
  if (modo === 'imagenes') return paginasDeImagenes(ingresos)
  const N = porHoja(modo)
  const paginas: Pagina[] = []
  ingresos.forEach((g, gi) => {
    ;(g.bloques || []).forEach((b) => {
      const { tarjetas, marca } = tarjetasDe(b)
      if (!tarjetas.length) return
      const partes = Math.ceil(tarjetas.length / N)
      const unidadesMaterial = tarjetas.reduce((s, t) => s + t.total, 0)
      for (let p = 0; p < partes; p++) {
        paginas.push({
          ingresoId: g.id,
          titulo: String(g.desc || '').trim() || `Importación ${gi + 1}`,
          proveedor: String(g.proveedor || '').trim(),
          fecha: g.fecha || '',
          estado: estadoDe(g.estado).lbl.replace(/\s*✓$/, ''),
          material: String(b.nombre || '').trim() || 'Sin material',
          unidadesMaterial,
          marcaModelos: marca,
          parte: p + 1,
          partes,
          tarjetas: tarjetas.slice(p * N, (p + 1) * N),
        })
      }
    })
  })
  return paginas
}

/** Las fotos de todas las importaciones de corrido. Sin foto no hay nada que mirar: se saltea. */
function paginasDeImagenes(ingresos: Ingreso[]): Pagina[] {
  const todas = ingresos.flatMap((g) => (g.bloques || []).flatMap((b) => tarjetasDe(b).tarjetas)).filter((t) => t.img)
  const N = porHoja('imagenes')
  const partes = Math.ceil(todas.length / N)
  const paginas: Pagina[] = []
  for (let p = 0; p < partes; p++) {
    paginas.push({
      ingresoId: '',
      titulo: '',
      proveedor: '',
      fecha: '',
      estado: '',
      material: '',
      unidadesMaterial: 0,
      marcaModelos: '',
      parte: p + 1,
      partes,
      tarjetas: todas.slice(p * N, (p + 1) * N),
    })
  }
  return paginas
}

/** «20/10/2026» desde «2026-10-20»; vacío si no hay fecha. */
export function fechaCorta(iso: string): string {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
