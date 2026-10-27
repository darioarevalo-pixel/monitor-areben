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
import { EmptyState, Tabs, color, space, weight } from '@/components/ui'
import { CUENTAS } from '@/lib/cuentas'
import type { Marca } from '@/lib/nav.datos'
import { puedeVer } from '@/lib/permisos'
import { CambioCaja } from './CambioCaja'
import { FacturaCaja } from './FacturaCaja'
import { Facturacion } from './Facturacion'
import { useContadoresErp } from '@/lib/erp/contadores-erp'
import { ProveedorLineaErp, elegirLinea, lineaElegida, type LineaErp } from '@/lib/erp/linea-erp'
import { StockErp, type PrendaAAjustar } from './stock/StockErp'
import { MovimientosStock } from './stock/MovimientosStock'
import { TransferenciasStock } from './stock/TransferenciasStock'
import { MoverYRecibir } from './stock/MoverYRecibir'
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

type Seccion = {
  key: string
  titulo: string
  /** El trazo del ícono de línea (24×24), el mismo del diseño v8. */
  icono: string
  /** Va colgada de la anterior (Caja (POS) debajo de Ventas). */
  debajo?: boolean
  pestanias: Array<{ key: string; label: string; /** Vistas de adentro (diseño §9: Stock 9 → 4): la primera es la de siempre. */ vistas?: Array<{ key: string; label: string }> }>
  /** Qué dice la sección mientras no tiene pantallas. */
  vacia?: string
}

/** Las 6 del diseño (+ la Caja debajo de Ventas), con las pestañas que hay hoy repartidas adentro. */
export const SECCIONES_ERP: Seccion[] = [
  { key: 'inicio', titulo: 'Inicio', icono: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z', pestanias: [] },
  {
    key: 'ventas', titulo: 'Ventas', icono: 'M6 2l-2 4v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-2-4z M4 6h16 M16 10a4 4 0 0 1-8 0',
    pestanias: [
      { key: 'ventas', label: 'Ventas' }, { key: 'por-producto', label: 'Por producto' }, { key: 'cobros', label: 'Cobros' }, { key: 'gastos', label: 'Gastos' },
      { key: 'facturacion', label: 'Facturación', vistas: [{ key: 'facturacion', label: 'Facturas' }, { key: 'factura', label: 'Facturar una venta' }] },
    ],
  },
  { key: 'caja', titulo: 'Caja', icono: 'M3 8h18v12H3z M7 8V4h10v4 M7 13h4', debajo: true, pestanias: [{ key: 'cambio', label: 'Cambio' }, { key: 'cajas', label: 'Cajas' }] },
  {
    key: 'stock', titulo: 'Stock', icono: 'M21 8l-9-5-9 5 9 5 9-5z M3 8v8l9 5 9-5V8 M12 13v8',
    pestanias: [
      { key: 'stock', label: 'Stock', vistas: [{ key: 'stock', label: 'Productos' }, { key: 'movimientos', label: 'Movimientos' }] },
      { key: 'transferencias', label: 'Transferencias', vistas: [{ key: 'transferencias', label: 'Transferencias' }, { key: 'mover', label: 'Mover y recibir' }] },
      { key: 'ajustes', label: 'Ingresos y ajustes', vistas: [{ key: 'ajustes', label: 'Ajustes' }, { key: 'ingresos', label: 'Ingresos' }] },
      { key: 'diferencias', label: 'Diferencias', vistas: [{ key: 'comparacion', label: 'Con Tienda Nube y Mercado Libre' }, { key: 'conciliacion', label: 'Conciliación' }, { key: 'diferencias', label: 'Con Gestión Nube' }] },
    ],
  },
  { key: 'productos', titulo: 'Productos y precios', icono: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z M7.5 7.5h.01', pestanias: [{ key: 'productos', label: 'Productos' }, { key: 'precios', label: 'Precios' }, { key: 'redondeo', label: 'Redondeo' }] },
  {
    key: 'clientes', titulo: 'Clientes y proveedores', icono: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
    pestanias: [{ key: 'clientes', label: 'Clientes', vistas: [{ key: 'clientes', label: 'Clientes' }, { key: 'cuenta-corriente', label: 'Cuenta corriente' }] }, { key: 'proveedores', label: 'Proveedores' }],
  },
  {
    key: 'configuracion', titulo: 'Configuración', icono: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M4 12h2 M18 12h2 M12 4v2 M12 18v2 M6.3 6.3l1.4 1.4 M16.3 16.3l1.4 1.4 M6.3 17.7l1.4-1.4 M16.3 7.7l1.4-1.4',
    pestanias: [{ key: 'cuentas', label: 'Cuentas y medios de cobro', vistas: [{ key: 'cuentas', label: 'Cuentas' }, { key: 'rutas', label: 'Rutas' }] }, { key: 'reglas', label: 'Descuentos por forma de pago' }, { key: 'estructura', label: 'Marcas, depósitos y puntos de venta' }],
  },
]

/** Pestañas y vistas de antes (direcciones guardadas, ⌘K que salta a una vista): cada una cae en su sección, pestaña y vista nuevas. */
const VIEJAS: Record<string, Record<string, [string, string, string | null]>> = {
  stock: {
    movimientos: ['stock', 'stock', 'movimientos'], mover: ['stock', 'transferencias', 'mover'], recepciones: ['stock', 'ajustes', 'ingresos'], ingresos: ['stock', 'ajustes', 'ingresos'],
    comparacion: ['stock', 'diferencias', 'comparacion'], conciliacion: ['stock', 'diferencias', 'conciliacion'], diferencias: ['stock', 'diferencias', 'diferencias'],
  },
  ventas: { cajas: ['caja', 'cajas', null], factura: ['ventas', 'facturacion', 'factura'] },
  caja: { factura: ['ventas', 'facturacion', 'factura'] },
  clientes: { 'cuenta-corriente': ['clientes', 'clientes', 'cuenta-corriente'] },
  configuracion: { 'cuentas-reales': ['configuracion', 'cuentas', 'cuentas'], rutas: ['configuracion', 'cuentas', 'rutas'], redondeo: ['productos', 'redondeo', null] },
}
const viejaDe = (seccion: string, pestania: string | null | undefined, vista: string | null | undefined) => (pestania && !vista ? VIEJAS[seccion]?.[pestania] : undefined)

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

/** Para ⌘K: cada pestaña con SUS vistas (la búsqueda salta a una vista, no a un grupo). */
export const SECCIONES_BUSCABLES: Seccion[] = SECCIONES_ERP.map((s) => ({ ...s, pestanias: s.pestanias.flatMap((p) => p.vistas ?? [p]) }))

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
  // `Erp` se REMONTA al cambiar de sección (un `useState` se perdía en el camino): el pedido vive en el módulo y la lista lo suelta.
  const [aAbrir, setAAbrirEstado] = useState<AAbrir>(() => pedidoDeBusqueda)
  const setAAbrir = (v: AAbrir) => { pedidoDeBusqueda = v; setAAbrirEstado(v) }
  // Cada pedido de la búsqueda remonta la lista que lo recibe (ya montada, no volvería a leer ni a mirar `abrir`).
  const [pedidoN, setPedidoN] = useState(0)
  const [prendaGlobal, setPrendaGlobal] = useState<{ marca: Marca; producto: string; talle: string } | null>(null)
  useAtajosErp(setPanel)
  // Contadores rojos del menú y de las pestañas: los mismos números de «Para hacer» de Inicio (la marca como Inicio: BDI o Zattia).
  const contadores = useContadoresErp(marca === 'bdi' ? 'bdi' : 'zattia')
  // Una dirección vieja o mal escrita ⇒ la que corresponde (⛔ una pantalla en blanco).
  useEffect(() => {
    if (!valida) router.replace(hrefErp(seccion.key, pestania, vista))
  }, [valida, seccion.key, pestania, vista, router])

  const marcas = (Object.keys(CUENTAS) as Marca[]).filter((m) => perfil && puedeVer(perfil, m, 'erp'))
  // Selector BDI · Zattia · Stunned (diseño §9). 🔴 Stunned no es una `Marca`: es marca zattia + línea `stunned` (`docs/lineas.md`).
  const [linea, setLineaEstado] = useState<LineaErp>(lineaElegida)
  const setLinea = (l: LineaErp) => { elegirLinea(l); setLineaEstado(l) }
  const lineaVista: LineaErp = marca === 'zattia' ? (linea === 'stunned' ? 'stunned' : 'zattia') : ''
  const opciones = marcas.flatMap((m): Opcion[] => m === 'bdi' ? [{ key: 'bdi', titulo: 'BDI' }] : [{ key: 'zattia', titulo: 'Zattia' }, { key: 'stunned', titulo: 'Stunned' }])
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

  return (
    <div className="shell erp-app">
      <nav aria-label="Secciones del ERP" className="erp-menu">
        <div className="erp-menu-logo">
          <span aria-hidden style={{ width: 28, height: 28, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'var(--mo-brand-solid)', fontSize: 14 }}>A</span>
          Areben ERP
        </div>
        {SECCIONES_ERP.map((s) => {
          const on = s.key === seccion.key
          return (
            <Link key={s.key} href={hrefErp(s.key)} aria-current={on ? 'page' : undefined} className={`erp-menu-item${s.debajo ? ' erp-menu-item--debajo' : ''}${on ? ' erp-menu-item--on' : ''}`}>
              <Trazo d={s.icono} size={s.debajo ? 16 : 18} />
              <span>{s.titulo}</span>
              <Contador n={contadores[s.key]} titulo={TITULO_CONTADOR[s.key] ?? 'para hacer'} />
            </Link>
          )
        })}
        <div className="erp-menu-pie">
          {opciones.length > 1 && (
            <div role="radiogroup" aria-label="Marca" style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 9, background: 'rgba(255,255,255,0.08)' }}>
              {opciones.map((o) => (
                <button
                  key={o.key} type="button" role="radio" aria-checked={opcionActiva === o.key} onClick={() => elegirOpcion(o.key)}
                  style={{ flex: 1, height: 30, border: 0, borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: weight.semibold, whiteSpace: 'nowrap', background: opcionActiva === o.key ? 'rgba(255,255,255,0.16)' : 'transparent', color: opcionActiva === o.key ? '#fff' : '#94a3b8' }}
                >
                  <span aria-hidden style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, marginRight: 6, background: COLOR_DE_MARCA[o.key] }} />
                  {o.titulo}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setPanel('buscar')} className="erp-menu-item" style={{ height: 'auto', border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
            <Trazo d="M21 21l-4.3-4.3 M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z" />
            <span>Buscar</span><kbd style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>⌘K</kbd>
          </button>
          <Link href="/inicio" className="erp-menu-item">
            <Trazo d="M19 12H5 M12 19l-7-7 7-7" />
            <span>Volver al monitor</span>
          </Link>
        </div>
      </nav>
      <div className="shell-main">
        <ProveedorLineaErp value={lineaVista}>
        <div className="shell-content">
          <div className="seccion-pad" style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
            <header style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
              <p style={{ margin: 0, padding: '0 8px', lineHeight: '20px', fontSize: 12, color: 'var(--mo-info)', background: 'var(--mo-info-bg)', borderRadius: 4, borderLeft: `3px solid ${COLOR_DE_MARCA[opcionActiva]}` }}>
                {lineaVista === 'stunned' ? 'Stunned' : CUENTAS[marca].nombre} · modo paralelo: Gestión Nube sigue siendo el que sirve hoy. Lo ven sólo los administradores.
              </p>
              {/* Título + pestañas en UNA línea (diseño §9). */}
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: space[5], flexWrap: 'wrap', borderBottom: `1px solid ${color.line}` }}>
                <h1 style={{ margin: 0, paddingBottom: 6, fontSize: 20, fontWeight: weight.semibold, color: color.ink, whiteSpace: 'nowrap', borderLeft: `4px solid ${COLOR_DE_MARCA[opcionActiva]}`, paddingLeft: 10 }}>{seccion.titulo}</h1>
                {seccion.pestanias.length > 1 && (
                  <Tabs variant="underline" items={seccion.pestanias.map((p) => ({ ...p, badge: <Contador n={contadores[`${seccion.key}/${p.key}`]} titulo={TITULO_CONTADOR[seccion.key] ?? 'para hacer'} /> }))} value={pestania ?? ''} onChange={(k) => { setAAjustar(null); ir(seccion.key, k) }} style={{ borderBottom: 'none', flex: '1 1 auto' }} />
                )}
              </div>
            </header>

            {vista && (
              <Tabs items={seccion.pestanias.find((p) => p.key === pestania)?.vistas ?? []} value={vista} onChange={(k) => ir(seccion.key, pestania, k)} />
            )}
            {seccion.key === 'inicio' && <InicioErp key={marca} href={hrefErp} />}
            {seccion.vacia && <EmptyState title={seccion.vacia} />}
            {/* `key`: al cambiar de marca se cierra la ficha abierta (era de la otra marca) y se vuelve a leer. */}
            {pestania === 'ventas' && <VentasErp key={`${marca}/${pedidoN}`} irACaja={(que) => ir('caja', que)} abrir={aAbrir?.tipo === 'venta' ? aAbrir : null} alAbrir={() => setAAbrir(null)} />}
            {pestania === 'por-producto' && <PorProductoErp key={marca} />}
            {pestania === 'cobros' && <CobrosErp key={marca} />}
            {pestania === 'gastos' && <GastosErp key={marca} />}
            
            {vista === 'facturacion' && <Facturacion key={marca} />}
            {vista === 'factura' && <FacturaCaja />}
            {pestania === 'cambio' && <CambioCaja />}
            {pestania === 'cajas' && <CajasErp key={marca} />}
            {vista === 'stock' && <StockErp key={marca} ajustar={ajustarPrenda} irA={(p, v) => ir('stock', p, v)} />}
            {vista === 'movimientos' && <MovimientosStock key={marca} ajustar={ajustarPrenda} />}
            {vista === 'transferencias' && <TransferenciasStock key={marca} />}
            {vista === 'mover' && <MoverYRecibir />}
            {vista === 'ajustes' && <AjustesStock key={aAjustar ? `${aAjustar.linea}/${aAjustar.producto}/${aAjustar.talle}` : 'lista'} pedida={aAjustar} />}
            {vista === 'ingresos' && <RecepcionesStock key={marca} />}
            {vista === 'comparacion' && <ComparacionStock key={marca} ajustar={ajustarPrenda} irAConciliacion={() => ir('stock', 'diferencias', 'conciliacion')} />}
            {vista === 'conciliacion' && <ConciliacionDia key={marca} ajustar={ajustarPrenda} />}
            {vista === 'diferencias' && <DiferenciasDia key={marca} ajustar={ajustarPrenda} />}
            {pestania === 'productos' && <ProductosErp />}
            {pestania === 'precios' && <PreciosErp key={marca} />}
            {vista === 'clientes' && <ClientesErp key={`${marca}/${pedidoN}`} abrir={aAbrir?.tipo === 'cliente' ? aAbrir : null} alAbrir={() => setAAbrir(null)} />}
            {vista === 'cuenta-corriente' && <CuentaCorriente key={marca} />}
            {pestania === 'proveedores' && <ProveedoresErp key={marca} />}
            {pestania === 'reglas' && <ReglasComerciales key={marca} ir={irAPieza} />}
            {vista === 'rutas' && <RutasCobro key={marca} ir={irAPieza} />}
            {vista === 'cuentas' && <CuentasErp key={marca} ir={irAPieza} />}
            {pestania === 'redondeo' && <Redondeo key={marca} />}
            {pestania === 'estructura' && <EstructuraErp key={marca} />}
          </div>
        </div>
        </ProveedorLineaErp>
      </div>
      {panel === 'buscar' && <BusquedaGlobal marca={marca} marcas={marcas} secciones={SECCIONES_BUSCABLES} onElegir={elegirDeLaBusqueda} onCerrar={() => setPanel(null)} />}
      {panel === 'atajos' && <HojaDeAtajos onCerrar={() => setPanel(null)} />}
      {prendaGlobal && <FichaPrenda key={`${prendaGlobal.marca}/${prendaGlobal.producto}/${prendaGlobal.talle}`} marca={prendaGlobal.marca} prenda={{ producto: prendaGlobal.producto, talle: prendaGlobal.talle, fila: null }} onCerrar={() => setPrendaGlobal(null)} ajustar={ajustarPrenda} />}
    </div>
  )
}
