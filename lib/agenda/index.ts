/**
 * Agenda operativa — la cara tipada del motor, más lo que decide qué se ve hoy.
 *
 * ⚠️ El motor de recurrencia no vive acá: vive en `lib/agenda/reglas.core.js`, en JS plano, porque
 * `api/_agenda.js` lo necesita para validar antes de guardar y no puede importar TypeScript. El
 * porqué está en el docblock del core.
 *
 * Lo que este archivo aporta es `promosDe()` —qué promo corre un día dado— y `rotuloRegla()`, que
 * pone la regla en castellano. Los rótulos se quedan del lado TS a propósito: el handler valida
 * reglas, no las lee en voz alta.
 */

import { diasDelMes, FECHAS_COMERCIALES, hoyIso, iso, resolverComercial, sumarDias } from '@/lib/calendario'
import type { Marca } from '@/lib/nav.datos'
import { DIAS_CUMPLIMIENTO, type Canal, type FechaIso, type Hecho, type ItemAgenda, type Promo, type Puerta, type Regla } from './tipos'
import {
  CLAVES_PUERTA as CLAVES_PUERTA_JS,
  moldeCorreEn as moldeCorreEnJs,
  moldeCorreEnMarca as moldeCorreEnMarcaJs,
  PUERTAS as PUERTAS_JS,
  rotuloPuerta as rotuloPuertaJs,
} from './puertas.core.js'
import {
  aplicaEn as aplicaEnJs,
  CLAVES_TIPO_REGLA as CLAVES_TIPO_REGLA_JS,
  esFechaIso as esFechaIsoJs,
  MAX_DIA_MES as MAX_DIA_MES_JS,
  MAX_VENTANA_DIAS as MAX_VENTANA_DIAS_JS,
  motivoReglaInvalida as motivoReglaInvalidaJs,
  ocurrencias as ocurrenciasJs,
  reglaValida as reglaValidaJs,
  TIPOS_REGLA as TIPOS_REGLA_JS,
} from './reglas.core.js'

export const TIPOS_REGLA = TIPOS_REGLA_JS as { key: Regla['tipo']; label: string }[]
export const CLAVES_TIPO_REGLA = CLAVES_TIPO_REGLA_JS as string[]
export const MAX_DIA_MES = MAX_DIA_MES_JS as number
export const MAX_VENTANA_DIAS = MAX_VENTANA_DIAS_JS as number
export const esFechaIso = esFechaIsoJs as (v: unknown) => boolean
export const motivoReglaInvalida = motivoReglaInvalidaJs as (regla: unknown) => string | null
export const reglaValida = reglaValidaJs as (regla: unknown) => boolean
export const aplicaEn = aplicaEnJs as (regla: Regla, fecha: FechaIso) => boolean
export const ocurrencias = ocurrenciasJs as (regla: Regla, desde: FechaIso, hasta: FechaIso) => FechaIso[]

export * from './tipos'
export { hoyIso }

// Las cuatro puertas de entrada del ingreso. El motor está en JS por el mismo motivo que el de las
// reglas: `api/_agenda.js` filtra los moldes antes de insertarlos y no puede importar TypeScript.
export const PUERTAS = PUERTAS_JS as { key: Puerta; label: string; ayuda: string }[]
export const CLAVES_PUERTA = CLAVES_PUERTA_JS as Puerta[]
export const rotuloPuerta = rotuloPuertaJs as (key: string) => string
export const moldeCorreEn = moldeCorreEnJs as (puertasDelMolde: Puerta[] | undefined, puerta: Puerta) => boolean
// La marca del ingreso, que se lee igual: lista vacía = las dos. ⛔ No es `esDeMisMarcas`: acá el
// ingreso tiene una sola marca, allá la persona puede tener las dos.
export const moldeCorreEnMarca = moldeCorreEnMarcaJs as (marcasDelMolde: Marca[] | undefined, marca: Marca) => boolean

/** 0 = domingo, como `getDay()`. Ver la advertencia de `aplicaEn` antes de tocar el orden. */
const DIAS_LARGOS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados']

/** «lunes, miércoles y viernes» — la coma para todos menos el último, que va con "y". */
function enumerar(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? ''
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

/**
 * La regla en castellano, para la lista de lo cargado.
 *
 * Es lo único que hace legible una pantalla de administración: un `{"tipo":"semanal","dias":[2,5]}`
 * en una tabla no se puede revisar, y revisar es exactamente para lo que sirve esa lista.
 */
export function rotuloRegla(regla: Regla): string {
  switch (regla.tipo) {
    case 'diaria':
      return 'todos los días'
    case 'unica':
      return `el ${regla.fecha}`
    case 'rango':
      return `del ${regla.desde} al ${regla.hasta}`
    case 'semanal': {
      const dias = [...regla.dias].sort((a, b) => a - b).map((d) => DIAS_LARGOS[d])
      return `los ${enumerar(dias)}`
    }
    case 'mensual':
      return regla.dia === 'ultimo' ? 'el último día de cada mes' : `el ${regla.dia} de cada mes`
    default:
      return ''
  }
}

/** «30%», «3 cuotas sin interés» — el titular de la promo, lo que se lee de lejos. */
export function rotuloBeneficio(b: Promo['beneficio']): string {
  if (b.tipo === 'descuento') return `${b.pct}% de descuento`
  if (b.tipo === 'reintegro') return `${b.pct}% de reintegro`
  return `${b.n} cuotas ${b.sinInteres ? 'sin interés' : 'con interés'}`
}

/**
 * ¿Esta promo corre este día?
 *
 * Cruza **los dos ejes de vigencia**: la ventana (`desde`/`hasta`) y la regla. Que estén separados
 * es lo que permite contestar "ya venció" sin mirar la regla, y "hoy no toca" sin mirar la ventana.
 *
 * `hasta` en `null` es una promo sin fin anunciado, no una vencida: los bancos publican varias así.
 */
export function corre(promo: Promo, fecha: FechaIso): boolean {
  if (!promo.activa) return false
  if (fecha < promo.desde) return false
  if (promo.hasta && fecha > promo.hasta) return false
  return aplicaEn(promo.regla, fecha)
}

/**
 * Las promos de un día, filtradas por canal y por marca, ordenadas por banco.
 *
 * `marcas` vacío en la promo quiere decir **las dos**: la promo la define el banco y lo normal es
 * que valga para todo lo que se cobre ahí. Tratar el vacío como "ninguna" escondería la mayoría.
 */
export function promosDe(
  promos: Promo[],
  fecha: FechaIso,
  opts: { canal?: Canal; marca?: Marca } = {},
): Promo[] {
  const { canal, marca } = opts
  return promos
    .filter((p) => corre(p, fecha))
    .filter((p) => !canal || p.canales.includes(canal))
    .filter((p) => !marca || p.marcas.length === 0 || p.marcas.includes(marca))
    .sort((a, b) => a.banco.localeCompare(b.banco, 'es') || a.medio.localeCompare(b.medio))
}

/**
 * ¿Este pendiente va este día?
 *
 * Más corto que `corre()` de la promo porque **una rutina no tiene ventana de vigencia**: no vence,
 * se apaga. Lo que corre entre dos fechas se dice con `{tipo:'rango'}`, que es la regla.
 */
/**
 * ¿Es un molde y no una rutina? Un molde existe para que el disparador del ingreso lo clone: no
 * corre ningún día, no enciende el badge y no entra en Cumplimiento. Se lo ve y se lo edita en
 * «Cargar», que es su único lugar.
 */
export function esPlantilla(item: ItemAgenda): boolean {
  return !!item.plantilla
}

export function vaEl(item: ItemAgenda, fecha: FechaIso): boolean {
  return item.activo && !esPlantilla(item) && aplicaEn(item.regla, fecha)
}

/** El tilde de este ítem en este día, o `null` si nadie lo marcó. La ausencia ES "no está hecho". */
export function hechoDe(hechos: Hecho[], itemId: string, fecha: FechaIso): Hecho | null {
  return hechos.find((h) => h.itemId === itemId && h.fecha === fecha) ?? null
}

/**
 * Hasta dónde mira hacia atrás el arrastre.
 *
 * 🔴 **No es una preferencia: es el techo del dato.** El GET manda los tildes de los últimos
 * `DIAS_CUMPLIMIENTO` días (`api/_agenda.js`), así que más atrás el navegador **no puede saber si
 * la ocurrencia se tildó**. Mirar más lejos que eso sería inventar un pendiente sobre una ausencia
 * de datos, que es la peor clase de rojo: el que no se puede apagar.
 */
const VENTANA_ARRASTRE = DIAS_CUMPLIMIENTO

/** El día del último tilde de este ítem, mirando hasta `hasta` inclusive. `null` si nunca se tildó. */
function ultimoTilde(hechos: Hecho[], itemId: string, hasta: FechaIso): FechaIso | null {
  let ultimo: FechaIso | null = null
  for (const h of hechos) {
    if (h.itemId !== itemId || h.fecha > hasta) continue
    if (!ultimo || h.fecha > ultimo) ultimo = h.fecha
  }
  return ultimo
}

/**
 * El día en que el ítem cayó por última vez, mirando desde `hasta` hacia atrás.
 *
 * 🔑 **Es adónde va el tilde de un pendiente que arrastra**, y por eso no puede ser "hoy" a secas:
 * `api/_agenda.js` rechaza un tilde en un día en que la regla no corre, y con razón. La reunión de
 * los martes que se hace el jueves se asienta en **el martes**, que es la ocurrencia que cierra.
 */
export function ultimaOcurrencia(item: ItemAgenda, hasta: FechaIso): FechaIso | null {
  const piso = item.creado ? item.creado.slice(0, 10) : null
  for (let i = 0; i <= VENTANA_ARRASTRE; i++) {
    const f = sumarDias(hasta, -i)
    if (piso && f < piso) return null
    if (aplicaEn(item.regla, f)) return f
  }
  return null
}

/**
 * La ocurrencia más vieja que quedó sin hacer y **sigue debiéndose** hoy, o `null`.
 *
 * Sólo para los ítems con `arrastra`. Tres cosas que no se deducen del nombre:
 *
 * 1. 🔑 **El arrastre se corta con el último tilde.** Todo lo anterior a ese día está cerrado, aunque
 *    tuviera ocurrencias sin tildar: son la misma reunión, no cuatro. Es lo que hace que **tildar
 *    una vez cierre las cuatro semanas** — si cada ocurrencia se cerrara sola, cuatro semanas sin
 *    hacerla pedirían cuatro tildes y el renglón reaparecería tres veces.
 * 2. **Nada anterior al día en que se cargó el ítem**: una rutina cargada hoy no viene debiendo de
 *    antes. Mismo criterio que `cumplimiento()`.
 * 3. **Un ítem apagado no arrastra.** Apagarlo dice "ya no va", y lo que ya no va no se debe.
 */
export function ocurrenciaAbierta(item: ItemAgenda, hechos: Hecho[], hasta: FechaIso): FechaIso | null {
  if (!item.arrastra || !item.activo || esPlantilla(item)) return null
  const corte = ultimoTilde(hechos, item.id, hasta)
  const piso = item.creado ? item.creado.slice(0, 10) : null
  let abierta: FechaIso | null = null
  for (let i = 0; i <= VENTANA_ARRASTRE; i++) {
    const f = sumarDias(hasta, -i)
    if (corte && f <= corte) break
    if (piso && f < piso) break
    if (aplicaEn(item.regla, f)) abierta = f
  }
  return abierta
}

/**
 * Un pendiente del día con su tilde al lado. `hecho` en `null` es lo que falta hacer.
 *
 * `fecha` es **la ocurrencia que este renglón cierra**, y es adónde viaja el tilde: para casi todo
 * es el día que se está mirando, y para uno que arrastra es la última vez que cayó. `desde` es de
 * cuándo viene, y va en `null` cuando no viene arrastrando de ningún lado.
 */
export type PendienteHoy = {
  item: ItemAgenda
  hecho: Hecho | null
  fecha: FechaIso
  desde: FechaIso | null
}

/**
 * Los pendientes de una persona en un día, con su acuse.
 *
 * 🔑 **Es LA función: la usan la pestaña Hoy, el bloque de Inicio y el número del menú.** Si el badge
 * contara con un criterio propio, mostraría un 1 que no se corresponde con ninguna fila de ninguna
 * pantalla, y el número que no se puede apagar se vuelve invisible en una semana.
 *
 * Sólo lo que es `paraMi`: el destino ya se filtró en el servidor, pero quien carga recibe todos los
 * ítems para administrarlos y no le corresponde tildar los ajenos.
 *
 * 🔑 **Acá, y sólo acá, se resuelve el arrastre.** Un ítem con `arrastra` cae hoy también si quedó
 * debiendo de antes, y en ese caso **es UNA fila, no una por semana**: dos ocurrencias abiertas
 * colapsan en la más vieja, que es la que el renglón nombra. `opts.arrastre = false` lo apaga, y lo
 * usa la grilla del Mes, que muestra lo programado y no la deuda.
 */
export function pendientesDe(
  items: ItemAgenda[],
  hechos: Hecho[],
  fecha: FechaIso,
  opts: { marca?: Marca; arrastre?: boolean } = {},
): PendienteHoy[] {
  const { marca, arrastre = true } = opts
  return items
    .filter((i) => i.clase === 'pendiente' && i.paraMi)
    .filter((i) => !marca || i.marcas.length === 0 || i.marcas.includes(marca))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'))
    .map((item): PendienteHoy | null => {
      const abierta = arrastre ? ocurrenciaAbierta(item, hechos, fecha) : null
      // Con algo abierto, el tilde va a la última vez que cayó —la que el handler acepta— y cierra
      // todo lo que venía atrás. Sin nada abierto, esto es el pendiente de siempre: el de hoy.
      const dia = abierta ? ultimaOcurrencia(item, fecha) : (vaEl(item, fecha) ? fecha : null)
      if (!dia) return null
      return {
        item,
        hecho: hechoDe(hechos, item.id, dia),
        fecha: dia,
        desde: abierta && abierta !== fecha ? abierta : null,
      }
    })
    .filter((p): p is PendienteHoy => p !== null)
}

/**
 * Los avisos que corren un día — lo que hay que saber, no lo que hay que hacer.
 *
 * 🔑 **Un aviso no se tilda y por eso no cuenta para el badge.** "El jueves no hay envíos" o "el
 * lunes viene el flete a las 10" no tienen un momento en que queden hechos: son el estado del día.
 * Si encendieran el número del menú, ese número no se podría bajar, y **un contador que no se puede
 * vaciar se deja de mirar en una semana** — que es exactamente lo que arruinaría también los
 * pendientes, que sí se apagan.
 *
 * Filtra por `paraMi` y por marca igual que `pendientesDe`: el destino ya se evaluó en el servidor.
 */
export function avisosDe(
  items: ItemAgenda[],
  fecha: FechaIso,
  opts: { marca?: Marca } = {},
): ItemAgenda[] {
  const { marca } = opts
  return items
    .filter((i) => i.clase === 'aviso' && i.paraMi && vaEl(i, fecha))
    .filter((i) => !marca || i.marcas.length === 0 || i.marcas.includes(marca))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'))
}

/** Cuántos pendientes de hoy siguen sin tildar. Es el número del badge, y sale de la misma lista. */
export function contarSinTildar(
  items: ItemAgenda[],
  hechos: Hecho[],
  fecha: FechaIso,
  opts: { marca?: Marca } = {},
): number {
  return pendientesDe(items, hechos, fecha, opts).filter((p) => !p.hecho).length
}

/**
 * Una cosa de la agenda parada en un día del mes.
 *
 * Los tres tipos van separados y no aplanados en `{titulo, color}` porque la grilla los dibuja
 * distinto y el detalle del día los ordena distinto: la promo se lee, el aviso se sabe y el
 * pendiente se tilda. Aplanarlos obligaría a la pantalla a adivinar cuál de los tres tiene delante.
 */
export type EntradaMes =
  | { key: string; tipo: 'promo'; promo: Promo }
  | { key: string; tipo: 'aviso'; item: ItemAgenda }
  | { key: string; tipo: 'pendiente'; item: ItemAgenda; hecho: Hecho | null }

/**
 * Qué cae cada día de un mes, para la grilla.
 *
 * 🔑 **Camina día por día llamando a las MISMAS funciones que contestan la pestaña Hoy** —
 * `promosDe`, `avisosDe`, `pendientesDe`— y no a una consulta propia por tipo de regla. Un mes son
 * treinta y una vueltas sobre unas pocas decenas de filas, así que lo barato no está en juego; lo
 * que está en juego es que **el cuadradito del jueves y lo que el local va a ver el jueves no
 * puedan discrepar**. Es el mismo criterio con el que se escribió `cumplimiento()`.
 *
 * El tilde sólo se llena para los días que ya pasaron por el GET (los últimos treinta): más atrás,
 * `hecho` va en `null` y la grilla no dibuja acuse en vez de dibujar un "sin hacer" que sería falso.
 *
 * Los días vacíos no entran al mapa: la grilla pinta la celda igual, y una entrada por cada día del
 * mes obligaría a distinguir "no hay nada" de "no se calculó".
 */
export function entradasDelMes(
  datos: { promos: Promo[]; items: ItemAgenda[]; hechos: Hecho[] },
  anio: number,
  mes: number,
  opts: { marca?: Marca } = {},
): Map<FechaIso, EntradaMes[]> {
  const out = new Map<FechaIso, EntradaMes[]>()
  for (let d = 1; d <= diasDelMes(anio, mes); d++) {
    const fecha = iso(anio, mes, d)
    const delDia: EntradaMes[] = [
      ...promosDe(datos.promos, fecha, opts).map(
        (promo): EntradaMes => ({ key: `p-${promo.id}`, tipo: 'promo', promo }),
      ),
      ...avisosDe(datos.items, fecha, opts).map(
        (item): EntradaMes => ({ key: `a-${item.id}`, tipo: 'aviso', item }),
      ),
      // ⛔ **El Mes no arrastra**: muestra la ocurrencia programada, no la deuda. Es la pantalla con
      // la que se planifica, y un pendiente que se pinta todos los días desde su origen la vuelve
      // ilegible justo en el mes en que algo se atrasó. La deuda se ve en Hoy y en Cumplimiento.
      ...pendientesDe(datos.items, datos.hechos, fecha, { ...opts, arrastre: false }).map(
        ({ item, hecho }): EntradaMes => ({ key: `i-${item.id}`, tipo: 'pendiente', item, hecho }),
      ),
    ]
    if (delDia.length > 0) out.set(fecha, delDia)
  }
  return out
}

/** Una ocurrencia mirada desde gerencia: qué día tocaba, de qué ítem, y si alguien lo tildó. */
export type FilaCumplimiento = { fecha: FechaIso; item: ItemAgenda; hecho: Hecho | null }

/**
 * Qué se tildó y qué no en los últimos días — lo que mira gerencia.
 *
 * Del día `hasta` hacia atrás, del más nuevo al más viejo. Se recorre día por día por el mismo
 * motivo que `ocurrencias()`: es el mismo `aplicaEn` que contesta la pestaña Hoy, así que **el rojo
 * de acá no puede discrepar con lo que el local vio ese día**.
 *
 * Dos exclusiones, y las dos evitan un rojo que no es de nadie:
 *
 * 1. **Nada anterior al día en que se cargó el ítem.** Una rutina que se carga hoy no incumplió los
 *    treinta días anteriores. El `created_at` es UTC y el día es local, así que un ítem cargado
 *    después de las 21:00 puede esconder su primera ocurrencia; es preferible a acusar de más.
 * 2. **Un ítem apagado no sigue sumando ocurrencias**, pero sus tildes viejos se siguen viendo:
 *    apagarlo dice "ya no va", no "nunca pasó".
 *
 * 🔑 **Lo que arrastra cuenta una vez por racha, no una por ocurrencia.** Una reunión que se debe
 * hace cuatro semanas es **un** incumplimiento, no cuatro: contarla cuatro veces la haría pesar
 * como cuatro rutinas distintas y hundiría el porcentaje del mes por un solo tema. Y al revés,
 * tildarla apagaría un rojo y dejaría tres prendidos para siempre, que es un rojo que no se puede
 * apagar.
 */
export function cumplimiento(
  items: ItemAgenda[],
  hechos: Hecho[],
  hasta: FechaIso,
  dias: number = DIAS_CUMPLIMIENTO,
): FilaCumplimiento[] {
  // Los días que se emiten de cada ítem que arrastra, calculados una sola vez por ítem: adentro del
  // bucle habría que rehacer la racha entera en cada uno de los treinta días.
  const deArrastre = new Map<string, Set<FechaIso>>()
  for (const item of items) {
    if (item.clase !== 'pendiente' || !item.arrastra || esPlantilla(item)) continue
    deArrastre.set(item.id, fechasDeRachas(item, hechos, hasta, dias))
  }

  const out: FilaCumplimiento[] = []
  for (let i = 0; i < dias; i++) {
    const fecha = sumarDias(hasta, -i)
    for (const item of items) {
      if (item.clase !== 'pendiente' || esPlantilla(item)) continue
      if (!aplicaEn(item.regla, fecha)) continue
      if (item.creado && fecha < item.creado.slice(0, 10)) continue
      const hecho = hechoDe(hechos, item.id, fecha)
      if (!item.activo && !hecho) continue
      if (item.arrastra && !deArrastre.get(item.id)?.has(fecha)) continue
      out.push({ fecha, item, hecho })
    }
  }
  return out
}

/**
 * De las ocurrencias de un ítem que arrastra, cuáles se muestran: **una por racha**.
 *
 * Una racha es lo que va desde la primera ocurrencia sin hacer hasta el tilde que la cierra. Se
 * emite el día del tilde —el día en que efectivamente se hizo— y, si al final quedó algo abierto, el
 * día en que empezó a deberse, que es el dato que importa: hace cuánto que viene.
 */
function fechasDeRachas(item: ItemAgenda, hechos: Hecho[], hasta: FechaIso, dias: number): Set<FechaIso> {
  const emitidas = new Set<FechaIso>()
  const piso = item.creado ? item.creado.slice(0, 10) : null
  let abierta: FechaIso | null = null
  // De la más vieja a la más nueva: una racha sólo se puede cerrar hacia adelante.
  for (let i = dias - 1; i >= 0; i--) {
    const fecha = sumarDias(hasta, -i)
    if (!aplicaEn(item.regla, fecha)) continue
    if (piso && fecha < piso) continue
    if (hechoDe(hechos, item.id, fecha)) {
      emitidas.add(fecha)
      abierta = null
    } else if (!abierta) {
      abierta = fecha
    }
  }
  if (abierta) emitidas.add(abierta)
  return emitidas
}

/**
 * El feriado que cae este día, si cae alguno.
 *
 * Sirve para un chip al lado de la rutina, no para saltearla: **saltearla sola sería deducir que el
 * local está cerrado**, y hay feriados que se trabaja. Quien mira decide; la pantalla avisa.
 *
 * Sale del catálogo que ya existe (`FECHAS_COMERCIALES`), que además resuelve solo el traslado de
 * los feriados trasladables — hardcodear "20 de noviembre" acierta un año y miente los otros.
 */
export function feriadoDe(fecha: FechaIso): string | null {
  if (!esFechaIso(fecha)) return null
  const anio = Number(fecha.slice(0, 4))
  for (const f of FECHAS_COMERCIALES) {
    if (f.tipo !== 'feriado') continue
    if (resolverComercial(f.clave, anio)?.fecha === fecha) return f.titulo
  }
  return null
}
