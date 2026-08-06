/**
 * El registro de acciones sobre la pauta, traducido a algo que se pueda leer.
 *
 * # Por qué esto es un módulo y no unas líneas adentro del componente
 *
 * La tabla guarda hechos crudos: `de: {daily_budget: "180000"}`, `a: {daily_budget: "190000"}`,
 * `resultado: "error"`. Leído así, el registro contesta «¿qué pasó?» con un jsonb, y una auditoría
 * que hay que interpretar no es una auditoría. Lo que tiene que decir es **«Bruno subió el diario de
 * $1.800 a $1.900»**, y esa traducción tiene suficientes casos límite como para amarrarla con tests:
 *
 * - Un rechazo **viejo** (anterior al 6-ago-2026) no tiene ni `a` ni `pedido`: no se puede saber qué
 *   se quiso hacer, y hay que decir eso en vez de inventarlo.
 * - `de` puede faltar aunque `a` esté: el objeto no se llegó a leer antes de escribir.
 * - Los montos vienen **crudos, en la unidad menor de la moneda** (en ARS `190000` es $1.900) y como
 *   string, no como número.
 *
 * # La distinción que ordena todo
 *
 * 🔑 **`rechazado` no es lo mismo que `error`.** Rechazado es «no se tocó nada»: se puede repetir sin
 * mirar. `error` y `en-curso` son «no sabemos cómo quedó», y esas mandan a Ads Manager antes de
 * repetir. Una pantalla que las pinte a las tres de rojo pierde justo la información que importa.
 */

import { aMonto, ETIQUETA_NIVEL, type NivelAccion } from './acciones'
import type { FilaAuditoria, ResultadoAccionFila } from './tipos'

/** Los estados de Meta, en castellano. */
export const ETIQUETA_ESTADO: Record<string, string> = {
  ACTIVE: 'Activo',
  PAUSED: 'Pausado',
}

export const rotuloEstado = (s: string | null | undefined): string =>
  s ? ETIQUETA_ESTADO[s] ?? s.toLowerCase().replace(/_/g, ' ') : '—'

/** Cómo se lee cada final, y —lo que importa— si dejó las cosas en un estado conocido. */
export type LecturaResultado = {
  rotulo: string
  tono: 'success' | 'warning' | 'danger' | 'neutral'
  /**
   * `true` cuando **no se sabe cómo quedó**. Es lo único de esta pantalla que pide una acción de
   * quien la mira: ir a Ads Manager. Un rechazo no es incierto —no se tocó nada—, así que no entra.
   */
  incierto: boolean
  ayuda: string
}

const LECTURAS: Record<ResultadoAccionFila, LecturaResultado> = {
  ok: {
    rotulo: 'Se hizo',
    tono: 'success',
    incierto: false,
    ayuda: 'Meta lo aplicó y se confirmó releyendo el objeto, no sólo por la respuesta del pedido.',
  },
  rechazado: {
    rotulo: 'No se hizo',
    tono: 'neutral',
    incierto: false,
    ayuda: 'No se tocó nada: lo frenó una regla, un permiso o el propio Meta. Se puede volver a intentar.',
  },
  error: {
    rotulo: 'Sin confirmar',
    tono: 'warning',
    incierto: true,
    ayuda: 'Meta aceptó el cambio pero no se pudo confirmar cómo quedó. Miralo en Ads Manager antes de repetirlo.',
  },
  'en-curso': {
    rotulo: 'Se cortó',
    tono: 'danger',
    incierto: true,
    ayuda: 'La escritura se cortó antes de que Meta contestara, así que no sabemos si la aplicó. Miralo en Ads Manager antes de repetirlo.',
  },
  simulacro: {
    rotulo: 'Simulacro',
    tono: 'neutral',
    incierto: false,
    ayuda: 'Se calculó lo que haría, sin escribir en Meta.',
  },
}

const LECTURA_DESCONOCIDA: LecturaResultado = {
  rotulo: 'Sin registro',
  tono: 'warning',
  incierto: true,
  ayuda: 'La fila quedó con un resultado que esta pantalla no conoce.',
}

export function leerResultado(r: ResultadoAccionFila | string): LecturaResultado {
  return LECTURAS[r as ResultadoAccionFila] ?? LECTURA_DESCONOCIDA
}

/**
 * Lo que la fila cuenta, ya en castellano.
 *
 * `sinDato` es un estado de primera clase y no un hueco: significa **no se registró qué se quiso
 * hacer** (las filas viejas rechazadas). Rellenarlo con lo que parezca sería inventarle una
 * intención a alguien, que es lo contrario de auditar.
 */
export type Contada =
  | { clase: 'estado'; titulo: string; desde: string | null; hasta: string | null; sinDato: boolean }
  | {
      clase: 'presupuesto'
      titulo: string
      /** En unidades de la moneda. `null` si no se llegó a leer el valor anterior. */
      desde: number | null
      hasta: number | null
      /** Fracción con signo (0.0556 = +5,6%). `null` si falta alguna de las dos puntas o si `desde` es 0. */
      variacion: number | null
      /**
       * 🔑 **`true` = los montos van CRUDOS**, en la unidad menor, porque no se supo la moneda de la
       * cuenta. El `/100` depende de la moneda (en ARS `190000` es $1.900; en CLP son 190.000), así
       * que aplicarlo sin saberla sería adivinar de a dos órdenes de magnitud en una pantalla que
       * existe para auditar plata. Se muestra crudo y se dice que lo es.
       */
      crudo: boolean
      sinDato: boolean
    }
  | { clase: 'otra'; titulo: string; sinDato: boolean }

/**
 * El nivel con su artículo. Existe porque «Pausó el/la campaña» se lee como un mensaje de sistema:
 * `campaña` es femenino y `conjunto`/`aviso` masculinos, y la frase entera vive o muere en eso. Los
 * niveles que sumen las tandas que vienen caen al genérico en vez de desaparecer.
 */
const EL: Partial<Record<NivelAccion, string>> = { campania: 'la campaña', conjunto: 'el conjunto', aviso: 'el aviso' }
const DEL: Partial<Record<NivelAccion, string>> = { campania: 'de la campaña', conjunto: 'del conjunto', aviso: 'del aviso' }
const el = (n: string) => EL[n as NivelAccion] ?? `el/la ${ETIQUETA_NIVEL[n as NivelAccion] ?? n}`
const del = (n: string) => DEL[n as NivelAccion] ?? `de ${ETIQUETA_NIVEL[n as NivelAccion] ?? n}`

/** Meta manda los montos como string (`"190000"`). Un `Number` directo sobre `null` da 0, que miente. */
function crudo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Qué se quiso hacer. **`pedido` manda sobre `a`**: `a` es lo que Meta devolvió al releer, así que
 * en una acción que no se aplicó no existe, y es justo ahí donde hace falta saber la intención.
 */
function buscado(f: FilaAuditoria, campo: string): unknown {
  const p = f.pedido && f.pedido[campo]
  if (p !== undefined && p !== null) return p
  const a = f.a && f.a[campo]
  return a ?? null
}

/**
 * `moneda` es la de la cuenta de la fila, o **`null` cuando no se pudo saber** (Meta no contestó, o
 * la fila murió antes de registrar la cuenta). No es lo mismo que `''`: con `null` los montos salen
 * crudos y marcados, en vez de dividirse por 100 a ciegas.
 */
export function contar(f: FilaAuditoria, moneda: string | null): Contada {
  const salio = f.resultado === 'ok'

  if (f.accion === 'estado') {
    const desde = (f.de && f.de.status) ?? null
    const hasta = buscado(f, 'status')
    const destino = hasta === null ? null : String(hasta).toUpperCase()
    // El verbo lleva el nivel adentro a propósito: «Pausó» a secas se lee igual para una campaña
    // entera que para un aviso suelto, y no es lo mismo apagar una cosa que la otra.
    const verbo = destino === 'PAUSED' ? 'Pausó' : destino === 'ACTIVE' ? 'Reactivó' : null
    if (!verbo) {
      return {
        clase: 'estado',
        titulo: `Intentó pausar o reactivar ${el(f.nivel)}`,
        desde: desde ? String(desde) : null, hasta: null, sinDato: true,
      }
    }
    const titulo = salio
      ? `${verbo} ${el(f.nivel)}`
      : `Intentó ${verbo === 'Pausó' ? 'pausar' : 'reactivar'} ${el(f.nivel)}`
    return { clase: 'estado', titulo, desde: desde ? String(desde) : null, hasta: destino, sinDato: false }
  }

  if (f.accion === 'presupuesto') {
    // Con moneda desconocida el valor no se toca: la conversión se pospone hasta que haya con qué
    // hacerla, y mientras tanto la pantalla lo dice.
    const enMoneda = (v: number) => (moneda === null ? v : aMonto(v, moneda))
    const desdeCrudo = crudo(f.de && f.de.daily_budget)
    const hastaCrudo = crudo(buscado(f, 'daily_budget'))
    const desde = desdeCrudo === null ? null : enMoneda(desdeCrudo)
    const hasta = hastaCrudo === null ? null : enMoneda(hastaCrudo)
    if (hasta === null) {
      return {
        clase: 'presupuesto',
        titulo: `Quiso cambiar el presupuesto diario ${del(f.nivel)}`,
        desde, hasta: null, variacion: null, crudo: moneda === null, sinDato: true,
      }
    }
    // La variación es una razón, así que sale igual de bien con montos crudos que convertidos.
    const variacion = desde !== null && desde !== 0 ? (hasta - desde) / desde : null
    const rumbo = desde === null ? 'Puso' : hasta > desde ? 'Subió' : hasta < desde ? 'Bajó' : 'Dejó igual'
    const titulo = salio
      ? `${rumbo} el presupuesto diario ${del(f.nivel)}`
      : `Intentó ${rumbo === 'Subió' ? 'subir' : rumbo === 'Bajó' ? 'bajar' : 'cambiar'} el presupuesto diario ${del(f.nivel)}`
    return { clase: 'presupuesto', titulo, desde, hasta, variacion, crudo: moneda === null, sinDato: false }
  }

  // Las Tandas 2 y 3 suman `duplicar` y `crear` a la misma tabla. Que caigan acá con su nombre crudo
  // es mejor que no aparecer: una acción nueva se ve el día uno, aunque se lea fea.
  return {
    clase: 'otra',
    titulo: `${salio ? 'Hizo' : 'Intentó'} «${f.accion}» sobre ${el(f.nivel)}`,
    sinDato: !salio && !f.pedido,
  }
}

/**
 * Las filas que dejaron algo sin saber cómo quedó. Es lo que va al cartel de arriba de todo: si hay
 * una sola, es lo primero que tiene que ver quien abre la pantalla.
 */
export const inciertas = (filas: FilaAuditoria[]): FilaAuditoria[] =>
  filas.filter((f) => leerResultado(f.resultado).incierto)

/**
 * El cupo de escritura que quedaba en Meta, sacado del header `X-Business-Use-Case-Usage`.
 *
 * Se guarda crudo —un JSON anidado por cuenta— y volcarlo en la fila llena la columna de llaves y
 * comillas sin que nadie lo lea. Lo que sirve son dos números: **`call_count` es el PORCENTAJE del
 * cupo ya usado** (no una cantidad de llamadas, aunque el nombre lo sugiera) y el `ads_api_access_tier`,
 * que hoy es `development_access` y es un techo bajo que hay que mirar antes de que algo corra solo.
 *
 * Devuelve `null` si no hay nada que decir: tolerante a propósito, porque el formato lo decide Meta y
 * un cambio suyo no puede romper la pantalla que sirve para averiguar qué pasó.
 */
export function leerUso(uso: string | null | undefined): { pct: number | null; tier: string | null } | null {
  if (!uso) return null
  try {
    const d = JSON.parse(uso) as Record<string, { call_count?: number; ads_api_access_tier?: string }[]>
    const filas = Object.values(d).flat().filter(Boolean)
    if (!filas.length) return null
    // El máximo entre cuentas: el que primero toque el techo es el que frena todo.
    const pcts = filas.map((x) => x && x.call_count).filter((n): n is number => typeof n === 'number')
    const tier = filas.map((x) => x && x.ads_api_access_tier).find(Boolean) || null
    return { pct: pcts.length ? Math.max(...pcts) : null, tier }
  } catch {
    return null
  }
}

/** El tier de la app, en castellano. `development_access` es el techo bajo del que hay que salir. */
export const ROTULO_TIER: Record<string, string> = {
  development_access: 'desarrollo',
  standard_access: 'estándar',
  basic_access: 'básico',
}

/** Fecha y hora **local**, que es la del que mira. `cuando` viaja en UTC con zona. */
export function cuandoLegible(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
