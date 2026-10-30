'use client'

/**
 * ERP › Ventas › Cobros, con el molde del diseño aprobado (`~/Documents/erp-monitor/diseno.md` §3, §4 y §7; tablero 2 del
 * v8): la lista de REGISTRO de lo que se cobró — los cobros de las ventas, los pagos a cuenta y las devoluciones en plata
 * (`cobrosDe` del motor, contrato §18). Nada se borra: lo anulado queda marcado. Vistas con su número, período, buscador,
 * resumen ARRIBA (cobrado y por medio), columnas por usuario y «Exportar». Clic ⇒ el cobro al costado.
 * Núcleo puro: `lib/erp/cobros.core.js`; servidor: `api/_erp-cobros.js` (`vista=cobros`).
 *
 * 🔴 Hasta el corte todo lo del ERP es DE PRUEBA (corre en paralelo con GN) ⇒ abre en «De prueba», como Cuenta corriente.
 * La vista «Contraentrega» muestra lo que está EN LA CALLE hoy (ventas que cobra el cadete al entregar, contrato §20): ⛔ es
 * un cobro ni depende del período; su cierre sí, y entra con los demás.
 * ⛔ Todavía (motor, sesión A): por validar con lo que llegó a MP, cobros masivos, cheques ⇒ la pantalla lo dice.
 */

import { usePantallaAngosta } from '@/lib/movil'
import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, Notice, color, font, space, useConfirmar, weight, Select } from '@/components/ui'
import { ListaTrabajo, type MovilColumna, type OrdenLista } from '@/components/ui/ListaTrabajo'
import { PanelColumnas } from '@/components/ui/PanelColumnas'
import { AccionSeleccion, BarraSeleccion, DatoFicha, DatosFicha, FichaCostado } from '@/components/ui/FichaCostado'
import { BuscadorLista, ChipEstado, TileResumen, VistasLista, cuandoCorto } from '@/components/ui/PiezasLista'
import { leerCobros, reintentarEntregas, type CobrosDelPeriodo, type MarcaErp } from '@/lib/erp/cliente'
import { usePuedeErp } from '@/lib/erp/usePuedeErp'
import {
  COLUMNAS, NOMBRE_LINEA, NOMBRE_MEDIO, PERIODOS_COBROS, VISTAS, alternarColumna, armarCobro, armarContraentrega, armarEntregaSinCobrar, contarVistas, filtrar, mediosOrdenados,
  moverColumna, normalizarPrefs, ordenar, rangoDeCobros, resumen, textoDelReintento,
} from '@/lib/erp/cobros.core.js'
import { guardarPrefsDeLista, leerPrefsDeLista } from '@/lib/erp/lista-prefs'
import { diaArgentino } from '@/lib/envios/portal.core.js'
import { useLineaErp, useTiendaErp } from '@/lib/erp/linea-erp'
const ANCHO_SELECT: React.CSSProperties = { cursor: 'pointer', width: 'auto', flex: '0 0 auto' }

type Prefs = { orden: string[]; visibles: string[] }
/** 📱 Qué es cada columna en la tarjeta del celular; la que no está, `oculta`. */
const MOVIL: Record<string, MovilColumna> = { que: 'titulo', monto: 'dato', h: 'chico', cliente: 'chico', medio: 'chico' }
type FilaCobro = ReturnType<typeof armarCobro> & Partial<Omit<ReturnType<typeof armarEntregaSinCobrar>, keyof ReturnType<typeof armarCobro>>>

const LINEA = NOMBRE_LINEA as Record<string, string>
const MEDIO = NOMBRE_MEDIO as Record<string, string>
const DE_A = 300
const ANULADO = { anulado: ['neutral', 'Anulado'] } as const
const $ = (n: number) => `$ ${Math.round(n).toLocaleString('es-AR')}`
const $exacto = (n: number) => `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const diaCorto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

function bajarCsv(filas: FilaCobro[], marca: MarcaErp, desde: string, hasta: string) {
  const c = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`
  const renglones = [['Cuándo', 'Qué', 'Cliente', 'Medio', 'Cuenta', 'Entra a', 'Monto', 'Quién', 'Comisión', 'Se acredita', 'Anulado', 'Línea'].map(c).join(';')]
  for (const f of filas) {
    renglones.push([cuandoCorto(f.cuando), f.que, f.cliente, f.medioTexto, f.cuenta, f.entraA, String(f.monto).replace('.', ','), f.quien,
      f.comision == null ? '' : String(f.comision).replace('.', ','), f.acreditaEl, f.anulado ? 'sí' : '', LINEA[f.linea] ?? f.linea].map(c).join(';'))
  }
  const url = URL.createObjectURL(new Blob(['﻿' + renglones.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `cobros-${marca}-${desde}${hasta !== desde ? `-a-${hasta}` : ''}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function CobrosErp() {
  const { marca: delShell, perfil } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const usuario = perfil?.name ?? null
  const lista = 'erp-cobros'
  const [prueba, setPrueba] = useState(true)
  const [periodo, setPeriodo] = useState('mes')
  const [datos, setDatos] = useState<(CobrosDelPeriodo & { clave: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState('todos')
  const [q, setQ] = useState('')
  const linea = useLineaErp()
  // Al servidor va la tienda del menú: los cobros, «el otro libro» y el reintento son de ESA línea (Bruno, 30-oct).
  const tienda = useTiendaErp()
  const [medio, setMedio] = useState('')
  const [orden, setOrden] = useState<OrdenLista>(null)
  const [tanda, setTanda] = useState({ de: '', n: DE_A })
  const [prefs, setPrefsState] = useState<Prefs>(() => normalizarPrefs(typeof window === 'undefined' ? null : leerPrefsDeLista(lista, usuario)))
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [ficha, setFicha] = useState<FilaCobro | null>(null)
  const setPrefs = (p: Prefs) => { setPrefsState(p); guardarPrefsDeLista(lista, usuario, p) }

  const [vuelta, setVuelta] = useState(0)
  const puede = usePuedeErp(marca)
  const { confirmar } = useConfirmar()
  const [reintentando, setReintentando] = useState(false)
  const [reintento, setReintento] = useState<{ texto: string; ok: boolean } | null>(null)
  const clave = `${marca}|${periodo}|${prueba}|${vuelta}|${tienda}`
  useEffect(() => {
    let vivo = true
    // El día se toma al leer (⛔ en el render): «Hoy» es el de cuando se apretó.
    const { desde, hasta } = rangoDeCobros(clave.split('|')[1], diaArgentino(Date.now()))
    leerCobros(marca, tienda, desde, hasta, prueba)
      .then((d) => { if (vivo) { setDatos({ ...d, clave }); setSeleccion(new Set()); setError(null) } })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : 'No se pudieron leer los cobros.'); setDatos((x) => (x ? { ...x, clave } : x)) } })
    return () => { vivo = false }
  }, [marca, tienda, prueba, clave])
  const cargando = datos?.clave !== clave
  async function reintentar() {
    const ok = await confirmar({
      titulo: 'Reintentar el cobro de las entregas',
      mensaje: <p>El ERP vuelve a intentar anotar el cobro de cada entrega sin cobrar. Las que ahora sí se pueden cobrar <b>crean una venta</b> que después no se borra. Las que siguen sin poder, quedan como están.</p>,
      ok: 'Reintentar',
    })
    if (!ok) return
    setReintentando(true)
    setReintento(null)
    try {
      const r = await reintentarEntregas(marca, tienda)
      setReintento({ texto: textoDelReintento(r), ok: !r.siguen.length })
      setFicha(null)
      setVuelta((v) => v + 1)
    } catch (e) {
      setReintento({ texto: e instanceof Error ? e.message : 'No se pudo reintentar el cobro de las entregas.', ok: false })
    } finally {
      setReintentando(false)
    }
  }

  const todas: FilaCobro[] = useMemo(() => [...(datos?.cobros ?? []).map(armarCobro), ...(datos?.contraentregas ?? []).map(armarContraentrega), ...(datos?.entregasPendientes ?? []).map(armarEntregaSinCobrar)], [datos])
  const base = useMemo(() => filtrar(todas, { q, linea, medio }), [todas, q, linea, medio])
  const conteo = useMemo(() => contarVistas(base), [base])
  const filas: FilaCobro[] = useMemo(() => ordenar(filtrar(base, { vista }), orden), [base, vista, orden])
  const res = useMemo(() => resumen(datos?.totales ?? {}, todas, linea), [datos, todas, linea])
  const medios = mediosOrdenados(res.porMedio)
  const elegidas = filas.filter((f) => seleccion.has(f.id))
  const mirada = `${clave}|${vista}|${q}|${linea}|${medio}|${orden?.col ?? ''}|${orden?.dir ?? ''}`
  const mostrar = tanda.de === mirada ? tanda.n : DE_A
  const nombrePeriodo = (PERIODOS_COBROS.find(([k]) => k === periodo)?.[1] ?? '').toLowerCase()
  const mediosDelPeriodo = useMemo(() => [...new Set(todas.map((f) => f.medio ?? 'sin_medio'))].sort(), [todas])

  // 📱 En el celular la tarjeta arma lo suyo con TODAS las columnas: las de `prefs` son de la compu.
  const angosta = usePantallaAngosta()
  const columnas = (angosta ? prefs.orden : prefs.visibles).map((k) => {
    const [titulo, ancho, ordena] = COLUMNAS[k]
    return { key: k, titulo: vista === 'sin_cobrar' && k === 'cuenta' ? 'Por qué quedó sin cobrar' : titulo, ancho, ordena, derecha: k === 'monto' || k === 'comision', movil: MOVIL[k] ?? 'oculta' }
  })

  const celda = (f: FilaCobro, k: string): React.ReactNode => {
    if (k === 'h') return <span style={{ color: color.mut }}>{cuandoCorto(f.cuando)}</span>
    if (k === 'que') {
      return (
        <span title={f.que} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
          <span style={{ color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.que}</span>
          {f.anulado && <ChipEstado mapa={ANULADO} k="anulado" />}
        </span>
      )
    }
    if (k === 'cliente') return f.cliente ? <span style={{ color: color.ink2 }} title={f.cliente}>{f.cliente}</span> : <span style={{ color: color.mut2 }}>—</span>
    if (k === 'medio') return <span style={{ color: f.clase === 'plata' ? color.ink2 : color.mut }}>{f.medioTexto}</span>
    if (k === 'cuenta') return <span style={{ color: color.ink2 }} title={f.cuenta}>{f.cuenta}</span>
    if (k === 'entra') return f.entraA ? <span style={{ color: color.ink2 }}>{f.entraA}</span> : <span style={{ color: color.mut2 }}>—</span>
    if (k === 'monto' && f.clase === 'sin_cobrar') return <span style={{ color: f.montoDicho ? color.ink2 : color.mut2, fontVariantNumeric: 'tabular-nums' }} title="Lo que dijo Logística; el ERP usa el monto del pedido">{f.montoDicho ? $exacto(f.monto) : '—'}</span>
    if (k === 'monto') {
      const tono = f.anulado || f.clase !== 'plata' ? color.mut : f.monto < 0 ? 'var(--mo-danger-ink)' : color.ink
      return <b title={f.clase === 'a_cuenta' ? 'Quedó debiendo: no es plata que entró' : f.clase === 'saldo' ? 'Pagó con saldo a favor: no es plata que entró' : f.clase === 'entrega' ? 'Contraentrega: lo cobra el cadete al entregar, todavía no entró' : undefined} style={{ color: tono, fontVariantNumeric: 'tabular-nums', textDecoration: f.anulado ? 'line-through' : undefined, fontStyle: f.clase !== 'plata' ? 'italic' : undefined }}>{$exacto(f.monto)}</b>
    }
    if (k === 'quien') return <span style={{ color: f.quien ? color.ink2 : color.mut2 }}>{f.quien ?? '—'}</span>
    if (k === 'comision') return <span style={{ color: color.mut, fontVariantNumeric: 'tabular-nums' }}>{f.comision == null ? '—' : $exacto(f.comision)}</span>
    if (k === 'acredita') return <span style={{ color: color.mut }}>{f.acreditaEl ? diaCorto(f.acreditaEl) : '—'}</span>
    if (k === 'linea') return <span style={{ color: color.ink2 }}>{LINEA[f.linea] ?? f.linea}</span>
    return null
  }

  const libro = prueba ? 'de prueba' : 'reales'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: color.mut, flex: '1 1 320px' }}>Lo que se cobró: los cobros de las ventas, los pagos a cuenta y lo que se devolvió en plata. Nada se borra.</p>
        <div style={{ display: 'flex', gap: space[1] }}>
          <Button variant={prueba ? 'outline' : 'solid'} aria-pressed={!prueba} onClick={() => { setPrueba(false); setFicha(null) }}>Reales</Button>
          <Button variant={prueba ? 'solid' : 'outline'} aria-pressed={prueba} onClick={() => { setPrueba(true); setFicha(null) }}>De prueba</Button>
        </div>
        {vista === 'sin_cobrar' && puede('configurar') && <Button disabled={!res.sinCobrar || reintentando} onClick={() => void reintentar()}>{reintentando ? 'Reintentando…' : 'Reintentar el cobro'}</Button>}
        <Button disabled={!filas.length} onClick={() => datos && bajarCsv(filas, marca, datos.desde, datos.hasta)}>Exportar</Button>
      </div>
      {datos && (prueba || datos.otroLibro > 0) && (
        <Notice tone={prueba ? 'warning' : 'neutral'}>
          {prueba
            ? <>Estás mirando los cobros <b>de prueba</b>: las ventas que el ERP registra en paralelo con Gestión Nube hasta el corte. Los cobros a cuenta que se cargan en Gestión Nube todavía no llegan acá. {datos.otroLibro ? `En este período hay ${datos.otroLibro.toLocaleString('es-AR')} cobros reales.` : 'Todavía no hay ningún cobro real.'}</>
            : <>En este período hay {datos.otroLibro.toLocaleString('es-AR')} cobros <b>de prueba</b>, que no se suman acá. <Button variant="outline" onClick={() => setPrueba(true)}>Ver los de prueba</Button></>}
        </Notice>
      )}
      <Notice tone="neutral">Todavía no están <b>Por validar</b> (lo que llegó a Mercado Pago), <b>Cobros masivos</b> ni <b>Cheques</b>: los está armando el ERP. Un cobro a cuenta se registra desde Clientes › Cuenta corriente o desde la venta.</Notice>
      {res.sinCobrar > 0 && vista !== 'sin_cobrar' && (
        <Notice tone="warning">
          Hay <b>{res.sinCobrar.toLocaleString('es-AR')} {res.sinCobrar === 1 ? 'entrega' : 'entregas'} sin cobrar en el ERP</b>, desde el {diaCorto(diaArgentino(Date.parse(res.sinCobrarDesde ?? '')))}: Logística las entregó y el ERP no pudo anotar el cobro. <Button variant="outline" onClick={() => setVista('sin_cobrar')}>Verlas</Button>
        </Notice>
      )}
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {reintento && <Notice tone={reintento.ok ? 'success' : 'warning'} onClose={() => setReintento(null)}>{reintento.texto}</Notice>}

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
        <TileResumen titulo="Cobrado" valor={$(res.cobrado)} oscuro nota={`${nombrePeriodo} · ${libro}`} />
        <TileResumen titulo="Entró" valor={$(res.entro)} nota={`${res.cobros.toLocaleString('es-AR')} cobros con plata`} />
        <TileResumen titulo="Salió" valor={$(res.salio)} nota="vueltos y devoluciones" />
        <TileResumen titulo="Quedó debiendo" valor={$(res.debe)} nota={res.saldo ? `${$(res.saldo)} con saldo a favor` : 'a cuenta: no es plata'} />
        <TileResumen titulo="Contraentrega" valor={$(res.calle)} nota={res.enLaCalle ? `${res.enLaCalle.toLocaleString('es-AR')} en la calle, desde el ${diaCorto(diaArgentino(Date.parse(res.calleDesde ?? '')))}` : 'nada en la calle'} />
      </div>
      {medios.length > 0 && (
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', fontSize: font.sm, color: color.mut }}>
          <span style={{ fontWeight: weight.medium, color: color.ink2 }}>Por medio:</span>
          {medios.map((m) => <span key={m.medio}>{m.nombre} <b style={{ color: color.ink, fontVariantNumeric: 'tabular-nums' }}>{$(m.monto)}</b></span>)}
        </div>
      )}

      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <VistasLista vistas={VISTAS} valor={vista} conteo={conteo} onCambio={(k) => { setVista(k); setSeleccion(new Set()) }} />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar en los cobros" placeholder="Nº de venta, cliente, medio, cuenta o quién" />
          <Select aria-label="Período" style={ANCHO_SELECT} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {PERIODOS_COBROS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </Select>
          <Select aria-label="Medio" style={ANCHO_SELECT} value={medio} onChange={(e) => setMedio(e.target.value)}>
            <option value="">Todos los medios</option>
            {mediosDelPeriodo.map((m) => <option key={m} value={m}>{m === 'sin_medio' ? 'Sin medio' : (MEDIO[m] ?? m)}</option>)}
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
          columnas={columnas} filas={filas.slice(0, mostrar)} claveDe={(f) => f.id} celda={celda}
          seleccion={seleccion} onSeleccion={setSeleccion} orden={orden} onOrden={setOrden}
          activa={ficha?.id ?? null} onAbrir={setFicha} etiquetaFila={(f) => `el cobro ${f.que}`}
          vacio={!cargando && datos ? (
            <div style={{ padding: space[6] }}>
              <EmptyState title={q ? 'No hay cobros con ese número, cliente, medio o persona.' : vista === 'sin_cobrar' ? 'No hay entregas sin cobrar.' : `No hay cobros ${libro} ${vista === 'todos' ? '' : 'de esta vista '}${nombrePeriodo === 'hoy' || nombrePeriodo === 'ayer' ? nombrePeriodo : `en ${nombrePeriodo}`}.`} />
              {periodo !== 'mes' && <div style={{ textAlign: 'center' }}><Button variant="outline" onClick={() => setPeriodo('mes')}>Ver este mes</Button></div>}
            </div>
          ) : null}
        />
        {filas.length > mostrar && (
          <div style={{ padding: 12, textAlign: 'center', borderTop: `1px solid ${color.bg2}` }}>
            <Button variant="outline" onClick={() => setTanda({ de: mirada, n: mostrar + DE_A })}>Mostrar {Math.min(DE_A, filas.length - mostrar).toLocaleString('es-AR')} más</Button>
          </div>
        )}
        <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
          {cargando && !datos ? 'Leyendo los cobros…' : `${Math.min(mostrar, filas.length).toLocaleString('es-AR')} de ${filas.length.toLocaleString('es-AR')}`}
          {' · '}{vista === 'sin_cobrar' ? 'Las entregas que Logística hizo y el ERP todavía no pudo cobrar, sean del período que sean: se reintentan solas cuando se arregla lo que faltaba (la cuenta de cobro, la ruta, una variante).' : vista === 'contraentrega' ? 'Lo que está en la calle hoy, sea del período que sea: se cierra cuando el envío se marca entregado.' : 'El cobro de una venta lleva el día de la venta.'} «Cobrado» no suma lo anulado sin devolución (la plata se devolvió afuera) ni lo que quedó a cuenta.
        </div>
      </div>

      <BarraSeleccion cuantas={elegidas.length} onSoltar={() => setSeleccion(new Set())}>
        <span style={{ color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>{$exacto(elegidas.filter((f) => f.clase === 'plata' && !f.anulado).reduce((a, f) => a + f.monto, 0))} en plata</span>
        <AccionSeleccion icono="bajar" onClick={() => datos && bajarCsv(elegidas, marca, datos.desde, datos.hasta)}>Exportar los elegidos</AccionSeleccion>
      </BarraSeleccion>

      <FichaCostado abierta={!!ficha} onCerrar={() => setFicha(null)} titulo={ficha?.que ?? ''} etiqueta="El cobro">
        {ficha && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
            {ficha.anulado && <Notice tone="neutral">{ficha.origen === 'pago_a_cuenta' ? 'Este pago a cuenta se dio vuelta.' : 'La venta está anulada.'}</Notice>}
            {ficha.clase === 'a_cuenta' && <Notice tone="warning">Quedó debiendo: no es plata que entró. Se cobra desde Clientes › Cuenta corriente.</Notice>}
            {ficha.clase === 'sin_cobrar' && <Notice tone="warning">Logística entregó este pedido y el ERP no pudo anotar el cobro. La entrega no se frena nunca por esto: queda anotada y se reintenta cuando se arregla lo que faltaba. <b>Por qué:</b> {ficha.motivo}</Notice>}
            {ficha.clase === 'sin_cobrar' && ficha.medio === 'transferencia' && <Notice tone="neutral">Fue una transferencia: cuando el cobro se anote va a quedar «por verificar» hasta cruzarla en Pagos recibidos.</Notice>}
            {ficha.clase === 'entrega' && <Notice tone="warning">Contraentrega: lo cobra el cadete al entregar y todavía no entró. Se cierra cuando Envíos marca el envío entregado (eso todavía no está conectado: lo está armando el ERP).</Notice>}
            {ficha.clase === 'sin_cobrar' ? (
              <DatosFicha>
                <DatoFicha titulo="Entregada">{cuandoCorto(ficha.cuando)}</DatoFicha>
                <DatoFicha titulo="Entregó">{ficha.quien ?? '—'}</DatoFicha>
                <DatoFicha titulo="Cobró en mano">{ficha.medioTexto}</DatoFicha>
                <DatoFicha titulo="Monto que dijo Logística">{ficha.montoDicho ? <b style={{ fontVariantNumeric: 'tabular-nums' }}>{$exacto(ficha.monto)}</b> : '—'}</DatoFicha>
                <DatoFicha titulo="Último intento">{ficha.intentoEn ? cuandoCorto(ficha.intentoEn) : '—'}{(ficha.intentos ?? 1) > 1 ? ` · ${ficha.intentos} intentos` : ''}</DatoFicha>
                <DatoFicha titulo="Línea">{LINEA[ficha.linea] ?? ficha.linea}</DatoFicha>
                <DatoFicha titulo="Id de la entrega">{ficha.ref}</DatoFicha>
              </DatosFicha>
            ) : (
            <DatosFicha>
              <DatoFicha titulo="Monto"><b style={{ fontVariantNumeric: 'tabular-nums' }}>{$exacto(ficha.monto)}</b></DatoFicha>
              <DatoFicha titulo={ficha.clase === 'entrega' ? 'En la calle desde' : 'Cuándo'}>{cuandoCorto(ficha.cuando)}</DatoFicha>
              <DatoFicha titulo="Cliente">{ficha.cliente ?? '—'}</DatoFicha>
              <DatoFicha titulo="Medio">{ficha.medioTexto}</DatoFicha>
              <DatoFicha titulo="Cuenta">{ficha.cuenta}</DatoFicha>
              <DatoFicha titulo="Entra a">{ficha.entraA ?? '—'}</DatoFicha>
              <DatoFicha titulo="Comisión">{ficha.comision == null ? '—' : $exacto(ficha.comision)}</DatoFicha>
              <DatoFicha titulo="Se acredita">{ficha.acreditaEl ? diaCorto(ficha.acreditaEl) : '—'}</DatoFicha>
              <DatoFicha titulo="Quién">{ficha.quien ?? '—'}</DatoFicha>
              <DatoFicha titulo="Línea">{LINEA[ficha.linea] ?? ficha.linea}</DatoFicha>
              {ficha.ref && <DatoFicha titulo="Referencia">{ficha.ref}</DatoFicha>}
            </DatosFicha>
            )}
            {ficha.ventaNumero != null && <p style={{ margin: 0, color: color.mut, fontSize: font.sm }}>La venta {ficha.ventaNumero} se abre en Ventas buscando su número.</p>}
          </div>
        )}
      </FichaCostado>
    </div>
  )
}
