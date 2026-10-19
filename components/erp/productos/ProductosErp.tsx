'use client'

/**
 * ERP › Productos y precios › Productos, con el molde del diseño aprobado (`~/Documents/erp-monitor/diseno.md` §3, §4 y §7;
 * tablero 5 del v8): UNA lista de TRABAJO con un producto por fila (variantes, disponible, costo, precio por lista, si está
 * en Tienda Nube), vistas con su número, el resumen ARRIBA, buscador, columnas a elección (guardadas por usuario) y la
 * ficha AL COSTADO (`FichaProducto`: las listas, el costo, cada variante con su stock, el historial y «Cargar en el ERP»).
 * Reemplaza al «buscá un producto» de Precios. Núcleo puro: `lib/erp/productos-lista.core.js`; servidor: `api/_erp-productos.js`.
 *
 * 🔑 ⛔ alta: el producto nace en Ingresos. Lo que se carga acá (precio o costo) queda en el ERP y, mientras GN funcione,
 *    ⛔ cambia lo que cobra la Caja ni lo que muestra Tienda Nube.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, Icono, MenuAcciones, MoneyText, Notice, Select, color, font, space, type AccionMenu } from '@/components/ui'
import { ListaTrabajo, IconoFila, type OrdenLista } from '@/components/ui/ListaTrabajo'
import { PanelColumnas } from '@/components/ui/PanelColumnas'
import { AccionSeleccion, BarraSeleccion } from '@/components/ui/FichaCostado'
import { BuscadorLista, ChipEstado, InterruptorDensidad, TileResumen, VistasLista, cuandoCorto } from '@/components/ui/PiezasLista'
import { leerListaDeProductos, type FilaProducto, type ListaDeProductos, type MarcaErp } from '@/lib/erp/cliente'
import {
  LISTAS, VISTAS, alternarColumna, columnasDe, contarVistas, filtrar, moverColumna, normalizarPrefs, ordenar, resumen,
} from '@/lib/erp/productos-lista.core.js'
import { guardarPrefsDeLista, leerPrefsDeLista } from '@/lib/erp/lista-prefs'
import { diaArgentino } from '@/lib/envios/portal.core.js'
import { EN_TN, FichaProducto } from './FichaProducto'

type Prefs = { orden: string[]; visibles: string[]; densidad: 'compacta' | 'comoda' }

const ANCHO_SELECT: React.CSSProperties = { cursor: 'pointer', width: 'auto', flex: '0 0 auto' }
const LINEA: Record<string, string> = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }
/** Cuántas filas se dibujan de una (la lista ⛔ es virtual). */
const DE_A = 300
const COLUMNAS = columnasDe()
const u = (n: number) => `${n.toLocaleString('es-AR')} u`

function bajarCsv(filas: FilaProducto[], marca: MarcaErp) {
  const c = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`
  const renglones = [['Producto', 'Variantes', 'SKU', 'Disponible', 'Costo', 'Local', 'Online', 'Mayorista', 'En Tienda Nube', 'Categoría', 'Proveedor', 'Línea'].map(c).join(';')]
  for (const f of filas) {
    renglones.push([f.nombre, f.variantes.length, f.variantes.map((v) => v.sku).filter(Boolean).join(' '), f.disponible, f.costo ?? '', ...LISTAS.map((l) => f.precios[l] ?? ''),
      EN_TN[f.tn][1], f.categoria, f.proveedor, LINEA[f.linea] ?? f.linea].map(c).join(';'))
  }
  const url = URL.createObjectURL(new Blob(['﻿' + renglones.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `productos-${marca}-${diaArgentino(Date.now())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function ProductosErp() {
  const { marca: delShell, perfil } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const usuario = perfil?.name ?? null
  const lista = 'erp-productos'
  const [datos, setDatos] = useState<(ListaDeProductos & { clave: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState('todos')
  const [q, setQ] = useState('')
  const [linea, setLinea] = useState('')
  const [orden, setOrden] = useState<OrdenLista>(null)
  const [tanda, setTanda] = useState({ de: '', n: DE_A })
  const [prefs, setPrefsState] = useState<Prefs>(() => normalizarPrefs(typeof window === 'undefined' ? null : leerPrefsDeLista(lista, usuario)))
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  // `cargar` = la ficha abre con «Cargar en el ERP» a la vista (el ícono de la fila).
  const [ficha, setFicha] = useState<{ marca: MarcaErp; producto: string; cargar: boolean } | null>(null)

  const setPrefs = (p: Prefs) => { setPrefsState(p); guardarPrefsDeLista(lista, usuario, p) }

  const [vuelta, setVuelta] = useState(0)
  const clave = `${marca}|${vuelta}`
  useEffect(() => {
    let vivo = true
    leerListaDeProductos(marca)
      .then((d) => { if (vivo) { setDatos({ ...d, clave }); setSeleccion(new Set()); setError(null) } })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : 'No se pudieron leer los productos.'); setDatos((x) => (x ? { ...x, clave } : x)) } })
    return () => { vivo = false }
  }, [marca, clave])
  const cargando = datos?.clave !== clave

  const base = useMemo(() => filtrar(datos?.filas ?? [], { q, linea }), [datos, q, linea])
  const conteo = useMemo(() => contarVistas(base), [base])
  const enVista = useMemo(() => filtrar(base, { vista }), [base, vista])
  const filas: FilaProducto[] = useMemo(() => ordenar(enVista, orden), [enVista, orden])
  const res = useMemo(() => resumen(enVista), [enVista])
  const elegidas = filas.filter((f) => seleccion.has(f.id))
  const mirada = `${vista}|${q}|${linea}|${orden?.col ?? ''}|${orden?.dir ?? ''}`
  const mostrar = tanda.de === mirada ? tanda.n : DE_A

  const abrir = (f: FilaProducto, cargar = false) => setFicha({ marca, producto: f.producto, cargar })
  const filaDeFicha = ficha && ficha.marca === marca ? datos?.filas.find((x) => x.producto === ficha.producto) ?? null : null

  const columnas = prefs.visibles.map((k) => {
    const [titulo, ancho, ordena] = COLUMNAS[k]
    return { key: k, titulo, ancho, ordena, derecha: ['var', 'disp', 'costo', ...LISTAS].includes(k) }
  })
  const plata = (n: number | null, titulo?: string) => (n == null ? <span style={{ color: color.mut2 }} title={titulo}>—</span> : <MoneyText value={n} />)

  const celda = (f: FilaProducto, k: string): React.ReactNode => {
    if (k === 'p') return <b title={f.nombre} style={{ color: color.ink }}>{f.nombre}</b>
    if (k === 'var') return <span style={{ color: color.ink2 }} title={f.variantes.map((v) => v.talleNombre).join(' · ')}>{f.variantes.length}</span>
    if (k === 'disp') return <span style={{ fontWeight: 700, color: f.negativas ? 'var(--mo-danger-ink)' : f.disponible === 0 ? color.mut2 : color.ink }} title={f.negativas ? `${f.negativas} variante(s) en negativo` : undefined}>{f.disponible}</span>
    if (k === 'costo') return plata(f.costo, 'Sin costo en el ERP')
    if ((LISTAS as string[]).includes(k)) return plata(f.precios[k], 'Sin precio en esta lista')
    if (k === 'tn') return <ChipEstado mapa={EN_TN} k={f.tn} />
    if (k === 'cat') return <span title={f.categoria ?? undefined} style={{ color: f.categoria ? color.ink2 : color.mut2 }}>{f.categoria ?? '—'}</span>
    if (k === 'prov') return <span title={f.proveedor ?? undefined} style={{ color: f.proveedor ? color.ink2 : color.mut2 }}>{f.proveedor ?? '—'}</span>
    if (k === 'linea') return <span style={{ color: color.ink2 }}>{LINEA[f.linea] ?? f.linea}</span>
    return null
  }

  const acciones = (f: FilaProducto) => {
    const menu: AccionMenu[] = [
      { key: 'ficha', label: 'Abrir la ficha', icono: 'abrir', onClick: () => abrir(f) },
      { key: 'cargar', label: 'Cargar precio o costo', icono: 'pesos', onClick: () => abrir(f, true) },
      { key: 'etiq', label: 'Etiquetas en el monitor ↗', icono: 'abrir', onClick: () => window.open('/etiquetas', '_blank', 'noopener') },
    ]
    return (
      <>
        <IconoFila label="Cargar precio o costo" onClick={() => abrir(f, true)}><Icono nombre="pesos" size={16} /></IconoFila>
        <MenuAcciones acciones={menu} etiqueta={`Más acciones del producto ${f.nombre}`} vertical alinear="izquierda" />
      </>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {/* El título lo pone el menú del ERP (`Erp.tsx`) arriba de las pestañas. */}
      <p style={{ margin: 0, color: color.mut }}>Cada producto con sus variantes, lo disponible, el costo y el precio de cada lista. Los productos nacen en Ingresos: acá no se dan de alta.</p>
      <Notice tone="warning">Los precios y costos del ERP corren <b>en paralelo</b> con Gestión Nube: lo que se carga acá no cambia lo que cobra la Caja ni lo que muestra Tienda Nube.</Notice>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
        <TileResumen titulo="Productos" valor={res.productos.toLocaleString('es-AR')} oscuro nota={`${res.variantes.toLocaleString('es-AR')} variantes`} />
        <TileResumen titulo="Disponible" valor={u(res.disponible)} nota="lo que se puede vender" />
        <TileResumen titulo="Sin costo" valor={res.sinCosto.toLocaleString('es-AR')} nota={res.sinCosto ? 'sin costo no hay margen' : 'todos tienen costo'} />
        <TileResumen titulo="Fuera de Tienda Nube" valor={res.fueraDeTn.toLocaleString('es-AR')} nota="ocultos o sin publicar" />
      </div>

      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <VistasLista vistas={VISTAS} valor={vista} conteo={conteo} onCambio={(k) => { setVista(k); setSeleccion(new Set()) }} />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar un producto" placeholder="Nombre, SKU, código de barras, categoría o proveedor" />
          {marca === 'zattia' && <Select aria-label="Línea" style={ANCHO_SELECT} value={linea} onChange={(e) => setLinea(e.target.value)}><option value="">Zattia y Stunned</option><option value="zattia">Zattia</option><option value="stunned">Stunned</option></Select>}
          <InterruptorDensidad valor={prefs.densidad} onCambio={(d) => setPrefs({ ...prefs, densidad: d })} />
          <PanelColumnas
            columnas={prefs.orden.map((k) => ({ key: k, titulo: COLUMNAS[k][0], visible: prefs.visibles.includes(k), fija: COLUMNAS[k][3] }))}
            onAlternar={(k) => setPrefs(alternarColumna(prefs, k))}
            onMover={(k, d) => setPrefs(moverColumna(prefs, k, d))}
            onRestablecer={() => setPrefs({ ...normalizarPrefs(null), densidad: prefs.densidad })}
          />
          <Button variant="outline" disabled={cargando} onClick={() => setVuelta((n) => n + 1)}>{cargando ? 'Leyendo…' : 'Actualizar'}</Button>
        </div>
        <ListaTrabajo
          columnas={columnas} filas={filas.slice(0, mostrar)} claveDe={(f) => f.id} celda={celda} acciones={acciones} anchoAcciones={72}
          seleccion={seleccion} onSeleccion={setSeleccion} orden={orden} onOrden={setOrden} densidad={prefs.densidad}
          activa={filaDeFicha?.id ?? null} onAbrir={(f) => abrir(f)} etiquetaFila={(f) => `el producto ${f.nombre}`}
          vacio={!cargando && datos ? (
            <div style={{ padding: space[6] }}>
              <EmptyState title={q ? 'No hay productos con ese nombre, SKU o código.' : 'No hay productos en esta vista.'} />
              {vista !== 'todos' && <div style={{ textAlign: 'center' }}><Button variant="outline" onClick={() => setVista('todos')}>Ver todos</Button></div>}
            </div>
          ) : null}
        />
        {filas.length > mostrar && (
          <div style={{ padding: 12, textAlign: 'center', borderTop: `1px solid ${color.bg2}` }}>
            <Button variant="outline" onClick={() => setTanda({ de: mirada, n: mostrar + DE_A })}>Mostrar {Math.min(DE_A, filas.length - mostrar).toLocaleString('es-AR')} más</Button>
          </div>
        )}
        <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
          {cargando && !datos ? 'Leyendo los productos…' : `${Math.min(mostrar, filas.length).toLocaleString('es-AR')} de ${filas.length.toLocaleString('es-AR')}`}
          {datos && <> · el stock llega hasta {cuandoCorto(datos.libroHasta)} · Tienda Nube leída {cuandoCorto(datos.tnLeidaEn)}</>}
        </div>
      </div>

      <BarraSeleccion cuantas={elegidas.length} onSoltar={() => setSeleccion(new Set())}>
        <span style={{ color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>{u(elegidas.reduce((a, f) => a + f.disponible, 0))} disponibles</span>
        <AccionSeleccion icono="bajar" onClick={() => bajarCsv(elegidas, marca)}>Exportar los elegidos</AccionSeleccion>
      </BarraSeleccion>

      {ficha && (
        <FichaProducto
          key={`${ficha.marca}/${ficha.producto}/${ficha.cargar}`} marca={ficha.marca} producto={ficha.producto} fila={filaDeFicha} cargarAbierto={ficha.cargar}
          onCerrar={() => setFicha(null)} onCargado={() => setVuelta((n) => n + 1)}
        />
      )}
    </div>
  )
}
