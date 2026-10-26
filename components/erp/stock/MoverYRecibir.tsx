'use client'

/**
 * ERP › Stock › Mover y recibir — pantalla MÍNIMA de la transferencia como DOCUMENTO (requisito del corte de Stunned; la
 * sesión Diseño la rehace completa). Dos cosas: **mover** (transferencia libre: se escanea lo que sale y se manda; el libro
 * anota la SALIDA al instante) y **recibir** (en destino se escanea lo que llegó; lo que ⛔ llega queda como diferencia
 * marcada, nunca se ajusta sola). Mueve SÓLO el libro del ERP: ⛔ GN ni Tienda Nube. Núcleo: `lib/erp/transferencia-escaneo.core.js`.
 */

import { useEffect, useRef, useState } from 'react'
import { Button, EmptyState, Field, Input, Notice, SectionCard, Select, TableWrap, TBody, Td, Th, THead, Tr, Tabs, space } from '@/components/ui'
import { ChipEstado, cuandoCorto } from '@/components/ui/PiezasLista'
import {
  armarTransferenciaDoc, buscarPrendas, cancelarTransferenciaDoc, crearTransferenciaDoc, enviarTransferenciaDoc, leerTransferenciasDoc, recibirTransferenciaDoc,
  type AvisoDoc, type PrendaEncontrada, type TiendaErp, type TransferenciaDoc,
} from '@/lib/erp/cliente'
import { NOMBRE_DEPOSITO } from '@/lib/erp/stock.core.js'
import { DEPOSITOS_DE_LINEA, cuentaDeRecepcion, fijarCantidad, listaDeRecepcion, prendaExacta, renglonesParaMotor, sumarEscaneo, unidades } from '@/lib/erp/transferencia-escaneo.core.js'

type Fila = { producto: string; talle: string; sku: string | null; barcode: string | null; nombre: string | null; talleNombre: string | null; cantidad: number; enviada?: number }
const LINEAS: Array<{ key: TiendaErp; label: string }> = [{ key: 'stunned', label: 'Stunned' }, { key: 'zattia', label: 'Zattia' }, { key: 'bdi', label: 'BDI' }]
const dep = (d: string) => (NOMBRE_DEPOSITO as Record<string, string>)[d] ?? d
const baseDe = (l: TiendaErp) => (l === 'bdi' ? 'bdi' : 'zattia')
const nombreDe = (f: Fila) => (f.nombre ? `${f.nombre}${f.talleNombre ? ` · ${f.talleNombre}` : ''}` : f.sku ?? `Prenda ${f.producto}/${f.talle}`)
const ESTADO = { borrador: ['neutral', 'Borrador'], armada: ['neutral', 'Armada'], en_transito: ['warning', 'En tránsito'], recibida: ['success', 'Recibida'], cancelada: ['neutral', 'Cancelada'] } as const

/** Caja de escaneo: el lector escribe y manda Enter. Un código exacto suma 1; un texto con varias coincidencias deja elegir. */
function Escaneo({ linea, onPrenda }: { linea: TiendaErp; onPrenda: (p: PrendaEncontrada) => void }) {
  const [texto, setTexto] = useState('')
  const [opciones, setOpciones] = useState<PrendaEncontrada[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const caja = useRef<HTMLInputElement>(null)
  async function buscar() {
    const q = texto.trim()
    if (!q || ocupado) return
    setOcupado(true)
    try {
      const { variantes } = await buscarPrendas(baseDe(linea), q)
      const una = prendaExacta(variantes, q) ?? (variantes.length === 1 ? variantes[0] : null)
      if (una) { onPrenda(una); setOpciones(null); setTexto(''); setError(null) }
      else if (!variantes.length) setError(`No encontré «${q}».`)
      else { setOpciones(variantes.slice(0, 20)); setError(null) }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo buscar.')
    } finally {
      setOcupado(false)
      caja.current?.focus()
    }
  }
  return (
    <div>
      <Field label="Escanear una prenda">
        <Input ref={caja} autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void buscar() }} placeholder="Código de barras, SKU o nombre" />
      </Field>
      {error && <Notice tone="warning" style={{ marginTop: space[2] }}>{error}</Notice>}
      {opciones && (
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginTop: space[2] }}>
          {opciones.map((p) => <Button key={`${p.producto}:${p.talle}`} variant="soft" size="sm" onClick={() => { onPrenda(p); setOpciones(null); setTexto('') }}>+ {nombreDe({ ...p, cantidad: 1 })}</Button>)}
        </div>
      )}
    </div>
  )
}

function TablaEscaneada({ filas, onCantidad, conEnviada }: { filas: Fila[]; onCantidad: (f: Fila, n: number) => void; conEnviada?: boolean }) {
  if (!filas.length) return <div style={{ marginTop: space[3] }}>Todavía no se escaneó nada.</div>
  return (
    <TableWrap style={{ marginTop: space[3] }}>
      <THead><Tr><Th>Prenda</Th><Th>SKU</Th>{conEnviada && <Th style={{ textAlign: 'right' }}>Salió</Th>}<Th style={{ textAlign: 'right' }}>{conEnviada ? 'Llegó' : 'Cantidad'}</Th></Tr></THead>
      <TBody>
        {filas.map((f) => {
          const dif = conEnviada ? f.cantidad - (f.enviada ?? 0) : 0
          return (
            <Tr key={`${f.producto}:${f.talle}`}>
              <Td>{nombreDe(f)}</Td><Td>{f.sku ?? '—'}</Td>
              {conEnviada && <Td style={{ textAlign: 'right' }}>{f.enviada ?? 0}</Td>}
              <Td style={{ textAlign: 'right' }}>
                <input type="number" min={0} aria-label={`Cantidad de ${nombreDe(f)}`} value={f.cantidad} onChange={(e) => onCantidad(f, Number(e.target.value))} style={{ width: 64, textAlign: 'right' }} />
                {conEnviada && dif !== 0 && <span style={{ marginLeft: 8, color: 'var(--mo-danger-ink)' }}>{dif < 0 ? `faltan ${-dif}` : `sobran ${dif}`}</span>}
              </Td>
            </Tr>
          )
        })}
      </TBody>
    </TableWrap>
  )
}

export function MoverYRecibir() {
  const [linea, setLinea] = useState<TiendaErp>('stunned')
  const deps = DEPOSITOS_DE_LINEA[linea] as string[]
  const [desde, setDesde] = useState('deposito')
  const [hacia, setHacia] = useState('local')
  const [lista, setLista] = useState<Fila[]>([])
  const [docs, setDocs] = useState<TransferenciaDoc[] | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const [recibiendo, setRecibiendo] = useState<{ doc: TransferenciaDoc; lista: Fila[] } | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ texto: string; avisos: AvisoDoc[] } | null>(null)

  useEffect(() => {
    let vivo = true
    leerTransferenciasDoc(linea)
      .then((d) => { if (vivo) setDocs(d.transferencias) })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudieron leer las transferencias.'))
    return () => { vivo = false }
  }, [linea, vuelta])

  function cambiarLinea(k: string) {
    const l = k as TiendaErp
    const d = DEPOSITOS_DE_LINEA[l] as string[]
    setLinea(l); setDesde(d[1] ?? d[0]); setHacia(d[0]); setLista([]); setDocs(null); setRecibiendo(null); setError(null); setHecho(null)
  }

  async function mover() {
    if (desde === hacia) { setError('Elegí depósitos distintos.'); return }
    setTrabajando(true); setError(null)
    // crear → armar → enviar: si falla uno, el documento queda en su estado (se ve abajo) y se puede cancelar.
    let id: string | null = null
    try {
      const renglones = renglonesParaMotor(lista)
      const c = await crearTransferenciaDoc(linea, desde, hacia, renglones)
      id = c.transferencia.id
      const a = await armarTransferenciaDoc(linea, id, renglones)
      const e = await enviarTransferenciaDoc(linea, id)
      setHecho({ texto: `T-${e.transferencia.numero} en tránsito: salieron ${e.unidades} u de ${dep(desde)}. Falta recibirla en ${dep(hacia)}.`, avisos: [...a.avisos, ...e.avisos] })
      setLista([])
    } catch (err) {
      setError(`${err instanceof Error ? err.message : 'No se pudo mover.'}${id ? ' La transferencia quedó sin enviar: no salió nada del stock. Cancelala abajo o reintentá.' : ''}`)
    } finally {
      setTrabajando(false); setVuelta((v) => v + 1)
    }
  }

  async function recibir() {
    if (!recibiendo) return
    setTrabajando(true); setError(null)
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
    try { await cancelarTransferenciaDoc(linea, d.id, 'Cancelada desde Mover y recibir'); setHecho({ texto: `T-${d.numero} cancelada.`, avisos: [] }) }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cancelar.') }
    finally { setTrabajando(false); setVuelta((v) => v + 1) }
  }

  const enCamino = (docs ?? []).filter((d) => d.estado === 'en_transito')
  const sinEnviar = (docs ?? []).filter((d) => d.estado === 'borrador' || d.estado === 'armada')
  const recientes = (docs ?? []).filter((d) => d.estado === 'recibida' || d.estado === 'cancelada').slice(0, 10)
  const cuenta = recibiendo ? cuentaDeRecepcion(recibiendo.lista) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard title="Mover y recibir" subtitle="Una transferencia entre el depósito y el local: se escanea lo que sale y, al llegar, lo que llegó. Lo que no llega queda marcado como diferencia.">
        <Tabs items={LINEAS} value={linea} onChange={cambiarLinea} />
        <Notice tone="neutral" style={{ marginTop: space[3] }}>Mueve sólo el stock del ERP: no toca Gestión Nube ni Tienda Nube. Mientras Zattia siga en GN, sus transferencias se hacen como siempre.</Notice>
      </SectionCard>

      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {hecho && <Notice tone="success" onClose={() => setHecho(null)}>{hecho.texto}{hecho.avisos.map((a, i) => <div key={i} style={{ marginTop: 4 }}>⚠️ {a.texto}</div>)}</Notice>}

      {!recibiendo && (
        <SectionCard title="Mover" subtitle="Escaneá lo que sale. El stock sale del origen al confirmar y queda «en tránsito» hasta que se reciba.">
          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Sale de"><Select value={desde} onChange={(e) => setDesde(e.target.value)}>{deps.map((d) => <option key={d} value={d}>{dep(d)}</option>)}</Select></Field>
            <Field label="Va a"><Select value={hacia} onChange={(e) => setHacia(e.target.value)}>{deps.map((d) => <option key={d} value={d}>{dep(d)}</option>)}</Select></Field>
          </div>
          <div style={{ marginTop: space[3] }}><Escaneo linea={linea} onPrenda={(p) => setLista((l) => sumarEscaneo(l, p) as Fila[])} /></div>
          <TablaEscaneada filas={lista} onCantidad={(f, n) => setLista((l) => fijarCantidad(l, f.producto, f.talle, n) as Fila[])} />
          <div style={{ marginTop: space[3] }}>
            <Button disabled={trabajando || !lista.length} onClick={mover}>{lista.length ? `Mover ${unidades(lista)} u de ${dep(desde)} a ${dep(hacia)}` : 'Mover'}</Button>
          </div>
        </SectionCard>
      )}

      {recibiendo && cuenta && (
        <SectionCard title={`Recibir T-${recibiendo.doc.numero}`} subtitle={`${dep(recibiendo.doc.desde)} → ${dep(recibiendo.doc.hacia)}. Escaneá cada prenda que llegó: lo que no escanees queda como faltante.`}>
          <Escaneo linea={linea} onPrenda={(p) => setRecibiendo((r) => r && { ...r, lista: sumarEscaneo(r.lista, p) as Fila[] })} />
          <TablaEscaneada conEnviada filas={cuenta.filas as Fila[]} onCantidad={(f, n) => setRecibiendo((r) => r && { ...r, lista: r.lista.map((x) => (x.producto === f.producto && x.talle === f.talle ? { ...x, cantidad: Math.max(0, Math.trunc(n) || 0) } : x)) })} />
          {cuenta.sobran > 0 && <Notice tone="warning" style={{ marginTop: space[2] }}>Hay prendas que no salieron en esta transferencia: el motor las rechaza. Si llegaron de más, se anotan como ajuste.</Notice>}
          <div style={{ display: 'flex', gap: space[2], marginTop: space[3] }}>
            <Button disabled={trabajando || cuenta.sobran > 0} onClick={recibir}>{cuenta.completa ? 'Recibir completa' : `Recibir con ${-cuenta.faltan} u de menos`}</Button>
            <Button variant="outline" onClick={() => setRecibiendo(null)}>Volver</Button>
          </div>
        </SectionCard>
      )}

      <SectionCard title="En camino" subtitle="Salieron y todavía no se recibieron.">
        {!docs ? <EmptyState title="Leyendo…" /> : !enCamino.length ? <div>No hay nada en camino.</div> : (
          <TableWrap>
            <THead><Tr><Th>Nº</Th><Th>Ruta</Th><Th>Salió</Th><Th style={{ textAlign: 'right' }}>Unidades</Th><Th /></Tr></THead>
            <TBody>
              {enCamino.map((d) => (
                <Tr key={d.id}>
                  <Td><b>T-{d.numero}</b></Td><Td>{dep(d.desde)} → {dep(d.hacia)}</Td><Td>{d.enviada_en ? cuandoCorto(d.enviada_en) : '—'} · {d.enviada_por}</Td>
                  <Td style={{ textAlign: 'right' }}>{d.renglones.reduce((s, r) => s + r.enviada, 0)}</Td>
                  <Td><Button size="sm" disabled={trabajando} onClick={() => setRecibiendo({ doc: d, lista: listaDeRecepcion(d.renglones) as Fila[] })}>Recibir</Button></Td>
                </Tr>
              ))}
            </TBody>
          </TableWrap>
        )}
      </SectionCard>

      {sinEnviar.length > 0 && (
        <SectionCard title="Sin enviar" subtitle="Quedaron a medias: no salió nada del stock. Se cancelan.">
          {sinEnviar.map((d) => <div key={d.id} style={{ display: 'flex', gap: space[3], alignItems: 'center' }}><b>T-{d.numero}</b> {dep(d.desde)} → {dep(d.hacia)} <Button size="sm" variant="outline" disabled={trabajando} onClick={() => cancelar(d)}>Cancelar</Button></div>)}
        </SectionCard>
      )}

      {recientes.length > 0 && (
        <SectionCard title="Últimas">
          <TableWrap>
            <THead><Tr><Th>Nº</Th><Th>Ruta</Th><Th>Estado</Th><Th>Quién</Th><Th style={{ textAlign: 'right' }}>Faltaron</Th></Tr></THead>
            <TBody>
              {recientes.map((d) => {
                return (
                  <Tr key={d.id}>
                    <Td><b>T-{d.numero}</b></Td><Td>{dep(d.desde)} → {dep(d.hacia)}</Td><Td><ChipEstado mapa={ESTADO} k={d.estado} /></Td>
                    <Td>{d.recibida_por ?? d.creada_por}</Td><Td style={{ textAlign: 'right' }}>{-d.diferencias.reduce((s, x) => s + Math.min(0, x.diferencia), 0) || '—'}</Td>
                  </Tr>
                )
              })}
            </TBody>
          </TableWrap>
        </SectionCard>
      )}
    </div>
  )
}
