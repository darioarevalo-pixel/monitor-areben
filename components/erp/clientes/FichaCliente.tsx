'use client'

/**
 * La ficha AL COSTADO de un cliente (ERP › Clientes; diseño §5 y §7, decisión 4): arriba el SALDO DE LA CUENTA en grande
 * (= lo que deben sus ventas − lo que tiene a favor), las ventas con saldo, los datos y sus compras de GN.
 * 🔑 Sin cliente en el motor ⇒ el saldo dice «sin cuenta» y por qué (⛔ un 0 que parece «al día»).
 */

import { useEffect, useState } from 'react'
import { MoneyText, Notice, color, font, space, weight } from '@/components/ui'
import { formatMoney } from '@/components/ui/MoneyText'
import { DatoFicha, DatosFicha, FichaCostado } from '@/components/ui/FichaCostado'
import { ChipEstado } from '@/components/ui/PiezasLista'
import { leerFichaDeCliente, type FichaDeCliente, type FilaCliente, type MarcaErp } from '@/lib/erp/cliente'

/** «2026-10-19» → «19/10/26». */
export const fechaCorta = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : '—')

export function FichaCliente({ marca, fila, onCerrar }: { marca: MarcaErp; fila: FilaCliente; onCerrar: () => void }) {
  const [s, setS] = useState<FichaDeCliente | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    leerFichaDeCliente(marca, fila.id)
      .then((x) => { if (vivo) { setS(x); setError(null) } })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo leer el cliente.'))
    return () => { vivo = false }
  }, [marca, fila.id])

  const cuenta = s?.cuenta ?? null
  const saldo = cuenta ? cuenta.estado.saldo : fila.saldo
  const pendientes = cuenta?.estado.pendientes ?? []
  const c = s?.contacto ?? null
  const h3: React.CSSProperties = { margin: 0, fontSize: font.lg, fontWeight: weight.bold }
  const celda: React.CSSProperties = { padding: '7px 0', borderBottom: `1px solid ${color.bg2}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

  return (
    <FichaCostado abierta onCerrar={onCerrar} titulo={fila.doc ? `Cliente · ${fila.doc}` : 'Cliente'} etiqueta={`Ficha del cliente ${fila.nombre}`}>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: weight.bold, overflowWrap: 'anywhere' }}>{fila.nombre}</h2>
          <div style={{ color: color.mut }}>{fila.compras.toLocaleString('es-AR')} compras · última {fechaCorta(fila.ultima)}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {fila.mayorista && <ChipEstado mapa={{ m: ['action', 'Mayorista'] }} k="m" />}
            {fila.vencido && <ChipEstado mapa={{ v: ['danger', 'Vencido'] }} k="v" />}
            {fila.dormido && <ChipEstado mapa={{ d: ['neutral', 'Sin comprar hace +90 días'] }} k="d" />}
          </div>
        </div>
        <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
          <div style={{ fontSize: font.sm, color: color.mut }}>Saldo de la cuenta</div>
          <div style={{ fontSize: 26, fontWeight: weight.bold, fontVariantNumeric: 'tabular-nums', color: saldo == null ? color.mut2 : saldo > 0 ? color.ink : 'var(--mo-success-ink)' }}>
            {saldo == null ? '—' : saldo < 0 ? formatMoney(-saldo) : formatMoney(saldo)}
          </div>
          {saldo != null && saldo < 0 && <div style={{ fontSize: font.sm, color: 'var(--mo-success-ink)' }}>a favor</div>}
        </div>
      </div>

      {saldo == null && (
        <Notice tone="neutral">El ERP todavía no lleva la cuenta de este cliente: sus compras son de Gestión Nube. El saldo aparece cuando se le venda a cuenta desde el ERP.</Notice>
      )}

      {cuenta && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          <div>
            <h3 style={h3}>Ventas con saldo</h3>
            <div style={{ fontSize: font.sm, color: color.mut }}>debe {formatMoney(cuenta.estado.debe)} · tiene a favor {formatMoney(cuenta.estado.a_favor)}</div>
          </div>
          {!pendientes.length ? <span style={{ color: color.mut }}>No debe ninguna venta.</span> : (
            <div role="table" aria-label="Ventas con saldo" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 72px 104px 104px', columnGap: 10, fontVariantNumeric: 'tabular-nums' }}>
              {['Venta', 'Fecha', 'Total', 'Pendiente'].map((t, i) => <span key={t} role="columnheader" style={{ fontSize: font.sm, color: color.mut, textAlign: i > 1 ? 'right' : 'left', paddingBottom: 6, borderBottom: `1px solid ${color.line}` }}>{t}</span>)}
              {pendientes.map((p) => (
                <div key={p.ref} role="row" style={{ display: 'contents' }}>
                  <span role="cell" style={celda} title={p.ref}>{cuenta.ventas?.[p.ref] ?? p.ref}</span>
                  <span role="cell" style={celda}>{fechaCorta(p.fecha)}</span>
                  <span role="cell" style={{ ...celda, textAlign: 'right' }}><MoneyText value={p.monto} /></span>
                  <span role="cell" style={{ ...celda, textAlign: 'right', fontWeight: weight.semibold }}><MoneyText value={p.pendiente} /></span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <DatosFicha>
        <DatoFicha titulo="Comprado">{formatMoney(fila.total)}</DatoFicha>
        <DatoFicha titulo="Primera compra">{fechaCorta(fila.primera)}</DatoFicha>
        <DatoFicha titulo="Canales">{fila.canales.join(' · ') || '—'}</DatoFicha>
        <DatoFicha titulo="DNI / CUIT">{fila.doc ?? cuenta?.cliente.doc ?? '—'}</DatoFicha>
        {c && <DatoFicha titulo="Mail">{c.email || '—'}</DatoFicha>}
        {c && <DatoFicha titulo="Teléfono">{c.phone || '—'}</DatoFicha>}
        {c && <DatoFicha titulo="Ciudad">{[c.city, c.province].filter(Boolean).join(', ') || '—'}</DatoFicha>}
      </DatosFicha>

      <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <div>
          <h3 style={h3}>Compras</h3>
          <div style={{ fontSize: font.sm, color: color.mut }}>las de Gestión Nube, la última primero{s?.cortado ? ' · se muestran las últimas 200' : ''}</div>
        </div>
        {!s ? <span style={{ color: color.mut }}>Leyendo…</span> : !s.compras.length ? <span style={{ color: color.mut }}>No tiene compras en Gestión Nube.</span> : (
          <div role="table" aria-label="Compras del cliente" style={{ display: 'grid', gridTemplateColumns: '64px 72px minmax(0, 1fr) 104px', columnGap: 10, fontVariantNumeric: 'tabular-nums' }}>
            {['Nº', 'Fecha', 'Canal · estado', 'Total'].map((t, i) => <span key={t} role="columnheader" style={{ fontSize: font.sm, color: color.mut, textAlign: i === 3 ? 'right' : 'left', paddingBottom: 6, borderBottom: `1px solid ${color.line}` }}>{t}</span>)}
            {s.compras.map((v) => (
              <div key={v.id} role="row" style={{ display: 'contents' }}>
                <span role="cell" style={{ ...celda, color: color.ink2 }}>{v.number ?? '—'}</span>
                <span role="cell" style={celda}>{fechaCorta(v.fecha)}</span>
                <span role="cell" style={{ ...celda, color: color.mut }} title={[v.channel, v.sale_state, v.payment_method].filter(Boolean).join(' · ')}>{[v.channel, v.sale_state].filter(Boolean).join(' · ')}</span>
                <span role="cell" style={{ ...celda, textAlign: 'right' }}><MoneyText value={v.total} /></span>
              </div>
            ))}
          </div>
        )}
      </section>
    </FichaCostado>
  )
}
