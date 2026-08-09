'use client'

/**
 * **Escalar por escalones: subirle el presupuesto de a poco, un escalón por día, mientras aguante.**
 *
 * # Por qué esto no es «poner un presupuesto más alto»
 *
 * Un salto grande de una vez le resetea el aprendizaje al conjunto: Meta vuelve a explorar y el
 * rendimiento se cae justo cuando se quería aprovechar. De ahí el 20% por escalón, que es el paso que
 * la propia Meta recomienda. Pero un escalón por día durante cuatro días es algo que **nadie va a
 * venir a apretar cuatro veces**, y ahí es donde esto deja de ser un botón y pasa a ser un plan: se
 * arma una vez y el cron da los escalones solo.
 *
 * # 🔑 Lo único que se elige es cuántos escalones y cada cuánto
 *
 * El techo **no es un campo de este formulario**: sale de los umbrales de la marca. Un techo que se
 * tipea al armar el plan es un techo que se puede subir tipeando otro número, y entonces no frena
 * nada. Lo mismo el ROAS objetivo: la vara contra la que se mide cada escalón es la de la marca, no
 * la que le convenga a esta escalada.
 *
 * ⚠️ **Los números que se muestran son una PREVISIÓN, y el cartel lo dice.** Antes de cada escalón el
 * motor relee el presupuesto en Meta —alguien pudo tocarlo en Ads Manager— y mira cómo vino esos
 * días. Si no corresponde, el escalón no se da y el motivo queda escrito. Prometer «va a quedar en
 * $X» sería prometer algo que depende de cómo rinda.
 */

import { useState } from 'react'
import { cancelarPlan, crearPlan, reintentarPaso } from '@/lib/meta-ads/cliente'
import { aMonto } from '@/lib/meta-ads/acciones'
import { escalera, HORAS_ESCALON_DEFECTO, TOPE_ESCALONES } from '@/lib/meta-ads/escalado'
import { money } from '@/lib/meta-ads/formato'
import { nuevoIdemPlan, type Plan } from '@/lib/meta-ads/planes'
import { ProgresoPlan } from '@/components/meta-ads/planes/ProgresoPlan'
import { avanzarHasta } from '@/components/meta-ads/planes/usePlanes'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import { Button, Field, Modal, Notice, NumberField, Select, color, font, space, weight } from '@/components/ui'
import type { ObjetoMeta } from '@/components/meta-ads/acciones/tipos'

/** Cada cuánto puede ir un escalón. Menos de un día no deja ver qué hizo el anterior. */
const CADENCIAS = [
  { valor: 24, rotulo: 'Uno por día' },
  { valor: 48, rotulo: 'Uno cada dos días' },
  { valor: 12, rotulo: 'Dos por día (agresivo)' },
]

export function ModalEscalar({ o, diarioCrudo, techoCrudo, onCerrar }: {
  o: ObjetoMeta
  diarioCrudo: number
  /**
   * El techo de la marca, ya leído. `0` cuando todavía no está definido — y ahí este modal **no
   * ofrece armar nada**: dice qué falta y dónde se carga. Ver `faltanParaEscalar()`.
   */
  techoCrudo: number
  onCerrar: () => void
}) {
  const [escalones, setEscalones] = useState<number | ''>(3)
  const [horas, setHoras] = useState(HORAS_ESCALON_DEFECTO)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [enPlan, setEnPlan] = useState(false)
  const [motivo, setMotivo] = useState<string | null>(null)
  // El `idem` nace al ABRIR, no al apretar: si naciera al apretar, un doble clic serían dos planes.
  const [idem] = useState(nuevoIdemPlan)

  const sinTecho = techoCrudo <= 0
  const pedidos = typeof escalones === 'number' ? escalones : 0
  // La misma función que usa el servidor para armar los pasos: si acá se calculara distinto, la
  // previsión mostraría una escalera y el plan nacería con otra.
  const valores = sinTecho ? [] : escalera(diarioCrudo, pedidos, techoCrudo)
  const recortada = valores.length < pedidos
  const listo = !sinTecho && pedidos >= 1 && pedidos <= TOPE_ESCALONES && valores.length > 0

  const armar = async () => {
    setEnPlan(true)
    setMotivo(null)
    const r = await crearPlan({ tipo: 'escalar', idem, objetoId: o.id, nivel: o.nivel, escalones: pedidos, horas })
    setEnPlan(false)
    if (!r.ok) { setMotivo(r.motivo); return }
    setPlan(r.dato.plan)
  }

  if (plan) {
    return (
      <Modal
        abierto
        onCerrar={onCerrar}
        cerrarConFondo={false}
        titulo="Plan · escalada"
        pie={<Button variant="ghost" onClick={onCerrar}>Cerrar</Button>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          <div style={{ fontSize: font.sm, color: color.mut, lineHeight: 1.5 }}>
            Todavía no se escribió nada. Apretá <b>Empezar</b> para el primer escalón; los que siguen
            <b> se dan solos</b>, uno cada {horas} horas, y antes de cada uno se vuelve a preguntar si
            corresponde. <b>Se puede cerrar esto</b>: el plan queda en el Panel.
          </div>
          <ProgresoPlan
            plan={plan}
            avanzando={enPlan}
            motivo={motivo}
            onSeguir={() => {
              setEnPlan(true)
              setMotivo(null)
              void avanzarHasta(plan.id, setPlan).then((m) => { setMotivo(m); setEnPlan(false) })
            }}
            onReintentar={(orden) => {
              setEnPlan(true)
              setMotivo(null)
              void reintentarPaso(plan.id, orden).then((r) => {
                if (!r.ok) { setMotivo(r.motivo); setEnPlan(false); return }
                setPlan(r.dato.plan)
                return avanzarHasta(plan.id, setPlan).then((m) => { setMotivo(m); setEnPlan(false) })
              })
            }}
            onCancelar={() => { void cancelarPlan(plan.id).then((r) => { if (r.ok) setPlan(r.dato.plan) }) }}
          />
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      cerrarConFondo={false}
      titulo={`Escalar «${o.nombre}»`}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar} disabled={enPlan}>Cancelar</Button>
          <Button variant="solid" tone="brand" disabled={!listo || enPlan} onClick={() => void armar()}>
            {enPlan ? 'Armando…' : 'Armar la escalada'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        {/* 🔴 Sin umbrales no hay escalada, y el cartel dice exactamente qué falta y dónde se carga.
            Ofrecer el formulario igual sería armar un plan cuyos escalones se saltearían todos. */}
        {sinTecho ? (
          <Notice tone="warning">
            <div style={{ fontWeight: weight.semibold }}>
              Falta definir hasta dónde puede llegar el presupuesto de esta marca.
            </div>
            <div style={{ fontSize: font.sm, marginTop: space[1], lineHeight: 1.45 }}>
              Sin un techo, «subí mientras el ROAS aguante» no tiene freno, y sin un ROAS objetivo no
              hay contra qué medir si aguanta. Los dos se cargan una sola vez por marca, en
              <b> Automatizaciones</b>, con el calibrador al lado para elegirlos mirando en vez de
              adivinando.
            </div>
          </Notice>
        ) : (
          <>
            <div style={{ fontSize: font.base, color: color.ink2, lineHeight: 1.5 }}>
              Hoy está en <b>{money(aMonto(diarioCrudo, o.moneda), o.moneda)}</b> por día. Cada escalón
              sube un <b>20%</b> —el paso que Meta recomienda para no resetear el aprendizaje— y se
              frena solo en el techo de {ETIQUETA_LINEA[o.linea!] || o.linea}:{' '}
              <b>{money(aMonto(techoCrudo, o.moneda), o.moneda)}</b>.
            </div>

            <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
              <Field label="Cuántos escalones">
                <NumberField value={escalones} onChange={setEscalones} min={1} max={TOPE_ESCALONES} />
              </Field>
              <Field label="Cada cuánto">
                <Select value={String(horas)} onChange={(e) => setHoras(Number(e.target.value))}>
                  {CADENCIAS.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
                </Select>
              </Field>
            </div>

            {valores.length > 0 && (
              <div style={{ fontSize: font.sm, color: color.mut, lineHeight: 1.6 }}>
                <span style={{ fontWeight: weight.semibold, color: color.ink2 }}>Si todo sale bien: </span>
                {money(aMonto(diarioCrudo, o.moneda), o.moneda)}
                {valores.map((v) => <span key={v}> → {money(aMonto(v, o.moneda), o.moneda)}</span>)}
              </div>
            )}

            {recortada && (
              <Notice tone="warning">
                Con el techo de esta marca entran {valores.length}{' '}
                {valores.length === 1 ? 'escalón' : 'escalones'}, no {pedidos}. El plan se arma con
                {valores.length === 1 ? ' ése' : ' ésos'}: los otros se saltearían diciendo lo mismo.
              </Notice>
            )}

            {/* 🔑 El párrafo que evita el malentendido caro: esto NO es un aumento programado. */}
            <Notice tone="brand">
              <div style={{ fontWeight: weight.semibold }}>Ningún escalón está garantizado.</div>
              <div style={{ fontSize: font.sm, marginTop: space[1], lineHeight: 1.45 }}>
                Antes de cada uno se relee el presupuesto en Meta —por si alguien lo tocó en Ads
                Manager— y se mira si venís por encima del ROAS objetivo de la marca los días que pide.
                Si no, <b>ese escalón no se da y el motivo queda escrito</b>, y la escalada sigue
                preguntando al día siguiente.
              </div>
            </Notice>
          </>
        )}

        {motivo && <Notice tone="danger">No se pudo armar la escalada: {motivo}</Notice>}
      </div>
    </Modal>
  )
}
