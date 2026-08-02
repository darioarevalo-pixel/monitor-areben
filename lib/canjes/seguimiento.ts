/**
 * "¿Hace cuánto no hacemos una acción con ella?"
 *
 * Es **la** pregunta del módulo, y la única razón por la que el padrón es único y todo vive en una
 * sola base: con una base por marca habría que bajar los canjes de las dos y mergear en el browser,
 * y la respuesta sería dos respuestas.
 *
 * ⚠️ Importa `diasDesde`/`addDiasISO` de `lib/crm/core.ts`, **no los copia**. Ya hay una
 * implementación probada de "cuántos días pasaron" y dos versiones divergen en el redondeo.
 */
import { addDiasISO, diasDesde } from '@/lib/crm/core'
import { CANJE_STORES, type CanjePersona, type CanjeRow, type CanjeStore, type EstadoCanje } from './tipos'

/**
 * `nunca` — todavía no hicimos nada con ella.
 * `vencido` — pasó su cadencia: hace rato que no la llamamos.
 * `proximo` — está por cumplirse (dentro del último 20% de la cadencia).
 * `aldia` — hicimos algo hace poco.
 */
export type EstadoContacto = 'nunca' | 'vencido' | 'proximo' | 'aldia'

export const CONTACTO_LABEL: Record<EstadoContacto, string> = {
  nunca: 'Nunca',
  vencido: 'Hace rato',
  proximo: 'Se está cumpliendo',
  aldia: 'Al día',
}

/**
 * La fecha que cuenta como "hicimos una acción". Es `acordado_at`, **no** `created_at`: una
 * propuesta que nunca prosperó no es una acción, y contarla haría que un canje descartado tape a la
 * persona durante 90 días.
 *
 * ⚠️ Por eso `acordado_at` se estampa cuando **ella acepta** y no cuando firmamos nosotros. El
 * filtro de estados es el segundo cinturón: los dos "no" (`rechazado` nuestro, `no_acepto` de
 * ella), lo cancelado, y lo que todavía está en el aire.
 */
const NO_SON_ACCION: EstadoCanje[] = ['propuesta', 'enviada', 'rechazado', 'no_acepto', 'cancelado']

export function fechaDeAccion(c: Pick<CanjeRow, 'estado' | 'acordado_at' | 'entregado_at'>): string | null {
  if (NO_SON_ACCION.includes(c.estado)) return null
  return c.acordado_at || c.entregado_at || null
}

/** La última acción con ella, **cruzando las tres marcas**. `null` si nunca hubo ninguna. */
export function ultimaAccion(canjes: Pick<CanjeRow, 'estado' | 'acordado_at' | 'entregado_at'>[]): string | null {
  let max: string | null = null
  for (const c of canjes) {
    const f = fechaDeAccion(c)
    if (f && (!max || f > max)) max = f
  }
  return max
}

/**
 * La última acción **por marca**. Sirve para el chip de la ficha: quien sólo ve Zattia igual tiene
 * que enterarse de que la persona hizo algo para BDI (en modo ciego: marca y fecha, sin plata), o
 * el padrón compartido pierde su razón de ser.
 */
export function ultimaAccionPorMarca(
  canjes: Pick<CanjeRow, 'store' | 'estado' | 'acordado_at' | 'entregado_at'>[],
): Record<CanjeStore, string | null> {
  const out = Object.fromEntries(CANJE_STORES.map((s) => [s, null])) as Record<CanjeStore, string | null>
  for (const c of canjes) {
    const f = fechaDeAccion(c)
    if (!f) continue
    const actual = out[c.store]
    if (!actual || f > actual) out[c.store] = f
  }
  return out
}

/**
 * Cuándo tendría sentido volver a llamarla, según **su** cadencia (default 90 días, ajustable por
 * persona). `null` si nunca hubo una acción: no hay desde dónde contar.
 */
export function proximoContacto(
  persona: Pick<CanjePersona, 'cadencia_dias'>,
  canjes: Pick<CanjeRow, 'estado' | 'acordado_at' | 'entregado_at'>[],
): string | null {
  const ultima = ultimaAccion(canjes)
  if (!ultima) return null
  const dias = persona.cadencia_dias || 90
  return addDiasISO(ultima.slice(0, 10), dias)
}

export type Seguimiento = {
  estado: EstadoContacto
  /** Días desde la última acción. `null` si nunca hubo una. */
  dias: number | null
  ultima: string | null
  /** La fecha en que se cumple la cadencia. `null` si nunca hubo una acción. */
  proximo: string | null
}

/**
 * El estado de contacto de una persona. Molde de `estadoSeguimiento` (`lib/crm/core.ts:109`), pero
 * con la cadencia **de la persona** en vez de umbrales globales: una creadora chica con la que se
 * trabaja cada 30 días y una grande cada 180 no se miden con la misma vara.
 *
 * `proximo` es el último 20% de la cadencia — con 90 días, los últimos 18. Es un aviso, no una
 * alarma: el punto es que aparezca en la lista antes de que se haya pasado.
 */
export function estadoDeContacto(
  persona: Pick<CanjePersona, 'cadencia_dias'>,
  canjes: Pick<CanjeRow, 'estado' | 'acordado_at' | 'entregado_at'>[],
  today: Date,
): Seguimiento {
  const ultima = ultimaAccion(canjes)
  if (!ultima) return { estado: 'nunca', dias: null, ultima: null, proximo: null }

  const cadencia = persona.cadencia_dias || 90
  const dias = diasDesde(ultima, today) ?? 0
  const proximo = addDiasISO(ultima.slice(0, 10), cadencia)

  let estado: EstadoContacto
  if (dias >= cadencia) estado = 'vencido'
  else if (dias >= cadencia * 0.8) estado = 'proximo'
  else estado = 'aldia'

  return { estado, dias, ultima, proximo }
}

/**
 * El orden de la lista de personas: primero las que hace más que no llamamos, después las nuevas,
 * al final las que están al día. Las vetadas van siempre al fondo — no se las esconde (el veto es
 * información) pero no compiten por la atención.
 *
 * Desempate por nombre con `localeCompare(..., 'es')`: sin el locale, la ñ y los acentos ordenan
 * mal.
 */
const PESO: Record<EstadoContacto, number> = { vencido: 0, proximo: 1, nunca: 2, aldia: 3 }

export function ordenarPorContacto<T extends { _seg: Seguimiento; _nombre: string; vetada: boolean }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => {
    if (a.vetada !== b.vetada) return a.vetada ? 1 : -1
    const pa = PESO[a._seg.estado]
    const pb = PESO[b._seg.estado]
    if (pa !== pb) return pa - pb
    // Dentro de "hace rato", primero la que hace MÁS que no llamamos.
    if (a._seg.dias != null && b._seg.dias != null && a._seg.dias !== b._seg.dias) return b._seg.dias - a._seg.dias
    return a._nombre.localeCompare(b._nombre, 'es')
  })
}
