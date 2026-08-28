'use client'

/**
 * El chip de «clavado» en la fila del producto: lo que hace que la lista exista.
 *
 * 🔴 **El chip lo ve cualquiera que vea Productos; marcarlo es de admin.** Si el estado sólo lo
 * viera Bruno, dos personas mirando el mismo producto verían dos cosas distintas — y la que no lo
 * ve le bajaría el precio de nuevo.
 *
 * ⚠️ **Sacarlo NO lo borra.** Lo que ya recuperó sigue contando en la foto de las semanas en que
 * facturó; el memo lo lee por rango de fechas y no por estado. Por eso el rótulo dice «Sacar de la
 * lista» y no «Borrar»: son dos cosas distintas y confundirlas pierde el recupero de un producto
 * que sí trabajó.
 */

import { useState } from 'react'
import { Badge, color, font, space, useToast } from '@/components/ui'
import type { Clavados } from './useClavados'

export function MarcaClavado({
  p,
  clavados,
}: {
  p: { id: number | string; name?: string; sku?: string | null }
  clavados: Clavados
}) {
  const toast = useToast()
  const [yendo, setYendo] = useState(false)
  const pid = String(p.id)
  const marcado = clavados.porProducto.get(pid)

  if (!marcado && !clavados.puedeEscribir) return null

  const accion = async () => {
    setYendo(true)
    try {
      if (marcado) {
        await clavados.sacar(marcado.id)
        toast.ok('Sacado de la lista de clavados. Lo que ya recuperó sigue contando en el memo.')
      } else {
        await clavados.marcar({ id: Number(p.id), name: p.name, sku: p.sku })
        toast.ok('Marcado como clavado. El memo va a medir cuánta plata vuelve.')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setYendo(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[1], marginTop: 2 }}>
      {marcado && <Badge tone="warning">Clavado</Badge>}
      {clavados.puedeEscribir && (
        <button
          type="button"
          disabled={yendo}
          onClick={(e) => {
            // La fila entera abre el detalle de variantes al hacer clic: sin esto, marcar un
            // clavado desplegaría el acordeón al mismo tiempo.
            e.stopPropagation()
            void accion()
          }}
          style={{
            border: 'none', background: 'none', padding: 0, cursor: yendo ? 'wait' : 'pointer',
            fontSize: font.xs, color: color.mut2, textDecoration: 'underline',
          }}
          title={
            marcado
              ? 'Sale de la lista activa. NO se elimina: lo que ya recuperó sigue contando en el memo de las semanas en que facturó.'
              : 'Marcar como clavado: ya se le bajó el precio y lo que se mide de acá en adelante es cuánta plata vuelve.'
          }
        >
          {marcado ? 'Sacar de la lista' : 'Marcar clavado'}
        </button>
      )}
    </div>
  )
}
