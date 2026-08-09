/**
 * La Biblioteca de anuncios — la cara tipada, más el orden y los filtros.
 *
 * ⚠️ **El agregado no vive acá: vive en `lib/meta-ads/biblioteca.core.js`**, en JS plano, porque lo
 * importa `api/_meta-biblioteca.js`. El porqué de cada decisión está en el docblock del core.
 *
 * # Por qué ordenar y filtrar viven en el cliente y no en el endpoint
 *
 * Son **~60 avisos en 90 días** (medido el 9-ago-2026: 1.137 filas a nivel aviso, 32 avisos
 * distintos en los últimos 30 días). Con ese tamaño, mandarle cada cambio de orden al servidor
 * agregaría un viaje y una espera a algo que se resuelve en un `sort`. Si algún día la pauta crece
 * un orden de magnitud, esto se muda al SQL — y el aviso es que el `sort` empiece a notarse, no una
 * regla de estilo.
 */

import { entregando } from './snapshot'
import type { FormatoCreativo } from './creativos'
import type { LineaPauta } from './tipos'

/** La pieza de un aviso, tal como la devuelve el endpoint. Null cuando Meta no la trajo. */
export type PiezaAviso = {
  id: string
  nombre: string | null
  estado: string | null
  configurado: string | null
  creativeId: string | null
  imagen: string | null
  thumb: string | null
  titulo: string | null
  texto: string | null
  cta: string | null
  destino: string | null
  piezas: string[]
  esVideo: boolean
  formato: FormatoCreativo
  permalink: string | null
}

/** Quién marcó una pieza y cuándo. El favorito es del EQUIPO: hay uno solo por aviso. */
export type MarcaFavorito = { quien: string; creada: string | null }

/** Un aviso de la Biblioteca: los números de la foto diaria + la pieza de Meta. */
export type AvisoBiblioteca = {
  id: string
  nombre: string | null
  linea: LineaPauta | null
  cuentaId: string | null
  campaignId: string | null
  adsetId: string | null
  spend: number
  impresiones: number
  clicks: number
  compras: number
  revenue: number
  ctr: number
  cpc: number
  cpm: number
  roas: number
  /** `null` sin compras. **No es 0**: un CPA de 0 se lee como gratis. */
  cpa: number | null
  /** Cuántos días de foto tiene, entregara o no. */
  dias: number
  /** Cuántos de esos días gastó de verdad. Es el que dice si el ROAS de al lado se puede creer. */
  diasConGasto: number
  primera: string
  ultima: string
  ultimaConGasto: string | null
  /**
   * `effective_status` de Meta. 🔴 `null` **no es «pausado»**: es que Meta no devolvió el aviso, que
   * es lo que pasa con los borrados — su historia sigue viva en la foto aunque el objeto no exista.
   */
  estado: string | null
  configurado: string | null
  pieza: PiezaAviso | null
  favorito: MarcaFavorito | null
}

export type RespuestaBiblioteca = {
  rango: string
  ventana: { desde: string | null; hasta: string }
  avisos: AvisoBiblioteca[]
  /** El día más viejo con foto de los avisos que se devolvieron. Medido, no una constante. */
  desdeReal: string | null
  /** Cuántos avisos quedaron afuera por no tener marca asignada. Se dice, no se esconde. */
  sinLinea: number
  /** Por qué no hay fotos, o null. Cuando viene, la grilla igual trae todos los números. */
  sinPiezas: string | null
  quien: string
}

// ── Orden ──────────────────────────────────────────────────────────────────────────────────────

export type ClaveOrden = 'gasto' | 'roas' | 'cpa' | 'compras' | 'ctr' | 'reciente'

export const ORDENES: { k: ClaveOrden; label: string }[] = [
  { k: 'gasto', label: 'Gasto' },
  { k: 'roas', label: 'ROAS' },
  { k: 'cpa', label: 'Costo por compra' },
  { k: 'compras', label: 'Compras' },
  { k: 'ctr', label: 'CTR' },
  { k: 'reciente', label: 'Último día con gasto' },
]

/**
 * Ordena una copia de la lista.
 *
 * 🔴 **`cpa` va de MENOR a mayor y los `null` van al final, siempre.** Sin compras no hay costo por
 * compra, y un `null` tratado como número lo deja adelante de todo: la pantalla mostraría los avisos
 * que no vendieron nada encabezando el orden de «los que venden más barato».
 */
export function ordenar(avisos: AvisoBiblioteca[], k: ClaveOrden): AvisoBiblioteca[] {
  const copia = [...avisos]
  if (k === 'cpa') {
    return copia.sort((a, b) => {
      if (a.cpa == null && b.cpa == null) return b.spend - a.spend
      if (a.cpa == null) return 1
      if (b.cpa == null) return -1
      return a.cpa - b.cpa
    })
  }
  if (k === 'reciente') {
    return copia.sort((a, b) => String(b.ultimaConGasto ?? '').localeCompare(String(a.ultimaConGasto ?? '')) || b.spend - a.spend)
  }
  const de: Record<Exclude<ClaveOrden, 'cpa' | 'reciente'>, (a: AvisoBiblioteca) => number> = {
    gasto: (a) => a.spend,
    roas: (a) => a.roas,
    compras: (a) => a.compras,
    ctr: (a) => a.ctr,
  }
  const f = de[k]
  // El desempate por gasto no es cosmético: con el ROAS o el CTR en cero (que es lo que tienen los
  // avisos que no entregaron) el orden quedaría al azar y se movería solo entre cargas.
  return copia.sort((a, b) => f(b) - f(a) || b.spend - a.spend)
}

// ── Filtros ────────────────────────────────────────────────────────────────────────────────────

export type FiltroEstado = 'todos' | 'entregando' | 'pausado' | 'ausente'

export const ESTADOS: { k: FiltroEstado; label: string }[] = [
  { k: 'todos', label: 'Todos los estados' },
  { k: 'entregando', label: 'Entregando' },
  { k: 'pausado', label: 'Pausados' },
  { k: 'ausente', label: 'Ya no están en Meta' },
]

export type FiltrosBiblioteca = {
  estado: FiltroEstado
  formato: FormatoCreativo | 'todos'
  texto: string
  soloFavoritos: boolean
}

export const FILTROS_VACIOS: FiltrosBiblioteca = {
  estado: 'todos', formato: 'todos', texto: '', soloFavoritos: false,
}

/**
 * ¿Este aviso pasa el filtro de estado?
 *
 * Los tres grupos reparten el 100% sin superponerse: `ausente` es el `estado === null` (Meta no lo
 * devolvió), y recién con un estado en la mano se pregunta si entrega. Preguntarlo al revés dejaría
 * a los borrados contados como pausados, que es justo lo que hay que poder distinguir.
 */
function pasaEstado(a: AvisoBiblioteca, f: FiltroEstado): boolean {
  if (f === 'todos') return true
  if (a.estado == null) return f === 'ausente'
  if (f === 'entregando') return entregando(a.estado)
  if (f === 'pausado') return !entregando(a.estado)
  return false
}

/**
 * La búsqueda entra en el nombre **y en el copy**, que es lo que permite encontrar «todas las
 * piezas donde dijimos envío gratis». Un aviso sin pieza sólo tiene su nombre para buscar, y eso se
 * ve: no aparece por texto que nunca llegó.
 */
export function filtrar(avisos: AvisoBiblioteca[], f: FiltrosBiblioteca): AvisoBiblioteca[] {
  const t = f.texto.trim().toLowerCase()
  return avisos.filter((a) => {
    if (!pasaEstado(a, f.estado)) return false
    if (f.soloFavoritos && !a.favorito) return false
    if (f.formato !== 'todos' && (a.pieza?.formato ?? 'otro') !== f.formato) return false
    if (!t) return true
    const heno = [a.nombre, a.pieza?.titulo, a.pieza?.texto, a.pieza?.cta].filter(Boolean).join(' ').toLowerCase()
    return heno.includes(t)
  })
}

/** Los totales de lo que se está mostrando. Los ratios se recalculan, nunca se promedian. */
export function totalesDe(avisos: AvisoBiblioteca[]) {
  const t = avisos.reduce(
    (acc, a) => ({
      spend: acc.spend + a.spend,
      compras: acc.compras + a.compras,
      revenue: acc.revenue + a.revenue,
      clicks: acc.clicks + a.clicks,
      impresiones: acc.impresiones + a.impresiones,
    }),
    { spend: 0, compras: 0, revenue: 0, clicks: 0, impresiones: 0 },
  )
  return {
    ...t,
    avisos: avisos.length,
    roas: t.spend ? t.revenue / t.spend : 0,
    cpa: t.compras ? t.spend / t.compras : null,
    ctr: t.impresiones ? (t.clicks / t.impresiones) * 100 : 0,
  }
}
