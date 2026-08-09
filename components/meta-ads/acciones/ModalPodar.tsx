'use client'

/**
 * **Podar: apagar de una lo que viene gastando y no trae nada.**
 *
 * # Por qué es una lista y no un botón por renglón
 *
 * El botón por renglón ya existe —cada hallazgo del Panel tiene su «Pausarlo»— y para uno suelto
 * alcanza. Lo que no alcanza es para lo que de verdad pasa: cinco avisos que vienen quemando plata
 * hace tres semanas, cada uno gastando poco como para llamar la atención solo. Apagarlos de a uno son
 * cinco confirmaciones, cinco renglones sueltos en el registro y ninguna forma de mirar después «qué
 * apagué el domingo y por qué».
 *
 * # 🔑 La lista es una propuesta, no una orden
 *
 * Está medida en el servidor con **la misma función** que después usa el guardarraíl de cada paso, y
 * aun así puede quedar vieja entre que se dibuja y que se aprieta. Por eso el servidor vuelve a medir
 * al armar el plan, y cada paso vuelve a preguntar antes de escribir.
 *
 * ⚠️ **Y la razón por la que eso no es ceremonia**: Meta atribuye compras hacia atrás durante días.
 * Un aviso que hoy figura con cero ventas puede tener dos mañana, y apagarlo sería apagar algo que
 * vende. El cartel lo dice, porque es la única cosa de esta pantalla que alguien podría no esperar.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  cancelarPlan, crearPlan, reintentarPaso, traerCandidatosAPodar, type ContextoPoda,
} from '@/lib/meta-ads/cliente'
import { plata, roas as roasTxt } from '@/lib/meta-ads/formato'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import { nuevoIdemPlan, type Plan } from '@/lib/meta-ads/planes'
import { TOPE_PODA, type MotivoPoda } from '@/lib/meta-ads/podado'
import { ProgresoPlan } from '@/components/meta-ads/planes/ProgresoPlan'
import { avanzarHasta } from '@/components/meta-ads/planes/usePlanes'
import type { LineaPauta } from '@/lib/meta-ads/tipos'
import {
  Button, Modal, Notice, color, font, radius, space, weight,
} from '@/components/ui'

export function ModalPodar({ linea, motivo = 'sin-ventas', onCerrar }: {
  linea: LineaPauta
  motivo?: MotivoPoda
  onCerrar: () => void
}) {
  /**
   * ⚠️ El resultado viaja **con su clave** en vez de haber un `setCargando(true)` arriba del efecto:
   * `react-hooks/set-state-in-effect` lo prohíbe en este repo con razón —un efecto que corrige el
   * estado después de renderizar deja un cuadro intermedio con el dato viejo—. «Está cargando» se
   * DERIVA de que la clave del resultado no sea la del pedido. Mismo patrón que `useReglas`.
   */
  const clave = `${linea}|${motivo}`
  const [leido, setLeido] = useState<{ clave: string; ctx: ContextoPoda | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [plan, setPlan] = useState<Plan | null>(null)
  const [enPlan, setEnPlan] = useState(false)
  // El `idem` nace al ABRIR, no al apretar: si naciera al apretar, un doble clic serían dos planes.
  const [idem] = useState(nuevoIdemPlan)

  useEffect(() => {
    let vivo = true
    void traerCandidatosAPodar(linea, motivo).then((r) => {
      if (!vivo) return
      if (!r.ok) { setError(r.motivo); setLeido({ clave, ctx: null }); return }
      setLeido({ clave, ctx: r.dato })
      // 🔑 **Nada viene tildado.** Una lista que nace toda marcada convierte «revisá y elegí» en
      // «apretá Aceptar», que es exactamente lo que esta pantalla existe para no ser.
      setElegidos(new Set())
    })
    return () => { vivo = false }
  }, [linea, motivo, clave])

  const cargando = !leido || leido.clave !== clave
  const ctx = cargando ? null : leido.ctx

  const alternar = useCallback((id: string) => {
    setElegidos((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }, [])

  const armar = async () => {
    setEnPlan(true)
    setError(null)
    const r = await crearPlan({
      tipo: 'podar', idem, linea, motivo,
      objetos: [...elegidos].map((objetoId) => ({ objetoId })),
    })
    setEnPlan(false)
    if (!r.ok) { setError(r.motivo); return }
    setPlan(r.dato.plan)
  }

  if (plan) {
    return (
      <Modal
        abierto
        onCerrar={onCerrar}
        cerrarConFondo={false}
        titulo="Plan · poda"
        pie={<Button variant="ghost" onClick={onCerrar}>Cerrar</Button>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          <div style={{ fontSize: font.sm, color: color.mut, lineHeight: 1.5 }}>
            Todavía no se apagó nada. Apretá <b>Empezar</b>: cada uno se vuelve a mirar justo antes, y
            el que ya no corresponda queda con el motivo escrito en vez de apagarse.{' '}
            <b>Se puede cerrar esto</b>: el plan queda en el Panel.
          </div>
          <ProgresoPlan
            plan={plan}
            avanzando={enPlan}
            motivo={error}
            onSeguir={() => {
              setEnPlan(true)
              setError(null)
              void avanzarHasta(plan.id, setPlan).then((m) => { setError(m); setEnPlan(false) })
            }}
            onReintentar={(orden) => {
              setEnPlan(true)
              setError(null)
              void reintentarPaso(plan.id, orden).then((r) => {
                if (!r.ok) { setError(r.motivo); setEnPlan(false); return }
                setPlan(r.dato.plan)
                return avanzarHasta(plan.id, setPlan).then((m) => { setError(m); setEnPlan(false) })
              })
            }}
            onCancelar={() => { void cancelarPlan(plan.id).then((r) => { if (r.ok) setPlan(r.dato.plan) }) }}
          />
        </div>
      </Modal>
    )
  }

  const candidatos = ctx?.candidatos || []
  const elegidosLista = candidatos.filter((c) => elegidos.has(c.objetoId))
  const porDia = elegidosLista.reduce((s, c) => s + c.porDia, 0)
  const pasado = elegidosLista.reduce((s, c) => s + c.spend, 0)
  const listo = elegidosLista.length > 0 && elegidosLista.length <= TOPE_PODA && !!ctx?.puede

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      cerrarConFondo={false}
      titulo={`Podar la pauta de ${ETIQUETA_LINEA[linea] || linea}`}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar} disabled={enPlan}>Cancelar</Button>
          <Button variant="solid" tone="danger" disabled={!listo || enPlan} onClick={() => void armar()}>
            {enPlan ? 'Armando…'
              : elegidosLista.length === 0 ? 'Apagar'
                : `Apagar ${elegidosLista.length} ${elegidosLista.length === 1 ? 'aviso' : 'avisos'}`}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        {cargando && <div style={{ color: color.mut2 }}>Mirando la foto diaria…</div>}

        {/* 🔴 Sin el umbral que hace falta no se ofrece nada, y el cartel dice qué falta y dónde se
            carga. «Gastó y no vendió nada» no debería caer nunca acá: su único umbral se deduce del
            CPA medido de la línea. Si cae, es que la línea no tuvo una sola compra. */}
        {ctx && ctx.faltan.length > 0 && (
          <Notice tone="warning">
            <div style={{ fontWeight: weight.semibold }}>{ctx.detalle}</div>
            <div style={{ fontSize: font.sm, marginTop: space[1], lineHeight: 1.45 }}>
              Se carga una sola vez por marca, en <b>Automatizaciones</b>, con el calibrador al lado
              para elegirlo mirando en vez de adivinando.
            </div>
          </Notice>
        )}

        {ctx && !ctx.puede && (
          <Notice tone="warning">
            Podés mirar la lista, pero para apagar hace falta el permiso de pausar en esta marca.
          </Notice>
        )}

        {ctx && ctx.faltan.length === 0 && candidatos.length === 0 && (
          <Notice tone="brand">
            No hay nada que podar: ningún aviso al aire gastó más de {plata(ctx.gastoMinimo)} en la
            semana sin traer una compra. Es la buena noticia que se lee como una pantalla vacía.
          </Notice>
        )}

        {candidatos.length > 0 && (
          <>
            <div style={{ fontSize: font.base, color: color.ink2, lineHeight: 1.5 }}>
              Estos <b>{candidatos.length}</b> están al aire, gastaron más de{' '}
              <b>{plata(ctx!.gastoMinimo)}</b> —lo que cuesta traer un cliente en esta marca— y{' '}
              {motivo === 'sin-ventas' ? <b>no trajeron ninguno</b> : <>rinden por debajo de <b>{roasTxt(ctx!.roasObjetivo)}</b></>}.
              Elegí cuáles apagar.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
              {candidatos.map((c) => {
                const tildado = elegidos.has(c.objetoId)
                return (
                  <label
                    key={c.objetoId}
                    style={{
                      display: 'flex', gap: space[2], alignItems: 'flex-start', cursor: 'pointer',
                      border: `1px solid ${tildado ? color.danger : color.line}`,
                      borderRadius: radius.lg, padding: space[3],
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={tildado}
                      onChange={() => alternar(c.objetoId)}
                      style={{ accentColor: color.danger, marginTop: space[0.5], flexShrink: 0 }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: font.base, fontWeight: weight.semibold }}>{c.nombre}</div>
                      <div style={{ fontSize: font.sm, color: color.mut, marginTop: space[1], lineHeight: 1.45 }}>
                        Gastó <b>{plata(c.spend)}</b> en {c.dias} {c.dias === 1 ? 'día' : 'días'}
                        {motivo === 'sin-ventas'
                          ? <> sin una sola compra</>
                          : <> y devolvió {plata(c.revenue)} ({roasTxt(c.roas)})</>}
                        . Apagarlo libera <b>{plata(c.porDia)}</b> por día.
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>

            {elegidosLista.length > 0 && (
              <div style={{ fontSize: font.sm, color: color.ink2, lineHeight: 1.6 }}>
                <span style={{ fontWeight: weight.semibold }}>
                  {elegidosLista.length} {elegidosLista.length === 1 ? 'aviso' : 'avisos'}:{' '}
                </span>
                venían gastando <b>{plata(porDia)}</b> por día ({plata(pasado)} en la ventana).
              </div>
            )}

            {/* 🔑 Lo único de esta pantalla que alguien podría no esperar, y por eso es lo único que
                tiene cartel propio. */}
            <Notice tone="brand">
              <div style={{ fontWeight: weight.semibold }}>Se vuelve a mirar uno por uno antes de apagar.</div>
              <div style={{ fontSize: font.sm, marginTop: space[1], lineHeight: 1.45 }}>
                Meta sigue atribuyendo compras hacia atrás durante días, así que uno de éstos puede
                aparecer vendiendo mañana. Justo antes de apagarlo se relee la foto y, si vendió,{' '}
                <b>no se apaga y queda el motivo escrito</b>. Y lo que sí se apague se vuelve a prender
                desde Campañas con un botón: pausar no destruye nada.
              </div>
            </Notice>
          </>
        )}

        {error && <Notice tone="danger">No se pudo armar la poda: {error}</Notice>}
      </div>
    </Modal>
  )
}
