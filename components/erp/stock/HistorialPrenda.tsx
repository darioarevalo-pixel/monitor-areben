'use client'

/**
 * ERP › Stock › ficha del producto › «Movimientos» (Darío 18-nov; propuesta https://claude.ai/artifact/S7rgTeqyFmvhhR8a2k4qpb):
 * la ventana grande con el historial como TABLA — Fecha · Movimiento · Entrada · Salida · Saldo · Descripción —, por
 * depósito (arranca en el que más movimientos tiene) o todos juntos, y filtro por tipo. Con un filtro de tipo el Saldo ⛔ se
 * muestra: salta entre renglones (lo explican los que el filtro esconde) y confunde. En el celular, un renglón por movimiento.
 * Qué es un renglón (la venta de Tienda Nube con su preparado, las correcciones que se anulan): `lib/erp/historial-prenda.core.js`.
 * 🆕 18-nov (Darío): es LO que se abre al tocar un producto en Stock, Movimientos y la búsqueda — la ficha del costado repetía
 * la lista —; trae el código de barras, «Ajustar» (lleva a «Nuevo ajuste») y «Etiquetas ↗». Diferencias y Conciliación
 * siguen con la ficha del costado: ahí lo que importa es la comparación con Gestión Nube y Tienda Nube.
 * 🆕 Paso 2 (Darío 18-nov): «Transferir» y «Ajustar» se hacen DENTRO de la ventana — un recuadro abajo, en lugar de los botones —
 * con las mismas acciones que sus pantallas: la transferencia libre del motor (crear → armar → enviar; el destino la recibe
 * escaneando, como siempre) y el ajuste (crear + aprobar, la aprobación está apagada). Lo imposible ⛔ se ofrece: ⛔ sale más de
 * lo que hay en el depósito. Al guardar, la tabla se vuelve a leer y el nuevo renglón aparece arriba.
 */

import { useEffect, useMemo, useState } from 'react'
import { Button, Field, Input, Modal, Notice, NumberField, Select, color, font, space, weight } from '@/components/ui'
import { usePantallaAngosta } from '@/lib/movil'
import { lineaDe } from '@/lib/lineas'
import { usePuedeErp } from '@/lib/erp/usePuedeErp'
import {
  aprobarAjuste, armarTransferenciaDoc, crearAjuste, crearTransferenciaDoc, enviarTransferenciaDoc, leerHistorialDePrenda,
  type FilaHistorial, type HistorialDePrenda, type MarcaErp, type TiendaErp,
} from '@/lib/erp/cliente'
import { MOTIVOS } from '@/lib/erp/ajuste.core.js'
import { DEPOSITOS_DE_LINEA } from '@/lib/erp/transferencia-escaneo.core.js'
import { FILTROS, depositoInicial, filtrarHistorial } from '@/lib/erp/historial-prenda.core.js'

/** El color de la etiqueta de cada tipo (tokens `--mo-mov-*` de `app/tokens.css`). */
const ETIQUETA: Record<string, [string, string]> = {
  compra: ['var(--mo-mov-compra-bg)', 'var(--mo-mov-compra-fg)'],
  venta: ['var(--mo-mov-venta-bg)', 'var(--mo-mov-venta-fg)'],
  cambio: ['var(--mo-mov-venta-bg)', 'var(--mo-mov-venta-fg)'],
  transf: ['var(--mo-mov-transf-bg)', 'var(--mo-mov-transf-fg)'],
  ajuste: ['var(--mo-mov-ajuste-bg)', 'var(--mo-mov-ajuste-fg)'],
  ajusteventa: ['var(--mo-mov-ajuste-bg)', 'var(--mo-mov-ajuste-fg)'],
  salida: ['var(--mo-mov-ajuste-bg)', 'var(--mo-mov-ajuste-fg)'],
  anulada: ['var(--mo-mov-deshace-bg)', 'var(--mo-mov-deshace-fg)'],
  cancelado: ['var(--mo-mov-deshace-bg)', 'var(--mo-mov-deshace-fg)'],
}

const DIA = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: '2-digit' })
const HORA = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function Etiqueta({ f }: { f: FilaHistorial }) {
  const [bg, fg] = ETIQUETA[f.tipo] ?? [color.bg2, color.ink2]
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: font.sm, fontWeight: weight.semibold, background: bg, color: fg, whiteSpace: 'nowrap' }}>{f.tipoNombre}</span>
}

/** Los motivos de una salida a mano (el conteo entra solo, ⛔ va). */
const MOTIVOS_SALIDA = MOTIVOS.filter((m) => m.key !== 'conteo')
const unid = (n: number) => `${n} ${n === 1 ? 'unidad' : 'unidades'}`

type Panel =
  | { tipo: 'transf'; desde: string; hacia: string; cantidad: number | ''; nota: string }
  | { tipo: 'ajuste'; sentido: 'ingreso' | 'salida'; deposito: string; motivo: string; cantidad: number | ''; porque: string }

/** Lo que ya se sabe del producto (la fila de la lista); sin eso, lo trae el servidor. */
export type DatosDelProducto = { nombre?: string | null; talleNombre?: string | null; sku?: string | null; barcode?: string | null; linea?: string | null }

export function HistorialPrenda({ marca, producto, talle, datos, onCerrar }: {
  marca: MarcaErp; producto: string; talle: string; datos?: DatosDelProducto | null
  onCerrar: () => void
}) {
  const [h, setH] = useState<HistorialDePrenda | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deposito, setDeposito] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('todo')
  const [panel, setPanel] = useState<Panel | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [hecho, setHecho] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const angosta = usePantallaAngosta()

  useEffect(() => {
    let vivo = true
    leerHistorialDePrenda(marca, producto, talle)
      .then((x) => { if (vivo) { setH(x); setDeposito((d) => d ?? depositoInicial(x.depositos)) } })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudieron leer los movimientos del producto.'))
    return () => { vivo = false }
  }, [marca, producto, talle, vuelta])

  const ajusta = usePuedeErp(marca)('ajustar')
  const nombre = datos?.nombre ?? h?.prenda?.nombre ?? 'Producto'
  const variante = datos?.talleNombre ?? h?.prenda?.talleNombre ?? ''
  const codigo = datos?.sku ?? h?.prenda?.sku ?? null
  const barcode = datos?.barcode ?? h?.prenda?.barcode ?? null
  const linea = datos?.linea ?? (codigo || h ? lineaDe(marca, codigo) : null)
  // Los depósitos donde se transfiere y ajusta (el mayorista está apagado, Darío 18-nov).
  const deps: string[] = linea ? (DEPOSITOS_DE_LINEA as Record<string, string[]>)[linea] ?? [] : []
  const nombreDep = (d: string) => h?.depositos.find((x) => x.deposito === d)?.nombre ?? d
  const hay = (d: string) => Math.max(0, h?.depositos.find((x) => x.deposito === d)?.saldo ?? 0)

  const dep = deposito ?? 'todos'
  const filas = useMemo(() => (h ? filtrarHistorial(h.filas, { deposito: dep, filtro }) : []), [h, dep, filtro])
  const conSaldo = filtro === 'todo'
  const todos = dep === 'todos'
  const saldo = !h ? null : todos ? h.total : h.depositos.find((d) => d.deposito === dep)?.saldo ?? 0
  // Arranca en el depósito que se está mirando (si es uno de los dos); para transferir, en el que tiene stock.
  const enVista = deps.includes(dep) ? dep : null
  function abrirTransferir() {
    const desde = enVista && hay(enVista) > 0 ? enVista : deps.find((d) => hay(d) > 0) ?? deps[0]
    setPanel({ tipo: 'transf', desde, hacia: deps.find((d) => d !== desde) ?? deps[0], cantidad: '', nota: '' }); setHecho(null); setError(null)
  }
  function abrirAjustar() {
    setPanel({ tipo: 'ajuste', sentido: 'ingreso', deposito: enVista ?? deps[0], motivo: 'otro', cantidad: '', porque: '' }); setHecho(null); setError(null)
  }

  /** Lo que frena el botón principal (se muestra en el botón apagado). */
  const frena = !panel ? null
    : !panel.cantidad ? 'Cantidad'
    : panel.tipo === 'transf' ? (panel.desde === panel.hacia ? 'Depósitos distintos' : panel.cantidad > hay(panel.desde) ? `Hay ${hay(panel.desde)} en ${nombreDep(panel.desde)}` : null)
    : panel.sentido === 'salida' && panel.cantidad > hay(panel.deposito) ? `Hay ${hay(panel.deposito)} en ${nombreDep(panel.deposito)}`
    : panel.motivo === 'otro' && panel.porque.trim().length < 3 ? 'Por qué'
    : null

  async function guardar() {
    if (!panel || frena || !linea || !panel.cantidad) return
    const n = panel.cantidad
    setTrabajando(true); setError(null)
    if (panel.tipo === 'transf') {
      // crear → armar → enviar, como «Transferir» de Transferencias.
      const renglones = [{ product_id: producto, size_id: talle, sku: codigo, barcode, cantidad: n }]
      let numero: number | null = null
      try {
        const nota = panel.nota.trim()
        const c = nota ? await crearTransferenciaDoc(linea as TiendaErp, panel.desde, panel.hacia, renglones, nota) : await crearTransferenciaDoc(linea as TiendaErp, panel.desde, panel.hacia, renglones)
        numero = c.transferencia.numero
        await armarTransferenciaDoc(linea as TiendaErp, c.transferencia.id, renglones)
        const e = await enviarTransferenciaDoc(linea as TiendaErp, c.transferencia.id)
        setHecho(`T-${e.transferencia.numero} en tránsito hacia ${nombreDep(panel.hacia)}: se recibe escaneando.`)
        setPanel(null); setVuelta((v) => v + 1)
      } catch (err) {
        const m = err instanceof Error ? err.message : 'No se pudo transferir.'
        setError(numero ? `${m} T-${numero} quedó sin enviar: no salió nada del stock. Cancelala en Transferencias.` : m)
        if (numero) setPanel(null)
      } finally { setTrabajando(false) }
      return
    }
    let creado: { numero: number; id: string } | null = null
    try {
      const motivo = panel.sentido === 'ingreso' ? 'otro' : panel.motivo
      // «Otro» va con signo; Con falla / Canje / Regalo, lo que sale en positivo (como en Ajustes).
      const cantidad = motivo === 'otro' ? (panel.sentido === 'ingreso' ? n : -n) : n
      creado = await crearAjuste({ linea: linea as TiendaErp, deposito: panel.deposito, motivo, detalle: panel.porque.trim(), fuente: 'mano', renglones: [{ producto, talle, sku: codigo, barcode, cantidad }] })
      const r = await aprobarAjuste(linea as TiendaErp, creado.id)
      setHecho(`A-${r.numero} guardado.`)
      setPanel(null); setVuelta((v) => v + 1)
    } catch (err) {
      const m = err instanceof Error ? err.message : 'No se pudo guardar el ajuste.'
      if (creado) { setPanel(null); setError(`A-${creado.numero} quedó guardado sin aplicar (${m}). Confirmalo en Ajustes.`) } else setError(m)
    } finally { setTrabajando(false) }
  }

  const opciones = h ? [...h.depositos.map((d) => ({ k: d.deposito, n: d.nombre, s: d.saldo })), { k: 'todos', n: 'Todos', s: h.total }] : []

  const boton = (activo: boolean): React.CSSProperties => ({
    height: angosta ? 40 : 32, padding: '0 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: font.base,
    background: activo ? color.surface : 'transparent', color: activo ? color.ink : color.mut, fontWeight: activo ? weight.semibold : weight.normal,
    boxShadow: activo ? '0 1px 2px rgba(15,23,41,.12)' : 'none', whiteSpace: 'nowrap',
  })
  const chip = (activo: boolean): React.CSSProperties => ({
    height: angosta ? 34 : 30, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: font.sm, fontWeight: weight.semibold,
    border: `1px solid ${activo ? color.brandSolid : color.line2}`, background: activo ? color.brandSolid : color.surface, color: activo ? '#fff' : color.mut, whiteSpace: 'nowrap', flexShrink: 0,
  })

  const titulo = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3], width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: space[4] }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: font.xs, fontWeight: weight.semibold, letterSpacing: '0.06em', textTransform: 'uppercase', color: color.mut }}>Movimientos</div>
          <div style={{ fontSize: angosta ? font.xl : font['2xl'], fontWeight: weight.bold, color: color.ink, overflowWrap: 'anywhere' }}>{nombre}{variante ? ` · ${variante}` : ''}</div>
          {(codigo || barcode) && <div style={{ fontSize: font.sm, color: color.mut, fontWeight: weight.normal }}>{[codigo, barcode].filter(Boolean).join(' · ')}</div>}
        </div>
        <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
          <div style={{ fontSize: font.sm, color: color.mut, fontWeight: weight.normal }}>{todos ? 'Total' : opciones.find((o) => o.k === dep)?.n ?? ''}</div>
          <div style={{ fontSize: angosta ? 26 : 32, fontWeight: weight.bold, lineHeight: 1.1, color: (saldo ?? 0) < 0 ? 'var(--mo-danger-ink)' : color.ink, fontVariantNumeric: 'tabular-nums' }}>{saldo ?? '…'}</div>
        </div>
      </div>
      {h && (
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
          <div role="group" aria-label="Depósito" style={{ display: 'flex', background: color.bg2, borderRadius: 10, padding: 3, gap: 2, maxWidth: '100%', overflowX: 'auto' }}>
            {opciones.map((o) => (
              <button key={o.k} type="button" aria-pressed={dep === o.k} onClick={() => setDeposito(o.k)} style={boton(dep === o.k)}>
                {o.n} <b style={{ marginLeft: 4, fontVariantNumeric: 'tabular-nums' }}>{o.s}</b>
              </button>
            ))}
          </div>
          <div role="group" aria-label="Tipo de movimiento" style={{ display: 'flex', gap: 6, overflowX: 'auto', maxWidth: '100%' }}>
            {FILTROS.map(([k, n]) => <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)} style={chip(filtro === k)}>{n}</button>)}
          </div>
        </div>
      )}
    </div>
  )

  const num: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: weight.semibold, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '8px 10px', borderTop: `1px solid ${color.bg2}`, verticalAlign: 'middle' }
  const th: React.CSSProperties = { padding: '8px 10px', fontWeight: weight.semibold, fontSize: font.sm, color: color.mut, textAlign: 'left', position: 'sticky', top: 0, background: color.surface, borderBottom: `1px solid ${color.line}`, whiteSpace: 'nowrap' }

  // El recuadro de Transferir / Ajustar (en el pie, en lugar de los botones). Un elemento, ⛔ componente: así ⛔ pierde el foco al tipear.
  const recuadro = !panel ? null : (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: space[3], flexWrap: 'wrap', width: '100%' }}>
      <div style={{ width: '100%', fontSize: font.base, fontWeight: weight.bold, color: color.ink }}>{panel.tipo === 'transf' ? 'Transferir' : 'Ajustar'}</div>
      {panel.tipo === 'transf' ? <>
        <Field label="Origen">
          <Select value={panel.desde} onChange={(e) => { const d = e.target.value; setPanel({ ...panel, desde: d, hacia: d === panel.hacia ? deps.find((x) => x !== d) ?? panel.hacia : panel.hacia }) }}>
            {deps.map((d) => <option key={d} value={d}>{nombreDep(d)} · {hay(d)}</option>)}
          </Select>
        </Field>
        <Field label="Destino">
          <Select value={panel.hacia} onChange={(e) => setPanel({ ...panel, hacia: e.target.value })}>
            {deps.filter((d) => d !== panel.desde).map((d) => <option key={d} value={d}>{nombreDep(d)}</option>)}
          </Select>
        </Field>
        <Field label="Cantidad"><NumberField value={panel.cantidad} min={1} max={hay(panel.desde) || undefined} onChange={(c) => setPanel({ ...panel, cantidad: c })} /></Field>
        <div style={{ flex: '1 1 160px', minWidth: 160 }}><Field label="Nota"><Input value={panel.nota} onChange={(e) => setPanel({ ...panel, nota: e.target.value })} placeholder="Opcional" /></Field></div>
      </> : <>
        <Field label="Tipo">
          <div role="group" aria-label="Ingreso o salida" style={{ display: 'flex', gap: space[1] }}>
            {(['ingreso', 'salida'] as const).map((t) => (
              <Button key={t} variant={panel.sentido === t ? 'solid' : 'outline'} aria-pressed={panel.sentido === t}
                onClick={() => setPanel({ ...panel, sentido: t, motivo: 'otro' })}>{t === 'ingreso' ? 'Ingreso' : 'Salida'}</Button>
            ))}
          </div>
        </Field>
        <Field label="Depósito">
          <Select value={panel.deposito} onChange={(e) => setPanel({ ...panel, deposito: e.target.value })}>
            {deps.map((d) => <option key={d} value={d}>{nombreDep(d)} · {hay(d)}</option>)}
          </Select>
        </Field>
        {panel.sentido === 'salida' && (
          <Field label="Motivo">
            <Select value={panel.motivo} onChange={(e) => setPanel({ ...panel, motivo: e.target.value })}>
              {MOTIVOS_SALIDA.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Cantidad"><NumberField value={panel.cantidad} min={1} max={panel.sentido === 'salida' ? hay(panel.deposito) || undefined : undefined} onChange={(c) => setPanel({ ...panel, cantidad: c })} /></Field>
        <div style={{ flex: '1 1 160px', minWidth: 160 }}>
          <Field label={panel.motivo === 'otro' ? 'Por qué' : 'Detalle'}>
            <Input value={panel.porque} onChange={(e) => setPanel({ ...panel, porque: e.target.value })} placeholder={panel.motivo === 'otro' ? 'Ej.: apareció en el conteo' : 'Opcional'} />
          </Field>
        </div>
      </>}
      <div style={{ display: 'flex', gap: space[2], marginLeft: 'auto' }}>
        <Button variant="outline" tone="danger" disabled={trabajando} onClick={() => setPanel(null)}>Cancelar</Button>
        <Button variant="solid" tone="brand" disabled={trabajando || !!frena} title={frena ?? undefined} onClick={guardar}>
          {trabajando ? 'Guardando…' : !panel.cantidad ? (panel.tipo === 'transf' ? 'Transferir' : panel.sentido === 'ingreso' ? 'Ingresar' : 'Sacar')
            : panel.tipo === 'transf' ? `Transferir ${unid(panel.cantidad)}` : `${panel.sentido === 'ingreso' ? 'Ingresar' : 'Sacar'} ${unid(panel.cantidad)}`}
        </Button>
      </div>
    </div>
  )

  return (
    <Modal abierto onCerrar={onCerrar} titulo={titulo} ancho="xl" variante="pos"
      pie={panel ? recuadro : <>
        <span style={{ marginRight: 'auto', fontSize: font.sm, color: color.mut }}>{h ? `${filas.length} ${filas.length === 1 ? 'movimiento' : 'movimientos'}` : ''}</span>
        <Button variant="outline" onClick={() => window.open('/etiquetas', '_blank', 'noopener')}>Etiquetas ↗</Button>
        {ajusta && deps.length > 1 && <Button variant="outline" disabled={!h} onClick={abrirTransferir}>Transferir</Button>}
        {ajusta && deps.length > 0 && <Button variant="outline" disabled={!h} onClick={abrirAjustar}>Ajustar</Button>}
      </>}>
      {/* Mismo alto siempre: con pocos renglones la ventana se achicaba y saltaba al cambiar de filtro. */}
      <div style={{ minHeight: angosta ? undefined : 'calc(100vh - 250px)' }}>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {hecho && <Notice tone="success" onClose={() => setHecho(null)}>{hecho}</Notice>}
      {!h ? (!error && <div style={{ padding: space[6], color: color.mut }}>Leyendo los movimientos…</div>)
        : !filas.length ? <div style={{ padding: space[6], color: color.mut }}>No hay movimientos con ese filtro.</div>
        : angosta ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filas.map((f) => (
              <div key={f.id} style={{ display: 'flex', gap: space[3], alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${color.bg2}` }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.base }}>
                    <Etiqueta f={f} />
                    {f.ref && <b style={{ color: color.brand, whiteSpace: 'nowrap' }}>{f.ref}</b>}
                    <span title={HORA.format(new Date(f.cuando))} style={{ marginLeft: 'auto', fontSize: font.sm, color: color.mut, whiteSpace: 'nowrap' }}>{DIA.format(new Date(f.cuando))}</span>
                  </div>
                  <div style={{ fontSize: font.sm, color: color.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[todos ? f.depositoNombre : null, f.desc].filter(Boolean).join(' · ')}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: 56, flexShrink: 0 }}>
                  <span style={{ ...num, fontSize: font.lg, fontWeight: weight.bold, color: f.cantidad > 0 ? 'var(--mo-success-ink)' : 'var(--mo-danger-ink)' }}>{f.cantidad > 0 ? `+${f.cantidad}` : f.cantidad}</span>
                  {conSaldo && <span style={{ fontSize: font.xs, color: color.mut }}>queda {f.saldoVisto}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.base }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 84 }}>Fecha</th>
                <th style={{ ...th, width: 230 }}>Movimiento</th>
                {todos && <th style={{ ...th, width: 140 }}>Depósito</th>}
                <th style={{ ...th, textAlign: 'right', width: 70 }}>Entrada</th>
                <th style={{ ...th, textAlign: 'right', width: 64 }}>Salida</th>
                {conSaldo && <th style={{ ...th, textAlign: 'right', width: 64 }}>Saldo</th>}
                <th style={th}>Descripción</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td style={{ ...td, color: color.mut, whiteSpace: 'nowrap' }} title={HORA.format(new Date(f.cuando))}>{DIA.format(new Date(f.cuando))}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}><Etiqueta f={f} />{f.ref && <b style={{ marginLeft: 8, color: color.brand }}>{f.ref}</b>}</td>
                  {todos && <td style={{ ...td, color: color.mut }}>{f.depositoNombre}</td>}
                  <td style={{ ...td, ...num, color: 'var(--mo-success-ink)' }}>{f.cantidad > 0 ? f.cantidad : ''}</td>
                  <td style={{ ...td, ...num, color: 'var(--mo-danger-ink)' }}>{f.cantidad < 0 ? -f.cantidad : ''}</td>
                  {conSaldo && <td style={{ ...td, ...num, fontWeight: weight.bold, color: f.saldoVisto < 0 ? 'var(--mo-danger-ink)' : color.ink }}>{f.saldoVisto}</td>}
                  <td style={{ ...td, color: color.ink2 }}>{f.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  )
}
