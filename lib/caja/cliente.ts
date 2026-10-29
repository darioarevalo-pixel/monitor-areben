/**
 * Caja, del lado del navegador (`/api/datos?recurso=caja`).
 *
 * El dinero lo calcula `lib/caja/core.core.js` en las DOS puntas: la pantalla para mostrarlo y el
 * servidor otra vez al confirmar. Acá ⛔ hay reglas: sólo el camino a la API y sus tipos.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { LogoTicket } from '@/lib/caja/ticket'
import { storeCaja } from '@/lib/caja/marca'
import type { FormasDePago } from '@/lib/caja/formas-pago.core.js'

export type ReglaCuenta = { nombre: string; descuento: number; efectivo?: boolean; esperaPago?: boolean }
export type Medio = 'efectivo' | 'transferencia' | 'debito' | 'credito'
/** V4: las cuentas de oferta y las 6 cuotas pueden ⛔ existir en la tienda (BDI) ⇒ null. */
export type Medios = {
  efectivo: { normal: number; feria: number | null }
  transferencia: { opciones: number[]; feria: number | null }
  debito: { normal: number }
  credito: { normal: number; promo: number; seisCuotas: number | null; minSeisCuotas: number }
  tarjetaOferta?: number | null
}
/** `medios` ⛔ está hasta que se corre `sql/migrate-caja-medios.sql`. */
/** `feriaProductos` (Bruno, 5-oct): los productos de feria trabados —sólo efectivo o transferencia, a la cuenta de feria—. */
export type ProductoFeria = { id: number; nombre: string }
export type ModoOferta = 'final' | 'descuento' | 'recargo' | 'no'
export type Oferta = { efectivo: ModoOferta; transferencia: ModoOferta; debito: ModoOferta; credito: ModoOferta; recargo: number }
/** Una promo del local (W5). La regla vive en `lib/caja/promos.core.js`; ésta es la forma que guarda. */
export type TipoPromo = 'nxm' | 'segunda_unidad' | 'pct' | 'monto_minimo'
export type AlcancePromo = { tipo: 'todo' } | { tipo: 'categorias'; categorias: string[] } | { tipo: 'productos'; productos: ProductoFeria[] }
export type PromoCaja = { id: string; nombre: string; tipo: TipoPromo; lleva?: number; paga?: number; pct?: number; minimo?: number; pesos?: number; alcance: AlcancePromo; desde: string; hasta: string | null; activa: boolean }
/** `transferenciaA`: la cuenta de GN de la transferencia, YA resuelta por el servidor desde la cuenta de MP en uso (null sin mapeo). */
export type Reglas = { redondeo: number; cuentas: Record<number, ReglaCuenta>; medios?: Medios; transferenciaA?: number | null; transferenciaPorMp?: Record<string, number>; feriaProductos?: ProductoFeria[]; /** Las campañas de Liquidación que son feria (Bruno, 11-oct). */ feriaCampanias?: string[]; /** Los productos con el precio de esas campañas aplicado: los resuelve el servidor. */ feriaIdsCampania?: number[]; /** El precio de cada uno en su campaña de feria (13-oct): manda sobre el de Tienda Nube. */ feriaPrecios?: Record<string, number>; promos?: PromoCaja[]; /** Cómo se cobra la oferta por forma de pago (Bruno, 12-oct; `normalizarOferta`). */ oferta?: Partial<Oferta>; /** V4: false ⇒ la transferencia se confirma sin mirar Mercado Pago. */ verificarTransferencia?: boolean; transferenciaFija?: number | null; titulares?: Partial<Record<'areben' | 'dario' | 'bruno', number>> }
/** Un descuento a mano, a una prenda o a toda la venta. */
export type Rebaja = { tipo: 'pct' | 'pesos'; valor: number }
/** `ticket_logo`: el logo del ticket (null sin logo, o sin `sql/migrate-caja-logo.sql`). */
/** `versiones`: las de las listas que se guardan ENTERAS (promos, productos de feria): se mandan al guardar para ⛔ pisar a otro admin. */
/** `campaniasLiq`: sólo a un admin, para elegir cuáles son de feria. */
export type CampaniaLiq = { id: string; nombre: string; estado: string }
export type Config = { /** Stunned ya vende por el ERP (`CAJA_STUNNED_ERP`): un ticket es de UNA marca. */ stunned_erp?: boolean; /** Las ventas de Stunned todavía son de prueba (`CAJA_STUNNED_PRUEBA`): el cambio suelto va con ese modo. */ stunned_prueba?: boolean; /** El precio LOCAL de Stunned CARGADO en el ERP (Bruno 28-oct), product_id → precio; null si no se pudo leer. */ stunned_local?: Record<string, number> | null; /** Por qué no se pudo leer el precio local del ERP (la Caja cobra el de TN y lo avisa). */ stunned_local_error?: string; reglas: Reglas; politica_cambio: string | null; ticket_logo?: LogoTicket | null; /** El de Stunned (Bruno, 12-oct): sale si el ticket lleva prendas de Stunned. */ ticket_logo_stunned?: LogoTicket | null; versiones?: { promos: string; feriaProductos: string }; campaniasLiq?: CampaniaLiq[]; /** V4: la marca de la Caja (`tienda` = su Tienda Nube, de donde sale el logo). */ marca?: { store: string; nombre: string; tienda: string | null } }

/** Una cuenta de cobro de GN. `regla` en null ⇒ la Caja ⛔ la cobra (sin %, o con recargo). */
export type CuentaGN = { id: number; nombre: string; regla: ReglaCuenta | null }

export type Variante = { product_id: number; size_id: number; product_name: string; size_name: string; sku: string | null; barcode: string | null }
/** `vivo` = leído de GN recién; `espejo` = el de anoche, porque GN ⛔ contestó (`motivo`). */
/** `atras`: los estantes del depósito de atrás donde está el producto (Ubicaciones depósito); vacío = todo en percha. */
export type Stock = { local: number; deposito: number; fuente: 'vivo' | 'espejo' | 'erp'; motivo?: string; atras?: string[] }
/** `candidatos`: el código es de varias prendas, o se buscó por nombre. `local` = stock del local de anoche; `mas` = las que no entraron. */
export type Candidato = Variante & { local?: number }
export type Producto = { variante: Variante; stock: Stock } | { candidatos: Candidato[]; mas?: number }

/** `esperando_pago`: cobrada por transferencia, el pago todavía ⛔ apareció en MP (F5). `cancelada`: ⛔ llegó y la cajera la canceló. `descartada`: GN la rechazó y se resolvió que ⛔ se cobró (B2). */
/** ¿La venta ya llegó adonde va (GN, o el ERP si es de Stunned)? */
export const ventaLlego = (v: { estado: string }): boolean => v.estado === 'en_gn' || v.estado === 'en_erp'
/** El número de la venta: el de GN o, si es del ERP (Stunned), el del ERP; `null` mientras ⛔ llegó a ninguno. */
export const numeroDeLaVenta = (v: { gn_number: number | null; erp_numero?: number | null }): number | null => v.gn_number ?? v.erp_numero ?? null

export type EstadoVenta = 'borrador' | 'enviando' | 'en_gn' | 'en_erp' | 'error' | 'esperando_pago' | 'cancelada' | 'descartada'
/** B2: cómo se resolvió una venta que GN rechazó. */
export type Resolucion = { tipo: 'a_mano' | 'descartada'; por: string | null; en: string; nota: string; gn_number?: number }
/** B5: lo hecho a mano en la venta, en pesos (a la venta, a las prendas, bajando el precio). */
export type AMano = { venta: number; prendas: number; precios: number }
/** Un renglón como quedó guardado: con lo que necesita el ticket. */
export type RenglonGuardado = { product_id: number; size_id: number; cantidad: number; precio: number; importe?: number; nombre: string | null; talle: string | null; /** Para el logo de la marca (12-oct); las ventas anteriores ⛔ lo tienen. */ sku?: string | null; promos?: string[]; /** B5: el de la etiqueta, si la cajera lo cambió. */ precio_lista?: number; /** 14-oct: qué contestó la cajera al escanearla de nuevo. */ repetida?: { si: number; no: number; en: string[] } }
export type PagoGuardado = { cuenta: number; base: number; rebaja?: number; porcentaje: number; descuento: number; redondeo: number; monto: number }
export type Venta = {
  id: string
  estado: EstadoVenta
  pagos: PagoGuardado[]
  subtotal: number
  total: number
  paga_con: number | null
  email: string | null
  gn_number: number | null
  /** El número que le dio el ERP (ventas de Stunned, `destino = 'erp'`); `gn_number` es el de GN. */
  erp_numero?: number | null
  /** `erp` = venta de Stunned que va al ERP, ⛔ a GN (`destino` de `caja_venta`). */
  destino?: 'erp' | null
  /** Cómo quedó el ticket por mail: `encolado`, `ya estaba`, `sin automation`, `error: …`, o null. */
  ticket_mail?: string | null
  usuario: string | null
  intentos: number
  ultimo_error: string | null
  reintentable: boolean | null
  creada_en: string
  renglones?: RenglonGuardado[]
  /** Lo que tiene que llegar por transferencia; null si la venta ⛔ espera. */
  espera_monto?: number | null
  mp_pago_id?: string | null
  /** `varios`: completada sumando cobros; `otra_cuenta`: transfirió a otra cuenta nuestra (Bruno, 12-oct). */
  mp_cruce?: 'solo' | 'cajera' | 'admin' | 'varios' | 'otra_cuenta' | null
  /** Lo que llegó menos lo esperado (la tolerancia de $100; negativo = de menos). */
  mp_diferencia?: number | null
  /** `cambio_pago`: se canceló para cobrarla de otra forma (⛔ «no llegó»). */
  cancelada_motivo?: string | null
  a_mano?: AMano | null
  resolucion?: Resolucion | null
  /** Quién confirmó la transferencia y cómo: B3 (admin, con `comprobante`), los cobros sumados (`cobros`) o la otra cuenta (`titular`, `banco`, y si salió el `mail`). */
  confirmacion?: {
    por: string | null
    en: string
    comprobante?: string
    cobros?: Array<{ id: string; monto: number; cuando: string }>
    titular?: string
    banco?: string
    mail?: { enviado_en?: string; a?: string[]; error?: string }
  } | null
}

async function leer<T>(r: Response, fallo: string): Promise<T> {
  const j = await r.json().catch(() => null)
  if (!r.ok) {
    const e = new Error((j && j.error) || fallo) as Error & { status?: number; datos?: unknown }
    e.status = r.status
    e.datos = j
    throw e
  }
  return j as T
}

// V4: el `store` es el de la marca activa de la pestaña (`usarMarcaCaja`, lib/caja/marca.ts).
const get = <T>(q: string, fallo: string) => apiFetch(`/api/datos?recurso=caja&store=${storeCaja()}&${q}&nc=${Date.now()}`).then((r) => leer<T>(r, fallo))

const post = <T>(body: Record<string, unknown>, fallo: string) =>
  apiFetch('/api/datos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'caja', store: storeCaja(), ...body }),
  }).then((r) => leer<T>(r, fallo))

export const leerConfig = () => get<Config>('action=config', 'No se pudo leer la configuración de la Caja.')
export const leerCuentas = () => get<{ cuentas: CuentaGN[] }>('action=referencias', 'No se pudieron leer las cuentas de cobro.')
export const buscarProducto = (codigo: string) => get<Producto>(`action=producto&codigo=${encodeURIComponent(codigo)}`, 'No se pudo buscar la prenda.')
/** La lista mientras se escribe: con stock en el local, y aparte las que ⛔ tienen (el botón «Mostrar sin stock»). */
/** Un producto de la lista del POS (Bruno, 5-oct): sus variantes que coinciden, las del local primero. `local` = de anoche. */
export type ProductoLista = { product_id: number; product_name: string; local: number; variantes: Candidato[] }
export type ListaNombre = { conStock: ProductoLista[]; sinStock: ProductoLista[]; masCon: number; masSin: number }
export const buscarNombre = (q: string) => get<ListaNombre>(`action=buscar&q=${encodeURIComponent(q)}`, 'No se pudo buscar la prenda.')
export const elegirVariante = (v: Variante) =>
  get<Producto>(`action=producto&product_id=${v.product_id}&size_id=${v.size_id}`, 'No se pudo traer la prenda.')
export const leerPendientes = () => get<{ ventas: Venta[] }>('action=pendientes', 'No se pudieron leer las ventas pendientes.')
/** B1: las ventas del turno (sin id, el abierto), de la más nueva a la más vieja: para reimprimir. */
export const leerVentasTurno = (turnoId?: string) =>
  get<{ ventas: Venta[] }>(`action=ventas${turnoId ? `&turno=${encodeURIComponent(turnoId)}` : ''}`, 'No se pudieron leer las ventas de la caja.')
/** E: el POS manda solo las cobradas que ⛔ llegaron a GN (cada 3 min mientras está abierto). */
export const reintentarPendientes = () => post<{ intentadas: number; llegaron: number }>({ action: 'reintentar-pendientes' }, 'No se pudieron reintentar las ventas pendientes.')

/** `pos`: una venta hecha en el POS de GN (13-oct, las dos cajas en paralelo); si no, el cobro de un pedido web. */
export type CobroGN = { id: number; venta: number | null; tn: string | null; cliente: string | null; cuenta: number; monto: number; en: string; pos?: boolean }
/** v2, W3: el turno propio de la Caja (`lib/caja/cierre.core.js`). */
export type ResumenTurno = {
  porCuenta: { cuenta: number; nombre: string; efectivo: boolean; monto: number; cobros: number }[]
  /** Lo mismo sumado por forma de pago (13-oct). Un resumen guardado antes ⛔ lo trae. */
  porForma?: { nombre: string; efectivo: boolean; monto: number; cobros: number }[]
  total: number
  ventas: number
  /** `deEspera`: la parte en efectivo de las ventas que esperan la transferencia (A2): ya está en el cajón. */
  efectivo: { fondo: number; cobrado: number; deEspera?: number; cobradoGN: number; cobradoERP?: number; aportes?: number; salidas: number; esperado: number }
  /** W3b: el efectivo cobrado EN GN durante el turno que ⛔ es venta presencial. `null` = GN ⛔ contestó. */
  cobrosGN: CobroGN[] | null
  /** 29-oct: los pedidos web de Stunned cobrados en efectivo, del ERP (`id` = `erp-<número>`). `null` = el ERP ⛔ contestó; un
   *  resumen guardado antes ⛔ lo trae. */
  cobrosERP?: (Omit<CobroGN, 'id' | 'cuenta'> & { id: string })[] | null
  esperando: { id: string; estado: EstadoVenta; total: number; creada_en: string }[]
  sinGN: { id: string; estado: EstadoVenta; total: number; creada_en: string }[]
  /** A12: las anuladas del turno (⛔ suman): las anuladas a mano en GN y las del ERP (`estado = 'en_erp'`, Stunned, con su
   *  `erp_numero`). `null` = ⛔ se pudo mirar GN. */
  anuladasGN?: { id: string; estado?: string; total: number; creada_en: string; gn_number: number | null; erp_numero?: number | null }[] | null
  /** B5: lo hecho a mano en el turno. */
  aMano?: { ventas: number } & AMano
}
/** Fase B: cuántos billetes de cada valor (`{ "20000": 3 }`). El total lo rearma el servidor. */
export type Conteo = Record<string, number>
export type ConteoGuardado = { billetes: Conteo; total: number; en: string; por: string | null; esperado?: number; diferencia?: number }
export type Conteos = { apertura?: ConteoGuardado; intermedios?: ConteoGuardado[]; cierre?: ConteoGuardado }
/** Un movimiento de efectivo del turno: `salida` resta, `aporte` suma (B4). El anulado queda tachado. */
export type SalidaTurno = { id: string; tipo?: 'salida' | 'aporte'; monto: number; motivo: string; usuario: string | null; usuario_cuenta?: string | null; creado_en: string; anulado_en?: string | null; anulado_por?: string | null; anulado_motivo?: string | null }
export type Turno = {
  id: string
  abierto_en: string
  abierto_por: string | null
  /** Quién abrió, con un dato que ⛔ cambia (el mail del padrón): la fase C lo usa para el POS. */
  abierto_por_usuario?: string | null
  fondo: number
  cerrado_en: string | null
  cerrado_por: string | null
  contado: number | null
  esperado: number | null
  nota: string | null
  conteos?: Conteos | null
  resumen?: ResumenTurno & { diferencia?: number }
  salidas?: SalidaTurno[]
}
/**
 * `liviano`: la fila sola, sin `resumen` ni `ultimos` (⛔ consulta GN): para dibujar el POS sin esperar.
 * `fresco`: relee los cobros de GN sin el cache de 60 s (la ventana de cierre, 22-oct).
 */
export const leerTurno = (liviano = false, fresco = false) =>
  get<{ turno: Turno | null; ultimos: Turno[] }>(liviano ? 'action=turno&liviano=1' : fresco ? 'action=turno&fresco=1' : 'action=turno', 'No se pudo leer la caja.')
export const abrirTurno = (fondo: number, conteo?: Conteo | null) =>
  post<{ turno: Turno }>({ action: 'abrir-turno', fondo, ...(conteo ? { conteo } : {}) }, 'No se pudo abrir la caja.')
export const sacarEfectivo = (monto: number, motivo: string, tipo: 'salida' | 'aporte' = 'salida') =>
  post<{ turno: Turno }>({ action: 'salida', monto, motivo, tipo }, tipo === 'aporte' ? 'No se pudo registrar el ingreso.' : 'No se pudo registrar la salida.')
/** B4: anula una salida o un aporte del turno abierto (⛔ se borra: queda tachado). */
export const anularMovimiento = (id: string, motivo: string) => post<{ turno: Turno }>({ action: 'anular-mov', id, motivo }, 'No se pudo anular.')
/** `sinCobrosGN`: cerrar aunque GN ⛔ contestó los cobros web (A3); el servidor exige la nota. */
export const cerrarTurno = (id: string, contado: number, nota: string, conteo?: Conteo | null, sinCobrosGN = false) =>
  post<{ turno: Turno }>({ action: 'cerrar-turno', id, contado, nota, ...(conteo ? { conteo } : {}), ...(sinCobrosGN ? { sinCobrosGN: true } : {}) }, 'No se pudo cerrar la caja.')
/** El conteo intermedio: ⛔ cierra nada, queda en el turno con lo que tenía que haber. */
export const contarBilletes = (id: string, conteo: Conteo) => post<{ turno: Turno }>({ action: 'contar', id, conteo }, 'No se pudo guardar el conteo.')

/** Un pedido de Tienda Nube por empaquetar (v2, W1). `sinPagar`: «a convenir», paga al retirar. `horas` desde que se pagó (o se hizo). */
export type PedidoWeb = {
  numero: number
  sinPagar: boolean
  desde: string | null
  horas: number | null
  envioTipo: string | null
  envio: string | null
  prendas: Array<{ sku: string; nombre: string; cantidad: number }>
  sinSku: number
}
/** `porSku`: qué pedidos llevan cada variante. `noLeidas`: órdenes del rango que TN ⛔ devolvió. `guardada`: la del aparato, mientras llega la nueva. */
export type PedidosWeb = { pedidos: PedidoWeb[]; porSku: Record<string, Array<{ numero: number; cantidad: number; sinPagar: boolean }>>; noLeidas: number; leidoEn: string; guardada?: boolean }
export const leerPedidosWeb = () => get<PedidosWeb>('action=pedidos-web', 'No se pudieron leer los pedidos web.')

/** `rebaja` es SÓLO la de la cajera: la promo la aplica el servidor (con `categorias`, las de Tienda Nube). */
export type ItemConfirmar = { product_id: number; size_id: number; cantidad: number; precio: number; rebaja?: Rebaja | null; categorias?: string[]; nombre?: string; talle?: string; foto?: string | null; /** B5: el de la etiqueta (para mostrar si la cajera lo cambió). */ precioLista?: number | null }
export type PagoConfirmar = { cuenta: number; base?: number }

/** `reintentable` sólo importa si la venta quedó en `error`. */
export type Resultado = { venta: Venta; reintentable?: boolean }

export const confirmarVenta = (v: { id: string; items: ItemConfirmar[]; pagos: PagoConfirmar[]; total: number; descuentoVenta: Rebaja | null; email: string | null; pagaCon: number | null }) =>
  post<Resultado>({ action: 'confirmar', ...v }, 'No se pudo confirmar la venta.')

/** Un pago de MP que puede ser el de la venta. ⛔ Trae datos de quien pagó. */
export type PagoMP = { id: string; monto: number; cuando: string; origen: 'mp' | 'banco' | 'tarjeta' | 'otro' }
export type Cruce =
  | { estado: 'esperando' }
  | { estado: 'llego'; por: 'solo' | 'cajera'; pago: PagoMP }
  | { estado: 'elegir'; candidatos: Array<PagoMP & { diferencia: number }>; motivo: string }
  | { estado: 'invalido' | 'sin_cuenta'; motivo: string }
  | { estado: 'ya' | 'cancelada' }

/** ¿Llegó la transferencia? Con `pago`, la cajera eligió cuál es. Si llegó, la venta ya salió a GN. */
/**
 * Un pago reciente de la cuenta de MP (paso «Validar transferencia», Bruno 12-oct). `coincide`: cae en la
 * tolerancia del monto; `diferencia`: el pago menos lo esperado.
 */
export type PagoReciente = PagoMP & { coincide: boolean; diferencia: number }
/** `todos`: la cajera está sumando cobros y necesita ver más que los últimos 5. */
export const cruzarVenta = (id: string, pago?: string, todos?: boolean) =>
  post<Resultado & { cruce: Cruce; recientes?: PagoReciente[]; cuentaMp?: string | null }>({ action: 'cruzar', id, ...(pago ? { pago } : {}), ...(todos ? { todos: true } : {}) }, 'No se pudo mirar Mercado Pago.')
/** Transfirió de menos y mandó el resto: los pagos de MP que juntos completan la venta (Bruno, 12-oct). */
export const confirmarVarios = (id: string, pagos: string[]) =>
  post<Resultado>({ action: 'confirmar-varios', id, pagos }, 'No se pudieron confirmar los cobros.')
/** Transfirió a OTRA cuenta nuestra (Bruno, 12-oct): se confirma ya y sale un mail a Darío y Bruno. */
export const confirmarOtraCuenta = (id: string, titular: string, banco: string) =>
  post<Resultado & { mail?: { error?: string } }>({ action: 'confirmar-otra-cuenta', id, titular, banco }, 'No se pudo confirmar la transferencia.')

/** `cambio_pago`: la clienta paga de otra forma y el carrito vuelve al POS (Bruno, 12-oct). */
export const cancelarVenta = (id: string, motivo?: 'cambio_pago') => post<{ venta: Venta }>({ action: 'cancelar', id, ...(motivo ? { motivo } : {}) }, 'No se pudo cancelar la venta.')

export const reintentarVenta = (id: string) => post<Resultado>({ action: 'reintentar', id }, 'No se pudo reintentar la venta.')
/** B2: la venta que GN RECHAZÓ: cargada a mano en GN (con su número) o descartada (sólo admin). */
export const resolverVenta = (id: string, como: 'a_mano' | 'descartar', nota: string, gnNumber?: number) =>
  post<{ venta: Venta }>({ action: 'resolver', id, como, nota, ...(gnNumber ? { gn_number: gnNumber } : {}) }, 'No se pudo resolver la venta.')
/** B3: sólo admin: la transferencia que el cruce ⛔ ve, confirmada con el comprobante. */
export const confirmarTransferencia = (id: string, comprobante: string) =>
  post<Resultado>({ action: 'confirmar-transferencia', id, comprobante }, 'No se pudo confirmar la transferencia.')

export const guardarPolitica = (texto: string) => post<{ politica_cambio: string | null }>({ action: 'politica', texto }, 'No se pudo guardar la política de cambio.')

/** Sólo admin: a qué cuenta van las transferencias y el modo feria (bajadas de línea). */
/** La cuenta de Mercado Pago donde se detectan las transferencias (la de Pagos recibidos). `cuentas` sólo llega a un admin. */
export type CuentaMp = { cuenta_id: number; nombre: string }
export const leerCuentasMp = () => get<{ enUso: CuentaMp | null; cuentas?: CuentaMp[] }>('action=cuentas-mp', 'No se pudo leer la cuenta de Mercado Pago.')
export const usarCuentaMp = (cuenta_id: number) => post<{ enUso: CuentaMp }>({ action: 'usar-mp', cuenta_id }, 'No se pudo cambiar la cuenta de Mercado Pago.')
/** El logo propio de la marca de la Caja (`zattia` | `bdi`), o el de Stunned (sólo en la Caja de Zattia). */
export type MarcaLogo = string
export const guardarLogo = (logo: LogoTicket | null, marca: MarcaLogo = storeCaja()) =>
  post<{ ticket_logo: LogoTicket | null; ticket_logo_stunned: LogoTicket | null }>({ action: 'logo', logo, marca }, 'No se pudo guardar el logo.')
/** V4: la URL del logo de la Tienda Nube de la marca (por defecto, el del ticket). Sólo admin. */
export const leerLogoTN = () => get<{ url: string }>('action=logo-tn', 'No se pudo traer el logo de Tienda Nube.')
/** V4: las formas de pago de la tienda (cuenta de GN, %, cuotas, oferta, verificación). Sólo admin. */
export const guardarFormasDePago = (formas: FormasDePago) =>
  post<{ reglas: Reglas; versiones?: Versiones }>({ action: 'formas-pago', formas }, 'No se pudieron guardar las formas de pago.')
/** Sólo admin: la lista ENTERA de promos (W5). */
/** `version`: la de la lista que se editó (`Config.versiones`); si otro admin la cambió, 409. */
export type Versiones = NonNullable<Config['versiones']>
export const guardarPromos = (promos: PromoCaja[], version?: string) =>
  post<{ reglas: Reglas; versiones?: Versiones }>({ action: 'promos', promos, ...(version ? { version } : {}) }, 'No se pudieron guardar las promos.')
export const guardarBajadas = (b: { transferenciaPorMp?: { mp: number; gn: number }; feriaProductos?: ProductoFeria[]; feriaCampanias?: string[]; oferta?: Oferta; version?: string }) =>
  post<{ reglas: Reglas; versiones?: Versiones }>({ action: 'bajadas', ...b }, 'No se pudo guardar.')

/** W6: un lote de gift cards (tarjetas físicas, nacen INACTIVAS). Sólo admin. */
export type LoteGift = { id: number; cantidad: number; nota: string | null; creado_en: string; creado_por: string | null }
export const leerLotesGift = () => get<{ lotes: LoteGift[] }>('action=gift-lotes', 'No se pudieron leer los lotes de gift cards.')
export const generarLoteGift = (cantidad: number, nota: string) => post<{ lote: LoteGift }>({ action: 'gift-lote', cantidad, nota }, 'No se pudo generar el lote.')
/** El CSV para la imprenta (código en las barras, número impreso). */
export const csvLoteGift = (lote: number) => get<{ nombre: string; csv: string }>(`action=gift-lote&lote=${lote}`, 'No se pudo descargar el lote.')
