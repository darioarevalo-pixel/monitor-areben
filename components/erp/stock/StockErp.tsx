'use client'

/**
 * ERP › Stock › Stock, con el molde del diseño aprobado (`~/Documents/erp-monitor/diseno.md` §3, §4 y §7; tablero 3 del v8):
 * UNA lista con cada prenda y lo que hay de ella por depósito, vistas con su número, el resumen ARRIBA, buscador, columnas
 * a elección (guardadas por usuario) y la ficha AL COSTADO con el historial. Reemplaza al «buscá una prenda» de antes.
 * Núcleo puro: `lib/erp/stock-lista.core.js`; servidor: `api/_erp-stock.js`.
 *
 * 🔑 Manda el DISPONIBLE (lo que se puede vender) = en estantería − lo que apartan los pedidos de TN sin pagar.
 * 🔑 Botones (§4, lista de TRABAJO): íconos a la izquierda. «Ajustar» vive en el ERP; transferir y etiquetas, en el
 *    monitor (↗). Hoy todo corre en paralelo con GN: el stock que sirve sigue siendo el de GN.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, Icono, MenuAcciones, Notice, color, font, space, type AccionMenu } from '@/components/ui'
import { ListaTrabajo, IconoFila, type OrdenLista } from '@/components/ui/ListaTrabajo'
import { PanelColumnas } from '@/components/ui/PanelColumnas'
import { AccionSeleccion, BarraSeleccion } from '@/components/ui/FichaCostado'
import { BuscadorLista, TileResumen, VistasLista, cuandoCorto, estiloNombre, tonoDeConteo } from '@/components/ui/PiezasLista'
import { BarraNivel } from './Barritas'
import { leerListaDeStock, type FilaStock, type ListaDeStock, type MarcaErp } from '@/lib/erp/cliente'
import {
  VISTAS, alternarColumna, columnasDe, contarVistas, filtrar, moverColumna, normalizarPrefs, ordenar, resumen,
} from '@/lib/erp/stock-lista.core.js'
import { NOMBRE_TIPO } from '@/lib/erp/stock.core.js'
import { guardarPrefsDeLista, leerPrefsDeLista } from '@/lib/erp/lista-prefs'
import { diaArgentino } from '@/lib/envios/portal.core.js'
import { FichaPrenda, type PrendaAbierta } from './FichaPrenda'
import { useLineaErp } from '@/lib/erp/linea-erp'

type Prefs = { orden: string[]; visibles: string[] }

/** La prenda que pide abrir otra pestaña (Diferencias, Conciliación): cada pedido nuevo es un objeto nuevo. */
export type PrendaPedida = { marca: MarcaErp; producto: string; talle: string }
/** La prenda que se lleva a «Nuevo ajuste» (Conteos y ajustes). */
export type PrendaAAjustar = { linea: string; producto: string; talle: string; sku: string | null; barcode: string | null; nombre: string | null; talleNombre: string | null }

const LINEA: Record<string, string> = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }
/** Cuántas filas se dibujan de una (la lista ⛔ es virtual: con miles, el navegador se arrastra). */
const DE_A = 300
const u = (n: number) => `${n.toLocaleString('es-AR')} u`

function bajarCsv(filas: FilaStock[], marca: MarcaErp, titulos: Record<string, [string, ...unknown[]]>) {
  const c = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`
  const deps = Object.keys(filas[0]?.deps ?? {})
  const renglones = [['Producto', 'Variante', 'código', 'Disponible', 'Físico', ...deps.map((d) => titulos[`dep:${d}`]?.[0] ?? d), 'Reservado', 'Gestión Nube', 'Línea'].map(c).join(';')]
  for (const f of filas) renglones.push([f.nombre, f.talleNombre, f.sku, f.disponible, f.estanteria, ...deps.map((d) => f.deps[d]), f.enPedidos, f.gn ?? '', LINEA[f.linea] ?? f.linea].map(c).join(';'))
  const url = URL.createObjectURL(new Blob(['﻿' + renglones.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `stock-${marca}-${diaArgentino(Date.now())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function StockErp({ pedida = null, ajustar, irA }: { pedida?: PrendaPedida | null; ajustar: (p: PrendaAAjustar) => void; /** Atajos de arriba (§9): saltan a Ajustes y a Mover y recibir sin pasar por las pestañas. */ irA?: (pestania: string, vista: string) => void }) {
  const { marca: delShell, perfil } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const usuario = perfil?.name ?? null
  const lista = `erp-stock-${marca}`
  const COLUMNAS = useMemo(() => columnasDe(marca), [marca])
  const [datos, setDatos] = useState<(ListaDeStock & { clave: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState('constock')
  const [q, setQ] = useState('')
  const linea = useLineaErp()
  const [orden, setOrden] = useState<OrdenLista>(null)
  // Cuántas se dibujan: vuelve a la primera tanda cuando cambia lo que se mira (la tanda es de ESA mirada).
  const [tanda, setTanda] = useState({ de: '', n: DE_A })
  const [prefs, setPrefsState] = useState<Prefs>(() => normalizarPrefs(marca, typeof window === 'undefined' ? null : leerPrefsDeLista(lista, usuario)))
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  // La de otra pestaña se abre sola (con o sin la fila: el libro de la prenda lo lee la ficha).
  const [ficha, setFicha] = useState<{ marca: MarcaErp; prenda: PrendaAbierta } | null>(() => (pedida ? { marca: pedida.marca, prenda: { producto: pedida.producto, talle: pedida.talle, fila: null } } : null))

  // Otra marca ⇒ otras columnas (los depósitos): `Erp` monta la pestaña de nuevo (key) y se leen las suyas.
  const setPrefs = (p: Prefs) => { setPrefsState(p); guardarPrefsDeLista(lista, usuario, p) }

  const [vuelta, setVuelta] = useState(0)
  const clave = `${marca}|${vuelta}`
  useEffect(() => {
    let vivo = true
    leerListaDeStock(marca)
      .then((d) => { if (vivo) { setDatos({ ...d, clave }); setSeleccion(new Set()); setError(null) } })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : 'No se pudo leer el stock.'); setDatos((x) => (x ? { ...x, clave } : x)) } })
    return () => { vivo = false }
  }, [marca, clave])
  const cargando = datos?.clave !== clave

  const base = useMemo(() => filtrar(datos?.filas ?? [], { q, linea }), [datos, q, linea])
  const conteo = useMemo(() => contarVistas(base), [base])
  const enVista = useMemo(() => filtrar(base, { vista }), [base, vista])
  const filas: FilaStock[] = useMemo(() => ordenar(enVista, orden), [enVista, orden])
  const res = useMemo(() => resumen(enVista), [enVista])
  const elegidas = filas.filter((f) => seleccion.has(f.id))
  const mirada = `${vista}|${q}|${linea}|${orden?.col ?? ''}|${orden?.dir ?? ''}`
  const mostrar = tanda.de === mirada ? tanda.n : DE_A

  const abrir = (f: FilaStock) => setFicha({ marca, prenda: { producto: f.producto, talle: f.talle, fila: f } })
  const aAjustar = (f: FilaStock): PrendaAAjustar => ({ linea: f.linea, producto: f.producto, talle: f.talle, sku: f.sku, barcode: f.barcode, nombre: f.nombre, talleNombre: f.talleNombre })
  // La de otra pestaña llega sin fila: cuando está la lista, la toma de ahí (lo apartado por pedidos sale de la fila).
  const filaDeFicha = ficha && (ficha.prenda.fila ?? (ficha.marca === marca ? datos?.filas.find((x) => x.producto === ficha.prenda.producto && x.talle === ficha.prenda.talle) ?? null : null))

  const columnas = prefs.visibles.map((k) => {
    const [titulo, ancho, ordena] = COLUMNAS[k]
    return { key: k, titulo, ancho, ordena, derecha: ['disp', 'est', 'ped', 'gn'].includes(k) || k.startsWith('dep:') }
  })
  const numero = (n: number, fuerte = false) => <span style={{ fontWeight: fuerte ? 700 : 500, color: n < 0 ? 'var(--mo-danger-ink)' : n === 0 ? color.mut2 : color.ink }}>{n}</span>

  const celda = (f: FilaStock, k: string): React.ReactNode => {
    if (k === 'p') return <span title={f.nombre} style={estiloNombre}>{f.nombre}</span>
    if (k === 't') return <span title={f.talleNombre} style={{ color: color.ink2 }}>{f.talleNombre}</span>
    if (k === 'sku') return <span style={{ color: color.mut }}>{f.sku ?? '—'}</span>
    if (k === 'disp') return <BarraNivel n={f.disponible}>{numero(f.disponible, true)}</BarraNivel>
    if (k === 'est') return numero(f.estanteria)
    if (k.startsWith('dep:')) return numero(f.deps[k.slice(4)] ?? 0)
    if (k === 'ped') return f.enPedidos ? <span style={{ color: 'var(--mo-warning-ink)' }} title="Apartadas por pedidos de Tienda Nube sin pagar">{f.enPedidos}</span> : <span style={{ color: color.mut2 }}>—</span>
    if (k === 'gn') return <span style={{ color: f.gn != null && f.gn !== f.estanteria ? 'var(--mo-warning-ink)' : color.mut }} title={f.gn != null && f.gn !== f.estanteria ? 'Gestión Nube dice otro número que el ERP' : undefined}>{f.gn ?? '—'}</span>
    if (k === 'ult') return f.ultimo ? <span style={{ color: color.mut }} title={f.ultimo.ref ?? undefined}>{(NOMBRE_TIPO as Record<string, string>)[f.ultimo.tipo] ?? f.ultimo.tipo} · {cuandoCorto(f.ultimo.cuando)}</span> : <span style={{ color: color.mut2 }}>—</span>
    if (k === 'linea') return <span style={{ color: color.ink2 }}>{LINEA[f.linea] ?? f.linea}</span>
    return null
  }

  const acciones = (f: FilaStock) => {
    const menu: AccionMenu[] = [
      { key: 'ficha', label: 'Abrir la ficha', icono: 'abrir', onClick: () => abrir(f) },
      { key: 'ajustar', label: 'Ajustar', icono: 'conteo', onClick: () => ajustar(aAjustar(f)), hint: 'Abre «Nuevo ajuste» con este producto.' },
      { key: 'repo', label: 'Transferir en el monitor ↗', icono: 'abrir', onClick: () => window.open('/reposicion', '_blank', 'noopener') },
      { key: 'etiq', label: 'Etiquetas en el monitor ↗', icono: 'abrir', onClick: () => window.open('/etiquetas', '_blank', 'noopener') },
    ]
    return (
      <>
        <IconoFila label="Ajustar" onClick={() => ajustar(aAjustar(f))}><Icono nombre="conteo" size={16} /></IconoFila>
        <MenuAcciones acciones={menu} etiqueta={`Más acciones del producto ${f.nombre} ${f.talleNombre}`} vertical alinear="izquierda" />
      </>
    )
  }

  const nombreVista = VISTAS.find(([k]) => k === vista)?.[1] ?? ''
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {/* El título «Stock» lo pone el menú del ERP (`Erp.tsx`) arriba de las pestañas. */}
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {!!datos?.sinVariante && <Notice tone="warning">{u(datos.sinVariante)} de pedidos sin pagar traen un código que {linea === 'stunned' ? 'el ERP' : 'Gestión Nube'} no tiene: no se descuentan de ningún producto.</Notice>}

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
        <TileResumen titulo="Disponible" valor={u(res.disponible)} oscuro nota="lo que se puede vender" />
        <TileResumen titulo="Físico" valor={u(res.estanteria)} nota={res.enPedidos ? `${res.enPedidos.toLocaleString('es-AR')} apartadas por pedidos sin pagar` : 'ninguna apartada por pedidos'} />
        {/* Los negativos se cuentan sobre todo lo buscado (⛔ sólo la vista): si no, el número no es el de la vista «Negativos». */}
        <TileResumen tono={tonoDeConteo(conteo.neg)} titulo="Negativos" valor={(conteo.neg ?? 0).toLocaleString('es-AR')} nota={conteo.neg ? 'para revisar' : 'ninguna'} />
        <TileResumen titulo="Productos" valor={res.prendas.toLocaleString('es-AR')} nota={nombreVista.toLowerCase()} />
      </div>

      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <VistasLista vistas={VISTAS} valor={vista} conteo={conteo} onCambio={(k) => { setVista(k); setSeleccion(new Set()) }} />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar en el stock" placeholder="Nombre, código o código de barras" />
          <PanelColumnas
            columnas={prefs.orden.map((k) => ({ key: k, titulo: COLUMNAS[k][0], visible: prefs.visibles.includes(k), fija: COLUMNAS[k][3] }))}
            onAlternar={(k) => setPrefs(alternarColumna(marca, prefs, k))}
            onMover={(k, d) => setPrefs(moverColumna(prefs, k, d))}
            onRestablecer={() => setPrefs({ ...normalizarPrefs(marca, null) })}
          />
          <Button variant="outline" disabled={cargando} onClick={() => setVuelta((n) => n + 1)}>{cargando ? 'Leyendo…' : 'Actualizar'}</Button>
          {irA && (
            <span style={{ marginLeft: 'auto', display: 'flex', gap: space[2] }}>
              <Button variant="soft" tone="brand" onClick={() => irA('ajustes', 'ajustes')}>Nuevo ajuste</Button>
              <Button variant="soft" tone="info" onClick={() => irA('transferencias', 'mover')}>Mover</Button>
            </span>
          )}
        </div>
        <ListaTrabajo
          columnas={columnas} filas={filas.slice(0, mostrar)} claveDe={(f) => f.id} celda={celda} acciones={acciones} anchoAcciones={72}
          seleccion={seleccion} onSeleccion={setSeleccion} orden={orden} onOrden={setOrden}
          activa={filaDeFicha?.id ?? null} onAbrir={abrir} etiquetaFila={(f) => `el producto ${f.nombre} ${f.talleNombre}`}
          vacio={!cargando && datos ? (
            <div style={{ padding: space[6] }}>
              <EmptyState title={q ? 'No hay productos con ese nombre o código.' : 'No hay productos en esta vista.'} />
              {vista !== 'todo' && <div style={{ textAlign: 'center' }}><Button variant="outline" onClick={() => setVista('todo')}>Ver todo</Button></div>}
            </div>
          ) : null}
        />
        {filas.length > mostrar && (
          <div style={{ padding: 12, textAlign: 'center', borderTop: `1px solid ${color.bg2}` }}>
            <Button variant="outline" onClick={() => setTanda({ de: mirada, n: mostrar + DE_A })}>Mostrar {Math.min(DE_A, filas.length - mostrar).toLocaleString('es-AR')} más</Button>
          </div>
        )}
        <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
          {cargando && !datos ? 'Leyendo el stock…' : `${Math.min(mostrar, filas.length).toLocaleString('es-AR')} de ${filas.length.toLocaleString('es-AR')}`}
          {datos && <> · el ERP llega hasta {cuandoCorto(datos.libroHasta)} · {datos.pedidos.toLocaleString('es-AR')} pedidos sin pagar{datos.pedidosLeidosEn ? `, leídos ${cuandoCorto(datos.pedidosLeidosEn)}` : ''}</>}
        </div>
      </div>

      <BarraSeleccion cuantas={elegidas.length} onSoltar={() => setSeleccion(new Set())}>
        <span style={{ color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>{u(elegidas.reduce((a, f) => a + Math.max(0, f.disponible), 0))} disponibles</span>
        <AccionSeleccion icono="bajar" onClick={() => bajarCsv(elegidas, marca, COLUMNAS)}>Exportar las elegidas</AccionSeleccion>
      </BarraSeleccion>

      {ficha && (
        <FichaPrenda
          key={`${ficha.marca}/${ficha.prenda.producto}/${ficha.prenda.talle}`} marca={ficha.marca} prenda={{ ...ficha.prenda, fila: filaDeFicha ?? null }}
          onCerrar={() => setFicha(null)} ajustar={ajustar}
        />
      )}
    </div>
  )
}
