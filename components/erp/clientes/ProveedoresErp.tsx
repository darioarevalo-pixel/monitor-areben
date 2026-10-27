'use client'

/**
 * ERP › Clientes y proveedores › Proveedores (diseño §4: lista de REGISTRO, SÓLO VER; tablero 4 del v8): los proveedores
 * del ERP (motor sql/013: semilla de PRM + los cargados a mano) con cuántos productos tiene cada uno. Lo que se hace con
 * un proveedor (visitas, órdenes, lo que entró) vive en el monitor ⇒ «Abrir en el monitor ↗». El proveedor NACE en
 * Ingresos (Bruno, 18-oct): acá ⛔ hay alta.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, MenuAcciones, Notice, color, font, space, type AccionMenu } from '@/components/ui'
import { ListaTrabajo, type OrdenLista } from '@/components/ui/ListaTrabajo'
import { BuscadorLista, ChipEstado, TileResumen, VistasLista, estiloNombre, tonoDeConteo } from '@/components/ui/PiezasLista'
import { leerProveedores, type MarcaErp, type ProveedorErp } from '@/lib/erp/cliente'
import { normal } from '@/lib/erp/stock-lista.core.js'

const VISTAS: Array<[string, string, (p: ProveedorErp) => boolean]> = [
  ['todos', 'Todos', () => true],
  ['conprod', 'Con productos', (p) => p.productos > 0],
  ['sinprod', 'Sin productos', (p) => p.productos === 0],
  ['sincuit', 'Sin CUIT', (p) => !p.cuit],
]
const COLUMNAS = [
  { key: 'p', titulo: 'Proveedor', ancho: 'minmax(200px, 2fr)', ordena: true },
  { key: 'gn', titulo: 'En Gestión Nube como', ancho: 'minmax(160px, 1.4fr)', ordena: false },
  { key: 'cuit', titulo: 'CUIT', ancho: '124px', ordena: false },
  { key: 'prod', titulo: 'Productos', ancho: '96px', ordena: true, derecha: true },
  { key: 'estado', titulo: 'Estado', ancho: '96px', ordena: false },
]
const abrir = (ruta: string) => window.open(ruta, '_blank', 'noopener')

export function ProveedoresErp() {
  const { marca: delShell } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const [datos, setDatos] = useState<{ marca: string; proveedores: ProveedorErp[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState('todos')
  const [q, setQ] = useState('')
  const [orden, setOrden] = useState<OrdenLista>(null)
  useEffect(() => {
    let vivo = true
    leerProveedores(marca)
      .then((d) => { if (vivo) { setDatos({ marca, proveedores: d.proveedores }); setError(null) } })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : 'No se pudieron leer los proveedores.'); setDatos({ marca, proveedores: [] }) } })
    return () => { vivo = false }
  }, [marca])
  const cargando = datos?.marca !== marca

  const base = useMemo(() => (datos?.proveedores ?? []).filter((p) => !q || normal(`${p.nombre} ${p.nombreGn ?? ''} ${p.cuit ?? ''}`).includes(normal(q))), [datos, q])
  const conteo = useMemo(() => Object.fromEntries(VISTAS.map(([k, , entra]) => [k, base.filter(entra).length])), [base])
  const filas = useMemo(() => {
    const entra = VISTAS.find(([k]) => k === vista)?.[2] ?? (() => true)
    const xs = base.filter(entra)
    if (!orden) return xs
    const dir = orden.dir === 'asc' ? 1 : -1
    return xs.slice().sort((a, b) => (orden.col === 'prod' ? (a.productos - b.productos) : normal(a.nombre).localeCompare(normal(b.nombre))) * dir)
  }, [base, vista, orden])

  const celda = (p: ProveedorErp, k: string): React.ReactNode => {
    if (k === 'p') return <span title={p.nombre} style={estiloNombre}>{p.nombre}</span>
    if (k === 'gn') return <span style={{ color: p.nombreGn ? color.ink2 : color.mut2 }}>{p.nombreGn ?? '—'}</span>
    if (k === 'cuit') return <span style={{ color: p.cuit ? color.ink2 : color.mut2 }}>{p.cuit ?? '—'}</span>
    if (k === 'prod') return <span style={{ color: p.productos ? color.ink : color.mut2 }}>{p.productos}</span>
    if (k === 'estado') return <ChipEstado mapa={{ a: ['success', 'Activo'], i: ['neutral', 'Inactivo'] }} k={p.activo ? 'a' : 'i'} />
    return null
  }
  const acciones = (p: ProveedorErp) => {
    const menu: AccionMenu[] = [
      { key: 'prm', label: 'Ver en PRM ↗', icono: 'abrir', onClick: () => abrir('/prm'), hint: 'Visitas, compromisos y cómo se mueve lo que se le compra.' },
      { key: 'rec', label: 'Lo que entró, en Ingresos ↗', icono: 'abrir', onClick: () => abrir('/recepciones') },
    ]
    return <MenuAcciones acciones={menu} etiqueta={`Más acciones del proveedor ${p.nombre}`} vertical alinear="izquierda" />
  }

  const res = { total: base.length, conProd: conteo.conprod ?? 0, sinCuit: conteo.sincuit ?? 0, productos: base.reduce((a, p) => a + p.productos, 0) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap', alignItems: 'center' }}>
        <p style={{ margin: 0, color: color.mut }}>Los proveedores del ERP, para ver. Nacen en Ingresos, con la orden de compra.</p>
        <div style={{ display: 'flex', gap: space[2] }}>
          <Button variant="outline" onClick={() => abrir('/prm')}>Abrir PRM ↗</Button>
          <Button variant="outline" onClick={() => abrir('/recepciones')}>Abrir Ingresos ↗</Button>
        </div>
      </div>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
        <TileResumen titulo="Proveedores" valor={res.total.toLocaleString('es-AR')} oscuro nota="de la empresa" />
        <TileResumen titulo="Con productos" valor={res.conProd.toLocaleString('es-AR')} nota={`${res.productos.toLocaleString('es-AR')} productos atados`} />
        <TileResumen tono={tonoDeConteo(res.sinCuit)} titulo="Sin CUIT" valor={res.sinCuit.toLocaleString('es-AR')} nota={res.sinCuit ? 'para completar' : 'ninguno'} />
        <TileResumen titulo="Cuentas por pagar" valor="—" nota="viven en el dashboard" />
      </div>

      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <VistasLista vistas={VISTAS} valor={vista} conteo={conteo} onCambio={setVista} />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar un proveedor" placeholder="Nombre, nombre en Gestión Nube o CUIT" />
        </div>
        <ListaTrabajo
          columnas={COLUMNAS} filas={filas} claveDe={(p) => p.id} celda={celda} acciones={acciones} anchoAcciones={44}
          orden={orden} onOrden={setOrden} etiquetaFila={(p) => `el proveedor ${p.nombre}`}
          vacio={!cargando && datos ? <div style={{ padding: space[6] }}><EmptyState title={q ? 'No hay proveedores con ese nombre o CUIT.' : 'No hay proveedores en esta vista.'} /></div> : null}
        />
        <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
          {cargando ? 'Leyendo los proveedores…' : `${filas.length.toLocaleString('es-AR')} de ${base.length.toLocaleString('es-AR')}`}
        </div>
      </div>
    </div>
  )
}
