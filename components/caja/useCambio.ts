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
 * Los dos últimos son de la línea que ya vende por el ERP (`config.erp_lineas`, por su corte: Stunned 28-oct, BDI 15/16-nov,
 * Zattia 23-nov), ⛔ «sólo Stunned»: el servidor decide igual con la línea del PRODUCTO (`marcaDelCambio`). Un cambio es de UNA marca.
 */

import { useEffect, useMemo, useState } from 'react'
import { cuentaDeMedio, renglones } from '@/lib/caja/core.core.js'
import { exigirDevolucion } from '@/lib/caja/repetida.core.js'
import { conjuntoIncompleto, conjuntosConPieza, piezasSueltas, precioDeParte, type ConjuntoCaja } from '@/lib/caja/conjuntos.core.js'
import type { Config, Variante } from '@/lib/caja/cliente'
import { buscarVentas, cambiarVenta, leerFichaDeVenta, leerSaldo, leerVentaGnCambio, verificarPin, type ConjuntoDeVenta, type CruceCambio, type FichaDeVenta, type MarcaErp, type PagoMp, type VentaGnCambio } from '@/lib/erp/cliente'
import { cobroDelCambio, diferenciaDeCambio, diferenciaDeCambioSuelto } from '@/lib/erp/venta.core.js'
import type { ComprobanteCambio } from '@/lib/caja/ticket'
import { ETIQUETA_LINEA, esStunned as skuEsStunned, type Linea } from '@/lib/lineas'

export type MedioCambio = 'efectivo' | 'transferencia' | 'debito' | 'credito'
export const MEDIOS_CAMBIO: MedioCambio[] = ['efectivo', 'transferencia', 'debito', 'credito']
const CADA_MS = 5000

/** Una línea de la venta original: lo que vendió, lo que pagó por unidad y cuántas ya se cambiaron. */
export type Vendida = {
  clave: string; productId: number; sizeId: number; sku: string | null; nombre: string; talle: string
  cantidad: number; precio: number; cambiado: number
  /** Sólo en una venta del ERP: la línea y su importe exacto (la diferencia se cuenta con él). */
  lineaId?: string; importe?: number
  /** Sólo en una venta de Gestión Nube: la marca del producto (la pone el servidor). */
  linea?: string
  /** 🩱 La bikini de la que es parte (venta del ERP): sus partes van juntas en el cambio. */
  bikini?: { indice: number; nombre: string | null } | null
}
export type Origen =
  | { tipo: 'gn'; id: string; numero: string | number; fecha: string | null; cliente: string | null; prueba: boolean }
  | { tipo: 'erp'; ventaId: string; numero: number; cliente: string | null; prueba: boolean; gnSaleId: string | null; marca: string }
  | { tipo: 'suelto' }
export type VentaOriginal = { origen: Origen; vendidas: Vendida[]; /** 🩱 Las bikinis de la venta (sólo la del ERP). */ conjuntos?: ConjuntoDeVenta[] }
export type Devuelta = { clave: string; productId: number; sizeId: number; sku: string | null; nombre: string; talle: string; cantidad: number; precio: number | ''; lineaId?: string; /** La marca (cambio suelto). */ linea?: string }
/** `conjunto`: la parte de una bikini que se lleva entera; `parte`: la parte que sale SOLA en otro talle. En las dos, el precio es el de la bikini. */
export type Nueva = { variante: Variante; cantidad: number; precio: number | ''; conjunto?: { variant_id: number; n: number; nombre: string } | null; parte?: boolean }
/** 🩱 Lo que la pantalla pregunta de una bikini: qué cambia de la que devuelve, o con qué otra parte se lleva una. */
export type PreguntaBikini =
  | { tipo: 'devuelve'; indice: number; nombre: string; clave: string; parte: string }
  | { tipo: 'lleva'; variante: Variante; opciones: ConjuntoCaja[] }
export type Hecho = { numero: number; cobrado: number; aFavor: number; /** Lo que la clienta dejó (desestimado con PIN). */ desestimado: number; saldo: number | null; ncPendiente: boolean; /** Para imprimir (y reimprimir) el comprobante del cambio. */ comprobante: ComprobanteCambio }
export type Espera = { desde: string; monto: number; cruce: CruceCambio; recientes: PagoMp[] }

const nuevoId = () => crypto.randomUUID()
export const claveDePrenda = (productId: number, sizeId: number) => `${productId}_${sizeId}`

/** Una venta de Gestión Nube (la vista `venta-gn-cambio`): lo que vendió de las marcas que ya cortaron y lo que se pagó por unidad. */
export function ventaDeGn(g: VentaGnCambio): VentaOriginal & { total: number } {
  return {
    origen: { tipo: 'gn', id: g.venta.id, numero: g.venta.numero, fecha: g.venta.fecha, cliente: g.venta.cliente, prueba: g.venta.prueba },
    vendidas: g.lineas.map((l) => ({ clave: claveDePrenda(l.product_id, l.size_id), productId: l.product_id, sizeId: l.size_id, sku: l.sku, nombre: l.nombre ?? `Producto ${l.product_id}`, talle: l.talle ?? String(l.size_id), cantidad: l.cantidad, precio: l.precio, cambiado: l.cambiado, linea: l.linea })),
    total: g.lineas.reduce((s, l) => s + l.precio * l.cantidad, 0),
  }
}

/** Una venta del ERP (su ficha): cada línea con lo que vale en el cambio (`importeCambio`: la lista, ⛔ el redondeo) y cuántas unidades ya se cambiaron. */
export function ventaDeFicha(f: FichaDeVenta): VentaOriginal & { total: number } {
  const conjuntos = f.conjuntos ?? []
  const bikiniDe = (pid: number, sid: number) => {
    const i = conjuntos.findIndex((c) => c.piezas.some((pz) => pz.product_id === pid && pz.size_id === sid))
    return i >= 0 ? { indice: i, nombre: conjuntos[i].nombre } : null
  }
  return {
    origen: { tipo: 'erp', ventaId: f.venta.id, numero: f.venta.numero, cliente: f.cliente?.nombre ?? null, prueba: f.venta.prueba, gnSaleId: f.venta.gnSaleId, marca: f.venta.marca },
    vendidas: f.lineas.filter((l) => l.cantidad > 0 && !l.devuelta).map((l) => { const importe = l.importeCambio ?? l.importe; return { clave: l.id, productId: Number(l.producto), sizeId: Number(l.talle), sku: l.sku, nombre: l.nombre ?? `Producto ${l.producto}`, talle: l.talleNombre ?? l.talle, cantidad: l.cantidad, precio: Math.round((importe / l.cantidad) * 100) / 100, cambiado: l.cambiado, lineaId: l.id, importe, bikini: bikiniDe(Number(l.producto), Number(l.talle)) } }),
    conjuntos,
    total: f.venta.total,
  }
}

/** Una venta que salió de la búsqueda: lo que se ve en la lista y cómo abrirla. */
export type FilaVenta = { clave: string; numero: string | number; cliente: string | null; fecha: string | null; total: number; rotulo: 'Areben Gestión' | 'Gestión Nube'; prueba: boolean; abrir: () => Promise<VentaOriginal & { total: number }> }

/**
 * Buscar la venta original: del ERP por número o cliente y, con `gn` (alguna línea de `lineas` ya cortó) y un número, también la de
 * Gestión Nube con ese número. `lineas`: sólo las ventas de ESAS líneas —el POS, con las de su Caja que ya cortaron, y la pantalla
 * del ERP, con la tienda del menú (Bruno, 30-oct: mirando Stunned ofrecía ventas de Zattia)—; sin `lineas` (BDI), todas. De la de
 * Gestión Nube quedan sólo los productos de esas líneas (el servidor ya dejó sólo las cortadas). Devuelve las filas y, aparte, por
 * qué no se encontró la de Gestión Nube (para decirlo).
 */
export async function buscarVentasDelCambio(store: MarcaErp, texto: string, { gn, lineas }: { gn: boolean; lineas?: readonly string[] }): Promise<{ filas: FilaVenta[]; aviso: string | null }> {
  const filas: FilaVenta[] = []
  let aviso: string | null = null
  const t = texto.trim()
  if (gn && /^\d{1,12}$/.test(t)) {
    try {
      const leida = await leerVentaGnCambio(t, store)
      const deAca = lineas ? leida.lineas.filter((l) => lineas.includes(l.linea)) : leida.lineas
      if (!deAca.length) throw new Error(`La venta ${leida.venta.numero} de Gestión Nube no tiene productos de ${(lineas ?? []).map((l) => ETIQUETA_LINEA[l as Linea] ?? l).join(' ni de ')}.`)
      const g = ventaDeGn({ ...leida, lineas: deAca })
      const o = g.origen as Extract<Origen, { tipo: 'gn' }>
      filas.push({ clave: `gn-${o.id}`, numero: o.numero, cliente: o.cliente, fecha: o.fecha, total: g.total, rotulo: 'Gestión Nube', prueba: o.prueba, abrir: async () => g })
    } catch (e) {
      aviso = e instanceof Error ? e.message : null
    }
  }
  const r = await buscarVentas(store, { q: t, desde: '', hasta: '' })
  // 🔴 Con la línea cortada (`gn`), una venta del ERP DE PRUEBA es la copia del paralelo de una de GN: cambiarla ⛔ movería el
  // stock (revisión 10-nov). Se ofrece sólo la de Gestión Nube; el servidor también la frena (`cambiarVentaPropia`).
  for (const v of r.ventas.filter((x) => x.tipo === 'venta' && x.estado === 'confirmada' && (!lineas || lineas.includes(x.marca)) && !(gn && x.prueba))) {
    filas.push({ clave: `erp-${v.id}`, numero: v.numero, cliente: v.cliente, fecha: v.ocurridaEn, total: v.total, rotulo: 'Areben Gestión', prueba: v.prueba, abrir: async () => ventaDeFicha(await leerFichaDeVenta(store, v.id)) })
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
  /** ¿La prenda está en la oferta de su línea? La misma pregunta que la venta: su diferencia paga el % de la prenda (Bruno, 3-nov). */
  enOferta?: (v: Variante) => boolean
}

/** Cómo se nombra una línea en un aviso. */
const nombreDe = (l: string) => ETIQUETA_LINEA[l as Linea] ?? l

export function useCambio({ store, config, precioDe, esStunned, enOferta }: Entrada) {
  /** Las líneas de esta Caja que ya venden por el ERP (su corte): las únicas que cambian sin venta del ERP. Sin config, ninguna. */
  const erpLineas = useMemo(() => config?.erp_lineas ?? [], [config])
  /** La marca de una prenda en esta Caja (la de Zattia trae a Stunned de la mano). */
  const lineaDe = (v: Variante): Linea => (store === 'bdi' ? 'bdi' : esStunned(v) ? 'stunned' : 'zattia')
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
  /** Bruno (14-nov): la clienta DEJA lo que queda a favor ⇒ ⛔ se guarda saldo ni se pide la clienta, pero sí el PIN de la encargada. */
  const [desestima, setDesestima] = useState(false)
  const [id, setId] = useState(nuevoId)
  /** 🩱 La pregunta abierta de una bikini, y lo que ya se contestó de cada bikini de la venta («completa» o «otro talle»). */
  const [preguntaBikini, setPreguntaBikini] = useState<PreguntaBikini | null>(null)
  const [decididas, setDecididas] = useState<Record<number, 'completa' | 'talle'>>({})
  const [hecho, setHecho] = useState<Hecho | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Cada sondeo fallido suma una vuelta: el MISMO error no cambia el estado y el efecto no se volvería a armar.
  const [, setVuelta] = useState(0)
  const [trabajando, setTrabajando] = useState(false)

  const origen = venta?.origen ?? null
  const tipo = origen?.tipo ?? null
  const vendidas = useMemo(() => venta?.vendidas ?? [], [venta])
  /** 🩱 Las partes que vuelven sueltas (de una bikini a medias): las que pueden salir en otro talle. Regla de `conjuntos.core.js`. */
  const sueltas = useMemo(() => piezasSueltas(venta?.origen.tipo === 'erp' ? venta.conjuntos ?? [] : null, devueltas.map((d) => ({ product_id: d.productId, size_id: d.sizeId, cantidad: d.cantidad })), config?.conjuntos), [venta, devueltas, config])
  /** La marca del cambio: la de la venta del ERP o, suelto, la de lo que devuelve (el saldo de la clienta es de esa marca). */
  const lineaDelCambio: string | null = origen?.tipo === 'erp' ? origen.marca : devueltas.find((d) => d.linea)?.linea ?? null

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
    setDesestima(false)
    setPreguntaBikini(null)
    setDecididas({})
    setId(nuevoId())
  }

  /** Con una venta elegida (gn o erp) no se devuelve de más: la regla de la Caja, contando lo ya cambiado. */
  function validar(v: VentaOriginal | null, lista: Devuelta[]) {
    const marcas = [...new Set(lista.map((d) => d.linea).filter((l): l is string => !!l))]
    if (marcas.length > 1) throw new Error(`Este cambio mezcla productos de ${marcas.map(nombreDe).join(' y de ')}: un cambio es de una sola marca.`)
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
    setDecididas({})
    setPreguntaBikini(null)
    setVenta(v)
  }

  /**
   * 🩱 Bruno 21/22-nov: de una bikini, una parte sola vuelve SÓLO por otro talle de la misma parte; si no, vuelve la bikini completa.
   * Cuando lo devuelto deja una bikini a medias y todavía no se contestó, se pregunta cuál de las dos es.
   */
  function preguntarBikini(v: VentaOriginal | null, lista: Devuelta[], ya: Record<number, 'completa' | 'talle'> = decididas) {
    if (!v || v.origen.tipo !== 'erp' || !v.conjuntos?.length) return
    for (const [i, c] of v.conjuntos.entries()) {
      if (ya[i]) continue
      const vuelve = c.piezas.map((pz) => lista.filter((d) => d.productId === pz.product_id && d.sizeId === pz.size_id).reduce((s, d) => s + d.cantidad, 0) / (pz.cantidad || 1))
      if (!vuelve.some((k) => k > 0) || vuelve.every((k) => k === vuelve[0])) continue
      const d = lista.find((x) => x.cantidad > 0 && c.piezas.some((pz) => pz.product_id === x.productId && pz.size_id === x.sizeId))
      if (!d) continue
      setPreguntaBikini({ tipo: 'devuelve', indice: i, nombre: c.nombre ?? 'La bikini', clave: d.clave, parte: `${d.nombre} · ${d.talle}` })
      return
    }
  }

  /** «Devuelve la bikini completa»: suma las otras partes de esa bikini, en la misma cantidad que la parte que más vuelve. */
  function devolverBikiniCompleta() {
    const p = preguntaBikini
    if (!p || p.tipo !== 'devuelve' || !venta?.conjuntos) return
    const c = venta.conjuntos[p.indice]
    const cuanto = (pz: { product_id: number; size_id: number }) => devueltas.filter((d) => d.productId === pz.product_id && d.sizeId === pz.size_id).reduce((s, d) => s + d.cantidad, 0)
    const kits = Math.max(...c.piezas.map((pz) => Math.ceil(cuanto(pz) / (pz.cantidad || 1))))
    let lista = devueltas
    for (const pz of c.piezas) {
      const falta = kits * (pz.cantidad || 1) - cuanto(pz)
      if (falta <= 0) continue
      const l = vendidas.find((x) => x.productId === pz.product_id && x.sizeId === pz.size_id)
      if (!l) throw new Error(`No está en la venta la otra parte de ${c.nombre ?? 'la bikini'}.`)
      const actual = lista.find((d) => d.clave === l.clave)
      lista = actual
        ? lista.map((d) => (d.clave === l.clave ? { ...d, cantidad: d.cantidad + falta } : d))
        : [...lista, { clave: l.clave, productId: l.productId, sizeId: l.sizeId, sku: l.sku, nombre: l.nombre, talle: l.talle, cantidad: falta, precio: l.precio, ...(l.lineaId ? { lineaId: l.lineaId } : {}) }]
    }
    validar(venta, lista)
    const ya = { ...decididas, [p.indice]: 'completa' as const }
    setDecididas(ya)
    setDevueltas(lista)
    setPreguntaBikini(null)
    preguntarBikini(venta, lista, ya)
  }

  /** «Cambia el talle de esta parte»: vuelve sola; en «Lo que se lleva» sale la misma parte en otro talle. */
  function devolverSoloLaParte() {
    const p = preguntaBikini
    if (!p || p.tipo !== 'devuelve') return
    const ya = { ...decididas, [p.indice]: 'talle' as const }
    setDecididas(ya)
    setPreguntaBikini(null)
    preguntarBikini(venta, devueltas, ya)
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
        precio: l.precio, ...(l.lineaId ? { lineaId: l.lineaId } : {}), ...(l.linea ? { linea: l.linea } : {}),
      }))
    if (!sumadas.length) throw new Error('Marcá cuántas unidades devuelve.')
    const lista = [...devueltas.filter((d) => !sumadas.some((s) => s.clave === d.clave)), ...sumadas]
    validar(nueva, lista)
    setVenta(nueva)
    setDevueltas(lista)
    preguntarBikini(nueva, lista)
  }

  /** Una prenda escaneada o tocada en el paso 1: de la venta elegida, o suelta (sin venta). */
  function devolverPrenda(v: Variante) {
    if (venta && venta.origen.tipo !== 'suelto') {
      const l = vendidas.find((x) => x.productId === v.product_id && x.sizeId === v.size_id)
      if (!l) throw new Error(`${v.product_name} (${v.size_name}) no está en esa venta: no se puede devolver con este ticket.`)
      cambiarCantidadDevuelta(l.clave, (devueltas.find((d) => d.clave === l.clave)?.cantidad ?? 0) + 1)
      return
    }
    const linea = lineaDe(v)
    if (!erpLineas.includes(linea)) throw new Error(`Los cambios de ${nombreDe(linea)} sin venta de Areben Gestión todavía se hacen en Gestión Nube.`)
    const otra = devueltas.find((d) => d.linea && d.linea !== linea)
    if (otra) throw new Error(`Este cambio mezcla productos de ${nombreDe(otra.linea as string)} y de ${nombreDe(linea)}: un cambio es de una sola marca.`)
    const clave = claveDePrenda(v.product_id, v.size_id)
    setVenta({ origen: { tipo: 'suelto' }, vendidas: [] })
    setDevueltas((xs) => {
      const i = xs.findIndex((x) => x.clave === clave)
      if (i >= 0) return xs.map((x, j) => (j === i ? { ...x, cantidad: x.cantidad + 1 } : x))
      return [...xs, { clave, productId: v.product_id, sizeId: v.size_id, sku: v.sku, nombre: v.product_name, talle: v.size_name, cantidad: 1, precio: precioDe(v) ?? '', linea }]
    })
  }

  function cambiarCantidadDevuelta(clave: string, n: number) {
    const lista = devueltas.flatMap((d) => (d.clave !== clave ? [d] : n > 0 ? [{ ...d, cantidad: n }] : []))
    if (!devueltas.some((d) => d.clave === clave) && n > 0) {
      const l = vendidas.find((x) => x.clave === clave)
      if (!l) return
      lista.push({ clave, productId: l.productId, sizeId: l.sizeId, sku: l.sku, nombre: l.nombre, talle: l.talle, cantidad: n, precio: l.precio, ...(l.lineaId ? { lineaId: l.lineaId } : {}), ...(l.linea ? { linea: l.linea } : {}) })
    }
    validar(venta, lista)
    setDevueltas(lista)
    preguntarBikini(venta, lista)
    // Sin nada devuelto y sin venta elegida, se vuelve al principio: la próxima prenda decide de nuevo si es suelta.
    if (!lista.length && venta?.origen.tipo === 'suelto') setVenta(null)
  }

  const ponerPrecioDevuelta = (clave: string, p: number | '') => setDevueltas((xs) => xs.map((x) => (x.clave === clave ? { ...x, precio: p } : x)))

  function sumarNueva(v: Variante) {
    // Un cambio es de UNA marca (Bruno, 26-oct): en el cambio suelto, lo que se lleva es de la marca de lo que devuelve.
    if (tipo && tipo !== 'erp' && lineaDelCambio && lineaDe(v) !== lineaDelCambio) throw new Error(`Lo que se lleva tiene que ser de ${nombreDe(lineaDelCambio)}: un cambio es de una sola marca.`)
    // 🩱 La parte de una bikini: sola, SÓLO la misma parte en otro talle de la que vuelve sola (a lo que vale en la bikini); si no, se
    // elige con qué otra parte se lleva la bikini entera (como en la venta).
    const opciones = conjuntosConPieza(config?.conjuntos, v.product_id, v.size_id)
    if (opciones.length) {
      const suelta = sueltas.find((x) => x.product_id === v.product_id && x.size_id !== v.size_id)
      const yaSale = nuevas.filter((x) => x.parte && x.variante.product_id === v.product_id).reduce((s, x) => s + x.cantidad, 0)
      if (suelta && yaSale < sueltas.filter((x) => x.product_id === v.product_id).reduce((s, x) => s + x.cantidad, 0)) {
        setNuevas((xs) => {
          const i = xs.findIndex((x) => x.parte && x.variante.product_id === v.product_id && x.variante.size_id === v.size_id)
          if (i >= 0) return xs.map((x, j) => (j === i ? { ...x, cantidad: x.cantidad + 1 } : x))
          return [...xs, { variante: v, cantidad: 1, precio: precioDeParte(config?.conjuntos, v.product_id, v.size_id) ?? '', parte: true }]
        })
        return
      }
      setPreguntaBikini({ tipo: 'lleva', variante: v, opciones })
      return
    }
    setNuevas((xs) => {
      const i = xs.findIndex((x) => !x.conjunto && !x.parte && x.variante.product_id === v.product_id && x.variante.size_id === v.size_id)
      if (i >= 0) return xs.map((x, j) => (j === i ? { ...x, cantidad: x.cantidad + 1 } : x))
      return [...xs, { variante: v, cantidad: 1, precio: precioDe(v) ?? '' }]
    })
  }

  /** 🩱 La bikini que se lleva: un renglón por parte, a lo que vale cada parte, atados por `conjunto` (como en la venta de la Caja). */
  function llevarBikini(c: ConjuntoCaja) {
    setPreguntaBikini(null)
    setNuevas((xs) => {
      const rs = xs.slice()
      for (const pz of c.piezas) {
        const conjunto = { variant_id: c.variant_id, n: pz.n, nombre: c.nombre }
        const i = rs.findIndex((x) => x.conjunto?.variant_id === c.variant_id && x.conjunto.n === pz.n)
        const variante: Variante = { product_id: pz.product_id, size_id: pz.size_id, product_name: pz.producto ?? pz.nombre ?? `Producto ${pz.product_id}`, size_name: pz.talle ?? '', sku: null, barcode: null }
        if (i >= 0) rs[i] = { ...rs[i], cantidad: rs[i].cantidad + pz.cantidad }
        else rs.push({ variante, cantidad: pz.cantidad, precio: pz.precio, conjunto })
      }
      return rs
    })
  }

  // El precio de una parte es el de la bikini (el servidor lo exige): ⛔ se cambia a mano.
  const cambiarNueva = (i: number, cambio: Partial<Nueva>) => setNuevas((xs) => xs.map((x, j) => (j === i && !(cambio.precio !== undefined && (x.conjunto || x.parte)) ? { ...x, ...cambio } : x)))
  // Las partes de una bikini van juntas: la cantidad se cambia en todas y se sacan todas.
  const cambiarCantidadNueva = (i: number, c: number) => setNuevas((xs) => {
    const el = xs[i]
    const misma = (x: Nueva) => !!el?.conjunto && x.conjunto?.variant_id === el.conjunto.variant_id
    return c <= 0 ? xs.filter((x, j) => j !== i && !misma(x)) : xs.map((x, j) => (j === i || misma(x) ? { ...x, cantidad: c } : x))
  })

  // ── Lo que se lleva, con el importe de la Caja (`renglones`); sin precio todavía no se puede cobrar ──
  const sinPrecio = nuevas.some((n) => !(Number(n.precio) > 0))
  const sinPrecioDevuelta = tipo === 'suelto' && devueltas.some((d) => !(Number(d.precio) > 0))
  const items = nuevas.map((n) => ({ product_id: n.variante.product_id, size_id: n.variante.size_id, cantidad: n.cantidad, precio: Number(n.precio), sku: n.variante.sku, ...(n.conjunto ? { conjunto: n.conjunto } : {}), ...(esStunned(n.variante) ? { linea: 'stunned', ...(enOferta?.(n.variante) ? { oferta: true } : {}) } : {}) }))
  let filas: Array<{ product_id: number; importe: number }> = []
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
    if (reglas && diferencia > 0 && (cuenta || !(resto > 0))) cobrado = cobroDelCambio({ diferencia, pagos: cuenta ? [{ cuenta }] : [], reglas, nuevas: filas, saldo: saldoUsado })
  } catch (e) {
    errorCobro = e instanceof Error ? e.message : 'No se pudo calcular el cobro.'
  }
  const aFavor = diferencia < 0 ? -diferencia : 0
  // Saldo a favor (Bruno, 14-oct): se guarda a nombre de la clienta ⇒ DNI y nombre obligatorios.
  const desestimaSaldo = desestima && aFavor > 0
  const pideClienta = (aFavor > 0 && !desestimaSaldo) || saldoUsado > 0
  const faltaClienta = pideClienta && !(docLimpio.length >= 7 && clienta.nombre.trim().length >= 3)
  const faltaPin = (tipo === 'suelto' || desestimaSaldo) && !(encargada.persona.trim() && /^\d{4}$/.test(encargada.pin))
  /**
   * 🩱 La regla del MOTOR (`conjuntoIncompleto`, la del 409 CONJUNTO_INCOMPLETO) corrida antes del cobro, con lo que hay en pantalla:
   * una parte sola vuelve sólo si sale la misma parte en otro talle. Sólo con la venta del ERP (sabe qué renglones van juntos).
   */
  const problemaBikini: string | null = venta?.origen.tipo === 'erp' && venta.conjuntos?.length && devueltas.length
    ? conjuntoIncompleto(
      { detalle: { conjuntos: venta.conjuntos } },
      vendidas.map((l) => ({ id: l.clave, product_id: l.productId, size_id: l.sizeId })),
      new Map(devueltas.map((d) => [d.clave, d.cantidad])),
      nuevas.map((n) => ({ product_id: n.variante.product_id, size_id: n.variante.size_id, cantidad: n.cantidad })),
    )
    : null
  const listo = !!venta && devueltas.length > 0 && !problemaBikini && !sinPrecio && !sinPrecioDevuelta && !errorCobro && (diferencia <= 0 || cobrado.total > 0) && !faltaClienta && !faltaPin
  /** El modo de la venta que se cambia: de prueba o real (el motor ⛔ mezcla uno con otro). El suelto es de una línea que ya cortó ⇒ real. */
  const deEnsayo = origen == null || origen.tipo === 'suelto' ? false : origen.prueba

  const buscarSaldo = () => correr(async () => {
    const r = await leerSaldo(store, docLimpio, deEnsayo, lineaDelCambio ?? undefined)
    setSaldo({ doc: docLimpio, monto: r.saldo })
    if (r.cliente && !clienta.nombre.trim()) setClienta((x) => ({ ...x, nombre: r.cliente?.nombre ?? '' }))
    setUsaSaldo(r.saldo > 0)
  }, 'No se pudo leer el saldo.')

  /** Probar el PIN de la encargada antes de seguir al cobro (el servidor lo vuelve a verificar al confirmar). */
  const probarPin = async (): Promise<boolean> => {
    let bien = false
    await correr(async () => {
      await verificarPin(encargada.persona.trim(), encargada.pin, store)
      bien = true
    }, 'No se pudo probar el PIN.')
    return bien
  }

  /** El comprobante del cambio, con lo que había en pantalla al confirmarlo (después se vacía) y lo que contestó el servidor.
   *  Lo que vuelve va en renglones NEGATIVOS, a lista (Bruno, 28-oct), y lo que se lleva como en la venta. */
  function comprobanteDe(r: { venta: { numero: number }; total: number; aFavor: number; saldo: number | null }): ComprobanteCambio {
    const o = venta?.origen
    const porUnidad = (d: Devuelta) => {
      const l = o?.tipo === 'erp' ? vendidas.find((x) => x.clave === d.clave) : null
      return Math.round((l && l.importe != null ? l.importe / l.cantidad : Number(d.precio || 0)) * 100) / 100
    }
    return {
      numero: r.venta.numero,
      origen: !o || o.tipo === 'suelto' ? 'Sin ticket' : o.tipo === 'erp' ? `Venta #${o.numero}` : `Venta #${o.numero} de Gestión Nube`,
      renglones: [
        ...devueltas.map((d) => ({ nombre: d.nombre, talle: d.talle, cantidad: -d.cantidad, precio: porUnidad(d), importe: -Math.round(porUnidad(d) * d.cantidad * 100) / 100, stunned: skuEsStunned(d.sku) })),
        ...nuevas.map((n, i) => ({ nombre: n.variante.product_name, talle: n.variante.size_name, cantidad: n.cantidad, precio: Number(n.precio), importe: filas[i]?.importe ?? Number(n.precio) * n.cantidad, stunned: esStunned(n.variante) })),
      ],
      subtotal: diferencia,
      pagos: cobrado.pagos.filter((p) => typeof p.cuenta === 'number') as ComprobanteCambio['pagos'],
      saldoUsado,
      total: r.total,
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
      ...(desestimaSaldo ? { desestimar: true, pin: encargada.pin, pinPersona: encargada.persona.trim() } : {}),
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
    setHecho({ numero: r.venta.numero, cobrado: r.total, aFavor: r.aFavor, desestimado: r.desestimado ?? 0, saldo: r.saldo, ncPendiente: r.ncPendiente, comprobante: comprobanteDe(r) })
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
    saldo, usaSaldo, setUsaSaldo, encargada, setEncargada, desestima, setDesestima, desestimaSaldo, hecho, setHecho, error, setError, trabajando, correr,
    empezarDeNuevo, elegirVenta, devolverDeVenta, devolverPrenda, cambiarCantidadDevuelta, ponerPrecioDevuelta, sumarNueva, cambiarNueva, cambiarCantidadNueva,
    sinPrecio, sinPrecioDevuelta, unidadesDevueltas, unidadesNuevas, vuelve, diferencia, reglas, docLimpio, saldoUsado, resto, cuenta, errorCobro, cobrado,
    aFavor, pideClienta, faltaClienta, faltaPin, listo, lineaDelCambio, erpLineas, deEnsayo, buscarSaldo, probarPin, confirmar,
    preguntaBikini, setPreguntaBikini, devolverBikiniCompleta, devolverSoloLaParte, llevarBikini, problemaBikini, decididas,
    /** Lo que se lleva, en pesos (los importes de `renglones`). */
    seLleva: Math.round(filas.reduce((s, f) => s + f.importe, 0) * 100) / 100,
  }
}

export type Cambio = ReturnType<typeof useCambio>
