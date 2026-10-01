/**
 * F4 del Mapa del local: **el control con el lector.** Lo que el mapa pone en un módulo contra lo
 * que pasó por el lector parado en ese módulo, en el recorrido libre del Chequeo de exhibición.
 *
 * 🔑 **El lugar del recorrido sigue siendo TEXTO LIBRE** (ver `exhib.md` y el `datalist` de
 * `ExhibLibre`): el salón se reacomoda y una lista cerrada obliga a elegir un mueble que miente. El
 * mapa sólo agrega sugerencias (`D01`…), y el control aparece cuando lo escrito ES un módulo.
 *
 * **Sobre un módulo que nadie caminó ⛔ no se afirma nada**: el control es del lugar donde se está
 * escaneando, y «falta» quiere decir «⛔ no pasó por el lector ACÁ» — puede estar en otro mueble, y si
 * se lo vio en otro lugar del recorrido, se dice dónde.
 */

import type { EscaneoLibre } from '@/lib/exhib/libre'
import { colorDeVariante, idNivel, type Ubicacion } from './core'
import type { MapaLocal, Modulo, Prenda } from './tipos'

/** `D1`, `d01` y `D01` son el mismo módulo: se escribe con el lector en la otra mano. */
function normCodigo(s: string): string {
  const t = s.trim().toUpperCase().replace(/\s+/g, '')
  const m = /^([A-Z]+)0*(\d+)$/.exec(t)
  return m ? `${m[1]}${Number(m[2])}` : t
}

/** El módulo del mapa que nombra `lugar`, o `null` si el lugar es otra cosa («vidriera»). */
export function moduloDelLugar(mapa: Pick<MapaLocal, 'modulos'>, lugar: string): Modulo | null {
  const k = normCodigo(lugar)
  if (!k) return null
  return mapa.modulos.find((m) => normCodigo(m.codigo) === k) || null
}

/**
 * La prenda (producto×color) de un escaneo, con la misma clave que `prendasDelLocal`. `null` = el
 * código ⛔ no cruzó con el inventario, así que ⛔ no se sabe qué prenda es.
 */
export function claveDeEscaneo(e: Pick<EscaneoLibre, 'encontrado' | 'product_id' | 'size'>): string | null {
  if (!e.encontrado || !e.product_id) return null
  return `${e.product_id}|${colorDeVariante(e.size)}`
}

/** Adónde la manda el mapa: un módulo, el depósito (no entra), o ninguna barra la acepta. */
export type Destino = { tipo: 'modulo'; codigo: string } | { tipo: 'deposito' } | { tipo: 'sin-barra' } | { tipo: 'no-cuelga' } | { tipo: 'sin-stock' }

export type Falta = { prenda: Prenda; /** Otros lugares del recorrido donde sí pasó por el lector. */ vistaEn: string[] }
export type Sobra = { clave: string; nombre: string; color: string; destino: Destino }

export type ControlModulo = {
  codigo: string
  /** Las prendas que el mapa pone en este módulo, con el stock de hoy. */
  esperadas: number
  /** Esperadas que pasaron por el lector acá. */
  bien: number
  faltan: Falta[]
  sobran: Sobra[]
  /** Escaneos acá que ⛔ no cruzaron con el inventario: ⛔ no se pueden juzgar. */
  sinJuzgar: number
}

function destinoDe(u: Ubicacion, codigoDe: Map<string, string>, clave: string): Destino {
  const cod = codigoDe.get(clave)
  if (cod) return { tipo: 'modulo', codigo: cod }
  if (u.noEntran.some((p) => p.clave === clave)) return { tipo: 'deposito' }
  if (u.sinLugar.some((p) => p.clave === clave)) return { tipo: 'sin-barra' }
  if (u.noCuelgan.some((p) => p.clave === clave)) return { tipo: 'no-cuelga' }
  // ⚠️ `prendasDelLocal` sólo arma las que tienen stock: una colgada que el sistema tiene en cero
  // (o una de Stunned) ⛔ no está en el mapa.
  return { tipo: 'sin-stock' }
}

/**
 * El control de un módulo: lo que el mapa pone acá contra lo que pasó por el lector en `lugar`.
 *
 * Cuenta como «acá» todo escaneo cuyo lugar nombra este módulo, escrito como sea (`D1`, `d01`).
 *
 * `u` es la ubicación del mapa **guardado** con el stock de hoy (`ubicar(prendas, guardado, modo)`),
 * la misma que imprime la hoja del módulo. ⚠️ Con stock que entra y se vende, lo esperado se corre de
 * un día al otro sin que nadie toque el mapa (ver `mapa-local.md`).
 */
export function controlDeModulo(mapa: MapaLocal, u: Ubicacion, modulo: Modulo, escaneos: EscaneoLibre[]): ControlModulo {
  const codigoDe = new Map<string, string>()
  for (const m of mapa.modulos) for (const n of m.niveles) for (const p of u.porBarra[idNivel(m, n)] || []) codigoDe.set(p.clave, m.codigo)

  const esperadas = modulo.niveles.flatMap((n) => u.porBarra[idNivel(modulo, n)] || [])
  // «Acá» es el MÓDULO, ⛔ el texto: `D1` y `d01` en el mismo recorrido son el mismo mueble.
  const aca = normCodigo(modulo.codigo)
  const vistasAca = new Set<string>()
  const otrosLugares = new Map<string, Set<string>>()
  const sobran = new Map<string, Sobra>()
  let sinJuzgar = 0
  const esperadasClaves = new Set(esperadas.map((p) => p.clave))

  for (const e of escaneos) {
    const clave = claveDeEscaneo(e)
    if (normCodigo(e.lugar) !== aca) {
      if (clave) {
        if (!otrosLugares.has(clave)) otrosLugares.set(clave, new Set())
        otrosLugares.get(clave)!.add(e.lugar.trim())
      }
      continue
    }
    if (!clave) {
      sinJuzgar++
      continue
    }
    vistasAca.add(clave)
    if (!esperadasClaves.has(clave) && !sobran.has(clave)) {
      sobran.set(clave, { clave, nombre: e.product_name || '', color: colorDeVariante(e.size), destino: destinoDe(u, codigoDe, clave) })
    }
  }

  const faltan = esperadas
    .filter((p) => !vistasAca.has(p.clave))
    .map((prenda) => ({ prenda, vistaEn: [...(otrosLugares.get(prenda.clave) || [])].sort() }))

  return {
    codigo: modulo.codigo,
    esperadas: esperadas.length,
    bien: esperadas.length - faltan.length,
    faltan,
    sobran: [...sobran.values()].sort((a, b) => a.nombre.localeCompare(b.nombre) || a.color.localeCompare(b.color)),
    sinJuzgar,
  }
}

export type ControlRecorrido = {
  /** Los módulos que pasaron por el lector, en el orden del mapa. */
  modulos: ControlModulo[]
  /** Los que nadie caminó: de esos ⛔ se afirma nada (ni que estén bien ni que falte algo). */
  noCaminados: string[]
  esperadas: number
  bien: number
  faltan: number
  /**
   * Prendas distintas que sobran en algún módulo caminado. 🔑 Se cuentan una vez: la misma prenda
   * escaneada en dos módulos ajenos es UNA percha para mover, ⛔ dos.
   */
  sobran: number
}

/**
 * F4 al cerrar el recorrido: **el control de todos los módulos caminados, juntos.** Un módulo está
 * caminado si al menos un escaneo nombra su código (aunque ⛔ haya cruzado con el inventario).
 *
 * ⚠️ Los totales son **sólo de lo caminado**: sumar lo esperado de los módulos que nadie pasó por el
 * lector los haría «faltar» enteros, y eso ⛔ es un dato, es un recorrido que ⛔ llegó hasta ahí.
 */
export function controlDelRecorrido(mapa: MapaLocal, u: Ubicacion, escaneos: EscaneoLibre[]): ControlRecorrido {
  const caminados = new Set(escaneos.map((e) => moduloDelLugar(mapa, e.lugar)?.codigo).filter((c): c is string => !!c))
  const modulos: ControlModulo[] = []
  const noCaminados: string[] = []
  for (const m of [...mapa.modulos].sort((a, b) => a.orden - b.orden)) {
    if (caminados.has(m.codigo)) modulos.push(controlDeModulo(mapa, u, m, escaneos))
    else noCaminados.push(m.codigo)
  }
  return {
    modulos,
    noCaminados,
    esperadas: modulos.reduce((n, c) => n + c.esperadas, 0),
    bien: modulos.reduce((n, c) => n + c.bien, 0),
    faltan: modulos.reduce((n, c) => n + c.faltan.length, 0),
    sobran: new Set(modulos.flatMap((c) => c.sobran.map((s) => s.clave))).size,
  }
}

/** El destino dicho para quien está parado en el módulo. */
export function textoDestino(d: Destino): string {
  switch (d.tipo) {
    case 'modulo':
      return `va en ${d.codigo}`
    case 'deposito':
      return 'no entra: va al depósito'
    case 'sin-barra':
      return 'ninguna barra acepta su tipo'
    case 'no-cuelga':
      return 'no se cuelga'
    case 'sin-stock':
      return 'el sistema no le da stock: no está en el mapa'
  }
}
