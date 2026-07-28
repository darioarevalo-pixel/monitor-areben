/**
 * Cliente de Canjes. Entra por el router `/api/postventa?recurso=canjes` (Vercel cuenta una
 * función por archivo de ruta y el proyecto vive cerca del tope del plan Hobby: hay 9 rutas de 12).
 *
 * Todo va con `apiFetch`, que manda la credencial del Monitor en `x-monitor-auth`.
 *
 * ⚠️ El `store` que se manda **no elige base de datos**: el handler habla siempre con la de BDI,
 * para las tres marcas. Lo que elige es qué canjes vuelven enteros y cuáles en modo ciego, y qué
 * fila de `canje_config` se lee. Ver el encabezado de `api/_canjes.js`.
 */

import { apiFetch } from '@/lib/api-fetch'
import { numeroCanje } from './tipos'
import type { CanjeConfig, CanjePersona, CanjeRow, CanjeStore, TallesPersona } from './tipos'

const API = '/api/postventa?recurso=canjes'

/** Un canje de otra marca: sólo marca, fecha y estado. La plata no viaja al browser. */
export type CanjeCiego = Pick<CanjeRow, 'id' | 'persona_id' | 'store' | 'estado' | 'acordado_at' | 'entregado_at' | 'cerrado_at' | 'created_at'> & {
  numero: string
  ciego: true
}

export type CanjeVisible = (CanjeRow & { ciego?: false }) | CanjeCiego

/** El discriminante. Un canje ciego no se puede abrir ni sumar al balance. */
export function esCiego(c: CanjeVisible): c is CanjeCiego {
  return (c as CanjeCiego).ciego === true
}

async function postear(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const d = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok || !d.ok) throw new Error(String(d.error || `Error ${r.status}`))
  return d
}

async function leer(qs: string): Promise<Record<string, unknown>> {
  // `nc` para saltear el caché del browser: la lista cambia mientras se la mira.
  const r = await apiFetch(`${API}&${qs}&nc=${Date.now()}`)
  const d = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok || !d.ok) throw new Error(String(d.error || `Error ${r.status}`))
  return d
}

export type DatosCanjes = {
  personas: CanjePersona[]
  canjes: CanjeVisible[]
  config: CanjeConfig | null
  marcasVisibles: CanjeStore[]
}

/**
 * El padrón entero más los canjes que este perfil puede ver. El padrón **no se filtra por marca**:
 * es transversal, y esa es toda la gracia — que la creadora que trabajó para BDI aparezca cuando
 * marketing de Zattia busca a quién llamar.
 */
export async function leerCanjes(store: CanjeStore): Promise<DatosCanjes> {
  const d = await leer(`store=${store}`)
  return {
    personas: (d.personas as CanjePersona[]) || [],
    canjes: (d.canjes as CanjeVisible[]) || [],
    config: (d.config as CanjeConfig) || null,
    marcasVisibles: (d.marcasVisibles as CanjeStore[]) || [],
  }
}

export type FichaPersonaDatos = { persona: CanjePersona; canjes: CanjeVisible[] }

export async function leerPersona(store: CanjeStore, id: number): Promise<FichaPersonaDatos> {
  const d = await leer(`vista=persona&store=${store}&id=${id}`)
  return { persona: d.persona as CanjePersona, canjes: (d.canjes as CanjeVisible[]) || [] }
}

export async function leerConfig(store: CanjeStore): Promise<CanjeConfig | null> {
  const d = await leer(`vista=config&store=${store}`)
  return (d.config as CanjeConfig) || null
}

/**
 * Alta con **un solo campo: el @**. Si esa persona ya existe devuelve la ficha que hay con
 * `existia: true` en vez de tirar error: la UI abre esa ficha. Es el caso normal, no el
 * excepcional — la misma creadora vuelve, y que el alta sea barata es lo que hace que el padrón se
 * llene en vez de quedar en la planilla.
 */
export async function crearPersona(
  store: CanjeStore,
  datos: { instagram: string; nombre?: string; apellido?: string; telefono?: string; email?: string; tiktok?: string; ciudad?: string },
): Promise<{ persona: CanjePersona; existia: boolean }> {
  const d = await postear({ store, action: 'persona-crear', ...datos, instagram_raw: datos.instagram })
  return { persona: d.persona as CanjePersona, existia: d.existia === true }
}

export type CamposPersona = Partial<{
  instagram: string
  nombre: string | null
  apellido: string | null
  telefono: string | null
  email: string | null
  tiktok: string | null
  ciudad: string | null
  dni: string | null
  calle: string | null
  numero: string | null
  piso: string | null
  depto: string | null
  cp: string | null
  provincia: string | null
  localidad: string | null
  direccion_nota: string | null
  talles: TallesPersona
  modelo_celular: string | null
  seguidores_ig: number | null
  seguidores_tt: number | null
  cadencia_dias: number
  destacada: boolean
  destacada_nota: string | null
  vetada: boolean
  vetada_motivo: string | null
}>

export async function editarPersona(store: CanjeStore, id: number, campos: CamposPersona): Promise<void> {
  await postear({ store, action: 'persona-editar', id, ...campos })
}

/** Devuelve las notas ya actualizadas: la lista se re-pinta sin volver a leer la ficha entera. */
export async function agregarNota(store: CanjeStore, id: number, texto: string): Promise<CanjePersona['notas']> {
  const d = await postear({ store, action: 'persona-nota', id, texto })
  return (d.notas as CanjePersona['notas']) || []
}

/** ⚠️ Por `nota_id`, nunca por índice: ver el comentario en `api/_canjes.js`. */
export async function borrarNota(store: CanjeStore, id: number, notaId: string): Promise<CanjePersona['notas']> {
  const d = await postear({ store, action: 'persona-nota-borrar', id, nota_id: notaId })
  return (d.notas as CanjePersona['notas']) || []
}

export async function agregarArchivo(
  store: CanjeStore, id: number, archivo: { url: string; nombre?: string; tipo?: string },
): Promise<CanjePersona['archivos']> {
  const d = await postear({ store, action: 'persona-archivo', id, ...archivo })
  return (d.archivos as CanjePersona['archivos']) || []
}

export async function borrarArchivo(store: CanjeStore, id: number, url: string): Promise<CanjePersona['archivos']> {
  const d = await postear({ store, action: 'persona-archivo-borrar', id, url })
  return (d.archivos as CanjePersona['archivos']) || []
}

/** Los números del módulo. Requiere administración: el servidor lo vuelve a chequear. */
export async function guardarConfig(store: CanjeStore, campos: Partial<Omit<CanjeConfig, 'store'>>): Promise<void> {
  await postear({ store, action: 'config', ...campos })
}

/** El número visible, para cuando el canje viene de la API sin él (los ciegos ya lo traen). */
export function numeroDe(c: { id: number; numero?: string }): string {
  return c.numero || numeroCanje(c.id)
}
