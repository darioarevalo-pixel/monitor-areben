'use client'

/**
 * ERP › Stock › ficha del producto › «Movimientos» (Darío 18-nov; propuesta https://claude.ai/artifact/S7rgTeqyFmvhhR8a2k4qpb):
 * la ventana grande con el historial como TABLA — Fecha · Movimiento · Entrada · Salida · Saldo · Descripción —, por
 * depósito (arranca en el que más movimientos tiene) o todos juntos, y filtro por tipo. Con un filtro de tipo el Saldo ⛔ se
 * muestra: salta entre renglones (lo explican los que el filtro esconde) y confunde. En el celular, un renglón por movimiento.
 * Qué es un renglón (la venta de Tienda Nube con su preparado, las correcciones que se anulan): `lib/erp/historial-prenda.core.js`.
 * 🆕 18-nov (Darío): es LO que se abre al tocar un producto en Stock, Movimientos y la búsqueda — la ficha del costado repetía
 * la lista —; trae el código de barras, «Ajustar» (lleva a «Nuevo ajuste») y «Etiquetas ↗». Diferencias y Conciliación
 * siguen con la ficha del costado: ahí lo que importa es la comparación con Gestión Nube y Tienda Nube.
 * Transferir y Ajustar DENTRO de la ventana vienen en un segundo paso.
 */

import { useEffect, useMemo, useState } from 'react'
import { Button, Modal, Notice, color, font, space, weight } from '@/components/ui'
import { usePantallaAngosta } from '@/lib/movil'
import { lineaDe } from '@/lib/lineas'
import { usePuedeErp } from '@/lib/erp/usePuedeErp'
import type { PrendaAAjustar } from './StockErp'
import { leerHistorialDePrenda, type FilaHistorial, type HistorialDePrenda, type MarcaErp } from '@/lib/erp/cliente'
import { FILTROS, depositoInicial, filtrarHistorial } from '@/lib/erp/historial-prenda.core.js'

/** El color de la etiqueta de cada tipo (tokens `--mo-mov-*` de `app/tokens.css`). */
const ETIQUETA: Record<string, [string, string]> = {
  compra: ['var(--mo-mov-compra-bg)', 'var(--mo-mov-compra-fg)'],
  venta: ['var(--mo-mov-venta-bg)', 'var(--mo-mov-venta-fg)'],
  cambio: ['var(--mo-mov-venta-bg)', 'var(--mo-mov-venta-fg)'],
  transf: ['var(--mo-mov-transf-bg)', 'var(--mo-mov-transf-fg)'],
  ajuste: ['var(--mo-mov-ajuste-bg)', 'var(--mo-mov-ajuste-fg)'],
  ajusteventa: ['var(--mo-mov-ajuste-bg)', 'var(--mo-mov-ajuste-fg)'],
  salida: ['var(--mo-mov-ajuste-bg)', 'var(--mo-mov-ajuste-fg)'],
  anulada: ['var(--mo-mov-deshace-bg)', 'var(--mo-mov-deshace-fg)'],
  cancelado: ['var(--mo-mov-deshace-bg)', 'var(--mo-mov-deshace-fg)'],
}

const DIA = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: '2-digit' })
const HORA = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function Etiqueta({ f }: { f: FilaHistorial }) {
  const [bg, fg] = ETIQUETA[f.tipo] ?? [color.bg2, color.ink2]
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: font.sm, fontWeight: weight.semibold, background: bg, color: fg, whiteSpace: 'nowrap' }}>{f.tipoNombre}</span>
}

/** Lo que ya se sabe del producto (la fila de la lista); sin eso, lo trae el servidor. */
export type DatosDelProducto = { nombre?: string | null; talleNombre?: string | null; sku?: string | null; barcode?: string | null; linea?: string | null }

export function HistorialPrenda({ marca, producto, talle, datos, ajustar, onCerrar }: {
  marca: MarcaErp; producto: string; talle: string; datos?: DatosDelProducto | null
  /** «Ajustar» lleva a «Nuevo ajuste» con el producto cargado; sin esto, ⛔ se muestra. */
  ajustar?: (p: PrendaAAjustar) => void
  onCerrar: () => void
}) {
  const [h, setH] = useState<HistorialDePrenda | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deposito, setDeposito] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('todo')
  const angosta = usePantallaAngosta()

  useEffect(() => {
    let vivo = true
    leerHistorialDePrenda(marca, producto, talle)
      .then((x) => { if (vivo) { setH(x); setDeposito((d) => d ?? depositoInicial(x.depositos)) } })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudieron leer los movimientos del producto.'))
    return () => { vivo = false }
  }, [marca, producto, talle])

  const ajusta = usePuedeErp(marca)('ajustar')
  const nombre = datos?.nombre ?? h?.prenda?.nombre ?? 'Producto'
  const variante = datos?.talleNombre ?? h?.prenda?.talleNombre ?? ''
  const codigo = datos?.sku ?? h?.prenda?.sku ?? null
  const barcode = datos?.barcode ?? h?.prenda?.barcode ?? null
  const linea = datos?.linea ?? (codigo || h ? lineaDe(marca, codigo) : null)
  const aAjustar = () => { if (ajustar && linea) { onCerrar(); ajustar({ linea, producto, talle, sku: codigo, barcode, nombre, talleNombre: variante }) } }

  const dep = deposito ?? 'todos'
  const filas = useMemo(() => (h ? filtrarHistorial(h.filas, { deposito: dep, filtro }) : []), [h, dep, filtro])
  const conSaldo = filtro === 'todo'
  const todos = dep === 'todos'
  const saldo = !h ? null : todos ? h.total : h.depositos.find((d) => d.deposito === dep)?.saldo ?? 0
  const opciones = h ? [...h.depositos.map((d) => ({ k: d.deposito, n: d.nombre, s: d.saldo })), { k: 'todos', n: 'Todos', s: h.total }] : []

  const boton = (activo: boolean): React.CSSProperties => ({
    height: angosta ? 40 : 32, padding: '0 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: font.base,
    background: activo ? color.surface : 'transparent', color: activo ? color.ink : color.mut, fontWeight: activo ? weight.semibold : weight.normal,
    boxShadow: activo ? '0 1px 2px rgba(15,23,41,.12)' : 'none', whiteSpace: 'nowrap',
  })
  const chip = (activo: boolean): React.CSSProperties => ({
    height: angosta ? 34 : 30, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: font.sm, fontWeight: weight.semibold,
    border: `1px solid ${activo ? color.brandSolid : color.line2}`, background: activo ? color.brandSolid : color.surface, color: activo ? '#fff' : color.mut, whiteSpace: 'nowrap', flexShrink: 0,
  })

  const titulo = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3], width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: space[4] }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: font.xs, fontWeight: weight.semibold, letterSpacing: '0.06em', textTransform: 'uppercase', color: color.mut }}>Movimientos</div>
          <div style={{ fontSize: angosta ? font.xl : font['2xl'], fontWeight: weight.bold, color: color.ink, overflowWrap: 'anywhere' }}>{nombre}{variante ? ` · ${variante}` : ''}</div>
          {(codigo || barcode) && <div style={{ fontSize: font.sm, color: color.mut, fontWeight: weight.normal }}>{[codigo, barcode].filter(Boolean).join(' · ')}</div>}
        </div>
        <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
          <div style={{ fontSize: font.sm, color: color.mut, fontWeight: weight.normal }}>{todos ? 'Total' : opciones.find((o) => o.k === dep)?.n ?? ''}</div>
          <div style={{ fontSize: angosta ? 26 : 32, fontWeight: weight.bold, lineHeight: 1.1, color: (saldo ?? 0) < 0 ? 'var(--mo-danger-ink)' : color.ink, fontVariantNumeric: 'tabular-nums' }}>{saldo ?? '…'}</div>
        </div>
      </div>
      {h && (
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
          <div role="group" aria-label="Depósito" style={{ display: 'flex', background: color.bg2, borderRadius: 10, padding: 3, gap: 2, maxWidth: '100%', overflowX: 'auto' }}>
            {opciones.map((o) => (
              <button key={o.k} type="button" aria-pressed={dep === o.k} onClick={() => setDeposito(o.k)} style={boton(dep === o.k)}>
                {o.n} <b style={{ marginLeft: 4, fontVariantNumeric: 'tabular-nums' }}>{o.s}</b>
              </button>
            ))}
          </div>
          <div role="group" aria-label="Tipo de movimiento" style={{ display: 'flex', gap: 6, overflowX: 'auto', maxWidth: '100%' }}>
            {FILTROS.map(([k, n]) => <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)} style={chip(filtro === k)}>{n}</button>)}
          </div>
        </div>
      )}
    </div>
  )

  const num: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: weight.semibold, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '8px 10px', borderTop: `1px solid ${color.bg2}`, verticalAlign: 'middle' }
  const th: React.CSSProperties = { padding: '8px 10px', fontWeight: weight.semibold, fontSize: font.sm, color: color.mut, textAlign: 'left', position: 'sticky', top: 0, background: color.surface, borderBottom: `1px solid ${color.line}`, whiteSpace: 'nowrap' }

  return (
    <Modal abierto onCerrar={onCerrar} titulo={titulo} ancho="xl" variante="pos"
      pie={<>
        <span style={{ marginRight: 'auto', fontSize: font.sm, color: color.mut }}>{h ? `${filas.length} ${filas.length === 1 ? 'movimiento' : 'movimientos'}` : ''}</span>
        <Button variant="outline" onClick={() => window.open('/etiquetas', '_blank', 'noopener')}>Etiquetas ↗</Button>
        {ajustar && ajusta && <Button variant="soft" tone="brand" disabled={!linea} onClick={aAjustar}>Ajustar</Button>}
      </>}>
      {/* Mismo alto siempre: con pocos renglones la ventana se achicaba y saltaba al cambiar de filtro. */}
      <div style={{ minHeight: angosta ? undefined : 'calc(100vh - 250px)' }}>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {!h ? (!error && <div style={{ padding: space[6], color: color.mut }}>Leyendo los movimientos…</div>)
        : !filas.length ? <div style={{ padding: space[6], color: color.mut }}>No hay movimientos con ese filtro.</div>
        : angosta ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filas.map((f) => (
              <div key={f.id} style={{ display: 'flex', gap: space[3], alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${color.bg2}` }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.base }}>
                    <Etiqueta f={f} />
                    {f.ref && <b style={{ color: color.brand, whiteSpace: 'nowrap' }}>{f.ref}</b>}
                    <span title={HORA.format(new Date(f.cuando))} style={{ marginLeft: 'auto', fontSize: font.sm, color: color.mut, whiteSpace: 'nowrap' }}>{DIA.format(new Date(f.cuando))}</span>
                  </div>
                  <div style={{ fontSize: font.sm, color: color.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[todos ? f.depositoNombre : null, f.desc].filter(Boolean).join(' · ')}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: 56, flexShrink: 0 }}>
                  <span style={{ ...num, fontSize: font.lg, fontWeight: weight.bold, color: f.cantidad > 0 ? 'var(--mo-success-ink)' : 'var(--mo-danger-ink)' }}>{f.cantidad > 0 ? `+${f.cantidad}` : f.cantidad}</span>
                  {conSaldo && <span style={{ fontSize: font.xs, color: color.mut }}>queda {f.saldoVisto}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.base }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 84 }}>Fecha</th>
                <th style={{ ...th, width: 230 }}>Movimiento</th>
                {todos && <th style={{ ...th, width: 140 }}>Depósito</th>}
                <th style={{ ...th, textAlign: 'right', width: 70 }}>Entrada</th>
                <th style={{ ...th, textAlign: 'right', width: 64 }}>Salida</th>
                {conSaldo && <th style={{ ...th, textAlign: 'right', width: 64 }}>Saldo</th>}
                <th style={th}>Descripción</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td style={{ ...td, color: color.mut, whiteSpace: 'nowrap' }} title={HORA.format(new Date(f.cuando))}>{DIA.format(new Date(f.cuando))}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}><Etiqueta f={f} />{f.ref && <b style={{ marginLeft: 8, color: color.brand }}>{f.ref}</b>}</td>
                  {todos && <td style={{ ...td, color: color.mut }}>{f.depositoNombre}</td>}
                  <td style={{ ...td, ...num, color: 'var(--mo-success-ink)' }}>{f.cantidad > 0 ? f.cantidad : ''}</td>
                  <td style={{ ...td, ...num, color: 'var(--mo-danger-ink)' }}>{f.cantidad < 0 ? -f.cantidad : ''}</td>
                  {conSaldo && <td style={{ ...td, ...num, fontWeight: weight.bold, color: f.saldoVisto < 0 ? 'var(--mo-danger-ink)' : color.ink }}>{f.saldoVisto}</td>}
                  <td style={{ ...td, color: color.ink2 }}>{f.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  )
}
