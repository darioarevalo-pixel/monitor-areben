'use client'

/**
 * La pestaña Devolución como SOLICITUD (Darío, 15-oct-2026). Ver `lib/reposicion/solicitud.ts`.
 *
 * - **Propuesta** (sólo Darío y Bruno): lo que sobra en el local, por producto y por prioridad. Se
 *   eligen productos, se ajustan cantidades y se decide si van en bolsa; «Confirmar» los pasa a
 *   Confirmados. Se puede confirmar en varias veces.
 * - **Confirmados**: la solicitud que se está armando. «Cerrar solicitud» muestra el resumen y la
 *   envía al local.
 * - **En el local** (todos): la solicitud enviada, con las etiquetas de bolsa para imprimir ANTES de
 *   juntar y el armado con el lector de siempre.
 */

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { buildSkuGrandePdf, imprimirPdf, type BolsaSku } from '@/lib/etiquetas/pdf'
import { imprimirDevolucion, type FilaDevolver } from '@/lib/reposicion/rollo'
import { enviarSolicitud, guardarConfirmados, leerConfirmados, talle, transferidoDe, articuloDe, type Armado, type LineaPedido } from '@/lib/reposicion/armado'
import type { FilaVentas, LineaZ } from '@/lib/reposicion/porVentas'
import {
  cantidades,
  conBolsa,
  filtrarPropuesta,
  fusionar,
  lineasDe,
  porProducto,
  propuesta,
  resumenSolicitud,
  ROTULO_PRIORIDAD,
  sumarPedidos,
  vendidasPorProducto,
  type GrupoPropuesta,
  type Prioridad,
  type VariantePropuesta,
} from '@/lib/reposicion/solicitud'
import { Button, EmptyState, Modal, Notice, Tabs, TBody, THead, TableWrap, Td, Th, Tr, color, font, space, useToast } from '@/components/ui'

const ABIERTOS = ['en_curso', 'transfiriendo', 'revisar']
const hhmm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '')

/** Las etiquetas de bolsa de 10 × 15 de una solicitud: una por producto que va en bolsa. */
export async function imprimirBolsas(pedido: LineaPedido[], linea: LineaZ): Promise<boolean> {
  const bolsas: BolsaSku[] = porProducto(pedido)
    .filter((p) => p.bolsa)
    .map((p) => ({ producto: p.name, variantes: p.lineas.map((l) => ({ id: l.vid, pid: l.pid, name: l.name, size: l.size, sku: l.sku, barcode: l.barcode, stock: 0 })) }))
  // Zattia: el código de producto con sus barras (el de «Ubicaciones depósito»). BDI: los SKU.
  const pdf = await buildSkuGrandePdf(bolsas, { conClave: linea !== 'bdi' })
  if (!pdf) return false
  imprimirPdf(pdf)
  return true
}

/** El ticket de 80 mm de siempre, con lo que pide la solicitud. */
function imprimirTicket(pedido: LineaPedido[], rotulo: string) {
  const filas = porProducto(pedido).flatMap((p) => p.lineas.map((l) => ({ it: { sku: l.sku, name: l.name, size: l.size }, devolverHoy: l.cant }) as unknown as FilaDevolver))
  return imprimirDevolucion(filas, rotulo)
}

export function SolicitudDevolucion({ linea, rotulo, filas, vv, tnDe, armado, stockViejo, puedeAprobar, bolsaProd, guardarBolsaProd, boton, onEnviada }: {
  linea: LineaZ
  /** «Zattia» / «Stunned»: va en el ticket. */
  rotulo: string
  filas: FilaVentas[]
  /** Ventas por variante en la ventana, también de los talles agotados (no están en `filas`). */
  vv?: Record<string, number>
  /** Alta y precio promocional del producto en Tienda Nube; `null` si no está en la tienda. */
  tnDe: (g: { pid: string; name: string; sku?: string }) => DatoTn | null
  /** El armado de devolución de hoy (o el abierto). */
  armado: Armado | null
  /** El stock es anterior a la última transferencia: lo transferido todavía figura en el local. */
  stockViejo: boolean
  puedeAprobar: boolean
  bolsaProd: Record<string, boolean>
  guardarBolsaProd: (v: Record<string, boolean>) => void
  /** El botón Iniciar / Continuar armado (lo maneja la pantalla de arriba). */
  boton: ReactNode
  /** Se envió una solicitud: la pantalla de arriba vuelve a leer el armado. */
  onEnviada: () => void
}) {
  const toast = useToast()
  const art = articuloDe(linea)
  const [borrador, setBorrador] = useState<Armado | null>(null)
  // La línea cuya solicitud ya se leyó: al cambiar de Zattia a Stunned no se muestra la de la otra.
  const [cargadoDe, setCargadoDe] = useState<LineaZ | null>(null)
  const cargado = cargadoDe === linea
  const [guardando, setGuardando] = useState(false)
  const [sub, setSub] = useState<'propuesta' | 'confirmados'>('propuesta')
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [cant, setCant] = useState<Record<string, number>>({})
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({})
  const [buscar, setBuscar] = useState('')
  const [cerrar, setCerrar] = useState(false)

  useEffect(() => {
    if (!puedeAprobar) return
    let vivo = true
    leerConfirmados(linea)
      .then((b) => vivo && setBorrador(b))
      .catch((e) => vivo && toast.error('No pude leer la solicitud: ' + (e as Error).message))
      .finally(() => vivo && setCargadoDe(linea))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linea, puedeAprobar])

  const enLocal = armado && ABIERTOS.includes(armado.estado) ? armado : null
  // Lo que ya está pedido y el stock todavía no descontó: no se propone dos veces.
  const yaPedido = useMemo(
    () => sumarPedidos(cantidades(borrador?.pedido), enLocal ? cantidades(enLocal.pedido) : armado?.estado === 'transferido' && stockViejo ? transferidoDe(armado.transfer) : {}),
    [borrador, enLocal, armado, stockViejo],
  )
  const vendidasProd = useMemo(() => (vv ? vendidasPorProducto(vv) : undefined), [vv])
  const grupos = useMemo(() => propuesta(filas, yaPedido, vendidasProd), [filas, yaPedido, vendidasProd])
  // Lo elegido sigue elegido aunque el buscador lo esconda: el filtro es sólo de la tabla.
  const visibles = useMemo(() => filtrarPropuesta(grupos, buscar), [grupos, buscar])
  const bolsaDe = (g: { pid: string; name: string; sku?: string }) => conBolsa(g, bolsaProd)
  const cantDe = (v: VariantePropuesta) => Math.min(v.sobra, cant[v.f.it.vid] ?? v.sobra)
  const prendasDe = (g: GrupoPropuesta) => g.variantes.reduce((s, v) => s + cantDe(v), 0)
  const elegidos = grupos.filter((g) => sel[g.pid])
  const prendasElegidas = elegidos.reduce((s, g) => s + prendasDe(g), 0)
  const totalSobra = grupos.reduce((s, g) => s + g.sobra, 0)
  const confirmados = borrador?.pedido ?? []
  const rConf = resumenSolicitud(confirmados)

  const guardar = async (pedido: LineaPedido[], ok?: string) => {
    setGuardando(true)
    try {
      setBorrador(await guardarConfirmados(linea, pedido))
      if (ok) toast.ok(ok)
      return true
    } catch (e) {
      toast.error((e as Error).message)
      return false
    } finally {
      setGuardando(false)
    }
  }

  const onConfirmar = async () => {
    const nuevas = elegidos.flatMap((g) => lineasDe(g, cantDe, bolsaDe(g)))
    if (!nuevas.length) return
    const n = nuevas.reduce((s, l) => s + l.cant, 0)
    if (await guardar(fusionar(confirmados, nuevas), `${n} ${n === 1 ? art.singular : art.plural} confirmadas`)) {
      setSel({})
      setCant({})
    }
  }

  const cambiarBolsa = (pid: string, v: boolean) => {
    guardarBolsaProd({ ...bolsaProd, [pid]: v })
    if (confirmados.some((l) => l.pid === pid)) void guardar(confirmados.map((l) => (l.pid !== pid ? l : v ? { ...l, bolsa: true } : (({ bolsa: _, ...r }) => r)(l))))
  }

  const onEnviar = async () => {
    if (!borrador) return
    setGuardando(true)
    try {
      await enviarSolicitud(linea, borrador.id)
      setBorrador(null)
      setCerrar(false)
      setSub('propuesta')
      toast.ok('Solicitud enviada al local')
      onEnviada()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      {enLocal && <EnElLocal armado={enLocal} linea={linea} rotulo={rotulo} boton={boton} />}

      {!puedeAprobar ? (
        !enLocal && <EmptyState icon="📦" title="No hay solicitudes de devolución" hint="Cuando Darío o Bruno envíen una, aparece acá." dashed />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', margin: `${space[2]}px 0 ${space[3]}px` }}>
            <Tabs
              value={sub}
              onChange={(k) => setSub(k as 'propuesta' | 'confirmados')}
              items={[
                { key: 'propuesta', label: 'Propuesta', badge: totalSobra || undefined },
                { key: 'confirmados', label: 'Confirmados', badge: rConf.prendas || undefined },
              ]}
            />
          </div>

          {!cargado ? null : sub === 'propuesta' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginBottom: space[3] }}>
                <span style={{ fontSize: font.md, color: color.ink2 }}>
                  <b>{totalSobra}</b> {art.plural} sobran en el local · {grupos.length} productos
                </span>
                <input className="mo-input" type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar producto o código…" aria-label="Buscar producto o código" style={{ width: 240 }} />
                <span style={{ marginLeft: 'auto', fontSize: font.md, color: color.ink2 }}>
                  {elegidos.length > 0 && (
                    <>
                      Elegidos: <b>{prendasElegidas}</b> {prendasElegidas === 1 ? art.singular : art.plural} · {elegidos.length} {elegidos.length === 1 ? 'producto' : 'productos'}
                    </>
                  )}
                </span>
                <Button variant="solid" tone="brand" onClick={() => void onConfirmar()} disabled={!elegidos.length} loading={guardando}>
                  Confirmar
                </Button>
              </div>
              {!grupos.length ? (
                <EmptyState icon="🎉" title={`No hay ${art.plural} para devolver`} hint="Ninguna variante supera su stock ideal, o ya está en una solicitud." dashed />
              ) : !visibles.length ? (
                <EmptyState icon="🔍" title="Sin resultados" hint={`Ningún producto coincide con «${buscar.trim()}».`} dashed />
              ) : (
                <TablaPropuesta
                  grupos={visibles}
                  tnDe={tnDe}
                  sel={sel}
                  setSel={setSel}
                  abiertos={abiertos}
                  setAbiertos={setAbiertos}
                  cantDe={cantDe}
                  prendasDe={prendasDe}
                  setCant={(vid, n) => setCant((c) => ({ ...c, [vid]: n }))}
                  bolsaDe={bolsaDe}
                  cambiarBolsa={cambiarBolsa}
                />
              )}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginBottom: space[3] }}>
                <span style={{ fontSize: font.md, color: color.ink2 }}>
                  <b>{rConf.prendas}</b> {art.plural} · {rConf.productos} productos · {rConf.bolsas} con bolsa
                </span>
                <Button variant="solid" tone="brand" style={{ marginLeft: 'auto' }} onClick={() => setCerrar(true)} disabled={!confirmados.length}>
                  Cerrar solicitud
                </Button>
              </div>
              {!confirmados.length ? (
                <EmptyState icon="📋" title="Sin productos confirmados" hint="Elegilos en la Propuesta y tocá Confirmar." dashed />
              ) : (
                <TablaConfirmados
                  pedido={confirmados}
                  onBolsa={cambiarBolsa}
                  onSacar={(pid) => void guardar(confirmados.filter((l) => l.pid !== pid))}
                  guardando={guardando}
                />
              )}
            </>
          )}

          <Modal
            abierto={cerrar}
            onCerrar={() => !guardando && setCerrar(false)}
            titulo="Resumen de la solicitud"
            ancho="ancho"
            pie={
              <>
                <Button variant="ghost" onClick={() => setCerrar(false)} disabled={guardando}>
                  Volver
                </Button>
                <Button variant="solid" tone="brand" onClick={() => void onEnviar()} loading={guardando} disabled={!!enLocal}>
                  Enviar al local
                </Button>
              </>
            }
          >
            {enLocal && (
              <div style={{ marginBottom: space[3] }}>
                <Notice tone="warning" icon="⚠">
                  El local todavía no terminó la solicitud anterior. Esta queda guardada para enviarla después.
                </Notice>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: space[2], marginBottom: space[3] }}>
              <Dato n={rConf.productos} txt="productos" />
              <Dato n={rConf.prendas} txt={art.plural} />
              <Dato n={rConf.bolsas} txt="etiquetas de bolsa" />
              <Dato n={rConf.sueltas} txt={`${art.plural} sueltas al carro`} />
            </div>
            <TableWrap>
              <THead>
                <Tr>
                  <Th>Producto</Th>
                  <Th width={110}>Código</Th>
                  <Th align="center" width={80}>Cant.</Th>
                  <Th width={90}>Va</Th>
                </Tr>
              </THead>
              <TBody>
                {porProducto(confirmados).map((p) => (
                  <Tr key={p.pid}>
                    <Td wrap>{p.name}</Td>
                    <Td style={{ fontSize: font.sm, color: color.mut }}>{p.clave || '—'}</Td>
                    <Td align="center">{p.prendas}</Td>
                    <Td>{p.bolsa ? 'En bolsa' : 'Suelto'}</Td>
                  </Tr>
                ))}
              </TBody>
            </TableWrap>
          </Modal>
        </>
      )}
    </>
  )
}

function Dato({ n, txt }: { n: number; txt: string }) {
  return (
    <div style={{ border: `1px solid ${color.line}`, borderRadius: 'var(--mo-r-xl)', padding: space[3], textAlign: 'center' }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: color.ink }}>{n}</div>
      <div style={{ fontSize: font.sm, color: color.mut }}>{txt}</div>
    </div>
  )
}

/** La solicitud que está en el local: etiquetas primero, después el armado con el lector. */
function EnElLocal({ armado, linea, rotulo, boton }: { armado: Armado; linea: LineaZ; rotulo: string; boton: ReactNode }) {
  const toast = useToast()
  const r = resumenSolicitud(armado.pedido)
  const art = articuloDe(linea)
  const s = armado.transfer?.solicitud
  return (
    <div style={{ border: `1px solid ${color.line}`, borderRadius: 'var(--mo-r-xl)', padding: space[4], marginBottom: space[4] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px' }}>
          <div style={{ fontSize: font.lg, fontWeight: 700, color: color.ink }}>Solicitud de devolución</div>
          <div style={{ fontSize: font.sm, color: color.mut }}>
            {s?.por ? `Enviada por ${s.por}` : 'Enviada'}
            {s?.hora ? ` · ${new Date(s.hora).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })} ${hhmm(s.hora)}` : ''}
          </div>
          <div style={{ fontSize: font.md, color: color.ink2, marginTop: space[1] }}>
            <b>{r.prendas}</b> {art.plural} · {r.productos} productos · {r.bolsas} en bolsa · {r.sueltas} sueltas
          </div>
        </div>
        {r.bolsas > 0 && (
          <Button
            variant="outline"
            onClick={() => void imprimirBolsas(armado.pedido, linea).then((ok) => !ok && toast.aviso('Los productos no tienen SKU: no hay etiquetas para imprimir.'))}
            title="Una etiqueta de 10 × 15 por producto: imprimilas antes de juntar"
          >
            Imprimir etiquetas de bolsa ({r.bolsas})
          </Button>
        )}
        <Button variant="outline" onClick={() => void imprimirTicket(armado.pedido, rotulo)}>
          Imprimir ticket
        </Button>
        {boton}
      </div>
    </div>
  )
}

export type DatoTn = { alta: string | null; promo: boolean }

/** «2026-08-12T…» → «12/08/26». */
const fechaCorta = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—')

function TablaPropuesta({ grupos, tnDe, sel, setSel, abiertos, setAbiertos, cantDe, prendasDe, setCant, bolsaDe, cambiarBolsa }: {
  grupos: GrupoPropuesta[]
  tnDe: (g: GrupoPropuesta) => DatoTn | null
  sel: Record<string, boolean>
  setSel: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  abiertos: Record<string, boolean>
  setAbiertos: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  cantDe: (v: VariantePropuesta) => number
  prendasDe: (g: GrupoPropuesta) => number
  setCant: (vid: string, n: number) => void
  bolsaDe: (g: GrupoPropuesta) => boolean
  cambiarBolsa: (pid: string, v: boolean) => void
}) {
  const secciones = (['sin-ventas', 'con-ventas'] as Prioridad[]).map((p) => ({ p, gs: grupos.filter((g) => g.prioridad === p) })).filter((x) => x.gs.length)
  return (
    <TableWrap>
      <THead>
        <Tr>
          <Th width={36} />
          <Th>Producto</Th>
          <Th width={110}>Código</Th>
          <Th align="center" width={84}>Alta en TN</Th>
          <Th align="center" width={64}>Promo</Th>
          <Th align="center" width={90}>Venta 60 días</Th>
          <Th align="center" width={80}>En el local</Th>
          <Th align="center" width={90}>Semanas de stock</Th>
          <Th align="center" width={80}>Sobran</Th>
          <Th align="center" width={80}>Devolver</Th>
          <Th width={120}>Va</Th>
        </Tr>
      </THead>
      <TBody>
        {secciones.map(({ p, gs }) => {
          const todos = gs.every((g) => sel[g.pid])
          return (
            <Fragment key={p}>
              <Tr>
                <Td colSpan={11} style={{ background: color.bg2, paddingTop: space[2], paddingBottom: space[2] }}>
                  <b style={{ color: color.ink }}>{ROTULO_PRIORIDAD[p]}</b>
                  <span style={{ color: color.mut2, fontSize: font.sm }}> · {gs.length} productos · {gs.reduce((s, g) => s + g.sobra, 0)} prendas</span>
                  <Button size="sm" variant="ghost" style={{ marginLeft: space[2] }} onClick={() => setSel((s) => ({ ...s, ...Object.fromEntries(gs.map((g) => [g.pid, !todos])) }))}>
                    {todos ? 'Sacar todos' : 'Elegir todos'}
                  </Button>
                </Td>
              </Tr>
              {gs.map((g) => {
                const abierto = !!abiertos[g.pid]
                const bolsa = bolsaDe(g)
                const tn = tnDe(g)
                return (
                  <Fragment key={g.pid}>
                    <Tr>
                      <Td align="center">
                        <input type="checkbox" checked={!!sel[g.pid]} onChange={(e) => setSel((s) => ({ ...s, [g.pid]: e.target.checked }))} aria-label={`Elegir ${g.name}`} style={{ accentColor: 'var(--mo-brand-solid)', width: 16, height: 16 }} />
                      </Td>
                      <Td wrap>
                        <button
                          type="button"
                          onClick={() => setAbiertos((a) => ({ ...a, [g.pid]: !abierto }))}
                          style={{ height: 'auto', border: 0, background: 'transparent', padding: 0, cursor: 'pointer', color: color.ink, fontSize: font.md, textAlign: 'left' }}
                          title="Ver las variantes"
                        >
                          {abierto ? '▾' : '▸'} {g.name}
                        </button>
                        {g.cat && <span style={{ color: color.mut2, fontSize: font.sm }}> · {g.cat}</span>}
                      </Td>
                      <Td style={{ fontSize: font.sm, color: color.mut }}>{g.clave || '—'}</Td>
                      <Td align="center" style={{ fontSize: font.sm, color: color.mut }} title={tn ? undefined : 'No está en Tienda Nube'}>{fechaCorta(tn?.alta ?? null)}</Td>
                      <Td align="center" style={{ fontSize: font.sm, color: tn?.promo ? color.ink : color.mut2, fontWeight: tn?.promo ? 600 : 400 }}>{tn ? (tn.promo ? 'Sí' : 'No') : '—'}</Td>
                      <Td align="center" style={{ color: g.vendidas > 0 ? color.success : color.mut2, fontWeight: 600 }}>{g.vendidas}</Td>
                      <Td align="center" style={{ fontWeight: 600 }}>{g.local}</Td>
                      <Td align="center">{g.semanas != null ? g.semanas.toLocaleString('es-AR') : '—'}</Td>
                      <Td align="center">{g.sobra}</Td>
                      <Td align="center" style={{ fontWeight: 700 }}>{prendasDe(g)}</Td>
                      <Td>
                        <BotonBolsa bolsa={bolsa} onChange={(v) => cambiarBolsa(g.pid, v)} />
                      </Td>
                    </Tr>
                    {abierto &&
                      g.variantes.map((v) => (
                        <Tr key={v.f.it.vid}>
                          <Td />
                          <Td style={{ paddingLeft: space[5], color: color.ink2 }}>{talle(v.f.it.size) || 'Única'}</Td>
                          <Td style={{ fontSize: font.sm, color: color.mut }}>{v.f.it.sku || '—'}</Td>
                          <Td />
                          <Td />
                          <Td align="center" style={{ color: color.mut2 }}>{v.f.d.vendidas}</Td>
                          <Td align="center" style={{ color: color.ink2 }}>{v.f.it.local}</Td>
                          <Td />
                          <Td align="center">{v.sobra}</Td>
                          <Td align="center" tall>
                            <input
                              className="mo-input mo-input--num"
                              type="number"
                              min={0}
                              max={v.sobra}
                              inputMode="numeric"
                              value={cantDe(v)}
                              onChange={(e) => setCant(v.f.it.vid, Math.max(0, Math.min(v.sobra, parseInt(e.target.value, 10) || 0)))}
                              aria-label={`Prendas a devolver de ${g.name} ${v.f.it.size}`}
                              style={{ width: 64, textAlign: 'center', padding: '0 6px', fontWeight: 700 }}
                            />
                          </Td>
                          <Td />
                        </Tr>
                      ))}
                  </Fragment>
                )
              })}
            </Fragment>
          )
        })}
      </TBody>
    </TableWrap>
  )
}

function BotonBolsa({ bolsa, onChange, disabled }: { bolsa: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Button size="sm" variant={bolsa ? 'solid' : 'outline'} tone={bolsa ? 'brand' : 'neutral'} onClick={() => onChange(!bolsa)} disabled={disabled} title={bolsa ? 'Va en su bolsa con la etiqueta de 10 × 15. Tocá para que vaya suelto' : 'Va suelto en el carro. Tocá para que vaya en bolsa'}>
      {bolsa ? 'En bolsa' : 'Suelto'}
    </Button>
  )
}

function TablaConfirmados({ pedido, onBolsa, onSacar, guardando }: { pedido: LineaPedido[]; onBolsa: (pid: string, v: boolean) => void; onSacar: (pid: string) => void; guardando: boolean }) {
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({})
  return (
    <TableWrap>
      <THead>
        <Tr>
          <Th>Producto</Th>
          <Th width={110}>Código</Th>
          <Th align="center" width={80}>Cant.</Th>
          <Th width={120}>Va</Th>
          <Th width={90} />
        </Tr>
      </THead>
      <TBody>
        {porProducto(pedido).map((p) => (
          <Fragment key={p.pid}>
            <Tr>
              <Td wrap>
                <button
                  type="button"
                  onClick={() => setAbiertos((a) => ({ ...a, [p.pid]: !a[p.pid] }))}
                  style={{ height: 'auto', border: 0, background: 'transparent', padding: 0, cursor: 'pointer', color: color.ink, fontSize: font.md, textAlign: 'left' }}
                >
                  {abiertos[p.pid] ? '▾' : '▸'} {p.name}
                </button>
              </Td>
              <Td style={{ fontSize: font.sm, color: color.mut }}>{p.clave || '—'}</Td>
              <Td align="center" style={{ fontWeight: 700 }}>{p.prendas}</Td>
              <Td>
                <BotonBolsa bolsa={p.bolsa} onChange={(v) => onBolsa(p.pid, v)} disabled={guardando} />
              </Td>
              <Td align="right">
                <Button size="sm" variant="ghost" onClick={() => onSacar(p.pid)} disabled={guardando} aria-label={`Sacar ${p.name} de la solicitud`}>
                  Sacar
                </Button>
              </Td>
            </Tr>
            {abiertos[p.pid] &&
              p.lineas.map((l) => (
                <Tr key={l.vid}>
                  <Td style={{ paddingLeft: space[5], color: color.ink2 }}>
                    {talle(l.size) || 'Única'}
                    {l.sku && <span style={{ color: color.mut2, fontSize: font.sm }}> · {l.sku}</span>}
                  </Td>
                  <Td />
                  <Td align="center">{l.cant}</Td>
                  <Td />
                  <Td />
                </Tr>
              ))}
          </Fragment>
        ))}
      </TBody>
    </TableWrap>
  )
}

