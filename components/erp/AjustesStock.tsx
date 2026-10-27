'use client'

/**
 * ERP › Stock › Conteos y ajustes (diseño §7, Bruno 19-oct). Dos cosas: **cargar un ajuste a mano** (Fallado · Canje ·
 * Regalo · Otro con el porqué) y **la lista de los ajustes hechos** (registro), con la ficha al costado.
 *
 * 🔑 Bruno, 19-oct: ⛔ se cuenta en el ERP. El ERP se IGUALÓ a GN (los «Igualado a GN» de la lista) y lo que se cuenta en el
 * módulo de Conteo del monitor entra solo (se ve en el historial de la prenda) ⇒ ⛔ lista «A contar», ⛔ motivo «Conteo» a mano.
 * La aprobación está APAGADA («somos pocos, burocracia») ⇒ «Guardar» = `crearAjuste` + `aprobarAjuste` en un gesto
 * (el contrato de B ⛔ cambia). Si el 2º paso falla, el ajuste queda «para aprobar» y se resuelve abajo.
 * Hasta el corte mueve SÓLO el stock del ERP (⛔ GN ni Tienda Nube). Nada se borra: un ajuste equivocado se arregla con otro.
 */

import { useEffect, useState } from 'react'
import {
  Button, EmptyState, Field, Input, Notice, SectionCard, Select, TableWrap, TBody, Td, Th, THead, Tr, Tabs, space,
} from '@/components/ui'
import { ListaTrabajo, type ColumnaLista } from '@/components/ui/ListaTrabajo'
import { FichaCostado } from '@/components/ui/FichaCostado'
import { ChipEstado, cuandoCorto as cuando } from '@/components/ui/PiezasLista'
import { color, font } from '@/components/ui/tokens'
import {
  aprobarAjuste, buscarPrendas, crearAjuste, descartarAjuste, leerAjustes, leerStockDePrenda,
  type AjusteStock, type AjustesDeLinea, type AvisoAjuste, type LineaErp, type MarcaErp, type PrendaEncontrada,
} from '@/lib/erp/cliente'
import { MOTIVOS, baseDe } from '@/lib/erp/ajuste.core.js'
import { NOMBRE_DEPOSITO } from '@/lib/erp/stock.core.js'
import type { PrendaAAjustar } from './stock/StockErp'

const LINEAS: Array<{ key: LineaErp; label: string }> = [{ key: 'zattia', label: 'Zattia' }, { key: 'stunned', label: 'Stunned' }, { key: 'bdi', label: 'BDI' }]
const DEPOSITOS: Record<MarcaErp, string[]> = { bdi: ['local', 'deposito_minorista', 'deposito_mayorista'], zattia: ['local', 'deposito'] }
/** Los motivos que se cargan a mano: el conteo entra solo desde el monitor (⛔ va en el menú). */
export const MOTIVOS_A_MANO = MOTIVOS.filter((m) => m.key !== 'conteo')
const ESTADO = { para_aprobar: ['warning', 'Para aprobar'], aplicado: ['success', 'Aplicado'], rechazado: ['neutral', 'Descartado'] } as const
const COLUMNAS: ColumnaLista[] = [
  { key: 'n', titulo: 'Nº', ancho: '64px' },
  { key: 'h', titulo: 'Fecha', ancho: '96px' },
  { key: 'motivo', titulo: 'Motivo', ancho: 'minmax(200px, 1.6fr)' },
  { key: 'dep', titulo: 'Depósito', ancho: '150px' },
  { key: 'prendas', titulo: 'Productos', ancho: '72px', derecha: true },
  { key: 'neto', titulo: 'Unidades', ancho: '80px', derecha: true },
  { key: 'estado', titulo: 'Estado', ancho: '120px' },
  { key: 'quien', titulo: 'Quién', ancho: 'minmax(120px, 1fr)' },
]
const deposito = (d: string) => (NOMBRE_DEPOSITO as Record<string, string>)[d] ?? d
const conSigno = (n: number) => (n > 0 ? `+${n}` : String(n))
const prendaDe = (p: { nombre: string | null; talleNombre: string | null; sku: string | null }) =>
  p.nombre ? `${p.nombre}${p.talleNombre ? ` · ${p.talleNombre}` : ''}` : p.sku ?? 'Producto sin nombre'

/** Un renglón del ajuste que se está armando: el stock por depósito se lee al agregar la prenda. */
type Renglon = {
  producto: string; talle: string; sku: string | null; barcode: string | null; nombre: string | null; talleNombre: string | null
  porDeposito: Record<string, { libro: number; gn: number | null }> | null; valor: string
}
type Borrador = { deposito: string; motivo: string; detalle: string; renglones: Renglon[] }

type PrendaDeAjuste = { producto: string; talle: string; sku: string | null; barcode?: string | null; nombre: string | null; talleNombre: string | null }
const renglonDe = (p: PrendaDeAjuste): Renglon => ({ producto: p.producto, talle: p.talle, sku: p.sku, barcode: p.barcode ?? null, nombre: p.nombre, talleNombre: p.talleNombre, porDeposito: null, valor: '' })

export function AjustesStock({ pedida = null }: { pedida?: PrendaAAjustar | null } = {}) {
  const [linea, setLinea] = useState<LineaErp>((pedida?.linea as LineaErp | undefined) ?? 'zattia')
  const base = baseDe(linea) as MarcaErp
  const [datos, setDatos] = useState<AjustesDeLinea | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ texto: string; avisos: AvisoAjuste[] } | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const [trabajando, setTrabajando] = useState(false)
  // Desde la lista de Stock («Ajustar»): arranca con el ajuste abierto y la prenda cargada.
  const [borrador, setBorrador] = useState<Borrador | null>(() => (pedida ? { deposito: DEPOSITOS[baseDe(pedida.linea) as MarcaErp][0], motivo: MOTIVOS_A_MANO[0].key, detalle: '', renglones: [renglonDe(pedida)] } : null))
  const [texto, setTexto] = useState('')
  const [encontradas, setEncontradas] = useState<PrendaEncontrada[] | null>(null)
  const [descartando, setDescartando] = useState<{ id: string; motivo: string } | null>(null)
  const [ficha, setFicha] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    leerAjustes(linea)
      // ⛔ borra el error: el «quedó sin aplicar» de `guardar` se muestra JUSTO después de releer (lo borra cambiar de línea).
      .then((d) => { if (vivo) setDatos(d) })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudieron leer los ajustes.'))
    return () => { vivo = false }
  }, [linea, vuelta])

  function cambiarLinea(k: string) {
    setLinea(k as LineaErp)
    setDatos(null)
    setBorrador(null)
    setEncontradas(null)
    setHecho(null)
    setError(null)
    setFicha(null)
  }

  const motivo = MOTIVOS_A_MANO.find((m) => m.key === borrador?.motivo) ?? MOTIVOS_A_MANO[0]

  async function agregar(p: PrendaDeAjuste) {
    if (!borrador || borrador.renglones.some((r) => r.producto === p.producto && r.talle === p.talle)) return
    setBorrador({ ...borrador, renglones: [...borrador.renglones, renglonDe(p)] })
    await leerRenglon(p)
  }

  /** Lo que dice el ERP (y GN) de la prenda en cada depósito: el «antes» del renglón. */
  async function leerRenglon(p: { producto: string; talle: string }) {
    try {
      const s = await leerStockDePrenda(base, p.producto, p.talle)
      const porDeposito = Object.fromEntries(s.depositos.map((d) => [d.deposito, { libro: d.libro, gn: d.gn }]))
      setBorrador((b) => b && { ...b, renglones: b.renglones.map((r) => (r.producto === p.producto && r.talle === p.talle ? { ...r, porDeposito, barcode: r.barcode ?? s.prenda.barcode ?? null } : r)) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el stock del producto.')
    }
  }

  useEffect(() => {
    if (pedida) void leerRenglon(pedida)
    // Una sola vez: `Erp` monta la pestaña de nuevo (key) para cada prenda pedida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function buscar() {
    setTrabajando(true)
    try {
      setEncontradas((await buscarPrendas(base, texto)).variantes)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo buscar.')
    } finally {
      setTrabajando(false)
    }
  }

  /** Guardar = crear + aplicar (la aprobación está apagada). */
  async function guardar() {
    if (!borrador) return
    setTrabajando(true)
    let creado: { numero: number; id: string; avisos: AvisoAjuste[] } | null = null
    try {
      creado = await crearAjuste({
        linea, deposito: borrador.deposito, motivo: borrador.motivo, detalle: borrador.detalle, fuente: 'mano',
        // Fallado/Canje/Regalo: lo que sale, en positivo (contrato de B); Otro: con signo.
        renglones: borrador.renglones.map((x) => ({ producto: x.producto, talle: x.talle, sku: x.sku, barcode: x.barcode, cantidad: motivo.pide === 'sale' ? Math.abs(Number(x.valor)) : Number(x.valor) })),
      })
      const r = await aprobarAjuste(linea, creado.id)
      setHecho({ texto: `Ajuste A-${r.numero} guardado: el stock del ERP cambió en ${r.movimientos} ${r.movimientos === 1 ? 'producto' : 'productos'}.`, avisos: [...creado.avisos, ...r.avisos] })
      setBorrador(null)
      setEncontradas(null)
      setError(null)
    } catch (e) {
      const m = e instanceof Error ? e.message : 'No se pudo guardar el ajuste.'
      // Se creó pero ⛔ se aplicó: queda «para aprobar» (abajo) y el borrador se suelta para ⛔ crearlo dos veces.
      if (creado) { setBorrador(null); setEncontradas(null); setError(`El ajuste A-${creado.numero} quedó guardado pero el stock todavía no cambió (${m}). Confirmalo en «Sin confirmar».`) }
      else setError(m)
    } finally {
      setTrabajando(false)
      setVuelta((n) => n + 1)
    }
  }

  async function resolver(a: AjusteStock, aplicar: boolean) {
    setTrabajando(true)
    try {
      if (aplicar) {
        const r = await aprobarAjuste(linea, a.id)
        setHecho({ texto: `A-${r.numero} aplicado: el stock del ERP cambió en ${r.movimientos} ${r.movimientos === 1 ? 'producto' : 'productos'}.`, avisos: r.avisos })
      } else {
        const r = await descartarAjuste(linea, a.id, descartando?.motivo ?? '')
        setHecho({ texto: `A-${r.numero} descartado: el stock no cambió.`, avisos: [] })
        setDescartando(null)
      }
      setError(null)
      setVuelta((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo resolver el ajuste.')
    } finally {
      setTrabajando(false)
    }
  }

  const sinAplicar = datos?.ajustes.filter((a) => a.estado === 'para_aprobar') ?? []
  const abierta = datos?.ajustes.find((a) => a.id === ficha) ?? null
  const salen = (r: Renglon) => {
    if (r.valor.trim() === '' || !Number.isInteger(Number(r.valor)) || Number(r.valor) === 0) return null
    const n = Number(r.valor)
    return motivo.pide === 'sale' ? -Math.abs(n) : n
  }
  const listo = !!borrador && borrador.renglones.length > 0 && borrador.renglones.every((r) => salen(r) != null) && (borrador.motivo !== 'otro' || borrador.detalle.trim().length >= 3)

  const celda = (a: AjusteStock, k: string): React.ReactNode => {
    if (k === 'n') return <b>A-{a.numero}</b>
    if (k === 'h') return <span style={{ color: color.mut }}>{cuando(a.creadoEn)}</span>
    if (k === 'motivo') return <span title={a.detalle ? `${a.motivoNombre} · ${a.detalle}` : a.motivoNombre}>{a.motivoNombre}{a.detalle ? <span style={{ color: color.mut, marginLeft: 6 }}>{a.detalle}</span> : null}</span>
    if (k === 'dep') return deposito(a.deposito)
    if (k === 'prendas') return a.renglones.length
    if (k === 'neto') return conSigno(a.neto)
    if (k === 'estado') return <ChipEstado mapa={ESTADO} k={a.estado} />
    if (k === 'quien') return a.creadoPor
    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard title="Ingresos y ajustes" subtitle="Lo que sale del stock fuera de una venta: fallados, canjes, regalos. Nada se borra: un ajuste equivocado se arregla con otro.">
        <div style={{ display: 'flex', gap: space[3], alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Tabs items={LINEAS} value={linea} onChange={cambiarLinea} />
          {datos && !borrador && <Button onClick={() => setBorrador({ deposito: DEPOSITOS[base][0], motivo: MOTIVOS_A_MANO[0].key, detalle: '', renglones: [] })}>Nuevo ajuste</Button>}
        </div>
        <Notice tone="neutral" style={{ marginTop: space[3] }}>Mientras convivimos con Gestión Nube, el ajuste cambia sólo el stock del ERP: en Gestión Nube se ajusta como siempre. Los conteos se hacen en el módulo de Conteo del monitor y entran solos (se ven en el historial de cada producto, en Stock).</Notice>
      </SectionCard>

      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {hecho && (
        <Notice tone="success" onClose={() => setHecho(null)}>
          {hecho.texto}
          {hecho.avisos.map((a, i) => <div key={i} style={{ marginTop: 4 }}>⚠️ {a.texto}</div>)}
        </Notice>
      )}
      {!datos && !error && <EmptyState title="Leyendo los ajustes…" />}

      {borrador && (
        <SectionCard title="Nuevo ajuste" subtitle={motivo.pide === 'sale' ? 'Escribí cuántas salen de ese depósito.' : 'Escribí la cantidad: + entra, − sale.'}>
          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Motivo">
              <Select value={borrador.motivo} onChange={(e) => setBorrador({ ...borrador, motivo: e.target.value, renglones: borrador.renglones.map((r) => ({ ...r, valor: '' })) })}>
                {MOTIVOS_A_MANO.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </Select>
            </Field>
            <Field label="Depósito">
              <Select value={borrador.deposito} onChange={(e) => setBorrador({ ...borrador, deposito: e.target.value })}>
                {DEPOSITOS[base].map((d) => <option key={d} value={d}>{deposito(d)}</option>)}
              </Select>
            </Field>
            <Field label={borrador.motivo === 'otro' ? 'Por qué (obligatorio)' : 'Detalle'}>
              <Input value={borrador.detalle} onChange={(e) => setBorrador({ ...borrador, detalle: e.target.value })} placeholder={borrador.motivo === 'fallado' ? 'Ej.: costura abierta' : borrador.motivo === 'otro' ? 'Qué pasó' : 'Opcional'} />
            </Field>
          </div>

          <div style={{ display: 'flex', gap: space[2], marginTop: space[3], alignItems: 'flex-end' }}>
            <Field label="Agregar un producto">
              <Input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && texto.trim()) buscar() }} placeholder="código, código de barras o nombre" />
            </Field>
            <Button variant="outline" disabled={trabajando || !texto.trim()} onClick={buscar}>Buscar</Button>
          </div>
          {encontradas && (encontradas.length === 0 ? <div style={{ marginTop: space[2] }}>No se encontró ningún producto.</div> : (
            <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginTop: space[2] }}>
              {encontradas.slice(0, 20).map((p) => (
                <Button key={`${p.producto}:${p.talle}`} variant="soft" size="sm" onClick={() => agregar(p)}>+ {prendaDe(p)}</Button>
              ))}
            </div>
          ))}

          {borrador.renglones.length > 0 ? (
            <TableWrap style={{ marginTop: space[3] }}>
              <THead>
                <Tr>
                  <Th>Producto</Th><Th>código</Th>
                  <Th style={{ textAlign: 'right' }}>ERP en {deposito(borrador.deposito)}</Th>
                  <Th style={{ textAlign: 'right' }}>{motivo.pide === 'sale' ? 'Salen' : 'Cantidad (+ o −)'}</Th>
                  <Th style={{ textAlign: 'right' }}>Queda</Th><Th />
                </Tr>
              </THead>
              <TBody>
                {borrador.renglones.map((r) => {
                  const libro = r.porDeposito?.[borrador.deposito]?.libro
                  const d = salen(r)
                  return (
                    <Tr key={`${r.producto}:${r.talle}`}>
                      <Td>{prendaDe(r)}</Td>
                      <Td>{r.sku ?? '—'}</Td>
                      <Td style={{ textAlign: 'right' }}>{r.porDeposito ? libro ?? 0 : '…'}</Td>
                      <Td style={{ textAlign: 'right' }}>
                        <Input value={r.valor} inputMode="numeric" aria-label={`Cantidad de ${prendaDe(r)}`} style={{ width: 80, textAlign: 'right' }}
                          onChange={(e) => setBorrador({ ...borrador, renglones: borrador.renglones.map((x) => (x === r ? { ...x, valor: e.target.value } : x)) })} />
                      </Td>
                      <Td style={{ textAlign: 'right' }}>{d == null || !r.porDeposito ? '—' : (libro ?? 0) + d}</Td>
                      <Td><Button variant="ghost" size="sm" onClick={() => setBorrador({ ...borrador, renglones: borrador.renglones.filter((x) => x !== r) })}>Sacar</Button></Td>
                    </Tr>
                  )
                })}
              </TBody>
            </TableWrap>
          ) : <div style={{ marginTop: space[2], color: color.mut }}>Agregá los productos con el buscador.</div>}

          <div style={{ display: 'flex', gap: space[2], marginTop: space[3] }}>
            <Button disabled={trabajando || !listo} onClick={guardar}>Guardar ajuste</Button>
            <Button variant="outline" disabled={trabajando} onClick={() => { setBorrador(null); setEncontradas(null) }}>Cancelar</Button>
          </div>
        </SectionCard>
      )}

      {sinAplicar.length > 0 && (
        <SectionCard title={`Sin confirmar · ${sinAplicar.length}`} subtitle="Se guardaron pero el stock del ERP todavía no cambió. Confirmalos o descartalos.">
          {sinAplicar.map((a) => (
            <div key={a.id} style={{ display: 'flex', gap: space[2], alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: space[3] }}>
              <span style={{ alignSelf: 'center' }}><b>A-{a.numero}</b> · {a.motivoNombre} · {deposito(a.deposito)} · {conSigno(a.neto)} u · {a.creadoPor} {cuando(a.creadoEn)}</span>
              <Button size="sm" disabled={trabajando} onClick={() => resolver(a, true)}>Confirmar</Button>
              {descartando?.id === a.id ? (
                <>
                  <Field label="Por qué se descarta">
                    <Input value={descartando.motivo} onChange={(e) => setDescartando({ id: a.id, motivo: e.target.value })} placeholder="Ej.: se cargó otro variante" />
                  </Field>
                  <Button size="sm" variant="outline" tone="danger" disabled={trabajando || descartando.motivo.trim().length < 3} onClick={() => resolver(a, false)}>Descartar A-{a.numero}</Button>
                </>
              ) : <Button size="sm" variant="outline" disabled={trabajando} onClick={() => setDescartando({ id: a.id, motivo: '' })}>Descartar</Button>}
            </div>
          ))}
        </SectionCard>
      )}

      {datos && (
        <SectionCard title={`Ajustes · ${datos.ajustes.length}`}>
          <ListaTrabajo
            columnas={COLUMNAS} filas={datos.ajustes} claveDe={(a) => a.id} celda={celda} activa={ficha}
            onAbrir={(a) => setFicha(a.id)} etiquetaFila={(a) => `el ajuste A-${a.numero}`}
            vacio={<EmptyState title="Todavía no hay ajustes en esta línea." />}
          />
        </SectionCard>
      )}

      <FichaCostado abierta={!!abierta} onCerrar={() => setFicha(null)} etiqueta={abierta ? `Ficha del ajuste A-${abierta.numero}` : 'Ficha del ajuste'}
        titulo={abierta ? `Ajuste A-${abierta.numero} · ${cuando(abierta.creadoEn)}` : ''}>
        {abierta && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: font.lg, fontWeight: 600 }}>{abierta.motivoNombre}</div>
              {abierta.detalle && <div>{abierta.detalle}</div>}
              <div style={{ color: color.mut }}>{deposito(abierta.deposito)} · {conSigno(abierta.neto)} unidades · cargó {abierta.creadoPor}{abierta.resueltoPor && abierta.resueltoPor !== abierta.creadoPor ? ` · aplicó ${abierta.resueltoPor}` : ''}</div>
              <div><ChipEstado mapa={ESTADO} k={abierta.estado} />{abierta.rechazo ? <span style={{ marginLeft: 8 }}>{abierta.rechazo}</span> : null}</div>
            </div>
            <TableWrap>
              <THead>
                <Tr><Th>Producto</Th><Th style={{ textAlign: 'right' }}>Antes</Th><Th style={{ textAlign: 'right' }}>Cambio</Th><Th style={{ textAlign: 'right' }}>Después</Th></Tr>
              </THead>
              <TBody>
                {abierta.renglones.map((r) => (
                  <Tr key={r.n}>
                    <Td>{prendaDe(r)}<div style={{ fontSize: font.xs, color: color.mut }}>{r.sku ?? ''}</div></Td>
                    <Td style={{ textAlign: 'right' }}>{r.antes}</Td>
                    <Td style={{ textAlign: 'right' }}>{conSigno(r.diferencia)}</Td>
                    <Td style={{ textAlign: 'right' }}>{r.despues}</Td>
                  </Tr>
                ))}
              </TBody>
            </TableWrap>
          </>
        )}
      </FichaCostado>
    </div>
  )
}
