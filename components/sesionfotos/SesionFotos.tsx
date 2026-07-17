'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { leerLista } from '@/lib/kv/cliente'
import {
  contarCerradas,
  faltantes,
  filaHistorial,
  historialVisible,
  salio,
} from '@/lib/sesionfotos/core'
import type { Fase, ItemSolicitud, Origen, Solicitud } from '@/lib/sesionfotos/tipos'

/**
 * "📷 Sesión de fotos" (key `sesion-fotos`, BDI + Zattia) en Next.
 *
 * PASO 1 — read-only en ruta sombra (`/sesion-fotos/next`). Renderiza el
 * historial y el detalle de una solicitud como PROYECCIÓN de lo que hay en el KV,
 * sin ningún camino de escritura: no arma solicitudes, no escanea, no crea ventas.
 * Es el equivalente al "Fundas Paso 1": cablear el dato real y validar la paridad
 * visual antes de habilitar la primera escritura.
 *
 * Lee la MISMA clave del KV que el legacy (`sesionfotos:<marca>`), en solo
 * lectura, así que abrir esta ruta y la del iframe muestra exactamente lo mismo.
 */
export function SesionFotos() {
  const { marca } = useSesion()
  const [data, setData] = useState<Solicitud[] | null>(null)
  const [errorKv, setErrorKv] = useState<string | null>(null)
  const [verCerradas, setVerCerradas] = useState(false)
  const [viendo, setViendo] = useState<string | null>(null)

  // Cargar el historial del KV al montar / cambiar de marca. En solo lectura:
  // este Paso no vuelve a escribir, así que no necesita el flag `cargado`. Los
  // resets van dentro del callback async (no en el cuerpo del effect) para no
  // disparar renders en cascada — mismo criterio que useCRM/FundasModelo.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      setData(null)
      setErrorKv(null)
      setViendo(null)
      const r = await leerLista<Solicitud>('sesionfotos', marca)
      if (!vivo) return
      if (r.ok) setData(r.dato)
      else setErrorKv(r.motivo)
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  if (errorKv) {
    return (
      <div style={{ padding: 16, color: '#B91C1C', fontSize: 13 }}>
        No se pudo leer el historial de Sesión de fotos: {errorKv}
      </div>
    )
  }
  if (!data) return <div style={{ padding: 16, color: '#9CA3AF' }}>Cargando…</div>

  const solViendo = viendo ? data.find((s) => s.id === viendo) ?? null : null

  return (
    <div>
      <div className="sf-shadow-note">
        Vista previa (Next) · <b>solo lectura</b> — el armado, escaneo y ventas siguen en la versión actual.
      </div>
      {solViendo ? (
        <Detalle solicitud={solViendo} onVolver={() => setViendo(null)} />
      ) : (
        <Historial
          data={data}
          verCerradas={verCerradas}
          onToggleCerradas={setVerCerradas}
          onVer={setViendo}
        />
      )}
    </div>
  )
}

// ── Chip de marca / helpers de presentación ────────────────────────────────────

function Historial({
  data,
  verCerradas,
  onToggleCerradas,
  onVer,
}: {
  data: Solicitud[]
  verCerradas: boolean
  onToggleCerradas: (v: boolean) => void
  onVer: (id: string) => void
}) {
  const cerradasN = useMemo(() => contarCerradas(data), [data])
  const visibles = useMemo(() => historialVisible(data, verCerradas), [data, verCerradas])

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button className="btn-primary" disabled title="Disponible al completar la migración">
          + Nueva solicitud
        </button>
        {cerradasN > 0 && (
          <label style={{ fontSize: 12, color: '#6B7280', marginLeft: 'auto', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={verCerradas}
              onChange={(e) => onToggleCerradas(e.target.checked)}
              style={{ verticalAlign: 'middle', marginRight: 4 }}
            />
            Ver cerradas ({cerradasN})
          </label>
        )}
      </div>
      <div
        style={{
          fontSize: 12,
          color: '#9CA3AF',
          textTransform: 'uppercase',
          letterSpacing: '.04em',
          marginBottom: 6,
        }}
      >
        Historial
      </div>
      {visibles.length === 0 ? (
        <div style={{ color: '#9CA3AF', fontSize: 13 }}>Todavía no hay solicitudes.</div>
      ) : (
        visibles.map((s) => {
          const f = filaHistorial(s)
          return (
            <div
              key={s.id}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                border: `1px solid ${f.porDevolver ? '#FCA5A5' : '#E5E7EB'}`,
                borderRadius: 9,
                padding: '9px 11px',
                marginBottom: 7,
                flexWrap: 'wrap',
                ...(f.cerrada
                  ? { opacity: 0.6, background: '#F9FAFB' }
                  : f.porDevolver
                    ? { background: '#FEF2F2' }
                    : {}),
              }}
            >
              <div style={{ flex: 1, minWidth: 160, cursor: 'pointer' }} onClick={() => onVer(s.id)}>
                <div style={{ fontWeight: 600 }}>
                  {f.cerrada ? '✅ ' : ''}
                  {f.descripcion || '(sin descripción)'}
                  {f.porDevolver ? (
                    <span
                      style={{
                        background: '#FEE2E2',
                        color: '#991B1B',
                        borderRadius: 999,
                        padding: '1px 8px',
                        fontSize: 11,
                        fontWeight: 700,
                        marginLeft: 6,
                      }}
                    >
                      ⏳ {f.porDevolver} por devolver
                    </span>
                  ) : null}
                </div>
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                  {f.fecha} · 📦 {f.dep} · 🏪 {f.loc} · {f.estado}
                </div>
              </div>
              <button
                className="btn-sm"
                onClick={() => onVer(s.id)}
                style={{ background: '#fff', border: '1px solid #D1D5DB' }}
              >
                Ver
              </button>
            </div>
          )
        })
      )}
    </div>
  )
}

// ── Detalle de una solicitud (read-only) ────────────────────────────────────────

const NUM_VENTA = (v: { number?: number | string; id: number | string }) => String(v.number || v.id || '?')

function Detalle({ solicitud: s, onVolver }: { solicitud: Solicitud; onVolver: () => void }) {
  const [fase, setFase] = useState<Fase>('retiro')
  const mapKey = fase === 'devolucion' ? 'devuelto' : 'verif'
  const conteo = s[mapKey] || {}
  const conf = (it: ItemSolicitud) => Math.min(conteo[it.vid] || 0, it.qty)

  const dep = s.items.filter((i) => i.origen === 'deposito')
  const loc = s.items.filter((i) => i.origen === 'local')
  const falt = faltantes(s)

  const grupo = (titulo: string, arr: ItemSolicitud[]) => {
    if (!arr.length) return null
    const totQ = arr.reduce((a, i) => a + i.qty, 0)
    const confTot = arr.reduce((a, i) => a + conf(i), 0)
    const completo = confTot >= totQ
    const accionN = fase === 'devolucion' ? 'devueltos' : 'preparados'
    return (
      <div
        style={{
          border: `1px solid ${completo ? '#A7F3D0' : '#E5E7EB'}`,
          borderRadius: 9,
          padding: '10px 12px',
          marginBottom: 10,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>
          {titulo}{' '}
          <span style={{ color: '#9CA3AF', fontWeight: 500, fontSize: 12 }}>
            ({confTot}/{totQ} {accionN})
          </span>
          {completo ? <span style={{ color: '#16A34A', fontWeight: 700 }}> ✓ completo</span> : null}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'left' }}>
              <th style={{ padding: '3px 6px' }}>Producto</th>
              <th style={{ padding: '3px 6px' }}>Variante</th>
              <th style={{ padding: '3px 6px' }}>SKU</th>
              <th style={{ padding: '3px 6px', textAlign: 'right' }}>
                {fase === 'devolucion' ? 'Devuelto' : 'Preparado'}/Ped.
              </th>
            </tr>
          </thead>
          <tbody>
            {arr.map((i) => {
              const c = conf(i)
              const ok = c >= i.qty
              return (
                <tr key={i.vid} style={ok ? { background: '#F0FDF4' } : undefined}>
                  <td style={{ padding: '3px 6px', borderTop: '1px solid #F1F5F9' }}>
                    {ok ? '✅' : '⬜'} {i.nombre}
                    {i.manual ? <EtiquetaMini texto="✍️ a mano" fg="#5B21B6" bg="#EDE9FE" /> : i.nuevo ? <EtiquetaMini texto="🆕 sin venta" fg="#92400E" bg="#FEF3C7" /> : null}
                  </td>
                  <td style={{ padding: '3px 6px', borderTop: '1px solid #F1F5F9' }}>
                    {i.variante}
                    {i.nuevo && i.barcode ? (
                      <div style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace' }}>
                        {i.barcode}
                        {i.pendiente ? ' · pendiente en GN' : ''}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ padding: '3px 6px', borderTop: '1px solid #F1F5F9', color: '#6B7280' }}>
                    {i.sku || '—'}
                  </td>
                  <td
                    style={{
                      padding: '3px 6px',
                      borderTop: '1px solid #F1F5F9',
                      textAlign: 'right',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c}/{i.qty}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <button className="btn-sm" onClick={onVolver} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>
          ← Volver
        </button>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{s.descripcion || 'Solicitud'}</div>
        <span style={{ color: '#9CA3AF', fontSize: 12 }}>{s.fecha}</span>
        <span style={{ color: '#9CA3AF', fontSize: 12, marginLeft: 'auto' }}>Estado: {s.estado}</span>
      </div>

      {s.ventas ? (
        <div
          style={{
            background: '#ECFDF5',
            border: '1px solid #A7F3D0',
            borderRadius: 9,
            padding: '9px 12px',
            marginBottom: 10,
            fontSize: 13,
          }}
        >
          ✅ Ventas creadas en GN:{' '}
          {(['deposito', 'local'] as Origen[])
            .filter((o) => s.ventas?.[o])
            .map((o) => `${o === 'deposito' ? '📦' : '🏪'} N° ${NUM_VENTA(s.ventas![o]!)}`)
            .join(' · ')}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <BotonFase activo={fase === 'retiro'} onClick={() => setFase('retiro')} label="📤 Preparado" />
        <BotonFase activo={fase === 'devolucion'} onClick={() => setFase('devolucion')} label="📥 Devolución (al volver)" />
      </div>

      {grupo('📦 Retirar de Depósito', dep)}
      {grupo('🏪 Retirar de Local', loc)}

      {fase === 'devolucion' && salio(s) && falt.length > 0 ? (
        <div style={{ border: '1px solid #FCA5A5', background: '#FEF2F2', borderRadius: 9, padding: '10px 12px', margin: '10px 0' }}>
          <div style={{ fontWeight: 700, color: '#991B1B', marginBottom: 6 }}>
            ⚠ Faltan por devolver ({falt.reduce((a, f) => a + f.falta, 0)} u.)
          </div>
          {falt.map((f) => (
            <div key={f.vid} style={{ fontSize: 13, color: '#7F1D1D', padding: '2px 0' }}>
              • {f.nombre} · {f.variante}
              {f.sku ? ` · ${f.sku}` : ''} — <b>faltan {f.falta} de {f.qty}</b> {f.origen === 'local' ? '🏪' : '📦'}
            </div>
          ))}
        </div>
      ) : null}

      {s.eliminados && s.eliminados.length > 0 ? (
        <div style={{ border: '1px dashed #FCA5A5', borderRadius: 9, padding: '9px 12px', marginTop: 6, background: '#FEF2F2' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#991B1B', marginBottom: 4 }}>
            🗑️ Quitados de la solicitud ({s.eliminados.length})
          </div>
          {s.eliminados.map((e, idx) => (
            <div key={`${e.vid}-${idx}`} style={{ fontSize: 12, color: '#7F1D1D' }}>
              • {e.nombre} · {e.variante} ({e.qty}) — {e.origen === 'deposito' ? '📦' : '🏪'} · {e.fecha}
              {e.por ? ` · ${e.por}` : ''}
              {e.motivo ? ` · "${e.motivo}"` : ''}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function EtiquetaMini({ texto, fg, bg }: { texto: string; fg: string; bg: string }) {
  return (
    <span
      style={{ background: bg, color: fg, borderRadius: 999, padding: '0 6px', fontSize: 10, fontWeight: 600, marginLeft: 4 }}
    >
      {texto}
    </span>
  )
}

function BotonFase({ activo, onClick, label }: { activo: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${activo ? '#378ADD' : '#D1D5DB'}`,
        background: activo ? '#378ADD' : '#fff',
        color: activo ? '#fff' : '#374151',
        borderRadius: 8,
        padding: '6px 12px',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
