'use client'

/**
 * ERP › Productos y precios › Precios, con el molde del diseño (`~/Documents/erp-monitor/diseno.md` §7; tablero 5 del v8,
 * pestaña «Precios»): TODAS las listas de cada producto en una grilla, de SÓLO LECTURA —Local · Online · Mayorista—, la
 * oferta de Tienda Nube o la liquidación en curso del monitor, y el último cambio (quién y cuándo). Vistas: Todos · Con
 * liquidación u oferta · Cambiados este mes · Sin precio mayorista. El ícono de la fila (y el clic) abre la ficha
 * (`FichaProducto`) con el historial de precios. Las filas son las de Productos (`vista=productos-lista`); vistas y
 * columnas en `lib/erp/precios-lista.core.js`.
 *
 * 🔑 Escribir precios (pedido de Bruno, PENDIENTES «Listas de precios (d)»; el v8 los dejaba de sólo lectura): el $ de la fila abre la ficha con
 *    «Cargar en el ERP» a la vista (`cargarPrecio`/`soltarPrecio`, `CargarPrecio`); «Volver a seguir» está en la ficha. Las reglas
 *    por forma de pago ya viven en Configuración › Reglas. La «Mayorista especial» del v8 ⛔ existe en el motor ⇒ ⛔ columna (lo dice el pie).
 */

import { useAvisoPrecio } from '@/lib/erp/precio-manda'
import { usePantallaAngosta } from '@/lib/movil'
import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { usePuedeErp } from '@/lib/erp/usePuedeErp'
import { Button, EmptyState, Icono, MoneyText, Notice, color, font, space } from '@/components/ui'
import { ListaTrabajo, IconoFila, type MovilColumna, type OrdenLista } from '@/components/ui/ListaTrabajo'
import { PanelColumnas } from '@/components/ui/PanelColumnas'
import { AccionSeleccion, BarraSeleccion } from '@/components/ui/FichaCostado'
import { BuscadorLista, ChipEstado, VistasLista, cuandoCorto, estiloNombre } from '@/components/ui/PiezasLista'
import { leerListaDeProductos, type FilaProducto, type ListaDeProductos, type MarcaErp } from '@/lib/erp/cliente'
import { filtrar } from '@/lib/erp/productos-lista.core.js'
import {
  LISTAS_PRECIO, VISTAS_PRECIO, alternarColumnaPrecio, columnasPrecio, contarVistasPrecio, filtrarPrecio, moverColumna,
  normalizarPrefsPrecio, ofertaDe, ordenarPrecio,
} from '@/lib/erp/precios-lista.core.js'
import { guardarPrefsDeLista, leerPrefsDeLista } from '@/lib/erp/lista-prefs'
import { diaArgentino } from '@/lib/envios/portal.core.js'
import { FichaProducto } from './FichaProducto'
import { useLineaErp } from '@/lib/erp/linea-erp'

type Prefs = { orden: string[]; visibles: string[] }

const LINEA: Record<string, string> = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }
const NOMBRE_LISTA: Record<string, string> = { local: 'Local', online: 'Online', mayorista: 'Mayorista', oferta: 'Tienda Nube con oferta' }
/** Cuántas filas se dibujan de una (la lista ⛔ es virtual). */
const DE_A = 300
const COLUMNAS = columnasPrecio()
/** 📱 Qué es cada columna en la tarjeta del celular; la que no está, `oculta`. */
const MOVIL: Record<string, MovilColumna> = { p: 'titulo', local: 'dato', mayorista: 'chico', oferta: 'chico' }
const pesos = (n: number | null | undefined) => (n == null ? '' : `$ ${Math.round(n).toLocaleString('es-AR')}`)

/** La oferta o liquidación en palabras (pantalla y CSV). */
function textoOferta(f: FilaProducto): string {
  const o = ofertaDe(f)
  if (!o) return ''
  if (o.tipo === 'liquidacion') return `${o.nombre}${o.precio != null ? ` · ${pesos(o.precio)}` : ''}`
  return `${pesos(o.precio)}${o.pct ? ` (−${o.pct}%)` : ''}`
}

function bajarCsv(filas: FilaProducto[], marca: MarcaErp, conCosto: boolean) {
  const c = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`
  const renglones = [['Producto', ...(conCosto ? ['Costo'] : []), 'Local', 'Online', 'Mayorista', 'Tienda Nube con oferta', 'Oferta', 'Último cambio', 'Quién', 'Categoría', 'Marca'].map(c).join(';')]
  for (const f of filas) {
    renglones.push([f.nombre, ...(conCosto ? [f.costo ?? ''] : []), ...LISTAS_PRECIO.map((l) => f.precios[l] ?? ''), f.precios.oferta ?? '', textoOferta(f),
      f.ultimoCambio ? diaArgentino(Date.parse(f.ultimoCambio.cuando)) : '', f.ultimoCambio?.quien ?? '', f.categoria, LINEA[f.linea] ?? f.linea].map(c).join(';'))
  }
  const url = URL.createObjectURL(new Blob(['﻿' + renglones.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `precios-${marca}-${diaArgentino(Date.now())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function PreciosErp() {
  const { marca: delShell, perfil } = useSesion()
  const aviso = useAvisoPrecio()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const puede = usePuedeErp(marca)
  const usuario = perfil?.name ?? null
  const lista = 'erp-precios'
  const [datos, setDatos] = useState<(ListaDeProductos & { clave: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState('todos')
  const [q, setQ] = useState('')
  const linea = useLineaErp()
  const [orden, setOrden] = useState<OrdenLista>(null)
  const [tanda, setTanda] = useState({ de: '', n: DE_A })
  const [prefs, setPrefsState] = useState<Prefs>(() => normalizarPrefsPrecio(typeof window === 'undefined' ? null : leerPrefsDeLista(lista, usuario)))
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [ficha, setFicha] = useState<{ marca: MarcaErp; producto: string; cargar: boolean } | null>(null)

  const setPrefs = (p: Prefs) => { setPrefsState(p); guardarPrefsDeLista(lista, usuario, p) }

  const [vuelta, setVuelta] = useState(0)
  const clave = `${marca}|${vuelta}`
  useEffect(() => {
    let vivo = true
    leerListaDeProductos(marca)
      .then((d) => { if (vivo) { setDatos({ ...d, clave }); setSeleccion(new Set()); setError(null) } })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : 'No se pudieron leer los precios.'); setDatos((x) => (x ? { ...x, clave } : x)) } })
    return () => { vivo = false }
  }, [marca, clave])
  const cargando = datos?.clave !== clave
  // Sin `costos` (todos menos Admin y Administración) el servidor ⛔ manda el costo: ⛔ columna.
  const conCosto = datos?.costos === true
  const sinCol = (ks: string[]) => (conCosto ? ks : ks.filter((k) => k !== 'costo'))

  const base = useMemo(() => filtrar(datos?.filas ?? [], { q, linea }), [datos, q, linea])
  const conteo = useMemo(() => contarVistasPrecio(base), [base])
  const filas: FilaProducto[] = useMemo(() => ordenarPrecio(filtrarPrecio(base, vista), orden), [base, vista, orden])
  const elegidas = filas.filter((f) => seleccion.has(f.id))
  const mirada = `${vista}|${q}|${linea}|${orden?.col ?? ''}|${orden?.dir ?? ''}`
  const mostrar = tanda.de === mirada ? tanda.n : DE_A

  const abrir = (f: FilaProducto, cargar = false) => setFicha({ marca, producto: f.producto, cargar })
  const filaDeFicha = ficha && ficha.marca === marca ? datos?.filas.find((x) => x.producto === ficha.producto) ?? null : null

  // 📱 En el celular la tarjeta arma lo suyo con TODAS las columnas: las de `prefs` son de la compu.
  const angosta = usePantallaAngosta()
  const columnas = sinCol(angosta ? prefs.orden : prefs.visibles).map((k) => {
    const [titulo, ancho, ordena] = COLUMNAS[k]
    return { key: k, titulo, ancho, ordena, derecha: k === 'costo' || (LISTAS_PRECIO as string[]).includes(k), movil: MOVIL[k] ?? 'oculta' }
  })

  const celda = (f: FilaProducto, k: string): React.ReactNode => {
    if (k === 'p') return <span title={f.nombre} style={estiloNombre}>{f.nombre}</span>
    if (k === 'costo') return f.costo == null ? <span style={{ color: color.mut2 }} title="Sin costo">—</span> : <MoneyText value={f.costo} />
    if ((LISTAS_PRECIO as string[]).includes(k)) {
      const n = f.precios[k]
      return n == null ? <span style={{ color: color.mut2 }} title="Sin precio">—</span> : <MoneyText value={n} />
    }
    if (k === 'oferta') {
      const o = ofertaDe(f)
      if (!o) return <span style={{ color: color.mut2 }}>—</span>
      const texto = textoOferta(f)
      const tono = o.tipo === 'liquidacion' ? 'warning' as const : 'brand' as const
      const titulo = o.tipo === 'liquidacion' && o.hasta ? `${texto} · hasta ${o.hasta.split('-').reverse().join('/')}` : texto
      return <span title={titulo}><ChipEstado mapa={{ [texto]: [tono, texto] }} k={texto} /></span>
    }
    if (k === 'ult') {
      const u = f.ultimoCambio
      if (!u) return <span style={{ color: color.mut2 }}>—</span>
      return (
        <span title={`${NOMBRE_LISTA[u.lista] ?? u.lista}: ${pesos(u.precio)}`} style={{ color: u.copia ? color.mut : color.ink2 }}>
          {cuandoCorto(u.cuando)} · {u.quien ?? 'sin dato'}
        </span>
      )
    }
    if (k === 'cat') return <span title={f.categoria ?? undefined} style={{ color: f.categoria ? color.ink2 : color.mut2 }}>{f.categoria ?? '—'}</span>
    if (k === 'linea') return <span style={{ color: color.ink2 }}>{LINEA[f.linea] ?? f.linea}</span>
    return null
  }

  const acciones = (f: FilaProducto) => (
    <>
      {puede('configurar') && <IconoFila label="Editar precio" onClick={() => abrir(f, true)}><Icono nombre="pesos" size={16} /></IconoFila>}
      <IconoFila indigo label={`Historial de precios de ${f.nombre}`} onClick={() => abrir(f)}><Icono nombre="historial" size={16} /></IconoFila>
    </>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {/* Darío 20-nov: sin subtítulo ni cuadros de resumen (repetían las pestañas). */}
      {/* Darío 20-nov: el cartel fijo sólo ANTES del corte (lo raro: el precio no llega a la Caja ni a la tienda). Con la marca
          ya en el ERP, que el precio llegue es lo normal: se dice al guardar, en la confirmación. */}
      {aviso.antes && <Notice tone="neutral">Zattia: el precio todavía no llega a la Caja ni a Tienda Nube.</Notice>}
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {datos?.liquidacionesError && <Notice tone="warning">No se pudo leer la Liquidación: se ven solo las ofertas de Tienda Nube.</Notice>}


      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <VistasLista vistas={VISTAS_PRECIO} valor={vista} conteo={conteo} onCambio={(k) => { setVista(k); setSeleccion(new Set()) }} />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar un producto" placeholder="Producto o SKU" />
          <PanelColumnas
            columnas={sinCol(prefs.orden).map((k) => ({ key: k, titulo: COLUMNAS[k][0], visible: prefs.visibles.includes(k), fija: COLUMNAS[k][3] }))}
            onAlternar={(k) => setPrefs(alternarColumnaPrecio(prefs, k))}
            onMover={(k, d) => setPrefs(moverColumna(prefs, k, d))}
            onRestablecer={() => setPrefs({ ...normalizarPrefsPrecio(null) })}
          />
          <Button variant="outline" disabled={!filas.length} onClick={() => bajarCsv(filas, marca, conCosto)}>Exportar</Button>
          <Button variant="outline" disabled={cargando} onClick={() => setVuelta((n) => n + 1)}>{cargando ? 'Leyendo…' : 'Actualizar'}</Button>
        </div>
        <ListaTrabajo
          columnas={columnas} filas={filas.slice(0, mostrar)} claveDe={(f) => f.id} celda={celda} acciones={acciones} anchoAcciones={76}
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
          {cargando && !datos ? 'Leyendo los precios…' : `${Math.min(mostrar, filas.length).toLocaleString('es-AR')} de ${filas.length.toLocaleString('es-AR')}`}
        </div>
      </div>

      <BarraSeleccion cuantas={elegidas.length} onSoltar={() => setSeleccion(new Set())}>
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
