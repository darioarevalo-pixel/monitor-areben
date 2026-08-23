import { color } from '@/components/ui'
import type { Temperatura } from '@/lib/crm/tipos'

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
export const TEMP_UI: Record<Temperatura, { txt: string; ayuda: string; fg: string; bg: string; bd: string }> = {
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
}
