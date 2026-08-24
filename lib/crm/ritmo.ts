/**
 * Cada cuánto compra este cliente, y cuándo le tocaría.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Reemplaza a la **cadencia**, que salió del CRM el 24-ago-2026. La cadencia era un campo que
 * había que cargar y mantener a mano, y no lo hacía nadie: de los 771 clientes, 44 la tenían
 * (todas heredadas del sistema viejo, porque ninguna pantalla dejaba ponerla) y **en 0 decidía la
 * fecha**, porque una fecha puesta a mano le gana siempre.
 *
 * Lo pidió Bruno así: *"que sea todo manual, con sugerencias de en cuánto tiempo recontactar"*.
 * La diferencia está en de dónde sale el número: **no de un campo, sino de lo que el cliente ya
 * hace**. Sus compras están todas en el sistema; cada cuánto vuelve es una cuenta, no un dato que
 * alguien tenga que cargar.
 *
 * 🔑 **Y lo útil no es el promedio, es cuánto falta.** Que compre cada 22 días no dice nada solo;
 * lo que sirve es que la última fue hace 20, así que le tocaría en 2. Eso es lo que contesta la
 * pregunta que uno tiene abierta con el chat adelante: *¿cuándo le vuelvo a escribir?*
 *
 * ⚠️ **Sugiere, no decide.** Devuelve un número para poner en un botón; quién elige es el que está
 * hablando. Que el sistema mueva fechas solo es cómo se pierde la confianza en lo que dice la
 * pantalla.
 */

import type { FilaVenta } from './tipos'

/** Mínimo de compras para decir algo. Con dos hay UN intervalo, y un intervalo no es un ritmo. */
export const MIN_COMPRAS = 3

/** Techo de lo que se sugiere. Más allá de esto no es "volver a hablarle", es otra cosa. */
export const TOPE_DIAS = 120

export type Ritmo = {
  /** Cada cuántos días suele comprar (mediana de los intervalos). */
  cadaDias: number
  /** Cuántas compras se usaron para la cuenta. */
  compras: number
  /** Días desde la última compra. */
  desdeUltima: number
  /**
   * En cuántos días le tocaría. `0` = ya le toca (o está pasado).
   *
   * Es `cadaDias - desdeUltima`, con piso en 0: un cliente atrasado no se sugiere "hace 5 días".
   */
  enDias: number
}

/** Los días entre dos fechas ISO (`YYYY-MM-DD`), a mediodía para no pelearse con el horario de verano. */
function diasEntre(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)
}

/**
 * La mediana y no el promedio: **un solo pedido raro corre el promedio y no corre la mediana**.
 * Un cliente que compra cada 15 días y una vez tardó 8 meses tiene promedio 45 y mediana 15; el
 * que describe lo que hace es el 15.
 */
function mediana(xs: number[]): number {
  const o = [...xs].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2)
}

/** `YYYY-MM-DD` de un Date local. */
function iso(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

/**
 * El ritmo de compra del cliente, o `null` si no hay con qué decir nada.
 *
 * Devuelve `null` —y eso es una respuesta, no un error— cuando:
 *  - tiene menos de `MIN_COMPRAS` días con compra,
 *  - o el ritmo que sale es absurdo para "volver a hablarle" (más de `TOPE_DIAS`).
 *
 * ⚠️ **Se cuentan DÍAS con compra, no ventas.** Dos pedidos el mismo día son una sola vez que el
 * cliente compró; contarlos como dos mete un intervalo de 0 días y baja la mediana sin motivo.
 */
export function ritmoDeCompra(ventas: FilaVenta[], today: Date): Ritmo | null {
  const dias = [
    ...new Set(
      (ventas || [])
        .map((v) => String(v.date_sale || '').slice(0, 10))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    ),
  ].sort()
  if (dias.length < MIN_COMPRAS) return null

  const intervalos: number[] = []
  for (let i = 1; i < dias.length; i++) intervalos.push(diasEntre(dias[i - 1], dias[i]))

  const cadaDias = mediana(intervalos)
  if (cadaDias < 1 || cadaDias > TOPE_DIAS) return null

  const desdeUltima = diasEntre(dias[dias.length - 1], iso(today))
  return { cadaDias, compras: dias.length, desdeUltima, enDias: Math.max(0, cadaDias - desdeUltima) }
}

/**
 * Cómo se dice el plazo en un botón. Sin tecnicismos y sin números raros: "en 3 semanas" se lee
 * de un vistazo y "en 21 días" hay que pensarlo.
 */
export function plazoEnPalabras(dias: number): string {
  if (dias <= 0) return 'Ya le toca'
  if (dias === 1) return 'Mañana'
  if (dias < 7) return `En ${dias} días`
  if (dias < 14) return 'En 1 semana'
  if (dias < 21) return 'En 2 semanas'
  if (dias < 28) return 'En 3 semanas'
  const meses = Math.round(dias / 30)
  return meses <= 1 ? 'En 1 mes' : `En ${meses} meses`
}
