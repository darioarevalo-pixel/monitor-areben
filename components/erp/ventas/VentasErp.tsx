'use client'

/**
 * ERP › Ventas — el PILOTO del diseño aprobado (Bruno, 18-oct; `~/Documents/erp-monitor/diseno.md` §3–§5 y §8): UNA lista
 * con todo lo que es venta (Caja, Tienda Nube, mayoristas, cambios y los pedidos de TN sin pagar), con vistas que ya dicen
 * cuántas hay, el resumen del filtro ARRIBA, columnas a elección (guardadas por usuario), tildar filas y la ficha AL
 * COSTADO. Núcleo puro: `lib/erp/ventas-lista.core.js`; servidor: `api/_erp-ventas.js`.
 *
 * 🔑 Botones (diseño §4): íconos A LA IZQUIERDA ($ cobro · lápiz editar · factura · ⋯). Desde la FILA, $ y Editar abren
 * SÓLO su ventana (⛔ la ficha detrás). Un botón sólo si la acción VIVE en el ERP: lo de afuera dice «↗».
 * 🔑 Todo lo del motor hoy es «Prueba» (en paralelo con GN, que es el que sirve): se dice arriba, siempre.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import {
  Button, EmptyState, Icono, MenuAcciones, Notice, Select, StatusPill, color, font, space, weight, type AccionMenu, type Tone,
} from '@/components/ui'
import { ListaTrabajo, IconoFila, type OrdenLista } from '@/components/ui/ListaTrabajo'
import { PanelColumnas } from '@/components/ui/PanelColumnas'
import { BarraSeleccion } from '@/components/ui/FichaCostado'
import { leerListaDeVentas, type FilaVentaLista, type MarcaErp, type QueSabeElMotor } from '@/lib/erp/cliente'
import {
  COBRO, COLUMNAS, ESTADO, ORIGEN, PERIODOS, VISTAS, accionesDeFila, alternarColumna, contarVistas, filtrar, moverColumna,
  normalizarPrefs, ordenar, plata, rangoDePeriodo, resumen,
} from '@/lib/erp/ventas-lista.core.js'
import { guardarPrefsDeLista, leerPrefsDeLista } from '@/lib/erp/lista-prefs'
import { diaArgentino } from '@/lib/envios/portal.core.js'
import { FichaVenta } from './FichaVenta'
import { VentanaCobro, VentanaEditar } from './VentanasVenta'

export type Prefs = { orden: string[]; visibles: string[]; densidad: 'compacta' | 'comoda' }
type Ventana = { tipo: 'cobro' | 'editar'; fila: FilaVentaLista; desdeFicha: boolean } | null

/** «18/10 10:40», en hora argentina (UTC−3). */
export const cuandoCorto = (iso: string) => {
  const d = new Date(Date.parse(iso) - 3 * 3600_000).toISOString()
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}`
}

export const chipDe = (mapa: Record<string, [Tone, string]>, k: string) => {
  const [tono, texto] = mapa[k] || ['neutral', k]
  // Con la columna angosta (monitor de 1333 px) el chip largo («Compra pendiente en GN») termina en «…» y lo dice entero al pasar el mouse.
  return <span title={texto} style={{ display: 'inline-flex', maxWidth: '100%', verticalAlign: 'middle' }}><StatusPill tone={tono as Tone} style={{ maxWidth: '100%', minWidth: 0 }} label={<span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{texto}</span>} /></span>
}

/** El `Select` del kit es de ancho 100% (formularios): en la barra cada desplegable mide lo suyo, ⛔ una fila entera. */
const ANCHO_SELECT: React.CSSProperties = { cursor: 'pointer', width: 'auto', flex: '0 0 auto' }

const ORIGENES: Array<[string, string]> = [['', 'Todos los orígenes'], ['caja', 'Caja'], ['tn', 'Tienda Nube'], ['mayorista', 'Mayorista'], ['ml', 'Mercado Libre']]

/** El CSV de las elegidas, para Excel en castellano (`;`, coma decimal, BOM). */
function bajarCsv(filas: FilaVentaLista[]) {
  const c = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`
  const renglones = [['Nº', 'Fecha', 'Cliente', 'Origen', 'Estado', 'Cobro', 'Total', 'Saldo', 'Factura', 'Vendió', 'Nota'].map(c).join(';')]
  for (const f of filas) {
    renglones.push([f.ref, cuandoCorto(f.ocurridaEn), f.cliente, f.origenTexto, ESTADO[f.estadoKey]?.[1] ?? f.estadoKey, COBRO[f.cobroKey]?.[1] ?? f.cobroKey,
      String(f.total).replace('.', ','), String(f.saldo).replace('.', ','), f.factura?.numero ?? '', f.vendio, f.nota?.texto ?? ''].map(c).join(';'))
  }
  const url = URL.createObjectURL(new Blob(['﻿' + renglones.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `ventas-${diaArgentino(Date.now())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function VentasErp({ irACaja }: { irACaja: (que: 'cambio' | 'factura') => void }) {
  const { marca: delShell, perfil } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const usuario = perfil?.name ?? null
  const [periodo, setPeriodo] = useState('mes')
  const [datos, setDatos] = useState<{ filas: FilaVentaLista[]; puede: QueSabeElMotor; clave: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [vista, setVista] = useState('todas')
  const [q, setQ] = useState('')
  const [origen, setOrigen] = useState('')
  const [linea, setLinea] = useState('')
  const [orden, setOrden] = useState<OrdenLista>(null)
  // Lo guardado por usuario (la sección es sólo de navegador: `localStorage` existe; si falla, las de siempre).
  const [prefs, setPrefsState] = useState<Prefs>(() => normalizarPrefs(typeof window === 'undefined' ? null : leerPrefsDeLista('erp-ventas', usuario)))
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [ficha, setFicha] = useState<{ fila: FilaVentaLista; accion?: 'anular' } | null>(null)
  const [ventana, setVentana] = useState<Ventana>(null)
  // Sube con cada guardado: la ficha abierta se vuelve a leer.
  const [version, setVersion] = useState(0)

  const setPrefs = (p: Prefs) => { setPrefsState(p); guardarPrefsDeLista('erp-ventas', usuario, p) }

  // Cada lectura tiene su clave (marca · período · vuelta): mientras la de los datos ⛔ es la pedida, se está leyendo.
  const [vuelta, setVuelta] = useState(0)
  const clave = `${marca}|${periodo}|${vuelta}`
  useEffect(() => {
    let vivo = true
    const r = rangoDePeriodo(periodo, diaArgentino(Date.now()))
    leerListaDeVentas(marca, r.desde, r.hasta)
      .then((d) => {
        if (!vivo) return
        setDatos({ filas: d.filas, puede: d.puede, clave })
        // Lo tildado ⛔ sobrevive a una lectura nueva: puede haber cambiado (una anulada ya no se exporta igual).
        setSeleccion(new Set())
        setError(null)
      })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : 'No se pudieron leer las ventas.'); setDatos((x) => (x ? { ...x, clave } : x)) } })
    return () => { vivo = false }
  }, [marca, periodo, clave])
  const cargar = () => setVuelta((n) => n + 1)
  const cargando = datos?.clave !== clave

  const puede = datos?.puede ?? { editar: false, notas: false, cobrar: false }
  // Lo que filtran el buscador, el origen y la línea: sobre eso se cuentan las vistas y se arma el resumen.
  const base = useMemo(() => filtrar(datos?.filas ?? [], { q, origenes: origen ? [origen] : [] }).filter((f: FilaVentaLista) => !linea || f.linea === linea), [datos, q, origen, linea])
  const conteo = useMemo(() => contarVistas(base), [base])
  const filas: FilaVentaLista[] = useMemo(() => ordenar(filtrar(base, { vista }), orden), [base, vista, orden])
  const res = useMemo(() => resumen(filtrar(base, { vista })), [base, vista])
  const elegidas = filas.filter((f) => seleccion.has(f.id))
  const vendedores = useMemo(() => [...new Set((datos?.filas ?? []).map((f) => f.vendio).filter((x) => x && x !== '—' && x !== 'Tienda Nube' && x !== 'Desde GN'))].sort(), [datos])
  const todasPrueba = !!datos?.filas.length && datos.filas.every((f) => f.kind === 'pedido' || f.prueba)
  const nombrePeriodo = PERIODOS.find(([k]) => k === periodo)?.[1] ?? ''

  const abrirFicha = (fila: FilaVentaLista, accion?: 'anular') => { setVentana(null); setFicha({ fila, accion }) }
  const abrirVentana = (tipo: 'cobro' | 'editar', fila: FilaVentaLista, desdeFicha: boolean) => setVentana({ tipo, fila, desdeFicha })
  const cerrarVentana = () => setVentana(null)
  const despuesDeGuardar = (texto: string) => { setAviso(texto); setVentana(null); setVersion((v) => v + 1); cargar() }

  const columnas = prefs.visibles.map((k) => {
    const [titulo, ancho, ordena] = COLUMNAS[k]
    return { key: k, titulo: k === 'h' ? 'Fecha' : titulo, ancho, ordena, derecha: k === 'total' }
  })

  const celda = (f: FilaVentaLista, k: string): React.ReactNode => {
    if (k === 'n') return <b style={{ color: f.kind === 'pedido' ? color.mut : color.ink }}>{f.ref}</b>
    if (k === 'h') return <span style={{ color: color.mut }}>{cuandoCorto(f.ocurridaEn)}</span>
    if (k === 'c') {
      return (
        <span title={`${f.cliente}${f.clienteDe === 'gn' ? ' · el nombre sale de GN (la venta todavía no tiene cliente del ERP)' : f.clienteDe === 'falta' ? (f.kind === 'pedido' ? ' · un pedido sin pagar todavía no llegó a GN: el nombre aparece cuando se cobra' : ' · el nombre llega con el espejo de GN, al otro día') : ''}`}>
          <span style={{ color: f.clienteDe === 'falta' ? color.mut2 : color.ink, fontStyle: f.clienteDe === 'falta' ? 'italic' : undefined }}>{f.cliente}</span>
          {f.clienteDe === 'gn' && <span style={{ marginLeft: 6, fontSize: font.xs, color: color.mut2 }}>de GN</span>}
        </span>
      )
    }
    if (k === 'o') {
      const o = ORIGEN[f.origen]
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span aria-hidden style={{ flex: '0 0 26px', height: 20, borderRadius: 5, display: 'inline-grid', placeItems: 'center', fontSize: 10.5, fontWeight: weight.bold, background: color.bg2, color: color.ink2 }}>{o?.sigla ?? '··'}</span>
          <span style={{ color: color.ink2 }} title={f.origenTexto}>{f.origenTexto}</span>
        </span>
      )
    }
    if (k === 'e') return chipDe(ESTADO, f.estadoKey)
    if (k === 'p') return chipDe(COBRO, f.cobroKey)
    if (k === 'total') return <b>{plata(f.total)}</b>
    if (k === 'fac') return f.factura ? <span style={{ color: color.ink2 }}>{f.factura.numero}{f.factura.de === 'gn' && <span style={{ marginLeft: 4, fontSize: font.xs, color: color.mut2 }}>GN</span>}</span> : <span style={{ color: color.mut2 }}>—</span>
    if (k === 'ven') return <span style={{ color: color.ink2 }}>{f.vendio}</span>
    if (k === 'nota') return f.nota ? <span style={{ color: 'var(--mo-warning-ink)' }} title={`Nota · ${f.nota.de}`}>{f.nota.texto}</span> : <span style={{ color: color.mut2 }}>—</span>
    if (k === 'linea') return <span style={{ color: color.ink2 }}>{{ bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }[f.linea] ?? f.linea}</span>
    return null
  }

  const acciones = (f: FilaVentaLista) => {
    const a = accionesDeFila(f, puede)
    const menu: AccionMenu[] = f.kind === 'pedido'
      ? [{ key: 'tn', label: 'Ver el pedido en Tienda Nube ↗', icono: 'abrir', onClick: () => f.link && window.open(f.link, '_blank', 'noopener'), disabled: !f.link }]
      : [
          { key: 'ficha', label: 'Abrir la ficha', icono: 'abrir', onClick: () => abrirFicha(f) },
          { key: 'cobro', label: 'Registrar cobro', icono: 'pesos', onClick: () => abrirVentana('cobro', f, false), disabled: !(f.saldo > 0), hint: f.saldo > 0 ? undefined : 'No tiene saldo.' },
          { key: 'editar', label: 'Editar', icono: 'lapiz', onClick: () => abrirVentana('editar', f, false), disabled: f.anulada },
          { key: 'cambio', label: 'Hacer cambio', icono: 'cambios', onClick: () => irACaja('cambio'), disabled: f.anulada, hint: 'Abre la Caja del ERP en Cambio.' },
          ...(f.link ? [{ key: 'tn', label: 'Ver el pedido en Tienda Nube ↗', icono: 'abrir' as const, onClick: () => window.open(f.link!, '_blank', 'noopener') }] : []),
          { key: 'anular', label: 'Anular…', icono: 'anular', tone: 'danger', onClick: () => abrirFicha(f, 'anular'), disabled: f.anulada },
        ]
    return (
      <>
        <IconoFila label={a.cobro.label} verde={a.cobro.verde} apagado={!a.cobro.activo} onClick={() => (f.saldo > 0 ? abrirVentana('cobro', f, false) : abrirFicha(f))}><Icono nombre="pesos" size={16} /></IconoFila>
        <IconoFila label={a.editar.label} apagado={!a.editar.activo} onClick={() => abrirVentana('editar', f, false)}><Icono nombre="lapiz" size={16} /></IconoFila>
        <IconoFila label={a.factura.label} verde={a.factura.verde} apagado={!a.factura.activo} onClick={() => (f.facturada ? abrirFicha(f) : irACaja('factura'))}><Icono nombre="factura" size={16} /></IconoFila>
        <MenuAcciones acciones={menu} etiqueta={`Más acciones de la venta ${f.ref}`} vertical alinear="izquierda" />
      </>
    )
  }

  const tile = (titulo: string, valor: string, oscuro = false, nota?: string) => (
    <div style={{ flex: '1 1 180px', minWidth: 0, padding: '14px 16px', borderRadius: 14, background: oscuro ? 'var(--mo-side-bg)' : color.surface, border: oscuro ? 0 : `1px solid ${color.line}`, color: oscuro ? '#fff' : color.ink }}>
      <div style={{ fontSize: font.sm, color: oscuro ? '#94a3b8' : color.mut }}>{titulo}</div>
      <div style={{ fontSize: oscuro ? 26 : 20, fontWeight: weight.bold, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{valor}</div>
      {nota && <div style={{ fontSize: font.sm, color: oscuro ? '#94a3b8' : color.mut }}>{nota}</div>}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {/* El título «Ventas» lo pone el menú del ERP (`Erp.tsx`) arriba de las pestañas. */}
      <p style={{ margin: 0, color: color.mut }}>Caja, Tienda Nube, mayoristas y cambios, en una sola lista.</p>

      {todasPrueba && <Notice tone="warning">Todo lo de esta lista es <b>de prueba</b>: corre en paralelo con Gestión Nube, que es el que sirve hoy (la factura y el stock siguen saliendo de GN).</Notice>}
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {aviso && <Notice tone="success" onClose={() => setAviso(null)}>{aviso}</Notice>}

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
        {tile(`Vendido · ${nombrePeriodo.toLowerCase()}`, plata(res.vendido), true)}
        {tile('Ventas', res.ventas.toLocaleString('es-AR'))}
        {tile('Ticket promedio', plata(res.ticket))}
        {tile('Por cobrar', plata(res.porCobrar), false, res.sinPagar ? `y ${plata(res.sinPagar)} en pedidos sin pagar` : undefined)}
      </div>

      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <div role="tablist" aria-label="Vistas" style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', padding: '12px 12px 0' }}>
          {VISTAS.map(([k, nombre]) => {
            const on = vista === k
            return (
              <button
                key={k} type="button" role="tab" aria-selected={on} onClick={() => { setVista(k); setSeleccion(new Set()) }}
                style={{ height: 32, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 12px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', fontSize: 13.5, fontWeight: weight.semibold, border: `1px solid ${on ? 'var(--mo-side-bg)' : color.line}`, background: on ? 'var(--mo-side-bg)' : color.surface, color: on ? '#fff' : color.ink2 }}
              >
                {nombre}
                <span style={{ fontSize: 12, fontWeight: weight.bold, padding: '0 6px', borderRadius: 999, background: on ? 'rgba(255,255,255,0.18)' : color.bg2, color: on ? '#fff' : color.mut }}>{(conteo[k] ?? 0).toLocaleString('es-AR')}</span>
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <label style={{ flex: '1 1 240px', display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 10px', border: `1px solid ${color.line2}`, borderRadius: 9 }}>
            <Icono nombre="lupa" size={16} style={{ color: color.mut2 }} />
            <input aria-label="Buscar en las ventas" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número, pedido de TN, cliente o nota" style={{ flex: 1, border: 0, outline: 0, font: 'inherit', background: 'transparent', minWidth: 0 }} />
          </label>
          <Select aria-label="Período" style={ANCHO_SELECT} value={periodo} onChange={(e) => { setFicha(null); setPeriodo(e.target.value) }}>{PERIODOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select>
          <Select aria-label="Origen" style={ANCHO_SELECT} value={origen} onChange={(e) => setOrigen(e.target.value)}>{ORIGENES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select>
          {marca === 'zattia' && <Select aria-label="Línea" style={ANCHO_SELECT} value={linea} onChange={(e) => setLinea(e.target.value)}><option value="">Zattia y Stunned</option><option value="zattia">Zattia</option><option value="stunned">Stunned</option></Select>}
          <span style={{ flex: '0 0 auto', display: 'inline-flex', padding: 3, borderRadius: 9, background: color.bg2 }} role="radiogroup" aria-label="Alto de las filas">
            {(['compacta', 'comoda'] as const).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={prefs.densidad === d} title={d === 'compacta' ? 'Filas compactas' : 'Filas cómodas'} onClick={() => setPrefs({ ...prefs, densidad: d })}
                style={{ height: 28, padding: '0 10px', border: 0, borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: font.sm, fontWeight: weight.semibold, background: prefs.densidad === d ? color.surface : 'transparent', color: prefs.densidad === d ? color.ink : color.mut, boxShadow: prefs.densidad === d ? '0 1px 2px rgba(16,24,40,0.12)' : undefined }}>
                {d === 'compacta' ? 'Compacta' : 'Cómoda'}
              </button>
            ))}
          </span>
          <PanelColumnas
            columnas={prefs.orden.map((k) => ({ key: k, titulo: COLUMNAS[k][0], visible: prefs.visibles.includes(k), fija: COLUMNAS[k][3] }))}
            onAlternar={(k) => setPrefs(alternarColumna(prefs, k))}
            onMover={(k, d) => setPrefs(moverColumna(prefs, k, d))}
            onRestablecer={() => setPrefs({ ...normalizarPrefs(null), densidad: prefs.densidad })}
          />
          <Button variant="outline" disabled={cargando} onClick={() => cargar()}>{cargando ? 'Leyendo…' : 'Actualizar'}</Button>
        </div>
        <ListaTrabajo
          columnas={columnas} filas={filas} claveDe={(f) => f.id} celda={celda} acciones={acciones} anchoAcciones={120}
          seleccion={seleccion} onSeleccion={setSeleccion} orden={orden} onOrden={setOrden} densidad={prefs.densidad}
          activa={ficha?.fila.id ?? null} onAbrir={(f) => abrirFicha(f)} etiquetaFila={(f) => `la venta ${f.ref}`}
          vacio={!cargando && datos ? (
            <div style={{ padding: space[6] }}>
              <EmptyState title={vista === 'todas' ? 'No hay ventas en este período.' : 'No hay ventas en esta vista.'} />
              {vista !== 'todas' && <div style={{ textAlign: 'center' }}><Button variant="outline" onClick={() => setVista('todas')}>Ver todas</Button></div>}
            </div>
          ) : null}
        />
        <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
          {cargando && !datos ? 'Leyendo las ventas…' : `${filas.length.toLocaleString('es-AR')} de ${(conteo.todas ?? 0).toLocaleString('es-AR')} · ${nombrePeriodo.toLowerCase()}`}
          {' · '}los pedidos sin pagar son los abiertos hoy, de cualquier fecha.
        </div>
      </div>

      <BarraSeleccion cuantas={elegidas.length} onSoltar={() => setSeleccion(new Set())}>
        <span style={{ color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>{plata(elegidas.reduce((a, f) => a + f.total, 0))}</span>
        <button type="button" onClick={() => bajarCsv(elegidas)} style={{ height: 34, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 12px', border: 0, borderRadius: 8, background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', fontWeight: weight.semibold }}>
          <Icono nombre="bajar" size={16} />Exportar las elegidas
        </button>
      </BarraSeleccion>

      {ficha && (
        <FichaVenta
          key={ficha.fila.id} marca={marca} fila={ficha.fila} accionInicial={ficha.accion} puede={puede}
          onCerrar={() => setFicha(null)} onCambio={(t) => { setAviso(t); setVersion((v) => v + 1); cargar() }}
          abrirVentana={(tipo) => abrirVentana(tipo, ficha.fila, true)} irACaja={irACaja}
          version={version}
        />
      )}
      {ventana?.tipo === 'cobro' && <VentanaCobro marca={marca} fila={ventana.fila} puede={puede} onCerrar={cerrarVentana} onHecho={despuesDeGuardar} />}
      {ventana?.tipo === 'editar' && <VentanaEditar marca={marca} fila={ventana.fila} puede={puede} vendedores={vendedores} onCerrar={cerrarVentana} onHecho={despuesDeGuardar} irACaja={irACaja} abrirCobro={() => setVentana({ ...ventana, tipo: 'cobro' })} anular={() => abrirFicha(ventana.fila, 'anular')} />}
    </div>
  )
}
