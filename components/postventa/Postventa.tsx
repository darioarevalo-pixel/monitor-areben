'use client'

/**
 * Post-venta por roles. Un mismo motor con dos modos (como SolicitudesInner + preset):
 *  - **modo 'local'** (sección `postventa-local`, grupo Local): el local RECIBE la prenda del cliente
 *    y CARGA la falla (elige el artículo de GN, pone el motivo). Ve las fallas, sin acciones de motor.
 *  - **modo 'admin'** (sección `postventa`, grupo Administración): el motor — recibir (mover ubicación
 *    a depósito), CONFIRMAR (genera la venta en GN que descuenta la unidad) y estados; totales
 *    valorizados; etiqueta con código de barras. Cambios (pestaña propia). Devoluciones/Canjes: stub.
 *
 * Marca-scoped por useSesion().marca (bdi | zattia). La confirmación toca stock REAL de GN.
 * Presentación sobre el kit `components/ui` (design-system); la lógica no cambió.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { guardarAdminPass, leerAdminPass } from '@/lib/sesion'
import { BuscarArticuloGN, type ArticuloGN } from '@/components/ui/BuscarArticuloGN'
import {
  Button, SectionCard, Card, StatusPill, Field, Input, Select, NumberField, Toolbar, Tabs, EmptyState, KpiCard,
  TableWrap, THead, TBody, Tr, Th, Td, MoneyText, Notice, color, font, weight, space, type Tone,
} from '@/components/ui'
import { cambiarEstadoFalla, confirmarFalla, crearFalla, eliminarFalla, leerFallas, recibirFalla, registrarVentaGN } from '@/lib/postventa/fallas/cliente'
import { ESTADO_LABEL, UBICACION_LABEL, type FallaEstado, type FallaRow, type FallaUbicacion } from '@/lib/postventa/fallas/tipos'
import { EtiquetaFalla } from './EtiquetaFalla'
import { EditarFalla } from './EditarFalla'
import { Cambios } from '@/components/cambios/Cambios'

type Tab = 'fallas' | 'cambios' | 'devoluciones' | 'canjes'
const TABS: { key: Tab; label: string; listo: boolean }[] = [
  { key: 'fallas', label: 'Fallas', listo: true },
  { key: 'cambios', label: 'Cambios', listo: true },
  { key: 'devoluciones', label: 'Devoluciones', listo: false },
  { key: 'canjes', label: 'Canjes', listo: false },
]

const ESTADO_TONE: Record<FallaEstado, Tone> = {
  cargada: 'warning',
  recibida: 'action',
  confirmada: 'success',
  en_deposito: 'brand',
  vendida_feria: 'success',
  descartada: 'neutral',
}
// Estados que siguen siendo tenencia (para los totales valorizados).
const ACTIVOS: FallaEstado[] = ['cargada', 'recibida', 'confirmada', 'en_deposito']
const FILTROS: ('todas' | FallaEstado)[] = ['todas', 'cargada', 'recibida', 'confirmada', 'vendida_feria', 'descartada']

/** Contraseña del Monitor para escribir en GN (cacheada; se pide una vez). Igual que SesionFotos. */
function obtenerPass(): string {
  let p = leerAdminPass()
  if (!p) {
    p = (typeof window !== 'undefined' ? window.prompt('Ingresá tu contraseña del Monitor (para escribir la venta en GN):') || '' : '').trim()
    if (p) guardarAdminPass(p)
  }
  return p
}

const FORM0 = { producto: '', sku: '', cantidad: '1', motivo: '', valuacion_costo: '', valuacion_pvp_feria: '', precio_lista: '', ubicacion: 'local', product_id: '', size_id: '' }

function PostventaInner({ modo }: { modo: 'local' | 'admin' | 'deposito' }) {
  const { marca, perfil } = useSesion()
  const usuario = perfil?.name || ''
  const [tab, setTab] = useState<Tab>('fallas')

  const [fallas, setFallas] = useState<FallaRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [ocupada, setOcupada] = useState<number | null>(null)
  const [form, setForm] = useState({ ...FORM0 })
  const [filtro, setFiltro] = useState<'todas' | FallaEstado>('todas')
  const [etiqueta, setEtiqueta] = useState<FallaRow | null>(null)
  const [editando, setEditando] = useState<FallaRow | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true); setError(null)
    try { setFallas(await leerFallas(marca)) } catch (e) { setError((e as Error).message) } finally { setCargando(false) }
  }, [marca])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try { const data = await leerFallas(marca); if (vivo) setFallas(data) } catch (e) { if (vivo) setError((e as Error).message) } finally { if (vivo) setCargando(false) }
    })()
    return () => { vivo = false }
  }, [marca])

  const elegirArticulo = useCallback((a: ArticuloGN) => {
    setForm((s) => ({ ...s, producto: a.product_name || s.producto, sku: a.sku || '', product_id: a.product_id, size_id: a.size_id, valuacion_costo: a.unit_cost != null ? String(a.unit_cost) : '', precio_lista: a.retailer_price != null ? String(a.retailer_price) : '' }))
  }, [])

  const agregar = useCallback(async () => {
    if (!form.producto.trim()) { setError('Elegí un artículo o escribí el producto.'); return }
    // Ubicación (de dónde descuenta): Depósito la fija por sección; Admin la elige; Local siempre 'local'.
    const ubic: FallaUbicacion = modo === 'deposito' ? 'deposito' : modo === 'admin' ? (form.ubicacion === 'deposito' ? 'deposito' : 'local') : 'local'
    const snap = {
      cantidad: Math.max(1, parseInt(form.cantidad, 10) || 1),
      product_id: form.product_id || null, size_id: form.size_id || null,
      sku: form.sku.trim() || null, motivo: form.motivo.trim() || null,
      precio_lista: form.precio_lista === '' ? null : Number(form.precio_lista),
      ubicacion: ubic,
    }
    setGuardando(true); setError(null); setMsg(null)
    try {
      const { id, barcode } = await crearFalla(marca, {
        producto: form.producto.trim(), sku: snap.sku, cantidad: snap.cantidad, motivo: snap.motivo,
        valuacion_costo: form.valuacion_costo === '' ? null : Number(form.valuacion_costo),
        valuacion_pvp_feria: form.valuacion_pvp_feria === '' ? null : Number(form.valuacion_pvp_feria),
        precio_lista: snap.precio_lista,
        product_id: snap.product_id, size_id: snap.size_id, ubicacion: snap.ubicacion,
      }, usuario)
      setForm({ ...FORM0 })
      const etiq = barcode ? ` (etiqueta ${barcode})` : ''
      if (snap.product_id && snap.size_id && id) {
        const pass = obtenerPass()
        if (!pass) {
          setMsg(`Falla cargada${etiq}. Falta tu contraseña para descontar el stock en GN — se puede rehacer desde Administración.`)
        } else {
          try {
            await registrarVentaGN(marca, { id, product_id: snap.product_id, size_id: snap.size_id, cantidad: snap.cantidad, sku: snap.sku, motivo: snap.motivo, barcode: barcode ?? null, ubicacion: snap.ubicacion, precio_lista: snap.precio_lista }, { user: usuario, pass })
            setMsg(`Falla cargada${etiq} — venta $0 en GN, stock −1.`)
          } catch (ve) { setError(`Falla cargada${etiq}, pero la venta en GN falló: ${(ve as Error).message}`) }
        }
      } else { setMsg(`Falla cargada${etiq}.`) }
      await recargar()
    } catch (e) { setError((e as Error).message) } finally { setGuardando(false) }
  }, [form, modo, marca, usuario, recargar])

  const recibir = useCallback(async (f: FallaRow) => {
    setOcupada(f.id); setError(null)
    try { await recibirFalla(marca, f.id, usuario); await recargar() } catch (e) { setError((e as Error).message) } finally { setOcupada(null) }
  }, [marca, usuario, recargar])

  const confirmar = useCallback(async (f: FallaRow) => {
    setOcupada(f.id); setError(null); setMsg(null)
    try { await confirmarFalla(marca, f.id, usuario); setMsg('Datos de la falla confirmados.'); await recargar() } catch (e) { setError((e as Error).message) } finally { setOcupada(null) }
  }, [marca, usuario, recargar])

  const cambiarEstado = useCallback(async (f: FallaRow, estado: FallaEstado) => {
    setError(null)
    try { await cambiarEstadoFalla(marca, f.id, estado, usuario); setFallas((fs) => fs.map((x) => (x.id === f.id ? { ...x, estado } : x))) } catch (e) { setError((e as Error).message) }
  }, [marca, usuario])

  const eliminar = useCallback(async (f: FallaRow) => {
    const aviso = f.gn_venta_id
      ? `Eliminar la falla de "${f.producto}" borra el registro del Monitor pero NO anula la venta ya hecha en GN (eso se anula a mano en GN si corresponde). ¿Eliminar?`
      : `Eliminar la falla de "${f.producto}"? Esta acción no se puede deshacer.`
    if (typeof window !== 'undefined' && !window.confirm(aviso)) return
    setOcupada(f.id); setError(null)
    try { await eliminarFalla(marca, f.id); setFallas((fs) => fs.filter((x) => x.id !== f.id)); setMsg('Falla eliminada.') } catch (e) { setError((e as Error).message) } finally { setOcupada(null) }
  }, [marca])

  const visibles = useMemo(() => {
    if (modo !== 'admin') return fallas.filter((f) => f.estado === 'cargada')
    return filtro === 'todas' ? fallas : fallas.filter((f) => f.estado === filtro)
  }, [fallas, filtro, modo])

  const totales = useMemo(() => {
    const act = fallas.filter((f) => ACTIVOS.includes(f.estado))
    let unidades = 0, costo = 0, pvp = 0
    for (const f of act) {
      const c = f.cantidad || 1
      unidades += c; costo += (Number(f.valuacion_costo) || 0) * c; pvp += (Number(f.valuacion_pvp_feria) || 0) * c
    }
    return { unidades, costo, pvp, items: act.length }
  }, [fallas])

  const esAdmin = modo === 'admin'
  const setNum = (k: 'cantidad' | 'valuacion_costo' | 'valuacion_pvp_feria' | 'precio_lista') => (n: number) => setForm((s) => ({ ...s, [k]: String(n) }))

  const avisos = (
    <>
      {msg && <Notice tone="success" icon="✓" onClose={() => setMsg(null)}>{msg}</Notice>}
      {error && <Notice tone="danger" icon="⚠" onClose={() => setError(null)}>{error}</Notice>}
    </>
  )

  // Formulario de carga (Local y Admin).
  const formCarga = (
    <SectionCard title="Cargar falla" style={{ marginBottom: space[4] }}>
      <div style={{ marginBottom: space[3] }}>
        <div style={{ fontSize: font.xs, color: color.mut, marginBottom: 4 }}>Artículo de Gestión Nube (para descontar stock)</div>
        <BuscarArticuloGN marca={marca} onSelect={elegirArticulo} mostrarCosto={esAdmin} />
        {form.product_id && <div style={{ fontSize: font.xs, color: color.success, marginTop: 4 }}>✓ Artículo linkeado ({form.sku || form.product_id}). Al confirmar se descuenta de GN.</div>}
      </div>
      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Producto" required width={220} style={{ flex: '2 1 220px' }}>
          <Input value={form.producto} onChange={(e) => setForm((s) => ({ ...s, producto: e.target.value }))} placeholder="Remera boxy negra" />
        </Field>
        <Field label="Cantidad"><NumberField value={form.cantidad === '' ? '' : Number(form.cantidad)} onChange={setNum('cantidad')} min={1} width={90} /></Field>
        {esAdmin && (
          <>
            <Field label="Descuenta de" hint="ubicación de stock">
              <Select value={form.ubicacion} onChange={(e) => setForm((s) => ({ ...s, ubicacion: e.target.value }))} style={{ width: 130 }}>
                <option value="local">Local</option>
                <option value="deposito">Depósito</option>
              </Select>
            </Field>
            <Field label="Precio lista" hint="para la venta técnica"><NumberField value={form.precio_lista === '' ? '' : Number(form.precio_lista)} onChange={setNum('precio_lista')} min={0} prefix="$" width={120} /></Field>
            <Field label="Costo unit."><NumberField value={form.valuacion_costo === '' ? '' : Number(form.valuacion_costo)} onChange={setNum('valuacion_costo')} min={0} prefix="$" width={120} /></Field>
            <Field label="PVP feria unit."><NumberField value={form.valuacion_pvp_feria === '' ? '' : Number(form.valuacion_pvp_feria)} onChange={setNum('valuacion_pvp_feria')} min={0} prefix="$" width={120} /></Field>
          </>
        )}
        <Field label="Motivo" width={200} style={{ flex: '2 1 200px' }}>
          <Input value={form.motivo} onChange={(e) => setForm((s) => ({ ...s, motivo: e.target.value }))} placeholder="Mancha, costura, etc." />
        </Field>
        <Button variant="solid" tone="brand" iconLeft="＋" onClick={() => void agregar()} disabled={guardando}>{guardando ? 'Guardando…' : 'Cargar'}</Button>
      </div>
    </SectionCard>
  )

  const tablaFallas = cargando ? (
    <Card><div style={{ fontSize: font.sm, color: color.mut, padding: space[4] }}>Cargando fallas…</div></Card>
  ) : visibles.length === 0 ? (
    <Card padding={4}><EmptyState icon="📦" title={fallas.length === 0 ? 'No hay fallas cargadas' : 'No hay fallas con ese estado'} /></Card>
  ) : (
    <TableWrap>
      <THead><Tr>
        <Th>Producto</Th><Th>SKU</Th><Th align="right">Cant.</Th><Th>Motivo</Th><Th>Ubicación</Th>
        {esAdmin && <Th align="right">Costo</Th>}<Th>Estado</Th><Th>Etiqueta</Th>{esAdmin && <Th>Acciones</Th>}
      </Tr></THead>
      <TBody>
        {visibles.map((f) => {
          const ocup = ocupada === f.id
          return (
            <Tr key={f.id}>
              <Td strong wrap>{f.producto}</Td>
              <Td mono style={{ color: color.mut }}>{f.sku || '—'}</Td>
              <Td align="right">{f.cantidad}</Td>
              <Td wrap style={{ color: color.mut }}>{f.motivo || '—'}</Td>
              <Td>{f.ubicacion ? UBICACION_LABEL[f.ubicacion] : '—'}</Td>
              {esAdmin && <Td align="right"><MoneyText value={f.valuacion_costo} /></Td>}
              <Td><StatusPill tone={ESTADO_TONE[f.estado]} label={ESTADO_LABEL[f.estado]} /></Td>
              <Td>{f.barcode ? <Button size="sm" variant="ghost" onClick={() => setEtiqueta(f)}>🏷️ {f.barcode}</Button> : '—'}</Td>
              {esAdmin && (
                <Td>
                  <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                    {f.estado === 'cargada' && <Button size="sm" variant="outline" tone="action" onClick={() => void recibir(f)} disabled={ocup}>{ocup ? '…' : 'Recibir'}</Button>}
                    {(f.estado === 'cargada' || f.estado === 'recibida') && <Button size="sm" variant="outline" tone="success" onClick={() => void confirmar(f)} disabled={ocup} title="Valida los datos de la carga (no toca GN)">{ocup ? '…' : 'Confirmar'}</Button>}
                    <Button size="sm" onClick={() => setEditando(f)}>Editar</Button>
                    <Button size="sm" variant="outline" tone="danger" onClick={() => void eliminar(f)} disabled={ocup}>Eliminar</Button>
                    {(f.estado === 'confirmada' || f.estado === 'en_deposito') && (
                      <>
                        <Button size="sm" variant="outline" tone="success" onClick={() => void cambiarEstado(f, 'vendida_feria')}>Vendida</Button>
                        <Button size="sm" variant="ghost" onClick={() => void cambiarEstado(f, 'descartada')}>Descartar</Button>
                      </>
                    )}
                    {(f.estado === 'vendida_feria' || f.estado === 'descartada') && <Button size="sm" variant="outline" tone="brand" onClick={() => void cambiarEstado(f, 'confirmada')}>Reactivar</Button>}
                  </div>
                </Td>
              )}
            </Tr>
          )
        })}
      </TBody>
    </TableWrap>
  )

  return (
    <div style={{ maxWidth: 1100 }}>
      {etiqueta && <EtiquetaFalla falla={etiqueta} onClose={() => setEtiqueta(null)} />}
      {editando && <EditarFalla marca={marca} falla={editando} onClose={() => setEditando(null)} onSaved={() => { setEditando(null); setMsg('Falla actualizada.'); void recargar() }} />}

      {esAdmin && (
        <Tabs
          variant="pill" value={tab} onChange={(k) => setTab(k as Tab)} style={{ marginBottom: space[4] }}
          items={TABS.map((t) => ({ key: t.key, label: t.label, disabled: !t.listo, hint: t.listo ? undefined : 'Próximamente' }))}
        />
      )}

      {esAdmin && tab === 'cambios' ? (
        <Cambios />
      ) : esAdmin && tab !== 'fallas' ? (
        <Card padding={4}><EmptyState icon="🚧" title={`${TABS.find((t) => t.key === tab)?.label} llega en una próxima tanda`} hint="Post-venta suma esta pestaña más adelante." /></Card>
      ) : (
        <>
          {esAdmin && (
            <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', marginBottom: space[4] }}>
              <KpiCard label="En tenencia" value={`${totales.unidades} u`} sub={`${totales.items} ítems`} />
              <KpiCard label="Valuado a costo" value={<MoneyText value={totales.costo} />} tone="brand" />
              <KpiCard label="Valuado a PVP feria" value={<MoneyText value={totales.pvp} />} tone="success" />
            </div>
          )}

          {!esAdmin && <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[3] }}>Cargá acá la prenda con falla; descuenta el stock de <b>{modo === 'deposito' ? 'Depósito' : 'Local'}</b>. Administración la recibe y confirma.</div>}

          {formCarga}
          {avisos}

          <Toolbar justify="between" style={{ margin: `${space[3]}px 0` }}>
            {esAdmin ? (
              <Tabs variant="underline" value={filtro} onChange={(k) => setFiltro(k as 'todas' | FallaEstado)} items={FILTROS.map((f) => ({ key: f, label: f === 'todas' ? 'Todas' : ESTADO_LABEL[f] }))} />
            ) : (
              <div style={{ fontSize: font.md, fontWeight: weight.bold, color: color.ink2 }}>📦 {modo === 'deposito' ? 'Fallas cargadas (depósito)' : 'Pendientes de enviar a depósito'}{visibles.length ? ` (${visibles.length})` : ''}</div>
            )}
            <Button variant="outline" iconLeft="↻" onClick={() => void recargar()} disabled={cargando}>Recargar</Button>
          </Toolbar>

          {tablaFallas}
        </>
      )}
    </div>
  )
}

export function Postventa() { return <PostventaInner modo="admin" /> }
export function PostventaLocal() { return <PostventaInner modo="local" /> }
export function PostventaDeposito() { return <PostventaInner modo="deposito" /> }
