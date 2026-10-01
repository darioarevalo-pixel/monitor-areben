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

import type { Producto, Variante } from '@/lib/etl/tipos'
import { precioDeGondola, seChequea, tipoDePrenda } from '@/lib/exhib/core'
import type { ExhibItem } from '@/lib/exhib/tipos'
import { diasEntre } from '@/lib/fechas/dia'
import type { Marca } from '@/lib/nav'
import { TEMPORADAS_INICIALES, TIPOS_INICIALES } from './inicial'
import type { Largo, MapaLocal, ModoCupo, Modulo, Nivel, PosNivel, Prenda, Temporada, Temporadas, TipoCfg, Tramo } from './tipos'

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
 * Hasta cuántos días desde el alta una prenda tiene **lugar asegurado**: todavía no tuvo con qué
 * vender. ⚠️ Regla elegida, ⛔ no medida.
 * 🔴 **Eran 30 y se comían el salón** (medido el 1-oct-2026 con el stock real): en septiembre entraron
 * 147 productos (251 prendas) y se llevaban **246 de 298 perchas**, dejando afuera 174 que vendían
 * —una con 23 ventas en 30 días—. Bruno eligió entonces que compitan por **ritmo**.
 */
export const DIAS_NUEVA = 7

/** La ventana de ventas del ETL (`sales30`). Es también el corte de «sin rotación». */
export const DIAS_VENTANA = 30

/** Lo que vendió una prenda (producto×color), sumando sus talles. */
export type VentasPrenda = { ventas30: number; ultimaVenta: string | null }

/**
 * Lo que hace falta para el tramo de cada prenda: las ventas por producto×color, el alta de cada
 * producto y el día de hoy. `null` en `prendasDelLocal` = el ETL todavía no llegó.
 */
export type Actividad = { hoy: string; ventas: Map<string, VentasPrenda>; altas: Map<string, string | null> }

/**
 * Las ventas del ETL llevadas a la percha: **producto×color**, con la misma clave que
 * `prendasDelLocal`. ⛔ No recalcula ninguna venta: suma las de cada variante (`allVariantes`).
 *
 * 🔑 Toda variante que el ETL conoce entra, venda o no: así un producto sin ventas da **0**, que
 * afirma, y uno que el ETL ⛔ no conoce queda afuera del mapa y da `null`, que ⛔ no afirma nada.
 */
export function actividadDelEtl(
  variantes: Pick<Variante, 'pid' | 'size' | 'sales30' | 'lastSale'>[],
  productos: Pick<Producto, 'id' | 'ingresoFecha'>[],
  hoy: string,
): Actividad {
  const ventas = new Map<string, VentasPrenda>()
  for (const v of variantes) {
    const clave = `${v.pid}|${colorDeVariante(v.size)}`
    const ya = ventas.get(clave) || { ventas30: 0, ultimaVenta: null }
    ya.ventas30 += v.sales30 || 0
    if (v.lastSale && (!ya.ultimaVenta || v.lastSale > ya.ultimaVenta)) ya.ultimaVenta = v.lastSale
    ventas.set(clave, ya)
  }
  const altas = new Map(productos.map((p) => [String(p.id), p.ingresoFecha]))
  return { hoy, ventas, altas }
}

/**
 * El tramo de una prenda (ver `Tramo`). 🔑 **Cero ventas sólo cuenta cuando se SABE que es cero**:
 * sin datos (`null`) la prenda va con las que venden, porque no saber ⛔ no es «no rota». Y una prenda
 * con menos de 30 días a la venta ⛔ no es «sin rotación» todavía: compite por ritmo, aunque sea cero.
 */
export function tramoDe(alta: string | null, ventas30: number | null, hoy: string): Tramo {
  const dias = alta ? diasEntre(alta.slice(0, 10), hoy) : null
  if (dias != null && dias <= DIAS_NUEVA) return 'nueva'
  if (ventas30 === 0 && (dias == null || dias > DIAS_VENTANA)) return 'sin-rotacion'
  return 'vende'
}

/**
 * **Ventas por día** desde que está a la venta, con tope en la ventana del ETL: una prenda dada de
 * alta hace 10 días que vendió 3 (0,3/día) le gana a una vieja que vendió 5 en 30 (0,17/día). Sin el
 * alta se cuentan los 30 días. `null` = ⛔ no se saben las ventas.
 */
export function ritmoDe(alta: string | null, ventas30: number | null, hoy: string): number | null {
  if (ventas30 == null) return null
  const dias = alta ? diasEntre(alta.slice(0, 10), hoy) : DIAS_VENTANA
  return ventas30 / Math.max(1, Math.min(DIAS_VENTANA, dias))
}

/**
 * Las prendas del salón: **una por producto×color con stock en el Local**, sin Stunned.
 *
 * ⚠️ El Local de Gestión Nube junta el salón y el depósito del local, así que esto es «lo que
 * podría estar colgado», ⛔ no «lo que está colgado» (eso lo mide el Chequeo de exhibición).
 *
 * `actividad` es **obligatoria** aunque sea `null`: sin ventas todas caen en `vende` y el orden es el
 * de antes (más unidades primero). Así ninguna pantalla se olvida de pasarla sin que se note.
 */
export function prendasDelLocal(items: ExhibItem[], marca: Marca, actividad: Actividad | null): Prenda[] {
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
    const v = actividad?.ventas.get(clave)
    const alta = actividad?.altas.get(it.productId) ?? null
    const ventas30 = v ? v.ventas30 : null
    porClave.set(clave, {
      clave,
      productId: it.productId,
      nombre: it.name,
      color,
      tipo: tipoDePrenda(it.name),
      linea: of.lista == null && of.aCobrar == null ? null : of.enOferta ? 'sale' : 'nc',
      img: it.img,
      unidades: it.qty,
      ventas30,
      ultimaVenta: v?.ultimaVenta ?? null,
      alta,
      ritmo: actividad ? ritmoDe(alta, ventas30, actividad.hoy) : null,
      tramo: actividad ? tramoDe(alta, ventas30, actividad.hoy) : 'vende',
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
 * La temporada de un tipo: la del mapa, o la del armado inicial si el mapa ⛔ no la trae (uno guardado
 * antes del 1-oct-2026), o `'todo'`. Así un mapa viejo ⛔ no despierta los sweaters en verano.
 */
export function temporadaDe(mapa: Pick<MapaLocal, 'tipos'>, tipo: string): Temporada {
  return cfgDeTipo(mapa, tipo)?.temporada ?? TIPOS_INICIALES.find((t) => t.tipo === tipo)?.temporada ?? 'todo'
}

export function temporadasDe(mapa: Pick<MapaLocal, 'temporadas'>): Temporadas {
  return mapa.temporadas ?? TEMPORADAS_INICIALES
}

/** ¿`hoy` (`YYYY-MM-DD`) cae en el tramo? Un tramo con `desde` después de `hasta` cruza el año nuevo. */
export function enRango(r: { desde: string; hasta: string }, hoy: string): boolean {
  const md = hoy.slice(5, 10)
  return r.desde <= r.hasta ? md >= r.desde && md <= r.hasta : md >= r.desde || md <= r.hasta
}

/** Qué temporadas corren hoy. Las dos = el cambio de temporada. */
export function temporadasDeHoy(mapa: Pick<MapaLocal, 'temporadas'>, hoy: string): { verano: boolean; invierno: boolean } {
  const t = temporadasDe(mapa)
  return { verano: enRango(t.verano, hoy), invierno: enRango(t.invierno, hoy) }
}

/** Un cambio de temporadas: las fechas y/o la temporada de algunos tipos. ⛔ No toca nada más. */
export type CambioTemporadas = { temporadas?: Temporadas; porTipo?: Record<string, Temporada> }

/**
 * El mapa con el cambio de temporadas aplicado, **sin tocar las barras**. 🔑 Lo usa «Qué se cuelga»
 * sobre el mapa recién leído al guardar: así ⛔ no pisa un cambio de barras que alguien guardó desde
 * «Percheros» mientras esta pantalla estaba abierta.
 * Un tipo que el mapa ⛔ no tiene se agrega con lo del armado inicial (o lo mínimo), y su temporada.
 */
export function conTemporadas(mapa: MapaLocal, c: CambioTemporadas): MapaLocal {
  const porTipo = c.porTipo ?? {}
  const tipos = mapa.tipos.map((t) => (t.tipo in porTipo ? { ...t, temporada: porTipo[t.tipo] } : t))
  for (const [tipo, temporada] of Object.entries(porTipo)) {
    if (tipos.some((t) => t.tipo === tipo)) continue
    const ini = TIPOS_INICIALES.find((t) => t.tipo === tipo)
    tipos.push({ ...(ini ?? { tipo, largo: 'L2', perchasPorM: DENSIDAD_DEFAULT, topePorM: null, cuelga: true }), temporada })
  }
  return { ...mapa, tipos, temporadas: c.temporadas ?? temporadasDe(mapa) }
}

/**
 * ¿Este tipo va al salón hoy? Fuera de su temporada **duerme**: se guarda a propósito, ⛔ no pide
 * percha ni cuenta como «no entra». 🔑 `hoy` es obligatorio: la regla ⛔ no lee el reloj por su cuenta.
 */
export function despierta(mapa: Pick<MapaLocal, 'tipos' | 'temporadas'>, tipo: string, hoy: string): boolean {
  const t = temporadaDe(mapa, tipo)
  return t === 'todo' || temporadasDeHoy(mapa, hoy)[t]
}

/**
 * Las perchas por metro de un tipo en un modo. 🔑 **Al tope sin medir vale lo mismo que cómodo**:
 * inventar un tope sería decir que entra algo que nadie probó colgar.
 */
export function densidadDe(c: Pick<TipoCfg, 'perchasPorM' | 'topePorM'>, modo: ModoCupo = 'comodo'): number {
  return modo === 'tope' && c.topePorM != null ? Math.max(c.topePorM, c.perchasPorM) : c.perchasPorM
}

/**
 * Cuántas perchas entran en una barra: cómodas, o al tope.
 *
 * 🔑 **Manda el tipo MÁS GRUESO de la barra** (la menor densidad), ⛔ no el promedio: una barra que
 * acepta tops y sweaters puede terminar llena de sweaters, y el cupo tiene que valer igual.
 * El cupo puesto a mano es uno solo y vale para los dos modos.
 */
export function cupoDe(mapa: Pick<MapaLocal, 'tipos'>, modulo: Pick<Modulo, 'anchoCm'>, nivel: Nivel, modo: ModoCupo): number {
  if (nivel.cupo != null) return Math.max(0, Math.floor(nivel.cupo))
  if (nivel.pos === 'frente') return CUPO_FRENTE
  const densidades = nivel.tipos
    .map((t) => cfgDeTipo(mapa, t))
    .filter((c): c is TipoCfg => !!c && c.perchasPorM > 0)
    .map((c) => densidadDe(c, modo))
  const densidad = densidades.length ? Math.min(...densidades) : DENSIDAD_DEFAULT
  return Math.floor((modulo.anchoCm / 100) * densidad)
}

/** ¿Esta barra acepta esta prenda? Una prenda sin línea conocida entra en cualquiera de su tipo. */
export function acepta(nivel: Pick<Nivel, 'tipos' | 'linea'>, p: Pick<Prenda, 'tipo' | 'linea'>): boolean {
  if (!nivel.tipos.includes(p.tipo)) return false
  return nivel.linea === 'ambas' || p.linea == null || nivel.linea === p.linea
}

/** Los modelos elegidos a mano en alguna barra del mapa (ver `Nivel.modelos`). */
export function modelosElegidos(mapa: Pick<MapaLocal, 'modulos'>): Set<string> {
  return new Set(mapa.modulos.flatMap((m) => m.niveles.flatMap((n) => n.modelos || [])))
}

/**
 * `acepta` con los modelos elegidos a mano: una barra con modelos acepta sólo esos, y un modelo
 * elegido ⛔ cae en ninguna otra barra por su tipo. 🔴 Todo lo que reparte prendas pasa por acá: si
 * `ubicar` y `estabilizar` miraran reglas distintas, «Mover» mandaría un modelo elegido a otra barra.
 */
export function aceptaEn(mapa: Pick<MapaLocal, 'modulos'>): (nivel: Pick<Nivel, 'tipos' | 'linea' | 'modelos'>, p: Pick<Prenda, 'tipo' | 'linea' | 'productId'>) => boolean {
  const elegidos = modelosElegidos(mapa)
  return (nivel, p) => (nivel.modelos?.length ? nivel.modelos.includes(p.productId) : !elegidos.has(p.productId) && acepta(nivel, p))
}

/** Las prendas que abren los mismos caminos: mismo tipo y línea, o el mismo modelo elegido a mano. */
const claseDe = (p: Prenda, elegidos: Set<string>) => (elegidos.has(p.productId) ? `modelo|${p.productId}` : `${p.tipo}|${p.linea}`)

/** El orden en que se llenan las barras de un módulo: lo que se ve primero, primero. */
const ORDEN_POS: Record<PosNivel, number> = { frente: 0, alta: 1, simple: 2, baja: 3 }

export type BarraOrdenada = { id: string; modulo: Modulo; nivel: Nivel; cupo: number }

/** Todas las barras, en el orden del recorrido del cliente. */
export function barras(mapa: MapaLocal, modo: ModoCupo): BarraOrdenada[] {
  return [...mapa.modulos]
    .sort((a, b) => a.orden - b.orden || a.codigo.localeCompare(b.codigo))
    .flatMap((m) =>
      [...m.niveles]
        .sort((a, b) => ORDEN_POS[a.pos] - ORDEN_POS[b.pos])
        .map((n) => ({ id: idNivel(m, n), modulo: m, nivel: n, cupo: cupoDe(mapa, m, n, modo) })),
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
  /** Fuera de temporada: se guardan a propósito y ⛔ no piden percha (ver `despierta`). */
  durmiendo: Prenda[]
}

const ORDEN_TRAMO: Record<Tramo, number> = { nueva: 0, vende: 1, 'sin-rotacion': 2 }

/**
 * La prioridad para quedarse en el salón cuando no entran todas (decisión de Bruno, 1-oct-2026):
 * 1. **Nueva** (alta hace ≤ `DIAS_NUEVA` días), la más nueva primero: todavía no tuvo con qué vender.
 * 2. **El resto compite por RITMO** (`ritmoDe`, ventas por día desde que está a la venta), de más a
 *    menos. Así lo nuevo de 20 días ⛔ no se lleva la percha de algo viejo que vende 23 al mes, ni al
 *    revés. Sin dato (`null`) va detrás de todo lo que vende.
 * 3. **Sin rotación** (cero ventas en 30 días, a la venta hace más de 30): última, y la pantalla la
 *    lista aparte para decidir.
 *
 * 🔑 **El outlet ⛔ no tiene trato aparte**: compite por la percha con lo nuevo según lo que vende.
 * Medido el 1-oct-2026 en el local: por percha rendía igual (1,29 contra 1,26 u por producto en 14 d).
 *
 * Desempatan las unidades en el Local (con más talles atrás vende más estando colgada) y el nombre,
 * para que el resultado ⛔ no cambie de un día a otro sin que cambie nada.
 */
export function prioridad(a: Prenda, b: Prenda): number {
  const t = ORDEN_TRAMO[a.tramo] - ORDEN_TRAMO[b.tramo]
  if (t) return t
  if (a.tramo === 'nueva') {
    const al = (b.alta || '').localeCompare(a.alta || '')
    if (al) return al
  }
  if (a.tramo === 'vende') {
    const r = (b.ritmo ?? -1) - (a.ritmo ?? -1)
    if (r) return r
  }
  return b.unidades - a.unidades || a.nombre.localeCompare(b.nombre) || a.color.localeCompare(b.color)
}

/**
 * Dónde va cada prenda. Se llenan las barras en el orden del recorrido, sin pasar nunca el cupo.
 *
 * 🔴 **Llenar en orden y ya NO alcanza: miente «no entra».** Si D1 acepta tops y sweaters y los tops
 * llegan primero, se quedan con D1 aunque tengan lugar en D2, y el sweater sale «al depósito» con
 * lugar de sobra en el salón (lo cazó el test de «Mover», 1-oct-2026). ⇒ Cuando todas las barras de
 * una prenda están llenas, se busca **correr una ya colgada a otra barra que también la acepte**,
 * en cadena (`colgar`). Las prendas se siguen tomando por prioridad, así que entra la misma cantidad
 * o más, y ⛔ nunca una de menos prioridad en lugar de una de más.
 */
export function ubicar(prendas: Prenda[], mapa: MapaLocal, modo: ModoCupo, hoy: string): Ubicacion {
  const lista = barras(mapa, modo)
  const porBarra: Record<string, Prenda[]> = Object.fromEntries(lista.map((b) => [b.id, []]))
  const out: Ubicacion = { porBarra, noEntran: [], sinLugar: [], noCuelgan: [], durmiendo: [] }
  // Si una prenda no encontró lugar, ninguna de su mismo tipo y línea lo va a encontrar después:
  // colgar más nunca abre un camino que no estaba.
  const trabadas = new Set<string>()
  const elegidos = modelosElegidos(mapa)
  const aceptaAca = aceptaEn(mapa)
  for (const p of [...prendas].sort(prioridad)) {
    if (!cuelga(mapa, p.tipo)) {
      out.noCuelgan.push(p)
      continue
    }
    if (!despierta(mapa, p.tipo, hoy)) {
      out.durmiendo.push(p)
      continue
    }
    const candidatas = lista.filter((b) => aceptaAca(b.nivel, p))
    if (!candidatas.length) {
      out.sinLugar.push(p)
      continue
    }
    const clase = claseDe(p, elegidos)
    if (trabadas.has(clase) || !colgar(p, candidatas, lista, porBarra, aceptaAca, elegidos)) {
      trabadas.add(clase)
      out.noEntran.push(p)
    }
  }
  return out
}

/**
 * Cuelga `p` en la primera barra suya con lugar. Si están todas llenas, busca la cadena más corta
 * que haga lugar —una prenda de una barra de `p` pasa a otra barra que la acepta, y así hasta una
 * con lugar— y la aplica. `false` = no hay forma sin sacar a alguien.
 */
function colgar(
  p: Prenda,
  candidatas: BarraOrdenada[],
  lista: BarraOrdenada[],
  porBarra: Record<string, Prenda[]>,
  aceptaAca: ReturnType<typeof aceptaEn>,
  elegidos: Set<string>,
): boolean {
  const libre = candidatas.find((b) => porBarra[b.id].length < b.cupo)
  if (libre) {
    porBarra[libre.id].push(p)
    return true
  }
  // Cómo se llegó a cada barra: desde qué barra se le pasaría qué prenda. `null` = es de `p`.
  const via = new Map<string, { de: string; q: Prenda } | null>(candidatas.map((b) => [b.id, null]))
  const cola = candidatas.map((b) => b.id)
  while (cola.length) {
    const id = cola.shift()!
    // Una sola prenda por clase: dos iguales abren los mismos caminos.
    const vistas = new Set<string>()
    for (const q of porBarra[id]) {
      const k = claseDe(q, elegidos)
      if (vistas.has(k)) continue
      vistas.add(k)
      for (const c of lista) {
        if (via.has(c.id) || !aceptaAca(c.nivel, q)) continue
        via.set(c.id, { de: id, q })
        if (porBarra[c.id].length < c.cupo) {
          let actual = c.id
          for (let paso = via.get(actual); paso; paso = via.get(actual)) {
            porBarra[paso.de] = porBarra[paso.de].filter((o) => o !== paso!.q)
            porBarra[actual].push(paso.q)
            actual = paso.de
          }
          porBarra[actual].push(p)
          return true
        }
        cola.push(c.id)
      }
    }
  }
  return false
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
  durmiendo: number
}

/** La cuenta por tipo de prenda: cuántas hay, cuántas entran y cuántas no. Las que más faltan, arriba. */
export function resumenPorTipo(prendas: Prenda[], mapa: MapaLocal, u: Ubicacion): FilaTipo[] {
  const filas = new Map<string, FilaTipo>()
  const fila = (tipo: string) => {
    let f = filas.get(tipo)
    if (!f) {
      f = { tipo, configurado: !!cfgDeTipo(mapa, tipo), cuelga: cuelga(mapa, tipo), nc: 0, sale: 0, total: 0, ubicadas: 0, noEntran: 0, sinLugar: 0, durmiendo: 0 }
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
  for (const p of u.durmiendo) fila(p.tipo).durmiendo++
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
export function capacidadTotal(mapa: MapaLocal, modo: ModoCupo): number {
  return barras(mapa, modo).reduce((s, b) => s + b.cupo, 0)
}

export type EstadoModulo = 'vacio' | 'ok' | 'lleno' | 'desborda'

/**
 * Cómo está un módulo con las prendas de hoy. 🔑 **«Desborda» es lleno Y con prendas de lo suyo que
 * no entraron**: un módulo lleno al que no le sobra nada está bien armado, ⛔ no es una alarma.
 */
export function estadoDeModulo(mapa: MapaLocal, m: Modulo, u: Ubicacion, modo: ModoCupo): { usadas: number; cupo: number; estado: EstadoModulo } {
  let usadas = 0
  let cupo = 0
  for (const n of m.niveles) {
    usadas += (u.porBarra[idNivel(m, n)] || []).length
    cupo += cupoDe(mapa, m, n, modo)
  }
  const lleno = cupo > 0 && usadas >= cupo
  const aceptaAca = aceptaEn(mapa)
  const sobraLoSuyo = lleno && u.noEntran.some((p) => m.niveles.some((n) => aceptaAca(n, p)))
  const estado: EstadoModulo = sobraLoSuyo ? 'desborda' : lleno ? 'lleno' : usadas < cupo / 2 ? 'vacio' : 'ok'
  return { usadas, cupo, estado }
}

/**
 * La ubicación nueva reacomodada para que **se mueva lo menos posible** respecto de la anterior.
 *
 * 🔴 **`ubicar` sola no sirve para decir qué mover**: llena las barras en el orden del recorrido, así
 * que sumarle TOP a la primera barra corre a TODOS los tops una barra más allá, y la lista «Mover»
 * saldría con cien prendas que cambian de lugar sin que haga falta.
 *
 * 🔑 **Qué entra y qué no, ⛔ no se toca**: sólo se cambia EN QUÉ barra está cada prenda colgada, y
 * nunca se pasa un cupo. Una prenda vuelve a su barra anterior si esa barra todavía la acepta y tiene
 * lugar, o cambiándose con una que tampoco estaba en su lugar. Cada paso deja al menos una prenda más
 * en su barra de antes, así que termina.
 */
export function estabilizar(nueva: Ubicacion, previa: Ubicacion, mapa: MapaLocal, modo: ModoCupo): Ubicacion {
  const lista = barras(mapa, modo)
  const porId = new Map(lista.map((b) => [b.id, b]))
  const antes = new Map<string, string>()
  for (const [id, ps] of Object.entries(previa.porBarra)) for (const p of ps) antes.set(p.clave, id)
  const porBarra: Record<string, Prenda[]> = Object.fromEntries(Object.entries(nueva.porBarra).map(([id, ps]) => [id, [...ps]]))
  const enSuLugar = (p: Prenda, id: string) => antes.get(p.clave) === id
  const aceptaAca = aceptaEn(mapa)

  let cambio = true
  while (cambio) {
    cambio = false
    for (const x of Object.keys(porBarra)) {
      for (const p of [...porBarra[x]]) {
        // Lo que se movió en esta misma vuelta ya no está acá: se vuelve a mirar en la próxima.
        if (!porBarra[x].includes(p)) continue
        const y = antes.get(p.clave)
        const destino = y ? porId.get(y) : undefined
        if (!y || y === x || !destino || !aceptaAca(destino.nivel, p)) continue
        const origen = porId.get(x)!
        if (porBarra[y].length < destino.cupo) {
          porBarra[x] = porBarra[x].filter((o) => o !== p)
          porBarra[y].push(p)
          cambio = true
          continue
        }
        const q = porBarra[y].find((o) => !enSuLugar(o, y) && aceptaAca(origen.nivel, o))
        if (!q) continue
        porBarra[x] = porBarra[x].map((o) => (o === p ? q : o))
        porBarra[y] = porBarra[y].map((o) => (o === q ? p : o))
        cambio = true
      }
    }
  }
  for (const id of Object.keys(porBarra)) porBarra[id].sort(prioridad)
  return { ...nueva, porBarra }
}

/** Una prenda que cambia de lugar. `null` es afuera del salón: el depósito, o que no tenía barra. */
export type Movimiento = { prenda: Prenda; de: string | null; a: string | null }

/**
 * Lo que hay que mover para pasar de una ubicación a otra, con el mismo stock: en el orden del
 * recorrido de la barra a la que va (el de `porBarra`, que sale de `barras`), y lo que va al
 * depósito al final.
 */
export function movimientos(previa: Ubicacion, nueva: Ubicacion): Movimiento[] {
  const donde = (u: Ubicacion) => {
    const m = new Map<string, { p: Prenda; id: string }>()
    for (const [id, ps] of Object.entries(u.porBarra)) for (const p of ps) m.set(p.clave, { p, id })
    return m
  }
  const de = donde(previa)
  const a = donde(nueva)
  const out: Movimiento[] = []
  for (const [clave, { p, id }] of a) if (de.get(clave)?.id !== id) out.push({ prenda: p, de: de.get(clave)?.id ?? null, a: id })
  for (const [clave, { p, id }] of de) if (!a.has(clave)) out.push({ prenda: p, de: id, a: null })
  return out
}
