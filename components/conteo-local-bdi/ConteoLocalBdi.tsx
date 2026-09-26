'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { esAdmin, puedeSub } from '@/lib/permisos'
import { leerInventarioVivo } from '@/lib/inventario-vivo/cliente'
import { realMap } from '@/lib/inventario-vivo/core'
import { guardarConteo, leerHistorial } from '@/lib/conteo-deposito/cliente'
import { ANCHOS_AJUSTE, aoaAjuste } from '@/lib/conteo-deposito/core'
import { descargarXlsx } from '@/lib/excel'
import type { ConteoHistorial } from '@/lib/conteo-deposito/tipos'
import {
  agregarFalla,
  calcularAjusteModelo,
  clasificarScan,
  contadoModelo,
  escanear,
  esperadoModelo,
  leerPila,
  limpiarFallas,
  limpiarModelo,
  normBc,
  pareceCodigo,
  setContado,
  textoFalla,
  tocadoModelo,
} from '@/lib/conteo-local-bdi/core'
import type { LbPreview, LecturaFallida, ModeloGrupo } from '@/lib/conteo-local-bdi/tipos'
import { useConteoLocalBdi } from './useConteoLocalBdi'
import { HeaderAcciones } from '@/components/layout/acciones'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { HistorialConteos, InstructivoConteo } from '@/components/conteos/comunes'
import {
  BuscarInput,
  Button,
  Card,
  ConfirmDetalle,
  EmptyState,
  Esqueleto,
  FilterBar,
  Notice,
  TBody,
  THead,
  TableWrap,
  Td,
  Th,
  Tr,
  color,
  font,
  space,
  useConfirmar,
  useToast,
} from '@/components/ui'

/**
 * Conteo de Fundas de BDI (Local): 100% escaneo, un conteo = un modelo de celular.
 * Elegís un modelo de la lista → escaneás (con guard de modelo activo) → "Cerrar
 * conteo": lo no escaneado pasa a 0, compara contra el vivo (`nuevo = vivo + dif`),
 * genera el Excel de ajuste (mismo formato que ZATTIA, conserva el id) y guarda el
 * balance en el historial.
 *
 * Rediseño jul-2026 (patrón Flujo operativo, mobile-first): las acciones al header, los
 * cinco `alert/confirm` nativos a diálogos y Toast del kit, la lista de modelos como
 * tarjetas con estado a la vista, y el instructivo y el historial ahora son los
 * compartidos con los otros dos conteos.
 *
 * 🔑 **Sep-2026: ninguna lectura se pierde en silencio.** En BDI se cuenta en la compu del
 * local, con la música por los mismos parlantes: el beep no se oye y el cartel rojo duraba
 * hasta la lectura siguiente. Ahora (1) una lectura rechazada FRENA la pantalla hasta que
 * alguien la vea, (2) una franja avisa si el campo de escaneo perdió el foco, (3) los
 * casilleros no aceptan un código de barras como cantidad, (4) lo no contado queda en una
 * lista hasta el cierre, y (5) para cerrar se escribe cuántas fundas hay en la pila física,
 * que tapa lo único que la pantalla no puede ver: lo escaneado con el cursor en otro programa.
 */

type Vista = 'lista' | 'foco' | 'preview' | 'historial'
type Feedback = { tipo: 'ok' | 'error' | 'warn'; texto: string; talle?: string; count?: number }

let audioCtx: AudioContext | null = null
function beep(ok: boolean) {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!audioCtx) audioCtx = new AC()
    const ctx = audioCtx
    if (ctx.state === 'suspended') void ctx.resume()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'square'
    o.frequency.value = ok ? 880 : 300
    o.connect(g)
    g.connect(ctx.destination)
    g.gain.value = 0.08
    o.start()
    o.stop(ctx.currentTime + (ok ? 0.08 : 0.22))
  } catch {
    /* sin audio */
  }
}
function vibrate(ok: boolean) {
  try {
    navigator.vibrate?.(ok ? 30 : [60, 40, 60])
  } catch {
    /* sin vibración */
  }
}

function fmtDia(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export function ConteoLocalBdi() {
  const { marca, perfil } = useSesion()
  const { confirmar, avisar, pedirTexto } = useConfirmar()
  const toast = useToast()
  const usuario = perfil?.name || ''
  const puedeAplicar = esAdmin(perfil) || puedeSub(perfil, marca, 'conteo', 'aplicar')
  const cf = useConteoLocalBdi(marca)
  const { modelos, byBc, varByVid, state, stockTime, ultimos } = cf

  const [vista, setVista] = useState<Vista>('lista')
  const [modeloSel, setModeloSel] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [preview, setPreview] = useState<LbPreview | null>(null)
  const [cerrando, setCerrando] = useState(false)
  // Lectura rechazada que frena la pantalla. `extra` = lecturas que llegaron con el cartel abierto.
  const [bloqueo, setBloqueo] = useState<{ texto: string; extra: number } | null>(null)
  const [escuchando, setEscuchando] = useState(false)
  const [hist, setHist] = useState<{ cargando: boolean; conteos: ConteoHistorial[]; error: string | null }>({ cargando: false, conteos: [], error: null })
  const scanRef = useRef<HTMLInputElement>(null)

  const grupoSel = useMemo(() => modelos.find((m) => m.modelo === modeloSel) || null, [modelos, modeloSel])

  const fallasSel = (grupoSel && cf.fallas[grupoSel.modelo]) || []

  /** Una lectura que no se sumó: queda en la lista y frena la pantalla. */
  const rechazar = (f: LecturaFallida, texto: string) => {
    if (!grupoSel) return
    cf.aplicarFallas(agregarFalla(cf.fallas, grupoSel.modelo, f))
    setFeedback({ tipo: 'error', texto })
    setBloqueo((b) => (b ? { ...b, extra: b.extra + 1 } : { texto, extra: 0 }))
    beep(false)
    vibrate(false)
  }

  const onScan = (raw: string) => {
    if (!grupoSel) return
    const bc = normBc(raw)
    if (!bc) return
    const ts = Date.now()
    if (bloqueo) {
      rechazar({ bc, motivo: 'con-cartel', ts }, bloqueo.texto)
      return
    }
    const res = clasificarScan(byBc, varByVid, raw, grupoSel.modelo)
    if (res.tipo === 'desconocido') {
      rechazar({ bc, motivo: 'desconocido', ts }, `Código ${bc}: el sistema no lo conoce.`)
      return
    }
    if (res.tipo === 'otro-modelo') {
      rechazar({ bc, motivo: 'otro-modelo', modeloDe: res.modeloDe, ts }, `Esta funda es de ${res.modeloDe} y estás contando ${grupoSel.modelo}.`)
      return
    }
    const v = varByVid[res.vid]
    const yaTenia = (state[v.vid] || 0) > 0
    const next = escanear(state, v.vid)
    cf.aplicar(next)
    const count = next[v.vid]
    if (yaTenia) {
      setFeedback({ tipo: 'warn', texto: `Ojo: ${v.producto} · ${v.talle} ya estaba escaneado — ahora van ${count}. Si es otra unidad, todo bien.`, talle: v.talle, count })
    } else {
      setFeedback({ tipo: 'ok', texto: v.producto, talle: v.talle, count })
    }
    beep(true)
    vibrate(true)
    scanRef.current?.focus()
  }

  /** El escáner escribió en un casillero de la tabla: no es una cantidad, es una funda que no se contó. */
  const onCasilleroCodigo = (val: string) => {
    rechazar({ bc: normBc(val), motivo: 'casillero', ts: Date.now() }, 'El escáner escribió en un casillero de la tabla, no en el campo de escaneo.')
    scanRef.current?.focus()
  }

  const seguirEscaneando = () => {
    setBloqueo(null)
    scanRef.current?.focus()
  }

  const entrarModelo = (modelo: string) => {
    setModeloSel(modelo)
    setFeedback(null)
    setBloqueo(null)
    setVista('foco')
  }

  const onCargarStock = async () => {
    const hayAlgo = Object.keys(state).length > 0
    if (hayAlgo) {
      const ok = await confirmar({
        titulo: '¿Cargar el stock de nuevo?',
        tono: 'danger',
        ok: 'Cargar y empezar de cero',
        mensaje: 'Hay fundas escaneadas sin cerrar. Si cargás el stock de nuevo, se pierde todo lo escaneado de todos los modelos.',
      })
      if (!ok) return
    }
    await cf.traerStock(true)
  }

  const onCerrar = async () => {
    if (!grupoSel) return
    if (!tocadoModelo(state, grupoSel)) {
      await avisar('Todavía no escaneaste ninguna funda de este modelo.')
      return
    }
    // La pila física, a ciegas: el número de la pantalla no se muestra acá a propósito.
    const escaneadas = contadoModelo(state, grupoSel)
    const txt = await pedirTexto(`Contá la pila de fundas de ${grupoSel.modelo} que escaneaste y escribí cuántas hay.`, '', {
      titulo: `Antes de cerrar ${grupoSel.modelo}`,
      placeholder: 'Cantidad de fundas en la pila',
      ok: 'Seguir',
    })
    if (txt == null) {
      scanRef.current?.focus()
      return
    }
    const pila = leerPila(txt)
    if (pila == null) {
      await avisar('Escribí solo el número de fundas que hay en la pila (por ejemplo 120).')
      scanRef.current?.focus()
      return
    }
    if (pila !== escaneadas) {
      const faltan = pila - escaneadas
      const ok = await confirmar({
        titulo: 'La pila no coincide con lo escaneado',
        tono: 'danger',
        ok: 'Cerrar igual',
        cancelar: 'Volver a escanear',
        mensaje: (
          <>
            <ConfirmDetalle label="Fundas en la pila" valor={pila} />
            <ConfirmDetalle label="Se escanearon" valor={escaneadas} />
            <p style={{ marginTop: space[3] }}>
              {faltan > 0 ? (
                <>
                  Hay <b>{faltan}</b> {faltan === 1 ? 'funda que no se contó' : 'fundas que no se contaron'}. Buscalas en la pila y escanealas.
                </>
              ) : (
                <>
                  Se escanearon <b>{-faltan}</b> más de las que hay en la pila: puede que alguna se haya escaneado dos veces. Revisá los números de la tabla.
                </>
              )}
            </p>
            <p style={{ marginTop: space[2] }}>Si cerrás igual, queda anotado en el historial.</p>
          </>
        ),
      })
      if (!ok) {
        scanRef.current?.focus()
        return
      }
    }
    setCerrando(true)
    try {
      const d = await leerInventarioVivo(marca, 'local')
      const pv = calcularAjusteModelo(grupoSel, state, realMap(d.rows || []), d.store_name || 'Local', d.store || String(marca), stockTime)
      pv.resumen.control = { pila, escaneadas, no_contadas: fallasSel.length }
      setPreview(pv)
      setVista('preview')
    } catch (e) {
      toast.error('No pude leer el stock vivo del Local: ' + (e as Error).message)
    } finally {
      setCerrando(false)
    }
  }

  const onGenerar = async () => {
    if (!preview || !grupoSel) return
    const marcaU = (preview.store || marca).toUpperCase()
    const enCero = preview.registro.filter((r) => (r.contado || 0) === 0).length
    const ok = await confirmar({
      titulo: `Cerrar el conteo de ${preview.modelo}`,
      tono: 'warning',
      ok: 'Cerrar y generar',
      mensaje: (
        <>
          <p>
            El Excel es del <b>Local de {marcaU}</b>. Subilo <b>solo</b> al Gestión Nube de {marcaU}.
          </p>
          <div style={{ marginTop: space[3] }}>
            <ConfirmDetalle label="Líneas a ajustar" valor={preview.rows.length} />
            {enCero > 0 && <ConfirmDetalle label="Fundas sin escanear → quedan en 0" valor={enCero} />}
          </div>
        </>
      ),
    })
    if (!ok) return
    try {
      if (preview.rows.length) {
        const fecha = new Date().toISOString().slice(0, 10)
        await descargarXlsx(aoaAjuste(preview.rows), {
          archivo: `ajuste_fundas_${preview.store || marca}_${preview.modelo.replace(/\s+/g, '-')}_${fecha}.xlsx`,
          hoja: 'Worksheet',
          anchos: ANCHOS_AJUSTE,
        })
      }
      try {
        await guardarConteo({ store: preview.store || String(marca), ubicacion: preview.ubicacion, usuario, fecha_inicio: null, resumen: preview.resumen, detalle: preview.registro })
        await cf.refrescarUltimos()
      } catch {
        /* si falla el historial, el Excel ya se generó */
      }
      cf.aplicar(limpiarModelo(state, grupoSel))
      cf.aplicarFallas(limpiarFallas(cf.fallas, grupoSel.modelo))
      toast.ok(
        preview.rows.length
          ? `Excel generado (${preview.rows.length} ${preview.rows.length === 1 ? 'línea' : 'líneas'}) y conteo de ${preview.modelo} guardado. Subilo a GN → "Importar y Ajustar".`
          : `Conteo de ${preview.modelo} guardado: todo coincidió, sin ajuste.`,
      )
      setPreview(null)
      setModeloSel(null)
      setVista('lista')
    } catch (e) {
      toast.error('Error al generar el Excel: ' + (e as Error).message)
    }
  }

  const onHistorial = async () => {
    setVista('historial')
    setHist({ cargando: true, conteos: [], error: null })
    try {
      const conteos = (await leerHistorial(marca)).filter((c) => ((c.resumen || {}) as { modo?: string }).modo === 'local-bdi')
      setHist({ cargando: false, conteos, error: null })
    } catch (e) {
      setHist({ cargando: false, conteos: [], error: (e as Error).message })
    }
  }

  return (
    <>
      <HeaderAcciones>
        <InfoPopover titulo="Conteo de fundas">
          Se cuenta <b>de a un modelo de celular por vez</b>: escaneás todas las fundas de ese modelo y lo
          cerrás. Recién ahí el monitor lee el stock <b>vivo</b> de Gestión Nube (ubicación Local), lo compara
          con lo que contaste y arma el Excel de ajuste. Como el vivo se lee en el momento del cierre, las
          ventas que hubo mientras contabas no ensucian la diferencia.
          <br /><br />
          Para cerrar hay que <b>contar la pila física</b> de fundas escaneadas: si no coincide con lo que
          tomó el escáner, se avisa antes de generar el Excel. Las lecturas que no se sumaron (código
          desconocido, otro modelo) frenan la pantalla y quedan en una lista hasta el cierre.
          <br /><br />
          ⚠️ <b>El conteo en curso se guarda en este dispositivo.</b> Si empezaste en el celular, terminalo y
          cerralo en el celular: desde otra compu no está.
        </InfoPopover>
        {vista === 'lista' && (
          <>
            <Button variant="outline" onClick={() => void onHistorial()}>
              Historial
            </Button>
            <Button variant="outline" onClick={() => void onCargarStock()} loading={cf.cargando}>
              Cargar stock de GN
            </Button>
          </>
        )}
        {vista === 'foco' && grupoSel && (
          <>
            <Button
              variant="outline"
              onClick={() => {
 setModeloSel(null)
 setVista('lista')
 }}
 >
 ← Volver a modelos</Button>
            {puedeAplicar && (
              <Button variant="solid" tone="brand" onClick={() => void onCerrar()} loading={cerrando}>
                {cerrando ? 'Leyendo stock vivo…' : `Cerrar conteo de ${grupoSel.modelo}`}
              </Button>
            )}
          </>
        )}
        {vista === 'preview' && preview && (
          <>
            <Button
              variant="outline"
              onClick={() => {
 setPreview(null)
 setVista('foco')
 }}
 >
 ← Volver</Button>
            <Button variant="solid" tone="brand" onClick={() => void onGenerar()}>
              {preview.rows.length ? 'Generar Excel y cerrar conteo' : 'Guardar el conteo igual'}
            </Button>
          </>
        )}
        {vista === 'historial' && (
          <Button variant="outline" onClick={() => setVista('lista')}>
            ← Volver
          </Button>
        )}
      </HeaderAcciones>

      {cf.cargando && !modelos.length ? (
        <>
          <Notice tone="neutral" icon="⏳" style={{ marginBottom: space[3] }}>
            Cargando las fundas del Local en vivo desde Gestión Nube…
          </Notice>
          <Esqueleto forma="tabla" filas={6} />
        </>
      ) : cf.error ? (
        <Notice tone="danger" icon="⚠">
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
            <span>No pude cargar el Local en vivo: {cf.error}</span>
            <Button size="sm" variant="outline" tone="danger" onClick={() => void cf.traerStock()}>
              Reintentar
            </Button>
          </div>
        </Notice>
      ) : vista === 'historial' ? (
        <HistorialConteos hist={hist} titulo="Historial de conteos de fundas" conVivo unidad="Talle" />
      ) : vista === 'preview' && preview ? (
        <PreviewView preview={preview} fallas={fallasSel} />
      ) : vista === 'foco' && grupoSel ? (
        <Foco
          grupo={grupoSel}
          state={state}
          fallas={fallasSel}
          scanRef={scanRef}
          feedback={feedback}
          escuchando={escuchando}
          bloqueado={!!bloqueo}
          setEscuchando={setEscuchando}
          puedeAplicar={puedeAplicar}
          onScan={onScan}
          onSet={(vid, val) => cf.aplicar(setContado(state, vid, val))}
          onCasilleroCodigo={onCasilleroCodigo}
        />
      ) : (
        <ListaModelos modelos={modelos} state={state} ultimos={ultimos} stockTime={stockTime} search={search} setSearch={setSearch} onEntrar={entrarModelo} />
      )}

      {vista === 'foco' && bloqueo && <CartelNoContada texto={bloqueo.texto} extra={bloqueo.extra} onSeguir={seguirEscaneando} />}
    </>
  )
}

// ── Lista de modelos ──────────────────────────────────────────────────────────

function ListaModelos({
  modelos,
  state,
  ultimos,
  stockTime,
  search,
  setSearch,
  onEntrar,
}: {
  modelos: ModeloGrupo[]
  state: Record<string, number>
  ultimos: Record<string, number>
  stockTime: number | null
  search: string
  setSearch: (v: string) => void
  onEntrar: (modelo: string) => void
}) {
  const q = search.trim().toLowerCase()
  const lista = useMemo(() => (q ? modelos.filter((m) => m.modelo.toLowerCase().includes(q)) : modelos), [modelos, q])

  if (!modelos.length) {
    return <EmptyState icon="📱" title="No hay fundas en el Local" hint='Tocá "Cargar stock de GN" para bajar el stock.' dashed />
  }

  return (
    <div>
      <InstructivoConteo
        pasoCarga={
          <>
            Tocá un <b>modelo</b> (ej. iPhone 11) y escaneá <b>todas sus fundas</b>. Si escaneás una de otro modelo, suena error y no la suma.
          </>
        }
        queAplica="lo que no escaneaste de ese modelo pasa a 0"
      />

      {stockTime && (
        <Notice tone="warning" icon="📸" style={{ marginBottom: space[3] }}>
          <b>Stock del Local traído: {fmtDia(stockTime)} hs</b> — arrancá con los pedidos al día. Si volvés a &quot;Cargar stock de GN&quot;, esta hora se actualiza.
        </Notice>
      )}

      <FilterBar>
        <BuscarInput value={search} onChange={setSearch} placeholder="Buscá un modelo (ej: iPhone 12)…" />
        <span className="mo-filterbar-right">
          {modelos.length} {modelos.length === 1 ? 'modelo' : 'modelos'} de funda
        </span>
      </FilterBar>

      <div style={{ display: 'grid', gap: space[2] }}>
        {lista.map((m) => {
          const con = contadoModelo(state, m)
          const esp = esperadoModelo(m)
          const ult = ultimos[m.modelo] || 0
          return (
            <Card
              key={m.modelo}
              interactive
              padding={3}
              onClick={() => onEntrar(m.modelo)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[3], cursor: 'pointer', flexWrap: 'wrap', ...(con > 0 ? { borderColor: color.warningBorder, background: color.warningBg } : null) }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: color.ink }}>{m.modelo}</div>
                <div style={{ fontSize: font.xs, color: color.mut }}>
                  {m.variants.length} {m.variants.length === 1 ? 'funda' : 'fundas'} · sistema {esp}
                  {con > 0 && (
                    <>
                      {' · '}
                      <b style={{ color: color.warningInk }}>escaneadas {con}</b>
                    </>
                  )}
                  {ult > 0 ? <> · contado {fmtDia(ult)}</> : <> · <span style={{ color: color.danger }}>sin conteo previo</span></>}
                </div>
              </div>
              <Button size="sm" variant="outline" tone="brand">Contar →</Button>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ── Foco: contar un modelo ─────────────────────────────────────────────────────

function ScanBox({
  scanRef,
  feedback,
  escuchando,
  setEscuchando,
  onScan,
}: {
  scanRef: React.RefObject<HTMLInputElement | null>
  feedback: Feedback | null
  escuchando: boolean
  setEscuchando: (v: boolean) => void
  onScan: (v: string) => void
}) {
  // Al entrar al modelo el campo queda listo: antes había que clickearlo, y la primera
  // lectura sin clic no iba a ningún lado.
  useEffect(() => {
    scanRef.current?.focus()
  }, [scanRef])

  const t =
    feedback?.tipo === 'ok'
      ? { bg: color.successBg, fg: color.successInk, bd: color.successBorder }
      : feedback?.tipo === 'error'
        ? { bg: color.dangerBg, fg: color.dangerInk, bd: color.dangerBorder }
        : feedback?.tipo === 'warn'
          ? { bg: color.warningBg, fg: color.warningInk, bd: color.warningBorder }
          : { bg: color.bg, fg: color.mut2, bd: color.line }
  return (
    <div style={{ marginBottom: space[3] }}>
      <div style={{ fontSize: font.sm, fontWeight: 700, marginBottom: space[1], color: escuchando ? color.successInk : color.mut }}>
        {escuchando ? '🟢 Listo para escanear' : '⚪ En pausa — hacé click en el campo para seguir'}
      </div>
      <input
        ref={scanRef}
        className="mo-input"
        type="text"
        autoComplete="off"
        placeholder="Escaneá las fundas de este modelo…"
        aria-label="Código de barras a escanear"
        onFocus={() => setEscuchando(true)}
        onBlur={() => setEscuchando(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            const v = e.currentTarget.value
            e.currentTarget.value = ''
            onScan(v)
          }
        }}
        style={{ height: 48, fontSize: 16, borderWidth: 3, borderColor: escuchando ? color.successBorder : color.line }}
      />
      <div
        style={{ marginTop: space[2], padding: space[4], border: `1px solid ${t.bd}`, borderRadius: 'var(--mo-r-xl)', fontSize: font.md, textAlign: 'center', background: t.bg, color: t.fg }}
        role="status"
      >
        {!feedback ? (
          'Escaneá una funda para empezar…'
        ) : feedback.tipo === 'ok' ? (
          <>
            ✓ Última: <b style={{ fontSize: 18 }}>{feedback.texto}</b>
            {feedback.talle ? (
              <>
                {' · '}
                <b>{feedback.talle}</b>
              </>
            ) : null}
            <div style={{ fontSize: font.base, marginTop: 2 }}>
              de esta funda llevás <b>{feedback.count}</b>
            </div>
          </>
        ) : (
          (feedback.tipo === 'error' ? '🔴 No se contó: ' : '⚠️ ') + feedback.texto
        )}
      </div>
    </div>
  )
}

/**
 * El cartel que frena la pantalla cuando una lectura no se sumó. Mientras está abierto, las
 * lecturas siguientes tampoco se suman (y se anotan): así un rojo no queda tapado por el
 * verde de la funda siguiente.
 *
 * ⛔ **No es el `Modal` del kit, a propósito.** El Modal se lleva el foco adentro de la caja, y
 * el escáner termina cada lectura con Enter: el Enter caía en el botón y cerraba el cartel
 * solo, sin que nadie lo leyera. Acá el foco se queda en el campo de escaneo (`onMouseDown`
 * con `preventDefault`), y el cartel se cierra solamente con un clic.
 */
function CartelNoContada({ texto, extra, onSeguir }: { texto: string; extra: number; onSeguir: () => void }) {
  return (
    <div
      role="alertdialog"
      aria-label="Esta funda no se contó"
      onMouseDown={(e) => e.preventDefault()}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: color.danger, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: space[4] }}
    >
      <div style={{ maxWidth: 560, textAlign: 'center' }}>
        <div style={{ fontSize: 56, lineHeight: 1 }}>✋</div>
        <div style={{ fontSize: 32, fontWeight: 800, marginTop: space[3] }}>Esta funda NO se contó</div>
        <div style={{ fontSize: font.lg, marginTop: space[3] }}>{texto}</div>
        <div style={{ fontSize: font.lg, marginTop: space[3], fontWeight: 600 }}>Separala en otra pila antes de seguir.</div>
        {extra > 0 && (
          <div style={{ fontSize: font.md, marginTop: space[3], padding: space[3], background: 'rgba(0,0,0,.2)', borderRadius: 'var(--mo-r-xl)' }}>
            Además se {extra === 1 ? 'escaneó 1 funda' : `escanearon ${extra} fundas`} con este cartel abierto: tampoco{' '}
            {extra === 1 ? 'se contó' : 'se contaron'}. Separalas también.
          </div>
        )}
        <div style={{ marginTop: space[5] }}>
          <Button variant="solid" tone="neutral" size="lg" onMouseDown={(e) => e.preventDefault()} onClick={onSeguir}>
            Seguir escaneando
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Las lecturas que no se sumaron, con el motivo. Sirve para buscar esas fundas y para revisarlas en GN. */
function ListaNoContadas({ fallas }: { fallas: LecturaFallida[] }) {
  return (
    <TableWrap maxHeight={240}>
      <THead>
        <Tr>
          <Th>Código</Th>
          <Th>Por qué no se contó</Th>
          <Th align="center" width={70}>
            Hora
          </Th>
        </Tr>
      </THead>
      <TBody>
        {fallas.map((f, i) => (
          <Tr key={i}>
            <Td style={{ fontFamily: 'var(--mo-font-mono, monospace)' }}>{f.bc || '—'}</Td>
            <Td wrap>{textoFalla(f)}</Td>
            <Td align="center" style={{ color: color.mut }}>
              {new Date(f.ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </Td>
          </Tr>
        ))}
      </TBody>
    </TableWrap>
  )
}

/**
 * Casillero de cantidad a mano. Se confirma con Enter o al salir, no tecla por tecla: el
 * escáner "tipea" el código de a un carácter, y tecla por tecla cada pedazo (7, 77, 779…) ya
 * se guardaba como cantidad. Si lo que quedó parece un código, no se carga.
 */
function NumCelda({
  valor,
  label,
  onSet,
  onCodigo,
  onListo,
}: {
  valor: number
  label: string
  onSet: (val: string) => void
  onCodigo: (val: string) => void
  onListo: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const confirmarValor = () => {
    if (draft == null) return
    const v = draft
    setDraft(null)
    if (pareceCodigo(v)) onCodigo(v)
    else onSet(v)
  }
  return (
    <input
      className="mo-input mo-input--num"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={draft ?? (valor || '')}
      onFocus={() => setDraft(valor ? String(valor) : '')}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={confirmarValor}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          confirmarValor()
          onListo()
        }
      }}
      placeholder="0"
      aria-label={label}
      style={{ width: 72, textAlign: 'center', padding: '0 6px' }}
    />
  )
}

function Foco({
  grupo,
  state,
  fallas,
  scanRef,
  feedback,
  escuchando,
  bloqueado,
  setEscuchando,
  puedeAplicar,
  onScan,
  onSet,
  onCasilleroCodigo,
}: {
  grupo: ModeloGrupo
  state: Record<string, number>
  fallas: LecturaFallida[]
  scanRef: React.RefObject<HTMLInputElement | null>
  feedback: Feedback | null
  escuchando: boolean
  bloqueado: boolean
  setEscuchando: (v: boolean) => void
  puedeAplicar: boolean
  onScan: (v: string) => void
  onSet: (vid: string, val: string) => void
  onCasilleroCodigo: (val: string) => void
}) {
  const [verFallas, setVerFallas] = useState(false)
  const con = contadoModelo(state, grupo)
  const esp = esperadoModelo(grupo)
  return (
    <div>
      {!escuchando && !bloqueado && (
        <button
          type="button"
          onClick={() => scanRef.current?.focus()}
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 5,
            width: '100%',
            height: 'auto',
            marginBottom: space[3],
            padding: `${space[3]}px ${space[4]}px`,
            background: color.danger,
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--mo-r-xl)',
            fontSize: font.md,
            fontWeight: 700,
            textAlign: 'center',
            cursor: 'pointer',
          }}
        >
          🔴 El escáner NO está contando — hacé click acá para seguir
        </button>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap', marginBottom: space[3] }}>
        <div>
          <h2 style={{ fontSize: font.xl, fontWeight: 700, color: color.ink }}>{grupo.modelo}</h2>
          <span style={{ fontSize: font.sm, color: color.mut }}>sistema {esp}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: font.xs, color: color.mut, fontWeight: 600 }}>ESCANEADAS</div>
          <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.1, color: color.ink, fontVariantNumeric: 'tabular-nums' }}>{con}</div>
        </div>
      </div>

      {fallas.length > 0 && (
        <div style={{ marginBottom: space[3] }}>
          <Notice tone="danger" icon="⚠">
            <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
              <span>
                <b>
                  {fallas.length} {fallas.length === 1 ? 'lectura no se contó' : 'lecturas no se contaron'}
                </b>{' '}
                — esas fundas tienen que estar en la pila aparte.
              </span>
              <Button size="sm" variant="outline" tone="danger" onMouseDown={(e) => e.preventDefault()} onClick={() => setVerFallas((v) => !v)}>
                {verFallas ? 'Ocultar' : 'Ver cuáles'}
              </Button>
            </div>
          </Notice>
          {verFallas && (
            <div style={{ marginTop: space[2] }}>
              <ListaNoContadas fallas={fallas} />
            </div>
          )}
        </div>
      )}

      <ScanBox scanRef={scanRef} feedback={feedback} escuchando={escuchando} setEscuchando={setEscuchando} onScan={onScan} />

      <Notice tone="warning" icon="!" style={{ marginBottom: space[3] }}>
        Estás contando <b>{grupo.modelo}</b>. Al cerrar, las fundas de este modelo que <b>no escaneaste</b> quedan en <b>0</b>.
      </Notice>

      <TableWrap>
        <THead>
          <Tr>
            <Th>Funda</Th>
            <Th align="center" width={80}>
              Sistema
            </Th>
            <Th align="center" width={100}>
              Escaneado
            </Th>
          </Tr>
        </THead>
        <TBody>
          {grupo.variants.map((v) => {
            const c = state[v.vid] || 0
            return (
              <Tr key={v.vid} style={c > 0 ? { background: color.successBg } : undefined}>
                <Td wrap>{v.producto}</Td>
                <Td align="center" style={{ color: color.mut2 }}>
                  {v.esperado}
                </Td>
                <Td align="center" tall>
                  <NumCelda
                    valor={c}
                    label={`Escaneado de ${v.producto}`}
                    onSet={(val) => onSet(v.vid, val)}
                    onCodigo={onCasilleroCodigo}
                    onListo={() => scanRef.current?.focus()}
                  />
                </Td>
              </Tr>
            )
          })}
        </TBody>
      </TableWrap>

      {!puedeAplicar && (
        <p style={{ fontSize: font.sm, color: color.mut, marginTop: space[3] }}>
          No tenés permiso para cerrar el ajuste. Pedile a un administrador que te lo active en Usuarios.
        </p>
      )}
    </div>
  )
}

// ── Preview del cierre ─────────────────────────────────────────────────────────

function PreviewView({ preview, fallas }: { preview: LbPreview; fallas: LecturaFallida[] }) {
  const { rows, resumen, missing, registro } = preview
  const enCero = registro.filter((r) => (r.contado || 0) === 0).length
  const marcaU = (preview.store || '').toUpperCase()
  const ctl = resumen.control
  const difPila = ctl ? ctl.pila - ctl.escaneadas : 0
  return (
    <div>
      <h2 style={{ fontSize: font.lg, fontWeight: 700, color: color.ink, marginBottom: space[3] }}>Revisión del ajuste · {preview.modelo}</h2>

      {ctl && (
        <Notice tone={difPila === 0 ? 'success' : 'danger'} icon={difPila === 0 ? '✓' : '⚠'} style={{ marginBottom: space[3] }}>
          Pila física: <b>{ctl.pila}</b> · escaneadas: <b>{ctl.escaneadas}</b>
          {difPila === 0 ? ' — coinciden.' : <> — <b>se cierra con {Math.abs(difPila)} de diferencia</b> y queda anotado en el historial.</>}
        </Notice>
      )}

      {fallas.length > 0 && (
        <div style={{ marginBottom: space[3] }}>
          <p style={{ fontSize: font.sm, color: color.dangerInk, fontWeight: 600, marginBottom: space[2] }}>
            {fallas.length} {fallas.length === 1 ? 'lectura no se contó' : 'lecturas no se contaron'}. Con estos códigos se puede buscar en GN qué funda es:
          </p>
          <ListaNoContadas fallas={fallas} />
        </div>
      )}

      <Notice tone="brand" icon="🏷️" style={{ marginBottom: space[3] }}>
        Ajuste del <b>Local de {marcaU}</b> · <b>{preview.modelo}</b>. El Excel se sube <b>solo</b> al GN de {marcaU}.
      </Notice>

      <p style={{ fontSize: font.base, color: color.ink2, marginBottom: space[3] }}>
        Se ajustan <b>{resumen.lineas}</b> {resumen.lineas === 1 ? 'talle' : 'talles'}: <b style={{ color: color.warningInk }}>{resumen.mas}</b> con sobrante (+) y{' '}
        <b style={{ color: color.dangerInk }}>{resumen.menos}</b> con faltante (−) · <b>{resumen.unidades_ajustadas}</b> u.
        {enCero > 0 && (
          <>
            {' · '}
            <b>{enCero}</b> {enCero === 1 ? 'funda sin escanear queda' : 'fundas sin escanear quedan'} en 0.
          </>
        )}
      </p>

      {missing.length > 0 && (
        <Notice tone="danger" icon="⚠" style={{ marginBottom: space[3] }}>
          {missing.length} {missing.length === 1 ? 'talle' : 'talles'} con diferencia <b>NO se ajustan</b>: no se pudo confirmar su stock en vivo. <b>Revisalos a mano.</b>
        </Notice>
      )}

      {!rows.length ? (
        <Notice tone="success" icon="🎉">
          No hay diferencias: lo contado coincide con el sistema. Igual se guarda el conteo con la fecha.
        </Notice>
      ) : (
        <TableWrap maxHeight="52vh">
          <THead>
            <Tr>
              <Th>Funda · Talle</Th>
              <Th align="center">Sist.</Th>
              <Th align="center">Cont.</Th>
              <Th align="center">Dif</Th>
              <Th align="center">Vivo</Th>
              <Th align="center">Nuevo</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((r, i) => (
              <Tr key={i}>
                <Td wrap>
                  {r.producto} · {r.variante}
                </Td>
                <Td align="center" style={{ color: color.mut2 }}>
                  {r.sistema != null ? r.sistema : '—'}
                </Td>
                <Td align="center">{r.contado != null ? r.contado : '—'}</Td>
                <Td align="center" style={{ fontWeight: 700, color: r.dif < 0 ? color.dangerInk : color.warningInk }}>
                  {r.dif > 0 ? '+' : ''}
                  {r.dif}
                </Td>
                <Td align="center" style={{ color: color.mut }}>
                  {r.vivo}
                </Td>
                <Td align="center" style={{ fontWeight: 700, color: color.brand }}>
                  {r.nuevo}
                </Td>
              </Tr>
            ))}
          </TBody>
        </TableWrap>
      )}
    </div>
  )
}
