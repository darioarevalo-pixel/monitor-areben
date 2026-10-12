'use client'

/**
 * Caja · W6 — los LOTES de gift cards, en la pestaña Caja (sólo admin). 🏁 La gift card es una
 * TARJETA FÍSICA (Bruno, 11-oct): los códigos los genera el monitor, nacen INACTIVOS (sin monto) y el
 * CSV va a la imprenta. La tarjeta vale recién cuando la cajera la vende en el POS (la activa).
 * El código lo arma el SERVIDOR (`lib/caja/gift.core.js`): acá ⛔ se genera nada.
 */

import { useEffect, useState } from 'react'
import { csvLoteGift, generarLoteGift, leerLotesGift, type LoteGift } from '@/lib/caja/cliente'
import { Button, Field, Input, Notice, Plegable, color, font, space } from '@/components/ui'

const fecha = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function bajar(nombre: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

export function GiftCards() {
  const [abierto, setAbierto] = useState(false)
  const [lotes, setLotes] = useState<LoteGift[] | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [nota, setNota] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto || lotes) return
    leerLotesGift().then((r) => setLotes(r.lotes), (e: Error) => setError(e.message))
  }, [abierto, lotes])

  async function descargar(id: number) {
    setOcupado(`csv${id}`)
    setError(null)
    try {
      const r = await csvLoteGift(id)
      bajar(r.nombre, r.csv)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  async function generar() {
    const n = Number(cantidad)
    if (!Number.isInteger(n) || n < 1) return setError('Poné cuántas tarjetas.')
    setOcupado('generar')
    setError(null)
    try {
      const r = await generarLoteGift(n, nota)
      setLotes([r.lote, ...(lotes ?? [])])
      setCantidad('')
      setNota('')
      await descargar(r.lote.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  return (
    <Plegable
      variante="tarjeta"
      abierto={abierto}
      onToggle={() => setAbierto(!abierto)}
      titulo="Gift cards"
      ayuda="Generá los códigos de las tarjetas y bajá el CSV para la imprenta. Las tarjetas nacen sin saldo: valen recién cuando se venden en el POS."
    >
      <div style={{ display: 'grid', gap: space[3], maxWidth: 560 }}>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'end', flexWrap: 'wrap' }}>
          <Field label="Cantidad">
            <Input inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ''))} placeholder="500" style={{ width: 110 }} autoComplete="off" />
          </Field>
          <Field label="Nota (opcional)">
            <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Imprenta, diseño" maxLength={200} style={{ width: 240 }} autoComplete="off" />
          </Field>
          <Button size="sm" loading={ocupado === 'generar'} disabled={!cantidad || ocupado != null} onClick={generar}>
            Generar lote
          </Button>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        {lotes && lotes.length === 0 && <span style={{ fontSize: font.sm, color: color.mut }}>Todavía no hay lotes.</span>}
        {lotes && lotes.length > 0 && (
          <div style={{ display: 'grid', gap: space[1] }}>
            {lotes.map((l) => (
              <div key={l.id} style={{ display: 'flex', gap: space[2], alignItems: 'center', fontSize: font.sm, flexWrap: 'wrap' }}>
                <span>
                  <b>Lote {l.id}</b> · {l.cantidad} tarjetas · {fecha(l.creado_en)}
                  {l.creado_por ? ` · ${l.creado_por}` : ''}
                  {l.nota ? ` · ${l.nota}` : ''}
                </span>
                <Button size="sm" variant="ghost" loading={ocupado === `csv${l.id}`} disabled={ocupado != null} onClick={() => descargar(l.id)}>
                  Descargar CSV
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Plegable>
  )
}
