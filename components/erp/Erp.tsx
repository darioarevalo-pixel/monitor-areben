'use client'

/**
 * ERP (`/erp`, sólo admin): lo que el monitor va construyendo para reemplazar a Gestión Nube.
 * Bruno, 12-oct-2026: todo el ERP en UNA sección que ven él y Darío mientras dura el desarrollo, para poder probarlo y
 * opinar sin que lo vea el equipo.
 *
 * 🔑 Bruno, 19-oct (dictado): «que el ERP sea como el POS, que abra una sección completa nueva, que se navegue solo sin
 * ir atrás» ⇒ `/erp` sale ANTES del shell (como `/pos`, ver `app/[[...seccion]]/page.tsx`): sin el menú del monitor,
 * con el menú del diseño aprobado (`~/Documents/erp-monitor/diseno.md` §2: Inicio · Ventas + Caja (POS) · Stock ·
 * Productos y precios · Clientes y proveedores · Configuración) y una dirección por sección y por pestaña
 * (`/erp/stock/ajustes`). «Volver al monitor» abajo del menú.
 *
 * ⚠️ El contenido va adentro de `.shell-content` a propósito: las pantallas de `erp` heredan de ahí el dibujo de las
 * tablas, los botones crudos y los `select` (globals.css).
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, Modal, Tabs, color, space, weight } from '@/components/ui'
import { leerConfig } from '@/lib/caja/cliente'
import { usarMarcaCaja } from '@/lib/caja/marca'
import { CUENTAS } from '@/lib/cuentas'
import type { Marca } from '@/lib/nav.datos'
import { esAdmin, puedeVer } from '@/lib/permisos'
import { CambioCaja } from './CambioCaja'
import { FacturaCaja } from './FacturaCaja'
import { Facturacion } from './Facturacion'
import { useContadoresErp } from '@/lib/erp/contadores-erp'
import { ProveedorLineaErp, elegirLinea, lineaElegida, type LineaErp } from '@/lib/erp/linea-erp'
import { StockErp, type PrendaAAjustar } from './stock/StockErp'
import { MovimientosStock } from './stock/MovimientosStock'
import { TransferenciasStock } from './stock/TransferenciasStock'
import { MoverYRecibir } from './stock/MoverYRecibir'
import { transfiereEnErp } from '@/lib/erp/transferencia-doc.core.js'
import { RecepcionesStock } from './stock/RecepcionesStock'
import { ComparacionStock } from './stock/ComparacionStock'
import { DiferenciasDia } from './DiferenciasDia'
import { ConciliacionDia } from './ConciliacionDia'
import { AjustesStock } from './AjustesStock'
import { ProductosErp } from './productos/ProductosErp'
import { PreciosErp } from './productos/PreciosErp'
import { ReglasComerciales } from './ReglasComerciales'
import { Redondeo } from './Redondeo'
import { RutasCobro } from './RutasCobro'
import { CuentasErp, EstructuraErp } from './CuentasYEstructura'
import { VentasErp } from './ventas/VentasErp'
import { PorProductoErp } from './ventas/PorProductoErp'
import { CajasErp } from './ventas/CajasErp'
import { CobrosErp } from './ventas/CobrosErp'
import { GastosErp } from './ventas/GastosErp'
import { ClientesErp } from './clientes/ClientesErp'
import { CuentaCorriente } from './clientes/CuentaCorriente'
import { ProveedoresErp } from './clientes/ProveedoresErp'
import { InicioErp } from './inicio/InicioErp'
import { BusquedaGlobal, HojaDeAtajos, useAtajosErp, type DestinoBusqueda } from './BusquedaGlobal'
import { FichaPrenda } from './stock/FichaPrenda'
import { periodoDeVenta } from '@/lib/erp/busqueda-global.core.js'
import { diaArgentino } from '@/lib/envios/portal.core.js'

type Item = { key: string; label: string; /** Existe (tiene dirección y se llega por un botón) pero ⛔ va en el menú ni en las pestañas. */ oculta?: boolean }
type Seccion = {
  key: string
  titulo: string
  /** El trazo del ícono de línea (24×24), el mismo del diseño v8. */
  icono: string
  /** 🎨 30-oct (Bruno): cada pestaña es un ÍTEM del menú, debajo de su sección; sus vistas son las pestañas de arriba (como mucho 2-3). */
  pestanias: Array<Item & { vistas?: Item[] }>
  /** Qué dice la sección mientras no tiene pantallas. */
  vacia?: string
}

/**
 * 🎨 30-oct (Bruno, mapa del menú aprobado; `~/Documents/erp-monitor/erp-stunned.md` §7): el menú es de GRUPOS. Adentro de
 * Ventas: Ventas (pestañas Ventas · Por producto), Cobros, Cajas, Facturación y Gastos. La sección «Caja» ⛔ existe más: Cajas
 * pasó a Ventas y Cambio ⇒ el botón «Hacer cambio» de la venta (y el modo Cambios del POS). «Facturar una venta» ⇒ botón en
 * Facturación. Redondeo ⇒ Configuración, junto a los descuentos por forma de pago.
 */
export const SECCIONES_ERP: Seccion[] = [
  { key: 'inicio', titulo: 'Inicio', icono: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z', pestanias: [] },
  {
    key: 'ventas', titulo: 'Ventas', icono: 'M6 2l-2 4v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-2-4z M4 6h16 M16 10a4 4 0 0 1-8 0',
    pestanias: [
      { key: 'ventas', label: 'Ventas', vistas: [{ key: 'ventas', label: 'Ventas' }, { key: 'por-producto', label: 'Por producto' }] },
      { key: 'cobros', label: 'Cobros' }, { key: 'cajas', label: 'Cajas' },
      { key: 'facturacion', label: 'Facturación', vistas: [{ key: 'facturacion', label: 'Facturas' }, { key: 'factura', label: 'Facturar una venta', oculta: true }] },
      { key: 'gastos', label: 'Gastos' },
      { key: 'cambio', label: 'Cambio', oculta: true },
    ],
  },
  {
    key: 'stock', titulo: 'Stock', icono: 'M21 8l-9-5-9 5 9 5 9-5z M3 8v8l9 5 9-5V8 M12 13v8',
    pestanias: [
      { key: 'stock', label: 'Stock', vistas: [{ key: 'stock', label: 'Productos' }, { key: 'movimientos', label: 'Movimientos' }] },
      { key: 'transferencias', label: 'Transferencias', vistas: [{ key: 'transferencias', label: 'Transferencias' }, { key: 'mover', label: 'Mover y recibir' }] },
      { key: 'ajustes', label: 'Ingresos y ajustes', vistas: [{ key: 'ajustes', label: 'Ajustes' }, { key: 'ingresos', label: 'Ingresos de mercadería' }] },
      { key: 'diferencias', label: 'Diferencias', vistas: [{ key: 'comparacion', label: 'Con Tienda Nube y Mercado Libre' }, { key: 'conciliacion', label: 'Conciliación' }, { key: 'diferencias', label: 'Con Gestión Nube' }] },
    ],
  },
  { key: 'productos', titulo: 'Productos y precios', icono: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z M7.5 7.5h.01', pestanias: [{ key: 'productos', label: 'Productos' }, { key: 'precios', label: 'Precios' }] },
  {
    key: 'clientes', titulo: 'Clientes y proveedores', icono: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
    pestanias: [{ key: 'clientes', label: 'Clientes', vistas: [{ key: 'clientes', label: 'Clientes' }, { key: 'cuenta-corriente', label: 'Cuenta corriente' }] }, { key: 'proveedores', label: 'Proveedores' }],
  },
  {
    key: 'configuracion', titulo: 'Configuración', icono: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M4 12h2 M18 12h2 M12 4v2 M12 18v2 M6.3 6.3l1.4 1.4 M16.3 16.3l1.4 1.4 M6.3 17.7l1.4-1.4 M16.3 7.7l1.4-1.4',
    pestanias: [
      { key: 'cuentas', label: 'Cuentas y formas de pago', vistas: [{ key: 'cuentas', label: 'Cuentas' }, { key: 'rutas', label: 'Rutas' }] },
      { key: 'reglas', label: 'Descuentos y redondeo', vistas: [{ key: 'reglas', label: 'Descuentos por forma de pago' }, { key: 'redondeo', label: 'Redondeo' }] },
      { key: 'estructura', label: 'Marcas, depósitos y puntos de venta' },
    ],
  },
]

/** Pestañas y vistas de antes (direcciones guardadas, ⌘K que salta a una vista): cada una cae en su sección, pestaña y vista nuevas. */
const VIEJAS: Record<string, Record<string, [string, string, string | null]>> = {
  stock: {
    movimientos: ['stock', 'stock', 'movimientos'], mover: ['stock', 'transferencias', 'mover'], recepciones: ['stock', 'ajustes', 'ingresos'], ingresos: ['stock', 'ajustes', 'ingresos'],
    comparacion: ['stock', 'diferencias', 'comparacion'], conciliacion: ['stock', 'diferencias', 'conciliacion'],
    // 🔴 ⛔ `diferencias`: es el nombre de la pestaña NUEVA. Con esa entrada, `/erp/stock/diferencias` (la dirección de su primera
    // vista, «Con Tienda Nube y Mercado Libre») caía siempre en «Con Gestión Nube» (prueba del corte, 28-oct).
  },
  ventas: { factura: ['ventas', 'facturacion', 'factura'], 'por-producto': ['ventas', 'ventas', 'por-producto'] },
  // 🎨 30-oct: la sección Caja ⛔ existe: todo lo suyo cae en Ventas (también `/erp/caja` pelado, ver `viejaDe`).
  caja: { factura: ['ventas', 'facturacion', 'factura'], cambio: ['ventas', 'cambio', null], cajas: ['ventas', 'cajas', null] },
  productos: { redondeo: ['configuracion', 'reglas', 'redondeo'] },
  clientes: { 'cuenta-corriente': ['clientes', 'clientes', 'cuenta-corriente'] },
  configuracion: { 'cuentas-reales': ['configuracion', 'cuentas', 'cuentas'], rutas: ['configuracion', 'cuentas', 'rutas'], redondeo: ['configuracion', 'reglas', 'redondeo'] },
}
const SECCIONES_VIEJAS: Record<string, [string, string, string | null]> = { caja: ['ventas', 'cajas', null] }
const viejaDe = (seccion: string, pestania: string | null | undefined, vista: string | null | undefined) => (pestania ? (!vista ? VIEJAS[seccion]?.[pestania] : undefined) : SECCIONES_VIEJAS[seccion])

/** `['stock', 'ajustes']` → la sección, la pestaña y la vista; lo que no existe cae en Inicio o en la primera pestaña. */
export function resolverRutaErp(ruta: string[]) {
  const vieja = viejaDe(ruta[0], ruta[1], ruta[2])
  const claveSeccion = vieja ? vieja[0] : ruta[0]
  const seccion = SECCIONES_ERP.find((s) => s.key === claveSeccion) ?? SECCIONES_ERP[0]
  const [k1, k2] = vieja ? [vieja[1], vieja[2] ?? undefined] : [ruta[1], ruta[2]]
  const item = seccion.pestanias.find((p) => p.key === k1) ?? seccion.pestanias[0]
  const pestania = item?.key ?? null
  const vista = item?.vistas ? (item.vistas.find((v) => v.key === k2) ?? item.vistas[0]).key : null
  const valida = !vieja && seccion.key === (ruta[0] ?? 'inicio') && (ruta[1] == null || (pestania === ruta[1] && (ruta[2] == null || vista === ruta[2])))
  return { seccion, pestania, vista, valida }
}

export const hrefErp = (seccion: string, pestania?: string | null, vista?: string | null) => {
  if (seccion === 'inicio') return '/erp'
  const vieja = viejaDe(seccion, pestania, vista)
  const [sec, p, v] = vieja ?? [seccion, pestania, vista]
  const primera = SECCIONES_ERP.find((x) => x.key === sec)?.pestanias.find((x) => x.key === p)?.vistas?.[0].key
  return `/erp/${sec}${p ? `/${p}` : ''}${p && v && v !== primera ? `/${v}` : ''}`
}

/** Para ⌘K: cada pestaña con SUS vistas (la búsqueda salta a una vista, no a un grupo); también las ocultas («Facturar una venta», «Cambio»). */
export const SECCIONES_BUSCABLES: Seccion[] = SECCIONES_ERP.map((s) => ({ ...s, pestanias: s.pestanias.flatMap((p) => p.vistas ?? [p]) }))

/** Lo que se dibuja (menú, pestañas): sin las ocultas. */
const visibles = <T extends Item>(xs: T[] | undefined) => (xs ?? []).filter((x) => !x.oculta)

const TITULO_CONTADOR: Record<string, string> = { stock: 'productos en negativo', productos: 'productos sin costo' }

/** El contador rojo (§9): sólo aparece si hay algo para hacer. */
function Contador({ n, titulo }: { n: number | undefined; titulo: string }) {
  if (!n) return null
  return <span className="erp-contador" title={titulo} aria-label={`${n.toLocaleString('es-AR')} ${titulo}`}>{n.toLocaleString('es-AR')}</span>
}

function Trazo({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}

/** 📱 La barra de abajo del celular (Bruno, 29-oct): las 4 que más se usan; el resto, en «Más». */
const ABAJO = ['inicio', 'ventas', 'stock', 'productos']
/** El nombre en la barra de abajo del celular, donde no entra el largo («Productos y precios» se partía en 2 renglones). */
const CORTO_ABAJO: Record<string, string> = { productos: 'Productos' }
const EN_MAS = SECCIONES_ERP.filter((s) => !ABAJO.includes(s.key))
const TRAZO_MAS = 'M5 12h.01 M12 12h.01 M19 12h.01'
const TRAZO_BUSCAR = 'M21 21l-4.3-4.3 M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z'
const TRAZO_VOLVER = 'M19 12H5 M12 19l-7-7 7-7'

type AAbrir = { tipo: 'venta'; id: string; numero: number; periodo: string } | { tipo: 'cliente'; doc: string | null; nombre: string } | null
let pedidoDeBusqueda: AAbrir = null
let prendaAAjustarPendiente: PrendaAAjustar | null = null
/** Color propio de cada marca (§9): sólo señala DÓNDE estás (punto del selector, cartel y título). ⛔ Nunca en tarjetas, chips ni botones: ahí el color es semáforo. */
export const COLOR_DE_MARCA = { bdi: '#0d9488', zattia: '#db2777', stunned: '#7c3aed' } as const
type Opcion = { key: 'bdi' | 'zattia' | 'stunned'; titulo: string }

export function Erp({ ruta = [] }: { ruta?: string[] }) {
  const router = useRouter()
  const { perfil, marca, setMarca } = useSesion()
  const { seccion, pestania, vista, valida } = resolverRutaErp(ruta)
  // De una ficha de prenda (Stock, Movimientos, Conciliación, Diferencias) a «Nuevo ajuste» con la prenda cargada
  // (Conteos y ajustes): viaja en memoria, la dirección sólo dice la pestaña. 🎨 19-oct: Conciliación y Diferencias abren la
  // ficha AL COSTADO, ⛔ saltan a Stock.
  // Igual que `pedidoDeBusqueda`: `Erp` se remonta al cambiar de pestaña ⇒ la prenda a ajustar vive en el módulo.
  const [aAjustar, setAAjustarEstado] = useState<PrendaAAjustar | null>(() => prendaAAjustarPendiente)
  const setAAjustar = (p: PrendaAAjustar | null) => { prendaAAjustarPendiente = p; setAAjustarEstado(p) }
  // El estado ya la tomó: el módulo la suelta (si no, reaparecería en el próximo remonte, por ejemplo al volver por el menú).
  useEffect(() => { prendaAAjustarPendiente = null; pedidoDeBusqueda = null }, [])
  const ir = (s: string, p?: string | null, v?: string | null) => router.push(hrefErp(s, p, v))
  // Búsqueda global (⌘K) y atajos (?). Lo que se elige viaja en memoria (como `aAjustar`): la lista que lo abre lo recibe y lo suelta.
  const [panel, setPanel] = useState<'buscar' | 'atajos' | null>(null)
  // 📱 La hoja de «Más» (sólo en el celular): marca, las secciones que no entran abajo, Buscar y Volver al monitor.
  const [hojaMas, setHojaMas] = useState(false)
  // `Erp` se REMONTA al cambiar de sección (un `useState` se perdía en el camino): el pedido vive en el módulo y la lista lo suelta.
  const [aAbrir, setAAbrirEstado] = useState<AAbrir>(() => pedidoDeBusqueda)
  const setAAbrir = (v: AAbrir) => { pedidoDeBusqueda = v; setAAbrirEstado(v) }
  // Cada pedido de la búsqueda remonta la lista que lo recibe (ya montada, no volvería a leer ni a mirar `abrir`).
  const [pedidoN, setPedidoN] = useState(0)
  const [prendaGlobal, setPrendaGlobal] = useState<{ marca: Marca; producto: string; talle: string } | null>(null)
  useAtajosErp(setPanel)
  // Una dirección vieja o mal escrita ⇒ la que corresponde (⛔ una pantalla en blanco).
  useEffect(() => {
    if (!valida) router.replace(hrefErp(seccion.key, pestania, vista))
  }, [valida, seccion.key, pestania, vista, router])

  const marcas = (Object.keys(CUENTAS) as Marca[]).filter((m) => perfil && puedeVer(perfil, m, 'erp'))
  // Selector BDI · Zattia · Stunned (diseño §9). 🔴 Stunned no es una `Marca`: es marca zattia + línea `stunned` (`docs/lineas.md`).
  const [linea, setLineaEstado] = useState<LineaErp>(lineaElegida)
  const setLinea = (l: LineaErp) => { elegirLinea(l); setLineaEstado(l) }
  // 🎯 Bruno 30-oct: la línea Zattia queda oculta para el local (⛔ admin) hasta que Zattia pase al ERP ⇒ ven sólo Stunned.
  const soloStunned = !esAdmin(perfil)
  const lineaVista: LineaErp = marca === 'zattia' ? (soloStunned || linea === 'stunned' ? 'stunned' : 'zattia') : ''
  const transferenciaEnErp = transfiereEnErp(lineaVista || 'bdi')
  // «Mover y recibir» ⛔ va aparte para esa línea: es la misma lista (`MoverYRecibir unificada`).
  const itemActual = seccion.pestanias.find((p) => p.key === pestania)
  // Las vistas ocultas (Facturar una venta) ⛔ son pestaña; Con Gestión Nube ⛔ para Stunned (ya ⛔ tiene GN).
  const vistasDeAca = visibles(itemActual?.vistas).filter((v) => !(transferenciaEnErp && v.key === 'mover') && !(lineaVista === 'stunned' && v.key === 'diferencias'))
  // 🔑 El cartel de «modo paralelo» era fijo: después del corte de Stunned (`CAJA_STUNNED_ERP=1`) seguiría diciendo que GN sirve.
  // Si la configuración no se puede leer queda el texto de siempre (el prudente).
  const [stunnedReal, setStunnedReal] = useState(false)
  useEffect(() => {
    if (lineaVista !== 'stunned') return
    let vivo = true
    usarMarcaCaja('zattia')
    leerConfig().then((c) => { if (vivo) setStunnedReal(!!c.stunned_erp) }).catch(() => {})
    return () => { vivo = false }
  }, [lineaVista])
  // Contadores rojos del menú y de las pestañas: los mismos números de «Para hacer» de Inicio (la marca como Inicio: BDI o Zattia).
  const contadores = useContadoresErp(marca === 'bdi' ? 'bdi' : 'zattia', lineaVista)
  const opciones = marcas.flatMap((m): Opcion[] => m === 'bdi' ? [{ key: 'bdi', titulo: 'BDI' }] : (soloStunned ? [] : [{ key: 'zattia', titulo: 'Zattia' } as Opcion]).concat({ key: 'stunned', titulo: 'Stunned' }))
  const opcionActiva = marca === 'bdi' ? 'bdi' : lineaVista === 'stunned' ? 'stunned' : 'zattia'
  const elegirOpcion = (k: 'bdi' | 'zattia' | 'stunned') => {
    if (k === 'bdi') { setMarca('bdi'); return }
    setLinea(k)
    if (marca !== 'zattia') setMarca('zattia')
  }
  // La tira de Configuración (cuenta · ruta · regla) salta a la pestaña o la vista que corresponde.
  const irAPieza = (k: 'cuentas' | 'rutas' | 'reglas') => (k === 'reglas' ? ir('configuracion', 'reglas') : ir('configuracion', 'cuentas', k))
  const ajustarPrenda = (p: PrendaAAjustar) => { setAAjustar(p); setPrendaGlobal(null); ir('stock', 'ajustes') }
  const elegirDeLaBusqueda = (d: DestinoBusqueda) => {
    setPanel(null)
    if (d.tipo === 'ir') { ir(d.seccion, d.pestania); return }
    if (d.marca !== marca) { setMarca(d.marca); if (d.marca === 'zattia') setLinea('zattia') }
    if (d.tipo === 'prenda') { setPrendaGlobal({ marca: d.marca, producto: d.producto, talle: d.talle }); return }
    if (d.tipo === 'venta') {
      setPedidoN((n) => n + 1)
      setAAbrir({ tipo: 'venta', id: d.id, numero: d.numero, periodo: periodoDeVenta(d.ocurridaEn, diaArgentino(Date.now())) ?? 'mes' })
      ir('ventas', 'ventas'); return
    }
    setPedidoN((n) => n + 1)
    setAAbrir({ tipo: 'cliente', doc: d.doc, nombre: d.nombre })
    ir('clientes', 'clientes')
  }

  // El selector BDI · Zattia · Stunned: en el menú de la compu (oscuro) y en la hoja de «Más» del celular (claro).
  const selectorMarca = (claro: boolean) => opciones.length > 1 && (
    <div role="radiogroup" aria-label="Marca" style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 9, background: claro ? color.bg2 : 'rgba(255,255,255,0.08)' }}>
      {opciones.map((o) => {
        const on = opcionActiva === o.key
        return (
          <button
            // `data-foco`: la hoja enfoca la marca ELEGIDA (con el foco en la primera, BDI parecía la elegida).
            key={o.key} type="button" role="radio" aria-checked={on} onClick={() => elegirOpcion(o.key)} data-foco={claro && on ? '' : undefined}
            style={{ flex: 1, height: claro ? 36 : 30, border: 0, borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: weight.semibold, whiteSpace: 'nowrap', background: on ? (claro ? color.surface : 'rgba(255,255,255,0.16)') : 'transparent', color: on ? (claro ? color.ink : '#fff') : (claro ? color.mut : '#94a3b8'), boxShadow: on && claro ? '0 1px 2px rgba(16,24,40,.1)' : undefined }}
          >
            <span aria-hidden style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, marginRight: 6, background: COLOR_DE_MARCA[o.key] }} />
            {o.titulo}
          </button>
        )
      })}
    </div>
  )
  const nombreMarca = opciones.find((o) => o.key === opcionActiva)?.titulo ?? CUENTAS[marca].nombre
  const enMas = EN_MAS.some((s) => s.key === seccion.key)
  const contadorMas = EN_MAS.reduce((a, s) => a + (contadores[s.key] ?? 0), 0)

  return (
    <div className="shell erp-app">
      {/* 📱 Arriba en el celular: la sección, la marca (abre «Más», donde se cambia) y la lupa. En la compu ⛔ se dibuja (globals.css). */}
      <div className="erp-movil-top">
        <span className="erp-movil-titulo">{seccion.titulo}</span>
        <button type="button" className="erp-movil-marca" onClick={() => setHojaMas(true)} aria-label={`Marca: ${nombreMarca}. Cambiar`}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: COLOR_DE_MARCA[opcionActiva] }} />
          {nombreMarca}
          <span aria-hidden style={{ fontSize: 10, opacity: 0.8 }}>▾</span>
        </button>
        <button type="button" className="erp-movil-icono" onClick={() => setPanel('buscar')} aria-label="Buscar una venta, producto o cliente">
          <Trazo d={TRAZO_BUSCAR} />
        </button>
      </div>

      <nav aria-label="Secciones del ERP" className="erp-menu">
        <div className="erp-menu-logo">
          <span aria-hidden style={{ width: 28, height: 28, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--mo-brand-solid)', fontSize: 14 }}>A</span>
          Areben ERP
        </div>
        {/* 🎨 30-oct (Bruno): el menú es de GRUPOS. El grupo abierto muestra sus ítems (las pestañas de antes), cada uno con su contador. */}
        {SECCIONES_ERP.map((s) => {
          const abierta = s.key === seccion.key
          const items = visibles(s.pestanias)
          const sinItems = items.length === 0
          return (
            <div key={s.key} style={{ display: 'flex', flexDirection: 'column' }}>
              <Link href={hrefErp(s.key)} aria-current={abierta && sinItems ? 'page' : undefined} aria-expanded={sinItems ? undefined : abierta}
                className={`erp-menu-item${abierta && sinItems ? ' erp-menu-item--on' : ''}${abierta && !sinItems ? ' erp-menu-item--abierta' : ''}`}>
                <Trazo d={s.icono} />
                <span>{s.titulo}</span>
                {!abierta && <Contador n={contadores[s.key]} titulo={TITULO_CONTADOR[s.key] ?? 'para hacer'} />}
              </Link>
              {abierta && !sinItems && (
                <div className="erp-menu-subs">
                  {items.map((p) => {
                    const on = p.key === pestania
                    return (
                      <Link key={p.key} href={hrefErp(s.key, p.key)} aria-current={on ? 'page' : undefined} className={`erp-menu-sub${on ? ' erp-menu-sub--on' : ''}`}>
                        <span>{p.label}</span>
                        <Contador n={contadores[`${s.key}/${p.key}`]} titulo={TITULO_CONTADOR[s.key] ?? 'para hacer'} />
                      </Link>
                    )
                  })}
                  {/* La Caja (el POS) ⛔ es una pantalla del ERP: se abre aparte, como siempre. */}
                  {s.key === 'ventas' && <Link href="/pos" className="erp-menu-sub erp-menu-sub--afuera"><span>Abrir la Caja</span><span aria-hidden>↗</span></Link>}
                </div>
              )}
            </div>
          )
        })}
        <div className="erp-menu-pie">
          {selectorMarca(false)}
          <button type="button" onClick={() => setPanel('buscar')} className="erp-menu-item" style={{ height: 'auto', border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
            <Trazo d={TRAZO_BUSCAR} />
            <span>Buscar</span><kbd style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>⌘K</kbd>
          </button>
          <Link href="/inicio" className="erp-menu-item">
            <Trazo d={TRAZO_VOLVER} />
            <span>Volver al monitor</span>
          </Link>
        </div>
      </nav>
      <div className="shell-main">
        <ProveedorLineaErp value={lineaVista}>
        <div className="shell-content">
          <div className="seccion-pad" style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
            {/* 🎯 Bruno 30-oct: el cartel de Stunned «ya vende por el ERP» sobraba. Queda sólo donde Gestión Nube sigue siendo el que sirve. */}
            {seccion.key !== 'inicio' && !(lineaVista === 'stunned' && stunnedReal) && (
              <p style={{ margin: 0, padding: '0 8px', lineHeight: '20px', fontSize: 12, color: 'var(--mo-info)', background: 'var(--mo-info-bg)', borderRadius: 4, borderLeft: `3px solid ${COLOR_DE_MARCA[opcionActiva]}` }}>
                {`${lineaVista === 'stunned' ? 'Stunned' : CUENTAS[marca].nombre} · modo paralelo: Gestión Nube sigue siendo el que sirve hoy.`}
              </p>
            )}
            {seccion.key !== 'inicio' && (
              <header style={{ display: 'flex', flexDirection: 'column', gap: space[2], borderBottom: vistasDeAca.length > 1 ? `1px solid ${color.line}` : undefined }}>
                {/* 📱 En el celular los ítems del grupo van como pestañas (el menú de costado ⛔ se ve): en la compu se esconden (globals.css). */}
                {visibles(seccion.pestanias).length > 1 && (
                  <div className="erp-pestanias erp-pestanias-movil">
                    <Tabs variant="underline" items={visibles(seccion.pestanias).map((p) => ({ ...p, badge: <Contador n={contadores[`${seccion.key}/${p.key}`]} titulo={TITULO_CONTADOR[seccion.key] ?? 'para hacer'} /> }))} value={pestania ?? ''} onChange={(k) => { setAAjustar(null); ir(seccion.key, k) }} />
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap' }}>
                  {/* 📱 En el celular el título va en la barra de arriba (`erp-movil-top`): acá se esconde. */}
                  <h1 className="erp-titulo" style={{ margin: 0, fontSize: 24, fontWeight: weight.bold, color: color.ink, whiteSpace: 'nowrap', borderLeft: `4px solid ${COLOR_DE_MARCA[opcionActiva]}`, paddingLeft: 10 }}>{itemActual?.label ?? seccion.titulo}</h1>
                  {/* Lo que era pestaña y es una ACCIÓN (mapa del menú, 30-oct): un botón al lado del título. */}
                  {vista === 'facturacion' && <Button size="sm" onClick={() => ir('ventas', 'facturacion', 'factura')}>Facturar una venta</Button>}
                  {vista === 'factura' && <Button size="sm" variant="outline" onClick={() => ir('ventas', 'facturacion')}>Volver a Facturas</Button>}
                  {pestania === 'cambio' && <Button size="sm" variant="outline" onClick={() => ir('ventas', 'ventas')}>Volver a Ventas</Button>}
                </div>
                {vistasDeAca.length > 1 && (
                  // 📱 En el celular las vistas se deslizan de costado (`erp-vistas`, globals.css).
                  <div className="erp-vistas" style={{ marginBottom: -1 }}><Tabs variant="underline" items={vistasDeAca} value={vista ?? ''} onChange={(k) => ir(seccion.key, pestania, k)} style={{ borderBottom: 'none' }} /></div>
                )}
              </header>
            )}
            {/* 📱 Las pantallas de compu se miran desde el celular, pero se cambian en la compu (Bruno, 29-oct). En la compu ⛔ se ve (globals.css). */}
            {(seccion.key === 'configuracion' || pestania === 'facturacion') && (
              <div className="erp-aviso-compu" role="note"><span aria-hidden>⌨︎</span><span>Esta pantalla se mira desde acá, pero se <b>cambia en la compu</b>.</span></div>
            )}
            {seccion.key === 'inicio' && <InicioErp key={marca} href={hrefErp} />}
            {seccion.vacia && <EmptyState title={seccion.vacia} />}
            {/* `key`: al cambiar de marca se cierra la ficha abierta (era de la otra marca) y se vuelve a leer. */}
            {vista === 'ventas' && <VentasErp key={`${marca}/${pedidoN}`} irACaja={(que) => (que === 'cambio' ? ir('ventas', 'cambio') : ir('ventas', 'facturacion', 'factura'))} abrir={aAbrir?.tipo === 'venta' ? aAbrir : null} alAbrir={() => setAAbrir(null)} />}
            {vista === 'por-producto' && <PorProductoErp key={marca} />}
            {pestania === 'cobros' && <CobrosErp key={marca} />}
            {pestania === 'gastos' && <GastosErp key={marca} />}
            
            {vista === 'facturacion' && <Facturacion key={marca} />}
            {vista === 'factura' && <FacturaCaja />}
            {pestania === 'cambio' && <CambioCaja />}
            {pestania === 'cajas' && <CajasErp key={marca} />}
            {vista === 'stock' && <StockErp key={marca} ajustar={ajustarPrenda} irA={(p, v) => ir('stock', p, v)} />}
            {vista === 'movimientos' && <MovimientosStock key={marca} ajustar={ajustarPrenda} />}
            {/* 🔑 Línea con la transferencia en el ERP (Bruno, 30-oct): una sola lista, la de los documentos, con «Mover» adentro. */}
            {vista === 'transferencias' && (transferenciaEnErp ? <MoverYRecibir key={lineaVista} unificada /> : <TransferenciasStock key={marca} />)}
            {vista === 'mover' && (transferenciaEnErp ? <MoverYRecibir key={`${lineaVista}/mover`} unificada abrirMover /> : <MoverYRecibir key={lineaVista} />)}
            {vista === 'ajustes' && <AjustesStock key={aAjustar ? `${aAjustar.linea}/${aAjustar.producto}/${aAjustar.talle}` : `lista/${lineaVista}`} pedida={aAjustar} />}
            {vista === 'ingresos' && <RecepcionesStock key={marca} />}
            {vista === 'comparacion' && <ComparacionStock key={marca} ajustar={ajustarPrenda} irAConciliacion={() => ir('stock', 'diferencias', 'conciliacion')} />}
            {vista === 'conciliacion' && <ConciliacionDia key={`${marca}/${lineaVista}`} ajustar={ajustarPrenda} />}
            {vista === 'diferencias' && <DiferenciasDia key={marca} ajustar={ajustarPrenda} />}
            {pestania === 'productos' && <ProductosErp />}
            {pestania === 'precios' && <PreciosErp key={marca} />}
            {vista === 'clientes' && <ClientesErp key={`${marca}/${pedidoN}`} abrir={aAbrir?.tipo === 'cliente' ? aAbrir : null} alAbrir={() => setAAbrir(null)} />}
            {vista === 'cuenta-corriente' && <CuentaCorriente key={marca} />}
            {pestania === 'proveedores' && <ProveedoresErp key={marca} />}
            {vista === 'reglas' && <ReglasComerciales key={`${marca}/${lineaVista}`} ir={irAPieza} />}
            {vista === 'rutas' && <RutasCobro key={`${marca}/${lineaVista}`} ir={irAPieza} />}
            {vista === 'cuentas' && <CuentasErp key={marca} ir={irAPieza} />}
            {vista === 'redondeo' && <Redondeo key={`${marca}/${lineaVista}`} />}
            {pestania === 'estructura' && <EstructuraErp key={marca} />}
          </div>
        </div>
        </ProveedorLineaErp>
      </div>
      {/* 📱 Abajo en el celular: Inicio · Ventas · Stock · Productos · Más (Bruno, 29-oct; 30-oct la sección Caja pasó a Ventas). En la compu ⛔ se dibuja (globals.css). */}
      <nav aria-label="Secciones del ERP (celular)" className="erp-movil-nav">
        {ABAJO.map((k) => {
          const s = SECCIONES_ERP.find((x) => x.key === k)!
          const on = s.key === seccion.key
          return (
            <Link key={k} href={hrefErp(k)} aria-current={on ? 'page' : undefined} className={`erp-movil-nav-item${on ? ' erp-movil-nav-item--on' : ''}`}>
              <Trazo d={s.icono} size={20} />
              <span>{CORTO_ABAJO[k] ?? s.titulo}</span>
              {!!contadores[k] && <span className="erp-movil-nav-n" aria-label={`${contadores[k]} ${TITULO_CONTADOR[k] ?? 'para hacer'}`}>{contadores[k]}</span>}
            </Link>
          )
        })}
        <button type="button" onClick={() => setHojaMas(true)} aria-expanded={hojaMas} className={`erp-movil-nav-item${enMas ? ' erp-movil-nav-item--on' : ''}`}>
          <Trazo d={TRAZO_MAS} size={20} />
          <span>Más</span>
          {contadorMas > 0 && <span className="erp-movil-nav-n" aria-label={`${contadorMas} para hacer`}>{contadorMas}</span>}
        </button>
      </nav>
      <Modal abierto={hojaMas} onCerrar={() => setHojaMas(false)} titulo="Más">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {selectorMarca(true)}
          {EN_MAS.map((s) => (
            <Link key={s.key} href={hrefErp(s.key)} onClick={() => setHojaMas(false)} aria-current={s.key === seccion.key ? 'page' : undefined} className="erp-hoja-item">
              <Trazo d={s.icono} />
              <span>{s.titulo}</span>
              <Contador n={contadores[s.key]} titulo={TITULO_CONTADOR[s.key] ?? 'para hacer'} />
            </Link>
          ))}
          <div style={{ height: 1, background: color.line, margin: '4px 0' }} />
          <button type="button" className="erp-hoja-item" onClick={() => { setHojaMas(false); setPanel('buscar') }}>
            <Trazo d={TRAZO_BUSCAR} />
            <span>Buscar una venta, producto o cliente</span>
          </button>
          <Link href="/inicio" className="erp-hoja-item">
            <Trazo d={TRAZO_VOLVER} />
            <span>Volver al monitor</span>
          </Link>
        </div>
      </Modal>
      {panel === 'buscar' && <BusquedaGlobal marca={marca} marcas={marcas} secciones={SECCIONES_BUSCABLES} onElegir={elegirDeLaBusqueda} onCerrar={() => setPanel(null)} />}
      {panel === 'atajos' && <HojaDeAtajos onCerrar={() => setPanel(null)} />}
      {prendaGlobal && <FichaPrenda key={`${prendaGlobal.marca}/${prendaGlobal.producto}/${prendaGlobal.talle}`} marca={prendaGlobal.marca} prenda={{ producto: prendaGlobal.producto, talle: prendaGlobal.talle, fila: null }} onCerrar={() => setPrendaGlobal(null)} ajustar={ajustarPrenda} />}
    </div>
  )
}
