/**
 * Lógica pura de Cupones: estado derivado, días a vencer, texto del descuento,
 * filtro de la lista, mensaje de recordatorio y el alta con validación. Port de
 * _cupDias/cuponesEstado/_cupDesc/_cupListaFiltrada/cuponesCopiarRecordatorio/
 * cuponesCrear (index.html:10690-10748), sin DOM ni globales.
 *
 * El "hoy" viaja SIEMPRE por parámetro (el legacy lee `hoyISO()` global): así las
 * funciones son deterministas y testeables, y no dependen del reloj.
 */

import type { Cupon, EstadoCupon, FiltroCupon, TipoDescuento } from './tipos'

/** Días desde hoy hasta el vencimiento (negativo si ya venció), o null si no vence. Port de _cupDias. */
export function dias(vence: string | undefined, hoy: string): number | null {
  if (!vence) return null
  const hoyD = new Date(hoy + 'T00:00:00')
  const fin = new Date(vence + 'T00:00:00')
  return Math.round((fin.getTime() - hoyD.getTime()) / 86400000)
}

/** Estado derivado del cupón. Port de cuponesEstado (mismo orden de precedencia). */
export function estado(c: Cupon, hoy: string): EstadoCupon {
  if (c.anulado) return 'anulado'
  if (c.unSoloUso && c.usado) return 'usado'
  const d = dias(c.vence, hoy)
  if (d !== null && d < 0) return 'vencido'
  if (d !== null && d <= 3) return 'porvencer'
  return 'vigente'
}

/** Texto del descuento ("$1.500" o "15%"). Port de _cupDesc. */
export function descuento(c: Cupon): string {
  return c.tipo === 'monto' ? '$' + Math.round(+c.valor || 0).toLocaleString('es-AR') : (+c.valor || 0) + '%'
}

/** Un cupón con su estado ya calculado (lo que consume la tabla). */
export type CuponConEstado = { c: Cupon; e: EstadoCupon }

/**
 * Filtra la lista por pestaña y búsqueda (nombre o código). "vigentes" incluye los
 * por-vencer. Devuelve cada cupón con su estado. Port de _cupListaFiltrada.
 */
export function filtrar(cupones: Cupon[], filtro: FiltroCupon, busqueda: string, hoy: string): CuponConEstado[] {
  const q = (busqueda || '').trim().toLowerCase()
  const conEstado: CuponConEstado[] = (cupones || []).map((c) => ({ c, e: estado(c, hoy) }))
  let lista = conEstado
  if (filtro === 'vigentes') lista = conEstado.filter((x) => x.e === 'vigente' || x.e === 'porvencer')
  else if (filtro === 'porvencer') lista = conEstado.filter((x) => x.e === 'porvencer')
  else if (filtro === 'usados') lista = conEstado.filter((x) => x.e === 'usado')
  else if (filtro === 'vencidos') lista = conEstado.filter((x) => x.e === 'vencido')
  if (q) lista = lista.filter((x) => (x.c.nombre || '').toLowerCase().includes(q) || (x.c.codigo || '').toLowerCase().includes(q))
  return lista
}

/** Mensaje de recordatorio para WhatsApp. Port literal de cuponesCopiarRecordatorio. */
export function mensajeRecordatorio(c: Cupon): string {
  const primer = (c.nombre || '').split(' ')[0] || ''
  const venceTxt = c.vence ? c.vence.split('-').reverse().join('/') : ''
  return `Hola ${primer}! 🙌 Te recuerdo que tenés un descuento de ${descuento(c)} para usar en el local${venceTxt ? `, vale hasta el ${venceTxt}` : ''}. ¡Te esperamos!`
}

/** Los datos crudos del formulario de alta. */
export type DatosNuevoCupon = {
  nombre: string
  telefono?: string
  tipo: string
  valor: string | number
  codigo?: string
  minimo?: string | number
  motivo?: string
  unSoloUso: boolean
  vence: string
  creadoPor?: string
}

/**
 * Arma un cupón nuevo desde el formulario, con la misma validación que cuponesCrear:
 * nombre obligatorio, valor > 0 y vencimiento. Devuelve el error de validación o el
 * cupón listo para persistir. `meta.usuario` es el fallback de "generado por".
 */
export function crearCupon(d: DatosNuevoCupon, meta: { id: string; hoy: string; usuario: string }): { ok: true; cupon: Cupon } | { ok: false; error: string } {
  const nombre = (d.nombre || '').trim()
  const valor = typeof d.valor === 'number' ? d.valor : parseFloat(d.valor)
  if (!nombre) return { ok: false, error: 'Poné el nombre y apellido del cliente.' }
  if (!(valor > 0)) return { ok: false, error: 'Poné el valor del descuento.' }
  if (!d.vence) return { ok: false, error: 'Poné hasta cuándo vale el cupón.' }
  const tipo: TipoDescuento = d.tipo === 'monto' ? 'monto' : 'porcentaje'
  const cupon: Cupon = {
    id: meta.id,
    nombre,
    telefono: (d.telefono || '').trim(),
    tipo,
    valor,
    codigo: (d.codigo || '').trim(),
    minimo: (typeof d.minimo === 'number' ? d.minimo : parseFloat(String(d.minimo ?? ''))) || 0,
    motivo: (d.motivo || '').trim(),
    unSoloUso: !!d.unSoloUso,
    vence: d.vence,
    fechaCreado: meta.hoy,
    creadoPor: (d.creadoPor || '').trim() || meta.usuario || '',
    usado: false,
    usadoFecha: '',
    anulado: false,
  }
  return { ok: true, cupon }
}
