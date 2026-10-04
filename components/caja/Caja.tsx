'use client'

/**
 * Caja (key `caja`, área Local, sólo Zattia): el POS propio del local.
 *
 * Se escanea ⇒ cada renglón dice cuántas QUEDAN en el local y en el depósito (o «ÚLTIMA») ⇒ se
 * elige cómo paga ⇒ «paga con» y el vuelto ⇒ Confirmar: la venta viaja a Gestión Nube y sale el
 * ticket.
 *
 * 🔑 **El dinero lo calcula `lib/caja/core.core.js`, el MISMO que usa el servidor.** La pantalla
 * manda renglones, pagos y el total que vio la cajera; el servidor lo rearma y, si no coincide,
 * contesta 409 sin mandar nada a GN.
 *
 * 🔑 **El precio es el de la ETIQUETA** (`construirPrecios`, el mismo de Etiquetas y del chequeo de
 * exhibición), y la cajera lo puede cambiar como en el POS de GN. Sin precio ⛔ se cobra un cero: el
 * renglón pide que se escriba.
 *
 * 🔴 **El id de la venta nace con el carrito y se guarda con él** (localStorage): si se corta la
 * señal después de confirmar, el reintento lleva el MISMO id y GN ⛔ la duplica (contesta 409 =
 * «ya está»). Se renueva sólo cuando el servidor contestó.
 *
 * 🔴 **Con GN caído el ticket sale igual**, con el número provisorio, y la venta queda en
 * «Pendientes en Gestión Nube» con un cartel rojo hasta que llega.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useTnPromo } from '@/components/productos/useTnImages'
import { construirPrecios } from '@/lib/etiquetas/core'
import { imagenDe } from '@/lib/tn'
import { esAdmin } from '@/lib/permisos'
import { avisar, prepararSonido } from '@/lib/sonido'
import { cobro, renglones } from '@/lib/caja/core.core.js'
import { imprimirTicket, numeroProvisorio, plata, type DatosTicket } from '@/lib/caja/ticket'
import {
  buscarProducto,
  confirmarVenta,
  guardarPolitica,
  leerConfig,
  leerCuentas,
  leerPendientes,
  reintentarVenta,
  type Config,
  type CuentaGN,
  type Stock,
  type Variante,
  type Venta,
} from '@/lib/caja/cliente'
import { Badge, Button, Field, Input, Notice, Plegable, SectionCard, Select, color, font, radius, space, weight } from '@/components/ui'

type Renglon = { variante: Variante; stock: Stock; cantidad: number; precio: number | null; fueraDeTn: boolean; foto: string | null }
type PagoUI = { cuenta: number | null; base: string }
type Borrador = { id: string; renglones: Renglon[]; email: string }

const CLAVE = 'caja:borrador:zattia'
const nuevoId = () => crypto.randomUUID()
/** El instante de impresión: el ticket lo sella con la hora de Argentina. */
const ahora = () => Date.now()
const claveDe = (v: Variante) => `${v.product_id}_${v.size_id}`

function leerBorrador(): Borrador {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE) || 'null') as Borrador | null
    if (d && typeof d.id === 'string' && Array.isArray(d.renglones)) return { id: d.id, renglones: d.renglones, email: d.email || '' }
  } catch {
    /* sin localStorage: el carrito vive en memoria */
  }
  return { id: nuevoId(), renglones: [], email: '' }
}
function guardarBorrador(b: Borrador) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(b))
  } catch {
    /* modo privado o cuota: sigue en memoria */
  }
}

const aNumero = (s: string) => {
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && String(s).trim() !== '' ? n : null
}

export function Caja() {
  const { perfil } = useSesion()
  const admin = esAdmin(perfil)
  const { datos } = useDatosMonitor()
  const tnIdx = useTnPromo('zattia')

  const [config, setConfig] = useState<Config | null>(null)
  const [cuentas, setCuentas] = useState<CuentaGN[]>([])
  const [errCarga, setErrCarga] = useState<string | null>(null)

  const [bor, setBor] = useState<Borrador>(() => ({ id: '', renglones: [], email: '' }))
  // Se lee del aparato al montar, adentro de un async: `localStorage` ⛔ existe en el render del servidor.
  useEffect(() => {
    let vivo = true
    void (async () => {
      const b = leerBorrador()
      if (vivo) setBor(b)
    })()
    return () => {
      vivo = false
    }
  }, [])
  useEffect(() => {
    if (bor.id) guardarBorrador(bor)
  }, [bor])

  const [pagos, setPagos] = useState<PagoUI[]>([{ cuenta: null, base: '' }])
  const [varios, setVarios] = useState(false)
  const [pagaCon, setPagaCon] = useState('')
  const [codigo, setCodigo] = useState('')
  // Cuántas búsquedas hay en vuelo. 🔴 El campo ⛔ se deshabilita mientras busca: el lector tipea el
  // código siguiente enseguida, y con el campo bloqueado ese escaneo se PERDÍA (visto en prod, 4-oct).
  const [buscando, setBuscando] = useState(0)
  const [aviso, setAviso] = useState<{ tono: 'danger' | 'warning'; texto: string } | null>(null)
  const [candidatos, setCandidatos] = useState<Variante[] | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [ultima, setUltima] = useState<{ venta: Venta; ticket: DatosTicket } | null>(null)
  const [pendientes, setPendientes] = useState<Venta[]>([])
  const scanRef = useRef<HTMLInputElement>(null)

  const enfocar = () => setTimeout(() => scanRef.current?.focus(), 0)

  useEffect(() => {
    Promise.all([leerConfig(), leerCuentas()])
      .then(([c, q]) => {
        setConfig(c)
        setCuentas(q.cuentas)
      })
      .catch((e) => setErrCarga(e.message))
  }, [])

  const refrescarPendientes = useCallback(() => {
    leerPendientes()
      .then((r) => setPendientes(r.ventas))
      .catch(() => {})
  }, [])
  useEffect(() => {
    refrescarPendientes()
    const t = setInterval(refrescarPendientes, 60_000)
    return () => clearInterval(t)
  }, [refrescarPendientes])

  const reglas = config?.reglas ?? null
  const cobrables = useMemo(() => cuentas.filter((c) => c.regla), [cuentas])
  const nombreCuenta = useCallback((id: number) => cuentas.find((c) => c.id === id)?.nombre ?? reglas?.cuentas[id]?.nombre ?? `Cuenta ${id}`, [cuentas, reglas])
  const esEfectivo = useCallback((id: number) => !!reglas?.cuentas[id]?.efectivo, [reglas])

  /** El precio de la etiqueta y la foto de un producto, con la regla de Etiquetas. */
  const precioYFoto = useCallback(
    (productId: number): { precio: number | null; fueraDeTn: boolean; foto: string | null } => {
      const p = datos?.allProductos.find((x) => String(x.id) === String(productId))
      if (!p || !tnIdx) return { precio: null, fueraDeTn: false, foto: null }
      const { precios, fueraDeTn } = construirPrecios([p], tnIdx)
      const precio = precios[p.id] || null
      return { precio, fueraDeTn: fueraDeTn.has(p.id), foto: imagenDe(p, tnIdx) }
    },
    [datos, tnIdx],
  )

  function agregar(variante: Variante, stock: Stock) {
    setBor((b) => {
      const i = b.renglones.findIndex((r) => claveDe(r.variante) === claveDe(variante))
      if (i >= 0) {
        const rs = b.renglones.slice()
        rs[i] = { ...rs[i], stock, cantidad: rs[i].cantidad + 1 }
        return { ...b, renglones: rs }
      }
      return { ...b, renglones: [...b.renglones, { variante, stock, cantidad: 1, ...precioYFoto(variante.product_id) }] }
    })
    const enCarrito = (bor.renglones.find((r) => claveDe(r.variante) === claveDe(variante))?.cantidad ?? 0) + 1
    if (stock.local - enCarrito <= 0) avisar('ojo', 'Última')
    else avisar('ok')
  }

  async function escanear(texto: string) {
    const c = texto.trim()
    if (!c) return
    prepararSonido()
    setCodigo('')
    setAviso(null)
    setCandidatos(null)
    setBuscando((n) => n + 1)
    try {
      const r = await buscarProducto(c)
      if ('candidatos' in r) {
        setCandidatos(r.candidatos)
        avisar('mira')
      } else agregar(r.variante, r.stock)
    } catch (e) {
      avisar('no')
      setAviso({ tono: 'danger', texto: (e as Error).message })
    } finally {
      setBuscando((n) => n - 1)
      enfocar()
    }
  }

  async function elegirCandidato(v: Variante) {
    setCandidatos(null)
    await escanear(v.barcode || v.sku || '')
  }

  const cambiarRenglon = (i: number, cambio: Partial<Renglon>) =>
    setBor((b) => ({ ...b, renglones: b.renglones.map((r, j) => (j === i ? { ...r, ...cambio } : r)) }))
  const sacarRenglon = (i: number) => setBor((b) => ({ ...b, renglones: b.renglones.filter((_, j) => j !== i) }))

  // ── El cobro: el mismo núcleo que el servidor ──
  const sinPrecio = bor.renglones.some((r) => !(r.precio && r.precio > 0))
  const items = bor.renglones.map((r) => ({ product_id: r.variante.product_id, size_id: r.variante.size_id, cantidad: r.cantidad, precio: r.precio ?? 0 }))
  const filas = (() => {
    try {
      return bor.renglones.length && !sinPrecio ? renglones(items) : null
    } catch {
      return null
    }
  })()

  /** El total de cada cuenta pagando todo con ella: lo que muestran las tarjetas. */
  const totalPorCuenta = (() => {
    const m: Record<number, number> = {}
    if (!filas || !reglas) return m
    for (const c of cobrables) {
      try {
        m[c.id] = cobro({ filas, pagos: [{ cuenta: c.id }], reglas }).total
      } catch {
        /* sin regla: la tarjeta ⛔ se muestra */
      }
    }
    return m
  })()

  const pedidos = pagos.map((p, i) => (i === pagos.length - 1 ? { cuenta: p.cuenta ?? 0 } : { cuenta: p.cuenta ?? 0, base: aNumero(p.base) ?? 0 }))
  const elCobro = (() => {
    if (!filas || !reglas || pagos.some((p) => p.cuenta == null)) return { c: null, error: null as string | null }
    try {
      return { c: cobro({ filas, pagos: pedidos, reglas }), error: null }
    } catch (e) {
      return { c: null, error: (e as Error).message }
    }
  })()
  const c = elCobro.c

  const enEfectivo = c ? c.pagos.filter((p) => esEfectivo(p.cuenta)).reduce((s, p) => s + p.monto, 0) : 0
  const pagaConN = aNumero(pagaCon)
  const vuelto = pagaConN != null && enEfectivo > 0 ? Math.round((pagaConN - enEfectivo) * 100) / 100 : null
  const emailOk = !bor.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bor.email.trim())
  const puedeConfirmar = !!c && !enviando && emailOk && (vuelto == null || vuelto >= 0)

  function datosTicket(venta: Venta): DatosTicket {
    return {
      numero: venta.gn_number,
      id: venta.id,
      renglones: bor.renglones.map((r) => ({
        nombre: r.variante.product_name,
        talle: r.variante.size_name,
        cantidad: r.cantidad,
        precio: r.precio ?? 0,
        importe: Math.round(r.cantidad * (r.precio ?? 0) * 100) / 100,
      })),
      subtotal: venta.subtotal,
      pagos: venta.pagos,
      total: venta.total,
      nombreCuenta,
      pagaCon: venta.paga_con,
      politica: config?.politica_cambio ?? null,
    }
  }

  async function confirmar() {
    if (!c) return
    setEnviando(true)
    setAviso(null)
    try {
      const r = await confirmarVenta({
        id: bor.id,
        items,
        pagos: pedidos,
        total: c.total,
        email: bor.email.trim() || null,
        pagaCon: enEfectivo > 0 ? pagaConN : null,
      })
      const ticket = datosTicket(r.venta)
      setUltima({ venta: r.venta, ticket })
      // La venta quedó guardada (en GN o pendiente): el carrito se cierra y nace otro id.
      setBor({ id: nuevoId(), renglones: [], email: '' })
      setPagos([{ cuenta: null, base: '' }])
      setVarios(false)
      setPagaCon('')
      avisar(r.venta.estado === 'en_gn' ? 'ok' : 'ojo')
      imprimirTicket(ticket, esEfectivo, ahora()).catch((e) => setAviso({ tono: 'danger', texto: `No se pudo imprimir el ticket: ${(e as Error).message}` }))
      refrescarPendientes()
    } catch (e) {
      // ⛔ se renueva el id: el reintento tiene que llevar el MISMO, por si GN ya la tiene.
      avisar('no')
      setAviso({ tono: 'danger', texto: (e as Error).message })
    } finally {
      setEnviando(false)
      enfocar()
    }
  }

  if (errCarga) return <Notice tone="danger">{errCarga}</Notice>

  return (
    <div style={{ display: 'grid', gap: space[4], maxWidth: 1100 }}>
      {pendientes.length > 0 && <Pendientes ventas={pendientes} onCambio={refrescarPendientes} />}

      {ultima && <UltimaVenta venta={ultima.venta} onReimprimir={() => imprimirTicket(ultima.ticket, esEfectivo, ahora())} />}

      <SectionCard title="Escanear">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            escanear(codigo)
          }}
          style={{ display: 'flex', gap: space[2] }}
        >
          <Input
            ref={scanRef}
            autoFocus
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Código de barras o SKU"
            style={{ fontSize: font.xl, flex: 1 }}
          />
          <Button type="submit" loading={buscando > 0}>
            Agregar
          </Button>
        </form>
        {aviso && (
          <div style={{ marginTop: space[3] }}>
            <Notice tone={aviso.tono}>{aviso.texto}</Notice>
          </div>
        )}
        {candidatos && (
          <div style={{ marginTop: space[3], display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            <span style={{ color: color.mut, fontSize: font.sm, width: '100%' }}>El código es de más de una prenda: elegí cuál.</span>
            {candidatos.map((v) => (
              <Button key={claveDe(v)} variant="outline" onClick={() => elegirCandidato(v)}>
                {v.product_name} · {v.size_name}
              </Button>
            ))}
          </div>
        )}
      </SectionCard>

      {bor.renglones.length > 0 && (
        <SectionCard title={`Venta · ${bor.renglones.reduce((s, r) => s + r.cantidad, 0)} prendas`}>
          <div style={{ display: 'grid', gap: space[2] }}>
            {bor.renglones.map((r, i) => (
              <FilaRenglon
                key={claveDe(r.variante)}
                r={r}
                cargandoPrecios={!datos || !tnIdx}
                onCantidad={(n) => (n <= 0 ? sacarRenglon(i) : cambiarRenglon(i, { cantidad: n }))}
                onPrecio={(p) => cambiarRenglon(i, { precio: p })}
                onSacar={() => sacarRenglon(i)}
              />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: space[3], fontSize: font.lg }}>
            <span>Subtotal (precio de etiqueta)</span>
            <b>{filas ? plata(filas.reduce((s, f) => s + f.importe, 0)) : '—'}</b>
          </div>
        </SectionCard>
      )}

      {bor.renglones.length > 0 && (
        <SectionCard title="Cobrar">
          {sinPrecio ? (
            <Notice tone="warning">Hay una prenda sin precio: escribilo en el renglón para poder cobrar.</Notice>
          ) : !varios ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: space[2] }}>
              {cobrables.map((q) => {
                const activa = pagos[0].cuenta === q.id
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setPagos([{ cuenta: q.id, base: '' }])}
                    style={{
                      height: 'auto',
                      textAlign: 'left',
                      padding: space[3],
                      borderRadius: radius.lg,
                      border: `2px solid ${activa ? color.brand : color.line}`,
                      background: activa ? color.brandBg : color.surface,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: font.md, fontWeight: weight.semibold, color: color.ink }}>{q.nombre}</div>
                    <div style={{ fontSize: font.sm, color: color.mut }}>{q.regla && q.regla.descuento > 0 ? `${q.regla.descuento}% de descuento` : 'sin descuento'}</div>
                    <div style={{ fontSize: font['2xl'], fontWeight: weight.bold, color: color.ink, marginTop: space[1] }}>
                      {totalPorCuenta[q.id] != null ? plata(totalPorCuenta[q.id]) : '—'}
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <VariosPagos pagos={pagos} setPagos={setPagos} cobrables={cobrables} montos={c?.pagos.map((p) => p.monto) ?? null} />
          )}

          {!sinPrecio && (
            <div style={{ marginTop: space[3] }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setVarios(!varios)
                  setPagos(varios ? [{ cuenta: null, base: '' }] : [{ cuenta: pagos[0].cuenta, base: '' }, { cuenta: null, base: '' }])
                }}
              >
                {varios ? 'Un solo pago' : 'Varios pagos'}
              </Button>
            </div>
          )}

          {elCobro.error && (
            <div style={{ marginTop: space[3] }}>
              <Notice tone="warning">{elCobro.error}</Notice>
            </div>
          )}

          {c && (
            <div style={{ display: 'grid', gap: space[3], marginTop: space[4] }}>
              <ResumenCobro c={c} nombreCuenta={nombreCuenta} />
              {enEfectivo > 0 && (
                <div style={{ display: 'flex', gap: space[4], alignItems: 'end', flexWrap: 'wrap' }}>
                  <Field label={`Paga con (efectivo: ${plata(enEfectivo)})`}>
                    <Input inputMode="decimal" value={pagaCon} onChange={(e) => setPagaCon(e.target.value)} placeholder="$" style={{ fontSize: font.xl, width: 180 }} />
                  </Field>
                  {vuelto != null && (
                    <div style={{ fontSize: font['3xl'], fontWeight: weight.heavy, color: vuelto < 0 ? color.danger : color.ink }}>
                      {vuelto < 0 ? `Faltan ${plata(-vuelto)}` : `Vuelto ${plata(vuelto)}`}
                    </div>
                  )}
                </div>
              )}
              <Field label="Mail para el ticket (opcional)">
                <Input
                  type="email"
                  value={bor.email}
                  invalid={!emailOk}
                  onChange={(e) => setBor((b) => ({ ...b, email: e.target.value }))}
                  placeholder="nombre@mail.com"
                  style={{ maxWidth: 360 }}
                />
              </Field>
              <div>
                <Button size="lg" tone="success" disabled={!puedeConfirmar} loading={enviando} onClick={confirmar}>
                  Confirmar {plata(c.total)}
                </Button>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {admin && config && <PoliticaCambio inicial={config.politica_cambio} onGuardada={(t) => setConfig({ ...config, politica_cambio: t })} />}
    </div>
  )
}

/** Un renglón: foto, nombre, stock que QUEDA (descontando lo que ya está en la venta), cantidad y precio. */
function FilaRenglon({
  r,
  cargandoPrecios,
  onCantidad,
  onPrecio,
  onSacar,
}: {
  r: Renglon
  cargandoPrecios: boolean
  onCantidad: (n: number) => void
  onPrecio: (p: number | null) => void
  onSacar: () => void
}) {
  // Mientras se escribe, el texto; si ⛔ se está escribiendo, el precio del renglón.
  const [texto, setTexto] = useState<string | null>(null)
  const quedan = r.stock.local - r.cantidad
  return (
    <div style={{ display: 'flex', gap: space[3], alignItems: 'center', padding: space[2], border: `1px solid ${color.line}`, borderRadius: radius.lg, flexWrap: 'wrap' }}>
      {r.foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.foto} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: radius.md }} />
      ) : (
        <div style={{ width: 56, height: 56, borderRadius: radius.md, background: color.bg2 }} />
      )}
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ fontWeight: weight.semibold, color: color.ink }}>
          {r.variante.product_name} · {r.variante.size_name}
        </div>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', fontSize: font.sm, color: color.mut, marginTop: space[0.5] }}>
          {quedan < 0 ? (
            <Badge tone="danger">Gestión Nube no tiene más en el local</Badge>
          ) : quedan === 0 ? (
            <Badge tone="warning">ÚLTIMA</Badge>
          ) : (
            <span>
              quedan {quedan} acá
            </span>
          )}
          <span>· {r.stock.deposito} en depósito</span>
          {r.stock.fuente === 'espejo' && <span title={r.stock.motivo}>· stock de anoche (Gestión Nube no contestó)</span>}
        </div>
        {r.fueraDeTn && <div style={{ fontSize: font.xs, color: color.warningInk }}>Precio del espejo: el producto no cruza con Tienda Nube.</div>}
      </div>
      <div style={{ display: 'flex', gap: space[1], alignItems: 'center' }}>
        <Button size="sm" variant="outline" onClick={() => onCantidad(r.cantidad - 1)} aria-label="Una menos">
          −
        </Button>
        <span style={{ minWidth: 24, textAlign: 'center', fontWeight: weight.bold }}>{r.cantidad}</span>
        <Button size="sm" variant="outline" onClick={() => onCantidad(r.cantidad + 1)} aria-label="Una más">
          +
        </Button>
      </div>
      <Input
        inputMode="decimal"
        value={texto ?? (r.precio != null ? String(r.precio) : '')}
        invalid={!(r.precio && r.precio > 0)}
        placeholder={cargandoPrecios ? 'cargando…' : 'precio'}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          if (texto != null) onPrecio(aNumero(texto))
          setTexto(null)
        }}
        style={{ width: 120, textAlign: 'right' }}
        aria-label="Precio"
      />
      <Button size="sm" variant="ghost" tone="danger" onClick={onSacar}>
        Sacar
      </Button>
    </div>
  )
}

function VariosPagos({
  pagos,
  setPagos,
  cobrables,
  montos,
}: {
  pagos: PagoUI[]
  setPagos: (p: PagoUI[]) => void
  cobrables: CuentaGN[]
  montos: number[] | null
}) {
  const cambiar = (i: number, cambio: Partial<PagoUI>) => setPagos(pagos.map((p, j) => (j === i ? { ...p, ...cambio } : p)))
  return (
    <div style={{ display: 'grid', gap: space[2] }}>
      <span style={{ fontSize: font.sm, color: color.mut }}>
        En cada pago va la parte del subtotal (a precio de etiqueta) que se paga con esa cuenta; el último se lleva el resto. Cada uno se descuenta y se redondea por separado.
      </span>
      {pagos.map((p, i) => {
        const ultimo = i === pagos.length - 1
        return (
          <div key={i} style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
            <Select value={p.cuenta ?? ''} onChange={(e) => cambiar(i, { cuenta: e.target.value ? Number(e.target.value) : null })} style={{ width: 220 }}>
              <option value="">Cuenta…</option>
              {cobrables.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.nombre}
                </option>
              ))}
            </Select>
            {ultimo ? (
              <span style={{ width: 140, color: color.mut }}>el resto</span>
            ) : (
              <Input inputMode="decimal" value={p.base} onChange={(e) => cambiar(i, { base: e.target.value })} placeholder="$ de la etiqueta" style={{ width: 140 }} />
            )}
            <b style={{ minWidth: 100 }}>{montos?.[i] != null ? `cobra ${plata(montos[i])}` : ''}</b>
            {pagos.length > 2 && (
              <Button size="sm" variant="ghost" onClick={() => setPagos(pagos.filter((_, j) => j !== i))}>
                Sacar
              </Button>
            )}
          </div>
        )
      })}
      <div>
        <Button size="sm" variant="outline" onClick={() => setPagos([...pagos.slice(0, -1), { cuenta: null, base: '' }, pagos[pagos.length - 1]])}>
          Agregar pago
        </Button>
      </div>
    </div>
  )
}

function ResumenCobro({ c, nombreCuenta }: { c: { subtotal: number; total: number; pagos: { cuenta: number; porcentaje: number; descuento: number; redondeo: number; monto: number }[] }; nombreCuenta: (id: number) => string }) {
  const linea = (izq: string, der: string, fuerte = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: fuerte ? font['2xl'] : font.md, fontWeight: fuerte ? weight.bold : weight.normal }}>
      <span>{izq}</span>
      <span>{der}</span>
    </div>
  )
  return (
    <div style={{ display: 'grid', gap: space[1], maxWidth: 420 }}>
      {linea('Subtotal', plata(c.subtotal))}
      {c.pagos.map((p, i) => (
        <div key={i}>
          {p.descuento > 0 && linea(`Descuento ${nombreCuenta(p.cuenta)} ${p.porcentaje}%`, `-${plata(p.descuento)}`)}
          {p.redondeo > 0 && linea('Recargo por redondeo', `+${plata(p.redondeo)}`)}
          {p.redondeo < 0 && linea('Redondeo', `-${plata(p.redondeo)}`)}
        </div>
      ))}
      {linea('Total', plata(c.total), true)}
    </div>
  )
}

function UltimaVenta({ venta, onReimprimir }: { venta: Venta; onReimprimir: () => void }) {
  const enGn = venta.estado === 'en_gn'
  return (
    <Notice tone={enGn ? 'success' : 'danger'}>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <span>
          {enGn
            ? `Venta #${venta.gn_number} en Gestión Nube · ${plata(venta.total)}.`
            : `Venta ${numeroProvisorio(venta.id)} cobrada (${plata(venta.total)}) pero PENDIENTE en Gestión Nube: ${venta.ultimo_error ?? 'no contestó'}. Se reintenta sola.`}
        </span>
        <Button size="sm" variant="outline" onClick={onReimprimir}>
          Imprimir ticket otra vez
        </Button>
      </div>
    </Notice>
  )
}

/** Las ventas cobradas que todavía ⛔ están en GN. Rojo: hasta que lleguen, el stock y la caja de GN ⛔ cierran. */
function Pendientes({ ventas, onCambio }: { ventas: Venta[]; onCambio: () => void }) {
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function reintentar(id: string) {
    setTrabajando(id)
    setError(null)
    try {
      await reintentarVenta(id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTrabajando(null)
      onCambio()
    }
  }
  return (
    <Notice tone="danger">
      <div style={{ display: 'grid', gap: space[2] }}>
        <b>
          {ventas.length === 1 ? 'Una venta cobrada todavía no está' : `${ventas.length} ventas cobradas todavía no están`} en Gestión Nube
        </b>
        {ventas.map((v) => (
          <div key={v.id} style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', fontSize: font.sm }}>
            <span style={{ fontFamily: 'monospace' }}>{numeroProvisorio(v.id)}</span>
            <span>{plata(v.total)}</span>
            <span style={{ color: color.mut }}>{new Date(v.creada_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })}</span>
            <span style={{ flex: 1, minWidth: 200 }}>{v.ultimo_error ?? (v.estado === 'enviando' ? 'mandándose…' : '')}</span>
            {v.reintentable === false ? (
              <Badge tone="danger">Hay que revisarla a mano</Badge>
            ) : (
              <Button size="sm" variant="outline" loading={trabajando === v.id} onClick={() => reintentar(v.id)}>
                Reintentar
              </Button>
            )}
          </div>
        ))}
        {error && <span>{error}</span>}
      </div>
    </Notice>
  )
}

/** Sólo admin: el texto de la política de cambio que va al pie del ticket. */
function PoliticaCambio({ inicial, onGuardada }: { inicial: string | null; onGuardada: (t: string | null) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState(inicial ?? '')
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  async function guardar() {
    setGuardando(true)
    setMsg(null)
    try {
      const r = await guardarPolitica(texto)
      onGuardada(r.politica_cambio)
      setMsg('Guardada: sale en el próximo ticket.')
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }
  return (
    <Plegable abierto={abierto} onToggle={() => setAbierto(!abierto)} titulo="Política de cambio del ticket" ayuda="El texto que sale al pie de cada ticket. Sólo lo cambia un admin.">
      <div style={{ display: 'grid', gap: space[2], maxWidth: 560 }}>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          maxLength={1000}
          className="mo-input"
          style={{ height: 'auto', fontFamily: 'inherit', fontSize: font.base, padding: space[2] }}
        />
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
          <Button size="sm" loading={guardando} onClick={guardar}>
            Guardar
          </Button>
          {msg && <span style={{ fontSize: font.sm, color: color.mut }}>{msg}</span>}
        </div>
      </div>
    </Plegable>
  )
}
