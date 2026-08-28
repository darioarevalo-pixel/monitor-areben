/**
 * Insumos — lo derivado, puro. La cara tipada del núcleo compartido está abajo de todo.
 *
 * 🔑 **Todo sale de UNA sola pasada por el libro** (`serieDeStock`): cuánto hay en cada lugar, cuánto
 * hay en total y **desde cuándo** está así. Ésa última es la que obliga a que exista el libro: un
 * número de stock contesta «cuánto hay» y no «desde cuándo falta», y `updated_at` ⛔ no mide la
 * espera — con él, el aviso diría «apareció hoy» todas las mañanas y el «NUEVO» no se apagaría.
 *
 * ⛔ **Ningún cero se inventa acá.** Un insumo que nadie contó tiene stock `null`, no 0; un insumo
 * sin consumo medible tiene ritmo `null`, no 0; y un insumo sin compras con precio no tiene precio
 * de referencia. El cero afirma: diría «se contó y no hay ninguna».
 */

import { diasEntre, hoyIso, sumarDias } from '@/lib/fechas/dia'
import {
  CLAVES_MOVIMIENTO as CLAVES_MOVIMIENTO_JS,
  CLAVES_TIPO as CLAVES_TIPO_JS,
  CLAVES_UBICACION as CLAVES_UBICACION_JS,
  CLAVES_UNIDAD as CLAVES_UNIDAD_JS,
  esFechaIso as esFechaIsoJs,
  motivoConsumoInvalido as motivoConsumoInvalidoJs,
  motivoInsumoInvalido as motivoInsumoInvalidoJs,
  motivoMovimientoInvalido as motivoMovimientoInvalidoJs,
  patasDeTraslado as patasDeTrasladoJs,
  signoDe as signoDeJs,
  TIPOS as TIPOS_JS,
  TIPOS_MOVIMIENTO as TIPOS_MOVIMIENTO_JS,
  UBICACIONES as UBICACIONES_JS,
  UNIDADES as UNIDADES_JS,
} from './core.core.js'
import type {
  DiaCompras,
  FaltaComprar,
  FaltaSubir,
  Insumo,
  Movimiento,
  PrecioReferencia,
  Reposicion,
  Ritmo,
  TipoInsumo,
  TipoMovimiento,
  Ubicacion,
  Unidad,
} from './tipos'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// La cara tipada del núcleo compartido — acá sólo se le pone el tipo, una vez.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const TIPOS = TIPOS_JS as { key: TipoInsumo; label: string }[]
export const UNIDADES = UNIDADES_JS as { key: Unidad; label: string; plural: string }[]
export const UBICACIONES = UBICACIONES_JS as { key: Ubicacion; label: string }[]
export const TIPOS_MOVIMIENTO = TIPOS_MOVIMIENTO_JS as { key: TipoMovimiento; label: string }[]
export const CLAVES_TIPO = CLAVES_TIPO_JS as TipoInsumo[]
export const CLAVES_UNIDAD = CLAVES_UNIDAD_JS as Unidad[]
export const CLAVES_UBICACION = CLAVES_UBICACION_JS as Ubicacion[]
export const CLAVES_MOVIMIENTO = CLAVES_MOVIMIENTO_JS as TipoMovimiento[]
export const esFechaIso = esFechaIsoJs as (v: unknown) => boolean
export const signoDe = signoDeJs as (m: { tipo: TipoMovimiento; pata?: string | null }) => number
export const motivoInsumoInvalido = motivoInsumoInvalidoJs as (i: unknown) => string | null
export const motivoConsumoInvalido = motivoConsumoInvalidoJs as (c: unknown) => string | null
export const motivoMovimientoInvalido = motivoMovimientoInvalidoJs as (m: unknown) => string | null
export const patasDeTraslado = patasDeTrasladoJs as (x: {
  insumoId: string
  origen: Ubicacion
  destino: Ubicacion
  cantidad: number
  fecha: string
  usuario?: string | null
  nota?: string | null
  grupo?: string | null
}) => Partial<Movimiento>[]

export const rotuloUbicacion = (u: Ubicacion): string => UBICACIONES.find((x) => x.key === u)?.label ?? u
export const rotuloTipo = (t: TipoInsumo): string => TIPOS.find((x) => x.key === t)?.label ?? t

/** El plural de la unidad, para que la pantalla no escriba «3 unidad». */
export function rotuloUnidad(u: Unidad, n: number): string {
  const def = UNIDADES.find((x) => x.key === u)
  if (!def) return u
  return n === 1 ? def.label : def.plural
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// El libro
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** El stock después de cada movimiento. `porUbicacion` sólo trae los lugares que alguien tocó. */
export type PasoStock = { fecha: string; total: number; porUbicacion: Partial<Record<Ubicacion, number>> }

/**
 * El libro ordenado y sumado.
 *
 * 🔴 **`recuento` corta**: no suma ni resta, **fija** el stock de esa ubicación ese día y lo que
 * había antes deja de contar. Es el snap/dif de los conteos de depósito: lo contado gana sobre lo
 * calculado, porque lo contado se miró.
 *
 * ⚠️ El orden es por `fecha` y, dentro del día, por `creado`: dos movimientos del mismo día tienen
 * que aplicarse en el orden en que se cargaron o un recuento del martes podría quedar detrás de una
 * compra del martes que ya estaba contada.
 */
export function serieDeStock(movs: Movimiento[]): PasoStock[] {
  const orden = [...movs].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creado.localeCompare(b.creado) || a.id.localeCompare(b.id))
  const estado = new Map<Ubicacion, number>()
  const pasos: PasoStock[] = []
  for (const m of orden) {
    if (m.tipo === 'recuento') estado.set(m.ubicacion, m.cantidad)
    else estado.set(m.ubicacion, (estado.get(m.ubicacion) ?? 0) + signoDe(m) * m.cantidad)
    const porUbicacion: Partial<Record<Ubicacion, number>> = {}
    let total = 0
    for (const [u, n] of estado) {
      porUbicacion[u] = n
      total += n
    }
    pasos.push({ fecha: m.fecha, total, porUbicacion })
  }
  return pasos
}

/**
 * Cuánto hay en un lugar. 🔴 **`null` = nadie lo contó nunca ahí**, y ⛔ no es 0: un 0 afirmaría que
 * se miró y no había ninguna, que es exactamente lo contrario de lo que pasa cuando un insumo
 * recién se carga.
 */
export function stockPor(movs: Movimiento[], ubicacion: Ubicacion): number | null {
  const pasos = serieDeStock(movs)
  const ultimo = pasos[pasos.length - 1]
  if (!ultimo) return null
  const v = ultimo.porUbicacion[ubicacion]
  return v == null ? null : v
}

/** Lo que hay en toda la empresa. `null` mientras nadie haya tocado ninguna ubicación. */
export function stockTotal(movs: Movimiento[]): number | null {
  const pasos = serieDeStock(movs)
  const ultimo = pasos[pasos.length - 1]
  return ultimo ? ultimo.total : null
}

/**
 * Desde cuándo el valor está en el umbral o abajo, **sin haber vuelto a subir**.
 *
 * 🔑 Es el `ts` del aviso, y es la razón de ser del libro: se camina hacia atrás hasta el primer
 * movimiento a partir del cual ya no volvió a estar por encima. Con `updated_at` el aviso diría
 * «apareció hoy» cada vez que alguien toca cualquier cosa del insumo.
 */
export function desdeCuandoCruzo(
  pasos: PasoStock[],
  valorDe: (p: PasoStock) => number | null,
  umbral: number,
): string | null {
  let desde: string | null = null
  for (let i = pasos.length - 1; i >= 0; i--) {
    const v = valorDe(pasos[i])
    if (v == null || v > umbral) break
    desde = pasos[i].fecha
  }
  return desde
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// La plata
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Ventana del promedio. En pesos, un promedio de un año es un número que ya no se paga. */
export const DIAS_PRECIO = 180

/**
 * El precio de referencia por unidad.
 *
 * 🔴 **Ponderado por cantidad, ⛔ no promedio de precios unitarios**: una compra de 3 cajas y otra
 * de 30 no valen lo mismo, y promediar los unitarios le da el mismo peso a las dos.
 *
 * 🔑 **Con UNA sola compra no se rotula «promedio»**: `clase: 'ultima'`. Un derivado de una sola
 * observación con cara de promedio es lo que en este repo ya dejó una regla prendida y muda.
 *
 * ⚠️ Si en la ventana no hay ninguna, cae a la última compra con precio que exista **y la fecha
 * viaja**: un precio de hace un año sirve para no tener nada, pero sólo si se ve que es de hace un
 * año. `null` cuando nunca se cargó un precio.
 */
export function precioReferencia(movs: Movimiento[], hoy = hoyIso()): PrecioReferencia | null {
  const conPrecio = movs
    .filter((m) => m.tipo === 'compra' && (m.precioTotal ?? 0) > 0 && m.cantidad > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
  if (!conPrecio.length) return null

  const corte = sumarDias(hoy, -DIAS_PRECIO)
  const enVentana = conPrecio.filter((m) => m.fecha >= corte)
  const usadas = enVentana.length ? enVentana : [conPrecio[conPrecio.length - 1]]

  const plata = usadas.reduce((a, m) => a + (m.precioTotal as number), 0)
  const unidades = usadas.reduce((a, m) => a + m.cantidad, 0)
  return {
    unitario: plata / unidades,
    clase: usadas.length > 1 ? 'promedio' : 'ultima',
    compras: usadas.length,
    desde: usadas[0].fecha,
    hasta: usadas[usadas.length - 1].fecha,
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// El ritmo
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** La ventana del ritmo atado a las ventas. */
export const DIAS_RITMO_VENTAS = 30
/** La ventana del ritmo medido a mano: más larga, porque se anota mucho menos seguido. */
export const DIAS_RITMO_LIBRO = 90

/**
 * Cuánto se gasta por día.
 *
 * Dos fuentes, y la elige el insumo:
 *
 * - **`por-venta`** — bolsas, etiquetas de despacho: se cuentan las **compras** (pedidos) del canal
 *   en la ventana y se multiplican por lo que gasta cada una. 🔴 **Sobre días CERRADOS: hoy no
 *   entra.** El día en curso está a medias y meterlo adentro baja el ritmo justo el día que
 *   importa. La marca sale de `insumo.marcas` y no de la regla: vacío = las dos.
 * - **`manual`** — yerba, papel: sale del libro, de lo que alguien anotó como consumido.
 *   🔑 **Con una sola anotación ⛔ no hay ritmo**: un consumo de ayer dividido por un día daría un
 *   número enorme con cara de medición. Hacen falta dos.
 *
 * `null` cuando no se puede medir, y la pantalla lo dice. ⛔ Nunca 0: un 0 haría que los días de
 * vida fueran infinitos y el aviso no saliera jamás.
 */
export function ritmoDiario(
  insumo: Insumo,
  movs: Movimiento[],
  comprasPorMarca: Record<string, DiaCompras[]>,
  hoy = hoyIso(),
): Ritmo | null {
  const regla = insumo.consumo
  if (regla && regla.modo === 'por-venta') {
    const marcas = insumo.marcas.length ? insumo.marcas : ['bdi', 'zattia']
    const desde = sumarDias(hoy, -DIAS_RITMO_VENTAS)
    const hasta = sumarDias(hoy, -1) // ⛔ hoy no: está a medias
    const dias = new Set<string>()
    let compras = 0
    for (const marca of marcas) {
      for (const d of comprasPorMarca[marca] ?? []) {
        if (d.fecha < desde || d.fecha > hasta) continue
        dias.add(d.fecha)
        compras += regla.canal ? d[regla.canal] : d.local + d.online + d.mayorista
      }
    }
    if (!dias.size) return null
    return { porDia: (compras * regla.porVenta) / dias.size, fuente: 'ventas', dias: dias.size, observaciones: compras }
  }

  const corte = sumarDias(hoy, -DIAS_RITMO_LIBRO)
  const consumos = movs.filter((m) => m.tipo === 'consumo' && m.fecha >= corte).sort((a, b) => a.fecha.localeCompare(b.fecha))
  if (consumos.length < 2) return null
  const dias = Math.max(diasEntre(consumos[0].fecha, hoy), 1)
  const gastado = consumos.reduce((a, m) => a + m.cantidad, 0)
  return { porDia: gastado / dias, fuente: 'libro', dias, observaciones: consumos.length }
}

/** Cuántos días dura lo que hay. `null` si falta cualquiera de las dos mitades. */
export function diasDeVida(stock: number | null, ritmo: Ritmo | null): number | null {
  if (stock == null || !ritmo || ritmo.porDia <= 0) return null
  return stock / ritmo.porDia
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// La regla: qué hay que hacer con este insumo
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * **LA** regla, y la llaman los dos lados: la pantalla y el derivador de avisos.
 *
 * 🔑 `ritmo` es parámetro **obligatorio** aunque pueda ser `null`. Con un default, el día que la
 * regla mire otra cosa el compilador no señalaría a nadie y media regla se quedaría en el JSX de una
 * pantalla — que en este repo ya pasó.
 *
 * Contesta **dos cosas distintas, porque son dos acciones distintas**:
 *
 * - **comprar** — el total de la empresa está en el mínimo (la regla del manual: *«los insumos se
 *   piden con el anteúltimo»*) o lo que queda no llega a cubrir lo que tarda en reponerse.
 * - **subir** — un lugar en CERO teniendo en otro. Eso ⛔ no se compra: se traslada, y es la mitad
 *   que hoy se resuelve por WhatsApp (*«no hay más bolsas en local»* / *«si me pueden subir del
 *   depo»*). El cero es el umbral a propósito: no hace falta inventar un mínimo por lugar.
 *
 * 🔴 **Con stock `null` no dispara nada.** Nadie contó: no se puede afirmar que falta.
 */
export function paraReponer(insumo: Insumo, movs: Movimiento[], ritmo: Ritmo | null): Reposicion {
  const pasos = serieDeStock(movs)
  const ultimo = pasos[pasos.length - 1]
  if (!ultimo) return { comprar: null, subir: [] }

  const total = ultimo.total
  const dias = diasDeVida(total, ritmo)
  const porUnidades = total <= insumo.minimo
  const porDias = insumo.diasReposicion != null && dias != null && dias <= insumo.diasReposicion

  let comprar: FaltaComprar | null = null
  if (porUnidades || porDias) {
    // Las unidades mandan sobre los días: es la regla escrita del puesto, y es la que se puede
    // mirar en el estante sin hacer ninguna cuenta.
    const motivo: FaltaComprar['motivo'] = porUnidades ? 'unidades' : 'dias'
    const umbral = porUnidades
      ? insumo.minimo
      : (insumo.diasReposicion as number) * (ritmo as Ritmo).porDia
    comprar = {
      motivo,
      total,
      dias,
      desde: desdeCuandoCruzo(pasos, (p) => p.total, umbral) ?? ultimo.fecha,
    }
  }

  const subir: FaltaSubir[] = []
  if (total > 0) {
    for (const u of CLAVES_UBICACION) {
      const hay = ultimo.porUbicacion[u]
      if (hay !== 0) continue // `undefined` es «nunca se tuvo acá», ⛔ no «se acabó»
      subir.push({
        ubicacion: u,
        hay: total,
        desde: desdeCuandoCruzo(pasos, (p) => p.porUbicacion[u] ?? null, 0) ?? ultimo.fecha,
      })
    }
  }

  return { comprar, subir }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// La mirada completa — LO QUE MIRAN LOS DOS LADOS
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Todo lo que se sabe de un insumo hoy. */
export type VistaInsumo = {
  insumo: Insumo
  movimientos: Movimiento[]
  porUbicacion: Partial<Record<Ubicacion, number>>
  /** `null` = nadie lo contó nunca. */
  total: number | null
  ritmo: Ritmo | null
  /** Cuántos días dura lo que hay. */
  dias: number | null
  precio: PrecioReferencia | null
  reposicion: Reposicion
}

/**
 * 🔑 **El único lugar que arma la vista de un insumo**, y lo llaman la pantalla y el derivador de
 * avisos. Si cada uno armara la suya, el badge diría una cosa y la tabla otra — y el que las
 * compara es el que ya no le cree a la app.
 */
export function mirarInsumo(
  insumo: Insumo,
  movimientos: Movimiento[],
  comprasPorMarca: Record<string, DiaCompras[]>,
  hoy = hoyIso(),
): VistaInsumo {
  const pasos = serieDeStock(movimientos)
  const ultimo = pasos[pasos.length - 1]
  const ritmo = ritmoDiario(insumo, movimientos, comprasPorMarca, hoy)
  const total = ultimo ? ultimo.total : null
  return {
    insumo,
    movimientos,
    porUbicacion: ultimo ? ultimo.porUbicacion : {},
    total,
    ritmo,
    dias: diasDeVida(total, ritmo),
    precio: precioReferencia(movimientos, hoy),
    reposicion: paraReponer(insumo, movimientos, ritmo),
  }
}

/** Lo mismo para toda la lista, agrupando el libro una sola vez. */
export function mirarTodos(
  insumos: Insumo[],
  movimientos: Movimiento[],
  comprasPorMarca: Record<string, DiaCompras[]>,
  hoy = hoyIso(),
): VistaInsumo[] {
  const porInsumo = new Map<string, Movimiento[]>()
  for (const m of movimientos) {
    const lista = porInsumo.get(m.insumoId)
    if (lista) lista.push(m)
    else porInsumo.set(m.insumoId, [m])
  }
  return insumos.map((i) => mirarInsumo(i, porInsumo.get(i.id) ?? [], comprasPorMarca, hoy))
}

/** Lo que hay que comprar, primero lo que hace más que está así. */
export function paraComprar(vistas: VistaInsumo[]): VistaInsumo[] {
  return vistas
    .filter((v) => v.insumo.activo && v.reposicion.comprar)
    .sort((a, b) => (a.reposicion.comprar as FaltaComprar).desde.localeCompare((b.reposicion.comprar as FaltaComprar).desde))
}

/** Lo que hay que subir, agrupado por el lugar donde falta: es UN viaje, no N. */
export function paraSubir(vistas: VistaInsumo[]): { ubicacion: Ubicacion; vistas: VistaInsumo[]; desde: string }[] {
  const porLugar = new Map<Ubicacion, { ubicacion: Ubicacion; vistas: VistaInsumo[]; desde: string }>()
  for (const v of vistas) {
    if (!v.insumo.activo) continue
    for (const f of v.reposicion.subir) {
      const g = porLugar.get(f.ubicacion)
      if (g) {
        g.vistas.push(v)
        if (f.desde < g.desde) g.desde = f.desde
      } else {
        porLugar.set(f.ubicacion, { ubicacion: f.ubicacion, vistas: [v], desde: f.desde })
      }
    }
  }
  return [...porLugar.values()].sort((a, b) => a.desde.localeCompare(b.desde))
}
