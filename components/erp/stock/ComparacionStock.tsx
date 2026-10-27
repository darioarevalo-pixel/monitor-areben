'use client'

/**
 * ERP › Stock › Comparación con TN y ML, con el molde del diseño (`~/Documents/erp-monitor/diseno.md` §3 y §7; tablero 3
 * del v8): por variante, lo que la tienda tendría que mostrar según el ERP contra lo que muestra Tienda Nube, con GN al
 * lado y «Qué pasa» (las palabras de Conciliación). De SÓLO LECTURA: el arreglo lo hace GN (hoy) o el monitor, ⛔ el ERP.
 * Núcleo puro: `lib/erp/comparacion.core.js`; servidor: `api/_erp-stock.js` (`vista=comparacion`).
 *
 * 🔑 Arranca por «No coinciden», con la tienda que muestra DE MÁS arriba (lo que se puede vender sin tenerlo).
 * 🔴 Mercado Libre ⛔ se compara todavía (el motor ⛔ guarda lo publicado): la pantalla lo dice y manda a Conciliación.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, Notice, Select, color, font, space } from '@/components/ui'
import type { Tone } from '@/components/ui/tokens'
import { ListaTrabajo, type OrdenLista } from '@/components/ui/ListaTrabajo'
import { PanelColumnas } from '@/components/ui/PanelColumnas'
import { AccionSeleccion, BarraSeleccion } from '@/components/ui/FichaCostado'
import { BuscadorLista, ChipEstado, InterruptorDensidad, TileResumen, VistasLista, cuandoCorto } from '@/components/ui/PiezasLista'
import { leerComparacion, type ComparacionTiendas, type FilaComparacion, type MarcaErp } from '@/lib/erp/cliente'
import {
  COLUMNAS, QUE_PASA, VISTAS, alternarColumna, contarVistas, filtrar, moverColumna, normalizarPrefs, ordenar, resumen,
} from '@/lib/erp/comparacion.core.js'
import { guardarPrefsDeLista, leerPrefsDeLista } from '@/lib/erp/lista-prefs'
import { diaArgentino } from '@/lib/envios/portal.core.js'
import { FichaPrenda } from './FichaPrenda'
import type { PrendaAAjustar } from './StockErp'

type Prefs = { orden: string[]; visibles: string[]; densidad: 'compacta' | 'comoda' }

const ANCHO_SELECT: React.CSSProperties = { cursor: 'pointer', width: 'auto', flex: '0 0 auto' }
const TIENDA: Record<string, string> = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }
const DE_A = 300
const QUE = QUE_PASA as Record<string, { nombre: string; mirar: string }>
/** El tono del chip: la tienda que muestra de más es lo que se vende sin tenerlo. */
const tono = (f: FilaComparacion): Tone => (f.clase === 'coincide' ? 'success' : f.clase === 'no_publicada' ? 'neutral' : f.diferencia != null && f.diferencia > 0 ? 'danger' : 'warning')

function bajarCsv(filas: FilaComparacion[], marca: MarcaErp) {
  const c = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`
  const renglones = [['Producto', 'Variante', 'código', 'Tienda', 'Según el ERP', 'Tienda Nube', 'Diferencia', 'En Gestión Nube', 'Reservado', 'Qué pasa'].map(c).join(';')]
  for (const f of filas) renglones.push([f.nombre, f.talleNombre, f.sku, TIENDA[f.tienda], f.paraTienda ?? '', f.tn ?? '', f.diferencia ?? '', f.gn ?? '', f.enPedidos, QUE[f.clase]?.nombre ?? f.clase].map(c).join(';'))
  const url = URL.createObjectURL(new Blob(['﻿' + renglones.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `comparacion-tn-${marca}-${diaArgentino(Date.now())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function ComparacionStock({ ajustar, irAConciliacion }: { ajustar: (p: PrendaAAjustar) => void; irAConciliacion: () => void }) {
  const { marca: delShell, perfil } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const usuario = perfil?.name ?? null
  const lista = 'erp-comparacion'
  const [datos, setDatos] = useState<(ComparacionTiendas & { clave: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState('no')
  const [q, setQ] = useState('')
  const [tienda, setTienda] = useState('')
  const [orden, setOrden] = useState<OrdenLista>(null)
  const [tanda, setTanda] = useState({ de: '', n: DE_A })
  const [prefs, setPrefsState] = useState<Prefs>(() => normalizarPrefs(typeof window === 'undefined' ? null : leerPrefsDeLista(lista, usuario)))
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [ficha, setFicha] = useState<FilaComparacion | null>(null)
  const setPrefs = (p: Prefs) => { setPrefsState(p); guardarPrefsDeLista(lista, usuario, p) }

  const [vuelta, setVuelta] = useState(0)
  const clave = `${marca}|${vuelta}`
  useEffect(() => {
    let vivo = true
    leerComparacion(marca)
      .then((d) => { if (vivo) { setDatos({ ...d, clave }); setSeleccion(new Set()); setError(null) } })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : 'No se pudo leer la comparación.'); setDatos((x) => (x ? { ...x, clave } : x)) } })
    return () => { vivo = false }
  }, [marca, clave])
  const cargando = datos?.clave !== clave

  const base = useMemo(() => filtrar(datos?.filas ?? [], { q, tienda }), [datos, q, tienda])
  const conteo = useMemo(() => contarVistas(base), [base])
  const enVista = useMemo(() => filtrar(base, { vista }), [base, vista])
  const filas: FilaComparacion[] = useMemo(() => ordenar(enVista, orden), [enVista, orden])
  const res = useMemo(() => resumen(base), [base])
  const elegidas = filas.filter((f) => seleccion.has(f.id))
  const mirada = `${vista}|${q}|${tienda}|${orden?.col ?? ''}|${orden?.dir ?? ''}`
  const mostrar = tanda.de === mirada ? tanda.n : DE_A

  const columnas = prefs.visibles.map((k) => {
    const [titulo, ancho, ordena] = COLUMNAS[k as keyof typeof COLUMNAS]
    return { key: k, titulo, ancho, ordena: !!ordena, derecha: ['para', 'tn', 'dif', 'gn', 'ped'].includes(k) }
  })
  const num = (n: number | null, fuerte = false) => (n == null ? <span style={{ color: color.mut2 }}>—</span> : <span style={{ fontWeight: fuerte ? 700 : 500, color: n === 0 ? color.mut2 : color.ink }}>{n}</span>)

  const celda = (f: FilaComparacion, k: string): React.ReactNode => {
    if (k === 'p') return <b title={f.nombre} style={{ color: color.ink }}>{f.nombre}{f.oculta && <span style={{ color: color.mut, fontWeight: 400 }}> · oculto en Tienda Nube</span>}</b>
    if (k === 't') return <span style={{ color: color.ink2 }}>{f.talleNombre}</span>
    if (k === 'sku') return <span style={{ color: color.mut }}>{f.sku ?? f.barcode ?? '—'}</span>
    if (k === 'tienda') return <span style={{ color: color.ink2 }}>{TIENDA[f.tienda]}</span>
    if (k === 'para') return num(f.paraTienda, true)
    if (k === 'tn') return num(f.tn, true)
    if (k === 'gn') return <span style={{ color: f.gn != null && f.gn !== f.paraTienda ? 'var(--mo-warning-ink)' : color.mut }}>{f.gn ?? '—'}</span>
    if (k === 'ped') return f.enPedidos ? <span style={{ color: 'var(--mo-warning-ink)' }} title="Apartadas por pedidos de Tienda Nube sin pagar">{f.enPedidos}</span> : <span style={{ color: color.mut2 }}>—</span>
    if (k === 'dif') {
      if (!f.diferencia) return <span style={{ color: color.mut2 }}>—</span>
      return <span style={{ fontWeight: 700, color: f.diferencia > 0 ? 'var(--mo-danger-ink)' : 'var(--mo-warning-ink)' }} title={f.diferencia > 0 ? 'La tienda muestra de más: se puede vender sin tenerlo' : 'La tienda muestra de menos: se deja de vender'}>{f.diferencia > 0 ? `+${f.diferencia}` : f.diferencia}</span>
    }
    if (k === 'que') return <span title={QUE[f.clase]?.mirar}><ChipEstado mapa={{ x: [tono(f), QUE[f.clase]?.nombre ?? f.clase] }} k="x" />{f.repetidas > 0 && <span style={{ color: color.mut }}> · repetida en Tienda Nube</span>}</span>
    return null
  }

  const abrir = (f: FilaComparacion) => setFicha(f)
  const leidas = Object.entries(datos?.tnLeidas ?? {}).filter(([t]) => (marca === 'bdi' ? t === 'bdi' : t !== 'bdi'))
  const nombreVista = VISTAS.find(([k]) => k === vista)?.[1] ?? ''
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <p style={{ margin: 0, color: color.mut }}>Por variante: lo que la tienda tendría que mostrar según el ERP (sus depósitos, menos lo apartado por pedidos sin pagar) contra lo que muestra. Arranca con las que no coinciden.</p>
      <Notice tone="warning">Hoy el stock de la tienda lo manda <b>Gestión Nube</b>: si Gestión Nube y la tienda coinciden y el ERP no, lo que hay que mirar es el ERP. Esta pantalla no arregla nada: dice qué no coincide.</Notice>
      <Notice tone="neutral">
        <b>Mercado Libre todavía no se compara acá</b>: el ERP no guarda lo publicado en Mercado Libre.
        {datos?.ml ? <> La conciliación del {datos.ml.fecha.split('-').reverse().slice(0, 2).join('/')} encontró {datos.ml.noCierran} publicaciones que no coinciden. <Button variant="outline" onClick={irAConciliacion}>Ver en Conciliación</Button></> : ' Las que no coinciden salen una vez por día en Conciliación.'}
      </Notice>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
        <TileResumen titulo="No coinciden" valor={res.noCoinciden.toLocaleString('es-AR')} oscuro nota={`de ${res.comparadas.toLocaleString('es-AR')} variantes publicadas`} />
        <TileResumen titulo="Muestra de más" valor={res.deMas.toLocaleString('es-AR')} nota={res.uMas ? `${res.uMas.toLocaleString('es-AR')} u que se pueden vender sin tenerlas` : 'ninguna'} />
        <TileResumen titulo="Muestra de menos" valor={res.deMenos.toLocaleString('es-AR')} nota={res.uMenos ? `${res.uMenos.toLocaleString('es-AR')} u que se dejan de vender` : 'ninguna'} />
        <TileResumen titulo="Tienda Nube leída" valor={leidas.length ? cuandoCorto(leidas.map(([, l]) => l).sort()[0]) : '—'} nota="se lee cada 2 horas" />
      </div>

      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <VistasLista vistas={VISTAS} valor={vista} conteo={conteo} onCambio={(k) => { setVista(k); setSeleccion(new Set()) }} />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar en la comparación" placeholder="Producto o código de barras" />
          {marca === 'zattia' && <Select aria-label="Tienda" style={ANCHO_SELECT} value={tienda} onChange={(e) => setTienda(e.target.value)}><option value="">Zattia y Stunned</option><option value="zattia">Zattia</option><option value="stunned">Stunned</option></Select>}
          <InterruptorDensidad valor={prefs.densidad} onCambio={(d) => setPrefs({ ...prefs, densidad: d })} />
          <PanelColumnas
            columnas={prefs.orden.map((k) => ({ key: k, titulo: COLUMNAS[k as keyof typeof COLUMNAS][0], visible: prefs.visibles.includes(k), fija: !!COLUMNAS[k as keyof typeof COLUMNAS][3] }))}
            onAlternar={(k) => setPrefs(alternarColumna(prefs, k))}
            onMover={(k, d) => setPrefs(moverColumna(prefs, k, d))}
            onRestablecer={() => setPrefs({ ...normalizarPrefs(null), densidad: prefs.densidad })}
          />
          <Button variant="outline" disabled={!filas.length} onClick={() => bajarCsv(filas, marca)}>Exportar</Button>
          <Button variant="outline" disabled={cargando} onClick={() => setVuelta((n) => n + 1)}>{cargando ? 'Leyendo…' : 'Actualizar'}</Button>
        </div>
        <ListaTrabajo
          columnas={columnas} filas={filas.slice(0, mostrar)} claveDe={(f) => f.id} celda={celda}
          seleccion={seleccion} onSeleccion={setSeleccion} orden={orden} onOrden={setOrden} densidad={prefs.densidad}
          activa={ficha?.id ?? null} onAbrir={abrir} etiquetaFila={(f) => `el producto ${f.nombre} ${f.talleNombre}`}
          vacio={!cargando && datos ? (
            <div style={{ padding: space[6] }}>
              <EmptyState title={q ? 'No hay productos con ese nombre o código.' : vista === 'no' ? 'Todo coincide con la tienda.' : 'No hay productos en esta vista.'} />
              {vista !== 'todas' && <div style={{ textAlign: 'center' }}><Button variant="outline" onClick={() => setVista('todas')}>Ver todas</Button></div>}
            </div>
          ) : null}
        />
        {filas.length > mostrar && (
          <div style={{ padding: 12, textAlign: 'center', borderTop: `1px solid ${color.bg2}` }}>
            <Button variant="outline" onClick={() => setTanda({ de: mirada, n: mostrar + DE_A })}>Mostrar {Math.min(DE_A, filas.length - mostrar).toLocaleString('es-AR')} más</Button>
          </div>
        )}
        <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
          {cargando && !datos ? 'Leyendo la comparación…' : `${Math.min(mostrar, filas.length).toLocaleString('es-AR')} de ${filas.length.toLocaleString('es-AR')} · ${nombreVista.toLowerCase()}`}
          {datos && <> · el ERP llega hasta {cuandoCorto(datos.libroHasta)}{leidas.map(([t, l]) => ` · ${TIENDA[t]} leída ${cuandoCorto(l)}`).join('')}</>}
          {' '}· el arreglo lo hace Gestión Nube o el monitor, no el ERP
        </div>
      </div>

      <BarraSeleccion cuantas={elegidas.length} onSoltar={() => setSeleccion(new Set())}>
        <AccionSeleccion icono="bajar" onClick={() => bajarCsv(elegidas, marca)}>Exportar las elegidas</AccionSeleccion>
      </BarraSeleccion>

      {ficha?.producto && ficha.talle && (
        <FichaPrenda key={ficha.id} marca={marca} prenda={{ producto: ficha.producto, talle: ficha.talle, fila: null }} onCerrar={() => setFicha(null)} ajustar={ajustar} />
      )}
      {ficha && !ficha.producto && (
        <Notice tone="warning" onClose={() => setFicha(null)}>
          <b>{ficha.nombre} {ficha.talleNombre}</b> (SKU {ficha.sku ?? '—'}, código {ficha.barcode ?? '—'}): {QUE.sin_variante.mirar}
        </Notice>
      )}
    </div>
  )
}
