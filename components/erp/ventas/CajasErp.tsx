'use client'

/**
 * ERP › Ventas › Cajas, con el molde del diseño (`~/Documents/erp-monitor/diseno.md` §7; v8 `VentasMas.dc.html`, pestaña
 * «Cajas»): cada turno de la Caja (POS) del período, de SÓLO LECTURA —quién abrió y cerró, ventas, efectivo esperado,
 * contado y diferencia—, con la caja abierta y su efectivo esperado EN VIVO arriba. Vistas Todas · Con diferencia; período;
 * Exportar; clic ⇒ la ficha al costado con el cierre (fondo, cobrado, aportes, salidas, por forma de pago). Abrir, contar y
 * cerrar siguen en la Caja (POS). Núcleo: `lib/erp/cajas.core.js`; servidor: `action=turnos` / `action=turno` de `api/_caja.js`.
 *
 * 🧾 ARQUEO DE CAJA (Bruno, 30-oct): cada cierre tiene el código de su sobre (impreso en el ticket del cierre, con barras).
 * Arriba, sólo admin, «Código del sobre»: se escanea o se tipea y abre esa caja; en la ficha, «Llegó bien» (⇒ Lista) o
 * «Llegó con diferencia» (lo que había + nota). Vistas Sin recibir · Sobre con diferencia · Listas. La Caja del local es UNA
 * para Zattia y Stunned (un cajón): es lo único del ERP que ⛔ se separa por línea (Bruno, 30-oct).
 */

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, Input, MoneyText, Notice, Select, color, font, space } from '@/components/ui'
import { ListaTrabajo, type MovilColumna, type OrdenLista } from '@/components/ui/ListaTrabajo'
import { PanelColumnas } from '@/components/ui/PanelColumnas'
import { DatoFicha, DatosFicha, FichaCostado } from '@/components/ui/FichaCostado'
import { ChipEstado, TileResumen, VistasLista, cuandoCorto, tonoDeConteo } from '@/components/ui/PiezasLista'
import { arquearSobre, leerCajaAbierta, leerCajaDelSobre, leerTurnosCaja, type MarcaErp } from '@/lib/erp/cliente'
import { esAdmin } from '@/lib/permisos'
import {
  PERIODOS_CAJA, VISTAS_CAJA, alternarColumnaCaja, armarFilasCajas, cajaDelCodigo, columnasCaja, contarVistasCaja, filtrarCaja, moverColumna,
  normalizarPrefsCaja, ordenarCaja, rangoCaja, resumenCaja,
} from '@/lib/erp/cajas.core.js'
import { guardarPrefsDeLista, leerPrefsDeLista } from '@/lib/erp/lista-prefs'
import { diaArgentino } from '@/lib/envios/portal.core.js'

type FilaCaja = ReturnType<typeof armarFilasCajas>[number]
type Prefs = { orden: string[]; visibles: string[] }

const ANCHO_SELECT: React.CSSProperties = { cursor: 'pointer', width: 'auto', flex: '0 0 auto' }
const COLUMNAS = columnasCaja()
/** 📱 Qué es cada columna en la tarjeta del celular; la que no está, `oculta`. */
const MOVIL: Record<string, MovilColumna> = { abrio: 'titulo', dif: 'dato', estado: 'chico', arqueo: 'chico' }
/** La Caja del local es UNA para Zattia y Stunned (Bruno, 30-oct): ⛔ «Caja Zattia». */
const NOMBRE: Record<MarcaErp, string> = { bdi: 'Caja BDI', zattia: 'Caja del local' }
const SOBRE = { abierta: ['neutral', '—'], sin_recibir: ['warning', 'Sin recibir'], lista: ['success', 'Lista'], diferencia: ['danger', 'Sobre con diferencia'] } as const
const VACIO: Record<string, string> = {
  dif: 'Ningún cierre con diferencia en el período.',
  sin_recibir: 'No hay sobres sin recibir en el período.',
  sobre_dif: 'Ningún sobre llegó con diferencia en el período.',
  listas: 'Todavía no hay cajas listas en el período.',
}
const ESTADO = { abierta: ['action', 'Abierta'], cerrada: ['success', 'Cerró justo'], sobro: ['warning', 'Sobró'], falto: ['danger', 'Faltó'] } as const
const estadoDe = (f: FilaCaja): keyof typeof ESTADO => (f.abierta ? 'abierta' : !f.diferencia ? 'cerrada' : f.diferencia > 0 ? 'sobro' : 'falto')
const pesos = (n: number | null | undefined) => (n == null ? '' : `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`)
/** La diferencia con signo: + sobra, − falta. */
const conSigno = (n: number) => `${n > 0 ? '+ ' : n < 0 ? '− ' : ''}$ ${Math.abs(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`

function bajarCsv(filas: FilaCaja[], marca: MarcaErp) {
  const c = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`
  const renglones = [['Caja', 'Sobre', 'Abrió', 'Quién abrió', 'Cerró', 'Quién cerró', 'Ventas', 'Fondo', 'Efectivo esperado', 'Contado', 'Diferencia', 'Nota', 'Arqueo', 'Tenía que haber', 'Había', 'Arqueó', 'Nota del arqueo'].map(c).join(';')]
  for (const f of filas) renglones.push([NOMBRE[marca], f.codigo ?? '', f.abiertoEn, f.abiertoPor, f.cerradoEn ?? '', f.cerradoPor ?? '', f.ventas ?? '', f.fondo, f.esperado ?? '', f.contado ?? '', f.diferencia ?? '', f.nota ?? '',
    SOBRE[f.sobreEstado][1], f.sobre ?? '', f.arqueo?.contado ?? '', f.arqueo ? `${f.arqueo.por ?? ''} ${f.arqueo.en}` : '', f.arqueo?.nota ?? ''].map(c).join(';'))
  const url = URL.createObjectURL(new Blob(['﻿' + renglones.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `cajas-${marca}-${diaArgentino(Date.now())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

type Abierta = { clave: string; esperado: number | null; ventas: number | null; error: string | null }

export function CajasErp() {
  const { marca: delShell, perfil } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const usuario = perfil?.name ?? null
  const admin = esAdmin(perfil)
  const lista = 'erp-cajas'
  const [periodo, setPeriodo] = useState('mes')
  const [vista, setVista] = useState('todas')
  const [orden, setOrden] = useState<OrdenLista>(null)
  const [prefs, setPrefsState] = useState<Prefs>(() => normalizarPrefsCaja(typeof window === 'undefined' ? null : leerPrefsDeLista(lista, usuario)))
  const [datos, setDatos] = useState<{ clave: string; filas: FilaCaja[] } | null>(null)
  const [abierta, setAbierta] = useState<Abierta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ficha, setFicha] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const [arqueoNo, setArqueoNo] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [buscando, setBuscando] = useState(false)
  /** La caja de un sobre de OTRO período (buscada por el código): se arquea igual, ⛔ entra a la lista. */
  const [suelta, setSuelta] = useState<FilaCaja | null>(null)

  const setPrefs = (p: Prefs) => { setPrefsState(p); guardarPrefsDeLista(lista, usuario, p) }

  const [hoy] = useState(() => diaArgentino(Date.now()))
  const rango = rangoCaja(periodo, hoy)
  const clave = `${marca}|${rango.desde}|${rango.hasta}|${vuelta}`
  useEffect(() => {
    let vivo = true
    leerTurnosCaja(marca, rango.desde, rango.hasta)
      .then((d) => { if (vivo) { setDatos({ clave, filas: armarFilasCajas(d.turnos, marca) }); setArqueoNo(d.arqueo && !d.arqueo.disponible ? d.arqueo.error ?? 'El arqueo de caja todavía no está disponible.' : null); setError(null) } })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : 'No se pudieron leer las cajas.'); setDatos((x) => (x ? { ...x, clave } : x)) } })
    return () => { vivo = false }
  }, [marca, rango.desde, rango.hasta, clave])
  // El esperado de la caja abierta lo calcula la Caja en vivo (lee GN): por separado, para ⛔ demorar la lista.
  const claveAbierta = `${marca}|${vuelta}`
  useEffect(() => {
    let vivo = true
    leerCajaAbierta(marca)
      .then((d) => { if (vivo) setAbierta({ clave: claveAbierta, esperado: d.turno?.resumen?.efectivo?.esperado ?? null, ventas: d.turno?.resumen?.ventas ?? null, error: null }) })
      .catch((e) => { if (vivo) setAbierta({ clave: claveAbierta, esperado: null, ventas: null, error: e instanceof Error ? e.message : 'No se pudo leer la caja abierta.' }) })
    return () => { vivo = false }
  }, [marca, claveAbierta])
  const cargando = datos?.clave !== clave
  const enVivo = abierta?.clave === claveAbierta ? abierta : null

  const todas = useMemo(() => datos?.filas ?? [], [datos])
  const conteo = useMemo(() => contarVistasCaja(todas), [todas])
  const res = useMemo(() => resumenCaja(todas), [todas])
  const filas = useMemo(() => ordenarCaja(filtrarCaja(todas, vista), orden), [todas, vista, orden])
  const abiertaFila = todas.find((f) => f.abierta) ?? null
  const fichaFila = ficha ? todas.find((f) => f.id === ficha) ?? (suelta?.id === ficha ? suelta : null) : null

  async function abrirSobre() {
    const t = codigo.trim()
    if (!t) return
    const enLista = cajaDelCodigo(todas, t, marca)
    if (enLista) { setFicha(enLista.id); setCodigo(''); return }
    setBuscando(true)
    try {
      const r = await leerCajaDelSobre(marca, t)
      const [f] = armarFilasCajas([r.turno], marca)
      setSuelta(f)
      setFicha(f.id)
      setCodigo('')
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se encontró la caja de ese sobre.')
    } finally {
      setBuscando(false)
    }
  }
  /** Lo que vuelve del arqueo reemplaza la fila (en la lista o la suelta): ⛔ hace falta releer todo. */
  function alArquear(turno: Record<string, unknown>) {
    const [f] = armarFilasCajas([turno], marca)
    setDatos((d) => (d ? { ...d, filas: d.filas.map((x) => (x.id === f.id ? f : x)) } : d))
    setSuelta((x) => (x?.id === f.id ? f : x))
  }
  const nombrePeriodo = PERIODOS_CAJA.find(([k]) => k === periodo)?.[1] ?? ''

  const columnas = prefs.visibles.map((k) => {
    const [titulo, ancho, ordena] = COLUMNAS[k]
    return { key: k, titulo, ancho, ordena, derecha: ['ventas', 'esp', 'cont', 'dif', 'fondo'].includes(k), movil: MOVIL[k] ?? 'oculta' }
  })
  const plata = (n: number | null) => (n == null ? <span style={{ color: color.mut2 }}>—</span> : <MoneyText value={n} />)

  const celda = (f: FilaCaja, k: string): React.ReactNode => {
    if (k === 'abrio') return <span><b style={{ color: color.ink }}>{cuandoCorto(f.abiertoEn)}</b> <span style={{ color: color.mut }}>· {f.abiertoPor ?? 'sin dato'}</span></span>
    if (k === 'cerro') return f.cerradoEn ? <span>{cuandoCorto(f.cerradoEn)} <span style={{ color: color.mut }}>· {f.cerradoPor ?? 'sin dato'}</span></span> : <span style={{ color: color.mut2 }}>Todavía abierta</span>
    if (k === 'estado') return <ChipEstado mapa={ESTADO} k={estadoDe(f)} />
    if (k === 'ventas') return f.ventas == null ? <span style={{ color: color.mut2 }}>—</span> : <span>{f.ventas}</span>
    if (k === 'esp') return plata(f.esperado)
    if (k === 'cont') return plata(f.contado)
    if (k === 'dif') {
      if (f.diferencia == null) return <span style={{ color: color.mut2 }}>—</span>
      return <b style={{ color: f.diferencia < 0 ? 'var(--mo-danger-ink)' : f.diferencia > 0 ? 'var(--mo-warning-ink)' : color.mut }}>{f.diferencia ? conSigno(f.diferencia) : '$ 0'}</b>
    }
    if (k === 'fondo') return plata(f.fondo)
    if (k === 'nota') return <span title={f.nota ?? undefined} style={{ color: f.nota ? color.ink2 : color.mut2 }}>{f.nota ?? '—'}</span>
    if (k === 'codigo') return f.codigo ? <b style={{ color: color.ink, fontVariantNumeric: 'tabular-nums' }}>{f.codigo}</b> : <span style={{ color: color.mut2 }}>—</span>
    if (k === 'sobre') return plata(f.sobre)
    if (k === 'arqueo') return f.sobreEstado === 'abierta' ? <span style={{ color: color.mut2 }}>—</span> : <ChipEstado mapa={SOBRE} k={f.sobreEstado} />
    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <p style={{ margin: 0, color: color.mut }}>Cada turno de la Caja: quién abrió y cerró, el efectivo que tenía que haber, lo que se contó y la diferencia. Abrir, contar y cerrar se hace en la Caja. El arqueo de caja registra que el sobre de cada cierre llegó y si llegó bien.</p>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {arqueoNo && <Notice tone="warning">{arqueoNo}</Notice>}
      {admin && !arqueoNo && (
        <form onSubmit={(e) => { e.preventDefault(); void abrirSobre() }} style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="erp-cajas-sobre" style={{ fontWeight: 600 }}>Arqueo de caja</label>
          <Input id="erp-cajas-sobre" aria-label="Código del sobre" placeholder="Código del sobre (escaneá o escribí, ej. Z-0142)" value={codigo}
            onChange={(e) => setCodigo(e.target.value)} style={{ maxWidth: 340 }} autoComplete="off" />
          <Button type="submit" variant="outline" disabled={!codigo.trim() || buscando}>{buscando ? 'Buscando…' : 'Abrir el sobre'}</Button>
        </form>
      )}

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
        <TileResumen titulo={NOMBRE[marca]} valor={abiertaFila ? 'Abierta' : cargando ? '…' : 'Cerrada'} oscuro
          nota={abiertaFila ? `desde ${cuandoCorto(abiertaFila.abiertoEn)} · ${abiertaFila.abiertoPor ?? 'sin dato'}` : 'sin turno abierto en el período'} />
        <TileResumen titulo="Efectivo esperado ahora" valor={!abiertaFila ? '—' : enVivo?.esperado != null ? pesos(enVivo.esperado) : enVivo?.error ? 'Sin dato' : 'Calculando…'}
          nota={!abiertaFila ? 'no hay caja abierta' : enVivo?.error ? 'la Caja no contestó' : enVivo?.ventas != null ? `${enVivo.ventas} ventas en el turno` : 'lo calcula la Caja'} />
        <TileResumen titulo={`Diferencias · ${nombrePeriodo.toLowerCase()}`} valor={res.cierres ? conSigno(res.diferencia) : '—'}
          nota={res.cierres ? `faltó ${pesos(Math.abs(res.falto))} · sobró ${pesos(res.sobro)} · en ${res.cierres} cierres` : 'sin cierres en el período'} />
        <TileResumen tono={tonoDeConteo(res.conDiferencia)} titulo="Cierres con diferencia" valor={res.conDiferencia.toLocaleString('es-AR')} nota={`de ${res.cierres} cierres`} />
      </div>

      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <VistasLista vistas={VISTAS_CAJA} valor={vista} conteo={conteo} onCambio={setVista} />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <Select aria-label="Período" style={ANCHO_SELECT} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {PERIODOS_CAJA.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </Select>
          <PanelColumnas
            columnas={prefs.orden.map((k) => ({ key: k, titulo: COLUMNAS[k][0], visible: prefs.visibles.includes(k), fija: COLUMNAS[k][3] }))}
            onAlternar={(k) => setPrefs(alternarColumnaCaja(prefs, k))}
            onMover={(k, d) => setPrefs(moverColumna(prefs, k, d))}
            onRestablecer={() => setPrefs({ ...normalizarPrefsCaja(null) })}
          />
          <Button variant="outline" disabled={!filas.length} onClick={() => bajarCsv(filas, marca)}>Exportar</Button>
          <Button variant="outline" disabled={cargando} onClick={() => setVuelta((n) => n + 1)}>{cargando ? 'Leyendo…' : 'Actualizar'}</Button>
        </div>
        <ListaTrabajo
          columnas={columnas} filas={filas} claveDe={(f) => f.id} celda={celda} orden={orden} onOrden={setOrden}
          activa={fichaFila?.id ?? null} onAbrir={(f) => setFicha(f.id)} etiquetaFila={(f) => `el turno del ${cuandoCorto(f.abiertoEn)}`}
          vacio={!cargando && datos ? <div style={{ padding: space[6] }}><EmptyState title={VACIO[vista] ?? 'No hubo turnos en el período.'} /></div> : null}
        />
        <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
          {cargando && !datos ? 'Leyendo las cajas…' : `${filas.length.toLocaleString('es-AR')} turnos`} · la diferencia es la del cierre: + sobró, − faltó · se cuenta sólo el efectivo
        </div>
      </div>

      <FichaCostado abierta={!!fichaFila} onCerrar={() => setFicha(null)} etiqueta="Ficha del turno de la caja"
        titulo={fichaFila ? `${NOMBRE[marca]} · ${cuandoCorto(fichaFila.abiertoEn)}${fichaFila.codigo ? ` · sobre ${fichaFila.codigo}` : ''}` : ''}>
        {fichaFila && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
            {!fichaFila.abierta && !arqueoNo && <ArqueoDelSobre key={fichaFila.id} f={fichaFila} marca={marca} admin={admin} onListo={alArquear} />}
            <DatosFicha>
              <DatoFicha titulo="Abrió">{cuandoCorto(fichaFila.abiertoEn)} · {fichaFila.abiertoPor ?? 'sin dato'}</DatoFicha>
              <DatoFicha titulo="Cerró">{fichaFila.cerradoEn ? `${cuandoCorto(fichaFila.cerradoEn)} · ${fichaFila.cerradoPor ?? 'sin dato'}` : 'Todavía abierta'}</DatoFicha>
              <DatoFicha titulo="Ventas">{fichaFila.ventas ?? '—'}{fichaFila.total != null ? ` · ${pesos(fichaFila.total)}` : ''}</DatoFicha>
              <DatoFicha titulo="Diferencia">{fichaFila.diferencia == null ? '—' : fichaFila.diferencia ? conSigno(fichaFila.diferencia) : '$ 0'}</DatoFicha>
            </DatosFicha>
            {fichaFila.efectivo ? (
              <div>
                <h3 style={{ margin: '0 0 8px', fontSize: font.md }}>El efectivo</h3>
                {([['Fondo', fichaFila.efectivo.fondo], ['Cobrado en efectivo', fichaFila.efectivo.cobrado], ['Esperando transferencia', fichaFila.efectivo.deEspera], ['Cobrado en Gestión Nube', fichaFila.efectivo.cobradoGN], ['Ingresos', fichaFila.efectivo.aportes], ['Salidas', -fichaFila.efectivo.salidas]] as Array<[string, number]>)
                  .filter(([, n]) => n).map(([t, n]) => <div key={t} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><span style={{ color: color.mut }}>{t}</span><MoneyText value={n} /></div>)}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${color.line}`, fontWeight: 700 }}><span>Esperado</span><MoneyText value={fichaFila.efectivo.esperado} /></div>
                {fichaFila.contado != null && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><span>Contado</span><MoneyText value={fichaFila.contado} /></div>}
              </div>
            ) : <Notice tone="neutral">{fichaFila.abierta ? 'El turno sigue abierto: el cierre se ve cuando la Caja cierre.' : 'Este cierre no guardó el detalle del efectivo.'}</Notice>}
            {fichaFila.porForma.length > 0 && (
              <div>
                <h3 style={{ margin: '0 0 8px', fontSize: font.md }}>Por forma de pago</h3>
                {fichaFila.porForma.map((x, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><span style={{ color: color.mut }}>{x.nombre} · {x.cobros} cobros</span><MoneyText value={x.monto} /></div>)}
              </div>
            )}
            {fichaFila.nota && <DatoFicha titulo="Nota">{fichaFila.nota}</DatoFicha>}
          </div>
        )}
      </FichaCostado>
    </div>
  )
}

/**
 * El arqueo del sobre de una caja cerrada. Admin: «Llegó bien» (trajo lo que tenía que traer ⇒ Lista) o «Llegó con
 * diferencia» (cuánto trajo + la nota, obligatoria). El resto ve el estado. El servidor rearma lo esperado.
 */
function ArqueoDelSobre({ f, marca, admin, onListo }: { f: FilaCaja; marca: MarcaErp; admin: boolean; onListo: (t: Record<string, unknown>) => void }) {
  const [modo, setModo] = useState<'ver' | 'diferencia' | 'corregir'>('ver')
  const [trajo, setTrajo] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const a = f.arqueo

  async function guardar(contado: number, conNota: string | null) {
    setGuardando(true)
    try {
      const r = await arquearSobre(marca, { id: f.id, contado, nota: conNota, corregir: !!a })
      onListo(r.turno)
      setModo('ver')
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el arqueo.')
    } finally {
      setGuardando(false)
    }
  }
  const n = Number(trajo.replace(/\./g, '').replace(',', '.'))

  return (
    <div style={{ border: `1px solid ${color.line}`, borderRadius: 12, padding: space[3], display: 'flex', flexDirection: 'column', gap: space[2] }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[2] }}>
        <h3 style={{ margin: 0, fontSize: font.md }}>Arqueo de caja{f.codigo ? ` · sobre ${f.codigo}` : ''}</h3>
        <ChipEstado mapa={SOBRE} k={f.sobreEstado} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: color.mut }}>Tiene que haber en el sobre</span>{f.sobre == null ? '—' : <MoneyText value={f.sobre} />}</div>
      {a && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: color.mut }}>Había</span><MoneyText value={a.contado} /></div>
          {a.diferencia !== 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>{a.diferencia > 0 ? 'Sobró' : 'Faltó'}</span><MoneyText value={Math.abs(a.diferencia)} /></div>}
          <div style={{ color: color.mut, fontSize: font.sm }}>Arqueó {a.por ?? 'sin dato'} · {cuandoCorto(a.en)}{a.nota ? ` · ${a.nota}` : ''}</div>
        </>
      )}
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {admin && modo === 'ver' && (
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          {!a && <Button disabled={guardando || f.sobre == null} onClick={() => void guardar(f.sobre ?? 0, null)}>{guardando ? 'Guardando…' : 'Llegó bien'}</Button>}
          {!a && <Button variant="outline" disabled={guardando} onClick={() => setModo('diferencia')}>Llegó con diferencia</Button>}
          {a && <Button variant="ghost" size="sm" onClick={() => setModo('corregir')}>Corregir el arqueo</Button>}
        </div>
      )}
      {admin && modo !== 'ver' && (
        <form onSubmit={(e) => { e.preventDefault(); if (Number.isFinite(n) && trajo.trim()) void guardar(n, nota.trim() || null) }} style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          <Input aria-label="Cuánto había en el sobre" inputMode="decimal" placeholder="Cuánto había en el sobre" value={trajo} onChange={(e) => setTrajo(e.target.value)} autoFocus />
          <Input aria-label="Nota del arqueo" placeholder="Qué pasó con el sobre (obligatorio si no coincide)" value={nota} onChange={(e) => setNota(e.target.value)} />
          <div style={{ display: 'flex', gap: space[2] }}>
            <Button type="submit" disabled={guardando || !trajo.trim() || !Number.isFinite(n)}>{guardando ? 'Guardando…' : 'Guardar el arqueo'}</Button>
            <Button type="button" variant="ghost" onClick={() => setModo('ver')}>Cancelar</Button>
          </div>
        </form>
      )}
      {!admin && !a && <span style={{ color: color.mut, fontSize: font.sm }}>El arqueo lo hace un admin cuando recibe el sobre.</span>}
    </div>
  )
}
