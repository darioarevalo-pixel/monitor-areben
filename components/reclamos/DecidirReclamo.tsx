'use client'

/**
 * La pantalla donde Administración decide qué se hace con un reclamo, con la evidencia y la
 * cuenta delante. Son **dos decisiones separadas**:
 *
 *  1. **¿Conviene que la prenda vuelva?** Es económica y la decidimos nosotros. La cuenta está a
 *     la vista: lo recuperable contra lo que sale el envío de vuelta. El matiz que la hace útil
 *     es que una prenda fallada NO vuelve a stock —lo único que se saca de ella es venderla en
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
  calcularMonto, compensacionesDe, convieneRetorno, costoDelCaso, cuentaDescuento, destinoDe, hayEnvio,
  MOTIVO_LABEL, numeroReclamo, pideSeguimiento, puedeVolverLaPrenda, VIA_LABEL,
  type Compensacion, type DestinoPrenda, type ReclamoRow, type ItemReclamo, type OrdenTN,
  type ViaRetorno,
} from '@/lib/reclamos/tipos'

/** Todas las salidas. Cuáles se ofrecen lo decide `compensacionesDe` según lo que pasó. */
const SALIDAS: { key: Compensacion; label: string; ayuda: string }[] = [
  { key: 'plata_total', label: 'Le devolvemos todo', ayuda: 'La devolución clásica.' },
  { key: 'plata_parcial', label: 'Le devolvemos una parte', ayuda: 'Se queda la prenda con un descuento acordado. La más barata: ni envío ni reintegro completo.' },
  { key: 'otra_unidad', label: 'Le mandamos otra igual', ayuda: 'No se toca la plata. Sale una unidad de stock.' },
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
  const [montoAcordado, setMontoAcordado] = useState<number | ''>('')
  const [devolverEnvio, setDevolverEnvio] = useState(false)
  const [envioVuelta, setEnvioVuelta] = useState<number | ''>('')
  const [piso, setPiso] = useState<number | ''>('')
  // Solo hace falta para la cuenta cuando la prenda está fallada: es lo único que se recupera.
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
    () => calcularMonto(items, orden, {
      devolverEnvio,
      montoAcordado: compensacion === 'plata_parcial' ? Number(montoAcordado) || 0
        : compensacion === 'otra_unidad' || compensacion === 'ninguna' || compensacion === 'cupon' ? 0
          : null,
    }),
    [items, orden, devolverEnvio, compensacion, montoAcordado],
  )

  /** Dónde termina la prenda: es lo que después decide si la falla descuenta stock o no. */
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
        devolver_envio: devolverEnvio,
        retorno_sugerido: cuenta.conviene,
        retorno_decidido: retorno,
        via_retorno: retorno ? via : null,
        envio_costo: retorno && hayEnvio(via) ? Number(envioVuelta) || null : null,
        envio_ida_costo: compensacion === 'otra_unidad' ? Number(envioIda) || null : null,
        costo_caso: costo,
        cupon_codigo: compensacion === 'cupon' ? cupon.trim() || null : null,
        // Techo de seguridad del servidor: nunca se devuelve más de lo que se pagó por la orden.
        techo_orden: orden?.total != null ? Number(orden.total) : null,
      })
      toast.ok(retorno ? 'Decidido. Queda esperando que vuelva la prenda.' : 'Decidido.')
      onListo()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  /** Hasta cuánto se puede descontar para que se la quede, y cuánto conviene ofrecer primero. */
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
          Todavía no hay fotos. Si la prenda se la queda el cliente, no vas a poder cerrar el
          reclamo sin al menos una.
        </Notice>
      )}

      {/* ── 1. ¿Vuelve la prenda? ── */}
      {!hayPrendaQueVuelva && (
        <Notice tone="neutral" style={{ marginBottom: space[3] }}>
          {reclamo.motivo === 'no_llego'
            ? 'El pedido se perdió en el camino: no hay prenda que vuelva. Queda pendiente el reclamo al transportista.'
            : 'La prenda nunca salió del depósito, así que no hay nada que esperar ni etiqueta que emitir.'}
        </Notice>
      )}
      {hayPrendaQueVuelva && (
        <section style={{ marginBottom: space[4] }}>
          <h4 style={{ fontSize: font.md, fontWeight: weight.bold, marginBottom: space[2] }}>¿Pedimos que vuelva la prenda?</h4>

          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: space[2] }}>
            <Field label="Envío de vuelta ($)" hint="Total, lo pagamos nosotros">
              <NumberField value={envioVuelta} onChange={(v) => setEnvioVuelta(v)} style={{ width: 120 }} />
            </Field>
            {esFalla && (
              <Field label="PVP de feria por unidad ($)" hint={unidades > 1 ? `Se multiplica por las ${unidades} unidades` : 'Lo único que se saca de una fallada'}>
                <NumberField value={pvpFeria} onChange={(v) => setPvpFeria(v)} style={{ width: 120 }} />
              </Field>
            )}
            <Field label="Piso ($)" hint="Nunca pedirla por debajo">
              <NumberField value={piso} onChange={(v) => setPiso(v)} style={{ width: 110 }} />
            </Field>
          </div>

          <Notice tone={cuenta.conviene ? 'success' : 'warning'}>
            <b>{cuenta.conviene ? 'Conviene pedirla' : 'No conviene pedirla'}.</b> {cuenta.motivo}
            {esFalla && (
              <div style={{ fontSize: font.xs, marginTop: 4 }}>
                Se mide contra el PVP de feria porque una prenda fallada no vuelve a stock.
              </div>
            )}
          </Notice>

          <div style={{ display: 'flex', gap: space[2], marginTop: space[2] }}>
            <Button variant={retorno ? 'solid' : 'outline'} tone="brand" size="sm" onClick={() => setPedirRetorno(true)}>Que vuelva</Button>
            <Button variant={!retorno ? 'solid' : 'outline'} tone="brand" size="sm" onClick={() => setPedirRetorno(false)}>Que se la quede</Button>
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
                  &quot;Esperando que la traiga&quot;.
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
                el precio, o sea que regalarla sale más barato que pedirla de vuelta. */}
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
                    ⚠️ Te estás pasando del techo: por encima de eso conviene pedirla de vuelta.
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
        {compensacion === 'cupon' && (
          <Field label="Código del cupón" hint="Generalo en Tienda Nube y anotalo acá" style={{ marginTop: space[2] }}>
            <Input value={cupon} onChange={(e) => setCupon(e.target.value)} style={{ width: 200 }} />
          </Field>
        )}
        {(compensacion === 'plata_total' || compensacion === 'plata_parcial') && !!orden?.envio_costo_cliente && (
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: space[2], fontSize: font.sm }}>
            <input type="checkbox" checked={devolverEnvio} onChange={(e) => setDevolverEnvio(e.target.checked)} />
            Devolverle también el envío que pagó (<MoneyText value={Number(orden.envio_costo_cliente)} />)
          </label>
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
