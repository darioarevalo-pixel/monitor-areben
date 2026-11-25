'use client'

/**
 * 🚚 **Redespacho por falla** — a la clienta le llegó algo con falla y se le manda otra unidad desde el depósito.
 *
 * Bruno 24-nov: «el movimiento más corto posible, y luego vemos cómo vamos ganando terreno, porque si tiene muchos
 * pasos, no lo saben usar». Lo aprietan Local y Depósito (Bruno 24-nov): vive en «Fallas del local» y en «Fallas de
 * depósito». Un toque hace todo en el servidor (`action: 'redespacho'` de `api/_reclamos.js`): el reclamo ya resuelto
 * como «otra unidad», la baja del depósito en Areben Gestión y, con eso, la orden de reemplazo que lee Logística.
 *
 * ⛔ Queda afuera, a propósito: lo que vuelve de la clienta, el motivo detallado y la decisión de Administración.
 * El caso queda en Reclamos para seguirlo desde ahí.
 */

import { useState } from 'react'
import { Button, SectionCard, Field, Input, NumberField, Notice, color, font, space } from '@/components/ui'
import { buscarOrden, enriquecerConGN, redespachar } from '@/lib/reclamos/cliente'
import type { ItemReclamo, OrdenTN } from '@/lib/reclamos/tipos'
import type { Marca } from '@/lib/nav.datos'

export function Redespacho({ marca }: { marca: Marca }) {
  // Desde Inicio («🚚 Redespacho») se llega con `?redespacho=1`: la tarjeta abre sola.
  const [abierto, setAbierto] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('redespacho'))
  const [numero, setNumero] = useState('')
  const [orden, setOrden] = useState<OrdenTN | null>(null)
  // Cuántas se mandan de cada renglón de la venta (por posición). 0 = ese no.
  const [cuantas, setCuantas] = useState<Record<number, number>>({})
  const [nota, setNota] = useState('')
  const [ocupado, setOcupado] = useState<'buscar' | 'mandar' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)

  const limpiar = () => { setNumero(''); setOrden(null); setCuantas({}); setNota(''); setError(null) }

  const buscar = async () => {
    const n = numero.trim().replace(/^#/, '')
    if (!n) return
    setOcupado('buscar'); setError(null); setHecho(null); setOrden(null); setCuantas({})
    try {
      const o = await buscarOrden(marca, n)
      if (!o) setError('No se encontró esa venta. Sólo se encuentran las recientes.')
      else setOrden(o)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  const productos = orden?.products || []
  const elegidos = productos.map((p, i) => ({ p, n: cuantas[i] || 0 })).filter((x) => x.n > 0)

  const mandar = async () => {
    if (!orden || !elegidos.length) return
    setOcupado('mandar'); setError(null)
    try {
      const items: ItemReclamo[] = await enriquecerConGN(marca, elegidos.map(({ p, n }) => ({
        sku: p.sku ?? null,
        tn_product_id: p.product_id == null ? null : String(p.product_id),
        variant_id: p.variant_id == null ? null : String(p.variant_id),
        producto: p.name || 'Sin nombre',
        cantidad: n,
        precio: p.price ?? null,
      })))
      const r = await redespachar(marca, { orden_tn: String(orden.number), cliente: orden.cliente ?? null, nota: nota.trim() || null, items })
      setHecho(`Listo: ${elegidos.reduce((s, x) => s + x.n, 0)} sale${elegidos.length === 1 && elegidos[0].n === 1 ? '' : 'n'} del depósito (ajuste A-${r.ajuste}) y ya va a Logística para despachar.`)
      limpiar()
      setAbierto(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  if (!abierto) {
    return (
      <div style={{ marginBottom: space[4] }}>
        {hecho && <Notice tone="success" icon="✓" onClose={() => setHecho(null)}>{hecho}</Notice>}
        <Button variant="outline" iconLeft="🚚" onClick={() => { setAbierto(true); setHecho(null) }}>Redespacho por falla</Button>
      </div>
    )
  }

  return (
    <SectionCard
      title="Redespacho por falla"
      subtitle="A la clienta le llegó algo con falla: se le manda otro desde el depósito."
      actions={<Button variant="ghost" size="sm" onClick={() => { limpiar(); setAbierto(false) }}>Cerrar</Button>}
      style={{ marginBottom: space[4] }}
    >
      <div style={{ display: 'flex', gap: space[2], alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: space[3] }}>
        <Field label="Venta de Tienda Nube" width={200}>
          <Input value={numero} onChange={(e) => setNumero(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void buscar() }} placeholder="ej. 21134" inputMode="numeric" />
        </Field>
        <Button variant="outline" onClick={() => void buscar()} disabled={!numero.trim() || ocupado !== null}>{ocupado === 'buscar' ? 'Buscando…' : 'Buscar'}</Button>
      </div>

      {error && <Notice tone="danger" icon="⚠" onClose={() => setError(null)}>{error}</Notice>}

      {orden && (
        <>
          <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[2] }}>
            Venta #{orden.number}{orden.cliente ? ` · ${orden.cliente}` : ''}. Poné cuántas se mandan de nuevo:
          </div>
          <div style={{ display: 'grid', gap: space[2], marginBottom: space[3] }}>
            {productos.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
                <NumberField value={cuantas[i] || 0} onChange={(n) => setCuantas((c) => ({ ...c, [i]: n === '' ? 0 : Math.max(0, Math.min(Number(n), Number(p.quantity) || 1)) }))} min={0} max={Number(p.quantity) || 1} width={80} />
                <span style={{ fontSize: font.sm }}>{p.name || p.sku || 'Sin nombre'} <span style={{ color: color.mut }}>· compró {Number(p.quantity) || 1}</span></span>
              </div>
            ))}
          </div>
          <Field label="Nota (opcional)">
            <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} placeholder="ej. llegaron rayadas" />
          </Field>
          <div style={{ marginTop: space[3] }}>
            <Button variant="solid" tone="brand" onClick={() => void mandar()} disabled={!elegidos.length || ocupado !== null}>
              {ocupado === 'mandar' ? 'Mandando…' : 'Mandar de nuevo'}
            </Button>
          </div>
        </>
      )}
    </SectionCard>
  )
}
