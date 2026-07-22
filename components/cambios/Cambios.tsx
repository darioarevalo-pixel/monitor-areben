'use client'

/**
 * Cambios (post-venta). Un motor con dos modos (como Fallas):
 *  - **local** (sección `cambios-local`, grupo Local): INICIAR el cambio — buscar la orden de TN, elegir qué
 *    devuelve el cliente y qué se lleva, ver la diferencia de precio, elegir la vía. Vista de los iniciados.
 *  - **admin** (pestaña Cambios del `postventa`, grupo Administración): el motor — CONFIRMAR (genera la venta
 *    de ida que baja stock del producto nuevo), marcar el REINGRESO del devuelto (manual en GN), estados,
 *    editar, eliminar; lista de pendientes de reingreso.
 *
 * El reingreso del devuelto es MANUAL (GN no acepta venta negativa por API): se traza `reingreso_estado`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { guardarAdminPass, leerAdminPass } from '@/lib/sesion'
import { BuscarArticuloGN, type ArticuloGN } from '@/components/ui/BuscarArticuloGN'
import { cambiarEstadoCambio, confirmarCambio, crearCambio, eliminarCambio, leerCambios, leerOrdenTN, marcarReingreso } from '@/lib/cambios/cliente'
import { DIAS_CAMBIO, ESTADO_LABEL, VIA_LABEL, calcularDiferencia, type CambioItem, type CambioRow, type CambioVia, type OrdenTN } from '@/lib/cambios/tipos'

function obtenerPass(): string {
  let p = leerAdminPass()
  if (!p) {
    p = (typeof window !== 'undefined' ? window.prompt('Ingresá tu contraseña del Monitor (para la venta en GN):') || '' : '').trim()
    if (p) guardarAdminPass(p)
  }
  return p
}

const money = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }))
const btn: React.CSSProperties = { fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer' }
const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', padding: '6px 8px', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { fontSize: 12, padding: '6px 8px', borderBottom: '1px solid #F3F4F6', whiteSpace: 'nowrap' }
const inp: React.CSSProperties = { fontSize: 13, padding: '6px 8px', borderRadius: 8, border: '1px solid #D1D5DB', outline: 'none' }

const DIF_LABEL: Record<string, { txt: string; color: string }> = {
  parejo: { txt: 'Parejo', color: '#6B7280' },
  a_cobrar: { txt: 'A cobrar', color: '#B45309' },
  a_devolver: { txt: 'A devolver', color: '#1D4ED8' },
  saldado: { txt: 'Saldado', color: '#15803D' },
}

function CambiosInner({ modo }: { modo: 'local' | 'admin' }) {
  const { marca, perfil } = useSesion()
  const usuario = perfil?.name || ''
  const esAdmin = modo === 'admin'

  const [cambios, setCambios] = useState<CambioRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupada, setOcupada] = useState<number | null>(null)

  // Alta de cambio
  const [ordenNum, setOrdenNum] = useState('')
  const [orden, setOrden] = useState<OrdenTN | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [devueltos, setDevueltos] = useState<CambioItem[]>([])
  const [nuevos, setNuevos] = useState<CambioItem[]>([])
  const [via, setVia] = useState<CambioVia>('andreani')
  const [guardando, setGuardando] = useState(false)

  const recargar = useCallback(async () => {
    setCargando(true); setError(null)
    try { setCambios(await leerCambios(marca)) } catch (e) { setError((e as Error).message) } finally { setCargando(false) }
  }, [marca])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try { const d = await leerCambios(marca); if (vivo) setCambios(d) } catch (e) { if (vivo) setError((e as Error).message) } finally { if (vivo) setCargando(false) }
    })()
    return () => { vivo = false }
  }, [marca])

  const buscarOrden = useCallback(async () => {
    if (!ordenNum.trim()) return
    setBuscando(true); setError(null); setOrden(null); setDevueltos([])
    try {
      const o = await leerOrdenTN(marca, ordenNum.trim())
      if (!o) { setError('No se encontró la orden.'); return }
      setOrden(o)
    } catch (e) { setError((e as Error).message) } finally { setBuscando(false) }
  }, [ordenNum, marca])

  const prodDeLinea = (l: OrdenTN['products'][number]) => l.name || l.sku || 'Producto'
  const toggleDevuelto = (linea: OrdenTN['products'][number]) => {
    const prod = prodDeLinea(linea)
    setDevueltos((ds) => {
      const i = ds.findIndex((d) => (d.sku ?? '') === (linea.sku ?? '') && d.producto === prod)
      if (i >= 0) return ds.filter((_, k) => k !== i)
      return [...ds, { sku: linea.sku ?? null, producto: prod, precio: Number(linea.price) || 0, cantidad: Number(linea.quantity) || 1, product_id: null, size_id: null }]
    })
  }
  const actualizarDevuelto = (idx: number, campo: 'precio' | 'cantidad', valor: number) =>
    setDevueltos((ds) => ds.map((d, k) => (k === idx ? { ...d, [campo]: valor } : d)))

  const agregarNuevo = useCallback((a: ArticuloGN) => {
    setNuevos((ns) => [...ns, { sku: a.sku, product_id: a.product_id, size_id: a.size_id, producto: a.product_name || a.sku || 'Producto', precio: a.retailer_price ?? 0, cantidad: 1 }])
  }, [])
  const quitarNuevo = (i: number) => setNuevos((ns) => ns.filter((_, k) => k !== i))
  const actualizarNuevo = (idx: number, campo: 'precio' | 'cantidad', valor: number) =>
    setNuevos((ns) => ns.map((n, k) => (k === idx ? { ...n, [campo]: valor } : n)))

  const dif = useMemo(() => calcularDiferencia(devueltos, nuevos), [devueltos, nuevos])

  const iniciar = useCallback(async () => {
    if (!devueltos.length && !nuevos.length) { setError('Elegí al menos un producto devuelto o uno nuevo.'); return }
    setGuardando(true); setError(null); setMsg(null)
    try {
      await crearCambio(marca, { orden_tn: ordenNum.trim() || null, cliente: orden?.cliente || null, via, items_devueltos: devueltos, items_nuevos: nuevos }, usuario)
      setMsg('Cambio iniciado.')
      setOrdenNum(''); setOrden(null); setDevueltos([]); setNuevos([]); setVia('andreani')
      await recargar()
    } catch (e) { setError((e as Error).message) } finally { setGuardando(false) }
  }, [marca, ordenNum, orden, via, devueltos, nuevos, usuario, recargar])

  const confirmar = useCallback(async (c: CambioRow) => {
    if (!(c.items_nuevos || []).some((i) => i.product_id && i.size_id)) { setError('El cambio no tiene productos nuevos con artículo de GN.'); return }
    if (typeof window !== 'undefined' && !window.confirm(`Confirmar genera la venta de ida en GN (baja stock del producto nuevo). ¿Seguir?`)) return
    const pass = obtenerPass()
    if (!pass) { setError('Necesito tu contraseña para la venta en GN.'); return }
    setOcupada(c.id); setError(null); setMsg(null)
    try {
      await confirmarCambio(marca, c, { user: usuario, pass })
      setMsg('Cambio confirmado: venta de ida creada en GN.')
      await recargar()
    } catch (e) { setError((e as Error).message) } finally { setOcupada(null) }
  }, [marca, usuario, recargar])

  const reingreso = useCallback(async (c: CambioRow) => {
    if (typeof window !== 'undefined' && !window.confirm('¿Ya reingresaste el producto devuelto a mano en GN? Se marca como hecho.')) return
    setOcupada(c.id); setError(null)
    try { await marcarReingreso(marca, c.id, usuario); await recargar() } catch (e) { setError((e as Error).message) } finally { setOcupada(null) }
  }, [marca, usuario, recargar])

  const borrar = useCallback(async (c: CambioRow) => {
    if (typeof window !== 'undefined' && !window.confirm(`Eliminar el cambio de la orden ${c.orden_tn || c.id}? (no anula la venta ya hecha en GN)`)) return
    setOcupada(c.id); setError(null)
    try { await eliminarCambio(marca, c.id); setCambios((cs) => cs.filter((x) => x.id !== c.id)); setMsg('Cambio eliminado.') } catch (e) { setError((e as Error).message) } finally { setOcupada(null) }
  }, [marca])

  const visibles = useMemo(() => (modo === 'local' ? cambios.filter((c) => c.estado === 'iniciado') : cambios), [cambios, modo])
  const pendientesReingreso = useMemo(() => cambios.filter((c) => c.reingreso_estado === 'pendiente' && c.estado !== 'iniciado' && c.estado !== 'anulado').length, [cambios])

  const lineaSel = (l: OrdenTN['products'][number]) => devueltos.some((d) => (d.sku ?? '') === (l.sku ?? '') && d.producto === prodDeLinea(l))
  const idxDevuelto = (l: OrdenTN['products'][number]) => devueltos.findIndex((d) => (d.sku ?? '') === (l.sku ?? '') && d.producto === prodDeLinea(l))

  // Ventana de cambio: 30 días desde la compra (+ ~15 de envío es la logística real).
  const fechaOrden = orden?.fecha ? new Date(orden.fecha) : null
  const vence = fechaOrden ? new Date(fechaOrden.getTime() + DIAS_CAMBIO * 86400000) : null
  const vencido = vence ? new Date() > vence : false
  const fmt = (d: Date | null) => (d ? d.toLocaleDateString('es-AR') : '—')

  const inpN: React.CSSProperties = { ...inp, width: 90 }
  const inpNs: React.CSSProperties = { ...inp, width: 56 }
  const lblN: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6B7280' }
  const sub = (i: { precio?: number | null; cantidad: number }) => (Number(i.precio) || 0) * (Number(i.cantidad) || 1)

  return (
    <div style={{ maxWidth: 1100 }}>
      {!esAdmin && <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 12 }}>Cambio por ENVÍO: buscá la orden, marcá lo que devuelve el cliente y elegí lo nuevo. Administración lo confirma.</div>}

      {/* Nuevo cambio */}
      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Nuevo cambio <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(por envío)</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '0 1 220px' }}>
            <span style={{ fontSize: 11, color: '#6B7280' }}>Nº de orden de Tienda Nube</span>
            <input style={inp} value={ordenNum} onChange={(e) => setOrdenNum(e.target.value)} placeholder="ej. 1234" onKeyDown={(e) => e.key === 'Enter' && void buscarOrden()} />
          </label>
          <button style={{ ...btn, borderColor: '#D97706', color: '#B45309' }} onClick={() => void buscarOrden()} disabled={buscando}>{buscando ? 'Buscando…' : '🔎 Buscar orden'}</button>
          {orden && <span style={{ fontSize: 12, color: '#111827' }}>Orden #{String(orden.number)} · {orden.cliente || 's/cliente'}</span>}
        </div>

        {orden && fechaOrden && (
          <div style={{ fontSize: 12, marginBottom: 10, color: vencido ? '#991B1B' : '#6B7280' }}>
            🗓️ Compra: <b>{fmt(fechaOrden)}</b> · cambio válido hasta <b>{fmt(vence)}</b> ({DIAS_CAMBIO} días){vencido ? ' — ⚠️ FUERA DE PLAZO' : ''}
          </div>
        )}

        {orden && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>Marcá lo que DEVUELVE el cliente (podés ajustar precio y cantidad):</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(orden.products || []).map((l, i) => {
                const sel = lineaSel(l); const di = idxDevuelto(l); const d = di >= 0 ? devueltos[di] : null
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, flexWrap: 'wrap' }}>
                    <input type="checkbox" checked={sel} onChange={() => toggleDevuelto(l)} />
                    <span style={{ fontWeight: 600, minWidth: 150 }}>{l.name || l.sku}</span>
                    <span style={{ color: '#6B7280', fontFamily: 'monospace' }}>{l.sku || ''}</span>
                    {sel && d ? (
                      <>
                        <label style={lblN}>$ <input style={inpN} type="number" min={0} value={d.precio ?? 0} onChange={(e) => actualizarDevuelto(di, 'precio', Number(e.target.value))} /></label>
                        <label style={lblN}>× <input style={inpNs} type="number" min={1} value={d.cantidad} onChange={(e) => actualizarDevuelto(di, 'cantidad', Number(e.target.value))} /></label>
                        <span style={{ fontWeight: 600 }}>= {money(sub(d))}</span>
                      </>
                    ) : (
                      <span style={{ color: '#6B7280' }}>×{l.quantity} · {money(Number(l.price) || 0)}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: '#6B7280', display: 'block', marginBottom: 3 }}>Producto(s) nuevo(s) que se lleva (de Gestión Nube) — el buscador se limpia al agregar</span>
          <BuscarArticuloGN marca={marca} onSelect={agregarNuevo} mostrarCosto={false} />
          {nuevos.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {nuevos.map((n, i) => (
                <div key={i} style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, minWidth: 150 }}>{n.producto}</span>
                  <span style={{ color: '#6B7280', fontFamily: 'monospace' }}>{n.sku}</span>
                  <label style={lblN}>$ <input style={inpN} type="number" min={0} value={n.precio ?? 0} onChange={(e) => actualizarNuevo(i, 'precio', Number(e.target.value))} /></label>
                  <label style={lblN}>× <input style={inpNs} type="number" min={1} value={n.cantidad} onChange={(e) => actualizarNuevo(i, 'cantidad', Number(e.target.value))} /></label>
                  <span style={{ fontWeight: 600 }}>= {money(sub(n))}</span>
                  <button style={{ ...btn, padding: '1px 8px', fontSize: 11, color: '#DC2626', borderColor: '#FCA5A5' }} onClick={() => quitarNuevo(i)}>quitar</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sumas */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, marginBottom: 10, paddingTop: 8, borderTop: '1px solid #F3F4F6' }}>
          <span style={{ color: '#6B7280' }}>Devuelve: <b style={{ color: '#111827' }}>{money(dif.totalDevueltos)}</b></span>
          <span style={{ color: '#6B7280' }}>Se lleva: <b style={{ color: '#111827' }}>{money(dif.totalNuevos)}</b></span>
          <span style={{ color: DIF_LABEL[dif.estado].color, fontWeight: 700 }}>
            Diferencia: {money(Math.abs(dif.diferencia))} ({DIF_LABEL[dif.estado].txt})
          </span>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '0 1 160px' }}>
            <span style={{ fontSize: 11, color: '#6B7280' }}>Vía de envío</span>
            <select style={inp} value={via} onChange={(e) => setVia(e.target.value as CambioVia)}>
              <option value="andreani">Andreani</option>
              <option value="correo">Correo</option>
              <option value="cadete">Cadete</option>
            </select>
          </label>
          <button style={{ ...btn, borderColor: '#D97706', color: '#B45309' }} onClick={() => void iniciar()} disabled={guardando}>{guardando ? 'Guardando…' : '+ Iniciar cambio'}</button>
        </div>
      </div>

      {msg && <div style={{ fontSize: 12, color: '#065F46', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>{msg}</div>}
      {error && <div style={{ fontSize: 12, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>{error}</div>}

      {esAdmin && pendientesReingreso > 0 && (
        <div style={{ fontSize: 12, color: '#B45309', background: '#FFFBEB', border: '1px solid #FBBF24', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
          ⏳ {pendientesReingreso} cambio(s) con <b>reingreso pendiente</b> — hay que reingresar el producto devuelto a mano en GN y marcarlo.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>{esAdmin ? 'Cambios' : 'Cambios iniciados'}{visibles.length ? ` (${visibles.length})` : ''}</div>
        <button style={btn} onClick={() => void recargar()} disabled={cargando}>↻ Recargar</button>
      </div>

      {cargando ? (
        <div style={{ fontSize: 13, color: '#6B7280', padding: 20 }}>Cargando…</div>
      ) : visibles.length === 0 ? (
        <div style={{ fontSize: 13, color: '#6B7280', padding: 20 }}>No hay cambios.</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: 10 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={th}>Orden</th>
                <th style={th}>Cliente</th>
                <th style={th}>Devuelve</th>
                <th style={th}>Se lleva</th>
                <th style={{ ...th, textAlign: 'right' }}>Diferencia</th>
                <th style={th}>Vía</th>
                <th style={th}>Estado</th>
                <th style={th}>Reingreso</th>
                {esAdmin && <th style={th}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {visibles.map((c) => {
                const ocup = ocupada === c.id
                return (
                  <tr key={c.id}>
                    <td style={{ ...td, fontWeight: 600 }}>{c.orden_tn || '—'}</td>
                    <td style={td}>{c.cliente || '—'}</td>
                    <td style={{ ...td, whiteSpace: 'normal' }}>{(c.items_devueltos || []).map((i) => i.producto).join(', ') || '—'}</td>
                    <td style={{ ...td, whiteSpace: 'normal' }}>{(c.items_nuevos || []).map((i) => i.producto).join(', ') || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', color: DIF_LABEL[c.diferencia_estado || 'parejo'].color, fontWeight: 600 }}>
                      {money(c.diferencia)}<div style={{ fontSize: 10, fontWeight: 500 }}>{DIF_LABEL[c.diferencia_estado || 'parejo'].txt}</div>
                    </td>
                    <td style={td}>{VIA_LABEL[c.via]}</td>
                    <td style={td}><span style={{ fontSize: 11, fontWeight: 600 }}>{ESTADO_LABEL[c.estado]}</span></td>
                    <td style={td}>{c.reingreso_estado === 'hecho' ? <span style={{ color: '#15803D' }}>✓ hecho</span> : c.estado === 'iniciado' ? '—' : <span style={{ color: '#B45309' }}>pendiente</span>}</td>
                    {esAdmin && (
                      <td style={td}>
                        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                          {c.estado === 'iniciado' && <button style={{ ...btn, padding: '3px 8px', fontSize: 11, borderColor: '#15803D', color: '#15803D' }} onClick={() => void confirmar(c)} disabled={ocup}>{ocup ? '…' : 'Confirmar'}</button>}
                          {c.estado === 'en_transito' && <button style={{ ...btn, padding: '3px 8px', fontSize: 11, borderColor: '#1D4ED8', color: '#1D4ED8' }} onClick={() => void cambiarEstadoCambio(marca, c.id, 'recibido', usuario).then(recargar)}>Volvió</button>}
                          {c.reingreso_estado === 'pendiente' && (c.estado === 'recibido' || c.estado === 'en_transito') && <button style={{ ...btn, padding: '3px 8px', fontSize: 11, borderColor: '#D97706', color: '#B45309' }} onClick={() => void reingreso(c)} disabled={ocup}>Reingresado</button>}
                          <button style={{ ...btn, padding: '3px 8px', fontSize: 11, borderColor: '#DC2626', color: '#DC2626' }} onClick={() => void borrar(c)} disabled={ocup}>Eliminar</button>
                        </span>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function Cambios() { return <CambiosInner modo="admin" /> }
export function CambiosLocal() { return <CambiosInner modo="local" /> }
