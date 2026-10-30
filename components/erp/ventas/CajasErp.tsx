'use client'

/**
 * ERP › Ventas › Cajas, con el molde del diseño (`~/Documents/erp-monitor/diseno.md` §7; v8 `VentasMas.dc.html`, pestaña
 * «Cajas»): cada turno de la Caja (POS) del período, de SÓLO LECTURA —quién abrió y cerró, ventas, efectivo esperado,
 * contado y diferencia—, con la caja abierta y su efectivo esperado EN VIVO arriba. Vistas Todas · Con diferencia; período;
 * Exportar; clic ⇒ la ficha al costado con el cierre (fondo, cobrado, aportes, salidas, por forma de pago). Abrir, contar y
 * cerrar siguen en la Caja (POS). Núcleo: `lib/erp/cajas.core.js`; servidor: `action=turnos` / `action=turno` de `api/_caja.js`.
 *
 * 🧾 ARQUEO DE CAJA (Bruno, 30-oct): cada cierre tiene el código de su sobre (impreso en el ticket del cierre, con barras).
 * Arriba, sólo admin, «Código de la caja»: se escanea o se tipea y abre DIRECTO la revisión (billete por billete, con el ✓);
 * desde la lista, la ficha con «Revisar». Vistas Sin recibir · Sobre con diferencia · Listas. La Caja del local es UNA
 * para Zattia y Stunned (un cajón): es lo único del ERP que ⛔ se separa por línea (Bruno, 30-oct).
 */

import { parsearMonto } from '@/lib/compromisos/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, Input, MoneyText, Notice, Select, color, font, space } from '@/components/ui'
import { Icono } from '@/components/ui/Icono'
import { ListaTrabajo, type MovilColumna, type OrdenLista } from '@/components/ui/ListaTrabajo'
import { PanelColumnas } from '@/components/ui/PanelColumnas'
import { DatoFicha, DatosFicha, FichaCostado } from '@/components/ui/FichaCostado'
import { ChipEstado, TileResumen, VistasLista, cuandoCorto, tonoDeConteo } from '@/components/ui/PiezasLista'
import { arquearSobre, leerCajaAbierta, leerCajaDelSobre, leerTurnosCaja, type MarcaErp } from '@/lib/erp/cliente'
import { esAdmin } from '@/lib/permisos'
import { billetesDe } from '@/lib/caja/conteo.core.js'
import {
  PERIODOS_CAJA, VISTAS_CAJA, alternarColumnaCaja, armarFilasCajas, billetesQueNoCoinciden, cajaDelCodigo, columnasCaja, contarVistasCaja, filtrarCaja, moverColumna,
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
/** La revisión en curso: el chip cambia mientras se carga (Bruno, 30-oct: «si todos coinciden, estado Lista»). */
const REVISION = { revision: ['neutral', 'En revisión'], lista: ['success', 'Lista'], diferencia: ['danger', 'Con diferencia'] } as const
const GRILLA_REVISION: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, .8fr) 72px auto', alignItems: 'center', gap: 10 }
const VACIO: Record<string, string> = {
  dif: 'Ningún cierre con diferencia en el período.',
  sin_recibir: 'No hay sobres sin recibir en el período.',
  sobre_dif: 'Ningún sobre con diferencia en el período.',
  listas: 'Todavía no hay cajas listas en el período.',
}
const ESTADO = { abierta: ['action', 'Abierta'], cerrada: ['success', 'Cerró justo'], sobro: ['warning', 'Sobró'], falto: ['danger', 'Faltó'] } as const
const estadoDe = (f: FilaCaja): keyof typeof ESTADO => (f.abierta ? 'abierta' : !f.diferencia ? 'cerrada' : f.diferencia > 0 ? 'sobro' : 'falto')
const pesos = (n: number | null | undefined) => (n == null ? '' : `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`)
/** La diferencia con signo: + sobra, − falta. */
const conSigno = (n: number) => `${n > 0 ? '+ ' : n < 0 ? '− ' : ''}$ ${Math.abs(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`

function bajarCsv(filas: FilaCaja[], marca: MarcaErp) {
  const c = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`
  const renglones = [['Caja', 'Código', 'Abrió', 'Quién abrió', 'Cerró', 'Quién cerró', 'Ventas', 'Fondo', 'Efectivo esperado', 'Contado', 'Diferencia', 'Nota', 'Arqueo', 'Esperado en el sobre', 'Verificado', 'Revisó', 'Nota del arqueo'].map(c).join(';')]
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
  /** La caja que se está revisando (su id): la ficha muestra la revisión en lugar del cierre. */
  const [revisar, setRevisar] = useState<string | null>(null)
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
  const revisando = !!fichaFila && admin && revisar === fichaFila.id && !fichaFila.abierta

  /** Abrir una caja. Escaneada y sin revisar ⇒ directo a la revisión (Bruno, 30-oct). */
  function abrir(f: FilaCaja, escaneada = false) {
    setFicha(f.id)
    setRevisar(escaneada && admin && !f.abierta && !f.arqueo && !arqueoNo ? f.id : null)
  }
  async function abrirSobre() {
    const t = codigo.trim()
    if (!t) return
    const enLista = cajaDelCodigo(todas, t, marca)
    if (enLista) { abrir(enLista, true); setCodigo(''); return }
    setBuscando(true)
    try {
      const r = await leerCajaDelSobre(marca, t)
      const [f] = armarFilasCajas([r.turno], marca)
      setSuelta(f)
      abrir(f, true)
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
    // «Listo» y salís de la revisión: el panel se cierra (Bruno, 30-oct).
    setRevisar(null)
    setFicha(null)
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
      <p style={{ margin: 0, color: color.mut }}>Cada turno de la Caja: quién abrió y cerró, el efectivo que tenía que haber, lo que se contó y la diferencia. Abrir, contar y cerrar se hace en la Caja. En el arqueo de caja se revisa el sobre de cada cierre, billete por billete.</p>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {arqueoNo && <Notice tone="warning">{arqueoNo}</Notice>}
      {admin && !arqueoNo && (
        <form onSubmit={(e) => { e.preventDefault(); void abrirSobre() }} style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="erp-cajas-sobre" style={{ fontWeight: 600 }}>Arqueo de caja</label>
          <Input id="erp-cajas-sobre" aria-label="Código de la caja" placeholder="Código de la caja (escaneá o escribí, ej. Z-0142)" value={codigo}
            onChange={(e) => setCodigo(e.target.value)} style={{ maxWidth: 340 }} autoComplete="off" />
          <Button type="submit" variant="outline" disabled={!codigo.trim() || buscando}>{buscando ? 'Buscando…' : 'Revisar'}</Button>
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
          activa={fichaFila?.id ?? null} onAbrir={(f) => abrir(f)} etiquetaFila={(f) => `el turno del ${cuandoCorto(f.abiertoEn)}`}
          vacio={!cargando && datos ? <div style={{ padding: space[6] }}><EmptyState title={VACIO[vista] ?? 'No hubo turnos en el período.'} /></div> : null}
        />
        <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
          {cargando && !datos ? 'Leyendo las cajas…' : `${filas.length.toLocaleString('es-AR')} turnos`} · la diferencia es la del cierre: + sobró, − faltó · se cuenta sólo el efectivo
        </div>
      </div>

      <FichaCostado abierta={!!fichaFila} onCerrar={() => { setFicha(null); setRevisar(null) }} etiqueta={revisando ? 'Revisión de la caja' : 'Ficha del turno de la caja'}
        titulo={!fichaFila ? '' : revisando ? `Revisión · ${fichaFila.codigo ? `Caja ${fichaFila.codigo}` : NOMBRE[marca]}` : `${NOMBRE[marca]} · ${cuandoCorto(fichaFila.abiertoEn)}${fichaFila.codigo ? ` · ${fichaFila.codigo}` : ''}`}>
        {fichaFila && revisando && <RevisionDeLaCaja key={fichaFila.id} f={fichaFila} marca={marca} onGuardado={alArquear} onVolver={() => setRevisar(null)} />}
        {fichaFila && !revisando && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
            {!fichaFila.abierta && !arqueoNo && <ArqueoDeLaCaja f={fichaFila} admin={admin} onRevisar={() => setRevisar(fichaFila.id)} />}
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
 * La tarjeta del arqueo arriba de la ficha. Sin recibir ⇒ «Revisar» (admin), que abre la revisión; revisada ⇒ lo
 * verificado, quién y cuándo, los billetes que no coincidieron y «Corregir el arqueo» (vuelve a la revisión).
 */
function ArqueoDeLaCaja({ f, admin, onRevisar }: { f: FilaCaja; admin: boolean; onRevisar: () => void }) {
  const a = f.arqueo
  const malos = a?.billetes || a?.esperados ? billetesQueNoCoinciden(a.esperados ?? {}, a.billetes ?? {}) : []
  return (
    <div style={{ border: `1px solid ${color.line}`, borderRadius: 12, padding: space[3], display: 'flex', flexDirection: 'column', gap: space[2] }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[2] }}>
        <h3 style={{ margin: 0, fontSize: font.md }}>{f.codigo ? `Caja ${f.codigo}` : 'Arqueo de caja'}</h3>
        <ChipEstado mapa={SOBRE} k={f.sobreEstado} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: color.mut }}>Esperado</span>{f.sobre == null ? '—' : <MoneyText value={f.sobre} />}</div>
      {a && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: color.mut }}>Verificado</span><MoneyText value={a.contado} /></div>
          {malos.map((m) => (
            <div key={m.valor} style={{ display: 'flex', justifyContent: 'space-between', gap: space[2] }}>
              <span>{pesos(m.valor)} · {m.verificado} de {m.esperado}</span>
              <b style={{ color: m.verificado < m.esperado ? 'var(--mo-danger-ink)' : 'var(--mo-warning-ink)' }}>{conSigno((m.verificado - m.esperado) * m.valor)}</b>
            </div>
          ))}
          {!malos.length && a.diferencia !== 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>Diferencia</span><span>{conSigno(a.diferencia)}</span></div>}
          <div style={{ color: color.mut, fontSize: font.sm }}>{a.por ?? 'sin dato'} · {cuandoCorto(a.en)}{a.nota ? ` · «${a.nota}»` : ''}</div>
        </>
      )}
      {admin && !a && <Button variant="solid" tone="brand" fullWidth disabled={f.sobre == null} onClick={onRevisar}>Revisar</Button>}
      {admin && a && <Button variant="ghost" size="sm" style={{ alignSelf: 'flex-start' }} onClick={onRevisar}>Corregir el arqueo</Button>}
      {!admin && !a && <span style={{ color: color.mut, fontSize: font.sm }}>La revisa un admin cuando recibe el sobre.</span>}
    </div>
  )
}

/** Un renglón de la revisión: el billete (o el monto, sin conteo de billetes) y cuánto se tiene que verificar. */
type RenglonRevision = { clave: string; valor: number | null; esperado: number }

/**
 * 🧾 LA REVISIÓN DE LA CAJA (Bruno, 30-oct): cada billete con lo esperado, se carga lo verificado a mano o con el ✓
 * («Igual al esperado»). El ✓ ⛔ mueve el foco al siguiente (se revisa con el botón O escribiendo, ⛔ mezclado); Enter en
 * el campo sí pasa al siguiente. Todos coinciden ⇒ «Listo» (Lista) y se cierra el panel; si alguno ⛔ coincide, nota y
 * «Guardar con diferencia». Sin conteo de billetes en el cierre, un solo renglón con el monto.
 */
function RevisionDeLaCaja({ f, marca, onGuardado, onVolver }: { f: FilaCaja; marca: MarcaErp; onGuardado: (t: Record<string, unknown>) => void; onVolver: () => void }) {
  const porBillete = !!f.billetesSobre?.length
  const base: RenglonRevision[] = porBillete
    ? (f.billetesSobre ?? []).map((b) => ({ clave: String(b.valor), valor: b.valor, esperado: b.esperado }))
    : [{ clave: 'monto', valor: null, esperado: f.sobre ?? 0 }]
  const [extras, setExtras] = useState<number[]>([])
  const renglones = [...base, ...extras.map((v) => ({ clave: String(v), valor: v, esperado: 0 }))]
  const anterior = f.arqueo?.billetes
  const [valores, setValores] = useState<Record<string, string>>({})
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const caja = useRef<HTMLDivElement>(null)
  const libres = porBillete ? billetesDe().filter((v) => !renglones.some((r) => r.valor === v)).sort((a, b) => b - a) : []

  const leer = (r: RenglonRevision): number | null => {
    const t = (valores[r.clave] ?? '').trim()
    if (!t) return null
    const n = r.valor == null ? parsearMonto(t) : Number(t)
    return Number.isFinite(n) && n >= 0 && (r.valor == null || Number.isInteger(n)) ? n : null
  }
  const hechos = renglones.filter((r) => leer(r) != null).length
  const completo = hechos === renglones.length
  const verificado = renglones.reduce((s, r) => s + (leer(r) ?? 0) * (r.valor ?? 1), 0)
  const conDif = renglones.some((r) => { const n = leer(r); return n != null && Math.abs(n - r.esperado) > 0.005 })
  const esperado = f.sobre ?? 0

  async function guardar() {
    setGuardando(true)
    try {
      const verificados = porBillete ? Object.fromEntries(renglones.map((r) => [String(r.valor), leer(r) ?? 0])) : undefined
      const r = await arquearSobre(marca, { id: f.id, ...(verificados ? { verificados } : { contado: verificado }), nota: conDif ? nota.trim() : null, corregir: !!f.arqueo })
      onGuardado(r.turno)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la revisión.')
      setGuardando(false)
    }
  }
  const siguiente = (i: number) => caja.current?.querySelectorAll<HTMLInputElement>('input[data-renglon]')[i + 1]?.focus()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[2] }}>
        <h3 style={{ margin: 0, fontSize: font.md }}>{porBillete ? 'Billetes' : 'Efectivo'}</h3>
        <ChipEstado mapa={REVISION} k={!completo ? 'revision' : conDif ? 'diferencia' : 'lista'} />
      </div>
      {anterior && <span style={{ color: color.mut, fontSize: font.sm }}>Corrigiendo la revisión de {f.arqueo?.por ?? 'sin dato'} · {cuandoCorto(f.arqueo?.en ?? '')}</span>}
      <div ref={caja} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={GRILLA_REVISION}>
          {[porBillete ? 'Billete' : '', 'Esperado', 'Verificado', ''].map((t, i) => <span key={i} style={{ fontSize: font.xs, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: color.mut, textAlign: i === 1 ? 'center' : undefined }}>{t}</span>)}
        </div>
        {renglones.map((r, i) => {
          const n = leer(r)
          const estado = n == null ? null : Math.abs(n - r.esperado) > 0.005 ? 'dif' : 'ok'
          const d = n == null ? 0 : n - r.esperado
          return (
            <div key={r.clave} style={{ ...GRILLA_REVISION, padding: '8px 10px', borderRadius: 10, border: `1px solid ${estado === 'ok' ? color.successBorder : estado === 'dif' ? color.warningBorder : color.line}`, background: estado === 'ok' ? color.successBg : estado === 'dif' ? color.warningBg : undefined }}>
              <b style={{ fontVariantNumeric: 'tabular-nums' }}>{r.valor == null ? 'Monto' : pesos(r.valor)}</b>
              <span style={{ textAlign: 'center', color: color.mut, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{r.valor == null ? pesos(r.esperado) : r.esperado}</span>
              <Input data-renglon aria-label={`Verificado de ${r.valor == null ? 'el monto' : pesos(r.valor)}`} inputMode={r.valor == null ? 'decimal' : 'numeric'} autoComplete="off"
                value={valores[r.clave] ?? ''} onChange={(e) => setValores((v) => ({ ...v, [r.clave]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); siguiente(i) } }}
                style={{ textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} />
              <Button variant={estado === 'ok' ? 'solid' : 'outline'} tone={estado === 'ok' ? 'success' : 'neutral'} aria-label="Igual al esperado" title="Igual al esperado"
                onClick={() => setValores((v) => ({ ...v, [r.clave]: r.valor == null ? String(r.esperado).replace('.', ',') : String(r.esperado) }))}
                style={{ width: 38, padding: 0, justifyContent: 'center' }}><Icono nombre="check" size={18} /></Button>
              {estado === 'dif' && (
                <span style={{ gridColumn: '1 / -1', fontSize: font.sm, fontWeight: 600, color: 'var(--mo-warning-ink)', fontVariantNumeric: 'tabular-nums' }}>
                  {r.valor == null ? conSigno(d) : `${d > 0 ? '+' : '−'}${Math.abs(d)} · ${conSigno(d * r.valor)}`}
                </span>
              )}
            </div>
          )
        })}
      </div>
      {libres.length > 0 && (
        <Select aria-label="Otro billete" value="" style={{ cursor: 'pointer', width: 'auto', alignSelf: 'flex-start' }}
          onChange={(e) => { const v = Number(e.target.value); if (v) setExtras((x) => [...x, v]) }}>
          <option value="">+ Otro billete</option>
          {libres.map((v) => <option key={v} value={v}>{pesos(v)}</option>)}
        </Select>
      )}
      <div style={{ borderTop: `1px solid ${color.line}`, paddingTop: space[3], display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: color.mut }}>Esperado</span><MoneyText value={esperado} /></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span style={{ color: color.mut, fontWeight: 400 }}>Verificado</span><MoneyText value={verificado} /></div>
        {completo && conDif && (
          <Input aria-label="Nota" placeholder="Nota: qué pasó" value={nota} onChange={(e) => setNota(e.target.value)} />
        )}
        {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
        <Button variant="solid" tone="brand" fullWidth disabled={guardando || !completo || (conDif && !nota.trim())} onClick={() => void guardar()}>
          {guardando ? 'Guardando…' : completo && conDif ? 'Guardar con diferencia' : 'Listo'}
        </Button>
        <div style={{ textAlign: 'center', fontSize: font.sm, color: color.mut, fontVariantNumeric: 'tabular-nums' }}>
          {!completo ? `${hechos} de ${renglones.length} revisados` : conDif ? `Diferencia ${conSigno(verificado - esperado)}` : 'Coincide'}
        </div>
        <Button variant="ghost" size="sm" style={{ alignSelf: 'center' }} onClick={onVolver}>Volver a la caja</Button>
      </div>
    </div>
  )
}
