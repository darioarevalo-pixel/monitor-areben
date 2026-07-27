'use client'

/**
 * Cambios — la pantalla de venta tipo POS del post-venta.
 *
 * **Un cambio no es un tipo de reclamo: es un reclamo cuya salida es otro producto**
 * (`compensacion='otro_producto'`). Por eso esta pantalla no tiene tabla propia — escribe sobre
 * `devoluciones`, igual que Reclamos, y comparte con él el número (`R-0042`), la lista y los
 * pendientes. Lo que es propio es la **operación**: armar la cuenta, cobrar la diferencia y generar
 * la venta en Gestión Nube.
 *
 * ⚠️ **Acá NO decide Administración, a propósito.** Un cambio no es una decisión que alguien tenga
 * que autorizar —ya se sabe qué se hace—, así que el Local lo resuelve de punta a punta. La acción
 * `cambio` del servidor está fuera del gate de admin justamente por esto. Administración solo entra
 * si la cuenta queda a favor del cliente, porque ahí sí sale plata de la caja.
 *
 * El cambio se arma **en dos tiempos**, que es como pasa en el mostrador: se elige qué devuelve y
 * qué se lleva, sale la diferencia, se le pasa al cliente, y queda guardado a medio hacer hasta que
 * paga. Recién entonces se factura. Por eso "Guardar borrador" no exige nada y "Crear venta" sí.
 *
 * Portado del motor viejo (`components/cambios/Cambios.tsx`) conservando la pantalla tal cual. Lo
 * único que cambió es de dónde lee y a dónde escribe — más un arreglo: **lo que el cliente devuelve
 * se valúa por lo que PAGÓ**, con los descuentos de la orden prorrateados, y no a precio de lista.
 * El motor viejo le acreditaba de más en toda orden con cupón.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { guardarAdminPass, leerAdminPass } from '@/lib/sesion'
import { BuscarArticuloGN, type ArticuloGN } from '@/components/ui/BuscarArticuloGN'
import { DondeVa, Instructivo } from '@/components/postventa/GuiaPostventa'
import {
  Button, SectionCard, Card, StatusPill, Field, Input, NumberField, Select, Toolbar, Tabs, EmptyState,
  TableWrap, THead, TBody, Tr, Th, Td, MoneyText, formatMoney, Notice, CopyButton,
  color, radius, font, weight, space, useConfirmar, useToast,
} from '@/components/ui'
import {
  buscarOrden, cambiarEstado, crearReclamo, eliminarReclamo, enriquecerConGN, guardarCambio,
  leerReclamos, marcarCobrado, marcarReingreso, procesarCambio,
} from '@/lib/reclamos/cliente'
import {
  DIAS_CAMBIO, ESTADO_LABEL, MOTIVO_CAMBIO_POR_DEFECTO, MOTIVO_LABEL, MOTIVOS_VIGENTES, VIA_LABEL,
  calcularCambio, detalleCambioTexto, esCambio, etiquetaEM, faltantesParaCerrar, faltantesParaProcesar,
  numeroEM, numeroReclamo, pagadoPorItem, pideSeguimiento, trackingPortalUrl, trackingUrl,
  type EnvioPaga, type EstadoReclamo, type FormaPago, type ItemReclamo, type MotivoReclamo,
  type OrdenTN, type ProductoOrdenTN, type ReclamoRow, type ViaRetorno,
} from '@/lib/reclamos/tipos'

/** La contraseña del Monitor para escribir en GN (cacheada; se pide una vez). Igual que Post-venta. */
function obtenerPass(): string {
  let p = leerAdminPass()
  if (!p) {
    p = (typeof window !== 'undefined' ? window.prompt('Ingresá tu contraseña del Monitor (para la venta en GN):') || '' : '').trim()
    if (p) guardarAdminPass(p)
  }
  return p
}

/**
 * Una línea de la tabla unificada (solo UI). `cantidad` es la magnitud, siempre positiva: el signo
 * lo da `tipo`. Lo que devuelve entra en negativo y lo que se lleva en positivo, y el subtotal es la
 * suma — así el cambio se lee como un ticket y no como dos listas que hay que restar de cabeza.
 */
type Linea = {
  key: string
  tipo: 'devuelve' | 'lleva'
  sku: string | null
  product_id: string | null
  size_id: string | null
  tn_product_id: string | null
  variant_id: string | null
  producto: string
  variante: string | null
  precio: number
  cantidad: number
  /** Lo que se pagó por esta línea (descuentos de la orden prorrateados). Solo en los devueltos. */
  pagado?: number | null
  /** Tope de cantidad: no se puede devolver más de lo que se compró. */
  max?: number
}

const toItem = (l: Linea): ItemReclamo => ({
  sku: l.sku, product_id: l.product_id, size_id: l.size_id,
  tn_product_id: l.tn_product_id, variant_id: l.variant_id,
  producto: l.producto, variante: l.variante, precio: l.precio, cantidad: l.cantidad,
  pagado: l.pagado ?? null,
})

/** Segmented control chico (vía de envío y quién paga). */
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

/** Las vías que ofrece el POS. El mostrador (`presencial`) es alcance de Reclamos, no de acá. */
const VIAS_CAMBIO: ViaRetorno[] = ['andreani', 'correo', 'cadete']

const FILTROS: { key: string; label: string; match: (e: EstadoReclamo) => boolean }[] = [
  { key: 'todos', label: 'Todos', match: () => true },
  { key: 'borrador', label: 'Borradores', match: (e) => e === 'borrador' || e === 'esperando_cliente' || e === 'en_revision' },
  { key: 'en_transito', label: 'En tránsito', match: (e) => e === 'en_transito' },
  { key: 'recibido', label: 'Recibido', match: (e) => e === 'recibido' },
  { key: 'cerrado', label: 'Cerrado', match: (e) => e === 'cerrado' },
]

function ArmarCambioInner({ modo }: { modo: 'local' | 'admin' }) {
  const { marca, perfil } = useSesion()
  const usuario = perfil?.name || ''
  const esAdmin = modo === 'admin'
  const toast = useToast()
  const { confirmar } = useConfirmar()

  const [filas, setFilas] = useState<ReclamoRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ocupada, setOcupada] = useState<number | null>(null)

  // ── El form (borrador) ──
  const [ordenNum, setOrdenNum] = useState('')
  const [orden, setOrden] = useState<OrdenTN | null>(null)
  const [cliente, setCliente] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [motivo, setMotivo] = useState<MotivoReclamo>(MOTIVO_CAMBIO_POR_DEFECTO)
  const [via, setVia] = useState<ViaRetorno>('andreani')
  const [seguimiento, setSeguimiento] = useState('')
  const [seguimientoVuelta, setSeguimientoVuelta] = useState('')
  const [envioCosto, setEnvioCosto] = useState('')
  const [envioPaga, setEnvioPaga] = useState<EnvioPaga>('cliente')
  const [formaPago, setFormaPago] = useState<FormaPago | ''>('')
  const [descManual, setDescManual] = useState('')
  const [solicitudEnvio, setSolicitudEnvio] = useState('')
  const [pagado, setPagado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const keyRef = useRef(0)

  // ── La lista ──
  const [filtro, setFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [expandido, setExpandido] = useState<number | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true); setError(null)
    try { setFilas(await leerReclamos(marca)) } catch (e) { setError((e as Error).message) } finally { setCargando(false) }
  }, [marca])

  // El setState va DENTRO del await: el linter del repo rechaza el setState síncrono en un effect.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try { const d = await leerReclamos(marca); if (vivo) setFilas(d) } catch (e) { if (vivo) setError((e as Error).message) } finally { if (vivo) setCargando(false) }
    })()
    return () => { vivo = false }
  }, [marca])

  const buscarLaOrden = useCallback(async () => {
    if (!ordenNum.trim()) return
    setBuscando(true); setError(null); setOrden(null)
    try {
      const o = await buscarOrden(marca, ordenNum.trim())
      if (!o) { setError('No se encontró esa orden. Ojo: solo se encuentran las recientes.'); return }
      setOrden(o)
      if (o.cliente) setCliente(o.cliente)
    } catch (e) { setError((e as Error).message) } finally { setBuscando(false) }
  }, [ordenNum, marca])

  const devueltos = useMemo(() => lineas.filter((l) => l.tipo === 'devuelve').map(toItem), [lineas])
  const nuevos = useMemo(() => lineas.filter((l) => l.tipo === 'lleva').map(toItem), [lineas])

  /** La cuenta del ticket. El devuelto entra por lo que se PAGÓ, no por precio de lista. */
  const t = useMemo(
    () => calcularCambio({
      devueltos, nuevos, orden,
      formaPago: formaPago || null,
      descuentoManual: Number(descManual) || 0,
      envioCosto: Number(envioCosto) || 0,
      envioPaga,
    }),
    [devueltos, nuevos, orden, formaPago, descManual, envioCosto, envioPaga],
  )

  const faltan = useMemo(
    () => faltantesParaProcesar({
      orden_tn: ordenNum, items: devueltos, items_nuevos: nuevos,
      forma_pago: formaPago || null, via_retorno: via, envio_paga: envioPaga,
      solicitud_envio: solicitudEnvio.trim() || null,
    }),
    [ordenNum, devueltos, nuevos, formaPago, via, envioPaga, solicitudEnvio],
  )

  // ── Las líneas de la tabla unificada ──
  const lineaOrdenKey = (l: ProductoOrdenTN) => `d-${l.sku ?? ''}-${l.name || l.sku || 'Producto'}`
  const toggleDevuelto = (l: ProductoOrdenTN) => {
    const key = lineaOrdenKey(l)
    setLineas((ls) => ls.some((x) => x.key === key)
      ? ls.filter((x) => x.key !== key)
      : [...ls, {
        key, tipo: 'devuelve',
        sku: l.sku ?? null, product_id: null, size_id: null,
        // Los ids de TN son otros que los de GN: estos sirven para corregir stock en la tienda.
        tn_product_id: l.product_id == null ? null : String(l.product_id),
        variant_id: l.variant_id == null ? null : String(l.variant_id),
        producto: l.name || l.sku || 'Producto', variante: null,
        precio: Number(l.price) || 0, cantidad: Number(l.quantity) || 1,
        pagado: pagadoPorItem({ precio: l.price, cantidad: l.quantity ?? 1 }, orden),
        max: Number(l.quantity) || undefined,
      }])
  }

  const agregarLleva = useCallback((a: ArticuloGN) => {
    keyRef.current += 1
    setLineas((ls) => [...ls, {
      key: `l-${a.product_id}-${a.size_id}-${keyRef.current}`, tipo: 'lleva',
      sku: a.sku, product_id: a.product_id, size_id: a.size_id,
      tn_product_id: null, variant_id: null,
      producto: a.product_name || a.sku || 'Producto', variante: a.size_name || null,
      precio: a.retailer_price ?? 0, cantidad: 1,
    }])
  }, [])

  const actualizarLinea = (key: string, campo: 'precio' | 'cantidad', valor: number) =>
    setLineas((ls) => ls.map((l) => {
      if (l.key !== key) return l
      const next = { ...l, [campo]: valor }
      // Si se cambia a mano el precio o la cantidad de un devuelto, lo pagado deja de valer: la
      // cuenta pasa a usar el bruto. Se recalcula contra la orden para que siga cerrando.
      if (l.tipo === 'devuelve') next.pagado = pagadoPorItem({ precio: next.precio, cantidad: next.cantidad }, orden)
      return next
    }))

  const quitarLinea = (key: string) => setLineas((ls) => ls.filter((l) => l.key !== key))

  const limpiarForm = useCallback(() => {
    setOrdenNum(''); setOrden(null); setCliente(''); setLineas([]); setMotivo(MOTIVO_CAMBIO_POR_DEFECTO)
    setVia('andreani'); setSeguimiento(''); setSeguimientoVuelta('')
    setEnvioCosto(''); setEnvioPaga('cliente'); setFormaPago(''); setDescManual('')
    setSolicitudEnvio(''); setPagado(false); setEditandoId(null)
  }, [])

  /**
   * Guarda el borrador y devuelve el id. Si es nuevo, primero crea el reclamo (que es lo que da el
   * número `R-00XX`) y después le cuelga la parte del cambio: un cambio ES un reclamo, no un
   * registro aparte.
   */
  const persistir = useCallback(async (marcarPagado: boolean): Promise<number> => {
    let id = editandoId
    if (id == null) {
      // Los ids de GN se buscan por SKU: sin ellos no se puede tocar stock más adelante.
      const conGN = await enriquecerConGN(marca, devueltos)
      const r = await crearReclamo({
        store: marca,
        orden_tn: ordenNum.trim() || null,
        cliente: cliente.trim() || null,
        motivo,
        items: conGN,
        monto_producto: t.devueltos,
        pago_metodo: orden?.pago_metodo ?? null,
        pago_gateway: orden?.pago_gateway ?? null,
        // Lo que quería el cliente y lo que se hizo coinciden: por eso no hay nada que decidir.
        expectativa: 'otro_producto',
      })
      id = r.id
    }
    await guardarCambio(marca, id, {
      orden_tn: ordenNum.trim() || null,
      cliente: cliente.trim() || null,
      motivo,
      items: devueltos,
      items_nuevos: nuevos,
      forma_pago: formaPago || null,
      via_retorno: via,
      envio_paga: envioPaga,
      envio_costo: envioCosto === '' ? null : Number(envioCosto),
      descuento_manual: descManual === '' ? null : Number(descManual),
      // El EM se guarda SIN el prefijo: la pantalla lo pone. Si no, en GN sale "EM EM1234".
      solicitud_envio: numeroEM(solicitudEnvio) || (via === 'cadete' ? 'Cadetería' : null),
      seguimiento_ida: seguimiento.trim() || null,
      seguimiento_vuelta: seguimientoVuelta.trim() || null,
      diferencia: t.total,
      pagado: marcarPagado || pagado,
    }, t.nuevos)
    return id
  }, [editandoId, marca, devueltos, nuevos, ordenNum, cliente, motivo, orden, t, formaPago, via, envioPaga, envioCosto, descManual, solicitudEnvio, seguimiento, seguimientoVuelta, pagado])

  const guardarBorrador = useCallback(async () => {
    if (!orden && editandoId == null) { setError('Buscá y seleccioná la orden de venta antes de armar el cambio.'); return }
    if (!devueltos.length && !nuevos.length) { setError('Agregá al menos un producto (el que devuelve o el que se lleva).'); return }
    setGuardando(true); setError(null)
    try {
      const id = await persistir(false)
      toast.ok(editandoId != null
        ? `${numeroReclamo(id)} actualizado.`
        : `Borrador ${numeroReclamo(id)} guardado. Cuando esté cobrado, marcalo como pagado para generar la venta.`)
      limpiarForm(); await recargar()
    } catch (e) { setError((e as Error).message) } finally { setGuardando(false) }
  }, [orden, editandoId, devueltos, nuevos, persistir, toast, limpiarForm, recargar])

  /** Paso 2: solo persiste el flag. NO genera la venta — el cobro y la factura son dos momentos. */
  const marcarPagadoForm = useCallback(async () => {
    if (!devueltos.length && !nuevos.length) { setError('Agregá al menos un producto antes de marcar como pagado.'); return }
    setGuardando(true); setError(null)
    try {
      const id = await persistir(true)
      setEditandoId(id); setPagado(true)
      toast.ok('Cambio marcado como pagado. Ahora podés crear la venta.')
      await recargar()
    } catch (e) { setError((e as Error).message) } finally { setGuardando(false) }
  }, [devueltos, nuevos, persistir, toast, recargar])

  /** Genera la venta REAL en GN a partir de una fila ya guardada. Es lo único irreversible de acá. */
  const confirmarYProcesar = useCallback(async (row: ReclamoRow): Promise<boolean> => {
    const si = await confirmar({
      titulo: 'Crear la venta del cambio en Gestión Nube',
      tono: 'warning',
      ok: 'Crear la venta',
      mensaje: 'Se crea la venta REAL: baja el stock de lo que se lleva el cliente y cuenta en la analítica. No se puede deshacer desde acá.',
    })
    if (!si) return false
    const pass = obtenerPass()
    if (!pass) { setError('Sin la contraseña del Monitor no se puede escribir la venta en GN.'); return false }
    const v = await procesarCambio(marca, row, orden, { user: usuario, pass })
    toast.ok(v.number ? `Venta ${v.number} creada en GN.` : 'Venta creada en GN.')
    return true
  }, [marca, usuario, orden, confirmar, toast])

  /** Paso 3: crear la venta desde el form. Requiere completo Y pagado. */
  const crearVentaForm = useCallback(async () => {
    if (faltan.length) { setError(`Completá antes de crear la venta: ${faltan.join(', ')}.`); return }
    if (!pagado) { setError('Marcá el cambio como pagado antes de crear la venta.'); return }
    setGuardando(true); setError(null)
    try {
      const id = await persistir(true)
      const row: ReclamoRow = {
        id, store: marca, estado: 'borrador', motivo, items: devueltos, items_nuevos: nuevos,
        orden_tn: ordenNum.trim() || null, cliente: cliente.trim() || null,
        forma_pago: formaPago || null, via_retorno: via, envio_paga: envioPaga,
        envio_costo: envioCosto === '' ? null : Number(envioCosto),
        descuento_manual: descManual === '' ? null : Number(descManual),
        solicitud_envio: numeroEM(solicitudEnvio) || null,
        stock_estado: 'no_aplica', reintegro_estado: 'no_aplica', tn_stock_estado: 'no_aplica',
      }
      if (await confirmarYProcesar(row)) limpiarForm()
      await recargar()
    } catch (e) { setError((e as Error).message) } finally { setGuardando(false) }
  }, [faltan, pagado, persistir, marca, motivo, devueltos, nuevos, ordenNum, cliente, formaPago, via, envioPaga, envioCosto, descManual, solicitudEnvio, confirmarYProcesar, limpiarForm, recargar])

  const abrirEdicion = useCallback((c: ReclamoRow) => {
    setEditandoId(c.id)
    setOrdenNum(c.orden_tn || '')
    setCliente(c.cliente || '')
    setMotivo(c.motivo || MOTIVO_CAMBIO_POR_DEFECTO)
    keyRef.current += 1
    const base = keyRef.current
    setLineas([
      // La key del devuelto se reconstruye igual que `lineaOrdenKey` para que el checkbox de la
      // orden lo reconozca como ya marcado al editar (y toglee bien, sin duplicar).
      ...(c.items || []).map((i) => ({
        key: `d-${i.sku ?? ''}-${i.producto}`, tipo: 'devuelve' as const,
        sku: i.sku ?? null, product_id: i.product_id ?? null, size_id: i.size_id ?? null,
        tn_product_id: i.tn_product_id ?? null, variant_id: i.variant_id ?? null,
        producto: i.producto, variante: i.variante ?? null,
        precio: Number(i.precio) || 0, cantidad: Number(i.cantidad) || 1, pagado: i.pagado ?? null,
      })),
      ...(c.items_nuevos || []).map((i, k) => ({
        key: `l-${base}-${k}`, tipo: 'lleva' as const,
        sku: i.sku ?? null, product_id: i.product_id ?? null, size_id: i.size_id ?? null,
        tn_product_id: null, variant_id: null,
        producto: i.producto, variante: i.variante ?? null,
        precio: Number(i.precio) || 0, cantidad: Number(i.cantidad) || 1,
      })),
    ])
    setVia((c.via_retorno && VIAS_CAMBIO.includes(c.via_retorno) ? c.via_retorno : 'andreani'))
    setSeguimiento(c.seguimiento_ida || '')
    setSeguimientoVuelta(c.seguimiento_vuelta || '')
    setEnvioCosto(c.envio_costo != null ? String(c.envio_costo) : '')
    setEnvioPaga(c.envio_paga || 'cliente')
    setFormaPago(c.forma_pago || '')
    setDescManual(c.descuento_manual != null ? String(c.descuento_manual) : '')
    setSolicitudEnvio(numeroEM(c.solicitud_envio))
    setPagado(!!c.pagado)
    setError(null)
    if (c.orden_tn) void buscarOrden(marca, c.orden_tn).then(setOrden).catch(() => setOrden(null))
    else setOrden(null)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [marca])

  // ── Acciones de la lista ──
  const accion = async (id: number, fn: () => Promise<void>, ok: string) => {
    setOcupada(id); setError(null)
    try { await fn(); toast.ok(ok); await recargar() } catch (e) { setError((e as Error).message) } finally { setOcupada(null) }
  }

  const reingresar = async (c: ReclamoRow) => {
    const si = await confirmar({
      titulo: 'Reingresar el producto devuelto',
      ok: 'Sí, ya lo reingresé',
      mensaje: `¿Ya cargaste a mano en Gestión Nube el reingreso de ${(c.items || []).map((i) => i.producto).join(', ')}? El sistema no puede hacerlo: GN no acepta una venta negativa por API. Esto solo deja la traza.`,
    })
    if (si) await accion(c.id, () => marcarReingreso(marca, c.id), 'Anotado: el devuelto volvió al stock.')
  }

  const cobrar = async (c: ReclamoRow) => {
    const si = await confirmar({
      titulo: 'Diferencia cobrada',
      ok: 'Sí, ya la cobré',
      mensaje: `¿Ya cobraste ${formatMoney(c.diferencia ?? 0)} a ${c.cliente || 'el cliente'}?`,
    })
    if (si) await accion(c.id, () => marcarCobrado(marca, c.id), 'Anotado: la diferencia entró.')
  }

  const crearVentaLista = async (c: ReclamoRow) => {
    const f = faltantesParaProcesar(c)
    if (f.length) { setError(`A ${numeroReclamo(c.id)} le falta: ${f.join(', ')}. Editalo y completalo.`); return }
    if (!c.pagado) { setError(`Marcá ${numeroReclamo(c.id)} como pagado antes de crear la venta.`); return }
    setOcupada(c.id); setError(null)
    try {
      const o = c.orden_tn ? await buscarOrden(marca, c.orden_tn).catch(() => null) : null
      const pass = obtenerPass()
      if (!pass) { setError('Sin la contraseña del Monitor no se puede escribir la venta en GN.'); return }
      const si = await confirmar({
        titulo: 'Crear la venta del cambio en Gestión Nube',
        tono: 'warning', ok: 'Crear la venta',
        mensaje: 'Se crea la venta REAL: baja el stock de lo que se lleva el cliente y cuenta en la analítica. No se puede deshacer desde acá.',
      })
      if (!si) return
      const v = await procesarCambio(marca, c, o, { user: usuario, pass })
      toast.ok(v.number ? `Venta ${v.number} creada en GN.` : 'Venta creada en GN.')
      await recargar()
    } catch (e) { setError((e as Error).message) } finally { setOcupada(null) }
  }

  const borrar = async (c: ReclamoRow) => {
    const si = await confirmar({
      titulo: `Borrar ${numeroReclamo(c.id)}`, tono: 'danger', ok: 'Borrar',
      mensaje: 'Se borra el registro. No anula la venta que ya se haya creado en Gestión Nube.',
    })
    if (si) await accion(c.id, () => eliminarReclamo(marca, c.id), 'Cambio borrado.')
  }

  // La ventana de cambio: 30 días desde la compra.
  const fechaOrden = orden?.fecha ? new Date(orden.fecha) : null
  const vence = fechaOrden ? new Date(fechaOrden.getTime() + DIAS_CAMBIO * 86400000) : null
  const vencido = vence ? new Date() > vence : false
  const fmt = (d: Date | null) => (d ? d.toLocaleDateString('es-AR') : '—')

  /** Solo los cambios: es una VISTA sobre la misma tabla, no otro registro. */
  const cambios = useMemo(() => filas.filter(esCambio), [filas])

  const pendientesReingreso = useMemo(
    () => cambios.filter((c) => c.reingreso_estado === 'pendiente' && c.estado !== 'borrador' && c.estado !== 'anulado').length,
    [cambios],
  )

  const visibles = useMemo(() => {
    const f = FILTROS.find((x) => x.key === filtro) || FILTROS[0]
    const q = busqueda.trim().toLowerCase()
    return cambios
      .filter((c) => (esAdmin ? true : c.estado !== 'cerrado' && c.estado !== 'anulado'))
      .filter((c) => f.match(c.estado))
      .filter((c) => !q || numeroReclamo(c.id).toLowerCase().includes(q) || (c.cliente || '').toLowerCase().includes(q) || (c.orden_tn || '').toLowerCase().includes(q))
  }, [cambios, filtro, busqueda, esAdmin])

  const detalleForm = () => detalleCambioTexto({
    id: editandoId, cliente, items: devueltos, items_nuevos: nuevos, orden,
    forma_pago: formaPago || null, via_retorno: via, envio_costo: Number(envioCosto) || 0,
    envio_paga: envioPaga, descuento_manual: Number(descManual) || 0,
    seguimiento_ida: seguimiento, seguimiento_vuelta: seguimientoVuelta,
  })

  const resumenItems = (c: ReclamoRow) =>
    [...(c.items_nuevos || []).map((i) => `${i.cantidad}× ${i.producto}`), ...(c.items || []).map((i) => `↩ ${i.cantidad}× ${i.producto}`)].join(' · ') || '—'

  const totalRow = (label: React.ReactNode, value: React.ReactNode, opts?: { strong?: boolean; sep?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '5px 0', borderTop: opts?.sep ? `1px solid ${color.line}` : undefined, fontSize: opts?.strong ? font.xl : font.base }}>
      <span style={{ color: opts?.strong ? color.ink : color.mut, fontWeight: opts?.strong ? weight.bold : weight.medium }}>{label}</span>
      <span style={{ fontWeight: opts?.strong ? weight.bold : weight.semibold }}>{value}</span>
    </div>
  )

  return (
    <div style={{ maxWidth: 1100, display: 'flex', flexDirection: 'column', gap: space[5] }}>
      <DondeVa activa="cambios" />
      <Instructivo
        titulo="¿Cómo armo un cambio?"
        pasos={[
          <>Buscá la <b>orden de Tienda Nube</b> y marcá lo que <b>devuelve</b> el cliente: entra a la tabla en negativo, valuado por <b>lo que pagó</b>.</>,
          <>Agregá lo que <b>se lleva</b> desde Gestión Nube. Abajo sale la diferencia, con el descuento por forma de pago y el envío.</>,
          <><b>Guardá el borrador</b> y pasale el detalle al cliente. Queda esperando hasta que pague — no hace falta terminarlo de una.</>,
          <>Cuando cobres, <b>Marcar como pagado</b>. Recién ahí se habilita <b>Crear venta</b>.</>,
          <><b>Crear venta</b> genera la venta REAL en Gestión Nube: baja el stock de lo que se lleva y cuenta en la analítica.</>,
          <>Cuando vuelva la prenda, <b>Volvió</b> y después <b>Reingresado</b> (el reingreso en GN es a mano: la API no acepta una venta negativa).</>,
        ]}
        ojo={<>El cambio <b>no lo aprueba Administración</b>: ya está decidido. Lo único que pasa por ella es la plata que sale de la caja, o sea cuando la cuenta queda a favor del cliente.</>}
      />
      <div style={{ fontSize: font.sm, color: color.mut }}>
        Un cambio es un reclamo más: comparte el número <b>R-00XX</b> y aparece también en Reclamos.
        Esta pantalla es la operación.
      </div>

      {/* ── El form ──────────────────────────────────────────────────────── */}
      <SectionCard
        title={editandoId != null ? `Editando ${numeroReclamo(editandoId)}` : 'Nuevo cambio'}
        subtitle={orden ? `${cliente || 's/cliente'} · orden #${String(orden.number)}` : 'Se guarda como borrador hasta que se cobre'}
        actions={<CopyButton getText={detalleForm} label="Copiar detalle" tone="neutral" variant="outline" />}
      >
        <Toolbar gap={2} style={{ alignItems: 'flex-end', marginBottom: space[3] }}>
          <Field label="Nº de orden de Tienda Nube" width={220}>
            <Input value={ordenNum} onChange={(e) => setOrdenNum(e.target.value)} placeholder="ej. 20700" onKeyDown={(e) => e.key === 'Enter' && void buscarLaOrden()} />
          </Field>
          <Button variant="soft" tone="brand" onClick={() => void buscarLaOrden()} disabled={buscando}>{buscando ? 'Buscando…' : 'Buscar orden'}</Button>
          {/* El motivo es opcional a propósito: en el mostrador no se para a diagnosticar. Pero
              agrupados por motivo, los cambios dicen si el problema está en la guía de talles. */}
          <Field label="¿Por qué lo cambia?" hint="opcional, para poder medirlo después" width={210}>
            <Select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoReclamo)}>
              {MOTIVOS_VIGENTES.map((m) => <option key={m} value={m}>{MOTIVO_LABEL[m]}</option>)}
            </Select>
          </Field>
          {orden && fechaOrden && (
            <StatusPill tone={vencido ? 'danger' : 'neutral'} label={`Compra ${fmt(fechaOrden)} · cambio hasta ${fmt(vence)}${vencido ? ' · FUERA DE PLAZO' : ''}`} dot={false} />
          )}
        </Toolbar>

        {/* Lo que devuelve, tildado de la orden */}
        {orden && (
          <div style={{ marginBottom: space[3] }}>
            <div style={{ fontSize: font.xs, color: color.mut, marginBottom: 6 }}>Marcá lo que DEVUELVE el cliente (entra a la tabla en negativo):</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(orden.products || []).map((l, i) => {
                const on = lineas.some((x) => x.key === lineaOrdenKey(l))
                const pagadoLinea = pagadoPorItem({ precio: l.price, cantidad: l.quantity ?? 1 }, orden)
                const lista = (Number(l.price) || 0) * (Number(l.quantity) || 1)
                return (
                  <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: font.sm, cursor: 'pointer' }}>
                    <input type="checkbox" checked={on} onChange={() => toggleDevuelto(l)} />
                    <span style={{ fontWeight: weight.semibold, minWidth: 160 }}>{l.name || l.sku}</span>
                    <span style={{ color: color.mut2, fontFamily: 'monospace' }}>{l.sku || ''}</span>
                    <span style={{ color: color.mut }}>×{l.quantity} · {formatMoney(Number(l.price) || 0)}</span>
                    {/* Lo que se le acredita de verdad. Sin esto se le devolvía el precio de lista
                        y en una orden con cupón la diferencia le quedaba a favor. */}
                    {pagadoLinea < lista && (
                      <span style={{ color: color.warningInk, fontSize: font.xs }}>pagó {formatMoney(pagadoLinea)}</span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {/* Lo que se lleva — solo con una orden asociada (trazabilidad) */}
        <div style={{ marginBottom: space[4] }}>
          <div style={{ fontSize: font.xs, color: color.mut, marginBottom: 6 }}>Agregá lo que el cliente SE LLEVA (de Gestión Nube):</div>
          {orden || editandoId != null ? (
            <div style={{ padding: space[3], background: color.brandBg, border: `1px solid ${color.brandBg2}`, borderRadius: radius.lg }}>
              <BuscarArticuloGN marca={marca} onSelect={agregarLleva} mostrarCosto={false} />
            </div>
          ) : (
            <Notice tone="warning" icon="🔎">Buscá y seleccioná primero la orden de venta para poder agregar productos.</Notice>
          )}
        </div>

        {/* La tabla unificada */}
        {lineas.length > 0 ? (
          <TableWrap style={{ marginBottom: space[4] }}>
            <THead><Tr>
              <Th>Producto</Th><Th>Variante</Th><Th align="right">Cantidad</Th><Th align="right">Precio unitario</Th><Th align="right">Subtotal</Th><Th />
            </Tr></THead>
            <TBody>
              {lineas.map((l) => {
                const signo = l.tipo === 'devuelve' ? -1 : 1
                // El devuelto vale lo que se pagó por él, no lo que dice la etiqueta.
                const bruto = l.tipo === 'devuelve' && l.pagado != null
                  ? l.pagado
                  : (Number(l.precio) || 0) * (Number(l.cantidad) || 0)
                const sub = signo * bruto
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

        {/* Los totales apilados — productos (van a GN) vs envío (queda en el Monitor) */}
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
              <Seg value={via} onChange={setVia} options={VIAS_CAMBIO.map((v) => ({ v, label: VIA_LABEL[v] }))} />
              <Seg value={envioPaga} onChange={setEnvioPaga} options={[{ v: 'cliente' as EnvioPaga, label: 'Lo paga el cliente' }, { v: 'nosotros' as EnvioPaga, label: 'Nosotros' }]} />
              <NumberField value={envioCosto === '' ? '' : Number(envioCosto)} onChange={(n) => setEnvioCosto(String(n))} min={0} prefix="$" width={110} />
            </div>
          </div>
          {totalRow(t.total < 0 ? 'Se le devuelve' : 'Total a pagar', <MoneyText value={Math.abs(t.total)} strong />, { strong: true, sep: true })}
          <div style={{ fontSize: font.xs, color: color.mut2, textAlign: 'right', marginTop: 4 }}>Los productos van a la venta de GN; el envío queda solo en el Monitor.</div>
          {/* Si la cuenta queda a favor del cliente sale plata de la caja, y eso sí lo toca
              Administración: el reclamo queda con el reintegro pendiente. */}
          {t.total < 0 && (
            <Notice tone="action" style={{ marginTop: space[2] }}>
              La cuenta queda a favor del cliente: el reintegro lo hace <b>Administración</b> y queda
              como pendiente del reclamo.
            </Notice>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: space[3] }}>
            {pagado ? (
              <StatusPill tone="success" label="✓ Pagado" />
            ) : (
              <Button variant="solid" tone="success" onClick={() => void marcarPagadoForm()} disabled={guardando}>Marcar como pagado</Button>
            )}
          </div>
        </div>

        {/* Solicitud de envío + tracking + guardar */}
        <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-end', flexWrap: 'wrap', marginTop: space[5], paddingTop: space[4], borderTop: `1px solid ${color.line}` }}>
          {/* El `EM` es fijo: solo se carga el número. Guardar el prefijo hacía que la nota del
              pedido en GN dijera "EM EM1234". */}
          <Field label="Solicitud de envío" required={pideSeguimiento(via)} width={190} hint={pideSeguimiento(via) ? 'obligatoria para crear la venta' : 'opcional (cadetería)'}>
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
              <span
                aria-hidden
                style={{
                  display: 'inline-flex', alignItems: 'center', padding: '0 9px',
                  border: `1px solid ${color.line2}`, borderRight: 'none',
                  borderRadius: 'var(--mo-r-md) 0 0 var(--mo-r-md)',
                  background: color.bg2, color: color.mut, fontSize: font.sm, fontWeight: weight.semibold,
                }}
              >
                EM
              </span>
              <Input
                value={solicitudEnvio}
                onChange={(e) => setSolicitudEnvio(numeroEM(e.target.value))}
                placeholder={pideSeguimiento(via) ? '1234' : 'sin número (cadetería)'}
                invalid={pideSeguimiento(via) && !solicitudEnvio.trim()}
                style={{ borderRadius: '0 var(--mo-r-md) var(--mo-r-md) 0' }}
              />
            </div>
          </Field>
          {pideSeguimiento(via) && (
            <>
              <Field label="Seguimiento de ida (se puede cargar después)" width={200}>
                <Input value={seguimiento} onChange={(e) => setSeguimiento(e.target.value)} placeholder="tracking de ida" />
              </Field>
              <Field label="Seguimiento de vuelta (se puede cargar después)" width={200}>
                <Input value={seguimientoVuelta} onChange={(e) => setSeguimientoVuelta(e.target.value)} placeholder="tracking de vuelta" />
              </Field>
              {trackingPortalUrl(via) && (
                <a href={trackingPortalUrl(via) || undefined} target="_blank" rel="noreferrer" style={{ fontSize: font.sm, color: color.action, paddingBottom: 8, whiteSpace: 'nowrap' }}>🔎 Buscar seguimiento en {VIA_LABEL[via]}</a>
              )}
            </>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: space[2] }}>
            {editandoId != null && <Button variant="ghost" onClick={limpiarForm} disabled={guardando}>Cancelar</Button>}
            <Button variant="outline" tone="brand" onClick={() => void guardarBorrador()} disabled={guardando}>
              {guardando ? 'Guardando…' : editandoId != null ? 'Guardar cambios' : 'Guardar borrador'}
            </Button>
            <Button
              variant="solid" tone="action" onClick={() => void crearVentaForm()}
              disabled={guardando || faltan.length > 0 || !pagado}
              title={faltan.length ? `Falta: ${faltan.join(', ')}` : !pagado ? 'Marcá el cambio como pagado primero' : 'Genera la venta real en GN'}
            >
              Crear venta
            </Button>
          </div>
        </div>
      </SectionCard>

      {error && <Notice tone="danger" icon="⚠" onClose={() => setError(null)}>{error}</Notice>}
      {pendientesReingreso > 0 && (
        <Notice tone="warning" icon="⏳">
          {pendientesReingreso === 1
            ? 'Hay 1 cambio con el reingreso pendiente: reingresá el devuelto a mano en GN y marcalo.'
            : `Hay ${pendientesReingreso} cambios con el reingreso pendiente: reingresá los devueltos a mano en GN y marcalos.`}
        </Notice>
      )}

      {/* ── La lista ─────────────────────────────────────────────────────── */}
      <div>
        <Toolbar justify="between" style={{ marginBottom: space[3] }}>
          <Tabs variant="underline" value={filtro} onChange={setFiltro} items={FILTROS.map((f) => ({ key: f.key, label: f.label }))} />
          <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar reclamo / cliente / orden" style={{ width: 240 }} />
            <Button variant="outline" onClick={() => void recargar()} disabled={cargando}>Recargar</Button>
          </div>
        </Toolbar>

        {cargando ? (
          <Card><div style={{ fontSize: font.sm, color: color.mut, padding: space[4] }}>Cargando…</div></Card>
        ) : visibles.length === 0 ? (
          <Card padding={4}><EmptyState icon="📭" title="No hay cambios" hint="Cuando armes uno, aparece acá." /></Card>
        ) : (
          <TableWrap>
            <THead><Tr>
              <Th>Reclamo</Th><Th>Cliente</Th><Th>Orden</Th><Th>Items</Th><Th align="right">Total</Th>
              <Th>Cobro</Th><Th>Vía</Th><Th>Seguimiento</Th><Th>Estado</Th><Th>Reingreso</Th><Th>Acciones</Th>
            </Tr></THead>
            <TBody>
              {visibles.map((c) => {
                const ocup = ocupada === c.id
                const esBorrador = c.estado === 'borrador' || c.estado === 'esperando_cliente' || c.estado === 'en_revision'
                const conTracking = pideSeguimiento(c.via_retorno)
                const hist = c.historial || []
                const faltanCerrar = faltantesParaCerrar(c)
                return (
                  <Fragment key={c.id}>
                    <Tr>
                      <Td mono strong>{numeroReclamo(c.id)}</Td>
                      <Td>{c.cliente || '—'}</Td>
                      <Td>
                        {c.orden_tn || '—'}
                        {c.solicitud_envio && <div style={{ fontSize: 10, color: color.mut2 }}>{etiquetaEM(c.solicitud_envio)}</div>}
                      </Td>
                      <Td wrap style={{ maxWidth: 240, whiteSpace: 'normal' }}>{resumenItems(c)}</Td>
                      <Td align="right" strong><MoneyText value={c.diferencia ?? 0} /></Td>
                      <Td>
                        <span style={{ fontSize: font.xs, fontWeight: weight.semibold, color: c.pagado ? color.success : color.warning }}>
                          {c.pagado ? '✓ pagado' : 'sin pagar'}
                        </span>
                        {c.cobro_estado === 'pendiente' && <div style={{ fontSize: 10, color: color.warning }}>a cobrar</div>}
                      </Td>
                      <Td>{c.via_retorno ? VIA_LABEL[c.via_retorno] : '—'}</Td>
                      <Td>
                        {conTracking ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                            {c.seguimiento_ida && <a href={trackingUrl(c.via_retorno, c.seguimiento_ida) || undefined} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: color.action }}>↗ ida {c.seguimiento_ida}</a>}
                            {c.seguimiento_vuelta && <a href={trackingUrl(c.via_retorno, c.seguimiento_vuelta) || undefined} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: color.action }}>↗ vuelta {c.seguimiento_vuelta}</a>}
                          </div>
                        ) : <span style={{ color: color.mut2 }}>—</span>}
                      </Td>
                      <Td>
                        <StatusPill tone={c.estado === 'cerrado' ? 'success' : esBorrador ? 'warning' : 'action'} label={ESTADO_LABEL[c.estado]} />
                        {c.gn_venta_number && <div style={{ fontSize: 10, color: color.mut }}>venta GN #{c.gn_venta_number}</div>}
                      </Td>
                      <Td>
                        {c.reingreso_estado === 'hecho' ? <span style={{ color: color.success }}>✓ hecho</span>
                          : c.reingreso_estado === 'pendiente' ? <span style={{ color: color.warning }}>pendiente</span>
                            : '—'}
                      </Td>
                      <Td>
                        <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                          {(esAdmin || esBorrador) && <Button size="sm" onClick={() => abrirEdicion(c)} disabled={ocup}>Editar</Button>}
                          {esBorrador && c.pagado && faltantesParaProcesar(c).length === 0 && (
                            <Button size="sm" variant="solid" tone="action" onClick={() => void crearVentaLista(c)} disabled={ocup}>Crear venta</Button>
                          )}
                          {c.cobro_estado === 'pendiente' && (
                            <Button size="sm" variant="soft" tone="success" onClick={() => void cobrar(c)} disabled={ocup}>Cobré la diferencia</Button>
                          )}
                          {c.estado === 'en_transito' && (
                            <Button size="sm" variant="outline" tone="action" onClick={() => void accion(c.id, () => cambiarEstado(marca, c.id, 'recibido'), 'Marcado como recibido.')} disabled={ocup}>Volvió</Button>
                          )}
                          {c.reingreso_estado === 'pendiente' && (c.estado === 'recibido' || c.estado === 'en_transito') && (
                            <Button size="sm" variant="outline" tone="brand" onClick={() => void reingresar(c)} disabled={ocup}>Reingresado</Button>
                          )}
                          {esAdmin && c.estado !== 'cerrado' && !faltanCerrar.length && (
                            <Button size="sm" variant="solid" tone="success" onClick={() => void accion(c.id, () => cambiarEstado(marca, c.id, 'cerrado'), 'Cambio cerrado.')} disabled={ocup}>Cerrar</Button>
                          )}
                          <CopyButton getText={() => detalleCambioTexto({ ...c, items: c.items, items_nuevos: c.items_nuevos })} label="Copiar" tone="neutral" variant="ghost" />
                          <Button size="sm" variant="ghost" onClick={() => setExpandido(expandido === c.id ? null : c.id)} title="Historial de estados">⋯</Button>
                          {esAdmin && <Button size="sm" variant="ghost" tone="danger" onClick={() => void borrar(c)} disabled={ocup}>Eliminar</Button>}
                        </div>
                        {!!faltanCerrar.length && c.estado !== 'borrador' && (
                          <div style={{ fontSize: font.xs, color: color.warning, marginTop: 2 }}>Falta {faltanCerrar.join(' · ')}</div>
                        )}
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

export function ArmarCambio() { return <ArmarCambioInner modo="admin" /> }
export function ArmarCambioLocal() { return <ArmarCambioInner modo="local" /> }
