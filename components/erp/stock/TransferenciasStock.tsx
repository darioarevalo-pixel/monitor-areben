'use client'

/**
 * ERP › Stock › Transferencias, con el molde del diseño aprobado (`~/Documents/erp-monitor/diseno.md` §3 y §7; tablero 3
 * del v8): cada transferencia con la barrita de 4 pasos (Borrador · Armada · En tránsito · Recibida). Sólo LEE: se arman
 * y se mandan en Reposición del monitor (↗). Vistas con su número, buscador, resumen ARRIBA, columnas por usuario y
 * «Exportar». Clic en la fila ⇒ la ficha AL COSTADO con lo pedido, armado y enviado de cada prenda.
 * Núcleo puro: `lib/erp/transferencias.core.js`; servidor: `api/_erp-stock.js` (`vista=transferencias`).
 *
 * 🔴 «Recibida» ⛔ existe todavía (GN mueve el stock de un golpe y nadie escanea al llegar): el 4º paso va RAYADO y la
 * pantalla lo dice. Pedido para el motor en `PENDIENTES.md` (Diseño 8, 3).
 */

import { usePantallaAngosta } from '@/lib/movil'
import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, MenuAcciones, Notice, Select, color, font, space, weight, type AccionMenu } from '@/components/ui'
import { ListaTrabajo, type MovilColumna, type OrdenLista } from '@/components/ui/ListaTrabajo'
import { PanelColumnas } from '@/components/ui/PanelColumnas'
import { DatoFicha, DatosFicha, FichaCostado } from '@/components/ui/FichaCostado'
import { BuscadorLista, TileResumen, VistasLista, cuandoCorto } from '@/components/ui/PiezasLista'
import { leerTransferencias, type FilaTransferencia, type ListaDeTransferencias, type MarcaErp } from '@/lib/erp/cliente'
import {
  COLUMNAS, NOMBRE_ORIGEN, VISTAS, alternarColumna, contarVistas, filtrar, moverColumna, normalizarPrefs, ordenar, prendasTexto, resumen,
  vistaDeEntrada,
} from '@/lib/erp/transferencias.core.js'
import { guardarPrefsDeLista, leerPrefsDeLista } from '@/lib/erp/lista-prefs'
import { diaArgentino } from '@/lib/envios/portal.core.js'
import { useLineaErp } from '@/lib/erp/linea-erp'
import { BarraPasos } from './Barritas'

type Prefs = { orden: string[]; visibles: string[] }
/** 📱 Qué es cada columna en la tarjeta del celular; la que no está, `oculta`. */
const MOVIL: Record<string, MovilColumna> = { ruta: 'titulo', prendas: 'dato', estado: 'chico' }

const ANCHO_SELECT: React.CSSProperties = { cursor: 'pointer', width: 'auto', flex: '0 0 auto' }
const ORIGEN = NOMBRE_ORIGEN as Record<string, string>
const DE_A = 300
const u = (n: number) => `${n.toLocaleString('es-AR')} u`
const abrirReposicion = () => window.open('/reposicion', '_blank', 'noopener')
const atras = (hoy: string, n: number) => new Date(Date.parse(`${hoy}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10)

/** Lo que dice «En el ERP»: lo que anotó el libro, o por qué ⛔ (anterior al libro, cancelada). */
function enElErp(f: FilaTransferencia, libroDesde: string | null) {
  if (f.estado === 'cancelado' || !f.enviadas) return { texto: '—', ok: true, ayuda: undefined }
  if (!f.enLibro && libroDesde && f.creada < libroDesde) return { texto: 'antes del ERP', ok: true, ayuda: `El ERP del ERP arranca el ${cuandoCorto(libroDesde)}` }
  return { texto: u(f.enLibro ?? 0), ok: f.enLibro === f.enviadas, ayuda: f.enLibro === f.enviadas ? 'El ERP del ERP la tiene entera' : `El ERP anotó ${f.enLibro ?? 0} de ${f.enviadas}` }
}

function bajarCsv(filas: FilaTransferencia[], marca: MarcaErp) {
  const c = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`
  const renglones = [['Nº', 'Creada', 'De', 'A', 'Origen', 'Quién', 'Estado', 'Pedidas', 'Armadas', 'Enviadas', 'Faltan', 'En el ERP'].map(c).join(';')]
  for (const f of filas) renglones.push([f.numero ?? '', cuandoCorto(f.creada), f.desdeTexto, f.haciaTexto, f.origenTexto, f.persona ?? '', f.estadoTexto, f.pedidas, f.armadas, f.enviadas, f.faltan, f.enLibro ?? ''].map(c).join(';'))
  const url = URL.createObjectURL(new Blob(['﻿' + renglones.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `transferencias-${marca}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function TransferenciasStock() {
  const { marca: delShell, perfil } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const tienda = useLineaErp()
  const usuario = perfil?.name ?? null
  const lista = 'erp-transferencias'
  const [datos, setDatos] = useState<(ListaDeTransferencias & { clave: string; hoy: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elegida, setVista] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [origen, setOrigen] = useState('')
  const [periodo, setPeriodo] = useState('todo')
  const [orden, setOrden] = useState<OrdenLista>(null)
  const [tanda, setTanda] = useState({ de: '', n: DE_A })
  const [prefs, setPrefsState] = useState<Prefs>(() => normalizarPrefs(typeof window === 'undefined' ? null : leerPrefsDeLista(lista, usuario)))
  const [ficha, setFicha] = useState<FilaTransferencia | null>(null)
  const setPrefs = (p: Prefs) => { setPrefsState(p); guardarPrefsDeLista(lista, usuario, p) }

  const [vuelta, setVuelta] = useState(0)
  const clave = `${marca}|${vuelta}`
  useEffect(() => {
    let vivo = true
    leerTransferencias(marca)
      // El día se toma al leer (⛔ en el render): «este mes» es el de cuando se leyó.
      .then((d) => { if (vivo) { setDatos({ ...d, clave, hoy: diaArgentino(Date.now()) }); setError(null) } })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : 'No se pudieron leer las transferencias.'); setDatos((x) => (x ? { ...x, clave } : x)) } })
    return () => { vivo = false }
  }, [marca, clave])
  const cargando = datos?.clave !== clave

  const hoy = datos?.hoy ?? '2000-01-01'
  const desde = periodo === 'mes' ? `${hoy.slice(0, 7)}-01` : periodo === '30d' ? atras(hoy, 29) : ''
  // 🔴 Stunned vive en la base de Zattia: la lista viene con las dos y se queda con la de la tienda elegida (30-oct).
  const propias = useMemo(() => filtrar(datos?.filas ?? [], { linea: tienda }), [datos, tienda])
  const base = useMemo(() => filtrar(propias, { q, origen, desde }), [propias, q, origen, desde])
  const conteo = useMemo(() => contarVistas(base), [base])
  // Se entra filtrado (§3): a las abiertas si hay, si ⛔ a todas; elegir una vista la deja fija.
  const vista = elegida ?? vistaDeEntrada(contarVistas(propias))
  const enVista = useMemo(() => filtrar(base, { vista }), [base, vista])
  const filas: FilaTransferencia[] = useMemo(() => ordenar(enVista, orden), [enVista, orden])
  const res = useMemo(() => resumen(propias, hoy.slice(0, 7)), [propias, hoy])
  const mirada = `${clave}|${vista}|${q}|${origen}|${desde}|${orden?.col ?? ''}|${orden?.dir ?? ''}`
  const mostrar = tanda.de === mirada ? tanda.n : DE_A
  const libroDesde = datos?.libroDesde ?? null

  // 📱 En el celular la tarjeta arma lo suyo con TODAS las columnas: las de `prefs` son de la compu.
  const angosta = usePantallaAngosta()
  const columnas = (angosta ? prefs.orden : prefs.visibles).map((k) => {
    const [titulo, ancho, ordena] = COLUMNAS[k]
    return { key: k, titulo, ancho, ordena, derecha: k === 'prendas' || k === 'libro', movil: MOVIL[k] ?? 'oculta' }
  })

  const celda = (f: FilaTransferencia, k: string): React.ReactNode => {
    if (k === 'n') return f.numero ? <b style={{ color: color.ink }} title="El número de la transferencia en Gestión Nube">{f.numero}</b> : <span style={{ color: color.mut2 }}>sin número</span>
    if (k === 'creada') return <span style={{ color: color.mut }}>{cuandoCorto(f.creada)}</span>
    if (k === 'ruta') return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: weight.semibold, whiteSpace: 'nowrap', color: color.ink }}>
        {f.desdeTexto}
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#98a2b3" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M5 12h14 M13 6l6 6-6 6" /></svg>
        {f.haciaTexto}
      </span>
    )
    if (k === 'origen') return <span style={{ color: color.mut }}>{f.origenTexto}</span>
    if (k === 'quien') return f.persona ? <span style={{ color: color.ink2 }}>{f.persona}</span> : <span style={{ color: color.mut2, fontStyle: 'italic' }}>{f.origen === 'gn' ? 'Gestión Nube' : '—'}</span>
    if (k === 'estado') return <BarraPasos paso={f.paso} fin={f.fin} texto={f.faltan > 0 && f.estado === 'transferido' ? 'Transferida con faltantes' : f.estadoTexto} />
    if (k === 'prendas') return <span style={{ fontVariantNumeric: 'tabular-nums', color: f.faltan > 0 && f.estado !== 'cancelado' ? 'var(--mo-danger-ink)' : color.ink }}>{prendasTexto(f)}</span>
    if (k === 'libro') {
      const e = enElErp(f, libroDesde)
      return <span title={e.ayuda} style={{ fontVariantNumeric: 'tabular-nums', color: e.ok ? color.mut : 'var(--mo-danger-ink)' }}>{e.texto}</span>
    }
    return null
  }

  const acciones = (f: FilaTransferencia) => {
    const menu: AccionMenu[] = [
      { key: 'ficha', label: 'Abrir la transferencia', icono: 'abrir', onClick: () => setFicha(f) },
      { key: 'repo', label: 'Abrir Reposición en el monitor ↗', icono: 'abrir', onClick: abrirReposicion, hint: 'Las transferencias se arman y se mandan escaneando en Reposición.' },
    ]
    return <MenuAcciones acciones={menu} etiqueta={`Más acciones de la transferencia ${f.numero ?? ''}`} vertical alinear="izquierda" />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: color.mut, flex: '1 1 320px' }}>Cada transferencia entre el depósito y el local, con el paso en que está. Se arman y se mandan en Reposición.</p>
        <Button disabled={!filas.length} onClick={() => bajarCsv(filas, marca)}>Exportar</Button>
        <Button variant="outline" onClick={abrirReposicion}>Abrir Reposición en el monitor ↗</Button>
      </div>
      {/* Stunned ya vive en el ERP (corte del 28-oct): la transferencia se mueve y se recibe acá, con sus faltantes (Bruno, 28-oct). */}
      {tienda === 'stunned'
        ? <Notice tone="neutral">Stunned ya vive en el ERP: la transferencia se mueve y se recibe acá. Lo que no llega al local queda como faltante («Transferida con faltantes»).</Notice>
        : <Notice tone="warning">
          <b>«Recibida» todavía no se controla</b>: Gestión Nube mueve el stock de un golpe y nadie la escanea al llegar al local (el último paso va rayado).
          Tampoco hay transferencias armadas a mano fuera de Reposición: las que se hacen en la pantalla de Gestión Nube aparecen como «A mano en Gestión Nube».
        </Notice>}
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {datos?.cortado && <Notice tone="warning">Se ven las {datos.filas.length.toLocaleString('es-AR')} más nuevas.</Notice>}

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
        <TileResumen titulo="Abiertas" valor={res.abiertas.toLocaleString('es-AR')} oscuro nota="en borrador, armándose o yendo" />
        <TileResumen titulo="En camino" valor={u(res.enCamino)} nota="armadas o enviándose" />
        <TileResumen titulo="Transferidas este mes" valor={res.hechasMes.toLocaleString('es-AR')} nota={res.conFaltantes ? `${res.conFaltantes} con faltantes` : 'sin faltantes'} />
        <TileResumen titulo="Productos movidos" valor={u(res.movidas)} nota="este mes" />
      </div>

      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <VistasLista vistas={VISTAS} valor={vista} conteo={conteo} onCambio={setVista} />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar en las transferencias" placeholder="Nº, producto o quién la hizo" />
          <Select aria-label="Período" style={ANCHO_SELECT} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            <option value="todo">Desde el principio</option><option value="mes">Este mes</option><option value="30d">Últimos 30 días</option>
          </Select>
          <Select aria-label="Origen" style={ANCHO_SELECT} value={origen} onChange={(e) => setOrigen(e.target.value)}>
            <option value="">Todos los orígenes</option>
            {Object.entries(ORIGEN).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </Select>
          <PanelColumnas
            columnas={prefs.orden.map((k) => ({ key: k, titulo: COLUMNAS[k][0], visible: prefs.visibles.includes(k), fija: COLUMNAS[k][3] }))}
            onAlternar={(k) => setPrefs(alternarColumna(prefs, k))}
            onMover={(k, d) => setPrefs(moverColumna(prefs, k, d))}
            onRestablecer={() => setPrefs({ ...normalizarPrefs(null) })}
          />
          <Button variant="outline" disabled={cargando} onClick={() => setVuelta((n) => n + 1)}>{cargando ? 'Leyendo…' : 'Actualizar'}</Button>
        </div>
        <ListaTrabajo
          columnas={columnas} filas={filas.slice(0, mostrar)} claveDe={(f) => f.id} celda={celda} acciones={acciones} anchoAcciones={44}
          orden={orden} onOrden={setOrden}
          activa={ficha?.id ?? null} onAbrir={setFicha} etiquetaFila={(f) => `la transferencia ${f.numero ?? ''} de ${f.desdeTexto} a ${f.haciaTexto}`}
          vacio={!cargando && datos ? (
            <div style={{ padding: space[6] }}>
              <EmptyState title={q ? 'No hay transferencias con ese número, producto o persona.' : vista === 'abiertas' ? 'No hay transferencias abiertas.' : 'No hay transferencias en esta vista.'} />
            </div>
          ) : null}
        />
        {filas.length > mostrar && (
          <div style={{ padding: 12, textAlign: 'center', borderTop: `1px solid ${color.bg2}` }}>
            <Button variant="outline" onClick={() => setTanda({ de: mirada, n: mostrar + DE_A })}>Mostrar {Math.min(DE_A, filas.length - mostrar).toLocaleString('es-AR')} más</Button>
          </div>
        )}
        <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
          {cargando && !datos ? 'Leyendo las transferencias…' : `${Math.min(mostrar, filas.length).toLocaleString('es-AR')} de ${filas.length.toLocaleString('es-AR')}`}
          {libroDesde && <> · el ERP del ERP arranca el {cuandoCorto(libroDesde)}</>}
        </div>
      </div>

      {ficha && <FichaTransferencia f={ficha} libroDesde={libroDesde} onCerrar={() => setFicha(null)} />}
    </div>
  )
}

function FichaTransferencia({ f, libroDesde, onCerrar }: { f: FilaTransferencia; libroDesde: string | null; onCerrar: () => void }) {
  const e = enElErp(f, libroDesde)
  const renglones = f.renglones.slice().sort((a, b) => (b.pedida - b.enviada) - (a.pedida - a.enviada) || String(a.nombre ?? a.sku).localeCompare(String(b.nombre ?? b.sku)))
  const th: React.CSSProperties = { textAlign: 'right', padding: '6px 8px', fontWeight: weight.medium, color: color.mut, fontSize: font.sm, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { textAlign: 'right', padding: '6px 8px', fontVariantNumeric: 'tabular-nums', borderTop: `1px solid ${color.bg2}` }
  const cerrada = f.estado === 'transferido' || f.estado === 'en_gn'
  return (
    <FichaCostado abierta onCerrar={onCerrar} titulo={`Transferencia${f.numero ? ` · ${f.numero}` : ''} · ${cuandoCorto(f.creada)}`} etiqueta={`Ficha de la transferencia ${f.numero ?? ''}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <div style={{ fontSize: 20, fontWeight: weight.bold, color: color.ink }}>{f.desdeTexto} → {f.haciaTexto}</div>
        <BarraPasos paso={f.paso} fin={f.fin} texto={f.faltan > 0 && f.estado === 'transferido' ? 'Transferida con faltantes' : f.estadoTexto} />
      </div>
      {f.error && <Notice tone="danger">{f.error}</Notice>}
      <DatosFicha>
        <DatoFicha titulo="Origen">{f.origenTexto}</DatoFicha>
        <DatoFicha titulo="Quién">{f.persona ?? '—'}</DatoFicha>
        {f.origen !== 'gn' && <DatoFicha titulo="Pedidas">{u(f.pedidas)}</DatoFicha>}
        {f.origen !== 'gn' && <DatoFicha titulo="Armadas">{u(f.armadas)}</DatoFicha>}
        <DatoFicha titulo="Enviadas">{u(f.enviadas)}</DatoFicha>
        {f.faltan > 0 && <DatoFicha titulo="Faltaron">{u(f.faltan)}</DatoFicha>}
        <DatoFicha titulo="En el ERP">{e.ayuda ? `${e.texto} · ${e.ayuda.toLowerCase()}` : e.texto}</DatoFicha>
        {f.cerrada && <DatoFicha titulo={cerrada ? 'Transferida' : 'Cerrada'}>{cuandoCorto(f.cerrada)}</DatoFicha>}
      </DatosFicha>
      {f.tandas.length > 1 && (
        <div style={{ fontSize: font.sm, color: color.mut }}>
          Salió en {f.tandas.length} tandas: {f.tandas.map((t) => `${t.numero ?? 'sin número'} (${t.unidades} u, ${cuandoCorto(t.hora)})`).join(' · ')}
        </div>
      )}
      <div>
        <div style={{ fontWeight: weight.semibold, color: color.ink, marginBottom: 6 }}>Productos ({renglones.length})</div>
        <div className="erp-tabla-desliza"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.base }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Producto</th>
              {f.origen !== 'gn' && <th style={th}>Pedida</th>}
              {f.origen !== 'gn' && <th style={th}>Armada</th>}
              <th style={th}>Enviada</th>
            </tr>
          </thead>
          <tbody>
            {renglones.map((r) => {
              const falta = f.origen !== 'gn' && f.estado !== 'cancelado' && r.enviada < r.pedida && cerrada
              return (
                <tr key={r.vid}>
                  <td style={{ ...td, textAlign: 'left' }}>
                    <b style={{ color: color.ink }}>{r.nombre ?? r.sku ?? r.vid}</b> <span style={{ color: color.mut }}>{r.talle ?? ''}</span>
                    {r.sku && r.nombre && <div style={{ fontSize: font.sm, color: color.mut }}>{r.sku}</div>}
                  </td>
                  {f.origen !== 'gn' && <td style={td}>{r.pedida || '—'}</td>}
                  {f.origen !== 'gn' && <td style={td}>{r.armada || '—'}</td>}
                  <td style={{ ...td, color: falta ? 'var(--mo-danger-ink)' : color.ink, fontWeight: falta ? weight.semibold : undefined }}>{r.enviada || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
      </div>
      <div><Button variant="outline" onClick={abrirReposicion}>Abrir Reposición en el monitor ↗</Button></div>
    </FichaCostado>
  )
}
