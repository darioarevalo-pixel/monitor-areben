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
import { StockErp, type PrendaAAjustar } from './stock/StockErp'
import { MovimientosStock } from './stock/MovimientosStock'
import { TransferenciasStock } from './stock/TransferenciasStock'
import { RecepcionesStock } from './stock/RecepcionesStock'
import { ComparacionStock } from './stock/ComparacionStock'
import { DiferenciasDia } from './DiferenciasDia'
import { ConciliacionDia } from './ConciliacionDia'
import { AjustesStock } from './AjustesStock'
import { ProductosErp } from './productos/ProductosErp'
import { ReglasComerciales } from './ReglasComerciales'
import { RutasCobro } from './RutasCobro'
import { VentasErp } from './ventas/VentasErp'
import { PorProductoErp } from './ventas/PorProductoErp'
import { ClientesErp } from './clientes/ClientesErp'
import { CuentaCorriente } from './clientes/CuentaCorriente'
import { ProveedoresErp } from './clientes/ProveedoresErp'
import { InicioErp } from './inicio/InicioErp'

type Seccion = {
  key: string
  titulo: string
  /** El trazo del ícono de línea (24×24), el mismo del diseño v8. */
  icono: string
  /** Va colgada de la anterior (Caja (POS) debajo de Ventas). */
  debajo?: boolean
  pestanias: Array<{ key: string; label: string }>
  /** Qué dice la sección mientras no tiene pantallas. */
  vacia?: string
}

/** Las 6 del diseño (+ la Caja debajo de Ventas), con las pestañas que hay hoy repartidas adentro. */
export const SECCIONES_ERP: Seccion[] = [
  { key: 'inicio', titulo: 'Inicio', icono: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z', pestanias: [] },
  {
    key: 'ventas', titulo: 'Ventas', icono: 'M6 2l-2 4v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-2-4z M4 6h16 M16 10a4 4 0 0 1-8 0',
    pestanias: [{ key: 'ventas', label: 'Ventas' }, { key: 'por-producto', label: 'Por producto' }, { key: 'facturacion', label: 'Facturación' }],
  },
  { key: 'caja', titulo: 'Caja (POS)', icono: 'M3 8h18v12H3z M7 8V4h10v4 M7 13h4', debajo: true, pestanias: [{ key: 'cambio', label: 'Cambio' }, { key: 'factura', label: 'Factura' }] },
  {
    key: 'stock', titulo: 'Stock', icono: 'M21 8l-9-5-9 5 9 5 9-5z M3 8v8l9 5 9-5V8 M12 13v8',
    pestanias: [{ key: 'stock', label: 'Stock' }, { key: 'movimientos', label: 'Movimientos' }, { key: 'transferencias', label: 'Transferencias' }, { key: 'ajustes', label: 'Conteos y ajustes' }, { key: 'recepciones', label: 'Ingresos' }, { key: 'comparacion', label: 'Comparación con TN y ML' }, { key: 'conciliacion', label: 'Conciliación' }, { key: 'diferencias', label: 'Diferencias con GN' }],
  },
  { key: 'productos', titulo: 'Productos y precios', icono: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z M7.5 7.5h.01', pestanias: [{ key: 'productos', label: 'Productos' }] },
  {
    key: 'clientes', titulo: 'Clientes y proveedores', icono: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
    pestanias: [{ key: 'clientes', label: 'Clientes' }, { key: 'cuenta-corriente', label: 'Cuenta corriente' }, { key: 'proveedores', label: 'Proveedores' }],
  },
  {
    key: 'configuracion', titulo: 'Configuración', icono: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M4 12h2 M18 12h2 M12 4v2 M12 18v2 M6.3 6.3l1.4 1.4 M16.3 16.3l1.4 1.4 M6.3 17.7l1.4-1.4 M16.3 7.7l1.4-1.4',
    pestanias: [{ key: 'reglas', label: 'Reglas' }, { key: 'cuentas', label: 'Cuentas de cobro' }],
  },
]

/** `['stock', 'ajustes']` → la sección y la pestaña; lo que no existe cae en Inicio o en la primera pestaña. */
export function resolverRutaErp(ruta: string[]) {
  const seccion = SECCIONES_ERP.find((s) => s.key === ruta[0]) ?? SECCIONES_ERP[0]
  const pestania = seccion.pestanias.find((p) => p.key === ruta[1])?.key ?? seccion.pestanias[0]?.key ?? null
  const valida = seccion.key === (ruta[0] ?? 'inicio') && (ruta[1] == null || pestania === ruta[1])
  return { seccion, pestania, valida }
}

export const hrefErp = (seccion: string, pestania?: string | null) => (seccion === 'inicio' ? '/erp' : `/erp/${seccion}${pestania ? `/${pestania}` : ''}`)

function Trazo({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}

export function Erp({ ruta = [] }: { ruta?: string[] }) {
  const router = useRouter()
  const { perfil, marca, setMarca } = useSesion()
  const { seccion, pestania, valida } = resolverRutaErp(ruta)
  // De una ficha de prenda (Stock, Movimientos, Conciliación, Diferencias) a «Nuevo ajuste» con la prenda cargada
  // (Conteos y ajustes): viaja en memoria, la dirección sólo dice la pestaña. 🎨 19-oct: Conciliación y Diferencias abren la
  // ficha AL COSTADO, ⛔ saltan a Stock.
  const [aAjustar, setAAjustar] = useState<PrendaAAjustar | null>(null)
  const ir = (s: string, p?: string | null) => router.push(hrefErp(s, p))
  // Una dirección vieja o mal escrita ⇒ la que corresponde (⛔ una pantalla en blanco).
  useEffect(() => {
    if (!valida) router.replace(hrefErp(seccion.key, pestania))
  }, [valida, seccion.key, pestania, router])

  const marcas = (Object.keys(CUENTAS) as Marca[]).filter((m) => perfil && puedeVer(perfil, m, 'erp'))
  const ajustarPrenda = (p: PrendaAAjustar) => { setAAjustar(p); ir('stock', 'ajustes') }

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
            </Link>
          )
        })}
        <div className="erp-menu-pie">
          {marcas.length > 1 && (
            <div role="radiogroup" aria-label="Marca" style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 9, background: 'rgba(255,255,255,0.08)' }}>
              {marcas.map((m) => (
                <button
                  key={m} type="button" role="radio" aria-checked={marca === m} onClick={() => setMarca(m)}
                  style={{ flex: 1, height: 30, border: 0, borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: weight.semibold, whiteSpace: 'nowrap', background: marca === m ? 'rgba(255,255,255,0.16)' : 'transparent', color: marca === m ? '#fff' : '#94a3b8' }}
                >
                  {m === 'bdi' ? 'BDI' : 'Zattia'}
                </button>
              ))}
            </div>
          )}
          <Link href="/inicio" className="erp-menu-item">
            <Trazo d="M19 12H5 M12 19l-7-7 7-7" />
            <span>Volver al monitor</span>
          </Link>
        </div>
      </nav>
      <div className="shell-main">
        <div className="shell-content">
          <div className="seccion-pad" style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
            <header style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: weight.bold, color: color.ink }}>{seccion.titulo}</h1>
                <p style={{ margin: '2px 0 0', color: color.mut }}>
                  {CUENTAS[marca].nombre} · en construcción, en paralelo con Gestión Nube (el que sirve hoy). Lo ven sólo los administradores.
                </p>
              </div>
              {seccion.pestanias.length > 1 && (
                <Tabs variant="underline" items={seccion.pestanias} value={pestania ?? ''} onChange={(k) => { setAAjustar(null); ir(seccion.key, k) }} />
              )}
            </header>

            {seccion.key === 'inicio' && <InicioErp key={marca} href={hrefErp} />}
            {seccion.vacia && <EmptyState title={seccion.vacia} />}
            {/* `key`: al cambiar de marca se cierra la ficha abierta (era de la otra marca) y se vuelve a leer. */}
            {pestania === 'ventas' && <VentasErp key={marca} irACaja={(que) => ir('caja', que)} />}
            {pestania === 'por-producto' && <PorProductoErp key={marca} />}
            {pestania === 'facturacion' && <Facturacion key={marca} />}
            {pestania === 'cambio' && <CambioCaja />}
            {pestania === 'factura' && <FacturaCaja />}
            {pestania === 'stock' && <StockErp key={marca} ajustar={ajustarPrenda} />}
            {pestania === 'movimientos' && <MovimientosStock key={marca} ajustar={ajustarPrenda} />}
            {pestania === 'transferencias' && <TransferenciasStock key={marca} />}
            {pestania === 'ajustes' && <AjustesStock key={aAjustar ? `${aAjustar.linea}/${aAjustar.producto}/${aAjustar.talle}` : 'lista'} pedida={aAjustar} />}
            {pestania === 'recepciones' && <RecepcionesStock key={marca} />}
            {pestania === 'comparacion' && <ComparacionStock key={marca} ajustar={ajustarPrenda} irAConciliacion={() => ir('stock', 'conciliacion')} />}
            {pestania === 'conciliacion' && <ConciliacionDia key={marca} ajustar={ajustarPrenda} />}
            {pestania === 'diferencias' && <DiferenciasDia key={marca} ajustar={ajustarPrenda} />}
            {pestania === 'productos' && <ProductosErp />}
            {pestania === 'clientes' && <ClientesErp key={marca} />}
            {pestania === 'cuenta-corriente' && <CuentaCorriente key={marca} />}
            {pestania === 'proveedores' && <ProveedoresErp key={marca} />}
            {pestania === 'reglas' && <ReglasComerciales key={marca} ir={(k) => ir('configuracion', k)} />}
            {pestania === 'cuentas' && <RutasCobro key={marca} ir={(k) => ir('configuracion', k)} />}
          </div>
        </div>
      </div>
    </div>
  )
}
