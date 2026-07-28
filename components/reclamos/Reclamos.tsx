'use client'

/**
 * Devoluciones (post-venta). Dos modos, como Cambios:
 *  - **local**: abre el reclamo desde la orden de TN, copia el link para el cliente y mira el
 *    estado. No decide qué se hace ni toca plata.
 *  - **admin**: el motor — revisa la evidencia, decide (§ DecidirReclamo) y cierra los tres
 *    pendientes: la venta anulada en GN, la plata devuelta y el stock corregido en TN.
 *
 * Lo que hay que tener presente al leer esto: **el sistema no anula la venta en Gestión Nube**
 * (GN no lo expone por API) ni reintegra la plata solo. Lo que hace es no dejar que nadie se
 * olvide: lleva los pendientes y no deja cerrar el reclamo hasta que estén.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { BuscarArticuloGN } from '@/components/ui/BuscarArticuloGN'
import { guardarAdminPass, leerAdminPass } from '@/lib/sesion'
import {
  Button, Card, CopyButton, EmptyState, Field, Input, Notice, Select, SectionCard, StatusPill,
  TableWrap, THead, TBody, Tr, Th, Td, MoneyText, Toolbar, Tabs, KpiCard,
  color, font, space, weight, useConfirmar, useToast, type Tone,
} from '@/components/ui'
import {
  buscarOrden, crearReclamo, enriquecerConGN, leerReclamos, linkDelCliente,
  marcarAnulacion, marcarReintegro, marcarStockTn, cambiarEstado, eliminarReclamo,
  ordenTraeDatosDePlata, pasarAFallas, ponerStockCeroEnTn, descontarReemplazo, editarReclamo,
} from '@/lib/reclamos/cliente'
import {
  calcularMonto, esCambio, estadoEnCriollo, faltantesParaCerrar, laFallaDescuentaStock, MOTIVO_LABEL,
  MOTIVOS_VIGENTES, numeroReclamo, pagadoPorItem, pideSeguimiento, VIA_LABEL, EXPECTATIVA_LABEL,
  alertasDe, conAlerta,
  type Expectativa,
  type ReclamoRow, type EstadoReclamo, type ItemReclamo, type MotivoReclamo, type OrdenTN,
} from '@/lib/reclamos/tipos'
import { mensajeApertura, mensajeResolucion, mensajeSeguimiento } from '@/lib/reclamos/mensajes'
import { DecidirReclamo } from './DecidirReclamo'
import { DondeVa, Instructivo } from '@/components/postventa/GuiaPostventa'

/** Contraseña del Monitor para escribir en GN (cacheada; se pide una vez). Igual que Post-venta. */
function obtenerPass(): string {
  let p = leerAdminPass()
  if (!p) {
    p = (typeof window !== 'undefined' ? window.prompt('Ingresá tu contraseña del Monitor (para descontar el stock en GN):') || '' : '').trim()
    if (p) guardarAdminPass(p)
  }
  return p
}

const ESTADO_TONE: Record<EstadoReclamo, Tone> = {
  borrador: 'neutral',
  esperando_cliente: 'warning',
  en_revision: 'action',
  resuelto: 'brand',
  en_transito: 'action',
  recibido: 'brand',
  cerrado: 'success',
  anulado: 'neutral',
}

// Los siete motivos vigentes salen de `MOTIVOS_VIGENTES`: una sola fuente, así no se
// desincroniza con lo que acepta el servidor.

/** Los estados que siguen pidiendo algo de alguien. */
const ABIERTOS: EstadoReclamo[] = ['borrador', 'esperando_cliente', 'en_revision', 'resuelto', 'en_transito', 'recibido']

function ReclamosInner({ modo }: { modo: 'local' | 'admin' }) {
  const { marca, perfil } = useSesion()
  const esAdmin = modo === 'admin'
  const toast = useToast()
  const { confirmar, pedirTexto } = useConfirmar()

  const [filas, setFilas] = useState<ReclamoRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'abiertos' | 'dormidos' | 'todos'>('abiertos')
  const [decidiendo, setDecidiendo] = useState<ReclamoRow | null>(null)

  // ── Alta ──
  const [numero, setNumero] = useState('')
  const [orden, setOrden] = useState<OrdenTN | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [elegidos, setElegidos] = useState<Set<number>>(new Set())
  const [motivo, setMotivo] = useState<MotivoReclamo>('falla')
  const [detalle, setDetalle] = useState('')
  const [expectativa, setExpectativa] = useState<Expectativa>('plata')
  /** Solo en "pedido mal armado": lo que el cliente TENDRÍA que haber recibido. */
  const [correctos, setCorrectos] = useState<ItemReclamo[]>([])
  const [guardando, setGuardando] = useState(false)

  const recargar = useCallback(async () => {
    setCargando(true); setError(null)
    try { setFilas(await leerReclamos(marca)) } catch (e) { setError((e as Error).message) } finally { setCargando(false) }
  }, [marca])

  // El setState va DENTRO del await, no en el cuerpo del effect: el linter del repo rechaza el
  // setState síncrono en un effect (dispara renders en cascada). Mismo patrón que Cambios.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const d = await leerReclamos(marca)
        if (vivo) setFilas(d)
      } catch (e) {
        if (vivo) setError((e as Error).message)
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [marca])

  const buscar = async () => {
    const n = numero.trim()
    if (!n) return
    setBuscando(true); setOrden(null); setElegidos(new Set())
    try {
      const o = await buscarOrden(marca, n)
      if (!o) {
        toast.aviso('No se encontró esa orden. Ojo: solo se encuentran las recientes.')
      } else {
        setOrden(o)
        // Casi siempre se devuelve todo: se arranca con todo tildado y se destilda lo que no.
        setElegidos(new Set((o.products || []).map((_, i) => i)))
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBuscando(false)
    }
  }

  /** Los ítems tildados, ya con lo que se pagó por cada uno (descuentos prorrateados). */
  const items: ItemReclamo[] = useMemo(() => {
    if (!orden) return []
    return (orden.products || [])
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => elegidos.has(i))
      .map(({ p }) => ({
        sku: p.sku ?? null,
        // Los ids de TN: son los que sirven para corregir el stock de la tienda. Los de GN los
        // completa `enriquecerConGN` cruzando por SKU, y son otros.
        tn_product_id: p.product_id == null ? null : String(p.product_id),
        variant_id: p.variant_id == null ? null : String(p.variant_id),
        producto: p.name || 'Sin nombre',
        cantidad: p.quantity ?? 1,
        precio: p.price ?? null,
        pagado: pagadoPorItem({ precio: p.price, cantidad: p.quantity ?? 1 }, orden),
      }))
  }, [orden, elegidos])

  const monto = useMemo(() => calcularMonto(items, orden), [items, orden])
  const conPlata = ordenTraeDatosDePlata(orden)

  const crear = async () => {
    if (!orden || !items.length) return
    setGuardando(true)
    try {
      // Antes de guardar se buscan los ids de GN por SKU: sin ellos no se puede crear la falla
      // ni corregir stock más adelante.
      const conGN = await enriquecerConGN(marca, items)
      const { token } = await crearReclamo({
        store: marca,
        orden_tn: String(orden.number),
        cliente: orden.cliente ?? null,
        motivo,
        motivo_detalle: detalle.trim() || null,
        items: conGN,
        monto_producto: monto.producto,
        pago_metodo: orden.pago_metodo ?? null,
        pago_gateway: orden.pago_gateway ?? null,
        expectativa,
        items_correctos: motivo === 'mal_armado' ? correctos : [],
      })
      // Si ya dijo que quiere cambiarlo, no hay nada que fotografiar ni nada que evaluar: pedirle
      // fotos es mandarlo a un trámite que no existe. El link sigue disponible en la lista por si
      // igual hace falta.
      if (expectativa === 'otro_producto') {
        toast.ok('Reclamo creado. Armá el cambio desde la pestaña Cambios.')
      } else {
        await navigator.clipboard?.writeText(linkDelCliente(token)).catch(() => {})
        toast.ok('Reclamo creado. El link para el cliente quedó copiado.')
      }
      setOrden(null); setNumero(''); setElegidos(new Set()); setDetalle(''); setCorrectos([])
      void recargar()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  // ── Acciones de la lista ──
  const accion = async (fn: () => Promise<void>, ok: string) => {
    try { await fn(); toast.ok(ok); void recargar() } catch (e) { toast.error((e as Error).message) }
  }

  const anular = async (d: ReclamoRow) => {
    const si = await confirmar({
      titulo: 'Venta anulada en Gestión Nube',
      ok: 'Sí, ya la anulé',
      mensaje: `¿Ya anulaste a mano la venta ${d.gn_venta_number || d.gn_venta_id || 'original'} en GN? El sistema no puede hacerlo por API: esto solo deja registrado que se hizo.`,
    })
    if (si) await accion(() => marcarAnulacion(marca, d.id), 'Anotado: la venta quedó anulada.')
  }

  const reintegrar = async (d: ReclamoRow) => {
    const si = await confirmar({
      titulo: 'Plata devuelta',
      ok: 'Sí, ya se la devolví',
      mensaje: `¿Ya le devolviste ${d.monto_total ?? d.monto_producto ?? 0} a ${d.cliente || 'el cliente'}${d.pago_metodo ? ` por ${d.pago_metodo}` : ''}?`,
    })
    if (si) await accion(() => marcarReintegro(marca, d.id), 'Anotado: la plata quedó devuelta.')
  }

  /**
   * Manda el producto al ledger de Fallas. El aviso dice si va a descontar stock o no, porque es
   * la diferencia que después no se ve: si se le mandó otra unidad al cliente, ese producto ya
   * salió del stock con la venta original y descontarla de nuevo restaría dos veces.
   */
  const aFallas = async (d: ReclamoRow) => {
    const descuenta = laFallaDescuentaStock(d.compensacion)
    const si = await confirmar({
      titulo: 'Pasar al depósito de fallas',
      ok: 'Pasar a Fallas',
      mensaje: descuenta
        ? 'Se crea la falla con el vínculo a Gestión Nube: al confirmarla vas a descontar la unidad del stock (volvió al anular la venta, pero está fallada).'
        : 'Se crea la falla SIN vínculo a Gestión Nube: esa unidad ya salió del stock con la venta original, así que no hay que descontarla de nuevo.',
    })
    if (!si) return
    try {
      const ids = await pasarAFallas(marca, d, { usuario: perfil?.name })
      toast.ok(`${ids.length} falla${ids.length === 1 ? '' : 's'} en el depósito.`)
      void recargar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /** Corrige el stock en la tienda: es lo que evita que el próximo cliente compre lo mismo. */
  const ponerEnCero = async (d: ReclamoRow) => {
    const si = await confirmar({
      titulo: 'Poner el stock en 0 en Tienda Nube',
      tono: 'danger',
      ok: 'Poner en 0',
      mensaje: `Se escribe en la tienda EN VIVO: ${(d.items || []).map((i) => i.producto).join(', ')}. Es lo que evita que se vuelva a vender algo que no hay.`,
    })
    if (!si) return
    try {
      const n = await ponerStockCeroEnTn(marca, d.items || [])
      await marcarStockTn(marca, d.id)
      toast.ok(`${n} variante${n === 1 ? '' : 's'} en 0 en Tienda Nube.`)
      void recargar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /** El código de seguimiento, cuando ya se emitió la etiqueta. */
  const cargarSeguimiento = async (d: ReclamoRow) => {
    const codigo = await pedirTexto('Código de seguimiento de la vuelta', d.seguimiento_vuelta || '', {
      titulo: `Seguimiento — ${VIA_LABEL[d.via_retorno || 'andreani']}`,
      ok: 'Guardar',
    })
    if (codigo === null) return
    await accion(() => editarReclamo(marca, d.id, { seguimiento_vuelta: codigo.trim() || null }), 'Seguimiento guardado.')
  }

  /**
   * Descuenta del stock la unidad que se le manda al cliente. Es lo que evita que ese producto salga
   * del depósito sin quedar registrada en ningún lado.
   */
  const descontarLaQueVa = async (d: ReclamoRow) => {
    const si = await confirmar({
      titulo: 'Descontar el reemplazo del stock',
      tono: 'warning',
      ok: 'Descontar en GN',
      mensaje: `Se crea la venta técnica en Gestión Nube que saca del depósito ${(d.items || []).map((i) => `${i.cantidad} × ${i.producto}`).join(', ')}. Neto $0: el cliente ya lo pagó en la compra original.`,
    })
    if (!si) return
    const pass = obtenerPass()
    if (!pass) { toast.aviso('Sin la contraseña no se puede escribir la venta en GN.'); return }
    try {
      const v = await descontarReemplazo(marca, d, { user: perfil?.name || '', pass })
      toast.ok(v.number ? `Stock descontado (venta ${v.number} en GN).` : 'Stock descontado en GN.')
      void recargar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /** El número de reclamo al transportista: es lo que después permite reclamar esa plata. */
  const cargarReclamoCorreo = async (d: ReclamoRow) => {
    const nro = await pedirTexto('Número de reclamo al transportista', d.reclamo_correo || '', {
      titulo: 'Reclamo al correo',
      ok: 'Guardar',
      placeholder: 'El número que te dio Andreani / Correo',
    })
    if (nro === null) return
    const limpio = nro.trim()
    await accion(
      () => editarReclamo(marca, d.id, { reclamo_correo: limpio || null, reclamo_correo_estado: limpio ? 'hecho' : 'pendiente' }),
      limpio ? 'Reclamo al correo anotado.' : 'Queda pendiente.',
    )
  }

  const cerrar = async (d: ReclamoRow) => {
    const faltan = faltantesParaCerrar(d)
    if (faltan.length) { toast.aviso(`Falta ${faltan.join(', ')}.`); return }
    await accion(() => cambiarEstado(marca, d.id, 'cerrado'), 'Reclamo cerrado.')
  }

  const visibles = useMemo(() => {
    if (filtro === 'todos') return filas
    const abiertos = filas.filter((f) => ABIERTOS.includes(f.estado))
    return filtro === 'dormidos' ? abiertos.filter((f) => alertasDe(f).length > 0) : abiertos
  }, [filas, filtro])

  const totales = useMemo(() => {
    const abiertos = filas.filter((f) => ABIERTOS.includes(f.estado))
    return {
      abiertos: abiertos.length,
      dormidos: conAlerta(abiertos),
      plata: abiertos.filter((f) => f.reintegro_estado === 'pendiente').reduce((s, f) => s + (f.monto_total || 0), 0),
      sinAnular: abiertos.filter((f) => f.stock_estado === 'pendiente').length,
    }
  }, [filas])

  return (
    <div style={{ maxWidth: 1100 }}>
      {decidiendo && (
        <DecidirReclamo
          marca={marca} reclamo={decidiendo} orden={orden}
          onClose={() => setDecidiendo(null)}
          onListo={() => { setDecidiendo(null); void recargar() }}
        />
      )}

      {esAdmin && (
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', marginBottom: space[4] }}>
          <KpiCard label="Reclamos abiertos" value={String(totales.abiertos)} />
          <KpiCard label="Plata sin devolver" value={<MoneyText value={totales.plata} />} tone="warning" />
          <KpiCard label="Ventas sin anular en GN" value={String(totales.sinAnular)} tone={totales.sinAnular ? 'warning' : 'neutral'} />
          <KpiCard label="Durmiendo" value={String(totales.dormidos)} sub="sin moverse hace días" tone={totales.dormidos ? 'danger' : 'neutral'} />
        </div>
      )}

      <DondeVa activa="reclamos" />
      <Instructivo
        titulo={esAdmin ? '¿Cómo se resuelve una devolución de punta a punta?' : '¿Cómo abro una devolución?'}
        pasos={esAdmin ? [
          <>Buscá la <b>orden de Tienda Nube</b> por número, tildá los productos que reclama y elegí el <b>motivo</b>.</>,
          <>Al crear el reclamo se copia solo el <b>link para el cliente</b>: pegáselo por WhatsApp para que suba las fotos.</>,
          <>Cuando cargue, el reclamo pasa a <b>Para revisar</b>. Tocá <b>Decidir</b> y respondé las dos preguntas: si nos conviene que el producto vuelva, y qué recibe el cliente.</>,
          <>Si vuelve, elegí <b>cómo vuelve</b> y cargá el <b>seguimiento</b> cuando tengas la etiqueta. Cuando llegue, <b>Volvió</b>.</>,
          <>Cerrá los pendientes que queden: <b>anular la venta en GN</b> (a mano), <b>devolver la plata</b>, y si hace falta <b>corregir el stock en TN</b> o <b>pasar el producto a Fallas</b>.</>,
          <>Con todo resuelto, <b>Cerrar</b>.</>,
        ] : [
          <>Buscá la <b>orden de Tienda Nube</b> por número y tildá los productos que reclama.</>,
          <>Elegí el <b>motivo</b> y escribí en el detalle lo que te dijo el cliente.</>,
          <>Al crear, el <b>link queda copiado</b>: pegáselo por WhatsApp para que suba las fotos del problema.</>,
          <>Listo. Desde acá seguís el estado; <b>Administración</b> decide qué se hace y devuelve la plata.</>,
        ]}
        ojo={esAdmin
          ? <>El sistema <b>no anula la venta en Gestión Nube</b> ni devuelve la plata solo: eso lo hacés vos y acá queda la traza. El reclamo no cierra hasta que estén los tres pendientes.</>
          : <>No cierres el reclamo ni prometas un monto: la plata la calcula y la devuelve Administración.</>}
      />

      {!esAdmin && (
        <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[3] }}>
          Abrí el reclamo desde la orden y pasale el link al cliente para que suba las fotos.
          <b> Administración</b> decide qué se hace y devuelve la plata.
        </div>
      )}

      {/* ── Alta ── */}
      <SectionCard title="Nuevo reclamo" style={{ marginBottom: space[4] }}>
        <Toolbar>
          <Field label="Número de orden de Tienda Nube">
            <Input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void buscar() }}
              placeholder="20700"
              style={{ width: 160 }}
            />
          </Field>
          <Button variant="outline" onClick={() => void buscar()} disabled={buscando || !numero.trim()}>
            {buscando ? 'Buscando…' : 'Buscar'}
          </Button>
        </Toolbar>

        {orden && (
          <div style={{ marginTop: space[3] }}>
            <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[2] }}>
              Orden <b>#{String(orden.number)}</b> · {orden.cliente || 'sin nombre'}
              {orden.fecha ? ` · ${new Date(orden.fecha).toLocaleDateString('es-AR')}` : ''}
              {orden.pago_metodo ? ` · pagó por ${orden.pago_metodo}` : ''}
            </div>

            {!conPlata && (
              <Notice tone="warning" style={{ marginBottom: space[2] }}>
                Esta orden no trajo los datos de pago, así que el monto a devolver hay que cargarlo
                a mano al decidir.
              </Notice>
            )}

            <TableWrap>
              <THead>
                <Tr>
                  <Th style={{ width: 34 }}></Th>
                  <Th>Producto</Th>
                  <Th align="right">Cant.</Th>
                  <Th align="right">Precio</Th>
                  <Th align="right">Pagó</Th>
                </Tr>
              </THead>
              <TBody>
                {(orden.products || []).map((p, i) => {
                  const pagado = pagadoPorItem({ precio: p.price, cantidad: p.quantity ?? 1 }, orden)
                  const lista = Number(p.price || 0) * Number(p.quantity || 1)
                  return (
                    <Tr key={i}>
                      <Td>
                        <input
                          type="checkbox"
                          checked={elegidos.has(i)}
                          onChange={(e) => setElegidos((prev) => {
                            const n = new Set(prev)
                            if (e.target.checked) n.add(i); else n.delete(i)
                            return n
                          })}
                        />
                      </Td>
                      <Td>
                        <div style={{ fontWeight: weight.semibold }}>{p.name}</div>
                        <div style={{ fontSize: font.xs, color: color.mut2 }}>{p.sku}</div>
                      </Td>
                      <Td align="right">{p.quantity}</Td>
                      <Td align="right"><MoneyText value={lista} /></Td>
                      <Td align="right">
                        <MoneyText value={pagado} />
                        {/* Lo que se le devolvería de más si se usara el precio de lista. */}
                        {pagado < lista && (
                          <div style={{ fontSize: font.xs, color: color.mut2 }}>−{Math.round(lista - pagado)} de desc.</div>
                        )}
                      </Td>
                    </Tr>
                  )
                })}
              </TBody>
            </TableWrap>

            <Toolbar style={{ marginTop: space[3] }}>
              <Field label="Motivo">
                <Select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoReclamo)}>
                  {MOTIVOS_VIGENTES.map((m) => <option key={m} value={m}>{MOTIVO_LABEL[m]}</option>)}
                </Select>
              </Field>
              <Field label="Detalle (opcional)" style={{ flex: 1, minWidth: 220 }}>
                <Input value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Qué dijo el cliente" />
              </Field>
              <Field label="¿Qué esperaba?" hint="Para poder ver después cuántas veces resolvimos distinto">
                <Select value={expectativa} onChange={(e) => setExpectativa(e.target.value as Expectativa)}>
                  {(Object.keys(EXPECTATIVA_LABEL) as Expectativa[]).map((x) => (
                    <option key={x} value={x}>{EXPECTATIVA_LABEL[x]}</option>
                  ))}
                </Select>
              </Field>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontSize: font.xs, color: color.mut }}>Pagó por lo tildado</div>
                <div style={{ fontSize: font.lg, fontWeight: weight.bold }}><MoneyText value={monto.producto} /></div>
              </div>
            </Toolbar>

            {/* En "pedido mal armado" hay DOS productos: el que recibió (arriba, tildado de la
                orden) y el que tendría que haber recibido. Sin el segundo no se puede saber qué
                stock hay que corregir. */}
            {motivo === 'mal_armado' && (
              <Card padding={3} style={{ marginTop: space[3] }}>
                <div style={{ fontSize: font.sm, fontWeight: weight.semibold, marginBottom: space[2] }}>
                  ¿Qué tendría que haber recibido?
                </div>
                <BuscarArticuloGN marca={marca} mostrarCosto={false} onSelect={(a) => setCorrectos((prev) => [...prev, {
                  producto: a.product_name || 'Sin nombre', sku: a.sku, variante: a.size_name,
                  cantidad: 1, product_id: a.product_id, size_id: a.size_id,
                  precio: a.retailer_price ?? null, costo: a.unit_cost ?? null,
                }])} />
                {!!correctos.length && (
                  <div style={{ marginTop: space[2], fontSize: font.sm }}>
                    {correctos.map((c, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                        <span>{c.cantidad}× {c.producto}{c.variante ? ` (${c.variante})` : ''}</span>
                        <Button size="sm" variant="ghost" onClick={() => setCorrectos((prev) => prev.filter((_, j) => j !== i))}>Quitar</Button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            <Button variant="solid" tone="brand" onClick={() => void crear()} disabled={guardando || !items.length} style={{ marginTop: space[2] }}>
              {guardando ? 'Creando…' : `Crear reclamo (${items.length} ítem${items.length === 1 ? '' : 's'})`}
            </Button>
          </div>
        )}
      </SectionCard>

      {/* ── Lista ── */}
      <Toolbar justify="between" style={{ marginBottom: space[3] }}>
        <Tabs
          variant="underline" value={filtro} onChange={(k) => setFiltro(k as 'abiertos' | 'dormidos' | 'todos')}
          items={[
            { key: 'abiertos', label: 'Abiertos' },
            { key: 'dormidos', label: totales.dormidos ? `Durmiendo (${totales.dormidos})` : 'Durmiendo' },
            { key: 'todos', label: 'Todos' },
          ]}
        />
        <Button variant="outline" onClick={() => void recargar()} disabled={cargando}>Recargar</Button>
      </Toolbar>

      {error && <Notice tone="danger">{error}</Notice>}

      {!cargando && !visibles.length ? (
        <Card padding={4}>
          <EmptyState title="No hay reclamos" hint="Buscá una orden arriba para abrir el primero." />
        </Card>
      ) : (
        <TableWrap>
          <THead>
            <Tr>
              <Th>Reclamo</Th>
              <Th>Motivo</Th>
              <Th>Estado</Th>
              <Th align="right">A devolver</Th>
              <Th>Pendientes</Th>
              <Th></Th>
            </Tr>
          </THead>
          <TBody>
            {visibles.map((d) => {
              const faltan = faltantesParaCerrar(d)
              return (
                <Tr key={d.id}>
                  <Td>
                    <div style={{ fontWeight: weight.semibold }}>{numeroReclamo(d.id)}</div>
                    <div style={{ fontSize: font.xs, color: color.mut2 }}>
                      {d.orden_tn ? `#${d.orden_tn}` : '—'} · {d.cliente || 'sin nombre'}
                    </div>
                    {/* Lo que está durmiendo. Solo la primera: la lista ya es larga y la más
                        urgente viene primero. */}
                    {alertasDe(d).slice(0, 1).map((a, i) => (
                      <div key={i} style={{ fontSize: font.xs, fontWeight: weight.semibold, color: a.tono === 'danger' ? color.dangerInk : color.warningInk, marginTop: 2 }}>
                        ⏱ {a.texto}
                      </div>
                    ))}
                  </Td>
                  <Td>
                    {MOTIVO_LABEL[d.motivo] || d.motivo}
                    {/* La lista es una sola —Administración les hace el seguimiento a todos—, así
                        que el cambio tiene que distinguirse sin abrirlo: se resuelve en otra
                        pantalla y sus pendientes son otros. */}
                    {esCambio(d) && (
                      <div style={{ marginTop: 2 }}><StatusPill tone="action" label="Cambio" dot={false} /></div>
                    )}
                  </Td>
                  <Td><StatusPill tone={ESTADO_TONE[d.estado]} label={estadoEnCriollo(d)} /></Td>
                  <Td align="right"><MoneyText value={d.monto_total ?? d.monto_producto ?? 0} /></Td>
                  <Td>
                    <div style={{ fontSize: font.xs, color: faltan.length ? color.warning : color.mut2 }}>
                      {faltan.length ? faltan.join(' · ') : 'nada'}
                    </div>
                  </Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {/* El link se puede volver a copiar mientras el reclamo siga abierto. */}
                      {/* El mensaje entero, no el link pelado: si solo se copia el link, alguien
                          tiene que escribir el texto alrededor y ahí cada uno promete algo distinto. */}
                      {ABIERTOS.includes(d.estado) && (
                        <CopyButton
                          getText={() => mensajeApertura(d, numeroReclamo(d.id), linkDelCliente(d.token || String(d.id)))}
                          label="Msj: pedir fotos"
                        />
                      )}
                      {d.compensacion && (
                        <CopyButton
                          getText={() => mensajeResolucion(d, numeroReclamo(d.id))}
                          label="Msj: resolución"
                          tone="brand"
                        />
                      )}
                      {d.seguimiento_vuelta && (
                        <CopyButton getText={() => mensajeSeguimiento(d, numeroReclamo(d.id), 'etiqueta')} label="Msj: etiqueta" tone="neutral" />
                      )}
                      {d.reintegro_estado === 'hecho' && (
                        <CopyButton getText={() => mensajeSeguimiento(d, numeroReclamo(d.id), 'plata')} label="Msj: plata enviada" tone="neutral" />
                      )}
                      {/* Un cambio ya está decidido por definición: lo que falta es armarlo, y eso
                          vive en la pestaña Cambios. Ofrecer "Decidir" acá invita a resolverlo dos
                          veces. */}
                      {esAdmin && !esCambio(d) && (d.estado === 'en_revision' || d.estado === 'borrador' || d.estado === 'esperando_cliente') && (
                        <Button size="sm" variant="solid" tone="brand" onClick={() => setDecidiendo(d)}>Decidir</Button>
                      )}
                      {esAdmin && esCambio(d) && d.estado !== 'cerrado' && (
                        <span style={{ fontSize: font.xs, color: color.mut2, alignSelf: 'center' }}>se sigue en Cambios</span>
                      )}
                      {/* El seguimiento se carga acá, cuando ya tenés la etiqueta en la mano — no
                          al decidir, que es cuando todavía no existe. Solo para correo/andreani:
                          el cadete y el "la trae al local" no tienen nada que rastrear. */}
                      {esAdmin && pideSeguimiento(d.via_retorno) && d.estado === 'en_transito' && (
                        <Button size="sm" variant="outline" onClick={() => void cargarSeguimiento(d)}>
                          {d.seguimiento_vuelta ? 'Cambiar código' : 'Cargar seguimiento'}
                        </Button>
                      )}
                      {esAdmin && d.estado === 'en_transito' && (
                        <Button size="sm" variant="outline" onClick={() => void accion(() => cambiarEstado(marca, d.id, 'recibido'), 'Marcado como recibido.')}>Volvió</Button>
                      )}
                      {esAdmin && d.stock_estado === 'pendiente' && (
                        <Button size="sm" variant="outline" onClick={() => void anular(d)}>Anulé en GN</Button>
                      )}
                      {esAdmin && d.reintegro_estado === 'pendiente' && (
                        <Button size="sm" variant="outline" onClick={() => void reintegrar(d)}>Devolví la plata</Button>
                      )}
                      {/* Plata recuperable: sin este pendiente, un pedido perdido se cierra y el
                          reclamo al correo no lo hace nadie. */}
                      {esAdmin && d.reclamo_correo_estado === 'pendiente' && (
                        <Button size="sm" variant="outline" onClick={() => void cargarReclamoCorreo(d)}>
                          {d.reclamo_correo ? 'Reclamo al correo ✓' : 'Reclamo al correo'}
                        </Button>
                      )}
                      {esAdmin && d.tn_stock_estado === 'pendiente' && (
                        <Button size="sm" variant="outline" onClick={() => void ponerEnCero(d)}>Poner en 0 en TN</Button>
                      )}
                      {/* Sale una unidad de stock y hasta que no se haga, GN dice que sigue estando. */}
                      {esAdmin && d.compensacion === 'otra_unidad' && !d.gn_venta_reemplazo_id && (
                        <Button size="sm" variant="solid" tone="warning" onClick={() => void descontarLaQueVa(d)}>Descontar reemplazo</Button>
                      )}
                      {esAdmin && d.destino_prenda === 'falla' && !(d.falla_ids || []).length && (d.estado === 'recibido' || d.estado === 'resuelto') && (
                        <Button size="sm" variant="outline" onClick={() => void aFallas(d)}>Pasar a Fallas</Button>
                      )}
                      {!!(d.falla_ids || []).length && (
                        <span style={{ fontSize: font.xs, color: color.mut2, alignSelf: 'center' }}>en Fallas</span>
                      )}
                      {esAdmin && ABIERTOS.includes(d.estado) && !faltan.length && (
                        <Button size="sm" variant="solid" tone="success" onClick={() => void cerrar(d)}>Cerrar</Button>
                      )}
                      {esAdmin && (
                        <Button
                          size="sm" variant="ghost"
                          onClick={async () => {
                            const si = await confirmar({ titulo: 'Borrar el reclamo', tono: 'danger', ok: 'Borrar', mensaje: 'Se borra el registro. No anula nada de lo que ya se haya hecho en GN.' })
                            if (si) await accion(() => eliminarReclamo(marca, d.id), 'Reclamo borrado.')
                          }}
                        >Borrar</Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              )
            })}
          </TBody>
        </TableWrap>
      )}

      {esAdmin && !!totales.sinAnular && (
        <Notice tone="warning" style={{ marginTop: space[3] }}>
          Hay {totales.sinAnular} venta{totales.sinAnular === 1 ? '' : 's'} sin anular en Gestión Nube.
          Mientras no se anulen, esas ventas siguen contando y el stock no vuelve.
        </Notice>
      )}
      {perfil && !esAdmin && (
        <div style={{ fontSize: font.xs, color: color.mut2, marginTop: space[3] }}>
          La plata la devuelve Administración.
        </div>
      )}
    </div>
  )
}

export function Devoluciones() { return <ReclamosInner modo="admin" /> }
export function ReclamosLocal() { return <ReclamosInner modo="local" /> }
