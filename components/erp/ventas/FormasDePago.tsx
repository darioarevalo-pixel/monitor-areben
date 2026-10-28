'use client'

/**
 * ERP › Cargar venta: UN pago, con las FORMAS DE PAGO del POS como tarjetas (Bruno, 27-oct: «idéntico al POS»). Efectivo, Transferencia,
 * Débito y Crédito salen de las mismas reglas que la Caja (`lib/erp/formas-pago.core.js`); cada una lleva su cuenta de cobro, y la ruta
 * de gerencia (cuenta REAL y tasa del canal elegido) se dice ACÁ, antes de cargar. Sumadas las del ERP: «Queda debiendo» y
 * «Contraentrega». «Otra cuenta» es para lo que ⛔ es del POS (Mercado Pago, Pago Nube, feria…).
 */
import { useState } from 'react'
import { Icono, Select, color, font, radius, space, weight } from '@/components/ui'
import type { CuentaParaCargar, FormaDePagoCargar } from '@/lib/erp/cliente'

/** El ícono y el color de cada forma de pago: los del POS (`ESTILO_MEDIO` de `CajaPOS.tsx`) y dos más para las del ERP. */
const ESTILO: Record<string, { icono: 'efectivo' | 'transferencia' | 'tarjeta' | 'clientes' | 'envios'; fondo: string; tinta: string }> = {
  efectivo: { icono: 'efectivo', fondo: color.successBg, tinta: color.successInk },
  transferencia: { icono: 'transferencia', fondo: color.brandBg, tinta: color.brand },
  debito: { icono: 'tarjeta', fondo: 'var(--mo-info-bg)', tinta: 'var(--mo-info)' },
  credito: { icono: 'tarjeta', fondo: 'var(--mo-pink-bg)', tinta: 'var(--mo-pink)' },
  cuenta: { icono: 'clientes', fondo: color.bg2, tinta: color.ink },
  entrega: { icono: 'envios', fondo: color.bg2, tinta: color.ink },
}

export type PagoCarga = { clave: string; cuenta: string; monto: number | ''; forma?: string; opcion?: string }

/** Lo que dice la ruta de una forma de pago en un canal. */
export function textoDeRuta(forma: FormaDePagoCargar | undefined, canal: string): { texto: string; falta: boolean } | null {
  if (!forma || forma.clave === 'cuenta') return null
  const r = forma.rutas[canal]
  if (!r) return { texto: `Sin ruta cargada para este canal: el cobro queda sin cuenta real (se carga en Configuración › Rutas).`, falta: true }
  const partes = [r.cuenta ? `Va a ${r.cuenta}` : 'Va a una cuenta sin nombre']
  if (r.tasa != null && r.tasa > 0) partes.push(`comisión ${String(r.tasa).replace('.', ',')} %`)
  if (r.dias != null) partes.push(r.dias === 0 ? 'se acredita en el día' : `se acredita en ${r.dias} ${r.dias === 1 ? 'día' : 'días'}`)
  return { texto: partes.join(' · '), falta: false }
}

export function FormasDePago({ formas, sueltas, canal, pago, onCambio }: {
  formas: FormaDePagoCargar[]; sueltas: CuentaParaCargar[]; canal: string; pago: PagoCarga
  onCambio: (cambio: Partial<PagoCarga>) => void
}) {
  const [otra, setOtra] = useState(false)
  const forma = formas.find((f) => f.clave === pago.forma)
  const ruta = textoDeRuta(forma, canal)
  const elegir = (f: FormaDePagoCargar) => { setOtra(false); onCambio({ forma: f.clave, opcion: undefined, cuenta: f.cuenta ?? '' }) }
  const tarjeta: React.CSSProperties = {
    height: 'auto', display: 'flex', alignItems: 'center', gap: space[2], textAlign: 'left', padding: space[2], borderRadius: radius.lg, cursor: 'pointer',
  }
  return (
    <div style={{ display: 'grid', gap: space[2], flex: '1 1 100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: space[2] }}>
        {formas.map((f) => {
          const est = ESTILO[f.clave] ?? ESTILO.cuenta
          const activa = !otra && pago.forma === f.clave
          return (
            <button key={f.clave} type="button" aria-pressed={activa} disabled={!f.cuenta} onClick={() => elegir(f)}
              title={f.cuenta ? undefined : 'La Caja de esta línea no tiene cuenta para esta forma de pago'}
              style={{ ...tarjeta, border: `2px solid ${activa ? color.success : color.line}`, background: activa ? color.successBg : color.surface, opacity: f.cuenta ? 1 : 0.5 }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: radius.md, background: est.fondo, color: est.tinta, flexShrink: 0 }}>
                <Icono nombre={est.icono} size={18} />
              </span>
              <span style={{ fontSize: font.sm, fontWeight: weight.semibold, color: color.ink }}>{f.nombre}</span>
            </button>
          )
        })}
        {sueltas.length > 0 && (
          <button type="button" aria-pressed={otra} onClick={() => { setOtra(true); onCambio({ forma: 'otra', opcion: undefined, cuenta: '' }) }}
            style={{ ...tarjeta, border: `2px ${otra ? 'solid' : 'dashed'} ${otra ? color.success : color.line}`, background: otra ? color.successBg : color.surface }}>
            <span style={{ fontSize: font.sm, fontWeight: weight.semibold, color: color.ink }}>Otra cuenta…</span>
          </button>
        )}
      </div>
      {forma?.opciones && (
        <div role="group" aria-label="Cómo se paga el crédito" style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          {forma.opciones.map((o) => {
            const activa = (pago.opcion ?? 'normal') === o.clave
            return (
              <button key={o.clave} type="button" aria-pressed={activa} onClick={() => onCambio({ opcion: o.clave, cuenta: o.cuenta })}
                style={{ ...tarjeta, padding: `${space[1]} ${space[3]}`, border: `1px solid ${activa ? color.success : color.line}`, background: activa ? color.successBg : color.surface, fontSize: font.sm }}>
                {o.nombre}
              </button>
            )
          })}
        </div>
      )}
      {otra && (
        <Select aria-label="Otra cuenta" value={pago.cuenta} onChange={(e) => onCambio({ cuenta: e.target.value })}>
          <option value="">Elegí la cuenta</option>
          {sueltas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </Select>
      )}
      {ruta && <p style={{ margin: 0, fontSize: font.sm, color: ruta.falta ? color.warningInk : color.mut }}>{ruta.texto}</p>}
    </div>
  )
}
