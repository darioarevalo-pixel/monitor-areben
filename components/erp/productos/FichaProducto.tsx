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
import { Button, ConfirmDetalle, MenuAcciones, MoneyText, Notice, color, font, space, useConfirmar, weight, type AccionMenu } from '@/components/ui'
import { DatoFicha, DatosFicha, FichaCostado, Historial, type HechoHistorial } from '@/components/ui/FichaCostado'
import { ChipEstado, cuandoCorto } from '@/components/ui/PiezasLista'
import { leerHistorialDeEdicion, leerPrecioDeProducto, soltarPrecio, type FilaPrecio, type HechoEdicion, type FilaProducto, type MarcaErp, type PrecioDeProducto } from '@/lib/erp/cliente'
import { NOMBRE_FUENTE } from '@/lib/erp/precio.core.js'
import { usePuedeErp } from '@/lib/erp/usePuedeErp'
import { NOMBRE_DEPOSITO } from '@/lib/erp/stock.core.js'
import { DEPOSITOS } from '@/lib/erp/stock-lista.core.js'
import { CargarPrecio } from './CargarPrecio'
import { EditarProducto } from './EditarProducto'
import type { Tone } from '@/components/ui/tokens'

const FUENTE: Record<string, string> = NOMBRE_FUENTE
/** El estado en Tienda Nube, como chip (diseño §1: verde cumplido · ámbar alguien tiene que hacer algo · gris neutro). */
export const EN_TN: Record<string, readonly [Tone, string]> = { publicado: ['success', 'Publicado'], oculto: ['warning', 'Oculto'], no: ['neutral', 'No está en TN'] }
const LINEA: Record<string, string> = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }
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
  const [cargar, setCargar] = useState(cargarAbierto)
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
      titulo: `${l.nombre}: volver a seguir a ${aQuien?.nombre ?? l.sigue}`,
      mensaje: (
        <div>
          <ConfirmDetalle label="Cargado hoy" valor={<MoneyText value={l.precio ?? 0} />} />
          <ConfirmDetalle label={`Pasa a valer (${aQuien?.nombre ?? l.sigue})`} valor={aQuien?.precio != null ? <MoneyText value={aQuien.precio} /> : 'Sin precio'} />
          <p style={{ marginTop: space[3] }}>El precio cargado queda en el historial. Mientras GN funcione, no cambia lo que cobra la Caja ni lo que muestra Tienda Nube.</p>
        </div>
      ),
      ok: 'Volver a seguir',
      tono: 'warning',
    })
    if (!ok) return
    setTrabajando(true)
    try {
      const r = await soltarPrecio(marca, { producto: f.producto, lista: l.lista })
      setHecho(`${l.nombre}: vuelve a seguir a ${aQuien?.nombre ?? l.sigue}${r.precio != null ? ` ($${r.precio.toLocaleString('es-AR')})` : ''}.`)
      releer()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo volver a seguir.')
    } finally {
      setTrabajando(false)
    }
  }

  const nombre = fila?.nombre ?? f?.nombre ?? `Producto ${producto}`
  const local = f?.listas.find((l) => l.lista === 'local')
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

  const menu: AccionMenu[] = [
    { key: 'etiq', label: 'Etiquetas en el monitor ↗', icono: 'abrir', onClick: () => window.open('/etiquetas', '_blank', 'noopener') },
  ]
  const h3: React.CSSProperties = { margin: 0, fontSize: font.lg, fontWeight: weight.bold }
  const celda: React.CSSProperties = { padding: '8px 0', borderBottom: `1px solid ${color.bg2}` }
  const encabezado = (t: string, i: number) => <span key={i} role="columnheader" style={{ fontSize: font.sm, color: color.mut, textAlign: i ? 'right' : 'left', paddingBottom: 6, borderBottom: `1px solid ${color.line}` }}>{t}</span>

  return (
    <FichaCostado abierta onCerrar={onCerrar} titulo={`Producto · ${producto}`} etiqueta={`Ficha del producto ${nombre}`}>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {hecho && <Notice tone="success" onClose={() => setHecho(null)}>{hecho}</Notice>}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: weight.bold, overflowWrap: 'anywhere' }}>{nombre}</h2>
          <div style={{ color: color.mut }}>{[fila?.categoria, linea && (LINEA[linea] ?? linea)].filter(Boolean).join(' · ') || ' '}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {fila && <ChipEstado mapa={EN_TN} k={fila.tn} />}
            {f?.feria != null && <ChipEstado mapa={{ o: ['brand', 'En oferta (Liquidación)'] }} k="o" />}
            {fila?.costo == null && f && !f.costo && <ChipEstado mapa={{ c: ['warning', 'Sin costo'] }} k="c" />}
          </div>
        </div>
        <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
          <div style={{ fontSize: font.sm, color: color.mut }}>{f?.feria != null ? 'Local (Liquidación)' : 'Precio Local'}</div>
          <div style={{ fontSize: 26, fontWeight: weight.bold, fontVariantNumeric: 'tabular-nums' }}>{!f ? '…' : plata(f.feria ?? local?.precio ?? null)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
        {configura && <Button variant={cargar ? 'outline' : undefined} disabled={!f} onClick={() => setCargar((x) => !x)}>{cargar ? 'Cerrar la carga' : 'Cargar precio o costo'}</Button>}
        {configura && <Button variant="outline" disabled={!fila} onClick={() => setEditar((x) => !x)}>{editar ? 'Cerrar la corrección' : 'Corregir datos'}</Button>}
        <MenuAcciones acciones={menu} etiqueta={`Más acciones del producto ${nombre}`} vertical />
      </div>

      {f?.feria != null && <Notice tone="neutral">Está en oferta (Liquidación): en el local se cobra {plata(f.feria)}, el precio de su campaña, sin el descuento de la forma de pago. Tienda Nube muestra otro precio para la venta online.</Notice>}
      {f?.avisos.map((a) => <Notice key={a} tone="warning">{a}</Notice>)}

      {configura && editar && fila && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: space[2], padding: space[3], border: `1px solid ${color.line}`, borderRadius: 12 }}>
          <div>
            <h3 style={h3}>Corregir datos</h3>
            <div style={{ fontSize: font.sm, color: color.mut }}>nombre, categoría y, de cada variante, talle, SKU y código de barras · el alta del producto es en Ingresos · queda quién y el antes y el después</div>
          </div>
          <EditarProducto key={`${producto}-${vuelta}`} marca={marca} fila={fila} onError={setError} onListo={(h, aviso) => { setHecho(h); if (aviso) setError(aviso); releer() }} />
        </section>
      )}

      {configura && cargar && f && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: space[2], padding: space[3], border: `1px solid ${color.line}`, borderRadius: 12 }}>
          <div>
            <h3 style={h3}>Cargar en el ERP</h3>
            <div style={{ fontSize: font.sm, color: color.mut }}>una fila nueva: lo anterior queda en el historial · mientras GN funcione, no cambia la Caja ni Tienda Nube</div>
          </div>
          <CargarPrecio marca={marca} ficha={f} onError={setError} onListo={(h, aviso) => { setHecho(h); if (aviso) setError(aviso); setCargar(false); releer() }} />
        </section>
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <h3 style={h3}>Listas</h3>
        {!f ? <span style={{ color: color.mut }}>Leyendo…</span> : (
          <div role="table" aria-label="Precio por lista" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) 92px 84px 92px', columnGap: 10, fontVariantNumeric: 'tabular-nums', alignItems: 'baseline' }}>
            {['Lista', 'ERP', 'GN', 'Tienda Nube'].map(encabezado)}
            {f.listas.map((l) => {
              const gn = l.lista === 'local' ? f.gn?.precio : l.lista === 'mayorista' ? f.gn?.mayorista : null
              const tn = l.lista === 'online' ? f.tn?.precio : l.lista === 'local' || l.lista === 'oferta' ? f.tn?.cobra : null
              return (
                <div key={l.lista} role="row" style={{ display: 'contents' }}>
                  <span role="cell" style={celda}>
                    <span style={{ fontWeight: weight.semibold }}>{l.nombre}</span>
                    <div style={{ fontSize: font.sm, color: color.mut }}>
                      {l.fuente ? FUENTE[l.fuente] ?? l.fuente : 'Sin precio'}{l.deLista && ` · sigue a ${nombreLista(l.deLista)}`}{l.desde && ` · ${cuandoCorto(l.desde)}`}
                    </div>
                    {configura && l.puedeSoltar && <Button variant="outline" disabled={trabajando} onClick={() => void soltar(l)} style={{ marginTop: 4 }}>Volver a seguir</Button>}
                  </span>
                  <span role="cell" style={{ ...celda, textAlign: 'right', fontWeight: weight.semibold }}>{plata(l.precio)}</span>
                  <span role="cell" style={{ ...celda, textAlign: 'right', color: color.mut }}>{plata(gn)}</span>
                  <span role="cell" style={{ ...celda, textAlign: 'right', color: color.mut }}>
                    {plata(tn)}
                    {l.lista === 'online' && f.tn?.promocional != null && <div style={{ fontSize: font.sm }}>oferta {plata(f.tn.promocional)}</div>}
                  </span>
                </div>
              )
            })}
            <div role="row" style={{ display: 'contents' }}>
              <span role="cell" style={celda}>
                <span style={{ fontWeight: weight.semibold }}>Costo</span>
                <div style={{ fontSize: font.sm, color: color.mut }}>{f.costo ? `${FUENTE[f.costo.fuente] ?? f.costo.fuente} · ${cuandoCorto(f.costo.desde)}` : 'Sin costo'}</div>
              </span>
              <span role="cell" style={{ ...celda, textAlign: 'right', fontWeight: weight.bold }}>{plata(f.costo?.costo)}</span>
              <span role="cell" style={{ ...celda, textAlign: 'right', color: color.mut }}>{plata(f.gn?.costo)}</span>
              <span role="cell" style={{ ...celda, textAlign: 'right', color: color.mut }}>{plata(f.tn?.costo)}</span>
            </div>
          </div>
        )}
        {f && <div style={{ fontSize: font.sm, color: color.mut }}>Tienda Nube leída {cuandoCorto(f.tnLeidaEn)}{tnVieja && ' (hace más de un día: puede haber cambiado)'}</div>}
      </section>

      <DatosFicha>
        <DatoFicha titulo="Proveedor">
          {!f ? '…' : f.proveedor
            ? <>{f.proveedor.nombre}<div style={{ fontSize: font.sm, color: color.mut }}>{f.proveedor.oc ? `de Ingresos, ${f.proveedor.oc.label ?? 'orden de compra'} del ${f.proveedor.oc.fecha.slice(8, 10)}/${f.proveedor.oc.fecha.slice(5, 7)}` : 'de Gestión Nube (todavía no entró por Ingresos)'}</div></>
            : 'Sin proveedor: todavía no entró por Ingresos'}
        </DatoFicha>
        <DatoFicha titulo="Variantes">{fila ? fila.variantes.length : '…'}</DatoFicha>
        <DatoFicha titulo="Disponible">{fila ? `${fila.disponible} u` : '…'}</DatoFicha>
      </DatosFicha>

      <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <div>
          <h3 style={h3}>Variantes</h3>
          <div style={{ fontSize: font.sm, color: color.mut }}>lo que dice el ERP en cada lugar · disponible = en estantería − pedidos de Tienda Nube sin pagar</div>
        </div>
        {!fila ? <span style={{ color: color.mut }}>Leyendo…</span> : !fila.variantes.length ? <span style={{ color: color.mut }}>Este producto no tiene variantes en el stock.</span> : (
          <div style={{ overflowX: 'auto' }}>
            <div role="table" aria-label="Stock por variante" style={{ display: 'grid', gridTemplateColumns: `minmax(120px, 1fr) repeat(${deps.length}, 72px) 84px`, columnGap: 10, fontVariantNumeric: 'tabular-nums', minWidth: 'max-content' }}>
              {['Variante', ...deps.map((d) => (d === 'local' ? 'Local' : NOMBRE_DEPOSITO[d as keyof typeof NOMBRE_DEPOSITO] ?? d)), 'Disponible'].map(encabezado)}
              {fila.variantes.map((v) => (
                <div key={v.talle} role="row" style={{ display: 'contents' }}>
                  <span role="cell" style={celda} title={v.sku ?? undefined}>{v.talleNombre}<div style={{ fontSize: font.sm, color: color.mut }}>{v.sku ?? 'sin SKU'}{!v.barcode && ' · sin código'}</div></span>
                  {deps.map((d) => <span key={d} role="cell" style={{ ...celda, textAlign: 'right', color: (v.deps[d] ?? 0) < 0 ? 'var(--mo-danger-ink)' : (v.deps[d] ?? 0) === 0 ? color.mut2 : color.ink }}>{v.deps[d] ?? 0}</span>)}
                  <span role="cell" style={{ ...celda, textAlign: 'right', fontWeight: weight.bold, color: v.disponible < 0 ? 'var(--mo-danger-ink)' : v.disponible === 0 ? 'var(--mo-warning-ink)' : color.ink }} title={v.enPedidos ? `${v.enPedidos} apartadas por pedidos sin pagar` : undefined}>{v.disponible}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {!!ediciones?.length && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          <div>
            <h3 style={h3}>Cambios de la ficha</h3>
            <div style={{ fontSize: font.sm, color: color.mut }}>quién editó el producto o sus variantes · el más nuevo arriba</div>
          </div>
          <Historial hechos={ediciones.slice(0, 30).map((h): HechoHistorial => ({
            cuando: h.creada_en, icono: 'lapiz', tono: 'neutral',
            titulo: `${h.entidad === 'variante' ? 'Variante · ' : ''}${h.campo}: ${h.antes ?? 'vacío'} → ${h.despues ?? 'vacío'}`,
            detalle: [h.usuario, h.desde_gn ? 'venía de GN' : null].filter(Boolean).join(' · '),
          }))} cuandoTexto={cuandoCorto} />
        </section>
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <div>
          <h3 style={h3}>Historial de precios y costos</h3>
          <div style={{ fontSize: font.sm, color: color.mut }}>el más nuevo arriba · un precio o un costo nuevo es otra fila: lo anterior no se edita</div>
        </div>
        {!f ? <span style={{ color: color.mut }}>Leyendo…</span> : !hechos.length ? <span style={{ color: color.mut }}>Todavía no hay precios ni costos de este producto en el ERP.</span> : <Historial hechos={hechos} cuandoTexto={cuandoCorto} />}
      </section>
    </FichaCostado>
  )
}
