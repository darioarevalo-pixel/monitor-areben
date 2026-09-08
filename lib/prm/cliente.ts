/**
 * PRM y Recorridas, del lado del navegador (`/api/datos?recurso=prm`).
 *
 * 🔑 **Un solo endpoint para las dos secciones**, con el permiso separado adentro por acción: leer
 * el padrón lo puede cualquiera de las dos, escribir lo de la calle es de Recorridas, y el enganche
 * con el proveedor del sistema de Ingresos es del PRM.
 */
import { apiFetch } from '@/lib/api-fetch'
import type { Recepcion } from '@/lib/recepciones/core'
import type {
  LineaComparativa,
  LocalComparativa,
  OcMovimiento,
  ProductoMovimiento,
  VentaMovimiento,
  VentaProducto,
} from './movimiento'
import type { Compromiso, Interes, ProveedorLocal, Recorrida, Parada, Visita } from './tipos'

const API = '/api/datos?recurso=prm'

export type LocalConResumen = ProveedorLocal & {
  /**
   * Las marcas a las que le compramos, **medidas de sus órdenes** y ⛔ no tildadas a mano.
   * ⛔ Vacío ⛔ NO es «de ninguna»: es «todavía no le compramos» ⇒ se muestra en las dos.
   */
  marcas: string[]
  ultimaVisita: Pick<Visita, 'id' | 'local_id' | 'fecha' | 'opinion' | 'puntaje' | 'compre'> | null
  interesesAbiertos: number
  compromisosAbiertos: Compromiso[]
}

export type Ficha = {
  local: ProveedorLocal
  visitas: Visita[]
  intereses: Interes[]
  compromisos: Compromiso[]
  /**
   * Las OCs crudas del proveedor enganchado. 🔴 `null` = **no hay enganche**, que ⛔ no es lo mismo
   * que `[]` = enganchado y sin ninguna OC. La ficha tiene que decir cosas distintas en cada caso:
   * un cero afirma que no le compramos nunca, y sin enganche eso no se sabe.
   */
  recepciones: Recepcion[] | null
}

/**
 * Lo que le compramos y cómo se vendió eso. Todo crudo: el agregado lo hace `lib/prm/movimiento.ts`.
 *
 * 🔴 **`sinEnganche` ⛔ no es «no vendió nada»**, y `sinCruce` tampoco: son los dos ceros que
 * afirman de más. El primero dice que nadie ató este local a un proveedor de Ingresos; el segundo,
 * cuántos renglones de sus órdenes no se pudieron cruzar contra el espejo de Gestión Nube.
 */
export type Movimiento = {
  sinEnganche?: true
  dias: number
  desdeVentas: string
  ocs: OcMovimiento[]
  productos: ProductoMovimiento[]
  ventas: VentaMovimiento[]
  /**
   * El stock de HOY de cada producto suyo, sumando talles y sucursales.
   *
   * 🔴 **⛔ No es «lo que le queda de lo que trajo».** Medido el 8-sep-2026 sobre los 109 productos
   * que entraron en 30 días: `comprado − vendido` da el stock en 97 y ⛔ no en 12 (`TOP TERRA`
   * compró 5, vendió 5 y tiene 5). La resta acierta casi siempre, y por eso el que falla ⛔ no se
   * ve. Un producto que ⛔ no está en el espejo ⛔ no viaja con un 0: no viaja.
   */
  stockPorProducto: { store: string; producto_id: string; unidades: number }[]
  /** Marcas cuyo inventario ⛔ no contestó. La pantalla muestra `—` y ⛔ no un 0. */
  stockMudo: string[]
  /**
   * Cuándo se sincronizó por última vez el espejo de inventario de cada marca.
   *
   * 🔴 **El sync de inventario ⛔ no tiene reloj: lo aprieta una persona** desde Reposición
   * (`sync-inventario.yml` es sólo `workflow_dispatch`). Un stock sin fecha al lado se lee como
   * «ahora» y puede ser de anteayer — y de eso depende si la recompra es urgente o ya se hizo.
   */
  stockAl: { store: string; cuando: string }[]
  sinCruce: { lineas: number; unidades: number }
  /** Marcas cuya base no contestó. ⛔ No es «vendió 0»: es «no pude preguntar». */
  marcasMudas: string[]
  /**
   * Renglones que cruzaron **hoy** y ⛔ no cuando llegó la orden: el alta en Gestión Nube se hizo
   * después del aviso. El número no es trivia — es lo único que separa «este proveedor no vendió»
   * de «su mercadería todavía no estaba cargada el día que entró».
   */
  recruzados: number
}

/**
 * Los proveedores comparados entre sí, para las columnas medidas de la lista. Todo crudo salvo la
 * roll-up de ventas por producto, que el servidor agrega **por transporte**: los 30 días de BDI son
 * 5.523 renglones de venta y terminan en ~350 números.
 */
export type Comparativa = {
  dias: number
  desdeVentas: string
  locales: LocalComparativa[]
  ocs: (OcMovimiento & { proveedor_id: number | null })[]
  lineas: LineaComparativa[]
  ventasPorProducto: VentaProducto[]
  /** ⛔ «No pude preguntar» ⛔ no es «no vendió»: la pantalla lo dice y no dibuja ceros. */
  marcasMudas: string[]
  /** Renglones cruzados **hoy** y no al llegar la orden. Ver `Movimiento['recruzados']`. */
  recruzados: number
}

export type ParadaViva = Parada & {
  local: ProveedorLocal | null
  intereses: Interes[]
  compromisos: Compromiso[]
  ultimaVisita: Visita | null
}

export type Opciones = {
  deIngresos: { id: number; nombre: string }[]
  deGn: string[]
  /** 🔴 `false` = no se pudo preguntar. La columna `productos.proveedor` existe SÓLO en Zattia. */
  gnDisponible: boolean
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await apiFetch(url, init)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo hablar con el servidor.')
  return d as T
}

const q = (marca: string) => `${API}&store=${encodeURIComponent(marca)}`

export async function leerPadron(marca: string): Promise<LocalConResumen[]> {
  const d = await pedir<{ locales: LocalConResumen[] }>(`${q(marca)}&nc=${Date.now()}`)
  return d.locales || []
}

export async function leerFicha(marca: string, id: string): Promise<Ficha> {
  return pedir<Ficha>(`${q(marca)}&action=local&id=${encodeURIComponent(id)}&nc=${Date.now()}`)
}

export async function leerMovimiento(marca: string, id: string, dias?: number): Promise<Movimiento> {
  const d = dias ? `&dias=${dias}` : ''
  return pedir<Movimiento>(`${q(marca)}&action=movimiento&id=${encodeURIComponent(id)}${d}&nc=${Date.now()}`)
}

export async function leerComparativa(marca: string, dias = 30): Promise<Comparativa> {
  return pedir<Comparativa>(`${q(marca)}&action=comparativa&dias=${dias}&nc=${Date.now()}`)
}

export async function leerOpciones(marca: string): Promise<Opciones> {
  return pedir<Opciones>(`${q(marca)}&action=opciones&nc=${Date.now()}`)
}

export async function leerRecorridas(marca: string): Promise<Recorrida[]> {
  const d = await pedir<{ recorridas: Recorrida[] }>(`${q(marca)}&action=recorridas&nc=${Date.now()}`)
  return d.recorridas || []
}

/**
 * 🔴 **Todo el viaje en UN pedido.** En las galerías de Avellaneda no hay señal: moverse entre
 * paradas no puede pedir red. Por eso cada parada ya viene con sus intereses abiertos, sus
 * compromisos abiertos y la última visita.
 */
export async function leerRecorrida(marca: string, id: string): Promise<{ recorrida: Recorrida; paradas: ParadaViva[] }> {
  return pedir<{ recorrida: Recorrida; paradas: ParadaViva[] }>(
    `${q(marca)}&action=recorrida&id=${encodeURIComponent(id)}&nc=${Date.now()}`,
  )
}

export async function escribir<T = { ok: true }>(marca: string, action: string, datos: Record<string, unknown>): Promise<T> {
  return pedir<T>(q(marca), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, store: marca, ...datos }),
  })
}
