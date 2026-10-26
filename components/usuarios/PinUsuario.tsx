'use client'

import { useState } from 'react'
import { Button, color, Field, font, space } from '@/components/ui'

/**
 * El PIN de encargada de una persona (Bruno 26-oct: «al lado del usuario», oculto pero se puede ver, sin cifrar). Es el que autoriza
 * vender lo que el libro dice 0. Se guarda al instante (⛔ espera el «Guardar cambios» de la lista: es del ERP, no del KV de usuarios).
 */
export function PinUsuario({ pin, cargando, onAlAzar, onSacar }: {
  /** `undefined` = todavía no se leyó; `null` = no tiene. */
  pin: string | null | undefined
  cargando: boolean
  onAlAzar: () => void
  onSacar: () => void
}) {
  const [visible, setVisible] = useState(false)
  return (
    <Field label="PIN de encargada">
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', minHeight: 34 }}>
        <span style={{ fontFamily: 'monospace', fontSize: font.md, letterSpacing: 3, minWidth: 48 }} data-testid="pin-valor">
          {pin === undefined ? '…' : pin === null ? <span style={{ color: color.mut2, letterSpacing: 0, fontFamily: 'inherit' }}>sin PIN</span> : visible ? pin : '••••'}
        </span>
        {pin && (
          <Button size="sm" variant="ghost" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Ocultar el PIN' : 'Ver el PIN'}>
            {visible ? 'Ocultar' : 'Ver'}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onAlAzar} loading={cargando} disabled={pin === undefined}>
          {pin ? 'Cambiar al azar' : 'Poner al azar'}
        </Button>
        {pin && <Button size="sm" variant="ghost" tone="danger" onClick={onSacar} disabled={cargando}>Sacar</Button>}
      </div>
    </Field>
  )
}
