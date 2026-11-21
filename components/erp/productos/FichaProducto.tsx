'use client'

/**
 * La ficha de un producto, AL COSTADO de la lista de Productos (diseño §5 y tablero 5 del v8): el precio del Local en grande,
 * las listas (el ERP con de dónde salió cada precio, y al lado GN y Tienda Nube), el costo y el proveedor, cada variante con
 * su stock por depósito, el HISTORIAL de precios y costos, y «Cargar en el ERP». Lee `vista=precio&producto=…` (lo que era la
 * pestaña Precios, `PreciosProducto`, 15-oct); las variantes vienen de la fila de la lista.
 *
 * 🔑 El local SIGUE a lo que cobra Tienda Nube con la oferta (motor sql/018). Un precio cargado en una lista que sigue a otra
 *    se puede SOLTAR («Volver a seguir»): una fila nueva, la carga queda en el historial.
 * 🔑 La grilla del diseño era color × talle: en GN cada color es OTRO producto (Zattia: «BERMUDA SE - NEGRO») y la variante es
 *    una sola cosa (talle, modelo de celular) ⇒ una fila por variante, con su stock por depósito.
 */

import { useEffect, useState } from 'react'
import { Button, Icono, Modal, MoneyText, Notice, color, font, space, useConfirmar, weight } from '@/components/ui'
import { DatoFicha, DatosFicha, FichaCostado, Historial, type HechoHistorial, type PieFicha } from '@/components/ui/FichaCostado'
import { usePantallaAngosta } from '@/lib/movil'
import { ChipEstado, cuandoCorto } from '@/components/ui/PiezasLista'
import { editarProductoErp, leerHistorialDeEdicion, leerPrecioDeProducto, soltarPrecio, type FilaPrecio, type HechoEdicion, type FilaProducto, type MarcaErp, type PrecioDeProducto } from '@/lib/erp/cliente'
import { NOMBRE_FUENTE } from '@/lib/erp/precio.core.js'
import { usePuedeErp } from '@/lib/erp/usePuedeErp'
import { NOMBRE_DEPOSITO } from '@/lib/erp/stock.core.js'
import { DEPOSITOS } from '@/lib/erp/stock-lista.core.js'
import { tieneStock } from '@/lib/erp/productos-lista.core.js'
import { CargarPrecio } from './CargarPrecio'
import { EditarProducto } from './EditarProducto'
import type { Tone } from '@/components/ui/tokens'

const FUENTE: Record<string, string> = NOMBRE_FUENTE
/** El estado en Tienda Nube, como chip (diseño §1: verde cumplido · ámbar alguien tiene que hacer algo · gris neutro). */
export const EN_TN: Record<string, readonly [Tone, string]> = { publicado: ['success', 'Publicado'], oculto: ['warning', 'Oculto'], no: ['neutral', 'No está en Tienda Nube'] }
const LINEA: Record<string, string> = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }
/** El nombre de cada dato cambiado, como en la pantalla (el historial guarda el nombre interno). */
const CAMPO: Record<string, string> = { nombre: 'Nombre', categoria: 'Categoría', talle: 'Variante', sku: 'SKU', barcode: 'Código de barras' }
/** Una lectura de TN de más de un día ya puede no ser lo que dice la tienda. */
const VIEJA_MS = 24 * 3600_000
const plata = (n: number | null | undefined) => (n == null ? <span style={{ color: color.mut2 }}>—</span> : <MoneyText value={n} />)

export function FichaProducto({ marca, producto, fila, cargarAbierto, onCerrar, onCargado }: {
  marca: MarcaErp
  producto: string
  /** La fila de la lista (variantes y stock); `null` mientras se relee. */
  fila: FilaProducto | null
  /** Abre con «Cargar en el ERP» a la vista (el ícono $ de la fila). */
  cargarAbierto: boolean
  onCerrar: () => void
  /** Se cargó o se soltó un precio: la lista se vuelve a leer. */
  onCargado: () => void
}) {
  const puede = usePuedeErp(marca)
  const configura = puede('configurar')
  const [f, setF] = useState<PrecioDeProducto | null>(null)
  // Se mide al LEER (⛔ en el render: `Date.now` ahí es impuro).
  const [tnVieja, setTnVieja] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  // Qué fila de Precios está en edición (`costo` o `precio:<lista>`); el $ de la lista abre con el Local.
  const [editando, setEditando] = useState<string | null>(cargarAbierto ? 'precio:local' : null)
  const [editar, setEditar] = useState(false)
  const [ediciones, setEdiciones] = useState<HechoEdicion[] | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [vuelta, setVuelta] = useState(0)
  const { confirmar } = useConfirmar()

  useEffect(() => {
    let vivo = true
    leerPrecioDeProducto(marca, producto)
      .then((x) => { if (vivo) { setF(x); setTnVieja(x.tnLeidaEn ? Date.now() - Date.parse(x.tnLeidaEn) > VIEJA_MS : false); setError(null) } })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo leer el precio.'))
    return () => { vivo = false }
  }, [marca, producto, vuelta])

  // Las ediciones de la ficha (quién cambió qué). Sin la tabla (409) o sin permiso, la sección ⛔ aparece.
  useEffect(() => {
    let vivo = true
    leerHistorialDeEdicion(marca, producto).then((r) => vivo && setEdiciones(r.historial)).catch(() => vivo && setEdiciones(null))
    return () => { vivo = false }
  }, [marca, producto, vuelta])

  const releer = () => { setVuelta((n) => n + 1); onCargado() }

  /** «Volver a seguir»: el precio cargado de la lista se suelta y vuelve a valer el de la lista que sigue. */
  async function soltar(l: FilaPrecio) {
    if (!f || !l.sigue) return
    const aQuien = f.listas.find((x) => x.lista === l.sigue)
    const ok = await confirmar({
      // Darío 20-nov: una pregunta y el cambio de precio; nada más.
      titulo: `¿Igualar ${l.nombre} a ${aQuien?.nombre ?? l.sigue}?`,
      mensaje: <div style={{ fontSize: font.lg, fontVariantNumeric: 'tabular-nums' }}><MoneyText value={l.precio ?? 0} /> → {aQuien?.precio != null ? <MoneyText value={aQuien.precio} /> : 'sin precio'}</div>,
      ok: 'Igualar',
      tono: 'brand',
    })
    if (!ok) return
    setTrabajando(true)
    try {
      const r = await soltarPrecio(marca, { producto: f.producto, lista: l.lista })
      setHecho(r.precio != null ? `Precio ${l.nombre}: $ ${r.precio.toLocaleString('es-AR')}.` : `Precio ${l.nombre} igualado a ${aQuien?.nombre ?? l.sigue}.`)
      releer()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo igualar.')
    } finally {
      setTrabajando(false)
    }
  }

  const nombre = fila?.nombre ?? f?.nombre ?? `Producto ${producto}`
  // Darío 20-nov: «Eliminar» arriba, al lado de Editar, con una sola pregunta. Por dentro es DESACTIVAR (el producto tiene
  // ventas e historial): sale de la lista y queda en «Inactivos», de donde se recupera. Con stock ⛔ se puede.
  const conStock = fila ? tieneStock(fila) : false
  async function cambiarActivo(activo: boolean) {
    const ok = await confirmar({
      titulo: activo ? '¿Activar este producto?' : '¿Eliminar este producto?',
      mensaje: nombre,
      ok: activo ? 'Activar' : 'Eliminar',
      tono: activo ? 'brand' : 'danger',
    })
    if (!ok) return
    setTrabajando(true)
    try {
      await editarProductoErp(marca, producto, { activo })
      onCargado()
      if (activo) releer(); else onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : activo ? 'No se pudo activar el producto.' : 'No se pudo eliminar el producto.')
    } finally {
      setTrabajando(false)
    }
  }
  const linea = fila?.linea ?? (marca === 'bdi' ? 'bdi' : null)
  const deps = DEPOSITOS[marca]
  const nombreLista = (k: string | null) => f?.listas.find((l) => l.lista === k)?.nombre ?? k ?? ''

  const hechos: HechoHistorial[] = (f?.historial ?? []).map((h) => ({
    cuando: h.desde,
    icono: h.que === 'costo' ? 'factura' : 'pesos',
    tono: h.que === 'costo' ? 'neutral' : 'action',
    titulo: `${h.que === 'costo' ? 'Costo' : `Precio ${nombreLista(h.lista)}`} · ${h.valor == null ? 'sin valor' : `$ ${h.valor.toLocaleString('es-AR')}`}`,
    detalle: [FUENTE[h.fuente] ?? h.fuente, h.usuario, h.proveedor, h.motivo].filter(Boolean).join(' · '),
  }))

  const h3: React.CSSProperties = { margin: 0, fontSize: font.lg, fontWeight: weight.bold }
  const celda: React.CSSProperties = { padding: '8px 0', borderBottom: `1px solid ${color.bg2}` }
  // 📱 En el celular la carga de precio va fija al pie; corregir datos y etiquetas, al «⋯».
  const angosta = usePantallaAngosta()
  const pie: PieFicha = {
    otra: configura ? { label: 'Editar', disabled: !fila, onClick: () => setEditar(true) } : undefined,
    mas: configura && fila ? [fila.inactivo
      ? { key: 'activar', label: 'Activar', icono: 'check', onClick: () => void cambiarActivo(true) }
      : { key: 'eliminar', label: 'Eliminar', icono: 'anular', tone: 'danger', disabled: conStock, hint: conStock ? 'Con stock no se puede eliminar.' : undefined, onClick: () => void cambiarActivo(false) }] : [],
  }
  const encabezado = (t: string, i: number) => <span key={i} role="columnheader" style={{ fontSize: font.sm, color: color.mut, textAlign: i ? 'right' : 'left', paddingBottom: 6, borderBottom: `1px solid ${color.line}` }}>{t}</span>
  // Darío 20-nov: UN historial (precios, costos y cambios de la ficha), el más nuevo arriba, como en Ventas.
  const campo = (h: HechoEdicion) => CAMPO[h.campo] ?? h.campo
  const todo: HechoHistorial[] = [
    ...hechos,
    ...(ediciones ?? []).slice(0, 30).map((h): HechoHistorial => ({
      cuando: h.creada_en, icono: 'lapiz', tono: 'neutral',
      titulo: h.campo === 'activo' || h.campo === 'activa'
        ? `${h.entidad === 'variante' ? 'Variante ' : ''}${h.despues === 'true' ? 'Activado' : 'Eliminado'}`
        : `${h.entidad === 'variante' && h.campo !== 'talle' ? 'Variante · ' : ''}${campo(h)}: ${h.antes ?? 'vacío'} → ${h.despues ?? 'vacío'}`,
      detalle: h.usuario,
    })),
  ].sort((a, b) => String(b.cuando).localeCompare(String(a.cuando)))
  const sinDato = <span style={{ color: color.mut2 }}>—</span>

  return (
    <FichaCostado abierta ventana onCerrar={onCerrar} titulo={`Producto ${producto}`} etiqueta={`Ficha del producto ${nombre}`} pie={pie}>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {hecho && <Notice tone="success" onClose={() => setHecho(null)}>{hecho}</Notice>}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: weight.bold, overflowWrap: 'anywhere' }}>{nombre}</h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {fila?.inactivo && <ChipEstado mapa={{ i: ['danger', 'Inactivo'] }} k="i" />}
            {fila && <ChipEstado mapa={EN_TN} k={fila.tn} />}
            {f?.feria != null && <ChipEstado mapa={{ o: ['brand', 'En Liquidación'] }} k="o" />}
            {f?.costos && fila?.costo == null && !f.costo && <ChipEstado mapa={{ c: ['warning', 'Sin costo'] }} k="c" />}
          </div>
        </div>
        {/* Darío 20-nov: sin el precio Local en grande (ninguna lista vale más que otra; ya están en Precios). En su lugar, Editar. */}
        {configura && !angosta && (
          <div style={{ display: 'flex', gap: space[2], flex: '0 0 auto' }}>
            <Button variant="solid" tone="brand" disabled={!fila} onClick={() => setEditar(true)} style={{ gap: 6 }}><Icono nombre="lapiz" size={15} />Editar</Button>
            {fila?.inactivo
              ? <Button variant="outline" disabled={trabajando} onClick={() => void cambiarActivo(true)}>Activar</Button>
              : <Button variant="outline" tone="danger" disabled={!fila || trabajando || conStock} title={conStock ? 'Con stock no se puede eliminar.' : undefined} onClick={() => void cambiarActivo(false)}>Eliminar</Button>}
          </div>
        )}
      </div>


      {f?.avisos.map((a) => <Notice key={a} tone="warning">{a}</Notice>)}

      {/* Darío 20-nov: dos columnas como la venta. Izquierda precios y variantes; derecha los datos y el historial. */}
      <div style={{ display: 'grid', gridTemplateColumns: angosta ? '1fr' : 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: angosta ? space[5] : 32, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[5], minWidth: 0 }}>
          <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
            <h3 style={h3}>Precios</h3>
            {!f ? <span style={{ color: color.mut }}>Leyendo…</span> : (
              <div role="table" aria-label="Precio por lista" style={{ display: 'grid', gridTemplateColumns: `minmax(0, 1fr) 104px 104px${configura ? ' 36px' : ''}`, columnGap: 12, fontVariantNumeric: 'tabular-nums', alignItems: 'center' }}>
                {['Lista', 'Areben Gestión', 'Tienda Nube', ...(configura ? [''] : [])].map(encabezado)}
                {[
                  ...f.listas.map((l) => {
                    const tn = l.lista === 'online' ? f.tn?.precio : l.lista === 'local' || l.lista === 'oferta' ? f.tn?.cobra : null
                    // Darío 20-nov: una lista que copia a otra lo dice («Igual a Online»); la cargada a mano, con su fecha y «Igualar a …».
                    const detalle = l.deLista ? `Igual a ${nombreLista(l.deLista)}` : l.fuente ? `${FUENTE[l.fuente] ?? l.fuente}${l.desde ? ` · ${cuandoCorto(l.desde)}` : ''}` : 'Sin precio'
                    return { k: `precio:${l.lista}`, nombre: l.nombre, valor: l.precio, tn: l.lista === 'mayorista' ? undefined : tn, detalle, l }
                  }),
                  // Sin `costos` el servidor ⛔ manda el costo: la fila ⛔ se dibuja (⛔ un «Sin costo» que mienta).
                  ...(f.costos ? [{ k: 'costo', nombre: 'Costo', valor: f.costo?.costo ?? null, tn: undefined, detalle: f.costo ? `${FUENTE[f.costo.fuente] ?? f.costo.fuente} · ${cuandoCorto(f.costo.desde)}` : 'Sin costo', l: null }] : []),
                ].map((r) => {
                  // La diferencia con Tienda Nube en rojo SÓLO si no coincide (regla de Transferencias).
                  const distinto = r.tn != null && r.valor != null && r.tn !== r.valor
                  const abierta = editando === r.k
                  return (
                    <div key={r.k} role="row" style={{ display: 'contents' }}>
                      <span role="cell" style={{ ...celda, ...(abierta ? { borderBottom: 0 } : {}) }}>
                        <span style={{ fontWeight: weight.medium }}>{r.nombre}</span>
                        <div style={{ fontSize: font.sm, color: color.mut, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.detalle}>{r.detalle}</div>
                        {configura && r.l?.puedeSoltar && !abierta && <button type="button" disabled={trabajando} onClick={() => void soltar(r.l!)} style={{ marginLeft: 6, padding: 0, border: 0, background: 'none', color: 'var(--mo-brand-solid)', fontSize: font.sm, cursor: 'pointer' }}>Igualar a {nombreLista(r.l!.sigue)}</button>}
                      </span>
                      <span role="cell" style={{ ...celda, ...(abierta ? { borderBottom: 0 } : {}), textAlign: 'right' }}>{plata(r.valor)}</span>
                      <span role="cell" style={{ ...celda, ...(abierta ? { borderBottom: 0 } : {}), textAlign: 'right', color: distinto ? 'var(--mo-danger-ink)' : color.mut }}>
                        {r.tn === undefined ? sinDato : plata(r.tn)}
                        {r.k === 'precio:online' && f.tn?.promocional != null && <div style={{ fontSize: font.sm }}>oferta {plata(f.tn.promocional)}</div>}
                      </span>
                      {configura && <span role="cell" style={{ ...celda, ...(abierta ? { borderBottom: 0 } : {}), textAlign: 'right' }}>
                        <button type="button" aria-label={`Editar ${r.nombre.toLowerCase()}`} title={`Editar ${r.nombre.toLowerCase()}`} aria-pressed={abierta} onClick={() => setEditando(abierta ? null : r.k)}
                          style={{ height: 28, width: 28, padding: 0, display: 'inline-grid', placeItems: 'center', border: 0, borderRadius: 7, background: abierta ? 'var(--mo-brand-bg)' : 'transparent', color: abierta ? 'var(--mo-brand-solid)' : color.mut, cursor: 'pointer' }}>
                          <Icono nombre="lapiz" size={15} />
                        </button>
                      </span>}
                      {abierta && (
                        <div style={{ gridColumn: '1 / -1', padding: '4px 12px 12px', margin: '0 0 4px', background: color.bg, borderRadius: 10, borderBottom: `1px solid ${color.bg2}` }}>
                          <CargarPrecio key={r.k} fijo={r.k} marca={marca} ficha={f} onError={setError} onCancelar={() => setEditando(null)} onListo={(h, aviso) => { setHecho(h); if (aviso) setError(aviso); setEditando(null); releer() }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {f && tnVieja && <div style={{ fontSize: font.sm, color: 'var(--mo-warning-ink)' }}>Tienda Nube al {cuandoCorto(f.tnLeidaEn)}.</div>}
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
            <h3 style={h3}>Variantes{fila ? ` · ${fila.variantes.length}` : ''}</h3>
            {!fila ? <span style={{ color: color.mut }}>Leyendo…</span> : !fila.variantes.length ? <span style={{ color: color.mut }}>Sin variantes.</span> : (
              <div style={{ overflowX: 'auto' }}>
                <div role="table" aria-label="Stock por variante" style={{ display: 'grid', gridTemplateColumns: `minmax(120px, 1fr) repeat(${deps.length}, 72px) 84px`, columnGap: 10, fontVariantNumeric: 'tabular-nums', minWidth: 'max-content' }}>
                  {['Variante', ...deps.map((d) => (d === 'local' ? 'Local' : NOMBRE_DEPOSITO[d as keyof typeof NOMBRE_DEPOSITO] ?? d)), 'Disponible'].map(encabezado)}
                  {fila.variantes.map((v) => (
                    <div key={v.talle} role="row" style={{ display: 'contents' }}>
                      <span role="cell" style={celda}>{v.talleNombre}<div style={{ fontSize: font.sm, color: color.mut }}>{[v.sku ?? 'sin SKU', !v.barcode && 'sin código de barras'].filter(Boolean).join(' · ')}</div></span>
                      {deps.map((d) => <span key={d} role="cell" style={{ ...celda, textAlign: 'right', color: (v.deps[d] ?? 0) < 0 ? 'var(--mo-danger-ink)' : (v.deps[d] ?? 0) === 0 ? color.mut2 : color.ink }}>{v.deps[d] ?? 0}</span>)}
                      <span role="cell" style={{ ...celda, textAlign: 'right', fontWeight: weight.bold, color: v.disponible < 0 ? 'var(--mo-danger-ink)' : v.disponible === 0 ? 'var(--mo-warning-ink)' : color.ink }} title={v.enPedidos ? `${v.enPedidos} reservadas por pedidos sin pagar` : undefined}>{v.disponible}</span>
                    </div>
                  ))}
                  <div role="row" style={{ display: 'contents' }}>
                    <span role="cell" style={{ padding: '8px 0', fontWeight: weight.bold }}>Total</span>
                    {deps.map((d) => <span key={d} role="cell" style={{ padding: '8px 0', textAlign: 'right', fontWeight: weight.semibold }}>{fila.variantes.reduce((a, v) => a + (v.deps[d] ?? 0), 0)}</span>)}
                    <span role="cell" style={{ padding: '8px 0', textAlign: 'right', fontWeight: weight.bold }}>{fila.disponible}</span>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: space[5], minWidth: 0 }}>
          <DatosFicha>
            <DatoFicha titulo="Proveedor">
              {!f ? '…' : f.proveedor
                ? <>{f.proveedor.nombre}{f.proveedor.oc && <div style={{ fontSize: font.sm, color: color.mut }}>{`${f.proveedor.oc.label ?? 'Orden de compra'} · ${f.proveedor.oc.fecha.slice(8, 10)}/${f.proveedor.oc.fecha.slice(5, 7)}`}</div>}</>
                : 'Sin proveedor'}
            </DatoFicha>
            <DatoFicha titulo="Categoría">{fila?.categoria ?? '—'}</DatoFicha>
            <DatoFicha titulo="Marca">{linea ? LINEA[linea] ?? linea : '—'}</DatoFicha>
            {f?.feria != null && <DatoFicha titulo="Liquidación">{plata(f.feria)}</DatoFicha>}
          </DatosFicha>

          <section style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
            <h3 style={h3}>Historial</h3>
            {!f ? <span style={{ color: color.mut }}>Leyendo…</span> : !todo.length ? <span style={{ color: color.mut }}>Sin movimientos.</span> : <Historial hechos={todo} cuandoTexto={cuandoCorto} />}
          </section>
        </div>
      </div>

      {configura && editar && fila && (
        <Modal abierto onCerrar={() => setEditar(false)} titulo={`Editar ${nombre}`} ancho="ancho">
          <EditarProducto key={`${producto}-${vuelta}`} marca={marca} fila={fila} onError={setError} onListo={(h, aviso) => { setHecho(h); if (aviso) setError(aviso); setEditar(false); releer() }} onCancelar={() => setEditar(false)} />
        </Modal>
      )}
    </FichaCostado>
  )
}
