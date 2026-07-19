'use client'

import { useEffect, useState } from 'react'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { traerMetaAds } from '@/lib/meta-ads/cliente'
import type { CuentaMetaAds, PresetMetaAds, RespuestaMetaAds } from '@/lib/meta-ads/tipos'

/** Opciones del selector de rango (label → preset de Meta). */
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

type Resultado =
  | { fase: 'error'; motivo: string }
  | { fase: 'ok'; data: RespuestaMetaAds }

export function MetaAds() {
  const [preset, setPreset] = useState<PresetMetaAds>('last_30d')
  // El resultado guarda para QUÉ preset se cargó; si no coincide con el actual,
  // estamos cargando. Así "cargando" es derivado y no hace falta un setState
  // sincrónico en el effect (regla react-hooks/set-state-in-effect).
  const [res, setRes] = useState<{ preset: PresetMetaAds; r: Resultado } | null>(null)

  useEffect(() => {
    let vivo = true
    traerMetaAds({ preset }).then((r) => {
      if (!vivo) return
      setRes({ preset, r: r.ok ? { fase: 'ok', data: r.dato } : { fase: 'error', motivo: r.motivo } })
    })
    return () => {
      vivo = false
    }
  }, [preset])

  const estado: { fase: 'cargando' } | Resultado = !res || res.preset !== preset ? { fase: 'cargando' } : res.r

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <label style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
          Rango:
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as PresetMetaAds)}
            style={{ padding: '6px 10px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
          >
            {RANGOS.map((r) => (
              <option key={r.k} value={r.k}>{r.label}</option>
            ))}
          </select>
        </label>
        <InfoPopover titulo="De dónde salen estos números">
          <p>
            Vienen de la API de Marketing de Meta (solo lectura), leídas server-side con un token de sistema.
            Se listan las cuentas publicitarias a las que ese token tiene acceso de &quot;Ver rendimiento&quot;.
          </p>
          <p>
            El <b>gasto</b> está en la moneda de cada cuenta. <b>CTR</b> y <b>CPC</b> los calcula Meta.
            Una cuenta sin actividad en el rango aparece como &quot;sin datos&quot;.
          </p>
        </InfoPopover>
      </div>

      {estado.fase === 'cargando' ? (
        <div className="card" style={{ color: '#9CA3AF' }}>Cargando métricas de Meta…</div>
      ) : estado.fase === 'error' ? (
        <div className="card" style={{ color: '#DC2626' }}>
          No se pudieron traer las métricas de Meta{estado.motivo ? `: ${estado.motivo}` : '.'}
          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 6 }}>
            Si dice &quot;Meta Ads no configurado&quot;, falta la variable <code>META_ADS_TOKEN</code> en el servidor.
          </div>
        </div>
      ) : estado.data.cuentas.length === 0 ? (
        <div className="card" style={{ color: '#9CA3AF' }}>El token no tiene ninguna cuenta publicitaria asignada.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {estado.data.cuentas.map((c) => (
            <CuentaCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  )
}

function CuentaCard({ c }: { c: CuentaMetaAds }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: c.error || c.sinDatos ? 0 : 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>{c.nombre}</div>
        <div style={{ fontSize: 11, color: '#9CA3AF' }}>ID {c.id}{c.moneda ? ` · ${c.moneda}` : ''}</div>
      </div>

      {c.error ? (
        <div style={{ fontSize: 13, color: '#DC2626' }}>No se pudo leer esta cuenta: {c.error}</div>
      ) : c.sinDatos ? (
        <div style={{ fontSize: 13, color: '#9CA3AF' }}>Sin actividad en el rango.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          <Metrica label="Gasto" valor={money(c.spend, c.moneda)} destacado />
          <Metrica label="Impresiones" valor={entero(c.impressions)} />
          <Metrica label="Clics" valor={entero(c.clicks)} />
          <Metrica label="CTR" valor={`${nf1.format(c.ctr ?? 0)}%`} />
          <Metrica label="CPC" valor={money(c.cpc, c.moneda)} />
          <Metrica label="CPM" valor={money(c.cpm, c.moneda)} />
          <Metrica label="Alcance" valor={entero(c.reach)} />
          <Metrica label="Frecuencia" valor={nf1.format(c.frequency ?? 0)} />
        </div>
      )}
    </div>
  )
}

function Metrica({ label, valor, destacado }: { label: string; valor: string; destacado?: boolean }) {
  return (
    <div style={{ background: '#F9FAFB', border: '1px solid #EEF0F2', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: destacado ? 20 : 17, fontWeight: 700, color: destacado ? '#1F4E78' : '#111827', marginTop: 2 }}>{valor}</div>
    </div>
  )
}
