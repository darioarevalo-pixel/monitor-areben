'use client'

/**
 * El cierre y el balance: "¿nos convino?", que es una de las tres preguntas que hoy no se pueden
 * contestar.
 *
 * El botón de cerrar va **deshabilitado mientras falte algo**, con la lista en criollo debajo. Es
 * el patrón de `faltantesParaCerrar` (`lib/reclamos/tipos.ts:815`): un botón gris sin explicación
 * es lo que hace que la gente abandone una pantalla.
 *
 * El balance se **congela** al cerrar en vez de calcularse cada vez. No es una vista a propósito:
 * el costo que importa es el del día del canje.
 */

import { useState } from 'react'
import {
  Button, Field, Input, KpiCard, Notice, SectionCard,
  color, font, space, weight, useToast,
} from '@/components/ui'
import { cerrarCanje, marcarNoConservado, registrarPago } from '@/lib/canjes/cliente'
import {
  calcularBalance, faltantesParaCerrarCanje,
  type CanjeEntregable, type CanjeEvidencia, type CanjeItem, type CanjeRow,
} from '@/lib/canjes/tipos'

const money = (n: number | null | undefined) => (n == null ? '—' : `$${Number(n).toLocaleString('es-AR')}`)

export function CierreBalance({
  canje, items, entregables, evidencias, onCambio, puedeCerrarIncompleto,
}: {
  canje: CanjeRow
  items: CanjeItem[]
  entregables: CanjeEntregable[]
  evidencias: CanjeEvidencia[]
  onCambio: () => void
  /** El sub `canjes.cerrar`. Sin él no aparece "Cerrar igual". */
  puedeCerrarIncompleto: boolean
}) {
  const toast = useToast()
  const [alcance, setAlcance] = useState(canje.balance_alcance == null ? '' : String(canje.balance_alcance))
  const [interacciones, setInteracciones] = useState(canje.balance_interacciones == null ? '' : String(canje.balance_interacciones))
  const [puntaje, setPuntaje] = useState(canje.balance_puntaje_manual == null ? '' : String(canje.balance_puntaje_manual))
  const [nota, setNota] = useState(canje.balance_nota ?? '')
  const [cerrando, setCerrando] = useState(false)

  const yaCerrado = canje.estado === 'cerrado'
  const faltantes = faltantesParaCerrarCanje(canje, entregables, evidencias, new Date())

  // El balance se recalcula en pantalla mientras se edita el alcance; al cerrar se congela.
  const balance = calcularBalance(
    { ...canje, balance_alcance: alcance === '' ? null : Number(alcance) },
    items,
  )

  async function cerrar(incompleto: boolean) {
    let motivo: string | null = null
    if (incompleto) {
      motivo = window.prompt('¿Por qué se cierra sin que haya cumplido todo? Queda registrado y le baja el puntaje a ella.')
      if (!motivo?.trim()) return
    }
    setCerrando(true)
    try {
      await cerrarCanje(canje.store, canje.id, {
        balance,
        balance_alcance: alcance === '' ? null : Number(alcance),
        balance_interacciones: interacciones === '' ? null : Number(interacciones),
        balance_puntaje_manual: puntaje === '' ? null : Number(puntaje),
        balance_nota: nota.trim() || null,
        incompleto,
        cierre_motivo: motivo,
      })
      onCambio()
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    } finally {
      setCerrando(false)
    }
  }

  return (
    <SectionCard title="Balance y cierre" subtitle="Lo que costó contra lo que rindió. Se congela al cerrar.">
      <div style={{ display: 'grid', gap: space[3], gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: space[5] }}>
        <KpiCard label="Productos" value={money(balance.costo_productos)} />
        <KpiCard label="Envío" value={money(balance.costo_envio)} />
        {canje.tipo === 'producto_plata' && <KpiCard label="Plata" value={money(balance.costo_plata)} />}
        <KpiCard label="Costo total" value={money(balance.costo_total)} tone="brand" />
        {/* Sin alcance no hay CPM: un 0 se leería como "gratis". */}
        <KpiCard label="CPM" value={balance.cpm == null ? '—' : `$${balance.cpm.toFixed(2)}`} />
      </div>

      {!yaCerrado && (
        <div style={{ display: 'grid', gap: space[3], gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: space[3] }}>
          <Field label="Alcance total" hint="A mano: la API de Instagram está fuera de alcance">
            <Input type="number" value={alcance} onChange={(e) => setAlcance(e.target.value)} />
          </Field>
          <Field label="Interacciones">
            <Input type="number" value={interacciones} onChange={(e) => setInteracciones(e.target.value)} />
          </Field>
          <Field label="Tu puntaje" hint="1 a 5. Es el único número que ponés a criterio">
            <Input type="number" min={1} max={5} value={puntaje} onChange={(e) => setPuntaje(e.target.value)} />
          </Field>
        </div>
      )}

      {!yaCerrado && (
        <div style={{ marginBottom: space[3] }}>
          <Field label="Nota" hint="Lo que el número no dice: cómo quedó el contenido, si trajo gente al local">
            <Input value={nota} onChange={(e) => setNota(e.target.value)} />
          </Field>
        </div>
      )}

      {/* La plata del canje mixto: el pago se hace POR FUERA, acá sólo se registra que se hizo. */}
      {canje.tipo === 'producto_plata' && canje.pago_estado === 'pendiente' && !yaCerrado && (
        <div style={{ marginBottom: space[3] }}>
          <Notice tone="warning">
            Falta pagarle {money(canje.monto_plata)}. El pago se hace por fuera del sistema; acá se
            registra que ya está.
            <div style={{ marginTop: space[2] }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void registrarPago(canje.store, canje.id).then(onCambio).catch((e) => toast.error(String(e?.message || e)))}
              >
                Marcar pagado
              </Button>
            </div>
          </Notice>
        </div>
      )}

      {yaCerrado ? (
        <Notice tone={canje.cerrado_incompleto ? 'warning' : 'success'}>
          Cerrado el {canje.cerrado_at?.slice(0, 10)}
          {canje.cerrado_por ? ` por ${canje.cerrado_por}` : ''}
          {canje.cerrado_incompleto && canje.cierre_motivo ? ` — sin cumplir todo: ${canje.cierre_motivo}` : ''}
          {canje.balance_nota ? ` · ${canje.balance_nota}` : ''}
        </Notice>
      ) : (
        <>
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
            <Button
              variant="solid"
              tone="brand"
              loading={cerrando}
              disabled={faltantes.length > 0}
              onClick={() => void cerrar(false)}
            >
              Cerrar la acción
            </Button>
            {/* "Cerrar igual" es una decisión, no un atajo: exige el sub y un motivo, y le baja el
                puntaje a ella. Sólo aparece si hay algo que falta. */}
            {puedeCerrarIncompleto && faltantes.length > 0 && (
              <Button variant="outline" tone="warning" loading={cerrando} onClick={() => void cerrar(true)}>
                Cerrar igual
              </Button>
            )}
          </div>
          {faltantes.length > 0 && (
            <div style={{ marginTop: space[2], color: color.mut, fontSize: font.sm }}>
              <span style={{ fontWeight: weight.medium }}>Falta:</span> {faltantes.join(' · ')}
            </div>
          )}
        </>
      )}

      {/* Devolvió o vendió lo que le mandamos. Un flag y nada más: sin flujo de reingreso ni
          enganche con Reclamos — pasa dos veces al año y cada caso es distinto. */}
      {canje.entregado_at && !canje.producto_no_conservado && (
        <div style={{ marginTop: space[5], paddingTop: space[3], borderTop: `1px solid ${color.line}` }}>
          <Button
            variant="ghost"
            tone="danger"
            size="sm"
            onClick={async () => {
              const motivo = window.prompt('¿Qué pasó con el producto? (lo devolvió, lo vendió…) Queda en su historial y le baja el puntaje.')
              if (!motivo?.trim()) return
              try {
                await marcarNoConservado(canje.store, canje.id, motivo.trim())
                onCambio()
              } catch (e) { toast.error(String((e as Error)?.message || e)) }
            }}
          >
            No se quedó con el producto
          </Button>
        </div>
      )}
      {canje.producto_no_conservado && (
        <div style={{ marginTop: space[3] }}>
          <Notice tone="danger">
            No conservó el producto: {canje.producto_no_conservado_motivo}
          </Notice>
        </div>
      )}
    </SectionCard>
  )
}
