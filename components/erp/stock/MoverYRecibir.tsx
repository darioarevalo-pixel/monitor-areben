'use client'

/**
 * ERP › Stock › Mover y recibir — la transferencia como DOCUMENTO, con el molde del diseño (§3 y §7): **mover** (transferencia
 * libre: se escanea lo que sale, con nota, y se manda; el libro anota la SALIDA al instante) y **recibir** (se abre desde la
 * ficha de una que está en camino; en destino se escanea lo que llegó, y lo que ⛔ llega queda como diferencia marcada, nunca se
 * ajusta sola). La lista de abajo es de TRABAJO: vistas con su número, buscador, barrita de 4 pasos, ficha al costado con lo
 * pedido, armado, enviado y recibido, remito para imprimir y «Exportar». Mueve SÓLO el libro del ERP: ⛔ GN ni Tienda Nube.
 * Núcleos: `lib/erp/transferencia-escaneo.core.js` (el escaneo) y `lib/erp/transferencias-doc.core.js` (la lista y la ficha).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, EmptyState, Field, Input, Notice, SectionCard, Select, TableWrap, TBody, Td, Th, THead, Tr, color, font, space, weight } from '@/components/ui'
import { useTiendaErp } from '@/lib/erp/linea-erp'
import { ListaTrabajo, type OrdenLista } from '@/components/ui/ListaTrabajo'
import { DatoFicha, DatosFicha, FichaCostado } from '@/components/ui/FichaCostado'
import { BuscadorLista, TileResumen, VistasLista, cuandoCorto, tonoDeConteo } from '@/components/ui/PiezasLista'
import {
  armarTransferenciaDoc, buscarPrendas, cancelarTransferenciaDoc, crearTransferenciaDoc, enviarTransferenciaDoc, leerDepositos, leerListaDeStock, leerTransferenciasDoc, recibirTransferenciaDoc,
  type AvisoDoc, type PrendaEncontrada, type TiendaErp, type TransferenciaDoc,
} from '@/lib/erp/cliente'
import { NOMBRE_DEPOSITO } from '@/lib/erp/stock.core.js'
import {
  VISTAS_DOC, contarVistasDoc, csvDeDocs, faltantesDe, filtrarDocs, nombreDeRenglon, nombresDePrendas, ordenarDocs, pasoDeDoc, remitoHtml, renglonesConDiferencia, unidadesEnviadas, unidadesRecibidas, vistaDeEntradaDoc,
} from '@/lib/erp/transferencias-doc.core.js'
import { BarraPasos } from './Barritas'
import { DEPOSITOS_DE_LINEA, cuentaDeRecepcion, fijarCantidad, listaDeRecepcion, prendaExacta, renglonesParaMotor, sumarEscaneo, unidades } from '@/lib/erp/transferencia-escaneo.core.js'

type Fila = { producto: string; talle: string; sku: string | null; barcode: string | null; nombre: string | null; talleNombre: string | null; cantidad: number; enviada?: number }
const dep = (d: string) => (NOMBRE_DEPOSITO as Record<string, string>)[d] ?? d
const baseDe = (l: TiendaErp) => (l === 'bdi' ? 'bdi' : 'zattia')
const nombreDe = (f: Fila) => (f.nombre ? `${f.nombre}${f.talleNombre ? ` · ${f.talleNombre}` : ''}` : f.sku ?? `Producto ${f.producto}/${f.talle}`)
type Nombres = Record<string, { nombre: string | null; talleNombre: string | null }>
const u = (n: number) => `${n.toLocaleString('es-AR')} u`
const COLUMNAS = [
  { key: 'n', titulo: 'Nº', ancho: '70px', ordena: true },
  { key: 'creada', titulo: 'Creada', ancho: '110px', ordena: true },
  { key: 'ruta', titulo: 'Ruta', ancho: 'minmax(170px, 1fr)' },
  { key: 'quien', titulo: 'Quién', ancho: '110px' },
  { key: 'estado', titulo: 'Paso', ancho: 'minmax(260px, 1.2fr)' },
  { key: 'unidades', titulo: 'Productos', ancho: '90px', ordena: true, derecha: true },
  { key: 'faltan', titulo: 'Faltaron', ancho: '90px', ordena: true, derecha: true },
]

function bajarCsv(docs: TransferenciaDoc[], linea: TiendaErp) {
  const url = URL.createObjectURL(new Blob([csvDeDocs(docs, dep)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = `mover-y-recibir-${linea}.csv`; a.click()
  URL.revokeObjectURL(url)
}
function imprimirRemito(d: TransferenciaDoc, nombres: Nombres) {
  const url = URL.createObjectURL(new Blob([remitoHtml(d, nombres, dep)], { type: 'text/html;charset=utf-8' }))
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

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
      <Field label="Escanear un producto">
        <Input ref={caja} autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void buscar() }} placeholder="Código de barras, código o nombre" />
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
      <THead><Tr><Th>Producto</Th><Th>código</Th>{conEnviada && <Th style={{ textAlign: 'right' }}>Salió</Th>}<Th style={{ textAlign: 'right' }}>{conEnviada ? 'Llegó' : 'Cantidad'}</Th></Tr></THead>
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
  // La del selector del menú (⛔ pestañas de otra marca: Bruno, 28-oct). Cambiarla remonta la pantalla (`key` en `Erp`).
  const linea: TiendaErp = useTiendaErp()
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
  const [docs, setDocs] = useState<TransferenciaDoc[] | null>(null)
  const [nombres, setNombres] = useState<Nombres>({})
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
      try { const l = await leerListaDeStock(baseDe(linea)); if (vivo) setNombres(nombresDePrendas(l?.filas) as Nombres) } catch { /* se ven los SKU */ }
    })()
    return () => { vivo = false }
  }, [linea])

  async function mover() {
    if (desde === hacia) { setError('Elegí depósitos distintos.'); return }
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
    } catch (err) {
      setError(`${err instanceof Error ? err.message : 'No se pudo mover.'}${id ? ' La transferencia quedó sin enviar: no salió nada del stock. Cancelala abajo o reintentá.' : ''}`)
    } finally {
      setTrabajando(false); setVuelta((v) => v + 1)
    }
  }

  async function recibir() {
    if (!recibiendo) return
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
    try { await cancelarTransferenciaDoc(linea, d.id, 'Cancelada desde Mover y recibir'); setHecho({ texto: `T-${d.numero} cancelada.`, avisos: [] }); setFichaId(null) }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cancelar.') }
    finally { setTrabajando(false); setVuelta((v) => v + 1) }
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
  const faltantesU = todos.filter((d) => d.estado === 'recibida').reduce((s, d) => s + faltantesDe(d), 0)
  const cuenta = recibiendo ? cuentaDeRecepcion(recibiendo.lista) : null
  const ficha = fichaId ? todos.find((d) => d.id === fichaId) ?? null : null

  const celda = (d: TransferenciaDoc, k: string): React.ReactNode => {
    if (k === 'n') return <b style={{ color: color.ink }}>T-{d.numero}</b>
    if (k === 'creada') return <span style={{ color: color.mut }}>{cuandoCorto(d.creada_en)}</span>
    if (k === 'ruta') return <span style={{ fontWeight: weight.semibold, color: color.ink }}>{dep(d.desde)} → {dep(d.hacia)}</span>
    if (k === 'quien') return <span style={{ color: color.ink2 }}>{d.recibida_por ?? d.enviada_por ?? d.creada_por}</span>
    if (k === 'estado') { const p = pasoDeDoc(d); return <BarraPasos paso={p.paso} fin={p.fin} texto={p.texto} /> }
    if (k === 'unidades') return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{unidadesEnviadas(d) || '—'}</span>
    if (k === 'faltan') return <span style={{ fontVariantNumeric: 'tabular-nums', color: faltantesDe(d) ? 'var(--mo-danger-ink)' : color.mut }}>{faltantesDe(d) || '—'}</span>
    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard title="Mover y recibir" subtitle="Una transferencia entre el depósito y el local: se escanea lo que sale y, al llegar, lo que llegó. Lo que no llega queda marcado como diferencia.">
        {linea !== 'stunned' && <Notice tone="neutral" style={{ marginTop: space[3] }}>Mueve sólo el stock del ERP: no toca Gestión Nube ni Tienda Nube. Mientras {linea === 'bdi' ? 'BDI' : 'Zattia'} siga en Gestión Nube, sus transferencias se hacen como siempre.</Notice>}
      </SectionCard>

      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {hecho && <Notice tone="success" onClose={() => setHecho(null)}>{hecho.texto}{hecho.avisos.map((a, i) => <div key={i} style={{ marginTop: 4 }}>⚠️ {a.texto}</div>)}</Notice>}

      {!recibiendo && (
        <SectionCard title="Mover" subtitle="Escaneá lo que sale. El stock sale del origen al confirmar y queda «en tránsito» hasta que se reciba.">
          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Sale de"><Select value={desde} onChange={(e) => setDesde(e.target.value)}>{deps.map((d) => <option key={d} value={d}>{dep(d)}</option>)}</Select></Field>
            <Field label="Va a"><Select value={hacia} onChange={(e) => setHacia(e.target.value)}>{deps.map((d) => <option key={d} value={d}>{dep(d)}</option>)}</Select></Field>
            <div style={{ flex: '1 1 240px' }}><Field label="Nota (opcional)"><Input value={nota} maxLength={200} onChange={(e) => setNota(e.target.value)} placeholder="Para qué se mueve, quién la lleva…" /></Field></div>
          </div>
          <div style={{ marginTop: space[3] }}><Escaneo linea={linea} onPrenda={(p) => setLista((l) => sumarEscaneo(l, p) as Fila[])} /></div>
          <TablaEscaneada filas={lista} onCantidad={(f, n) => setLista((l) => fijarCantidad(l, f.producto, f.talle, n) as Fila[])} />
          <div style={{ marginTop: space[3] }}>
            <Button variant="solid" tone="info" disabled={trabajando || !lista.length} onClick={mover}>{lista.length ? `Mover ${unidades(lista)} u de ${dep(desde)} a ${dep(hacia)}` : 'Mover'}</Button>
          </div>
        </SectionCard>
      )}

      {recibiendo && cuenta && (
        <SectionCard title={`${recibiendo.modo === 'preparar' ? 'Preparar' : 'Recibir'} T-${recibiendo.doc.numero}`} subtitle={recibiendo.modo === 'preparar'
          ? `${dep(recibiendo.doc.desde)} → ${dep(recibiendo.doc.hacia)}. Escaneá cada producto que separaste: sale sólo lo escaneado.`
          : `${dep(recibiendo.doc.desde)} → ${dep(recibiendo.doc.hacia)}. Escaneá cada producto que llegó: lo que no escanees queda como faltante.`}>
          <Escaneo linea={linea} onPrenda={(p) => setRecibiendo((r) => r && { ...r, lista: sumarEscaneo(r.lista, p) as Fila[] })} />
          <TablaEscaneada conEnviada filas={cuenta.filas as Fila[]} onCantidad={(f, n) => setRecibiendo((r) => r && { ...r, lista: r.lista.map((x) => (x.producto === f.producto && x.talle === f.talle ? { ...x, cantidad: Math.max(0, Math.trunc(n) || 0) } : x)) })} />
          {cuenta.sobran > 0 && <Notice tone="warning" style={{ marginTop: space[2] }}>{recibiendo.modo === 'preparar' ? 'Hay productos que no están en lo pedido (o de más): sacalos de la lista.' : 'Hay productos que no salieron en esta transferencia: el ERP las rechaza. Si llegaron de más, se anotan como ajuste.'}</Notice>}
          {/* El error AL LADO del botón: arriba de todo ⛔ se ve con la lista larga (29-oct: Camila «procesó todo» y era un 403). */}
          {error && <Notice tone="danger" style={{ marginTop: space[3] }} onClose={() => setError(null)}>{error}</Notice>}
          <div style={{ display: 'flex', gap: space[2], marginTop: space[3] }}>
            <Button disabled={trabajando || cuenta.sobran > 0 || (recibiendo.modo === 'preparar' && (cuenta.filas as Fila[]).every((f) => !f.cantidad))} onClick={recibir}>
              {recibiendo.modo === 'preparar' ? (cuenta.completa ? 'Enviar completa' : `Enviar con ${-cuenta.faltan} u de menos`) : cuenta.completa ? 'Recibir completa' : `Recibir con ${-cuenta.faltan} u de menos`}
            </Button>
            <Button variant="outline" onClick={() => setRecibiendo(null)}>Volver</Button>
          </div>
        </SectionCard>
      )}

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
        <TileResumen titulo="En camino" valor={u(enCaminoU)} oscuro nota={`${conteo.en_camino ?? 0} sin recibir`} />
        <TileResumen tono={tonoDeConteo(conteo.sin_enviar)} titulo="Sin enviar" valor={(conteo.sin_enviar ?? 0).toLocaleString('es-AR')} nota="quedaron a medias: no salió nada" />
        <TileResumen tono={tonoDeConteo(faltantesU)} titulo="Faltantes recibidos" valor={u(faltantesU)} nota="esperan un ajuste en Ingresos y ajustes" />
      </div>

      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <VistasLista vistas={VISTAS_DOC} valor={vista} conteo={conteo} onCambio={setVista} />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar en las transferencias" placeholder="Nº, producto o quién la hizo" />
          <Button variant="outline" disabled={!filas.length} onClick={() => bajarCsv(filas, linea)}>Exportar</Button>
          <Button variant="outline" onClick={() => setVuelta((n) => n + 1)}>Actualizar</Button>
        </div>
        <ListaTrabajo
          columnas={COLUMNAS} filas={filas} claveDe={(d) => d.id} celda={celda} orden={orden} onOrden={setOrden}
          activa={fichaId} onAbrir={(d) => setFichaId(d.id)} etiquetaFila={(d) => `la transferencia T-${d.numero} de ${dep(d.desde)} a ${dep(d.hacia)}`}
          vacio={docs ? (
            <div style={{ padding: space[6] }}>
              <EmptyState title={q ? 'No hay transferencias con ese número, producto o persona.' : vista === 'en_camino' ? 'No hay nada en camino.' : 'No hay transferencias en esta vista.'} />
            </div>
          ) : <div style={{ padding: space[6] }}><EmptyState title="Leyendo…" /></div>}
        />
        <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>{filas.length.toLocaleString('es-AR')} de {todos.length.toLocaleString('es-AR')}</div>
      </div>

      {ficha && <FichaDoc d={ficha} nombres={nombres} trabajando={trabajando} onCerrar={() => setFichaId(null)} onRecibir={() => abrirRecepcion(ficha)} onPreparar={() => abrirPreparado(ficha)} onCancelar={() => cancelar(ficha)} />}
    </div>
  )
}

function FichaDoc({ d, nombres, trabajando, onCerrar, onRecibir, onPreparar, onCancelar }: { d: TransferenciaDoc; nombres: Nombres; trabajando: boolean; onCerrar: () => void; onRecibir: () => void; onPreparar: () => void; onCancelar: () => void }) {
  const p = pasoDeDoc(d)
  const renglones = renglonesConDiferencia(d)
  const recibida = d.estado === 'recibida'
  const conPedida = renglones.some((r) => r.pedida > 0)
  const falta = faltantesDe(d)
  const th: React.CSSProperties = { textAlign: 'right', padding: '6px 8px', fontWeight: weight.medium, color: color.mut, fontSize: font.sm, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { textAlign: 'right', padding: '6px 8px', fontVariantNumeric: 'tabular-nums', borderTop: `1px solid ${color.bg2}` }
  return (
    <FichaCostado abierta onCerrar={onCerrar} titulo={`Transferencia T-${d.numero} · ${cuandoCorto(d.creada_en)}`} etiqueta={`Ficha de la transferencia T-${d.numero}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <div style={{ fontSize: 20, fontWeight: weight.bold, color: color.ink }}>{dep(d.desde)} → {dep(d.hacia)}</div>
        <BarraPasos paso={p.paso} fin={p.fin} texto={p.texto} />
      </div>
      {falta > 0 && <Notice tone="warning">Faltaron {u(falta)} al recibir. La diferencia queda marcada y no se ajusta sola: la cierra un ajuste en Ingresos y ajustes.</Notice>}
      <DatosFicha>
        <DatoFicha titulo="Creó">{d.creada_por}</DatoFicha>
        {d.enviada_en && <DatoFicha titulo="Salió">{cuandoCorto(d.enviada_en)} · {d.enviada_por}</DatoFicha>}
        {d.recibida_en && <DatoFicha titulo="Llegó">{cuandoCorto(d.recibida_en)} · {d.recibida_por}</DatoFicha>}
        <DatoFicha titulo="Productos que salieron">{u(unidadesEnviadas(d))}</DatoFicha>
        {recibida && <DatoFicha titulo="Productos que llegaron">{u(unidadesRecibidas(d))}</DatoFicha>}
        {d.nota && <DatoFicha titulo="Nota">{d.nota}</DatoFicha>}
      </DatosFicha>
      <div>
        <div style={{ fontWeight: weight.semibold, color: color.ink, marginBottom: 6 }}>Productos ({renglones.length})</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.base }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Producto</th>
              {conPedida && <th style={th}>Pedida</th>}
              {conPedida && <th style={th}>Armada</th>}
              <th style={th}>Salió</th>
              {recibida && <th style={th}>Llegó</th>}
            </tr>
          </thead>
          <tbody>
            {renglones.map((r) => (
              <tr key={r.n}>
                <td style={{ ...td, textAlign: 'left' }}>
                  <b style={{ color: color.ink }}>{nombreDeRenglon(r, nombres)}</b>
                  {r.sku && <div style={{ fontSize: font.sm, color: color.mut }}>{r.sku}</div>}
                </td>
                {conPedida && <td style={td}>{r.pedida || '—'}</td>}
                {conPedida && <td style={td}>{r.armada || '—'}</td>}
                <td style={td}>{r.enviada || '—'}</td>
                {recibida && <td style={{ ...td, color: r.diferencia ? 'var(--mo-danger-ink)' : color.ink, fontWeight: r.diferencia ? weight.semibold : undefined }}>{r.recibida ?? 0}{r.diferencia ? ` (${r.diferencia > 0 ? '+' : ''}${r.diferencia})` : ''}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
        {d.estado === 'en_transito' && <Button disabled={trabajando} onClick={onRecibir}>Recibir</Button>}
        {d.estado === 'borrador' && <Button disabled={trabajando} onClick={onPreparar}>Preparar</Button>}
        {(d.estado === 'borrador' || d.estado === 'armada') && <Button variant="outline" disabled={trabajando} onClick={onCancelar}>Cancelar</Button>}
        <Button variant="outline" onClick={() => imprimirRemito(d, nombres)}>Imprimir remito</Button>
      </div>
    </FichaCostado>
  )
}
