'use client'

/**
 * ERP › Inicio (diseño §7; tablero 1 del v8): el RESULTADO COMERCIAL del mes en grande (sólo Admin: hoy el ERP entero es
 * sólo admin) y «Para hacer» por rol con el número de cada vista ya hecha; cada uno lleva a su pestaña.
 * 🔑 Los números son los MISMOS núcleos de las listas (`contarVistas` de Ventas, Stock y Productos): ⛔ otra cuenta.
 * 🔑 El resultado sale del espejo de GN (`api/_erp-inicio.js`): GN es el que vende hoy.
 */

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, Notice, color, font, space, weight } from '@/components/ui'
import { formatMoney } from '@/components/ui/MoneyText'
import {
  leerGastos, leerListaDeProductos, leerListaDeStock, leerListaDeVentas, leerResultadoDelMes, leerVentasPorProducto, type GastosDelPeriodo, type MarcaErp, type RenglonProducto, type ResultadoDelMes,
} from '@/lib/erp/cliente'
import { contarVistas as vistasDeVentas, filtrar as filtrarVentas, rangoDePeriodo } from '@/lib/erp/ventas-lista.core.js'
import { contarVistas as vistasDeStock, filtrar as filtrarStock } from '@/lib/erp/stock-lista.core.js'
import { contarVistas as vistasDeProductos, filtrar as filtrarProductos } from '@/lib/erp/productos-lista.core.js'
import { useLineaErp } from '@/lib/erp/linea-erp'
import { diaArgentino } from '@/lib/envios/portal.core.js'
import { ROLES, VISTA, paraHacerDe, subtituloDe, verResultado } from '@/lib/erp/inicio-roles.core.js'
import { esAdmin } from '@/lib/permisos'
import { agrupar as agruparPorProducto, filtrar as filtrarPorProducto } from '@/lib/erp/ventas-producto.core.js'
import { comoVieneElMes, doceMeses, masDejan, porCanal, stockACosto, vendidoDelDia } from '@/lib/erp/inicio-panel.core.js'
import { ComoViene, MasDejan, MesAMes, PorCanal, TarjetaVendido, rotulo, tarjeta } from './PanelInicio'

/** Lo que se cuenta de cada lista: `null` = leyendo; un texto = no se pudo (y por qué). */
type Conteo = Record<string, number> | string | null
/** Stock y Productos se guardan CRUDOS y se cuentan sobre la línea elegida (como las pantallas a las que llevan). */
type Crudo = { filas: unknown[] } | string | null

const TITULO: Record<string, string> = { ventas: 'Ventas', stock: 'Stock', productos: 'Productos', facturacion: 'Facturación' }

/** `2026-10-30` → `2026-10-29`. */
const diaAnterior = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
const cuantos = (n: number, uno: string, varios: string) => `${n.toLocaleString('es-AR')} ${n === 1 ? uno : varios}`
const fecha = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const pct = (a: number, b: number) => (b ? Math.round((a / b - 1) * 100) : null)

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
/** `2026-10-30` → «Octubre 2026». */
export const tituloDelMes = (dia: string) => { const m = MESES[Number(dia.slice(5, 7)) - 1]; return `${m[0].toUpperCase()}${m.slice(1)} ${dia.slice(0, 4)}` }

/** «Ver como» (sólo admin): un botón que abre la lista de roles, ⛔ una tira siempre a la vista. */
function VerComo({ rol, setRol }: { rol: string; setRol: (r: string) => void }) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])
  const nombre = ROLES.find(([k]) => k === rol)?.[1] ?? 'Admin'
  return (
    <div ref={caja} style={{ position: 'relative' }}>
      <Button size="sm" variant="outline" aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>Ver como: {nombre} ▾</Button>
      {abierto && (
        <div role="menu" aria-label="Ver como" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 20, minWidth: 200, padding: 6, borderRadius: 12, background: color.surface, border: `1px solid ${color.line}`, boxShadow: '0 12px 32px rgba(16,24,40,.14)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {ROLES.map(([k, n]) => (
            <button key={k} type="button" role="menuitemradio" aria-checked={rol === k} onClick={() => { setRol(k); setAbierto(false) }}
              style={{ height: 34, padding: '0 10px', border: 0, borderRadius: 8, cursor: 'pointer', textAlign: 'left', font: 'inherit', fontWeight: weight.semibold, background: rol === k ? color.bg2 : 'transparent', color: color.ink }}>
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Variacion({ ahora, antes }: { ahora: number; antes: number }) {
  const p = pct(ahora, antes)
  if (p == null) return null
  return <span style={{ color: p >= 0 ? 'var(--mo-success-ink)' : 'var(--mo-danger-ink)' }}>{p >= 0 ? '+' : ''}{p}%</span>
}

export function InicioErp({ href }: { href: (seccion: string, pestania?: string) => string }) {
  const { marca: delShell, perfil } = useSesion()
  const [rol, setRol] = useState('admin')
  const [hoy] = useState(() => diaArgentino(Date.now()))
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const [resultado, setResultado] = useState<{ marca: string; r: ResultadoDelMes | null; error: string | null } | null>(null)
  // Los gastos comerciales REALES del mismo mes (⛔ los de prueba: son de ventas que Gestión Nube no tiene).
  const [gastos, setGastos] = useState<{ marca: string; g: GastosDelPeriodo | null; error: string | null } | null>(null)
  // «Lo que más deja»: los renglones de Ventas › Por producto del mes (su mismo `agrupar`).
  const [pp, setPp] = useState<{ marca: string; renglones: RenglonProducto[] | null; error: string | null } | null>(null)
  const [conteos, setConteos] = useState<{ marca: string; ventas: Crudo; stock: Crudo; productos: Crudo }>({ marca: '', ventas: null, stock: null, productos: null })

  useEffect(() => {
    let vivo = true
    const fallo = (e: unknown) => (e instanceof Error ? e.message : 'No se pudo leer.')
    const poner = (k: 'ventas' | 'stock' | 'productos', v: Conteo | Crudo) => vivo && setConteos((c) => ({ ...(c.marca === marca ? c : { marca, ventas: null, stock: null, productos: null }), [k]: v }))
    leerResultadoDelMes(marca)
      .then((r) => {
        if (!vivo) return
        setResultado({ marca, r, error: null })
        leerVentasPorProducto(marca, r.mes.desde, r.mes.hasta).then((d) => vivo && setPp({ marca, renglones: d.renglones, error: null }))
          .catch((e) => vivo && setPp({ marca, renglones: null, error: fallo(e) }))
        leerGastos(marca, r.mes.desde, r.mes.hasta, false).then((g) => vivo && setGastos({ marca, g, error: null })).catch((e) => vivo && setGastos({ marca, g: null, error: fallo(e) }))
      })
      .catch((e) => vivo && setResultado({ marca, r: null, error: fallo(e) }))
    const r = rangoDePeriodo('mes', diaArgentino(Date.now()))
    leerListaDeVentas(marca, r.desde, r.hasta).then((d) => poner('ventas', { filas: d.filas })).catch((e) => poner('ventas', fallo(e)))
    leerListaDeStock(marca).then((d) => poner('stock', { filas: d.filas })).catch((e) => poner('stock', fallo(e)))
    leerListaDeProductos(marca).then((d) => poner('productos', { filas: d.filas })).catch((e) => poner('productos', fallo(e)))
    return () => { vivo = false }
  }, [marca])

  const res = resultado?.marca === marca ? resultado : null
  const m = res?.r?.mes, a = res?.r?.anterior
  const gs = gastos?.marca === marca ? gastos : null
  const gTotal = gs?.g ? gs.g.total : null
  const linea = useLineaErp()
  const crudos = conteos.marca === marca ? conteos : { ventas: null, stock: null, productos: null }
  const de: { ventas: Conteo; stock: Conteo; productos: Conteo } = {
    // Como la lista de Ventas: el mismo `filtrar` y después la línea elegida (⛔ Zattia + Stunned sumadas).
    ventas: typeof crudos.ventas === 'object' && crudos.ventas ? vistasDeVentas(filtrarVentas(crudos.ventas.filas as never).filter((f: { linea: string }) => !linea || f.linea === linea)) : crudos.ventas,
    stock: typeof crudos.stock === 'object' && crudos.stock ? vistasDeStock(filtrarStock(crudos.stock.filas as never, { linea })) : crudos.stock,
    productos: typeof crudos.productos === 'object' && crudos.productos ? vistasDeProductos(filtrarProductos(crudos.productos.filas as never, { linea })) : crudos.productos,
  }
  const h2: React.CSSProperties = { margin: 0, fontSize: font.lg, fontWeight: weight.bold }
  // En el celular van de a dos por renglón: el monto se achica para no salirse de la caja (390 px, visto 30-oct).
  const grande: React.CSSProperties = { fontSize: 'clamp(17px, 5vw, 24px)', fontWeight: weight.bold, letterSpacing: '-0.01em', color: color.ink, fontVariantNumeric: 'tabular-nums' }
  const nota: React.CSSProperties = { fontSize: font.sm, color: color.mut }
  const r = res?.r ?? null
  // Lo vendido CADA día del mes hasta hoy (los días sin ventas, 0): la línea de la tarjeta grande.
  // Hasta AYER: el día de hoy llega a medias desde la copia de GN y hundía la punta de la línea.
  const diasDelMes = m && r?.dias ? Array.from({ length: Math.max(1, Number(m.hasta.slice(8, 10)) - 1) }, (_, i) => {
    const dia = `${m.desde.slice(0, 8)}${String(i + 1).padStart(2, '0')}`
    return { dia: i + 1, vendido: r.dias!.find((d) => d.dia === dia)?.vendido ?? 0 }
  }) : []
  // El stock a costo, de las MISMAS filas de Productos que cuentan «Para hacer» (su disponible es el de Stock).
  const stock = typeof crudos.productos === 'object' && crudos.productos ? stockACosto(filtrarProductos(crudos.productos.filas as never, { linea }) as never) : null
  const ppm = pp?.marca === marca ? pp : null
  const top = ppm?.renglones ? masDejan(agruparPorProducto(filtrarPorProducto(ppm.renglones as never, { linea }))) : null
  const avisos = [
    gs?.g && gs.g.cobrosSinComision > 0 ? `${cuantos(gs.g.cobrosSinComision, 'cobro', 'cobros')} con tarjeta o Mercado Pago sin tasa cargada: esas comisiones no están en los gastos.` : null,
    m?.sinCosto ? `${cuantos(m.sinCosto, 'venta', 'ventas')} sin costo en Gestión Nube: suman su precio sin restar nada.` : null,
    stock?.productosSinCosto ? `${cuantos(stock.productosSinCosto, 'producto', 'productos')} con stock sin costo (${cuantos(stock.sinCosto, 'unidad', 'unidades')}): no suman al stock a costo.` : null,
    r?.gnHasta && m && r.gnHasta < m.hasta ? `Gestión Nube llega hasta el ${fecha(r.gnHasta)}: lo de después todavía no está.` : null,
  ].filter((t): t is string => !!t)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[5] }}>
      {/* 🎯 Bruno 30-oct: el título es EL MES («Octubre 2026») y «Ver como» va escondido en un botón arriba a la derecha. */}
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: weight.bold, letterSpacing: '-0.02em', color: color.ink }}>{tituloDelMes(hoy)}</h1>
          <div style={{ fontSize: font.sm, color: color.mut }}>{rol === 'admin' ? `al ${Number(hoy.slice(8, 10))} de ${MESES[Number(hoy.slice(5, 7)) - 1]}` : `Viendo como ${ROLES.find(([k]) => k === rol)?.[1]}`}</div>
        </div>
        {esAdmin(perfil) && <VerComo rol={rol} setRol={setRol} />}
      </header>
      {verResultado(rol) && <section aria-label="Resultado comercial del mes" style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        {res?.error && <Notice tone="danger">{res.error}</Notice>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: space[3] }}>
          <TarjetaVendido mesNombre={MESES[Number(hoy.slice(5, 7)) - 1]} vendido={m ? m.vendido : null} ayer={r?.dias && m && m.hasta > m.desde ? vendidoDelDia(r.dias, diaAnterior(m.hasta)) : null}
            anterior={a ? a.vendido : null} variacion={m && a ? pct(m.vendido, a.vendido) : null} dias={diasDelMes} />
          <div style={tarjeta}>
            <span style={rotulo}>Margen bruto</span>
            <span style={grande}>{m ? formatMoney(m.margen) : '…'}</span>
            {m && <span style={nota}>{m.vendido ? Math.round((m.margen / m.vendido) * 100) : 0}% de lo vendido{a ? <> · <Variacion ahora={m.margen} antes={a.margen} /> contra el mes pasado</> : null}</span>}
          </div>
          <div style={tarjeta}>
            <span style={rotulo}>Resultado comercial</span>
            <span style={grande}>{m && gTotal != null ? formatMoney(m.margen - gTotal) : '…'}</span>
            <span style={nota}>{gs?.error ? gs.error : gTotal == null ? 'margen menos gastos comerciales' : gTotal ? `margen menos gastos comerciales (${formatMoney(gTotal)}, reales del ERP)` : 'margen menos gastos comerciales: todavía no hay gastos reales en el ERP'}</span>
          </div>
          <div style={tarjeta}>
            <span style={rotulo}>Ventas</span>
            <span style={grande}>{m ? m.ventas.toLocaleString('es-AR') : '…'}</span>
            {m && <span style={nota}>ticket promedio {formatMoney(m.ventas ? m.vendido / m.ventas : 0)}{a ? ` · ${m.ventas.toLocaleString('es-AR')} contra ${a.ventas.toLocaleString('es-AR')} del mes pasado` : ''}</span>}
          </div>
          <div style={tarjeta}>
            <span style={rotulo}>Stock a costo</span>
            <span style={grande}>{stock ? formatMoney(stock.costo) : typeof crudos.productos === 'string' ? 'No se pudo' : '…'}</span>
            {stock && <span style={nota}>{stock.unidades.toLocaleString('es-AR')} unidades disponibles{m && m.costo > 0 && linea !== 'stunned' ? ` · ≈ ${(stock.costo / m.costo * (Number(m.hasta.slice(8, 10)) / 30)).toLocaleString('es-AR', { maximumFractionDigits: 1 })} meses de venta al costo` : ''}</span>}
          </div>
        </div>
        {avisos.length > 0 && (
          <div role="note" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 14px', borderRadius: 12, background: 'var(--mo-warning-bg)', border: '1px solid var(--mo-warning-border)', color: 'var(--mo-warning-ink)', fontSize: font.sm }}>
            {avisos.map((t) => <span key={t}>⚠️ {t}</span>)}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: space[3] }}>
          {r?.meses && <MesAMes meses={doceMeses(r.meses, m!.hasta)} />}
          {r?.dias && m && a && <ComoViene filas={comoVieneElMes(r.dias, m, a)} ahora={tituloDelMes(m.desde).split(' ')[0]} antes={tituloDelMes(a.desde).split(' ')[0]} />}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: space[3] }}>
          {r?.canales && <PorCanal canales={porCanal(r.canales)} />}
          <MasDejan productos={top ?? []} estado={top ? null : pp?.error ?? '…'} href={href('ventas', 'por-producto')} />
        </div>
        <div style={{ fontSize: font.sm, color: color.mut }}>
          {m && a ? `Del ${fecha(m.desde)} al ${fecha(m.hasta)}, contra el ${fecha(a.desde)} al ${fecha(a.hasta)}` : 'Este mes'} · lo vendido, el margen y los canales son de Gestión Nube (el que vende hoy), con su costo{linea === 'stunned' ? ' — la base de Zattia: Stunned vende por el ERP desde el 28-oct' : ''}. Lo que más deja usa el costo vigente del ERP, como Ventas › Por producto. El stock a costo es el disponible de Stock por el costo de cada producto.
        </div>
      </section>}

      <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <div>
          <h2 style={h2}>Para hacer</h2>
          <div style={{ fontSize: font.sm, color: color.mut }}>{rol === 'admin' ? 'por rol, con el número de cada lista · hoy el ERP lo ven sólo los administradores' : `${ROLES.find(([k]) => k === rol)?.[1]}: ${subtituloDe(rol)}`}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: space[3] }}>
          {paraHacerDe(rol).map(([tarjeta, items]) => (
            <div key={tarjeta} style={{ display: 'flex', flexDirection: 'column', padding: '12px 16px', borderRadius: 14, background: color.surface, border: `1px solid ${color.line}` }}>
              <div style={{ fontWeight: weight.semibold, color: color.ink, paddingBottom: 6 }}>{tarjeta}</div>
              {items.map(([lista, vista, que, seccion, pestania]) => {
                const c = de[lista as 'ventas' | 'stock' | 'productos']
                const nro = typeof c === 'object' && c ? c[vista] ?? 0 : null
                return (
                  <Link key={vista} href={href(seccion, pestania)} title={typeof c === 'string' ? c : `${TITULO[pestania]} › vista «${VISTA[vista]}»`}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: space[2], padding: '7px 0', borderTop: `1px solid ${color.bg2}`, color: color.ink, textDecoration: 'none' }}>
                    <span style={{ minWidth: 0 }}>{que}<span style={{ display: 'block', fontSize: font.sm, color: color.mut }}>{TITULO[pestania]} › {VISTA[vista]}</span></span>
                    <span style={{ fontSize: 20, fontWeight: weight.bold, fontVariantNumeric: 'tabular-nums', color: nro ? color.ink : color.mut2 }}>
                      {typeof c === 'string' ? <span style={{ fontSize: font.sm, color: 'var(--mo-danger-ink)' }}>no se pudo</span> : nro == null ? '…' : nro.toLocaleString('es-AR')}
                    </span>
                  </Link>
                )
              })}
            </div>
          ))}
        </div>
        <div style={{ fontSize: font.sm, color: color.mut }}>Ventas cuenta las de este mes del ERP (en paralelo con Gestión Nube). Lo que se hace afuera —conteos, transferencias, preparación— sigue en el monitor.</div>
      </section>
    </div>
  )
}
