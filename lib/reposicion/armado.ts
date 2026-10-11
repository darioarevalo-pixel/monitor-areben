/**
 * El armado de la reposición con el lector, del lado de la pantalla: qué hacer con cada código y
 * cómo se habla con `/api/datos?recurso=repo-armado`. Las reglas que comparte con el servidor
 * (sanear, qué se transfiere) viven en `armado.core.js`.
 *
 * Lo arma Lorena en el depósito, en la COMPU, con el lector (Darío, 12-oct-2026).
 */

import { apiFetch } from '@/lib/api-fetch'
import { normCode } from '@/lib/exhib/core'
import type { FilaVentas, LineaZ } from './porVentas'
import type { RepoItem } from './tipos'

export { fechaAR, motivoRechazo, resumenArmado } from './armado.core.js'

export type LineaPedido = { vid: string; pid: string; sid: string; sku: string; barcode: string; name: string; size: string; cant: number; exhibir: boolean }
export type MotivoFaltante = 'no-estaba' | 'despues' | 'rechazada'
export type EstadoArmado = 'en_curso' | 'transfiriendo' | 'transferido' | 'revisar' | 'cancelado'
export type Sentido = 'llevar' | 'devolver'

export type Armado = {
  id: string
  linea: LineaZ
  sentido: Sentido
  fecha: string
  persona: string | null
  estado: EstadoArmado
  pedido: LineaPedido[]
  escaneos: Record<string, number>
  faltantes: Record<string, MotivoFaltante>
  transfer: { transfer_id?: string | number | null; movement_id?: string | number | null; unidades?: number } | null
  error: string | null
  creado_en: string
  actualizado_en: string
  cerrado_en: string | null
}

/** Lo que se congela al empezar: la lista de «Llevar» tal como está en pantalla (con lo corregido a mano). */
export function pedidoDesde(filas: FilaVentas[], cantidad: (f: FilaVentas) => number): LineaPedido[] {
  return filas
    .map((f) => ({
      vid: f.it.vid,
      pid: f.it.pid,
      sid: f.it.sid,
      sku: f.it.sku,
      barcode: f.it.barcode || '',
      name: f.it.name,
      size: f.it.size,
      cant: cantidad(f),
      exhibir: f.d.exhibir,
    }))
    .filter((l) => l.cant > 0)
}

/** Qué pasó con un código que pasó por el lector. */
export type Lectura =
  | { tipo: 'suma'; linea: LineaPedido; n: number; faltan: number; exhibir: boolean }
  | { tipo: 'sobra'; linea: LineaPedido }
  | { tipo: 'no-pedida'; nombre: string }
  | { tipo: 'desconocido' }

/** Barcode exacto → barcode normalizado → SKU normalizado; el primer escalón que da algo (como en Exhibición). */
function coinciden<T extends { barcode?: string; sku: string }>(items: T[], code: string): T[] {
  const nc = normCode(code)
  const exacto = items.filter((x) => !!x.barcode && x.barcode === code)
  if (exacto.length) return exacto
  const porBarcode = items.filter((x) => !!x.barcode && normCode(x.barcode) === nc)
  if (porBarcode.length) return porBarcode
  return items.filter((x) => !!x.sku && normCode(x.sku) === nc)
}

/**
 * Lee un código contra el pedido. ⛔ No suma nunca de más: lo que sobra o no estaba pedido frena la
 * pantalla, y la prenda se deja en el estante.
 *
 * Si el código engancha más de un renglón (dos variantes con el mismo SKU), suma en el primero que
 * todavía no está completo.
 */
export function leerCodigo(pedido: LineaPedido[], escaneos: Record<string, number>, codigo: string, inv: Pick<RepoItem, 'barcode' | 'sku' | 'name' | 'size'>[]): Lectura {
  const code = codigo.trim()
  if (!code) return { tipo: 'desconocido' }
  const enPedido = coinciden(pedido, code)
  if (enPedido.length) {
    const abierta = enPedido.find((l) => (escaneos[l.vid] || 0) < l.cant)
    if (!abierta) return { tipo: 'sobra', linea: enPedido[0] }
    const n = (escaneos[abierta.vid] || 0) + 1
    // La marca «para exhibir» va con la PRIMERA: es la que sale con alarma y etiquetas.
    return { tipo: 'suma', linea: abierta, n, faltan: abierta.cant - n, exhibir: abierta.exhibir && n === 1 }
  }
  const otra = coinciden(inv.map((x) => ({ ...x, sku: x.sku || '', barcode: x.barcode || '' })), code)[0]
  return otra ? { tipo: 'no-pedida', nombre: `${otra.name}${talle(otra.size) ? ` ${talle(otra.size)}` : ''}` } : { tipo: 'desconocido' }
}

/** El talle para mostrar y decir: «Variante Única» no dice nada, así que no se muestra. */
export function talle(size: string): string {
  return /^variante\s+[uú]nica$/i.test(size.trim()) ? '' : size.trim()
}

/** La frase corta que dice la voz. Corta a propósito: la cancela el escaneo siguiente. */
export function frase(l: Extract<Lectura, { tipo: 'suma' }>): string {
  const t = talle(l.linea.size)
  const tx = t ? `, ${t}` : ''
  const resto = l.faltan > 0 ? `Faltan ${l.faltan}` : 'Completo'
  return `${l.exhibir ? 'Para exhibir. ' : ''}${l.linea.name}${tx}. ${resto}`
}

// ─── El servidor ────────────────────────────────────────────────────────────────────────────────

const API = '/api/datos?recurso=repo-armado&store=zattia'

export class ErrorArmado extends Error {
  status: number
  datos: Record<string, unknown>
  constructor(msg: string, status: number, datos: Record<string, unknown>) {
    super(msg)
    this.status = status
    this.datos = datos
  }
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await apiFetch(url, init)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new ErrorArmado((d && d.error) || 'No se pudo hablar con el servidor.', r.status, d || {})
  return d as T
}

const escribir = <T = { ok: true }>(action: string, datos: Record<string, unknown>) =>
  pedir<T>(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, store: 'zattia', ...datos }) })

/** El armado abierto (de cualquier día) o, si no hay, el último de hoy. `null` si no hay ninguno. */
export async function leerArmadoHoy(linea: LineaZ, sentido: Sentido): Promise<Armado | null> {
  const d = await pedir<{ armado: Armado | null }>(`${API}&action=hoy&linea=${linea}&sentido=${sentido}&nc=${Date.now()}`)
  return d.armado
}

export async function abrirArmado(linea: LineaZ, sentido: Sentido, pedido: LineaPedido[]): Promise<{ armado: Armado; yaHabia?: boolean }> {
  const id = `ra${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return escribir('abrir', { id, linea, sentido, pedido })
}

export const guardarArmado = (id: string, escaneos: Record<string, number>, faltantes: Record<string, MotivoFaltante>) => escribir('guardar', { id, escaneos, faltantes })
export const cancelarArmado = (id: string) => escribir('cancelar', { id })
export const resolverArmado = (id: string, hecha: boolean, transfer_id?: string) => escribir('resolver', { id, hecha, transfer_id })

export type Rechazado = { vid: string; reason: string | null }

/** Hace la transferencia en Gestión Nube con lo escaneado. 422 = GN rechazó renglones y no movió nada. */
export async function transferirArmado(id: string, escaneos: Record<string, number>, faltantes: Record<string, MotivoFaltante>) {
  return escribir<{ ok: true; transfer: NonNullable<Armado['transfer']> }>('transferir', { id, escaneos, faltantes })
}
