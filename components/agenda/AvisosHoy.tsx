'use client'

/**
 * Los avisos que corren hoy: **lo que hay que saber, no lo que hay que hacer**.
 *
 * "El jueves no hay envíos", "el lunes viene el flete a las 10", "esta semana el local cierra a las
 * 19". Antes de esto, eso se decía por WhatsApp y se perdía, o se cargaba como pendiente y quedaba
 * un cuadradito sin tildar toda la vida — porque un aviso no tiene un momento en que quede hecho.
 *
 * 🔑 **No tiene tilde, no cuenta para el badge y no entra en Cumplimiento**, y las tres cosas son la
 * misma: un número que no se puede bajar se deja de mirar en una semana, y arrastraría con él a los
 * pendientes, que sí se apagan. Por eso tampoco compite con ellos por el lugar: va en su bloque.
 *
 * ⚠️ **Se dibuja solo si hoy hay alguno.** Un "hoy no hay avisos" todos los días entrena a saltear
 * la zona donde el día que sí hay va a aparecer el aviso — el mismo criterio que la banda de la promo.
 */

import { useSesion } from '@/components/SesionProvider'
import { Card, color, font, space, weight } from '@/components/ui'
import { avisosDe, hoyIso } from '@/lib/agenda'
import { useAgenda } from '@/store/useAgenda'

export function AvisosHoy({ fecha }: { fecha?: string }) {
  const { marca } = useSesion()
  const items = useAgenda((s) => s.items)
  const lista = avisosDe(items, fecha ?? hoyIso(), { marca })

  if (lista.length === 0) return null

  return (
    <div style={{ display: 'grid', gap: space[2] }}>
      {lista.map((a) => (
        <Card key={a.id} padding={3}>
          <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-start' }}>
            <span style={{ fontSize: font.lg, lineHeight: 1.2, flex: '0 0 auto' }}>📣</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: font.base, fontWeight: weight.semibold, color: color.ink }}>
                {a.titulo}
              </div>
              {a.cuerpo && (
                <div style={{ fontSize: font.sm, color: color.mut, marginTop: 2 }}>{a.cuerpo}</div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
