'use client'
/**
 * El PUESTO de este equipo (29-oct): con el depósito Evento PRENDIDO en el ERP, la franja deja usar este equipo como la caja
 * del EVENTO (su caja, su plata, Stunned que descuenta del Evento; `lib/caja/puesto.core.js`). Va en la pestaña Caja —donde
 * se abre y se cierra la caja— y en el POS. Cambiar de puesto recarga: la caja abierta y el stock son otros.
 */
import { Button, color, space, weight } from '@/components/ui'
import { elegirPuesto, puestoCaja, type Config } from '@/lib/caja/cliente'

export function FranjaPuesto({ config }: { config: Config | null }) {
  const evento = puestoCaja() === 'evento'
  if (!config?.evento_activo && !evento) return null
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap', padding: `${space[2]}px ${space[4]}px`,
      background: evento ? 'var(--mo-warning-solid)' : color.warningBg, color: evento ? '#fff' : color.warningInk,
      border: `1px solid ${color.warningBorder}`, borderRadius: 10, fontWeight: weight.semibold }}>
      <span>{evento ? 'CAJA DEL EVENTO · sólo Stunned, descuenta del depósito Evento' : 'Caja del local · hay un evento activo'}</span>
      <Button size="sm" variant="outline" onClick={() => { elegirPuesto(evento ? 'local' : 'evento'); window.location.reload() }}>
        {evento ? 'Pasar a la caja del local' : 'Usar este equipo como caja del evento'}
      </Button>
    </div>
  )
}
