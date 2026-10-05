/**
 * **Chequeo de exhibición + mapa: el relevamiento.** Se camina el local eligiendo el espacio con
 * botones —lado, número, simple o doble, arriba o abajo— y lo escaneado en cada barra **arma el mapa**.
 *
 * 🔑 **Es la dirección contraria a F4** (`control.ts`). F4 compara lo colgado contra el mapa
 * guardado, y eso sirve sólo si el mapa es lo que está colgado. El 5-oct-2026 no lo era: el local se
 * reacomodó a mano y el sistema quedó viejo. Bruno: *«cambiamos cosas pero físicamente, en sistema
 * todavía no cambió nada… lo de mapa no podemos confirmar nada de ubicación»*. Acá **lo colgado
 * manda** y el mapa sale de ahí.
 *
 * 🔑 **El lugar sigue siendo TEXTO** (`D01 arriba`): los botones escriben en el mismo campo que se
 * guarda en `exhib_escaneo.lugar`. Sin migración, y un recorrido viejo se sigue leyendo igual.
 *
 * ⛔ **Durante el recorrido no se dice falta ni sobra**: lo pidió Bruno, se ve al finalizar. Este
 * archivo sólo arma; la pantalla decide cuándo mostrarlo.
 */

import type { EscaneoLibre } from '@/lib/exhib/libre'
import { precioDeGondola, seChequea, tipoDePrenda } from '@/lib/exhib/core'
import type { ExhibItem } from '@/lib/exhib/tipos'
import { colorDeVariante } from './core'
import type { LineaBarra, MapaLocal, Modulo, Nivel, Pared } from './tipos'

/** La altura de la barra tal como se elige en el salón. `simple` = el módulo tiene una sola barra. */
export type PosEspacio = 'alta' | 'baja' | 'simple'

/**
 * Un espacio del local leído del texto del lugar.
 *
 * 🔑 `largo` = **perchero de DOBLE LARGO**: ocupa este número y el siguiente (`D07-08` es un solo
 * perchero que va del D07 al D08). Pedido de Bruno el 5-oct-2026: el primer relevamiento ⛔ sabía
 * cómo partirlos y se cargaron con un solo número. En el mapa es UN módulo, con el código del primero.
 */
export type Espacio = { codigo: string; pared: Pared; numero: number; pos: PosEspacio; largo: boolean }

/** Las palabras que se dicen en el salón para cada barra. `arriba` es lo que escriben los botones. */
const PALABRA: Record<string, PosEspacio> = { arriba: 'alta', alta: 'alta', abajo: 'baja', baja: 'baja', simple: 'simple' }

/** Lo que escriben los botones. Una sola forma, para que el relevamiento lea siempre lo mismo. */
export const PALABRA_DE: Record<PosEspacio, string> = { alta: 'arriba', baja: 'abajo', simple: '' }

/** `D` + número de dos cifras, como en el mapa (`D01`). La isla no lleva número. */
export function codigoDe(pared: Pared, numero: number): string {
  if (pared === 'isla') return 'ISLA'
  return `${pared === 'der' ? 'D' : 'I'}${String(numero).padStart(2, '0')}`
}

/** El texto del lugar para un espacio: `D01 arriba`, `D01 abajo`, `D01` si es simple, `D07-08 arriba` si es largo. */
export function lugarDe(e: Pick<Espacio, 'pared' | 'numero' | 'pos'> & { largo?: boolean }): string {
  const cod = codigoDe(e.pared, e.numero) + (e.largo && e.pared !== 'isla' ? `-${String(e.numero + 1).padStart(2, '0')}` : '')
  return e.pos === 'simple' ? cod : `${cod} ${PALABRA_DE[e.pos]}`
}

/**
 * El espacio que nombra `lugar`, o `null` si es otra cosa («vidriera», «mesa»).
 *
 * Acepta `D01 arriba`, `d1 abajo`, `D01 alta`, `D01` (simple), `D07-08 arriba` (largo) e `ISLA`.
 * 🔑 Sin palabra de altura es **simple**: los botones escriben `D01` sólo cuando se eligió simple.
 * ⚠️ Un largo que ⛔ sigue al número (`D07-09`) ⛔ es un espacio: un perchero ocupa dos lugares seguidos.
 */
export function leerEspacio(lugar: string): Espacio | null {
  const t = String(lugar || '').trim().toLowerCase().replace(/\s+/g, ' ')
  const isla = /^isla(?: (arriba|alta|abajo|baja|simple))?$/.exec(t)
  if (isla) return { codigo: 'ISLA', pared: 'isla', numero: 0, pos: isla[1] ? PALABRA[isla[1]] : 'simple', largo: false }
  const m = /^([di]) ?-?0*(\d{1,2})(?: ?[-+] ?[di]?0*(\d{1,2}))?(?: (arriba|alta|abajo|baja|simple))?$/.exec(t)
  if (!m) return null
  const numero = Number(m[2])
  if (!numero) return null
  if (m[3] && Number(m[3]) !== numero + 1) return null
  const pared: Pared = m[1] === 'd' ? 'der' : 'izq'
  return { codigo: codigoDe(pared, numero), pared, numero, pos: m[4] ? PALABRA[m[4]] : 'simple', largo: !!m[3] }
}

/** La prenda de un escaneo (producto×color), con la misma clave que `prendasDelLocal`. */
function claveDe(e: Pick<EscaneoLibre, 'encontrado' | 'product_id' | 'size'>): string | null {
  return e.encontrado && e.product_id ? `${e.product_id}|${colorDeVariante(e.size)}` : null
}

/** Una prenda vista en el recorrido. */
export type PrendaVista = { clave: string; productId: string; nombre: string; color: string; tipo: string }

export type BarraRelevada = {
  pos: PosEspacio
  /**
   * 🔴 `false` = es la otra altura de un módulo doble y **nadie la caminó**. ⛔ Se afirma nada de
   * ella: al guardar queda como estaba en el mapa, y el cierre la nombra «sin relevar».
   */
  relevada: boolean
  /** Prendas distintas (producto×color) escaneadas en esta barra. */
  prendas: PrendaVista[]
  /**
   * 🔑 **Las PERCHAS que había**: cada variante (talle) que pasó por el lector, se haya identificado o
   * no. ⛔ Es `prendas.length`: se cuelgan varios talles del mismo color y cada uno ocupa su percha
   * (medido el 5-oct-2026: D03 abajo, 26 perchas y 7 colores). Es el cupo que se guarda (Bruno: «sí, perchas»).
   */
  perchas: number
  /** Los modelos que quedan en esta barra al guardar (ver `enDosBarras`). */
  modelos: string[]
  tipos: string[]
  linea: LineaBarra
}

export type ModuloRelevado = {
  codigo: string
  pared: Pared
  numero: number
  /** Cómo lo declaró quien lo caminó. */
  estructura: 'doble' | 'simple'
  /** Perchero de doble largo: ocupa este número y el siguiente (ver `Espacio.largo`). */
  largo: boolean
  barras: BarraRelevada[]
}

export type Relevamiento = {
  modulos: ModuloRelevado[]
  /** Los lugares escritos a mano (vidriera, mesas): cuentan como exhibido, ⛔ no van al mapa. */
  otrosLugares: string[]
  /**
   * Módulos escaneados como simple **y** como doble en el mismo recorrido. Se toma doble, y lo
   * escaneado sin altura ⛔ va a ninguna barra (sigue contando como exhibido).
   */
  dudosos: string[]
  /**
   * Modelos escaneados en dos barras (dos colores en lugares distintos, o la misma prenda). El mapa
   * guarda el MODELO por barra (`Nivel.modelos`), así que queda en la barra donde más se lo vio.
   */
  enDosBarras: { nombre: string; productId: string; barras: string[]; queda: string }[]
}

const ORDEN_PARED: Record<Pared, number> = { izq: 0, isla: 1, der: 2 }

/**
 * El relevamiento: qué estructura tiene cada módulo caminado y qué hay en cada barra.
 *
 * ⚠️ Los escaneos que ⛔ cruzaron con el inventario ⛔ entran a ninguna barra (no se sabe qué
 * modelo son), y los de Stunned tampoco: el mapa es de Zattia (`seChequea`).
 */
export function armarRelevamiento(escaneos: EscaneoLibre[]): Relevamiento {
  type Acum = { pared: Pared; numero: number; largo: boolean; pos: Map<PosEspacio, Map<string, { p: PrendaVista; veces: number; nc: boolean | null }>>; perchas: Map<PosEspacio, Set<string>> }
  const porModulo = new Map<string, Acum>()
  const otros = new Set<string>()

  for (const e of escaneos) {
    const esp = leerEspacio(e.lugar)
    if (!esp) {
      if (e.lugar.trim()) otros.add(e.lugar.trim())
      continue
    }
    let m = porModulo.get(esp.codigo)
    if (!m) porModulo.set(esp.codigo, (m = { pared: esp.pared, numero: esp.numero, largo: false, pos: new Map(), perchas: new Map() }))
    // Con una sola lectura «largo» alcanza: quien lo caminó dijo que el perchero sigue en el número siguiente.
    if (esp.largo) m.largo = true
    let barra = m.pos.get(esp.pos)
    if (!barra) m.pos.set(esp.pos, (barra = new Map()))
    if (!m.perchas.has(esp.pos)) m.perchas.set(esp.pos, new Set())
    m.perchas.get(esp.pos)!.add(e.variante_id || e.codigo_crudo)
    const clave = claveDe(e)
    if (!clave || !seChequea('zattia', { sku: e.sku || '' })) continue
    const ya = barra.get(clave)
    if (ya) {
      ya.veces += e.veces ?? 1
      continue
    }
    const g = precioDeGondola({ precio: e.precio, promo: e.promo })
    barra.set(clave, {
      p: { clave, productId: e.product_id!, nombre: e.product_name || '', color: colorDeVariante(e.size), tipo: tipoDePrenda(e.product_name) },
      veces: e.veces ?? 1,
      nc: g.lista == null && g.aCobrar == null ? null : !g.enOferta,
    })
  }

  // Cada modelo, a UNA barra: la que más escaneos suyos tiene (empate: la primera en el recorrido del mapa).
  const conteo = new Map<string, Map<string, number>>()
  const nombreDe = new Map<string, string>()
  const ordenados = [...porModulo.entries()].sort(([, a], [, b]) => ORDEN_PARED[a.pared] - ORDEN_PARED[b.pared] || a.numero - b.numero)
  const dudosos: string[] = []
  const posFinal = (cod: string, a: Acum): PosEspacio[] => {
    const tiene = (p: PosEspacio) => a.pos.has(p)
    if ((tiene('alta') || tiene('baja')) && tiene('simple')) dudosos.push(cod)
    return tiene('alta') || tiene('baja') ? ['alta', 'baja'] : ['simple']
  }
  const estructuras = new Map(ordenados.map(([cod, a]) => [cod, posFinal(cod, a)]))
  for (const [cod, a] of ordenados) {
    for (const pos of estructuras.get(cod)!) {
      for (const { p, veces } of a.pos.get(pos)?.values() ?? []) {
        const id = `${cod} ${PALABRA_DE[pos] || 'simple'}`.trim()
        if (!conteo.has(p.productId)) conteo.set(p.productId, new Map())
        const c = conteo.get(p.productId)!
        c.set(id, (c.get(id) ?? 0) + veces)
        nombreDe.set(p.productId, p.nombre)
      }
    }
  }
  const dueño = new Map<string, string>()
  const enDosBarras: Relevamiento['enDosBarras'] = []
  for (const [pid, c] of conteo) {
    const lista = [...c.entries()]
    const queda = lista.reduce((best, x) => (x[1] > best[1] ? x : best))[0]
    dueño.set(pid, queda)
    if (lista.length > 1) enDosBarras.push({ nombre: nombreDe.get(pid) || pid, productId: pid, barras: lista.map(([b]) => b), queda })
  }

  const modulos: ModuloRelevado[] = ordenados.map(([codigo, a]) => {
    const posiciones = estructuras.get(codigo)!
    return {
      codigo,
      pared: a.pared,
      numero: a.numero,
      estructura: posiciones[0] === 'simple' ? 'simple' : 'doble',
      largo: a.largo,
      barras: posiciones.map((pos) => {
        const vistas = [...(a.pos.get(pos)?.values() ?? [])]
        const id = `${codigo} ${PALABRA_DE[pos] || 'simple'}`.trim()
        const modelos = [...new Set(vistas.map((v) => v.p.productId).filter((pid) => dueño.get(pid) === id))]
        const lineas = new Set(vistas.map((v) => v.nc).filter((x): x is boolean => x != null))
        return {
          pos,
          relevada: a.pos.has(pos),
          prendas: vistas.map((v) => v.p).sort((x, y) => x.nombre.localeCompare(y.nombre) || x.color.localeCompare(y.color)),
          perchas: a.perchas.get(pos)?.size ?? 0,
          modelos,
          tipos: [...new Set(vistas.map((v) => v.p.tipo))].sort(),
          linea: lineas.size === 1 ? (lineas.has(true) ? 'nc' : 'sale') : 'ambas',
        }
      }),
    }
  })

  return { modulos, otrosLugares: [...otros].sort(), dudosos, enDosBarras: enDosBarras.sort((a, b) => a.nombre.localeCompare(b.nombre)) }
}

/** Una prenda con stock en el Local que ⛔ pasó por el lector en ningún lugar del recorrido. */
export type FaltaExhibir = { clave: string; nombre: string; color: string; tipo: string; unidades: number }

/** Lo escaneado que sobra: sin stock en el sistema, o la misma prenda colgada en dos lugares. */
export type Sobra = { clave: string; nombre: string; color: string; motivo: 'sin-stock' | 'dos-lugares'; lugares: string[] }

export type CierreRelevamiento = {
  faltaExhibir: FaltaExhibir[]
  sobran: Sobra[]
  /**
   * Los módulos del mapa guardado que nadie caminó. 🔴 **Mientras haya alguno, «falta exhibir» es
   * PROVISORIO**: lo que falta puede estar colgado justo ahí. `null` = ⛔ hay mapa para saberlo.
   */
  sinRelevar: string[] | null
  /** Escaneos que ⛔ cruzaron con el inventario: ⛔ se sabe qué prenda son. */
  sinIdentificar: number
}

/**
 * **El cierre, sólo al finalizar todo**: lo que falta exhibir y lo que sobra.
 *
 * - **Falta** = producto×color con stock en el Local (`items`, sin Stunned) que ⛔ pasó por el
 *   lector en NINGÚN lugar del recorrido —barras, vidriera, mesas—. Por color y ⛔ por talle: se
 *   cuelga uno por color.
 * - **Sobra** = lo escaneado que el sistema tiene en cero, o la misma prenda en dos lugares.
 *
 * ⚠️ Es una afirmación sobre el local ENTERO: sólo es firme si `sinRelevar` está vacío.
 */
export function cierreDelRelevamiento(escaneos: EscaneoLibre[], items: ExhibItem[], mapa: Pick<MapaLocal, 'modulos'> | null): CierreRelevamiento {
  const vistas = new Map<string, { nombre: string; color: string; lugares: Set<string>; conStock: boolean }>()
  let sinIdentificar = 0
  for (const e of escaneos) {
    const clave = claveDe(e)
    if (!clave) {
      sinIdentificar++
      continue
    }
    if (!seChequea('zattia', { sku: e.sku || '' })) continue
    let v = vistas.get(clave)
    if (!v) vistas.set(clave, (v = { nombre: e.product_name || '', color: colorDeVariante(e.size), lugares: new Set(), conStock: false }))
    v.lugares.add(e.lugar.trim())
  }

  const faltan = new Map<string, FaltaExhibir>()
  for (const it of items) {
    if (!(it.qty > 0) || !seChequea('zattia', it)) continue
    const clave = `${it.productId}|${colorDeVariante(it.size)}`
    const v = vistas.get(clave)
    if (v) {
      v.conStock = true
      continue
    }
    const ya = faltan.get(clave)
    if (ya) ya.unidades += it.qty
    else faltan.set(clave, { clave, nombre: it.name, color: colorDeVariante(it.size), tipo: tipoDePrenda(it.name), unidades: it.qty })
  }

  const sobran: Sobra[] = []
  for (const [clave, v] of vistas) {
    const lugares = [...v.lugares].sort()
    if (!v.conStock) sobran.push({ clave, nombre: v.nombre, color: v.color, motivo: 'sin-stock', lugares })
    else if (lugares.length > 1) sobran.push({ clave, nombre: v.nombre, color: v.color, motivo: 'dos-lugares', lugares })
  }

  // Las barras a medio caminar (doble con una sola altura) también: de esa altura ⛔ se sabe nada.
  const r = armarRelevamiento(escaneos)
  // Un largo camina también el número siguiente: es el mismo perchero.
  const caminados = new Set(r.modulos.flatMap((m) => (m.largo ? [m.codigo, codigoDe(m.pared, m.numero + 1)] : [m.codigo])))
  const medias = r.modulos.flatMap((m) => m.barras.filter((b) => !b.relevada).map((b) => `${m.codigo} ${PALABRA_DE[b.pos]}`))
  const sinRelevar = mapa ? [...mapa.modulos.map((m) => m.codigo).filter((c) => !caminados.has(leerEspacio(c)?.codigo ?? c)), ...medias] : null

  const porNombre = <T extends { nombre: string; color: string }>(a: T, b: T) => a.nombre.localeCompare(b.nombre) || a.color.localeCompare(b.color)
  return {
    faltaExhibir: [...faltan.values()].sort((a, b) => a.tipo.localeCompare(b.tipo) || porNombre(a, b)),
    sobran: sobran.sort(porNombre),
    sinRelevar,
    sinIdentificar,
  }
}

/** Las alturas por defecto de una barra nueva, las del armado inicial. */
const ALTURA: Record<PosEspacio, number> = { alta: 180, baja: 105, simple: 165 }
const ANCHO_DEFAULT = 75

/** Qué cambia en el mapa al guardar el relevamiento, para mostrarlo antes de guardar. */
export type CambioDeMapa = { codigo: string; que: 'nuevo' | 'estructura' | 'barras'; texto: string }

/**
 * **El mapa que sale del relevamiento** (opción A de Bruno, 5-oct-2026): cada barra caminada queda
 * con **los modelos exactos que se escanearon** (`Nivel.modelos`).
 *
 * - La estructura de cada módulo caminado es la que declaró quien lo caminó (simple o doble).
 * - 🔑 **El cupo son las PERCHAS que había colgadas** (`BarraRelevada.perchas`): es el dato del salón.
 * - 🔑 **Un perchero largo** (`D07-08`) queda como UN módulo `D07` del doble de ancho, y el `D08` que
 *   hubiera en el mapa **desaparece**: es el mismo perchero.
 * - Los tipos y la línea se deducen de lo escaneado. Con `modelos` puestos ⛔ deciden qué entra
 *   (`aceptaEn`); quedan para dibujar y para las alertas de altura.
 * - Del mapa de antes se conservan el ancho, la altura de cada barra que ya existía, la tabla de
 *   tipos y las temporadas.
 * - 🔴 **Un módulo que nadie caminó ⛔ se inventa ni se borra**: queda como estaba.
 * - `base` puede ser `null` (nadie guardó un mapa): sale sólo lo relevado, con la tabla del armado
 *   inicial (`tiposIniciales`).
 */
export function mapaDesdeRelevamiento(r: Relevamiento, base: MapaLocal | null, tiposIniciales: MapaLocal['tipos']): { mapa: MapaLocal; cambios: CambioDeMapa[] } {
  const previos = new Map((base?.modulos ?? []).map((m) => [m.codigo, m]))
  const cambios: CambioDeMapa[] = []
  const relevados = new Map<string, Modulo>()
  /** Los módulos que quedaron DENTRO de un perchero largo caminado: dejan de existir en el mapa. */
  const absorbidos = new Set<string>()

  for (const mr of r.modulos) {
    const antes = previos.get(mr.codigo)
    const niveles: Nivel[] = mr.barras.map((b) => {
      const nivelAntes = antes?.niveles.find((n) => n.pos === b.pos)
      // La barra que nadie caminó queda como estaba; si no existía, vacía y sin cupo fijo.
      if (!b.relevada) return nivelAntes ?? { pos: b.pos, alturaCm: ALTURA[b.pos], linea: 'ambas', tipos: [], cupo: null }
      const n: Nivel = { pos: b.pos, alturaCm: nivelAntes?.alturaCm ?? ALTURA[b.pos], linea: b.linea, tipos: b.tipos, cupo: b.perchas }
      return b.modelos.length ? { ...n, modelos: b.modelos } : n
    })
    // El ancho lo dice quien lo caminó: largo = dos módulos; uno que era largo y se caminó sin serlo vuelve a uno.
    const anchoAntes = antes?.anchoCm ?? ANCHO_DEFAULT
    // 🔴 La isla ⛔ entra: mide lo que mide (185 cm) y ⛔ es un largo (lo cacé guardando el mapa real).
    const anchoCm = mr.pared === 'isla' ? anchoAntes : mr.largo ? Math.max(anchoAntes, ANCHO_DEFAULT * 2) : anchoAntes >= ANCHO_DEFAULT * 2 ? ANCHO_DEFAULT : anchoAntes
    relevados.set(mr.codigo, { codigo: mr.codigo, pared: mr.pared, orden: 0, anchoCm, niveles })
    if (mr.largo) {
      const siguiente = codigoDe(mr.pared, mr.numero + 1)
      absorbidos.add(siguiente)
      if (previos.has(siguiente)) cambios.push({ codigo: siguiente, que: 'estructura', texto: `${siguiente} pasa a ser parte de ${mr.codigo} (perchero doble largo)` })
    }

    const total = mr.barras.reduce((s, b) => s + b.perchas, 0)
    const etiqueta = mr.largo ? `${mr.estructura}, doble largo` : mr.estructura
    if (!antes) cambios.push({ codigo: mr.codigo, que: 'nuevo', texto: `${mr.codigo} es nuevo (${etiqueta}, ${total} perchas)` })
    else {
      const eraDoble = antes.niveles.some((n) => n.pos === 'alta' || n.pos === 'baja')
      const eraSimple = antes.niveles.every((n) => n.pos === 'simple')
      const ahoraDoble = mr.estructura === 'doble'
      if (ahoraDoble !== eraDoble || (!ahoraDoble && !eraSimple)) {
        cambios.push({ codigo: mr.codigo, que: 'estructura', texto: `${mr.codigo} pasa a ${mr.estructura}` })
      }
      if (anchoCm !== antes.anchoCm) cambios.push({ codigo: mr.codigo, que: 'estructura', texto: `${mr.codigo} pasa a ${mr.largo ? 'doble largo' : 'largo de un módulo'} (${anchoCm} cm)` })
      cambios.push({
        codigo: mr.codigo,
        que: 'barras',
        texto: `${mr.codigo}: ${mr.barras.map((b) => `${PALABRA_DE[b.pos] || 'simple'} ${b.relevada ? b.perchas : 'sin relevar'}`).join(' · ')}`,
      })
    }
  }

  // 🔴 **El orden es el del recorrido del cliente y lo puso Bruno** (en el mapa guardado la isla va
  // primero y I01/I02 caen entre D04 y D05): ⛔ se reordena por lado. Cada módulo que ya estaba
  // conserva su lugar; uno nuevo entra después del de su mismo lado con el número anterior más cercano
  // (o antes del siguiente, o al final). Después se renumera 1..N sin cambiar el orden relativo.
  const lugarDe0 = (cod: string) => base?.modulos.find((m) => m.codigo === cod)?.orden
  const clave = (m: Modulo): number => {
    const ya = lugarDe0(m.codigo)
    if (ya != null) return ya
    const esp = leerEspacio(m.codigo)
    const hermanos = (base?.modulos ?? []).map((x) => ({ x, e: leerEspacio(x.codigo) })).filter(({ x, e }) => x.pared === m.pared && e && esp)
    const antes = hermanos.filter(({ e }) => e!.numero < esp!.numero).sort((a, b) => b.e!.numero - a.e!.numero)[0]
    if (antes) return antes.x.orden + 0.5 + (esp!.numero - antes.e!.numero) / 1000
    const despues = hermanos.filter(({ e }) => e!.numero > esp!.numero).sort((a, b) => a.e!.numero - b.e!.numero)[0]
    if (despues) return despues.x.orden - 0.5 + esp!.numero / 1000
    return 10_000 + ORDEN_PARED[m.pared] * 100 + (esp?.numero ?? 0)
  }
  // 🔴 Un largo gana sobre el siguiente aunque el siguiente se haya caminado suelto en el mismo recorrido:
  // quien lo marcó largo dijo que es UN perchero.
  const modulos = [...(base?.modulos ?? []).filter((m) => !relevados.has(m.codigo)), ...relevados.values()]
    .filter((m) => !absorbidos.has(m.codigo))
    .map((m) => ({ m, k: clave(m) }))
    .sort((a, b) => a.k - b.k || a.m.codigo.localeCompare(b.m.codigo))
    .map(({ m }, i) => ({ ...m, orden: i + 1 }))

  const mapa: MapaLocal = { version: 1, modulos, tipos: base?.tipos ?? tiposIniciales }
  if (base?.temporadas) mapa.temporadas = base.temporadas
  return { mapa, cambios }
}
