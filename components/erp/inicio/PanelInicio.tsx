'use client'

/**
 * ERP › Inicio · los GRÁFICOS del panel (tanda 2, Bruno 30-oct; maqueta del diseñador, tablero «Inicio · propuesta»).
 * Sólo dibuja: los números los arma `lib/erp/inicio-panel.core.js` desde lecturas que ya usan otras pantallas.
 * 🎨 Dos series como mucho por gráfico (skill dataviz): vendido en índigo, margen en verde agua (validados juntos), el mes
 * anterior en gris; cada gráfico con su leyenda y su tooltip, ⛔ un número en cada punto.
 */

import Link from 'next/link'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { color, font, space, weight } from '@/components/ui'
import { chartColor } from '@/components/ui/tokens'
import { formatMoney } from '@/components/ui/MoneyText'
import { plataCorta, rayasRedondas } from '@/lib/erp/inicio-panel.core.js'

/** El verde agua del margen: validado contra el índigo (CVD ΔE 29,7). Es de gráfico: va con hex, como `chartColor`. */
export const MARGEN = '#0f9a6c'
const ANTES = '#98A2B3'

export const tarjeta: React.CSSProperties = { background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, padding: '18px 20px', boxSizing: 'border-box', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }
export const rotulo: React.CSSProperties = { fontSize: 12, fontWeight: weight.semibold, letterSpacing: '.04em', textTransform: 'uppercase', color: color.mut }
const titulo: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: weight.semibold, color: color.ink }
const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }

function Leyenda({ items }: { items: Array<[string, string, boolean?]> }) {
  return (
    <div style={{ display: 'flex', gap: space[3], fontSize: font.sm, color: color.mut, flexWrap: 'wrap' }}>
      {items.map(([nombre, c, linea]) => (
        <span key={nombre} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden style={linea ? { width: 14, height: 2, background: c, borderRadius: 1 } : { width: 10, height: 10, background: c, borderRadius: 3 }} />{nombre}
        </span>
      ))}
    </div>
  )
}

type FilaTip = { name?: string | number; value?: number | string | null; color?: string }
function Globo({ active, payload, label, titulo: t }: { active?: boolean; payload?: FilaTip[]; label?: string | number; titulo: (l: string | number | undefined) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 10, padding: '8px 10px', boxShadow: '0 8px 24px rgba(16,24,40,.12)', fontSize: font.sm, color: color.ink }}>
      <div style={{ fontWeight: weight.semibold, paddingBottom: 4 }}>{t(label)}</div>
      {payload.filter((p) => p.value != null).map((p) => (
        <div key={String(p.name)} style={{ display: 'flex', alignItems: 'center', gap: 6, ...num }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />{p.name}: <b>{formatMoney(Number(p.value))}</b>
        </div>
      ))}
    </div>
  )
}

const eje = { fontSize: 11, fill: chartColor.axis }

/**
 * La tarjeta grande: lo vendido del mes, lo de AYER y la línea día a día (lo vendido CADA día, ⛔ acumulado).
 * 🔴 «Ayer», ⛔ «Hoy»: la copia de GN llega tarde en el día (30-oct 16 h: Zattia tenía 1 venta de hoy, ~30 de un día común).
 */
export function TarjetaVendido({ mesNombre, vendido, ayer, anterior, variacion, dias }: {
  mesNombre: string; vendido: number | null; ayer: number | null; anterior: number | null; variacion: number | null
  dias: Array<{ dia: number; vendido: number }>
}) {
  return (
    <div style={{ ...tarjeta, gridColumn: 'span 2', background: '#1e1b4b', borderColor: '#1e1b4b', color: '#fff', gap: 10 }} className="erp-inicio-hero">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: space[2], flexWrap: 'wrap' }}>
        <span style={{ ...rotulo, color: '#c7d2fe' }}>Vendido en {mesNombre}</span>
        <span style={{ fontSize: font.sm, color: '#c7d2fe', ...num }}>{ayer != null && <>Ayer <b style={{ color: '#fff' }}>{formatMoney(ayer)}</b></>}</span>
      </div>
      <div style={{ fontSize: 34, fontWeight: weight.bold, letterSpacing: '-0.02em', ...num }}>{vendido == null ? '…' : formatMoney(vendido)}</div>
      <div style={{ fontSize: font.sm, color: '#c7d2fe', ...num }}>
        {anterior != null && <>El mes pasado a esta altura {formatMoney(anterior)}{variacion != null && <> · <b style={{ color: variacion >= 0 ? '#6ee7b7' : '#fca5a5' }}>{variacion >= 0 ? '+' : ''}{variacion}%</b></>}</>}
      </div>
      <div style={{ height: 64, marginTop: 'auto' }} aria-label="Lo vendido cada día del mes" role="img">
        {dias.length > 1 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dias} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs><linearGradient id="erp-hero" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a5b4fc" stopOpacity={0.45} /><stop offset="1" stopColor="#a5b4fc" stopOpacity={0} /></linearGradient></defs>
              <Tooltip cursor={{ stroke: '#c7d2fe', strokeWidth: 1 }} content={(p) => <Globo {...(p as object)} titulo={(l) => `Día ${l}`} />} />
              <XAxis dataKey="dia" hide />
              <Area type="monotone" dataKey="vendido" name="Vendido" stroke="#a5b4fc" strokeWidth={2} fill="url(#erp-hero)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

/** «Ventas y margen, mes a mes»: 12 meses, el de hoy marcado «en curso». */
export function MesAMes({ meses }: { meses: Array<{ mes: string; nombre: string; vendido: number; margen: number | null; enCurso: boolean }> }) {
  const rayas = rayasRedondas(Math.max(...meses.map((m) => m.vendido)))
  const sinCosto = meses.filter((m) => m.margen == null && m.vendido > 0).map((m) => m.nombre)
  return (
    <div style={{ ...tarjeta, gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[2], flexWrap: 'wrap' }}>
        <h3 style={titulo}>Ventas y margen, mes a mes</h3>
        <Leyenda items={[['Vendido', chartColor.brand], ['Margen', MARGEN]]} />
      </div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={meses} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke={chartColor.grid} />
            <XAxis dataKey="nombre" tick={eje} axisLine={false} tickLine={false} />
            <YAxis tick={eje} axisLine={false} tickLine={false} width={48} ticks={rayas} domain={[0, rayas[rayas.length - 1]]} tickFormatter={(v: number) => plataCorta(v)} />
            <Tooltip cursor={{ fill: 'rgba(79,70,229,0.06)' }} content={(p) => <Globo {...(p as object)} titulo={(l) => { const m = meses.find((x) => x.nombre === l); return m ? `${l} ${m.mes.slice(0, 4)}${m.enCurso ? ' · en curso' : ''}` : String(l) }} />} />
            <Bar dataKey="vendido" name="Vendido" fill={chartColor.brand} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="margen" name="Margen" fill={MARGEN} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ fontSize: font.sm, color: color.mut }}>El último mes va hasta hoy (en curso).{sinCosto.length ? ` ${sinCosto.join(', ')}: sin margen, porque Gestión Nube no tiene el costo de esas ventas.` : ''}</div>
    </div>
  )
}

/** «Cómo viene el mes»: lo acumulado día a día, este mes contra el anterior entero. */
export function ComoViene({ filas, ahora, antes }: { filas: Array<{ dia: number; ahora: number | null; antes: number | null }>; ahora: string; antes: string }) {
  const ultimoAhora = [...filas].reverse().find((f) => f.ahora != null)
  const ultimoAntes = [...filas].reverse().find((f) => f.antes != null)
  const rayas = rayasRedondas(Math.max(ultimoAhora?.ahora ?? 0, ultimoAntes?.antes ?? 0))
  return (
    <div style={{ ...tarjeta, gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[2], flexWrap: 'wrap' }}>
        <h3 style={titulo}>Cómo viene el mes</h3>
        <Leyenda items={[[ahora, chartColor.brand, true], [antes, ANTES, true]]} />
      </div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={filas} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={chartColor.grid} />
            <XAxis dataKey="dia" tick={eje} axisLine={false} tickLine={false} ticks={[1, 5, 10, 15, 20, 25, 30].filter((d) => d <= filas.length)} />
            <YAxis tick={eje} axisLine={false} tickLine={false} width={48} ticks={rayas} domain={[0, rayas[rayas.length - 1]]} tickFormatter={(v: number) => plataCorta(v)} />
            <Tooltip cursor={{ stroke: chartColor.axis, strokeWidth: 1 }} content={(p) => <Globo {...(p as object)} titulo={(l) => `Al día ${l}`} />} />
            <Line type="monotone" dataKey="antes" name={antes} stroke={ANTES} strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls={false} />
            <Line type="monotone" dataKey="ahora" name={ahora} stroke={chartColor.brand} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: color.surface, strokeWidth: 2 }} isAnimationActive={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', gap: space[4], fontSize: font.sm, color: color.mut, ...num, flexWrap: 'wrap' }}>
        {ultimoAhora && <span>{ahora} al día {ultimoAhora.dia}: <b style={{ color: color.ink }}>{plataCorta(ultimoAhora.ahora!)}</b></span>}
        {ultimoAntes && <span>{antes} cerró en <b style={{ color: color.ink }}>{plataCorta(ultimoAntes.antes!)}</b></span>}
      </div>
    </div>
  )
}

/** Una fila de barra horizontal: nombre · barra · monto (canales y lo que más deja). */
function FilaBarra({ nombre, parte, monto, extra, c }: { nombre: string; parte: number; monto: string; extra?: string; c: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 140px) 1fr auto', alignItems: 'center', gap: space[3], fontSize: font.md }} title={extra}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: color.ink }}>{nombre}</span>
      <span style={{ height: 8, borderRadius: 4, background: color.bg2 }}><span style={{ display: 'block', width: `${Math.max(2, Math.round(parte * 100))}%`, height: 8, borderRadius: 4, background: c }} /></span>
      <span style={{ ...num, textAlign: 'right', color: color.ink, fontWeight: weight.semibold }}>{monto}{extra && <span style={{ display: 'block', fontSize: font.xs, fontWeight: weight.normal, color: color.mut }}>{extra}</span>}</span>
    </div>
  )
}

export function PorCanal({ canales }: { canales: Array<{ nombre: string; ventas: number; vendido: number; parte: number; margen: number | null }> }) {
  return (
    <div style={{ ...tarjeta, gap: 12 }}>
      <h3 style={titulo}>Por canal</h3>
      {canales.length === 0 && <div style={{ fontSize: font.sm, color: color.mut }}>Todavía no hay ventas este mes.</div>}
      {canales.map((c) => (
        <FilaBarra key={c.nombre} nombre={c.nombre} parte={c.parte} c={chartColor.brand} monto={plataCorta(c.vendido)}
          extra={`${Math.round(c.parte * 100)}% · ${c.ventas.toLocaleString('es-AR')} ventas`} />
      ))}
      {/* El margen de un canal chico (las técnicas de «Sin canal»: −112% el 30-oct) ⛔ dice nada: desde el 2% de lo vendido. */}
      {canales.some((c) => c.margen != null && c.parte >= 0.02) && (
        <div style={{ fontSize: font.sm, color: color.mut }}>Margen: {canales.filter((c) => c.margen != null && c.parte >= 0.02).map((c) => `${c.nombre} ${Math.round(c.margen! * 100)}%`).join(' · ')}</div>
      )}
    </div>
  )
}

export function MasDejan({ productos, href, estado }: { productos: Array<{ id: string; nombre: string; margen: number | null; unidades: number }>; href: string; estado: string | null }) {
  const max = Math.max(1, ...productos.map((p) => p.margen ?? 0))
  return (
    <div style={{ ...tarjeta, gap: 12 }}>
      <h3 style={titulo}>Lo que más deja margen del mes</h3>
      {estado && <div style={{ fontSize: font.sm, color: estado === '…' ? color.mut : 'var(--mo-danger-ink)' }}>{estado}</div>}
      {!estado && productos.length === 0 && <div style={{ fontSize: font.sm, color: color.mut }}>Ningún producto vendido este mes tiene costo cargado.</div>}
      {productos.map((p) => (
        <FilaBarra key={p.id} nombre={p.nombre} parte={(p.margen ?? 0) / max} c={MARGEN} monto={formatMoney(p.margen ?? 0)} extra={`${p.unidades.toLocaleString('es-AR')} u.`} />
      ))}
      <Link href={href} style={{ fontSize: font.sm, fontWeight: weight.semibold, marginTop: 'auto' }}>Ver por producto ›</Link>
    </div>
  )
}
