'use client'

/**
 * Post-venta por roles. Un mismo motor con dos modos (como SolicitudesInner + preset):
 *  - **modo 'local'** (sección `postventa-local`, grupo Local): el local RECIBE la prenda del cliente
 *    y CARGA la falla (elige el artículo de GN, pone el motivo). Ve las fallas, sin acciones de motor.
 *  - **modo 'admin'** (sección `postventa`, grupo Administración): el motor — recibir (mover ubicación
 *    a depósito), CONFIRMAR (genera la venta en GN que descuenta la unidad) y estados; totales
 *    valorizados; etiqueta con código de barras. Cambios/Devoluciones/Canjes: pestañas stub.
 *
 * Marca-scoped por useSesion().marca (bdi | zattia). La confirmación toca stock REAL de GN.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { guardarAdminPass, leerAdminPass } from '@/lib/sesion'
import { BuscarArticuloGN, type ArticuloGN } from '@/components/ui/BuscarArticuloGN'
import { cambiarEstadoFalla, confirmarFalla, crearFalla, eliminarFalla, leerFallas, recibirFalla, registrarVentaGN } from '@/lib/postventa/fallas/cliente'
import { ESTADO_LABEL, UBICACION_LABEL, type FallaEstado, type FallaRow } from '@/lib/postventa/fallas/tipos'
import { EtiquetaFalla } from './EtiquetaFalla'
import { EditarFalla } from './EditarFalla'

type Tab = 'fallas' | 'cambios' | 'devoluciones' | 'canjes'
const TABS: { key: Tab; label: string; listo: boolean }[] = [
  { key: 'fallas', label: 'Fallas', listo: true },
  { key: 'cambios', label: 'Cambios', listo: false },
  { key: 'devoluciones', label: 'Devoluciones', listo: false },
  { key: 'canjes', label: 'Canjes', listo: false },
]

const ESTADO_COLOR: Record<FallaEstado, { color: string; bg: string }> = {
  cargada: { color: '#B45309', bg: '#FFFBEB' },
  recibida: { color: '#1D4ED8', bg: '#EFF6FF' },
  confirmada: { color: '#15803D', bg: '#F0FDF4' },
  en_deposito: { color: '#B45309', bg: '#FFFBEB' },
  vendida_feria: { color: '#15803D', bg: '#F0FDF4' },
  descartada: { color: '#6B7280', bg: '#F3F4F6' },
}
// Estados que siguen siendo tenencia (para los totales valorizados).
const ACTIVOS: FallaEstado[] = ['cargada', 'recibida', 'confirmada', 'en_deposito']

const money = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

/** Contraseña del Monitor para escribir en GN (cacheada; se pide una vez). Igual que SesionFotos. */
function obtenerPass(): string {
  let p = leerAdminPass()
  if (!p) {
    p = (typeof window !== 'undefined' ? window.prompt('Ingresá tu contraseña del Monitor (para escribir la venta en GN):') || '' : '').trim()
    if (p) guardarAdminPass(p)
  }
  return p
}

const btn: React.CSSProperties = { fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer' }
const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', padding: '6px 8px', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { fontSize: 12, padding: '6px 8px', borderBottom: '1px solid #F3F4F6', whiteSpace: 'nowrap' }
const inp: React.CSSProperties = { fontSize: 13, padding: '6px 8px', borderRadius: 8, border: '1px solid #D1D5DB', outline: 'none' }
const tabBtn = (activo: boolean, listo: boolean): React.CSSProperties => ({
  fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8,
  border: '1px solid ' + (activo ? '#D97706' : '#E5E7EB'),
  background: activo ? '#FFFBEB' : '#fff',
  color: activo ? '#B45309' : listo ? '#6B7280' : '#9CA3AF',
  cursor: 'pointer',
})

const FORM0 = { producto: '', sku: '', cantidad: '1', motivo: '', valuacion_costo: '', valuacion_pvp_feria: '', product_id: '', size_id: '' }

function PostventaInner({ modo }: { modo: 'local' | 'admin' }) {
  const { marca, perfil } = useSesion()
  const usuario = perfil?.name || ''
  const [tab, setTab] = useState<Tab>('fallas')

  const [fallas, setFallas] = useState<FallaRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [ocupada, setOcupada] = useState<number | null>(null) // id de la falla en la que se está actuando
  const [form, setForm] = useState({ ...FORM0 })
  const [filtro, setFiltro] = useState<'todas' | FallaEstado>('todas')
  const [etiqueta, setEtiqueta] = useState<FallaRow | null>(null)
  const [editando, setEditando] = useState<FallaRow | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setFallas(await leerFallas(marca))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCargando(false)
    }
  }, [marca])

  // Carga inicial / al cambiar de marca: setState siempre DESPUÉS del await (no dispara set-state-in-effect).
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const data = await leerFallas(marca)
        if (vivo) setFallas(data)
      } catch (e) {
        if (vivo) setError((e as Error).message)
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [marca])

  const elegirArticulo = useCallback((a: ArticuloGN) => {
    setForm((s) => ({
      ...s,
      producto: a.product_name || s.producto,
      sku: a.sku || '',
      product_id: a.product_id,
      size_id: a.size_id,
      valuacion_costo: a.unit_cost != null ? String(a.unit_cost) : '',
    }))
  }, [])

  const agregar = useCallback(async () => {
    if (!form.producto.trim()) { setError('Elegí un artículo o escribí el producto.'); return }
    // Snapshot antes de resetear el form (la venta lo necesita).
    const snap = {
      cantidad: Math.max(1, parseInt(form.cantidad, 10) || 1),
      product_id: form.product_id || null,
      size_id: form.size_id || null,
      sku: form.sku.trim() || null,
      motivo: form.motivo.trim() || null,
    }
    setGuardando(true)
    setError(null)
    setMsg(null)
    try {
      const { id, barcode } = await crearFalla(
        marca,
        {
          producto: form.producto.trim(),
          sku: snap.sku,
          cantidad: snap.cantidad,
          motivo: snap.motivo,
          valuacion_costo: form.valuacion_costo === '' ? null : Number(form.valuacion_costo),
          valuacion_pvp_feria: form.valuacion_pvp_feria === '' ? null : Number(form.valuacion_pvp_feria),
          product_id: snap.product_id,
          size_id: snap.size_id,
          ubicacion: 'local',
        },
        usuario,
      )
      setForm({ ...FORM0 })
      const etiq = barcode ? ` (etiqueta ${barcode})` : ''
      // Carga = entrega: si hay artículo GN, disparo la venta $0 (baja de stock) de una.
      if (snap.product_id && snap.size_id && id) {
        const pass = obtenerPass()
        if (!pass) {
          setMsg(`Falla cargada${etiq}. Falta tu contraseña para descontar el stock en GN — se puede rehacer desde Administración.`)
        } else {
          try {
            await registrarVentaGN(marca, { id, product_id: snap.product_id, size_id: snap.size_id, cantidad: snap.cantidad, sku: snap.sku, motivo: snap.motivo, barcode: barcode ?? null, ubicacion: 'local' }, { user: usuario, pass })
            setMsg(`Falla cargada${etiq} — venta $0 en GN, stock −1.`)
          } catch (ve) {
            setError(`Falla cargada${etiq}, pero la venta en GN falló: ${(ve as Error).message}`)
          }
        }
      } else {
        setMsg(`Falla cargada${etiq}.`)
      }
      await recargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }, [form, marca, usuario, recargar])

  const recibir = useCallback(async (f: FallaRow) => {
    setOcupada(f.id)
    setError(null)
    try {
      await recibirFalla(marca, f.id, usuario)
      await recargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupada(null)
    }
  }, [marca, usuario, recargar])

  // Administración valida los datos de la carga. La venta (baja de stock) ya se hizo al entregar (Local).
  const confirmar = useCallback(async (f: FallaRow) => {
    setOcupada(f.id)
    setError(null)
    setMsg(null)
    try {
      await confirmarFalla(marca, f.id, usuario)
      setMsg('Datos de la falla confirmados.')
      await recargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupada(null)
    }
  }, [marca, usuario, recargar])

  const cambiarEstado = useCallback(async (f: FallaRow, estado: FallaEstado) => {
    setError(null)
    try {
      await cambiarEstadoFalla(marca, f.id, estado, usuario)
      setFallas((fs) => fs.map((x) => (x.id === f.id ? { ...x, estado } : x)))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [marca, usuario])

  const eliminar = useCallback(async (f: FallaRow) => {
    const aviso = f.gn_venta_id
      ? `Eliminar la falla de "${f.producto}" borra el registro del Monitor pero NO anula la venta ya hecha en GN (eso se anula a mano en GN si corresponde). ¿Eliminar?`
      : `Eliminar la falla de "${f.producto}"? Esta acción no se puede deshacer.`
    if (typeof window !== 'undefined' && !window.confirm(aviso)) return
    setOcupada(f.id)
    setError(null)
    try {
      await eliminarFalla(marca, f.id)
      setFallas((fs) => fs.filter((x) => x.id !== f.id))
      setMsg('Falla eliminada.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupada(null)
    }
  }, [marca])

  const visibles = useMemo(() => {
    // Local ve SOLO lo pendiente de enviar a depósito (una vez que Admin la recibe, desaparece de su vista).
    if (modo === 'local') return fallas.filter((f) => f.estado === 'cargada')
    return filtro === 'todas' ? fallas : fallas.filter((f) => f.estado === filtro)
  }, [fallas, filtro, modo])

  const totales = useMemo(() => {
    const act = fallas.filter((f) => ACTIVOS.includes(f.estado))
    let unidades = 0, costo = 0, pvp = 0
    for (const f of act) {
      const c = f.cantidad || 1
      unidades += c
      costo += (Number(f.valuacion_costo) || 0) * c
      pvp += (Number(f.valuacion_pvp_feria) || 0) * c
    }
    return { unidades, costo, pvp, items: act.length }
  }, [fallas])

  const setF = (k: keyof typeof FORM0) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.value }))

  const esAdmin = modo === 'admin'

  const bloqueMsg = (
    <>
      {msg && <div style={{ fontSize: 12, color: '#065F46', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>{msg}</div>}
      {error && <div style={{ fontSize: 12, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>{error}</div>}
    </>
  )

  // Formulario de carga (lo usan Local y Admin).
  const formCarga = (
    <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Cargar falla</div>
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>Artículo de Gestión Nube (para descontar stock)</span>
        <BuscarArticuloGN marca={marca} onSelect={elegirArticulo} />
        {form.product_id && <div style={{ fontSize: 11, color: '#15803D', marginTop: 4 }}>✓ Artículo linkeado ({form.sku || form.product_id}). Al confirmar se descuenta de GN.</div>}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '2 1 200px' }}>
          <span style={{ fontSize: 11, color: '#6B7280' }}>Producto *</span>
          <input style={inp} value={form.producto} onChange={setF('producto')} placeholder="Remera boxy negra" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '0 1 80px' }}>
          <span style={{ fontSize: 11, color: '#6B7280' }}>Cantidad</span>
          <input style={inp} type="number" min={1} value={form.cantidad} onChange={setF('cantidad')} />
        </label>
        {esAdmin && (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '0 1 120px' }}>
              <span style={{ fontSize: 11, color: '#6B7280' }}>Costo unit.</span>
              <input style={inp} type="number" min={0} value={form.valuacion_costo} onChange={setF('valuacion_costo')} placeholder="$" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '0 1 120px' }}>
              <span style={{ fontSize: 11, color: '#6B7280' }}>PVP feria unit.</span>
              <input style={inp} type="number" min={0} value={form.valuacion_pvp_feria} onChange={setF('valuacion_pvp_feria')} placeholder="$" />
            </label>
          </>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '2 1 200px' }}>
          <span style={{ fontSize: 11, color: '#6B7280' }}>Motivo</span>
          <input style={inp} value={form.motivo} onChange={setF('motivo')} placeholder="Mancha, costura, etc." />
        </label>
        <button style={{ ...btn, borderColor: '#D97706', color: '#B45309' }} onClick={() => void agregar()} disabled={guardando}>
          {guardando ? 'Guardando…' : '+ Cargar'}
        </button>
      </div>
    </div>
  )

  const tablaFallas = (
    cargando ? (
      <div style={{ fontSize: 13, color: '#6B7280', padding: 20 }}>Cargando fallas…</div>
    ) : visibles.length === 0 ? (
      <div style={{ fontSize: 13, color: '#6B7280', padding: 20 }}>
        {fallas.length === 0 ? 'No hay fallas cargadas.' : 'No hay fallas con ese estado.'}
      </div>
    ) : (
      <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: 10 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={th}>Producto</th>
              <th style={th}>SKU</th>
              <th style={{ ...th, textAlign: 'right' }}>Cant.</th>
              <th style={th}>Motivo</th>
              <th style={th}>Ubicación</th>
              {esAdmin && <th style={{ ...th, textAlign: 'right' }}>Costo</th>}
              <th style={th}>Estado</th>
              <th style={th}>Etiqueta</th>
              {esAdmin && <th style={th}>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const ec = ESTADO_COLOR[f.estado]
              const ocup = ocupada === f.id
              return (
                <tr key={f.id}>
                  <td style={{ ...td, fontWeight: 600, color: '#111827', whiteSpace: 'normal' }}>{f.producto}</td>
                  <td style={{ ...td, fontFamily: 'monospace', color: '#6B7280' }}>{f.sku || '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{f.cantidad}</td>
                  <td style={{ ...td, whiteSpace: 'normal', color: '#6B7280' }}>{f.motivo || '—'}</td>
                  <td style={td}>{f.ubicacion ? UBICACION_LABEL[f.ubicacion] : '—'}</td>
                  {esAdmin && <td style={{ ...td, textAlign: 'right' }}>{money(f.valuacion_costo)}</td>}
                  <td style={td}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: ec.color, background: ec.bg, borderRadius: 6, padding: '2px 8px' }}>{ESTADO_LABEL[f.estado]}</span>
                  </td>
                  <td style={td}>
                    {f.barcode ? (
                      <button onClick={() => setEtiqueta(f)} style={{ ...btn, padding: '3px 8px', fontSize: 11 }}>🏷️ {f.barcode}</button>
                    ) : '—'}
                  </td>
                  {esAdmin && (
                    <td style={td}>
                      <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                        {f.estado === 'cargada' && (
                          <button style={{ ...btn, padding: '3px 8px', fontSize: 11, borderColor: '#1D4ED8', color: '#1D4ED8' }} onClick={() => void recibir(f)} disabled={ocup}>{ocup ? '…' : 'Recibir'}</button>
                        )}
                        {(f.estado === 'cargada' || f.estado === 'recibida') && (
                          <button style={{ ...btn, padding: '3px 8px', fontSize: 11, borderColor: '#15803D', color: '#15803D' }} onClick={() => void confirmar(f)} disabled={ocup} title="Valida los datos de la carga (no toca GN)">{ocup ? '…' : 'Confirmar'}</button>
                        )}
                        <button style={{ ...btn, padding: '3px 8px', fontSize: 11 }} onClick={() => setEditando(f)}>Editar</button>
                        <button style={{ ...btn, padding: '3px 8px', fontSize: 11, borderColor: '#DC2626', color: '#DC2626' }} onClick={() => void eliminar(f)} disabled={ocup}>Eliminar</button>
                        {(f.estado === 'confirmada' || f.estado === 'en_deposito') && (
                          <>
                            <button style={{ ...btn, padding: '3px 8px', fontSize: 11, borderColor: '#15803D', color: '#15803D' }} onClick={() => void cambiarEstado(f, 'vendida_feria')}>Vendida</button>
                            <button style={{ ...btn, padding: '3px 8px', fontSize: 11, color: '#6B7280' }} onClick={() => void cambiarEstado(f, 'descartada')}>Descartar</button>
                          </>
                        )}
                        {(f.estado === 'vendida_feria' || f.estado === 'descartada') && (
                          <button style={{ ...btn, padding: '3px 8px', fontSize: 11, borderColor: '#D97706', color: '#B45309' }} onClick={() => void cambiarEstado(f, 'confirmada')}>Reactivar</button>
                        )}
                      </span>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  )

  return (
    <div style={{ maxWidth: 1100 }}>
      {etiqueta && <EtiquetaFalla falla={etiqueta} onClose={() => setEtiqueta(null)} />}
      {editando && <EditarFalla marca={marca} falla={editando} onClose={() => setEditando(null)} onSaved={() => { setEditando(null); setMsg('Falla actualizada.'); void recargar() }} />}

      {/* Pestañas solo en el motor (Admin). En Local es directo la carga de fallas. */}
      {esAdmin && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button key={t.key} style={tabBtn(tab === t.key, t.listo)} onClick={() => setTab(t.key)} title={t.listo ? undefined : 'Próximamente'}>
              {t.label}{t.listo ? '' : ' ·'}
            </button>
          ))}
        </div>
      )}

      {esAdmin && tab !== 'fallas' ? (
        <div style={{ fontSize: 13, color: '#6B7280', padding: '28px 20px', border: '1px dashed #E5E7EB', borderRadius: 12, textAlign: 'center' }}>
          <b style={{ color: '#374151' }}>{TABS.find((t) => t.key === tab)?.label}</b> llega en una próxima tanda de Post-venta.
        </div>
      ) : (
        <>
          {esAdmin && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              {[
                { t: 'En tenencia', v: `${totales.unidades} u · ${totales.items} ítems` },
                { t: 'Valuado a costo', v: money(totales.costo) },
                { t: 'Valuado a PVP feria', v: money(totales.pvp) },
              ].map((c) => (
                <div key={c.t} style={{ flex: '1 1 200px', border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>{c.t}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginTop: 2 }}>{c.v}</div>
                </div>
              ))}
            </div>
          )}

          {!esAdmin && (
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 12 }}>
              Cargá acá la prenda con falla que recibís del cliente. Administración la recibe y confirma.
            </div>
          )}

          {formCarga}
          {bloqueMsg}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            {esAdmin ? (
              (['todas', 'cargada', 'recibida', 'confirmada', 'vendida_feria', 'descartada'] as const).map((f) => (
                <button key={f} style={tabBtn(filtro === f, true)} onClick={() => setFiltro(f)}>
                  {f === 'todas' ? 'Todas' : ESTADO_LABEL[f]}
                </button>
              ))
            ) : (
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
                📦 Pendientes de enviar a depósito{visibles.length ? ` (${visibles.length})` : ''}
              </div>
            )}
            <button style={btn} onClick={() => void recargar()} disabled={cargando}>↻ Recargar</button>
          </div>

          {tablaFallas}
        </>
      )}
    </div>
  )
}

export function Postventa() {
  return <PostventaInner modo="admin" />
}

export function PostventaLocal() {
  return <PostventaInner modo="local" />
}
