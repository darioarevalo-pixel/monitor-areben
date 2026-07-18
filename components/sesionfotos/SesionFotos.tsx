'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { esAdmin, puedeSub } from '@/lib/permisos'
import { useSesionFotos } from './useSesionFotos'
import { agregarCombinada, faseCompletaCombi, type ItemCombinado } from '@/lib/sesionfotos/combinada'
import {
  ajustarManualSol,
  construirMapaBc,
  escanearCombi,
  escanearSol,
  type ResultadoCombi,
  type ResultadoEscaneo,
} from '@/lib/sesionfotos/escaneo'
import {
  etiquetaBolsa,
  reporteFaltantesPDF,
  reportePDF,
  textoReporteFaltantes,
} from '@/lib/sesionfotos/pdf'
import {
  bloqueoBorrado,
  contarCerradas,
  faltantes,
  filaHistorial,
  historialVisible,
  salio,
  sinItemSol,
  sinSolicitud,
} from '@/lib/sesionfotos/core'
import type { EstadoSolicitud, Fase, ItemSolicitud, Origen, Solicitud } from '@/lib/sesionfotos/tipos'

/** Una mutación pura de la lista de solicitudes; se aplica optimista y con merge. */
type Persistir = (mutar: (l: Solicitud[]) => Solicitud[]) => Promise<boolean>

const DISABLED_TITLE = 'Disponible al completar la migración de Sesión de fotos'

export function SesionFotos() {
  const { marca } = useSesion()
  const sf = useSesionFotos(marca)
  // allVariantes del ETL → mapa código-de-barras → vid para el escaneo. Se baja en
  // paralelo con el historial; hasta que esté, el escaneo va deshabilitado.
  const { datos } = useDatosMonitor()
  const mapaBc = useMemo(() => construirMapaBc(datos?.allVariantes ?? []), [datos])
  const catalogoListo = !!datos

  if (sf.error && !sf.data) {
    return (
      <div style={{ padding: 16, color: '#B91C1C', fontSize: 13 }}>
        No se pudo leer el historial de Sesión de fotos: {sf.error}
      </div>
    )
  }
  if (!sf.data) return <div style={{ padding: 16, color: '#9CA3AF' }}>Cargando…</div>

  // key={marca}: al cambiar de cuenta, el estado de UI (qué solicitud se ve, la
  // selección) se resetea remontando, sin setState en effects.
  return (
    <Contenido
      key={marca}
      data={sf.data}
      prioridad={sf.prioridad}
      persistir={sf.persistir}
      mapaBc={mapaBc}
      catalogoListo={catalogoListo}
    />
  )
}

function Contenido({
  data,
  prioridad,
  persistir,
  mapaBc,
  catalogoListo,
}: {
  data: Solicitud[]
  prioridad: Origen
  persistir: Persistir
  mapaBc: Record<string, string>
  catalogoListo: boolean
}) {
  const { marca, perfil } = useSesion()
  const admin = esAdmin(perfil)
  const puedeQuitar = admin || puedeSub(perfil, marca, 'sesion-fotos', 'quitar-item')
  const puedeEditarDesc = admin || puedeSub(perfil, marca, 'sesion-fotos', 'editar-desc')

  const [verCerradas, setVerCerradas] = useState(false)
  const [viendo, setViendo] = useState<string | null>(null)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [combiIds, setCombiIds] = useState<string[] | null>(null)

  const solViendo = viendo ? data.find((s) => s.id === viendo) ?? null : null
  const solsCombi = combiIds ? combiIds.map((id) => data.find((s) => s.id === id)).filter((s): s is Solicitud => !!s) : null

  // Borrar una solicitud (desde el historial). Port de sfBorrar: guarda de "ya salió",
  // confirm, y limpia la selección / la vista si apuntaban a ella.
  const onBorrar = (s: Solicitud) => {
    const bloqueo = bloqueoBorrado(s, admin)
    if (bloqueo) {
      alert(bloqueo)
      return
    }
    if (!confirm('¿Eliminar esta solicitud del historial?')) return
    persistir((l) => sinSolicitud(l, s.id))
    if (viendo === s.id) setViendo(null)
    setSeleccion((sel) => {
      const n = new Set(sel)
      n.delete(s.id)
      return n
    })
  }

  return (
    <div>
      <div className="sf-shadow-note">
        Vista previa (Next) · solo <b>armar una solicitud nueva</b> y <b>crear ventas en GN</b> siguen en
        la versión actual; el resto (editar, escanear, quitar ítems, borrar, PDFs) ya funciona y escribe
        en los datos reales.
      </div>
      {solsCombi && solsCombi.length >= 2 ? (
        <Combinada
          sols={solsCombi}
          prioridad={prioridad}
          admin={admin}
          persistir={persistir}
          mapaBc={mapaBc}
          catalogoListo={catalogoListo}
          onVolver={() => setCombiIds(null)}
        />
      ) : solViendo ? (
        <Detalle
          key={solViendo.id}
          solicitud={solViendo}
          prioridad={prioridad}
          admin={admin}
          puedeQuitar={puedeQuitar}
          puedeEditarDesc={puedeEditarDesc}
          usuario={perfil?.name ?? ''}
          persistir={persistir}
          mapaBc={mapaBc}
          catalogoListo={catalogoListo}
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
          onBorrar={onBorrar}
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

/**
 * Autoguardado con debounce (500 ms, como el legacy) + flush al desmontar para no
 * perder el último escaneo si se toca "Volver" antes de que dispare. `persistUno`
 * tiene que ser estable (useCallback) o el debounce se reinicia en cada render.
 */
function useAutosave<T>(work: T, inicial: T, persistUno: (w: T) => void) {
  const guardado = useRef(inicial)
  const actual = useRef(inicial)
  useEffect(() => {
    actual.current = work
  }, [work])
  useEffect(() => {
    if (work === guardado.current) return
    const t = setTimeout(() => {
      guardado.current = work
      persistUno(work)
    }, 500)
    return () => clearTimeout(t)
  }, [work, persistUno])
  useEffect(() => {
    return () => {
      if (actual.current !== guardado.current) {
        guardado.current = actual.current
        persistUno(actual.current)
      }
    }
  }, [persistUno])
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
  onBorrar,
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
  onBorrar: (s: Solicitud) => void
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
                <button onClick={() => onBorrar(s)} title="Eliminar solicitud" style={{ border: 'none', background: 'none', color: '#CBD5E1', fontSize: 15, cursor: 'pointer' }}>
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
  solicitud: s0,
  prioridad,
  admin,
  puedeQuitar,
  puedeEditarDesc,
  usuario,
  persistir,
  mapaBc,
  catalogoListo,
  onVolver,
}: {
  solicitud: Solicitud
  prioridad: Origen
  admin: boolean
  puedeQuitar: boolean
  puedeEditarDesc: boolean
  usuario: string
  persistir: Persistir
  mapaBc: Record<string, string>
  catalogoListo: boolean
  onVolver: () => void
}) {
  // Copia de trabajo local (como sfData en memoria): todas las ediciones la mutan
  // al instante; un autosave con debounce la persiste con merge por-id.
  const [work, setWork] = useState<Solicitud>(s0)
  const [fase, setFase] = useState<Fase>('retiro')
  const [desc, setDesc] = useState(s0.descripcion || '')
  const [fb, setFb] = useState<{ key: string; r: ResultadoEscaneo } | null>(null)

  const persistUno = useCallback(
    (w: Solicitud) => persistir((l) => l.map((x) => (x.id === w.id ? w : x))),
    [persistir],
  )
  useAutosave(work, s0, persistUno)

  const s = work
  const conteo = s[fase === 'devolucion' ? 'devuelto' : 'verif'] || {}
  const conf = (it: ItemSolicitud) => Math.min(conteo[it.vid] || 0, it.qty)

  const dep = s.items.filter((i) => i.origen === 'deposito')
  const loc = s.items.filter((i) => i.origen === 'local')
  const falt = faltantes(s)
  const hayVentables = s.items.some((i) => !i.nuevo)

  const onScan = (origen: Origen, code: string) => {
    if (!code.trim()) return
    const { sol: ns, resultado } = escanearSol(work, origen, fase, code.trim(), mapaBc)
    setWork(ns)
    setFb({ key: `${origen}-${fase}`, r: resultado })
  }

  // Quitar un ítem de la solicitud (solo admin/quitar-item, antes de crear ventas).
  // Port de sfEliminarItem: confirm + prompt de motivo → queda en s.eliminados.
  const onQuitarItem = (it: ItemSolicitud) => {
    if (!confirm(`¿Quitar "${it.nombre} · ${it.variante}" de la solicitud?`)) return
    const motivo = (prompt('Motivo (opcional): ¿por qué lo quitás? (ej: no había stock, estaba en otra tienda)') || '').trim()
    const fecha = new Date().toISOString().slice(0, 10)
    setWork((w) => sinItemSol(w, it.vid, { por: usuario, motivo, fecha }))
  }

  const grupo = (titulo: string, arr: ItemSolicitud[], origen: Origen) => {
    if (!arr.length) return null
    const totQ = arr.reduce((a, i) => a + i.qty, 0)
    const confTot = arr.reduce((a, i) => a + conf(i), 0)
    const completo = confTot >= totQ
    const accionN = fase === 'devolucion' ? 'devueltos' : 'preparados'
    const accionV = fase === 'devolucion' ? 'la devolución' : 'el preparado'
    const fbKey = `${origen}-${fase}`
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
          <ScanInput
            disabled={!catalogoListo}
            placeholder={catalogoListo ? `🔫 Escaneá para confirmar ${accionV} (o tipeá el SKU + Enter)…` : 'Cargando catálogo…'}
            onScan={(v) => onScan(origen, v)}
          />
        </div>
        {fb && fb.key === fbKey ? <div style={{ fontSize: 13, marginBottom: 6 }}>{fbTexto(fb.r)}</div> : null}
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
                        <BotonMini label="−" onClick={() => setWork((w) => ajustarManualSol(w, fase, i.vid, -1))} />
                        {' '}{c}/{i.qty}{' '}
                        <BotonMini label="+" acento onClick={() => setWork((w) => ajustarManualSol(w, fase, i.vid, 1))} />
                      </>
                    ) : (
                      <>{c}/{i.qty}</>
                    )}
                  </td>
                  <td style={{ padding: '3px 6px', borderTop: '1px solid #F1F5F9', textAlign: 'right' }}>
                    {puedeQuitar && !s.ventas ? (
                      <button onClick={() => onQuitarItem(i)} title="Quitar de la solicitud" style={{ border: 'none', background: 'none', color: '#DC2626', fontSize: 14, cursor: 'pointer' }}>
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
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => {
              if (desc !== s.descripcion) setWork((w) => ({ ...w, descripcion: desc }))
            }}
            placeholder="Descripción"
            title="Editar descripción de la solicitud"
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
          <select
            value={s.estado}
            onChange={(e) => setWork((w) => ({ ...w, estado: e.target.value as EstadoSolicitud }))}
            style={{ padding: '4px 6px', border: '1px solid #D1D5DB', borderRadius: 6 }}
          >
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
        <BotonFase activo={fase === 'retiro'} onClick={() => { setFase('retiro'); setFb(null) }} label="📤 Preparado" />
        <BotonFase activo={fase === 'devolucion'} onClick={() => { setFase('devolucion'); setFb(null) }} label="📥 Devolución (al volver)" />
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

// ── Vista combinada ─────────────────────────────────────────────────────────────

function Combinada({
  sols: sols0,
  prioridad,
  admin,
  persistir,
  mapaBc,
  catalogoListo,
  onVolver,
}: {
  sols: Solicitud[]
  prioridad: Origen
  admin: boolean
  persistir: Persistir
  mapaBc: Record<string, string>
  catalogoListo: boolean
  onVolver: () => void
}) {
  const [works, setWorks] = useState<Solicitud[]>(sols0)
  const [fase, setFase] = useState<Fase>('retiro')
  const [fb, setFb] = useState<{ key: string; r: ResultadoCombi } | null>(null)

  const persistTodas = useCallback(
    (ws: Solicitud[]) => persistir((l) => l.map((x) => ws.find((w) => w.id === x.id) ?? x)),
    [persistir],
  )
  useAutosave(works, sols0, persistTodas)

  const completa = faseCompletaCombi(works, fase)

  const nventa = (s: Solicitud) =>
    s.ventas
      ? (['deposito', 'local'] as Origen[]).filter((o) => s.ventas?.[o]).map((o) => `${o === 'deposito' ? '📦' : '🏪'} N° ${NUM_VENTA(s.ventas![o]!)}`).join(' · ')
      : ''

  const onScan = (origen: Origen, code: string) => {
    if (!code.trim()) return
    const { sols: ns, resultado } = escanearCombi(works, origen, fase, code.trim(), mapaBc)
    setWorks(ns)
    setFb({ key: `combi-${origen}-${fase}`, r: resultado })
  }

  const grupo = (titulo: string, origen: Origen) => {
    const items = agregarCombinada(works, origen, fase)
    if (!items.length) return null
    const totQ = items.reduce((a, i) => a + i.ped, 0)
    const confTot = items.reduce((a, i) => a + i.conf, 0)
    const completo = confTot >= totQ
    const accionN = fase === 'devolucion' ? 'devueltos' : 'preparados'
    const accionV = fase === 'devolucion' ? 'la devolución' : 'el preparado'
    const fbKey = `combi-${origen}-${fase}`
    return (
      <div style={{ border: `1px solid ${completo ? '#A7F3D0' : '#E5E7EB'}`, borderRadius: 9, padding: '10px 12px', marginBottom: 10 }}>
        <div style={{ fontWeight: 700 }}>
          {titulo} <span style={{ color: '#9CA3AF', fontWeight: 500, fontSize: 12 }}>({confTot}/{totQ} {accionN})</span>
          {completo ? <span style={{ color: '#16A34A', fontWeight: 700 }}> ✓ completo</span> : null}
        </div>
        <div style={{ margin: '8px 0' }}>
          <ScanInput
            disabled={!catalogoListo}
            placeholder={catalogoListo ? `🔫 Escaneá para confirmar ${accionV} de las ${works.length} (o tipeá el SKU + Enter)…` : 'Cargando catálogo…'}
            onScan={(v) => onScan(origen, v)}
          />
        </div>
        {fb && fb.key === fbKey ? <div style={{ fontSize: 13, marginBottom: 6 }}>{fbTextoCombi(fb.r)}</div> : null}
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
                    {i.manual && i.solId ? (
                      <>
                        <BotonMini label="−" onClick={() => setWorks((ws) => ws.map((s) => (s.id === i.solId ? ajustarManualSol(s, fase, i.vid, -1) : s)))} />
                        {' '}{i.conf}/{i.ped}{' '}
                        <BotonMini label="+" acento onClick={() => setWorks((ws) => ws.map((s) => (s.id === i.solId ? ajustarManualSol(s, fase, i.vid, 1) : s)))} />
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
        <div style={{ fontWeight: 700, fontSize: 15 }}>🔗 Vista combinada — {works.length} solicitudes</div>
      </div>
      <div style={{ border: '1px solid #E5E7EB', borderRadius: 9, padding: '9px 12px', marginBottom: 10, background: '#F9FAFB' }}>
        {works.map((s) => (
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
            <>✅ <b>Devolución completa</b> de las {works.length} solicitudes.</>
          ) : (
            <>✅ <b>Preparación completa</b> de las {works.length} solicitudes.</>
          )}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <BotonFase activo={fase === 'retiro'} onClick={() => { setFase('retiro'); setFb(null) }} label="📤 Preparado" />
        <BotonFase activo={fase === 'devolucion'} onClick={() => { setFase('devolucion'); setFb(null) }} label="📥 Devolución (al volver)" />
      </div>
      {grupo('📦 Depósito (todas)', 'deposito')}
      {grupo('🏪 Local (todas)', 'local')}
    </div>
  )
}

// ── Helpers de UI ────────────────────────────────────────────────────────────────

/** Feedback de un escaneo en el detalle. */
function fbTexto(r: ResultadoEscaneo) {
  if (r.tipo === 'no-encontrado') return <span style={{ color: '#DC2626' }}>✗ &quot;{r.code}&quot; no está en esta lista (producto o talle equivocado).</span>
  if (r.tipo === 'ya-completo') return <span style={{ color: '#D97706' }}>⚠ {r.nombre} · {r.variante} ya estaba completo ({r.qty}).</span>
  return <span style={{ color: '#16A34A' }}>✓ {r.nombre} · {r.variante} ({r.done}/{r.qty})</span>
}

/** Feedback de un escaneo en la vista combinada. */
function fbTextoCombi(r: ResultadoCombi) {
  if (r.tipo === 'no-encontrado') return <span style={{ color: '#DC2626' }}>✗ &quot;{r.code}&quot; no está en estas solicitudes (producto o talle equivocado).</span>
  if (r.tipo === 'ya-completo') return <span style={{ color: '#D97706' }}>⚠ {r.nombre} · {r.variante} ya está completo en las solicitudes.</span>
  return <span style={{ color: '#16A34A' }}>✓ {r.nombre} · {r.variante} ({r.done}/{r.qty})</span>
}

/** Input de escaneo: al Enter dispara onScan con el valor y limpia el campo. */
function ScanInput({ disabled, placeholder, onScan }: { disabled: boolean; placeholder: string; onScan: (v: string) => void }) {
  return (
    <input
      disabled={disabled}
      placeholder={placeholder}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          const v = e.currentTarget.value
          e.currentTarget.value = ''
          onScan(v)
        }
      }}
      style={{
        width: '100%',
        padding: '8px 10px',
        border: `2px solid ${disabled ? '#E5E7EB' : '#378ADD'}`,
        borderRadius: 8,
        fontSize: 14,
        boxSizing: 'border-box',
        background: disabled ? '#F9FAFB' : '#fff',
      }}
    />
  )
}

function EtiquetaMini({ texto, fg, bg }: { texto: string; fg: string; bg: string }) {
  return (
    <span style={{ background: bg, color: fg, borderRadius: 999, padding: '0 6px', fontSize: 10, fontWeight: 600, marginLeft: 4 }}>
      {texto}
    </span>
  )
}

function BotonMini({ label, acento, onClick }: { label: string; acento?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${acento ? '#7C3AED' : '#DDD6FE'}`,
        background: acento ? '#7C3AED' : '#fff',
        color: acento ? '#fff' : '#5B21B6',
        borderRadius: 6,
        width: 24,
        height: 24,
        lineHeight: 1,
        cursor: 'pointer',
        fontWeight: 700,
        verticalAlign: 'middle',
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
