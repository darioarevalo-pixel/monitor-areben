'use client'

/**
 * ERP › Stock › Recepciones, con el molde del diseño aprobado (`~/Documents/erp-monitor/diseno.md` §3 y §7; tablero 3 del
 * v8): cada orden de compra que llegó, con la barrita «recibidas de pedidas». Sólo LEE: las órdenes las manda Ingresos y
 * entran al stock del depósito (⛔ alta de producto acá: nace en Ingresos). Vistas con su número, buscador, resumen ARRIBA,
 * columnas por usuario y «Exportar». Clic en la fila ⇒ la ficha AL COSTADO con los renglones que no cerraron.
 * Núcleo: `lib/erp/recepciones-lista.core.ts`; lee por la puerta de Ingresos (`api/_recepciones.js`, `lib/recepciones/cliente.ts`).
 */

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, MenuAcciones, Notice, color, font, space, weight, type AccionMenu } from '@/components/ui'
import { ListaTrabajo, type OrdenLista } from '@/components/ui/ListaTrabajo'
import { PanelColumnas } from '@/components/ui/PanelColumnas'
import { DatoFicha, DatosFicha, FichaCostado } from '@/components/ui/FichaCostado'
import { BuscadorLista, TileResumen, VistasLista } from '@/components/ui/PiezasLista'
import { leerRecepcion, leerRecepciones, type LineaConCruce } from '@/lib/recepciones/cliente'
import { renglonesQueNoCerraron } from '@/lib/recepciones/core'
import {
  COLUMNAS, COLUMNAS_DE_SIEMPRE, VISTAS, armarFila, contarVistas, filtrar, ordenar, resumen, type FilaRecepcion,
} from '@/lib/erp/recepciones-lista.core'
import { alternarColumnaDe, moverColumna, normalizarPrefsDe } from '@/lib/erp/lista-columnas.core.js'
import { guardarPrefsDeLista, leerPrefsDeLista } from '@/lib/erp/lista-prefs'
import { diaArgentino } from '@/lib/envios/portal.core.js'
import { BarraRecibidas } from './Barritas'

type Prefs = { orden: string[]; visibles: string[] }
type Datos = { filas: FilaRecepcion[]; clave: string; hoy: string }

const DE_A = 300
/** Todas las que hay (al 20-oct, 123 entre las dos marcas; la puerta corta en 500). */
const DIAS = 730
const u = (n: number) => `${n.toLocaleString('es-AR')} u`
const normalizarPrefs = (raw: unknown): Prefs => normalizarPrefsDe(COLUMNAS, COLUMNAS_DE_SIEMPRE, raw)
const abrirIngresos = (oc?: string) => window.open(oc ? `/recepciones?oc=${encodeURIComponent(oc)}` : '/recepciones', '_blank', 'noopener')
const COLOR_ESTADO = { recibida: '#15803d', diferencia: '#b42318', sin_pedido: '#5d6b82' } as const

function bajarCsv(filas: FilaRecepcion[], marca: string) {
  const c = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`
  const renglones = [['Orden', 'Llegó', 'De', 'Va a', 'Pedidas', 'Recibidas', 'Faltaron', 'Sobraron', 'Estado'].map(c).join(';')]
  for (const f of filas) renglones.push([f.oc, f.fecha, f.proveedor ?? '', f.vaA, f.pedidas, f.recibidas, f.faltaron, f.sobraron, f.estadoTexto].map(c).join(';'))
  const url = URL.createObjectURL(new Blob(['﻿' + renglones.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `recepciones-${marca}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function RecepcionesStock() {
  const { marca: delShell, perfil } = useSesion()
  const marca = delShell === 'bdi' ? 'bdi' : 'zattia'
  const usuario = perfil?.name ?? null
  const lista = 'erp-recepciones'
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState('todas')
  const [q, setQ] = useState('')
  const [orden, setOrden] = useState<OrdenLista>(null)
  const [tanda, setTanda] = useState({ de: '', n: DE_A })
  const [prefs, setPrefsState] = useState<Prefs>(() => normalizarPrefs(typeof window === 'undefined' ? null : leerPrefsDeLista(lista, usuario)))
  const [ficha, setFicha] = useState<FilaRecepcion | null>(null)
  const setPrefs = (p: Prefs) => { setPrefsState(p); guardarPrefsDeLista(lista, usuario, p) }

  const [vuelta, setVuelta] = useState(0)
  const clave = `${marca}|${vuelta}`
  useEffect(() => {
    let vivo = true
    leerRecepciones(marca, DIAS)
      // El día se toma al leer (⛔ en el render): «este mes» es el de cuando se leyó.
      .then((d) => { if (vivo) { setDatos({ filas: d.recepciones.map(armarFila), clave, hoy: diaArgentino(Date.now()) }); setError(null) } })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : 'No se pudieron leer los ingresos.'); setDatos((x) => (x ? { ...x, clave } : x)) } })
    return () => { vivo = false }
  }, [marca, clave])
  const cargando = datos?.clave !== clave

  const mes = (datos?.hoy ?? '').slice(0, 7)
  const base = useMemo(() => filtrar(datos?.filas ?? [], { q }), [datos, q])
  const conteo = useMemo(() => contarVistas(base, mes), [base, mes])
  const enVista = useMemo(() => filtrar(base, { vista, mes }), [base, vista, mes])
  const filas = useMemo(() => ordenar(enVista, orden), [enVista, orden])
  const res = useMemo(() => resumen(datos?.filas ?? [], mes), [datos, mes])
  const mirada = `${clave}|${vista}|${q}|${orden?.col ?? ''}|${orden?.dir ?? ''}`
  const mostrar = tanda.de === mirada ? tanda.n : DE_A

  const columnas = prefs.visibles.map((k) => {
    const [titulo, ancho, ordena] = COLUMNAS[k]
    return { key: k, titulo, ancho, ordena, derecha: k === 'pedidas' }
  })

  const celda = (f: FilaRecepcion, k: string): React.ReactNode => {
    if (k === 'oc') return <b style={{ color: color.ink }}>{f.oc}</b>
    if (k === 'llego') return <span style={{ color: color.mut }}>{f.fecha}</span>
    if (k === 'de') return f.proveedor ? <span style={{ color: color.ink2 }} title={f.proveedor}>{f.proveedor}</span> : <span style={{ color: color.mut2 }}>—</span>
    if (k === 'va') return <span style={{ color: color.mut }} title="Ingresos todavía no dice a qué depósito va: el ERP lo supone">{f.vaA}</span>
    if (k === 'pedidas') return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{f.pedidas.toLocaleString('es-AR')}</span>
    if (k === 'recibidas') return f.pedidas ? <BarraRecibidas recibidas={f.recibidas} pedidas={f.pedidas} tono={f.tono} /> : <span style={{ color: color.mut }}>{u(f.recibidas)}</span>
    if (k === 'estado') return <span style={{ fontWeight: 600, fontSize: 13, color: COLOR_ESTADO[f.estado] }} title={f.estadoTexto}>{f.estadoTexto}</span>
    return null
  }

  const acciones = (f: FilaRecepcion) => {
    const menu: AccionMenu[] = [
      { key: 'ficha', label: f.estado === 'diferencia' ? 'Ver la diferencia' : 'Abrir la orden', icono: 'abrir', onClick: () => setFicha(f) },
      { key: 'ingresos', label: 'Abrir en Ingresos del monitor ↗', icono: 'abrir', onClick: () => abrirIngresos(f.id) },
    ]
    return <MenuAcciones acciones={menu} etiqueta={`Más acciones de la orden ${f.oc}`} vertical alinear="izquierda" />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: color.mut, flex: '1 1 320px' }}>Cada orden de compra que llegó, con lo recibido de lo pedido. Las órdenes las manda Ingresos y entran al stock del depósito.</p>
        <Button disabled={!filas.length} onClick={() => bajarCsv(filas, marca)}>Exportar</Button>
        <Button variant="outline" onClick={() => abrirIngresos()}>Abrir Ingresos en el monitor ↗</Button>
      </div>
      <Notice tone="warning">
        Ingresos avisa cada orden <b>recién cuando se confirma</b> lo que llegó: todavía no se ven las <b>pedidas que no llegaron</b>, ni a qué depósito va cada una (el ERP supone el depósito de la marca).
      </Notice>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
        <TileResumen titulo="Recibidas este mes" valor={res.ordenes.toLocaleString('es-AR')} oscuro nota="órdenes de Ingresos" />
        <TileResumen titulo="Productos que entraron" valor={u(res.entraron)} nota="este mes" />
        <TileResumen titulo="Con diferencia" valor={res.conDiferencia.toLocaleString('es-AR')} nota="este mes" />
        <TileResumen titulo="Faltaron" valor={u(res.faltaron)} nota="pedidas que no vinieron, este mes" />
      </div>

      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <VistasLista vistas={VISTAS} valor={vista} conteo={conteo} onCambio={setVista} />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar en los ingresos" placeholder="Orden o proveedor" />
          <PanelColumnas
            columnas={prefs.orden.map((k) => ({ key: k, titulo: COLUMNAS[k][0], visible: prefs.visibles.includes(k), fija: COLUMNAS[k][3] }))}
            onAlternar={(k) => setPrefs(alternarColumnaDe(COLUMNAS, prefs, k))}
            onMover={(k, d) => setPrefs(moverColumna(prefs, k, d))}
            onRestablecer={() => setPrefs({ ...normalizarPrefs(null) })}
          />
          <Button variant="outline" disabled={cargando} onClick={() => setVuelta((n) => n + 1)}>{cargando ? 'Leyendo…' : 'Actualizar'}</Button>
        </div>
        <ListaTrabajo
          columnas={columnas} filas={filas.slice(0, mostrar)} claveDe={(f) => f.id} celda={celda} acciones={acciones} anchoAcciones={44}
          orden={orden} onOrden={setOrden}
          activa={ficha?.id ?? null} onAbrir={setFicha} etiquetaFila={(f) => `la orden ${f.oc}`}
          vacio={!cargando && datos ? (
            <div style={{ padding: space[6] }}>
              <EmptyState title={q ? 'No hay órdenes con ese número o proveedor.' : vista === 'diferencia' ? 'No hay órdenes con diferencia.' : 'No hay órdenes en esta vista.'} />
            </div>
          ) : null}
        />
        {filas.length > mostrar && (
          <div style={{ padding: 12, textAlign: 'center', borderTop: `1px solid ${color.bg2}` }}>
            <Button variant="outline" onClick={() => setTanda({ de: mirada, n: mostrar + DE_A })}>Mostrar {Math.min(DE_A, filas.length - mostrar).toLocaleString('es-AR')} más</Button>
          </div>
        )}
        <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
          {cargando && !datos ? 'Leyendo los ingresos…' : `${Math.min(mostrar, filas.length).toLocaleString('es-AR')} de ${filas.length.toLocaleString('es-AR')}`}
          {' · '}<span style={{ fontWeight: weight.medium }}>Con diferencia</span> = faltó o sobró algún renglón (aunque el total dé igual).
        </div>
      </div>

      {ficha && <FichaRecepcion key={ficha.id} f={ficha} marca={marca} onCerrar={() => setFicha(null)} />}
    </div>
  )
}

function FichaRecepcion({ f, marca, onCerrar }: { f: FilaRecepcion; marca: string; onCerrar: () => void }) {
  const [lineas, setLineas] = useState<LineaConCruce[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [todas, setTodas] = useState(false)
  useEffect(() => {
    let vivo = true
    leerRecepcion(marca, f.id)
      .then((d) => { if (vivo) setLineas(d.lineas) })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo abrir la orden.') })
    return () => { vivo = false }
  }, [marca, f.id])
  const noCerraron = lineas ? renglonesQueNoCerraron(lineas) : []
  const ver = lineas ? (todas || !noCerraron.length ? lineas : noCerraron) : []
  const th: React.CSSProperties = { textAlign: 'right', padding: '6px 8px', fontWeight: weight.medium, color: color.mut, fontSize: font.sm, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { textAlign: 'right', padding: '6px 8px', fontVariantNumeric: 'tabular-nums', borderTop: `1px solid ${color.bg2}` }
  return (
    <FichaCostado abierta onCerrar={onCerrar} titulo={`${f.oc} · llegó el ${f.fecha}`} etiqueta={`Ficha de la orden ${f.oc}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <div style={{ fontSize: 20, fontWeight: weight.bold, color: color.ink }}>{f.proveedor ?? f.oc}</div>
        {f.pedidas > 0 && <BarraRecibidas recibidas={f.recibidas} pedidas={f.pedidas} tono={f.tono} />}
        <span style={{ fontWeight: 600, fontSize: 13, color: COLOR_ESTADO[f.estado] }}>{f.estadoTexto}</span>
      </div>
      {!f.totalesCoinciden && <Notice tone="warning">Los totales que mandó Ingresos no cierran contra sus renglones: se muestra lo de cada renglón.</Notice>}
      <DatosFicha>
        {f.fechaIngresos && <DatoFicha titulo="Fecha que cargó Ingresos">{f.fechaIngresos} · posterior a la confirmación</DatoFicha>}
        <DatoFicha titulo="Pedidas">{u(f.pedidas)}</DatoFicha>
        <DatoFicha titulo="Recibidas">{u(f.recibidas)}</DatoFicha>
        <DatoFicha titulo="Faltaron">{f.faltaron ? u(f.faltaron) : '—'}</DatoFicha>
        <DatoFicha titulo="Sobraron">{f.sobraron ? u(f.sobraron) : '—'}</DatoFicha>
        <DatoFicha titulo="Va a">{f.vaA} (supuesto)</DatoFicha>
      </DatosFicha>
      {error && <Notice tone="danger">{error}</Notice>}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: 6 }}>
          <span style={{ fontWeight: weight.semibold, color: color.ink, flex: 1 }}>
            {!lineas ? 'Leyendo los renglones…' : noCerraron.length && !todas ? `Los que no cerraron (${noCerraron.length} de ${lineas.length})` : `Renglones (${lineas.length})`}
          </span>
          {lineas && noCerraron.length > 0 && <Button variant="outline" size="sm" onClick={() => setTodas(!todas)}>{todas ? 'Ver sólo los que no cerraron' : `Ver los ${lineas.length}`}</Button>}
        </div>
        {lineas && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.base }}>
            <thead><tr><th style={{ ...th, textAlign: 'left' }}>Producto</th><th style={th}>Pedida</th><th style={th}>Recibida</th><th style={th}>Diferencia</th></tr></thead>
            <tbody>
              {ver.map((l) => {
                const dif = (Number(l.cantidad_contada) || 0) - (Number(l.cantidad_pedida) || 0)
                return (
                  <tr key={l.id}>
                    <td style={{ ...td, textAlign: 'left' }}>
                      <b style={{ color: color.ink }}>{l.nombre ?? l.sku ?? '—'}</b> <span style={{ color: color.mut }}>{[l.talle, l.color].filter(Boolean).join(' · ')}</span>
                      <div style={{ fontSize: font.sm, color: color.mut }}>{l.sku ?? ''}{l.es_nuevo ? ' · nuevo' : ''}{l.en_gn_hoy === false ? ' · falta darlo de alta en Gestión Nube' : ''}</div>
                    </td>
                    <td style={td}>{l.cantidad_pedida}</td>
                    <td style={td}>{l.cantidad_contada}</td>
                    <td style={{ ...td, fontWeight: dif ? weight.semibold : undefined, color: dif < 0 ? 'var(--mo-danger-ink)' : dif > 0 ? '#b45309' : color.mut }}>{dif > 0 ? `+${dif}` : dif || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <div><Button variant="outline" onClick={() => abrirIngresos(f.id)}>Abrir en Ingresos del monitor ↗</Button></div>
    </FichaCostado>
  )
}
