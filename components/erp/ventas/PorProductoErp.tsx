'use client'

/**
 * ERP › Ventas › Por producto, con el molde (`~/Documents/erp-monitor/diseno.md` §3 y §7; tablero 1b del v8): qué se vendió
 * de cada producto. **Agrupado por producto** por defecto (unidades, ventas, vendido, precio promedio y, para quien ve
 * costos, el margen) y **Cada renglón** (como GN). Período, línea, origen, buscador, columnas por usuario y Exportar.
 * El clic abre la FICHA DEL PRODUCTO (`FichaProducto`) al costado. Núcleo: `lib/erp/ventas-producto.core.js`;
 * servidor: `api/_erp-por-producto.js` (las ventas del ERP, las mismas de «Por venta»; el envío, aparte).
 */

import { usePantallaAngosta } from '@/lib/movil'
import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, Notice, color, font, space, Select } from '@/components/ui'
import { ListaTrabajo, type MovilColumna, type OrdenLista } from '@/components/ui/ListaTrabajo'
import { PanelColumnas } from '@/components/ui/PanelColumnas'
import { BotonActualizar, BuscadorLista, VistasLista, estiloNombre } from '@/components/ui/PiezasLista'
import { leerVentasPorProducto, type MarcaErp, type RenglonProducto } from '@/lib/erp/cliente'
import {
  VISTAS, agrupar, alternarColumna, columnasDe, diaCorto, filtrar, margenPct, moverColumna, normalizarPrefs, ordenar, resumen,
} from '@/lib/erp/ventas-producto.core.js'
import { PERIODOS, plata, rangoDePeriodo, vendidoPorDia } from '@/lib/erp/ventas-lista.core.js'
import { useRolVisto } from '@/lib/erp/ver-como'
import { ResumenVentas } from './ResumenVentas'
import { VentasDelProducto } from './VentasDelProducto'
import { guardarPrefsDeLista, leerPrefsDeLista } from '@/lib/erp/lista-prefs'
import { diaArgentino } from '@/lib/envios/portal.core.js'
import { FichaProducto } from '../productos/FichaProducto'
import { useLineaErp } from '@/lib/erp/linea-erp'
import { conMesesAnteriores } from '@/lib/erp/meses.core.js'
const ANCHO_SELECT: React.CSSProperties = { cursor: 'pointer', width: 'auto', flex: '0 0 auto' }

type Vista = 'agrupado' | 'renglones'
type Prefs = { orden: string[]; visibles: string[] }
/** 📱 Qué es cada columna en la tarjeta del celular; la que no está, `oculta`. */
const MOVIL: Record<string, MovilColumna> = { p: 'titulo', v: 'dato', tot: 'dato', u: 'chico', ult: 'chico', f: 'chico', t: 'chico', c: 'chico' }
type Grupo = ReturnType<typeof agrupar>[number]

const LINEA: Record<string, string> = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }
const DE_A = 300

function bajarCsv(vista: Vista, filas: Array<Grupo | RenglonProducto>, marca: MarcaErp, costos: boolean) {
  const c = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`
  const cab = vista === 'agrupado'
    ? ['Producto', 'Unidades', 'Ventas', 'Vendido', 'Precio promedio', ...(costos ? ['Margen'] : []), 'Variantes', 'Canales', 'Última venta', 'Línea']
    : ['Fecha', 'Venta', 'Producto', 'Variante', 'SKU', 'Cant.', 'Precio', 'Quedó en', ...(costos ? ['Margen'] : []), 'Origen', 'Cliente', 'Línea']
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
  const [datos, setDatos] = useState<{ renglones: RenglonProducto[]; costos: boolean; clave: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState('mes')
  // 🎯 Bruno 10-nov: «no veo como ir para atras en los meses» ⇒ los meses de antes, en el mismo selector (`meses.core.js`).
  const [periodos] = useState(() => conMesesAnteriores(PERIODOS, diaArgentino(Date.now())))
  const [vista, setVista] = useState<Vista>('agrupado')
  const [q, setQ] = useState('')
  const linea = useLineaErp()
  const [canal, setCanal] = useState('')
  const [orden, setOrden] = useState<OrdenLista>(null)
  const [tanda, setTanda] = useState({ de: '', n: DE_A })
  const [ficha, setFicha] = useState<string | null>(null)
  // Darío 19-nov: el clic abre las VENTAS del producto en una ventana; la ficha del catálogo queda a un botón.
  const [ventana, setVentana] = useState<Grupo | null>(null)
  const rolVisto = useRolVisto()
  const esAdmin = !!perfil?.admin && !rolVisto
  const [hoy] = useState(() => diaArgentino(Date.now()))
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
  const rango = useMemo(() => {
    const r = rangoDePeriodo(periodo, hoy)
    // «Este mes» se dibuja entero: los días que faltan quedan como una raya.
    return periodo === 'mes' ? { desde: r.desde, hasta: new Date(Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7), 0)).toISOString().slice(0, 10) } : r
  }, [periodo, hoy])
  const aDia = (rs: RenglonProducto[]) => rs.map((r) => ({ kind: 'venta', anulada: false, total: r.total, pedidoEn: r.cuando }))
  const dias = useMemo(() => vendidoPorDia(aDia(buscados), rango.desde, rango.hasta, (iso: string) => diaArgentino(Date.parse(iso))), [buscados, rango])
  // El puesto (1, 2, 3…) y la barrita de lo vendido tienen sentido sólo con la lista ordenada por lo vendido.
  const porVendido = vista === 'agrupado' && (!orden || (orden.col === 'v' && orden.dir !== 'asc'))
  const maxVendido = useMemo(() => Math.max(1, ...grupos.map((g) => g.vendido)), [grupos])
  // Los canales de la línea que se mira (⛔ los de la otra tienda: elegirlo daba la lista vacía).
  const canales = useMemo(() => [...new Set((datos?.renglones ?? []).filter((r) => !linea || r.linea === linea).map((r) => r.canal))].sort(), [datos, linea])
  const mirada = `${vista}|${periodo}|${q}|${linea}|${canal}|${orden?.col ?? ''}|${orden?.dir ?? ''}`
  const mostrar = tanda.de === mirada ? tanda.n : DE_A

  // 📱 En el celular la tarjeta arma lo suyo con TODAS las columnas: las de `prefs` son de la compu.
  const angosta = usePantallaAngosta()
  const columnas = (angosta ? prefs.orden : prefs.visibles).filter((k) => COLUMNAS[k]).map((k) => {
    const [titulo, ancho, ordena] = COLUMNAS[k]
    return { key: k, titulo, ancho, ordena, derecha: ['u', 'n', 'v', 'prom', 'm', 'c', 'pr', 'tot'].includes(k), movil: MOVIL[k] ?? 'oculta' }
  })
  const num = (x: string, fuerte = false) => <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: fuerte ? 700 : 500, color: color.ink }}>{x}</span>
  const sinCosto = <span style={{ color: color.mut2 }} title="Sin costo">sin costo</span>

  const celda = (f: Grupo | RenglonProducto, k: string): React.ReactNode => {
    if (k === 'p') {
      const puesto = porVendido ? filas.indexOf(f) + 1 : 0
      return (
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          {puesto > 0 && <span style={{ flex: '0 0 22px', textAlign: 'right', fontSize: font.xs, fontWeight: 600, color: puesto <= 3 ? 'var(--mo-brand)' : color.mut2, fontVariantNumeric: 'tabular-nums' }}>{puesto}</span>}
          <span title={f.nombre} style={estiloNombre}>{f.nombre}</span>
        </span>
      )
    }
    if (k === 'linea') return <span style={{ color: color.ink2 }}>{LINEA[f.linea] ?? f.linea}</span>
    if (vista === 'agrupado') {
      const g = f as Grupo
      if (k === 'u') return num(g.unidades.toLocaleString('es-AR'), true)
      if (k === 'n') return num(g.ventas.toLocaleString('es-AR'))
      if (k === 'v') {
        if (!porVendido) return num(plata(g.vendido), true)
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
            <span aria-hidden style={{ flex: '0 0 52px', height: 6, borderRadius: 3, background: color.bg2, overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${Math.max(4, (g.vendido / maxVendido) * 100)}%`, borderRadius: 3, background: 'var(--mo-brand-solid)', opacity: 0.6 }} />
            </span>
            {num(plata(g.vendido), true)}
          </span>
        )
      }
      if (k === 'prom') return g.promedio == null ? <span style={{ color: color.mut2 }}>—</span> : num(plata(g.promedio))
      if (k === 'm') {
        if (g.margen == null) return sinCosto
        const pct = margenPct(g.margen, g.vendido)
        return <span>{num(plata(g.margen))}{pct != null && <span style={{ marginLeft: 6, fontSize: font.xs, color: color.mut, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>}</span>
      }
      if (k === 'canales') return <span title={g.canales} style={{ color: color.mut }}>{g.canales}</span>
      if (k === 'ult') return <span style={{ color: color.mut }}>{diaCorto(g.ultimo)}</span>
      return null
    }
    const r = f as RenglonProducto
    if (k === 'f') return <span style={{ color: color.mut }}>{diaCorto(r.cuando)}</span>
    if (k === 'venta') return <span style={{ color: color.ink2 }}>{r.numero ? `#${r.numero}` : '—'}</span>
    if (k === 't') return <span style={{ color: color.ink2 }}>{r.talle}</span>
    if (k === 'c') return <span style={{ fontVariantNumeric: 'tabular-nums', color: r.cantidad < 0 ? 'var(--mo-danger-ink)' : color.ink }} title={r.cantidad < 0 ? 'Devuelta' : undefined}>{r.cantidad}</span>
    if (k === 'pr') return <span style={{ fontVariantNumeric: 'tabular-nums', color: color.mut }}>{plata(r.precio)}</span>
    if (k === 'tot') return num(plata(r.total), true)
    if (k === 'm') return r.costo == null ? sinCosto : num(plata(r.total - r.costo))
    if (k === 'canal') return <span style={{ color: color.mut }}>{r.canal}</span>
    if (k === 'cli') return <span title={r.cliente ?? undefined} style={{ color: color.ink2 }}>{r.cliente ?? '—'}</span>
    if (k === 'sku') return <span style={{ color: color.mut }}>{r.sku ?? '—'}</span>
    return null
  }

  const nombrePeriodo = periodos.find(([k]) => k === periodo)?.[1] ?? ''
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {/* Sin subtítulo ni cartel (Darío 19-nov): de dónde sale el margen, chico al pie. */}
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}

      {esAdmin && (
        <ResumenVentas
          titulo={`Vendido · ${nombrePeriodo.toLowerCase()}`} vendido={res.vendido} comparacion={null} dias={dias} hoy={hoy}
          datos={[
            { valor: res.unidades.toLocaleString('es-AR'), despues: res.unidades === 1 ? 'unidad' : 'unidades' },
            { valor: res.ventas.toLocaleString('es-AR'), despues: res.ventas === 1 ? 'venta' : 'ventas' },
            { valor: res.productos.toLocaleString('es-AR'), despues: res.productos === 1 ? 'producto' : 'productos' },
            // 27-nov: el envío ⛔ es de un producto ⇒ va aparte; lo vendido + esto = el total de «Por venta».
            ...(res.envios > 0 ? [{ valor: plata(res.envios), despues: 'de envíos, aparte' }] : []),
          ]}
          lateral={costos ? {
            titulo: 'Margen', valor: res.margen, tono: 'neutro',
            nota: [res.vendidoConCosto ? `${margenPct(res.margen, res.vendidoConCosto)}% de lo vendido` : null, res.sinCosto ? `sin contar ${res.sinCosto} sin costo` : null].filter(Boolean).join(' · ') || undefined,
          } : null}
        />
      )}

      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <VistasLista vistas={VISTAS} valor={vista} conteo={conteo} onCambio={(k) => { setVista(k as Vista); setOrden(null) }} />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar en las ventas por producto" placeholder="Producto, SKU, venta o cliente" />
          <Select aria-label="Período" style={ANCHO_SELECT} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>{periodos.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select>
          <Select aria-label="Origen" style={ANCHO_SELECT} value={canal} onChange={(e) => setCanal(e.target.value)}><option value="">Todos los orígenes</option>{canales.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
          <PanelColumnas
            columnas={prefs.orden.filter((k) => COLUMNAS[k]).map((k) => ({ key: k, titulo: COLUMNAS[k][0], visible: prefs.visibles.includes(k), fija: COLUMNAS[k][3] }))}
            onAlternar={(k) => setPrefs(alternarColumna(vista, costos, prefs, k))}
            onMover={(k, d) => setPrefs(moverColumna(prefs, k, d))}
            onRestablecer={() => setPrefs({ ...normalizarPrefs(vista, costos, null) })}
          />
          <Button variant="outline" disabled={!filas.length} onClick={() => bajarCsv(vista, filas, marca, costos)}>Exportar</Button>
          <BotonActualizar cargando={cargando} onClick={() => setVuelta((n) => n + 1)} />
        </div>
        <ListaTrabajo
          columnas={columnas} filas={filas.slice(0, mostrar)} claveDe={(f) => f.id} celda={celda} orden={orden} onOrden={setOrden}
          activa={ventana?.producto ?? null} onAbrir={(f) => (vista === 'agrupado' ? setVentana(f as Grupo) : setFicha(f.producto))} etiquetaFila={(f) => `el producto ${f.nombre}`}
          vacio={!cargando && datos ? <div style={{ padding: space[6] }}><EmptyState title={q ? `Ninguna venta coincide con «${q}».` : linea || canal ? 'Sin ventas.' : 'No hay ventas en este período.'} /></div> : null}
        />
        {filas.length > mostrar && (
          <div style={{ padding: 12, textAlign: 'center', borderTop: `1px solid ${color.bg2}` }}>
            <Button variant="outline" onClick={() => setTanda({ de: mirada, n: mostrar + DE_A })}>Mostrar {Math.min(DE_A, filas.length - mostrar).toLocaleString('es-AR')} más</Button>
          </div>
        )}
        <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
          {cargando && !datos ? 'Leyendo…' : `${Math.min(mostrar, filas.length).toLocaleString('es-AR')} de ${filas.length.toLocaleString('es-AR')}`}
        </div>
      </div>

      {ventana && (
        <VentasDelProducto
          key={ventana.producto} marca={marca} nombre={ventana.nombre} producto={ventana.producto}
          renglones={buscados.filter((r) => r.producto === ventana.producto)} margen={ventana.margen} costos={costos}
          desde={rango.desde} hasta={rango.hasta} hoy={hoy}
          onCerrar={() => setVentana(null)} onVerFicha={() => { setFicha(ventana.producto); setVentana(null) }}
        />
      )}
      {ficha && <FichaProducto key={`${marca}/${ficha}`} marca={marca} producto={ficha} fila={null} cargarAbierto={false} onCerrar={() => setFicha(null)} onCargado={() => {}} />}
    </div>
  )
}
