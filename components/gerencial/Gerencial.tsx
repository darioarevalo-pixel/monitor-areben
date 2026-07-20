'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSesion } from '@/components/SesionProvider'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { useGerencial } from './useGerencial'
import {
  ETIQUETA_AREA,
  ETIQUETA_SEVERIDAD,
  SEVERIDADES,
  type Accion,
  type Accionable,
  type Area,
  type Severidad,
} from '@/lib/gerencial/tipos'
import type { Marca } from '@/lib/nav.generated'

/**
 * Panel Gerencial (key `gerencial`): la vista de decisiones. Toma los accionables que
 * arman los detectores (multimarca) y los muestra ordenados por severidad, con la
 * recomendación y un botón que lleva a la sección donde se ejecuta. Read-only (fase 1).
 */

const COLOR_SEVERIDAD: Record<Severidad, { fondo: string; texto: string; punto: string }> = {
  critico: { fondo: '#FEF2F2', texto: '#B91C1C', punto: '#DC2626' },
  atencion: { fondo: '#FFFBEB', texto: '#B45309', punto: '#F59E0B' },
  oportunidad: { fondo: '#F0FDF4', texto: '#15803D', punto: '#22C55E' },
}

/** Orden de preferencia de las áreas en el filtro. */
const AREAS: Area[] = ['comercial', 'operativo', 'importaciones', 'stock', 'ads']

export function Gerencial() {
  const { accionables, cargando, errores, recargar } = useGerencial()
  const [fSev, setFSev] = useState<Severidad | 'todas'>('todas')
  const [fArea, setFArea] = useState<Area | 'todas'>('todas')

  const visibles = useMemo(
    () =>
      accionables.filter(
        (a) => (fSev === 'todas' || a.severidad === fSev) && (fArea === 'todas' || a.area === fArea),
      ),
    [accionables, fSev, fArea],
  )

  const conteoSev = (s: Severidad) => accionables.filter((a) => a.severidad === s).length
  const areasPresentes = AREAS.filter((ar) => accionables.some((a) => a.area === ar))
  const filtrando = fSev !== 'todas' || fArea !== 'todas'

  return (
    <div>
      {/* Resumen por severidad + acciones */}
      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {SEVERIDADES.map((s) => (
          <PillSeveridad
            key={s}
            sev={s}
            n={conteoSev(s)}
            activo={fSev === s}
            onClick={() => setFSev(fSev === s ? 'todas' : s)}
          />
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <InfoPopover titulo="Panel Gerencial">
            Reúne, de todas tus marcas, lo que requiere una decisión: capital parado, productos en
            declive, pendientes operativos e importaciones. Cada tarjeta te lleva a la sección donde se
            ejecuta. Es de solo lectura.
          </InfoPopover>
          <button
            className="btn-sm"
            onClick={recargar}
            style={{ background: '#fff', border: '1px solid #D1D5DB' }}
          >
            🔄 Actualizar
          </button>
        </div>
      </div>

      {/* Filtro por área */}
      {areasPresentes.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 2px' }}>
          <Chip label="Todas las áreas" activo={fArea === 'todas'} onClick={() => setFArea('todas')} />
          {areasPresentes.map((ar) => (
            <Chip
              key={ar}
              label={ETIQUETA_AREA[ar]}
              activo={fArea === ar}
              onClick={() => setFArea(fArea === ar ? 'todas' : ar)}
            />
          ))}
        </div>
      )}

      {errores.length > 0 && (
        <div
          className="card"
          style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', fontSize: 13 }}
        >
          ⚠️ Algunos datos no cargaron ({errores.join(' · ')}). El panel muestra el resto.
        </div>
      )}

      {cargando && accionables.length === 0 ? (
        <div className="card" style={{ color: '#9CA3AF' }}>Analizando el negocio…</div>
      ) : visibles.length === 0 ? (
        <div className="card" style={{ color: '#059669', fontSize: 14 }}>
          ✅ {filtrando ? 'No hay accionables con estos filtros.' : 'No hay accionables pendientes. Todo en orden.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cargando && (
            <div style={{ fontSize: 12, color: '#9CA3AF', padding: '0 2px' }}>Actualizando…</div>
          )}
          {visibles.map((a) => (
            <CardAccionable key={a.id} a={a} />
          ))}
        </div>
      )}
    </div>
  )
}

function CardAccionable({ a }: { a: Accionable }) {
  const c = COLOR_SEVERIDAD[a.severidad]
  return (
    <div className="card" style={{ borderLeft: `4px solid ${c.punto}`, background: c.fondo }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
        <MarcaChip marca={a.marca} />
        <span style={{ fontSize: 11, fontWeight: 700, color: c.texto, textTransform: 'uppercase', letterSpacing: 0.3 }}>
          {ETIQUETA_SEVERIDAD[a.severidad]}
        </span>
        <span
          style={{
            fontSize: 11,
            color: '#6B7280',
            background: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: 6,
            padding: '1px 7px',
          }}
        >
          {ETIQUETA_AREA[a.area]}
        </span>
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{a.titulo}</div>
      <div style={{ fontSize: 13, color: '#4B5563', marginTop: 3 }}>{a.detalle}</div>
      <div style={{ fontSize: 13, color: '#111827', marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <span aria-hidden>💡</span>
        <span>
          <b>Qué hacer:</b> {a.recomendacion}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {a.acciones.map((ac, i) => (
          <BotonAccion key={i} marca={a.marca} accion={ac} />
        ))}
      </div>
    </div>
  )
}

function BotonAccion({ marca, accion }: { marca: Marca; accion: Accion }) {
  const router = useRouter()
  const { marca: marcaActiva, setMarca } = useSesion()
  const ir = () => {
    if (marcaActiva !== marca) setMarca(marca)
    router.push(`/${accion.seccion}`)
  }
  return (
    <button className="btn-sm" onClick={ir} style={{ background: '#111827', color: '#fff', border: 'none' }}>
      {accion.label} →
    </button>
  )
}

function PillSeveridad({ sev, n, activo, onClick }: { sev: Severidad; n: number; activo: boolean; onClick: () => void }) {
  const c = COLOR_SEVERIDAD[sev]
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        border: `1px solid ${activo ? c.punto : '#E5E7EB'}`,
        background: activo ? c.fondo : '#fff',
        borderRadius: 9,
        padding: '6px 11px',
        cursor: 'pointer',
        fontSize: 13,
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.punto, display: 'inline-block' }} />
      <span style={{ fontWeight: 700, color: '#111827' }}>{n}</span>
      <span style={{ color: '#6B7280' }}>{ETIQUETA_SEVERIDAD[sev]}</span>
    </button>
  )
}

function Chip({ label, activo, onClick }: { label: string; activo: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="btn-sm"
      style={{
        background: activo ? '#111827' : '#fff',
        color: activo ? '#fff' : '#374151',
        border: `1px solid ${activo ? '#111827' : '#D1D5DB'}`,
      }}
    >
      {label}
    </button>
  )
}

function MarcaChip({ marca }: { marca: Marca }) {
  return marca === 'zattia' ? (
    <span style={{ background: '#EDE9FE', color: '#5B21B6', borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
      Zattia
    </span>
  ) : (
    <span style={{ background: '#DBEAFE', color: '#1E40AF', borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
      BDI
    </span>
  )
}
