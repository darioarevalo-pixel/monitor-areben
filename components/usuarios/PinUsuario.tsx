'use client'

import { Button, color, Field, font, space } from '@/components/ui'

/**
 * El PIN de encargada de una persona: el que autoriza vender lo que el libro dice 0. Se guarda al instante (⛔ espera el
 * «Guardar cambios» de la lista: es del ERP, no del KV de usuarios).
 * 🔑 Bruno 23-nov: «arreglalo, que no se vean» (revoca el 26-oct). El servidor guarda sólo el hash y ⛔ devuelve el PIN: acá se
 * sabe SI tiene, ⛔ cuál. El número se ve UNA vez, recién puesto (`nuevo`), para pasárselo a la persona; al recargar, ya no.
 */
export function PinUsuario({ tiene, nuevo, cargando, onAlAzar, onSacar }: {
  /** `undefined` = todavía no se leyó. */
  tiene: boolean | undefined
  /** El PIN que se acaba de poner en esta pantalla (sólo vive en memoria). */
  nuevo?: string | null
  cargando: boolean
  onAlAzar: () => void
  onSacar: () => void
}) {
  return (
    <Field label="PIN de encargada">
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', minHeight: 34 }}>
        <span style={{ fontFamily: 'monospace', fontSize: font.md, letterSpacing: 3, minWidth: 48 }} data-testid="pin-valor">
          {tiene === undefined ? '…' : !tiene ? <span style={{ color: color.mut2, letterSpacing: 0, fontFamily: 'inherit' }}>sin PIN</span> : nuevo ? nuevo : '••••'}
        </span>
        {tiene && nuevo && <span style={{ fontSize: font.sm, color: color.warningInk }}>No se vuelve a ver.</span>}
        <Button size="sm" variant="outline" onClick={onAlAzar} loading={cargando} disabled={tiene === undefined}>
          {tiene ? 'Cambiar al azar' : 'Poner al azar'}
        </Button>
        {tiene && <Button size="sm" variant="ghost" tone="danger" onClick={onSacar} disabled={cargando}>Sacar</Button>}
      </div>
    </Field>
  )
}
