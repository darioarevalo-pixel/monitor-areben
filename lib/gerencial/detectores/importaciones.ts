/**
 * Detector de importaciones (solo BDI): pedidos por llegar cuya ETA quedó vencida
 * (debía arribar y sigue sin hacerlo) o está por caer dentro de la ventana. Deriva
 * de `estado` + `fecha` del ingreso; no toca el KV (lo lee el hook).
 */

import type { Marca } from '@/lib/nav.generated'
import type { EstadoIngreso, Ingreso } from '@/lib/ingresos/tipos'
import type { Accionable } from '../tipos'
import type { Umbrales } from '../umbrales'

/** Días entre hoy y una fecha ISO `YYYY-MM-DD` (negativo si ya pasó). */
function diasHasta(fecha: string, now: Date): number {
  return Math.ceil((Date.parse(fecha + 'T00:00:00') - now.getTime()) / 86400000)
}

const ETIQUETA_ESTADO: Record<EstadoIngreso, string> = {
  cotizando: 'cotizando',
  pedido: 'pedido',
  produccion: 'en producción',
  transito: 'en tránsito',
  aduana: 'en aduana',
  arribado: 'arribado',
}

export function detectarImportaciones(marca: Marca, ingresos: Ingreso[], u: Umbrales, now: Date): Accionable[] {
  const out: Accionable[] = []
  for (const ing of ingresos) {
    if (ing.estado === 'arribado' || !ing.fecha) continue
    const dias = diasHasta(ing.fecha, now)
    const nombre = ing.desc || ing.proveedor || 'Importación'
    const estado = ETIQUETA_ESTADO[ing.estado] ?? ing.estado
    if (dias < 0) {
      out.push({
        id: `importaciones:vencida:${marca}:${ing.id}`,
        area: 'importaciones',
        severidad: 'atencion',
        marca,
        titulo: `Importación demorada: ${nombre}`,
        detalle: `La ETA era ${ing.fecha} (hace ${-dias} día(s)) y todavía figura ${estado}.`,
        recomendacion: 'Confirmar con el proveedor/despachante la nueva fecha de arribo.',
        valor: -dias,
        acciones: [{ tipo: 'link', seccion: 'ingresos', label: 'Ver ingresos' }],
      })
    } else if (dias <= u.etaProximaDias) {
      out.push({
        id: `importaciones:proxima:${marca}:${ing.id}`,
        area: 'importaciones',
        severidad: 'oportunidad',
        marca,
        titulo: `Arribo próximo: ${nombre}`,
        detalle: `Llega en ~${dias} día(s) (${ing.fecha}), ${estado}.`,
        recomendacion: 'Preparar la recepción y planificar reposición/lanzamiento.',
        valor: u.etaProximaDias - dias,
        acciones: [{ tipo: 'link', seccion: 'ingresos', label: 'Ver ingresos' }],
      })
    }
  }
  return out
}
