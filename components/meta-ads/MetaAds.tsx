'use client'

import { useEffect, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useSesion } from '@/components/SesionProvider'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { puedeSub } from '@/lib/permisos'
import { pausarAnuncio, traerDetalleCuenta, traerOverview } from '@/lib/meta-ads/cliente'
import type { AdRow, Campaña, CuentaMetaAds, DemografiaFila, DetalleCuenta, FunnelPaso, Metricas, PresetMetaAds, RegionFila } from '@/lib/meta-ads/tipos'
import { chartColor, color as paleta } from '@/components/ui'

/** Estado de la mutación pausar/activar, compartido hacia las filas de anuncio. */
type EstadoPausa = { status?: string; pending?: boolean; error?: string }
type CtxPausa = {
  puede: boolean
  ov: Record<string, EstadoPausa>
  onToggle: (adId: string, actual: string | null | undefined) => void
}

const RANGOS: { k: PresetMetaAds; label: string }[] = [
  { k: 'today', label: 'Hoy' },
  { k: 'yesterday', label: 'Ayer' },
  { k: 'last_7d', label: 'Últimos 7 días' },
  { k: 'last_14d', label: 'Últimos 14 días' },
  { k: 'last_30d', label: 'Últimos 30 días' },
  { k: 'last_90d', label: 'Últimos 90 días' },
  { k: 'this_month', label: 'Este mes' },
  { k: 'last_month', label: 'Mes pasado' },
  { k: 'maximum', label: 'Todo el historial' },
]

const nf = new Intl.NumberFormat('es-AR')
const nf1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })
const entero = (v?: number) => nf.format(Math.round(v ?? 0))
const money = (v: number | undefined, moneda: string) => {
  const cur = /^[A-Z]{3}$/.test(moneda) ? moneda : 'ARS'
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v ?? 0)
  } catch {
    return `${cur} ${entero(v)}`
  }
}
const roas = (v?: number) => (v ? `${nf1.format(v)}×` : '—')
const pct = (v?: number) => `${nf1.format(v ?? 0)}%`
const diaCorto = (iso: string) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '')

// Rótulo + color de un ranking de Meta (ABOVE_AVERAGE / AVERAGE / BELOW_AVERAGE_* / UNKNOWN).
function rotuloRanking(r?: string | null): { txt: string; color: string; bg: string } | null {
  if (!r || r === 'UNKNOWN') return null
  if (r === 'ABOVE_AVERAGE') return { txt: 'Arriba del promedio', color: paleta.success, bg: paleta.successBg }
  if (r === 'AVERAGE') return { txt: 'En el promedio', color: paleta.mut, bg: paleta.bg2 }
  return { txt: 'Debajo del promedio', color: paleta.dangerInk, bg: paleta.dangerBg } // BELOW_AVERAGE_10/20/35
}

// Rótulo + color del estado de entrega (effective_status).
function rotuloEstado(s?: string | null): { txt: string; color: string; bg: string } | null {
  if (!s) return null
  if (s === 'ACTIVE') return { txt: 'Activo', color: paleta.success, bg: paleta.successBg }
  if (s === 'PAUSED' || s === 'ADSET_PAUSED' || s === 'CAMPAIGN_PAUSED') return { txt: 'Pausado', color: paleta.mut, bg: paleta.bg2 }
  if (s === 'PENDING_REVIEW' || s === 'IN_PROCESS' || s === 'PENDING_PROCESSING') return { txt: 'En revisión', color: paleta.warningInk, bg: paleta.warningBg }
  if (s === 'DISAPPROVED' || s === 'WITH_ISSUES') return { txt: 'Con problemas', color: paleta.dangerInk, bg: paleta.dangerBg }
  return { txt: s.toLowerCase().replace(/_/g, ' '), color: paleta.mut, bg: paleta.bg2 }
}

const genero = (g: string) => (g === 'male' ? 'Hombres' : g === 'female' ? 'Mujeres' : g === 'unknown' ? 'Sin dato' : g || '—')

function Badge({ txt, color, bg }: { txt: string; color: string; bg: string }) {
  return <span style={{ fontSize: 11, fontWeight: 600, color, background: bg, borderRadius: 6, padding: '1px 7px', whiteSpace: 'nowrap' }}>{txt}</span>
}

type Cargable<T> = { fase: 'cargando' } | { fase: 'error'; motivo: string } | { fase: 'ok'; data: T }

export function MetaAds() {
  const { perfil, marca } = useSesion()
  const puedePausar = puedeSub(perfil, marca, 'meta-ads', 'pausar')
  const [preset, setPreset] = useState<PresetMetaAds>('last_30d')
  const [elegida, setElegida] = useState<string | null>(null)
  // Estados optimistas de pausa/activación, keyeados por cuenta+rango: al cambiar de
  // vista, `ovMap` vuelve a {} solo, sin efecto (evita setState-en-effect).
  const [pausaOv, setPausaOv] = useState<{ key: string; map: Record<string, EstadoPausa> }>({ key: '', map: {} })

  const [ov, setOv] = useState<{ preset: PresetMetaAds; r: Cargable<CuentaMetaAds[]> } | null>(null)
  useEffect(() => {
    let vivo = true
    traerOverview({ preset }).then((r) => {
      if (!vivo) return
      setOv({ preset, r: r.ok ? { fase: 'ok', data: r.dato.cuentas } : { fase: 'error', motivo: r.motivo } })
    })
    return () => { vivo = false }
  }, [preset])

  const ovEstado: Cargable<CuentaMetaAds[]> = !ov || ov.preset !== preset ? { fase: 'cargando' } : ov.r
  const cuentas = ovEstado.fase === 'ok' ? ovEstado.data : []
  const activaId = elegida ?? cuentas[0]?.id ?? null

  const [det, setDet] = useState<{ key: string; r: Cargable<DetalleCuenta> } | null>(null)
  useEffect(() => {
    if (!activaId) return
    let vivo = true
    const key = `${activaId}|${preset}`
    traerDetalleCuenta(activaId, { preset }).then((r) => {
      if (!vivo) return
      setDet({ key, r: r.ok ? { fase: 'ok', data: r.dato } : { fase: 'error', motivo: r.motivo } })
    })
    return () => { vivo = false }
  }, [activaId, preset])

  const detKey = activaId ? `${activaId}|${preset}` : ''
  const detEstado: Cargable<DetalleCuenta> = !activaId || !det || det.key !== detKey ? { fase: 'cargando' } : det.r

  // Override activo solo si corresponde a la vista actual; al cambiar de cuenta/rango queda {}.
  const ovMap = pausaOv.key === detKey ? pausaOv.map : {}

  async function onToggle(adId: string, actual: string | null | undefined) {
    const efectivo = ovMap[adId]?.status ?? actual
    const activo = efectivo === 'ACTIVE'
    const next: 'ACTIVE' | 'PAUSED' = activo ? 'PAUSED' : 'ACTIVE'
    const ok = window.confirm(
      activo
        ? '¿Pausar este anuncio? Deja de mostrarse y de gastar hasta que lo reactives.'
        : '¿Activar este anuncio? Vuelve a mostrarse y a consumir presupuesto.',
    )
    if (!ok) return
    const set = (v: EstadoPausa) => setPausaOv((o) => {
      const base = o.key === detKey ? o.map : {}
      return { key: detKey, map: { ...base, [adId]: { ...base[adId], ...v } } }
    })
    set({ pending: true, error: undefined })
    const r = await pausarAnuncio(adId, next)
    set(r.ok ? { status: r.dato.status, pending: false } : { pending: false, error: r.motivo })
  }

  const pausa: CtxPausa = { puede: puedePausar, ov: ovMap, onToggle }
  const zonaActiva = cuentas.find((c) => c.id === activaId)?.zona || ''

  return (
    <div>
      {/* Rango + info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: paleta.ink2, display: 'flex', alignItems: 'center', gap: 6 }}>
          Rango:
          <select value={preset} onChange={(e) => setPreset(e.target.value as PresetMetaAds)} style={{ padding: '6px 10px', border: `1px solid ${paleta.line2}`, borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
            {RANGOS.map((r) => <option key={r.k} value={r.k}>{r.label}</option>)}
          </select>
        </label>
        {/* En rangos cortos la zona horaria de la cuenta ES el dato: "Hoy" lo resuelve Meta allá,
            así que si la cuenta está en otro huso, el corte del día no es el de acá. */}
        {(preset === 'today' || preset === 'yesterday') && zonaActiva && (
          <span style={{ fontSize: 12, color: paleta.mut2 }} title="El día lo corta Meta en la zona horaria de la cuenta publicitaria, no en la tuya">
            en hora de {zonaActiva}
          </span>
        )}
        <InfoPopover titulo="Sobre estos números">
          <p>De la API de Marketing de Meta (solo lectura). Las <b>ventas</b> y el <b>ROAS</b> usan las compras <i>omni_purchase</i> con ventana de atribución <b>7 días clic / 1 día view</b>.</p>
          <p>Si el píxel/CAPI de Meta no está midiendo compras, ventas y ROAS aparecen en <b>0</b> aunque haya gasto — es un tema de configuración del píxel, no del reporte.</p>
        </InfoPopover>
      </div>

      {/* Selector de cuenta (chips) */}
      {ovEstado.fase === 'error' ? (
        <div className="card" style={{ color: paleta.danger }}>
          No se pudieron traer las cuentas de Meta: {ovEstado.motivo}
          <div style={{ fontSize: 12, color: paleta.mut2, marginTop: 6 }}>Si dice &quot;Meta Ads no configurado&quot;, falta <code>META_ADS_TOKEN</code> en el servidor.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {ovEstado.fase === 'cargando' ? (
            <span style={{ fontSize: 13, color: paleta.mut2 }}>Cargando cuentas…</span>
          ) : (
            cuentas.map((c) => <ChipCuenta key={c.id} c={c} activa={c.id === activaId} onClick={() => setElegida(c.id)} />)
          )}
        </div>
      )}

      {/* Detalle de la cuenta activa */}
      {activaId && (
        detEstado.fase === 'cargando' ? (
          <div className="card" style={{ color: paleta.mut2 }}>Cargando anuncios, evolución y placements…</div>
        ) : detEstado.fase === 'error' ? (
          <div className="card" style={{ color: paleta.danger }}>No se pudo traer el detalle: {detEstado.motivo}</div>
        ) : (
          // El nombre sale del selector, no del detalle: el overview es el único que
          // conoce el portfolio dueño cuando la cuenta no tiene nombre propio.
          <Detalle d={detEstado.data} pausa={pausa} nombre={cuentas.find((c) => c.id === activaId)?.nombre} />
        )
      )}
    </div>
  )
}

function ChipCuenta({ c, activa, onClick }: { c: CuentaMetaAds; activa: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={`Cuenta ${c.id}`}
      style={{
        // `height: auto` no es de adorno: la regla legacy `.shell-content button` le fija a
        // TODO botón la altura de un control (una línea), y este tiene dos → el importe se
        // salía de la caja y el borde inferior lo cruzaba como si estuviera tachado.
        height: 'auto',
        border: `1px solid ${activa ? paleta.brandSolid : paleta.line2}`,
        background: activa ? paleta.brandBg : paleta.surface,
        borderRadius: 10,
        padding: '8px 12px',
        cursor: 'pointer',
        textAlign: 'left',
        minWidth: 140,
        lineHeight: 1.35,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: activa ? paleta.brand : paleta.ink2 }}>{c.nombre}</div>
      <div style={{ fontSize: 12, fontWeight: 400, color: paleta.mut }}>{c.error ? 'error' : c.sinDatos ? 'sin gasto en el rango' : money(c.spend, c.moneda)}</div>
    </button>
  )
}

function Detalle({ d, pausa, nombre }: { d: DetalleCuenta; pausa: CtxPausa; nombre?: string }) {
  const moneda = d.cuenta.moneda
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Totales */}
      <div className="card">
        <div style={{ fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: 0, marginBottom: 10 }}>Totales · {nombre || d.cuenta.nombre}</div>
        <TilesTotales t={d.totales} moneda={moneda} hookRate={d.video?.hookRate} />
      </div>

      {/* Las pautas de venta, aparte */}
      {d.venta && d.venta.campañas > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: paleta.mut, letterSpacing: 0 }}>Solo las pautas de venta</div>
            <InfoPopover titulo="Por qué este ROAS y no el de arriba">
              <p>El ROAS de la cuenta mezcla <b>todas</b> las campañas, incluidas las de tráfico o reconocimiento, que ni
              siquiera están optimizando para que alguien compre. Eso lo hunde sin que signifique nada.</p>
              <p>Acá van solo las campañas cuyo objetivo en Meta es vender, que son las que se juzgan por el retorno.
              A las de tráfico se les mira el <b>costo por visita al perfil</b>, en su propia fila más abajo.</p>
            </InfoPopover>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))', gap: 10 }}>
            <Tile label="ROAS de venta" valor={roas(d.venta.roas)} destacado color={paleta.success} />
            <Tile label="Gasto en venta" valor={money(d.venta.spend, moneda)} />
            <Tile label="Ingresos" valor={money(d.venta.revenue, moneda)} />
            <Tile label="Compras" valor={entero(d.venta.purchases)} />
            <Tile label="Campañas" valor={`${d.venta.campañas} de ${d.campañas.length}`} />
          </div>
        </div>
      )}

      {/* Embudo de compra */}
      {d.funnel && d.funnel.some((p) => p.count > 0) && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: 0 }}>Embudo de compra</div>
            <InfoPopover titulo="Embudo de compra">
              De cada paso, cuántas personas lo hicieron y cuánto costó cada resultado (gasto ÷ cantidad).
              La barra muestra la caída respecto del primer paso. Sirve para ver <b>dónde se corta</b> el camino a la compra.
            </InfoPopover>
          </div>
          <Embudo pasos={d.funnel} moneda={moneda} />
        </div>
      )}

      {/* Quién (edad × género) */}
      {d.demografia && d.demografia.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: 0, marginBottom: 10 }}>Quién compra · edad y género</div>
          <TablaDemografia rows={d.demografia} moneda={moneda} />
        </div>
      )}

      {/* Dónde (región) */}
      {d.regiones && d.regiones.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: 0, marginBottom: 10 }}>Dónde · por región</div>
          <TablaRegiones rows={d.regiones} moneda={moneda} />
        </div>
      )}

      {/* Evolución diaria */}
      {d.daily.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: 0, marginBottom: 10 }}>Evolución diaria</div>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={d.daily} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColor.grid} />
                <XAxis dataKey="date" tickFormatter={diaCorto} tick={{ fontSize: 11, fill: paleta.mut2 }} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: paleta.mut2 }} width={48} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: paleta.mut2 }} width={48} />
                <Tooltip
                  labelFormatter={(v) => diaCorto(String(v))}
                  formatter={(val: number, name) => [name === 'Gasto' || name === 'Ingresos' ? money(val, moneda) : entero(val), name]}
                />
                <Bar yAxisId="l" dataKey="spend" name="Gasto" fill={chartColor.brand} radius={[3, 3, 0, 0]} />
                <Line yAxisId="r" dataKey="revenue" name="Ingresos" stroke={chartColor.success} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Anuncios por campaña */}
      <div className="card">
        <div style={{ fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: 0, marginBottom: 10 }}>Anuncios por campaña</div>
        {d.campañas.length === 0 ? (
          <div style={{ fontSize: 13, color: paleta.mut2 }}>No hay anuncios con gasto en este rango.</div>
        ) : (
          d.campañas.map((c) => <CampañaBloque key={c.id} c={c} moneda={moneda} accountId={d.cuenta.id} pausa={pausa} accionesVistas={d.accionesVistas} />)
        )}
      </div>

      {/* Placements */}
      {d.placements.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: 0, marginBottom: 10 }}>Por plataforma y ubicación</div>
          <TablaPlacements rows={d.placements} moneda={moneda} />
        </div>
      )}
    </div>
  )
}

function TilesTotales({ t, moneda, hookRate }: { t: Metricas; moneda: string; hookRate?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))', gap: 10 }}>
      <Tile label="Gasto" valor={money(t.spend, moneda)} destacado />
      <Tile label="Compras" valor={entero(t.purchases)} />
      <Tile label="Ingresos" valor={money(t.revenue, moneda)} destacado color={paleta.success} />
      <Tile label="ROAS" valor={roas(t.roas)} destacado color={paleta.success} />
      <Tile label="Impresiones" valor={entero(t.impressions)} />
      <Tile label="Alcance" valor={entero(t.reach)} />
      <Tile label="CTR" valor={pct(t.ctr)} />
      <Tile label="CPC" valor={money(t.cpc, moneda)} />
      {hookRate ? <Tile label="Hook (video)" valor={pct(hookRate)} /> : null}
    </div>
  )
}

// Embudo: cada paso con su cantidad, costo por resultado y una barra proporcional al primer paso.
function Embudo({ pasos, moneda }: { pasos: FunnelPaso[]; moneda: string }) {
  const base = pasos[0]?.count || 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {pasos.map((p) => {
        const pctBar = base ? Math.max(2, (p.count / base) * 100) : 0
        return (
          <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ width: 130, fontSize: 13, color: paleta.ink2 }}>{p.label}</div>
            <div style={{ flex: 1, minWidth: 120, background: paleta.bg2, borderRadius: 6, height: 22, position: 'relative', overflow: 'hidden' }}>
              <div style={{ width: `${pctBar}%`, background: paleta.brandBorder, height: '100%', borderRadius: 6 }} />
              <span style={{ position: 'absolute', left: 8, top: 0, lineHeight: '22px', fontSize: 12, fontWeight: 600, color: paleta.brand }}>{entero(p.count)}</span>
            </div>
            <div style={{ width: 130, textAlign: 'right', fontSize: 12, color: paleta.mut }}>
              {p.count ? `${money(p.costo, moneda)} c/u` : '—'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TablaDemografia({ rows, moneda }: { rows: DemografiaFila[]; moneda: string }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: paleta.mut2, fontSize: 11, letterSpacing: '.03em' }}>
            <Th left>Género</Th><Th left>Edad</Th><Th>Gasto</Th><Th>Compras</Th><Th>Ingresos</Th><Th>ROAS</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${paleta.bg2}` }}>
              <td style={{ padding: '7px 10px', fontWeight: 500 }}>{genero(r.gender)}</td>
              <td style={{ padding: '7px 10px', color: paleta.mut }}>{r.age || '—'}</td>
              <Td>{money(r.spend, moneda)}</Td>
              <Td>{entero(r.purchases)}</Td>
              <Td>{money(r.revenue, moneda)}</Td>
              <Td color={r.spend && r.revenue ? paleta.success : paleta.mut2}>{roas(r.spend ? r.revenue / r.spend : 0)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TablaRegiones({ rows, moneda }: { rows: RegionFila[]; moneda: string }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: paleta.mut2, fontSize: 11, letterSpacing: '.03em' }}>
            <Th left>Región</Th><Th>Gasto</Th><Th>Compras</Th><Th>Ingresos</Th><Th>ROAS</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${paleta.bg2}` }}>
              <td style={{ padding: '7px 10px', fontWeight: 500 }}>{r.region}</td>
              <Td>{money(r.spend, moneda)}</Td>
              <Td>{entero(r.purchases)}</Td>
              <Td>{money(r.revenue, moneda)}</Td>
              <Td color={r.spend && r.revenue ? paleta.success : paleta.mut2}>{roas(r.spend ? r.revenue / r.spend : 0)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Tile({ label, valor, destacado, color }: { label: string; valor: string; destacado?: boolean; color?: string }) {
  return (
    <div style={{ background: paleta.bg, border: `1px solid ${paleta.line}`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: paleta.mut2, letterSpacing: 0 }}>{label}</div>
      <div style={{ fontSize: destacado ? 19 : 16, fontWeight: 700, color: color ?? paleta.ink, marginTop: 2 }}>{valor}</div>
    </div>
  )
}

function CampañaBloque({ c, moneda, accountId, pausa, accionesVistas }: { c: Campaña; moneda: string; accountId: string; pausa: CtxPausa; accionesVistas?: string[] }) {
  const [abierta, setAbierta] = useState(true)
  return (
    <div style={{ border: `1px solid ${paleta.line}`, borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
      <button
        onClick={() => setAbierta((v) => !v)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 12px', background: paleta.bg, border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: paleta.ink }}>
          <span style={{ color: paleta.mut2, marginRight: 6 }}>{abierta ? '▾' : '▸'}</span>{c.nombre}
          {c.tipo && c.tipo !== 'otro' ? (
            <Badge txt={c.tipo === 'venta' ? 'venta' : 'tráfico'} color={c.tipo === 'venta' ? paleta.success : paleta.brand} bg={c.tipo === 'venta' ? paleta.successBg : paleta.brandBg} />
          ) : null}
          <span style={{ color: paleta.mut2, fontWeight: 400 }}> · {c.ads.length} anuncio{c.ads.length === 1 ? '' : 's'}</span>
        </div>
        <div style={{ fontSize: 12, color: paleta.ink2, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span>Gasto <b>{money(c.totales.spend, moneda)}</b></span>
          {/* Una campaña de tráfico no se juzga por ROAS: su resultado es traer gente al perfil. */}
          {c.tipo === 'trafico' ? (
            <>
              <span>Visitas al perfil <b>{entero(c.totales.perfil)}</b></span>
              <span
                style={{ color: paleta.brand }}
                title={c.totales.perfil ? undefined : `Meta no devolvió visitas al perfil en esta cuenta. Acciones que sí trajo: ${(accionesVistas || []).join(', ') || 'ninguna'}`}
              >
                Costo por visita <b>{c.totales.perfil ? money(c.totales.costoPerfil, moneda) : '—'}</b>
              </span>
            </>
          ) : (
            <>
              <span>Compras <b>{entero(c.totales.purchases)}</b></span>
              <span style={{ color: paleta.success }}>ROAS <b>{roas(c.totales.roas)}</b></span>
            </>
          )}
        </div>
      </button>
      {abierta && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: paleta.mut2, fontSize: 11, letterSpacing: '.03em' }}>
                <Th left>Anuncio</Th><Th>Gasto</Th><Th>Compras</Th><Th>Ingresos</Th><Th>ROAS</Th><Th>CTR</Th><Th>CPC</Th><Th>Impr.</Th>
              </tr>
            </thead>
            <tbody>
              {c.ads.map((a) => <FilaAd key={a.ad_id} a={a} moneda={moneda} accountId={accountId} pausa={pausa} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Deep-link a Ads Manager con el anuncio ya seleccionado: ahí Bruno pausa/edita con su propio login.
const adsManagerUrl = (accountId: string, adId: string) =>
  `https://www.facebook.com/adsmanager/manage/ads?act=${accountId}&selected_ad_ids=${adId}`

function LinkAccion({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: paleta.brandSolid, textDecoration: 'none', fontWeight: 500 }}>
      {children}
    </a>
  )
}

function FilaAd({ a, moneda, accountId, pausa }: { a: AdRow; moneda: string; accountId: string; pausa: CtxPausa }) {
  const ovAd = pausa.ov[a.ad_id]
  const statusEfectivo = ovAd?.status ?? a.status
  const estado = rotuloEstado(statusEfectivo)
  const activo = statusEfectivo === 'ACTIVE'
  const puedeToggle = pausa.puede && (activo || statusEfectivo === 'PAUSED') // solo si sabemos el estado real
  const rk = a.ranking
  const badges = [
    estado,
    rk ? rotuloRanking(rk.quality) : null,
    rk ? rotuloRanking(rk.conversion) : null,
  ].filter((b): b is { txt: string; color: string; bg: string } => b !== null)
  const gestion = adsManagerUrl(accountId, a.ad_id)
  return (
    <tr style={{ borderTop: `1px solid ${paleta.bg2}` }}>
      <td style={{ padding: '7px 10px', maxWidth: 340 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {/* Preview del creativo → abre el aviso publicado (o Ads Manager si no hay permalink). */}
          <a
            href={a.permalink || gestion}
            target="_blank"
            rel="noopener noreferrer"
            title="Ver el aviso"
            style={{ flexShrink: 0, width: 46, height: 46, borderRadius: 8, overflow: 'hidden', border: `1px solid ${paleta.line}`, background: paleta.bg2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {a.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.thumb} alt="" width={46} height={46} style={{ width: 46, height: 46, objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 18 }}>🖼️</span>
            )}
          </a>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 500, color: paleta.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.ad_name}</div>
            {a.adset_name ? <div style={{ fontSize: 11, color: paleta.mut2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.adset_name}</div> : null}
            {(badges.length > 0 || (a.video && a.video.hookRate > 0)) && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
                {badges.map((b, i) => <Badge key={i} {...b} />)}
                {a.video && a.video.hookRate > 0 ? <span style={{ fontSize: 11, color: paleta.mut }}>Hook {pct(a.video.hookRate)}</span> : null}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
              {puedeToggle && (
                <button
                  onClick={() => pausa.onToggle(a.ad_id, statusEfectivo)}
                  disabled={ovAd?.pending}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: ovAd?.pending ? paleta.mut2 : activo ? paleta.warningInk : paleta.success,
                    background: ovAd?.pending ? paleta.bg2 : activo ? paleta.warningBg : paleta.successBg,
                    border: `1px solid ${activo ? paleta.warningBorder : paleta.successBorder}`,
                    borderRadius: 6,
                    padding: '2px 9px',
                    cursor: ovAd?.pending ? 'default' : 'pointer',
                  }}
                >
                  {ovAd?.pending ? '…' : activo ? '⏸ Pausar' : '▶ Activar'}
                </button>
              )}
              <LinkAccion href={gestion}>Ads Manager ↗</LinkAccion>
              {a.permalink ? <LinkAccion href={a.permalink}>Ver aviso ↗</LinkAccion> : null}
              {ovAd?.error ? <span style={{ fontSize: 11, color: paleta.danger }}>No se pudo: {ovAd.error}</span> : null}
            </div>
          </div>
        </div>
      </td>
      <Td>{money(a.spend, moneda)}</Td>
      <Td>{entero(a.purchases)}</Td>
      <Td>{money(a.revenue, moneda)}</Td>
      <Td color={a.roas ? paleta.success : paleta.mut2}>{roas(a.roas)}</Td>
      <Td>{nf1.format(a.ctr)}%</Td>
      <Td>{money(a.cpc, moneda)}</Td>
      <Td>{entero(a.impressions)}</Td>
    </tr>
  )
}

function TablaPlacements({ rows, moneda }: { rows: { platform: string; position: string; spend: number; purchases: number; revenue: number }[]; moneda: string }) {
  const nombrePlat = (p: string) => (p === 'facebook' ? 'Facebook' : p === 'instagram' ? 'Instagram' : p === 'audience_network' ? 'Audience Network' : p === 'messenger' ? 'Messenger' : p || '—')
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: paleta.mut2, fontSize: 11, letterSpacing: '.03em' }}>
            <Th left>Plataforma</Th><Th left>Ubicación</Th><Th>Gasto</Th><Th>Compras</Th><Th>Ingresos</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${paleta.bg2}` }}>
              <td style={{ padding: '7px 10px', fontWeight: 500 }}>{nombrePlat(p.platform)}</td>
              <td style={{ padding: '7px 10px', color: paleta.mut }}>{p.position || '—'}</td>
              <Td>{money(p.spend, moneda)}</Td>
              <Td>{entero(p.purchases)}</Td>
              <Td>{money(p.revenue, moneda)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, left }: { children?: React.ReactNode; left?: boolean }) {
  return <th style={{ padding: '4px 10px', textAlign: left ? 'left' : 'right', fontWeight: 600 }}>{children}</th>
}
function Td({ children, color }: { children?: React.ReactNode; color?: string }) {
  return <td style={{ padding: '7px 10px', textAlign: 'right', color: color ?? paleta.ink2 }}>{children}</td>
}
