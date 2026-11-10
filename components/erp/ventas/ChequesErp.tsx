'use client'

/**
 * ERP › Ventas › Cobros › Cheques: la CARTERA de cheques recibidos (motor `cuenta/cheque.mjs`, sql/079; Bruno 10-nov). Sólo admin.
 * Arriba cuánto hay en cada estado; abajo la lista (primero lo que vence antes) con lo que se puede hacer con cada uno:
 *   · Depositar — desde su fecha de pago, a la cuenta que se ELIGE (banco, billetera o la caja si se cobró por ventanilla).
 *   · Marcar acreditado — la plata ya está en la cuenta.
 *   · Marcar rechazado — rebotó: la deuda VUELVE a la cuenta del cliente.
 * 🔑 Recibir un cheque ⛔ se hace acá: es «Cobrar» con la cuenta «Cheque» (Clientes, la venta o el panel de WhatsApp).
 * ⛔ endoso (Bruno, 10-nov: «más adelante»). Núcleo: `lib/erp/cheque.core.js`; servidor: `api/_erp-cheques.js`.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, Field, Input, Modal, MoneyText, Notice, Select, color, font, space, useConfirmar } from '@/components/ui'
import { ListaTrabajo, type ColumnaLista } from '@/components/ui/ListaTrabajo'
import { ChipEstado, TileResumen, VistasLista } from '@/components/ui/PiezasLista'
import { accionDeCheque, leerCheques, type CarteraDeCheques, type Cheque, type MarcaErp } from '@/lib/erp/cliente'
import { NOMBRE_ESTADO_CHEQUE, NOMBRE_TIPO_CHEQUE, accionesDeCheque, diasHasta, filtrarCheques } from '@/lib/erp/cheque.core.js'
import { nombreCuentaReal } from '@/lib/erp/cobro-destino.core.js'
import { diaArgentino } from '@/lib/envios/portal.core.js'
import { useTiendaErp } from '@/lib/erp/linea-erp'
import { usePruebaSegunCorte } from '@/lib/erp/prueba-corte'

const VISTAS = [['en_cartera', 'En cartera'], ['depositado', 'Depositado'], ['acreditado', 'Acreditado'], ['rechazado', 'Rechazado'], ['anulado', 'Anulado'], ['todos', 'Todos']] as const
const TONO = {
  en_cartera: ['action', NOMBRE_ESTADO_CHEQUE.en_cartera], depositado: ['warning', NOMBRE_ESTADO_CHEQUE.depositado], acreditado: ['success', NOMBRE_ESTADO_CHEQUE.acreditado],
  rechazado: ['danger', NOMBRE_ESTADO_CHEQUE.rechazado], anulado: ['neutral', NOMBRE_ESTADO_CHEQUE.anulado],
} as const
const COLUMNAS: ColumnaLista[] = [
  { key: 'vence', titulo: 'Fecha de pago', ancho: '120px', movil: 'chico' },
  { key: 'cheque', titulo: 'Cheque', ancho: 'minmax(200px, 1.2fr)', movil: 'titulo' },
  { key: 'cliente', titulo: 'Cliente', ancho: 'minmax(160px, 1fr)', movil: 'chico' },
  { key: 'librador', titulo: 'Quién lo firma', ancho: 'minmax(150px, 1fr)', movil: 'oculta' },
  { key: 'estado', titulo: 'Estado', ancho: '120px', movil: 'chico' },
  { key: 'cuenta', titulo: 'Depositado en', ancho: 'minmax(150px, 1fr)', movil: 'oculta' },
  { key: 'monto', titulo: 'Monto', ancho: '120px', derecha: true, movil: 'dato' },
]
const pesos = (n: number) => `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
const dia = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : '—')
const diaDe = (iso: string | null) => (iso ? diaArgentino(Date.parse(iso)) : null)

type Abierta = { tipo: 'depositar' | 'acreditar' | 'rechazar'; cheque: Cheque } | null

export function ChequesErp() {
  const { marca: delShell } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const tienda = useTiendaErp()
  const { prueba, setPrueba, listo } = usePruebaSegunCorte(tienda)
  const [vista, setVista] = useState<string>('en_cartera')
  const [q, setQ] = useState('')
  const [datos, setDatos] = useState<(CarteraDeCheques & { clave: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const [abierta, setAbierta] = useState<Abierta>(null)
  const [hoyAbrir] = useState(() => diaArgentino(Date.now()))

  const clave = `${marca}|${tienda}|${prueba}|${vuelta}`
  useEffect(() => {
    if (!listo) return
    let vivo = true
    leerCheques(marca, tienda, prueba)
      .then((d) => { if (vivo) { setDatos({ ...d, clave }); setError(null) } })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : 'No se pudieron leer los cheques.'); setDatos((x) => (x ? { ...x, clave } : x)) } })
    return () => { vivo = false }
  }, [marca, tienda, prueba, clave, listo])
  const cargando = datos?.clave !== clave
  const hoy = datos?.hoy ?? hoyAbrir

  const todos = useMemo(() => datos?.cheques ?? [], [datos])
  const conteo = useMemo(() => ({ ...Object.fromEntries(VISTAS.map(([k]) => [k, k === 'todos' ? todos.length : todos.filter((c) => c.estado === k).length])) }), [todos])
  const filas = useMemo(() => filtrarCheques(todos, { estado: vista === 'todos' ? null : vista, q }) as Cheque[], [todos, vista, q])
  const t = datos?.totales
  const libro = prueba ? 'de prueba' : 'reales'

  const celda = (c: Cheque, k: string): React.ReactNode => {
    if (k === 'vence') {
      const d = diasHasta(c.vence_el, hoy)
      const nota = c.estado !== 'en_cartera' ? null : d > 0 ? `en ${d} ${d === 1 ? 'día' : 'días'}` : d === 0 ? 'hoy' : `hace ${-d} ${d === -1 ? 'día' : 'días'}`
      return <span style={{ color: color.ink2 }}>{dia(c.vence_el)}{nota && <span style={{ color: d < -25 ? 'var(--mo-danger-ink)' : color.mut, fontSize: font.sm }}> · {nota}</span>}</span>
    }
    if (k === 'cheque') return <span title={`${NOMBRE_TIPO_CHEQUE[c.tipo]} ${c.numero} · ${c.banco}`}><b>{NOMBRE_TIPO_CHEQUE[c.tipo]} {c.numero}</b> <span style={{ color: color.mut }}>· {c.banco}</span></span>
    if (k === 'cliente') return <span style={{ color: c.cliente ? color.ink2 : color.mut2 }}>{c.cliente ?? '—'}</span>
    if (k === 'librador') return <span style={{ color: color.ink2 }} title={c.librador_cuit ? `CUIT ${c.librador_cuit}` : undefined}>{c.librador}</span>
    if (k === 'estado') return <span title={c.estado === 'rechazado' && c.motivo_rechazo ? `Rechazado: ${c.motivo_rechazo}` : undefined}><ChipEstado mapa={TONO} k={c.estado} /></span>
    if (k === 'cuenta') return c.cuenta_real ? <span style={{ color: color.ink2 }}>{nombreCuentaReal({ nombre: c.cuenta_real, banco: c.cuenta_real_banco, titular: c.cuenta_real_titular })} · {dia(diaDe(c.depositado_en))}</span> : <span style={{ color: color.mut2 }}>—</span>
    if (k === 'monto') return <MoneyText value={c.monto} />
    return null
  }
  const acciones = (c: Cheque) => {
    const a = accionesDeCheque(c, hoy)
    return (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {a.depositar && <Button size="sm" onClick={() => setAbierta({ tipo: 'depositar', cheque: c })}>Depositar</Button>}
        {a.depositarDesde && <span style={{ fontSize: font.sm, color: color.mut }}>Se deposita desde el {dia(a.depositarDesde)}</span>}
        {a.acreditar && <Button size="sm" onClick={() => setAbierta({ tipo: 'acreditar', cheque: c })}>Marcar acreditado</Button>}
        {a.rechazar && <Button size="sm" variant="outline" onClick={() => setAbierta({ tipo: 'rechazar', cheque: c })}>Marcar rechazado</Button>}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: color.mut, flex: '1 1 320px' }}>Los cheques que pagaron los clientes. El cheque baja la deuda al recibirlo; se carga con «Cobrar» eligiendo la cuenta «Cheque». Si rebota, la deuda vuelve.</p>
        <div style={{ display: 'flex', gap: space[1] }}>
          <Button variant={prueba ? 'outline' : 'solid'} aria-pressed={!prueba} onClick={() => setPrueba(false)}>Reales</Button>
          <Button variant={prueba ? 'solid' : 'outline'} aria-pressed={prueba} onClick={() => setPrueba(true)}>De prueba</Button>
        </div>
      </div>
      {prueba && <Notice tone="warning">Estás mirando los cheques <b>de prueba</b>: los que se cargaron en cobros de prueba hasta el corte.</Notice>}
      {hecho && <Notice tone="success" onClose={() => setHecho(null)}>{hecho}</Notice>}
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
        <TileResumen titulo="En cartera" valor={t ? pesos(t.en_cartera.monto) : '…'} oscuro nota={t ? `${t.en_cartera.cantidad} ${t.en_cartera.cantidad === 1 ? 'cheque' : 'cheques'} · ${libro}` : undefined} />
        <TileResumen titulo="Depositados" valor={t ? pesos(t.depositado.monto) : '…'} nota={t ? `${t.depositado.cantidad} esperando que se acrediten` : undefined} />
        <TileResumen titulo="Acreditados" valor={t ? pesos(t.acreditado.monto) : '…'} nota={t ? `${t.acreditado.cantidad} ya en la cuenta` : undefined} />
        <TileResumen titulo="Rechazados" valor={t ? pesos(t.rechazado.monto) : '…'} nota={t ? `${t.rechazado.cantidad} · la deuda volvió al cliente` : undefined} />
      </div>

      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <VistasLista vistas={VISTAS} valor={vista} conteo={conteo} onCambio={setVista} />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <Input aria-label="Buscar" placeholder="Buscar número, banco, cliente o quién lo firma" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: '1 1 260px' }} />
          <Button variant="outline" disabled={cargando} onClick={() => setVuelta((n) => n + 1)}>{cargando ? 'Leyendo…' : 'Actualizar'}</Button>
        </div>
        <ListaTrabajo
          columnas={COLUMNAS} filas={filas} claveDe={(c) => c.id} celda={celda} acciones={acciones} anchoAcciones={260} orden={null} onOrden={() => {}}
          etiquetaFila={(c) => `el cheque ${c.numero} del ${c.banco}`}
          vacio={!cargando && datos ? <div style={{ padding: space[6] }}><EmptyState title={vista === 'en_cartera' ? 'No hay cheques en cartera.' : vista === 'todos' ? 'Todavía no se cargó ningún cheque.' : `No hay cheques en «${VISTAS.find(([k]) => k === vista)?.[1]}».`} /></div> : null}
        />
      </div>

      {abierta && (
        <VentanaCheque
          abierta={abierta} hoy={hoy} cuentas={datos?.cuentasDeposito ?? []} onCerrar={() => setAbierta(null)}
          onHecho={async (a) => {
            await accionDeCheque(marca, { linea: tienda, chequeId: abierta.cheque.id, ...a })
            const c = abierta.cheque
            setAbierta(null)
            setHecho(a.accion === 'cheque-depositar' ? `Cheque ${c.numero} depositado.` : a.accion === 'cheque-acreditar' ? `Cheque ${c.numero} acreditado.` : `Cheque ${c.numero} rechazado: ${pesos(c.monto)} volvieron a la cuenta de ${c.cliente ?? 'el cliente'}.`)
            setVuelta((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}

function VentanaCheque({ abierta, hoy, cuentas, onCerrar, onHecho }: {
  abierta: NonNullable<Abierta>; hoy: string; cuentas: CarteraDeCheques['cuentasDeposito']; onCerrar: () => void
  onHecho: (a: { accion: 'cheque-depositar' | 'cheque-acreditar' | 'cheque-rechazar'; cuentaReal?: string; motivo?: string; fecha?: string }) => Promise<void>
}) {
  const { tipo, cheque: c } = abierta
  const { confirmar } = useConfirmar()
  const [fecha, setFecha] = useState(hoy)
  const [cuenta, setCuenta] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const minimo = tipo === 'depositar' ? c.vence_el : tipo === 'acreditar' ? diaDe(c.depositado_en) ?? undefined : undefined
  const titulo = tipo === 'depositar' ? 'Depositar el cheque' : tipo === 'acreditar' ? 'Marcar acreditado' : 'Marcar rechazado'
  const falta = tipo === 'depositar' && !cuenta ? 'Elegí en qué cuenta se deposita.' : tipo === 'rechazar' && !motivo.trim() ? 'Escribí por qué se rechazó.' : null

  async function guardar() {
    if (falta) return setError(falta)
    if (tipo === 'rechazar') {
      const ok = await confirmar({
        titulo: 'Marcar el cheque rechazado',
        mensaje: <p>Los <b>{pesos(c.monto)}</b> del cheque {c.numero} <b>vuelven a la cuenta de {c.cliente ?? 'el cliente'}</b>: vuelve a deberlos. No se deshace.</p>,
        ok: 'Marcar rechazado',
      })
      if (!ok) return
    }
    setTrabajando(true)
    try {
      await onHecho({
        accion: tipo === 'depositar' ? 'cheque-depositar' : tipo === 'acreditar' ? 'cheque-acreditar' : 'cheque-rechazar',
        fecha, ...(tipo === 'depositar' ? { cuentaReal: cuenta } : {}), ...(tipo === 'rechazar' ? { motivo: motivo.trim() } : {}),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el cheque.')
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo={titulo}
      pie={<><Button variant="outline" onClick={onCerrar}>Cancelar</Button><Button disabled={trabajando || !!falta} onClick={() => void guardar()}>{trabajando ? 'Guardando…' : titulo}</Button></>}>
      <p style={{ marginTop: 0, color: color.mut }}>{NOMBRE_TIPO_CHEQUE[c.tipo]} {c.numero} · {c.banco} · {pesos(c.monto)} · {c.cliente ?? 'sin cliente'}</p>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        {tipo === 'depositar' && (
          <Field label="¿En qué cuenta se deposita?" hint={c.tipo === 'echeq' ? 'El eCheq se acepta y se cobra desde el home banking de esa cuenta.' : 'Si se cobró por ventanilla, elegí la caja.'}>
            <Select value={cuenta} aria-label="Cuenta del depósito" onChange={(e) => setCuenta(e.target.value)}>
              <option value="">{cuentas.length ? 'Elegí la cuenta' : 'No hay cuentas activas'}</option>
              {cuentas.map((x) => <option key={x.id} value={x.id}>{nombreCuentaReal(x)}</option>)}
            </Select>
          </Field>
        )}
        {tipo === 'rechazar' && (
          <Field label="¿Por qué se rechazó?" hint="Sin fondos, firma, fecha… Queda en la cuenta del cliente.">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Sin fondos" autoFocus />
          </Field>
        )}
        <Field label="Fecha"><Input type="date" value={fecha} min={minimo} max={hoy} onChange={(e) => setFecha(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
