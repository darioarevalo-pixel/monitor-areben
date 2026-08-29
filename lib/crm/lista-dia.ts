/**
 * La lista del día del panel de WhatsApp: a quién hay que contactar, sin bajar el CRM.
 *
 * POR QUÉ NO SE REUSA `filtrarOrdenar`
 * ------------------------------------
 * El de la sección trabaja sobre `ClienteCRM`, que es el agregado de las **27.990 ventas**: la
 * pantalla las baja una vez y arma la tabla. El panel se rearma en cada cambio de chat y vive
 * adentro de WhatsApp — bajar eso ahí es inviable, y es la misma razón por la que existe la
 * consulta puntual `action:'panel'`.
 *
 * 🔑 **Todo lo que decide QUIÉN entra en la lista vive en el KV, no en las ventas**: la fecha del
 * próximo contacto, la cadencia, la temperatura, el descarte y las notas. Son 771 entradas y
 * pesan nada. Lo único que falta —el nombre y el teléfono— se pide después, y sólo de los que
 * quedaron: ~35 ids en vez de 12.485 clientes.
 *
 * ⚠️ **UNA divergencia conocida con la sección, y está acá a propósito.** Allá, entre dos
 * calientes, el que más compró baja un escalón (`prioridadContacto`: la cuenta clave tarda más en
 * cerrar que la caja rápida). Eso necesita el total comprado de cada uno, o sea las ventas. Acá
 * los calientes salen mezclados entre sí, por fecha. El resto del orden es el mismo. Para los
 * FRÍOS sí se respeta el criterio de la sección —primero el que más compró— porque son pocos y
 * sus totales se piden al servidor junto con los nombres.
 */

import { diasHasta, urgenciaFecha } from './core'
import type { EstadoSeg, MapaSeguimiento, Nota, Temperatura } from './tipos'
import { TEMPERATURA_DEFAULT } from './core'

/** Cuántos entran en la lista del panel. Ver `TANDA_FRIOS` para la segunda etapa. */
export const TOPE_LISTA = 25

export type FilaListaDia = {
  id: number
  /** `YYYY-MM-DD`. Siempre hay fecha: sin fecha el cliente no entra en la lista. */
  proximo: string | null
  /** Días hasta el próximo contacto: negativo = atrasado. null cuando no hay fecha. */
  dias: number | null
  estado: EstadoSeg
  /** La temperatura EFECTIVA: la marcada, o `templado` si no hay marca. Es la que ordena. */
  temperatura: Temperatura
  /**
   * Si la temperatura la puso alguien a mano.
   *
   * 🔑 **`templado` y "nunca lo marcaste" eran indistinguibles, y son 4 contra 340.** El campo
   * `temperatura` del KV es opcional (nació en ago-2026, aditivo), así que la diferencia SÍ está
   * guardada — se perdía recién acá, al leer con `|| TEMPERATURA_DEFAULT`. Medido el 29-ago-2026:
   * 8 calientes, 4 templados, 378 fríos y **340 sin marca**. Un filtro "🟡 templados" que
   * devolviera 344 sería el más grande y el más inútil de los cinco.
   *
   * ⚠️ **Separa la ETIQUETA, no a quién hay que llamar.** Los sin marcar siguen entrando en la
   * lista del día como templados —`temperatura` arriba sigue cayendo al default— porque cambiar
   * eso movería media lista de trabajo de un día para el otro, que no es lo que se pidió.
   */
  marcada: boolean
  /** La última nota, que es lo que se lee antes de decidir si se le entra ahora. */
  nota: Nota | null
}

/**
 * El estado de seguimiento de una entrada del KV. Es `estadoSeguimiento` de core.ts, pero
 * partiendo del mapa crudo en vez del `ClienteCRM` agregado.
 *
 * ⚠️ Se calcula igual **a propósito**: si esto se desviara, el panel diría que un cliente está
 * vencido y la sección que está al día, sobre el mismo dato. La regla es una sola: **la fecha que
 * se puso a mano** (la cadencia salió el 24-ago-2026; el porqué está en `estadoSeguimiento`).
 */
function estadoDe(s: MapaSeguimiento[string], today: Date): { proximo: string | null; dias: number | null; estado: EstadoSeg } {
  const proximo: string | null = s.proximo_manual || null
  if (!proximo) return { proximo: null, dias: null, estado: 'none' }
  // `proximo` ya se sabe no vacío: `diasHasta` sólo devuelve null cuando no hay fecha.
  const dias = diasHasta(proximo, today) as number
  if (dias <= 0) return { proximo, dias, estado: 'vencido' }
  if (dias <= 7) return { proximo, dias, estado: 'semana' }
  return { proximo, dias, estado: 'aldia' }
}

/**
 * Los que ya vencen: `vencido`, que incluye los de HOY (`dias === 0`). Los de "esta semana"
 * quedan afuera: en una columna angosta, al costado del chat, lo que sirve es lo que hay que
 * hacer ahora.
 *
 * ⚠️ `pendiente` sigue contando por si alguna entrada vieja lo trae, pero desde que salió la
 * cadencia **no se produce más**: sin fecha, el cliente es `none` y no está en la lista.
 */
const yaVence = (e: EstadoSeg) => e === 'vencido' || e === 'pendiente'

/**
 * Las filas del KV. `soloVencidos` es la diferencia entre las dos cosas que hace esta pantalla:
 * la **lista de trabajo** (lo que vence hoy, que es el default del panel) y la **búsqueda por
 * tipo** (todos los 🔥, vengan cuando vengan), que es lo que pidió Darío el 29-ago-2026:
 * *"poder ir a buscar a quien quiera desde el panel"*.
 */
function filas(crmSeg: MapaSeguimiento, today: Date, soloVencidos = true): FilaListaDia[] {
  const out: FilaListaDia[] = []
  for (const [k, s] of Object.entries(crmSeg || {})) {
    if (!s || s.descartado) continue
    const id = Number(k)
    if (!Number.isFinite(id)) continue
    const { proximo, dias, estado } = estadoDe(s, today)
    if (soloVencidos && !yaVence(estado)) continue
    const notas = Array.isArray(s.notas) ? s.notas : []
    out.push({
      id,
      proximo,
      dias,
      estado,
      temperatura: s.temperatura || TEMPERATURA_DEFAULT,
      marcada: !!s.temperatura,
      nota: notas[0] || null,
    })
  }
  return out
}

/** Caliente primero, después templado. El frío no está: es la otra etapa. */
const ORDEN_TEMP: Record<Temperatura, number> = { caliente: 0, templado: 1, frio: 2 }

/**
 * La primera etapa: tibios y calientes que ya vencen, **empezando por los de hoy**.
 *
 * 🔴 **El orden por fecha va al revés de lo que parece.** Primero los agendados para hoy, después
 * los de ayer, y los colgados de hace dos semanas al final — es `urgenciaFecha`, y ahí está
 * medido por qué. En una lista de 25 sobre 226, ordenar por "el que más esperó" hace que la fecha
 * que se le promete a un cliente al agendarlo **no se cumpla nunca**.
 *
 * El `pendiente` —que ya no se produce, ver `yaVence`— va al final de su temperatura: no tiene
 * fecha contra la cual medir el atraso, y quien sí la tiene es más urgente.
 */
export function listaDelDia(crmSeg: MapaSeguimiento, today: Date, tope: number = TOPE_LISTA): FilaListaDia[] {
  return filas(crmSeg, today)
    .filter((f) => f.temperatura !== 'frio')
    .sort(
      (a, b) =>
        ORDEN_TEMP[a.temperatura] - ORDEN_TEMP[b.temperatura] ||
        urgenciaFecha(a.dias) - urgenciaFecha(b.dias) ||
        a.id - b.id,
    )
    .slice(0, tope)
}

/**
 * La segunda etapa: los fríos que ya vencen. **Sin cortar y sin ordenar por fecha**: el orden que
 * manda acá es el de la sección —primero el que más compró—, y ese dato no está en el KV. Los
 * devuelve todos para que el llamador los ordene por total y recién ahí corte a `TANDA_FRIOS`.
 */
export function friosDelDia(crmSeg: MapaSeguimiento, today: Date): FilaListaDia[] {
  return filas(crmSeg, today).filter((f) => f.temperatura === 'frio')
}

// ── Los filtros por tipo del panel (29-ago-2026) ─────────────────────────────

/**
 * Los cinco botones del panel. Es `Temperatura` más el que faltaba: **"sin marcar"**.
 *
 * 🔑 **No es un valor nuevo del KV, es uno que ya existía y no se veía.** `temperatura` es
 * opcional; la ausencia significa "nadie lo clasificó" y se estaba leyendo como `templado`. Acá
 * se la nombra para poder filtrarla, pero **nada se escribe con este valor**: marcar un cliente
 * sigue guardando `caliente`/`templado`/`frio`, y "sin marcar" es la falta de esos tres.
 */
export type VistaTemp = Temperatura | 'sin_marcar'

/** El tipo con el que se muestra la fila, ya separando lo que no tiene marca. */
export const vistaDe = (f: Pick<FilaListaDia, 'temperatura' | 'marcada'>): VistaTemp =>
  f.marcada ? f.temperatura : 'sin_marcar'

/** Qué muestra el panel: la lista de trabajo, un tipo, o todo el CRM que se tocó alguna vez. */
export type FiltroPanel = 'trabajo' | VistaTemp | 'todos'

/**
 * En qué escalón de urgencia cae una fila. **Vencido primero, sin agendar último.**
 *
 * Es el mismo criterio de la sección (`FILTROS_POR_DIA`), traído acá porque los filtros por tipo
 * muestran gente que NO vence —ése es todo el punto— y sin un escalón previo el `urgenciaFecha`
 * mezclaría "vence en 3 días" con "venció hace 3".
 */
export function grupoUrgencia(e: EstadoSeg): number {
  if (e === 'vencido' || e === 'pendiente') return 0
  if (e === 'semana') return 1
  if (e === 'aldia') return 2
  return 3 // `none`: sin fecha, no hay nada que esperar
}

/**
 * Los clientes de un tipo, **vengan cuando vengan**: la búsqueda por botón del panel.
 *
 * 🔴 **Al revés que `listaDelDia`, acá NO se corta por vencimiento y no se corta por tope.** Es a
 * propósito y es lo que se pidió: *"la temperatura describe al cliente, no la cola de trabajo"*.
 * Si el botón 🔥 mostrara sólo lo vencido, de 8 calientes te devolvería 2 y el panel te seguiría
 * escondiendo justo a la persona que fuiste a buscar. El corte de a 25 lo hace la pantalla, con
 * un "ver más" — que es un corte que se ve.
 *
 * ⚠️ **`todos` son los del KV, no los 12.485 del padrón.** Un cliente que nunca se tocó no tiene
 * entrada acá y no puede aparecer: para ése está el buscador, que pregunta al servidor.
 *
 * Los 🧊 salen igual que en la sección —primero el que más compró—, pero ese dato no está en el
 * KV: el orden final se lo da `traerPorFiltro` cuando llegan los totales. Acá salen por fecha.
 */
export function porTemperatura(crmSeg: MapaSeguimiento, today: Date, filtro: VistaTemp | 'todos'): FilaListaDia[] {
  return filas(crmSeg, today, false)
    .filter((f) => filtro === 'todos' || vistaDe(f) === filtro)
    .sort(
      (a, b) =>
        grupoUrgencia(a.estado) - grupoUrgencia(b.estado) ||
        urgenciaFecha(a.dias) - urgenciaFecha(b.dias) ||
        a.id - b.id,
    )
}

/** Cuántos hay de cada tipo, para los números de los botones. Sale del KV: no pide nada. */
export function contarPorTipo(crmSeg: MapaSeguimiento, today: Date): Record<VistaTemp | 'todos', number> {
  const out: Record<VistaTemp | 'todos', number> = { caliente: 0, templado: 0, sin_marcar: 0, frio: 0, todos: 0 }
  for (const f of filas(crmSeg, today, false)) {
    out[vistaDe(f)]++
    out.todos++
  }
  return out
}
