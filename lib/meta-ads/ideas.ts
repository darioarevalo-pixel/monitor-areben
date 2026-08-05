/**
 * Las ideas de creativos, del lado del cliente (`/api/datos?recurso=meta-funnel`).
 *
 * ⚠️ La máquina de estados —qué transición existe y quién la puede hacer— **no vive acá**: vive en
 * `lib/meta-ads/ideas.core.js`, en JS plano, porque `api/_meta-funnel.js` la necesita para validar y
 * no puede importar TypeScript. Este archivo aporta los tipos y las llamadas.
 *
 * Lo que se dibuja con `transicionesDesde()` es exactamente lo que el servidor deja pasar, porque
 * son las mismas líneas. La UI igual **no es el control de acceso**: no dibujar un botón no impide
 * un `POST` con `curl`, y el que manda es el guard.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'
import type { AsignacionLinea, Etapa, LineaPauta } from './tipos'
import {
  CLAVES_FORMATO as CLAVES_FORMATO_JS,
  conPaso as conPasoJs,
  ESTADOS_IDEA as ESTADOS_IDEA_JS,
  ETIQUETA_ESTADO as ETIQUETA_ESTADO_JS,
  FORMATOS_IDEA as FORMATOS_IDEA_JS,
  puedeEditarIdea as puedeEditarIdeaJs,
  puedeTransicionar as puedeTransicionarJs,
  SUB_PAUTAR as SUB_PAUTAR_JS,
  transicion as transicionJs,
  TRANSICIONES as TRANSICIONES_JS,
  transicionesDesde as transicionesDesdeJs,
} from './ideas.core.js'

export type EstadoIdea = 'propuesta' | 'aprobada' | 'en-produccion' | 'lista' | 'pauteada' | 'descartada'

/** Un paso del historial. Se apila en cada transición y no se borra nunca. */
export type PasoIdea = {
  cuando: number
  quien: string | null
  de: EstadoIdea | null
  a: EstadoIdea
  nota: string | null
}

export type Idea = {
  id: string
  etapa: Etapa
  estado: EstadoIdea
  /** A qué fecha del calendario apunta: `comercial:<clave>:<año>` o `hito:<id>`. */
  evento: string | null
  titulo: string
  formato: string
  /** El gancho, en un renglón. */
  gancho: string | null
  /** El texto propuesto para la pieza. */
  copy: string | null
  /** A quién le habla, en palabras de quien la anotó. */
  aQuien: string | null
  creado: number | null
  creadoPor: string | null
  historial: PasoIdea[]
  /** Se completa al pautearla: cierra el círculo idea → campaña. */
  campaignId?: string | null
}

/** Qué puede este perfil en esta marca. Lo contesta el servidor y lo usa la UI para dibujar. */
export type PoderesIdeas = { pautar: boolean; admin: boolean }

/** Un override de etapa tal como lo devuelve el servidor. */
export type OverrideEtapa = {
  campaign_id: string
  etapa: Etapa
  objetivo: string | null
  nombre: string | null
  motivo: string | null
  por: string
  updated_at: string
}

export type Transicion = { de: EstadoIdea; a: EstadoIdea; quien: 'pautar' | 'equipo'; rotulo: string; exigeMotivo?: boolean }

export const ESTADOS_IDEA = ESTADOS_IDEA_JS as EstadoIdea[]
export const ETIQUETA_ESTADO = ETIQUETA_ESTADO_JS as Record<EstadoIdea, string>
export const TRANSICIONES = TRANSICIONES_JS as Transicion[]
export const FORMATOS_IDEA = FORMATOS_IDEA_JS as { key: string; label: string }[]
export const CLAVES_FORMATO = CLAVES_FORMATO_JS as string[]
export const SUB_PAUTAR = SUB_PAUTAR_JS as string

export const transicion = transicionJs as (de: EstadoIdea, a: EstadoIdea) => Transicion | null
export const puedeTransicionar = puedeTransicionarJs as (
  puede: { ver: boolean; pautar: boolean; admin: boolean },
  de: EstadoIdea,
  a: EstadoIdea,
) => { ok: boolean; motivo?: string; transicion?: Transicion }
export const transicionesDesde = transicionesDesdeJs as (
  puede: { ver: boolean; pautar: boolean; admin: boolean },
  de: EstadoIdea,
) => Transicion[]
export const puedeEditarIdea = puedeEditarIdeaJs as (
  puede: { ver: boolean; pautar: boolean; admin: boolean },
  idea: Idea | null,
  quien: string | null,
) => boolean
export const conPaso = conPasoJs as (idea: Idea, paso: PasoIdea) => Idea

const API = '/api/datos?recurso=meta-funnel'

/** Id de idea. Se genera en el cliente, como en `disenos`, para poder pintar la tarjeta sin ida y vuelta. */
export function nuevoIdIdea(): string {
  return `i${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export async function leerIdeas(store: Marca): Promise<{
  ideas: Idea[]
  overrides: OverrideEtapa[]
  lineas: AsignacionLinea[]
  puede: PoderesIdeas
}> {
  const r = await apiFetch(`${API}&store=${store}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer las ideas.')
  return {
    ideas: (d.ideas || []) as Idea[],
    overrides: (d.overrides || []) as OverrideEtapa[],
    // Las asignaciones de línea salen de la base de BDI, no de `store`: son cross-marca. Viajan acá
    // y no en `/api/meta-ads` para que la pantalla sepa QUIÉN asignó cada una sin una llamada más.
    lineas: (d.lineas || []) as AsignacionLinea[],
    puede: d.puede || { pautar: false, admin: false },
  }
}

async function postear(body: Record<string, unknown>, siFalla: string) {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || siFalla)
  return d
}

/**
 * Alta o edición. El `estado` **no viaja**: una idea nace propuesta y de ahí en más se mueve con
 * `moverIdea`, que es donde vive el control de quién puede qué. Mandarlo acá sería la puerta de atrás.
 */
export async function guardarIdea(store: Marca, idea: Partial<Idea> & { id: string; titulo: string; etapa: Etapa }): Promise<Idea> {
  const d = await postear({ store, idea }, 'No se pudo guardar la idea.')
  return d.idea as Idea
}

export async function moverIdea(store: Marca, id: string, a: EstadoIdea, opts: { nota?: string; campaignId?: string } = {}): Promise<Idea> {
  const d = await postear({ store, id, action: 'estado', a, ...opts }, 'No se pudo mover la idea.')
  return d.idea as Idea
}

export async function borrarIdea(store: Marca, id: string): Promise<void> {
  await postear({ store, id, action: 'borrar' }, 'No se pudo borrar la idea.')
}

/** Corrige a mano la etapa de una campaña. `objetivo`/`nombre` viajan para poder detectar después
 *  que se los cambiaron y que el override quedó viejo. */
export async function clasificarCampaña(
  store: Marca,
  datos: { campaignId: string; etapa: Etapa; cuentaId?: string; objetivo?: string | null; nombre?: string | null; motivo?: string },
): Promise<void> {
  await postear({ store, action: 'clasificar', ...datos }, 'No se pudo corregir la etapa.')
}

export async function desclasificarCampaña(store: Marca, campaignId: string): Promise<void> {
  await postear({ store, action: 'desclasificar', campaignId }, 'No se pudo volver a la clasificación automática.')
}

/**
 * Asigna una campaña a una línea de pauta: de qué marca es esa plata.
 *
 * El `store` que viaja es sólo el de la sesión (el handler lo usa para el gate de «¿ves Meta Ads?»);
 * la fila se guarda en la base de BDI y el permiso se chequea contra la marca de **la línea**, no
 * contra el store. Reasignar una ya asignada pide permiso en las dos puntas.
 */
export async function asignarLinea(
  store: Marca,
  datos: { campaignId: string; linea: LineaPauta; cuentaId?: string; objetivo?: string | null; nombre?: string | null },
): Promise<void> {
  await postear({ store, action: 'asignar-linea', ...datos }, 'No se pudo asignar la marca de la campaña.')
}

export async function desasignarLinea(store: Marca, campaignId: string): Promise<void> {
  await postear({ store, action: 'desasignar-linea', campaignId }, 'No se pudo sacarle la marca a la campaña.')
}
