'use client'

/**
 * ERP › Ajustes (paso 7). El AJUSTE DE STOCK CON MOTIVO: se cuenta la prenda (o se saca una fallada, un canje, un regalo),
 * el ajuste queda para aprobar con lo que decía el ERP en ese momento, y un admin lo aprueba: recién ahí el stock del ERP
 * pasa a lo contado. Nada se borra: un ajuste equivocado se arregla con otro.
 *
 * 🔑 Hasta el corte GN sirve y el ERP es la prueba: esto mueve SÓLO el stock del ERP (⛔ GN ni Tienda Nube). La lista
 * «A contar» es lo que la Conciliación marca «El ERP dice otro stock» y las prendas que la Caja vendió con el PIN.
 */

import { useEffect, useState } from 'react'
import {
  Badge, Button, EmptyState, Field, Input, Notice, Plegable, SectionCard, Select, TableWrap, TBody, Td, Th, THead, Tr, Tabs, space,
} from '@/components/ui'
import {
  aprobarAjuste, buscarPrendas, crearAjuste, descartarAjuste, leerAjustes, leerStockDePrenda,
  type AjusteStock, type AjustesDeLinea, type AvisoAjuste, type FilaAContar, type LineaErp, type MarcaErp, type PrendaEncontrada,
} from '@/lib/erp/cliente'
import { MOTIVOS, baseDe } from '@/lib/erp/ajuste.core.js'
import { NOMBRE_DEPOSITO } from '@/lib/erp/stock.core.js'

const LINEAS: Array<{ key: LineaErp; label: string }> = [{ key: 'zattia', label: 'Zattia' }, { key: 'stunned', label: 'Stunned' }, { key: 'bdi', label: 'BDI' }]
const DEPOSITOS: Record<MarcaErp, string[]> = { bdi: ['local', 'deposito_minorista', 'deposito_mayorista'], zattia: ['local', 'deposito'] }
const ESTADO: Record<string, { label: string; tone: 'warning' | 'success' | 'neutral' }> = {
  para_aprobar: { label: 'Para aprobar', tone: 'warning' }, aplicado: { label: 'Aprobado', tone: 'success' }, rechazado: { label: 'Descartado', tone: 'neutral' },
}
const deposito = (d: string) => (NOMBRE_DEPOSITO as Record<string, string>)[d] ?? d
const cuando = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString()
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}`
}
const conSigno = (n: number) => (n > 0 ? `+${n}` : String(n))
const prendaDe = (p: { nombre: string | null; talleNombre: string | null; sku: string | null }) =>
  p.nombre ? `${p.nombre}${p.talleNombre ? ` · ${p.talleNombre}` : ''}` : p.sku ?? 'Prenda sin nombre'

/** Un renglón del ajuste que se está armando: el stock por depósito se lee al agregar la prenda. */
type Renglon = {
  producto: string; talle: string; sku: string | null; barcode: string | null; nombre: string | null; talleNombre: string | null
  porDeposito: Record<string, { libro: number; gn: number | null }> | null; valor: string
}
type Borrador = { deposito: string; motivo: string; detalle: string; fuente: 'mano' | 'conciliacion' | 'contar'; renglones: Renglon[] }

export function AjustesStock() {
  const [linea, setLinea] = useState<LineaErp>('zattia')
  const base = baseDe(linea) as MarcaErp
  const [datos, setDatos] = useState<AjustesDeLinea | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ texto: string; avisos: AvisoAjuste[] } | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const [trabajando, setTrabajando] = useState(false)
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [texto, setTexto] = useState('')
  const [encontradas, setEncontradas] = useState<PrendaEncontrada[] | null>(null)
  const [descartando, setDescartando] = useState<{ id: string; motivo: string } | null>(null)
  const [verEnAjuste, setVerEnAjuste] = useState(false)

  useEffect(() => {
    let vivo = true
    leerAjustes(linea)
      .then((d) => { if (vivo) { setDatos(d); setError(null) } })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudieron leer los ajustes.'))
    return () => { vivo = false }
  }, [linea, vuelta])

  function cambiarLinea(k: string) {
    setLinea(k as LineaErp)
    setDatos(null)
    setBorrador(null)
    setEncontradas(null)
    setHecho(null)
  }

  const motivo = MOTIVOS.find((m) => m.key === borrador?.motivo) ?? MOTIVOS[0]

  async function agregar(p: { producto: string; talle: string; sku: string | null; barcode?: string | null; nombre: string | null; talleNombre: string | null }, desde: Partial<Borrador>) {
    const actual: Borrador = borrador ?? { deposito: desde.deposito ?? DEPOSITOS[base][0], motivo: desde.motivo ?? 'conteo', detalle: '', fuente: desde.fuente ?? 'mano', renglones: [] }
    if (actual.renglones.some((r) => r.producto === p.producto && r.talle === p.talle)) return
    const nuevo: Renglon = { producto: p.producto, talle: p.talle, sku: p.sku, barcode: p.barcode ?? null, nombre: p.nombre, talleNombre: p.talleNombre, porDeposito: null, valor: '' }
    setBorrador({ ...actual, renglones: [...actual.renglones, nuevo] })
    try {
      const s = await leerStockDePrenda(base, p.producto, p.talle)
      const porDeposito = Object.fromEntries(s.depositos.map((d) => [d.deposito, { libro: d.libro, gn: d.gn }]))
      setBorrador((b) => b && { ...b, renglones: b.renglones.map((r) => (r.producto === p.producto && r.talle === p.talle ? { ...r, porDeposito, barcode: r.barcode ?? s.prenda.barcode ?? null } : r)) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el stock de la prenda.')
    }
  }

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

  async function mandar() {
    if (!borrador) return
    setTrabajando(true)
    try {
      const r = await crearAjuste({
        linea, deposito: borrador.deposito, motivo: borrador.motivo, detalle: borrador.detalle, fuente: borrador.fuente,
        renglones: borrador.renglones.map((x) => ({ producto: x.producto, talle: x.talle, sku: x.sku, barcode: x.barcode, ...(motivo.pide === 'contado' ? { contado: Number(x.valor) } : { cantidad: Number(x.valor) }) })),
      })
      setHecho({ texto: `Ajuste A-${r.numero} listo para aprobar (${r.renglones} ${r.renglones === 1 ? 'prenda' : 'prendas'} con diferencia).`, avisos: r.avisos })
      setBorrador(null)
      setEncontradas(null)
      setError(null)
      setVuelta((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo armar el ajuste.')
    } finally {
      setTrabajando(false)
    }
  }

  async function resolver(a: AjusteStock, aprobar: boolean) {
    setTrabajando(true)
    try {
      if (aprobar) {
        const r = await aprobarAjuste(linea, a.id)
        setHecho({ texto: `A-${r.numero} aprobado: el stock del ERP cambió en ${r.movimientos} ${r.movimientos === 1 ? 'prenda' : 'prendas'}.`, avisos: r.avisos })
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

  const pendientes = datos?.ajustes.filter((a) => a.estado === 'para_aprobar') ?? []
  const resueltos = datos?.ajustes.filter((a) => a.estado !== 'para_aprobar').slice(0, 30) ?? []
  const diferenciaDe = (r: Renglon) => {
    const libro = r.porDeposito?.[borrador?.deposito ?? '']?.libro ?? 0
    if (r.valor.trim() === '' || !Number.isInteger(Number(r.valor))) return null
    const n = Number(r.valor)
    return motivo.pide === 'contado' ? n - libro : motivo.pide === 'sale' ? -Math.abs(n) : n
  }
  const listo = !!borrador && borrador.renglones.length > 0 && borrador.renglones.every((r) => diferenciaDe(r) != null) && (borrador.motivo !== 'otro' || borrador.detalle.trim().length >= 3)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard title="Ajustes de stock" subtitle="Se cuenta la prenda, el ajuste queda para aprobar y, al aprobarlo, el stock del ERP pasa a lo contado. Nada se borra: un ajuste equivocado se arregla con otro.">
        <Tabs items={LINEAS} value={linea} onChange={cambiarLinea} />
        <Notice tone="neutral" style={{ marginTop: space[3] }}>Mientras convivimos con Gestión Nube, el ajuste cambia sólo el stock del ERP: GN y Tienda Nube siguen como están, y ahí se ajusta como siempre.</Notice>
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
        <SectionCard title="Nuevo ajuste" subtitle={motivo.pide === 'contado' ? 'Escribí cuántas hay en la estantería de ese depósito (incluye lo de pedidos todavía sin armar).' : 'Escribí cuántas salen de ese depósito.'}>
          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Depósito">
              <Select value={borrador.deposito} onChange={(e) => setBorrador({ ...borrador, deposito: e.target.value })}>
                {DEPOSITOS[base].map((d) => <option key={d} value={d}>{deposito(d)}</option>)}
              </Select>
            </Field>
            <Field label="Motivo">
              <Select value={borrador.motivo} onChange={(e) => setBorrador({ ...borrador, motivo: e.target.value, renglones: borrador.renglones.map((r) => ({ ...r, valor: '' })) })}>
                {MOTIVOS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </Select>
            </Field>
            <Field label={borrador.motivo === 'otro' ? 'Por qué (obligatorio)' : 'Detalle'}>
              <Input value={borrador.detalle} onChange={(e) => setBorrador({ ...borrador, detalle: e.target.value })} placeholder={borrador.motivo === 'fallado' ? 'Ej.: costura abierta' : 'Opcional'} />
            </Field>
          </div>

          <div style={{ display: 'flex', gap: space[2], marginTop: space[3], alignItems: 'flex-end' }}>
            <Field label="Agregar una prenda">
              <Input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && texto.trim()) buscar() }} placeholder="SKU, código de barras o nombre" />
            </Field>
            <Button variant="outline" disabled={trabajando || !texto.trim()} onClick={buscar}>Buscar</Button>
          </div>
          {encontradas && (encontradas.length === 0 ? <div style={{ marginTop: space[2] }}>No se encontró ninguna prenda.</div> : (
            <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginTop: space[2] }}>
              {encontradas.slice(0, 20).map((p) => (
                <Button key={`${p.producto}:${p.talle}`} variant="soft" size="sm" onClick={() => agregar(p, {})}>+ {prendaDe(p)}</Button>
              ))}
            </div>
          ))}

          <TableWrap style={{ marginTop: space[3] }}>
            <THead>
              <Tr>
                <Th>Prenda</Th><Th>SKU</Th>
                <Th style={{ textAlign: 'right' }}>ERP en {deposito(borrador.deposito)}</Th><Th style={{ textAlign: 'right' }}>GN</Th>
                <Th style={{ textAlign: 'right' }}>{motivo.pide === 'contado' ? 'Contado' : motivo.pide === 'sale' ? 'Salen' : 'Cantidad (+ o −)'}</Th>
                <Th style={{ textAlign: 'right' }}>Diferencia</Th><Th />
              </Tr>
            </THead>
            <TBody>
              {borrador.renglones.map((r) => {
                const enDep = r.porDeposito?.[borrador.deposito]
                const d = diferenciaDe(r)
                return (
                  <Tr key={`${r.producto}:${r.talle}`}>
                    <Td>{prendaDe(r)}</Td>
                    <Td>{r.sku ?? '—'}</Td>
                    <Td style={{ textAlign: 'right' }}>{r.porDeposito ? enDep?.libro ?? 0 : '…'}</Td>
                    <Td style={{ textAlign: 'right' }}>{r.porDeposito ? enDep?.gn ?? '—' : '…'}</Td>
                    <Td style={{ textAlign: 'right' }}>
                      <Input value={r.valor} inputMode="numeric" style={{ width: 80, textAlign: 'right' }}
                        onChange={(e) => setBorrador({ ...borrador, renglones: borrador.renglones.map((x) => (x === r ? { ...x, valor: e.target.value } : x)) })} />
                    </Td>
                    <Td style={{ textAlign: 'right' }}>{d == null ? '—' : d === 0 ? 'coincide' : conSigno(d)}</Td>
                    <Td><Button variant="ghost" size="sm" onClick={() => setBorrador({ ...borrador, renglones: borrador.renglones.filter((x) => x !== r) })}>Sacar</Button></Td>
                  </Tr>
                )
              })}
            </TBody>
          </TableWrap>
          {borrador.renglones.length === 0 && <div style={{ marginTop: space[2] }}>Agregá prendas con el buscador o con «Contar» en la lista de abajo.</div>}

          <div style={{ display: 'flex', gap: space[2], marginTop: space[3] }}>
            <Button disabled={trabajando || !listo} onClick={mandar}>Enviar a aprobar</Button>
            <Button variant="outline" disabled={trabajando} onClick={() => { setBorrador(null); setEncontradas(null) }}>Descartar el borrador</Button>
          </div>
        </SectionCard>
      )}

      {datos && !borrador && (
        <div><Button onClick={() => setBorrador({ deposito: DEPOSITOS[base][0], motivo: 'conteo', detalle: '', fuente: 'mano', renglones: [] })}>Nuevo ajuste</Button></div>
      )}

      {datos && (
        <SectionCard title={pendientes.length ? `Para aprobar · ${pendientes.length}` : 'Para aprobar'} subtitle="Al aprobar, el stock del ERP cambia en cada diferencia y queda como ajuste con su motivo.">
          {pendientes.length === 0 ? <EmptyState title="No hay ajustes para aprobar." /> : pendientes.map((a) => (
            <div key={a.id} style={{ marginBottom: space[4] }}>
              <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
                <strong>A-{a.numero}</strong><Badge tone="brand">{a.motivoNombre}</Badge>
                <span>{deposito(a.deposito)} · {a.creadoPor} · {cuando(a.creadoEn)} · neto {conSigno(a.neto)} u</span>
                {a.fuente === 'conciliacion' && <Badge tone="neutral">de la Conciliación</Badge>}
              </div>
              {a.detalle && <div style={{ marginTop: 4 }}>{a.detalle}</div>}
              {a.seMovio > 0 && <Notice tone="warning" style={{ marginTop: space[2] }}>En {a.seMovio === 1 ? 'una prenda' : `${a.seMovio} prendas`} el ERP se movió desde que se contó (una venta en el medio). Mirá «ERP ahora» antes de aprobar.</Notice>}
              <TableWrap style={{ marginTop: space[2] }}>
                <THead>
                  <Tr>
                    <Th>Prenda</Th><Th>SKU</Th><Th style={{ textAlign: 'right' }}>ERP al armarlo</Th>
                    {a.motivo === 'conteo' && <Th style={{ textAlign: 'right' }}>Contado</Th>}
                    <Th style={{ textAlign: 'right' }}>Diferencia</Th><Th style={{ textAlign: 'right' }}>ERP ahora</Th>
                  </Tr>
                </THead>
                <TBody>
                  {a.renglones.map((r) => (
                    <Tr key={r.n}>
                      <Td>{prendaDe(r)}</Td><Td>{r.sku ?? '—'}</Td>
                      <Td style={{ textAlign: 'right' }}>{r.antes}</Td>
                      {a.motivo === 'conteo' && <Td style={{ textAlign: 'right' }}>{r.contado}</Td>}
                      <Td style={{ textAlign: 'right' }}>{conSigno(r.diferencia)}</Td>
                      <Td style={{ textAlign: 'right' }}>{r.ahora ?? '—'}{r.ahora != null && r.ahora !== r.antes ? ' ⚠️' : ''}</Td>
                    </Tr>
                  ))}
                </TBody>
              </TableWrap>
              <div style={{ display: 'flex', gap: space[2], marginTop: space[2], alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <Button disabled={trabajando} onClick={() => resolver(a, true)}>Aprobar {a.renglones.length} {a.renglones.length === 1 ? 'diferencia' : 'diferencias'}</Button>
                {descartando?.id === a.id ? (
                  <>
                    <Field label="Por qué se descarta">
                      <Input value={descartando.motivo} onChange={(e) => setDescartando({ id: a.id, motivo: e.target.value })} placeholder="Ej.: se contó otro talle" />
                    </Field>
                    <Button variant="outline" tone="danger" disabled={trabajando || descartando.motivo.trim().length < 3} onClick={() => resolver(a, false)}>Descartar A-{a.numero}</Button>
                  </>
                ) : <Button variant="outline" disabled={trabajando} onClick={() => setDescartando({ id: a.id, motivo: '' })}>Descartar</Button>}
              </div>
            </div>
          ))}
        </SectionCard>
      )}

      {datos && (
        <SectionCard
          title={`A contar · ${datos.pendientes.length}`}
          subtitle={datos.sinConciliacion ? 'La Conciliación de esta tienda no se pudo leer: quedan sólo las ventas con PIN.' : `Lo que la Conciliación${datos.fecha ? ` del ${datos.fecha.slice(8, 10)}/${datos.fecha.slice(5, 7)}` : ''} marca «El ERP dice otro stock» (Tienda Nube y GN coinciden y el ERP no), y lo que la Caja vendió con el PIN de la encargada. Contá la prenda y armá el ajuste.`}
        >
          {datos.pendientes.length === 0 ? <EmptyState title="No hay nada para contar." /> : <TablaAContar filas={datos.pendientes} onContar={(f) => agregar(f, { motivo: 'conteo', fuente: f.fuente, deposito: f.deposito })} />}
          {datos.enAjuste.length > 0 && (
            <Plegable abierto={verEnAjuste} onToggle={() => setVerEnAjuste((v) => !v)} titulo={`Ya están en un ajuste · ${datos.enAjuste.length}`} ayuda="Las que ya se contaron: esperan aprobación o ya cambiaron el stock del ERP. Si mañana siguen sin coincidir, vuelven a la lista.">
              <TablaAContar filas={datos.enAjuste} />
            </Plegable>
          )}
        </SectionCard>
      )}

      {datos && resueltos.length > 0 && (
        <SectionCard title="Últimos ajustes" subtitle="Los aprobados ya cambiaron el stock del ERP; los descartados, no.">
          <TableWrap>
            <THead>
              <Tr><Th>Nº</Th><Th>Motivo</Th><Th>Depósito</Th><Th style={{ textAlign: 'right' }}>Prendas</Th><Th style={{ textAlign: 'right' }}>Neto</Th><Th>Estado</Th><Th>Quién</Th></Tr>
            </THead>
            <TBody>
              {resueltos.map((a) => (
                <Tr key={a.id}>
                  <Td>A-{a.numero}</Td>
                  <Td>{a.motivoNombre}{a.detalle ? <div style={{ fontSize: 12 }}>{a.detalle}</div> : null}</Td>
                  <Td>{deposito(a.deposito)}</Td>
                  <Td style={{ textAlign: 'right' }}>{a.renglones.length}</Td>
                  <Td style={{ textAlign: 'right' }}>{conSigno(a.neto)}</Td>
                  <Td><Badge tone={ESTADO[a.estado]?.tone ?? 'neutral'}>{ESTADO[a.estado]?.label ?? a.estado}</Badge>{a.rechazo ? <div style={{ fontSize: 12 }}>{a.rechazo}</div> : null}</Td>
                  <Td>{a.creadoPor}{a.resueltoPor ? ` · ${a.resueltoPor}` : ''}<div style={{ fontSize: 12 }}>{cuando(a.resueltoEn ?? a.creadoEn)}</div></Td>
                </Tr>
              ))}
            </TBody>
          </TableWrap>
        </SectionCard>
      )}

      {datos && <div><Button variant="outline" onClick={() => setVuelta((n) => n + 1)}>Volver a leer</Button></div>}
    </div>
  )
}

function TablaAContar({ filas, onContar }: { filas: FilaAContar[]; onContar?: (f: FilaAContar) => void }) {
  return (
    <TableWrap>
      <THead>
        <Tr>
          <Th>Prenda</Th><Th>SKU</Th><Th>Por qué</Th>
          <Th style={{ textAlign: 'right' }}>Tienda</Th><Th style={{ textAlign: 'right' }}>ERP</Th><Th style={{ textAlign: 'right' }}>GN</Th>
          <Th style={{ textAlign: 'right' }}>Días</Th><Th />
        </Tr>
      </THead>
      <TBody>
        {filas.map((f) => (
          <Tr key={f.clave}>
            <Td>{prendaDe(f)}</Td>
            <Td>{f.sku ?? '—'}</Td>
            <Td>{f.venta ? `Venta #${f.venta.numero} con PIN${f.venta.autoriza ? ` (${f.venta.autoriza})` : ''}` : `Coincide ${f.donde.join(' y ')} con GN`}</Td>
            <Td style={{ textAlign: 'right' }}>{f.tienda ?? '—'}</Td>
            <Td style={{ textAlign: 'right' }}>{f.erp ?? '—'}</Td>
            <Td style={{ textAlign: 'right' }}>{f.gn ?? '—'}</Td>
            <Td style={{ textAlign: 'right' }}>{f.dias ?? '—'}</Td>
            <Td>{f.ajuste ? `A-${f.ajuste.numero} · ${ESTADO[f.ajuste.estado]?.label ?? f.ajuste.estado}` : onContar ? <Button variant="soft" size="sm" onClick={() => onContar(f)}>Contar</Button> : null}</Td>
          </Tr>
        ))}
      </TBody>
    </TableWrap>
  )
}
