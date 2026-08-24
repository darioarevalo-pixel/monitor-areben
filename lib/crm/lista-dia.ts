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

import { diasHasta } from './core'
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
  temperatura: Temperatura
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

function filas(crmSeg: MapaSeguimiento, today: Date): FilaListaDia[] {
  const out: FilaListaDia[] = []
  for (const [k, s] of Object.entries(crmSeg || {})) {
    if (!s || s.descartado) continue
    const id = Number(k)
    if (!Number.isFinite(id)) continue
    const { proximo, dias, estado } = estadoDe(s, today)
    if (!yaVence(estado)) continue
    const notas = Array.isArray(s.notas) ? s.notas : []
    out.push({
      id,
      proximo,
      dias,
      estado,
      temperatura: s.temperatura || TEMPERATURA_DEFAULT,
      nota: notas[0] || null,
    })
  }
  return out
}

/** Caliente primero, después templado. El frío no está: es la otra etapa. */
const ORDEN_TEMP: Record<Temperatura, number> = { caliente: 0, templado: 1, frio: 2 }

/**
 * La primera etapa: tibios y calientes que ya vencen, del más atrasado al menos.
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
        (a.dias ?? 1) - (b.dias ?? 1) ||
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
