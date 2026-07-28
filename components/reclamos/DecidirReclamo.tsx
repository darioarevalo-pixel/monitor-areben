'use client'

/**
 * La pantalla donde Administración decide qué se hace con un reclamo, con la evidencia y la
 * cuenta delante. Son **dos decisiones separadas**:
 *
 *  1. **¿Conviene que el producto vuelva?** Es económica y la decidimos nosotros. La cuenta está a
 *     la vista: lo recuperable contra lo que sale el envío de vuelta. El matiz que la hace útil
 *     es que un producto fallado NO vuelve a stock —lo único que se saca de él es venderlo en
 *     feria—, así que se mide contra el PVP de feria y no contra el precio de lista.
 *  2. **Qué recibe el cliente**: la plata entera, una parte, otra unidad igual, o un cupón.
 *
 * La sugerencia no decide sola: se puede pedir el retorno igual, y queda registrado que se fue
 * en contra de la cuenta.
 */

import { useMemo, useState } from 'react'
import {
  Button, Field, Input, Modal, NumberField, Notice, Select, MoneyText, StatusPill,
  color, font, space, weight, useToast,
} from '@/components/ui'
import type { Marca } from '@/lib/nav'
import { decidir } from '@/lib/reclamos/cliente'
import {
  calcularMonto, compensacionesDe, convieneRetorno, costoDelCaso, cuentaDescuento,
  destinoDe, hayEnvio,
  MOTIVO_LABEL, numeroReclamo, pideSeguimiento, puedeVolverLaPrenda, VIA_LABEL,
  admiteDevolucionParcial, devuelveElEnvioDeIda, expectativaLabel, expectativasDe,
  itemsQueFaltaron, tituloExpectativa, type Expectativa,
  type Compensacion, type DestinoPrenda, type ReclamoRow, type ItemReclamo, type OrdenTN,
  type ViaRetorno,
} from '@/lib/reclamos/tipos'

/** Todas las salidas. Cuáles se ofrecen lo decide `compensacionesDe` según lo que pasó. */
const SALIDAS: { key: Compensacion; label: string; ayuda: string }[] = [
  { key: 'plata_total', label: 'Le devolvemos todo', ayuda: 'La devolución clásica.' },
  { key: 'plata_parcial', label: 'Le devolvemos una parte', ayuda: 'Se queda con el producto y un descuento acordado. La salida más barata: ni envío ni reintegro completo.' },
  { key: 'otra_unidad', label: 'Le mandamos otra igual', ayuda: 'No se toca la plata. Sale una unidad de stock.' },
  { key: 'otro_producto', label: 'Lo cambia por otro producto', ayuda: 'El cambio de siempre: elegís lo que se lleva y sale la diferencia de precio.' },
  { key: 'reenvio', label: 'Le mandamos lo que corresponde', ayuda: 'Se despacha lo que faltó o lo correcto. No se toca la plata.' },
  { key: 'cupon', label: 'Le damos un cupón', ayuda: 'Cuesta menos que efectivo y lo retiene. El cupón se genera aparte y se anota acá.' },
  { key: 'ninguna', label: 'Nada', ayuda: 'Se resuelve sin compensación.' },
]

export function DecidirReclamo({
  marca, reclamo, orden, onClose, onListo,
}: {
  marca: Marca
  reclamo: ReclamoRow
  orden?: OrdenTN | null
  onClose: () => void
  onListo: () => void
}) {
  const toast = useToast()
  // Estable entre renders: de estos ítems cuelgan tres useMemo.
  const items = useMemo(() => reclamo.items || [], [reclamo.items])
  const esFalla = reclamo.motivo === 'falla'
  const hayPrendaQueVuelva = puedeVolverLaPrenda(reclamo.motivo)
  const nuncaSalio = !hayPrendaQueVuelva

  /** Solo las salidas que tienen sentido para lo que pasó. */
  const opciones = useMemo(() => {
    const permitidas = compensacionesDe(reclamo.motivo)
    return SALIDAS.filter((s) => permitidas.includes(s.key))
  }, [reclamo.motivo])
  const [compensacion, setCompensacion] = useState<Compensacion>(() => compensacionesDe(reclamo.motivo)[0] || 'plata_total')
  // Arranca con lo que ya se haya cargado en el alta, si es que se cargó.
  const [expectativa, setExpectativa] = useState<Expectativa | ''>(reclamo.expectativa ?? '')
  const [montoAcordado, setMontoAcordado] = useState<number | ''>('')
  /**
   * ¿Se le devuelve el envío de ida? Lo decide el MOTIVO, no quien resuelve: sólo cuando el cliente
   * no recibió nada. Dejarlo a criterio hacía que el mismo caso se resolviera distinto según quién
   * lo tocara.
   */
  const envioDelMotivo = devuelveElEnvioDeIda(reclamo.motivo)

  /**
   * Devolución parcial o total, y quién lo elige.
   *
   * En "no tenemos stock" **decide el cliente**: se le avisa que un producto no salió y contesta si
   * quiere que le devolvamos sólo ése —el resto se despacha— o el pedido entero. Es el único caso
   * del módulo donde la decisión no es nuestra: todavía no recibió nada y no hay nada que evaluar.
   *
   * Sólo se ofrece si hay algo que partir: un pedido de un solo producto, o donde falta todo, no
   * tiene parcial que valga.
   */
  const hayParcial = admiteDevolucionParcial(items)
  const [alcance, setAlcance] = useState<'faltante' | 'todo'>('faltante')
  const itemsADevolver = useMemo(
    () => (hayParcial && alcance === 'faltante' ? itemsQueFaltaron(items) : items),
    [hayParcial, alcance, items],
  )

  /**
   * El envío de ida se devuelve sólo si **no se recibió nada de nada**. En una parcial el resto del
   * pedido sí se despacha, así que el envío se prestó: devolverlo sería regalar plata.
   */
  const devuelveElEnvio = envioDelMotivo && !(hayParcial && alcance === 'faltante')
  const [envioVuelta, setEnvioVuelta] = useState<number | ''>('')
  const [piso, setPiso] = useState<number | ''>('')
  // Solo hace falta para la cuenta cuando el producto está fallada: es lo único que se recupera.
  const [pvpFeria, setPvpFeria] = useState<number | ''>('')
  const [cupon, setCupon] = useState('')
  const [via, setVia] = useState<ViaRetorno>('andreani')
  // El envío del REEMPLAZO: solo existe cuando se le manda otra unidad, y también lo pagamos nosotros.
  const [envioIda, setEnvioIda] = useState<number | ''>('')
  const [guardando, setGuardando] = useState(false)

  /** Cuántas unidades entran en el reclamo: lo que multiplica a los valores por unidad. */
  const unidades = useMemo(() => items.reduce((s, it) => s + (Number(it.cantidad) || 0), 0), [items])

  /** Los ítems con el PVP de feria que se cargue acá, para que la cuenta lo tome. */
  const itemsConFeria: ItemReclamo[] = useMemo(() => {
    const f = Number(pvpFeria)
    if (!isFinite(f) || f <= 0) return items
    return items.map((it) => ({ ...it, pvp_feria: it.pvp_feria ?? f }))
  }, [items, pvpFeria])

  const cuenta = useMemo(
    () => convieneRetorno(itemsConFeria, {
      fallada: esFalla,
      envioVuelta: Number(envioVuelta) || 0,
      piso: Number(piso) || 0,
    }),
    [itemsConFeria, esFalla, envioVuelta, piso],
  )

  // Arranca en lo que sugiere la cuenta; se puede cambiar a mano.
  const [pedirRetorno, setPedirRetorno] = useState<boolean | null>(null)
  const retorno = nuncaSalio ? false : (pedirRetorno ?? cuenta.conviene)

  const monto = useMemo(
    () => calcularMonto(itemsADevolver, orden, {
      devolverEnvio: devuelveElEnvio,
      montoAcordado: compensacion === 'plata_parcial' ? Number(montoAcordado) || 0
        : compensacion === 'otra_unidad' || compensacion === 'ninguna' || compensacion === 'cupon' ? 0
          : null,
    }),
    [itemsADevolver, orden, devuelveElEnvio, compensacion, montoAcordado],
  )

  /** Dónde termina el producto: es lo que después decide si la falla descuenta stock o no. */
  const destino: DestinoPrenda = destinoDe(reclamo.motivo, retorno)

  const costo = useMemo(
    () => costoDelCaso({
      montoDevuelto: monto.total,
      envioVuelta: retorno ? Number(envioVuelta) || 0 : 0,
      envioReemplazo: compensacion === 'otra_unidad' ? Number(envioIda) || 0 : 0,
      items,
      destino: retorno ? destino : 'falla',
    }),
    [monto.total, retorno, envioVuelta, envioIda, compensacion, items, destino],
  )

  const guardar = async () => {
    setGuardando(true)
    try {
      await decidir({
        store: marca,
        id: reclamo.id,
        destino_prenda: destino,
        compensacion,
        monto_producto: monto.producto,
        monto_acordado: compensacion === 'plata_parcial' ? Number(montoAcordado) || 0 : null,
        monto_envio_devuelto: monto.envio,
        monto_total: monto.total,
        devolver_envio: devuelveElEnvio,
        retorno_sugerido: cuenta.conviene,
        retorno_decidido: retorno,
        via_retorno: retorno ? via : null,
        envio_costo: retorno && hayEnvio(via) ? Number(envioVuelta) || null : null,
        envio_ida_costo: compensacion === 'otra_unidad' ? Number(envioIda) || null : null,
        costo_caso: costo,
        cupon_codigo: compensacion === 'cupon' ? cupon.trim() || null : null,
        expectativa: expectativa || null,
        // Techo de seguridad del servidor: nunca se devuelve más de lo que se pagó por la orden.
        techo_orden: orden?.total != null ? Number(orden.total) : null,
      })
      toast.ok(compensacion === 'otro_producto'
        ? 'Decidido. Seguí el cambio desde la pestaña Cambios.'
        : retorno ? 'Decidido. Queda esperando que vuelva el producto.' : 'Decidido.')
      onListo()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  /** Hasta cuánto se puede descontar para que se lo quede, y cuánto conviene ofrecer primero. */
  const descuento = useMemo(
    () => cuentaDescuento({ items: itemsConFeria, fallada: esFalla, envioVuelta: Number(envioVuelta) || 0 }),
    [itemsConFeria, esFalla, envioVuelta],
  )

  const salida = SALIDAS.find((s) => s.key === compensacion)

  return (
    <Modal abierto onCerrar={onClose} titulo={`Decidir ${numeroReclamo(reclamo.id)}`} ancho="ancho">
      <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[3] }}>
        {MOTIVO_LABEL[reclamo.motivo]} · orden #{reclamo.orden_tn || '—'} · {reclamo.cliente || 'sin nombre'}
        {reclamo.pago_metodo ? ` · pagó por ${reclamo.pago_metodo}` : ''}
      </div>

      {/* La evidencia que cargó el cliente por el link. */}
      {!!(reclamo.fotos || []).length && (
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginBottom: space[3] }}>
          {(reclamo.fotos || []).map((f, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={f.url} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 6, border: `1px solid ${color.line}` }} />
          ))}
        </div>
      )}
      {reclamo.relato_cliente && (
        <Notice tone="neutral" style={{ marginBottom: space[3] }}>“{reclamo.relato_cliente}”</Notice>
      )}
      {!(reclamo.fotos || []).length && esFalla && (
        <Notice tone="warning" style={{ marginBottom: space[3] }}>
          Todavía no hay fotos. Si el producto se lo queda el cliente, no vas a poder cerrar el
          reclamo sin al menos una.
        </Notice>
      )}

      {/* Qué quiere el cliente. Se puede completar ACÁ y no sólo al abrir el reclamo: en la
          mayoría de los casos se sabe recién después de escribirle, así que exigirlo en el alta
          era pedir que alguien invente el dato. Es lo que justifica la decisión de abajo. */}
      <Field
        label={tituloExpectativa(reclamo.motivo)}
        hint="lo que pidió el cliente — sirve para ver cuántas veces resolvemos distinto"
        style={{ marginBottom: space[3] }}
      >
        <Select value={expectativa} onChange={(e) => setExpectativa(e.target.value as Expectativa | '')} style={{ maxWidth: 320 }}>
          <option value="">Sin registrar</option>
          {expectativasDe(reclamo.motivo).map((x) => (
            <option key={x} value={x}>{expectativaLabel(x, reclamo.motivo)}</option>
          ))}
        </Select>
      </Field>

      {/* ¿Hasta dónde llega la devolución? Sólo aparece si hay algo que partir: con un solo
          producto, o si falta todo, no hay parcial que valga.

          Los dos montos van a la vista porque es lo que se le va a decir al cliente, y porque el
          total incluye el envío y el parcial no — el resto del pedido sí se despacha, así que ese
          envío se prestó. */}
      {hayParcial && (
        <Field
          label="¿Hasta dónde llega la devolución?"
          hint="lo elige el cliente: todavía no recibió nada"
          style={{ marginBottom: space[3] }}
        >
          <Select value={alcance} onChange={(e) => setAlcance(e.target.value as 'faltante' | 'todo')} style={{ maxWidth: 420 }}>
            <option value="faltante">Sólo lo que no tenemos — el resto se despacha</option>
            <option value="todo">Todo el pedido, más el envío</option>
          </Select>
          <div style={{ fontSize: font.xs, color: color.mut, marginTop: 4 }}>
            {alcance === 'faltante'
              ? <>Se devuelve <b>{itemsQueFaltaron(items).map((i) => i.producto).join(', ')}</b>. El envío no se devuelve: el resto del pedido sale igual.</>
              : <>Se devuelven <b>los {items.length} productos</b> y también el envío que pagó.</>}
          </div>
        </Field>
      )}

      {/* ── 1. ¿Vuelve el producto? ── */}
      {!hayPrendaQueVuelva && (
        <Notice tone="neutral" style={{ marginBottom: space[3] }}>
          {reclamo.motivo === 'no_llego'
            ? 'El pedido se perdió en el camino: no hay producto que vuelva. Queda pendiente el reclamo al transportista.'
            : 'El producto nunca salió del depósito, así que no hay nada que esperar ni etiqueta que emitir.'}
        </Notice>
      )}
      {hayPrendaQueVuelva && (
        <section style={{ marginBottom: space[4] }}>
          <h4 style={{ fontSize: font.md, fontWeight: weight.bold, marginBottom: space[2] }}>¿Pedimos que vuelva el producto?</h4>

          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: space[2] }}>
            <Field label="Envío de vuelta ($)" hint="Total, lo pagamos nosotros">
              <NumberField value={envioVuelta} onChange={(v) => setEnvioVuelta(v)} style={{ width: 120 }} />
            </Field>
            {esFalla && (
              <Field label="PVP de feria por unidad ($)" hint={unidades > 1 ? `Se multiplica por las ${unidades} unidades` : 'Lo único que se saca de un producto fallado'}>
                <NumberField value={pvpFeria} onChange={(v) => setPvpFeria(v)} style={{ width: 120 }} />
              </Field>
            )}
            <Field label="Piso ($)" hint="Nunca pedirlo por debajo">
              <NumberField value={piso} onChange={(v) => setPiso(v)} style={{ width: 110 }} />
            </Field>
          </div>

          <Notice tone={cuenta.conviene ? 'success' : 'warning'}>
            <b>{cuenta.conviene ? 'Conviene pedirlo' : 'No conviene pedirlo'}.</b> {cuenta.motivo}
            {esFalla && (
              <div style={{ fontSize: font.xs, marginTop: 4 }}>
                Se mide contra el PVP de feria porque un producto fallado no vuelve a stock.
              </div>
            )}
          </Notice>

          <div style={{ display: 'flex', gap: space[2], marginTop: space[2] }}>
            <Button variant={retorno ? 'solid' : 'outline'} tone="brand" size="sm" onClick={() => setPedirRetorno(true)}>Que vuelva</Button>
            <Button variant={!retorno ? 'solid' : 'outline'} tone="brand" size="sm" onClick={() => setPedirRetorno(false)}>Que se lo quede</Button>
            {pedirRetorno !== null && pedirRetorno !== cuenta.conviene && (
              <StatusPill tone="warning" label="Va contra la sugerencia" />
            )}
          </div>

          {/* Cómo vuelve. Si la trae al local no hay envío que pagar ni código que seguir, así que
              el costo de arriba deja de tener sentido y se avisa. */}
          {retorno && (
            <div style={{ marginTop: space[3] }}>
              <Field label="¿Cómo vuelve?">
                <Select value={via} onChange={(e) => setVia(e.target.value as ViaRetorno)}>
                  {(Object.keys(VIA_LABEL) as ViaRetorno[]).map((v) => (
                    <option key={v} value={v}>{VIA_LABEL[v]}</option>
                  ))}
                </Select>
              </Field>
              {!hayEnvio(via) && (
                <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 4 }}>
                  Sin envío: no hay etiqueta que pagar ni código que seguir. El reclamo va a decir
                  &quot;Esperando que lo traiga&quot;.
                </div>
              )}
              {pideSeguimiento(via) && (
                <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 4 }}>
                  El código de seguimiento se carga desde la lista, cuando tengas la etiqueta.
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── 2. Qué recibe el cliente ── */}
      <section style={{ marginBottom: space[4] }}>
        <h4 style={{ fontSize: font.md, fontWeight: weight.bold, marginBottom: space[2] }}>¿Qué recibe el cliente?</h4>
        <Field label="Salida">
          <Select value={compensacion} onChange={(e) => setCompensacion(e.target.value as Compensacion)}>
            {opciones.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        </Field>
        {salida && <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 4 }}>{salida.ayuda}</div>}

        {compensacion === 'plata_parcial' && (
          <>
            <Field label="Monto acordado ($)" hint="Lo que se le devuelve para que se lo quede" style={{ marginTop: space[2] }}>
              <NumberField value={montoAcordado} onChange={(v) => setMontoAcordado(v)} style={{ width: 140 }} />
            </Field>
            {/* La cuenta que hace que esto valga la pena: en una falla barata el techo puede superar
                el precio, o sea que regalarlo sale más barato que pedirlo de vuelta. */}
            {!!descuento.techo && (
              <Notice tone={descuento.convieneRegalar ? 'success' : 'neutral'} style={{ marginTop: space[2] }}>
                {descuento.motivo}
                <div style={{ marginTop: 4 }}>
                  Podés ofrecer hasta <b><MoneyText value={descuento.techo} /></b> sin perder.
                  {' '}Sugerido: <b><MoneyText value={descuento.sugerido} /></b>{' '}
                  <Button size="sm" variant="outline" onClick={() => setMontoAcordado(descuento.sugerido)}>Usar</Button>
                </div>
                {Number(montoAcordado) > descuento.techo && (
                  <div style={{ marginTop: 4, color: color.warningInk }}>
                    ⚠️ Te estás pasando del techo: por encima de eso conviene pedirlo de vuelta.
                  </div>
                )}
              </Notice>
            )}
          </>
        )}
        {/* El segundo envío: el que va con el reemplazo. También a nuestro cargo, y suma al costo
            del caso — antes se contaba uno solo y el caso salía más barato de lo que era. */}
        {compensacion === 'otra_unidad' && (
          <Field label="Envío del reemplazo ($)" hint="El que va con la unidad nueva" style={{ marginTop: space[2] }}>
            <NumberField value={envioIda} onChange={(v) => setEnvioIda(v)} style={{ width: 140 }} />
          </Field>
        )}
        {/* El cambio NO se arma acá.
            Un cambio se construye en dos tiempos —se elige qué devuelve y qué se lleva, sale la
            diferencia, se le pasa al cliente, y queda a medio hacer hasta que paga—, y eso no entra
            en un modal que se confirma de una. Lo que hace este paso es dejar registrado que la
            resolución es un cambio; el armado sigue en la pantalla de Cambios, que tiene la grilla,
            el ticket, el envío y la venta en Gestión Nube. */}
        {compensacion === 'otro_producto' && (
          <Notice tone="action" style={{ marginTop: space[2] }}>
            Al confirmar, el reclamo queda listo como <b>cambio</b> y se sigue en la pestaña{' '}
            <b>Cambios</b>: ahí elegís qué se lleva, sale la diferencia, se cobra y se genera la
            venta en Gestión Nube.
            <div style={{ fontSize: font.xs, marginTop: 4 }}>
              Lo que devuelve se le acredita por <b>lo que pagó</b> ({<MoneyText value={monto.producto} />}),
              no a precio de lista.
            </div>
          </Notice>
        )}
        {compensacion === 'cupon' && (
          <Field label="Código del cupón" hint="Generalo en Tienda Nube y anotalo acá" style={{ marginTop: space[2] }}>
            <Input value={cupon} onChange={(e) => setCupon(e.target.value)} style={{ width: 200 }} />
          </Field>
        )}
        {/* El envío de ida NO es una decisión: sale del motivo. Se devuelve sólo cuando el cliente
            no recibió nada —no llegó nunca, no teníamos stock—; en el resto el envío se prestó, el
            paquete llegó, y devolverlo es regalar plata. Antes era un checkbox libre que se podía
            tildar en cualquier caso. */}
        {(compensacion === 'plata_total' || compensacion === 'plata_parcial') && !!orden?.envio_costo_cliente && (
          devuelveElEnvio ? (
            <Notice tone="action" icon="ⓘ" style={{ marginTop: space[2] }}>
              Se le devuelve también <b>el envío que pagó</b> (<MoneyText value={Number(orden.envio_costo_cliente)} />):
              nunca llegó a recibir nada.
            </Notice>
          ) : (
            <div style={{ marginTop: space[2], fontSize: font.xs, color: color.mut2 }}>
              El envío de ida no se devuelve: la devolución es del producto únicamente.
            </div>
          )
        )}
      </section>

      {/* ── Resumen ── */}
      <div style={{ background: color.bg2, borderRadius: 8, padding: space[3], marginBottom: space[3] }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.sm }}>
          <span>Pagó por los productos</span><MoneyText value={monto.producto} />
        </div>
        {!!monto.envio && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.sm }}>
            <span>Envío que se le devuelve</span><MoneyText value={monto.envio} />
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: weight.bold, marginTop: 4 }}>
          <span>Se le devuelve</span><MoneyText value={monto.total} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.xs, color: color.mut, marginTop: 6 }}>
          <span>Lo que nos cuesta el caso (plata + envíos + unidad)</span><MoneyText value={costo} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="solid" tone="brand" onClick={() => void guardar()} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Confirmar la decisión'}
        </Button>
      </div>
    </Modal>
  )
}
