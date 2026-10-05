'use client'

/**
 * Caja (key `caja`, área Local, sólo Zattia): el POS propio del local.
 *
 * Se escanea ⇒ cada renglón dice cuántas QUEDAN en el local (o «ÚLTIMA») y cuántas hay para reponer ⇒ se
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
 *
 * 🔑 **Por Transferencia, la venta ESPERA el pago** (F5): ⛔ sale a GN ni se imprime hasta que
 * aparece en Mercado Pago una transferencia del monto exacto. Cada venta que espera tiene su cartel
 * ámbar, que pregunta cada 5 s; con duda (dos pagos, dos ventas iguales) elige la cajera.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useTnPromo } from '@/components/productos/useTnImages'
import { construirPrecios } from '@/lib/etiquetas/core'
import { imagenDe } from '@/lib/tn'
import { esAdmin } from '@/lib/permisos'
import { avisar as avisarSiempre, prepararSonido, type Aviso } from '@/lib/sonido'
import { NOMBRE_MEDIO, cobro, cuentaDeMedio, nombreParaTicket, pesosDeRebaja, renglones } from '@/lib/caja/core.core.js'
import { hoyIso, promosDe } from '@/lib/agenda'
import { useAgenda } from '@/store/useAgenda'
import { palabrasDeBusqueda } from '@/lib/caja/buscar.core.js'
import { avisoDeRenglon } from '@/lib/caja/pedidos-web.core.js'
import { imprimirTicket, numeroProvisorio, plata, type DatosTicket } from '@/lib/caja/ticket'
import {
  buscarNombre,
  buscarProducto,
  cancelarVenta,
  confirmarVenta,
  cruzarVenta,
  elegirVariante,
  guardarBajadas,
  guardarPolitica,
  leerConfig,
  leerPendientes,
  leerTurno,
  abrirTurno,
  sacarEfectivo,
  cerrarTurno,
  type Turno,
  type ResumenTurno,
  reintentarVenta,
  type Candidato,
  type Config,
  type Cruce,
  type ListaNombre,
  type Medio,
  type Rebaja,
  type Reglas,
  type Stock,
  type Variante,
  type Venta,
  leerPedidosWeb,
  type PedidosWeb,
} from '@/lib/caja/cliente'
import { Badge, Button, Field, Input, Notice, Plegable, SectionCard, Select, color, font, radius, space, weight } from '@/components/ui'

type Renglon = { variante: Variante; stock: Stock; cantidad: number; precio: number | null; fueraDeTn: boolean; foto: string | null; rebaja?: Rebaja | null }
/** La cajera elige la FORMA de pago; la cuenta de GN la resuelve `cuentaDeMedio` (Bruno, 4-oct). */
type PagoUI = { medio: Medio | null; base: string }
type Borrador = { id: string; renglones: Renglon[]; email: string; descuentoVenta?: Rebaja | null }

/** Las cuatro formas de pago que ve la cajera, en el orden del mostrador. */
const MEDIOS: Medio[] = ['efectivo', 'transferencia', 'debito', 'credito']

const CLAVE = 'caja:borrador:zattia'
const nuevoId = () => crypto.randomUUID()
/** El instante de impresión: el ticket lo sella con la hora de Argentina. */
const ahora = () => Date.now()
const claveDe = (v: Variante) => `${v.product_id}_${v.size_id}`

function leerBorrador(): Borrador {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE) || 'null') as Borrador | null
    if (d && typeof d.id === 'string' && Array.isArray(d.renglones)) return { id: d.id, renglones: d.renglones, email: d.email || '', descuentoVenta: d.descuentoVenta ?? null }
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

/** La última lista de pedidos web (W1), para mostrarla al cargar mientras llega la nueva. */
const CLAVE_PEDIDOS = 'caja:pedidos-web:zattia'
/** «Con sonido / Sin sonido» de esta computadora (Bruno, 4-oct): el pitido y la voz de cada escaneo. */
const CLAVE_SONIDO = 'caja:sonido'

export function Caja() {
  const { perfil, marca } = useSesion()
  const promos = useAgenda((st) => st.promos)
  const admin = esAdmin(perfil)
  const { datos } = useDatosMonitor()
  const tnIdx = useTnPromo('zattia')

  const [config, setConfig] = useState<Config | null>(null)
  const [errCarga, setErrCarga] = useState<string | null>(null)

  // Con sonido por defecto; cada computadora recuerda lo suyo. Sin sonido ⛔ pita ni habla: la pantalla
  // sigue diciendo todo (los avisos de la Caja ⛔ dependen del oído, la cajera la tiene delante).
  const [conSonido, setConSonido] = useState(true)
  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        if (localStorage.getItem(CLAVE_SONIDO) === 'no') setConSonido(false)
      } catch {
        /* sin localStorage: con sonido */
      }
    })
  }, [])
  const cambiarSonido = (si: boolean) => {
    setConSonido(si)
    try {
      localStorage.setItem(CLAVE_SONIDO, si ? 'si' : 'no')
    } catch {
      /* sin localStorage: dura hasta recargar */
    }
  }
  const avisar = (aviso: Aviso, voz?: string) => {
    if (conSonido) avisarSiempre(aviso, voz)
  }

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

  const [pagos, setPagos] = useState<PagoUI[]>([{ medio: null, base: '' }])
  // Las dos preguntas del crédito (null = ⛔ contestada todavía).
  const [esDelBanco, setEsDelBanco] = useState<boolean | null>(null)
  const [seisCuotas, setSeisCuotas] = useState<boolean | null>(null)
  const [varios, setVarios] = useState(false)
  const [pagaCon, setPagaCon] = useState('')
  const [codigo, setCodigo] = useState('')
  // Cuántas búsquedas hay en vuelo. 🔴 El campo ⛔ se deshabilita mientras busca: el lector tipea el
  // código siguiente enseguida, y con el campo bloqueado ese escaneo se PERDÍA (visto en prod, 4-oct).
  const [buscando, setBuscando] = useState(0)
  const [aviso, setAviso] = useState<{ tono: 'danger' | 'warning'; texto: string } | null>(null)
  const [candidatos, setCandidatos] = useState<{ lista: Candidato[]; mas: number } | null>(null)
  // La lista que aparece MIENTRAS se escribe (Bruno, 4-oct). `vuelta` numera cada búsqueda: sólo se
  // pinta la última (una respuesta lenta ⛔ pisa a la que ya llegó), y el Enter la anula.
  const [sugeridas, setSugeridas] = useState<(ListaNombre & { q: string }) | null>(null)
  const [verSinStock, setVerSinStock] = useState(false)
  const vuelta = useRef(0)
  const [enviando, setEnviando] = useState(false)
  const [ultima, setUltima] = useState<{ venta: Venta; ticket: DatosTicket } | null>(null)
  const [pendientes, setPendientes] = useState<Venta[]>([])
  const scanRef = useRef<HTMLInputElement>(null)

  const enfocar = () => setTimeout(() => scanRef.current?.focus(), 0)

  // 🔑 Sólo con 3 letras o más y alguna LETRA: el lector tipea números y ⛔ tiene que abrir la lista.
  useEffect(() => {
    const n = ++vuelta.current
    const q = codigo.trim()
    if (q.length < 3 || !palabrasDeBusqueda(q).length) return
    const t = setTimeout(() => {
      buscarNombre(q)
        .then((r) => {
          if (vuelta.current !== n) return
          setSugeridas({ ...r, q })
          setVerSinStock(false)
        })
        .catch(() => {
          /* la lista es una ayuda: el Enter sigue buscando y avisa si falla */
        })
    }, 250)
    return () => clearTimeout(t)
  }, [codigo])

  useEffect(() => {
    leerConfig()
      .then(setConfig)
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

  // v2, W3: el turno propio. `undefined` = todavía ⛔ se leyó; `null` = ⛔ hay turno abierto (⛔ se cobra).
  const [turno, setTurno] = useState<Turno | null | undefined>(undefined)
  const [ultimosTurnos, setUltimosTurnos] = useState<Turno[]>([])
  const [errTurno, setErrTurno] = useState<string | null>(null)
  const refrescarTurno = useCallback(() => {
    leerTurno()
      .then((r) => {
        setTurno(r.turno)
        setUltimosTurnos(r.ultimos)
        setErrTurno(null)
      })
      .catch((e) => setErrTurno((e as Error).message))
  }, [])
  useEffect(() => {
    refrescarTurno()
  }, [refrescarTurno])

  // v2, W1: los pedidos web por empaquetar, cada 2 min. Si TN ⛔ contesta queda el error a la vista
  // (⛔ «0 pedidos»: un cero que ⛔ se midió afirma que ⛔ hay).
  const [pedidosWeb, setPedidosWeb] = useState<PedidosWeb | null>(null)
  const [errPedidos, setErrPedidos] = useState<string | null>(null)
  useEffect(() => {
    // La última lista queda en el aparato: TN tarda ~8 s en frío y, sin esto, el aviso del renglón
    // llegaba después del escaneo. Se usa al cargar mientras llega la nueva, y sólo si tiene menos de
    // 30 min (el cartel dice de qué hora es). Adentro de un async: `localStorage` ⛔ existe en el servidor.
    void Promise.resolve().then(() => {
      try {
        const d = JSON.parse(localStorage.getItem(CLAVE_PEDIDOS) || 'null') as PedidosWeb | null
        if (d && Date.now() - Date.parse(d.leidoEn) < 30 * 60_000) setPedidosWeb((ya) => ya ?? { ...d, guardada: true })
      } catch {
        /* sin localStorage: se espera la lectura */
      }
    })
    const leer = () =>
      leerPedidosWeb()
        .then((d) => {
          setPedidosWeb(d)
          setErrPedidos(null)
          try {
            localStorage.setItem(CLAVE_PEDIDOS, JSON.stringify(d))
          } catch {
            /* sin localStorage: la próxima carga espera la lectura */
          }
        })
        .catch((e) => setErrPedidos((e as Error).message))
    leer()
    const t = setInterval(leer, 120_000)
    return () => clearInterval(t)
  }, [])
  /** El aviso del renglón: null sin pedidos leídos (el cartel de arriba ya dice que ⛔ se leyeron). */
  const avisoWeb = useCallback(
    (v: Variante, stock: Stock, enCarrito: number) =>
      pedidosWeb ? avisoDeRenglon({ sku: v.sku ?? '', local: stock.local, deposito: stock.deposito, enCarrito, porSku: pedidosWeb.porSku }) : null,
    [pedidosWeb],
  )

  const reglas = config?.reglas ?? null
  // Lo que lee la gente de una cuenta: la forma de pago, ⛔ el nombre de la cuenta de GN.
  const nombreCuenta = useCallback((id: number) => nombreParaTicket(id, reglas), [reglas])
  // 🔑 La promo bancaria de crédito de HOY sale de la Agenda (la misma de la banda de promos), ⛔ se le
  // pregunta a la cajera si hay: sólo si la tarjeta es de ese banco.
  const promoCredito = useMemo(
    () => promosDe(promos, hoyIso(), { canal: 'mostrador', marca }).filter((p) => p.medio === 'credito' && p.beneficio.tipo === 'descuento'),
    [promos, marca],
  )
  const bancosPromo = promoCredito.map((p) => p.banco).join(' o ')
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
      return { ...b, renglones: [...b.renglones, { variante, stock, cantidad: 1, rebaja: null, ...precioYFoto(variante.product_id) }] }
    })
    const enCarrito = (bor.renglones.find((r) => claveDe(r.variante) === claveDe(variante))?.cantidad ?? 0) + 1
    const web = avisoWeb(variante, stock, enCarrito)
    // La Caja ⛔ frena (gana el local, Bruno 4-oct): avisa, y el pedido se resuelve después.
    if (web && web.tipo !== 'separada') {
      avisar('ojo', web.tipo === 'sin_stock' ? 'Comprada online' : 'Traer del depósito')
      setAviso({ tono: web.tipo === 'sin_stock' ? 'danger' : 'warning', texto: web.texto })
    } else if (stock.local - enCarrito <= 0) avisar('ojo', 'Última')
    else avisar('ok')
  }

  async function escanear(texto: string, elegida?: Variante) {
    const c = texto.trim()
    if (!c && !elegida) return
    prepararSonido()
    vuelta.current++
    setCodigo('')
    setAviso(null)
    setCandidatos(null)
    setBuscando((n) => n + 1)
    try {
      const r = await (elegida ? elegirVariante(elegida) : buscarProducto(c))
      if ('candidatos' in r) {
        setCandidatos({ lista: r.candidatos, mas: r.mas ?? 0 })
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
    await escanear('', v)
  }

  const cambiarRenglon = (i: number, cambio: Partial<Renglon>) =>
    setBor((b) => ({ ...b, renglones: b.renglones.map((r, j) => (j === i ? { ...r, ...cambio } : r)) }))
  const sacarRenglon = (i: number) => setBor((b) => ({ ...b, renglones: b.renglones.filter((_, j) => j !== i) }))

  // ── El cobro: el mismo núcleo que el servidor ──
  const sinPrecio = bor.renglones.some((r) => !(r.precio && r.precio > 0))
  const items = bor.renglones.map((r) => ({ product_id: r.variante.product_id, size_id: r.variante.size_id, cantidad: r.cantidad, precio: r.precio ?? 0, rebaja: r.rebaja ?? null }))
  const descuentoVenta = bor.descuentoVenta ?? null
  const armado = (() => {
    try {
      if (!bor.renglones.length || sinPrecio) return { filas: null, error: null as string | null }
      return { filas: renglones(items), error: null }
    } catch (e) {
      return { filas: null, error: (e as Error).message }
    }
  })()
  const filas = armado.filas
  // Lo que queda después de las rebajas a mano: es lo que decide si se ofrecen las 6 cuotas.
  const aPagar = (() => {
    if (!filas) return null
    const sub = filas.reduce((s, f) => s + f.importe, 0)
    try {
      return Math.round((sub - pesosDeRebaja(descuentoVenta, sub)) * 100) / 100
    } catch {
      return null
    }
  })()
  const sinMedios = !!reglas && !reglas.medios
  const hayCredito = pagos.some((p) => p.medio === 'credito')
  const preguntaBanco = hayCredito && promoCredito.length > 0
  const preguntaCuotas = hayCredito && !!reglas?.medios && aPagar != null && aPagar > reglas.medios.credito.minSeisCuotas
  const cuentaDe = (medio: Medio, rg: Reglas) =>
    cuentaDeMedio(medio, { reglas: rg, total: aPagar ?? 0, promoCreditoHoy: promoCredito.length > 0, esDelBanco: esDelBanco === true, seisCuotas: seisCuotas === true })

  /** El total de cada forma de pago pagando todo con ella: lo que muestran las tarjetas. */
  const totalPorMedio = (() => {
    const m: Partial<Record<Medio, number>> = {}
    if (!filas || !reglas?.medios) return m
    for (const medio of MEDIOS) {
      try {
        m[medio] = cobro({ filas, pagos: [{ cuenta: cuentaDe(medio, reglas) }], reglas, descuentoVenta }).total
      } catch {
        /* sin regla: la tarjeta muestra — */
      }
    }
    return m
  })()

  const elCobro = (() => {
    if (armado.error) return { c: null, pedidos: [], error: armado.error }
    if (!filas || !reglas?.medios || pagos.some((p) => p.medio == null)) return { c: null, pedidos: [], error: null as string | null }
    try {
      const rg = reglas
      const pedidos = pagos.map((p, i) => {
        const cuenta = cuentaDe(p.medio as Medio, rg)
        return i === pagos.length - 1 ? { cuenta } : { cuenta, base: aNumero(p.base) ?? 0 }
      })
      return { c: cobro({ filas, pagos: pedidos, reglas: rg, descuentoVenta }), pedidos, error: null }
    } catch (e) {
      return { c: null, pedidos: [], error: (e as Error).message }
    }
  })()
  const c = elCobro.c
  const pedidos = elCobro.pedidos
  const faltaContestar = (preguntaBanco && esDelBanco == null) || (preguntaCuotas && seisCuotas == null)

  const enEfectivo = c ? c.pagos.filter((p) => esEfectivo(p.cuenta)).reduce((s, p) => s + p.monto, 0) : 0
  const pagaConN = aNumero(pagaCon)
  const vuelto = pagaConN != null && enEfectivo > 0 ? Math.round((pagaConN - enEfectivo) * 100) / 100 : null
  const emailOk = !bor.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bor.email.trim())
  const puedeConfirmar = !!turno && !!c && !enviando && emailOk && !faltaContestar && (vuelto == null || vuelto >= 0)

  function datosTicket(venta: Venta): DatosTicket {
    return {
      numero: venta.gn_number,
      id: venta.id,
      renglones: bor.renglones.map((r, i) => ({
        nombre: r.variante.product_name,
        talle: r.variante.size_name,
        cantidad: r.cantidad,
        precio: r.precio ?? 0,
        importe: filas?.[i]?.importe ?? Math.round(r.cantidad * (r.precio ?? 0) * 100) / 100,
      })),
      subtotal: venta.subtotal,
      pagos: venta.pagos,
      total: venta.total,
      nombreCuenta,
      pagaCon: venta.paga_con,
      politica: config?.politica_cambio ?? null,
    }
  }

  /** El ticket de una venta ya guardada (la que esperaba la transferencia): el carrito ya ⛔ está. */
  function ticketGuardado(venta: Venta): DatosTicket {
    return {
      ...datosTicket(venta),
      renglones: (venta.renglones ?? []).map((r) => ({
        nombre: r.nombre ?? `Producto ${r.product_id}`,
        talle: r.talle,
        cantidad: r.cantidad,
        precio: r.precio,
        importe: r.importe ?? Math.round(r.cantidad * r.precio * 100) / 100,
      })),
    }
  }

  /** Llegó la transferencia y la venta salió a GN: recién ahora el ticket. */
  function llegoTransferencia(venta: Venta) {
    const ticket = ticketGuardado(venta)
    setUltima({ venta, ticket })
    avisar(venta.estado === 'en_gn' ? 'ok' : 'ojo')
    imprimirTicket(ticket, esEfectivo, ahora()).catch((e) => setAviso({ tono: 'danger', texto: `No se pudo imprimir el ticket: ${(e as Error).message}` }))
    refrescarPendientes()
    refrescarTurno()
  }

  async function confirmar() {
    if (!c) return
    setEnviando(true)
    setAviso(null)
    try {
      const r = await confirmarVenta({
        id: bor.id,
        // El nombre, el talle y la foto van para el ticket por mail; la plata ⛔ los mira.
        items: bor.renglones.map((r, i) => ({ ...items[i], nombre: r.variante.product_name, talle: r.variante.size_name, foto: r.foto })),
        pagos: pedidos,
        total: c.total,
        descuentoVenta,
        email: bor.email.trim() || null,
        pagaCon: enEfectivo > 0 ? pagaConN : null,
      })
      // La venta quedó guardada (en GN, pendiente o esperando la transferencia): el carrito se cierra y nace otro id.
      setBor({ id: nuevoId(), renglones: [], email: '', descuentoVenta: null })
      setPagos([{ medio: null, base: '' }])
      setEsDelBanco(null)
      setSeisCuotas(null)
      setVarios(false)
      setPagaCon('')
      if (r.venta.estado === 'esperando_pago') {
        // ⛔ ticket todavía: sale cuando llega la transferencia (el cartel ámbar de arriba).
        setUltima(null)
        refrescarPendientes()
        refrescarTurno()
        return
      }
      const ticket = datosTicket(r.venta)
      setUltima({ venta: r.venta, ticket })
      avisar(r.venta.estado === 'en_gn' ? 'ok' : 'ojo')
      imprimirTicket(ticket, esEfectivo, ahora()).catch((e) => setAviso({ tono: 'danger', texto: `No se pudo imprimir el ticket: ${(e as Error).message}` }))
      refrescarPendientes()
      refrescarTurno()
    } catch (e) {
      // ⛔ se renueva el id: el reintento tiene que llevar el MISMO, por si GN ya la tiene.
      avisar('no')
      if ((e as { datos?: { sinTurno?: boolean } }).datos?.sinTurno) refrescarTurno()
      setAviso({ tono: 'danger', texto: (e as Error).message })
    } finally {
      setEnviando(false)
      enfocar()
    }
  }

  if (errCarga) return <Notice tone="danger">{errCarga}</Notice>

  return (
    <div style={{ display: 'grid', gap: space[4], maxWidth: 1100 }}>
      {errTurno && <Notice tone="danger">No se pudo leer el turno: {errTurno}</Notice>}
      {turno !== undefined && <TurnoCaja turno={turno} ultimos={ultimosTurnos} onCambio={(t) => (t === undefined ? refrescarTurno() : setTurno(t))} onCerrado={refrescarTurno} />}

      {pendientes
        .filter((v) => v.estado === 'esperando_pago')
        .map((v) => (
          <EsperaTransferencia key={v.id} venta={v} onLlego={llegoTransferencia} onCambio={refrescarPendientes} />
        ))}

      {pendientes.some((v) => v.estado !== 'esperando_pago') && (
        <Pendientes ventas={pendientes.filter((v) => v.estado !== 'esperando_pago')} onCambio={refrescarPendientes} />
      )}

      <PedidosWebSinArmar datos={pedidosWeb} error={errPedidos} />

      {ultima && <UltimaVenta venta={ultima.venta} onReimprimir={() => imprimirTicket(ultima.ticket, esEfectivo, ahora())} />}

      <SectionCard
        title="Escanear"
        actions={
          <Button size="sm" variant="ghost" onClick={() => cambiarSonido(!conSonido)} aria-pressed={conSonido}>
            {conSonido ? 'Con sonido' : 'Sin sonido'}
          </Button>
        }
      >
        {/* 🔴 Sin <form>: el Enter del lector lo toma el campo. Con un form, el botón «Agregar» en
            `loading` (deshabilitado) hacía que el navegador IGNORE el Enter, y el segundo escaneo
            quedaba escrito sin entrar (visto en prod, 4-oct). */}
        <div style={{ display: 'flex', gap: space[2] }}>
          <Input
            ref={scanRef}
            autoFocus
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              escanear(codigo)
            }}
            placeholder="Código de barras, SKU o nombre y talle"
            style={{ fontSize: font.xl, flex: 1 }}
          />
          <Button onClick={() => escanear(codigo)} loading={buscando > 0}>
            Agregar
          </Button>
        </div>
        {aviso && (
          <div style={{ marginTop: space[3] }}>
            <Notice tone={aviso.tono}>{aviso.texto}</Notice>
          </div>
        )}
        {sugeridas && sugeridas.q === codigo.trim() && !candidatos && (
          <ListaPrendas
            con={sugeridas.conStock}
            masCon={sugeridas.masCon}
            sin={sugeridas.sinStock}
            masSin={sugeridas.masSin}
            verSin={verSinStock}
            onVerSin={() => setVerSinStock(true)}
            precioYFoto={precioYFoto}
            onElegir={elegirCandidato}
          />
        )}
        {candidatos && (
          <ListaPrendas
            titulo="Ese código es de varias prendas: elegí cuál."
            con={candidatos.lista}
            masCon={candidatos.mas}
            sin={[]}
            masSin={0}
            verSin={false}
            onVerSin={() => {}}
            precioYFoto={precioYFoto}
            onElegir={elegirCandidato}
          />
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
                onRebaja={(rb) => cambiarRenglon(i, { rebaja: rb })}
                importe={filas?.[i]?.importe ?? null}
                onSacar={() => sacarRenglon(i)}
                avisoWeb={avisoWeb(r.variante, r.stock, r.cantidad)}
                mirandoWeb={!pedidosWeb && !errPedidos}
              />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: space[3], fontSize: font.lg }}>
            <span>Subtotal</span>
            <b>{filas ? plata(filas.reduce((s, f) => s + f.importe, 0)) : '—'}</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: space[2], gap: space[2], flexWrap: 'wrap' }}>
            <span style={{ color: color.mut }}>Descuento a la venta</span>
            <CampoRebaja valor={descuentoVenta} onCambio={(rb) => setBor((b) => ({ ...b, descuentoVenta: rb }))} />
          </div>
        </SectionCard>
      )}

      {bor.renglones.length > 0 && (
        <SectionCard title="Cobrar">
          {sinMedios ? (
            <Notice tone="danger">Faltan las formas de pago de la Caja: hay que correr sql/migrate-caja-medios.sql.</Notice>
          ) : sinPrecio ? (
            <Notice tone="warning">Hay una prenda sin precio: escribilo en el renglón para poder cobrar.</Notice>
          ) : !varios ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: space[2] }}>
              {MEDIOS.map((medio) => {
                const activa = pagos[0].medio === medio
                const regla = reglas?.medios ? reglas.cuentas[(() => { try { return cuentaDe(medio, reglas) } catch { return 0 } })()] : undefined
                return (
                  <button
                    key={medio}
                    type="button"
                    onClick={() => setPagos([{ medio, base: '' }])}
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
                    <div style={{ fontSize: font.md, fontWeight: weight.semibold, color: color.ink }}>{NOMBRE_MEDIO[medio]}</div>
                    <div style={{ fontSize: font.sm, color: color.mut }}>{regla && regla.descuento > 0 ? `${regla.descuento}% de descuento` : 'sin descuento'}</div>
                    <div style={{ fontSize: font['2xl'], fontWeight: weight.bold, color: color.ink, marginTop: space[1] }}>
                      {totalPorMedio[medio] != null ? plata(totalPorMedio[medio]) : '—'}
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <VariosPagos pagos={pagos} setPagos={setPagos} montos={c?.pagos.map((p) => p.monto) ?? null} />
          )}

          {!sinPrecio && !sinMedios && (preguntaBanco || preguntaCuotas) && (
            <div style={{ display: 'grid', gap: space[2], marginTop: space[3] }}>
              {preguntaBanco && <SiNo pregunta={`¿Es tarjeta de ${bancosPromo}?`} valor={esDelBanco} onCambio={setEsDelBanco} />}
              {preguntaCuotas && <SiNo pregunta="¿En 6 cuotas?" valor={seisCuotas} onCambio={setSeisCuotas} />}
            </div>
          )}

          {!sinPrecio && !sinMedios && (
            <div style={{ marginTop: space[3] }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setVarios(!varios)
                  setPagos(varios ? [{ medio: null, base: '' }] : [{ medio: pagos[0].medio, base: '' }, { medio: null, base: '' }])
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
                {turno === null && <span style={{ marginLeft: space[3], color: color.danger }}>Abrí el turno (arriba) para cobrar.</span>}
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {admin && config?.reglas.medios && <Bajadas reglas={config.reglas} onGuardadas={(rg) => setConfig({ ...config, reglas: rg })} />}
      {admin && config && <PoliticaCambio inicial={config.politica_cambio} onGuardada={(t) => setConfig({ ...config, politica_cambio: t })} />}
    </div>
  )
}

/**
 * Las prendas para elegir, con foto, precio de etiqueta y el stock del local (de anoche: el vivo se
 * lee al elegir). Por defecto sólo las que hay en el local; «Mostrar sin stock» suma el resto, para
 * poder vender una prenda que el sistema da en cero (Bruno, 4-oct).
 */
function ListaPrendas({
  titulo,
  con,
  masCon,
  sin,
  masSin,
  verSin,
  onVerSin,
  precioYFoto,
  onElegir,
}: {
  titulo?: string
  con: Candidato[]
  masCon: number
  sin: Candidato[]
  masSin: number
  verSin: boolean
  onVerSin: () => void
  precioYFoto: (productId: number) => { precio: number | null; foto: string | null }
  onElegir: (v: Variante) => void
}) {
  const fila = (v: Candidato, apagada: boolean) => {
    const { precio, foto } = precioYFoto(v.product_id)
    return (
      <button
        key={claveDe(v)}
        type="button"
        onClick={() => onElegir(v)}
        style={{
          height: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: space[3],
          padding: space[2],
          textAlign: 'left',
          border: `1px solid ${color.line}`,
          borderRadius: radius.md,
          background: color.surface,
          cursor: 'pointer',
          opacity: apagada ? 0.6 : 1,
        }}
      >
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: radius.md, flexShrink: 0 }} />
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: radius.md, background: color.line, flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: weight.semibold, color: color.ink }}>
            {v.product_name} · {v.size_name}
          </div>
          {/* ⛔ Número de stock: el de la lista es el de ANOCHE (tipear ⛔ gasta el cupo de GN) y un número
              viejo confunde. Sólo ordena —con stock arriba, el resto tras «Mostrar sin stock»—; el real lo
              dice el renglón al elegirla, que lee GN en vivo (Bruno, 4-oct). */}
        </div>
        <div style={{ fontWeight: weight.semibold, color: color.ink }}>{precio ? plata(precio) : '—'}</div>
      </button>
    )
  }
  const totalSin = sin.length + masSin
  return (
    <div style={{ marginTop: space[3], display: 'grid', gap: space[2] }}>
      {titulo && <span style={{ color: color.mut, fontSize: font.sm }}>{titulo}</span>}
      {con.length === 0 && !verSin && <span style={{ color: color.mut, fontSize: font.sm }}>Ninguna con stock en el local.</span>}
      {con.map((v) => fila(v, false))}
      {masCon > 0 && <span style={{ color: color.mut, fontSize: font.sm }}>Y {masCon} más: escribí el color o el talle para achicar la lista.</span>}
      {verSin && sin.map((v) => fila(v, true))}
      {verSin && masSin > 0 && <span style={{ color: color.mut, fontSize: font.sm }}>Y {masSin} más sin stock.</span>}
      {!verSin && totalSin > 0 && (
        <div>
          <Button variant="ghost" size="sm" onClick={onVerSin}>
            Mostrar sin stock ({totalSin})
          </Button>
        </div>
      )}
    </div>
  )
}

/** Un renglón: foto, nombre, stock que QUEDA (descontando lo que ya está en la venta), cantidad y precio. */
function FilaRenglon({
  r,
  cargandoPrecios,
  onCantidad,
  onPrecio,
  onRebaja,
  importe,
  onSacar,
  avisoWeb,
  mirandoWeb,
}: {
  r: Renglon
  cargandoPrecios: boolean
  onCantidad: (n: number) => void
  onPrecio: (p: number | null) => void
  onRebaja: (rb: Rebaja | null) => void
  /** Lo que queda del renglón después de su descuento (null si ⛔ se puede calcular). */
  importe: number | null
  onSacar: () => void
  /** La prenda está en un pedido web sin armar (W1). */
  avisoWeb: { tipo: 'separada' | 'reponer' | 'sin_stock'; texto: string } | null
  /** Los pedidos web todavía ⛔ llegaron: sin esto, «sin aviso» parece «en ningún pedido». */
  mirandoWeb: boolean
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
              quedan {quedan} en el local
            </span>
          )}
          {/* En el local «depósito» es el de atrás de la percha, que ya está en `local`. El Depósito de GN
              (18210) ⛔ vende desde la caja: sólo repone. */}
          <span>· {r.stock.deposito} para reponer</span>
          {/* Ubicaciones depósito: dónde buscarla atrás. Sin estante ⛔ se dice nada: está todo en percha. */}
          {!!r.stock.atras?.length && <b style={{ color: color.ink }}>· ubicación: {r.stock.atras.join(' · ')}</b>}
          {r.stock.fuente === 'espejo' && <span title={r.stock.motivo}>· stock de anoche (Gestión Nube no contestó)</span>}
        </div>
        {r.fueraDeTn && <div style={{ fontSize: font.xs, color: color.warningInk }}>Precio del espejo: el producto no cruza con Tienda Nube.</div>}
        {mirandoWeb && <div style={{ fontSize: font.xs, color: color.mut, marginTop: space[0.5] }}>mirando pedidos web…</div>}
        {avisoWeb && (
          <div style={{ marginTop: space[1] }}>
            <Badge tone={avisoWeb.tipo === 'sin_stock' ? 'danger' : 'warning'}>{avisoWeb.texto}</Badge>
          </div>
        )}
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
      <div style={{ display: 'grid', gap: space[0.5], justifyItems: 'end' }}>
        <CampoRebaja valor={r.rebaja ?? null} onCambio={onRebaja} />
        {r.rebaja && importe != null && <span style={{ fontSize: font.sm, color: color.mut }}>queda {plata(importe)}</span>}
      </div>
      <Button size="sm" variant="ghost" tone="danger" onClick={onSacar} aria-label={`Eliminar ${r.variante.product_name} · ${r.variante.size_name}`}>
        Eliminar
      </Button>
    </div>
  )
}

function VariosPagos({ pagos, setPagos, montos }: { pagos: PagoUI[]; setPagos: (p: PagoUI[]) => void; montos: number[] | null }) {
  const cambiar = (i: number, cambio: Partial<PagoUI>) => setPagos(pagos.map((p, j) => (j === i ? { ...p, ...cambio } : p)))
  return (
    <div style={{ display: 'grid', gap: space[2] }}>
      <span style={{ fontSize: font.sm, color: color.mut }}>
        En cada pago va la parte del subtotal que se paga con esa forma de pago; el último se lleva el resto. Cada uno se descuenta y se redondea por separado.
      </span>
      {pagos.map((p, i) => {
        const ultimo = i === pagos.length - 1
        return (
          <div key={i} style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
            <Select value={p.medio ?? ''} onChange={(e) => cambiar(i, { medio: (e.target.value || null) as Medio | null })} style={{ width: 220 }}>
              <option value="">Forma de pago…</option>
              {MEDIOS.map((m) => (
                <option key={m} value={m}>
                  {NOMBRE_MEDIO[m]}
                </option>
              ))}
            </Select>
            {ultimo ? (
              <span style={{ width: 140, color: color.mut }}>el resto</span>
            ) : (
              <Input inputMode="decimal" value={p.base} onChange={(e) => cambiar(i, { base: e.target.value })} placeholder="$ del subtotal" style={{ width: 140 }} />
            )}
            <b style={{ minWidth: 100 }}>{montos?.[i] != null ? `cobra ${plata(montos[i])}` : ''}</b>
            {pagos.length > 2 && (
              <Button size="sm" variant="ghost" onClick={() => setPagos(pagos.filter((_, j) => j !== i))} aria-label={`Eliminar el pago ${p.medio ? NOMBRE_MEDIO[p.medio] : 'sin forma de pago'}`}>
                Eliminar
              </Button>
            )}
          </div>
        )
      })}
      <div>
        <Button size="sm" variant="outline" onClick={() => setPagos([...pagos.slice(0, -1), { medio: null, base: '' }, pagos[pagos.length - 1]])}>
          Agregar pago
        </Button>
      </div>
    </div>
  )
}

function ResumenCobro({ c, nombreCuenta }: { c: { subtotal: number; aVenta: number; total: number; pagos: { cuenta: number; porcentaje: number; descuento: number; redondeo: number; monto: number }[] }; nombreCuenta: (id: number) => string }) {
  const linea = (izq: string, der: string, fuerte = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: fuerte ? font['2xl'] : font.md, fontWeight: fuerte ? weight.bold : weight.normal }}>
      <span>{izq}</span>
      <span>{der}</span>
    </div>
  )
  return (
    <div style={{ display: 'grid', gap: space[1], maxWidth: 420 }}>
      {linea('Subtotal', plata(c.subtotal))}
      {c.aVenta > 0 && linea('Descuento en la venta', `-${plata(c.aVenta)}`)}
      {c.pagos.map((p, i) => (
        <div key={i}>
          {p.descuento > 0 && linea(`Descuento ${p.porcentaje}%${c.pagos.length > 1 ? ` (${nombreCuenta(p.cuenta)})` : ''}`, `-${plata(p.descuento)}`)}
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
          Reimprimir ticket
        </Button>
      </div>
    </Notice>
  )
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
const TEXTO_ORIGEN: Record<string, string> = { mp: 'desde Mercado Pago', banco: 'desde otro banco', tarjeta: 'con tarjeta', otro: 'otro medio' }

/**
 * Una venta que espera la transferencia (F5). Pregunta cada 5 s si llegó; el servidor decide con
 * `cruzarTransferencia` y, si llegó, ya la mandó a GN ⇒ acá sólo se imprime (`onLlego`).
 */
function EsperaTransferencia({ venta, onLlego, onCambio }: { venta: Venta; onLlego: (v: Venta) => void; onCambio: () => void }) {
  const [cruce, setCruce] = useState<Cruce | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [seguro, setSeguro] = useState(false)
  const terminada = useRef(false)

  const mirar = useCallback(
    async (pago?: string) => {
      if (terminada.current) return
      try {
        const r = await cruzarVenta(venta.id, pago)
        setError(null)
        if (r.cruce.estado === 'llego') {
          terminada.current = true
          onLlego(r.venta)
          return
        }
        if (r.cruce.estado === 'ya' || r.cruce.estado === 'cancelada') {
          terminada.current = true
          onCambio()
          return
        }
        setCruce(r.cruce)
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [venta.id, onLlego, onCambio],
  )

  useEffect(() => {
    // La primera vez enseguida, fuera del render del efecto (el lint ⛔ deja un setState sincrónico ahí).
    const t0 = setTimeout(() => void mirar(), 0)
    const t = setInterval(() => void mirar(), 5_000)
    return () => {
      clearTimeout(t0)
      clearInterval(t)
    }
  }, [mirar])

  async function elegir(pago: string) {
    setTrabajando(pago)
    await mirar(pago)
    setTrabajando(null)
  }

  async function cancelar() {
    setTrabajando('cancelar')
    try {
      await cancelarVenta(venta.id)
      terminada.current = true
      onCambio()
    } catch (e) {
      setError((e as Error).message)
      onCambio()
    } finally {
      setTrabajando(null)
    }
  }

  const monto = venta.espera_monto ?? venta.total
  return (
    <Notice tone="warning">
      <div style={{ display: 'grid', gap: space[2] }}>
        <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ flex: 1, minWidth: 220 }}>
            Esperando la transferencia de {plata(monto)} · venta {numeroProvisorio(venta.id)} de las {hora(venta.creada_en)}
          </b>
          {seguro ? (
            <>
              <span style={{ fontSize: font.sm }}>¿Cancelar la venta? No se cobra.</span>
              <Button size="sm" tone="danger" loading={trabajando === 'cancelar'} onClick={cancelar}>
                Cancelar la venta
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSeguro(false)}>
                No
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setSeguro(true)}>
              Cancelar venta
            </Button>
          )}
        </div>
        <span style={{ fontSize: font.sm }}>
          El ticket sale solo cuando la transferencia aparece en Mercado Pago. No alcanza con el comprobante del teléfono.
          {venta.total !== monto && ` El resto (${plata(venta.total - monto)}) se cobra aparte.`}
        </span>
        {cruce?.estado === 'elegir' && (
          <div style={{ display: 'grid', gap: space[1] }}>
            <span>{cruce.motivo}</span>
            {cruce.candidatos.map((p) => (
              <div key={p.id} style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', fontSize: font.sm }}>
                <span style={{ fontWeight: weight.semibold }}>{plata(p.monto)}</span>
                <span>a las {hora(p.cuando)}</span>
                <span style={{ color: color.mut }}>{TEXTO_ORIGEN[p.origen] ?? p.origen}</span>
                <Button size="sm" tone="success" loading={trabajando === p.id} disabled={!!trabajando} onClick={() => elegir(p.id)}>
                  Elegir
                </Button>
              </div>
            ))}
          </div>
        )}
        {(cruce?.estado === 'sin_cuenta' || cruce?.estado === 'invalido') && <span>{cruce.motivo}</span>}
        {error && <span style={{ color: color.danger }}>{error}</span>}
      </div>
    </Notice>
  )
}

/** Las ventas cobradas que todavía ⛔ están en GN. Rojo: hasta que lleguen, el stock y la caja de GN ⛔ cierran. */
/**
 * Los pedidos web pagados que todavía ⛔ se empaquetaron (W1): el más viejo primero. Es una alerta para
 * armarlos a tiempo; ⛔ se arman desde acá. Sin pedidos ⇒ ⛔ ocupa lugar.
 */
function PedidosWebSinArmar({ datos, error }: { datos: PedidosWeb | null; error: string | null }) {
  const [abierto, setAbierto] = useState(false)
  if (error && !datos) return <Notice tone="warning">No se pudieron leer los pedidos web: {error}</Notice>
  if (!datos) return null
  const n = datos.pedidos.length
  if (!n && !datos.noLeidas && !error) return null
  const sinPagar = datos.pedidos.filter((p) => p.sinPagar).length
  const hace = (h: number | null) => (h == null ? '' : h < 1 ? 'hace menos de 1 h' : h < 48 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} días`)
  return (
    <Notice tone={n ? 'warning' : 'neutral'}>
      <div style={{ display: 'grid', gap: space[2] }}>
        <button
          onClick={() => setAbierto(!abierto)}
          style={{ height: 'auto', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit', fontSize: font.base }}
        >
          <b>
            {abierto ? '▾' : '▸'} {n === 1 ? '1 pedido web sin armar' : `${n} pedidos web sin armar`}
          </b>
          {sinPagar > 0 && <span> ({sinPagar === n ? (n === 1 ? 'sin pagar' : 'todos sin pagar') : `${sinPagar} sin pagar`})</span>}
          {n > 0 && <span> · el más viejo {hace(datos.pedidos[0].horas)}</span>}
        </button>
        {datos.noLeidas > 0 && <span style={{ fontSize: font.sm }}>Tienda Nube no devolvió {datos.noLeidas} órdenes: puede haber más.</span>}
        {datos.guardada && !error && <span style={{ fontSize: font.sm }}>Lista de las {new Date(datos.leidoEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })}: actualizando…</span>}
        {error && <span style={{ fontSize: font.sm }}>No se pudo actualizar ({error}). Es la lista de las {new Date(datos.leidoEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })}.</span>}
        {abierto &&
          datos.pedidos.map((p) => (
            <div key={p.numero} style={{ display: 'grid', gap: space[0.5], fontSize: font.sm, borderTop: `1px solid ${color.line}`, paddingTop: space[2] }}>
              <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
                <b>#{p.numero}</b>
                {p.sinPagar && <Badge tone="neutral">sin pagar</Badge>}
                <span>{hace(p.horas)}</span>
                <span style={{ color: color.mut }}>{p.envioTipo === 'pickup' ? `Retira: ${p.envio ?? ''}` : (p.envio ?? 'Envío')}</span>
              </div>
              {p.prendas.map((x, i) => (
                <span key={i}>
                  {x.cantidad > 1 ? `${x.cantidad} × ` : ''}
                  {x.nombre}
                  {!x.sku && <span style={{ color: color.mut }}> (sin SKU: no se cruza con la Caja)</span>}
                </span>
              ))}
            </div>
          ))}
      </div>
    </Notice>
  )
}

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

/**
 * Un descuento a mano: % o $ (Bruno, 4-oct). Vacío = sin descuento. El tope (⛔ más que el importe)
 * lo pone el núcleo, y la pantalla muestra su error.
 */
function CampoRebaja({ valor, onCambio }: { valor: Rebaja | null; onCambio: (rb: Rebaja | null) => void }) {
  const [texto, setTexto] = useState<string | null>(null)
  const tipo = valor?.tipo ?? 'pct'
  const fijar = (t: string, tp: Rebaja['tipo']) => {
    const n = aNumero(t)
    onCambio(n != null && n > 0 ? { tipo: tp, valor: n } : null)
  }
  return (
    <div style={{ display: 'flex', gap: space[1], alignItems: 'center' }}>
      <Input
        inputMode="decimal"
        value={texto ?? (valor ? String(valor.valor) : '')}
        placeholder="descuento"
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          if (texto != null) fijar(texto, tipo)
          setTexto(null)
        }}
        style={{ width: 100, textAlign: 'right' }}
        aria-label="Descuento"
      />
      <Select value={tipo} onChange={(e) => valor && onCambio({ ...valor, tipo: e.target.value as Rebaja['tipo'] })} style={{ width: 64 }} aria-label="En % o en $" disabled={!valor}>
        <option value="pct">%</option>
        <option value="pesos">$</option>
      </Select>
    </div>
  )
}

/** Una pregunta de Sí/No del cobro con tarjeta de crédito. */
function SiNo({ pregunta, valor, onCambio }: { pregunta: string; valor: boolean | null; onCambio: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontWeight: weight.semibold, color: color.ink }}>{pregunta}</span>
      <Button size="sm" variant={valor === true ? 'solid' : 'outline'} onClick={() => onCambio(true)}>
        Sí
      </Button>
      <Button size="sm" variant={valor === false ? 'solid' : 'outline'} onClick={() => onCambio(false)}>
        No
      </Button>
    </div>
  )
}

/**
 * Sólo admin: las bajadas de línea del cobro. 🔑 **A qué cuenta van las transferencias ⛔ lo decide
 * la cajera** (Bruno, 4-oct): «si dicen transfieran a cuenta Darío, va Caja Gerencia». Y el modo
 * feria: efectivo y transferencia van a las cuentas de feria (precio final, sin descuento extra).
 */
function Bajadas({ reglas, onGuardadas }: { reglas: Reglas; onGuardadas: (r: Reglas) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const NOMBRE_TRANSF: Record<number, string> = { 13015: 'Areben Comercial (se confirma sola con Mercado Pago)', 20595: 'Caja Gerencia (se confirma a mano)' }
  async function guardar(b: { transferenciaA?: number; feria?: boolean }) {
    setGuardando(true)
    setMsg(null)
    try {
      const r = await guardarBajadas(b)
      onGuardadas(r.reglas)
      setMsg('Guardado: vale desde la próxima venta.')
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }
  const opciones = reglas.medios?.transferencia.opciones ?? []
  return (
    <Plegable abierto={abierto} onToggle={() => setAbierto(!abierto)} titulo="Formas de pago" ayuda="A qué cuenta van las transferencias y el modo feria. Sólo lo cambia un admin.">
      <div style={{ display: 'grid', gap: space[3], maxWidth: 560 }}>
        <Field label="Las transferencias van a">
          <Select value={String(reglas.transferenciaA ?? '')} disabled={guardando} onChange={(e) => guardar({ transferenciaA: Number(e.target.value) })} style={{ maxWidth: 420 }}>
            {opciones.map((id) => (
              <option key={id} value={id}>
                {NOMBRE_TRANSF[id] ?? reglas.cuentas[id]?.nombre ?? `Cuenta ${id}`}
              </option>
            ))}
          </Select>
        </Field>
        <label style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
          <input type="checkbox" checked={reglas.feria === true} disabled={guardando} onChange={(e) => guardar({ feria: e.target.checked })} />
          <span>Modo feria: efectivo y transferencia van a las cuentas de feria, sin descuento (los precios de feria son finales)</span>
        </label>
        {msg && <span style={{ fontSize: font.sm, color: color.mut }}>{msg}</span>}
      </div>
    </Plegable>
  )
}

const horaAr = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
const diaAr = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })
const textoDiferencia = (d: number) => (d === 0 ? 'Cuadrado' : d > 0 ? `Sobran ${plata(d)}` : `Faltan ${plata(-d)}`)

/**
 * v2, W3: el TURNO PROPIO de la Caja (Bruno, 4-oct). Se abre con el fondo, se saca efectivo con
 * motivo, y se cierra contando sólo el efectivo. Sin turno abierto ⛔ se cobra. El turno de Gestión
 * Nube se deja de usar. Un día puede tener dos turnos: se cierra uno y se abre el otro.
 */
/**
 * W3b: el efectivo que entró como COBRO en Gestión Nube (el pedido web que se paga al retirar), ⛔ como
 * venta en el local. Suma al efectivo que tiene que haber: la plata está en el cajón (Bruno, 4-oct).
 */
function CobrosGN({ r }: { r: ResumenTurno }) {
  if (r.cobrosGN === null) {
    return <span style={{ color: color.warning }}>No se pudieron leer los cobros de Gestión Nube: el efectivo de la caja no los incluye.</span>
  }
  if (r.cobrosGN.length === 0) return null
  return (
    <div style={{ display: 'grid', gap: space[0.5] }}>
      <span>
        {r.cobrosGN.length === 1 ? 'Un cobro' : `${r.cobrosGN.length} cobros`} en efectivo cargado{r.cobrosGN.length === 1 ? '' : 's'} en Gestión Nube (pedidos, no ventas del local):{' '}
        <b>{plata(r.efectivo.cobradoGN)}</b> — suman al efectivo de la caja.
      </span>
      {r.cobrosGN.map((c) => (
        <span key={c.id} style={{ color: color.mut }}>
          {horaAr(c.en)} · {c.venta ? `venta #${c.venta}` : 'venta'}{c.tn ? ` (pedido #${c.tn})` : ''}{c.cliente ? ` · ${c.cliente}` : ''} · {plata(c.monto)}
        </span>
      ))}
    </div>
  )
}

function TurnoCaja({ turno, ultimos, onCambio, onCerrado }: { turno: Turno | null; ultimos: Turno[]; onCambio: (t?: Turno) => void; onCerrado: () => void }) {
  const [fondo, setFondo] = useState('')
  const [modo, setModo] = useState<'nada' | 'salida' | 'cerrar'>('nada')
  const [monto, setMonto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [contado, setContado] = useState('')
  const [nota, setNota] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cerrado, setCerrado] = useState<Turno | null>(null)
  const [verDetalle, setVerDetalle] = useState(false)
  const [verUltimos, setVerUltimos] = useState(false)

  async function hacer(f: () => Promise<void>) {
    setTrabajando(true)
    setError(null)
    try {
      await f()
    } catch (e) {
      setError((e as Error).message)
      onCambio(undefined)
    } finally {
      setTrabajando(false)
    }
  }

  const ultimosPlegable = ultimos.length > 0 && (
    <Plegable abierto={verUltimos} onToggle={() => setVerUltimos(!verUltimos)} titulo="Últimos turnos" ayuda="Los turnos cerrados: el efectivo que tenía que haber, el que se contó y la diferencia.">
      <div style={{ display: 'grid', gap: space[1], fontSize: font.sm }}>
        {ultimos.map((t) => (
          <div key={t.id} style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', borderTop: `1px solid ${color.line}`, paddingTop: space[1] }}>
            <span style={{ minWidth: 160 }}>
              {diaAr(t.abierto_en)} {horaAr(t.abierto_en)}–{t.cerrado_en ? horaAr(t.cerrado_en) : ''}
            </span>
            <span style={{ color: color.mut, minWidth: 110 }}>{t.abierto_por ?? ''}</span>
            <span>Esperado {plata(Number(t.esperado))}</span>
            <span>Contado {plata(Number(t.contado))}</span>
            <b>{textoDiferencia(t.resumen?.diferencia ?? Number(t.contado) - Number(t.esperado))}</b>
            {t.nota && <span style={{ color: color.mut }}>«{t.nota}»</span>}
          </div>
        ))}
      </div>
    </Plegable>
  )

  if (!turno) {
    const fondoN = aNumero(fondo)
    return (
      <>
        {cerrado && (
          <Notice tone={cerrado.resumen?.diferencia ? 'warning' : 'success'}>
            Turno cerrado a las {cerrado.cerrado_en ? horaAr(cerrado.cerrado_en) : ''}: tenía que haber {plata(Number(cerrado.esperado))} en efectivo, se
            contaron {plata(Number(cerrado.contado))}. <b>{textoDiferencia(cerrado.resumen?.diferencia ?? 0)}</b>.
          </Notice>
        )}
        <SectionCard title="Abrir turno">
          <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field label="Fondo: el efectivo con que arranca la caja">
              <Input value={fondo} onChange={(e) => setFondo(e.target.value)} inputMode="decimal" placeholder="$" style={{ maxWidth: 200 }} />
            </Field>
            <Button
              tone="success"
              loading={trabajando}
              disabled={fondoN == null || fondoN < 0}
              onClick={() =>
                hacer(async () => {
                  const r = await abrirTurno(fondoN as number)
                  setFondo('')
                  setCerrado(null)
                  onCambio(r.turno)
                })
              }
            >
              Abrir turno
            </Button>
          </div>
          <p style={{ margin: `${space[2]} 0 0`, color: color.mut, fontSize: font.sm }}>Sin un turno abierto la Caja no cobra.</p>
          {error && <Notice tone="danger">{error}</Notice>}
        </SectionCard>
        {ultimosPlegable}
      </>
    )
  }

  const r = turno.resumen
  const contadoN = aNumero(contado)
  const montoN = aNumero(monto)
  return (
    <>
      <SectionCard
        title={`Turno abierto desde las ${horaAr(turno.abierto_en)}`}
        actions={
          <div style={{ display: 'flex', gap: space[2] }}>
            <Button size="sm" variant="outline" onClick={() => setModo(modo === 'salida' ? 'nada' : 'salida')}>
              Cargar salida
            </Button>
            <Button size="sm" variant="outline" onClick={() => setModo(modo === 'cerrar' ? 'nada' : 'cerrar')}>
              Cerrar turno
            </Button>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: space[2], fontSize: font.sm }}>
          <div style={{ display: 'flex', gap: space[4], flexWrap: 'wrap' }}>
            <span>Abrió {turno.abierto_por ?? ''}</span>
            {r && <span>{r.ventas === 1 ? '1 venta' : `${r.ventas} ventas`} · {plata(r.total)}</span>}
            {r && (
              <b>Efectivo en la caja: {plata(r.efectivo.esperado)}</b>
            )}
            {r && (
              <button
                onClick={() => setVerDetalle(!verDetalle)}
                style={{ height: 'auto', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: color.mut, fontSize: font.sm }}
              >
                {verDetalle ? '▾ Ocultar detalle' : '▸ Ver detalle'}
              </button>
            )}
          </div>
          {r && verDetalle && (
            <div style={{ display: 'grid', gap: space[1], maxWidth: 560 }}>
              {r.porCuenta.map((c) => (
                <div key={c.cuenta} style={{ display: 'flex', gap: space[3], borderTop: `1px solid ${color.line}`, paddingTop: space[1] }}>
                  <span style={{ flex: 1 }}>{c.nombre}</span>
                  <span style={{ color: color.mut }}>{c.cobros === 1 ? '1 cobro' : `${c.cobros} cobros`}</span>
                  <b style={{ minWidth: 110, textAlign: 'right' }}>{plata(c.monto)}</b>
                </div>
              ))}
              <div style={{ borderTop: `2px solid ${color.line}`, paddingTop: space[1], display: 'grid', gap: space[0.5] }}>
                <span>
                  Fondo {plata(r.efectivo.fondo)} + efectivo cobrado {plata(r.efectivo.cobrado)}
                  {r.efectivo.cobradoGN > 0 && <> + cobrado en Gestión Nube {plata(r.efectivo.cobradoGN)}</>} − salidas {plata(r.efectivo.salidas)}
                </span>
                <b>= efectivo que tiene que haber: {plata(r.efectivo.esperado)}</b>
              </div>
              {(turno.salidas ?? []).map((m) => (
                <span key={m.id} style={{ color: color.mut }}>
                  Salida {horaAr(m.creado_en)} · {plata(m.monto)} · {m.motivo} {m.usuario ? `(${m.usuario})` : ''}
                </span>
              ))}
            </div>
          )}
          {r && r.esperando.length > 0 && (
            <span style={{ color: color.warning }}>
              {r.esperando.length === 1 ? 'Una venta espera' : `${r.esperando.length} ventas esperan`} la transferencia: no suma hasta que llegue.
            </span>
          )}
          {r && r.sinGN.length > 0 && (
            <span style={{ color: color.warning }}>
              {r.sinGN.length === 1 ? 'Una venta cobrada todavía no está' : `${r.sinGN.length} ventas cobradas todavía no están`} en Gestión Nube (suman al turno igual).
            </span>
          )}
          {r && <CobrosGN r={r} />}

          {modo === 'salida' && (
            <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-end', flexWrap: 'wrap', borderTop: `1px solid ${color.line}`, paddingTop: space[2] }}>
              <Field label="Monto">
                <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="$" style={{ maxWidth: 160 }} />
              </Field>
              <Field label="Motivo">
                <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Retiro para gerencia, compra de…" style={{ minWidth: 260 }} />
              </Field>
              <Button
                loading={trabajando}
                disabled={montoN == null || montoN <= 0 || !motivo.trim()}
                onClick={() =>
                  hacer(async () => {
                    const x = await sacarEfectivo(montoN as number, motivo.trim())
                    setMonto('')
                    setMotivo('')
                    setModo('nada')
                    onCambio(x.turno)
                  })
                }
              >
                Registrar salida
              </Button>
            </div>
          )}

          {modo === 'cerrar' && r && (
            <div style={{ display: 'grid', gap: space[2], borderTop: `1px solid ${color.line}`, paddingTop: space[2], maxWidth: 560 }}>
              <span>Contá el efectivo de la caja (con el fondo incluido) y escribí cuánto hay.</span>
              <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <Field label="Efectivo contado">
                  <Input value={contado} onChange={(e) => setContado(e.target.value)} inputMode="decimal" placeholder="$" style={{ maxWidth: 180 }} />
                </Field>
                <Field label="Nota (opcional)">
                  <Input value={nota} onChange={(e) => setNota(e.target.value)} style={{ minWidth: 240 }} />
                </Field>
              </div>
              {contadoN != null && contadoN >= 0 && (
                <span>
                  Tiene que haber {plata(r.efectivo.esperado)} ⇒ <b>{textoDiferencia(Math.round((contadoN - r.efectivo.esperado) * 100) / 100)}</b>
                </span>
              )}
              {r.cobrosGN !== null && r.cobrosGN.length > 0 && <CobrosGN r={r} />}
              {r.cobrosGN === null && <span style={{ color: color.warning }}>Al cerrar se vuelven a leer los cobros de Gestión Nube: si sigue sin contestar, el cierre queda sin ellos.</span>}
              {r.esperando.length > 0 && <span style={{ color: color.warning }}>Hay transferencias esperando: si llegan después del cierre, quedan en este turno pero no en el cierre.</span>}
              <div>
                <Button
                  tone="success"
                  loading={trabajando}
                  disabled={contadoN == null || contadoN < 0}
                  onClick={() =>
                    hacer(async () => {
                      const x = await cerrarTurno(turno.id, contadoN as number, nota.trim())
                      setContado('')
                      setNota('')
                      setModo('nada')
                      setCerrado(x.turno)
                      onCerrado()
                    })
                  }
                >
                  Cerrar turno
                </Button>
              </div>
            </div>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
      </SectionCard>
      {ultimosPlegable}
    </>
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
