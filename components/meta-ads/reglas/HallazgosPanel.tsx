'use client'

/**
 * Los hallazgos de las automatizaciones, adentro de «Qué hay que decidir» del Panel.
 *
 * # Por qué NO hay una pantalla de alertas
 *
 * El lugar donde se mira «qué hay que hacer» ya existe y ya se usa. Una pantalla nueva de alertas
 * sería un segundo lugar al que hay que acordarse de entrar, y el que no entra no se entera —que es
 * la forma más común en que un sistema de avisos deja de servir. Los hallazgos entran como un
 * renglón más, al lado de las campañas sin marca y de las ideas listas.
 *
 * # 🔴 Por qué «Ignorar» pasó a pedir un motivo
 *
 * El botón decía «Ignorar» y **no ignoraba**: el `unique` de `meta_ads_hallazgo` es
 * `(regla_id, fecha, objeto_id)`, así que resolvía el renglón de hoy y la corrida de mañana lo
 * volvía a insertar con fecha nueva. Una afirmación que la pantalla no podía cumplir.
 *
 * Ahora abre el diálogo de decisiones: se escribe por qué no hay que hacer nada, y eso sí calla la
 * regla mientras la decisión valga. Cancelar no hace nada — y está bien: el renglón sigue ahí porque
 * efectivamente no se decidió nada.
 *
 * # Accionar son DOS llamadas, y el orden es el barato
 *
 * Primero la acción de verdad (`accionarMeta`, el camino que ya tiene permiso, `idem`, relectura y
 * registro) y después marcar el hallazgo. Si la segunda falla, la acción igual pasó y el renglón
 * vuelve mañana: se propone de nuevo. Al revés —marcar primero— dejaría dado por hecho algo que no
 * se hizo, que es el error caro.
 */

import { useCallback, useState } from 'react'
import { DialogoDecision } from '@/components/meta-ads/decisiones/DialogoDecision'
import { accionarMeta, resolverHallazgo } from '@/lib/meta-ads/cliente'
import { nuevoIdem } from '@/lib/meta-ads/acciones'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import { insistenciaDe, type Hallazgo } from '@/lib/meta-ads/reglas'
import type { NivelAccion } from '@/lib/meta-ads/acciones'
import {
  Badge, Button, StatusPill, color, font, radius, space, weight, useToast,
} from '@/components/ui'

/** Cómo se lee el botón según lo que propone el hallazgo. */
function rotuloAccion(h: Hallazgo): string | null {
  const s = h.sugerencia
  if (!s) return null
  if (s.accion === 'estado') return s.status === 'PAUSED' ? 'Pausarlo' : 'Reactivarlo'
  return 'Subir el presupuesto'
}

/**
 * **El gesto de accionar un hallazgo, una sola implementación.**
 *
 * Lo usan el bloque de «Qué hay que decidir» y la marca que va pegada a la fila de su celda. 🔑 Sale
 * a hook porque el orden de las dos llamadas —la acción de verdad primero, marcar después— **es una
 * decisión**, y escrita dos veces la segunda copia la va a invertir: marcar primero deja dado por
 * hecho algo que no se hizo, que es el error caro.
 */
export function useAccionarHallazgo(h: Hallazgo, quitar: (id: number) => void) {
  const toast = useToast()
  const [ocupado, setOcupado] = useState(false)

  const accionar = useCallback(async () => {
    const s = h.sugerencia
    if (!s) return
    setOcupado(true)
    // El `idem` se genera acá, al apretar, y no al mandar: generarlo al mandar haría dos claves con
    // un doble clic. Mismo criterio que las acciones sueltas y los planes.
    const campos: Record<string, string | number> = s.accion === 'estado'
      ? { status: s.status }
      : { daily_budget: s.daily_budget }
    const r = await accionarMeta({
      accion: s.accion,
      nivel: s.nivel as NivelAccion,
      objetoId: s.objetoId,
      campos,
      idem: nuevoIdem(),
    })
    if (!r.ok) {
      setOcupado(false)
      toast.error(r.motivo)
      return
    }
    // Recién ahora se marca. Si esto falla, la acción ya pasó y el renglón vuelve mañana.
    const m = await resolverHallazgo(h.id, 'accionado')
    setOcupado(false)
    if (!m.ok) {
      toast.aviso(`Se hizo, pero no se pudo marcar como resuelto: ${m.motivo}. Va a volver a proponerse.`)
      return
    }
    toast.ok('Hecho')
    quitar(h.id)
  }, [h, toast, quitar])

  return { accionar, ocupado, rotulo: rotuloAccion(h) }
}

/**
 * **La edad del hallazgo, a la vista.** ⛔ No es decoración: uno que viene hace cuatro días y nadie
 * accionó ⛔ no es la misma noticia que uno de esta mañana, y hasta hoy los dos se dibujaban igual.
 */
export function Insistencia({ h }: { h: Hallazgo }) {
  const i = insistenciaDe(h)
  if (!i) return null
  return <Badge tone={i.dias >= 3 ? 'danger' : 'warning'}>{i.texto}</Badge>
}

export function HallazgosPanel({ hallazgos, quitar }: { hallazgos: Hallazgo[]; quitar: (id: number) => void }) {
  if (!hallazgos.length) return null
  return (
    <>
      {hallazgos.map((h) => (
        <FilaHallazgo key={h.id} h={h} quitar={quitar} />
      ))}
    </>
  )
}

function FilaHallazgo({ h, quitar }: { h: Hallazgo; quitar: (id: number) => void }) {
  const toast = useToast()
  const [decidiendo, setDecidiendo] = useState(false)
  const { accionar, ocupado, rotulo } = useAccionarHallazgo(h, quitar)

  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', gap: space[2], alignItems: 'center',
        justifyContent: 'space-between',
        border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: space[3],
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 320px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[1.5], flexWrap: 'wrap' }}>
          <StatusPill tone="warning" label="Detectado" />
          <span style={{ fontSize: font.base, fontWeight: weight.semibold }}>{h.objetoNombre || h.objetoId}</span>
          <span style={{ fontSize: font.sm, color: color.mut2 }}>{ETIQUETA_LINEA[h.linea]}</span>
          <Insistencia h={h} />
        </div>
        <div style={{ fontSize: font.sm, color: color.mut, marginTop: space[1], lineHeight: 1.45 }}>{h.motivo}</div>
      </div>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
        {rotulo && (
          <Button variant="solid" size="sm" disabled={ocupado} onClick={() => void accionar()}>
            {ocupado ? 'Un segundo…' : rotulo}
          </Button>
        )}
        <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => setDecidiendo(true)}>
          No hay que hacer nada
        </Button>
      </div>

      {decidiendo && (
        <DialogoDecision
          abierto={decidiendo}
          onCerrar={() => setDecidiendo(false)}
          onGuardada={() => { setDecidiendo(false); toast.ok('Anotado. No lo vuelve a proponer.'); quitar(h.id) }}
          objetoFijo={{
            objetoId: h.objetoId,
            objetoNombre: h.objetoNombre,
            nivel: h.nivel,
            linea: h.linea,
            cuentaId: h.cuentaId,
            preset: h.preset,
            hallazgoId: h.id,
          }}
          // El catálogo de presets no lo tiene esta pantalla: el diálogo arma la única opción que
          // hace falta a partir del preset del hallazgo.
          presets={[]}
          lineasEditables={[h.linea]}
        />
      )}
    </div>
  )
}
