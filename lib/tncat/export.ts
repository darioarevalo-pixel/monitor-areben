/**
 * El reporte de qué hay que fotografiar, a Excel. Cliente-only: el Excel entra por
 * `lib/excel.ts`, que lo carga con import dinámico para que no viaje en el bundle.
 *
 * **Una fila por color, no por producto**, porque la unidad de trabajo de una sesión de fotos es
 * "el violeta de tal funda" y no el producto entero: un producto puede tener tres colores listos y
 * dos sin foto, y lo que hay que fotografiar son esos dos.
 *
 * Las unidades salen de Gestión Nube (local + depósito). Los colores que no se pudieron cruzar por
 * código van con la celda **vacía**, no en cero: un cero se lee como "no hay stock" y haría
 * descartar algo que sí hay que fotografiar.
 */

import { fichaDe, type EstadoFotos } from './auditoria'
import { descargarXlsx, type Filas } from '@/lib/excel'
import type { IndiceStock } from './stock-variante'
import type { Marca } from '@/lib/nav'
import { linkProducto } from '@/lib/tienda'
import type { ProductoFchk } from './tipos'

const hoy = () => new Date().toISOString().slice(0, 10)

export type FilaExport = { producto: ProductoFchk; estado: EstadoFotos }

/** En qué cola de trabajo cae este color. Es lo que decide quién lo agarra. */
function estadoDeColor(e: EstadoFotos, tieneFoto: boolean): string {
  if (e.sinNingunaFoto) return 'sin ninguna foto'
  if (tieneFoto) return 'se arregla en la pantalla' // el color tiene foto; le falta en alguna variante
  return e.fotosLibres.length > 0 ? 'se arregla en la pantalla' : 'falta fotografiar'
}

export async function exportarPendientesXLSX(filas: FilaExport[], marca: Marca, idx?: IndiceStock): Promise<void> {
  const rows: Filas = [
    ['Producto', 'Color', 'Variantes sin foto', 'Total variantes', 'Unidades sin foto', 'Estado', 'Categoría', 'id TN', 'Link'],
  ]

  for (const { producto: p, estado } of filas) {
    const link = linkProducto(marca, p.handle) || ''
    const categoria = (p.categories || []).join(' · ')
    const colores = fichaDe(p, idx).filter((c) => c.variantesSinFoto > 0)

    if (!colores.length && estado.sinNingunaFoto) {
      // Producto sin color en la variante y sin ninguna foto: igual hay que fotografiarlo.
      rows.push([p.name, '(sin color en la variante)', (p.variantes || []).length, (p.variantes || []).length, '', 'sin ninguna foto', categoria, String(p.id), link])
      continue
    }

    for (const c of colores) {
      rows.push([
        p.name,
        c.color,
        c.variantesSinFoto,
        c.variantes,
        c.unidadesSinFoto ?? '', // vacío ≠ cero: no se pudo cruzar con Gestión Nube
        estadoDeColor(estado, !!c.foto),
        categoria,
        String(p.id),
        link,
      ])
    }
  }

  await descargarXlsx(rows, {
    archivo: `fotos-pendientes_${marca}_${hoy()}.xlsx`,
    hoja: 'Fotos pendientes',
    anchos: [38, 20, 17, 15, 17, 24, 26, 12, 46],
  })
}
