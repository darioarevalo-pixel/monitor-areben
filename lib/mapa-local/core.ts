/**
 * Mapa del local — la lógica pura: qué es una prenda del salón, cuánto entra en cada barra, dónde
 * va cada prenda y qué está mal pensado en el armado.
 *
 * 🔴 **El número que manda es el CUPO, y es un techo de verdad.** Medido el 30-sep-2026 sobre el
 * espejo: el Local tenía **~640 prendas** (producto×color con stock, sin Stunned) y los 14 módulos
 * de 0,75 m + la isla dan **~370 perchas cómodas**. La saturación de las fotos (perchas que no se
 * deslizan, barras que se tapan) es esa diferencia. ⇒ `ubicar` ⛔ nunca pasa una barra de su cupo:
 * lo que no entra sale como **«no entra»**, que es la decisión que hay que tomar (qué va al depósito),
 * en vez de esconderla colgando de más.
 */

import { precioDeGondola, seChequea, tipoDePrenda } from '@/lib/exhib/core'
import type { ExhibItem } from '@/lib/exhib/tipos'
import type { Marca } from '@/lib/nav'
import type { Largo, MapaLocal, Modulo, Nivel, PosNivel, Prenda, TipoCfg } from './tipos'

/**
 * Lo que mide colgada cada clase de largo, en cm, percha incluida. Es lo que decide si una barra
 * de arriba tapa la de abajo y si una barra baja toca el piso.
 */
export const LARGO_CM: Record<Largo, number> = { L1: 60, L2: 90, L3: 130 }

/** El aire mínimo entre el ruedo de la prenda y lo que tiene abajo (la otra barra o el piso). */
export const AIRE_CM = 5

/** La densidad que se usa cuando una barra no tiene tipos configurados. */
export const DENSIDAD_DEFAULT = 16

/** Cuántas prendas muestra un brazo de frente. */
export const CUPO_FRENTE = 2

/**
 * Lo que es TALLE en el nombre de una variante. El resto es color.
 *
 * 🔴 **En Gestión Nube de Zattia el color a veces va en la VARIANTE** («TOP KOBE» con `Negro foil` y
 * `Negro`; «CORSET FRANK» con `Verde - S`, `Bordó - S`, `Bordó - M`) y a veces en el nombre del
 * producto («CAMPERA ROCK - VIOLETA» con `M`, `L`…). Contar perchas por producto daba **444** contra
 * **679** contando por producto×color, medido el 30-sep-2026: se quedaba corto en un tercio.
 */
const TALLE = /^(xxs|xs|s|m|l|xl|xxl|xxxl|\d{1,3}|u|tu|único|unico|variante única|variante unica|talle único|talle unico)$/i

/** El color de una variante, en minúscula, o `''` si la variante es sólo un talle. */
export function colorDeVariante(size: string | null | undefined): string {
  return String(size || '')
    .split(/\s+-\s+/)
    .map((t) => t.trim())
    .filter((t) => t && !TALLE.test(t))
    .join(' ')
    .toLowerCase()
}

/**
 * Las prendas del salón: **una por producto×color con stock en el Local**, sin Stunned.
 *
 * ⚠️ El Local de Gestión Nube junta el salón y el depósito del local, así que esto es «lo que
 * podría estar colgado», ⛔ no «lo que está colgado» (eso lo mide el Chequeo de exhibición).
 */
export function prendasDelLocal(items: ExhibItem[], marca: Marca): Prenda[] {
  const porClave = new Map<string, Prenda>()
  for (const it of items) {
    if (!(it.qty > 0) || !seChequea(marca, it)) continue
    const color = colorDeVariante(it.size)
    const clave = `${it.productId}|${color}`
    const ya = porClave.get(clave)
    if (ya) {
      ya.unidades += it.qty
      if (!ya.img && it.img) ya.img = it.img
      continue
    }
    const of = precioDeGondola(it)
    porClave.set(clave, {
      clave,
      productId: it.productId,
      nombre: it.name,
      color,
      tipo: tipoDePrenda(it.name),
      linea: of.lista == null && of.aCobrar == null ? null : of.enOferta ? 'sale' : 'nc',
      img: it.img,
      unidades: it.qty,
    })
  }
  return [...porClave.values()]
}

export const idNivel = (m: Pick<Modulo, 'codigo'>, n: Pick<Nivel, 'pos'>) => `${m.codigo}-${n.pos}`

export function cfgDeTipo(mapa: Pick<MapaLocal, 'tipos'>, tipo: string): TipoCfg | null {
  return mapa.tipos.find((t) => t.tipo === tipo) || null
}

/** ¿Va colgada? Un tipo sin configurar se asume que sí: es preferible verlo pedir lugar. */
export function cuelga(mapa: Pick<MapaLocal, 'tipos'>, tipo: string): boolean {
  const c = cfgDeTipo(mapa, tipo)
  return c ? c.cuelga : true
}

/**
 * Cuántas perchas entran cómodas en una barra.
 *
 * 🔑 **Manda el tipo MÁS GRUESO de la barra** (la menor densidad), ⛔ no el promedio: una barra que
 * acepta tops y sweaters puede terminar llena de sweaters, y el cupo tiene que valer igual.
 */
export function cupoDe(mapa: Pick<MapaLocal, 'tipos'>, modulo: Pick<Modulo, 'anchoCm'>, nivel: Nivel): number {
  if (nivel.cupo != null) return Math.max(0, Math.floor(nivel.cupo))
  if (nivel.pos === 'frente') return CUPO_FRENTE
  const densidades = nivel.tipos.map((t) => cfgDeTipo(mapa, t)?.perchasPorM).filter((d): d is number => d != null && d > 0)
  const densidad = densidades.length ? Math.min(...densidades) : DENSIDAD_DEFAULT
  return Math.floor((modulo.anchoCm / 100) * densidad)
}

/** ¿Esta barra acepta esta prenda? Una prenda sin línea conocida entra en cualquiera de su tipo. */
export function acepta(nivel: Pick<Nivel, 'tipos' | 'linea'>, p: Pick<Prenda, 'tipo' | 'linea'>): boolean {
  if (!nivel.tipos.includes(p.tipo)) return false
  return nivel.linea === 'ambas' || p.linea == null || nivel.linea === p.linea
}

/** El orden en que se llenan las barras de un módulo: lo que se ve primero, primero. */
const ORDEN_POS: Record<PosNivel, number> = { frente: 0, alta: 1, simple: 2, baja: 3 }

export type BarraOrdenada = { id: string; modulo: Modulo; nivel: Nivel; cupo: number }

/** Todas las barras, en el orden del recorrido del cliente. */
export function barras(mapa: MapaLocal): BarraOrdenada[] {
  return [...mapa.modulos]
    .sort((a, b) => a.orden - b.orden || a.codigo.localeCompare(b.codigo))
    .flatMap((m) =>
      [...m.niveles]
        .sort((a, b) => ORDEN_POS[a.pos] - ORDEN_POS[b.pos])
        .map((n) => ({ id: idNivel(m, n), modulo: m, nivel: n, cupo: cupoDe(mapa, m, n) })),
    )
}

export type Ubicacion = {
  /** Lo que va en cada barra, por `idNivel`. Nunca pasa del cupo. */
  porBarra: Record<string, Prenda[]>
  /** Tienen barra de su tipo y línea, pero están todas llenas: es lo que va al depósito. */
  noEntran: Prenda[]
  /** Ninguna barra acepta su tipo y línea: falta decidir dónde van. */
  sinLugar: Prenda[]
  /** Tipos que no se cuelgan (bombachas, accesorios). */
  noCuelgan: Prenda[]
}

/**
 * La prioridad para quedarse en el salón cuando no entran todas: **más unidades en el Local
 * primero**, porque una prenda con más talles atrás vende más estando colgada. Desempata el nombre,
 * para que el resultado no cambie de un día a otro sin que cambie nada.
 */
export function prioridad(a: Prenda, b: Prenda): number {
  return b.unidades - a.unidades || a.nombre.localeCompare(b.nombre) || a.color.localeCompare(b.color)
}

/**
 * Dónde va cada prenda. Se llenan las barras en el orden del recorrido, sin pasar nunca el cupo.
 */
export function ubicar(prendas: Prenda[], mapa: MapaLocal): Ubicacion {
  const lista = barras(mapa)
  const porBarra: Record<string, Prenda[]> = Object.fromEntries(lista.map((b) => [b.id, []]))
  const out: Ubicacion = { porBarra, noEntran: [], sinLugar: [], noCuelgan: [] }
  for (const p of [...prendas].sort(prioridad)) {
    if (!cuelga(mapa, p.tipo)) {
      out.noCuelgan.push(p)
      continue
    }
    const candidatas = lista.filter((b) => acepta(b.nivel, p))
    if (!candidatas.length) {
      out.sinLugar.push(p)
      continue
    }
    const libre = candidatas.find((b) => porBarra[b.id].length < b.cupo)
    if (libre) porBarra[libre.id].push(p)
    else out.noEntran.push(p)
  }
  return out
}

export type FilaTipo = {
  tipo: string
  configurado: boolean
  cuelga: boolean
  nc: number
  sale: number
  total: number
  ubicadas: number
  noEntran: number
  sinLugar: number
}

/** La cuenta por tipo de prenda: cuántas hay, cuántas entran y cuántas no. Las que más faltan, arriba. */
export function resumenPorTipo(prendas: Prenda[], mapa: MapaLocal, u: Ubicacion): FilaTipo[] {
  const filas = new Map<string, FilaTipo>()
  const fila = (tipo: string) => {
    let f = filas.get(tipo)
    if (!f) {
      f = { tipo, configurado: !!cfgDeTipo(mapa, tipo), cuelga: cuelga(mapa, tipo), nc: 0, sale: 0, total: 0, ubicadas: 0, noEntran: 0, sinLugar: 0 }
      filas.set(tipo, f)
    }
    return f
  }
  for (const p of prendas) {
    const f = fila(p.tipo)
    f.total++
    if (p.linea === 'sale') f.sale++
    else if (p.linea === 'nc') f.nc++
  }
  for (const ps of Object.values(u.porBarra)) for (const p of ps) fila(p.tipo).ubicadas++
  for (const p of u.noEntran) fila(p.tipo).noEntran++
  for (const p of u.sinLugar) fila(p.tipo).sinLugar++
  return [...filas.values()].sort((a, b) => Number(b.cuelga) - Number(a.cuelga) || b.noEntran + b.sinLugar - (a.noEntran + a.sinLugar) || b.total - a.total)
}

/** El largo más largo que acepta la barra. Un tipo sin configurar cuenta como L2. */
export function largoMax(mapa: Pick<MapaLocal, 'tipos'>, nivel: Pick<Nivel, 'tipos'>): number {
  if (!nivel.tipos.length) return 0
  return Math.max(...nivel.tipos.map((t) => LARGO_CM[cfgDeTipo(mapa, t)?.largo ?? 'L2']))
}

export type Alerta = { codigo: string; pos: PosNivel | null; texto: string; grave: boolean }

/**
 * Lo que está mal pensado en el armado, por la geometría y el recorrido. ⛔ No mira la ocupación:
 * eso lo dice `ubicar`, con las prendas de hoy.
 */
export function alertas(mapa: MapaLocal): Alerta[] {
  const out: Alerta[] = []
  const nivel = (m: Modulo, pos: PosNivel) => m.niveles.find((n) => n.pos === pos)
  for (const m of mapa.modulos) {
    const alta = nivel(m, 'alta')
    const baja = nivel(m, 'baja')
    if (alta && baja && alta.tipos.length) {
      const hueco = alta.alturaCm - baja.alturaCm
      const necesita = largoMax(mapa, alta) + AIRE_CM
      if (hueco < necesita) {
        out.push({ codigo: m.codigo, pos: 'alta', grave: true, texto: `La barra de arriba tapa a la de abajo: hay ${hueco} cm entre las dos y lo de arriba necesita ${necesita}. Subila o colgá arriba algo más corto.` })
      }
    }
    for (const n of m.niveles) {
      if (n.pos === 'frente') continue
      if (n.pos !== 'alta' && n.tipos.length && n.alturaCm - largoMax(mapa, n) < AIRE_CM) {
        out.push({ codigo: m.codigo, pos: n.pos, grave: true, texto: `Lo de esta barra toca el piso: está a ${n.alturaCm} cm y la prenda más larga mide ${largoMax(mapa, n)}.` })
      }
      if (n.pos === 'simple' && n.tipos.length && largoMax(mapa, n) <= LARGO_CM.L1 && n.alturaCm - LARGO_CM.L1 > LARGO_CM.L1) {
        out.push({ codigo: m.codigo, pos: n.pos, grave: false, texto: 'Barra simple con prendas cortas: queda vacía la mitad de abajo. Va mejor en doble barra.' })
      }
      if (!n.tipos.length) out.push({ codigo: m.codigo, pos: n.pos, grave: false, texto: 'Barra sin tipos asignados: no va a recibir ninguna prenda.' })
      for (const t of n.tipos) {
        if (!cfgDeTipo(mapa, t)) out.push({ codigo: m.codigo, pos: n.pos, grave: false, texto: `«${t}» no está en la tabla de tipos: se cuenta como media (L2) y ${DENSIDAD_DEFAULT} perchas por metro.` })
      }
    }
  }
  // El sale se camina al final: un módulo de sale antes que uno de colección le quita la vista
  // de entrada al precio lleno.
  const conLinea = (l: 'nc' | 'sale') => mapa.modulos.filter((m) => m.niveles.some((n) => n.linea === l && n.tipos.length))
  const ultimoNc = Math.max(-Infinity, ...conLinea('nc').map((m) => m.orden))
  for (const m of conLinea('sale')) {
    if (m.orden < ultimoNc) out.push({ codigo: m.codigo, pos: null, grave: false, texto: 'Hay sale antes que colección en el recorrido: el cliente lo ve primero que el precio lleno.' })
  }
  return out
}

/** La cuenta global: perchas cómodas contra prendas que se cuelgan. */
export function capacidadTotal(mapa: MapaLocal): number {
  return barras(mapa).reduce((s, b) => s + b.cupo, 0)
}

export type EstadoModulo = 'vacio' | 'ok' | 'lleno' | 'desborda'

/**
 * Cómo está un módulo con las prendas de hoy. 🔑 **«Desborda» es lleno Y con prendas de lo suyo que
 * no entraron**: un módulo lleno al que no le sobra nada está bien armado, ⛔ no es una alarma.
 */
export function estadoDeModulo(mapa: MapaLocal, m: Modulo, u: Ubicacion): { usadas: number; cupo: number; estado: EstadoModulo } {
  let usadas = 0
  let cupo = 0
  for (const n of m.niveles) {
    usadas += (u.porBarra[idNivel(m, n)] || []).length
    cupo += cupoDe(mapa, m, n)
  }
  const lleno = cupo > 0 && usadas >= cupo
  const sobraLoSuyo = lleno && u.noEntran.some((p) => m.niveles.some((n) => acepta(n, p)))
  const estado: EstadoModulo = sobraLoSuyo ? 'desborda' : lleno ? 'lleno' : usadas < cupo / 2 ? 'vacio' : 'ok'
  return { usadas, cupo, estado }
}
