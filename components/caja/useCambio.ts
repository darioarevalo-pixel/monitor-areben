'use client'

/**
 * El CAMBIO de la Caja, en un solo lugar: lo usan el POS (`CajaPOS`, modo «Cambios») y la pantalla del ERP (`CambioCaja`).
 * ⛔ Reglas copiadas: el importe de lo que se lleva es `renglones`, la prenda repetida es `exigirDevolucion`, la diferencia y el
 * cobro con el descuento de la forma de pago son los de `lib/erp/venta.core.js` (los mismos que rearma el servidor).
 *
 * Tres orígenes de lo que se devuelve (Bruno, 27-oct):
 *  - `erp`: una venta del ERP (la ficha); el motor ata el cambio a ella.
 *  - `gn`: una venta de Gestión Nube (la ven del espejo); el servidor pone lo que se pagó por unidad y frena devolver de más.
 *  - `suelto`: sin ticket. Lo que se pagó lo escribe la cajera y la encargada autoriza con su PIN.
 * Los dos últimos son sólo de Stunned (la base y la Caja son las de Zattia, la línea es `stunned`).
 */

import { useEffect, useMemo, useState } from 'react'
import { cuentaDeMedio, renglones } from '@/lib/caja/core.core.js'
import { exigirDevolucion } from '@/lib/caja/repetida.core.js'
import type { Config, Variante } from '@/lib/caja/cliente'
import { buscarVentas, cambiarVenta, leerFichaDeVenta, leerSaldo, leerVentaGnCambio, verificarPin, type CruceCambio, type FichaDeVenta, type MarcaErp, type PagoMp, type VentaGnCambio } from '@/lib/erp/cliente'
import { cobroDelCambio, diferenciaDeCambio, diferenciaDeCambioSuelto } from '@/lib/erp/venta.core.js'
import type { ComprobanteCambio } from '@/lib/caja/ticket'
import { esStunned as skuEsStunned } from '@/lib/lineas'

export type MedioCambio = 'efectivo' | 'transferencia' | 'debito' | 'credito'
export const MEDIOS_CAMBIO: MedioCambio[] = ['efectivo', 'transferencia', 'debito', 'credito']
const CADA_MS = 5000

/** Una línea de la venta original: lo que vendió, lo que pagó por unidad y cuántas ya se cambiaron. */
export type Vendida = {
  clave: string; productId: number; sizeId: number; sku: string | null; nombre: string; talle: string
  cantidad: number; precio: number; cambiado: number
  /** Sólo en una venta del ERP: la línea y su importe exacto (la diferencia se cuenta con él). */
  lineaId?: string; importe?: number
}
export type Origen =
  | { tipo: 'gn'; id: string; numero: string | number; fecha: string | null; cliente: string | null; prueba: boolean }
  | { tipo: 'erp'; ventaId: string; numero: number; cliente: string | null; prueba: boolean; gnSaleId: string | null; stunned: boolean }
  | { tipo: 'suelto' }
export type VentaOriginal = { origen: Origen; vendidas: Vendida[] }
export type Devuelta = { clave: string; productId: number; sizeId: number; sku: string | null; nombre: string; talle: string; cantidad: number; precio: number | ''; lineaId?: string }
export type Nueva = { variante: Variante; cantidad: number; precio: number | '' }
export type Hecho = { numero: number; cobrado: number; aFavor: number; saldo: number | null; ncPendiente: boolean; /** Para imprimir (y reimprimir) el comprobante del cambio. */ comprobante: ComprobanteCambio }
export type Espera = { desde: string; monto: number; cruce: CruceCambio; recientes: PagoMp[] }

const nuevoId = () => crypto.randomUUID()
export const claveDePrenda = (productId: number, sizeId: number) => `${productId}_${sizeId}`

/** Una venta de Gestión Nube (la vista `venta-gn-cambio`): lo que vendió de Stunned y lo que se pagó por unidad. */
export function ventaDeGn(g: VentaGnCambio): VentaOriginal & { total: number } {
  return {
    origen: { tipo: 'gn', id: g.venta.id, numero: g.venta.numero, fecha: g.venta.fecha, cliente: g.venta.cliente, prueba: g.venta.prueba },
    vendidas: g.lineas.map((l) => ({ clave: claveDePrenda(l.product_id, l.size_id), productId: l.product_id, sizeId: l.size_id, sku: l.sku, nombre: l.nombre ?? `Producto ${l.product_id}`, talle: l.talle ?? String(l.size_id), cantidad: l.cantidad, precio: l.precio, cambiado: l.cambiado })),
    total: g.lineas.reduce((s, l) => s + l.precio * l.cantidad, 0),
  }
}

/** Una venta del ERP (su ficha): cada línea con su importe exacto y cuántas unidades ya se cambiaron. */
export function ventaDeFicha(f: FichaDeVenta): VentaOriginal & { total: number } {
  return {
    origen: { tipo: 'erp', ventaId: f.venta.id, numero: f.venta.numero, cliente: f.cliente?.nombre ?? null, prueba: f.venta.prueba, gnSaleId: f.venta.gnSaleId, stunned: f.venta.marca === 'stunned' },
    vendidas: f.lineas.filter((l) => l.cantidad > 0 && !l.devuelta).map((l) => ({ clave: l.id, productId: Number(l.producto), sizeId: Number(l.talle), sku: l.sku, nombre: l.nombre ?? `Producto ${l.producto}`, talle: l.talleNombre ?? l.talle, cantidad: l.cantidad, precio: Math.round((l.importe / l.cantidad) * 100) / 100, cambiado: l.cambiado, lineaId: l.id, importe: l.importe })),
    total: f.venta.total,
  }
}

/** Una venta que salió de la búsqueda: lo que se ve en la lista y cómo abrirla. */
export type FilaVenta = { clave: string; numero: string | number; cliente: string | null; fecha: string | null; total: number; rotulo: 'ERP' | 'Gestión Nube'; prueba: boolean; abrir: () => Promise<VentaOriginal & { total: number }> }

/**
 * Buscar la venta original: del ERP por número o cliente y, con `gn` (Stunned) y un número, también la de Gestión Nube con ese
 * número. `soloStunned` (el POS, que sólo cambia Stunned) saca las ventas de Zattia; la pantalla del ERP las deja: ⛔ se esconde el
 * cambio de Zattia cuando Stunned se prende. Devuelve las filas y, aparte, por qué no se encontró la de Gestión Nube (para decirlo).
 */
export async function buscarVentasDelCambio(store: MarcaErp, texto: string, { gn, soloStunned }: { gn: boolean; soloStunned: boolean }): Promise<{ filas: FilaVenta[]; aviso: string | null }> {
  const filas: FilaVenta[] = []
  let aviso: string | null = null
  const t = texto.trim()
  if (gn && /^\d{1,12}$/.test(t)) {
    try {
      const g = ventaDeGn(await leerVentaGnCambio(t))
      const o = g.origen as Extract<Origen, { tipo: 'gn' }>
      filas.push({ clave: `gn-${o.id}`, numero: o.numero, cliente: o.cliente, fecha: o.fecha, total: g.total, rotulo: 'Gestión Nube', prueba: o.prueba, abrir: async () => g })
    } catch (e) {
      aviso = e instanceof Error ? e.message : null
    }
  }
  const r = await buscarVentas(store, { q: t, desde: '', hasta: '' })
  for (const v of r.ventas.filter((x) => x.tipo === 'venta' && x.estado === 'confirmada' && (!soloStunned || x.marca === 'stunned'))) {
    filas.push({ clave: `erp-${v.id}`, numero: v.numero, cliente: v.cliente, fecha: v.ocurridaEn, total: v.total, rotulo: 'ERP', prueba: v.prueba, abrir: async () => ventaDeFicha(await leerFichaDeVenta(store, v.id)) })
  }
  return { filas, aviso: filas.length ? null : aviso ?? 'No hay ventas con esa búsqueda.' }
}

type Entrada = {
  store: MarcaErp
  config: Config | null
  /** El precio de la etiqueta de la prenda (la regla de la Caja: `precioDeCaja`), o null si todavía no está. */
  precioDe: (v: Variante) => number | null
  /** ¿La prenda es de Stunned? (la misma pregunta que el precio). */
  esStunned: (v: Variante) => boolean
}

export function useCambio({ store, config, precioDe, esStunned }: Entrada) {
  const [venta, setVenta] = useState<VentaOriginal | null>(null)
  const [devueltas, setDevueltas] = useState<Devuelta[]>([])
  const [nuevas, setNuevas] = useState<Nueva[]>([])
  const [medio, setMedio] = useState<MedioCambio | ''>('')
  const [clienta, setClienta] = useState({ doc: '', nombre: '', whatsapp: '' })
  const [espera, setEspera] = useState<Espera | null>(null)
  const [comprobante, setComprobante] = useState('')
  /** El saldo a favor de la clienta (por DNI) y si se usa para pagar la diferencia. */
  const [saldo, setSaldo] = useState<{ doc: string; monto: number } | null>(null)
  const [usaSaldo, setUsaSaldo] = useState(false)
  /** La encargada que autoriza el cambio sin ticket: quién y su PIN (sólo en memoria). */
  const [encargada, setEncargada] = useState({ persona: '', pin: '' })
  const [id, setId] = useState(nuevoId)
  const [hecho, setHecho] = useState<Hecho | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Cada sondeo fallido suma una vuelta: el MISMO error no cambia el estado y el efecto no se volvería a armar.
  const [, setVuelta] = useState(0)
  const [trabajando, setTrabajando] = useState(false)

  const origen = venta?.origen ?? null
  const tipo = origen?.tipo ?? null
  const vendidas = useMemo(() => venta?.vendidas ?? [], [venta])

  async function correr(fn: () => Promise<void>, fallo: string) {
    setTrabajando(true)
    try {
      await fn()
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : fallo)
    } finally {
      setTrabajando(false)
    }
  }

  function empezarDeNuevo() {
    setVenta(null)
    setDevueltas([])
    setNuevas([])
    setMedio('')
    setClienta({ doc: '', nombre: '', whatsapp: '' })
    setEspera(null)
    setComprobante('')
    setSaldo(null)
    setUsaSaldo(false)
    setEncargada({ persona: '', pin: '' })
    setId(nuevoId())
  }

  /** Con una venta elegida (gn o erp) no se devuelve de más: la regla de la Caja, contando lo ya cambiado. */
  function validar(v: VentaOriginal | null, lista: Devuelta[]) {
    if (!v || v.origen.tipo === 'suelto') return
    const como = (x: { productId: number; sizeId: number; cantidad: number; nombre: string; talle: string }) => ({ product_id: x.productId, size_id: x.sizeId, cantidad: x.cantidad, nombre: x.nombre, talle: x.talle })
    exigirDevolucion({
      vendidas: v.vendidas.map(como),
      yaDevueltas: v.vendidas.map((x) => como({ ...x, cantidad: x.cambiado })),
      devuelve: lista.map(como),
    })
  }

  /** Elegir la venta original sin devolver nada todavía (la pantalla del ERP marca después, producto por producto). */
  function elegirVenta(v: VentaOriginal) {
    setDevueltas([])
    setNuevas([])
    setVenta(v)
  }

  /** Elegir una venta y llevar a la devolución las cantidades marcadas (1 por defecto en la pantalla que la elige). */
  function devolverDeVenta(nueva: VentaOriginal, cantidades: Record<string, number>) {
    const mismaVenta = venta && venta.origen.tipo === nueva.origen.tipo && JSON.stringify(venta.origen) === JSON.stringify(nueva.origen)
    if (devueltas.length && !mismaVenta) throw new Error('Ya hay productos devueltos de otra venta o sin venta: sacalos antes de elegir esta venta.')
    const sumadas = nueva.vendidas
      .filter((l) => (cantidades[l.clave] || 0) > 0)
      .map((l): Devuelta => ({
        clave: l.clave, productId: l.productId, sizeId: l.sizeId, sku: l.sku, nombre: l.nombre, talle: l.talle,
        cantidad: (devueltas.find((d) => d.clave === l.clave)?.cantidad ?? 0) + cantidades[l.clave],
        precio: l.precio, ...(l.lineaId ? { lineaId: l.lineaId } : {}),
      }))
    if (!sumadas.length) throw new Error('Marcá cuántas unidades devuelve.')
    const lista = [...devueltas.filter((d) => !sumadas.some((s) => s.clave === d.clave)), ...sumadas]
    validar(nueva, lista)
    setVenta(nueva)
    setDevueltas(lista)
  }

  /** Una prenda escaneada o tocada en el paso 1: de la venta elegida, o suelta (sin venta). */
  function devolverPrenda(v: Variante) {
    if (venta && venta.origen.tipo !== 'suelto') {
      const l = vendidas.find((x) => x.productId === v.product_id && x.sizeId === v.size_id)
      if (!l) throw new Error(`${v.product_name} (${v.size_name}) no está en esa venta: no se puede devolver con este ticket.`)
      cambiarCantidadDevuelta(l.clave, (devueltas.find((d) => d.clave === l.clave)?.cantidad ?? 0) + 1)
      return
    }
    if (!esStunned(v)) throw new Error('El cambio sin venta es de productos de Stunned.')
    const clave = claveDePrenda(v.product_id, v.size_id)
    setVenta({ origen: { tipo: 'suelto' }, vendidas: [] })
    setDevueltas((xs) => {
      const i = xs.findIndex((x) => x.clave === clave)
      if (i >= 0) return xs.map((x, j) => (j === i ? { ...x, cantidad: x.cantidad + 1 } : x))
      return [...xs, { clave, productId: v.product_id, sizeId: v.size_id, sku: v.sku, nombre: v.product_name, talle: v.size_name, cantidad: 1, precio: precioDe(v) ?? '' }]
    })
  }

  function cambiarCantidadDevuelta(clave: string, n: number) {
    const lista = devueltas.flatMap((d) => (d.clave !== clave ? [d] : n > 0 ? [{ ...d, cantidad: n }] : []))
    if (!devueltas.some((d) => d.clave === clave) && n > 0) {
      const l = vendidas.find((x) => x.clave === clave)
      if (!l) return
      lista.push({ clave, productId: l.productId, sizeId: l.sizeId, sku: l.sku, nombre: l.nombre, talle: l.talle, cantidad: n, precio: l.precio, ...(l.lineaId ? { lineaId: l.lineaId } : {}) })
    }
    validar(venta, lista)
    setDevueltas(lista)
    // Sin nada devuelto y sin venta elegida, se vuelve al principio: la próxima prenda decide de nuevo si es suelta.
    if (!lista.length && venta?.origen.tipo === 'suelto') setVenta(null)
  }

  const ponerPrecioDevuelta = (clave: string, p: number | '') => setDevueltas((xs) => xs.map((x) => (x.clave === clave ? { ...x, precio: p } : x)))

  function sumarNueva(v: Variante) {
    // Un cambio es de UNA marca (Bruno, 26-oct): con el cambio suelto de Stunned, lo que se lleva también es de Stunned.
    if (tipo && tipo !== 'erp' && !esStunned(v)) throw new Error('Lo que se lleva tiene que ser de Stunned: un cambio es de una sola marca.')
    setNuevas((xs) => {
      const i = xs.findIndex((x) => x.variante.product_id === v.product_id && x.variante.size_id === v.size_id)
      if (i >= 0) return xs.map((x, j) => (j === i ? { ...x, cantidad: x.cantidad + 1 } : x))
      return [...xs, { variante: v, cantidad: 1, precio: precioDe(v) ?? '' }]
    })
  }
  const cambiarNueva = (i: number, cambio: Partial<Nueva>) => setNuevas((xs) => xs.map((x, j) => (j === i ? { ...x, ...cambio } : x)))
  const cambiarCantidadNueva = (i: number, c: number) => setNuevas((xs) => (c <= 0 ? xs.filter((_, j) => j !== i) : xs.map((x, j) => (j === i ? { ...x, cantidad: c } : x))))

  // ── Lo que se lleva, con el importe de la Caja (`renglones`); sin precio todavía no se puede cobrar ──
  const sinPrecio = nuevas.some((n) => !(Number(n.precio) > 0))
  const sinPrecioDevuelta = tipo === 'suelto' && devueltas.some((d) => !(Number(d.precio) > 0))
  const items = nuevas.map((n) => ({ product_id: n.variante.product_id, size_id: n.variante.size_id, cantidad: n.cantidad, precio: Number(n.precio), sku: n.variante.sku }))
  let filas: Array<{ importe: number }> = []
  try {
    filas = sinPrecio || !items.length ? [] : renglones(items)
  } catch {
    filas = []
  }
  const unidadesDevueltas = devueltas.reduce((s, d) => s + d.cantidad, 0)
  const unidadesNuevas = nuevas.reduce((s, n) => s + n.cantidad, 0)
  /** Lo que vuelve, en pesos (a lo que se pagó, no al precio de hoy). */
  const vuelve = (() => {
    if (!venta) return 0
    if (venta.origen.tipo === 'erp') {
      return Math.round(devueltas.reduce((s, d) => {
        const l = vendidas.find((x) => x.clave === d.clave)
        return s + (l && l.importe != null ? (l.importe / l.cantidad) * d.cantidad : 0)
      }, 0) * 100) / 100
    }
    return Math.round(devueltas.reduce((s, d) => s + Number(d.precio || 0) * d.cantidad, 0) * 100) / 100
  })()
  const llevaFilas = filas.length === items.length
  const diferencia = (() => {
    if (!venta || !devueltas.length || !llevaFilas || sinPrecioDevuelta) return 0
    if (venta.origen.tipo === 'erp') {
      return diferenciaDeCambio({
        lineas: vendidas.map((l) => ({ id: l.lineaId, cantidad: l.cantidad, importe: l.importe ?? 0 })),
        devueltas: devueltas.map((d) => ({ lineaId: d.lineaId, cantidad: d.cantidad })),
        nuevas: filas,
      })
    }
    return diferenciaDeCambioSuelto({ devueltas: devueltas.map((d) => ({ precio: Number(d.precio), cantidad: d.cantidad })), nuevas: filas })
  })()
  const reglas = config?.reglas ?? null
  const docLimpio = clienta.doc.replace(/\D/g, '')
  // El saldo sólo vale para el DNI con que se buscó (si se cambia el DNI, se vuelve a buscar).
  const saldoUsado = usaSaldo && saldo && saldo.doc === docLimpio && diferencia > 0 ? Math.min(saldo.monto, diferencia) : 0
  const resto = Math.round((diferencia - saldoUsado) * 100) / 100
  let cuenta: number | null = null
  let errorCobro: string | null = null
  try {
    cuenta = medio && reglas && resto > 0 ? cuentaDeMedio(medio, { reglas, total: diferencia, promoCreditoHoy: false, esDelBanco: false, seisCuotas: false }) : null
  } catch (e) {
    errorCobro = e instanceof Error ? e.message : 'Esa forma de pago no se puede usar.'
  }
  // 🔑 El descuento de la forma de pago, con el MISMO cálculo que el servidor (`cobroDelCambio` = `cobro()` de la Caja).
  let cobrado: { pagos: Array<{ cuenta: number; monto: number }>; total: number; espera: number } = { pagos: [], total: 0, espera: 0 }
  try {
    if (reglas && diferencia > 0 && (cuenta || !(resto > 0))) cobrado = cobroDelCambio({ diferencia, pagos: cuenta ? [{ cuenta }] : [], reglas, nuevas: items, saldo: saldoUsado })
  } catch (e) {
    errorCobro = e instanceof Error ? e.message : 'No se pudo calcular el cobro.'
  }
  const aFavor = diferencia < 0 ? -diferencia : 0
  // Saldo a favor (Bruno, 14-oct): se guarda a nombre de la clienta ⇒ DNI y nombre obligatorios.
  const pideClienta = aFavor > 0 || saldoUsado > 0
  const faltaClienta = pideClienta && !(docLimpio.length >= 7 && clienta.nombre.trim().length >= 3)
  const faltaPin = tipo === 'suelto' && !(encargada.persona.trim() && /^\d{4}$/.test(encargada.pin))
  const listo = !!venta && devueltas.length > 0 && !sinPrecio && !sinPrecioDevuelta && !errorCobro && (diferencia <= 0 || cobrado.total > 0) && !faltaClienta && !faltaPin
  /** Stunned vive en la base de Zattia con su línea: el saldo y el cambio suelto se leen con `linea=stunned`. */
  const deStunned = tipo === 'gn' || tipo === 'suelto' || (origen?.tipo === 'erp' && origen.stunned)
  /** El modo de la venta que se cambia: de prueba o real (el motor ⛔ mezcla uno con otro). */
  const deEnsayo = origen == null ? config?.stunned_prueba ?? true : origen.tipo === 'suelto' ? config?.stunned_prueba ?? true : origen.prueba

  const buscarSaldo = () => correr(async () => {
    const r = await leerSaldo(store, docLimpio, deEnsayo, deStunned ? 'stunned' : undefined)
    setSaldo({ doc: docLimpio, monto: r.saldo })
    if (r.cliente && !clienta.nombre.trim()) setClienta((x) => ({ ...x, nombre: r.cliente?.nombre ?? '' }))
    setUsaSaldo(r.saldo > 0)
  }, 'No se pudo leer el saldo.')

  /** Probar el PIN de la encargada antes de seguir al cobro (el servidor lo vuelve a verificar al confirmar). */
  const probarPin = async (): Promise<boolean> => {
    let bien = false
    await correr(async () => {
      await verificarPin(encargada.persona.trim(), encargada.pin)
      bien = true
    }, 'No se pudo probar el PIN.')
    return bien
  }

  /** El comprobante del cambio, con lo que había en pantalla al confirmarlo (después se vacía) y lo que contestó el servidor. */
  function comprobanteDe(r: { venta: { numero: number }; total: number; aFavor: number; saldo: number | null }): ComprobanteCambio {
    const o = venta?.origen
    const porUnidad = (d: Devuelta) => {
      const l = o?.tipo === 'erp' ? vendidas.find((x) => x.clave === d.clave) : null
      return l && l.importe != null ? l.importe / l.cantidad : Number(d.precio || 0)
    }
    return {
      numero: r.venta.numero,
      origen: !o || o.tipo === 'suelto' ? 'Sin ticket' : o.tipo === 'erp' ? `Venta #${o.numero}` : `Venta #${o.numero} de Gestión Nube`,
      devueltas: devueltas.map((d) => ({ nombre: d.nombre, talle: d.talle, cantidad: d.cantidad, importe: Math.round(porUnidad(d) * d.cantidad * 100) / 100, stunned: skuEsStunned(d.sku) })),
      nuevas: nuevas.map((n, i) => ({ nombre: n.variante.product_name, talle: n.variante.size_name, cantidad: n.cantidad, importe: filas[i]?.importe ?? Number(n.precio) * n.cantidad, stunned: esStunned(n.variante) })),
      vuelve,
      lleva: Math.round(filas.reduce((s, f) => s + f.importe, 0) * 100) / 100,
      saldoUsado,
      cobrado: r.total,
      pagos: cobrado.pagos,
      aFavor: r.aFavor,
      saldo: r.saldo,
    }
  }

  /** El pedido del cambio: el mismo cada vez (mismo `id`), así repetirlo no duplica. */
  async function mandar(extra: { pago?: string | null; comprobante?: string | null } = {}) {
    if (!venta) return
    const comun = {
      id, items,
      pagos: resto > 0 && cuenta ? [{ cuenta }] : [], total: cobrado.total, desde: espera?.desde ?? null, saldo: saldoUsado,
      cliente: pideClienta ? { doc: clienta.doc, nombre: clienta.nombre, whatsapp: clienta.whatsapp || null } : null,
      ...extra,
    }
    const suelta = devueltas.map((d) => ({ productId: d.productId, sizeId: d.sizeId, cantidad: d.cantidad, sku: d.sku, ...(venta.origen.tipo === 'suelto' ? { precio: Number(d.precio) } : {}) }))
    const r = await cambiarVenta(store, venta.origen.tipo === 'erp'
      ? { ...comun, ventaId: venta.origen.ventaId, devueltas: devueltas.map((d) => ({ lineaId: d.lineaId as string, cantidad: d.cantidad })) }
      : venta.origen.tipo === 'gn'
        ? { ...comun, gnVentaId: venta.origen.id, devueltas: suelta }
        : { ...comun, sinTicket: true, pin: encargada.pin, pinPersona: encargada.persona.trim(), devueltas: suelta })
    if (r.esperando) {
      setEspera({ desde: r.desde, monto: r.espera, cruce: r.cruce, recientes: r.recientes ?? [] })
      return
    }
    setHecho({ numero: r.venta.numero, cobrado: r.total, aFavor: r.aFavor, saldo: r.saldo, ncPendiente: r.ncPendiente, comprobante: comprobanteDe(r) })
    empezarDeNuevo()
  }

  const confirmar = (extra?: { pago?: string | null; comprobante?: string | null }) => correr(() => mandar(extra), 'No se pudo registrar el cambio.')

  // Mientras se espera la transferencia, se vuelve a mirar Mercado Pago cada 5 s (como la Caja).
  const esperando = !!espera && espera.cruce.estado === 'esperando'
  useEffect(() => {
    if (!esperando) return
    // Un error se MUESTRA y el sondeo sigue (el cambio de estado vuelve a armar el efecto): callado se cortaba.
    const t = setTimeout(() => { void mandar().catch((e) => { setError(e instanceof Error ? e.message : 'No se pudo mirar Mercado Pago.'); setVuelta((n) => n + 1) }) }, CADA_MS)
    return () => clearTimeout(t)
  })

  return {
    venta, origen, tipo, vendidas, devueltas, nuevas, medio, setMedio, clienta, setClienta, espera, setEspera, comprobante, setComprobante,
    saldo, usaSaldo, setUsaSaldo, encargada, setEncargada, hecho, setHecho, error, setError, trabajando, correr,
    empezarDeNuevo, elegirVenta, devolverDeVenta, devolverPrenda, cambiarCantidadDevuelta, ponerPrecioDevuelta, sumarNueva, cambiarNueva, cambiarCantidadNueva,
    sinPrecio, sinPrecioDevuelta, unidadesDevueltas, unidadesNuevas, vuelve, diferencia, reglas, docLimpio, saldoUsado, resto, cuenta, errorCobro, cobrado,
    aFavor, pideClienta, faltaClienta, faltaPin, listo, deStunned, deEnsayo, buscarSaldo, probarPin, confirmar,
    /** Lo que se lleva, en pesos (los importes de `renglones`). */
    seLleva: Math.round(filas.reduce((s, f) => s + f.importe, 0) * 100) / 100,
  }
}

export type Cambio = ReturnType<typeof useCambio>
