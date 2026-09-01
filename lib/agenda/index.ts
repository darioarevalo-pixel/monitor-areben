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

import { diasDelMes, diasEntre, FECHAS_COMERCIALES, hoyIso, iso, resolverComercial, sumarDias } from '@/lib/calendario'
import type { Marca } from '@/lib/nav.datos'
import type { Funcion, Perfil } from '@/lib/permisos'
import { coincide } from '@/lib/texto'
import { clavesDestino, rotuloDeClave } from '@/lib/novedades/tipos'
import { DIAS_ARRASTRE, DIAS_CUMPLIMIENTO, type Canal, type FechaIso, type Hecho, type ItemAgenda, type Promo, type Puerta, type Regla } from './tipos'
import {
  CLAVES_PUERTA as CLAVES_PUERTA_JS,
  moldeCorreEn as moldeCorreEnJs,
  moldeCorreEnMarca as moldeCorreEnMarcaJs,
  PUERTAS as PUERTAS_JS,
  puertaDeTipo as puertaDeTipoJs,
  puertasDeMarca as puertasDeMarcaJs,
  puertaValeEnMarca as puertaValeEnMarcaJs,
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
import {
  CLAVES_PLANTILLA as CLAVES_PLANTILLA_JS,
  clavesDeEje as clavesDeEjeJs,
  ejeValeEnMarca as ejeValeEnMarcaJs,
  esClavePlantilla as esClavePlantillaJs,
  hechoYaPaso as hechoYaPasoJs,
  moldeCorreEnEje as moldeCorreEnEjeJs,
  offsetDeMolde as offsetDeMoldeJs,
  PLANTILLAS as PLANTILLAS_JS,
  plantillaDe as plantillaDeJs,
} from './plantillas.core.js'
import {
  CAMBIOS as CAMBIOS_JS,
  CLAVES_CAMBIO as CLAVES_CAMBIO_JS,
  rotuloCambio as rotuloCambioJs,
} from './condicion.core.js'
import {
  esDeArriba as esDeArribaJs,
  FUNCION_TECHO as FUNCION_TECHO_JS,
  veLoDeArriba as veLoDeArribaJs,
} from './jerarquia.core.js'

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

// Las puertas de entrada del ingreso. El motor está en JS por el mismo motivo que el de las
// reglas: `api/_agenda.js` filtra los moldes antes de insertarlos y no puede importar TypeScript.
export const PUERTAS = PUERTAS_JS as { key: Puerta; label: string; marcas: Marca[]; ayuda: string }[]
export const CLAVES_PUERTA = CLAVES_PUERTA_JS as Puerta[]
// 🔑 **Las que existen en ESTA marca**, que es lo único que la pantalla puede dibujar: una opción
// imposible que igual se puede apretar es la que se aprieta, y acá cada click siembra seis
// renglones con dueña. `marcas: []` en el catálogo quiere decir las dos.
export const puertasDeMarca = puertasDeMarcaJs as (marca: Marca) => typeof PUERTAS
export const puertaValeEnMarca = puertaValeEnMarcaJs as (key: string, marca: Marca) => boolean
/**
 * La puerta que le corresponde a un tipo de `ingreso2`, o `null` si no lo conocemos.
 *
 * 🔑 **El mapa ⛔ no es 1 a 1**: `accesorios` era una puerta nuestra hasta el 1-sep-2026 y hoy se
 * traduce a `nacional`. Es el vocabulario de Gerardo, y por eso vive en el core.
 */
export const puertaDeTipo = puertaDeTipoJs as (tipo: unknown) => Puerta | null
export const rotuloPuerta = rotuloPuertaJs as (key: string) => string
export const moldeCorreEn = moldeCorreEnJs as (puertasDelMolde: Puerta[] | undefined, puerta: Puerta) => boolean
// La marca del ingreso, que se lee igual: lista vacía = las dos. ⛔ No es `esDeMisMarcas`: acá el
// ingreso tiene una sola marca, allá la persona puede tener las dos.
export const moldeCorreEnMarca = moldeCorreEnMarcaJs as (marcasDelMolde: Marca[] | undefined, marca: Marca) => boolean

/**
 * **Las plantillas de siembra**: qué hechos clonan una lista de moldes. Hoy dos —el ingreso y la
 * sesión de fotos— y cada una con su EJE, que es la columna que decide de quién es el renglón.
 *
 * Igual que las puertas: el catálogo vive en `.js` porque `api/_agenda.js` valida antes de guardar
 * y no puede importar TypeScript. Esto es la cara tipada, que es lo que usa el modal para dibujar
 * un solo formulario que sirve para las dos.
 */
export type EjeDePlantilla = {
  /** El campo del ítem que lleva la lista: `puertas`, `disparadores` o `cambios`. */
  campo: 'puertas' | 'disparadores' | 'cambios'
  /** Cómo se llama el valor —uno solo— en el clon: `datos.puerta` / `datos.disparador` / `datos.cambio`. */
  campoClon: 'puerta' | 'disparador' | 'cambio'
  titulo: string
  claves: string[]
  /**
   * 🆕 **Qué valores existen en cada marca**, cuando el eje depende del negocio. Sólo lo trae el
   * ingreso: las puertas no son las mismas en Zattia que en BDI. **Ausente = los de `claves`**, que
   * es el caso de los otros dos ejes. ⛔ No se llama directo: se lee con `clavesDeEje`, que es lo
   * que hace que la pantalla y el servidor corten por la misma lista.
   */
  clavesEn?: (marca: Marca) => string[]
  rotulo: (key: string) => string
  /**
   * La ayuda de cada valor, para el modal que lo pregunta. Sólo la traen los ejes de las plantillas
   * que se aprietan a mano: la sesión de fotos no tiene botón y no la necesita.
   */
  ayudaDe?: (key: string) => string
  pide: string
  invalido: string
}

/**
 * La copia del botón que siembra este hecho a mano, o `null` si ⛔ no se aprieta.
 *
 * 🔑 **Vive en el catálogo y ⛔ no en el modal**, que es lo que hace que el 5º disparador con botón
 * sea una fila más y no un segundo modal copiado del primero.
 */
export type PantallaDePlantilla = {
  /** La `action` del handler. Un nombre propio por hecho: ver el comentario en el catálogo. */
  action: string
  boton: string
  titulo: string
  queLabel: string
  queHint: string
  quePlaceholder: string
  cuandoLabel: string
  cuandoHint: string
  /** `true` = el campo de fecha nace en hoy. `false` = nace vacío, porque hoy contestaría la pregunta. */
  cuandoArrancaEnHoy: boolean
  vacio: string
}
export type Plantilla = {
  key: string
  evento: string
  /**
   * El título de la tarjeta en Eventos. ⚠️ ⛔ No es `evento`: ése va **adentro de una frase** («no
   * hay ningún paso cargado de ingreso») y como título pelado no dice de qué.
   */
  nombre: string
  /** Qué prende este evento, en una línea. Hasta el 29-ago-2026 vivía sólo en los comentarios. */
  comoSePrende: string
  elHecho: string
  delHecho: string
  campoClave: string
  label: string
  ayuda: string
  /** `null` = la plantilla no tiene eje (el lanzamiento): no hay paso que cambie de dueña. */
  eje: EjeDePlantilla | null
  /** `true` = un hecho con fecha vencida ⛔ no siembra y lo dice. Ver `hechoYaPaso`. */
  noSiembraSiPaso?: boolean
  /** `null` = este hecho ⛔ no se aprieta a mano: lo dispara otra pantalla. */
  pantalla: PantallaDePlantilla | null
  /** La ayuda del campo «a los cuántos días». Los ejemplos son de cada manual, ⛔ no genéricos. */
  ayudaOffset: string
  offsetMin: number
  offsetMax: number
}
export const PLANTILLAS = PLANTILLAS_JS as Plantilla[]
export const CLAVES_PLANTILLA = CLAVES_PLANTILLA_JS as string[]
/** ⚠️ ¿Es una CLAVE de plantilla? La de abajo, `esPlantilla`, pregunta si un ítem es molde. */
export const esClavePlantilla = esClavePlantillaJs as (key: unknown) => boolean
export const plantillaDe = plantillaDeJs as (key: unknown) => Plantilla | null
/** ¿Corre este molde para este valor del eje? **Lista vacía = todos.** */
export const moldeCorreEnEje = moldeCorreEnEjeJs as (listaDelMolde: string[] | undefined, valor: string) => boolean
/**
 * Los valores del eje que existen en esta marca. Sin `clavesEn` son todos.
 *
 * 🔑 **La dibuja el modal y con ella corta `sembrar`.** Dos listas distintas serían una pantalla
 * ofreciendo lo que el servidor rechaza, que es el modo de falla de «no pasó nada al apretar».
 */
export const clavesDeEje = clavesDeEjeJs as (eje: EjeDePlantilla | null, marca: Marca) => string[]
/** ¿Este valor del eje existe en esta marca? Es el guard de `sembrar`, y dice **qué hacer**. */
export const ejeValeEnMarca = ejeValeEnMarcaJs as (eje: EjeDePlantilla, valor: string, marca: Marca) => boolean
/** El `offsetDias` que acepta la plantilla, o `null` si no viene número o cae fuera de rango. */
export const offsetDeMolde = offsetDeMoldeJs as (plantilla: string, v: unknown) => number | null
/**
 * ¿La fecha del hecho ya pasó? **Con un día de margen**, porque el servidor es UTC y nosotros no.
 * La usan `sembrar` y la pantalla, que avisa antes de dejar apretar.
 */
export const hechoYaPaso = hechoYaPasoJs as (fecha: FechaIso, ahora?: number) => boolean

/**
 * **Qué cambió**: los tres cambios de condición comercial del 4º disparador — una promo, una forma
 * de pago, un cambio de envío. Salen del manual «Las chiquitas», que es donde está escrito que eso
 * ⛔ no es un posteo.
 */
export const CAMBIOS = CAMBIOS_JS as { key: string; label: string; ayuda: string }[]
export const CLAVES_CAMBIO = CLAVES_CAMBIO_JS as string[]
export const rotuloCambio = rotuloCambioJs as (key: string) => string

// El techo: Dirección arriba, el resto abajo y plano. En JS por lo de siempre — el corte que vale
// es el del servidor, y `api/_agenda.js` no puede importar TypeScript.
export const FUNCION_TECHO = FUNCION_TECHO_JS as Funcion
/** `equipo` es `[{name, funcion}]` tal como sale del padrón. Sin él, un destino por nombre da `false`. */
export const esDeArriba = esDeArribaJs as (
  destino: unknown,
  equipo: { name: string; funcion: Funcion[] }[],
) => boolean
export const veLoDeArriba = veLoDeArribaJs as (perfil: Perfil | null | undefined) => boolean

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
 * ¿Es una **actividad de un evento** y no una rutina? Existe para que el evento la copie con su
 * fecha: ⛔ no corre ningún día, no enciende el badge y no entra en Cumplimiento. Se la ve y se la
 * edita en la tarjeta de su evento, que es su único lugar.
 *
 * ⚠️ **Se sigue llamando `esPlantilla` y el campo sigue siendo `item.plantilla`**: la palabra que
 * cambió es la de la pantalla, ⛔ no la clave que ya está escrita en 44 filas de la base.
 */
export function esPlantilla(item: ItemAgenda): boolean {
  return !!item.plantilla
}

/**
 * ¿Este pendiente lo **copió un evento**? (`datos.hecho` del clon, ver `api/_agenda.js`.)
 *
 * 🔑 Es la tercera población de `agenda_items`, y hasta el 29-ago-2026 no se distinguía de una
 * rutina en ningún lado: los clones caían en la misma lista plana de «Cargar» y ⛔ **nadie los borra
 * nunca**, así que esa lista sólo crecía —6 por ingreso, 11 por lanzamiento, 8 por sesión—. Acá se
 * separan una vez y se miran por evento, que es la pregunta real: *«¿qué quedó abierto del IMP2?»*.
 */
export function esSembrado(item: ItemAgenda): boolean {
  return !!item.sembrado
}

/**
 * Lo que se carga y se edita a mano en **Rutinas**: ⛔ ni las actividades de un evento ni lo que un
 * evento ya copió.
 *
 * 🔴 **El corte va acá y ⛔ no adentro de la pantalla** por lo mismo que los filtros: es una
 * decisión sobre los datos —qué población se administra en cuál pantalla— y se fija con vitest. Una
 * pantalla que se olvida de uno de los dos cortes no falla: se llena.
 */
export function rutinasYAvisos(items: ItemAgenda[]): ItemAgenda[] {
  return items.filter((i) => !esPlantilla(i) && !esSembrado(i))
}

/**
 * Las actividades cargadas en un evento, **en el orden en que se van a copiar**.
 *
 * 🔑 Es el mismo orden que usa el servidor al sembrar (`api/_agenda.js`): por `offsetDias` y, a
 * igual día, por título. Que la tarjeta las muestre en otro orden que el que después sale sembrado
 * sería la pantalla contando otra historia que la base.
 */
export function actividadesDe(items: ItemAgenda[], plantilla: string): ItemAgenda[] {
  return items
    .filter((i) => i.plantilla === plantilla)
    .sort((a, b) => (a.offsetDias ?? 0) - (b.offsetDias ?? 0) || a.titulo.localeCompare(b.titulo, 'es'))
}

/** Un hecho que ya copió sus actividades: el ingreso «IMP2» del 26-ago y los renglones que dejó. */
export type GrupoSembrado = {
  /** La clave de idempotencia del clon. Es la identidad del grupo. */
  clave: string
  /** Cómo se llamó el hecho al cargarlo («IMP2»). */
  nombre: string
  /** La fecha del hecho, ⛔ no la del renglón: los renglones caen con su offset alrededor de ésta. */
  fecha: FechaIso
  items: ItemAgenda[]
  /**
   * Cuántos de esos renglones siguen sin tildar. 🔴 **`null` ⛔ no es cero**: quiere decir que este
   * hecho es más viejo que la ventana de tildes que baja el servidor (`DIAS_ARRASTRE`), así que
   * desde acá ⛔ **no se puede afirmar nada** — y un cero dibujado ahí diría «está todo hecho», que
   * es la afirmación más cara de esta pantalla. Lo viejo se mira en Cumplimiento.
   */
  sinTildar: number | null
}

/**
 * Lo que un evento ya copió, **agrupado por hecho** y lo más nuevo primero.
 *
 * 🔑 El dato para agrupar ya lo escribía el clon desde el 24-ago-2026 (`datos.de` + la clave)
 * *«para el día que la pantalla quiera agrupar por hecho»*; lo que faltaba era que llegara al
 * navegador. Los renglones de adentro van por fecha, que es el orden en que se hacen.
 */
export function porHecho(
  items: ItemAgenda[],
  hechos: Hecho[],
  hoy: FechaIso,
  plantilla?: string,
): GrupoSembrado[] {
  const m = new Map<string, Omit<GrupoSembrado, 'sinTildar'>>()
  for (const i of items) {
    const s = i.sembrado
    if (!s || (plantilla && s.evento !== plantilla)) continue
    const ya = m.get(s.clave)
    if (ya) ya.items.push(i)
    else m.set(s.clave, { clave: s.clave, nombre: s.nombre, fecha: s.fecha, items: [i] })
  }
  // Desde dónde los tildes VIAJAN: más atrás que esto el servidor no los baja, así que un renglón
  // sin tilde ahí no quiere decir que esté sin hacer. Es la misma ventana que usa el arrastre.
  const desde = sumarDias(hoy, -VENTANA_ARRASTRE)
  return [...m.values()]
    .map((g) => {
      const items = g.items.sort((a, b) => fechaDe(a).localeCompare(fechaDe(b)))
      return {
        ...g,
        items,
        sinTildar: g.fecha < desde ? null : items.filter((i) => !hechoDe(hechos, i.id, fechaDe(i))).length,
      }
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.nombre.localeCompare(b.nombre, 'es'))
}

/**
 * La fecha de un renglón copiado. Nace siempre como `{tipo:'unica'}` (lo fija `api/_agenda.js`), y
 * el vacío ordena al final en vez de romper: un renglón sin fecha es un dato roto, ⛔ no un crash.
 */
function fechaDe(i: ItemAgenda): string {
  return i.regla.tipo === 'unica' ? i.regla.fecha : '9999-12-31'
}

/**
 * A los cuántos días del hecho corre una actividad, **en castellano**.
 *
 * ⚠️ Vive acá y ⛔ no adentro de la fila porque lo dibujan dos pantallas —la tarjeta del evento y el
 * modal— y porque un `-2` se lee como un error de carga: «2 días antes del ingreso» se lee solo. El
 * artículo sale del catálogo (`delHecho`) y ⛔ no se compone, que es lo que ya decidió el catálogo.
 */
export function rotuloOffset(plantilla: Plantilla, dias: number | null | undefined): string {
  const d = dias ?? 0
  if (d === 0) return `el día ${plantilla.delHecho}`
  // ⚠️ El 1 va escrito y ⛔ no sale del plural: «a los 1 día del ingreso» es lo que salía de
  // componerlo, y se lee como un texto sin terminar.
  if (d === 1) return `al día siguiente ${plantilla.delHecho}`
  if (d > 1) return `a los ${d} días ${plantilla.delHecho}`
  if (d === -1) return `el día antes ${plantilla.delHecho}`
  return `${-d} días antes ${plantilla.delHecho}`
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
 * 🔴 **No es una preferencia: es el techo del dato.** Más atrás de lo que el GET manda, el navegador
 * **no puede saber si la ocurrencia se tildó**, y mirar más lejos que eso sería inventar un
 * pendiente sobre una ausencia de datos: la peor clase de rojo, el que no se puede apagar.
 *
 * ⚠️ Por eso este número **no se toca solo**: es el espejo del tramo profundo del GET
 * (`api/_agenda.js`), que manda el acuse viejo de los ítems que arrastran. Los dos lados o ninguno.
 */
const VENTANA_ARRASTRE = DIAS_ARRASTRE

/**
 * Cuántos días puede deberse este ítem: su tope, acotado por el techo del dato.
 *
 * `arrastraDias` en `null` o ausente es **sin tope**, que es lo que tienen las reuniones y los
 * clones del ingreso: quedan hasta que alguien los tilde. Un tope más largo que la ventana no
 * agranda nada — lo que el GET no mandó no se puede mirar igual.
 */
function topeArrastre(item: ItemAgenda): number {
  const tope = item.arrastraDias
  if (typeof tope !== 'number' || !Number.isFinite(tope) || tope < 0) return VENTANA_ARRASTRE
  return Math.min(tope, VENTANA_ARRASTRE)
}

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
 * 4. **El tope del ítem manda sobre los tres anteriores** (`arrastraDias`): pasado el tope, la
 *    ocurrencia deja de deberse aunque nadie la haya tildado. Es lo que separa una reunión —que es
 *    la misma dentro de tres semanas— de una pasada rutinaria, que al tercer día ya no se hace.
 */
export function ocurrenciaAbierta(item: ItemAgenda, hechos: Hecho[], hasta: FechaIso): FechaIso | null {
  if (!item.arrastra || !item.activo || esPlantilla(item)) return null
  const corte = ultimoTilde(hechos, item.id, hasta)
  const piso = item.creado ? item.creado.slice(0, 10) : null
  const tope = topeArrastre(item)
  let abierta: FechaIso | null = null
  for (let i = 0; i <= tope; i++) {
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
 * **De qué actividad es este renglón, y de qué hecho** — o `null` si no salió de ningún evento.
 *
 * 🔑 **La actividad es el título SIN el prefijo del hecho.** El clon nace como `OC-0468 · 03) El
 * NOMBRE de cada producto`, donde el prefijo es el agrupador que eligió Bruno el 24-ago-2026
 * *«y ⛔ no se escribe un motor de agrupación hasta haberlo usado dos veces»*. Ya se usó: el 1-sep
 * entraron **diez órdenes en un día** y la lista de Hoy pasó a tener el mismo paso repetido diez
 * veces. Éste es el motor, y sigue colgando del prefijo porque el clon ⛔ no guarda de qué molde
 * salió — lo que guarda (`sembrado.nombre`) es exactamente el prefijo, así que se resta, ⛔ no se
 * adivina con una regex.
 *
 * 🔴 **Y si el título no empieza con ese prefijo, devuelve `null`.** Los títulos se editan como los
 * de cualquier ítem: uno retocado a mano ⛔ **no puede desaparecer** dentro de un grupo ajeno —queda
 * suelto, que es como estaba—. *Un grupo con nombre feo se arregla mirando; un renglón que no entra
 * en ningún grupo desaparece de la pantalla.*
 *
 * ⚠️ **La pregunta de la puerta es su propia actividad**, aunque ⛔ no sea un clon: las once que
 * abrió el webhook el 1-sep son once tarjetas que dicen lo mismo y se contestan igual. El hecho, ahí,
 * es la orden.
 *
 * 🆕 **`oc` es con qué se abre esa orden** en `recepciones` (1-sep-2026, pedido de Bruno: *«si
 * apretás la OC, que vaya a la OC para ver los productos»*), y **`null` cuando no hay orden que
 * abrir**. Sale, en este orden: el id que guardó el clon (`item.oc`), el de la pregunta, o —para lo
 * sembrado antes de que el id se guardara— el **rótulo** del hecho, que `recepciones` sabe resolver
 * igual. ⛔ Sólo en el evento `ingreso`: el nombre de un lanzamiento o de una sesión ⛔ no es una
 * orden, y un botón que promete y abre un «no la encontré» enseña a no apretarlo.
 */
export const ACTIVIDAD_PREGUNTA_PUERTA = 'Por qué puerta entró cada orden'

export function actividadDe(item: ItemAgenda): { evento: string; actividad: string; hecho: string; oc: string | null } | null {
  if (item.preguntaIngreso) {
    return {
      evento: 'ingreso',
      actividad: ACTIVIDAD_PREGUNTA_PUERTA,
      hecho: item.preguntaIngreso.nombre,
      oc: item.preguntaIngreso.oc || item.preguntaIngreso.nombre,
    }
  }
  const s = item.sembrado
  if (!s) return null
  const prefijo = `${s.nombre} · `
  if (!item.titulo.startsWith(prefijo)) return null
  const actividad = item.titulo.slice(prefijo.length).trim()
  if (!actividad) return null
  return { evento: s.evento, actividad, hecho: s.nombre, oc: s.evento === 'ingreso' ? (item.oc || s.nombre) : null }
}

/**
 * Un renglón de «Hoy»: o un pendiente suelto, o **la misma actividad de varios hechos**.
 *
 * `clave` es para el `key` de React y ⛔ no se muestra.
 */
export type FilaHoy =
  | { tipo: 'suelto'; clave: string; p: PendienteHoy }
  | {
      tipo: 'grupo'
      clave: string
      /** Lo que se dice UNA vez: el paso, sin el número de orden adelante. */
      actividad: string
      evento: string
      /** El cuerpo y el manual salen del primero: los clones de un mismo molde los traen iguales. */
      cuerpo: string | null
      manualId: string | null
      /** Uno por hecho, ordenados por el nombre del hecho, que es como se sembraron. */
      filas: { hecho: string; oc: string | null; p: PendienteHoy }[]
      /** Cuántos de los de adentro ya están tildados. Es el «3 de 10» del encabezado. */
      hechas: number
    }

/**
 * **Lo de Hoy, con las actividades repetidas unificadas en una sola fila** (1-sep-2026, pedido de
 * Bruno: *«cuando hay varias OC, las actividades de cada evento, unificarlas en factor común»*).
 *
 * De dónde salió: ese día el webhook de Ingresos empezó a mandar en vivo y entraron **diez órdenes**.
 * Cada una siembra diez pasos ⇒ **100 renglones**, y ninguno decía nada que el de al lado no dijera:
 * Lorena tenía cuatro pasos repetidos diez veces, y el «Hoy» de Bruno, «05) Decidir el PRECIO» diez
 * veces. 🔑 **La regla de oro de Hoy es que sea corta**, y cien renglones la rompen aunque cada uno
 * esté bien.
 *
 * 🔑 **Agrupa de a DOS o más, ⛔ nunca de a uno.** Una tarjeta «grupo» con una sola orden adentro es
 * la misma información con un envoltorio más, y encima esconde el número de orden en un chip.
 *
 * 🔴 **⛔ No cambia qué se tilda ni adónde va el tilde.** Cada orden de adentro conserva SU ítem y SU
 * fecha —el arrastre resuelve una fecha por renglón, y dos órdenes de días distintos cierran
 * ocurrencias distintas—. Esto es cómo se dibuja, ⛔ no qué se guarda: el badge del menú, el Mes y
 * Cumplimiento siguen contando renglones y no pueden discrepar con esto.
 *
 * ⚠️ **El orden es el mismo criterio de siempre**: alfabético por lo que se ve. Un grupo se ordena
 * por su actividad y un suelto por su título, en la misma lista — si los grupos fueran todos arriba,
 * la lista cambiaría de orden sola el día que entra la segunda orden.
 */
export function filasDeHoy(pendientes: PendienteHoy[]): FilaHoy[] {
  const grupos = new Map<string, { actividad: string; evento: string; items: { hecho: string; oc: string | null; p: PendienteHoy }[] }>()
  const sueltos: PendienteHoy[] = []
  for (const p of pendientes) {
    const a = actividadDe(p.item)
    if (!a) { sueltos.push(p); continue }
    const clave = `${a.evento}\u0000${a.actividad}`
    const ya = grupos.get(clave)
    if (ya) ya.items.push({ hecho: a.hecho, oc: a.oc, p })
    else grupos.set(clave, { actividad: a.actividad, evento: a.evento, items: [{ hecho: a.hecho, oc: a.oc, p }] })
  }
  const filas: FilaHoy[] = sueltos.map((p) => ({ tipo: 'suelto', clave: p.item.id, p }))
  for (const [clave, g] of grupos) {
    // Uno solo ⛔ no es un grupo: vuelve a la lista como el renglón que era.
    if (g.items.length < 2) { filas.push({ tipo: 'suelto', clave: g.items[0].p.item.id, p: g.items[0].p }); continue }
    const items = [...g.items].sort((a, b) => a.hecho.localeCompare(b.hecho, 'es'))
    filas.push({
      tipo: 'grupo',
      clave,
      actividad: g.actividad,
      evento: g.evento,
      cuerpo: items[0].p.item.cuerpo,
      manualId: items[0].p.item.manualId,
      filas: items,
      hechas: items.filter((x) => x.p.hecho).length,
    })
  }
  const rotulo = (f: FilaHoy) => (f.tipo === 'grupo' ? f.actividad : f.p.item.titulo)
  return filas.sort((a, b) => rotulo(a).localeCompare(rotulo(b), 'es'))
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
export function entradasDeRango(
  datos: { promos: Promo[]; items: ItemAgenda[]; hechos: Hecho[] },
  desde: FechaIso,
  hasta: FechaIso,
  opts: { marca?: Marca } = {},
): Map<FechaIso, EntradaMes[]> {
  const out = new Map<FechaIso, EntradaMes[]>()
  if (!esFechaIso(desde) || !esFechaIso(hasta)) return out
  const largo = diasEntre(desde, hasta)
  // El mismo tope que `ocurrencias()`, y por el mismo motivo: existe sólo para que un desde/hasta
  // mal armado no cuelgue la pantalla. ⛔ No una constante nueva.
  if (largo < 0 || largo > MAX_VENTANA_DIAS) return out

  for (let i = 0; i <= largo; i++) {
    const fecha = sumarDias(desde, i)
    const delDia: EntradaMes[] = [
      ...promosDe(datos.promos, fecha, opts).map(
        (promo): EntradaMes => ({ key: `p-${promo.id}`, tipo: 'promo', promo }),
      ),
      ...avisosDe(datos.items, fecha, opts).map(
        (item): EntradaMes => ({ key: `a-${item.id}`, tipo: 'aviso', item }),
      ),
      // ⛔ **La grilla no arrastra**: muestra la ocurrencia programada, no la deuda. Es la pantalla
      // con la que se planifica, y un pendiente que se pinta todos los días desde su origen la
      // vuelve ilegible justo en el mes en que algo se atrasó. La deuda se ve en Hoy y en
      // Cumplimiento. ⚠️ Vale igual para la semana: ahí se pintaría los siete días seguidos.
      ...pendientesDe(datos.items, datos.hechos, fecha, { ...opts, arrastre: false }).map(
        ({ item, hecho }): EntradaMes => ({ key: `i-${item.id}`, tipo: 'pendiente', item, hecho }),
      ),
    ]
    if (delDia.length > 0) out.set(fecha, delDia)
  }
  return out
}

/**
 * El mes entero. Es `entradasDeRango` con los bordes puestos, y sigue existiendo porque **el mes es
 * un concepto de verdad**: si la pantalla tuviera que calcular el último día de febrero para pedirlo,
 * estaría calculando una regla.
 */
export function entradasDelMes(
  datos: { promos: Promo[]; items: ItemAgenda[]; hechos: Hecho[] },
  anio: number,
  mes: number,
  opts: { marca?: Marca } = {},
): Map<FechaIso, EntradaMes[]> {
  return entradasDeRango(datos, iso(anio, mes, 1), iso(anio, mes, diasDelMes(anio, mes)), opts)
}

// ── Qué se NOMBRA y qué se CUENTA ────────────────────────────────────────────────
//
// El mes se leía cargado y monótono (Bruno, 26-ago-2026), y las dos cosas son el mismo defecto: una
// rutina de todos los martes ocupa cuatro cuadraditos diciendo siempre lo mismo. Un chip que aparece
// todos los días **no aporta información** — y encima se come los tres renglones que entran en la
// celda, tapando lo único que sí había que mirar.

/**
 * ¿Esta regla **habla muchas veces** en un mes?
 *
 * 🔴 **El corte NO es "se repite": es cuántas veces se la ve en la grilla.** `diaria`, `semanal` y
 * `rango` caen cuatro veces o más; `unica` y `mensual` caen **una sola**, y colapsar una mensual
 * detrás de «1 rutina» esconde el único día en que existe — lo contrario exacto de lo que se
 * buscaba. `mensual` se repite mes a mes, pero eso no se ve dentro de un mes.
 *
 * ⛔ **No vive en `reglas.core.js`**: el handler valida reglas, no decide cuáles son mobiliario.
 */
export function esRepetitiva(regla: Regla): boolean {
  return regla.tipo === 'diaria' || regla.tipo === 'semanal' || regla.tipo === 'rango'
}

/** Un día ya resumido: lo que se nombra, lo que se cuenta, y cuántas de esas ya se tildaron. */
export type ResumenDia = { chips: EntradaMes[]; rutinas: EntradaMes[]; hechas: number }

/**
 * Parte el día en «lo excepcional, que se nombra» y «lo de siempre, que se cuenta».
 *
 * 🔴 **Las promos NO colapsan nunca, aunque sean lo más repetitivo que hay.** La razón de ser de la
 * pestaña es contestar *«¿cuándo cae la próxima del Nación?»*, y eso se contesta viendo los cuatro
 * martes pintados. Los avisos tampoco: son pocos, son fechados, y ya se separan por su tono.
 *
 * 🔑 **Deriva del mismo mapa que ya se calculó**, ⛔ no de un segundo conteo por `ocurrencias()`. Un
 * criterio paralelo al `aplicaEn` día por día es justo cómo la grilla y lo que el local ve empiezan
 * a discrepar.
 *
 * ⚠️ **La vista de semana no lo usa**: ahí la celda es alta y entra todo. El mes cuenta, la semana
 * nombra.
 */
export function resumirDia(entradas: EntradaMes[]): ResumenDia {
  const chips: EntradaMes[] = []
  const rutinas: EntradaMes[] = []
  for (const e of entradas) {
    if (e.tipo === 'pendiente' && esRepetitiva(e.item.regla)) rutinas.push(e)
    else chips.push(e)
  }
  // Con una sola, el contador esconde el título sin ahorrar un renglón: se nombra.
  if (rutinas.length === 1) {
    chips.push(rutinas[0])
    return { chips, rutinas: [], hechas: 0 }
  }
  const hechas = rutinas.filter((e) => e.tipo === 'pendiente' && !!e.hecho).length
  return { chips, rutinas, hechas }
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
 *
 * 🔑 **El tope del ítem corta la racha, y tiene que cortarla acá igual que en `ocurrenciaAbierta`.**
 * Con `arrastraDias: 2`, tildar el jueves **no** cierra el lunes —desde el jueves ya no se puede
 * tildar el lunes—, así que contarlos como una sola racha escondería la pasada del lunes. Pasado el
 * tope la racha se cierra sin cumplir y la ocurrencia siguiente empieza una nueva.
 *
 * ⚠️ Lo que quedó abierto se emite **aunque ya haya vencido el tope**: en Hoy ese renglón ya no se
 * ve, pero no haberse hecho sigue siendo no haberse hecho, y Cumplimiento es justo el informe de
 * eso. Es el mismo criterio que tiene hoy un pendiente que no arrastra: se venció con el día y
 * aparece igual en el mes.
 */
function fechasDeRachas(item: ItemAgenda, hechos: Hecho[], hasta: FechaIso, dias: number): Set<FechaIso> {
  const emitidas = new Set<FechaIso>()
  const piso = item.creado ? item.creado.slice(0, 10) : null
  const tope = topeArrastre(item)
  let abierta: FechaIso | null = null
  // De la más vieja a la más nueva: una racha sólo se puede cerrar hacia adelante.
  for (let i = dias - 1; i >= 0; i--) {
    const fecha = sumarDias(hasta, -i)
    if (!aplicaEn(item.regla, fecha)) continue
    if (piso && fecha < piso) continue
    // La racha anterior venció antes de llegar hasta acá: se cierra sin cumplir y ésta arranca sola.
    if (abierta && diasEntre(abierta, fecha) > tope) {
      emitidas.add(abierta)
      abierta = null
    }
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

// ── Administrar la lista: buscar y filtrar ───────────────────────────────────────
//
// La pestaña «Cargar» listaba los ítems de corrido y sin un solo filtro. Con 32 pendientes vivos y
// los moldes del ingreso encima, "¿qué le toca a Sofi?" se contestaba leyendo la lista entera —y
// una lista que hay que leer entera no se revisa—. Pedido de Bruno, 26-ago-2026.
//
// 🔑 Va en el núcleo y no adentro de la pantalla para que se pueda fijar con vitest: son decisiones
// sobre los datos (qué cuenta como molde, con qué claves se filtra), no sobre cómo se dibujan.

/**
 * Qué clase de ítem es, para el chip de «qué es».
 *
 * ⚠️ **Ya no existe `'molde'`** (29-ago-2026): las actividades de un evento se administran en su
 * tarjeta y lo que un evento copió se mira por hecho, así que esta lista es sólo rutinas y avisos
 * —lo filtra `rutinasYAvisos()` antes de llegar acá—. Un chip para una población que no está en la
 * lista devuelve cero y se lee como que se perdió algo.
 */
export type FiltroClase = 'todos' | 'pendiente' | 'aviso'
/** Prendido, apagado, o los dos. */
export type FiltroEstado = 'todos' | 'activos' | 'apagados'

export type FiltroItems = {
  /** Texto libre: cada palabra tiene que aparecer, sin tildes ni mayúsculas (`lib/texto`). */
  q?: string
  /** Una clave de `clavesDestino`, o `'todos'` para no filtrar. ⚠️ `'todos'` acá es "no filtres". */
  quien?: string
  clase?: FiltroClase
  estado?: FiltroEstado
}

/** Pendiente o aviso. Las otras dos poblaciones ya no llegan acá: ver `rutinasYAvisos()`. */
function claseDe(i: ItemAgenda): Exclude<FiltroClase, 'todos'> {
  return i.clase === 'aviso' ? 'aviso' : 'pendiente'
}

/**
 * Las opciones del filtro «de quién», sacadas de **los ítems cargados** y no del padrón.
 *
 * 🔑 **Y eso es deliberado.** La lista del equipo vive en el KV de `bdi-catalogo` y es admin-only
 * (`traerConfigAdmin`), por eso `ModalItem` la pide recién cuando alguien elige «a una persona»:
 * colgar de esa llamada el `<Select>` de un filtro sería una ida a otro sistema para pintar una
 * lista desplegable. Además, las opciones que salen de los ítems son **exactamente las que devuelven
 * filas** — una opción que da cero es una promesa que la pantalla no puede cumplir.
 *
 * Ordenadas por cantidad y después alfabéticamente: la primera pregunta es «¿quién tiene más?».
 */
export function opcionesDeQuien(items: ItemAgenda[]): { clave: string; label: string; n: number }[] {
  const cuenta = new Map<string, number>()
  for (const i of items) {
    for (const c of clavesDestino(i.destino)) cuenta.set(c, (cuenta.get(c) || 0) + 1)
  }
  return [...cuenta.entries()]
    .map(([clave, n]) => ({ clave, label: rotuloDeClave(clave), n }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'es'))
}

/**
 * La lista de «Cargar», recortada.
 *
 * 🔴 **Una clave que no existe devuelve CERO filas, ⛔ no todas.** Caer a "mostrá todo" cuando el
 * filtro no matchea es el modo de falla que hace que alguien crea que revisó lo de una persona
 * mirando la lista completa.
 */
export function filtrarItems(items: ItemAgenda[], f: FiltroItems = {}): ItemAgenda[] {
  const quien = f.quien && f.quien !== 'todos' ? f.quien : null
  const clase = f.clase && f.clase !== 'todos' ? f.clase : null
  const estado = f.estado && f.estado !== 'todos' ? f.estado : null

  return items.filter((i) => {
    if (clase && claseDe(i) !== clase) return false
    if (estado && (estado === 'activos') !== !!i.activo) return false
    if (quien && !clavesDestino(i.destino).includes(quien)) return false
    if (f.q && !coincide(`${i.titulo} ${i.cuerpo || ''}`, f.q)) return false
    return true
  })
}

/**
 * Cumplimiento agrupado por responsable: **quién debe cuántas**.
 *
 * Es lo que convierte la foto en algo que se puede conversar. Hasta acá el informe decía cuántas se
 * tildaron y de qué rutina, y en el renglón que importa —el que no se hizo— no decía de quién era.
 *
 * ⚠️ **Una fila con dos responsables suma en los dos**, así que la suma de este resumen puede dar
 * más que el total de arriba. Es correcto —las dos la deben— y la pantalla lo dice: repartir la
 * mitad a cada una sería inventar una responsabilidad parcial que nadie acordó.
 *
 * Ordenado por lo que falta, que es lo que se está buscando.
 */
export function porResponsable(
  filas: FilaCumplimiento[],
): { clave: string; label: string; sin: number; total: number }[] {
  const m = new Map<string, { sin: number; total: number }>()
  for (const f of filas) {
    for (const c of clavesDestino(f.item.destino)) {
      const ya = m.get(c) || { sin: 0, total: 0 }
      ya.total += 1
      if (!f.hecho) ya.sin += 1
      m.set(c, ya)
    }
  }
  return [...m.entries()]
    .map(([clave, v]) => ({ clave, label: rotuloDeClave(clave), ...v }))
    .sort((a, b) => b.sin - a.sin || b.total - a.total || a.label.localeCompare(b.label, 'es'))
}
