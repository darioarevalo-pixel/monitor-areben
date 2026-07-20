'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSesion } from '@/components/SesionProvider'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { esAdmin, puedeSub } from '@/lib/permisos'
import { aprobarConsumo, rechazarConsumo } from '@/lib/gerencial/acciones'
import { DIAS_SNOOZE, idsSilenciados, reactivar, silenciar } from '@/lib/gerencial/snooze'
import { useGerencial } from './useGerencial'
import {
  ETIQUETA_AREA,
  ETIQUETA_SEVERIDAD,
  SEVERIDADES,
  type Accion,
  type Accionable,
  type Area,
  type ConsumoPendiente,
  type Severidad,
} from '@/lib/gerencial/tipos'
import type { Marca } from '@/lib/nav.generated'

/**
 * Panel Gerencial (key `gerencial`): la vista de decisiones. Toma los accionables que
 * arman los detectores (multimarca + Ads global) y los muestra ordenados por severidad,
 * con la recomendación y acciones: link a la sección, silenciar (baja el ruido), y —en la
 * tarjeta de aprobaciones— aprobar/rechazar consumos in-place.
 */

const COLOR_SEVERIDAD: Record<Severidad, { fondo: string; texto: string; punto: string }> = {
  critico: { fondo: '#FEF2F2', texto: '#B91C1C', punto: '#DC2626' },
  atencion: { fondo: '#FFFBEB', texto: '#B45309', punto: '#F59E0B' },
  oportunidad: { fondo: '#F0FDF4', texto: '#15803D', punto: '#22C55E' },
}

const AREAS: Area[] = ['comercial', 'ads', 'stock', 'operativo', 'importaciones']

const hoyISO = () => new Date().toISOString().slice(0, 10)

export function Gerencial() {
  const { accionables, cargando, errores, recargar } = useGerencial()
  const [fSev, setFSev] = useState<Severidad | 'todas'>('todas')
  const [fArea, setFArea] = useState<Area | 'todas'>('todas')
  const [mostrarSil, setMostrarSil] = useState(false)
  // Un contador para re-leer los silenciados de localStorage tras silenciar/reactivar.
  const [snoozeNonce, setSnoozeNonce] = useState(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps -- snoozeNonce fuerza re-leer localStorage
  const silenciados = useMemo(() => idsSilenciados(), [snoozeNonce])

  const onSilenciar = (id: string) => {
    silenciar(id)
    setSnoozeNonce((n) => n + 1)
  }
  const onReactivar = (id: string) => {
    reactivar(id)
    setSnoozeNonce((n) => n + 1)
  }

  const activos = accionables.filter((a) => !silenciados.has(a.id))
  const visibles = useMemo(() => {
    const base = mostrarSil ? accionables.filter((a) => silenciados.has(a.id)) : activos
    return base.filter(
      (a) => (fSev === 'todas' || a.severidad === fSev) && (fArea === 'todas' || a.area === fArea),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accionables, silenciados, mostrarSil, fSev, fArea])

  const conteoSev = (s: Severidad) => activos.filter((a) => a.severidad === s).length
  const areasPresentes = AREAS.filter((ar) => activos.some((a) => a.area === ar))
  const nSilenciados = accionables.length - activos.length
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
            Reúne, de todas tus marcas, lo que requiere una decisión: capital parado, precios fuera de
            objetivo, stock a depurar, Ads con mal retorno, pendientes operativos e importaciones. Podés
            silenciar lo que no aplica y aprobar consumos internos desde acá.
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

      {/* Filtro por área + silenciados */}
      {(areasPresentes.length > 1 || nSilenciados > 0) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 2px', alignItems: 'center' }}>
          {areasPresentes.length > 1 && (
            <>
              <Chip label="Todas las áreas" activo={fArea === 'todas'} onClick={() => setFArea('todas')} />
              {areasPresentes.map((ar) => (
                <Chip
                  key={ar}
                  label={ETIQUETA_AREA[ar]}
                  activo={fArea === ar}
                  onClick={() => setFArea(fArea === ar ? 'todas' : ar)}
                />
              ))}
            </>
          )}
          {nSilenciados > 0 && (
            <button
              className="btn-sm"
              onClick={() => setMostrarSil((v) => !v)}
              style={{ marginLeft: 'auto', background: '#fff', border: '1px solid #D1D5DB', color: '#6B7280' }}
            >
              {mostrarSil ? '← Volver' : `🔕 ${nSilenciados} silenciado(s)`}
            </button>
          )}
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
          {mostrarSil
            ? 'No hay accionables silenciados con estos filtros.'
            : filtrando
              ? '✅ No hay accionables con estos filtros.'
              : '✅ No hay accionables pendientes. Todo en orden.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cargando && (
            <div style={{ fontSize: 12, color: '#9CA3AF', padding: '0 2px' }}>Actualizando…</div>
          )}
          {visibles.map((a) => (
            <CardAccionable
              key={a.id}
              a={a}
              silenciado={mostrarSil}
              onSilenciar={() => onSilenciar(a.id)}
              onReactivar={() => onReactivar(a.id)}
              onCambio={recargar}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CardAccionable({
  a,
  silenciado,
  onSilenciar,
  onReactivar,
  onCambio,
}: {
  a: Accionable
  silenciado: boolean
  onSilenciar: () => void
  onReactivar: () => void
  onCambio: () => void
}) {
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

      {a.consumos && a.consumos.length > 0 && <Aprobaciones consumos={a.consumos} onCambio={onCambio} />}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {a.acciones.map((ac, i) => (
          <BotonAccion key={i} marca={a.marca} accion={ac} />
        ))}
        {silenciado ? (
          <button className="btn-sm" onClick={onReactivar} style={{ background: '#fff', border: '1px solid #D1D5DB', color: '#6B7280', marginLeft: 'auto' }}>
            🔔 Reactivar
          </button>
        ) : (
          <button
            className="btn-sm"
            onClick={onSilenciar}
            title={`Ocultar por ${DIAS_SNOOZE} días`}
            style={{ background: 'transparent', border: 'none', color: '#9CA3AF', marginLeft: 'auto' }}
          >
            🔕 Silenciar
          </button>
        )}
      </div>
    </div>
  )
}

/** Lista expandible de consumos internos pendientes, con aprobar/rechazar in-place. */
function Aprobaciones({ consumos, onCambio }: { consumos: ConsumoPendiente[]; onCambio: () => void }) {
  const { perfil, marca: marcaActiva, setMarca } = useSesion()
  const [abierto, setAbierto] = useState(false)
  const [procesando, setProcesando] = useState<string | null>(null)

  // El permiso se evalúa por la marca del consumo (todos comparten marca en esta tarjeta).
  const marcaCard = consumos[0]?.marca
  const puede = !!marcaCard && (esAdmin(perfil) || puedeSub(perfil, marcaCard, 'solicitudes-internas', 'aprobar'))
  const usuario = perfil?.name || ''

  const correr = async (c: ConsumoPendiente, accion: 'aprobar' | 'rechazar') => {
    if (!puede || procesando) return
    // El KV es por marca: si la activa no coincide, alinearla antes de escribir.
    if (marcaActiva !== c.marca) setMarca(c.marca)
    const motivo = accion === 'rechazar' ? (prompt('Motivo del rechazo (opcional):') || '').trim() : ''
    setProcesando(c.id)
    const r =
      accion === 'aprobar'
        ? await aprobarConsumo(c.marca, c.id, usuario, hoyISO())
        : await rechazarConsumo(c.marca, c.id, motivo, usuario, hoyISO())
    setProcesando(null)
    if (!r.ok) {
      alert('No se pudo guardar: ' + r.motivo)
      return
    }
    onCambio()
  }

  if (!puede) return null

  return (
    <div style={{ marginTop: 10 }}>
      <button
        className="btn-sm"
        onClick={() => setAbierto((v) => !v)}
        style={{ background: '#fff', border: '1px solid #D1D5DB' }}
      >
        {abierto ? '▾ Ocultar' : `▸ Revisar ${consumos.length} para aprobar acá`}
      </button>
      {abierto && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {consumos.map((c) => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
                border: '1px solid #E5E7EB',
                background: '#fff',
                borderRadius: 8,
                padding: '7px 10px',
              }}
            >
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{c.texto}</div>
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>{c.sub}</div>
              </div>
              <button
                className="btn-sm"
                disabled={procesando === c.id}
                onClick={() => void correr(c, 'aprobar')}
                style={{ background: '#16A34A', color: '#fff', border: 'none', opacity: procesando === c.id ? 0.6 : 1 }}
              >
                {procesando === c.id ? '…' : '✓ Aprobar'}
              </button>
              <button
                className="btn-sm"
                disabled={procesando === c.id}
                onClick={() => void correr(c, 'rechazar')}
                style={{ background: '#fff', color: '#B91C1C', border: '1px solid #FCA5A5', opacity: procesando === c.id ? 0.6 : 1 }}
              >
                Rechazar
              </button>
            </div>
          ))}
        </div>
      )}
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
