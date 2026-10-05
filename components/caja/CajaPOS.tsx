'use client'

/**
 * El POS de la Caja (`/pos`, fase C, Bruno 5-oct): una pantalla con SOLO el cobro, sin el menú del
 * monitor, con el formato del POS de Gestión Nube. Izquierda: escanear o buscar, con las prendas en
 * tarjetas. Derecha, fija: el pedido, el total y «Continuar al cobro» (Alt+C).
 *
 * 🔑 **Lo usa sólo la cuenta que abrió la caja** (`puedeUsarPOS`, la MISMA regla que el servidor en
 * `confirmar` y `contar`: sin el servidor, se salta con `curl`). ⛔ Ni un admin. Se entra con
 * «Abrir POS» de la pestaña Caja, que queda como el informativo del turno. La caja se cierra desde
 * los dos lados: acá («Cerrar caja») y en la pestaña.
 *
 * ⛔ No es una ruta de Next: es una rama de `app/[[...seccion]]/page.tsx`, como el panel de WhatsApp
 * (cada ruta es una función y el tope de Hobby está lleno).
 *
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
import { traerAudit } from '@/lib/tn-audit'
import type { ProductoFchk } from '@/lib/tncat/tipos'
import { avisar as avisarSiempre, prepararSonido, type Aviso } from '@/lib/sonido'
import { MSJ_FERIA, NOMBRE_MEDIO, cobro, cuentaDeMedio, idsDeFeria, nombreParaTicket, pagosDeMedio, pesosDeRebaja, renglones, subtotalDeFeria } from '@/lib/caja/core.core.js'
import { hoyIso, promosDe } from '@/lib/agenda'
import { useAgenda } from '@/store/useAgenda'
import { palabrasDeBusqueda } from '@/lib/caja/buscar.core.js'
import { avisoDeRenglon } from '@/lib/caja/pedidos-web.core.js'
import { billetesDe } from '@/lib/caja/conteo.core.js'
import { puedeUsarPOS } from '@/lib/caja/cierre.core.js'
import { imprimirTicket, plata, type DatosTicket } from '@/lib/caja/ticket'
import {
  buscarNombre,
  buscarProducto,
  confirmarVenta,
  elegirVariante,
  leerConfig,
  leerPendientes,
  leerTurno,
  leerPedidosWeb,
  type Candidato,
  type Config,
  type ListaNombre,
  type ProductoLista,
  type Medio,
  type PedidosWeb,
  type Rebaja,
  type Reglas,
  type Stock,
  type Turno,
  type Variante,
  type Venta,
} from '@/lib/caja/cliente'
import { Badge, Button, ButtonLink, Card, Field, Icono, Input, Modal, Notice, SectionCard, color, font, radius, shadow, space, weight } from '@/components/ui'
import { useConfirmar } from '@/components/ui/Confirm'
import {
  CampoRebaja,
  EsperaTransferencia,
  FilaRenglon,
  ElegirVariante,
  GrillaProductos,
  ListaPrendas,
  MEDIOS,
  PedidosWebSinArmar,
  ResumenCobro,
  SiNo,
  AvisoCierre,
  DeteccionTransferencias,
  ModalesTurno,
  UltimaVenta,
  VariosPagos,
  aNumero,
  claveDe,
  horaAr,
  type PagoUI,
  type Renglon,
} from '@/components/caja/partes'

type Borrador = { id: string; renglones: Renglon[]; email: string; descuentoVenta?: Rebaja | null }

const CLAVE = 'caja:borrador:zattia'

/** El color y el ícono de cada forma de pago en el cobro, como las tarjetas del POS de GN. */
const ESTILO_MEDIO: Record<Medio, { icono: 'efectivo' | 'transferencia' | 'tarjeta'; fondo: string; tinta: string }> = {
  efectivo: { icono: 'efectivo', fondo: color.successBg, tinta: color.successInk },
  transferencia: { icono: 'transferencia', fondo: color.brandBg, tinta: color.brand },
  debito: { icono: 'tarjeta', fondo: color.warningBg, tinta: color.warningInk },
  credito: { icono: 'tarjeta', fondo: color.bg2, tinta: color.ink2 },
}
const nuevoId = () => crypto.randomUUID()
/** Un número al texto que lee `aNumero`: el punto es de miles, la coma es decimal. */
const aTexto = (n: number) => String(n).replace('.', ',')
/** Los billetes redondos con que suele pagar, arriba de lo que va en efectivo (hasta tres). */
const billetesRapidos = (efectivo: number) => [...new Set([10000, 20000, 50000].map((b) => Math.ceil(efectivo / b) * b))].filter((v) => v > efectivo).slice(0, 3)
/** El instante de impresión: el ticket lo sella con la hora de Argentina. */
const ahora = () => Date.now()

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

/** La última lista de pedidos web (W1), para mostrarla al cargar mientras llega la nueva. */
const CLAVE_PEDIDOS = 'caja:pedidos-web:zattia'
/** «Con sonido / Sin sonido» de esta computadora (Bruno, 4-oct): el pitido y la voz de cada escaneo. */
const CLAVE_SONIDO = 'caja:sonido'

function POS() {
  const { perfil } = useSesion()
  const promos = useAgenda((st) => st.promos)
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
  // El producto cuyo modal «Elegir variante» está abierto.
  const [eligiendo, setEligiendo] = useState<ProductoLista | null>(null)
  const vuelta = useRef(0)
  const [enviando, setEnviando] = useState(false)
  const [ultima, setUltima] = useState<{ venta: Venta; ticket: DatosTicket } | null>(null)
  const [pendientes, setPendientes] = useState<Venta[]>([])
  const scanRef = useRef<HTMLInputElement>(null)

  const enfocar = () => setTimeout(() => scanRef.current?.focus(), 0)

  // 🔑 Desde 2 caracteres con alguna LETRA (Bruno, 5-oct: «que no sea necesario apretar Enter»): el
  // lector tipea números y ⛔ tiene que abrir la lista.
  useEffect(() => {
    const n = ++vuelta.current
    const q = codigo.trim()
    if (q.length < 2 || !palabrasDeBusqueda(q).length) return
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
  const [, setUltimosTurnos] = useState<Turno[]>([])
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
    () => promosDe(promos, hoyIso(), { canal: 'mostrador', marca: 'zattia' }).filter((p) => p.medio === 'credito' && p.beneficio.tipo === 'descuento'),
    [promos],
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

  // 🔑 La foto del COLOR (Bruno, 5-oct): Tienda Nube trae la foto de cada variante con su SKU, que es el
  // mismo de GN. Sin foto propia, la del producto.
  const [fotoSku, setFotoSku] = useState<Record<string, string>>({})
  useEffect(() => {
    let vivo = true
    traerAudit<ProductoFchk>('zattia', { variantes: true })
      .then((ps) => {
        const m: Record<string, string> = {}
        for (const p of ps) for (const v of p.variantes ?? []) if (v.sku && v.image_url) m[v.sku.toLowerCase().trim()] = v.image_url
        if (vivo) setFotoSku(m)
      })
      .catch(() => {
        /* sin el detalle de TN, la foto del producto */
      })
    return () => {
      vivo = false
    }
  }, [])
  const fotoDe = useCallback(
    (v: Variante) => (v.sku && fotoSku[v.sku.toLowerCase().trim()]) || precioYFoto(v.product_id).foto,
    [fotoSku, precioYFoto],
  )

  function agregar(variante: Variante, stock: Stock) {
    setBor((b) => {
      const i = b.renglones.findIndex((r) => claveDe(r.variante) === claveDe(variante))
      if (i >= 0) {
        const rs = b.renglones.slice()
        rs[i] = { ...rs[i], stock, cantidad: rs[i].cantidad + 1 }
        return { ...b, renglones: rs }
      }
      return { ...b, renglones: [...b.renglones, { variante, stock, cantidad: 1, rebaja: null, ...precioYFoto(variante.product_id), foto: fotoDe(variante) }] }
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
    setEligiendo(null)
    await escanear('', v)
  }
  /** Una tarjeta de producto: con una sola variante va directo al pedido; si no, el modal. */
  function elegirProducto(p: ProductoLista) {
    if (p.variantes.length === 1) void elegirCandidato(p.variantes[0])
    else setEligiendo(p)
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
  const respuestas = { promoCreditoHoy: promoCredito.length > 0, esDelBanco: esDelBanco === true, seisCuotas: seisCuotas === true }
  const cuentaDe = (medio: Medio, rg: Reglas) => cuentaDeMedio(medio, { reglas: rg, total: aPagar ?? 0, ...respuestas })
  // 🔑 Productos de feria trabados (Bruno, 5-oct): la MISMA regla que exige el servidor (`exigirFeria`).
  const feriaIds = useMemo(() => idsDeFeria(reglas), [reglas])
  const hayFeria = !!filas && subtotalDeFeria(filas, reglas) > 0
  /** Los pagos de UNA forma de pago: con prendas de feria, la parte de feria va a su cuenta. */
  const pagosDe = (medio: Medio, rg: Reglas) => (filas ? pagosDeMedio(medio, { filas, reglas: rg, total: aPagar ?? 0, ...respuestas }) : [{ cuenta: cuentaDe(medio, rg) }])

  /** El total de cada forma de pago pagando todo con ella: lo que muestran las tarjetas. */
  const totalPorMedio = (() => {
    const m: Partial<Record<Medio, number>> = {}
    if (!filas || !reglas?.medios) return m
    for (const medio of MEDIOS) {
      try {
        m[medio] = cobro({ filas, pagos: pagosDe(medio, reglas), reglas, descuentoVenta }).total
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
      // Un solo pago: el armado de la forma de pago (con la traba de feria). Varios: lo que repartió la cajera.
      const pedidos = !varios
        ? pagosDe(pagos[0].medio as Medio, rg)
        : pagos.map((p, i) => {
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
      logo: config?.ticket_logo ?? null,
      cliente: venta.email,
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
      setEnCobro(false)
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

  // ── Fase C: el POS ──
  const { confirmar: preguntar } = useConfirmar()
  const [enCobro, setEnCobro] = useState(false)
  // «Contar billetes», «Cargar salida» y «Cerrar turno» abren SÓLO su modal (Bruno, 5-oct: la tarjeta del
  // turno repetida arriba duplicaba la información de la pestaña).
  const [panelTurno, setPanelTurno] = useState<null | 'contar' | 'salida' | 'cerrar'>(null)
  const [cerradoAca, setCerradoAca] = useState<Turno | null>(null)

  // Sin el shell, las promos de la Agenda (la del crédito de hoy) las pide el POS.
  const cargarAgenda = useAgenda((st) => st.cargar)
  useEffect(() => {
    void cargarAgenda()
  }, [cargarAgenda])

  const prendas = bor.renglones.reduce((s, r) => s + r.cantidad, 0)
  const puedeCobrar = bor.renglones.length > 0 && !sinPrecio
  // Si el pedido se vacía o queda una prenda sin precio, se vuelve al pedido.
  const mostrarCobro = enCobro && puedeCobrar
  // Alt+C: «Continuar al cobro», como el POS de GN.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!e.altKey || e.code !== 'KeyC' || !puedeCobrar) return
      e.preventDefault()
      setEnCobro(true)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [puedeCobrar])

  async function vaciar() {
    if (!(await preguntar({ titulo: 'Vaciar pedido', mensaje: `Se ${prendas === 1 ? 'saca la prenda' : `sacan las ${prendas} prendas`} del pedido. No se cobró nada.`, ok: 'Vaciar pedido', tono: 'warning' }))) return
    // El id ⛔ se renueva: ⛔ se mandó nada con él.
    setBor((b) => ({ ...b, renglones: [], email: '', descuentoVenta: null }))
    setEnCobro(false)
    enfocar()
  }

  const marco = (hijos: React.ReactNode) => <div style={{ minHeight: '100vh', background: color.bg, padding: space[4], display: 'grid', placeItems: 'start center' }}>{hijos}</div>
  if (errCarga) return marco(<Notice tone="danger">{errCarga}</Notice>)
  if (turno === undefined) return marco(errTurno ? <Notice tone="danger">No se pudo leer el turno: {errTurno}</Notice> : <span style={{ color: color.mut }}>Abriendo la caja…</span>)
  if (!turno) {
    return marco(
      <div style={{ display: 'grid', gap: space[3], maxWidth: 560 }}>
        {cerradoAca && <AvisoCierre t={cerradoAca} />}
        <Notice tone="warning">Sin turno abierto: el POS ⛔ cobra. Abrir turno desde la pestaña Caja.</Notice>
        <div>
          <ButtonLink href="/caja" variant="solid" tone="brand">
            Ir a la Caja
          </ButtonLink>
        </div>
      </div>,
    )
  }
  if (!puedeUsarPOS(turno, perfil)) {
    return marco(
      <div style={{ display: 'grid', gap: space[3], maxWidth: 560 }}>
        <Notice tone="warning">Turno de {turno.abierto_por ?? 'otra cuenta'}: POS sólo para esa cuenta.</Notice>
        <div>
          <ButtonLink href="/caja" iconLeft={<Icono nombre="atras" />}>
            Caja
          </ButtonLink>
        </div>
      </div>,
    )
  }

  const sinLlegar = pendientes.filter((v) => v.estado !== 'esperando_pago').length

  return (
    <div style={{ minHeight: '100vh', background: color.bg }}>
      {/* La izquierda se estira; la derecha (el pedido) queda fija a la vista, con el total siempre abajo.
          En el teléfono, una abajo de la otra. La cabecera mide 56 px: el pedido se calcula contra eso. */}
      <style>{`
        .pos-top { display: flex; align-items: center; flex-wrap: wrap; gap: ${space[2]}px ${space[3]}px; min-height: 56px; padding: ${space[2]}px ${space[4]}px; background: ${color.sideBg}; color: ${color.sideInk}; }
        .pos-top .pos-tbtn { height: 36px; padding: 0 ${space[3]}px; border-radius: ${radius.md}px; border: 1px solid ${color.sideLine}; background: transparent; color: ${color.sideInk}; font-size: ${font.base}px; font-weight: ${weight.semibold}; white-space: nowrap; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: ${space[2]}px; }
        .pos-top .pos-tbtn:hover { background: ${color.sideHover}; }
        .pos-top .pos-tbtn.icono { width: 36px; padding: 0; }
        .pos-top .pos-tbtn[aria-pressed="true"] { color: ${color.sideAccent}; border-color: ${color.sideAccent}; }
        .pos-top .pos-tbtn.peligro { color: ${color.dangerBorder}; border-color: ${color.dangerBorder}; }
        .pos-grid { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: ${space[4]}px; padding: ${space[4]}px; align-items: start; }
        .pos-der { position: sticky; top: ${space[4]}px; max-height: calc(100vh - 56px - ${2 * space[4]}px); display: flex; flex-direction: column; min-height: 0; }
        .pos-renglones { flex: 1; min-height: 0; overflow: auto; }
        .caja-tarjeta { transition: border-color .12s, box-shadow .12s; }
        .caja-tarjeta:hover, .caja-tarjeta:focus-visible { border-color: ${color.brandBorder} !important; box-shadow: ${shadow.md}; }
        .caja-sacar:hover { background: ${color.dangerBg} !important; color: ${color.danger} !important; }
        .pos-buscar { position: relative; flex: 1; min-width: 0; }
        .pos-buscar svg { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: ${color.mut}; pointer-events: none; }
        .cobro-grid { display: grid; grid-template-columns: minmax(260px, 340px) minmax(0, 1fr); gap: ${space[4]}px; }
        @media (max-width: 1100px) { .pos-grid { grid-template-columns: minmax(0, 1fr) 360px; } .pos-turno { display: none; } }
        @media (max-width: 900px) { .cobro-grid { grid-template-columns: 1fr; } }
        @media (max-width: 860px) { .pos-grid { grid-template-columns: 1fr; } .pos-der { position: static; max-height: none; } }
      `}</style>
      <header className="pos-top">
        <ButtonLink href="/caja" className="pos-tbtn icono" aria-label="Volver" title="Volver" style={{ height: 36 }}>
          <Icono nombre="atras" size={18} />
        </ButtonLink>
        {/* El chip de la marca (prototipo del 5-oct). El POS es sólo de Zattia: multimarca es otra fase. */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 28, padding: '0 11px 0 5px', borderRadius: radius.pill, background: color.brandBg, color: color.brand, fontWeight: weight.bold, fontSize: font.base, whiteSpace: 'nowrap' }}>
          <b style={{ width: 19, height: 19, borderRadius: radius.pill, background: color.brand, color: color.brandBg, display: 'grid', placeItems: 'center', fontSize: font.xs }}>Z</b>
          Caja Zattia
        </span>
        <span className="pos-turno" style={{ fontSize: font.base, color: color.sideInk2, whiteSpace: 'nowrap' }}>
          turno desde {horaAr(turno.abierto_en)} · {turno.abierto_por ?? ''}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="pos-tbtn icono"
            onClick={() => cambiarSonido(!conSonido)}
            aria-pressed={conSonido}
            aria-label={conSonido ? 'Con sonido' : 'Sin sonido'}
            title={conSonido ? 'Con sonido' : 'Sin sonido'}
            style={{ height: 36 }}
          >
            <Icono nombre={conSonido ? 'sonido' : 'silencio'} size={18} />
          </button>
          <button type="button" className="pos-tbtn" onClick={() => setPanelTurno('contar')} style={{ height: 36 }}>
            Contar billetes
          </button>
          <button type="button" className="pos-tbtn" onClick={() => setPanelTurno('salida')} style={{ height: 36 }}>
            Cargar salida
          </button>
          <button type="button" className="pos-tbtn peligro" onClick={() => setPanelTurno('cerrar')} style={{ height: 36 }}>
            Cerrar turno
          </button>
        </div>
      </header>

      <ModalesTurno
        que={panelTurno}
        turno={turno}
        billetes={billetesDe(config?.reglas)}
        onCerrar={() => setPanelTurno(null)}
        onCambio={(t) => {
          setPanelTurno(null)
          setTurno(t)
        }}
        onCerrado={(t) => {
          setCerradoAca(t)
          setPanelTurno(null)
          setTurno(null)
        }}
      />

      <div className="pos-grid">
        <div style={{ display: 'grid', gap: space[4], minWidth: 0 }}>
          {pendientes
            .filter((v) => v.estado === 'esperando_pago')
            .map((v) => (
              <EsperaTransferencia key={v.id} venta={v} onLlego={llegoTransferencia} onCambio={refrescarPendientes} />
            ))}
          {sinLlegar > 0 && (
            <Notice tone="danger">
              Cobradas sin llegar a Gestión Nube: {sinLlegar}. Reintentar desde la pestaña Caja.
            </Notice>
          )}
          <PedidosWebSinArmar datos={pedidosWeb} error={errPedidos} />

          {ultima && (
            <UltimaVenta
              venta={ultima.venta}
              onReimprimir={() => imprimirTicket(ultima.ticket, esEfectivo, ahora())}
              onOtra={() => {
                setUltima(null)
                enfocar()
              }}
            />
          )}

          {mostrarCobro && (
            <Modal
              abierto
              onCerrar={() => setEnCobro(false)}
              titulo="Cobro de la venta"
              ancho="xl"
              cerrarConFondo={false}
              pie={
                <>
                  <Button variant="outline" onClick={() => setEnCobro(false)}>
                    Volver
                  </Button>
                  <Button size="lg" tone="success" variant="solid" disabled={!puedeConfirmar} loading={enviando} onClick={confirmar} iconLeft={<Icono nombre="check" />}>
                    Finalizar venta {c ? plata(c.total) : ''}
                  </Button>
                </>
              }
            >
              <div className="cobro-grid">
                {/* Izquierda: el resumen, como el de GN. */}
                <div style={{ display: 'grid', gap: space[3], alignContent: 'start', border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: space[4], background: color.surface }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <b style={{ fontSize: font.lg, color: color.ink }}>Resumen de la venta</b>
                    <span style={{ color: color.mut, fontSize: font.sm }}>{prendas === 1 ? '1 prenda' : `${prendas} prendas`}</span>
                  </div>
                  <div style={{ background: color.bg, borderRadius: radius.md, padding: `${space[2]}px ${space[3]}px`, color: color.ink2, fontSize: font.sm, overflowWrap: 'anywhere' }}>
                    Cliente: {bor.email.trim() || 'Consumidor final'}
                  </div>
                  <div style={{ display: 'grid', gap: space[2], fontSize: font.sm }}>
                    {bor.renglones.map((r, i) => (
                      <div key={claveDe(r.variante)} style={{ display: 'flex', justifyContent: 'space-between', gap: space[2] }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: weight.semibold, color: color.ink, textTransform: 'uppercase' }}>
                            {r.variante.product_name} {feriaIds.has(Number(r.variante.product_id)) && <Badge tone="warning">Feria</Badge>}
                          </div>
                          <div style={{ color: color.mut }}>
                            {r.variante.size_name} · ×{r.cantidad}
                          </div>
                        </div>
                        <b style={{ color: color.ink, fontVariantNumeric: 'tabular-nums' }}>{filas?.[i] ? plata(filas[i].importe) : '—'}</b>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: `1px solid ${color.line}`, paddingTop: space[2] }}>
                    {c ? (
                      <ResumenCobro c={c} nombreCuenta={nombreCuenta} />
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.md }}>
                        <span>Subtotal</span>
                        <span>{aPagar != null ? plata(aPagar) : '—'}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Derecha: las formas de pago, con la cuenta debajo (Bruno, 5-oct). */}
                <div style={{ display: 'grid', gap: space[3], alignContent: 'start', border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: space[4], background: color.surface }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                    <div>
                      <b style={{ fontSize: font.lg, color: color.ink }}>Formas de pago</b>
                      <div style={{ color: color.mut, fontSize: font.sm }}>{varios ? 'Repartir el subtotal entre formas de pago' : 'Elegir con qué paga el total'}</div>
                    </div>
                    {!sinMedios && (
                      <Button
                        variant={varios ? 'soft' : 'outline'}
                        tone={varios ? 'brand' : 'neutral'}
                        size="sm"
                        aria-pressed={varios}
                        disabled={hayFeria && !varios}
                        title={hayFeria ? 'Con prendas de feria, un solo pago: efectivo o transferencia' : undefined}
                        onClick={() => {
                          setVarios(!varios)
                          setPagos(varios ? [{ medio: null, base: '' }] : [{ medio: pagos[0].medio, base: '' }, { medio: null, base: '' }])
                        }}
                      >
                        Varios pagos
                      </Button>
                    )}
                  </div>
                  {sinMedios ? (
                    <Notice tone="danger">Formas de pago sin cargar: correr sql/migrate-caja-medios.sql.</Notice>
                  ) : !varios ? (
                    <div style={{ display: 'grid', gap: space[2] }}>
                    {hayFeria && <Notice tone="warning">Hay prendas de feria: van a precio final. Se cobra con efectivo o transferencia; la parte de feria va a su cuenta, sin el %.</Notice>}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: space[2] }}>
                      {MEDIOS.map((medio) => {
                        const activa = pagos[0].medio === medio
                        const trabada = hayFeria && (medio === 'debito' || medio === 'credito')
                        const cuenta = reglas?.medios ? (() => { try { return cuentaDe(medio, reglas) } catch { return 0 } })() : 0
                        const regla = cuenta ? reglas?.cuentas[cuenta] : undefined
                        const estilo = ESTILO_MEDIO[medio]
                        return (
                          <button
                            key={medio}
                            type="button"
                            onClick={() => setPagos([{ medio, base: '' }])}
                            aria-pressed={activa}
                            disabled={trabada}
                            title={trabada ? MSJ_FERIA : undefined}
                            className="caja-tarjeta"
                            style={{
                              height: 'auto',
                              display: 'flex',
                              alignItems: 'center',
                              gap: space[3],
                              textAlign: 'left',
                              padding: space[3],
                              borderRadius: radius.lg,
                              border: `2px solid ${activa ? color.success : color.line}`,
                              background: activa ? color.successBg : color.surface,
                              cursor: trabada ? 'not-allowed' : 'pointer',
                              opacity: trabada ? 0.45 : 1,
                            }}
                          >
                            <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: radius.md, background: estilo.fondo, color: estilo.tinta, flexShrink: 0 }}>
                              <Icono nombre={estilo.icono} size={22} />
                            </span>
                            <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: space[0.5] }}>
                              <span style={{ fontSize: font.md, fontWeight: weight.semibold, color: color.ink }}>{NOMBRE_MEDIO[medio]}</span>
                              <span style={{ fontSize: font.xs, color: color.mut }}>{regla?.nombre ?? '—'}</span>
                              {trabada ? (
                                <span style={{ fontSize: font.xs, color: color.warningInk, fontWeight: weight.bold }}>No va con prendas de feria</span>
                              ) : (
                                regla && regla.descuento > 0 && <span style={{ fontSize: font.xs, color: color.successInk, fontWeight: weight.semibold }}>{regla.descuento}% de descuento{hayFeria ? ' (sin la feria)' : ''}</span>
                              )}
                            </span>
                            <span style={{ fontSize: font.lg, fontWeight: weight.bold, color: color.ink, fontVariantNumeric: 'tabular-nums' }}>
                              {!trabada && totalPorMedio[medio] != null ? plata(totalPorMedio[medio]) : '—'}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    </div>
                  ) : (
                    <VariosPagos pagos={pagos} setPagos={setPagos} montos={c?.pagos.map((p) => p.monto) ?? null} />
                  )}

                  {!sinMedios && (preguntaBanco || preguntaCuotas) && (
                    <div style={{ display: 'grid', gap: space[2] }}>
                      {preguntaBanco && <SiNo pregunta={`¿Es tarjeta de ${bancosPromo}?`} valor={esDelBanco} onCambio={setEsDelBanco} />}
                      {preguntaCuotas && <SiNo pregunta="¿En 6 cuotas?" valor={seisCuotas} onCambio={setSeisCuotas} />}
                    </div>
                  )}

                  {pagos.some((p) => p.medio === 'transferencia') && <DeteccionTransferencias admin={false} />}
                  {elCobro.error && <Notice tone="warning">{elCobro.error}</Notice>}

                  {c && enEfectivo > 0 && (
                    <div style={{ display: 'flex', gap: space[4], alignItems: 'end', flexWrap: 'wrap', background: color.bg, borderRadius: radius.lg, padding: space[3] }}>
                      <Field label={`Paga con (efectivo: ${plata(enEfectivo)})`}>
                        <Input inputMode="decimal" autoComplete="off" value={pagaCon} onChange={(e) => setPagaCon(e.target.value)} placeholder="$" style={{ fontSize: font.xl, fontWeight: weight.bold, height: 46, width: 180 }} />
                      </Field>
                      {/* Atajos del billete con que paga: sólo escriben el «Paga con», el vuelto lo saca la cuenta de siempre. */}
                      <div style={{ display: 'flex', gap: space[1.5], flexWrap: 'wrap' }}>
                        <Button size="sm" variant="outline" onClick={() => setPagaCon(aTexto(enEfectivo))}>
                          Justo
                        </Button>
                        {billetesRapidos(enEfectivo).map((b) => (
                          <Button key={b} size="sm" variant="outline" onClick={() => setPagaCon(aTexto(b))}>
                            {plata(b)}
                          </Button>
                        ))}
                      </div>
                      {vuelto != null && (
                        <div style={{ fontSize: font['3xl'], fontWeight: weight.heavy, fontVariantNumeric: 'tabular-nums', color: vuelto < 0 ? color.danger : color.successInk }}>
                          {vuelto < 0 ? `Faltan ${plata(-vuelto)}` : `Vuelto ${plata(vuelto)}`}
                        </div>
                      )}
                    </div>
                  )}
                  {!emailOk && <Notice tone="warning">Mail del pedido inválido.</Notice>}
                </div>
              </div>
            </Modal>
          )}
          <SectionCard title="Escanear o buscar" actions={<span style={{ fontSize: font.sm, color: color.mut }}>Variantes: ↑/↓ y Enter</span>}>
              {/* 🔴 Sin <form>: el Enter del lector lo toma el campo. Con un form, el botón «Agregar» en
                  `loading` (deshabilitado) hacía que el navegador IGNORE el Enter, y el segundo escaneo
                  quedaba escrito sin entrar (visto en prod, 4-oct). */}
              <div style={{ display: 'flex', gap: space[2] }}>
                <label className="pos-buscar">
                <Icono nombre="lupa" size={20} />
                <Input
                  ref={scanRef}
                  autoFocus
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    // Con la lista de ESTE texto a la vista y un solo producto, el Enter abre «Elegir
                    // variante». Si no (el lector, o la lista todavía ⛔ llegó), busca por código primero.
                    const una = sugeridas && sugeridas.q === codigo.trim() && sugeridas.conStock.length === 1 && !sugeridas.sinStock.length && !sugeridas.masCon
                    if (una) elegirProducto(sugeridas.conStock[0])
                    else escanear(codigo)
                  }}
                  placeholder="Código de barras, SKU o nombre y talle"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-label="Código de barras, SKU o nombre y talle"
                  style={{ fontSize: font.xl, width: '100%', height: 52, paddingLeft: 44, borderRadius: radius.xl }}
                />
                </label>
                <Button tone="brand" variant="solid" onClick={() => escanear(codigo)} loading={buscando > 0} style={{ height: 52 }}>
                  Agregar
                </Button>
              </div>
              {aviso && (
                <div style={{ marginTop: space[3] }}>
                  <Notice tone={aviso.tono}>{aviso.texto}</Notice>
                </div>
              )}
              {/* Sin lista a la vista: qué se puede hacer acá (prototipo del 5-oct). */}
              {!(sugeridas && sugeridas.q === codigo.trim()) && !candidatos && !aviso && (
                <div style={{ display: 'grid', justifyItems: 'center', textAlign: 'center', gap: space[1.5], padding: `${space[6]}px ${space[4]}px ${space[5]}px`, color: color.mut, fontSize: font.base }}>
                  <span style={{ color: color.mut2 }}>
                    <Icono nombre="etiquetas" size={40} />
                  </span>
                  <strong style={{ color: color.ink2, fontSize: font.lg }}>Escanear la etiqueta o escribir el nombre</strong>
                  <span>La lista aparece sola desde 2 letras. Con el lector, Enter agrega.</span>
                </div>
              )}
              {sugeridas && sugeridas.q === codigo.trim() && !candidatos && (
                <GrillaProductos
                  feria={feriaIds}
                  con={sugeridas.conStock}
                  masCon={sugeridas.masCon}
                  sin={sugeridas.sinStock}
                  masSin={sugeridas.masSin}
                  verSin={verSinStock}
                  onVerSin={() => setVerSinStock(true)}
                  precioYFoto={precioYFoto}
                  onElegir={elegirProducto}
                />
              )}
              {eligiendo && (
                <ElegirVariante
                  producto={eligiendo}
                  precio={precioYFoto(eligiendo.product_id).precio}
                  fotoDe={fotoDe}
                  onElegir={elegirCandidato}
                  onCerrar={() => {
                    setEligiendo(null)
                    enfocar()
                  }}
                />
              )}
              {candidatos && (
                <ListaPrendas
                  grilla
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
        </div>

        <div className="pos-der">
          {/* El pedido (prototipo del 5-oct): los renglones se desplazan y el pie —mail, total y «Continuar al
              cobro»— queda siempre a la vista. */}
          <Card style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[3], padding: `${space[3]}px ${space[4]}px`, borderBottom: `1px solid ${color.line}` }}>
              <h2 style={{ margin: 0, fontSize: font.lg, fontWeight: weight.bold, color: color.ink }}>{`Pedido · ${prendas === 1 ? '1 prenda' : `${prendas} prendas`}`}</h2>
              {bor.renglones.length > 0 && (
                <Button size="sm" variant="ghost" onClick={vaciar}>
                  Vaciar pedido
                </Button>
              )}
            </div>
            <div className="pos-renglones" style={{ padding: `0 ${space[4]}px` }}>
              {bor.renglones.length === 0 ? (
                <div style={{ padding: `${space[6]}px 0`, textAlign: 'center', color: color.mut, fontSize: font.base }}>Pedido vacío: escanear o buscar una prenda.</div>
              ) : (
                bor.renglones.map((r, i) => (
                  <FilaRenglon
                    key={claveDe(r.variante)}
                    r={r}
                    feria={feriaIds.has(Number(r.variante.product_id))}
                    cargandoPrecios={!datos || !tnIdx}
                    onCantidad={(n) => (n <= 0 ? sacarRenglon(i) : cambiarRenglon(i, { cantidad: n }))}
                    onPrecio={(p) => cambiarRenglon(i, { precio: p })}
                    onRebaja={(rb) => cambiarRenglon(i, { rebaja: rb })}
                    importe={filas?.[i]?.importe ?? null}
                    onSacar={() => sacarRenglon(i)}
                    avisoWeb={avisoWeb(r.variante, r.stock, r.cantidad)}
                    mirandoWeb={!pedidosWeb && !errPedidos}
                  />
                ))
              )}
            </div>
            {bor.renglones.length > 0 && (
              <div style={{ flexShrink: 0, display: 'grid', gap: space[2], padding: `${space[3]}px ${space[4]}px ${space[4]}px`, borderTop: `1px solid ${color.line}`, background: color.bg }}>
                <Field label="Mail para el ticket (opcional)">
                  <Input type="email" autoComplete="off" spellCheck={false} value={bor.email} invalid={!emailOk} onChange={(e) => setBor((b) => ({ ...b, email: e.target.value }))} placeholder="nombre@mail.com" />
                </Field>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.md, color: color.ink2 }}>
                  <span>Subtotal</span>
                  <b style={{ fontVariantNumeric: 'tabular-nums' }}>{filas ? plata(filas.reduce((s, f) => s + f.importe, 0)) : '—'}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                  <span style={{ color: color.mut }}>Descuento</span>
                  <CampoRebaja valor={descuentoVenta} onCambio={(rb) => setBor((b) => ({ ...b, descuentoVenta: rb }))} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: space[2], borderTop: `1px dashed ${color.line2}` }}>
                  <span style={{ fontWeight: weight.heavy, fontSize: font.md, letterSpacing: '.05em', color: color.ink }}>TOTAL</span>
                  <span style={{ fontSize: 36, fontWeight: weight.heavy, letterSpacing: '-.02em', lineHeight: 1, color: color.brand, fontVariantNumeric: 'tabular-nums' }}>
                    {mostrarCobro && c ? plata(c.total) : aPagar != null ? plata(aPagar) : '—'}
                  </span>
                </div>
                {!mostrarCobro && <span style={{ color: color.mut, fontSize: font.sm }}>El descuento de la forma de pago se ve al cobrar.</span>}
                {sinPrecio && <Notice tone="warning">Prenda sin precio: escribirlo en el renglón.</Notice>}
                {!mostrarCobro && (
                  <Button size="lg" tone="success" variant="solid" fullWidth disabled={!puedeCobrar} onClick={() => setEnCobro(true)} style={{ height: 52 }}>
                    Continuar al cobro <span style={{ fontSize: font.xs, fontWeight: weight.semibold, border: '1px solid currentColor', opacity: 0.85, borderRadius: 5, padding: '1px 6px', marginLeft: space[1] }}>Alt+C</span>
                  </Button>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

/**
 * El POS es de Zattia: el precio sale de los datos de la marca del monitor, y sin el shell nadie la
 * elige. ⛔ Se monta antes de que la marca sea Zattia: cargaría los datos de la otra (el payload de
 * BDI pesa ~15 MB) y los precios saldrían de ahí.
 */
export function CajaPOS() {
  const { marca, setMarca } = useSesion()
  useEffect(() => {
    if (marca !== 'zattia') setMarca('zattia')
  }, [marca, setMarca])
  if (marca !== 'zattia') return <div style={{ minHeight: '100vh', background: color.bg, padding: space[4], color: color.mut }}>Abriendo la caja…</div>
  return <POS />
}
