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

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import {
  Button, EmptyState, Icono, MenuAcciones, Notice, Select, color, font, space, weight, type AccionMenu,
} from '@/components/ui'
import { ListaTrabajo, IconoFila, type OrdenLista } from '@/components/ui/ListaTrabajo'
import { PanelColumnas } from '@/components/ui/PanelColumnas'
import { AccionSeleccion, BarraSeleccion } from '@/components/ui/FichaCostado'
import { BuscadorLista, ChipEstado, TileResumen, VistasLista, cuandoCorto } from '@/components/ui/PiezasLista'
import { leerListaDeVentas, type FilaVentaLista, type MarcaErp, type QueSabeElMotor } from '@/lib/erp/cliente'
import {
  COBRO, COLUMNAS, ESTADO, ORIGEN, PERIODOS, VISTAS, accionesDeFila, alternarColumna, contarVistas, filtrar, moverColumna,
  PEDIDO_VIEJO_DIAS, normalizarPrefs, ordenar, plata, rangoDePeriodo, resumen,
} from '@/lib/erp/ventas-lista.core.js'
import { guardarPrefsDeLista, leerPrefsDeLista } from '@/lib/erp/lista-prefs'
import { diaArgentino } from '@/lib/envios/portal.core.js'
import { FichaVenta } from './FichaVenta'
import { CargarVenta } from './CargarVenta'
import { VentanaCobro, VentanaEditar } from './VentanasVenta'
import { useLineaErp } from '@/lib/erp/linea-erp'
const ANCHO_SELECT: React.CSSProperties = { cursor: 'pointer', width: 'auto', flex: '0 0 auto' }

export type Prefs = { orden: string[]; visibles: string[] }
type Ventana = { tipo: 'cobro' | 'editar'; fila: FilaVentaLista; desdeFicha: boolean } | null

/** El `Select` del kit es de ancho 100% (formularios): en la barra cada desplegable mide lo suyo, ⛔ una fila entera. */

const ORIGENES: Array<[string, string]> = [['', 'Todos los orígenes'], ['caja', 'Caja'], ['tn', 'Tienda Nube'], ['mayorista', 'Mayorista'], ['ml', 'Mercado Libre']]

/** El CSV de las elegidas, para Excel en castellano (`;`, coma decimal, BOM). */
function bajarCsv(filas: FilaVentaLista[]) {
  const c = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`
  const renglones = [['Nº', 'Fecha', 'Cliente', 'Origen', 'Estado', 'Cobro', 'Total', 'Saldo', 'Factura', 'Vendió', 'Nota'].map(c).join(';')]
  for (const f of filas) {
    renglones.push([f.ref, cuandoCorto(f.pedidoEn), f.cliente, f.origenTexto, ESTADO[f.estadoKey]?.[1] ?? f.estadoKey, COBRO[f.cobroKey]?.[1] ?? f.cobroKey,
      String(f.total).replace('.', ','), String(f.saldo).replace('.', ','), f.factura?.numero ?? '', f.vendio, f.nota?.texto ?? ''].map(c).join(';'))
  }
  const url = URL.createObjectURL(new Blob(['﻿' + renglones.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `ventas-${diaArgentino(Date.now())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function VentasErp({ irACaja, abrir, alAbrir }: {
  irACaja: (que: 'cambio' | 'factura') => void
  /** Desde la búsqueda global (⌘K): la venta que se abre sola cuando llega la lista (en su período). */
  abrir?: { id: string; numero: number; periodo: string } | null
  alAbrir?: () => void
}) {
  const { marca: delShell, perfil } = useSesion()
  const [cargarAbierta, setCargarAbierta] = useState(false)
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const usuario = perfil?.name ?? null
  const [periodo, setPeriodo] = useState(abrir?.periodo ?? 'mes')
  const abrirRef = useRef({ abrir, alAbrir })
  useEffect(() => { abrirRef.current = { abrir, alAbrir } })
  const [datos, setDatos] = useState<{ filas: FilaVentaLista[]; puede: QueSabeElMotor; tnLeidaEn: string | null; clave: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [vista, setVista] = useState('todas')
  const [q, setQ] = useState('')
  const [origen, setOrigen] = useState('')
  const linea = useLineaErp()
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
        setDatos({ filas: d.filas, puede: d.puede, tnLeidaEn: d.tnLeidaEn ?? null, clave })
        // Lo tildado ⛔ sobrevive a una lectura nueva: puede haber cambiado (una anulada ya no se exporta igual).
        setSeleccion(new Set())
        setError(null)
        const { abrir: pedida, alAbrir: soltar } = abrirRef.current
        if (pedida) {
          const f = d.filas.find((x: FilaVentaLista) => x.id === pedida.id)
          if (f) setFicha({ fila: f })
          else setAviso(`No encontré la venta #${pedida.numero} en ${PERIODOS.find(([k]) => k === periodo)?.[1].toLowerCase() ?? 'este período'}.`)
          soltar?.()
        }
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
  const vendedores = useMemo(() => [...new Set((datos?.filas ?? []).map((f) => f.vendio).filter((x) => x && x !== '—' && x !== 'Tienda Nube' && x !== 'Desde Gestión Nube'))].sort(), [datos])
  const nombrePeriodo = PERIODOS.find(([k]) => k === periodo)?.[1] ?? ''

  const irACobranzas = () => window.open('/cobranzas', '_blank', 'noopener')
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
    if (k === 'h') return <span style={{ color: color.mut }}>{cuandoCorto(f.pedidoEn)}</span>
    if (k === 'c') {
      return (
        <span title={`${f.cliente}${f.clienteDe === 'gn' ? ' · el nombre sale de Gestión Nube (la venta todavía no tiene cliente del ERP)' : f.clienteDe === 'falta' ? (f.kind === 'pedido' ? ' · un pedido sin pagar todavía no llegó a Gestión Nube: el nombre aparece cuando se cobra' : ' · el nombre llega de Gestión Nube, al otro día') : ''}`}>
          <span style={{ color: f.clienteDe === 'falta' ? color.mut2 : color.ink, fontStyle: f.clienteDe === 'falta' ? 'italic' : undefined }}>{f.cliente}</span>
          {f.clienteDe === 'gn' && <span style={{ marginLeft: 6, fontSize: font.xs, color: color.mut2 }}>de Gestión Nube</span>}
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
    if (k === 'e') {
      // Un pedido colgado hace días: a cobrar o a cancelar ya (lo que marcaba la pestaña «Pedidos sin pagar»).
      const viejo = f.kind === 'pedido' && (f.dias ?? 0) >= PEDIDO_VIEJO_DIAS
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ChipEstado mapa={ESTADO} k={f.estadoKey} />
          {f.entregadoSinCobrar && <span title="Tienda Nube lo cerró sin que se cobrara: ya no retiene stock" style={{ fontSize: font.xs, fontWeight: weight.semibold, color: 'var(--mo-danger-ink)', whiteSpace: 'nowrap' }}>entregado</span>}
          {viejo && !f.entregadoSinCobrar && <span title={`Entró hace ${f.dias} días y sigue sin pagar`} style={{ fontSize: font.xs, fontWeight: weight.semibold, color: 'var(--mo-warning-ink)', whiteSpace: 'nowrap' }}>{f.dias} días</span>}
        </span>
      )
    }
    if (k === 'p') return <ChipEstado mapa={COBRO} k={f.cobroKey} />
    if (k === 'total') return <b>{plata(f.total)}</b>
    if (k === 'fac') return f.factura ? <span style={{ color: color.ink2 }}>{f.factura.numero}{f.factura.de === 'gn' && <span style={{ marginLeft: 4, fontSize: font.xs, color: color.mut2 }}>Gestión Nube</span>}</span> : <span style={{ color: color.mut2 }}>—</span>
    if (k === 'ven') return <span style={{ color: color.ink2 }}>{f.vendio}</span>
    if (k === 'nota') return f.nota ? <span style={{ color: 'var(--mo-warning-ink)' }} title={`Nota · ${f.nota.de}`}>{f.nota.texto}</span> : <span style={{ color: color.mut2 }}>—</span>
    if (k === 'linea') return <span style={{ color: color.ink2 }}>{{ bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }[f.linea] ?? f.linea}</span>
    return null
  }

  const acciones = (f: FilaVentaLista) => {
    const a = accionesDeFila(f, puede)
    const menu: AccionMenu[] = f.kind === 'pedido'
      ? [
          { key: 'ficha', label: 'Abrir la ficha', icono: 'abrir', onClick: () => abrirFicha(f) },
          { key: 'cobrar', label: 'Cobrar en Cobranzas ↗', icono: 'pesos', onClick: irACobranzas, hint: 'Transferencia o efectivo: se registra en Cobranzas del monitor.' },
          { key: 'tn', label: 'Ver el pedido en Tienda Nube ↗', icono: 'abrir', onClick: () => f.link && window.open(f.link, '_blank', 'noopener'), disabled: !f.link, hint: 'Para cancelarlo, en Tienda Nube.' },
        ]
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
        <IconoFila label={a.cobro.label} verde={a.cobro.verde} apagado={!a.cobro.activo} onClick={() => (f.kind === 'pedido' ? irACobranzas() : f.saldo > 0 ? abrirVentana('cobro', f, false) : abrirFicha(f))}><Icono nombre="pesos" size={16} /></IconoFila>
        <IconoFila label={a.editar.label} apagado={!a.editar.activo} onClick={() => abrirVentana('editar', f, false)}><Icono nombre="lapiz" size={16} /></IconoFila>
        <IconoFila label={a.factura.label} verde={a.factura.verde} apagado={!a.factura.activo} onClick={() => (f.facturada ? abrirFicha(f) : irACaja('factura'))}><Icono nombre="factura" size={16} /></IconoFila>
        <MenuAcciones acciones={menu} etiqueta={`Más acciones de la venta ${f.ref}`} vertical alinear="izquierda" />
      </>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {/* El título «Ventas» lo pone el menú del ERP (`Erp.tsx`) arriba de las pestañas. */}
      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: color.mut, flex: '1 1 320px' }}>Caja, Tienda Nube, mayoristas y cambios, en una sola lista.</p>
        <Button onClick={() => setCargarAbierta(true)}>Cargar venta</Button>
      </div>
      {cargarAbierta && <CargarVenta marca={marca} onCerrar={() => setCargarAbierta(false)} onCargada={(t) => { setCargarAbierta(false); setAviso(t); cargar() }} />}

      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {aviso && <Notice tone="success" onClose={() => setAviso(null)}>{aviso}</Notice>}

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
        <TileResumen titulo={`Vendido · ${nombrePeriodo.toLowerCase()}`} valor={plata(res.vendido)} oscuro />
        <TileResumen titulo="Ventas" valor={res.ventas.toLocaleString('es-AR')} />
        <TileResumen titulo="Ticket promedio" valor={plata(res.ticket)} />
        <TileResumen titulo="Por cobrar" valor={plata(res.porCobrar)} nota={res.sinPagar ? `y ${plata(res.sinPagar)} reservado sin pagar` : undefined} />
      </div>

      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <VistasLista vistas={VISTAS} valor={vista} conteo={conteo} onCambio={(k) => { setVista(k); setSeleccion(new Set()) }} />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar en las ventas" placeholder="Número, pedido de Tienda Nube, cliente o nota" />
          <Select aria-label="Período" style={ANCHO_SELECT} value={periodo} onChange={(e) => { setFicha(null); setPeriodo(e.target.value) }}>{PERIODOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select>
          <Select aria-label="Origen" style={ANCHO_SELECT} value={origen} onChange={(e) => setOrigen(e.target.value)}>{ORIGENES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select>
          <PanelColumnas
            columnas={prefs.orden.map((k) => ({ key: k, titulo: COLUMNAS[k][0], visible: prefs.visibles.includes(k), fija: COLUMNAS[k][3] }))}
            onAlternar={(k) => setPrefs(alternarColumna(prefs, k))}
            onMover={(k, d) => setPrefs(moverColumna(prefs, k, d))}
            onRestablecer={() => setPrefs({ ...normalizarPrefs(null) })}
          />
          <Button variant="outline" disabled={cargando} onClick={() => cargar()}>{cargando ? 'Leyendo…' : 'Actualizar'}</Button>
        </div>
        <ListaTrabajo
          columnas={columnas} filas={filas} claveDe={(f) => f.id} celda={celda} acciones={acciones} anchoAcciones={120}
          seleccion={seleccion} onSeleccion={setSeleccion} orden={orden} onOrden={setOrden}
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
          {' · '}los pedidos sin pagar son los abiertos hoy, de cualquier fecha{datos?.tnLeidaEn ? ` (Tienda Nube leída ${cuandoCorto(datos.tnLeidaEn)})` : ''}.
        </div>
      </div>

      <BarraSeleccion cuantas={elegidas.length} onSoltar={() => setSeleccion(new Set())}>
        <span style={{ color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>{plata(elegidas.reduce((a, f) => a + f.total, 0))}</span>
        <AccionSeleccion icono="bajar" onClick={() => bajarCsv(elegidas)}>Exportar las elegidas</AccionSeleccion>
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
