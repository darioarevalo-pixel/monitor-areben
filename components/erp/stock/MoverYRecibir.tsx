'use client'

/**
 * ERP › Stock › Mover y recibir — la transferencia como DOCUMENTO, con el molde del diseño (§3 y §7): **mover** (transferencia
 * libre: se escanea lo que sale, con nota, y se manda; el libro anota la SALIDA al instante) y **recibir** (se abre desde la
 * ficha de una que está en camino; en destino se escanea lo que llegó, y lo que ⛔ llega queda como diferencia marcada, nunca se
 * ajusta sola). La lista de abajo es de TRABAJO: vistas con su número, buscador, barrita de 4 pasos, ficha al costado con lo
 * pedido, armado, enviado y recibido, remito para imprimir y «Exportar». Mueve SÓLO el libro del ERP: ⛔ GN ni Tienda Nube.
 * Núcleos: `lib/erp/transferencia-escaneo.core.js` (el escaneo) y `lib/erp/transferencias-doc.core.js` (la lista y la ficha).
 *
 * 🔑 `unificada` (Bruno, 30-oct): para la línea cortada (`erp_corte`: su transferencia vive en el ERP) ésta ES la pestaña
 * Transferencias: la lista de TODAS (las de Reposición, que llegan recibidas, y las movidas a mano), con «Mover» como botón.
 *
 * 📱 En el celular (Bruno, 29-oct; artifact molde 4): lo escaneado va en tarjetas con + y − grandes —al recibir, verde lo que
 * llegó entero y ámbar lo que falta— y recibir ocupa la pantalla, con el botón fijo al pie.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, EmptyState, Field, Input, Modal, Notice, useConfirmar, PasoCantidad, SectionCard, Select, TableWrap, TBody, Td, Th, THead, Tr, color, font, space, weight } from '@/components/ui'
import { toneTokens } from '@/components/ui/tokens'
import { usePantallaAngosta } from '@/lib/movil'
import { deLaTienda, useTiendaErp } from '@/lib/erp/linea-erp'
import { usePuedeErp } from '@/lib/erp/usePuedeErp'
import { IconoFila, ListaTrabajo, type ColumnaLista, type OrdenLista } from '@/components/ui/ListaTrabajo'
import { Icono } from '@/components/ui/Icono'
import { BOTON_PIE, PieFijo } from '@/components/ui/FichaCostado'
import { BuscadorLista, VistasLista, cuandoCorto } from '@/components/ui/PiezasLista'
import {
  armarTransferenciaDoc, buscarPrendas, cancelarTransferenciaDoc, crearTransferenciaDoc, enviarTransferenciaDoc, leerDepositos, leerListaDeStock, leerTransferenciasDoc, recibirTransferenciaDoc,
  type AvisoDoc, type PrendaEncontrada, type TiendaErp, type TransferenciaDoc,
} from '@/lib/erp/cliente'
import { NOMBRE_DEPOSITO } from '@/lib/erp/stock.core.js'
import {
  VISTAS_DOC, contarVistasDoc, csvDeDocs, faltantesDe, origenDeDoc, filtrarDocs, nombreDeRenglon, nombresDePrendas, ordenarDocs, pasoDeDoc, remitoHtml, renglonesConDiferencia, unidadesEnviadas, vistaDeEntradaDoc,
} from '@/lib/erp/transferencias-doc.core.js'
import { BarraPasos } from './Barritas'
import { DEPOSITOS_DE_LINEA, cuentaDeRecepcion, fijarCantidad, listaDeRecepcion, prendaExacta, renglonesParaMotor, sumarEscaneo, unidades } from '@/lib/erp/transferencia-escaneo.core.js'

type Fila = { producto: string; talle: string; sku: string | null; barcode: string | null; nombre: string | null; talleNombre: string | null; cantidad: number; enviada?: number }
const dep = (d: string) => (NOMBRE_DEPOSITO as Record<string, string>)[d] ?? d
const baseDe = (l: TiendaErp) => (l === 'bdi' ? 'bdi' : 'zattia')
const nombreDe = (f: Fila) => (f.nombre ? `${f.nombre}${f.talleNombre ? ` · ${f.talleNombre}` : ''}` : f.sku ?? `Producto ${f.producto}/${f.talle}`)
type Nombres = Record<string, { nombre: string | null; talleNombre: string | null }>
const u = (n: number) => `${n.toLocaleString('es-AR')} u`
const faltanTxt = (n: number) => (n === 1 ? 'falta 1' : `faltan ${n}`)
const sobranTxt = (n: number) => (n === 1 ? 'sobra 1' : `sobran ${n}`)
const COLUMNAS: ColumnaLista[] = [
  { key: 'n', titulo: 'Nº', ancho: '70px', ordena: true, movil: 'oculta' },
  { key: 'creada', titulo: 'Fecha', ancho: '110px', ordena: true, movil: 'oculta' },
  { key: 'ruta', titulo: 'Recorrido', ancho: 'minmax(170px, 1fr)', movil: 'titulo' },
  { key: 'quien', titulo: 'Responsable', ancho: '110px', movil: 'oculta' },
  { key: 'estado', titulo: 'Estado', ancho: 'minmax(300px, 1.6fr)', movil: 'chico' },
  { key: 'unidades', titulo: 'Unidades', ancho: '90px', ordena: true, derecha: true, movil: 'dato' },
]
/** La lista única: + el tipo (Reposición · Devolución · Manual). */
const COLUMNAS_UNIFICADA: ColumnaLista[] = [
  ...COLUMNAS.slice(0, 3),
  { key: 'origen', titulo: 'Tipo', ancho: '120px', movil: 'oculta' },
  ...COLUMNAS.slice(3),
]
/** En la compu (Darío, 18-nov, mirando GN): Origen y Destino en columnas separadas, y Productos (distintos) al lado de Unidades. */
const EN_COMPU = (cols: ColumnaLista[]): ColumnaLista[] => cols.flatMap((c): ColumnaLista[] => (
  c.key === 'ruta' ? [{ key: 'desde', titulo: 'Origen', ancho: 'minmax(140px, 1fr)' }, { key: 'hacia', titulo: 'Destino', ancho: 'minmax(140px, 1fr)' }]
    : c.key === 'unidades' ? [{ key: 'productos', titulo: 'Productos', ancho: '90px', derecha: true }, c]
      : [c]
))
const abrirReposicion = () => window.open('/reposicion', '_blank', 'noopener')

function bajarCsv(docs: TransferenciaDoc[], linea: TiendaErp) {
  const url = URL.createObjectURL(new Blob([csvDeDocs(docs, dep)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = `transferencias-${linea}.csv`; a.click()
  URL.revokeObjectURL(url)
}
function imprimirRemito(d: TransferenciaDoc, nombres: Nombres) {
  const url = URL.createObjectURL(new Blob([remitoHtml(d, nombres, dep)], { type: 'text/html;charset=utf-8' }))
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Caja de escaneo: el lector escribe y manda Enter. Un código exacto suma 1; un texto con varias coincidencias deja elegir.
 * ⚡ (Darío, 18-nov: «¿el código de barras funciona bien?») El código o SKU se resuelve AL INSTANTE con la lista de stock ya
 * leída (`local`), sin ir al servidor: antes cada escaneo esperaba la respuesta y el que llegaba en el medio se perdía o se
 * pegaba al anterior («77900017790001»). Al servidor va sólo lo que no es un código (el nombre).
 */
function Escaneo({ linea, onPrenda, autoFocus = true, hayDe, origen, rechazo, local, cantidadDe, onCantidad, destinoDe, destino }: { linea: TiendaErp; onPrenda: (p: PrendaEncontrada) => void; autoFocus?: boolean; /** Al recibir: por qué ⛔ se suma (no vino, o ya está todo). null = se suma. */ rechazo?: (p: PrendaEncontrada) => string | null; /** Al transferir: cuánto queda para sacar del origen (null = no se sabe, no se frena). */ hayDe?: (p: { producto: string; talle: string }) => number | null; origen?: string; /** El producto de un código de barras o SKU exacto, sin ir al servidor (null = ⛔ se conoce). */ local?: (codigo: string) => PrendaEncontrada | null
  /** Al transferir (como en GN, Darío 18-nov): la búsqueda por nombre es una TABLA con la cantidad de cada modelo para completar. */
  cantidadDe?: (p: PrendaEncontrada) => number; onCantidad?: (p: PrendaEncontrada, n: number) => void; destinoDe?: (p: PrendaEncontrada) => number | null; destino?: string }) {
  const [texto, setTexto] = useState('')
  const [opciones, setOpciones] = useState<{ variantes: PrendaEncontrada[]; cortado: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [marcada, setMarcada] = useState(0)
  const caja = useRef<HTMLInputElement>(null)
  // Al transferir sólo se ofrece lo que hay en el origen: lo demás ⛔ puede salir de ahí.
  const conStock = (p: PrendaEncontrada) => { const h = hayDe?.(p); return h == null || h > 0 }
  function sumar(una: PrendaEncontrada) {
    if (!conStock(una)) { setOpciones(null); setError(`${nombreDe({ ...una, cantidad: 1 })}: no queda stock en ${origen ?? 'el origen'}.`); return }
    const motivo = rechazo ? rechazo(una) : null
    if (motivo) { setOpciones(null); setError(motivo); return }
    onPrenda(una); setOpciones(null); setError(null)
  }
  // Autocompletado (Darío, 18-nov): con 3 letras y medio segundo quieto, sugiere SIN sumar nada. La pistola ⛔ lo dispara: escribe
  // el código de golpe y aprieta Enter, y un texto de sólo números (un código) ⛔ se sugiere. `vuelta` descarta la respuesta vieja.
  const vuelta = useRef(0)
  async function sugerir(q: string) {
    const mia = ++vuelta.current
    setOcupado(true)
    try {
      const r = await buscarPrendas(baseDe(linea), q)
      if (mia !== vuelta.current) return
      const variantes = deLaTienda(r.variantes, linea).filter(conStock)
      if (variantes.length) { setOpciones({ variantes, cortado: r.cortado }); setMarcada(0); setError(null) }
      else { setOpciones(null); setError(`Ningún producto coincide con «${q}».`) }
    } catch { /* al sugerir ⛔ se molesta: el Enter avisa */ }
    finally { if (mia === vuelta.current) setOcupado(false) }
  }
  useEffect(() => {
    const q = texto.trim()
    if (q.length < 3 || !/[a-záéíóúñ]/i.test(q) || local?.(q)) return
    const t = setTimeout(() => { void sugerir(q) }, 500)
    return () => clearTimeout(t)
  }, [texto]) // eslint-disable-line react-hooks/exhaustive-deps
  async function buscar() {
    const q = texto.trim()
    if (!q) return
    const yaEsta = local?.(q)
    if (yaEsta) { vuelta.current++; setTexto(''); sumar(yaEsta); return }
    const mia = ++vuelta.current
    setOcupado(true)
    try {
      const r = await buscarPrendas(baseDe(linea), q)
      if (mia !== vuelta.current) return
      const todas = deLaTienda(r.variantes, linea)
      const exacta = prendaExacta(todas, q)
      const variantes = todas.filter(conStock)
      if (exacta) { setTexto(''); sumar(exacta) }
      else if (variantes.length === 1 && !onCantidad) { setTexto(''); sumar(variantes[0]) }
      else if (todas.length && !variantes.length) { setOpciones(null); setTexto(''); setError(`«${q}»: no queda stock en ${origen ?? 'el origen'}.`) }
      else if (!variantes.length) { setOpciones(null); setTexto(''); setError(`Ningún producto coincide con «${q}».`) }
      else { setOpciones({ variantes, cortado: r.cortado }); setMarcada(0); setError(null) }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo buscar.')
    } finally {
      if (mia === vuelta.current) setOcupado(false)
      caja.current?.focus()
    }
  }
  return (
    <div>
      <Field label="Escanear un producto">
        <Input ref={caja} autoFocus={autoFocus} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => {
          const n = opciones?.variantes.length ?? 0
          if (n && !onCantidad && e.key === 'ArrowDown') { e.preventDefault(); setMarcada((m) => Math.min(n - 1, m + 1)) }
          else if (n && !onCantidad && e.key === 'ArrowUp') { e.preventDefault(); setMarcada((m) => Math.max(0, m - 1)) }
          else if (e.key === 'Escape') setOpciones(null)
          else if (e.key === 'Enter') {
            // Con la lista abierta y lo escrito sin cambiar, Enter suma la marcada; si no, busca (o resuelve el código).
            const p = opciones?.variantes[marcada]
            if (p && !onCantidad && !local?.(texto.trim())) { vuelta.current++; setTexto(''); sumar(p) } else void buscar()
          }
        }} placeholder="Código de barras, código o nombre" autoComplete="off" />
      </Field>
      {ocupado && <div style={{ marginTop: space[2], color: color.mut }}>Buscando…</div>}
      {error && <Notice tone="warning" style={{ marginTop: space[2] }}>{error}</Notice>}
      {opciones && onCantidad && cantidadDe && (
        // Como en GN (Darío, 18-nov): cada modelo de la búsqueda con su stock en origen y destino, y la cantidad para completar.
        <div style={{ marginTop: 4, border: `1px solid ${color.line}`, borderRadius: 10, overflow: 'hidden', background: color.surface }}>
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.base }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, background: color.bg2, zIndex: 1 }}>
                  {['Producto', `Stock en ${origen ?? 'origen'}`, `Stock en ${destino ?? 'destino'}`, 'A transferir'].map((t, k) => (
                    <th key={t} style={{ height: 26, padding: '0 12px', fontSize: font.xs, fontWeight: weight.semibold, color: color.mut, textAlign: k ? 'right' : 'left', whiteSpace: 'nowrap' }}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {opciones.variantes.map((p) => {
                  const h = hayDe?.(p), dst = destinoDe?.(p), n = cantidadDe(p)
                  const tope = (h ?? 0) + n
                  return (
                    <tr key={`${p.producto}:${p.talle}`} style={{ borderTop: `1px solid ${color.bg2}`, background: n ? 'var(--mo-brand-bg)' : undefined }}>
                      <td style={{ height: 30, padding: '0 12px', color: color.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 0, width: '55%' }}>
                        <b style={{ fontWeight: weight.semibold }}>{p.nombre ?? p.sku}</b>{p.talleNombre ? <span style={{ color: color.ink2 }}> · {p.talleNombre}</span> : null}
                      </td>
                      <td style={{ padding: '0 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: color.ink, fontWeight: weight.semibold }}>{h == null ? '—' : tope}</td>
                      <td style={{ padding: '0 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: color.mut }}>{dst ?? '—'}</td>
                      <td style={{ padding: '2px 12px', textAlign: 'right' }}>
                        <input type="number" min={0} max={h == null ? undefined : tope} inputMode="numeric" aria-label={`A transferir de ${nombreDe({ ...p, cantidad: 1 })}`} value={n || ''} placeholder="0"
                          onChange={(e) => { const v = Math.max(0, Math.trunc(Number(e.target.value)) || 0); onCantidad(p, h == null ? v : Math.min(v, tope)) }}
                          style={{ width: 64, height: 26, textAlign: 'right' }} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], padding: '6px 12px', borderTop: `1px solid ${color.line}`, background: color.bg2, color: color.mut, fontSize: font.sm }}>
            <span style={{ flex: 1 }}>{opciones.cortado ? 'Hay más productos: sumá otra palabra para achicar la búsqueda.' : `${opciones.variantes.length} ${opciones.variantes.length === 1 ? 'modelo' : 'modelos'}`}</span>
            {hayDe && <Button size="sm" variant="outline" onClick={() => { for (const p of opciones.variantes) { const t = (hayDe(p) ?? 0) + cantidadDe(p); if (t > 0) onCantidad(p, t) } }}>Todo el stock</Button>}
            <Button size="sm" variant="outline" onClick={() => { setOpciones(null); setTexto(''); caja.current?.focus() }}>Listo</Button>
          </div>
        </div>
      )}
      {opciones && !onCantidad && (
        // Una FILA baja por modelo (Darío, 18-nov): nombre · modelo a la izquierda, cuánto hay a la derecha. Flechas + Enter eligen.
        <div role="listbox" aria-label="Productos sugeridos" style={{ marginTop: 4, border: `1px solid ${color.line}`, borderRadius: 10, overflow: 'hidden', maxHeight: 320, overflowY: 'auto', background: color.surface }}>
          {/* Encabezado como tabla (Darío, 18-nov): «Producto» y «Stock en <origen>», y el número solo, sin «hay». */}
          <div aria-hidden style={{ display: 'flex', gap: space[3], height: 24, alignItems: 'center', padding: '0 12px', background: color.bg2, fontSize: font.xs, fontWeight: weight.semibold, color: color.mut, position: 'sticky', top: 0 }}>
            <span style={{ flex: 1 }}>Producto</span>
            {hayDe && <span>Stock{origen ? ` en ${origen}` : ''}</span>}
          </div>
          {opciones.variantes.map((p, i) => {
            const h = hayDe?.(p)
            const on = i === marcada
            return (
              <button key={`${p.producto}:${p.talle}`} type="button" role="option" aria-selected={on} onMouseEnter={() => setMarcada(i)}
                onClick={() => { vuelta.current++; setTexto(''); sumar(p); caja.current?.focus() }}
                style={{ display: 'flex', alignItems: 'center', gap: space[3], width: '100%', height: 28, padding: '0 12px', border: 0, borderTop: `1px solid ${color.bg2}`, background: on ? 'var(--mo-brand-bg)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: font.base, textAlign: 'left' }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: color.ink }}>
                  <b style={{ fontWeight: weight.semibold }}>{p.nombre ?? p.sku}</b>{p.talleNombre ? <span style={{ color: color.ink2 }}> · {p.talleNombre}</span> : null}
                </span>
                {h != null && <span style={{ flex: 'none', minWidth: 40, textAlign: 'right', color: color.ink, fontWeight: weight.semibold, fontVariantNumeric: 'tabular-nums' }}>{h}</span>}
              </button>
            )
          })}
          {opciones.cortado && <div style={{ padding: '8px 12px', borderTop: `1px solid ${color.line}`, color: color.mut, background: color.bg2 }}>Hay más productos: sumá otra palabra para achicar la búsqueda.</div>}
        </div>
      )}
    </div>
  )
}

function TablaEscaneada({ filas, onCantidad, conEnviada, contra = 'enviadas', hayDe, origen }: { filas: Fila[]; onCantidad: (f: Fila, n: number) => void; conEnviada?: boolean; contra?: string; hayDe?: (f: Fila) => number | null; origen?: string }) {
  const angosta = usePantallaAngosta()
  if (!filas.length) return <div style={{ marginTop: space[3], color: color.mut }}>Sin productos escaneados.</div>
  if (angosta) return <TarjetasEscaneadas filas={filas} onCantidad={onCantidad} conEnviada={conEnviada} contra={contra} hayDe={hayDe} origen={origen} />
  const conHay = !!hayDe && !conEnviada
  return (
    <TableWrap style={{ marginTop: space[3] }}>
      <THead><Tr><Th>Producto</Th><Th>Código</Th>{conHay && <Th style={{ textAlign: 'right' }}>Hay en {origen}</Th>}{conEnviada && <Th style={{ textAlign: 'right' }}>{contra === 'pidieron' ? 'Pedida' : 'Enviada'}</Th>}<Th style={{ textAlign: 'right' }}>{conEnviada ? (contra === 'pidieron' ? 'Preparada' : 'Recibida') : 'Cantidad'}</Th></Tr></THead>
      <TBody>
        {filas.map((f) => {
          const dif = conEnviada ? f.cantidad - (f.enviada ?? 0) : 0
          const hay = conHay ? hayDe!(f) : null
          const pasa = hay != null && f.cantidad > hay
          return (
            <Tr key={`${f.producto}:${f.talle}`}>
              <Td>{nombreDe(f)}</Td><Td>{f.sku ?? '—'}</Td>
              {conHay && <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: pasa ? 'var(--mo-danger-ink)' : color.ink2 }}>{hay ?? '—'}</Td>}
              {conEnviada && <Td style={{ textAlign: 'right' }}>{f.enviada ?? 0}</Td>}
              <Td style={{ textAlign: 'right' }}>
                <input type="number" min={0} aria-label={`Cantidad de ${nombreDe(f)}`} value={f.cantidad} onChange={(e) => onCantidad(f, Number(e.target.value))} style={{ width: 64, textAlign: 'right' }} />
                {/* Al verificar: nada hasta escanear; ✓ completo, ámbar lo que falta, rojo lo de más (Darío, 18-nov: arrancaba todo en rojo). */}
                {conEnviada && f.cantidad > 0 && <span style={{ display: 'inline-block', minWidth: 72, textAlign: 'left', marginLeft: 8, fontWeight: weight.semibold, color: dif === 0 ? 'var(--mo-success-ink)' : dif < 0 ? 'var(--mo-warning-ink)' : 'var(--mo-danger-ink)' }}>{dif === 0 ? '✓' : dif < 0 ? faltanTxt(-dif) : sobranTxt(dif)}</span>}
                {conEnviada && !f.cantidad && <span style={{ display: 'inline-block', minWidth: 72, marginLeft: 8 }} />}
              </Td>
            </Tr>
          )
        })}
      </TBody>
    </TableWrap>
  )
}

/**
 * 📱 Lo mismo que la tabla, en tarjetas para el dedo: el producto, + y − grandes y, contra lo que salió, cuánto falta.
 * Verde = llegó entero · ámbar = llegó una parte · rojo = de más (el ERP la rechaza) · sin color = todavía nada.
 */
export function TarjetasEscaneadas({ filas, onCantidad, conEnviada, contra, hayDe, origen }: { filas: Fila[]; onCantidad: (f: Fila, n: number) => void; conEnviada?: boolean; contra: string; hayDe?: (f: Fila) => number | null; origen?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], marginTop: space[3] }}>
      {filas.map((f) => {
        const viene = f.enviada ?? 0
        const dif = f.cantidad - viene
        const hay = !conEnviada && hayDe ? hayDe(f) : null
        const pasa = hay != null && f.cantidad > hay
        const tono = pasa ? 'danger' : !conEnviada || !f.cantidad ? null : dif > 0 ? 'danger' : dif === 0 ? 'success' : 'warning'
        const t = tono ? toneTokens[tono] : null
        const cuenta = hay != null ? ` · hay ${hay} en ${origen}` : !conEnviada ? '' : ` · ${contra} ${viene}${dif === 0 ? ' ✓' : f.cantidad && dif < 0 ? ` · faltan ${-dif}` : dif > 0 ? ` · sobran ${dif}` : ''}`
        return (
          <div key={`${f.producto}:${f.talle}`} data-tono={tono ?? 'nada'} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: space[2], padding: '10px 12px', borderRadius: 12, border: `1px solid ${t?.border ?? color.line}`, background: t?.bg ?? color.surface }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: weight.semibold, color: color.ink }}>{nombreDe(f)}</div>
              <div style={{ fontSize: font.sm, color: t?.fg ?? color.mut }}>{f.sku ?? '—'}{cuenta}</div>
            </div>
            <PasoCantidad grande valor={f.cantidad} onCambio={(n) => onCantidad(f, n)} etiqueta={nombreDe(f)} />
          </div>
        )
      })}
    </div>
  )
}

export function MoverYRecibir({ unificada = false, abrirMover = false }: { unificada?: boolean; abrirMover?: boolean } = {}) {
  // La del selector del menú (⛔ pestañas de otra marca: Bruno, 28-oct). Cambiarla remonta la pantalla (`key` en `Erp`).
  const linea: TiendaErp = useTiendaErp()
  // 10-nov: mover, preparar y cancelar son `ajustar` (Depósito); RECIBIR es `recibir` (Local y Depósito, Bruno 10-nov): el rol que ⛔ puede ⛔ ve el botón.
  const puede = usePuedeErp(baseDe(linea))
  const toca = puede('ajustar'), recibe = puede('recibir')
  // Los fijos de la línea, y el Evento si está PRENDIDO en el ERP (motor sql/058). Si ⛔ se puede leer, sólo los fijos.
  const fijos = DEPOSITOS_DE_LINEA[linea] as string[]
  const [conEvento, setConEvento] = useState(false)
  useEffect(() => {
    if (linea !== 'stunned') return
    let vivo = true
    leerDepositos(linea).then((r) => { if (vivo) setConEvento(r.depositos.some((d) => d.id === 'evento' && d.activo)) }).catch(() => {})
    return () => { vivo = false }
  }, [linea])
  const deps = conEvento ? [...fijos, 'evento'] : fijos
  const [desde, setDesde] = useState(() => deps[1] ?? deps[0])
  const [hacia, setHacia] = useState(() => deps[0])
  const [lista, setLista] = useState<Fila[]>([])
  const [nota, setNota] = useState('')
  // En la lista única el escaneo de «Mover» se abre con su botón (o viene abierto: el atajo de Stock › «Mover»).
  const [moviendo, setMoviendo] = useState(!unificada || abrirMover)
  const [docs, setDocs] = useState<TransferenciaDoc[] | null>(null)
  const [nombres, setNombres] = useState<Nombres>({})
  // Lo que dice el libro en cada depósito, por producto: al transferir sólo sale lo que hay en el origen. null = ⛔ se pudo leer (⛔ se frena).
  const [stockDeps, setStockDeps] = useState<Record<string, Record<string, number>> | null>(null)
  // Código de barras y SKU → producto, de la misma lista: el escaneo se resuelve sin ir al servidor.
  const [porCodigo, setPorCodigo] = useState<Map<string, PrendaEncontrada>>(() => new Map())
  const [vuelta, setVuelta] = useState(0)
  const [elegida, setVista] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [orden, setOrden] = useState<OrdenLista>(null)
  const [fichaId, setFichaId] = useState<string | null>(null)
  // Recibir lo que llegó, o PREPARAR una transferencia pedida (borrador, p. ej. la solicitud del evento): se escanea contra lo pedido.
  const [recibiendo, setRecibiendo] = useState<{ doc: TransferenciaDoc; lista: Fila[]; modo: 'recibir' | 'preparar' } | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ texto: string; avisos: AvisoDoc[] } | null>(null)
  // 📱 En el celular, recibir (o preparar) ocupa la pantalla: la lista vuelve al terminar o con «Volver».
  const angosta = usePantallaAngosta()
  const { confirmar } = useConfirmar()

  useEffect(() => {
    let vivo = true
    leerTransferenciasDoc(linea)
      .then((d) => { if (vivo) setDocs(d.transferencias) })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudieron leer las transferencias.'))
    return () => { vivo = false }
  }, [linea, vuelta])

  // Los nombres de prenda: el renglón del documento sólo trae SKU. Si la lista de stock no llega, se ve el SKU (no se frena nada).
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const l = await leerListaDeStock(baseDe(linea))
        if (!vivo) return
        setNombres(nombresDePrendas(l?.filas) as Nombres)
        if (Array.isArray(l?.filas)) {
          const m = new Map<string, PrendaEncontrada>()
          for (const f of l.filas) {
            if (deLaTienda([f], linea).length === 0) continue
            const p: PrendaEncontrada = { producto: String(f.producto), talle: String(f.talle), nombre: f.nombre ?? null, talleNombre: f.talleNombre ?? null, sku: f.sku ?? null, barcode: f.barcode ?? null, gn: 0 }
            if (f.barcode) m.set(String(f.barcode).toLowerCase(), p)
            if (f.sku) m.set(String(f.sku).toLowerCase(), p)
          }
          setPorCodigo(m)
        }
        if (Array.isArray(l?.filas) && l.filas.some((f) => f.deps)) setStockDeps(Object.fromEntries(l.filas.filter((f) => f.deps).map((f) => [`${f.producto}:${f.talle}`, f.deps])))
      } catch { /* se ven los SKU y ⛔ se frena por stock */ }
    })()
    return () => { vivo = false }
  }, [linea, vuelta])

  const codigoLocal = (q: string) => porCodigo.get(q.trim().toLowerCase()) ?? null
  const hayEnOrigen = (p: { producto: string; talle: string }): number | null => (stockDeps ? Math.max(0, stockDeps[`${p.producto}:${p.talle}`]?.[desde] ?? 0) : null)
  // Lo que queda para escanear: lo del origen menos lo que ya está en la lista.
  const quedaEnOrigen = (p: { producto: string; talle: string }): number | null => {
    const h = hayEnOrigen(p)
    return h == null ? null : h - (lista.find((f) => f.producto === p.producto && f.talle === p.talle)?.cantidad ?? 0)
  }
  const sePasan = lista.filter((f) => { const h = hayEnOrigen(f); return h != null && f.cantidad > h })
  function cambiarDesde(d: string) {
    setDesde(d)
    if (d === hacia) setHacia(deps.find((x) => x !== d) ?? hacia)
  }

  async function mover() {
    if (desde === hacia) { setError('Elegí depósitos distintos.'); return }
    if (sePasan.length) { setError(`No hay stock suficiente en ${dep(desde)} de ${sePasan.length === 1 ? nombreDe(sePasan[0]) : `${sePasan.length} productos`}.`); return }
    setTrabajando(true); setError(null)
    // crear → armar → enviar: si falla uno, el documento queda en su estado (se ve abajo) y se puede cancelar.
    let id: string | null = null
    try {
      const renglones = renglonesParaMotor(lista)
      const texto = nota.trim()
      const c = texto ? await crearTransferenciaDoc(linea, desde, hacia, renglones, texto) : await crearTransferenciaDoc(linea, desde, hacia, renglones)
      id = c.transferencia.id
      const a = await armarTransferenciaDoc(linea, id, renglones)
      const e = await enviarTransferenciaDoc(linea, id)
      setHecho({ texto: `T-${e.transferencia.numero} en tránsito: salieron ${e.unidades} u de ${dep(desde)}. Falta recibirla en ${dep(hacia)}.`, avisos: [...a.avisos, ...e.avisos] })
      setLista([]); setNota('')
      if (unificada) setMoviendo(false)
    } catch (err) {
      setError(`${err instanceof Error ? err.message : 'No se pudo transferir.'}${id ? ' La transferencia quedó sin enviar: no salió nada del stock. Cancelala abajo o reintentá.' : ''}`)
    } finally {
      setTrabajando(false); setVuelta((v) => v + 1)
    }
  }

  async function recibir() {
    if (!recibiendo) return
    // Con faltantes se pregunta: un toque de más daba por recibida una transferencia sin escanear (Darío, 18-nov).
    const c = cuentaDeRecepcion(recibiendo.lista)
    if (recibiendo.modo === 'recibir' && !c.completa) {
      const n = -c.faltan
      // La pregunta MUESTRA qué falta (Darío, 18-nov: «muy blanca, poca información»): producto por producto, llegó / enviada.
      const filas = (c.filas as Fila[]).filter((f) => f.cantidad < (f.enviada ?? 0))
      const enviadas = (c.filas as Fila[]).reduce((t, f) => t + (f.enviada ?? 0), 0)
      const mensaje = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <b style={{ fontSize: 26, color: color.ink, fontVariantNumeric: 'tabular-nums' }}>{enviadas - n}</b>
            <span style={{ color: color.mut }}>de {enviadas} escaneadas</span>
          </div>
          <div style={{ border: `1px solid var(--mo-warning-border)`, borderRadius: 10, overflow: 'hidden' }}>
            {filas.map((f, i) => (
              <div key={`${f.producto}:${f.talle}`} style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], padding: '8px 12px', background: 'var(--mo-warning-bg)', borderTop: i ? `1px solid var(--mo-warning-border)` : undefined }}>
                <span style={{ color: color.ink, fontWeight: weight.semibold, minWidth: 0 }}>{nombreDe(f)}</span>
                <span style={{ whiteSpace: 'nowrap', color: 'var(--mo-warning-ink)', fontWeight: weight.semibold, fontVariantNumeric: 'tabular-nums' }}>{faltanTxt((f.enviada ?? 0) - f.cantidad)} <span style={{ fontWeight: weight.medium, color: color.mut }}>· llegó {f.cantidad} de {f.enviada ?? 0}</span></span>
              </div>
            ))}
          </div>
          <div style={{ color: color.mut, fontSize: font.sm }}>Quedan marcadas como faltante en la transferencia.</div>
        </div>
      )
      const ok = await confirmar({ titulo: `¿Recibir T-${recibiendo.doc.numero} con ${n} de menos?`, mensaje, ok: `Recibir con ${n} de menos`, cancelar: 'Seguir escaneando', tono: 'warning' })
      if (!ok) return
    }
    setTrabajando(true); setError(null)
    if (recibiendo.modo === 'preparar') {
      // armar (lo escaneado) → enviar: el stock sale del origen recién al enviar.
      try {
        const renglones = renglonesParaMotor(recibiendo.lista)
        const a = await armarTransferenciaDoc(linea, recibiendo.doc.id, renglones)
        const e = await enviarTransferenciaDoc(linea, recibiendo.doc.id)
        setHecho({ texto: `T-${e.transferencia.numero} en tránsito: salieron ${e.unidades} u de ${dep(recibiendo.doc.desde)}. Falta recibirla en ${dep(recibiendo.doc.hacia)}.`, avisos: [...a.avisos, ...e.avisos] })
        setRecibiendo(null)
      } catch (err) {
        setError(`${err instanceof Error ? err.message : 'No se pudo preparar.'} No salió nada del stock: reintentá.`)
      } finally {
        setTrabajando(false); setVuelta((v) => v + 1)
      }
      return
    }
    try {
      const r = await recibirTransferenciaDoc(linea, recibiendo.doc.id, renglonesParaMotor(recibiendo.lista))
      const falt = r.diferencias.reduce((s, d) => s + Math.min(0, d.diferencia), 0)
      setHecho({ texto: falt < 0 ? `T-${r.transferencia.numero} recibida con ${-falt} u de menos: quedó marcada como diferencia hasta que un ajuste la cierre.` : `T-${r.transferencia.numero} recibida completa.`, avisos: r.avisos })
      setRecibiendo(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo recibir.')
    } finally {
      setTrabajando(false); setVuelta((v) => v + 1)
    }
  }

  async function cancelar(d: TransferenciaDoc) {
    setTrabajando(true); setError(null)
    try { await cancelarTransferenciaDoc(linea, d.id, 'Cancelada desde Transferencias'); setHecho({ texto: `T-${d.numero} cancelada.`, avisos: [] }); setFichaId(null) }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cancelar.') }
    finally { setTrabajando(false); setVuelta((v) => v + 1) }
  }

  // Al escanear lo que llegó: lo que no vino en la transferencia, o lo que ya está completo, ⛔ se suma (Darío, 18-nov).
  const rechazoAlRecibir = (p: PrendaEncontrada): string | null => {
    if (!recibiendo) return null
    const fila = recibiendo.lista.find((f) => f.producto === p.producto && f.talle === p.talle)
    const nombre = nombreDe({ ...p, cantidad: 1 })
    const una = fila?.enviada === 1
    const verbo = recibiendo.modo === 'preparar' ? (una ? 'se pidió' : 'se pidieron') : una ? 'se envió' : 'se enviaron'
    if (!fila || !(fila.enviada ?? 0)) return `${nombre}: no está en esta transferencia.`
    if (fila.cantidad >= (fila.enviada ?? 0)) return `${nombre}: ya escaneaste ${fila.enviada === 1 ? 'la única que' : `las ${fila.enviada} que`} ${verbo}.`
    return null
  }

  function abrirRecepcion(d: TransferenciaDoc) {
    setRecibiendo({ doc: d, lista: listaDeRecepcion(d.renglones, nombres) as Fila[], modo: 'recibir' }); setFichaId(null); setHecho(null); setError(null)
  }
  function abrirPreparado(d: TransferenciaDoc) {
    // La misma cuenta que al recibir, contra lo PEDIDO en lugar de lo enviado.
    const pedido = d.renglones.map((r) => ({ ...r, enviada: r.pedida }))
    setRecibiendo({ doc: d, lista: listaDeRecepcion(pedido, nombres) as Fila[], modo: 'preparar' }); setFichaId(null); setHecho(null); setError(null)
  }

  const todos = docs ?? []
  const conteo = useMemo(() => contarVistasDoc(todos), [docs]) // eslint-disable-line react-hooks/exhaustive-deps
  const vista = elegida ?? vistaDeEntradaDoc(conteo)
  const filas = useMemo(() => ordenarDocs(filtrarDocs(todos, { vista, q, nombres }), orden), [docs, vista, q, nombres, orden]) // eslint-disable-line react-hooks/exhaustive-deps
  const enCaminoU = todos.filter((d) => d.estado === 'en_transito').reduce((s, d) => s + unidadesEnviadas(d), 0)
  const cuenta = recibiendo ? cuentaDeRecepcion(recibiendo.lista) : null
  const ficha = fichaId ? todos.find((d) => d.id === fichaId) ?? null : null
  const puedeRecibir = !!recibiendo && !!cuenta && !trabajando && cuenta.sobran <= 0 && !(recibiendo.modo === 'preparar' && (cuenta.filas as Fila[]).every((f) => !f.cantidad))
  const textoRecibir = !recibiendo || !cuenta ? '' : recibiendo.modo === 'preparar'
    ? (cuenta.completa ? 'Enviar completa' : `Enviar con ${-cuenta.faltan} de menos`)
    : cuenta.completa ? 'Recibir completa' : `Recibir con ${-cuenta.faltan} de menos`

  const celda = (d: TransferenciaDoc, k: string): React.ReactNode => {
    if (k === 'n') return <b style={{ color: color.ink }}>T-{d.numero}</b>
    if (k === 'creada') return <span style={{ color: color.mut }}>{cuandoCorto(d.creada_en)}</span>
    if (k === 'desde') return <span style={{ color: color.ink }}>{dep(d.desde)}</span>
    if (k === 'hacia') return <span style={{ color: color.ink }}>{dep(d.hacia)}</span>
    if (k === 'productos') return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{d.renglones.filter((r) => (Number(r.enviada) || Number(r.pedida)) > 0).length || '—'}</span>
    if (k === 'ruta') return <span style={{ fontWeight: weight.semibold, color: color.ink }}>{dep(d.desde)} → {dep(d.hacia)}</span>
    if (k === 'quien') return <span style={{ color: color.ink2 }}>{d.recibida_por ?? d.enviada_por ?? d.creada_por}</span>
    if (k === 'estado') { const p = pasoDeDoc(d); return <BarraPasos paso={p.paso} fin={p.fin} texto={p.texto} /> }
    if (k === 'unidades') return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{unidadesDeDoc(d) || '—'}</span>
    if (k === 'origen') return <span style={{ color: color.ink2 }}>{origenDeDoc(d)}</span>
    if (k === 'falto') return <span style={{ fontVariantNumeric: 'tabular-nums', color: d.faltoArmar ? 'var(--mo-warning-ink)' : color.mut }}>{d.faltoArmar || '—'}</span>
    if (k === 'faltan') return <span style={{ fontVariantNumeric: 'tabular-nums', color: faltantesDe(d) ? 'var(--mo-danger-ink)' : color.mut }}>{faltantesDe(d) || '—'}</span>
    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {unificada && !recibiendo && !(unificada && moviendo) && (
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
          <Button variant="outline" onClick={abrirReposicion}>Ir a Reposición ↗</Button>
          {toca && !moviendo && !recibiendo && <Button variant="solid" tone="brand" onClick={() => { setMoviendo(true); setHecho(null); setError(null) }}>Nueva transferencia</Button>}
        </div>
      )}
      {!unificada && !(angosta && recibiendo) && (
        <SectionCard title="Transferir y recibir" subtitle="Una transferencia entre el depósito y el local: se escanea lo que sale y, al llegar, lo que llegó. Lo que no llega queda marcado como diferencia.">
          {linea !== 'stunned' && <Notice tone="neutral" style={{ marginTop: space[3] }}>Mueve sólo el stock de Areben Gestión: no toca Gestión Nube ni Tienda Nube. Mientras {linea === 'bdi' ? 'BDI' : 'Zattia'} siga en Gestión Nube, sus transferencias se hacen como siempre.</Notice>}
        </SectionCard>
      )}

      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {hecho && <Notice tone="success" onClose={() => setHecho(null)}>{hecho.texto}{hecho.avisos.map((a, i) => <div key={i} style={{ marginTop: 4 }}>⚠️ {a.texto}</div>)}</Notice>}

      {!recibiendo && moviendo && (
        <SectionCard title="Nueva transferencia">
          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Origen"><Select value={desde} onChange={(e) => cambiarDesde(e.target.value)}>{deps.map((d) => <option key={d} value={d}>{dep(d)}</option>)}</Select></Field>
            <span aria-hidden style={{ alignSelf: 'flex-end', paddingBottom: 8, fontSize: 18, color: color.mut }}>→</span>
            <Field label="Destino"><Select value={hacia} onChange={(e) => setHacia(e.target.value)}>{deps.filter((d) => d !== desde).map((d) => <option key={d} value={d}>{dep(d)}</option>)}</Select></Field>
            <div style={{ flex: '1 1 240px' }}><Field label="Nota (opcional)"><Input value={nota} maxLength={200} onChange={(e) => setNota(e.target.value)} placeholder="Motivo, quién la lleva…" /></Field></div>
          </div>
          <div style={{ marginTop: space[3] }}><Escaneo autoFocus={!angosta} linea={linea} local={codigoLocal} hayDe={quedaEnOrigen} origen={dep(desde)} destino={dep(hacia)}
            destinoDe={(p) => (stockDeps ? Math.max(0, stockDeps[`${p.producto}:${p.talle}`]?.[hacia] ?? 0) : null)}
            cantidadDe={(p) => lista.find((f) => f.producto === p.producto && f.talle === p.talle)?.cantidad ?? 0}
            onCantidad={(p, n) => setLista((l) => (l.some((f) => f.producto === p.producto && f.talle === p.talle) ? fijarCantidad(l, p.producto, p.talle, n) : sumarEscaneo(l, p, n)) as Fila[])} onPrenda={(p) => setLista((l) => sumarEscaneo(l, p) as Fila[])} /></div>
          {lista.length > 0 && <div style={{ marginTop: space[3], color: color.mut }}><b style={{ color: color.ink, fontSize: font.lg }}>{unidades(lista)} {unidades(lista) === 1 ? 'unidad' : 'unidades'}</b> · {lista.length} {lista.length === 1 ? 'producto' : 'productos'}</div>}
          <TablaEscaneada filas={lista} hayDe={hayEnOrigen} origen={dep(desde)} onCantidad={(f, n) => setLista((l) => fijarCantidad(l, f.producto, f.talle, n) as Fila[])} />
          {sePasan.length > 0 && <Notice tone="danger" style={{ marginTop: space[3] }}>No hay stock suficiente en {dep(desde)}. Bajá la cantidad de lo marcado en rojo.</Notice>}
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginTop: space[4], paddingTop: space[3], borderTop: `1px solid ${color.line}` }}>
            {unificada && <Button variant="outline" disabled={trabajando} onClick={() => { setMoviendo(false); setLista([]); setNota('') }}>Cancelar</Button>}
            <span style={{ flex: 1 }} />
            <Button variant="solid" tone="brand" disabled={trabajando || !lista.length || sePasan.length > 0} onClick={mover}>{lista.length ? `Transferir ${unidades(lista)} ${unidades(lista) === 1 ? 'unidad' : 'unidades'} a ${dep(hacia)}` : 'Transferir'}</Button>
          </div>
        </SectionCard>
      )}

      {recibiendo && cuenta && (
        <SectionCard title={`${recibiendo.modo === 'preparar' ? 'Preparar' : 'Recibir'} T-${recibiendo.doc.numero} · ${dep(recibiendo.doc.desde)} → ${dep(recibiendo.doc.hacia)}`}>
          <Escaneo autoFocus={!angosta} linea={linea} local={codigoLocal} rechazo={rechazoAlRecibir} onPrenda={(p) => setRecibiendo((r) => r && { ...r, lista: sumarEscaneo(r.lista, p) as Fila[] })} />
          {/* Al completar CAMBIA la pantalla, ⛔ se abre una ventana (Darío, 18-nov): el lector manda Enter y una ventana con el foco
              en «Recibir» se confirmaría sola con el próximo escaneo. El foco sigue en la caja; confirmar es un toque a propósito. */}
          {cuenta.completa ? (
            <div role="status" style={{ marginTop: space[3], display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', padding: '12px 16px', borderRadius: 12, background: 'var(--mo-success-bg)', border: '1px solid var(--mo-success-border)' }}>
              <span aria-hidden style={{ width: 28, height: 28, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'var(--mo-success-ink)', color: '#fff', fontWeight: weight.bold }}>✓</span>
              <div style={{ flex: '1 1 200px' }}>
                <div style={{ fontSize: font.xl, fontWeight: weight.bold, color: 'var(--mo-success-ink)' }}>{recibiendo.modo === 'preparar' ? 'Está todo lo pedido' : 'Llegó todo'}</div>
                <div style={{ color: 'var(--mo-success-ink)' }}>{unidades(cuenta.filas as Fila[])} de {(cuenta.filas as Fila[]).reduce((s, f) => s + (f.enviada ?? 0), 0)} escaneadas</div>
              </div>
              {!angosta && <Button variant="solid" tone="brand" disabled={!puedeRecibir} onClick={recibir}>{textoRecibir}</Button>}
            </div>
          ) : (
            <div style={{ marginTop: space[3], color: color.mut }}><b style={{ color: color.ink, fontSize: font.lg }}>{(cuenta.filas as Fila[]).reduce((s, f) => s + Math.min(f.cantidad, f.enviada ?? 0), 0)} de {(cuenta.filas as Fila[]).reduce((s, f) => s + (f.enviada ?? 0), 0)}</b> escaneadas</div>
          )}
          <TablaEscaneada conEnviada contra={recibiendo.modo === 'preparar' ? 'pidieron' : 'enviadas'} filas={cuenta.filas as Fila[]} onCantidad={(f, n) => setRecibiendo((r) => r && { ...r, lista: r.lista.map((x) => (x.producto === f.producto && x.talle === f.talle ? { ...x, cantidad: Math.max(0, Math.trunc(n) || 0) } : x)) })} />
          {cuenta.sobran > 0 && <Notice tone="danger" style={{ marginTop: space[3] }}>Bajá lo marcado en rojo para poder {recibiendo.modo === 'preparar' ? 'enviar' : 'recibir'}.</Notice>}
          {/* El error AL LADO del botón: arriba de todo ⛔ se ve con la lista larga (29-oct: Camila «procesó todo» y era un 403). */}
          {error && <Notice tone="danger" style={{ marginTop: space[3] }} onClose={() => setError(null)}>{error}</Notice>}
          {!angosta && (
            <div style={{ display: 'flex', gap: space[2], marginTop: space[3] }}>
              {!cuenta.completa && <Button variant="solid" tone="brand" disabled={!puedeRecibir} onClick={recibir}>{textoRecibir}</Button>}
              <Button variant="outline" onClick={() => setRecibiendo(null)}>Volver</Button>
            </div>
          )}
        </SectionCard>
      )}

      {recibiendo && cuenta && angosta && (
        <PieFijo etiqueta={`Acciones · ${recibiendo.modo === 'preparar' ? 'preparar' : 'recibir'} T-${recibiendo.doc.numero}`} data-pie-tarea>
          <Button variant="outline" onClick={() => setRecibiendo(null)} style={{ ...BOTON_PIE, flex: '0 0 auto' }}>Volver</Button>
          <Button variant="solid" tone="brand" disabled={!puedeRecibir} onClick={recibir} style={BOTON_PIE}>{textoRecibir}</Button>
        </PieFijo>
      )}

      {!recibiendo && !(unificada && moviendo) && <>

      {/* Hasta que llegan las transferencias, un cartel: antes se veía la lista en 0 («No hay transferencias») y después se llenaba (Darío, 18-nov). */}
      {!docs && !error && <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, padding: space[6] }}><EmptyState title="Cargando transferencias…" /></div>}
      {docs && <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <VistasLista vistas={VISTAS_DOC.map((v) => (v[0] === 'en_camino' && enCaminoU ? [v[0], `En camino · ${u(enCaminoU)}`] as const : v))} valor={vista} conteo={conteo} onCambio={setVista} />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar en las transferencias" placeholder="Nº, producto o quién la hizo" />
          <Button variant="outline" disabled={!filas.length} onClick={() => bajarCsv(filas, linea)}>Exportar</Button>
          <Button variant="outline" onClick={() => setVuelta((n) => n + 1)}>Actualizar</Button>
        </div>
        <ListaTrabajo
          // 🖨 por fila (Darío, 18-nov, como en GN): el remito sin abrir la transferencia. Sólo ícono: se repite en cada fila (VOCABULARIO §3.3).
          acciones={angosta ? undefined : (d) => <IconoFila label={`Imprimir el remito de «T-${d.numero}»`} onClick={() => imprimirRemito(d, nombres)}><Icono nombre="impresora" size={16} /></IconoFila>} anchoAcciones={44}
          columnas={angosta ? (unificada ? COLUMNAS_UNIFICADA : COLUMNAS) : EN_COMPU(unificada ? COLUMNAS_UNIFICADA : COLUMNAS)} filas={filas} claveDe={(d) => d.id} celda={celda} orden={orden} onOrden={setOrden}
          activa={fichaId} onAbrir={(d) => setFichaId(d.id)} etiquetaFila={(d) => `la transferencia T-${d.numero} de ${dep(d.desde)} a ${dep(d.hacia)}`}
          vacio={docs ? (
            <div style={{ padding: space[6] }}>
              <EmptyState title={q ? 'No hay transferencias con ese número, producto o persona.' : vista === 'en_camino' ? 'No hay nada en camino.' : 'No hay transferencias en esta vista.'} />
            </div>
          ) : <div style={{ padding: space[6] }}><EmptyState title="Leyendo…" /></div>}
        />
        <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>{filas.length.toLocaleString('es-AR')} de {todos.length.toLocaleString('es-AR')}</div>
      </div>}
      </>}

      {ficha && <FichaDoc d={ficha} nombres={nombres} trabajando={trabajando} toca={toca} recibe={recibe} onCerrar={() => setFichaId(null)} onRecibir={() => abrirRecepcion(ficha)} onPreparar={() => abrirPreparado(ficha)} onCancelar={() => cancelar(ficha)} />}
    </div>
  )
}

/** Las unidades que cuenta la transferencia: lo recibido si ya llegó; si no, lo enviado, lo preparado o lo pedido (lista y ventana dicen lo MISMO). */
const unidadesDeDoc = (d: TransferenciaDoc) => d.renglones.reduce((s, r) => s + (r.recibida ?? (Number(r.enviada) || Number(r.armada) || Number(r.pedida) || 0)), 0)

/**
 * El detalle de una transferencia en VENTANA (Darío, 18-nov: «para mí es mejor el pop up», como Movimientos): es una tabla de
 * productos y en la barra del costado quedaba apretada. Arriba qué es y dónde está; abajo las acciones, la principal a la derecha.
 */
function FichaDoc({ d, nombres, trabajando, toca, recibe, onCerrar, onRecibir, onPreparar, onCancelar }: { d: TransferenciaDoc; nombres: Nombres; trabajando: boolean; toca: boolean; recibe: boolean; onCerrar: () => void; onRecibir: () => void; onPreparar: () => void; onCancelar: () => void }) {
  const p = pasoDeDoc(d)
  const renglones = renglonesConDiferencia(d)
  const th: React.CSSProperties = { textAlign: 'right', padding: '10px 12px', fontWeight: weight.semibold, color: color.mut, fontSize: font.sm, whiteSpace: 'nowrap', background: color.bg2 }
  const td: React.CSSProperties = { textAlign: 'right', padding: '10px 12px', fontVariantNumeric: 'tabular-nums', borderTop: `1px solid ${color.line}` }
  const anulable = toca && (d.estado === 'borrador' || d.estado === 'armada')
  const titulo = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: space[4], flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{ fontSize: font.sm, fontWeight: weight.semibold, letterSpacing: '0.06em', textTransform: 'uppercase', color: color.mut }}>Transferencia T-{d.numero} · {origenDeDoc(d)}</div>
        {/* El destino manda (Darío, 18-nov): el origen va apagado, el destino grande. */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
          <span style={{ fontSize: 16, fontWeight: weight.medium, color: color.mut }}>{dep(d.desde)} →</span>
          <span style={{ fontSize: 22, fontWeight: weight.bold, color: color.ink }}>{dep(d.hacia)}</span>
        </div>
        <div style={{ marginTop: 8 }}><BarraPasos paso={p.paso} fin={p.fin} texto={p.texto} /></div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: font.sm, color: color.mut }}>Unidades</div>
        <div style={{ fontSize: 30, fontWeight: weight.bold, color: color.ink, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{unidadesDeDoc(d).toLocaleString('es-AR')}</div>
      </div>
    </div>
  )
  const pie = (
    <div style={{ display: 'flex', gap: space[2], width: '100%', flexWrap: 'wrap' }}>
      {anulable && <Button variant="outline" tone="danger" disabled={trabajando} onClick={onCancelar}>Anular transferencia</Button>}
      <span style={{ flex: 1 }} />
      <Button variant="outline" iconLeft={<Icono nombre="impresora" size={16} />} aria-label="Imprimir el remito" onClick={() => imprimirRemito(d, nombres)}>Remito</Button>
      {recibe && d.estado === 'en_transito' && <Button variant="solid" tone="brand" disabled={trabajando} onClick={onRecibir}>Recibir</Button>}
      {toca && d.estado === 'borrador' && <Button variant="solid" tone="brand" disabled={trabajando} onClick={onPreparar}>Preparar</Button>}
    </div>
  )
  return (
    <Modal abierto onCerrar={onCerrar} variante="pos" ancho="xl" titulo={titulo} pie={pie}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
        <div style={{ display: 'flex', gap: space[6], flexWrap: 'wrap', fontSize: font.base }}>
          <DatoVentana titulo="Creada por">{d.creada_por} · {cuandoCorto(d.creada_en)}</DatoVentana>
          {d.enviada_en && <DatoVentana titulo="Enviada por">{d.enviada_por} · {cuandoCorto(d.enviada_en)}</DatoVentana>}
          {d.recibida_en && <DatoVentana titulo="Recibida por">{d.recibida_por} · {cuandoCorto(d.recibida_en)}</DatoVentana>}
          {d.nota && <DatoVentana titulo="Nota">{d.nota}</DatoVentana>}
        </div>
        {/* UNA columna (Darío, 18-nov: «¿por qué 4 columnas?»): lo que importa es la cantidad; lo pedido/enviado aparece SÓLO si no coincide. */}
        <div className="erp-tabla-desliza" style={{ border: `1px solid ${color.line}`, borderRadius: 12, overflow: 'hidden' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.base }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Producto ({renglones.length})</th>
              <th style={th}>Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {renglones.map((r) => {
              const enviada = Number(r.enviada) || 0, pedida = Number(r.pedida) || 0
              const cant = r.recibida ?? (enviada || Number(r.armada) || pedida)
              const nota = r.recibida != null && r.recibida < enviada ? `faltó ${enviada - r.recibida}`
                : r.recibida != null && r.recibida > enviada ? `sobró ${r.recibida - enviada}`
                  : pedida > 0 && enviada > 0 && enviada < pedida ? `se pidieron ${pedida}` : null
              return (
                <tr key={r.n}>
                  <td style={{ ...td, textAlign: 'left' }}>
                    <b style={{ color: color.ink }}>{nombreDeRenglon(r, nombres)}</b>
                    {r.sku && <span style={{ marginLeft: 8, fontSize: font.sm, color: color.mut }}>{r.sku}</span>}
                  </td>
                  <td style={td}>
                    {nota && <span style={{ marginRight: 10, fontSize: font.sm, fontWeight: weight.semibold, color: 'var(--mo-danger-ink)' }}>{nota}</span>}
                    <b style={{ color: color.ink }}>{cant || '—'}</b>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
      </div>
    </Modal>
  )
}

function DatoVentana({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: font.sm, color: color.mut }}>{titulo}</div>
      <div style={{ color: color.ink, fontWeight: weight.medium }}>{children}</div>
    </div>
  )
}
