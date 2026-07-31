/**
 * El reporte de qué hay que fotografiar, a Excel. Cliente-only (`xlsx` por import dinámico, igual
 * que `lib/comisiones/export.ts`, para que no entre al bundle).
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
import type { IndiceStock } from './stock-variante'
import type { Marca } from '@/lib/nav'
import type { ProductoFchk } from './tipos'

const hoy = () => new Date().toISOString().slice(0, 10)

const TIENDA: Record<Marca, string> = {
  bdi: 'https://www.bdiaccesorios.com.ar/productos',
  zattia: 'https://www.zattia.com.ar/productos',
}

export type FilaExport = { producto: ProductoFchk; estado: EstadoFotos }

/** En qué cola de trabajo cae este color. Es lo que decide quién lo agarra. */
function estadoDeColor(e: EstadoFotos, tieneFoto: boolean): string {
  if (e.sinNingunaFoto) return 'sin ninguna foto'
  if (tieneFoto) return 'se arregla en la pantalla' // el color tiene foto; le falta en alguna variante
  return e.fotosLibres.length > 0 ? 'se arregla en la pantalla' : 'falta fotografiar'
}

export async function exportarPendientesXLSX(filas: FilaExport[], marca: Marca, idx?: IndiceStock): Promise<void> {
  const XLSX = await import('xlsx')

  const rows: (string | number)[][] = [
    ['Producto', 'Color', 'Variantes sin foto', 'Total variantes', 'Unidades sin foto', 'Estado', 'Categoría', 'id TN', 'Link'],
  ]

  for (const { producto: p, estado } of filas) {
    const link = p.handle ? `${TIENDA[marca]}/${p.handle}` : ''
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

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 38 }, { wch: 20 }, { wch: 17 }, { wch: 15 }, { wch: 17 }, { wch: 24 }, { wch: 26 }, { wch: 12 }, { wch: 46 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Fotos pendientes')
  XLSX.writeFile(wb, `fotos-pendientes_${marca}_${hoy()}.xlsx`)
}
