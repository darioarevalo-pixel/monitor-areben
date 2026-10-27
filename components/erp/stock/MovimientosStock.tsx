'use client'

/**
 * ERP › Stock › Movimientos, con el molde del diseño aprobado (`~/Documents/erp-monitor/diseno.md` §3, §4 y §7; tablero 3
 * del v8): la lista de REGISTRO del libro de stock — todo lo que movió stock, con lo que quedó después y el documento que
 * lo explica. Nada se borra. Vistas con su número, período, buscador, resumen ARRIBA, columnas por usuario y «Exportar».
 * Clic en la fila ⇒ la ficha de la PRENDA al costado (`FichaPrenda`, la misma de Stock › Stock).
 * Núcleo puro: `lib/erp/movimientos.core.js`; servidor: `api/_erp-stock.js` (`vista=movimientos`).
 *
 * 🔑 Botones (§4, lista de REGISTRO): sólo «⋯» a la izquierda. Hoy todo corre en paralelo con GN.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, MenuAcciones, Notice, Select, color, font, space, weight, type AccionMenu } from '@/components/ui'
import { ListaTrabajo, type OrdenLista } from '@/components/ui/ListaTrabajo'
import { PanelColumnas } from '@/components/ui/PanelColumnas'
import { AccionSeleccion, BarraSeleccion } from '@/components/ui/FichaCostado'
import { BuscadorLista, InterruptorDensidad, TileResumen, VistasLista, cuandoCorto } from '@/components/ui/PiezasLista'
import { leerMovimientos, type FilaMovimiento, type ListaDeMovimientos, type MarcaErp } from '@/lib/erp/cliente'
import {
  COLUMNAS, NOMBRE_LINEA, PERIODOS_MOV, VISTAS, alternarColumna, contarVistas, filtrar, moverColumna, normalizarPrefs, ordenar,
  rangoDeMovimientos, resumen,
} from '@/lib/erp/movimientos.core.js'
import { NOMBRE_DEPOSITO } from '@/lib/erp/stock.core.js'
import { guardarPrefsDeLista, leerPrefsDeLista } from '@/lib/erp/lista-prefs'
import { diaArgentino } from '@/lib/envios/portal.core.js'
import { FichaPrenda } from './FichaPrenda'
import type { PrendaAAjustar } from './StockErp'

type Prefs = { orden: string[]; visibles: string[]; densidad: 'compacta' | 'comoda' }

const ANCHO_SELECT: React.CSSProperties = { cursor: 'pointer', width: 'auto', flex: '0 0 auto' }
const LINEA = NOMBRE_LINEA as Record<string, string>
const DEPOSITOS: Record<MarcaErp, string[]> = { zattia: ['local', 'deposito'], bdi: ['local', 'deposito_minorista', 'deposito_mayorista'] }
/** Cuántas filas se dibujan de una (la lista ⛔ es virtual). */
const DE_A = 300
const u = (n: number) => `${n.toLocaleString('es-AR')} u`
const conSigno = (n: number) => (n > 0 ? `+${n}` : String(n))

function bajarCsv(filas: FilaMovimiento[], marca: MarcaErp, desde: string, hasta: string) {
  const c = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`
  const renglones = [['Cuándo', 'Tipo', 'Producto', 'Variante', 'código', 'Dónde', 'Cantidad', 'Queda', 'Documento', 'Quién', 'Línea'].map(c).join(';')]
  for (const f of filas) renglones.push([cuandoCorto(f.cuando), f.tipoTexto, f.nombre, f.talleNombre, f.sku, f.depositoTexto, f.cantidad, f.queda, f.documento, f.quien, LINEA[f.linea] ?? f.linea].map(c).join(';'))
  const url = URL.createObjectURL(new Blob(['﻿' + renglones.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `movimientos-${marca}-${desde}${hasta !== desde ? `-a-${hasta}` : ''}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function MovimientosStock({ ajustar }: { ajustar: (p: PrendaAAjustar) => void }) {
  const { marca: delShell, perfil } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const usuario = perfil?.name ?? null
  const lista = 'erp-movimientos'
  const [periodo, setPeriodo] = useState('hoy')
  const [datos, setDatos] = useState<(ListaDeMovimientos & { clave: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState('todos')
  const [q, setQ] = useState('')
  const [linea, setLinea] = useState('')
  const [deposito, setDeposito] = useState('')
  const [orden, setOrden] = useState<OrdenLista>(null)
  const [tanda, setTanda] = useState({ de: '', n: DE_A })
  const [prefs, setPrefsState] = useState<Prefs>(() => normalizarPrefs(typeof window === 'undefined' ? null : leerPrefsDeLista(lista, usuario)))
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [ficha, setFicha] = useState<FilaMovimiento | null>(null)
  const setPrefs = (p: Prefs) => { setPrefsState(p); guardarPrefsDeLista(lista, usuario, p) }

  const [vuelta, setVuelta] = useState(0)
  const clave = `${marca}|${periodo}|${vuelta}`
  useEffect(() => {
    let vivo = true
    // El día se toma al leer (⛔ en el render): «Hoy» es el de cuando se apretó.
    const { desde, hasta } = rangoDeMovimientos(clave.split('|')[1], diaArgentino(Date.now()))
    leerMovimientos(marca, desde, hasta)
      .then((d) => { if (vivo) { setDatos({ ...d, clave }); setSeleccion(new Set()); setError(null) } })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : 'No se pudieron leer los movimientos.'); setDatos((x) => (x ? { ...x, clave } : x)) } })
    return () => { vivo = false }
  }, [marca, clave])
  const cargando = datos?.clave !== clave

  const base = useMemo(() => filtrar(datos?.filas ?? [], { q, linea, deposito }), [datos, q, linea, deposito])
  const conteo = useMemo(() => contarVistas(base), [base])
  const enVista = useMemo(() => filtrar(base, { vista }), [base, vista])
  const filas: FilaMovimiento[] = useMemo(() => ordenar(enVista, orden), [enVista, orden])
  const res = useMemo(() => resumen(enVista), [enVista])
  const elegidas = filas.filter((f) => seleccion.has(f.id))
  const mirada = `${clave}|${vista}|${q}|${linea}|${deposito}|${orden?.col ?? ''}|${orden?.dir ?? ''}`
  const mostrar = tanda.de === mirada ? tanda.n : DE_A
  const nombrePeriodo = (PERIODOS_MOV.find(([k]) => k === periodo)?.[1] ?? '').toLowerCase()

  const aAjustar = (f: FilaMovimiento): PrendaAAjustar => ({ linea: f.linea, producto: f.producto, talle: f.talle, sku: f.sku, barcode: f.barcode, nombre: f.nombre, talleNombre: f.talleNombre })
  const columnas = prefs.visibles.map((k) => {
    const [titulo, ancho, ordena] = COLUMNAS[k]
    return { key: k, titulo, ancho, ordena, derecha: k === 'cant' || k === 'queda' }
  })

  const celda = (f: FilaMovimiento, k: string): React.ReactNode => {
    if (k === 'h') return <span style={{ color: color.mut }} title={f.horaExacta ? undefined : 'La fuente sólo sabe el día'}>{f.horaExacta ? cuandoCorto(f.cuando) : `${cuandoCorto(f.cuando).slice(0, 5)} · día`}</span>
    if (k === 'tipo') return <span style={{ color: color.ink2 }}>{f.tipoTexto}</span>
    if (k === 'p') return <span title={`${f.nombre} · ${f.talleNombre}`}><b style={{ color: color.ink }}>{f.nombre}</b> <span style={{ color: color.mut }}>{f.talleNombre}</span></span>
    if (k === 'sku') return <span style={{ color: color.mut }}>{f.sku ?? '—'}</span>
    if (k === 'dep') return <span style={{ color: color.ink2 }}>{f.depositoTexto}</span>
    if (k === 'cant') return <b style={{ color: f.cantidad > 0 ? 'var(--mo-success-ink)' : 'var(--mo-danger-ink)', fontVariantNumeric: 'tabular-nums' }}>{conSigno(f.cantidad)}</b>
    if (k === 'queda') return <span style={{ fontVariantNumeric: 'tabular-nums', color: f.queda < 0 ? 'var(--mo-danger-ink)' : color.ink }}>{f.queda}</span>
    if (k === 'doc') return <span style={{ color: color.ink2 }} title={f.documento}>{f.documento}</span>
    if (k === 'quien') return <span title={f.quienDe === 'sistema' ? 'El ERP no guarda quién: es el sistema de donde vino' : undefined} style={{ color: f.quienDe === 'sistema' ? color.mut2 : color.ink2, fontStyle: f.quienDe === 'sistema' ? 'italic' : undefined }}>{f.quien}</span>
    if (k === 'linea') return <span style={{ color: color.ink2 }}>{LINEA[f.linea] ?? f.linea}</span>
    return null
  }

  const acciones = (f: FilaMovimiento) => {
    const menu: AccionMenu[] = [
      { key: 'ficha', label: 'Abrir la ficha del producto', icono: 'abrir', onClick: () => setFicha(f) },
      { key: 'ajustar', label: 'Ajustar el producto', icono: 'conteo', onClick: () => ajustar(aAjustar(f)), hint: 'Abre «Nuevo ajuste» con este producto.' },
    ]
    return <MenuAcciones acciones={menu} etiqueta={`Más acciones del movimiento de ${f.nombre} ${f.talleNombre}`} vertical alinear="izquierda" />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: color.mut, flex: '1 1 320px' }}>Todo lo que movió stock, con lo que quedó después y el documento que lo explica. Nada se borra.</p>
        <Button disabled={!filas.length} onClick={() => datos && bajarCsv(filas, marca, datos.desde, datos.hasta)}>Exportar</Button>
      </div>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {datos?.cortado && <Notice tone="warning">Son más de {datos.filas.length.toLocaleString('es-AR')} movimientos: se ven los más nuevos. Elegí un período más corto.</Notice>}

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
        <TileResumen titulo="Movimientos" valor={res.movimientos.toLocaleString('es-AR')} oscuro nota={nombrePeriodo} />
        <TileResumen titulo="Entraron" valor={u(res.entraron)} nota="ingresos, anulaciones y ajustes" />
        <TileResumen titulo="Salieron" valor={u(res.salieron)} nota={`${u(res.vendidas)} vendidas`} />
        <TileResumen titulo="Transferidas" valor={u(res.transferidas)} nota="de un lugar a otro" />
      </div>

      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <VistasLista vistas={VISTAS} valor={vista} conteo={conteo} onCambio={(k) => { setVista(k); setSeleccion(new Set()) }} />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar en los movimientos" placeholder="Producto, código, documento o quién" />
          <Select aria-label="Período" style={ANCHO_SELECT} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {PERIODOS_MOV.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </Select>
          <Select aria-label="Dónde" style={ANCHO_SELECT} value={deposito} onChange={(e) => setDeposito(e.target.value)}>
            <option value="">Todos los lugares</option>
            {DEPOSITOS[marca].map((d) => <option key={d} value={d}>{(NOMBRE_DEPOSITO as Record<string, string>)[d] ?? d}</option>)}
          </Select>
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
          columnas={columnas} filas={filas.slice(0, mostrar)} claveDe={(f) => f.id} celda={celda} acciones={acciones} anchoAcciones={44}
          seleccion={seleccion} onSeleccion={setSeleccion} orden={orden} onOrden={setOrden} densidad={prefs.densidad}
          activa={ficha?.id ?? null} onAbrir={setFicha} etiquetaFila={(f) => `el movimiento de ${f.nombre} ${f.talleNombre}`}
          vacio={!cargando && datos ? (
            <div style={{ padding: space[6] }}>
              <EmptyState title={q ? 'No hay movimientos con ese producto, documento o persona.' : `No hay movimientos ${vista === 'todos' ? '' : 'de esta vista '}${nombrePeriodo === 'hoy' || nombrePeriodo === 'ayer' ? nombrePeriodo : `en ${nombrePeriodo}`}.`} />
              {periodo !== '7d' && <div style={{ textAlign: 'center' }}><Button variant="outline" onClick={() => setPeriodo('7d')}>Ver los últimos 7 días</Button></div>}
            </div>
          ) : null}
        />
        {filas.length > mostrar && (
          <div style={{ padding: 12, textAlign: 'center', borderTop: `1px solid ${color.bg2}` }}>
            <Button variant="outline" onClick={() => setTanda({ de: mirada, n: mostrar + DE_A })}>Mostrar {Math.min(DE_A, filas.length - mostrar).toLocaleString('es-AR')} más</Button>
          </div>
        )}
        <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
          {cargando && !datos ? 'Leyendo los movimientos…' : `${Math.min(mostrar, filas.length).toLocaleString('es-AR')} de ${filas.length.toLocaleString('es-AR')}`}
          {datos?.libroHasta && <> · el ERP llega hasta {cuandoCorto(datos.libroHasta)}</>}
          {' · '}<span style={{ fontWeight: weight.medium }}>Queda</span> = lo que quedó del producto en ese lugar después del movimiento.
        </div>
      </div>

      <BarraSeleccion cuantas={elegidas.length} onSoltar={() => setSeleccion(new Set())}>
        <span style={{ color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>{conSigno(elegidas.reduce((a, f) => a + f.cantidad, 0))} u</span>
        <AccionSeleccion icono="bajar" onClick={() => datos && bajarCsv(elegidas, marca, datos.desde, datos.hasta)}>Exportar los elegidos</AccionSeleccion>
      </BarraSeleccion>

      {ficha && (
        <FichaPrenda
          key={`${ficha.producto}/${ficha.talle}`} marca={marca} prenda={{ producto: ficha.producto, talle: ficha.talle, fila: null }}
          onCerrar={() => setFicha(null)} ajustar={ajustar}
        />
      )}
    </div>
  )
}
