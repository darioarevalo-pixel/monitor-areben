/**
 * Reporte «Para colgar» del Conteo del Local (26-sep-2026, lo pidió Bruno para después del conteo
 * del domingo): en el local tiene que haber **uno exhibido por talle y color**. De los productos
 * contados, cada variante con 0 en el salón se reporta:
 * - **Para colgar**: hay unidades en el depósito del local → se repone.
 * - **Sin unidades**: no hay ni en el salón ni en el depósito → no hay qué colgar; queda de dato.
 * Después se descartan a mano los que a propósito no van colgados.
 *
 * Sale del HISTORIAL (el `detalle` que guarda `registroConteo`, con exhibido y depósito por
 * variante), no del conteo en curso: así sobrevive a «Reiniciar» y a «Limpiar terminados». Los
 * conteos guardados antes del 20-jul sólo tenían las diferencias y no sirven: se saltean.
 */

import { ordenarModelo } from '../conteo-deposito/core'
import type { ConteoHistorial } from '../conteo-deposito/tipos'
import { cmpSku, grupoSku, nombreGrupo, SIN_SKU, skuBase } from './core'
import type { CeProducto, Linea } from './tipos'

export type FilaColgar = {
  key: string
  grupo: string
  categoria: string
  sku: string
  skuProd: string
  producto: string
  variante: string
  barcode: string
  sistema: number | null
  exhibido: number
  deposito: number
}

export type Reporte = { paraColgar: FilaColgar[]; sinUnidades: FilaColgar[]; productos: number; variantes: number }

type Fila = Record<string, unknown>
const num = (x: unknown) => (typeof x === 'number' ? x : Number(x) || 0)

/** Día del conteo en Argentina (YYYY-MM-DD): un conteo de las 22 hs no puede caer al día siguiente. */
export function diaAr(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })
}

const esDeLinea = (c: ConteoHistorial, linea: Linea) => {
  const r = (c.resumen || {}) as { modo?: string; linea?: string }
  return r.modo === 'estandar' && r.linea === linea
}
/** Sólo sirven las filas que traen el desglose (los conteos viejos guardaban sólo diferencias). */
const conDesglose = (f: Fila) => 'exhibido' in f && 'deposito' in f

/** Días con conteos de esta línea que sirven para el reporte, del más nuevo al más viejo. */
export function diasConReporte(conteos: ConteoHistorial[], linea: Linea): string[] {
  const dias = new Set<string>()
  conteos.forEach((c) => {
    if (esDeLinea(c, linea) && (c.detalle || []).some(conDesglose)) {
      const d = diaAr(c.fecha_aplicado)
      if (d) dias.add(d)
    }
  })
  return [...dias].sort().reverse()
}

export function armarReporte(conteos: ConteoHistorial[], linea: Linea, dia: string, feed: CeProducto[]): Reporte {
  // SKU de respaldo desde el stock actual, para los conteos que no lo guardaron.
  const skuPor = new Map<string, string>()
  feed.forEach((p) =>
    p.variants.forEach((v) => {
      if (!v.sku) return
      if (v.inventory_id != null) skuPor.set('i' + v.inventory_id, v.sku)
      if (v.barcode) skuPor.set('b' + String(v.barcode).trim().toUpperCase(), v.sku)
    }),
  )
  // Si un talle se contó dos veces en el día, vale el último.
  const porVariante = new Map<string, Fila>()
  conteos
    .filter((c) => esDeLinea(c, linea) && diaAr(c.fecha_aplicado) === dia)
    .sort((a, b) => String(a.fecha_aplicado).localeCompare(String(b.fecha_aplicado)))
    .forEach((c) =>
      (c.detalle || []).filter(conDesglose).forEach((f) => {
        const k = f.inventory_id != null ? 'i' + f.inventory_id : f.barcode ? 'b' + String(f.barcode).trim().toUpperCase() : 'n' + f.producto + '|' + f.variante
        porVariante.set(k, f)
      }),
    )

  const filas: FilaColgar[] = [...porVariante.entries()].map(([key, f]) => {
    const bc = String(f.barcode || '').trim().toUpperCase()
    const sku = String(f.sku || skuPor.get('i' + f.inventory_id) || (bc && skuPor.get('b' + bc)) || '').toUpperCase()
    const skuProd = skuBase(sku)
    const grupo = grupoSku(skuProd)
    return {
      key,
      grupo,
      categoria: nombreGrupo(grupo),
      sku,
      skuProd,
      producto: String(f.producto || '—'),
      variante: String(f.variante || '—'),
      barcode: String(f.barcode || ''),
      sistema: f.sistema == null ? null : num(f.sistema),
      exhibido: num(f.exhibido),
      deposito: num(f.deposito),
    }
  })
  filas.sort(
    (a, b) =>
      (a.grupo === SIN_SKU ? 1 : 0) - (b.grupo === SIN_SKU ? 1 : 0) ||
      cmpSku(a.grupo, b.grupo) ||
      cmpSku(a.skuProd, b.skuProd) ||
      a.producto.localeCompare(b.producto, 'es') ||
      ordenarModelo(a.variante, b.variante),
  )
  const sinExhibir = filas.filter((f) => f.exhibido <= 0)
  return {
    paraColgar: sinExhibir.filter((f) => f.deposito > 0),
    sinUnidades: sinExhibir.filter((f) => f.deposito <= 0),
    productos: new Set(filas.map((f) => f.producto)).size,
    variantes: filas.length,
  }
}
