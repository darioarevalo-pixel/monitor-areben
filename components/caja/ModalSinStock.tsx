'use client'

import { useEffect, useState } from 'react'
import { Button, Field, Input, Modal, Notice, Select, color, space } from '@/components/ui'
import type { PrendaSinStock } from '@/lib/caja/cliente'
import { leerEncargadas, type MarcaErp } from '@/lib/erp/cliente'
import { storeCaja } from '@/lib/caja/marca'

/**
 * «Autoriza la encargada» al vender lo que el ERP da sin stock (`lib/caja/pin-venta.core.js`): la prenda está en la mano, así que
 * la venta sale con su PIN y queda para contar. Si no, «Volver» y se saca la prenda del pedido.
 */
export function ModalSinStock({ faltan, error, enviando, onCerrar, onAutorizar }: {
  faltan: PrendaSinStock[]
  error: string | null
  enviando: boolean
  onCerrar: () => void
  onAutorizar: (encargada: { persona: string; pin: string }) => void
}) {
  const [personas, setPersonas] = useState<{ usuario: string; nombre: string }[] | null>(null)
  const [persona, setPersona] = useState('')
  const [pin, setPin] = useState('')
  useEffect(() => {
    let vivo = true
    leerEncargadas(storeCaja() as MarcaErp).then((r) => vivo && setPersonas(r.encargadas ?? [])).catch(() => vivo && setPersonas([]))
    return () => { vivo = false }
  }, [])
  const falta = !persona.trim() || pin.length !== 4
  const autorizar = () => { if (!falta && !enviando) onAutorizar({ persona: persona.trim(), pin }) }
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Autoriza la encargada" cerrarConFondo={false}
      pie={
        <>
          <Button variant="outline" onClick={onCerrar}>Volver</Button>
          <Button variant="solid" tone="brand" disabled={falta} loading={enviando} onClick={autorizar}>Autorizar y cobrar</Button>
        </>
      }>
      <form onSubmit={(ev) => { ev.preventDefault(); autorizar() }} style={{ display: 'grid', gap: space[3] }}>
        <div style={{ color: color.mut }}>
          El sistema dice que no hay stock de:
          <ul style={{ margin: `${space[1]}px 0 0`, paddingLeft: space[4] }}>
            {faltan.map((f) => (
              <li key={`${f.product_id}:${f.size_id}`}>{f.nombre || 'Prenda'}{f.talle ? ` · ${f.talle}` : ''} (hay {Math.max(0, f.hay)}, se lleva {f.pide})</li>
            ))}
          </ul>
          Si la prenda está acá, la encargada autoriza y queda para contar.
        </div>
        <Field label="Encargada">
          {personas && personas.length > 0
            ? <Select value={persona} onChange={(ev) => setPersona(ev.target.value)}><option value="">Elegir…</option>{personas.map((p) => <option key={p.usuario} value={p.usuario}>{p.nombre}</option>)}</Select>
            : <Input value={persona} onChange={(ev) => setPersona(ev.target.value)} placeholder="Su usuario del monitor" autoComplete="off" />}
        </Field>
        <Field label="PIN de 4 dígitos">
          <Input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(ev) => setPin(ev.target.value.replace(/\D/g, ''))} autoComplete="off" />
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
      </form>
    </Modal>
  )
}
