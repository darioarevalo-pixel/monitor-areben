'use client'

import { useState } from 'react'
import { Button } from '@/components/ui'
import { color, font, space } from '@/components/ui/tokens'
import { escribirMonto, parsearMonto } from '@/lib/compromisos/core'
import { copiarAlPortapapeles } from '@/lib/portapapeles'

/**
 * El texto que se le pasa al cliente: «El total con el envío incluido es de $45.300.-».
 * Formato pedido por Darío el 30-sep-2026. Los centavos sólo si los hay.
 */
export function mensajeTotal(total: number): string {
  return `El total con el envío incluido es de ${pesos(total)}.-`
}

/** "$45.300", o "$45.300,50" si hay centavos. */
function pesos(n: number): string {
  const conCentavos = Math.round(Math.abs(n) * 100) % 100 !== 0
  return '$' + n.toLocaleString('es-AR', {
    minimumFractionDigits: conCentavos ? 2 : 0,
    maximumFractionDigits: 2,
  })
}

/**
 * Pedido + envío = total, y el mensaje listo para pegar en el chat (pedido por Darío el
 * 30-sep-2026, para no hacer la cuenta aparte con la calculadora).
 *
 * Queda pegada abajo del panel en las tres solapas. 🔑 **Se vacía al cambiar de chat** (la monta
 * `PanelWhatsApp` con `key` = el número): si no, el envío del cliente anterior quedaba cargado y
 * se copiaba un total equivocado con sólo cambiar el pedido.
 */
export function CalculadoraEnvio() {
  const [pedido, setPedido] = useState('')
  const [envio, setEnvio] = useState('')
  const [aviso, setAviso] = useState('')

  const p = parsearMonto(pedido)
  const e = parsearMonto(envio)
  // El envío vacío cuenta como cero, por si es retiro en el local. El pedido no: sin pedido no hay cuenta.
  const total = Number.isFinite(p) ? p + (envio.trim() ? e : 0) : NaN
  const listo = Number.isFinite(total) && total > 0

  const copiar = async () => {
    if (!listo) return
    const ok = await copiarAlPortapapeles(mensajeTotal(total))
    // Sólo se afirma lo que el navegador confirmó (ver `lib/portapapeles.ts`).
    setAviso(ok ? 'Copiado. Pegalo en el chat.' : '')
    if (ok) setTimeout(() => setAviso(''), 2500)
  }

  const casillero = (etiqueta: string, valor: string, cambiar: (v: string) => void) => (
    <label style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: font.xs, fontWeight: 600, color: color.ink2, marginBottom: 2 }}>{etiqueta}</div>
      <input
        className="mo-input"
        value={valor}
        onChange={(ev) => { cambiar(escribirMonto(ev.target.value)); setAviso('') }}
        inputMode="decimal"
        placeholder="$ 0"
        style={{ width: '100%', fontSize: font.sm }}
      />
    </label>
  )

  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        zIndex: 2,
        background: color.bg,
        borderTop: `1px solid ${color.line2}`,
        padding: space[2],
        fontSize: font.sm,
        color: color.ink,
      }}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        {casillero('Pedido', pedido, setPedido)}
        <div style={{ paddingBottom: 7, color: color.mut2, fontWeight: 700 }}>+</div>
        {casillero('Envío', envio, setEnvio)}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: font.xs, color: color.mut2 }}>Total </span>
          <b style={{ fontSize: font.md }}>{listo ? pesos(total) : '—'}</b>
          {aviso && <span style={{ fontSize: font.xs, color: color.successInk, marginLeft: 6 }}>{aviso}</span>}
        </div>
        <Button size="sm" variant="solid" tone="brand" disabled={!listo} onClick={copiar}>
          Copiar mensaje
        </Button>
      </div>
    </div>
  )
}
