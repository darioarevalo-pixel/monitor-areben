import { color } from '@/components/ui'
import type { VistaTemp } from '@/lib/crm/lista-dia'

/**
 * El badge de temperatura, compartido por la tabla del CRM y el panel de WhatsApp.
 *
 * ⚠️ **Vive en su propio archivo justamente para que haya UNO.** Nació adentro de `CRM.tsx` y el
 * panel lo necesita idéntico: el mismo cliente tiene que verse igual en la tabla y al costado del
 * chat. Copiarlo era garantizar que un día un 🔥 fuera ámbar de un lado y rojo del otro.
 *
 * Los textos son los que se ven en pantalla: sin tecnicismos y sin explicar el mecanismo — el usuario marca "cómo viene" la relación, no configura un
 * criterio de ordenamiento.
 */
export const TEMP_UI: Record<VistaTemp, { txt: string; ayuda: string; fg: string; bg: string; bd: string }> = {
  caliente: {
    txt: '🔥 Caliente',
    ayuda: 'Viene comprando o quedaron en hablar. Va primero en la lista del día.',
    fg: color.dangerInk,
    bg: color.dangerBg,
    bd: color.dangerBorder,
  },
  templado: {
    txt: '🟡 Templado',
    ayuda: 'Ni frío ni caliente. Tocá para marcarlo frío.',
    fg: color.warningInk,
    bg: color.warningBg,
    bd: color.warningBorder,
  },
  frio: {
    txt: '🧊 Frío',
    ayuda: 'No contesta o dejó de comprar. Se va al fondo de la lista del día.',
    fg: color.mut,
    bg: 'transparent',
    bd: color.line2,
  },
  /**
   * 🔑 **No se guarda nunca: es la falta de las otras tres.** Existía desde siempre —de 730
   * clientes, 340 no tienen marca (29-ago-2026)— pero se leía como 🟡, así que "templado" quería
   * decir dos cosas y una era 85 veces más grande que la otra.
   *
   * ⚠️ **Sigue trabajando como templado.** Aparece en la lista del día en el mismo lugar de
   * antes; lo único que cambia es que ahora dice que nadie lo miró, y tiene su propio botón.
   */
  sin_marcar: {
    txt: '⚪ Sin marcar',
    ayuda: 'Todavía no dijiste cómo viene. Trabaja como templado. Tocá para marcarlo.',
    fg: color.mut2,
    bg: 'transparent',
    bd: color.line2,
  },
}

/** La etiqueta que le toca a un cliente, ya separando el que nadie marcó. */
export const vistaTemp = (c: { temperatura: VistaTemp; temperatura_marcada?: boolean }): VistaTemp =>
  c.temperatura_marcada === false ? 'sin_marcar' : c.temperatura
