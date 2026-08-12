'use client'

/**
 * Anotar una decisión sobre la pauta, con su motivo.
 *
 * # Por qué es un diálogo compartido y no dos formularios
 *
 * Se entra por dos puertas —desde el Registro, eligiendo el objeto, y desde «Ignorar» de un hallazgo,
 * con el objeto ya puesto— y la fila que sale tiene que ser la misma. Dos formularios serían dos
 * criterios sobre qué es obligatorio, y el que se use menos es el que va a dejar filas sin motivo.
 *
 * # Las dos decisiones de forma que importan
 *
 * 1. 🔑 **El alcance arranca en la regla concreta, no en «todas».** «No reactivar porque no hay
 *    stock» tiene que callar el radar de atribución tardía, pero no el freno de emergencia: si
 *    mañana alguien lo prende y empieza a quemar plata, eso tiene que gritar igual. «Todas las
 *    reglas» existe, pero se elige a mano.
 * 2. 🔑 **El vencimiento viene puesto a 90 días.** Un silencio sin fecha es un olvido que se
 *    disfraza de decisión. Se puede sacar, y cuando se saca se lee escrito en la lista.
 */

import { useCallback, useMemo, useState } from 'react'
import { guardarDecision } from '@/lib/meta-ads/cliente'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import type { ObjetoDecidible } from '@/lib/meta-ads/decisiones'
import type { LineaPauta } from '@/lib/meta-ads/tipos'
import {
  Button, Field, Input, Modal, Notice, Select, color, font, space, useToast,
} from '@/components/ui'

/** Cuántos días dura una decisión si nadie dice otra cosa. */
const DIAS_VENCIMIENTO = 90

const hoyIso = () => new Date().toISOString().slice(0, 10)
const enDias = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

/** Lo que se hizo, en el vocabulario con el que se cuenta después. */
const ACCIONES = [
  { v: 'apagado', t: 'Lo apagué' },
  { v: 'pausado', t: 'Lo pausé' },
  { v: 'duplicado', t: 'Lo dupliqué' },
  { v: 'presupuesto', t: 'Le cambié el presupuesto' },
  { v: 'otra', t: 'Otra cosa' },
]

export type ObjetoFijo = {
  objetoId: string
  objetoNombre: string | null
  nivel: string
  linea: LineaPauta
  cuentaId: string | null
  /** El preset del hallazgo del que salió, para que el alcance arranque acotado a él. */
  preset?: string | null
  hallazgoId?: number
}

export function DialogoDecision({
  abierto, onCerrar, onGuardada, objetoFijo, objetos, presets, lineasEditables,
}: {
  abierto: boolean
  onCerrar: () => void
  onGuardada: (resueltos: number) => void
  /** Con objeto ya elegido (desde un hallazgo) o `null` para elegirlo acá (desde el Registro). */
  objetoFijo?: ObjetoFijo | null
  objetos?: ObjetoDecidible[]
  presets: Array<{ clave: string; rotulo: string }>
  lineasEditables: string[]
}) {
  const toast = useToast()
  const [guardando, setGuardando] = useState(false)
  const [elegido, setElegido] = useState('')
  const [motivo, setMotivo] = useState('')
  const [accionTomada, setAccionTomada] = useState('apagado')
  const [preset, setPreset] = useState(objetoFijo?.preset || '')
  const [fecha, setFecha] = useState(hoyIso)
  const [vence, setVence] = useState(() => enDias(DIAS_VENCIMIENTO))
  const [sinVencimiento, setSinVencimiento] = useState(false)

  const objeto: ObjetoFijo | null = useMemo(() => {
    if (objetoFijo) return objetoFijo
    const o = (objetos || []).find((x) => x.objetoId === elegido)
    return o ? { ...o, preset: null } : null
  }, [objetoFijo, objetos, elegido])

  // Sólo se ofrecen los objetos de las marcas que se pueden editar: elegir uno y comerse un 403 al
  // guardar es peor que no verlo.
  const opciones = useMemo(
    () => (objetos || []).filter((o) => lineasEditables.includes(o.linea)),
    [objetos, lineasEditables],
  )

  /**
   * El desplegable de alcance.
   *
   * ⚠️ Cuando se entra desde un hallazgo no viene el catálogo de presets —la pantalla del Panel no lo
   * pide— y el `preset` de arranque quedaría seleccionado sobre una opción inexistente, o sea en
   * blanco: el diálogo diría «todas las reglas» y guardaría lo contrario. Por eso se agrega solo.
   */
  const alcances = useMemo(() => {
    const suyo = objetoFijo?.preset
    if (!suyo || presets.some((p) => p.clave === suyo)) return presets
    return [{ clave: suyo, rotulo: 'la automatización que lo detectó' }, ...presets]
  }, [presets, objetoFijo])

  const guardar = useCallback(async () => {
    if (!objeto) { toast.error('Elegí sobre qué es la decisión.'); return }
    if (!motivo.trim()) { toast.error('Falta el motivo: es lo único que no se puede deducir después.'); return }
    setGuardando(true)
    const r = await guardarDecision({
      linea: objeto.linea,
      clase: 'silencio',
      fecha,
      nivel: objeto.nivel,
      objetoId: objeto.objetoId,
      objetoNombre: objeto.objetoNombre,
      cuentaId: objeto.cuentaId,
      accionTomada,
      motivo: motivo.trim(),
      preset: preset || null,
      vence: sinVencimiento ? null : vence,
      hallazgoId: objetoFijo?.hallazgoId ?? null,
    })
    setGuardando(false)
    if (!r.ok) { toast.error(r.motivo); return }
    toast.ok('Decisión anotada')
    onGuardada(r.dato.hallazgosResueltos)
  }, [objeto, motivo, fecha, accionTomada, preset, vence, sinVencimiento, objetoFijo, toast, onGuardada])

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Anotar una decisión"
      // El fondo no cierra: acá se tipea un motivo largo y perderlo por un clic al costado sería la
      // forma más rápida de que nadie vuelva a escribir uno.
      cerrarConFondo={false}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button variant="solid" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Anotar'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Notice tone="neutral">
          Esto <b>no toca la pauta</b>: no prende ni apaga nada en Meta. Deja escrito qué se decidió y
          por qué, para que las automatizaciones no vuelvan a proponer lo que ya se resolvió.
        </Notice>

        {objetoFijo ? (
          <div style={{ fontSize: font.sm }}>
            <div style={{ color: color.mut2 }}>Sobre</div>
            <div style={{ fontWeight: 600 }}>{objetoFijo.objetoNombre || objetoFijo.objetoId}</div>
            <div style={{ color: color.mut2 }}>{ETIQUETA_LINEA[objetoFijo.linea]}</div>
          </div>
        ) : (
          <Field label="Sobre qué" required hint="Los avisos y conjuntos que aparecieron en la foto de los últimos 30 días.">
            <Select value={elegido} onChange={(e) => setElegido(e.target.value)}>
              <option value="">Elegí uno…</option>
              {opciones.map((o) => (
                <option key={o.objetoId} value={o.objetoId}>
                  {(o.objetoNombre || o.objetoId).slice(0, 80)} · {o.nivel}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          <Field label="Qué se hizo" width={200}>
            <Select value={accionTomada} onChange={(e) => setAccionTomada(e.target.value)}>
              {ACCIONES.map((a) => <option key={a.v} value={a.v}>{a.t}</option>)}
            </Select>
          </Field>
          <Field label="Cuándo se decidió" width={170} hint="No es la fecha de hoy si se decidió antes.">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
        </div>

        <Field
          label="Por qué"
          required
          hint="Lo que no está en ninguna métrica de Meta. «Sin stock», «es de una marca que dejamos», «lo probamos y no dio»."
        >
          <textarea
            className="mo-input"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Sin stock: son fundas discontinuadas. No reactivar."
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </Field>

        <Field
          label="Qué automatizaciones calla"
          hint="Lo angosto es lo seguro: si mañana ese mismo aviso empieza a quemar plata, el freno de emergencia tiene que poder avisar igual."
        >
          <Select value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="">Todas las reglas sobre este objeto</option>
            {alcances.map((p) => <option key={p.clave} value={p.clave}>Sólo {p.rotulo.startsWith('la ') ? p.rotulo : `«${p.rotulo}»`}</option>)}
          </Select>
        </Field>

        <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label="Hasta cuándo vale" width={170}>
            <Input
              type="date"
              value={vence}
              disabled={sinVencimiento}
              onChange={(e) => setVence(e.target.value)}
            />
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: space[1.5], fontSize: font.sm, paddingBottom: space[2] }}>
            <input
              type="checkbox"
              checked={sinVencimiento}
              onChange={(e) => setSinVencimiento(e.target.checked)}
            />
            No vence
          </label>
        </div>
        {sinVencimiento && (
          <div style={{ fontSize: font.sm, color: color.mut }}>
            Va a callar esa alarma <b>para siempre</b>, hasta que alguien la revoque a mano.
          </div>
        )}
      </div>
    </Modal>
  )
}
