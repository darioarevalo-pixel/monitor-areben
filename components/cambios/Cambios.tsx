'use client'

/**
 * Cambios (post-venta) — pantalla de venta tipo POS. Un motor, dos modos:
 *  - **local** (`cambios-local`, grupo Local): arma la solicitud (borrador). Busca la orden de TN, marca lo
 *    que el cliente DEVUELVE (entra a la tabla con cantidad negativa), agrega lo que SE LLEVA por el buscador
 *    de artículos de GN (cantidad positiva), define envío / forma de pago / descuento. Guarda borrador.
 *  - **admin** (pestaña Cambios de `postventa`): además ve la lista completa y las acciones del motor.
 *
 * Tabla unificada (una sola): lo que devuelve va NEGATIVO, lo que se lleva POSITIVO; el Subtotal es la suma.
 * El botón verde "Marcar como pagado" genera la venta REAL en GN (habilitado a Local y Admin) cuando están
 * todos los datos obligatorios. El reingreso del devuelto sigue siendo MANUAL (GN no acepta venta negativa).
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { guardarAdminPass, leerAdminPass } from '@/lib/sesion'
import { BuscarArticuloGN, type ArticuloGN } from '@/components/ui/BuscarArticuloGN'
import {
  Button, SectionCard, Card, StatusPill, Field, Input, NumberField, Select, Toolbar, Tabs, EmptyState,
  TableWrap, THead, TBody, Tr, Th, Td, MoneyText, formatMoney, Notice, CopyButton,
  color, radius, font, weight, space,
} from '@/components/ui'
import {
  cambiarEstadoCambio, crearCambio, editarCambio, eliminarCambio, leerCambios, leerOrdenTN,
  marcarReingreso, procesarCambio,
} from '@/lib/cambios/cliente'
import {
  DIAS_CAMBIO, ESTADO_LABEL, ESTADO_TONE, VIA_CON_TRACKING, VIA_LABEL, calcularTotalCambio, detalleCambioTexto,
  faltantesParaVenta, numeroReclamo, repartirSeguimiento, trackingUrl,
  type CambioEstado, type CambioInput, type CambioItem, type CambioRow, type CambioVia, type EnvioPaga,
  type FormaPago, type OrdenTN, type OrdenTNLinea,
} from '@/lib/cambios/tipos'

function obtenerPass(): string {
  let p = leerAdminPass()
  if (!p) {
    p = (typeof window !== 'undefined' ? window.prompt('Ingresá tu contraseña del Monitor (para la venta en GN):') || '' : '').trim()
    if (p) guardarAdminPass(p)
  }
  return p
}

// Línea de la tabla unificada (solo UI). `cantidad` es la magnitud (positiva); el signo lo da `tipo`.
type Linea = {
  key: string
  tipo: 'devuelve' | 'lleva'
  sku: string | null
  product_id: string | null
  size_id: string | null
  producto: string
  variante: string | null
  precio: number
  cantidad: number
  max?: number // tope de cantidad (para devueltos que salen de la orden)
}

const toItem = (l: Linea): CambioItem => ({ sku: l.sku, product_id: l.product_id, size_id: l.size_id, producto: l.producto, variante: l.variante, precio: l.precio, cantidad: l.cantidad })

// Segmented control chico (para vía de envío y quién paga).
function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${color.line2}`, borderRadius: radius.lg, overflow: 'hidden' }}>
      {options.map((o, i) => {
        const on = value === o.v
        return (
          <button
            key={o.v} onClick={() => onChange(o.v)}
            style={{ fontSize: font.sm, fontWeight: weight.semibold, padding: '8px 12px', cursor: 'pointer', border: 'none', borderLeft: i ? `1px solid ${color.line2}` : 'none', background: on ? color.brandBg : color.surface, color: on ? color.brand : color.mut }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

const FILTROS: { key: string; label: string; match: (e: CambioEstado) => boolean }[] = [
  { key: 'todos', label: 'Todos', match: () => true },
  { key: 'borrador', label: 'Borradores', match: (e) => e === 'borrador' || e === 'iniciado' },
  { key: 'en_transito', label: 'En tránsito', match: (e) => e === 'en_transito' },
  { key: 'recibido', label: 'Recibido', match: (e) => e === 'recibido' },
  { key: 'cerrado', label: 'Cerrado', match: (e) => e === 'cerrado' },
]

function CambiosInner({ modo }: { modo: 'local' | 'admin' }) {
  const { marca, perfil } = useSesion()
  const usuario = perfil?.name || ''
  const esAdmin = modo === 'admin'

  const [cambios, setCambios] = useState<CambioRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupada, setOcupada] = useState<number | null>(null)

  // Form (borrador)
  const [ordenNum, setOrdenNum] = useState('')
  const [orden, setOrden] = useState<OrdenTN | null>(null)
  const [cliente, setCliente] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [via, setVia] = useState<CambioVia>('andreani')
  const [seguimiento, setSeguimiento] = useState('')
  const [envioCosto, setEnvioCosto] = useState('')
  const [envioPaga, setEnvioPaga] = useState<EnvioPaga>('cliente')
  const [formaPago, setFormaPago] = useState<FormaPago | ''>('')
  const [descManual, setDescManual] = useState('')
  const [solicitudEnvio, setSolicitudEnvio] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const keyRef = useRef(0)

  // Lista
  const [filtro, setFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [expandido, setExpandido] = useState<number | null>(null) // fila con historial abierto

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
    setBuscando(true); setError(null); setOrden(null)
    try {
      const o = await leerOrdenTN(marca, ordenNum.trim())
      if (!o) { setError('No se encontró la orden.'); return }
      setOrden(o)
      if (o.cliente) setCliente(o.cliente)
    } catch (e) { setError((e as Error).message) } finally { setBuscando(false) }
  }, [ordenNum, marca])

  const devueltos = useMemo(() => lineas.filter((l) => l.tipo === 'devuelve').map(toItem), [lineas])
  const nuevos = useMemo(() => lineas.filter((l) => l.tipo === 'lleva').map(toItem), [lineas])
  const t = useMemo(
    () => calcularTotalCambio({ devueltos, nuevos, forma: formaPago || null, envioCosto: Number(envioCosto) || 0, envioPaga, descuentoManual: Number(descManual) || 0 }),
    [devueltos, nuevos, formaPago, envioCosto, envioPaga, descManual],
  )
  const faltan = useMemo(
    () => faltantesParaVenta({ cliente, orden_tn: ordenNum, items_devueltos: devueltos, items_nuevos: nuevos, forma_pago: formaPago || null, via, envio_paga: envioPaga, solicitud_envio: solicitudEnvio.trim() || null }),
    [cliente, ordenNum, devueltos, nuevos, formaPago, via, envioPaga, solicitudEnvio],
  )

  // ── Líneas de la tabla unificada ──────────────────────────────────────────
  const lineaOrdenKey = (l: OrdenTNLinea) => `d-${l.sku ?? ''}-${l.name || l.sku || 'Producto'}`
  const toggleDevuelto = (l: OrdenTNLinea) => {
    const key = lineaOrdenKey(l)
    setLineas((ls) => ls.some((x) => x.key === key)
      ? ls.filter((x) => x.key !== key)
      : [...ls, { key, tipo: 'devuelve', sku: l.sku ?? null, product_id: null, size_id: null, producto: l.name || l.sku || 'Producto', variante: null, precio: Number(l.price) || 0, cantidad: Number(l.quantity) || 1, max: Number(l.quantity) || undefined }])
  }
  const agregarLleva = useCallback((a: ArticuloGN) => {
    keyRef.current += 1
    setLineas((ls) => [...ls, { key: `l-${a.product_id}-${a.size_id}-${keyRef.current}`, tipo: 'lleva', sku: a.sku, product_id: a.product_id, size_id: a.size_id, producto: a.product_name || a.sku || 'Producto', variante: a.size_name || null, precio: a.retailer_price ?? 0, cantidad: 1 }])
  }, [])
  const actualizarLinea = (key: string, campo: 'precio' | 'cantidad', valor: number) =>
    setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)))
  const quitarLinea = (key: string) => setLineas((ls) => ls.filter((l) => l.key !== key))

  const limpiarForm = useCallback(() => {
    setOrdenNum(''); setOrden(null); setCliente(''); setLineas([]); setVia('andreani'); setSeguimiento('')
    setEnvioCosto(''); setEnvioPaga('cliente'); setFormaPago(''); setDescManual(''); setSolicitudEnvio(''); setEditandoId(null)
  }, [])

  const buildInput = useCallback((): CambioInput => ({
    orden_tn: ordenNum.trim() || null,
    cliente: cliente.trim() || null,
    via, seguimiento: seguimiento.trim() || null,
    items_devueltos: devueltos, items_nuevos: nuevos,
    envio_costo: envioCosto === '' ? null : Number(envioCosto), envio_paga: envioPaga,
    forma_pago: formaPago || null, descuento_manual: descManual === '' ? null : Number(descManual),
    solicitud_envio: solicitudEnvio.trim() || null,
  }), [ordenNum, cliente, via, seguimiento, devueltos, nuevos, envioCosto, envioPaga, formaPago, descManual, solicitudEnvio])

  const guardarBorrador = useCallback(async () => {
    if (!devueltos.length && !nuevos.length) { setError('Agregá al menos un producto (el que devuelve o el que se lleva).'); return }
    setGuardando(true); setError(null); setMsg(null)
    try {
      const input = buildInput()
      if (editandoId != null) { await editarCambio(marca, editandoId, { ...input }); setMsg('Cambio actualizado.') }
      else { await crearCambio(marca, input, usuario); setMsg('Borrador guardado. Cuando esté todo, marcalo como pagado para generar la venta.') }
      limpiarForm(); await recargar()
    } catch (e) { setError((e as Error).message) } finally { setGuardando(false) }
  }, [devueltos, nuevos, buildInput, editandoId, marca, usuario, limpiarForm, recargar])

  // Confirma y genera la venta real en GN a partir de una fila ya guardada.
  const confirmarYProcesar = useCallback(async (row: CambioRow): Promise<boolean> => {
    if (typeof window !== 'undefined' && !window.confirm('Generar la venta REAL del cambio en GN (baja stock de lo que se lleva, cuenta en la analítica). ¿Seguir?')) return false
    const pass = obtenerPass()
    if (!pass) { setError('Necesito tu contraseña para la venta en GN.'); return false }
    await procesarCambio(marca, { ...row, pagado: true }, { user: usuario, pass })
    return true
  }, [marca, usuario])

  // Botón verde del form: guarda (crea/edita) como pagado y genera la venta.
  const marcarPagadoForm = useCallback(async () => {
    if (faltan.length) { setError(`Completá antes de generar la venta: ${faltan.join(', ')}.`); return }
    setGuardando(true); setError(null); setMsg(null)
    try {
      const input = buildInput()
      let id = editandoId
      if (id != null) await editarCambio(marca, id, { ...input, pagado: true })
      else { const r = await crearCambio(marca, { ...input, pagado: true }, usuario); id = r.id ?? null }
      if (id == null) throw new Error('No se pudo guardar el cambio antes de generar la venta.')
      const row: CambioRow = { id, store: marca, estado: 'borrador', reingreso_estado: 'pendiente', pagado: true, ...input, via }
      const ok = await confirmarYProcesar(row)
      if (ok) { setMsg(`Venta del cambio ${numeroReclamo(id)} creada en GN. Cambio en tránsito.`); limpiarForm() }
      await recargar()
    } catch (e) { setError((e as Error).message) } finally { setGuardando(false) }
  }, [faltan, buildInput, editandoId, marca, usuario, via, confirmarYProcesar, limpiarForm, recargar])

  // Botón "Marcar pagado" desde la lista (para un borrador ya completo).
  const marcarPagadoLista = useCallback(async (c: CambioRow) => {
    const f = faltantesParaVenta(c)
    if (f.length) { setError(`Al cambio ${numeroReclamo(c.id)} le falta: ${f.join(', ')}. Editalo y completalo.`); return }
    setOcupada(c.id); setError(null); setMsg(null)
    try {
      if (!c.pagado) await editarCambio(marca, c.id, { pagado: true })
      const ok = await confirmarYProcesar(c)
      if (ok) setMsg(`Venta del cambio ${numeroReclamo(c.id)} creada en GN.`)
      await recargar()
    } catch (e) { setError((e as Error).message) } finally { setOcupada(null) }
  }, [marca, confirmarYProcesar, recargar])

  const abrirEdicion = useCallback((c: CambioRow) => {
    setEditandoId(c.id)
    setOrdenNum(c.orden_tn || '')
    setCliente(c.cliente || '')
    keyRef.current += 1
    const base = keyRef.current
    setLineas([
      // La key del devuelto se reconstruye igual que lineaOrdenKey (`d-{sku}-{producto}`) para que el
      // checkbox de la orden lo reconozca como ya marcado al editar (y toglee bien, sin duplicar).
      ...(c.items_devueltos || []).map((i) => ({ key: `d-${i.sku ?? ''}-${i.producto}`, tipo: 'devuelve' as const, sku: i.sku ?? null, product_id: i.product_id ?? null, size_id: i.size_id ?? null, producto: i.producto, variante: i.variante ?? null, precio: Number(i.precio) || 0, cantidad: Number(i.cantidad) || 1 })),
      ...(c.items_nuevos || []).map((i, k) => ({ key: `l-${base}-${k}`, tipo: 'lleva' as const, sku: i.sku ?? null, product_id: i.product_id ?? null, size_id: i.size_id ?? null, producto: i.producto, variante: i.variante ?? null, precio: Number(i.precio) || 0, cantidad: Number(i.cantidad) || 1 })),
    ])
    setVia(c.via || 'andreani')
    setSeguimiento(c.seguimiento || '')
    setEnvioCosto(c.envio_costo != null ? String(c.envio_costo) : '')
    setEnvioPaga(c.envio_paga || 'cliente')
    setFormaPago(c.forma_pago || '')
    setDescManual(c.descuento_manual != null ? String(c.descuento_manual) : '')
    setSolicitudEnvio(c.solicitud_envio || '')
    setError(null); setMsg(null)
    if (c.orden_tn) void leerOrdenTN(marca, c.orden_tn).then((o) => setOrden(o)).catch(() => setOrden(null))
    else setOrden(null)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [marca])

  const cargarSeguimiento = useCallback(async (c: CambioRow) => {
    const actual = [c.seguimiento, c.seguimiento_vuelta].filter(Boolean).join(' ')
    const s = typeof window !== 'undefined' ? window.prompt('Código(s) de seguimiento — 1 = ida; 2 (separados por espacio) = ida y vuelta:', actual) : null
    if (s === null) return
    const { ida, vuelta } = repartirSeguimiento(s)
    setOcupada(c.id); setError(null)
    try {
      await editarCambio(marca, c.id, { seguimiento: ida, seguimiento_vuelta: vuelta })
      setCambios((cs) => cs.map((x) => (x.id === c.id ? { ...x, seguimiento: ida, seguimiento_vuelta: vuelta } : x)))
      setMsg('Seguimiento actualizado.')
    } catch (e) { setError((e as Error).message) } finally { setOcupada(null) }
  }, [marca])

  const reingreso = useCallback(async (c: CambioRow) => {
    if (typeof window !== 'undefined' && !window.confirm('¿Ya reingresaste el producto devuelto a mano en GN? Se marca como hecho.')) return
    setOcupada(c.id); setError(null)
    try { await marcarReingreso(marca, c.id, usuario); await recargar() } catch (e) { setError((e as Error).message) } finally { setOcupada(null) }
  }, [marca, usuario, recargar])

  const borrar = useCallback(async (c: CambioRow) => {
    if (typeof window !== 'undefined' && !window.confirm(`Eliminar el cambio ${numeroReclamo(c.id)}? (no anula la venta ya hecha en GN)`)) return
    setOcupada(c.id); setError(null)
    try { await eliminarCambio(marca, c.id); setCambios((cs) => cs.filter((x) => x.id !== c.id)); setMsg('Cambio eliminado.') } catch (e) { setError((e as Error).message) } finally { setOcupada(null) }
  }, [marca])

  // Ventana de cambio: 30 días desde la compra.
  const fechaOrden = orden?.fecha ? new Date(orden.fecha) : null
  const vence = fechaOrden ? new Date(fechaOrden.getTime() + DIAS_CAMBIO * 86400000) : null
  const vencido = vence ? new Date() > vence : false
  const fmt = (d: Date | null) => (d ? d.toLocaleDateString('es-AR') : '—')

  const pendientesReingreso = useMemo(() => cambios.filter((c) => c.reingreso_estado === 'pendiente' && !['borrador', 'iniciado', 'anulado'].includes(c.estado)).length, [cambios])

  const visibles = useMemo(() => {
    const f = FILTROS.find((x) => x.key === filtro) || FILTROS[0]
    const q = busqueda.trim().toLowerCase()
    return cambios
      .filter((c) => (modo === 'local' ? ['borrador', 'iniciado', 'en_transito', 'recibido'].includes(c.estado) : true))
      .filter((c) => f.match(c.estado))
      .filter((c) => !q || numeroReclamo(c.id).toLowerCase().includes(q) || (c.cliente || '').toLowerCase().includes(q) || (c.orden_tn || '').toLowerCase().includes(q))
  }, [cambios, filtro, busqueda, modo])

  const detalleForm = () => detalleCambioTexto({ id: editandoId, cliente, items_devueltos: devueltos, items_nuevos: nuevos, forma_pago: formaPago || null, via, envio_costo: Number(envioCosto) || 0, envio_paga: envioPaga, descuento_manual: Number(descManual) || 0, seguimiento })
  const resumenItems = (c: CambioRow) => [...(c.items_nuevos || []).map((i) => `${i.cantidad}× ${i.producto}`), ...(c.items_devueltos || []).map((i) => `↩ ${i.cantidad}× ${i.producto}`)].join(' · ') || '—'

  const totalRow = (label: React.ReactNode, value: React.ReactNode, opts?: { strong?: boolean; sep?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '5px 0', borderTop: opts?.sep ? `1px solid ${color.line}` : undefined, fontSize: opts?.strong ? font.xl : font.base }}>
      <span style={{ color: opts?.strong ? color.ink : color.mut, fontWeight: opts?.strong ? weight.bold : weight.medium }}>{label}</span>
      <span style={{ fontWeight: opts?.strong ? weight.bold : weight.semibold }}>{value}</span>
    </div>
  )

  return (
    <div style={{ maxWidth: 1100, display: 'flex', flexDirection: 'column', gap: space[5] }}>
      {!esAdmin && <div style={{ fontSize: font.sm, color: color.mut }}>Cambio por ENVÍO: buscá la orden, marcá lo que devuelve el cliente y agregá lo que se lleva. Cuando esté todo, «Marcar como pagado» genera la venta.</div>}

      {/* ── Form ─────────────────────────────────────────────────────────── */}
      <SectionCard
        title={editandoId != null ? `Editando ${numeroReclamo(editandoId)}` : 'Nuevo cambio'}
        subtitle={orden ? `${cliente || 's/cliente'} · orden #${String(orden.number)}` : 'Por envío · se guarda como borrador'}
        actions={
          <>
            <CopyButton getText={detalleForm} label="Copiar detalle" share tone="neutral" variant="outline" />
            <Button variant="solid" tone="success" iconLeft="✓" disabled={faltan.length > 0 || guardando} onClick={() => void marcarPagadoForm()} title={faltan.length ? `Falta: ${faltan.join(', ')}` : 'Marca pagado y genera la venta en GN'}>
              Marcar como pagado
            </Button>
          </>
        }
      >
        {/* Buscar orden */}
        <Toolbar gap={2} style={{ alignItems: 'flex-end', marginBottom: space[3] }}>
          <Field label="Nº de orden de Tienda Nube" width={220}>
            <Input value={ordenNum} onChange={(e) => setOrdenNum(e.target.value)} placeholder="ej. 1234" onKeyDown={(e) => e.key === 'Enter' && void buscarOrden()} />
          </Field>
          <Button variant="soft" tone="brand" onClick={() => void buscarOrden()} disabled={buscando} iconLeft="🔎">{buscando ? 'Buscando…' : 'Buscar orden'}</Button>
          {orden && fechaOrden && (
            <StatusPill tone={vencido ? 'danger' : 'neutral'} label={`Compra ${fmt(fechaOrden)} · cambio hasta ${fmt(vence)}${vencido ? ' · FUERA DE PLAZO' : ''}`} dot={false} />
          )}
        </Toolbar>

        {/* Líneas de la orden para marcar lo que devuelve */}
        {orden && (
          <div style={{ marginBottom: space[3] }}>
            <div style={{ fontSize: font.xs, color: color.mut, marginBottom: 6 }}>Marcá lo que DEVUELVE el cliente (entra a la tabla en negativo):</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(orden.products || []).map((l, i) => {
                const on = lineas.some((x) => x.key === lineaOrdenKey(l))
                return (
                  <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: font.sm, cursor: 'pointer' }}>
                    <input type="checkbox" checked={on} onChange={() => toggleDevuelto(l)} />
                    <span style={{ fontWeight: weight.semibold, minWidth: 160 }}>{l.name || l.sku}</span>
                    <span style={{ color: color.mut2, fontFamily: 'monospace' }}>{l.sku || ''}</span>
                    <span style={{ color: color.mut }}>×{l.quantity} · {formatMoney(Number(l.price) || 0)}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {/* Buscar lo que se lleva */}
        <div style={{ marginBottom: space[4] }}>
          <div style={{ fontSize: font.xs, color: color.mut, marginBottom: 6 }}>Agregá lo que el cliente SE LLEVA (de Gestión Nube):</div>
          <div style={{ padding: space[3], background: color.brandBg, border: `1px solid ${color.brandBg2}`, borderRadius: radius.lg }}>
            <BuscarArticuloGN marca={marca} onSelect={agregarLleva} mostrarCosto={false} />
          </div>
        </div>

        {/* Tabla unificada */}
        {lineas.length > 0 ? (
          <TableWrap style={{ marginBottom: space[4] }}>
            <THead><Tr>
              <Th>Producto</Th><Th>Variante</Th><Th align="right">Cantidad</Th><Th align="right">Precio Unitario</Th><Th align="right">Subtotal</Th><Th />
            </Tr></THead>
            <TBody>
              {lineas.map((l) => {
                const signo = l.tipo === 'devuelve' ? -1 : 1
                const sub = signo * (Number(l.precio) || 0) * (Number(l.cantidad) || 0)
                return (
                  <Tr key={l.key}>
                    <Td strong>{l.producto}</Td>
                    <Td style={{ color: color.mut }}>{l.variante || 'Variante única'}</Td>
                    <Td align="right">
                      <NumberField value={l.cantidad} onChange={(n) => actualizarLinea(l.key, 'cantidad', Math.max(1, l.max ? Math.min(n, l.max) : n))} min={1} max={l.max} prefix={l.tipo === 'devuelve' ? '−' : undefined} width={92} />
                    </Td>
                    <Td align="right"><NumberField value={l.precio} onChange={(n) => actualizarLinea(l.key, 'precio', n)} min={0} prefix="$" width={118} /></Td>
                    <Td align="right" strong><MoneyText value={sub} tone={sub < 0 ? 'action' : undefined} /></Td>
                    <Td align="right"><Button size="sm" variant="ghost" tone="danger" onClick={() => quitarLinea(l.key)}>Eliminar</Button></Td>
                  </Tr>
                )
              })}
            </TBody>
          </TableWrap>
        ) : (
          <EmptyState dashed icon="🧾" title="Sin renglones" hint="Marcá lo que devuelve (arriba) y agregá lo que se lleva." style={{ marginBottom: space[4] }} />
        )}

        {/* Totales apilados — productos (van a GN) vs envío (queda en Monitor) */}
        <div style={{ maxWidth: 480, marginLeft: 'auto' }}>
          {totalRow('Subtotal productos', <MoneyText value={t.diferencia} tone={t.diferencia < 0 ? 'action' : undefined} />)}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '5px 0' }}>
            <span style={{ color: color.mut, fontWeight: weight.medium }}>Descuento</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
              <Select value={formaPago} onChange={(e) => setFormaPago(e.target.value as FormaPago | '')} style={{ width: 180 }}>
                <option value="">Forma de pago…</option>
                <option value="tarjeta">Tarjeta (0%)</option>
                <option value="transferencia">Transferencia (−10%)</option>
              </Select>
              <NumberField value={descManual === '' ? '' : Number(descManual)} onChange={(n) => setDescManual(String(n))} min={0} prefix="$" width={110} />
            </div>
          </div>
          {t.descuento > 0 && totalRow(<span style={{ color: color.success }}>Descuento aplicado</span>, <MoneyText value={-t.descuento} tone="success" />)}
          {totalRow('Total productos', <MoneyText value={t.diferencia - t.descuento} strong />, { sep: true })}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '5px 0' }}>
            <span style={{ color: color.mut, fontWeight: weight.medium }}>Envío</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Seg value={via} onChange={setVia} options={[{ v: 'andreani', label: 'Andreani' }, { v: 'correo', label: 'Correo' }, { v: 'cadete', label: 'Cadete' }]} />
              <Seg value={envioPaga} onChange={setEnvioPaga} options={[{ v: 'cliente', label: 'Lo paga el cliente' }, { v: 'nosotros', label: 'Nosotros' }]} />
              <NumberField value={envioCosto === '' ? '' : Number(envioCosto)} onChange={(n) => setEnvioCosto(String(n))} min={0} prefix="$" width={110} />
            </div>
          </div>
          {totalRow('Total a pagar', <MoneyText value={t.total} strong />, { strong: true, sep: true })}
          <div style={{ fontSize: font.xs, color: color.mut2, textAlign: 'right', marginTop: 4 }}>Los productos van a la venta de GN; el envío queda solo en Monitor.</div>
        </div>

        {/* Solicitud de envío (obligatoria) + tracking de ida + guardar */}
        <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-end', flexWrap: 'wrap', marginTop: space[5], paddingTop: space[4], borderTop: `1px solid ${color.line}` }}>
          <Field label="Solicitud de envío (EMXXXX)" required width={190} hint="obligatoria para generar la venta">
            <Input value={solicitudEnvio} onChange={(e) => setSolicitudEnvio(e.target.value)} placeholder="EM1234" invalid={!solicitudEnvio.trim()} />
          </Field>
          {VIA_CON_TRACKING.includes(via) && (
            <Field label="Seguimiento de ida (se puede cargar después)" width={230}>
              <Input value={seguimiento} onChange={(e) => setSeguimiento(e.target.value)} placeholder="tracking de ida" />
            </Field>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: space[2] }}>
            {editandoId != null && <Button variant="ghost" onClick={limpiarForm} disabled={guardando}>Cancelar</Button>}
            <Button variant="outline" tone="brand" iconLeft="💾" onClick={() => void guardarBorrador()} disabled={guardando}>{guardando ? 'Guardando…' : editandoId != null ? 'Guardar cambios' : 'Guardar borrador'}</Button>
          </div>
        </div>
      </SectionCard>

      {msg && <Notice tone="success" icon="✓" onClose={() => setMsg(null)}>{msg}</Notice>}
      {error && <Notice tone="danger" icon="⚠" onClose={() => setError(null)}>{error}</Notice>}
      {esAdmin && pendientesReingreso > 0 && <Notice tone="warning" icon="⏳">{pendientesReingreso} cambio(s) con reingreso pendiente — reingresá el devuelto a mano en GN y marcalo.</Notice>}

      {/* ── Lista ────────────────────────────────────────────────────────── */}
      <div>
        <Toolbar justify="between" style={{ marginBottom: space[3] }}>
          <Tabs variant="underline" value={filtro} onChange={setFiltro} items={FILTROS.map((f) => ({ key: f.key, label: f.label }))} />
          <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar reclamo / cliente / orden" style={{ width: 240 }} />
            <Button variant="outline" onClick={() => void recargar()} disabled={cargando} iconLeft="↻">Recargar</Button>
          </div>
        </Toolbar>

        {cargando ? (
          <Card><div style={{ fontSize: font.sm, color: color.mut, padding: space[4] }}>Cargando…</div></Card>
        ) : visibles.length === 0 ? (
          <Card padding={4}><EmptyState icon="📭" title="No hay cambios" hint="Cuando armes un cambio, aparece acá." /></Card>
        ) : (
          <TableWrap>
            <THead><Tr>
              <Th>Reclamo</Th><Th>Cliente</Th><Th>Orden</Th><Th>Items</Th><Th align="right">Total</Th><Th>Pago</Th><Th>Vía</Th><Th>Seguimiento</Th><Th>Estado</Th><Th>Reingreso</Th><Th>Acciones</Th>
            </Tr></THead>
            <TBody>
              {visibles.map((c) => {
                const ocup = ocupada === c.id
                const esBorrador = c.estado === 'borrador' || c.estado === 'iniciado'
                const conTracking = VIA_CON_TRACKING.includes(c.via)
                const hist = c.historial || []
                return (
                  <Fragment key={c.id}>
                    <Tr>
                      <Td mono strong>{numeroReclamo(c.id)}</Td>
                      <Td>{c.cliente || '—'}</Td>
                      <Td>
                        {c.orden_tn || '—'}
                        {c.solicitud_envio && <div style={{ fontSize: 10, color: color.mut2 }}>📮 {c.solicitud_envio}</div>}
                      </Td>
                      <Td wrap style={{ maxWidth: 240, whiteSpace: 'normal' }}>{resumenItems(c)}</Td>
                      <Td align="right" strong><MoneyText value={c.total != null ? c.total : c.diferencia} /></Td>
                      <Td>
                        <span style={{ fontSize: font.xs, fontWeight: weight.semibold, color: c.pagado ? color.success : color.warning }}>{c.pagado ? '✓ pagado' : 'sin pagar'}</span>
                      </Td>
                      <Td>{VIA_LABEL[c.via]}</Td>
                      <Td>
                        {conTracking ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                            {c.seguimiento && <a href={trackingUrl(c.via, c.seguimiento) || undefined} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: color.action }}>↗ ida {c.seguimiento}</a>}
                            {c.seguimiento_vuelta && <a href={trackingUrl(c.via, c.seguimiento_vuelta) || undefined} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: color.action }}>↗ vuelta {c.seguimiento_vuelta}</a>}
                            <Button size="sm" variant="ghost" onClick={() => void cargarSeguimiento(c)} disabled={ocup}>{c.seguimiento || c.seguimiento_vuelta ? '✎ editar' : '＋ cargar'}</Button>
                          </div>
                        ) : <span style={{ color: color.mut2 }}>—</span>}
                      </Td>
                      <Td>
                        <StatusPill tone={ESTADO_TONE[c.estado]} label={ESTADO_LABEL[c.estado]} />
                        {c.gn_venta_number && <div style={{ fontSize: 10, color: color.mut }}>venta GN #{c.gn_venta_number}</div>}
                      </Td>
                      <Td>{c.reingreso_estado === 'hecho' ? <span style={{ color: color.success }}>✓ hecho</span> : esBorrador ? '—' : <span style={{ color: color.warning }}>pendiente</span>}</Td>
                      <Td>
                        <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                          {(esAdmin || esBorrador) && <Button size="sm" onClick={() => abrirEdicion(c)} disabled={ocup}>✏️ Editar</Button>}
                          {esBorrador && <Button size="sm" variant="solid" tone="success" onClick={() => void marcarPagadoLista(c)} disabled={ocup} title="Marca pagado y genera la venta en GN">Marcar pagado</Button>}
                          <CopyButton getText={() => detalleCambioTexto(c)} label="Copiar" tone="neutral" variant="ghost" />
                          <Button size="sm" variant="ghost" onClick={() => setExpandido(expandido === c.id ? null : c.id)} title="Historial de estados">🕘</Button>
                          {esAdmin && c.estado === 'en_transito' && <Button size="sm" variant="outline" tone="action" onClick={() => void cambiarEstadoCambio(marca, c.id, 'recibido', usuario).then(recargar)} disabled={ocup}>Volvió</Button>}
                          {esAdmin && c.reingreso_estado === 'pendiente' && (c.estado === 'recibido' || c.estado === 'en_transito') && <Button size="sm" variant="outline" tone="brand" onClick={() => void reingreso(c)} disabled={ocup}>Reingresado</Button>}
                          {esAdmin && <Button size="sm" variant="ghost" tone="danger" onClick={() => void borrar(c)} disabled={ocup}>Eliminar</Button>}
                        </div>
                      </Td>
                    </Tr>
                    {expandido === c.id && (
                      <tr>
                        <td colSpan={11} style={{ padding: `${space[2]}px ${space[4]}px`, background: color.bg, borderBottom: `1px solid ${color.line}` }}>
                          <div style={{ fontSize: font.xs, fontWeight: weight.semibold, color: color.mut, marginBottom: 4 }}>Historial de estados</div>
                          {hist.length ? hist.map((h, i) => (
                            <div key={i} style={{ fontSize: font.xs, color: color.ink2, display: 'flex', gap: 8, flexWrap: 'wrap', padding: '1px 0' }}>
                              <span style={{ color: color.mut2, fontVariantNumeric: 'tabular-nums' }}>{new Date(h.at).toLocaleString('es-AR')}</span>
                              <span style={{ fontWeight: weight.semibold }}>{h.estado ? ESTADO_LABEL[h.estado] : '—'}</span>
                              {h.usuario && <span style={{ color: color.mut }}>· {h.usuario}</span>}
                              {h.nota && <span style={{ color: color.mut }}>· {h.nota}</span>}
                            </div>
                          )) : <div style={{ fontSize: font.xs, color: color.mut2 }}>Sin eventos.</div>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </TBody>
          </TableWrap>
        )}
      </div>
    </div>
  )
}

export function Cambios() { return <CambiosInner modo="admin" /> }
export function CambiosLocal() { return <CambiosInner modo="local" /> }
