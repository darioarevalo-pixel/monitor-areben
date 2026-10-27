'use client'

/**
 * ERP › Ventas › Facturación, con el molde (🎨 Diseño 7; diseño §3–§4, tablero «Facturas» del v8): arriba el TOPE del mes
 * (lo que entró a cuentas de Areben) con lo facturado y lo pendiente; abajo UNA lista con tres vistas —Sin factura (se
 * tildan ⇒ «Facturar») · Facturas (GN + ERP) · Notas de crédito— de la marca del menú.
 *
 * 🔴 Lo que se manda son IDS: el monto de cada factura lo rearma el servidor con los cobros, y el servidor rechaza un grupo
 * que pase lo pendiente. La pantalla sólo propone. ⛔ cambia qué se calcula (`leerMes`, `facturarVentas`, el lote).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, ConfirmDetalle, EmptyState, Input, MenuAcciones, Notice, color, font, space, useConfirmar, type AccionMenu } from '@/components/ui'
import { ListaTrabajo, type OrdenLista } from '@/components/ui/ListaTrabajo'
import { AccionSeleccion, BarraSeleccion } from '@/components/ui/FichaCostado'
import { BuscadorLista, ChipEstado, TileResumen, VistasLista } from '@/components/ui/PiezasLista'
import { cerrarMes, facturar, leerFacturas, leerMes, notaDeCredito, notaDeDebito, type MarcaErp, type MesFacturacion, type ResultadoLote, type VentaParaFacturar } from '@/lib/erp/cliente'
import { filasDeFacturacion, ordenarFilas, ventasConNC } from '@/lib/erp/facturacion-lista.core.js'
import { normal } from '@/lib/erp/stock-lista.core.js'
import { proponerLote } from '@/motor/arca/mes.core.js'
import { descargarFactura, numeroComprobante, type FacturaEmitida } from '@/lib/arca/factura-pdf'
import { EMISOR, faltanDelEmisor } from '@/motor/arca/emisor.core.js'
import { esDeVentaPropia } from '@/lib/erp/factura.core.js'

const NOMBRE_MARCA: Record<MarcaErp, string> = { zattia: 'Zattia', bdi: 'BDI' }
const mesActual = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7)
const pesos = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 })
const pesosCortos = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const dia = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—')
/** Más de ~300 filas ⇒ de a tandas: `ListaTrabajo` ⛔ es virtual (BDI tuvo 355 sin factura en octubre). */
const TANDA = 300

type Fila = {
  id: string; vista: 'sin' | 'facturas' | 'notas'; ventaId: string; numero: string | null; cliente: string | null
  fecha: string | null; total: number; busca: string
  cuentas?: string[]; de?: 'gn' | 'erp'; comprobante?: string; cae?: string | null; estado?: string | null; emitida?: FacturaEmitida
}

const VISTAS = [['sin', 'Sin factura'], ['facturas', 'Facturas'], ['notas', 'Notas de crédito']] as const
const COLUMNAS_SIN = [
  { key: 'nro', titulo: 'Venta', ancho: '84px' },
  { key: 'cliente', titulo: 'Cliente', ancho: 'minmax(180px, 1.6fr)', ordena: true },
  { key: 'fecha', titulo: 'Último cobro', ancho: '104px', ordena: true },
  { key: 'cuentas', titulo: 'Entró a', ancho: 'minmax(180px, 1.4fr)' },
  { key: 'total', titulo: 'A facturar', ancho: '128px', derecha: true, ordena: true },
]
const COLUMNAS_FACT = [
  { key: 'comp', titulo: 'Comprobante', ancho: '200px' },
  { key: 'fecha', titulo: 'Fecha', ancho: '72px', ordena: true },
  { key: 'nro', titulo: 'Venta', ancho: '84px' },
  { key: 'cliente', titulo: 'Cliente', ancho: 'minmax(170px, 1.4fr)', ordena: true },
  { key: 'cae', titulo: 'CAE', ancho: '140px' },
  { key: 'de', titulo: 'Salió de', ancho: '150px' },
  { key: 'total', titulo: 'Total', ancho: '128px', derecha: true, ordena: true },
]

export function Facturacion() {
  const { marca: delShell } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const { confirmar, pedirTexto } = useConfirmar()
  const [mes, setMes] = useState(mesActual)
  const [datos, setDatos] = useState<MesFacturacion | null>(null)
  const [facturas, setFacturas] = useState<FacturaEmitida[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState<string>('sin')
  const [q, setQ] = useState('')
  const [orden, setOrden] = useState<OrdenLista>(null)
  const [cuantas, setCuantas] = useState(TANDA)
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [trabajando, setTrabajando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoLote | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const leer = useCallback(async () => {
    try {
      const [d, f] = await Promise.all([leerMes(mes), leerFacturas(mes).catch(() => null)])
      setDatos(d)
      setFacturas(f ? f.facturas : null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la facturación del mes.')
    }
  }, [mes])

  useEffect(() => {
    void (async () => {
      await leer()
    })()
  }, [leer])

  // Otro mes u otra vista: lo de antes se limpia en el MISMO cambio, ⛔ en un efecto (renders en cascada).
  function cambiarMes(m: string) {
    setMes(m)
    setDatos(null)
    setFacturas(null)
    setElegidas(new Set())
    setResultado(null)
  }
  function cambiarVista(v: string) {
    setVista(v)
    setOrden(null)
    setCuantas(TANDA)
  }

  // Lo elegido es de UNA marca: si cambia la del menú, la selección vieja ⛔ se manda (se filtra por las filas de ahora).
  const grupos = useMemo(
    () => (datos ? filasDeFacturacion({ marca, ventas: datos.ventas, facturasGN: datos.facturasGN, facturas }) : { sin: [], facturas: [], notas: [] }),
    [datos, facturas, marca],
  ) as { sin: Fila[]; facturas: Fila[]; notas: Fila[] }
  const t = normal(q)
  const buscadas = useMemo(() => Object.fromEntries(VISTAS.map(([k]) => [k, t ? grupos[k].filter((f) => f.busca.includes(t)) : grupos[k]])) as Record<Fila['vista'], Fila[]>, [grupos, t])
  const conteo = Object.fromEntries(VISTAS.map(([k]) => [k, buscadas[k].length]))
  const enVista = (VISTAS.some(([k]) => k === vista) ? vista : 'sin') as Fila['vista']
  const todas = ordenarFilas(buscadas[enVista], orden) as Fila[]
  const filas = todas.slice(0, cuantas)

  const elegidasDeMarca = grupos.sin.filter((f) => elegidas.has(f.id))
  const sumaElegidas = elegidasDeMarca.reduce((a, f) => a + f.total, 0)
  const sumaSin = grupos.sin.reduce((a, f) => a + f.total, 0)
  const conNC = useMemo(() => ventasConNC(facturas), [facturas])
  const prueba = datos?.ambiente !== 'produccion'
  const pv = datos?.puntosDeVenta[marca] ?? null
  // Por qué ⛔ se puede facturar lo elegido (null = se puede). Lo vuelve a frenar el servidor: esto es para decirlo antes.
  const freno = !datos ? 'Leyendo el mes…'
    : !datos.ambiente ? 'La facturación está apagada en este servidor.'
      : sumaElegidas > datos.pendiente + 0.005 ? `Pasa lo pendiente del mes (${pesosCortos(datos.pendiente)}).`
        : elegidasDeMarca.length > datos.porPedido ? `Hasta ${datos.porPedido} ventas por vez.`
          : null

  function proponer() {
    if (!datos) return
    const tope = Math.min(datos.porPedido, grupos.sin.length)
    const lote = proponerLote(grupos.sin.map((f) => ({ marca, ventaId: f.ventaId, fecha: f.fecha, monto: f.total, cuentas: f.cuentas ?? [] })), datos.pendiente) as VentaParaFacturar[]
    setElegidas(new Set(lote.slice(0, tope).map((v) => v.ventaId)))
    cambiarVista('sin')
  }

  async function mandar() {
    if (!datos || !elegidasDeMarca.length || freno) return
    const ok = await confirmar({
      titulo: prueba ? 'Facturar en el ambiente de prueba' : 'Facturar con ARCA',
      mensaje: (
        <div>
          <ConfirmDetalle label="Marca" valor={NOMBRE_MARCA[marca]} />
          <ConfirmDetalle label="Ventas" valor={elegidasDeMarca.length} />
          <ConfirmDetalle label="Total" valor={pesos(sumaElegidas)} />
          <ConfirmDetalle label="Punto de venta" valor={pv ?? '—'} />
          <p style={{ marginTop: space[3] }}>
            {prueba
              ? 'Son facturas de PRUEBA (modo de prueba de ARCA): no tienen validez fiscal.'
              : 'Son facturas REALES: una vez autorizadas no se pueden eliminar, sólo anular con nota de crédito.'}
          </p>
        </div>
      ),
      ok: `Facturar ${elegidasDeMarca.length}`,
      tono: prueba ? 'warning' : 'danger',
    })
    if (!ok) return
    setTrabajando(true)
    setResultado(null)
    try {
      setResultado(await facturar(mes, marca, elegidasDeMarca.map((f) => f.ventaId)))
      setElegidas(new Set())
      await leer()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo facturar.')
    } finally {
      setTrabajando(false)
    }
  }

  /** Con el MISMO aviso que facturar: en producción la NC es REAL y con CAE ⛔ se elimina. */
  async function anularConNC(f: FacturaEmitida) {
    const deVerdad = f.ambiente === 'produccion'
    const ok = await confirmar({
      titulo: deVerdad ? 'Nota de crédito con ARCA' : 'Nota de crédito en el ambiente de prueba',
      mensaje: (
        <div>
          <ConfirmDetalle label="Anula la factura" valor={numeroComprobante(f)} />
          <ConfirmDetalle label="Total" valor={pesos(f.total)} />
          <p style={{ marginTop: space[3] }}>
            {deVerdad ? 'Es REAL: una vez autorizada no se puede eliminar.' : 'Es de PRUEBA (modo de prueba de ARCA): no tiene validez fiscal.'}
          </p>
        </div>
      ),
      ok: 'Hacer nota de crédito',
      tono: deVerdad ? 'danger' : 'warning',
    })
    if (!ok) return
    setTrabajando(true)
    try {
      const r = await notaDeCredito(f.id)
      setAviso(`Nota de crédito ${r.autorizada.numero} autorizada (CAE ${r.autorizada.cae}) por ${pesos(r.autorizada.total)}.`)
      await leer()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo hacer la nota de crédito.')
    } finally {
      setTrabajando(false)
    }
  }

  /** La nota de DÉBITO suma un importe a la factura (un recargo, una diferencia): pide el importe y confirma con el mismo aviso que la NC. */
  async function sumarConND(f: FacturaEmitida) {
    const texto = await pedirTexto(`Importe a sumar a la factura ${numeroComprobante(f)} (IVA incluido, en pesos)`, '', { titulo: 'Nota de débito', placeholder: 'Ej.: 1500', ok: 'Seguir' })
    if (texto === null) return
    const monto = Math.round(Number(texto.replace(/\./g, '').replace(',', '.')) * 100) / 100
    if (!(monto > 0)) { setError('Poné un importe mayor a 0.'); return }
    const deVerdad = f.ambiente === 'produccion'
    const ok = await confirmar({
      titulo: deVerdad ? 'Nota de débito con ARCA' : 'Nota de débito en el ambiente de prueba',
      mensaje: (
        <div>
          <ConfirmDetalle label="Se suma a la factura" valor={numeroComprobante(f)} />
          <ConfirmDetalle label="Importe" valor={pesos(monto)} />
          <p style={{ marginTop: space[3] }}>
            {deVerdad ? 'Es REAL: una vez autorizada no se puede eliminar; un error se corrige con una nota de crédito.' : 'Es de PRUEBA (modo de prueba de ARCA): no tiene validez fiscal.'}
          </p>
        </div>
      ),
      ok: 'Hacer nota de débito',
      tono: deVerdad ? 'danger' : 'warning',
    })
    if (!ok) return
    setTrabajando(true)
    try {
      const r = await notaDeDebito(f.id, monto)
      setAviso(`Nota de débito ${r.autorizada.numero} autorizada (CAE ${r.autorizada.cae}) por ${pesos(r.autorizada.total)}.`)
      await leer()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo hacer la nota de débito.')
    } finally {
      setTrabajando(false)
    }
  }

  async function bajar(f: FacturaEmitida) {
    try {
      await descargarFactura(f)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo armar el PDF.')
    }
  }

  async function cerrar() {
    if (!datos) return
    const ok = await confirmar({
      titulo: `Cerrar ${mes}`,
      mensaje: (
        <div>
          <ConfirmDetalle label="Tope que queda fijo" valor={pesos(datos.techoCalculado)} />
          <p style={{ marginTop: space[3] }}>
            Desde que se cierra, el tope ya no cambia aunque se reclasifique una cuenta o Gestión Nube anule una venta. Se sigue
            facturando contra ese número.
          </p>
        </div>
      ),
      ok: 'Cerrar mes',
      tono: 'warning',
    })
    if (!ok) return
    try {
      await cerrarMes(mes)
      await leer()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cerrar el mes.')
    }
  }

  function alternar(f: Fila) {
    if (f.vista !== 'sin') return
    setElegidas((s) => {
      const n = new Set(s)
      if (n.has(f.id)) n.delete(f.id)
      else n.add(f.id)
      return n
    })
  }

  const nombreVenta = (f: Fila) => (f.numero ? `#${f.numero}` : f.ventaId)
  const celda = (f: Fila, k: string): React.ReactNode => {
    if (k === 'nro') return <span style={{ color: color.ink2, fontVariantNumeric: 'tabular-nums' }} title={`Venta ${f.ventaId} en Gestión Nube`}>{nombreVenta(f)}</span>
    if (k === 'cliente') return f.cliente ? <b style={{ color: color.ink }} title={f.cliente}>{f.cliente}</b> : <span style={{ color: color.mut2 }}>Consumidor final</span>
    if (k === 'fecha') return <span style={{ color: color.ink2 }}>{dia(f.fecha)}</span>
    if (k === 'cuentas') return <span style={{ color: color.ink2 }} title={(f.cuentas ?? []).join(', ')}>{(f.cuentas ?? []).join(', ')}</span>
    if (k === 'comp') return <b style={{ color: color.ink }} title={f.comprobante}>{f.comprobante}</b>
    if (k === 'cae') return <span style={{ color: color.mut, fontVariantNumeric: 'tabular-nums' }}>{f.cae || '—'}</span>
    if (k === 'de') {
      if (f.de === 'gn') return <ChipEstado mapa={{ x: [f.estado && f.estado !== 'APROBADO' ? 'warning' : 'neutral', `Gestión Nube${f.estado && f.estado !== 'APROBADO' ? ` · ${f.estado.toLowerCase()}` : ''}`] }} k="x" />
      const anulada = f.vista === 'facturas' && conNC.has(`${marca}:${f.ventaId}`)
      return <ChipEstado mapa={{ x: anulada ? ['danger', 'ERP · anulada con NC'] : ['success', f.emitida?.ambiente === 'produccion' ? 'ERP' : 'ERP · de prueba'] }} k="x" />
    }
    if (k === 'total') return <span style={{ fontWeight: 600, color: f.total < 0 ? 'var(--mo-danger-ink)' : color.ink, fontVariantNumeric: 'tabular-nums' }}>{f.total < 0 ? `− ${pesos(-f.total)}` : pesos(f.total)}</span>
    return null
  }

  // Listas de REGISTRO: sólo «⋯», y sólo en lo que vive en el ERP (una factura de GN se mira en GN).
  const acciones = (f: Fila) => {
    const e = f.emitida
    if (!e) return null
    const faltan = faltanDelEmisor(EMISOR, e.marca) as string[]
    const menu: AccionMenu[] = [{
      key: 'pdf', label: 'Descargar PDF', icono: 'bajar', onClick: () => void bajar(e), disabled: faltan.length > 0,
      hint: faltan.length ? `Faltan datos del emisor: ${faltan.join(', ')}.` : 'Con el QR de ARCA.',
    }]
    if (f.vista === 'facturas' && !conNC.has(`${e.marca}:${e.venta_id}`)) {
      menu.push(esDeVentaPropia(e.venta_id)
        ? { key: 'nc', label: 'Nota de crédito desde Ventas', icono: 'anular', onClick: () => undefined, disabled: true, hint: 'Una venta del ERP se anula desde su ficha en Ventas, y la nota de crédito sale sola.' }
        : { key: 'nc', label: 'Hacer nota de crédito', icono: 'anular', tone: 'danger', onClick: () => void anularConNC(e), disabled: trabajando, hint: 'Anula la factura entera con ARCA.' })
    }
    if (f.vista === 'facturas' && !esDeVentaPropia(e.venta_id)) {
      menu.push({ key: 'nd', label: 'Hacer nota de débito', icono: 'lapiz', onClick: () => void sumarConND(e), disabled: trabajando, hint: 'Suma un importe a la factura con ARCA.' })
    }
    return <MenuAcciones acciones={menu} etiqueta={`Más acciones de ${f.comprobante}`} vertical alinear="izquierda" />
  }

  const pctTope = datos && datos.techo > 0 ? Math.round((datos.facturado / datos.techo) * 100) : null
  const sinCuenta = datos?.sinClasificar.filter((s) => s.cuenta !== '(cobro sin cuenta)') ?? []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
        <Input type="month" value={mes} onChange={(e) => e.target.value && cambiarMes(e.target.value)} style={{ width: 170 }} aria-label="Mes" />
        {datos?.estado === 'cerrado' && <ChipEstado mapa={{ x: ['neutral', `Cerrado${datos.cerradoPor ? ` por ${datos.cerradoPor}` : ''}`] }} k="x" />}
        <span style={{ flex: 1 }} />
        {datos && datos.estado !== 'cerrado' && <Button variant="outline" onClick={cerrar}>Cerrar mes</Button>}
      </div>

      {datos?.ambiente === 'homologacion' && <Notice tone="warning">Facturación de PRUEBA (modo de prueba de ARCA): las facturas que salen de acá no tienen validez fiscal.</Notice>}
      {datos && !datos.ambiente && <Notice tone="warning">{datos.errorAmbiente} Mientras tanto se factura en Gestión Nube: acá se ve el tope, lo facturado y lo que falta.</Notice>}
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {aviso && <Notice tone="success" onClose={() => setAviso(null)}>{aviso}</Notice>}
      {resultado && (
        <Notice tone={resultado.rechazadas.length || resultado.noSalen.length ? 'warning' : 'success'} onClose={() => setResultado(null)}>
          {resultado.autorizadas.length} factura(s) autorizada(s) en el punto de venta {resultado.ptoVta}
          {resultado.rechazadas.length > 0 && ` · ${resultado.rechazadas.length} rechazada(s): ${resultado.rechazadas.map((r) => `${r.ventaId} (${r.motivos.join(', ')})`).join('; ')}`}
          {resultado.noSalen.length > 0 && ` · ${resultado.noSalen.length} sin facturar: ${resultado.noSalen.map((r) => `${r.ventaId} (${r.motivos.join(', ')})`).join('; ')}`}
        </Notice>
      )}

      {!datos && !error && <EmptyState title="Leyendo el mes…" />}
      {datos && (
        <>
          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
            <TileResumen oscuro titulo="Tope del mes" valor={pesosCortos(datos.techo)} nota={datos.estado === 'cerrado' ? 'fijo desde el cierre' : 'lo que entró a cuentas de Areben; cambia hasta cerrar el mes'} />
            <TileResumen titulo="Facturado" valor={pesosCortos(datos.facturado)} nota={`${pctTope != null ? `${pctTope} % del tope · ` : ''}Gestión Nube ${pesosCortos(datos.facturadoGN)} · ERP ${pesosCortos(datos.facturadoMonitor)}`} />
            <TileResumen titulo="Pendiente de facturar" valor={pesosCortos(datos.pendiente)} nota={datos.pendiente < 0 ? 'se facturó de más' : 'las dos marcas'} />
            <TileResumen titulo={`Sin factura en ${NOMBRE_MARCA[marca]}`} valor={grupos.sin.length.toLocaleString('es-AR')} nota={`ventas · ${pesosCortos(sumaSin)}`} />
          </div>
          {sinCuenta.length > 0 && (
            <Notice tone="warning">Cuentas de cobro sin clasificar (no suman al tope): {sinCuenta.map((s) => `${s.cuenta} ${pesosCortos(s.monto)}`).join(' · ')}</Notice>
          )}

          <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
            <VistasLista vistas={VISTAS} valor={enVista} conteo={conteo} onCambio={cambiarVista} />
            <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
              <BuscadorLista valor={q} onCambio={(v) => { setQ(v); setCuantas(TANDA) }} etiqueta="Buscar en la facturación" placeholder={enVista === 'sin' ? 'Venta, cliente o cuenta' : 'Comprobante, CAE, venta o cliente'} />
              {enVista === 'sin' && (
                <Button variant="outline" onClick={proponer} disabled={!grupos.sin.length || datos.pendiente <= 0}>Proponer hasta el pendiente</Button>
              )}
            </div>
            {enVista === 'sin' && (
              <div style={{ padding: '0 16px 10px', fontSize: font.sm, color: color.mut }}>
                Cobradas este mes en cuentas de Areben y sin factura de Gestión Nube ni del ERP. «A facturar» es lo que entró a esas cuentas, no el total de la venta.
              </div>
            )}
            {enVista === 'notas' && !facturas && (
              <div style={{ padding: '0 16px 10px', fontSize: font.sm, color: color.mut }}>Las notas de crédito del ERP se ven cuando la facturación esté prendida. Las de Gestión Nube no llegan al monitor.</div>
            )}
            <ListaTrabajo
              columnas={enVista === 'sin' ? COLUMNAS_SIN : COLUMNAS_FACT} filas={filas} claveDe={(f) => f.id} celda={celda}
              acciones={enVista === 'sin' ? undefined : acciones} anchoAcciones={40}
              seleccion={enVista === 'sin' ? elegidas : undefined}
              onSeleccion={enVista === 'sin' ? setElegidas : undefined}
              orden={orden} onOrden={setOrden}
              onAbrir={enVista === 'sin' ? alternar : undefined}
              etiquetaFila={(f) => (f.vista === 'sin' ? `la venta ${nombreVenta(f)}` : `${f.comprobante}`)}
              vacio={<div style={{ padding: space[6] }}><EmptyState title={q ? 'Nada con esa búsqueda.' : enVista === 'sin' ? 'No quedan ventas sin factura este mes.' : enVista === 'facturas' ? 'Ninguna factura este mes.' : 'Ninguna nota de crédito este mes.'} /></div>}
            />
            {todas.length > filas.length && (
              <div style={{ padding: 12, textAlign: 'center', borderTop: `1px solid ${color.bg2}` }}>
                <Button variant="outline" onClick={() => setCuantas((n) => n + TANDA)}>Mostrar {Math.min(TANDA, todas.length - filas.length).toLocaleString('es-AR')} más</Button>
              </div>
            )}
            <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
              {NOMBRE_MARCA[marca]} factura con el punto de venta {pv ?? (datos.ambiente ? 'sin cargar' : 'de Gestión Nube')} · las facturas de Gestión Nube van por el día de la venta
            </div>
          </div>

          <BarraSeleccion cuantas={elegidasDeMarca.length} onSoltar={() => setElegidas(new Set())}>
            <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{pesos(sumaElegidas)}</span>
            {freno
              ? <span style={{ color: '#fbbf24', fontSize: font.sm }}>{freno}</span>
              : <AccionSeleccion icono="factura" onClick={() => void mandar()}>{trabajando ? 'Facturando…' : 'Facturar'}</AccionSeleccion>}
          </BarraSeleccion>
        </>
      )}
    </div>
  )
}
