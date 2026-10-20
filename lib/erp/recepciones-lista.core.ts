/**
 * ERP › Stock › Recepciones (diseño `~/Documents/erp-monitor/diseno.md` §3 y §7; tablero 3 del v8): cada orden de compra
 * que llegó, con la barrita «recibidas de pedidas». Sólo LEE, por la MISMA puerta de Ingresos (`api/_recepciones.js`, que
 * corta el proveedor en el servidor); la pantalla es `components/erp/stock/RecepcionesStock.tsx`.
 *
 * 🔑 MEDIDO 20-oct: las órdenes viven en la base del monitor (BDI, las dos marcas por `store`), ⛔ en el motor; Zattia 98
 * y BDI 25, TODAS `confirmada`: Ingresos avisa sólo al CONFIRMAR ⇒ ⛔ hay «Esperando» (pedida y sin llegar) ni el depósito
 * real (el libro supone el depósito de la marca, `deposito_supuesto`). Lo dice la pantalla; el pedido está en `PENDIENTES.md`.
 * 🔴 La diferencia va por FALTANTES y SOBRANTES (`docs/secciones/recepciones.md`): el neto esconde 2 de menos + 2 de más.
 */
import { diaDeIngreso, fechaDeIngreso, tonoDeCumplimiento, type Recepcion } from '@/lib/recepciones/core'

const normal = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Adónde entra según el libro del ERP (supuesto: Ingresos ⛔ lo manda). */
export const DEPOSITO_SUPUESTO: Record<string, string> = { zattia: 'Depósito', bdi: 'Depósito minorista' }

export type FilaRecepcion = {
  id: string; oc: string; dia: string | null; fecha: string; fechaIngresos: string | null; proveedor: string | null; vaA: string
  pedidas: number; recibidas: number; faltaron: number; sobraron: number; renglonesConDiferencia: number
  estado: 'recibida' | 'diferencia' | 'sin_pedido'; estadoTexto: string; tono: 'ok' | 'aviso' | 'malo' | 'neutro'
  totalesCoinciden: boolean; busca: string
}

export function armarFila(r: Recepcion): FilaRecepcion {
  const faltaron = Number(r.unidades_faltantes) || 0, sobraron = Number(r.unidades_sobrantes) || 0
  const pedidas = Number(r.unidades_pedidas) || 0
  const estado = !pedidas ? 'sin_pedido' : faltaron || sobraron ? 'diferencia' : 'recibida'
  const partes = [faltaron && `faltaron ${faltaron}`, sobraron && `sobraron ${sobraron}`].filter(Boolean).join(' · ')
  const estadoTexto = estado === 'recibida' ? 'Recibida' : estado === 'sin_pedido' ? 'Sin lo pedido' : `Con diferencia: ${partes}`
  const oc = r.oc_label || `OC ${r.oc_id}`
  // «Llegó» = cuando se CONFIRMÓ (Bruno, 20-oct): la fecha que carga Ingresos a mano puede ser futura (OC-3047: 30/10,
  // confirmada el 20/10). Esa va aparte, en la ficha. ⛔ se toca `diaDeIngreso`: es la regla de PRM y de la Agenda.
  const llegada = { fecha_ingreso: null, confirmada_at: r.confirmada_at, recibido_en: r.recibido_en }
  return {
    id: r.id, oc, dia: diaDeIngreso(llegada), fecha: fechaDeIngreso(llegada),
    fechaIngresos: r.fecha_ingreso ? fechaDeIngreso({ fecha_ingreso: r.fecha_ingreso, confirmada_at: '', recibido_en: '' }) : null, proveedor: r.proveedor_nombre ?? null, vaA: DEPOSITO_SUPUESTO[r.store] ?? 'Depósito',
    pedidas, recibidas: Number(r.unidades_contadas) || 0, faltaron, sobraron, renglonesConDiferencia: Number(r.lineas_con_diferencia) || 0,
    estado, estadoTexto,
    // Con diferencia ⛔ pinta verde aunque el neto dé 100%.
    tono: estado === 'diferencia' && tonoDeCumplimiento(r.cumplimiento) === 'ok' ? 'aviso' : tonoDeCumplimiento(r.cumplimiento),
    totalesCoinciden: r.totales_coinciden !== false, busca: normal([oc, r.proveedor_nombre].join(' ')),
  }
}

export const VISTAS: Array<[string, string, (f: FilaRecepcion, mes: string) => boolean]> = [
  ['diferencia', 'Con diferencia', (f) => f.estado === 'diferencia'],
  ['mes', 'Este mes', (f, mes) => (f.dia ?? '').startsWith(mes)],
  ['todas', 'Todas', () => true],
]

export const contarVistas = (filas: FilaRecepcion[], mes: string) =>
  Object.fromEntries(VISTAS.map(([k, , entra]) => [k, filas.filter((f) => entra(f, mes)).length])) as Record<string, number>

/** La vista y el buscador (orden o proveedor). El renglón (prenda) se busca en la ficha. */
export function filtrar(filas: FilaRecepcion[], { vista = 'todas', q = '', mes = '' }: { vista?: string; q?: string; mes?: string }) {
  const entra = VISTAS.find(([k]) => k === vista)?.[2] ?? (() => true)
  const t = normal(q).trim()
  return filas.filter((f) => entra(f, mes) && (!t || f.busca.includes(t)))
}

/** Arriba, del mes: órdenes recibidas, prendas que entraron, con diferencia y lo que faltó. */
export function resumen(filas: FilaRecepcion[], mes: string) {
  let ordenes = 0, entraron = 0, conDiferencia = 0, faltaron = 0
  for (const f of filas) {
    if (!(f.dia ?? '').startsWith(mes)) continue
    ordenes++; entraron += f.recibidas; faltaron += f.faltaron
    if (f.estado === 'diferencia') conDiferencia++
  }
  return { ordenes, entraron, conDiferencia, faltaron }
}

/** Por columna; sin orden elegido, la que llegó último arriba (por el día que MUESTRA la columna, ⛔ `recibido_en`). */
export function ordenar(filas: FilaRecepcion[], orden: { col: string; dir: 'asc' | 'desc' } | null) {
  const k = orden?.col
  const dir = orden?.dir === 'asc' ? 1 : -1
  const val = (f: FilaRecepcion): number | string => (k === 'recibidas' ? (f.pedidas ? f.recibidas / f.pedidas : -1) : k === 'pedidas' ? f.pedidas : f.dia ?? '')
  return filas.slice().sort((a, b) => {
    const x = val(a), y = val(b)
    return (k ? (x > y ? 1 : x < y ? -1 : 0) * dir : 0) || String(b.dia ?? '').localeCompare(String(a.dia ?? '')) || b.oc.localeCompare(a.oc)
  })
}

export const COLUMNAS: Record<string, [string, string, boolean, boolean]> = {
  oc: ['Orden', '96px', false, true],
  llego: ['Llegó', '96px', true, true],
  de: ['De', 'minmax(150px, 1fr)', false, true],
  va: ['Va a', '150px', false, false],
  pedidas: ['Pedidas', '84px', true, false],
  recibidas: ['Recibidas', '190px', true, true],
  estado: ['Estado', 'minmax(200px, 1.2fr)', false, true],
}
export const COLUMNAS_DE_SIEMPRE = { orden: ['oc', 'llego', 'de', 'va', 'pedidas', 'recibidas', 'estado'], visibles: ['oc', 'llego', 'de', 'va', 'recibidas', 'estado'] }
