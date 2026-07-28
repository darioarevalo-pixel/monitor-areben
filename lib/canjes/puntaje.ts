/**
 * El puntaje de una creadora — Fase 3.
 *
 * ⚠️⚠️ LEER ESTO ANTES DE TOCAR LA FÓRMULA ⚠️⚠️
 *
 * Este archivo se construyó **antes de tener datos**, contra la recomendación del propio plan (§8),
 * porque Bruno prefirió tenerlo listo para cuando lleguen. La única razón por la que eso no es una
 * mentira andando es el **piso mínimo**: con menos de `MINIMO_CANJES_CERRADOS` canjes cerrados no
 * hay puntaje, ni aproximado, ni provisorio, ni en gris. Se dice "todavía no alcanza" y listo.
 *
 * **No bajar ese piso para que la pantalla se vea llena.** Un número con dos casos atrás no es un
 * número chico: es ruido con cara de medición, y el riesgo real (§8) no es que el score se
 * equivoque sino que alguien decida a quién no llamar mirándolo.
 *
 * QUÉ MIDE, Y CON QUÉ
 * -------------------
 * Todo sale de lo que **ya viaja al browser** en el listado: los canjes con su balance congelado.
 * Cero requests nuevas, cero payload extra, cero funciones serverless — que es también la razón por
 * la que no mide puntualidad: eso vive en `canje_entregables`/`canje_evidencias`, que sólo se bajan
 * al abrir un canje.
 *
 * Tres señales, deliberadamente distintas entre sí:
 *   1. **Cumplimiento** — ¿publicó lo que prometió? Es un hecho, y por eso pesa más que el resto.
 *   2. **Nota del equipo** — el 1–5 que se pone al cerrar. Es subjetivo y se banca serlo: hay cosas
 *      (cómo quedó el contenido, cómo fue tratar con ella) que ningún número deriva solo.
 *   3. **Rendimiento** — el CPM contra el del resto del padrón. Es la única que compara personas
 *      entre sí, y la primera que se apaga cuando no hay con qué comparar.
 *
 * Una señal sin datos **no vale cero**: se apaga y su peso se reparte entre las que quedan. Un cero
 * silencioso sería exactamente la mentira que el piso mínimo evita.
 *
 * ⚠️ **Se calcula sobre los canjes de las marcas que ve quien mira.** Los de otras marcas llegan
 * ciegos (sin balance, sin `cerrado_incompleto`) y **no entran**: contarlos como cumplidos sería
 * inventar. Por eso `Puntaje` trae `ciegos`, para que la UI pueda decir sobre qué se calculó y
 * sobre qué no.
 *
 * Archivo PURO y con tests, como `calcularBalance`. **No tiene espejo en `api/*.js` y no debe
 * tenerlo**: la regla de `api/_reclamos.js` es que se replica lo que es un CONTROL, nunca un
 * CÁLCULO. Esto es un cálculo, y duplicar aritmética fue lo que se desincronizó con el motor viejo
 * de Cambios.
 */

import { esCiego, type CanjeVisible } from './cliente'
import type { CanjePersona } from './tipos'

/**
 * Cuántos canjes cerrados hacen falta para mostrar un puntaje.
 *
 * Tres es poco y se sabe. Es el mínimo con el que una fracción deja de ser binaria: con dos casos,
 * cualquier resultado es 0 %, 50 % o 100 %, y eso no distingue a nadie de nadie. Si con el tiempo
 * el módulo junta volumen, subirlo a 5 mejora la señal — bajarlo no.
 */
export const MINIMO_CANJES_CERRADOS = 3

/**
 * Cuántas personas tienen que tener CPM para que comparar signifique algo.
 *
 * La mediana de dos números es el promedio de esos dos números: cualquiera de los dos queda
 * automáticamente "en la media", que es justo lo que no queremos decir.
 */
export const MINIMO_PARA_COMPARAR = 3

export type ClaveDimension = 'cumplimiento' | 'nota' | 'rendimiento'

export const DIMENSION_LABEL: Record<ClaveDimension, string> = {
  cumplimiento: 'Cumplió lo que prometió',
  nota: 'Cómo la vio el equipo',
  rendimiento: 'Cuánto rindió la plata',
}

/** Los pesos de arranque. Se re-normalizan si alguna dimensión no se puede calcular. */
const PESO_BASE: Record<ClaveDimension, number> = {
  cumplimiento: 45,
  nota: 30,
  rendimiento: 25,
}

export type Dimension = {
  clave: ClaveDimension
  label: string
  /** 0–100. `null` = no hubo con qué calcularla; su peso se repartió entre las demás. */
  valor: number | null
  /** Cuánto pesó en el total, ya re-normalizado. 0 si se apagó. */
  peso: number
  /** De dónde salió, en criollo. Es lo que hace que el número se pueda discutir en vez de creer. */
  detalle: string
}

export type NivelPuntaje = 'alta' | 'media' | 'baja'

export const NIVEL_LABEL: Record<NivelPuntaje, string> = {
  alta: 'Muy buena',
  media: 'Cumple',
  baja: 'Floja',
}

export type Puntaje =
  | {
      hay: false
      /** `vetada` no se puntúa; `pocos` es el piso mínimo. No hay un tercer caso: pasado el piso,
       *  el cumplimiento siempre se puede calcular, así que siempre queda al menos una señal. */
      motivo: 'vetada' | 'pocos'
      cerrados: number
      /** Cuántos cerrados faltan para llegar al piso. 0 cuando el motivo no es `pocos`. */
      faltan: number
      ciegos: number
    }
  | {
      hay: true
      /** 0–100, redondeado. */
      total: number
      nivel: NivelPuntaje
      cerrados: number
      /** Canjes cerrados de marcas que este perfil no ve: NO entraron en la cuenta. */
      ciegos: number
      dimensiones: Dimension[]
    }

/** Lo que hace falta saber del resto del padrón para puntuar a una. Se calcula una vez por lista. */
export type ContextoPuntaje = {
  /** La mediana del CPM entre las personas que tienen alguno. `null` si no hay con qué comparar. */
  medianaCpm: number | null
  /** Cuántas personas aportaron CPM. Es lo que la UI muestra para explicar una comparación floja. */
  personasConCpm: number
}

/** Los canjes cerrados que **se pueden puntuar**: los ciegos no traen balance ni cumplimiento. */
function cerradosVisibles(canjes: CanjeVisible[]) {
  return canjes.filter((c) => !esCiego(c) && c.estado === 'cerrado') as Exclude<CanjeVisible, { ciego: true }>[]
}

/** Los cerrados de otras marcas: se cuentan para avisar, no para puntuar. */
function cerradosCiegos(canjes: CanjeVisible[]): number {
  return canjes.filter((c) => esCiego(c) && c.estado === 'cerrado').length
}

/** El CPM promedio de una persona, o `null` si ninguno de sus canjes lo tiene cargado. */
export function cpmDe(canjes: CanjeVisible[]): number | null {
  const valores = cerradosVisibles(canjes)
    .map((c) => Number(c.balance_cpm))
    .filter((n) => Number.isFinite(n) && n > 0)
  if (!valores.length) return null
  return valores.reduce((a, b) => a + b, 0) / valores.length
}

/** La mediana, sin sorpresas con los pares. */
function mediana(xs: number[]): number | null {
  if (!xs.length) return null
  const o = [...xs].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

/**
 * El contexto del padrón: contra qué se compara el rendimiento.
 *
 * Se calcula **una vez para toda la lista**, no por persona: si cada ficha armara su propia mediana
 * incluyéndose a sí misma, dos personas idénticas darían puntajes distintos.
 */
export function contextoDePuntaje(personas: { canjes: CanjeVisible[] }[]): ContextoPuntaje {
  const cpms = personas.map((p) => cpmDe(p.canjes)).filter((n): n is number => n != null)
  return {
    medianaCpm: cpms.length >= MINIMO_PARA_COMPARAR ? mediana(cpms) : null,
    personasConCpm: cpms.length,
  }
}

/** "1 canje" / "3 canjes". Concordancia acá y no en el JSX. */
function canjesEnCriollo(n: number): string {
  return n === 1 ? '1 canje' : `${n} canjes`
}

export function nivelDe(total: number): NivelPuntaje {
  if (total >= 75) return 'alta'
  if (total >= 50) return 'media'
  return 'baja'
}

/**
 * El puntaje de una persona.
 *
 * Devuelve `hay: false` mucho más seguido de lo que un score suele hacerlo, y eso es la
 * característica principal, no una limitación: sin base, callarse es la respuesta correcta.
 */
export function calcularPuntaje(
  persona: Pick<CanjePersona, 'vetada'>,
  canjes: CanjeVisible[],
  ctx: ContextoPuntaje,
): Puntaje {
  const cerrados = cerradosVisibles(canjes)
  const ciegos = cerradosCiegos(canjes)

  // A alguien vetado no se le calcula un número: la decisión ya está tomada y con un motivo escrito.
  // Un puntaje alto al lado de un cartel de "vetada" sólo invita a discutir el cartel.
  if (persona.vetada) return { hay: false, motivo: 'vetada', cerrados: cerrados.length, faltan: 0, ciegos }

  if (cerrados.length < MINIMO_CANJES_CERRADOS) {
    return {
      hay: false,
      motivo: 'pocos',
      cerrados: cerrados.length,
      faltan: MINIMO_CANJES_CERRADOS - cerrados.length,
      ciegos,
    }
  }

  // ── 1. Cumplimiento ────────────────────────────────────────────────────────────
  // Un canje cuenta como cumplido si se cerró completo Y conservó lo que le mandamos. Los dos son
  // hechos que alguien registró a mano, no inferencias.
  const completos = cerrados.filter((c) => !c.cerrado_incompleto && !c.producto_no_conservado).length
  const noConservados = cerrados.filter((c) => c.producto_no_conservado).length
  const cumplimiento = (completos / cerrados.length) * 100
  const detalleCumplimiento = [
    `Cumplió ${completos} de ${canjesEnCriollo(cerrados.length)}`,
    noConservados ? `, y en ${noConservados === 1 ? '1 no conservó' : `${noConservados} no conservó`} lo que le mandamos` : '',
    '.',
  ].join('')

  // ── 2. La nota del equipo ──────────────────────────────────────────────────────
  const notas = cerrados
    .map((c) => Number(c.balance_puntaje_manual))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5)
  const promNota = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null
  // 1→0, 5→100. La escala del formulario es 1–5, no 0–5: un 1 es la nota más baja que se puede
  // poner, no "cero".
  const nota = promNota == null ? null : ((promNota - 1) / 4) * 100

  // ── 3. Rendimiento ─────────────────────────────────────────────────────────────
  // CPM: **menor es mejor** (cuesta menos llegar a mil personas). Se puntúa contra la mediana del
  // padrón: igual que la mediana = 50, la mitad = 100, el doble = 25.
  const cpm = cpmDe(canjes)
  const rendimiento =
    cpm != null && ctx.medianaCpm != null && cpm > 0
      ? Math.max(0, Math.min(100, (ctx.medianaCpm / cpm) * 50))
      : null

  const crudas: Record<ClaveDimension, { valor: number | null; detalle: string }> = {
    cumplimiento: { valor: cumplimiento, detalle: detalleCumplimiento },
    nota: {
      valor: nota,
      detalle: promNota == null
        ? 'Nadie le puso nota al cerrar, así que esta señal no se usó.'
        : `Promedio ${promNota.toFixed(1)} de 5, sobre ${canjesEnCriollo(notas.length)}.`,
    },
    rendimiento: {
      valor: rendimiento,
      detalle:
        cpm == null
          ? 'No hay alcance cargado en sus canjes, así que no hay CPM que comparar.'
          : ctx.medianaCpm == null
            ? `Su CPM es $${Math.round(cpm).toLocaleString('es-AR')}, pero todavía no hay con qué compararlo: ${
                ctx.personasConCpm === 1 ? 'sólo 1 persona tiene' : `sólo ${ctx.personasConCpm} personas tienen`
              } CPM cargado.`
            : `CPM de $${Math.round(cpm).toLocaleString('es-AR')} contra una mediana de $${Math.round(ctx.medianaCpm).toLocaleString('es-AR')}.`,
    },
  }

  // Los pesos se re-normalizan sobre las dimensiones que sí se pudieron calcular. Una señal sin
  // datos no vale cero: se apaga.
  // `cumplimiento` nunca es null pasado el piso mínimo, así que `pesoVivo` nunca es 0: siempre hay
  // puntaje. Es a propósito — si el único dato es "cumplió 0 de 3", eso ya es una respuesta.
  const vivas = (Object.keys(PESO_BASE) as ClaveDimension[]).filter((k) => crudas[k].valor != null)
  const pesoVivo = vivas.reduce((a, k) => a + PESO_BASE[k], 0)

  const dimensiones: Dimension[] = (Object.keys(PESO_BASE) as ClaveDimension[]).map((clave) => ({
    clave,
    label: DIMENSION_LABEL[clave],
    valor: crudas[clave].valor,
    peso: crudas[clave].valor == null ? 0 : Math.round((PESO_BASE[clave] / pesoVivo) * 100),
    detalle: crudas[clave].detalle,
  }))

  const total = Math.round(
    vivas.reduce((a, k) => a + (crudas[k].valor as number) * PESO_BASE[k], 0) / pesoVivo,
  )

  return { hay: true, total, nivel: nivelDe(total), cerrados: cerrados.length, ciegos, dimensiones }
}

/**
 * Por qué no hay puntaje, en criollo. La UI muestra esto tal cual: "no alcanza" sin decir cuánto
 * falta es la clase de mensaje que se lee como "está roto".
 */
export function porQueNoHayPuntaje(p: Extract<Puntaje, { hay: false }>): string {
  if (p.motivo === 'vetada') return 'Está vetada: no se le calcula puntaje.'
  const base = p.cerrados === 0
    ? `Todavía no cerró ningún canje: hacen falta ${MINIMO_CANJES_CERRADOS}.`
    : `Cerró ${canjesEnCriollo(p.cerrados)} y ${p.faltan === 1 ? 'falta 1' : `faltan ${p.faltan}`} para poder puntuarla.`
  // Que el número exista en otra marca y no se pueda usar es raro de entender si no se dice.
  return p.ciegos
    ? `${base} Tiene ${canjesEnCriollo(p.ciegos)} cerrados en otras marcas, que no se pueden contar desde acá.`
    : base
}
