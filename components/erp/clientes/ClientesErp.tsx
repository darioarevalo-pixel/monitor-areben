'use client'

/**
 * ERP › Clientes y proveedores › Clientes, con el molde del diseño aprobado (`~/Documents/erp-monitor/diseno.md` §3, §4 y §7;
 * tablero 4 del v8): UNA lista con cada cliente, vistas con su número, el resumen ARRIBA, buscador, columnas a elección
 * (guardadas por usuario) y la ficha AL COSTADO con el saldo de la cuenta y sus compras.
 * Núcleo puro: `lib/erp/clientes-lista.core.js`; servidor: `api/_erp-clientes.js`.
 *
 * 🔑 Hoy los clientes salen del espejo de GN: el motor todavía ⛔ tiene clientes ni cuentas corrientes (medido 19-oct) ⇒
 *    la columna «Saldo de la cuenta» dice «sin cuenta» y la pantalla lo explica (⛔ un 0 que parece «al día»).
 * 🔑 Botones (§4, lista de TRABAJO): íconos a la izquierda. «Nuevo cliente» y «Registrar cobro a cuenta» esperan al motor.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, Icono, MenuAcciones, MoneyText, Notice, color, font, space, type AccionMenu } from '@/components/ui'
import { formatMoney } from '@/components/ui/MoneyText'
import { ListaTrabajo, IconoFila, type OrdenLista } from '@/components/ui/ListaTrabajo'
import { PanelColumnas } from '@/components/ui/PanelColumnas'
import { AccionSeleccion, BarraSeleccion } from '@/components/ui/FichaCostado'
import { BuscadorLista, ChipEstado, InterruptorDensidad, TileResumen, VistasLista } from '@/components/ui/PiezasLista'
import { leerListaDeClientes, type FilaCliente, type ListaDeClientes, type MarcaErp } from '@/lib/erp/cliente'
import {
  VISTAS, alternarColumna, columnasDe, contarVistas, filtrar, moverColumna, normalizarPrefs, ordenar, resumen,
} from '@/lib/erp/clientes-lista.core.js'
import { guardarPrefsDeLista, leerPrefsDeLista } from '@/lib/erp/lista-prefs'
import { diaArgentino } from '@/lib/envios/portal.core.js'
import { FichaCliente, fechaCorta } from './FichaCliente'

type Prefs = { orden: string[]; visibles: string[]; densidad: 'compacta' | 'comoda' }

const COLUMNAS = columnasDe()
/** Cuántas filas se dibujan de una (la lista ⛔ es virtual: BDI tiene más de 13.000 clientes). */
const DE_A = 300
const n = (x: number) => x.toLocaleString('es-AR')

function bajarCsv(filas: FilaCliente[], marca: MarcaErp) {
  const c = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`
  const renglones = [['Cliente', 'Tipo', 'DNI / CUIT', 'Compras', 'Comprado', 'Primera compra', 'Última compra', 'Canales', 'Saldo de la cuenta'].map(c).join(';')]
  for (const f of filas) renglones.push([f.nombre, f.mayorista ? 'Mayorista' : 'Minorista', f.doc, f.compras, f.total.toFixed(2).replace('.', ','), f.primera, f.ultima, f.canales.join(', '), f.saldo == null ? '' : f.saldo.toFixed(2).replace('.', ',')].map(c).join(';'))
  const url = URL.createObjectURL(new Blob(['﻿' + renglones.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `clientes-${marca}-${diaArgentino(Date.now())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function ClientesErp({ abrir, alAbrir }: {
  /** Desde la búsqueda global (⌘K): el cliente (por documento) que se abre solo cuando llega la lista. */
  abrir?: { doc: string } | null
  alAbrir?: () => void
} = {}) {
  const { marca: delShell, perfil } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const usuario = perfil?.name ?? null
  const lista = 'erp-clientes'
  const [datos, setDatos] = useState<(ListaDeClientes & { clave: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState('todos')
  const [q, setQ] = useState('')
  const [orden, setOrden] = useState<OrdenLista>(null)
  const [tanda, setTanda] = useState({ de: '', n: DE_A })
  const [prefs, setPrefsState] = useState<Prefs>(() => normalizarPrefs(typeof window === 'undefined' ? null : leerPrefsDeLista(lista, usuario)))
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [ficha, setFicha] = useState<FilaCliente | null>(null)
  const setPrefs = (p: Prefs) => { setPrefsState(p); guardarPrefsDeLista(lista, usuario, p) }
  const abrirRef = useRef({ abrir, alAbrir })
  useEffect(() => { abrirRef.current = { abrir, alAbrir } })

  const [vuelta, setVuelta] = useState(0)
  const clave = `${marca}|${vuelta}`
  useEffect(() => {
    let vivo = true
    leerListaDeClientes(marca)
      .then((d) => {
        if (!vivo) return
        setDatos({ ...d, clave }); setSeleccion(new Set()); setError(null)
        const { abrir: pedido, alAbrir: soltar } = abrirRef.current
        if (pedido) {
          const f = d.filas.find((x) => x.doc === pedido.doc)
          if (f) setFicha(f)
          else setError(`El documento ${pedido.doc} todavía no está en la lista de clientes.`)
          soltar?.()
        }
      })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : 'No se pudieron leer los clientes.'); setDatos((x) => (x ? { ...x, clave } : x)) } })
    return () => { vivo = false }
  }, [marca, clave])
  const cargando = datos?.clave !== clave

  const base = useMemo(() => filtrar(datos?.filas ?? [], { q }), [datos, q])
  const conteo = useMemo(() => contarVistas(base), [base])
  const enVista = useMemo(() => filtrar(base, { vista }), [base, vista])
  const filas: FilaCliente[] = useMemo(() => ordenar(enVista, orden), [enVista, orden])
  const res = useMemo(() => resumen(enVista), [enVista])
  const elegidas = filas.filter((f) => seleccion.has(f.id))
  const mirada = `${vista}|${q}|${orden?.col ?? ''}|${orden?.dir ?? ''}`
  const mostrar = tanda.de === mirada ? tanda.n : DE_A
  const sinCuentas = !!datos && datos.clientesErp === 0

  const columnas = prefs.visibles.map((k) => {
    const [titulo, ancho, ordena] = COLUMNAS[k]
    return { key: k, titulo, ancho, ordena, derecha: ['compras', 'total', 'saldo'].includes(k) }
  })

  const celda = (f: FilaCliente, k: string): React.ReactNode => {
    if (k === 'c') return <b title={f.nombre} style={{ color: color.ink }}>{f.nombre}</b>
    if (k === 'tipo') return f.mayorista ? <ChipEstado mapa={{ m: ['action', 'Mayorista'] }} k="m" /> : <span style={{ color: color.mut }}>Minorista</span>
    if (k === 'doc') return <span style={{ color: f.doc ? color.ink2 : color.mut2 }}>{f.doc ?? '—'}</span>
    if (k === 'compras') return <span style={{ color: color.ink }}>{n(f.compras)}</span>
    if (k === 'total') return <MoneyText value={f.total} />
    if (k === 'ultima') return <span style={{ color: f.esteMes ? color.ink : color.mut }}>{fechaCorta(f.ultima)}</span>
    if (k === 'primera') return <span style={{ color: color.mut }}>{fechaCorta(f.primera)}</span>
    if (k === 'canales') return <span title={f.canales.join(', ')} style={{ color: color.mut }}>{f.canales.join(' · ') || '—'}</span>
    if (k === 'saldo') {
      if (f.saldo == null) return <span style={{ color: color.mut2 }} title="El ERP todavía no lleva la cuenta de este cliente">sin cuenta</span>
      if (f.saldo === 0) return <span style={{ color: color.mut }}>al día</span>
      return <span style={{ fontWeight: 700, color: f.vencido ? 'var(--mo-danger-ink)' : f.saldo < 0 ? 'var(--mo-success-ink)' : color.ink }}>{f.saldo < 0 ? `${formatMoney(-f.saldo)} a favor` : formatMoney(f.saldo)}</span>
    }
    return null
  }

  const acciones = (f: FilaCliente) => {
    const menu: AccionMenu[] = [
      { key: 'ficha', label: 'Abrir la ficha', icono: 'abrir', onClick: () => setFicha(f) },
      { key: 'csv', label: 'Exportar sus datos', icono: 'bajar', onClick: () => bajarCsv([f], marca) },
    ]
    return (
      <>
        <IconoFila label="Abrir la ficha" onClick={() => setFicha(f)}><Icono nombre="abrir" size={16} /></IconoFila>
        <MenuAcciones acciones={menu} etiqueta={`Más acciones del cliente ${f.nombre}`} vertical alinear="izquierda" />
      </>
    )
  }

  const nombreVista = VISTAS.find(([k]) => k === vista)?.[1] ?? ''
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <p style={{ margin: 0, color: color.mut }}>Cada cliente con lo que compró y el saldo de su cuenta.</p>
      {sinCuentas && (
        <Notice tone="warning">
          Los clientes salen de <b>Gestión Nube</b>: el ERP todavía no tiene clientes propios (ninguna venta del ERP trae cliente),
          así que todavía no lleva cuentas corrientes. El saldo aparece acá cuando se venda a cuenta desde el ERP.
          {datos?.porNombre && <> En Zattia, GN no manda el número de cliente: se juntan por <b>nombre</b> (dos con el mismo nombre se ven como uno).</>}
        </Notice>
      )}
      {datos && !datos.cuentaLista && <Notice tone="warning">No se pudo leer la cuenta corriente del motor: el saldo no se muestra.</Notice>}
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
        <TileResumen titulo="Por cobrar" valor={sinCuentas ? '—' : formatMoney(res.porCobrar)} oscuro nota={sinCuentas ? 'todavía sin cuentas corrientes' : 'lo que deben − lo que tienen a favor'} />
        <TileResumen titulo="Compraron este mes" valor={n(res.compraron)} nota={`de ${n(res.clientes)} en ${nombreVista.toLowerCase()}`} />
        <TileResumen titulo="Mayoristas" valor={n(res.mayoristas)} nota="con alguna compra mayorista" />
        <TileResumen titulo="Comprado" valor={formatMoney(res.total)} nota={`${n(res.clientes)} clientes`} />
      </div>

      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <VistasLista vistas={VISTAS} valor={vista} conteo={conteo} onCambio={(k) => { setVista(k); setSeleccion(new Set()) }} />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar un cliente" placeholder="Nombre o DNI / CUIT" />
          <InterruptorDensidad valor={prefs.densidad} onCambio={(d) => setPrefs({ ...prefs, densidad: d })} />
          <PanelColumnas
            columnas={prefs.orden.map((k) => ({ key: k, titulo: COLUMNAS[k][0], visible: prefs.visibles.includes(k), fija: COLUMNAS[k][3] }))}
            onAlternar={(k) => setPrefs(alternarColumna(prefs, k))}
            onMover={(k, d) => setPrefs(moverColumna(prefs, k, d))}
            onRestablecer={() => setPrefs({ ...normalizarPrefs(null), densidad: prefs.densidad })}
          />
          <Button variant="outline" disabled={cargando} onClick={() => setVuelta((x) => x + 1)}>{cargando ? 'Leyendo…' : 'Actualizar'}</Button>
          <Button variant="outline" disabled={!filas.length} onClick={() => bajarCsv(filas, marca)}>Exportar</Button>
        </div>
        <ListaTrabajo
          columnas={columnas} filas={filas.slice(0, mostrar)} claveDe={(f) => f.id} celda={celda} acciones={acciones} anchoAcciones={72}
          seleccion={seleccion} onSeleccion={setSeleccion} orden={orden} onOrden={setOrden} densidad={prefs.densidad}
          activa={ficha?.id ?? null} onAbrir={setFicha} etiquetaFila={(f) => `el cliente ${f.nombre}`}
          vacio={!cargando && datos ? (
            <div style={{ padding: space[6] }}>
              <EmptyState title={q ? 'No hay clientes con ese nombre o documento.' : 'No hay clientes en esta vista.'} />
              {vista !== 'todos' && <div style={{ textAlign: 'center' }}><Button variant="outline" onClick={() => setVista('todos')}>Ver todos</Button></div>}
            </div>
          ) : null}
        />
        {filas.length > mostrar && (
          <div style={{ padding: 12, textAlign: 'center', borderTop: `1px solid ${color.bg2}` }}>
            <Button variant="outline" onClick={() => setTanda({ de: mirada, n: mostrar + DE_A })}>Mostrar {n(Math.min(DE_A, filas.length - mostrar))} más</Button>
          </div>
        )}
        <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
          {cargando && !datos ? 'Leyendo los clientes…' : `${n(Math.min(mostrar, filas.length))} de ${n(filas.length)}`}
          {datos && <> · compras de GN hasta {fechaCorta(datos.gnHasta)} · sin «Consumidor Final»</>}
        </div>
      </div>

      <BarraSeleccion cuantas={elegidas.length} onSoltar={() => setSeleccion(new Set())}>
        <AccionSeleccion icono="bajar" onClick={() => bajarCsv(elegidas, marca)}>Exportar los elegidos</AccionSeleccion>
      </BarraSeleccion>

      {ficha && <FichaCliente key={`${marca}/${ficha.id}`} marca={marca} fila={ficha} onCerrar={() => setFicha(null)} />}
    </div>
  )
}
