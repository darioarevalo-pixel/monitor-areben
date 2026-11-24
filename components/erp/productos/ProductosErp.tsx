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

import { usePantallaAngosta } from '@/lib/movil'
import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { usePuedeErp } from '@/lib/erp/usePuedeErp'
import { Button, EmptyState, Icono, MenuAcciones, MoneyText, Notice, Select, color, font, space, type AccionMenu } from '@/components/ui'
import { ListaTrabajo, IconoFila, type MovilColumna, type OrdenLista } from '@/components/ui/ListaTrabajo'
import { PanelColumnas } from '@/components/ui/PanelColumnas'
import { AccionSeleccion, BarraSeleccion } from '@/components/ui/FichaCostado'
import { BuscadorLista, ChipEstado, VistasLista, estiloNombre } from '@/components/ui/PiezasLista'
import { leerListaDeProductos, type FilaProducto, type ListaDeProductos, type MarcaErp } from '@/lib/erp/cliente'
import {
  LISTAS, PESTANIAS, REVISAR, VISTAS, alternarColumna, columnasDe, contarVistas, filtrar, moverColumna, normalizarPrefs, ordenar,
} from '@/lib/erp/productos-lista.core.js'
import { guardarPrefsDeLista, leerPrefsDeLista } from '@/lib/erp/lista-prefs'
import { diaArgentino } from '@/lib/envios/portal.core.js'
import { EN_TN, FichaProducto } from './FichaProducto'
import { useLineaErp } from '@/lib/erp/linea-erp'

type Prefs = { orden: string[]; visibles: string[] }

const LINEA: Record<string, string> = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }
/** Cuántas filas se dibujan de una (la lista ⛔ es virtual). */
const DE_A = 300
const COLUMNAS = columnasDe()
/** 📱 Qué es cada columna en la tarjeta del celular; la que no está, `oculta`. */
const MOVIL: Record<string, MovilColumna> = { p: 'titulo', disp: 'dato', local: 'chico', tn: 'chico', cat: 'chico' }
const u = (n: number) => `${n.toLocaleString('es-AR')} u`

function bajarCsv(filas: FilaProducto[], marca: MarcaErp, conCosto: boolean) {
  const c = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`
  const renglones = [['Producto', 'Variantes', 'SKU', 'Disponible', ...(conCosto ? ['Costo'] : []), 'Local', 'Online', 'Mayorista', 'Tienda Nube', 'Categoría', 'Proveedor', 'Código del proveedor', 'Marca'].map(c).join(';')]
  for (const f of filas) {
    renglones.push([f.nombre, f.variantes.length, f.variantes.map((v) => v.sku).filter(Boolean).join(' '), f.disponible, ...(conCosto ? [f.costo ?? ''] : []), ...LISTAS.map((l) => f.precios[l] ?? ''),
      EN_TN[f.tn][1], f.categoria, f.proveedor, f.codigoProveedor, LINEA[f.linea] ?? f.linea].map(c).join(';'))
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
  const puede = usePuedeErp(marca)
  const usuario = perfil?.name ?? null
  const lista = 'erp-productos'
  const [datos, setDatos] = useState<(ListaDeProductos & { clave: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState('todos')
  const [q, setQ] = useState('')
  const linea = useLineaErp()
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
  // 🔴 Sin `costos` (todos menos Admin y Administración) el servidor ⛔ manda el costo: ⛔ columna, vista ni tile «Sin costo» (Bruno 30-oct).
  const conCosto = datos?.costos === true
  const vistas = conCosto ? VISTAS : VISTAS.filter(([k]) => k !== 'sincosto')
  const pestanias = vistas.filter(([k]) => PESTANIAS.includes(k))
  // Dentro de «Para revisar», qué mirar: todo junto o una sola cosa.
  const [revisar, setRevisar] = useState('revisar')
  const queRevisar = vistas.filter(([k]) => REVISAR.includes(k))
  const sinCol = (ks: string[]) => (conCosto ? ks : ks.filter((k) => k !== 'costo'))

  const base = useMemo(() => filtrar(datos?.filas ?? [], { q, linea }), [datos, q, linea])
  const conteo = useMemo(() => contarVistas(base), [base])
  const vistaReal = vista === 'revisar' ? revisar : vista
  const enVista = useMemo(() => filtrar(base, { vista: VISTAS.some(([k]) => k === vistaReal) ? vistaReal : 'todos' }), [base, vistaReal])
  const filas: FilaProducto[] = useMemo(() => ordenar(enVista, orden), [enVista, orden])
  const elegidas = filas.filter((f) => seleccion.has(f.id))
  const mirada = `${vistaReal}|${q}|${linea}|${orden?.col ?? ''}|${orden?.dir ?? ''}`
  const mostrar = tanda.de === mirada ? tanda.n : DE_A

  const abrir = (f: FilaProducto, cargar = false) => setFicha({ marca, producto: f.producto, cargar })
  const filaDeFicha = ficha && ficha.marca === marca ? datos?.filas.find((x) => x.producto === ficha.producto) ?? null : null

  // 📱 En el celular la tarjeta arma lo suyo con TODAS las columnas: las de `prefs` son de la compu.
  const angosta = usePantallaAngosta()
  const columnas = sinCol(angosta ? prefs.orden : prefs.visibles).map((k) => {
    const [titulo, ancho, ordena] = COLUMNAS[k]
    return { key: k, titulo, ancho, ordena, derecha: ['var', 'disp', 'costo', ...LISTAS].includes(k), movil: MOVIL[k] ?? 'oculta' }
  })
  const plata = (n: number | null, titulo?: string) => (n == null ? <span style={{ color: color.mut2 }} title={titulo}>—</span> : <MoneyText value={n} />)

  const celda = (f: FilaProducto, k: string): React.ReactNode => {
    if (k === 'p') return <span title={f.nombre} style={estiloNombre}>{f.nombre}</span>
    if (k === 'var') return <span style={{ color: color.ink2 }} title={f.variantes.map((v) => v.talleNombre).join(' · ')}>{f.variantes.length}</span>
    if (k === 'disp') return <span style={{ fontWeight: 700, color: f.negativas ? 'var(--mo-danger-ink)' : f.disponible === 0 ? color.mut2 : color.ink }} title={f.negativas ? `${f.negativas} ${f.negativas === 1 ? 'variante' : 'variantes'} en negativo` : undefined}>{f.disponible}</span>
    if (k === 'costo') return plata(f.costo ?? null, 'Sin costo')
    if ((LISTAS as string[]).includes(k)) return plata(f.precios[k], 'Sin precio')
    if (k === 'tn') return <ChipEstado mapa={EN_TN} k={f.tn} />
    if (k === 'cat') return <span title={f.categoria ?? undefined} style={{ color: f.categoria ? color.ink2 : color.mut2 }}>{f.categoria ?? '—'}</span>
    if (k === 'prov') return <span title={f.proveedor ?? undefined} style={{ color: f.proveedor ? color.ink2 : color.mut2 }}>{f.proveedor ?? '—'}</span>
    if (k === 'linea') return <span style={{ color: color.ink2 }}>{LINEA[f.linea] ?? f.linea}</span>
    return null
  }

  const acciones = (f: FilaProducto) => {
    const menu: AccionMenu[] = [
      { key: 'ficha', label: 'Ver producto', icono: 'abrir', onClick: () => abrir(f) },
      ...(puede('configurar') ? [{ key: 'cargar', label: 'Editar precio', icono: 'pesos' as const, onClick: () => abrir(f, true) }] : []),
      { key: 'etiq', label: 'Imprimir etiquetas ↗', icono: 'abrir', onClick: () => window.open('/etiquetas', '_blank', 'noopener') },
    ]
    return (
      <>
        {puede('configurar') && <IconoFila label="Editar precio" onClick={() => abrir(f, true)}><Icono nombre="pesos" size={16} /></IconoFila>}
        <MenuAcciones acciones={menu} etiqueta={`Más acciones del producto ${f.nombre}`} vertical alinear="izquierda" />
      </>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {/* Darío 20-nov: sin subtítulo ni cuadros de resumen (repetían las pestañas). */}
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}

      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <VistasLista vistas={pestanias} valor={vista} conteo={conteo} onCambio={(k) => { setVista(k); setRevisar('revisar'); setSeleccion(new Set()) }} />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          {vista === 'revisar' && (
            <Select aria-label="Qué revisar" value={revisar} onChange={(e) => { setRevisar(e.target.value); setSeleccion(new Set()) }} style={{ width: 'auto' }}>
              <option value="revisar">Todo · {conteo.revisar ?? 0}</option>
              {queRevisar.map(([k, n]) => <option key={k} value={k} disabled={!conteo[k]}>{n} · {conteo[k] ?? 0}</option>)}
            </Select>
          )}
          <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar un producto" placeholder="Nombre, SKU, código de barras o del proveedor" />
          <PanelColumnas
            columnas={sinCol(prefs.orden).map((k) => ({ key: k, titulo: COLUMNAS[k][0], visible: prefs.visibles.includes(k), fija: COLUMNAS[k][3] }))}
            onAlternar={(k) => setPrefs(alternarColumna(prefs, k))}
            onMover={(k, d) => setPrefs(moverColumna(prefs, k, d))}
            onRestablecer={() => setPrefs({ ...normalizarPrefs(null) })}
          />
          <Button variant="outline" disabled={cargando} onClick={() => setVuelta((n) => n + 1)}>{cargando ? 'Leyendo…' : 'Actualizar'}</Button>
        </div>
        <ListaTrabajo
          columnas={columnas} filas={filas.slice(0, mostrar)} claveDe={(f) => f.id} celda={celda} acciones={acciones} anchoAcciones={72}
          seleccion={seleccion} onSeleccion={setSeleccion} orden={orden} onOrden={setOrden}
          activa={filaDeFicha?.id ?? null} onAbrir={(f) => abrir(f)} etiquetaFila={(f) => `el producto ${f.nombre}`}
          vacio={!cargando && datos ? (
            <div style={{ padding: space[6] }}>
              <EmptyState title={q ? `Ningún producto coincide con «${q.trim()}».` : 'Sin productos.'} />
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
        </div>
      </div>

      <BarraSeleccion cuantas={elegidas.length} onSoltar={() => setSeleccion(new Set())}>
        <span style={{ color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>{u(elegidas.reduce((a, f) => a + f.disponible, 0))} disponibles</span>
        <AccionSeleccion icono="bajar" onClick={() => bajarCsv(elegidas, marca, conCosto)}>Exportar</AccionSeleccion>
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
