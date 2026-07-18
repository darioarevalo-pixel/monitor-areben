'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { esAdmin, puedeSub } from '@/lib/permisos'
import { leerLista } from '@/lib/kv/cliente'
import { leerPrioridadRetiro } from '@/lib/sesionfotos/cfg'
import { agregarCombinada, faseCompletaCombi, type ItemCombinado } from '@/lib/sesionfotos/combinada'
import {
  etiquetaBolsa,
  reporteFaltantesPDF,
  reportePDF,
  textoReporteFaltantes,
} from '@/lib/sesionfotos/pdf'
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
 * PASO SF-3 — sombra SOLO-LECTURA en `/sesion-fotos/next`. Las 3 vistas de lectura
 * (historial, ver-solicitud, combinada) leyendo la MISMA clave del KV que el
 * iframe, para un A/B fiel. TODO control de escritura va PRESENTE pero INERTE
 * (deshabilitado, no omitido), como los inertes del CRM, así abrir la sombra
 * dispara CERO escrituras:
 *   · "Crear ventas en GN", Estado, escaneo, +/− a mano, borrar, quitar, prioridad,
 *     verificar-anulaciones, nueva solicitud → deshabilitados.
 *   · Selección para combinar y el toggle de fase son estado de UI local (no
 *     escriben), así que van VIVOS.
 *   · Los PDFs (reporte, faltantes, etiqueta de bolsa) y "copiar reporte" son
 *     salida pura → VIVOS, refuerzan el A/B.
 * El armado de solicitud (draft), el escaneo y la creación de ventas se habilitan
 * en los pasos de escritura (SF-4/SF-5).
 */

const DISABLED_TITLE = 'Disponible al completar la migración de Sesión de fotos'

export function SesionFotos() {
  const { marca, perfil } = useSesion()
  const admin = esAdmin(perfil)
  const puedeQuitar = admin || puedeSub(perfil, marca, 'sesion-fotos', 'quitar-item')
  const puedeEditarDesc = admin || puedeSub(perfil, marca, 'sesion-fotos', 'editar-desc')

  const [data, setData] = useState<Solicitud[] | null>(null)
  const [errorKv, setErrorKv] = useState<string | null>(null)
  const [prioridad, setPrioridad] = useState<Origen>('deposito')
  const [verCerradas, setVerCerradas] = useState(false)
  const [viendo, setViendo] = useState<string | null>(null)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [combiIds, setCombiIds] = useState<string[] | null>(null)

  // Cargar historial (KV) + prioridad de retiro (config de Reposición) al montar /
  // cambiar de marca. Todo en solo lectura; los resets van dentro del callback
  // async (no en el cuerpo del effect) para no disparar renders en cascada.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      setData(null)
      setErrorKv(null)
      setViendo(null)
      setCombiIds(null)
      setSeleccion(new Set())
      const [lista, prio] = await Promise.all([
        leerLista<Solicitud>('sesionfotos', marca),
        leerPrioridadRetiro(marca),
      ])
      if (!vivo) return
      setPrioridad(prio)
      if (lista.ok) setData(lista.dato)
      else setErrorKv(lista.motivo)
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
  const solsCombi = combiIds ? combiIds.map((id) => data.find((s) => s.id === id)).filter((s): s is Solicitud => !!s) : null

  return (
    <div>
      <div className="sf-shadow-note">
        Vista previa (Next) · <b>solo lectura</b> — el armado, escaneo y creación de ventas siguen en la
        versión actual. Los reportes en PDF y la etiqueta de bolsa ya funcionan.
      </div>
      {solsCombi && solsCombi.length >= 2 ? (
        <Combinada
          sols={solsCombi}
          prioridad={prioridad}
          admin={admin}
          onVolver={() => setCombiIds(null)}
        />
      ) : solViendo ? (
        <Detalle
          solicitud={solViendo}
          prioridad={prioridad}
          admin={admin}
          puedeQuitar={puedeQuitar}
          puedeEditarDesc={puedeEditarDesc}
          onVolver={() => setViendo(null)}
        />
      ) : (
        <Historial
          data={data}
          admin={admin}
          puedeQuitar={puedeQuitar}
          verCerradas={verCerradas}
          onToggleCerradas={setVerCerradas}
          onVer={setViendo}
          seleccion={seleccion}
          onToggleSel={(id, on) =>
            setSeleccion((s) => {
              const n = new Set(s)
              if (on) n.add(id)
              else n.delete(id)
              return n
            })
          }
          onVerCombinada={() => {
            setCombiIds([...seleccion].filter((id) => data.some((s) => s.id === id)))
            setViendo(null)
          }}
        />
      )}
    </div>
  )
}

// ── Banner de prioridad de retiro (admin: select DESHABILITADO) ─────────────────

function Banner({ prioridad, admin }: { prioridad: Origen; admin: boolean }) {
  return (
    <div
      style={{
        background: '#F0F9FF',
        border: '1px solid #BAE6FD',
        borderRadius: 9,
        padding: '8px 11px',
        marginBottom: 10,
        fontSize: 12,
        color: '#075985',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
      }}
    >
      🏷️ <b>Prioridad de retiro:</b>{' '}
      {prioridad === 'local' ? (
        <span>
          <b>Local primero</b> (si no hay stock, se retira de Depósito)
        </span>
      ) : (
        <span>
          <b>Depósito primero</b> (si no hay stock, se retira de Local)
        </span>
      )}
      {admin && (
        <>
          <select value={prioridad} disabled title={DISABLED_TITLE} style={{ padding: '4px 6px', border: '1px solid #BAE6FD', borderRadius: 6, background: '#fff' }}>
            <option value="deposito">Depósito primero</option>
            <option value="local">Local primero</option>
          </select>
          <span style={{ color: '#9CA3AF' }}>(solo admin)</span>
        </>
      )}
    </div>
  )
}

// ── Historial ───────────────────────────────────────────────────────────────────

function Historial({
  data,
  admin,
  puedeQuitar,
  verCerradas,
  onToggleCerradas,
  onVer,
  seleccion,
  onToggleSel,
  onVerCombinada,
}: {
  data: Solicitud[]
  admin: boolean
  puedeQuitar: boolean
  verCerradas: boolean
  onToggleCerradas: (v: boolean) => void
  onVer: (id: string) => void
  seleccion: Set<string>
  onToggleSel: (id: string, on: boolean) => void
  onVerCombinada: () => void
}) {
  const cerradasN = useMemo(() => contarCerradas(data), [data])
  const visibles = useMemo(() => historialVisible(data, verCerradas), [data, verCerradas])

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button className="btn-primary" disabled title={DISABLED_TITLE}>
          + Nueva solicitud
        </button>
        {seleccion.size >= 2 ? (
          <button
            className="btn-sm"
            onClick={onVerCombinada}
            style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', color: '#3730A3', fontWeight: 600 }}
          >
            🔗 Ver combinadas ({seleccion.size})
          </button>
        ) : seleccion.size === 1 ? (
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>Tildá otra solicitud para combinarlas.</span>
        ) : null}
        {admin && (
          <button className="btn-sm" disabled title={DISABLED_TITLE} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>
            🔄 Verificar anulaciones en GN
          </button>
        )}
        {cerradasN > 0 && (
          <label style={{ fontSize: 12, color: '#6B7280', marginLeft: 'auto', cursor: 'pointer' }}>
            <input type="checkbox" checked={verCerradas} onChange={(e) => onToggleCerradas(e.target.checked)} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Ver cerradas ({cerradasN})
          </label>
        )}
      </div>
      <div style={{ fontSize: 12, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
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
                ...(f.cerrada ? { opacity: 0.6, background: '#F9FAFB' } : f.porDevolver ? { background: '#FEF2F2' } : {}),
              }}
            >
              <input
                type="checkbox"
                checked={seleccion.has(s.id)}
                onChange={(e) => onToggleSel(s.id, e.target.checked)}
                title="Seleccionar para verificar/preparar combinadas"
                style={{ width: 17, height: 17, cursor: 'pointer', flex: '0 0 auto' }}
              />
              <div style={{ flex: 1, minWidth: 160, cursor: 'pointer' }} onClick={() => onVer(s.id)}>
                <div style={{ fontWeight: 600 }}>
                  {f.cerrada ? '✅ ' : ''}
                  {f.descripcion || '(sin descripción)'}
                  {f.porDevolver ? (
                    <span style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 700, marginLeft: 6 }}>
                      ⏳ {f.porDevolver} por devolver
                    </span>
                  ) : null}
                </div>
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                  {f.fecha} · 📦 {f.dep} · 🏪 {f.loc} · {f.estado}
                </div>
              </div>
              <button className="btn-sm" onClick={() => onVer(s.id)} style={{ background: '#fff', border: '1px solid #D1D5DB' }}>
                Ver
              </button>
              {puedeQuitar && (
                <button disabled title={DISABLED_TITLE} style={{ border: 'none', background: 'none', color: '#CBD5E1', fontSize: 15, cursor: 'not-allowed' }}>
                  🗑
                </button>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

// ── Detalle de una solicitud ────────────────────────────────────────────────────

const NUM_VENTA = (v: { number?: number | string; id: number | string }) => String(v.number || v.id || '?')

/** Alerta el mensaje de error de un PDF/clipboard (equivalente a los alert del legacy). */
async function correrSalida(fn: () => void | Promise<void>) {
  try {
    await fn()
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e))
  }
}

function Detalle({
  solicitud: s,
  prioridad,
  admin,
  puedeQuitar,
  puedeEditarDesc,
  onVolver,
}: {
  solicitud: Solicitud
  prioridad: Origen
  admin: boolean
  puedeQuitar: boolean
  puedeEditarDesc: boolean
  onVolver: () => void
}) {
  const [fase, setFase] = useState<Fase>('retiro')
  const conteo = s[fase === 'devolucion' ? 'devuelto' : 'verif'] || {}
  const conf = (it: ItemSolicitud) => Math.min(conteo[it.vid] || 0, it.qty)

  const dep = s.items.filter((i) => i.origen === 'deposito')
  const loc = s.items.filter((i) => i.origen === 'local')
  const falt = faltantes(s)
  const hayVentables = s.items.some((i) => !i.nuevo)

  const grupo = (titulo: string, arr: ItemSolicitud[], origen: Origen) => {
    if (!arr.length) return null
    const totQ = arr.reduce((a, i) => a + i.qty, 0)
    const confTot = arr.reduce((a, i) => a + conf(i), 0)
    const completo = confTot >= totQ
    const accionN = fase === 'devolucion' ? 'devueltos' : 'preparados'
    const accionV = fase === 'devolucion' ? 'la devolución' : 'el preparado'
    return (
      <div style={{ border: `1px solid ${completo ? '#A7F3D0' : '#E5E7EB'}`, borderRadius: 9, padding: '10px 12px', marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700 }}>
            {titulo} <span style={{ color: '#9CA3AF', fontWeight: 500, fontSize: 12 }}>({confTot}/{totQ} {accionN})</span>
            {completo ? <span style={{ color: '#16A34A', fontWeight: 700 }}> ✓ completo</span> : null}
          </div>
          <button className="btn-sm" onClick={() => correrSalida(() => reportePDF(s, origen))} style={{ background: '#1F2937', color: '#fff' }}>
            📄 Reporte
          </button>
        </div>
        <div style={{ margin: '8px 0' }}>
          <input
            disabled
            title={DISABLED_TITLE}
            placeholder={`🔫 Escaneá para confirmar ${accionV} (o tipeá el SKU + Enter)…`}
            style={{ width: '100%', padding: '8px 10px', border: '2px solid #E5E7EB', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', background: '#F9FAFB' }}
          />
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'left' }}>
              <th style={{ padding: '3px 6px' }}>Producto</th>
              <th style={{ padding: '3px 6px' }}>Variante</th>
              <th style={{ padding: '3px 6px' }}>SKU</th>
              <th style={{ padding: '3px 6px', textAlign: 'right' }}>{fase === 'devolucion' ? 'Devuelto' : 'Preparado'}/Ped.</th>
              <th style={{ padding: '3px 6px' }} />
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
                  <td style={{ padding: '3px 6px', borderTop: '1px solid #F1F5F9', color: '#6B7280' }}>{i.sku || '—'}</td>
                  <td style={{ padding: '3px 6px', borderTop: '1px solid #F1F5F9', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {i.manual ? (
                      <>
                        <BotonMini disabled label="−" />
                        {' '}{c}/{i.qty}{' '}
                        <BotonMini disabled label="+" acento />
                      </>
                    ) : (
                      <>{c}/{i.qty}</>
                    )}
                  </td>
                  <td style={{ padding: '3px 6px', borderTop: '1px solid #F1F5F9', textAlign: 'right' }}>
                    {puedeQuitar && !s.ventas ? (
                      <button disabled title={DISABLED_TITLE} style={{ border: 'none', background: 'none', color: '#FCA5A5', fontSize: 14, cursor: 'not-allowed' }}>
                        ✕
                      </button>
                    ) : null}
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
        {puedeEditarDesc ? (
          <input
            defaultValue={s.descripcion}
            disabled
            title={DISABLED_TITLE}
            style={{ fontWeight: 700, fontSize: 15, border: 'none', borderBottom: '1px solid #E5E7EB', padding: '2px 0', minWidth: 200, flex: 1, background: 'transparent' }}
          />
        ) : (
          <div style={{ fontWeight: 700, fontSize: 15 }}>{s.descripcion || 'Solicitud'}</div>
        )}
        <span style={{ color: '#9CA3AF', fontSize: 12 }}>{s.fecha}</span>
        <button className="btn-sm" onClick={() => correrSalida(() => etiquetaBolsa(s))} title="Etiqueta 5×2,5 cm para la bolsa (con la descripción)" style={{ background: '#fff', border: '1px solid #D1D5DB' }}>
          🏷️ Etiqueta de bolsa
        </button>
        <label style={{ fontSize: 12, color: '#6B7280', marginLeft: 'auto' }}>
          Estado{' '}
          <select value={s.estado} disabled title={DISABLED_TITLE} style={{ padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: 6 }}>
            {(['pendiente', 'preparada', 'cargada', 'devuelta', 'cerrada'] as const).map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </label>
      </div>

      <Banner prioridad={prioridad} admin={admin} />

      {s.ventas ? (
        <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 9, padding: '9px 12px', marginBottom: 10, fontSize: 13 }}>
          ✅ Ventas creadas en GN:{' '}
          {(['deposito', 'local'] as Origen[])
            .filter((o) => s.ventas?.[o])
            .map((o) => `${o === 'deposito' ? '📦' : '🏪'} N° ${NUM_VENTA(s.ventas![o]!)}`)
            .join(' · ')}{' '}
          <span style={{ color: '#9CA3AF', fontSize: 11 }}>(para anular, hacelo en GN)</span>
        </div>
      ) : hayVentables ? (
        <div style={{ marginBottom: 10 }}>
          <button className="btn-primary" disabled title={DISABLED_TITLE}>
            🧾 Crear ventas en GN
          </button>{' '}
          <span style={{ color: '#9CA3AF', fontSize: 12 }}>Descuenta el stock con el cliente “Sesión de fotos”.</span>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <BotonFase activo={fase === 'retiro'} onClick={() => setFase('retiro')} label="📤 Preparado" />
        <BotonFase activo={fase === 'devolucion'} onClick={() => setFase('devolucion')} label="📥 Devolución (al volver)" />
      </div>

      {grupo('📦 Retirar de Depósito', dep, 'deposito')}
      {grupo('🏪 Retirar de Local', loc, 'local')}

      {fase === 'devolucion' && salio(s) && falt.length > 0 ? (
        <div style={{ border: '1px solid #FCA5A5', background: '#FEF2F2', borderRadius: 9, padding: '10px 12px', margin: '10px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <div style={{ fontWeight: 700, color: '#991B1B' }}>⚠ Faltan por devolver ({falt.reduce((a, f) => a + f.falta, 0)} u.)</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn-sm" onClick={() => correrSalida(() => copiarReporte(s))} style={{ background: '#fff', border: '1px solid #FCA5A5', color: '#991B1B' }}>
                📋 Copiar reporte
              </button>
              <button className="btn-sm" onClick={() => correrSalida(() => reporteFaltantesPDF(s))} style={{ background: '#1F2937', color: '#fff' }}>
                📄 PDF
              </button>
            </div>
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

// ── Vista combinada (read-only) ─────────────────────────────────────────────────

function Combinada({
  sols,
  prioridad,
  admin,
  onVolver,
}: {
  sols: Solicitud[]
  prioridad: Origen
  admin: boolean
  onVolver: () => void
}) {
  const [fase, setFase] = useState<Fase>('retiro')
  const completa = faseCompletaCombi(sols, fase)

  const nventa = (s: Solicitud) =>
    s.ventas
      ? (['deposito', 'local'] as Origen[]).filter((o) => s.ventas?.[o]).map((o) => `${o === 'deposito' ? '📦' : '🏪'} N° ${NUM_VENTA(s.ventas![o]!)}`).join(' · ')
      : ''

  const grupo = (titulo: string, origen: Origen) => {
    const items = agregarCombinada(sols, origen, fase)
    if (!items.length) return null
    const totQ = items.reduce((a, i) => a + i.ped, 0)
    const confTot = items.reduce((a, i) => a + i.conf, 0)
    const completo = confTot >= totQ
    const accionN = fase === 'devolucion' ? 'devueltos' : 'preparados'
    const accionV = fase === 'devolucion' ? 'la devolución' : 'el preparado'
    return (
      <div style={{ border: `1px solid ${completo ? '#A7F3D0' : '#E5E7EB'}`, borderRadius: 9, padding: '10px 12px', marginBottom: 10 }}>
        <div style={{ fontWeight: 700 }}>
          {titulo} <span style={{ color: '#9CA3AF', fontWeight: 500, fontSize: 12 }}>({confTot}/{totQ} {accionN})</span>
          {completo ? <span style={{ color: '#16A34A', fontWeight: 700 }}> ✓ completo</span> : null}
        </div>
        <div style={{ margin: '8px 0' }}>
          <input
            disabled
            title={DISABLED_TITLE}
            placeholder={`🔫 Escaneá para confirmar ${accionV} de las ${sols.length} (o tipeá el SKU + Enter)…`}
            style={{ width: '100%', padding: '8px 10px', border: '2px solid #E5E7EB', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', background: '#F9FAFB' }}
          />
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'left' }}>
              <th style={{ padding: '3px 6px' }}>Producto</th>
              <th style={{ padding: '3px 6px' }}>Variante</th>
              <th style={{ padding: '3px 6px' }}>SKU</th>
              <th style={{ padding: '3px 6px', textAlign: 'right' }}>{fase === 'devolucion' ? 'Devuelto' : 'Preparado'}/Ped.</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i: ItemCombinado) => {
              const ok = i.conf >= i.ped
              return (
                <tr key={i.manual ? `m_${i.solId}_${i.vid}` : i.vid} style={ok ? { background: '#F0FDF4' } : undefined}>
                  <td style={{ padding: '3px 6px', borderTop: '1px solid #F1F5F9' }}>
                    {ok ? '✅' : '⬜'} {i.nombre}
                    {i.manual ? <EtiquetaMini texto="✍️ a mano" fg="#5B21B6" bg="#EDE9FE" /> : null}
                  </td>
                  <td style={{ padding: '3px 6px', borderTop: '1px solid #F1F5F9' }}>{i.variante}</td>
                  <td style={{ padding: '3px 6px', borderTop: '1px solid #F1F5F9', color: '#6B7280' }}>{i.sku || '—'}</td>
                  <td style={{ padding: '3px 6px', borderTop: '1px solid #F1F5F9', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {i.manual ? (
                      <>
                        <BotonMini disabled label="−" />
                        {' '}{i.conf}/{i.ped}{' '}
                        <BotonMini disabled label="+" acento />
                      </>
                    ) : (
                      <>{i.conf}/{i.ped}</>
                    )}
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
        <div style={{ fontWeight: 700, fontSize: 15 }}>🔗 Vista combinada — {sols.length} solicitudes</div>
      </div>
      <div style={{ border: '1px solid #E5E7EB', borderRadius: 9, padding: '9px 12px', marginBottom: 10, background: '#F9FAFB' }}>
        {sols.map((s) => (
          <div key={s.id} style={{ fontSize: 12, color: '#374151' }}>
            • <b>{s.descripcion || '(sin descripción)'}</b> <span style={{ color: '#9CA3AF' }}>· {s.fecha} · {s.estado}</span>
            {nventa(s) ? <span style={{ color: '#065F46' }}> · {nventa(s)}</span> : null}
          </div>
        ))}
      </div>
      <Banner prioridad={prioridad} admin={admin} />
      {completa ? (
        <div style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: 9, padding: '10px 12px', marginBottom: 10, fontSize: 13, color: '#065F46' }}>
          {fase === 'devolucion' ? (
            <>✅ <b>Devolución completa</b> de las {sols.length} solicitudes.</>
          ) : (
            <>✅ <b>Preparación completa</b> de las {sols.length} solicitudes.</>
          )}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <BotonFase activo={fase === 'retiro'} onClick={() => setFase('retiro')} label="📤 Preparado" />
        <BotonFase activo={fase === 'devolucion'} onClick={() => setFase('devolucion')} label="📥 Devolución (al volver)" />
      </div>
      {grupo('📦 Depósito (todas)', 'deposito')}
      {grupo('🏪 Local (todas)', 'local')}
    </div>
  )
}

// ── Helpers de UI ────────────────────────────────────────────────────────────────

async function copiarReporte(s: Solicitud) {
  const msg = textoReporteFaltantes(s)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(msg)
      alert('📋 Reporte copiado. Pegalo en WhatsApp.')
      return
    } catch {
      /* cae al prompt */
    }
  }
  prompt('Copiá el reporte:', msg)
}

function EtiquetaMini({ texto, fg, bg }: { texto: string; fg: string; bg: string }) {
  return (
    <span style={{ background: bg, color: fg, borderRadius: 999, padding: '0 6px', fontSize: 10, fontWeight: 600, marginLeft: 4 }}>
      {texto}
    </span>
  )
}

function BotonMini({ disabled, label, acento }: { disabled?: boolean; label: string; acento?: boolean }) {
  return (
    <button
      disabled={disabled}
      title={DISABLED_TITLE}
      style={{
        border: `1px solid ${acento ? '#7C3AED' : '#DDD6FE'}`,
        background: acento ? '#7C3AED' : '#fff',
        color: acento ? '#fff' : '#5B21B6',
        borderRadius: 6,
        width: 24,
        height: 24,
        lineHeight: 1,
        cursor: 'not-allowed',
        fontWeight: 700,
        verticalAlign: 'middle',
        opacity: 0.6,
      }}
    >
      {label}
    </button>
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
