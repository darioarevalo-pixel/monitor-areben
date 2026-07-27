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
import { decidir } from '@/lib/devoluciones/cliente'
import {
  calcularMonto, convieneRetorno, costoDelCaso, MOTIVO_LABEL, numeroReclamo,
  type Compensacion, type DestinoPrenda, type DevolucionRow, type ItemDevolucion, type OrdenTN,
} from '@/lib/devoluciones/tipos'

/** Las salidas posibles, en el orden en que se usan de verdad. */
const SALIDAS: { key: Compensacion; label: string; ayuda: string }[] = [
  { key: 'plata_total', label: 'Le devolvemos todo', ayuda: 'La devolución clásica.' },
  { key: 'plata_parcial', label: 'Le devolvemos una parte', ayuda: 'Se queda la prenda con un descuento acordado. La más barata: ni envío ni reintegro completo.' },
  { key: 'otra_unidad', label: 'Le mandamos otra igual', ayuda: 'No se toca la plata. Sale una unidad de stock.' },
  { key: 'cupon', label: 'Le damos un cupón', ayuda: 'Cuesta menos que efectivo y lo retiene. El cupón se genera aparte y se anota acá.' },
  { key: 'ninguna', label: 'Nada', ayuda: 'Se resuelve sin compensación.' },
]

export function DecidirDevolucion({
  marca, devolucion, orden, onClose, onListo,
}: {
  marca: Marca
  devolucion: DevolucionRow
  orden?: OrdenTN | null
  onClose: () => void
  onListo: () => void
}) {
  const toast = useToast()
  // Estable entre renders: de estos ítems cuelgan tres useMemo.
  const items = useMemo(() => devolucion.items || [], [devolucion.items])
  const esFalla = devolucion.motivo === 'falla'
  const nuncaSalio = devolucion.motivo === 'sin_stock'

  const [compensacion, setCompensacion] = useState<Compensacion>('plata_total')
  const [montoAcordado, setMontoAcordado] = useState<number | ''>('')
  const [devolverEnvio, setDevolverEnvio] = useState(false)
  const [envioVuelta, setEnvioVuelta] = useState<number | ''>('')
  const [piso, setPiso] = useState<number | ''>('')
  // Solo hace falta para la cuenta cuando la prenda está fallada: es lo único que se recupera.
  const [pvpFeria, setPvpFeria] = useState<number | ''>('')
  const [cupon, setCupon] = useState('')
  const [guardando, setGuardando] = useState(false)

  /** Los ítems con el PVP de feria que se cargue acá, para que la cuenta lo tome. */
  const itemsConFeria: ItemDevolucion[] = useMemo(() => {
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
  const destino: DestinoPrenda = nuncaSalio ? 'no_salio' : esFalla ? 'falla' : 'stock'

  const costo = useMemo(
    () => costoDelCaso({
      montoDevuelto: monto.total,
      envioVuelta: retorno ? Number(envioVuelta) || 0 : 0,
      envioReemplazo: compensacion === 'otra_unidad' ? Number(envioVuelta) || 0 : 0,
      items,
      destino: retorno ? destino : 'falla',
    }),
    [monto.total, retorno, envioVuelta, compensacion, items, destino],
  )

  const guardar = async () => {
    setGuardando(true)
    try {
      await decidir({
        store: marca,
        id: devolucion.id,
        destino_prenda: destino,
        compensacion,
        monto_producto: monto.producto,
        monto_acordado: compensacion === 'plata_parcial' ? Number(montoAcordado) || 0 : null,
        monto_envio_devuelto: monto.envio,
        monto_total: monto.total,
        devolver_envio: devolverEnvio,
        retorno_sugerido: cuenta.conviene,
        retorno_decidido: retorno,
        envio_costo: Number(envioVuelta) || null,
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

  const salida = SALIDAS.find((s) => s.key === compensacion)

  return (
    <Modal abierto onCerrar={onClose} titulo={`Decidir ${numeroReclamo(devolucion.id)}`} ancho="ancho">
      <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[3] }}>
        {MOTIVO_LABEL[devolucion.motivo]} · orden #{devolucion.orden_tn || '—'} · {devolucion.cliente || 'sin nombre'}
        {devolucion.pago_metodo ? ` · pagó por ${devolucion.pago_metodo}` : ''}
      </div>

      {/* La evidencia que cargó el cliente por el link. */}
      {!!(devolucion.fotos || []).length && (
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginBottom: space[3] }}>
          {(devolucion.fotos || []).map((f, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={f.url} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 6, border: `1px solid ${color.line}` }} />
          ))}
        </div>
      )}
      {devolucion.relato_cliente && (
        <Notice tone="neutral" style={{ marginBottom: space[3] }}>“{devolucion.relato_cliente}”</Notice>
      )}
      {!(devolucion.fotos || []).length && esFalla && (
        <Notice tone="warning" style={{ marginBottom: space[3] }}>
          Todavía no hay fotos. Si la prenda se la queda el cliente, no vas a poder cerrar el
          reclamo sin al menos una.
        </Notice>
      )}

      {/* ── 1. ¿Vuelve la prenda? ── */}
      {!nuncaSalio && (
        <section style={{ marginBottom: space[4] }}>
          <h4 style={{ fontSize: font.md, fontWeight: weight.bold, marginBottom: space[2] }}>¿Pedimos que vuelva la prenda?</h4>

          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: space[2] }}>
            <Field label="Envío de vuelta ($)" hint="Lo pagamos nosotros">
              <NumberField value={envioVuelta} onChange={(v) => setEnvioVuelta(v)} style={{ width: 120 }} />
            </Field>
            {esFalla && (
              <Field label="PVP de feria ($)" hint="Lo único que se saca de una fallada">
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
        </section>
      )}

      {/* ── 2. Qué recibe el cliente ── */}
      <section style={{ marginBottom: space[4] }}>
        <h4 style={{ fontSize: font.md, fontWeight: weight.bold, marginBottom: space[2] }}>¿Qué recibe el cliente?</h4>
        <Field label="Salida">
          <Select value={compensacion} onChange={(e) => setCompensacion(e.target.value as Compensacion)}>
            {SALIDAS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </Select>
        </Field>
        {salida && <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 4 }}>{salida.ayuda}</div>}

        {compensacion === 'plata_parcial' && (
          <Field label="Monto acordado ($)" style={{ marginTop: space[2] }}>
            <NumberField value={montoAcordado} onChange={(v) => setMontoAcordado(v)} style={{ width: 140 }} />
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
