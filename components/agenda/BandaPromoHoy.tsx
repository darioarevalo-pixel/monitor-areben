'use client'

/**
 * La promo bancaria de hoy, arriba de la pantalla en la que ya está la persona.
 *
 * 🔑 **La promo tiene que estar donde ya está la persona.** Quien cobra abre Cupones para aplicar un
 * descuento; obligarla a acordarse de que existe otra sección, y a abrirla, es garantizar que el
 * día que llegue el cliente del Banco Nación nadie se acuerde. Por eso esto vive acá y no en un link.
 *
 * 🔑 **El canal no es un detalle: una promo del posnet no vale en la web, y al revés.** Quien
 * contesta Instagram y quien cobra en el mostrador ven la misma banda pero no las mismas promos, y
 * por eso el canal es un parámetro y no un default escondido — prometerle a un cliente por DM un
 * descuento que sólo corre en el local es exactamente el error que esto tiene que no cometer.
 *
 * No cuesta un fetch: el store de la agenda ya lo llenó el shell, igual que las novedades. Y **no se
 * dibuja nada si hoy no hay promo** — un cartel que dice "hoy no hay" todos los días entrena a
 * saltear la zona donde el día que sí hay va a aparecer el aviso.
 */

import { useSesion } from '@/components/SesionProvider'
import { space } from '@/components/ui'
import { hoyIso, promosDe, type Canal } from '@/lib/agenda'
import { useAgenda } from '@/store/useAgenda'
import { TarjetaPromo } from './TarjetaPromo'
import { TarjetaPromoProducto } from './TarjetaPromoProducto'

export function BandaPromoHoy({ canal = 'mostrador' }: { canal?: Canal }) {
  const { marca } = useSesion()
  const promos = useAgenda((s) => s.promos)
  const deProducto = useAgenda((s) => s.promosProducto)
  const hoy = hoyIso()
  const deHoy = promosDe(promos, hoy, { canal, marca })
  // 🔑 Las de PRODUCTO (Bruno, 23-nov-2026) van en la misma banda, con la misma regla de canal: una
  // promo de la tienda online ⛔ vale en el local, y al revés. La vigencia la decide el navegador.
  const productoHoy = deProducto.filter((p) => p.marca === marca && p.canal === canal && (!p.desde || p.desde <= hoy) && (!p.hasta || p.hasta >= hoy))

  if (deHoy.length === 0 && productoHoy.length === 0) return null

  return (
    <div style={{ display: 'grid', gap: space[2], marginBottom: space[4] }}>
      {deHoy.map((p) => <TarjetaPromo key={p.id} promo={p} compacta />)}
      {productoHoy.map((p) => <TarjetaPromoProducto key={p.id} promo={p} />)}
    </div>
  )
}
