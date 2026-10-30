'use client'

/**
 * ERP › Ventas › Por producto, con el molde (`~/Documents/erp-monitor/diseno.md` §3 y §7; tablero 1b del v8): qué se vendió
 * de cada producto. **Agrupado por producto** por defecto (unidades, ventas, vendido, precio promedio y, para quien ve
 * costos, el margen) y **Cada renglón** (como GN). Período, línea, origen, buscador, columnas por usuario y Exportar.
 * El clic abre la FICHA DEL PRODUCTO (`FichaProducto`) al costado. Núcleo: `lib/erp/ventas-producto.core.js`;
 * servidor: `api/_erp-por-producto.js` (el espejo de GN: GN es el que vende hoy).
 */

import { usePantallaAngosta } from '@/lib/movil'
import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, Notice, color, font, space, Select } from '@/components/ui'
import { ListaTrabajo, type MovilColumna, type OrdenLista } from '@/components/ui/ListaTrabajo'
import { PanelColumnas } from '@/components/ui/PanelColumnas'
import { BuscadorLista, TileResumen, VistasLista, estiloNombre } from '@/components/ui/PiezasLista'
import { leerVentasPorProducto, type MarcaErp, type RenglonProducto } from '@/lib/erp/cliente'
import {
  VISTAS, agrupar, alternarColumna, columnasDe, diaCorto, filtrar, moverColumna, normalizarPrefs, ordenar, resumen,
} from '@/lib/erp/ventas-producto.core.js'
import { PERIODOS, plata, rangoDePeriodo } from '@/lib/erp/ventas-lista.core.js'
import { guardarPrefsDeLista, leerPrefsDeLista } from '@/lib/erp/lista-prefs'
import { diaArgentino } from '@/lib/envios/portal.core.js'
import { FichaProducto } from '../productos/FichaProducto'
import { useLineaErp } from '@/lib/erp/linea-erp'
const ANCHO_SELECT: React.CSSProperties = { cursor: 'pointer', width: 'auto', flex: '0 0 auto' }

type Vista = 'agrupado' | 'renglones'
type Prefs = { orden: string[]; visibles: string[] }
/** 📱 Qué es cada columna en la tarjeta del celular; la que no está, `oculta`. */
const MOVIL: Record<string, MovilColumna> = { p: 'titulo', v: 'dato', tot: 'dato', u: 'chico', ult: 'chico', f: 'chico', t: 'chico', c: 'chico' }
type Grupo = ReturnType<typeof agrupar>[number]

const LINEA: Record<string, string> = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }
const DE_A = 300
const u = (n: number) => `${n.toLocaleString('es-AR')} u`

function bajarCsv(vista: Vista, filas: Array<Grupo | RenglonProducto>, marca: MarcaErp, costos: boolean) {
  const c = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`
  const cab = vista === 'agrupado'
    ? ['Producto', 'Unidades', 'Ventas', 'Vendido', 'Precio promedio', ...(costos ? ['Margen'] : []), 'Variantes', 'Canales', 'Última venta', 'Línea']
    : ['Fecha', 'Venta (Gestión Nube)', 'Producto', 'Variante', 'código', 'Cant.', 'Precio', 'Quedó en', ...(costos ? ['Margen'] : []), 'Origen', 'Cliente', 'Línea']
  const filasCsv = filas.map((f) => (vista === 'agrupado'
    ? (({ nombre, unidades, ventas, vendido, promedio, margen, talles, canales, ultimo, linea }: Grupo) => [nombre, unidades, ventas, vendido, promedio ?? '', ...(costos ? [margen ?? 'sin costo'] : []), talles, canales, ultimo.slice(0, 10), LINEA[linea] ?? linea])(f as Grupo)
    : (({ cuando, numero, nombre, talle, sku, cantidad, precio, total, costo, canal, cliente, linea }: RenglonProducto) => [cuando.slice(0, 10), numero ?? '', nombre, talle, sku ?? '', cantidad, precio, total, ...(costos ? [costo == null ? 'sin costo' : total - costo] : []), canal, cliente ?? '', LINEA[linea] ?? linea])(f as RenglonProducto)))
  const texto = [cab, ...filasCsv].map((r) => r.map(c).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `ventas-por-producto-${marca}-${diaArgentino(Date.now())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function PorProductoErp() {
  const { marca: delShell, perfil } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const usuario = perfil?.name ?? null
  const [datos, setDatos] = useState<{ renglones: RenglonProducto[]; costos: boolean; gnHasta: string | null; clave: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState('mes')
  const [vista, setVista] = useState<Vista>('agrupado')
  const [q, setQ] = useState('')
  const linea = useLineaErp()
  const [canal, setCanal] = useState('')
  const [orden, setOrden] = useState<OrdenLista>(null)
  const [tanda, setTanda] = useState({ de: '', n: DE_A })
  const [ficha, setFicha] = useState<string | null>(null)
  const costos = !!datos?.costos
  // Las columnas de cada vista se guardan aparte (las del agrupado ⛔ son las del renglón).
  const lista = `erp-por-producto-${vista}-${marca}`
  const [todasPrefs, setTodasPrefs] = useState<Record<string, Prefs>>({})
  const prefs: Prefs = todasPrefs[`${lista}|${costos}`] ?? normalizarPrefs(vista, costos, typeof window === 'undefined' ? null : leerPrefsDeLista(lista, usuario))
  const setPrefs = (p: Prefs) => { setTodasPrefs((x) => ({ ...x, [`${lista}|${costos}`]: p })); guardarPrefsDeLista(lista, usuario, p) }
  const COLUMNAS = columnasDe(vista, costos)

  const [vuelta, setVuelta] = useState(0)
  const clave = `${marca}|${periodo}|${vuelta}`
  useEffect(() => {
    let vivo = true
    const r = rangoDePeriodo(periodo, diaArgentino(Date.now()))
    leerVentasPorProducto(marca, r.desde, r.hasta)
      .then((d) => { if (vivo) { setDatos({ ...d, clave }); setError(null) } })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : 'No se pudieron leer las ventas por producto.'); setDatos((x) => (x ? { ...x, clave } : x)) } })
    return () => { vivo = false }
  }, [marca, periodo, clave])
  const cargando = datos?.clave !== clave

  const buscados = useMemo(() => filtrar(datos?.renglones ?? [], { q, linea, canal }), [datos, q, linea, canal])
  const grupos = useMemo(() => agrupar(buscados), [buscados])
  const conteo = { agrupado: grupos.length, renglones: buscados.length }
  const filas = useMemo(() => ordenar(vista === 'agrupado' ? grupos : buscados, orden, vista), [vista, grupos, buscados, orden]) as Array<Grupo | RenglonProducto>
  const res = useMemo(() => resumen(buscados), [buscados])
  const canales = useMemo(() => [...new Set((datos?.renglones ?? []).map((r) => r.canal))].sort(), [datos])
  const mirada = `${vista}|${periodo}|${q}|${linea}|${canal}|${orden?.col ?? ''}|${orden?.dir ?? ''}`
  const mostrar = tanda.de === mirada ? tanda.n : DE_A

  // 📱 En el celular la tarjeta arma lo suyo con TODAS las columnas: las de `prefs` son de la compu.
  const angosta = usePantallaAngosta()
  const columnas = (angosta ? prefs.orden : prefs.visibles).filter((k) => COLUMNAS[k]).map((k) => {
    const [titulo, ancho, ordena] = COLUMNAS[k]
    return { key: k, titulo, ancho, ordena, derecha: ['u', 'n', 'v', 'prom', 'm', 'c', 'pr', 'tot'].includes(k), movil: MOVIL[k] ?? 'oculta' }
  })
  const num = (x: string, fuerte = false) => <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: fuerte ? 700 : 500, color: color.ink }}>{x}</span>
  const sinCosto = <span style={{ color: color.mut2 }} title="El producto no tiene costo cargado en el ERP">sin costo</span>

  const celda = (f: Grupo | RenglonProducto, k: string): React.ReactNode => {
    if (k === 'p') return <span title={f.nombre} style={estiloNombre}>{f.nombre}</span>
    if (k === 'linea') return <span style={{ color: color.ink2 }}>{LINEA[f.linea] ?? f.linea}</span>
    if (vista === 'agrupado') {
      const g = f as Grupo
      if (k === 'u') return num(g.unidades.toLocaleString('es-AR'), true)
      if (k === 'n') return num(g.ventas.toLocaleString('es-AR'))
      if (k === 'v') return num(plata(g.vendido), true)
      if (k === 'prom') return g.promedio == null ? <span style={{ color: color.mut2 }}>—</span> : num(plata(g.promedio))
      if (k === 'm') return g.margen == null ? sinCosto : num(plata(g.margen))
      if (k === 'talles') return <span title={g.talles} style={{ color: color.ink2 }}>{g.talles || '—'}</span>
      if (k === 'canales') return <span title={g.canales} style={{ color: color.mut }}>{g.canales}</span>
      if (k === 'ult') return <span style={{ color: color.mut }}>{diaCorto(g.ultimo)}</span>
      return null
    }
    const r = f as RenglonProducto
    if (k === 'f') return <span style={{ color: color.mut }}>{diaCorto(r.cuando)}</span>
    if (k === 'venta') return <span style={{ color: color.ink2 }} title="El número de la venta en Gestión Nube">{r.numero ? `#${r.numero}` : '—'}</span>
    if (k === 't') return <span style={{ color: color.ink2 }}>{r.talle}</span>
    if (k === 'c') return <span style={{ fontVariantNumeric: 'tabular-nums', color: r.cantidad < 0 ? 'var(--mo-danger-ink)' : color.ink }} title={r.cantidad < 0 ? 'Devuelta en Gestión Nube' : undefined}>{r.cantidad}</span>
    if (k === 'pr') return <span style={{ fontVariantNumeric: 'tabular-nums', color: color.mut }}>{plata(r.precio)}</span>
    if (k === 'tot') return num(plata(r.total), true)
    if (k === 'm') return r.costo == null ? sinCosto : num(plata(r.total - r.costo))
    if (k === 'canal') return <span style={{ color: color.mut }}>{r.canal}</span>
    if (k === 'cli') return <span title={r.cliente ?? undefined} style={{ color: color.ink2 }}>{r.cliente ?? '—'}</span>
    if (k === 'sku') return <span style={{ color: color.mut }}>{r.sku ?? '—'}</span>
    return null
  }

  const nombrePeriodo = PERIODOS.find(([k]) => k === periodo)?.[1] ?? ''
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <p style={{ margin: 0, color: color.mut }}>Qué se vendió de cada producto. Hacé clic en uno para ver su ficha.</p>
      <Notice tone="warning">Sale de <b>Gestión Nube</b>, que es el que vende hoy: todas las ventas, de todos los canales. El margen usa el costo de hoy del ERP.</Notice>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
        <TileResumen titulo="Vendido" valor={plata(res.vendido)} oscuro nota={nombrePeriodo.toLowerCase()} />
        <TileResumen titulo="Unidades" valor={u(res.unidades)} nota={`en ${res.ventas.toLocaleString('es-AR')} ventas`} />
        <TileResumen titulo="Productos" valor={res.productos.toLocaleString('es-AR')} nota={res.productos ? `${(res.unidades / res.productos).toLocaleString('es-AR', { maximumFractionDigits: 1 })} u por producto` : 'ninguno'} />
        {costos && <TileResumen titulo="Margen" valor={plata(res.margen)} nota={res.sinCosto ? `${res.sinCosto} productos sin costo no entran` : res.vendidoConCosto ? `${Math.round((res.margen / res.vendidoConCosto) * 100)} % de lo vendido` : '—'} />}
      </div>

      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <VistasLista vistas={VISTAS} valor={vista} conteo={conteo} onCambio={(k) => { setVista(k as Vista); setOrden(null) }} />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar en las ventas por producto" placeholder="Producto, código, venta o cliente" />
          <Select aria-label="Período" style={ANCHO_SELECT} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>{PERIODOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select>
          <Select aria-label="Origen" style={ANCHO_SELECT} value={canal} onChange={(e) => setCanal(e.target.value)}><option value="">Todos los orígenes</option>{canales.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
          <PanelColumnas
            columnas={prefs.orden.filter((k) => COLUMNAS[k]).map((k) => ({ key: k, titulo: COLUMNAS[k][0], visible: prefs.visibles.includes(k), fija: COLUMNAS[k][3] }))}
            onAlternar={(k) => setPrefs(alternarColumna(vista, costos, prefs, k))}
            onMover={(k, d) => setPrefs(moverColumna(prefs, k, d))}
            onRestablecer={() => setPrefs({ ...normalizarPrefs(vista, costos, null) })}
          />
          <Button variant="outline" disabled={!filas.length} onClick={() => bajarCsv(vista, filas, marca, costos)}>Exportar</Button>
          <Button variant="outline" disabled={cargando} onClick={() => setVuelta((n) => n + 1)}>{cargando ? 'Leyendo…' : 'Actualizar'}</Button>
        </div>
        <ListaTrabajo
          columnas={columnas} filas={filas.slice(0, mostrar)} claveDe={(f) => f.id} celda={celda} orden={orden} onOrden={setOrden}
          activa={null} onAbrir={(f) => setFicha(f.producto)} etiquetaFila={(f) => `el producto ${f.nombre}`}
          vacio={!cargando && datos ? <div style={{ padding: space[6] }}><EmptyState title={q || linea || canal ? 'No hay ventas con eso.' : 'No hay ventas en este período.'} /></div> : null}
        />
        {filas.length > mostrar && (
          <div style={{ padding: 12, textAlign: 'center', borderTop: `1px solid ${color.bg2}` }}>
            <Button variant="outline" onClick={() => setTanda({ de: mirada, n: mostrar + DE_A })}>Mostrar {Math.min(DE_A, filas.length - mostrar).toLocaleString('es-AR')} más</Button>
          </div>
        )}
        <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
          {cargando && !datos ? 'Leyendo las ventas…' : `${Math.min(mostrar, filas.length).toLocaleString('es-AR')} de ${filas.length.toLocaleString('es-AR')} ${vista === 'agrupado' ? 'productos' : 'renglones · uno por producto de cada venta (como Gestión Nube)'}`}
          {datos?.gnHasta && <> · Gestión Nube llega hasta el {diaCorto(datos.gnHasta)}</>}
        </div>
      </div>

      {ficha && <FichaProducto key={`${marca}/${ficha}`} marca={marca} producto={ficha} fila={null} cargarAbierto={false} onCerrar={() => setFicha(null)} onCargado={() => {}} />}
    </div>
  )
}
