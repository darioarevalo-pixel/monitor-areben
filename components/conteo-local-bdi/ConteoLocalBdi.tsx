'use client'

import { useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { esAdmin, puedeSub } from '@/lib/permisos'
import { leerInventarioVivo } from '@/lib/inventario-vivo/cliente'
import { realMap } from '@/lib/inventario-vivo/core'
import { guardarConteo, leerHistorial } from '@/lib/conteo-deposito/cliente'
import { aoaAjuste } from '@/lib/conteo-deposito/core'
import type { ConteoHistorial } from '@/lib/conteo-deposito/tipos'
import {
  calcularAjusteModelo,
  contadoModelo,
  escanear,
  esperadoModelo,
  limpiarModelo,
  resolverScan,
  setContado,
  tocadoModelo,
} from '@/lib/conteo-local-bdi/core'
import type { LbPreview, ModeloGrupo } from '@/lib/conteo-local-bdi/tipos'
import { useConteoLocalBdi } from './useConteoLocalBdi'
import { HeaderAcciones } from '@/components/layout/acciones'
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
  const { confirmar, avisar } = useConfirmar()
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
  const [hist, setHist] = useState<{ cargando: boolean; conteos: ConteoHistorial[]; error: string | null }>({ cargando: false, conteos: [], error: null })
  const scanRef = useRef<HTMLInputElement>(null)

  const grupoSel = useMemo(() => modelos.find((m) => m.modelo === modeloSel) || null, [modelos, modeloSel])

  const onScan = (raw: string) => {
    if (!grupoSel) return
    const bc = raw.trim().toUpperCase()
    if (!bc) return
    const vid = resolverScan(byBc, raw)
    const v = vid ? varByVid[vid] : null
    if (!v) {
      setFeedback({ tipo: 'error', texto: 'Código desconocido: ' + bc })
      beep(false)
      vibrate(false)
      return
    }
    if (v.modelo !== grupoSel.modelo) {
      setFeedback({ tipo: 'error', texto: `Esa funda es de ${v.modelo}, estás contando ${grupoSel.modelo}.` })
      beep(false)
      vibrate(false)
      return
    }
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

  const entrarModelo = (modelo: string) => {
    setModeloSel(modelo)
    setFeedback(null)
    setVista('foco')
  }

  const onCerrar = async () => {
    if (!grupoSel) return
    if (!tocadoModelo(state, grupoSel)) {
      await avisar('Todavía no escaneaste ninguna funda de este modelo.')
      return
    }
    setCerrando(true)
    try {
      const d = await leerInventarioVivo(marca, 'local')
      const pv = calcularAjusteModelo(grupoSel, state, realMap(d.rows || []), d.store_name || 'Local', d.store || String(marca), stockTime)
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
        const XLSX = await import('xlsx')
        const ws = XLSX.utils.aoa_to_sheet(aoaAjuste(preview.rows))
        ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 30 }, { wch: 26 }, { wch: 18 }, { wch: 16 }, { wch: 11 }, { wch: 11 }]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Worksheet')
        const fecha = new Date().toISOString().slice(0, 10)
        XLSX.writeFile(wb, `ajuste_fundas_${preview.store || marca}_${preview.modelo.replace(/\s+/g, '-')}_${fecha}.xlsx`)
      }
      try {
        await guardarConteo({ store: preview.store || String(marca), ubicacion: preview.ubicacion, usuario, fecha_inicio: null, resumen: preview.resumen, detalle: preview.registro })
        await cf.refrescarUltimos()
      } catch {
        /* si falla el historial, el Excel ya se generó */
      }
      cf.aplicar(limpiarModelo(state, grupoSel))
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
        {vista === 'lista' && (
          <>
            <Button variant="outline" onClick={() => void onHistorial()}>
              🕘 Historial
            </Button>
            <Button variant="outline" onClick={() => void cf.traerStock(true)} loading={cf.cargando}>
              Traer stock de GN
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
              ← Volver a modelos
            </Button>
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
              ← Volver
            </Button>
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
        <PreviewView preview={preview} />
      ) : vista === 'foco' && grupoSel ? (
        <Foco
          grupo={grupoSel}
          state={state}
          scanRef={scanRef}
          feedback={feedback}
          puedeAplicar={puedeAplicar}
          onScan={onScan}
          onSet={(vid, val) => cf.aplicar(setContado(state, vid, val))}
        />
      ) : (
        <ListaModelos modelos={modelos} state={state} ultimos={ultimos} stockTime={stockTime} search={search} setSearch={setSearch} onEntrar={entrarModelo} />
      )}
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
    return <EmptyState icon="📱" title="No hay fundas en el Local" hint='Tocá "Traer stock de GN" para bajar el stock.' dashed />
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
          <b>Stock del Local traído: {fmtDia(stockTime)} hs</b> — arrancá con los pedidos al día. Si volvés a &quot;Traer stock de GN&quot;, esta hora se actualiza.
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
              <Button size="sm" variant="outline" tone="brand">
                Contar →
              </Button>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ── Foco: contar un modelo ─────────────────────────────────────────────────────

function ScanBox({ scanRef, feedback, onScan }: { scanRef: React.RefObject<HTMLInputElement | null>; feedback: Feedback | null; onScan: (v: string) => void }) {
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
      <input
        ref={scanRef}
        className="mo-input"
        type="text"
        autoComplete="off"
        placeholder="🔫 Escaneá las fundas de este modelo…"
        aria-label="Código de barras a escanear"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            const v = e.currentTarget.value
            e.currentTarget.value = ''
            onScan(v)
          }
        }}
        style={{ height: 48, fontSize: 16, borderWidth: 2, borderColor: color.brandSolid }}
      />
      <div
        style={{ marginTop: space[2], padding: space[4], border: `1px solid ${t.bd}`, borderRadius: 'var(--mo-r-xl)', fontSize: font.md, textAlign: 'center', background: t.bg, color: t.fg }}
        role="status"
      >
        {!feedback ? (
          'Escaneá una funda para empezar…'
        ) : feedback.tipo === 'ok' ? (
          <>
            ✓ <b style={{ fontSize: 18 }}>{feedback.texto}</b>
            {feedback.talle ? (
              <>
                {' · '}
                <b>{feedback.talle}</b>
              </>
            ) : null}
            <div style={{ fontSize: font.base, marginTop: 2 }}>
              escaneadas: <b>{feedback.count}</b>
            </div>
          </>
        ) : (
          (feedback.tipo === 'error' ? '🔴 ' : '⚠️ ') + feedback.texto
        )}
      </div>
    </div>
  )
}

function Foco({
  grupo,
  state,
  scanRef,
  feedback,
  puedeAplicar,
  onScan,
  onSet,
}: {
  grupo: ModeloGrupo
  state: Record<string, number>
  scanRef: React.RefObject<HTMLInputElement | null>
  feedback: Feedback | null
  puedeAplicar: boolean
  onScan: (v: string) => void
  onSet: (vid: string, val: string) => void
}) {
  const con = contadoModelo(state, grupo)
  const esp = esperadoModelo(grupo)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[3], flexWrap: 'wrap', marginBottom: space[3] }}>
        <h2 style={{ fontSize: font.xl, fontWeight: 700, color: color.ink }}>{grupo.modelo}</h2>
        <span style={{ fontSize: font.sm, color: color.mut }}>
          escaneadas <b style={{ color: color.warningInk }}>{con}</b> · sistema {esp}
        </span>
      </div>

      <ScanBox scanRef={scanRef} feedback={feedback} onScan={onScan} />

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
                  <input
                    className="mo-input mo-input--num"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={c || ''}
                    onChange={(e) => onSet(v.vid, e.target.value)}
                    placeholder="0"
                    aria-label={`Escaneado de ${v.producto}`}
                    style={{ width: 72, textAlign: 'center', padding: '0 6px' }}
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

function PreviewView({ preview }: { preview: LbPreview }) {
  const { rows, resumen, missing, registro } = preview
  const enCero = registro.filter((r) => (r.contado || 0) === 0).length
  const marcaU = (preview.store || '').toUpperCase()
  return (
    <div>
      <h2 style={{ fontSize: font.lg, fontWeight: 700, color: color.ink, marginBottom: space[3] }}>Revisión del ajuste · {preview.modelo}</h2>

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
