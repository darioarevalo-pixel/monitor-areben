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
import type { Marca } from '@/lib/nav.datos'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useTnPromo } from '@/components/productos/useTnImages'
import { esDeStunned, precioDeCaja } from '@/lib/caja/precio'
import { traerAudit } from '@/lib/tn-audit'
import type { MarcaErp } from '@/lib/erp/cliente'
import type { ProductoFchk } from '@/lib/tncat/tipos'
import { avisar as avisarSiempre, prepararSonido, type Aviso } from '@/lib/sonido'
import { NOMBRE_MEDIO, aPagarDe, msjOferta, ofertaDe, baseParaMonto, cobro, cuentaDeMedio, cuentaDeOferta, idsDeFeria, mediosOfertaAparte, nombreParaTicket, pagosDeMedio, pagosDeVarios, pctDeMedio, pctOfertaDeLinea, renglones, subtotal, subtotalDeFeria } from '@/lib/caja/core.core.js'
import { hoyIso, promosDeCreditoEnMostrador } from '@/lib/agenda'
import { useAgenda } from '@/store/useAgenda'
import { palabrasDeBusqueda } from '@/lib/caja/buscar.core.js'
import { avisoDeRenglon } from '@/lib/caja/pedidos-web.core.js'
import { billetesDe } from '@/lib/caja/conteo.core.js'
import { aplicarPromos } from '@/lib/caja/promos.core.js'
import { registrarRespuesta, repetida } from '@/lib/caja/repetida.core.js'
import { puedeUsarPOS } from '@/lib/caja/cierre.core.js'
import { imprimirTicket, numeroProvisorio, plata, ticketDeVenta, type DatosTicket } from '@/lib/caja/ticket'
import { claveMail, claveVista, leerMail, vistaParaCliente } from '@/lib/caja/pantalla-cliente'
import { mailOk } from '@/lib/caja/mail'
import { useEsMovil } from '@/lib/caja/movil'
import { MARCA_CAJA, marcaParaPOS, storeCaja, useMarcaDeLaUrl, usarMarcaCaja } from '@/lib/caja/marca'
import {
  buscarNombre,
  buscarProducto,
  cancelarVenta,
  confirmarVenta,
  elegirVariante,
  leerConfig,
  leerPendientes,
  leerTurno,
  leerPedidosWeb,
  reintentarPendientes,
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
  ventaLlego,
  numeroDeLaVenta,
} from '@/lib/caja/cliente'
import { BandaCambio, ModalCobroCambio, ModalEncargada, ModalVentaOriginal, PedidoCambio } from '@/components/caja/partesCambio'
import { useCambio } from '@/components/caja/useCambio'
import { Badge, Button, Card, Field, Icono, Input, Modal, Notice, SectionCard, color, font, radius, shadow, space, weight } from '@/components/ui'
import { useConfirmar } from '@/components/ui/Confirm'
import { ModalVarianteContext } from '@/components/ui/Modal'
import {
  CampoMail,
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
  IrA,
  ModalesTurno,
  UltimaVenta,
  VariosPagos,
  VentasDelTurno,
  aNumero,
  claveDe,
  horaAr,
  type PagoUI,
  type Renglon,
} from '@/components/caja/partes'

/**
 * `enviado`: con este id ya se pidió `confirmar` (auditoría A1). Si la respuesta se perdió, la venta
 * puede estar cobrada: «Vaciar pedido» ⛔ renueva el id, y un pedido distinto con él da 409 `yaCobrada`.
 */
type Borrador = { id: string; renglones: Renglon[]; email: string; descuentoVenta?: Rebaja | null; enviado?: boolean }

/** V4: el borrador es de la marca de la pestaña (`storeCaja`). */
const claveCarrito = () => `caja:borrador:${storeCaja()}`

/**
 * El color y el ícono de cada forma de pago en el cobro, como las tarjetas del POS de GN (prototipo del
 * 6-oct): Débito celeste y Crédito rosa (`app/tokens.css`), para que las dos tarjetas ⛔ se confundan.
 */
const ESTILO_MEDIO: Record<Medio, { icono: 'efectivo' | 'transferencia' | 'tarjeta'; fondo: string; tinta: string }> = {
  efectivo: { icono: 'efectivo', fondo: color.successBg, tinta: color.successInk },
  transferencia: { icono: 'transferencia', fondo: color.brandBg, tinta: color.brand },
  debito: { icono: 'tarjeta', fondo: 'var(--mo-info-bg)', tinta: 'var(--mo-info)' },
  credito: { icono: 'tarjeta', fondo: 'var(--mo-pink-bg)', tinta: 'var(--mo-pink)' },
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
    const d = JSON.parse(localStorage.getItem(claveCarrito()) || 'null') as Borrador | null
    if (d && typeof d.id === 'string' && Array.isArray(d.renglones)) return { id: d.id, renglones: d.renglones, email: d.email || '', descuentoVenta: d.descuentoVenta ?? null, enviado: d.enviado === true }
  } catch {
    /* sin localStorage: el carrito vive en memoria */
  }
  return { id: nuevoId(), renglones: [], email: '' }
}
function guardarBorrador(b: Borrador) {
  try {
    localStorage.setItem(claveCarrito(), JSON.stringify(b))
  } catch {
    /* modo privado o cuota: sigue en memoria */
  }
}

/** La última lista de pedidos web (W1), para mostrarla al cargar mientras llega la nueva. */
const clavePedidos = () => `caja:pedidos-web:${storeCaja()}`
/** «Con sonido / Sin sonido» de esta computadora (Bruno, 4-oct): el pitido y la voz de cada escaneo. */
const CLAVE_SONIDO = 'caja:sonido'

function POS() {
  const { perfil } = useSesion()
  // 🔑 Vista de celular (`lib/caja/movil.ts`): el MISMO cobro, otra presentación. ⛔ Imprime ticket: va por mail.
  const movil = useEsMovil()
  const [menuMovil, setMenuMovil] = useState(false)
  const imprimir: typeof imprimirTicket = (t, ms, que) => (movil ? Promise.resolve() : imprimirTicket(t, ms, que))
  const promos = useAgenda((st) => st.promos)
  const { datos } = useDatosMonitor()
  const tnIdx = useTnPromo(storeCaja())
  // 🔑 Stunned tiene SU Tienda Nube (16-oct): su precio sale de ahí, ⛔ de la de Zattia. En BDI es el mismo índice.
  const tnIdxStunned = useTnPromo(storeCaja() === 'zattia' ? 'stunned' : storeCaja())

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
  // 🔴 La PRENDA REPETIDA (Bruno, 14-oct): cuántas hay de cada prenda, AL INSTANTE. El lector que dispara dos
  // veces resuelve las dos búsquedas antes de que React pinte: contando sobre `bor` las dos veían «0 en el
  // pedido» y entraban las dos, calladas. `agregar` suma acá en el momento; cada pintada lo rearma de `bor`.
  const cantidades = useRef(new Map<string, number>())
  useEffect(() => {
    cantidades.current = new Map(bor.renglones.map((r) => [claveDe(r.variante), r.cantidad]))
  }, [bor.renglones])
  const [pregunta, setPregunta] = useState<{ variante: Variante; stock: Stock; enPedido: number; quedaria: number; superaStock: boolean } | null>(null)
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
  const [seisCuotas, setSeisCuotas] = useState<boolean | null>(null)
  const [varios, setVarios] = useState(false)
  const [pagaCon, setPagaCon] = useState('')
  // 🎁 Regalo (Bruno, 13-oct): sale el ticket + el de cambio. La transferencia imprime al llegar ⇒ se
  // recuerda qué ventas en espera eran regalo.
  const [regalo, setRegalo] = useState(false)
  const regalos = useRef(new Set<string>())
  const [codigo, setCodigo] = useState('')
  // Cuántas búsquedas hay en vuelo. 🔴 El campo ⛔ se deshabilita mientras busca: el lector tipea el
  // código siguiente enseguida, y con el campo bloqueado ese escaneo se PERDÍA (visto en prod, 4-oct).
  const [buscando, setBuscando] = useState(0)
  const [aviso, setAviso] = useState<{ tono: 'danger' | 'warning'; texto: string } | null>(null)
  // Paso «Validar transferencia» (Bruno, 12-oct; 13-oct: ⛔ «Confirmar», que se lee como el final): la venta guardada que espera el pago, en su modal.
  const [validando, setValidando] = useState<Venta | null>(null)
  const [candidatos, setCandidatos] = useState<{ lista: Candidato[]; mas: number } | null>(null)
  // La lista que aparece MIENTRAS se escribe (Bruno, 4-oct). `vuelta` numera cada búsqueda: sólo se
  // pinta la última (una respuesta lenta ⛔ pisa a la que ya llegó), y el Enter la anula.
  const [sugeridas, setSugeridas] = useState<(ListaNombre & { q: string }) | null>(null)
  const [verSinStock, setVerSinStock] = useState(false)
  // El producto cuyo modal «Elegir variante» está abierto.
  const [eligiendo, setEligiendo] = useState<ProductoLista | null>(null)
  const vuelta = useRef(0)
  const [enviando, setEnviando] = useState(false)
  const [ultima, setUltima] = useState<{ venta: Venta; ticket: DatosTicket; regalo?: boolean } | null>(null)
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

  /**
   * 🔑 A6 (Bruno, 12-oct): la configuración y la promo de crédito de HOY se vuelven a leer al abrir el
   * cobro y cuando el servidor rebota una venta. Antes se leían una vez al abrir la pantalla: una Caja
   * abierta desde ayer ofrecía la promo de ayer y la cajera chocaba con el rebote. Va por detrás (⛔ frena
   * «Cobrar») y, si falla, queda lo que había. Devuelve si algo cambió.
   */
  const refrescarReglas = useCallback(async () => {
    const antes = JSON.stringify([config?.reglas ?? null, useAgenda.getState().promos])
    const [nueva] = await Promise.all([leerConfig().catch(() => null), useAgenda.getState().cargar()])
    if (nueva) setConfig(nueva)
    return JSON.stringify([nueva?.reglas ?? config?.reglas ?? null, useAgenda.getState().promos]) !== antes
  }, [config])

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
    // Primero la fila sola (rápida) para dibujar el POS; la entera trae el resumen, que lee GN y tarda
    // de 1 a 10 s (medido el 13-oct). La liviana ⛔ pisa a la entera si llega después.
    leerTurno(true)
      .then((r) => setTurno((ya) => (ya === undefined ? r.turno : ya)))
      .catch(() => {})
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
        const d = JSON.parse(localStorage.getItem(clavePedidos()) || 'null') as PedidosWeb | null
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
            localStorage.setItem(clavePedidos(), JSON.stringify(d))
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
  // 🔑 La promo bancaria de crédito de HOY sale de la Agenda (la misma de la banda de promos). Con promo, el
  // crédito va con el descuento sin preguntar de qué tarjeta es: la cajera sabe cuáles entran (Bruno, 14-oct).
  const promoCredito = useMemo(
    // La MISMA pregunta que hace el servidor antes de aceptar la cuenta del −10 % (A6).
    () => promosDeCreditoEnMostrador(promos, hoyIso(), storeCaja()),
    [promos],
  )
  const esEfectivo = useCallback((id: number) => !!reglas?.cuentas[id]?.efectivo, [reglas])

  /** El precio, la foto y las categorías de TN de un producto: la regla de su línea (`lib/caja/precio.ts`). */
  const precioDeProducto = useCallback(
    (productId: number) => {
      const p = datos?.allProductos.find((x) => String(x.id) === String(productId))
      if (!p || !tnIdx) return null
      return precioDeCaja(p, { store: storeCaja(), idx: tnIdx, idxStunned: tnIdxStunned, reglas, localStunned: config?.stunned_local ?? null })
    },
    [datos, tnIdx, tnIdxStunned, reglas, config?.stunned_local],
  )

  /** El precio de la etiqueta y la foto de un producto. */
  const precioYFoto = useCallback(
    (productId: number): { precio: number | null; fueraDeTn: boolean; foto: string | null } => {
      const r = precioDeProducto(productId)
      return r ? { precio: r.precio, fueraDeTn: r.fueraDeTn, foto: r.foto } : { precio: null, fueraDeTn: false, foto: null }
    },
    [precioDeProducto],
  )

  /** ¿La prenda es de Stunned? La MISMA pregunta que el precio (`esDeStunned`: el SKU del producto o el de la variante). */
  const esStunnedVariante = useCallback(
    (v: Variante): boolean => esDeStunned(storeCaja(), { sku: datos?.allProductos.find((x) => String(x.id) === String(v.product_id))?.sku ?? null }, v.sku),
    [datos],
  )

  // ── El modo «Cambios» (Bruno, 27-oct): el cambio de Stunned en el POS. El estado y las cuentas viven en `useCambio`
  // (el mismo que usa erp › Caja › Cambio); acá sólo se decide en qué paso está y qué se muestra. ──
  const cambio = useCambio({ store: storeCaja() as MarcaErp, config, precioDe: (v) => precioDeProducto(v.product_id)?.precio ?? null, esStunned: esStunnedVariante })
  const [enCambio, setEnCambio] = useState(false)
  const [pasoCambio, setPasoCambio] = useState<1 | 2>(1)
  const [verVentaOriginal, setVerVentaOriginal] = useState(false)
  const [pidePin, setPidePin] = useState(false)
  const [cobrandoCambio, setCobrandoCambio] = useState(false)
  const salirDelCambio = () => {
    cambio.empezarDeNuevo()
    cambio.setError(null)
    setEnCambio(false)
    setPasoCambio(1)
    setVerVentaOriginal(false)
    setPidePin(false)
    setCobrandoCambio(false)
  }
  // El cambio quedó registrado: se sale del modo y el cartel de «Cambio #N» queda arriba.
  const cambioHecho = cambio.hecho
  useEffect(() => {
    if (!cambioHecho) return
    void Promise.resolve().then(() => {
      setEnCambio(false)
      setPasoCambio(1)
      setCobrandoCambio(false)
    })
  }, [cambioHecho])
  // Es un CAMBIO, ⛔ una devolución (Bruno, 27-oct): para seguir al cobro hay que llevarse algo; lo que sobra queda a favor.
  const cambioListoParaCobrar = enCambio && pasoCambio === 2 && cambio.unidadesNuevas > 0 && !cambio.sinPrecio && cambio.devueltas.length > 0
  /** «Siguiente →»: sin venta pide el PIN de la encargada; con venta pasa directo a lo que se lleva. */
  const siguienteDelCambio = () => {
    if (!cambio.devueltas.length) return
    if (cambio.sinPrecioDevuelta) return cambio.setError('Escribí lo que pagó la clienta por cada producto que devuelve.')
    cambio.setError(null)
    if (cambio.tipo === 'suelto') setPidePin(true)
    else setPasoCambio(2)
  }

  /** Las categorías de Tienda Nube del producto (las promos por categoría, W5). La de GN está vacía en el 85 %. */
  const categoriasDe = useCallback((productId: number): string[] => precioDeProducto(productId)?.categorias ?? [], [precioDeProducto])

  // 🔑 La foto del COLOR (Bruno, 5-oct): Tienda Nube trae la foto de cada variante con su SKU, que es el
  // mismo de GN. Sin foto propia, la del producto.
  const [fotoSku, setFotoSku] = useState<Record<string, string>>({})
  // Y el NOMBRE del color de cada variante (la misma lectura): «Color · Talle» en «Elegir variante».
  const [colorSku, setColorSku] = useState<Record<string, string>>({})
  useEffect(() => {
    let vivo = true
    traerAudit<ProductoFchk>(storeCaja(), { variantes: true })
      .then((ps) => {
        const m: Record<string, string> = {}
        const cs: Record<string, string> = {}
        for (const p of ps)
          for (const v of p.variantes ?? []) {
            if (v.sku && v.image_url) m[v.sku.toLowerCase().trim()] = v.image_url
            if (v.sku && v.color) cs[v.sku.toLowerCase().trim()] = v.color
          }
        if (vivo) {
          setFotoSku(m)
          setColorSku(cs)
        }
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
  const colorDe = useCallback((v: Variante) => (v.sku && colorSku[v.sku.toLowerCase().trim()]) || null, [colorSku])
  // Robustez (auditoría, 11-oct): una prenda escaneada ANTES de que cargaran los precios quedaba sin
  // precio para siempre. Cuando llegan, se completa la que nunca tuvo uno (⛔ la que la cajera borró).
  useEffect(() => {
    const t = setTimeout(() => {
      setBor((b) => {
        let cambio = false
        const rs = b.renglones.map((r) => {
          if (r.precio != null || r.precioLista != null) return r
          const pf = precioYFoto(r.variante.product_id)
          if (pf.precio == null) return r
          cambio = true
          return { ...r, precio: pf.precio, precioLista: pf.precio, fueraDeTn: pf.fueraDeTn, foto: r.foto ?? pf.foto }
        })
        return cambio ? { ...b, renglones: rs } : b
      })
    }, 0)
    return () => clearTimeout(t)
  }, [precioYFoto])

  // 🔑 El punto de Gestión Nube de la cabecera: la ÚLTIMA respuesta que la pantalla ya tuvo de GN (⛔ se
  // le pregunta nada nuevo). El stock de una prenda leído en vivo o del espejo (`stock.fuente`), y la
  // venta que llegó o quedó pendiente. Antes de la primera señal, las cobradas sin llegar.
  const [gnSenal, setGnSenal] = useState<{ ok: boolean; que: string } | null>(null)
  // 🔑 Auditoría E (11-oct): el POS manda SOLO las cobradas que ⛔ llegaron a GN, al abrir y cada 3 min.
  // El respaldo de GitHub corre ~3 veces por día: con GN caído una venta quedaba horas afuera. El
  // servidor elige cuáles (las rechazadas y las recién tocadas ⛔) y ⛔ duplica (el id es el de GN).
  useEffect(() => {
    let vivo = true
    const vuelta = () =>
      reintentarPendientes()
        .then((r) => {
          if (!vivo || !r.intentadas) return
          if (r.llegaron) setGnSenal({ ok: true, que: `${r.llegaron === 1 ? 'llegó 1 venta pendiente' : `llegaron ${r.llegaron} ventas pendientes`}` })
          refrescarPendientes()
        })
        .catch(() => {
          /* sin turno, sin red o GN caído: la próxima vuelta reintenta y el cartel rojo sigue */
        })
    const t0 = setTimeout(vuelta, 5_000)
    const t = setInterval(vuelta, 3 * 60_000)
    return () => {
      vivo = false
      clearTimeout(t0)
      clearInterval(t)
    }
  }, [refrescarPendientes])

  function agregar(variante: Variante, stock: Stock) {
    // 🔑 Un ticket es de UNA marca (Bruno, 26-oct): con Stunned en el ERP, la prenda de la otra marca se cobra aparte.
    if (config?.stunned_erp && bor.renglones.some((r) => esStunnedVariante(r.variante) !== esStunnedVariante(variante))) {
      setAviso({ tono: 'warning', texto: `Un ticket es de una sola marca: esta prenda es de ${esStunnedVariante(variante) ? 'Stunned' : 'Zattia'} y la venta de ahora es de ${esStunnedVariante(variante) ? 'Zattia' : 'Stunned'}. Cobrá una y después la otra.` })
      return
    }
    const k = claveDe(variante)
    const enCarrito = (cantidades.current.get(k) ?? 0) + 1
    cantidades.current.set(k, enCarrito)
    setGnSenal(stock.fuente === 'vivo' ? { ok: true, que: 'el stock de la última prenda se leyó en vivo' } : { ok: false, que: `el stock de la última prenda es el de anoche${stock.motivo ? ` (${stock.motivo})` : ''}` })
    setBor((b) => {
      const i = b.renglones.findIndex((r) => claveDe(r.variante) === claveDe(variante))
      if (i >= 0) {
        const rs = b.renglones.slice()
        rs[i] = { ...rs[i], stock, cantidad: rs[i].cantidad + 1 }
        return { ...b, renglones: rs }
      }
      const pf = precioYFoto(variante.product_id)
      return { ...b, renglones: [...b.renglones, { variante, stock, cantidad: 1, rebaja: null, ...pf, precioLista: pf.precio, foto: fotoDe(variante) }] }
    })
    const web = avisoWeb(variante, stock, enCarrito)
    // La Caja ⛔ frena (gana el local, Bruno 4-oct): avisa, y el pedido se resuelve después.
    if (web && web.tipo !== 'separada') {
      avisar('ojo', web.tipo === 'sin_stock' ? 'Comprada online' : 'Traer del depósito')
      setAviso({ tono: web.tipo === 'sin_stock' ? 'danger' : 'warning', texto: web.texto })
    } else if (stock.local - enCarrito <= 0) avisar('ojo', 'Última')
    else avisar('ok')
  }

  /**
   * Una prenda escaneada (o elegida de la lista). Si ya está en el pedido ⛔ se suma: se PREGUNTA (Bruno,
   * 14-oct, `lib/caja/repetida.core.js`). El «+» del renglón ⛔ pasa por acá: ése es a propósito.
   */
  function llego(variante: Variante, stock: Stock) {
    // En el modo «Cambios» la prenda va a la devolución (paso 1) o a lo que se lleva (paso 2), ⛔ al pedido de venta.
    if (enCambio) {
      try {
        if (pasoCambio === 1) cambio.devolverPrenda(variante)
        else cambio.sumarNueva(variante)
        cambio.setError(null)
        setAviso(null)
        avisar('ok')
      } catch (e) {
        avisar('no')
        setAviso({ tono: 'danger', texto: (e as Error).message })
      }
      return
    }
    const rep = repetida({ enPedido: cantidades.current.get(claveDe(variante)) ?? 0, local: stock.local })
    if (!rep) return agregar(variante, stock)
    avisar('ojo', 'Ya está en el pedido')
    // Con una pregunta abierta, la segunda repetida ⛔ abre otra: es la misma duda.
    setPregunta((p) => p ?? { variante, stock, ...rep })
  }

  /** Lo que contestó la cajera queda en el renglón (`repetida`) y viaja con la venta. */
  function responder(si: boolean) {
    const p = pregunta
    if (!p) return
    setPregunta(null)
    if (si) agregar(p.variante, p.stock)
    const k = claveDe(p.variante)
    setBor((b) => ({ ...b, renglones: b.renglones.map((r) => (claveDe(r.variante) === k ? { ...r, repetida: registrarRespuesta(r.repetida, si ? 'si' : 'no') } : r)) }))
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
      } else llego(r.variante, r.stock)
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
  // Lo que viaja al servidor: el descuento A MANO y las categorías de Tienda Nube; la promo la aplica él.
  // y la LÍNEA (Stunned, por el SKU, como el precio): con reglas comerciales, cobra con las de su línea.
  // Con su OFERTA (Stunned en oferta en su tienda, 26-oct): paga el % de la oferta de la línea (`PCT_OFERTA_DE_LINEA`).
  const items = bor.renglones.map((r) => ({ product_id: r.variante.product_id, size_id: r.variante.size_id, cantidad: r.cantidad, precio: r.precio ?? 0, rebaja: r.rebaja ?? null, categorias: categoriasDe(r.variante.product_id), ...(esStunnedVariante(r.variante) ? { linea: 'stunned', ...(precioDeProducto(r.variante.product_id)?.oferta ? { oferta: true } : {}) } : {}) }))
  // 🔑 W5: las promos, con el MISMO núcleo que el servidor (`aplicarPromos`). La de compra la
  // reemplaza el descuento a mano a la venta (Bruno, 5-oct).
  const conPromo = (() => {
    try {
      return aplicarPromos({ items, promos: reglas?.promos, feriaIds: idsDeFeria(reglas), hoy: hoyIso() })
    } catch {
      return { items, venta: null, aplicadas: [] }
    }
  })()
  const descuentoManual = bor.descuentoVenta ?? null
  // La promo de compra va SIN la feria (A9): la prenda de feria tiene precio final. La a mano, sobre todo.
  const descuentoVenta: (Rebaja & { sinFeria?: boolean }) | null = descuentoManual ?? (conPromo.venta ? { tipo: 'pesos', valor: conPromo.venta.pesos, sinFeria: true } : null)
  const armado = (() => {
    try {
      if (!bor.renglones.length || sinPrecio) return { filas: null, error: null as string | null }
      return { filas: renglones(conPromo.items), error: null }
    } catch (e) {
      return { filas: null, error: (e as Error).message }
    }
  })()
  const filas = armado.filas
  // Lo que queda después de las rebajas a mano: es lo que decide si se ofrecen las 6 cuotas.
  const aPagar = (() => {
    if (!filas || !reglas) return null
    try {
      return aPagarDe(filas, reglas, descuentoVenta)
    } catch {
      return null
    }
  })()
  const sinMedios = !!reglas && !reglas.medios
  const hayCredito = pagos.some((p) => p.medio === 'credito')
  const preguntaCuotas = hayCredito && !!reglas?.medios && aPagar != null && aPagar > reglas.medios.credito.minSeisCuotas
  const respuestas = { promoCreditoHoy: promoCredito.length > 0, esDelBanco: true, seisCuotas: seisCuotas === true }
  const cuentaDe = (medio: Medio, rg: Reglas) => cuentaDeMedio(medio, { reglas: rg, total: aPagar ?? 0, ...respuestas })
  // 🔑 Productos de feria trabados (Bruno, 5-oct): la MISMA regla que exige el servidor (`exigirFeria`).
  const feriaIds = useMemo(() => idsDeFeria(reglas), [reglas])
  const hayFeria = !!filas && subtotalDeFeria(filas, reglas) > 0
  // 🔑 «Varios pagos» con oferta (Bruno, 13-oct): ⛔ se traba. Si alguna forma de pago cobra la oferta APARTE
  // (a su cuenta de oferta), son DOS repartos —la oferta y el resto— y la oferta se puede partir entre esas
  // formas de pago (`pagosDeVarios`; el servidor lo vuelve a exigir con `exigirFeria`).
  const mediosAparte = hayFeria && reglas ? mediosOfertaAparte(reglas) : []
  const repartoOferta = mediosAparte.length > 0
  const subFeria = filas ? subtotalDeFeria(filas, reglas) : 0
  const hayResto = !!filas && subFeria < subtotal(filas)
  const mediosConOferta = hayFeria ? MEDIOS.filter((md) => ofertaDe(reglas)[md] !== 'no') : MEDIOS
  const pagosOferta = pagos.filter((p) => p.oferta)
  const pagosResto = pagos.filter((p) => !p.oferta)
  const variosIniciales = (medio: Medio | null): PagoUI[] =>
    repartoOferta
      ? [{ medio: medio && mediosAparte.includes(medio) ? medio : null, base: '', oferta: true }, { medio: null, base: '', oferta: true }, ...(hayResto ? [{ medio: null, base: '' }] : [])]
      : [{ medio, base: '' }, { medio: null, base: '' }]
  // Si el pedido cambia de forma (entra o sale la oferta, o queda todo en oferta), el reparto se rearma.
  const formaVarios = `${repartoOferta}-${hayResto}`
  const [formaVista, setFormaVista] = useState(formaVarios)
  if (formaVista !== formaVarios) {
    setFormaVista(formaVarios)
    if (varios) setPagos(variosIniciales(null))
  }
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

  /** En el reparto de la oferta: lo que paga con una forma de pago ⇒ la parte de la oferta, a su cuenta de oferta. */
  const aBaseOferta = (medio: Medio, monto: number): number | null => {
    if (!filas || !reglas?.medios) return null
    try {
      return baseParaMonto({ filas, reglas, descuentoVenta, cuenta: cuentaDeOferta(medio, reglas), monto })
    } catch {
      return null
    }
  }

  /** «Varios pagos»: lo que paga con una forma de pago ⇒ la parte del subtotal que reparte `cobro()`. */
  const aBase = (medio: Medio, monto: number): number | null => {
    if (!filas || !reglas?.medios) return null
    try {
      return baseParaMonto({ filas, reglas, descuentoVenta, cuenta: cuentaDe(medio, reglas), monto })
    } catch {
      return null
    }
  }

  const elCobro = (() => {
    if (armado.error) return { c: null, pedidos: [], error: armado.error }
    if (!filas || !reglas?.medios || pagos.some((p) => p.medio == null)) return { c: null, pedidos: [], error: null as string | null }
    try {
      const rg = reglas
      // Un solo pago: el armado de la forma de pago (con la traba de feria). Varios: lo que repartió la cajera.
      const conBase = (lista: PagoUI[], a: (medio: Medio, monto: number) => number | null) => lista.map((p) => ({ medio: p.medio as Medio, base: a(p.medio as Medio, aNumero(p.base) ?? 0) ?? 0 }))
      const pedidos = !varios
        ? pagosDe(pagos[0].medio as Medio, rg)
        : repartoOferta
          ? pagosDeVarios({ filas, reglas: rg, total: aPagar ?? 0, ...respuestas, oferta: conBase(pagosOferta, aBaseOferta), resto: conBase(pagosResto, aBase) })
          : pagos.map((p, i) => {
            const cuenta = cuentaDe(p.medio as Medio, rg)
            return i === pagos.length - 1 ? { cuenta } : { cuenta, base: aBase(p.medio as Medio, aNumero(p.base) ?? 0) ?? 0 }
          })
      return { c: cobro({ filas, pagos: pedidos, reglas: rg, descuentoVenta }), pedidos, error: null }
    } catch (e) {
      return { c: null, pedidos: [], error: (e as Error).message }
    }
  })()
  const c = elCobro.c
  const pedidos = elCobro.pedidos
  const faltaContestar = preguntaCuotas && seisCuotas == null

  const enEfectivo = c ? c.pagos.filter((p) => esEfectivo(p.cuenta)).reduce((s, p) => s + p.monto, 0) : 0
  const pagaConN = aNumero(pagaCon)
  const vuelto = pagaConN != null && enEfectivo > 0 ? Math.round((pagaConN - enEfectivo) * 100) / 100 : null
  const emailOk = mailOk(bor.email)

  // 🔑 La pantalla de la clienta (rediseño, fase 3): se le publican los números del POS, ⛔ los recalcula.
  const vistaCliente = JSON.stringify(
    vistaParaCliente({
      carrito: bor.renglones.map((r) => ({ nombre: r.variante.product_name, talle: r.variante.size_name, color: colorDe(r.variante), cantidad: r.cantidad, precio: r.precio, foto: r.foto })),
      filas,
      aPagar,
      cobro: c,
      medio: !varios && pagos[0]?.medio ? NOMBRE_MEDIO[pagos[0].medio] : null,
      email: bor.email,
      ultima: ultima ? { numero: numeroDeLaVenta(ultima.venta), email: ultima.venta.email } : null,
    }),
  )
  useEffect(() => {
    try {
      localStorage.setItem(claveVista(), vistaCliente)
    } catch {
      /* sin localStorage: la pantalla de la clienta ⛔ se entera */
    }
  }, [vistaCliente])
  // Y el mail que escribe la clienta llega al campo «Mail para el ticket».
  useEffect(() => {
    const oir = (e: StorageEvent) => {
      if (e.key !== claveMail()) return
      const m = leerMail(e.newValue)
      if (m) setBor((b) => ({ ...b, email: m.no ? '' : m.email.trim() }))
    }
    window.addEventListener('storage', oir)
    return () => window.removeEventListener('storage', oir)
  }, [])
  // Con transferencia la venta ⛔ se finaliza al apretar: espera el pago (paso «Validar transferencia»).
  const porTransferencia = pagos.some((p) => p.medio === 'transferencia')
  const puedeConfirmar = !!turno && !!c && !enviando && emailOk && !faltaContestar && (vuelto == null || vuelto >= 0)

  /** El ticket de una venta ya guardada (la que esperaba la transferencia): el carrito ya ⛔ está. */
  function ticketGuardado(venta: Venta): DatosTicket {
    return ticketDeVenta(venta, config, nombreCuenta)
  }

  /** Llegó la transferencia y la venta salió a GN: recién ahora el ticket. */
  function llegoTransferencia(venta: Venta) {
    const ticket = ticketGuardado(venta)
    const regalo = regalos.current.delete(venta.id)
    setUltima({ venta, ticket, regalo })
    avisar(ventaLlego(venta) ? 'ok' : 'ojo')
    imprimir(ticket, ahora(), regalo ? 'regalo' : 'ticket').catch((e) => setAviso({ tono: 'danger', texto: `No se pudo imprimir el ticket: ${(e as Error).message}` }))
    refrescarPendientes()
    refrescarTurno()
  }

  /**
   * «Cambiar forma de pago» (Bruno, 12-oct: no le anda internet y paga en efectivo): la venta que espera
   * la transferencia se cancela (`cambio_pago`) y sus prendas vuelven al carrito, con el stock leído de
   * nuevo; el precio que la cajera había cambiado a mano se conserva. Con otra venta en el carrito ⛔:
   * mezclaría dos clientas. Tira el error para que lo muestre la transferencia pendiente.
   */
  async function volverAlCarrito(venta: Venta) {
    if (bor.renglones.length) throw new Error('Hay otra venta en el carrito: cobrala o sacá sus prendas antes de cambiar la forma de pago.')
    const guardados = venta.renglones ?? []
    if (!guardados.length) throw new Error('La venta no tiene las prendas guardadas: cancelala y escaneá de nuevo.')
    // Primero las prendas, después cancelar: si una ⛔ se puede traer, la venta sigue esperando.
    const leidas = await Promise.all(
      guardados.map(async (g) => {
        const r = await elegirVariante({ product_id: g.product_id, size_id: g.size_id, product_name: g.nombre ?? '', size_name: g.talle ?? '', sku: g.sku ?? null, barcode: null })
        if (!('variante' in r)) throw new Error(`No se pudo traer ${g.nombre ?? 'una prenda'}: cancelá la venta y escaneala de nuevo.`)
        return { g, ...r }
      }),
    )
    await cancelarVenta(venta.id, 'cambio_pago')
    const renglones = leidas.map(({ g, variante, stock }) => {
      const pf = precioYFoto(variante.product_id)
      const aMano = g.precio_lista != null
      return { variante, stock, cantidad: g.cantidad, rebaja: null, ...pf, precio: aMano ? g.precio : pf.precio, precioLista: aMano ? g.precio_lista : pf.precio, foto: fotoDe(variante) }
    })
    setBor({ id: nuevoId(), renglones, email: venta.email ?? '', descuentoVenta: null })
    limpiarCobro()
    setValidando(null)
    setEnCobro(true)
    const aparte = venta.total - (venta.espera_monto ?? venta.total)
    setAviso({
      tono: 'warning',
      texto: `La venta ${numeroProvisorio(venta.id)} se canceló y sus prendas volvieron al carrito: elegí la forma de pago nueva.${aparte > 0 ? ` Ya se cobraron ${plata(aparte)} aparte: tenelo en cuenta al cobrar.` : ''}${venta.a_mano?.venta || venta.a_mano?.prendas ? ' Los descuentos a mano hay que cargarlos de nuevo.' : ''}`,
    })
    refrescarPendientes()
    refrescarTurno()
  }

  /** El cobro de la clienta anterior ⛔ queda (auditoría A11): forma de pago, «paga con», las preguntas del crédito. */
  function limpiarCobro() {
    setPagos([{ medio: null, base: '' }])
    setSeisCuotas(null)
    setVarios(false)
    setPagaCon('')
    setRegalo(false)
  }

  async function confirmar() {
    if (!c) return
    setEnviando(true)
    setAviso(null)
    setBor((b) => (b.enviado ? b : { ...b, enviado: true }))
    const conRegalo = regalo
    try {
      const r = await confirmarVenta({
        id: bor.id,
        // El nombre, el talle y la foto van para el ticket por mail; la plata ⛔ los mira.
        items: bor.renglones.map((r, i) => ({ ...items[i], nombre: r.variante.product_name, talle: r.variante.size_name, sku: r.variante.sku ?? null, linea: esStunnedVariante(r.variante) ? 'stunned' : 'zattia', foto: r.foto, precioLista: r.precioLista ?? null, repetida: r.repetida ?? null })),
        pagos: pedidos,
        total: c.total,
        descuentoVenta: descuentoManual,
        email: bor.email.trim() || null,
        pagaCon: enEfectivo > 0 ? pagaConN : null,
      })
      // La venta quedó guardada (en GN, pendiente o esperando la transferencia): el carrito se cierra y nace otro id.
      setBor({ id: nuevoId(), renglones: [], email: '', descuentoVenta: null })
      limpiarCobro()
      setEnCobro(false)
      if (r.venta.estado === 'esperando_pago') {
        // ⛔ ticket todavía: sale cuando llega la transferencia. El cobro pasa al paso «Validar
        // transferencia»; «Seguir vendiendo» la deja en el cartel ámbar de arriba.
        setUltima(null)
        if (conRegalo) regalos.current.add(r.venta.id)
        setValidando(r.venta)
        refrescarPendientes()
        refrescarTurno()
        return
      }
      // El ticket sale de la venta GUARDADA (sus renglones), ⛔ del carrito: A1 los mezclaba.
      const ticket = ticketGuardado(r.venta)
      setGnSenal(ventaLlego(r.venta) ? { ok: true, que: 'la última venta llegó' } : { ok: false, que: `la última venta quedó pendiente${r.venta.ultimo_error ? ` (${r.venta.ultimo_error})` : ''}` })
      setUltima({ venta: r.venta, ticket, regalo: conRegalo })
      avisar(ventaLlego(r.venta) ? 'ok' : 'ojo')
      imprimir(ticket, ahora(), conRegalo ? 'regalo' : 'ticket').catch((e) => setAviso({ tono: 'danger', texto: `No se pudo imprimir el ticket: ${(e as Error).message}` }))
      refrescarPendientes()
      refrescarTurno()
    } catch (e) {
      // ⛔ se renueva el id: el reintento tiene que llevar el MISMO, por si GN ya la tiene.
      avisar('no')
      // 🔴 A1: con este id ya se cobró OTRO pedido (la respuesta se había perdido). La cobrada pasa a
      // «Última venta» para reimprimir, y el carrito de ahora queda con un id nuevo: si es otra venta, se cobra.
      const yaCobrada = (e as { datos?: { yaCobrada?: boolean; venta?: Venta } }).datos
      if (yaCobrada?.yaCobrada && yaCobrada.venta) {
        setUltima({ venta: yaCobrada.venta, ticket: ticketGuardado(yaCobrada.venta) })
        setBor((b) => ({ ...b, id: nuevoId(), enviado: false }))
        setEnCobro(false)
        refrescarPendientes()
        refrescarTurno()
      }
      if ((e as { datos?: { sinTurno?: boolean } }).datos?.sinTurno) refrescarTurno()
      // A6: el servidor la rebotó (⛔ se guardó nada) ⇒ la Caja se pone al día sola y el carrito sigue.
      const rebotada = !yaCobrada?.yaCobrada && [400, 409].includes((e as { status?: number }).status ?? 0)
      if (rebotada && (await refrescarReglas())) {
        setAviso({ tono: 'danger', texto: 'Cambió la configuración de la Caja y ya se actualizó: el pedido sigue igual. Revisá el cobro y confirmá de nuevo.' })
        return
      }
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
  const [panelTurno, setPanelTurno] = useState<null | 'contar' | 'salida' | 'ingreso' | 'cerrar'>(null)
  const [cerradoAca, setCerradoAca] = useState<Turno | null>(null)
  // B1: la lista de ventas del turno, con «Reimprimir».
  const [verVentas, setVerVentas] = useState(false)

  // Sin el shell, las promos de la Agenda (la del crédito de hoy) las pide el POS.
  const cargarAgenda = useAgenda((st) => st.cargar)
  useEffect(() => {
    void cargarAgenda()
  }, [cargarAgenda])

  const prendas = bor.renglones.reduce((s, r) => s + r.cantidad, 0)
  const puedeCobrar = bor.renglones.length > 0 && !sinPrecio
  // Si el pedido se vacía o queda una prenda sin precio, se vuelve al pedido.
  const mostrarCobro = enCobro && puedeCobrar
  // A6: al abrir el cobro, la config y la promo de crédito de HOY (una Caja abierta desde ayer traía las de ayer).
  const abrirCobro = useCallback(() => {
    setEnCobro(true)
    void refrescarReglas()
  }, [refrescarReglas])
  // Alt+C: «Continuar al cobro», como el POS de GN.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!e.altKey || e.code !== 'KeyC') return
      // En el cambio, Alt+C va al cobro del cambio (cuando ya hay algo que se lleva).
      if (enCambio) {
        if (!cambioListoParaCobrar) return
        e.preventDefault()
        setCobrandoCambio(true)
        return
      }
      if (!puedeCobrar) return
      e.preventDefault()
      abrirCobro()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [puedeCobrar, abrirCobro, enCambio, cambioListoParaCobrar])

  async function vaciar() {
    if (!(await preguntar({ titulo: 'Vaciar pedido', mensaje: `Se ${prendas === 1 ? 'saca la prenda' : `sacan las ${prendas} prendas`} del pedido. No se cobró nada.`, ok: 'Vaciar pedido', tono: 'warning' }))) return
    // 🔑 A1: el id se renueva sólo si ⛔ se mandó nada con él. Si se mandó y la respuesta se perdió, la
    // venta puede estar cobrada: con el mismo id, el pedido nuevo da 409 y se ve cuál era.
    setBor((b) => ({ ...b, id: b.enviado ? b.id : nuevoId(), renglones: [], email: '', descuentoVenta: null }))
    limpiarCobro()
    setEnCobro(false)
    enfocar()
  }

  const marco = (hijos: React.ReactNode) => <div style={{ minHeight: '100vh', background: color.bg, padding: space[4], display: 'grid', placeItems: 'start center' }}>{hijos}</div>
  if (errCarga) return marco(<Notice tone="danger">{errCarga}</Notice>)
  if (turno === undefined) return marco(errTurno ? <Notice tone="danger">No se pudo leer la caja: {errTurno}</Notice> : <span style={{ color: color.mut }}>Abriendo la caja…</span>)
  if (!turno) {
    return marco(
      <div style={{ display: 'grid', gap: space[3], maxWidth: 560 }}>
        {cerradoAca && <AvisoCierre t={cerradoAca} />}
        <Notice tone="warning">Sin caja abierta: el POS no cobra. Abrir caja desde la pestaña Caja.</Notice>
        <div>
          <IrA href="/caja" variant="solid" tone="brand">
            Ir a la Caja
          </IrA>
        </div>
      </div>,
    )
  }
  if (!puedeUsarPOS(turno, perfil)) {
    return marco(
      <div style={{ display: 'grid', gap: space[3], maxWidth: 560 }}>
        <Notice tone="warning">Caja de {turno.abierto_por ?? 'otra cuenta'}: POS sólo para esa cuenta.</Notice>
        <div>
          <IrA href="/caja" iconLeft={<Icono nombre="atras" />}>
            Caja
          </IrA>
        </div>
      </div>,
    )
  }

  const sinLlegar = pendientes.filter((v) => v.estado !== 'esperando_pago').length
  const rechazadas = pendientes.filter((v) => v.estado !== 'esperando_pago' && v.reintentable === false).length
  const gnOk = gnSenal ? gnSenal.ok : sinLlegar === 0
  const gnPorque = gnSenal ? `Gestión Nube: ${gnSenal.que}.` : sinLlegar ? `Gestión Nube: ${sinLlegar} cobradas sin llegar.` : 'Gestión Nube: sin ventas pendientes.'
  const subtotalFilas = filas ? filas.reduce((s, f) => s + f.importe, 0) : null


  // Las piezas que comparten la PC y el celular: ⛔ se escriben dos veces.
  const esperasJSX = (
pendientes
            .filter((v) => v.estado === 'esperando_pago' && v.id !== validando?.id)
            .map((v) => (
              <EsperaTransferencia key={v.id} venta={v} reglas={reglas} onLlego={llegoTransferencia} onCambio={refrescarPendientes} onCambiarPago={volverAlCarrito} />
            ))
  )
  // El precio LOCAL de Stunned del ERP (28-oct) ⛔ se pudo leer: la Caja cobra el de Tienda Nube, y lo dice.
  const avisoPrecioLocalJSX = config?.stunned_local_error ? <Notice tone="warning">{config.stunned_local_error}</Notice> : null
  const avisoSinLlegarJSX =
    sinLlegar > 0 && (
            <Notice tone="danger">
              Cobradas sin llegar a Gestión Nube: {sinLlegar}.{' '}
              {rechazadas > 0
                ? `${rechazadas === 1 ? 'Una la rechazó' : `${rechazadas} las rechazó`} Gestión Nube: revisar desde la pestaña Caja.`
                : 'Se reintentan solas cada 3 min mientras el POS está abierto.'}
            </Notice>
    )
  const ultimaJSX =
    ultima && (
            <UltimaVenta
              venta={ultima.venta}
              nombreCuenta={nombreCuenta}
              esEfectivo={esEfectivo}
              regalo={ultima.regalo}
              onReimprimir={movil ? undefined : () => imprimir(ultima.ticket, ahora())}
              onTicketCambio={movil ? undefined : () => imprimir(ultima.ticket, ahora(), 'cambio').catch((e) => setAviso({ tono: 'danger', texto: `No se pudo imprimir el ticket de cambio: ${(e as Error).message}` }))}
              onOtra={() => {
                setUltima(null)
                enfocar()
              }}
            />
    )
  const modalesTurnoJSX = (
    <>
      {verVentas && (
        <VentasDelTurno
          nombreCuenta={nombreCuenta}
          onCerrar={() => setVerVentas(false)}
          onReimprimir={movil ? undefined : (v) => imprimir(ticketGuardado(v), ahora()).catch((e) => setAviso({ tono: 'danger', texto: `No se pudo imprimir el ticket: ${(e as Error).message}` }))}
          onTicketCambio={movil ? undefined : (v) => imprimir(ticketGuardado(v), ahora(), 'cambio').catch((e) => setAviso({ tono: 'danger', texto: `No se pudo imprimir el ticket de cambio: ${(e as Error).message}` }))}
        />
      )}

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
    </>
  )
  // 🔴 La prenda repetida (Bruno, 14-oct), «Validar transferencia» y el cobro: UNA sola vez, para los dos formatos.
  const modalesJSX = (
    <>
          {/* 🔴 La prenda repetida (Bruno, 14-oct): el foco y el Enter van a «No» — el lector que disparó dos
              veces manda su Enter acá —, y cerrar con Escape o el fondo también es «No». */}
          {pregunta && (
            <Modal
              abierto
              onCerrar={() => responder(false)}
              titulo="Esta prenda ya está en el pedido"
              pie={
                <>
                  <Button variant="outline" onClick={() => responder(true)}>
                    Sí, se lleva otra
                  </Button>
                  <Button variant="solid" tone="brand" onClick={() => responder(false)} data-foco>
                    No, era la misma
                  </Button>
                </>
              }
            >
              <div style={{ display: 'grid', gap: space[3] }}>
                <div style={{ fontSize: font.lg, fontWeight: weight.semibold }}>
                  {pregunta.variante.product_name} · {pregunta.variante.size_name}
                </div>
                <div>
                  Ya hay {pregunta.enPedido} en el pedido. ¿La clienta se lleva {pregunta.quedaria} iguales, o se escaneó dos veces la misma?
                </div>
                {pregunta.superaStock && <Notice tone="danger">En el local quedan {pregunta.stock.local}: casi seguro es la misma prenda.</Notice>}
              </div>
            </Modal>
          )}

          {validando && (
            <Modal abierto onCerrar={() => setValidando(null)} titulo="Validar transferencia" ancho="xl" cerrarConFondo={false}>
              <EsperaTransferencia
                venta={validando}
                reglas={reglas}
                onLlego={(v) => {
                  setValidando(null)
                  llegoTransferencia(v)
                }}
                onCambio={() => {
                  setValidando(null)
                  refrescarPendientes()
                }}
                onSeguir={() => setValidando(null)}
                onCambiarPago={volverAlCarrito}
              />
            </Modal>
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
                  {!movil && (
<Button
                    variant={regalo ? 'solid' : 'outline'}
                    tone={regalo ? 'brand' : undefined}
                    aria-pressed={regalo}
                    onClick={() => setRegalo((r) => !r)}
                    iconLeft={regalo ? <Icono nombre="check" /> : undefined}
                    title="Imprime el ticket y el ticket de cambio (sin precios)"
                  >
                    Regalo
                  </Button>
)}
                  <Button size="lg" tone="success" variant="solid" disabled={!puedeConfirmar} loading={enviando} onClick={confirmar} iconLeft={<Icono nombre="check" />}>
                    {porTransferencia ? 'Validar transferencia' : 'Finalizar venta'} {c ? plata(c.total) : ''}
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
                  {!emailOk && (
                    <Field label="El mail está incompleto: corregilo o cobrá sin mail">
                      <CampoMail valor={bor.email} onCambio={(m) => setBor((b) => ({ ...b, email: m }))} sinMail />
                    </Field>
                  )}
                  <div style={{ display: 'grid', gap: space[2], fontSize: font.sm }}>
                    {bor.renglones.map((r, i) => (
                      <div key={claveDe(r.variante)} style={{ display: 'flex', justifyContent: 'space-between', gap: space[2] }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: weight.semibold, color: color.ink, textTransform: 'uppercase' }}>
                            {r.variante.product_name} {feriaIds.has(Number(r.variante.product_id)) && <Badge tone="warning">Oferta</Badge>}
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
                      <div style={{ color: color.mut, fontSize: font.sm }}>{varios ? 'Repartir lo que paga entre formas de pago' : 'Elegir con qué paga el total'}</div>
                    </div>
                    {!sinMedios && (
                      <Button
                        variant={varios ? 'soft' : 'outline'}
                        tone={varios ? 'brand' : 'neutral'}
                        size="sm"
                        aria-pressed={varios}
                        onClick={() => {
                          setVarios(!varios)
                          setPagos(varios ? [{ medio: null, base: '' }] : variosIniciales(pagos[0].medio))
                        }}
                      >
                        Varios pagos
                      </Button>
                    )}
                  </div>
                  {sinMedios ? (
                    <Notice tone="danger">Formas de pago sin cargar: correr sql/migrate-caja-medios.sql.</Notice>
                  ) : (
                    // Con «Varios pagos» las cuatro tarjetas siguen a la vista, apagadas (prototipo del 6-oct):
                    // las formas de pago se eligen en cada fila de abajo.
                    <div style={{ display: 'grid', gap: space[2] }}>
                    {hayFeria && (
                      <Notice tone="warning">
                        Hay productos en oferta. {msjOferta(reglas)}.{repartoOferta && hayResto ? ' Lo que no está en oferta se paga con cualquier forma de pago, en «Varios pagos».' : ''}
                      </Notice>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: space[2] }}>
                      {MEDIOS.map((medio) => {
                        const activa = !varios && pagos[0].medio === medio
                        // Lo que dice cada tarjeta con oferta sale de la configuración (Bruno, 12-oct: «es dinámico, obvio»).
                        const modoOferta = hayFeria ? ofertaDe(reglas)[medio] : null
                        const trabada = modoOferta === 'no'
                        const apagada = trabada || varios
                        const cuenta = reglas?.medios ? (() => { try { return cuentaDe(medio, reglas) } catch { return 0 } })() : 0
                        // El % que se dice: el de las reglas comerciales si la Caja cobra con ellas (`pctDeMedio`), si no el de la cuenta.
                        const regla = cuenta && reglas?.cuentas[cuenta] ? { ...reglas.cuentas[cuenta], descuento: pctDeMedio(medio, reglas, cuenta) ?? 0 } : undefined
                        const estilo = ESTILO_MEDIO[medio]
                        return (
                          <button
                            key={medio}
                            type="button"
                            onClick={() => setPagos([{ medio, base: '' }])}
                            aria-pressed={activa}
                            disabled={apagada}
                            title={trabada ? msjOferta(reglas) : varios ? 'Con «Varios pagos», la forma de pago se elige en cada pago' : undefined}
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
                              background: activa ? color.successBg : apagada ? color.bg : color.surface,
                              cursor: apagada ? 'not-allowed' : 'pointer',
                              opacity: apagada ? 0.5 : 1,
                            }}
                          >
                            <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: radius.md, background: estilo.fondo, color: estilo.tinta, flexShrink: 0 }}>
                              <Icono nombre={estilo.icono} size={22} />
                            </span>
                            <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: space[0.5] }}>
                              <span style={{ fontSize: font.md, fontWeight: weight.semibold, color: color.ink }}>{NOMBRE_MEDIO[medio]}</span>
                              <span style={{ fontSize: font.xs, color: color.mut }}>{regla?.nombre ?? '—'}</span>
                              {trabada ? (
                                <span style={{ fontSize: font.xs, color: color.warningInk, fontWeight: weight.bold }}>No aplica a productos en oferta</span>
                              ) : (
                                <>
                                  {regla && regla.descuento > 0 && <span style={{ fontSize: font.xs, color: color.successInk, fontWeight: weight.semibold }}>{regla.descuento}% de descuento{modoOferta && modoOferta !== 'descuento' ? ' (sin la oferta)' : ''}</span>}
                                  {(() => {
                                    const p = items.some((it) => 'oferta' in it && it.oferta) ? pctOfertaDeLinea('stunned', medio) : null
                                    return p != null && p !== regla?.descuento ? <span style={{ fontSize: font.xs, color: color.successInk, fontWeight: weight.semibold }}>{p}% en Stunned en oferta</span> : null
                                  })()}
                                  {modoOferta === 'recargo' && <span style={{ fontSize: font.xs, color: color.warningInk, fontWeight: weight.semibold }}>+{ofertaDe(reglas).recargo}% en productos en oferta</span>}
                                </>
                              )}
                            </span>
                            <span style={{ fontSize: font.lg, fontWeight: weight.bold, color: color.ink, fontVariantNumeric: 'tabular-nums' }}>
                              {!trabada && totalPorMedio[medio] != null ? plata(totalPorMedio[medio]) : '—'}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    {varios &&
                      (repartoOferta ? (
                        <>
                          <VariosPagos
                            titulo="La oferta"
                            pagos={pagosOferta}
                            setPagos={(p) => setPagos([...p, ...pagosResto])}
                            montos={c?.pagos.slice(0, pagosOferta.length).map((p) => p.monto) ?? null}
                            subtotal={subFeria}
                            aBase={aBaseOferta}
                            medios={mediosAparte}
                            minimo={1}
                          />
                          {hayResto && (
                            <VariosPagos
                              titulo="El resto"
                              pagos={pagosResto}
                              setPagos={(p) => setPagos([...pagosOferta, ...p])}
                              montos={c?.pagos.slice(pagosOferta.length).map((p) => p.monto) ?? null}
                              subtotal={subtotalFilas != null ? Math.round((subtotalFilas - subFeria) * 100) / 100 : null}
                              aBase={aBase}
                              medios={MEDIOS}
                              minimo={1}
                            />
                          )}
                        </>
                      ) : (
                        <VariosPagos pagos={pagos} setPagos={setPagos} montos={c?.pagos.map((p) => p.monto) ?? null} subtotal={subtotalFilas} aBase={aBase} medios={mediosConOferta} />
                      ))}
                    </div>
                  )}

                  {!sinMedios && preguntaCuotas && (
                    <div style={{ display: 'grid', gap: space[2] }}>
                      {preguntaCuotas && <SiNo pregunta="¿En 6 cuotas?" valor={seisCuotas} onCambio={setSeisCuotas} />}
                    </div>
                  )}

                  {porTransferencia && <DeteccionTransferencias admin={false} />}
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
                </div>
              </div>
            </Modal>
          )}
    </>
  )
  const buscadorJSX = (
    <>
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
                  placeholder={movil ? 'Nombre o código de la prenda' : 'Código de barras, SKU o nombre y talle'}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-label="Código de barras, SKU o nombre y talle"
                  className="pos-scan"
                  style={{ fontSize: 17, width: '100%', height: 52, paddingLeft: 44, borderRadius: radius.xl }}
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
              {!movil && !(sugeridas && sugeridas.q === codigo.trim()) && !candidatos && !aviso && (
                <div style={{ display: 'grid', justifyItems: 'center', textAlign: 'center', gap: space[1.5], padding: `${space[6]}px ${space[4]}px ${space[5]}px`, color: color.mut, fontSize: font.base }}>
                  {/* El lector de códigos (el ícono del prototipo; el kit ⛔ lo tiene). */}
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: color.mut2 }}>
                    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M14 8v8M17 8v8" />
                  </svg>
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
                  colorDe={colorDe}
                  feria={feriaIds.has(Number(eligiendo.product_id))}
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
    </>
  )
  const renglonesJSX = (
    <>
              {bor.renglones.length === 0 ? (
                <div style={{ padding: `${space[6]}px 0`, textAlign: 'center', color: color.mut, fontSize: font.base }}>Pedido vacío: escanear o buscar una prenda.</div>
              ) : (
                bor.renglones.map((r, i) => (
                  <FilaRenglon
                    key={claveDe(r.variante)}
                    r={r}
                    feria={feriaIds.has(Number(r.variante.product_id))}
                    tactil={movil}
                    cargandoPrecios={!datos || !tnIdx || !tnIdxStunned}
                    onCantidad={(n) => (n <= 0 ? sacarRenglon(i) : cambiarRenglon(i, { cantidad: n }))}
                    onPrecio={(p) => cambiarRenglon(i, { precio: p })}
                    onRebaja={(rb) => cambiarRenglon(i, { rebaja: rb })}
                    importe={filas?.[i]?.importe ?? null}
                    promos={(conPromo.items[i] as { promos?: string[] } | undefined)?.promos ?? null}
                    onSacar={() => sacarRenglon(i)}
                    avisoWeb={avisoWeb(r.variante, r.stock, r.cantidad)}
                    mirandoWeb={!pedidosWeb && !errPedidos}
                  />
                ))
              )}
    </>
  )
  const modalesCambioJSX = (
    <>
      {verVentaOriginal && <ModalVentaOriginal store={storeCaja() as MarcaErp} c={cambio} onCerrar={() => { setVerVentaOriginal(false); enfocar() }} />}
      {pidePin && (
        <ModalEncargada
          c={cambio}
          onCerrar={() => { setPidePin(false); cambio.setError(null) }}
          onListo={() => { setPidePin(false); cambio.setError(null); setPasoCambio(2); enfocar() }}
        />
      )}
      {cobrandoCambio && <ModalCobroCambio c={cambio} onCerrar={() => setCobrandoCambio(false)} />}
    </>
  )

  // ── Vista de CELULAR (Bruno, 27-oct): lo mismo, en una columna. Arriba una fila, en el medio buscar y el pedido,
  // abajo el total y «Continuar al cobro». El cobro, «Validar transferencia», la prenda repetida y los turnos son
  // los MISMOS diálogos de la PC (`Modal`): ⛔ se reescribe plata. ⛔ Imprime nada: el ticket va por mail.
  if (movil) {
    const opcion = (texto: string, accion: () => void, peligro = false) => (
      <Button
        key={texto}
        variant="outline"
        tone={peligro ? 'danger' : undefined}
        size="lg"
        fullWidth
        onClick={() => {
          setMenuMovil(false)
          accion()
        }}
      >
        {texto}
      </Button>
    )
    return (
      <ModalVarianteContext.Provider value="pos">
        <style>{`
          .pm { height: 100dvh; display: flex; flex-direction: column; background: var(--mo-canvas); }
          .pm-top { display: flex; align-items: center; gap: ${space[2]}px; min-height: 56px; padding: ${space[2]}px max(${space[3]}px, env(safe-area-inset-right, 0px)) ${space[2]}px max(${space[3]}px, env(safe-area-inset-left, 0px)); padding-top: max(${space[2]}px, env(safe-area-inset-top, 0px)); background: ${color.sideBg}; color: ${color.sideInk}; flex: none; }
          .pm-ic { width: 44px; height: 44px; border-radius: ${radius.lg}px; border: 1px solid ${color.sideLine}; background: transparent; color: ${color.sideInk}; display: grid; place-items: center; flex: none; cursor: pointer; padding: 0; }
          .pm-gn { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: ${color.sideInk2}; white-space: nowrap; flex: none; }
          .pm-gn::before { content: ""; width: 9px; height: 9px; border-radius: 50%; background: #17b26a; }
          .pm-gn.off::before { background: var(--mo-warning-solid); }
          .pm-scroll { flex: 1; min-height: 0; overflow-y: auto; display: grid; gap: ${space[3]}px; align-content: start; padding: ${space[3]}px max(${space[3]}px, env(safe-area-inset-right, 0px)) ${space[3]}px max(${space[3]}px, env(safe-area-inset-left, 0px)); }
          .pm-barra { flex: none; display: flex; align-items: center; gap: ${space[3]}px; background: ${color.surface}; border-top: 1px solid ${color.line}; padding: ${space[2]}px max(${space[3]}px, env(safe-area-inset-right, 0px)) max(${space[2]}px, env(safe-area-inset-bottom, 0px)) max(${space[3]}px, env(safe-area-inset-left, 0px)); }
        `}</style>
        <div className="pm">
          <header className="pm-top">
            <IrA href="/caja" className="pm-ic" aria-label="Volver" title="Volver" style={{ height: 44 }}>
              <Icono nombre="atras" size={22} />
            </IrA>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, fontWeight: weight.bold, fontSize: font.md }}>
              <b style={{ width: 28, height: 28, borderRadius: radius.pill, background: MARCA_CAJA.acento, color: MARCA_CAJA.acentoBg, display: 'grid', placeItems: 'center', fontSize: font.sm, flex: 'none' }}>{MARCA_CAJA.nombre[0]}</b>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Caja {MARCA_CAJA.nombre}</span>
            </span>
            <span className={`pm-gn${gnOk ? '' : ' off'}`} title={gnPorque} role="status">
              {gnOk ? 'Gestión Nube' : 'GN sin respuesta'}
            </span>
            <button type="button" className="pm-ic" onClick={() => setMenuMovil(true)} aria-label="Más opciones" title="Más opciones" style={{ height: 44 }}>
              <Icono nombre="puntos" size={22} />
            </button>
          </header>

          {modalesTurnoJSX}

          {/* La franja de pedidos web sin armar queda fija (Bruno: está bien así). */}
          <div style={{ flex: 'none' }}>
            <PedidosWebSinArmar datos={pedidosWeb} error={errPedidos} />
          </div>

          <div className="pm-scroll">
            {esperasJSX}
            {avisoPrecioLocalJSX}
            {avisoSinLlegarJSX}
            {ultimaJSX}
            {modalesJSX}
            <div>{buscadorJSX}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
              <h2 style={{ margin: 0, fontSize: font.lg, fontWeight: weight.bold, color: color.ink }}>{`Pedido · ${prendas === 1 ? '1 prenda' : `${prendas} prendas`}`}</h2>
              <Button size="sm" variant="ghost" onClick={vaciar} disabled={bor.renglones.length === 0} style={{ height: 44 }}>
                Vaciar pedido
              </Button>
            </div>
            <Card style={{ padding: `0 ${space[3]}px` }}>{renglonesJSX}</Card>
            {sinPrecio && <Notice tone="warning">Prenda sin precio: escribirlo en el renglón.</Notice>}
            <Card style={{ display: 'grid', gap: space[2], padding: space[3] }}>
              <Field label="Mail para el ticket (opcional)">
                <CampoMail valor={bor.email} onCambio={(m) => setBor((b) => ({ ...b, email: m }))} />
              </Field>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                <span style={{ color: color.mut }}>Descuento</span>
                <CampoRebaja valor={descuentoManual} onCambio={(rb) => setBor((b) => ({ ...b, descuentoVenta: rb }))} />
              </div>
              {!descuentoManual && conPromo.venta && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[2], fontSize: font.sm }}>
                  <Badge tone="success">{conPromo.venta.nombre}</Badge>
                  <b style={{ color: color.successInk, fontVariantNumeric: 'tabular-nums' }}>−{plata(conPromo.venta.pesos)}</b>
                </div>
              )}
            </Card>
          </div>

          <div className="pm-barra">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: font.sm, color: color.mut }}>{prendas === 0 ? 'Sin prendas' : prendas === 1 ? '1 prenda' : `${prendas} prendas`}</div>
              <div style={{ fontSize: font['2xl'], fontWeight: weight.heavy, color: color.brand, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                {bor.renglones.length === 0 ? plata(0) : mostrarCobro && c ? plata(c.total) : aPagar != null ? plata(aPagar) : '—'}
              </div>
            </div>
            <Button size="lg" tone="success" variant="solid" disabled={!puedeCobrar} onClick={abrirCobro} style={{ height: 52 }}>
              Continuar al cobro
            </Button>
          </div>
        </div>

        <Modal abierto={menuMovil} onCerrar={() => setMenuMovil(false)} titulo={`Caja ${MARCA_CAJA.nombre}`}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[2] }}>
            {opcion('Ventas', () => setVerVentas(true))}
            {opcion('Contar billetes', () => setPanelTurno('contar'))}
            {opcion('+ Ingreso', () => setPanelTurno('ingreso'))}
            {opcion('+ Salida', () => setPanelTurno('salida'))}
            {opcion(conSonido ? 'Con sonido' : 'Sin sonido', () => cambiarSonido(!conSonido))}
            {opcion('Cerrar caja', () => setPanelTurno('cerrar'), true)}
          </div>
        </Modal>
      </ModalVarianteContext.Provider>
    )
  }

  return (
    // 🔑 Todos los diálogos que se abren desde el POS —también los del turno y la calculadora, que se arman
    // en otros archivos— toman el aspecto de la Caja (`Modal` con `variante="pos"`, opt-in).
    <ModalVarianteContext.Provider value="pos">
    <div style={{ minHeight: '100vh', background: 'var(--mo-canvas)' }}>
      {/* La izquierda se estira; la derecha (el pedido) queda fija a la vista, con el total siempre abajo.
          En el teléfono, una abajo de la otra. La cabecera mide 56 px: el pedido se calcula contra eso. */}
      <style>{`
        .pos-top { display: flex; align-items: center; flex-wrap: wrap; gap: ${space[2]}px ${space[3]}px; min-height: 56px; padding: ${space[2]}px ${space[4]}px; background: ${color.sideBg}; color: ${color.sideInk}; }
        .pos-top .pos-tbtn { height: 36px; padding: 0 ${space[3]}px; border-radius: ${radius.md}px; border: 1px solid ${color.sideLine}; background: transparent; color: ${color.sideInk}; font-size: ${font.base}px; font-weight: ${weight.semibold}; white-space: nowrap; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: ${space[2]}px; }
        .pos-top .pos-tbtn:hover { background: ${color.sideHover}; }
        .pos-top .pos-tbtn.icono { width: 36px; padding: 0; }
        .pos-top .pos-tbtn[aria-pressed="true"] { color: ${color.sideAccent}; border-color: ${color.sideAccent}; }
        .pos-top .pos-tbtn.peligro { color: ${color.dangerBorder}; border-color: ${color.dangerBorder}; }
        .pos-gn { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: ${color.sideInk2}; white-space: nowrap; }
        .pos-gn::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: #17b26a; box-shadow: 0 0 0 3px rgba(23,178,106,.22); }
        .pos-gn.off::before { background: var(--mo-warning-solid); box-shadow: 0 0 0 3px rgba(220,104,3,.25); }
        .pos-grid { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: ${space[4]}px; padding: ${space[4]}px; align-items: start; }
        .pos-scan { border: 1.5px solid ${color.line2} !important; }
        .pos-scan:focus { border-color: ${color.brandSolid} !important; box-shadow: 0 0 0 4px ${color.brandRing} !important; }
        .pos-alt { font-size: ${font.xs}px; font-weight: ${weight.semibold}; background: rgba(255,255,255,.22); border-radius: 5px; padding: 1px 6px; margin-left: ${space[1]}px; }
        .pos-der { position: sticky; top: ${space[4]}px; max-height: calc(100vh - 56px - ${2 * space[4]}px); display: flex; flex-direction: column; min-height: 0; }
        .pos-renglones { flex: 1; min-height: 0; overflow: auto; }
        .caja-tarjeta { transition: border-color .12s, box-shadow .12s; }
        .caja-tarjeta:hover, .caja-tarjeta:focus-visible { border-color: ${color.brandBorder} !important; box-shadow: ${shadow.md}; }
        .caja-sacar:hover { background: ${color.dangerBg} !important; color: ${color.danger} !important; }
        .pos-buscar { position: relative; flex: 1; min-width: 0; }
        .pos-buscar svg { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: ${color.mut}; pointer-events: none; }
        .cobro-grid { display: grid; grid-template-columns: minmax(260px, 340px) minmax(0, 1fr); gap: ${space[4]}px; }
        @media (max-width: 1100px) { .pos-grid { grid-template-columns: minmax(0, 1fr) 350px; } .pos-turno { display: none; } }
        @media (max-width: 900px) { .cobro-grid { grid-template-columns: 1fr; } }
        @media (max-width: 860px) { .pos-grid { grid-template-columns: 1fr; } .pos-der { position: static; max-height: none; } }
      `}</style>
      <header className="pos-top">
        <IrA href="/caja" className="pos-tbtn icono" aria-label="Volver" title="Volver" style={{ height: 36 }}>
          <Icono nombre="atras" size={18} />
        </IrA>
        {/* El chip de la marca (prototipo del 5-oct): sale de la configuración (`lib/caja/marca.ts`). */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 28, padding: '0 11px 0 5px', borderRadius: radius.pill, background: MARCA_CAJA.acentoBg, color: MARCA_CAJA.acento, fontWeight: weight.bold, fontSize: font.base, whiteSpace: 'nowrap' }}>
          <b style={{ width: 19, height: 19, borderRadius: radius.pill, background: MARCA_CAJA.acento, color: MARCA_CAJA.acentoBg, display: 'grid', placeItems: 'center', fontSize: font.xs }}>{MARCA_CAJA.nombre[0]}</b>
          Caja {MARCA_CAJA.nombre}
        </span>
        <span className="pos-turno" style={{ fontSize: font.base, color: color.sideInk2, whiteSpace: 'nowrap' }}>
          caja abierta desde {horaAr(turno.abierto_en)} · {turno.abierto_por ?? ''}
        </span>
        <span className={`pos-gn${gnOk ? '' : ' off'}`} title={gnPorque} role="status">
          {gnOk ? 'Gestión Nube' : 'Gestión Nube sin respuesta'}
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
          {/* El cambio de Stunned (Bruno, 27-oct): sólo con Stunned vendiendo por el ERP. */}
          {config?.stunned_erp && (
            <button type="button" className="pos-tbtn" onClick={() => (enCambio ? salirDelCambio() : (cambio.setError(null), setEnCambio(true)))} aria-pressed={enCambio} style={{ height: 36 }}>
              ⇄ Cambios
            </button>
          )}
          <button type="button" className="pos-tbtn" onClick={() => setVerVentas(true)} style={{ height: 36 }}>
            Ventas
          </button>
          <button type="button" className="pos-tbtn" onClick={() => setPanelTurno('contar')} style={{ height: 36 }}>
            Contar billetes
          </button>
          <button type="button" className="pos-tbtn" onClick={() => setPanelTurno('salida')} style={{ height: 36 }}>
            + Salida
          </button>
          <button type="button" className="pos-tbtn" onClick={() => setPanelTurno('ingreso')} style={{ height: 36 }}>
            + Ingreso
          </button>
          <button type="button" className="pos-tbtn peligro" onClick={() => setPanelTurno('cerrar')} style={{ height: 36 }}>
            Cerrar caja
          </button>
        </div>
      </header>

      {modalesTurnoJSX}

      {enCambio && (
        <BandaCambio paso={pasoCambio} c={cambio} onBuscar={() => setVerVentaOriginal(true)} onSiguiente={siguienteDelCambio} onVolver={() => setPasoCambio(1)} onSalir={salirDelCambio} />
      )}
      {cambio.hecho && (
        <div style={{ padding: `${space[3]}px ${space[4]}px 0` }}>
          <Notice tone="success" onClose={() => cambio.setHecho(null)}>
            Cambio #{cambio.hecho.numero} registrado.{' '}
            {cambio.hecho.cobrado > 0 ? `Se cobraron ${plata(cambio.hecho.cobrado)}.` : cambio.hecho.aFavor > 0 ? `Quedan ${plata(cambio.hecho.aFavor)} a favor de la clienta${cambio.hecho.saldo != null ? ` (saldo: ${plata(cambio.hecho.saldo)})` : ''}.` : 'Sin diferencia.'}
          </Notice>
        </div>
      )}

      <div className="pos-grid">
        <div style={{ display: 'grid', gap: space[3], minWidth: 0 }}>
          {esperasJSX}
          {avisoPrecioLocalJSX}
          {avisoSinLlegarJSX}
          <PedidosWebSinArmar datos={pedidosWeb} error={errPedidos} />

          {ultimaJSX}

          {modalesJSX}
          {modalesCambioJSX}
          <SectionCard title={enCambio ? (pasoCambio === 1 ? 'Lo que devuelve' : 'Lo que se lleva') : 'Escanear o buscar'} actions={<span style={{ fontSize: font.sm, color: color.mut }}>Variantes: ↑/↓ y Enter</span>}>
            {buscadorJSX}
          </SectionCard>
        </div>

        <div className="pos-der">
          {enCambio ? (
            <PedidoCambio paso={pasoCambio} c={cambio} onCobro={() => setCobrandoCambio(true)} puedeCobrar={cambioListoParaCobrar} />
          ) : (
          <>
          {/* El pedido (prototipo del 5-oct): los renglones se desplazan y el pie —mail, total y «Continuar al
              cobro»— queda siempre a la vista. */}
          <Card style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[3], padding: `${space[3]}px ${space[4]}px`, borderBottom: `1px solid ${color.line}` }}>
              <h2 style={{ margin: 0, fontSize: font.lg, fontWeight: weight.bold, color: color.ink }}>{`Pedido · ${prendas === 1 ? '1 prenda' : `${prendas} prendas`}`}</h2>
              <Button size="sm" variant="ghost" onClick={vaciar} disabled={bor.renglones.length === 0}>
                Vaciar pedido
              </Button>
            </div>
            <div className="pos-renglones" style={{ padding: `0 ${space[4]}px` }}>
              {renglonesJSX}
            </div>
            {/* El pie SIEMPRE a la vista (prototipo del 6-oct): con el pedido vacío, TOTAL $0 y el cobro apagado. */}
            <div style={{ flexShrink: 0, display: 'grid', gap: space[2], padding: `${space[3]}px ${space[4]}px ${space[4]}px`, borderTop: `1px solid ${color.line}`, background: color.bg }}>
                <Field label="Mail para el ticket (opcional)">
                  <CampoMail valor={bor.email} onCambio={(m) => setBor((b) => ({ ...b, email: m }))} />
                </Field>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.md, color: color.ink2 }}>
                  <span>Subtotal</span>
                  <b style={{ fontVariantNumeric: 'tabular-nums' }}>{bor.renglones.length === 0 ? plata(0) : subtotalFilas != null ? plata(subtotalFilas) : '—'}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                  <span style={{ color: color.mut }}>Descuento</span>
                  <CampoRebaja valor={descuentoManual} onCambio={(rb) => setBor((b) => ({ ...b, descuentoVenta: rb }))} />
                </div>
                {!descuentoManual && conPromo.venta && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[2], fontSize: font.sm }}>
                    <Badge tone="success">{conPromo.venta.nombre}</Badge>
                    <b style={{ color: color.successInk, fontVariantNumeric: 'tabular-nums' }}>−{plata(conPromo.venta.pesos)}</b>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: space[2], borderTop: `1px dashed ${color.line2}` }}>
                  <span style={{ fontWeight: weight.heavy, fontSize: font.md, letterSpacing: '.05em', color: color.ink }}>TOTAL</span>
                  <span style={{ fontSize: 36, fontWeight: weight.heavy, letterSpacing: '-.02em', lineHeight: 1, color: color.brand, fontVariantNumeric: 'tabular-nums' }}>
                    {bor.renglones.length === 0 ? plata(0) : mostrarCobro && c ? plata(c.total) : aPagar != null ? plata(aPagar) : '—'}
                  </span>
                </div>
                {!mostrarCobro && <span style={{ color: color.mut, fontSize: font.sm }}>El descuento de la forma de pago se ve al cobrar.</span>}
                {sinPrecio && <Notice tone="warning">Prenda sin precio: escribirlo en el renglón.</Notice>}
                {!mostrarCobro && (
                  <Button size="lg" tone="success" variant="solid" fullWidth disabled={!puedeCobrar} onClick={abrirCobro} style={{ height: 52 }}>
                    Continuar al cobro <span className="pos-alt">Alt+C</span>
                  </Button>
                )}
              </div>
          </Card>
          </>
          )}
        </div>
      </div>
    </div>
    </ModalVarianteContext.Provider>
  )
}

/**
 * El POS de la marca de la Caja (V4, 12-oct): la de `?marca=` (la pone «Abrir POS» de la pestaña) o la del
 * shell; ⛔ fuerza Zattia. El precio sale de los datos de la marca del monitor ⇒ ⛔ se monta antes de que
 * la sesión esté en ESA marca: cargaría los datos de la otra (el payload de BDI pesa ~15 MB) y los precios
 * saldrían de ahí. `key` = la marca: cambiarla arma un POS nuevo, con SU borrador.
 */
export function CajaPOS() {
  const { marca, setMarca } = useSesion()
  const quiere = marcaParaPOS(useMarcaDeLaUrl(), marca)
  useEffect(() => {
    if (marca !== quiere) setMarca(quiere as Marca)
  }, [marca, quiere, setMarca])
  if (marca !== quiere) return <div style={{ minHeight: '100vh', background: color.bg, padding: space[4], color: color.mut }}>Abriendo la caja…</div>
  usarMarcaCaja(quiere)
  return <POS key={quiere} />
}
