'use client'

/**
 * «Decisiones tomadas» — el bloque de arriba de `/meta-ads/registro`.
 *
 * # Por qué vive acá y no en una pantalla propia
 *
 * La pregunta es la misma que la de abajo: *qué se hizo con esta pauta y por qué*. Lo único que
 * cambia es quién lo hizo — el monitor (y quedó en `meta_ads_accion`) o una persona en Ads Manager
 * (y hasta hoy no quedaba en ningún lado). Partirlo en dos pantallas obligaría a acordarse de mirar
 * las dos para contestar una sola pregunta.
 *
 * # Lo que este bloque tiene que dejar claro
 *
 * 1. **Una decisión vigente calla una alarma.** Se ve en el renglón, con qué alcance y hasta cuándo.
 *    Un silencio que no se ve escrito es el que después nadie entiende.
 * 2. **Revocar no borra.** Por qué se decidió algo y por qué se dejó de sostener son las dos mitades
 *    de la misma historia; la segunda sin la primera no se entiende.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { DialogoDecision } from '@/components/meta-ads/decisiones/DialogoDecision'
import { revocarDecision, traerDecisiones } from '@/lib/meta-ads/cliente'
import { vigenteAl } from '@/lib/meta-ads/decisiones'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import type { DecisionVista, RespuestaDecisiones } from '@/lib/meta-ads/decisiones'
import {
  Button, EmptyState, Notice, SectionCard, StatusPill, color, font, radius, space, weight, useToast,
} from '@/components/ui'

const hoyIso = () => new Date().toISOString().slice(0, 10)

/** Cómo se lee el alcance de una decisión. */
function alcanceDe(d: DecisionVista, rotulos: Map<string, string>): string {
  if (!d.preset) return 'Calla todas las reglas'
  return `Calla «${rotulos.get(d.preset) || d.preset}»`
}

export function Decisiones() {
  const toast = useToast()
  const [d, setD] = useState<RespuestaDecisiones | null>(null)
  const [motivoError, setMotivoError] = useState<string | null>(null)
  const [pedido, setPedido] = useState(0)
  const [abierto, setAbierto] = useState(false)
  const [ocupada, setOcupada] = useState<number | null>(null)

  useEffect(() => {
    let vivo = true
    traerDecisiones().then((r) => {
      if (!vivo) return
      if (r.ok) { setD(r.dato); setMotivoError(null) } else setMotivoError(r.motivo)
    })
    return () => { vivo = false }
  }, [pedido])

  const recargar = useCallback(() => setPedido((p) => p + 1), [])

  const rotulos = useMemo(
    () => new Map((d?.presets || []).map((p) => [p.clave, p.rotulo])),
    [d?.presets],
  )

  const revocar = useCallback(async (id: number) => {
    setOcupada(id)
    const r = await revocarDecision(id)
    setOcupada(null)
    if (!r.ok) { toast.error(r.motivo); return }
    toast.ok('Revocada. El motivo queda escrito.')
    recargar()
  }, [toast, recargar])

  const alGuardar = useCallback((resueltos: number) => {
    setAbierto(false)
    // Se dice cuántos renglones dejó de mostrar el Panel: si no, quien anota la decisión no tiene
    // forma de saber que además apagó lo que ya estaba gritando.
    if (resueltos > 0) {
      toast.ok(resueltos === 1
        ? 'Y se resolvió 1 hallazgo que ya estaba en el Panel.'
        : `Y se resolvieron ${resueltos} hallazgos que ya estaban en el Panel.`)
    }
    recargar()
  }, [toast, recargar])

  if (motivoError) return <Notice tone="danger">No se pudieron leer las decisiones: {motivoError}</Notice>
  if (!d) return null

  const hoy = hoyIso()
  // ⚠️ Una NOTA está al día aunque no calle nada: `vigenteAl` le dice que no porque su pregunta es
  // «¿esto silencia una regla?», y la de acá es «¿esto sigue valiendo?». Sin distinguirlas, la nota
  // de los borradores se dibujaba como «Venció» — y no venció: nunca calló nada, a propósito.
  const alDia = (x: DecisionVista) => x.estado === 'vigente' && (x.clase === 'nota' || vigenteAl(x, hoy))
  const vigentes = d.decisiones.filter(alDia)
  // Vencidas y revocadas van juntas abajo: las dos son «ya no calla», y la diferencia se lee en el
  // renglón. Separarlas en tres grupos sería una taxonomía que nadie pidió.
  const pasadas = d.decisiones.filter((x) => !alDia(x))
  const puede = d.puedeEditar.length > 0

  return (
    <SectionCard
      title="Decisiones tomadas"
      actions={puede ? <Button variant="ghost" size="sm" onClick={() => setAbierto(true)}>Crear una</Button> : undefined}
    >
      <p style={{ margin: `0 0 ${space[3]}px`, color: color.mut, fontSize: font.sm, maxWidth: 640 }}>
        Lo que se decidió sobre la pauta <b>y por qué</b>, incluido lo que se hizo a mano en Ads
        Manager. Sirve para dos cosas: no volver a discutir lo ya resuelto, y que las automatizaciones
        no propongan revertir algo que se hizo a propósito.
      </p>

      {d.problemaFoto && (
        <Notice tone="neutral">
          No se pudo leer la foto diaria ({d.problemaFoto}), así que la lista de objetos para anotar
          una decisión nueva puede venir incompleta. Lo ya anotado se lee igual.
        </Notice>
      )}

      {d.decisiones.length === 0 ? (
        <EmptyState
          dashed
          icon="🧭"
          title="Todavía no hay ninguna decisión anotada"
          hint="Acá va lo que no está en ninguna métrica de Meta: que un aviso se apagó porque se acabó el stock, que una marca se dejó de pautar, que algo ya se probó y no dio."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          {vigentes.map((x) => (
            <Fila key={x.id} d={x} rotulos={rotulos} puede={puede} ocupada={ocupada === x.id} onRevocar={revocar} />
          ))}
          {pasadas.length > 0 && (
            <div style={{ marginTop: space[2], fontSize: font.sm, color: color.mut2, fontWeight: weight.semibold }}>
              Ya no callan nada
            </div>
          )}
          {pasadas.map((x) => (
            <Fila key={x.id} d={x} rotulos={rotulos} puede={puede} ocupada={ocupada === x.id} onRevocar={revocar} />
          ))}
        </div>
      )}

      {abierto && (
        <DialogoDecision
          abierto={abierto}
          onCerrar={() => setAbierto(false)}
          onGuardada={alGuardar}
          objetos={d.objetos}
          presets={d.presets}
          lineasEditables={d.puedeEditar}
        />
      )}
    </SectionCard>
  )
}

function Fila({
  d, rotulos, puede, ocupada, onRevocar,
}: {
  d: DecisionVista
  rotulos: Map<string, string>
  puede: boolean
  ocupada: boolean
  onRevocar: (id: number) => void
}) {
  const hoy = hoyIso()
  const esNota = d.clase === 'nota'
  // Una nota está al día siempre: no calla nada y por eso no puede vencer. Ver `alDia` arriba.
  const viva = d.estado === 'vigente' && (esNota || vigenteAl(d, hoy))
  const vencida = d.estado === 'vigente' && !esNota && !viva

  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', gap: space[2], alignItems: 'flex-start',
        justifyContent: 'space-between',
        border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: space[3],
        opacity: viva ? 1 : 0.72,
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 340px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[1.5], flexWrap: 'wrap' }}>
          {viva && <StatusPill tone="neutral" label={esNota ? 'Nota' : 'Vigente'} />}
          {vencida && <StatusPill tone="neutral" label="Venció" />}
          {d.estado === 'revocada' && <StatusPill tone="neutral" label="Revocada" />}
          <span style={{ fontSize: font.base, fontWeight: weight.semibold }}>
            {d.objetoNombre || d.objetoId || 'Sin objeto'}
          </span>
          <span style={{ fontSize: font.sm, color: color.mut2 }}>{ETIQUETA_LINEA[d.linea]}</span>
        </div>

        <div style={{ fontSize: font.sm, color: color.mut, marginTop: space[1], lineHeight: 1.45 }}>
          {d.motivo}
        </div>

        <div style={{ fontSize: font.sm, color: color.mut2, marginTop: space[1] }}>
          {d.fecha} · {d.quien}
          {/* Una nota lo dice: si no, un renglón sin alcance se lee como uno al que le falta el dato. */}
          {esNota && <> · queda escrita, no calla ninguna regla</>}
          {d.clase === 'silencio' && <> · {alcanceDe(d, rotulos)}</>}
          {/* «Sin vencimiento» se escribe: un silencio permanente tiene que verse, no deducirse de
              que no diga nada. */}
          {d.clase === 'silencio' && (d.vence ? <> · hasta el {d.vence}</> : <> · <b>sin vencimiento</b></>)}
          {d.estado === 'revocada' && d.revocadaPor && <> · revocada por {d.revocadaPor}</>}
        </div>
      </div>

      {puede && d.estado === 'vigente' && (
        <Button variant="ghost" size="sm" disabled={ocupada} onClick={() => onRevocar(d.id)}>
          {ocupada ? 'Un segundo…' : 'Revocar'}
        </Button>
      )}
    </div>
  )
}
