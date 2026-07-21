'use client'

import { useEffect, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { traerDetalleCuenta, traerOverview } from '@/lib/meta-ads/cliente'
import type { AdRow, Campaña, CuentaMetaAds, DemografiaFila, DetalleCuenta, FunnelPaso, Metricas, PresetMetaAds, RegionFila } from '@/lib/meta-ads/tipos'

const RANGOS: { k: PresetMetaAds; label: string }[] = [
  { k: 'today', label: 'Hoy' },
  { k: 'yesterday', label: 'Ayer' },
  { k: 'last_7d', label: 'Últimos 7 días' },
  { k: 'last_30d', label: 'Últimos 30 días' },
  { k: 'last_90d', label: 'Últimos 90 días' },
  { k: 'this_month', label: 'Este mes' },
  { k: 'last_month', label: 'Mes pasado' },
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
  if (r === 'ABOVE_AVERAGE') return { txt: 'Arriba del promedio', color: '#15803D', bg: '#F0FDF4' }
  if (r === 'AVERAGE') return { txt: 'En el promedio', color: '#6B7280', bg: '#F3F4F6' }
  return { txt: 'Debajo del promedio', color: '#B91C1C', bg: '#FEF2F2' } // BELOW_AVERAGE_10/20/35
}

// Rótulo + color del estado de entrega (effective_status).
function rotuloEstado(s?: string | null): { txt: string; color: string; bg: string } | null {
  if (!s) return null
  if (s === 'ACTIVE') return { txt: 'Activo', color: '#15803D', bg: '#F0FDF4' }
  if (s === 'PAUSED' || s === 'ADSET_PAUSED' || s === 'CAMPAIGN_PAUSED') return { txt: 'Pausado', color: '#6B7280', bg: '#F3F4F6' }
  if (s === 'PENDING_REVIEW' || s === 'IN_PROCESS' || s === 'PENDING_PROCESSING') return { txt: 'En revisión', color: '#B45309', bg: '#FFFBEB' }
  if (s === 'DISAPPROVED' || s === 'WITH_ISSUES') return { txt: 'Con problemas', color: '#B91C1C', bg: '#FEF2F2' }
  return { txt: s.toLowerCase().replace(/_/g, ' '), color: '#6B7280', bg: '#F3F4F6' }
}

const genero = (g: string) => (g === 'male' ? 'Hombres' : g === 'female' ? 'Mujeres' : g === 'unknown' ? 'Sin dato' : g || '—')

function Badge({ txt, color, bg }: { txt: string; color: string; bg: string }) {
  return <span style={{ fontSize: 11, fontWeight: 600, color, background: bg, borderRadius: 6, padding: '1px 7px', whiteSpace: 'nowrap' }}>{txt}</span>
}

type Cargable<T> = { fase: 'cargando' } | { fase: 'error'; motivo: string } | { fase: 'ok'; data: T }

export function MetaAds() {
  const [preset, setPreset] = useState<PresetMetaAds>('last_30d')
  const [elegida, setElegida] = useState<string | null>(null)

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

  const detEstado: Cargable<DetalleCuenta> = !activaId || !det || det.key !== `${activaId}|${preset}` ? { fase: 'cargando' } : det.r

  return (
    <div>
      {/* Rango + info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
          Rango:
          <select value={preset} onChange={(e) => setPreset(e.target.value as PresetMetaAds)} style={{ padding: '6px 10px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
            {RANGOS.map((r) => <option key={r.k} value={r.k}>{r.label}</option>)}
          </select>
        </label>
        <InfoPopover titulo="Sobre estos números">
          <p>De la API de Marketing de Meta (solo lectura). Las <b>ventas</b> y el <b>ROAS</b> usan las compras <i>omni_purchase</i> con ventana de atribución <b>7 días clic / 1 día view</b>.</p>
          <p>Si el píxel/CAPI de Meta no está midiendo compras, ventas y ROAS aparecen en <b>0</b> aunque haya gasto — es un tema de configuración del píxel, no del reporte.</p>
        </InfoPopover>
      </div>

      {/* Selector de cuenta (chips) */}
      {ovEstado.fase === 'error' ? (
        <div className="card" style={{ color: '#DC2626' }}>
          No se pudieron traer las cuentas de Meta: {ovEstado.motivo}
          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 6 }}>Si dice &quot;Meta Ads no configurado&quot;, falta <code>META_ADS_TOKEN</code> en el servidor.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {ovEstado.fase === 'cargando' ? (
            <span style={{ fontSize: 13, color: '#9CA3AF' }}>Cargando cuentas…</span>
          ) : (
            cuentas.map((c) => <ChipCuenta key={c.id} c={c} activa={c.id === activaId} onClick={() => setElegida(c.id)} />)
          )}
        </div>
      )}

      {/* Detalle de la cuenta activa */}
      {activaId && (
        detEstado.fase === 'cargando' ? (
          <div className="card" style={{ color: '#9CA3AF' }}>Cargando anuncios, evolución y placements…</div>
        ) : detEstado.fase === 'error' ? (
          <div className="card" style={{ color: '#DC2626' }}>No se pudo traer el detalle: {detEstado.motivo}</div>
        ) : (
          <Detalle d={detEstado.data} />
        )
      )}
    </div>
  )
}

function ChipCuenta({ c, activa, onClick }: { c: CuentaMetaAds; activa: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${activa ? '#378ADD' : '#D1D5DB'}`,
        background: activa ? '#EFF6FF' : '#fff',
        borderRadius: 10,
        padding: '8px 12px',
        cursor: 'pointer',
        textAlign: 'left',
        minWidth: 140,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: activa ? '#1D4ED8' : '#374151' }}>{c.nombre}</div>
      <div style={{ fontSize: 12, color: '#6B7280' }}>{c.error ? 'error' : c.sinDatos ? 'sin datos' : money(c.spend, c.moneda)}</div>
    </button>
  )
}

function Detalle({ d }: { d: DetalleCuenta }) {
  const moneda = d.cuenta.moneda
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Totales */}
      <div className="card">
        <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Totales · {d.cuenta.nombre}</div>
        <TilesTotales t={d.totales} moneda={moneda} hookRate={d.video?.hookRate} />
      </div>

      {/* Embudo de compra */}
      {d.funnel && d.funnel.some((p) => p.count > 0) && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em' }}>Embudo de compra</div>
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
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Quién compra · edad y género</div>
          <TablaDemografia rows={d.demografia} moneda={moneda} />
        </div>
      )}

      {/* Dónde (región) */}
      {d.regiones && d.regiones.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Dónde · por región</div>
          <TablaRegiones rows={d.regiones} moneda={moneda} />
        </div>
      )}

      {/* Evolución diaria */}
      {d.daily.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Evolución diaria</div>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={d.daily} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F2" />
                <XAxis dataKey="date" tickFormatter={diaCorto} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: '#9CA3AF' }} width={48} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: '#9CA3AF' }} width={48} />
                <Tooltip
                  labelFormatter={(v) => diaCorto(String(v))}
                  formatter={(val: number, name) => [name === 'Gasto' || name === 'Ingresos' ? money(val, moneda) : entero(val), name]}
                />
                <Bar yAxisId="l" dataKey="spend" name="Gasto" fill="#93C5FD" radius={[3, 3, 0, 0]} />
                <Line yAxisId="r" dataKey="revenue" name="Ingresos" stroke="#16A34A" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Anuncios por campaña */}
      <div className="card">
        <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Anuncios por campaña</div>
        {d.campañas.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9CA3AF' }}>No hay anuncios con gasto en este rango.</div>
        ) : (
          d.campañas.map((c) => <CampañaBloque key={c.id} c={c} moneda={moneda} accountId={d.cuenta.id} />)
        )}
      </div>

      {/* Placements */}
      {d.placements.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Por plataforma y ubicación</div>
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
      <Tile label="Ingresos" valor={money(t.revenue, moneda)} destacado color="#16A34A" />
      <Tile label="ROAS" valor={roas(t.roas)} destacado color="#16A34A" />
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
            <div style={{ width: 130, fontSize: 13, color: '#374151' }}>{p.label}</div>
            <div style={{ flex: 1, minWidth: 120, background: '#F1F5F9', borderRadius: 6, height: 22, position: 'relative', overflow: 'hidden' }}>
              <div style={{ width: `${pctBar}%`, background: '#93C5FD', height: '100%', borderRadius: 6 }} />
              <span style={{ position: 'absolute', left: 8, top: 0, lineHeight: '22px', fontSize: 12, fontWeight: 600, color: '#1E3A8A' }}>{entero(p.count)}</span>
            </div>
            <div style={{ width: 130, textAlign: 'right', fontSize: 12, color: '#6B7280' }}>
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
          <tr style={{ color: '#9CA3AF', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em' }}>
            <Th left>Género</Th><Th left>Edad</Th><Th>Gasto</Th><Th>Compras</Th><Th>Ingresos</Th><Th>ROAS</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid #F1F5F9' }}>
              <td style={{ padding: '7px 10px', fontWeight: 500 }}>{genero(r.gender)}</td>
              <td style={{ padding: '7px 10px', color: '#6B7280' }}>{r.age || '—'}</td>
              <Td>{money(r.spend, moneda)}</Td>
              <Td>{entero(r.purchases)}</Td>
              <Td>{money(r.revenue, moneda)}</Td>
              <Td color={r.spend && r.revenue ? '#16A34A' : '#9CA3AF'}>{roas(r.spend ? r.revenue / r.spend : 0)}</Td>
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
          <tr style={{ color: '#9CA3AF', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em' }}>
            <Th left>Región</Th><Th>Gasto</Th><Th>Compras</Th><Th>Ingresos</Th><Th>ROAS</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid #F1F5F9' }}>
              <td style={{ padding: '7px 10px', fontWeight: 500 }}>{r.region}</td>
              <Td>{money(r.spend, moneda)}</Td>
              <Td>{entero(r.purchases)}</Td>
              <Td>{money(r.revenue, moneda)}</Td>
              <Td color={r.spend && r.revenue ? '#16A34A' : '#9CA3AF'}>{roas(r.spend ? r.revenue / r.spend : 0)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Tile({ label, valor, destacado, color }: { label: string; valor: string; destacado?: boolean; color?: string }) {
  return (
    <div style={{ background: '#F9FAFB', border: '1px solid #EEF0F2', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: destacado ? 19 : 16, fontWeight: 700, color: color ?? (destacado ? '#1F4E78' : '#111827'), marginTop: 2 }}>{valor}</div>
    </div>
  )
}

function CampañaBloque({ c, moneda, accountId }: { c: Campaña; moneda: string; accountId: string }) {
  const [abierta, setAbierta] = useState(true)
  return (
    <div style={{ border: '1px solid #EEF2F7', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
      <button
        onClick={() => setAbierta((v) => !v)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#FCFDFE', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
          <span style={{ color: '#9CA3AF', marginRight: 6 }}>{abierta ? '▾' : '▸'}</span>{c.nombre}
          <span style={{ color: '#9CA3AF', fontWeight: 400 }}> · {c.ads.length} anuncio{c.ads.length === 1 ? '' : 's'}</span>
        </div>
        <div style={{ fontSize: 12, color: '#374151', display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span>Gasto <b>{money(c.totales.spend, moneda)}</b></span>
          <span>Compras <b>{entero(c.totales.purchases)}</b></span>
          <span style={{ color: '#16A34A' }}>ROAS <b>{roas(c.totales.roas)}</b></span>
        </div>
      </button>
      {abierta && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: '#9CA3AF', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                <Th left>Anuncio</Th><Th>Gasto</Th><Th>Compras</Th><Th>Ingresos</Th><Th>ROAS</Th><Th>CTR</Th><Th>CPC</Th><Th>Impr.</Th>
              </tr>
            </thead>
            <tbody>
              {c.ads.map((a) => <FilaAd key={a.ad_id} a={a} moneda={moneda} accountId={accountId} />)}
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
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#2563EB', textDecoration: 'none', fontWeight: 500 }}>
      {children}
    </a>
  )
}

function FilaAd({ a, moneda, accountId }: { a: AdRow; moneda: string; accountId: string }) {
  const estado = rotuloEstado(a.status)
  const rk = a.ranking
  const badges = [
    estado,
    rk ? rotuloRanking(rk.quality) : null,
    rk ? rotuloRanking(rk.conversion) : null,
  ].filter((b): b is { txt: string; color: string; bg: string } => b !== null)
  const gestion = adsManagerUrl(accountId, a.ad_id)
  return (
    <tr style={{ borderTop: '1px solid #F1F5F9' }}>
      <td style={{ padding: '7px 10px', maxWidth: 340 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {/* Preview del creativo → abre el aviso publicado (o Ads Manager si no hay permalink). */}
          <a
            href={a.permalink || gestion}
            target="_blank"
            rel="noopener noreferrer"
            title="Ver el aviso"
            style={{ flexShrink: 0, width: 46, height: 46, borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E7EB', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {a.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.thumb} alt="" width={46} height={46} style={{ width: 46, height: 46, objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 18 }}>🖼️</span>
            )}
          </a>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.ad_name}</div>
            {a.adset_name ? <div style={{ fontSize: 11, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.adset_name}</div> : null}
            {(badges.length > 0 || (a.video && a.video.hookRate > 0)) && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
                {badges.map((b, i) => <Badge key={i} {...b} />)}
                {a.video && a.video.hookRate > 0 ? <span style={{ fontSize: 11, color: '#6B7280' }}>Hook {pct(a.video.hookRate)}</span> : null}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
              <LinkAccion href={gestion}>Ads Manager ↗</LinkAccion>
              {a.permalink ? <LinkAccion href={a.permalink}>Ver aviso ↗</LinkAccion> : null}
            </div>
          </div>
        </div>
      </td>
      <Td>{money(a.spend, moneda)}</Td>
      <Td>{entero(a.purchases)}</Td>
      <Td>{money(a.revenue, moneda)}</Td>
      <Td color={a.roas ? '#16A34A' : '#9CA3AF'}>{roas(a.roas)}</Td>
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
          <tr style={{ color: '#9CA3AF', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em' }}>
            <Th left>Plataforma</Th><Th left>Ubicación</Th><Th>Gasto</Th><Th>Compras</Th><Th>Ingresos</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={i} style={{ borderTop: '1px solid #F1F5F9' }}>
              <td style={{ padding: '7px 10px', fontWeight: 500 }}>{nombrePlat(p.platform)}</td>
              <td style={{ padding: '7px 10px', color: '#6B7280' }}>{p.position || '—'}</td>
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
  return <td style={{ padding: '7px 10px', textAlign: 'right', color: color ?? '#374151' }}>{children}</td>
}
