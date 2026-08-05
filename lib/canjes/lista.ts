/**
 * Filtrar y ordenar la lista de canjes. **Todo puro y todo en el cliente**: `useCanjes` ya baja el
 * módulo entero de una sola vez y lo cruza en memoria, así que un filtro no cuesta ni una llamada.
 *
 * Vive acá y no adentro de `ListaCanjes.tsx` por la razón de siempre: el orden de esta pantalla es
 * una decisión de negocio ("primero lo que espera algo nuestro") y tiene que poder probarse sin
 * montar un componente. Mismo criterio y mismo molde que `ordenarPorContacto`
 * (`lib/canjes/seguimiento.ts`), que es el orden del padrón.
 */

import { normalizarValor } from './vitrina'
import {
  PESO_TRAMO, enTransito, numeroCanje, tramoDeCanje,
  type CanjeRow, type CanjeStore, type TramoCanje,
} from './tipos'

// ── El filtro ───────────────────────────────────────────────────────────────────

export type FiltroEstado =
  | 'abiertos' | 'respuesta' | 'aprobacion' | 'transito' | 'vencidos' | 'cerrados' | 'todos'

/** Lo que sigue pidiendo trabajo de alguien. Es el default: la lista es para trabajar. */
export const ABIERTOS: TramoCanje[] = [
  'firma', 'escribirle', 'acordado', 'comprar', 'despachar', 'transito', 'respuesta', 'contenido',
]

export type FiltroCanjes = {
  estado: FiltroEstado
  /** `'todas'` = no filtrar. La lista mezcla marcas: el server manda las que uno puede ver. */
  store: CanjeStore | 'todas'
  q: string
  /** `YYYY-MM-DD`, como los devuelve un `<input type="date">`. Vacío = sin límite. */
  desde: string
  hasta: string
}

export const FILTRO_VACIO: FiltroCanjes = {
  estado: 'abiertos', store: 'todas', q: '', desde: '', hasta: '',
}

/** Quién es cada persona, para poder buscar por nombre y por @ sin ir a la ficha. */
export type CtxLista = {
  personas: Map<number, { nombre: string; instagram: string }>
  /** Cuántos entregables vencidos tiene cada canje, por id. */
  vencidos: Map<number, number>
}

// ── La fecha ────────────────────────────────────────────────────────────────────

/**
 * La fecha por la que se lista un canje: desde cuándo está en marcha, o desde cuándo existe si
 * todavía no se acordó.
 *
 * 🔑 **Una sola implementación, y es la misma que dibuja la columna "Desde".** Si el filtro mirara
 * `created_at` y la columna mostrara `acordado_at`, un canje se vería con fecha 3-ago y
 * desaparecería de un rango que incluye el 3-ago. Nadie lo reportaría como bug: se leería como que
 * el filtro "anda raro".
 *
 * Se corta el ISO en seco en vez de construir un `Date`: el string ya viene en `YYYY-MM-DD…` y
 * pasarlo por `Date` lo mueve de día según la zona horaria del navegador.
 */
export function fechaDeLista(c: Pick<CanjeRow, 'acordado_at' | 'created_at'>): string {
  return String(c.acordado_at || c.created_at || '').slice(0, 10)
}

// ── El decorado ─────────────────────────────────────────────────────────────────

export type CanjeDecorado = CanjeRow & {
  _persona: string
  _instagram: string
  _fecha: string
  _tramo: TramoCanje
  _peso: number
  /** Cuántos entregables vencidos tiene. 0 = ninguno. */
  _vencidos: number
}

/**
 * Se calcula una vez lo que después se usa para filtrar, ordenar y dibujar. Es el mismo truco de
 * `ProductosTable` (pisa `lifespan` antes de ordenar): sin esto, el comparador tendría que ir a
 * buscar el nombre a un `Map` en cada una de las N·log(N) comparaciones.
 */
export function decorarCanjes(canjes: CanjeRow[], ctx: CtxLista): CanjeDecorado[] {
  return canjes.map((c) => {
    const p = ctx.personas.get(c.persona_id)
    const tramo = tramoDeCanje(c)
    return {
      ...c,
      _persona: p?.nombre || '',
      _instagram: p?.instagram || '',
      _fecha: fechaDeLista(c),
      _tramo: tramo,
      _peso: PESO_TRAMO[tramo],
      _vencidos: ctx.vencidos.get(c.id) || 0,
    }
  })
}

// ── Filtrar ─────────────────────────────────────────────────────────────────────

export function pasaPorEstado(c: CanjeDecorado, f: FiltroEstado): boolean {
  if (f === 'abiertos') return ABIERTOS.includes(c._tramo)
  if (f === 'respuesta') return c.estado === 'enviada'
  if (f === 'aprobacion') return c.estado === 'propuesta'
  if (f === 'transito') return enTransito(c)
  if (f === 'vencidos') return c._vencidos > 0
  if (f === 'cerrados') return c.estado === 'cerrado'
  return true
}

/**
 * Busca por nombre, por @, por número (`C-0004`, o `4` pelado) y por el título de la acción.
 *
 * Los cuatro a la vez y no un selector de "buscar por": quien la conoce por el @ tipea el @, quien
 * la conoce por el nombre tipea el nombre, y ninguno de los dos tiene por qué saber cuál guardamos.
 * Mismo criterio que el buscador del padrón.
 */
export function coincideTexto(c: CanjeDecorado, q: string): boolean {
  const busca = normalizarValor(q)
  if (!busca) return true
  const numero = c.numero || numeroCanje(c.id)
  return [c._persona, c._instagram, numero, String(c.id), c.titulo || '']
    .some((campo) => normalizarValor(campo).includes(busca))
}

export function filtrarCanjes(canjes: CanjeDecorado[], f: FiltroCanjes): CanjeDecorado[] {
  return canjes.filter((c) => {
    if (!pasaPorEstado(c, f.estado)) return false
    if (f.store !== 'todas' && c.store !== f.store) return false
    // Extremos inclusivos: quien escribe "hasta el 5" espera que el día 5 entre. Comparar strings
    // `YYYY-MM-DD` alcanza y evita la zona horaria; un canje sin fecha nunca entra a un rango.
    if (f.desde && (!c._fecha || c._fecha < f.desde)) return false
    if (f.hasta && (!c._fecha || c._fecha > f.hasta)) return false
    return coincideTexto(c, f.q)
  })
}

// ── Ordenar ─────────────────────────────────────────────────────────────────────

/**
 * Primero lo que espera algo nuestro, al fondo lo que ya terminó (ver `PESO_TRAMO`).
 *
 * Adentro del tramo, **el más viejo primero**: lo que hace más que espera es lo que más traba, y es
 * lo que la pestaña Aprobaciones ya hacía sola. Los terminales van al revés —lo recién cerrado
 * arriba—: ahí no hay nada que destrabar y lo que se busca es lo último que pasó.
 *
 * Último desempate por nombre con `localeCompare(…, 'es')`: sin el locale la ñ y los acentos ordenan
 * mal. El id al final hace que el orden sea estable con dos canjes del mismo día y la misma persona.
 */
export function ordenarCanjes(lista: CanjeDecorado[]): CanjeDecorado[] {
  return [...lista].sort((a, b) => {
    if (a._peso !== b._peso) return a._peso - b._peso
    if (a._fecha !== b._fecha) {
      return a._tramo === 'terminal' ? b._fecha.localeCompare(a._fecha) : a._fecha.localeCompare(b._fecha)
    }
    const nombre = a._persona.localeCompare(b._persona, 'es')
    if (nombre !== 0) return nombre
    return a.id - b.id
  })
}
