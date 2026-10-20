'use client'

/**
 * ERP › Inicio (diseño §7; tablero 1 del v8): el RESULTADO COMERCIAL del mes en grande (sólo Admin: hoy el ERP entero es
 * sólo admin) y «Para hacer» por rol con el número de cada vista ya hecha; cada uno lleva a su pestaña.
 * 🔑 Los números son los MISMOS núcleos de las listas (`contarVistas` de Ventas, Stock y Productos): ⛔ otra cuenta.
 * 🔑 El resultado sale del espejo de GN (`api/_erp-inicio.js`): GN es el que vende hoy.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Notice, color, font, space, weight } from '@/components/ui'
import { formatMoney } from '@/components/ui/MoneyText'
import { TileResumen } from '@/components/ui/PiezasLista'
import {
  leerListaDeProductos, leerListaDeStock, leerListaDeVentas, leerResultadoDelMes, type MarcaErp, type ResultadoDelMes,
} from '@/lib/erp/cliente'
import { contarVistas as vistasDeVentas, rangoDePeriodo } from '@/lib/erp/ventas-lista.core.js'
import { contarVistas as vistasDeStock } from '@/lib/erp/stock-lista.core.js'
import { contarVistas as vistasDeProductos } from '@/lib/erp/productos-lista.core.js'
import { diaArgentino } from '@/lib/envios/portal.core.js'

/** Lo que se cuenta de cada lista: `null` = leyendo; un texto = no se pudo (y por qué). */
type Conteo = Record<string, number> | string | null

/** «Para hacer», por rol: [rol, [[de qué lista, vista, qué es, sección, pestaña]]]. */
const PARA_HACER: Array<[string, Array<[string, string, string, string, string]>]> = [
  ['Local', [
    ['ventas', 'preparar', 'Ventas a preparar', 'ventas', 'ventas'],
    ['ventas', 'listas', 'Listas para retirar o enviar', 'ventas', 'ventas'],
    ['stock', 'neg', 'Prendas en negativo', 'stock', 'stock'],
  ]],
  ['Administración', [
    ['ventas', 'sinpagar', 'Pedidos sin pagar', 'ventas', 'ventas'],
    ['ventas', 'saldo', 'Ventas con saldo', 'ventas', 'ventas'],
    ['ventas', 'sinfactura', 'Ventas del ERP sin factura', 'ventas', 'facturacion'],
  ]],
  ['Productos', [
    ['productos', 'sincosto', 'Productos sin costo', 'productos', 'productos'],
    ['productos', 'sinmay', 'Sin precio mayorista', 'productos', 'productos'],
    ['productos', 'sinprov', 'Sin proveedor', 'productos', 'productos'],
  ]],
]
const VISTA: Record<string, string> = { preparar: 'A preparar', listas: 'Listas', neg: 'Negativos', sinpagar: 'Sin pagar', saldo: 'Con saldo', sinfactura: 'Sin factura', sincosto: 'Sin costo', sinmay: 'Sin precio mayorista', sinprov: 'Sin proveedor' }
const TITULO: Record<string, string> = { ventas: 'Ventas', stock: 'Stock', productos: 'Productos', facturacion: 'Facturación' }

const fecha = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const pct = (a: number, b: number) => (b ? Math.round((a / b - 1) * 100) : null)

function Variacion({ ahora, antes }: { ahora: number; antes: number }) {
  const p = pct(ahora, antes)
  if (p == null) return null
  return <span style={{ color: p >= 0 ? 'var(--mo-success-ink)' : 'var(--mo-danger-ink)' }}>{p >= 0 ? '+' : ''}{p}%</span>
}

export function InicioErp({ href }: { href: (seccion: string, pestania?: string) => string }) {
  const { marca: delShell } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const [resultado, setResultado] = useState<{ marca: string; r: ResultadoDelMes | null; error: string | null } | null>(null)
  const [conteos, setConteos] = useState<{ marca: string; ventas: Conteo; stock: Conteo; productos: Conteo }>({ marca: '', ventas: null, stock: null, productos: null })

  useEffect(() => {
    let vivo = true
    const fallo = (e: unknown) => (e instanceof Error ? e.message : 'No se pudo leer.')
    const poner = (k: 'ventas' | 'stock' | 'productos', v: Conteo) => vivo && setConteos((c) => ({ ...(c.marca === marca ? c : { marca, ventas: null, stock: null, productos: null }), [k]: v }))
    leerResultadoDelMes(marca).then((r) => vivo && setResultado({ marca, r, error: null })).catch((e) => vivo && setResultado({ marca, r: null, error: fallo(e) }))
    const r = rangoDePeriodo('mes', diaArgentino(Date.now()))
    leerListaDeVentas(marca, r.desde, r.hasta).then((d) => poner('ventas', vistasDeVentas(d.filas))).catch((e) => poner('ventas', fallo(e)))
    leerListaDeStock(marca).then((d) => poner('stock', vistasDeStock(d.filas))).catch((e) => poner('stock', fallo(e)))
    leerListaDeProductos(marca).then((d) => poner('productos', vistasDeProductos(d.filas))).catch((e) => poner('productos', fallo(e)))
    return () => { vivo = false }
  }, [marca])

  const res = resultado?.marca === marca ? resultado : null
  const m = res?.r?.mes, a = res?.r?.anterior
  const de = conteos.marca === marca ? conteos : { ventas: null, stock: null, productos: null }
  const h2: React.CSSProperties = { margin: 0, fontSize: font.lg, fontWeight: weight.bold }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[5] }}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <div>
          <h2 style={h2}>Resultado comercial del mes</h2>
          <div style={{ fontSize: font.sm, color: color.mut }}>
            {m && a ? `del ${fecha(m.desde)} al ${fecha(m.hasta)}, contra el ${fecha(a.desde)} al ${fecha(a.hasta)} · de Gestión Nube (el que vende hoy), con su costo` : 'de Gestión Nube (el que vende hoy), con su costo'}
          </div>
        </div>
        {res?.error && <Notice tone="danger">{res.error}</Notice>}
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          <TileResumen titulo="Vendido" valor={m ? formatMoney(m.vendido) : '…'} oscuro nota={m && a ? `el mes pasado a esta altura ${formatMoney(a.vendido)}` : undefined} />
          <TileResumen titulo="Margen bruto" valor={m ? formatMoney(m.margen) : '…'} nota={m ? `${m.vendido ? Math.round((m.margen / m.vendido) * 100) : 0}% de lo vendido · costo ${formatMoney(m.costo)}` : undefined} />
          <TileResumen titulo="Ventas" valor={m ? m.ventas.toLocaleString('es-AR') : '…'} nota={m ? `ticket promedio ${formatMoney(m.ventas ? m.vendido / m.ventas : 0)}` : undefined} />
          <TileResumen titulo="Contra el mes pasado" valor={m && a ? `${(pct(m.vendido, a.vendido) ?? 0) >= 0 ? '+' : ''}${pct(m.vendido, a.vendido) ?? '—'}%` : '…'} nota={m && a ? `en ventas: ${m.ventas} contra ${a.ventas}` : undefined} />
        </div>
        {m && a && <div style={{ fontSize: font.sm, color: color.mut }}>Margen contra el mes pasado: <Variacion ahora={m.margen} antes={a.margen} />{m.sinCosto ? ` · ${m.sinCosto} ventas sin costo en GN (suman su precio sin restar nada)` : ''}{res?.r?.gnHasta ? ` · GN llega hasta el ${fecha(res.r.gnHasta)}` : ''}</div>}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <div>
          <h2 style={h2}>Para hacer</h2>
          <div style={{ fontSize: font.sm, color: color.mut }}>por rol, con el número de cada lista · hoy el ERP lo ven sólo los administradores</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: space[3] }}>
          {PARA_HACER.map(([rol, items]) => (
            <div key={rol} style={{ display: 'flex', flexDirection: 'column', padding: '12px 16px', borderRadius: 14, background: color.surface, border: `1px solid ${color.line}` }}>
              <div style={{ fontWeight: weight.semibold, color: color.ink, paddingBottom: 6 }}>{rol}</div>
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
        <div style={{ fontSize: font.sm, color: color.mut }}>Ventas cuenta las de este mes del ERP (en paralelo con GN). Lo que se hace afuera —conteos, transferencias, preparación— sigue en el monitor.</div>
      </section>
    </div>
  )
}
