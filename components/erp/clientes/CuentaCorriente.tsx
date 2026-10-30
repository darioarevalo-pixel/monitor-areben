'use client'

/**
 * ERP › Clientes y proveedores › Cuenta corriente (🎨 20-oct, Diseño 8 · 7; tablero 4 del v8, pestaña «Cuenta corriente»;
 * contrato §15 de `~/Documents/erp-monitor/contrato-venta.md`): UNA lista con cada cliente que debe, tiene a favor o tiene
 * crédito, por línea; el resumen ARRIBA (por cobrar, atrasadas, a favor, los tramos de antigüedad), vistas con su número,
 * buscador, columnas por usuario y la ficha AL COSTADO con lo que debe venta por venta, el MAYOR y «Exportar» (Darío).
 * Núcleo puro: `lib/erp/cuenta-corriente.core.js`; servidor: `api/_erp-clientes.js` (`cuentasCorrientes`/`cuentaDe` del motor).
 *
 * 🔑 Dos libros que ⛔ se suman: el REAL y el de PRUEBA (las mayoristas de GN en sombra). Medido 20-oct: BDI 233 clientes
 *    (todos sin documento), 0 cuentas reales; las 22 compras a cuenta (15 clientes, $ 7,1 M) son de prueba ⇒ hasta el
 *    corte abre en PRUEBA (A, `mensaje-sesion-diseno-cc.md`). Los cobros a cuenta cargados en GN ⛔ llegan: saldos de más.
 * 🔑 «Marcar crédito» es sólo de admin (lo frena la puerta: la acción pide `configurar`).
 * ⛔ todavía (falta en el motor, PENDIENTES «Diseño 8» 7): «Cobros masivos», el último cobro y la cantidad de ventas con
 *    saldo en la fila (`cuentasCorrientes` ⛔ los trae), y el saldo de apertura de GN.
 */

import { useTiendaErp } from '@/lib/erp/linea-erp'
import { usePantallaAngosta } from '@/lib/movil'
import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, Icono, MenuAcciones, MoneyText, Notice, color, font, space, type AccionMenu } from '@/components/ui'
import { formatMoney } from '@/components/ui/MoneyText'
import { ListaTrabajo, IconoFila, type MovilColumna, type OrdenLista } from '@/components/ui/ListaTrabajo'
import { PanelColumnas } from '@/components/ui/PanelColumnas'
import { BuscadorLista, ChipEstado, TileResumen, VistasLista, estiloNombre, tonoDeConteo } from '@/components/ui/PiezasLista'
import { leerCuentasCorrientes, type CuentasDeLaMarca, type MarcaErp } from '@/lib/erp/cliente'
import {
  NOMBRE_LINEA, TRAMOS, VISTAS, alternarColumna, armarFilasCuenta, columnasDe, contarVistas, filtrar, moverColumna, normalizarPrefs, ordenar, resumen, textoCredito,
} from '@/lib/erp/cuenta-corriente.core.js'
import { guardarPrefsDeLista, leerPrefsDeLista } from '@/lib/erp/lista-prefs'
import { esAdmin } from '@/lib/permisos'
import { ESTADO_CUENTA, FichaCuenta, type FilaCuenta } from './FichaCuenta'
import { imprimirResumenDeFila } from './resumen-cuenta'
import { enlaceWhatsapp } from '@/lib/erp/resumen-cuenta.core.js'
import { fechaCorta } from './FichaCliente'

type Prefs = { orden: string[]; visibles: string[] }

const COLUMNAS = columnasDe()
/** 📱 Qué es cada columna en la tarjeta del celular; la que no está, `oculta`. */
const MOVIL: Record<string, MovilColumna> = { c: 'titulo', saldo: 'dato', linea: 'chico', dias: 'chico', estado: 'chico' }
const n = (x: number) => x.toLocaleString('es-AR')

/** 🎨 Tanda 3 (30-oct): ⛔ es pestaña aparte: es la vista «Con saldo» de Clientes (`embebida`), que muestra su número (`alContar`). */
export function CuentaCorriente({ embebida = false, alContar }: { embebida?: boolean; alContar?: (n: number | null) => void } = {}) {
  const { marca: delShell, perfil } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  // Las cuentas de la tienda del menú: mirando Stunned sumaba los saldos de Zattia (Bruno, 30-oct).
  const tienda = useTiendaErp()
  const usuario = perfil?.name ?? null
  const admin = esAdmin(perfil)
  const lista = 'erp-cuenta-corriente'
  // Hasta el corte con GN, las mayoristas de BDI son de PRUEBA (corren en sombra): se abre en ese libro (A, 20-oct).
  const [prueba, setPrueba] = useState(true)
  const [datos, setDatos] = useState<(CuentasDeLaMarca & { clave: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState('saldo')
  const [q, setQ] = useState('')
  const [orden, setOrden] = useState<OrdenLista>(null)
  const [prefs, setPrefsState] = useState<Prefs>(() => normalizarPrefs(typeof window === 'undefined' ? null : leerPrefsDeLista(lista, usuario)))
  const [ficha, setFicha] = useState<FilaCuenta | null>(null)
  const setPrefs = (p: Prefs) => { setPrefsState(p); guardarPrefsDeLista(lista, usuario, p) }

  const [vuelta, setVuelta] = useState(0)
  const clave = `${marca}|${tienda}|${prueba}|${vuelta}`
  useEffect(() => {
    let vivo = true
    leerCuentasCorrientes(marca, tienda, prueba)
      .then((d) => { if (vivo) { setDatos({ ...d, clave }); setError(null) } })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : 'No se pudo leer la cuenta corriente.'); setDatos((x) => (x ? { ...x, clave } : x)) } })
    return () => { vivo = false }
  }, [marca, tienda, prueba, clave])
  const cargando = datos?.clave !== clave

  const todas = useMemo(() => armarFilasCuenta(datos?.cuentas ?? []) as FilaCuenta[], [datos])
  const base = useMemo(() => filtrar(todas, { q }), [todas, q])
  const conteo = useMemo(() => contarVistas(base), [base])
  const filas: FilaCuenta[] = useMemo(() => ordenar(filtrar(base, { vista }), orden), [base, vista, orden])
  const res = useMemo(() => resumen(base), [base])
  // El número de «Con saldo» en Clientes: el de la vista con la que abre esta lista (el que daba la pantalla de antes).
  useEffect(() => { alContar?.(cargando ? null : conteo.saldo) }, [alContar, cargando, conteo])
  // Ya llega UNA línea (la del menú): la columna «Línea» ⛔ hace falta.
  const variasLineas = false

  // 📱 En el celular la tarjeta arma lo suyo con TODAS las columnas: las de `prefs` son de la compu.
  const angosta = usePantallaAngosta()
  const columnas = (angosta ? prefs.orden : prefs.visibles).filter((k) => variasLineas || k !== 'linea').map((k) => {
    const [titulo, ancho, ordena] = COLUMNAS[k]
    return { key: k, titulo, ancho, ordena, derecha: ['debe', 'favor', 'saldo', 'vencido', 'dias', ...TRAMOS].includes(k), movil: MOVIL[k] ?? 'oculta' }
  })

  const celda = (f: FilaCuenta, k: string): React.ReactNode => {
    if (k === 'c') return <span style={{ minWidth: 0 }}><span title={f.nombre} style={estiloNombre}>{f.nombre}</span><span style={{ color: f.doc ? color.mut : color.mut2 }}> · {f.doc ?? 'sin documento'}</span></span>
    if (k === 'linea') return <span style={{ color: color.mut }}>{NOMBRE_LINEA[f.linea as keyof typeof NOMBRE_LINEA] ?? f.linea}</span>
    if (k === 'debe') return f.debe ? <MoneyText value={f.debe} /> : <span style={{ color: color.mut2 }}>—</span>
    if (k === 'favor') return f.aFavor ? <span style={{ color: 'var(--mo-success-ink)' }}><MoneyText value={f.aFavor} /></span> : <span style={{ color: color.mut2 }}>—</span>
    if (k === 'saldo') return <span style={{ fontWeight: 700, color: f.saldo > 0 ? color.ink : f.saldo < 0 ? 'var(--mo-success-ink)' : color.mut2 }}>{f.saldo < 0 ? `${formatMoney(-f.saldo)} a favor` : formatMoney(f.saldo)}</span>
    if (k === 'vencido') return f.vencido ? <span style={{ color: 'var(--mo-danger-ink)' }}><MoneyText value={f.vencido} /></span> : <span style={{ color: color.mut2 }}>—</span>
    if (k === 'dias') return f.debe ? <span style={{ color: color.ink2 }}>{n(f.diasMayor)} días</span> : <span style={{ color: color.mut2 }}>—</span>
    if (k === 'ventas') return f.ventasConSaldo ? <span style={{ color: color.ink2 }}>{n(f.ventasConSaldo)}</span> : <span style={{ color: color.mut2 }}>—</span>
    if (k === 'cobro') return f.ultimoCobro ? <span style={{ color: color.ink2 }}>{`${String(f.ultimoCobro.fecha).slice(8, 10)}/${String(f.ultimoCobro.fecha).slice(5, 7)} · ${formatMoney(f.ultimoCobro.monto)}`}</span> : <span style={{ color: color.mut2 }}>Ninguno</span>
    if (k === 'credito') return <span title={f.credito?.puesto_por ? `Lo marcó ${f.credito.puesto_por}` : undefined} style={{ color: f.credito?.credito ? color.ink2 : color.mut }}>{textoCredito(f.credito, formatMoney)}</span>
    if (k === 'estado') return <ChipEstado mapa={ESTADO_CUENTA} k={f.estado} />
    if ((TRAMOS as string[]).includes(k)) return f.tramos[k] ? <MoneyText value={f.tramos[k]} /> : <span style={{ color: color.mut2 }}>—</span>
    return null
  }

  const acciones = (f: FilaCuenta) => {
    const wa = enlaceWhatsapp(f)
    const escribir = () => wa.url && window.open(wa.url, '_blank', 'noopener')
    const imprimir = () => { void imprimirResumenDeFila(marca, f, prueba).then((e) => e && setError(e)) }
    const menu: AccionMenu[] = [
      { key: 'ficha', label: 'Abrir la cuenta', icono: 'abrir', onClick: () => setFicha(f) },
      { key: 'wa', label: 'Escribir por WhatsApp', icono: 'whatsapp', onClick: escribir, disabled: !wa.url, hint: wa.motivo ?? undefined },
      { key: 'imprimir', label: 'Imprimir resumen de cuenta', icono: 'impresora', onClick: imprimir },
    ]
    return (
      <>
        <IconoFila label="Abrir la cuenta" onClick={() => setFicha(f)}><Icono nombre="abrir" size={16} /></IconoFila>
        <IconoFila label={wa.motivo ? `Escribir por WhatsApp · ${wa.motivo}` : 'Escribir por WhatsApp'} apagado={!wa.url} verde={!!wa.url} onClick={escribir}><Icono nombre="whatsapp" size={16} /></IconoFila>
        <IconoFila label="Imprimir resumen de cuenta" onClick={imprimir}><Icono nombre="impresora" size={16} /></IconoFila>
        <MenuAcciones acciones={menu} etiqueta={`Más acciones de la cuenta de ${f.nombre}`} vertical alinear="izquierda" />
      </>
    )
  }

  const libro = prueba ? 'de prueba' : 'reales'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {!embebida && <p style={{ margin: 0, color: color.mut }}>Un solo saldo por cliente: lo que deben sus ventas a cuenta, menos lo que tiene a favor.</p>}
      {datos && datos.clientesErp === 0 && (
        <Notice tone="neutral">Esta marca todavía no tiene clientes en el ERP: la cuenta corriente empieza cuando se le venda a cuenta a un cliente desde el ERP.</Notice>
      )}
      {datos && datos.clientesErp > 0 && (prueba || datos.otroLibro > 0) && (
        <Notice tone={prueba ? 'warning' : 'neutral'}>
          {prueba
            ? <>Estás mirando las cuentas <b>de prueba</b>: las ventas mayoristas que el ERP copia de Gestión Nube hasta el corte. Los cobros a cuenta que se cargan en Gestión Nube todavía no llegan acá, así que algunos saldos dan de más. {datos.otroLibro ? `Hay ${n(datos.otroLibro)} ${datos.otroLibro === 1 ? 'cliente' : 'clientes'} con movimientos reales.` : 'Todavía no hay ninguna cuenta real.'}</>
            : <>Hay {n(datos.otroLibro)} {datos.otroLibro === 1 ? 'cliente' : 'clientes'} con movimientos <b>de prueba</b>, que no se suman acá. <Button variant="outline" onClick={() => setPrueba(true)}>Ver las de prueba</Button></>}
        </Notice>
      )}
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
        <TileResumen titulo="Por cobrar" valor={formatMoney(res.porCobrar)} oscuro nota={`${n(res.conSaldo)} ${res.conSaldo === 1 ? 'cuenta' : 'cuentas'} con saldo · lo que deben − lo que tienen a favor`} />
        <TileResumen tono={tonoDeConteo(res.vencido)} titulo="Vencido" valor={formatMoney(res.vencido)} nota={`${n(res.atrasadas)} ${res.atrasadas === 1 ? 'atrasada' : 'atrasadas'}`} />
        <TileResumen titulo="Saldo a favor" valor={formatMoney(res.aFavor)} nota={`${n(res.conFavor)} ${res.conFavor === 1 ? 'cliente' : 'clientes'}`} />
        <TileResumen titulo="Por antigüedad" valor={formatMoney(res.tramos['más de 90'])} nota={`más de 90 días · 61–90 ${formatMoney(res.tramos['61–90'])} · 31–60 ${formatMoney(res.tramos['31–60'])} · 0–30 ${formatMoney(res.tramos['0–30'])}`} />
      </div>

      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <VistasLista vistas={VISTAS} valor={vista} conteo={conteo} onCambio={setVista} />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar un cliente" placeholder="Nombre o DNI / CUIT" />
          <div role="group" aria-label="Qué cuentas" style={{ display: 'flex', gap: 4 }}>
            <Button variant={prueba ? 'outline' : 'solid'} aria-pressed={!prueba} onClick={() => { setPrueba(false); setFicha(null) }}>Reales</Button>
            <Button variant={prueba ? 'solid' : 'outline'} aria-pressed={prueba} onClick={() => { setPrueba(true); setFicha(null) }}>De prueba</Button>
          </div>
          <PanelColumnas
            columnas={prefs.orden.filter((k) => variasLineas || k !== 'linea').map((k) => ({ key: k, titulo: COLUMNAS[k][0], visible: prefs.visibles.includes(k), fija: COLUMNAS[k][3] }))}
            onAlternar={(k) => setPrefs(alternarColumna(prefs, k))}
            onMover={(k, d) => setPrefs(moverColumna(prefs, k, d))}
            onRestablecer={() => setPrefs({ ...normalizarPrefs(null) })}
          />
          <Button variant="outline" disabled={cargando} onClick={() => setVuelta((x) => x + 1)}>{cargando ? 'Leyendo…' : 'Actualizar'}</Button>
        </div>
        <ListaTrabajo
          columnas={columnas} filas={filas} claveDe={(f) => f.id} celda={celda} acciones={acciones} anchoAcciones={136}
          orden={orden} onOrden={setOrden}
          activa={ficha?.id ?? null} onAbrir={setFicha} etiquetaFila={(f) => `la cuenta de ${f.nombre}`}
          vacio={!cargando && datos ? (
            <div style={{ padding: space[6] }}>
              <EmptyState title={q ? 'No hay cuentas con ese nombre o documento.' : todas.length ? 'No hay cuentas en esta vista.' : `No hay cuentas corrientes ${libro} todavía.`} />
              {vista !== 'todas' && todas.length > 0 && <div style={{ textAlign: 'center' }}><Button variant="outline" onClick={() => setVista('todas')}>Ver todas</Button></div>}
            </div>
          ) : null}
        />
        <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
          {cargando && !datos ? 'Leyendo las cuentas…' : `${n(filas.length)} de ${n(todas.length)} cuentas ${libro}`}
          {datos?.hoy && <> · al {fechaCorta(datos.hoy)} · las atrasadas primero</>}
        </div>
      </div>

      {ficha && <FichaCuenta key={`${marca}/${prueba}/${ficha.id}`} marca={marca} fila={ficha} prueba={prueba} admin={admin} onCerrar={() => setFicha(null)} onCambio={() => setVuelta((x) => x + 1)} />}
    </div>
  )
}
