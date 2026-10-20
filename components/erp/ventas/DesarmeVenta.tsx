'use client'

/**
 * El DESARME de una venta anulada con el paquete armado (o ya salido): se escanea cada prenda contra las de la venta y,
 * con todas contadas, «Confirmar que volvieron» llama a `confirmarVuelta` (contrato-venta.md §17, 37a). Recién ahí el
 * libro suma las prendas. La regla del escaneo vive en `lib/erp/desarme.core.js`.
 * Sin lector (una etiqueta que no lee), «+1» al lado de la prenda cuenta a mano.
 */

import { useMemo, useState } from 'react'
import { Button, Notice, color, font, space, weight } from '@/components/ui'
import { confirmarVuelta, type FichaDeVenta, type MarcaErp } from '@/lib/erp/cliente'
import { escanear, faltanEscanear, prendasADesarmar } from '@/lib/erp/desarme.core.js'

const AVISO = { no_es: 'Esa prenda no es de esta venta.', de_mas: 'Esa prenda ya está contada entera.' } as const

export function DesarmeVenta({ marca, ficha, refVenta, onListo }: {
  marca: MarcaErp
  ficha: FichaDeVenta
  refVenta: string
  onListo: (aviso: string) => void
}) {
  const prendas = useMemo(() => prendasADesarmar(ficha.lineas), [ficha.lineas])
  const [contados, setContados] = useState<Record<string, number>>({})
  const [codigo, setCodigo] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const faltan = faltanEscanear(prendas, contados)
  const recibir = ficha.anulacion?.vuelta === 'a_recibir'

  function leer(e: React.FormEvent) {
    e.preventDefault()
    const r = escanear(prendas, contados, codigo)
    setContados(r.contados)
    setAviso(r.resultado === 'ok' ? null : AVISO[r.resultado as keyof typeof AVISO])
    setCodigo('')
  }

  async function confirmar() {
    setTrabajando(true)
    try {
      const r = await confirmarVuelta(marca, ficha.venta.id)
      onListo(`Venta ${refVenta}: ${r.movimientos ? `volvieron ${faltanEscanear(prendas, {})} prendas al stock` : 'quedó confirmado el desarme'}.`)
    } catch (x) {
      setError(x instanceof Error ? x.message : 'No se pudo confirmar el desarme.')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: space[3], padding: '14px 16px', borderRadius: 12, border: '1px solid var(--mo-warning-border)', background: 'var(--mo-warning-bg)' }}>
      <div>
        <h3 style={{ margin: 0, fontSize: font.lg, fontWeight: weight.bold }}>{recibir ? 'Recibir las prendas' : 'Desarmar el paquete'}</h3>
        <span style={{ fontSize: font.sm, color: color.ink2 }}>
          {recibir ? 'El pedido ya había salido. Cuando lleguen, escaneá' : 'Abrí el paquete y escaneá'} cada prenda: vuelven al stock recién al confirmar.
        </span>
      </div>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      <form onSubmit={leer} style={{ display: 'flex', gap: space[2] }}>
        <input
          className="mo-input" style={{ flex: 1, minWidth: 0 }} autoFocus value={codigo} onChange={(e) => setCodigo(e.target.value)}
          placeholder="Escaneá o escribí el código" aria-label="Código de la prenda"
        />
        <Button type="submit" variant="outline" disabled={!codigo.trim()}>Contar</Button>
      </form>
      {aviso && <Notice tone="warning" onClose={() => setAviso(null)}>{aviso}</Notice>}
      <div>
        {ficha.lineas.filter((l) => prendas.some((p) => p.id === l.id)).map((l) => {
          const p = prendas.find((x) => x.id === l.id)!
          const n = contados[l.id] || 0
          const listo = n >= p.cantidad
          return (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[3], padding: '8px 0', borderBottom: `1px solid var(--mo-warning-border)` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: weight.semibold }}>{l.nombre ?? `Producto ${l.producto}`}</div>
                <div style={{ fontSize: font.sm, color: color.mut }}>Talle {l.talleNombre ?? l.talle}{l.sku ? ` · ${l.sku}` : ''}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flex: '0 0 auto' }}>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: weight.bold, color: listo ? 'var(--mo-success-ink)' : color.ink }}>{n} de {p.cantidad}</span>
                <Button size="sm" variant="ghost" disabled={listo} onClick={() => setContados({ ...contados, [l.id]: n + 1 })}>+1</Button>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <span style={{ fontSize: font.sm, color: color.ink2 }}>{faltan ? `Faltan ${faltan} ${faltan === 1 ? 'prenda' : 'prendas'}` : 'Están todas'}</span>
        <Button disabled={trabajando || faltan > 0} onClick={() => void confirmar()}>Confirmar que volvieron</Button>
      </div>
    </section>
  )
}
