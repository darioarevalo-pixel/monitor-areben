'use client'

/**
 * LA BANDA DE HOY: cómo viene el día en curso, arriba de todo.
 *
 * # Por qué existe
 *
 * Lo pidió Bruno el 26-ago-2026, textual: *«me gusta saber cómo está yendo, lo que hago en la app
 * de administrador de anuncios: ver ventas, presupuesto gastado, todo de hoy»*. Es su pantalla de
 * arranque y la zona se la había sacado: la zona sale de la FOTO, que corta en el último día
 * CERRADO, así que el día en curso no existía en ninguna pantalla del monitor.
 *
 * # ⛔ Y NO es rehacer Ads Manager
 *
 * 🔑 Una versión a medias de una herramienta que ya se usa no ahorra el viaje: suma un lugar más al
 * que ir. Lo que justifica esta banda son las tres cosas que Ads Manager **no puede** decir, y que
 * acá van al lado de las que sí: el **techo por compra** que sale de la ficha de rentabilidad, el
 * **veredicto contra ese techo**, y la comparación contra **ayer a esta misma hora**.
 *
 * # 🔴 La comparación es contra ayer A ESTA HORA, ⛔ nunca contra el día entero
 *
 * El parte imprimía un `delta%` de hoy-parcial contra ayer-entero: a las 15:00 daba −56% en casi
 * todas las filas y se leía como un derrumbe cuando lo único que decía es que el día iba por la
 * mitad. Un número que existe y no significa. La hora se deriva del propio desglose de Meta
 * (`horaEnCurso`), ⛔ no de un reloj de este lado. Y si Meta no lo dio, **no se compara y se dice**.
 */

import { entero, plata } from '@/lib/meta-ads/formato'
import type { BandaHoy } from '@/lib/meta-ads/parte'
import { Button, KpiCard, Notice, SectionCard, color, font, space, weight } from '@/components/ui'

/** `HH:MM` de un timestamp local. Es la hora de LECTURA, del navegador: ⛔ no la de la cuenta. */
function reloj(ms: number) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Cuánto se movió lo de hoy contra lo de ayer a la misma hora. `null` si no hay con qué comparar. */
function delta(hoy: number, previo: number) {
  if (!previo) return null
  return ((hoy - previo) / previo) * 100
}

function Contra({ hoy, previo, hora, formato }: {
  hoy: number
  previo: number | null
  hora: number | null
  formato: (n: number) => string
}) {
  if (previo === null || hora === null) return null
  const d = delta(hoy, previo)
  return (
    <>
      a las {String(hora).padStart(2, '0')}h ayer: {formato(previo)}
      {d !== null && (
        <span style={{ color: d >= 0 ? color.successInk : color.warningInk, fontWeight: weight.semibold }}>
          {' '}({d >= 0 ? '+' : '−'}{Math.abs(Math.round(d))}%)
        </span>
      )}
    </>
  )
}

export function BandaDeHoy({ b, fecha, leidoA, actualizar, error }: {
  b: BandaHoy
  fecha: string
  leidoA: number
  actualizar: () => void
  error: string | null
}) {
  const { hoy, aEstaHora } = b
  // 🔑 El tope sólo se convierte en porcentaje cuando TODOS los conjuntos que entregan tienen tope
  // propio. Con uno solo de CBO —Meta no devuelve `daily_budget` para sus conjuntos— el divisor es
  // más chico que el real y el porcentaje sale POR ENCIMA del verdadero: exagerar lo consumido es
  // el peor error posible en la pantalla con la que se decide soltar plata.
  const topeExacto = b.sinTope === 0 && b.tope > 0
  const pctTope = topeExacto ? (hoy.gasto / b.tope) * 100 : null

  return (
    <SectionCard
      title={`Hoy · ${fecha || 'el día en curso'}`}
      subtitle="El día EN CURSO, que es lo único que la foto no puede tener. Sale de Meta y se compara contra ayer a esta misma hora."
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
          {/* 🔑 La hora al lado no es cosmética: este número puede tener diez minutos, y un número
              sin hora se lee como vivo. */}
          <span style={{ fontSize: font.xs, color: color.mut2 }}>leído {reloj(leidoA)}</span>
          <Button size="sm" variant="ghost" onClick={actualizar}>Actualizar</Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        {error && (
          <Notice tone="warning">
            No se pudo actualizar ({error}). Lo de abajo es lo último que se pudo leer, de las {reloj(leidoA)}.
          </Notice>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: space[2] }}>
          <KpiCard
            label="Gasto de hoy"
            value={plata(hoy.gasto)}
            sub={
              pctTope !== null
                ? `${Math.round(pctTope)}% de los ${plata(b.tope)} prendidos`
                : b.tope > 0
                  ? `de más de ${plata(b.tope)} prendidos`
                  : 'sin tope diario propio que sumar'
            }
          />
          <KpiCard
            label="Compras"
            value={entero(hoy.compras)}
            sub={<Contra hoy={hoy.compras} previo={aEstaHora?.compras ?? null} hora={b.hora} formato={entero} />}
          />
          <KpiCard
            label="Costo por compra"
            // ⛔ Sin compras va «—», nunca `$0`: un cero en una columna de costos se lee como «hoy
            // las compras salieron gratis», que es lo contrario de lo que pasa.
            value={hoy.costo === null ? '—' : plata(hoy.costo)}
            sub={b.pctTecho === null ? (b.techo ? 'todavía sin compras' : 'sin techo cargado') : `${Math.round(b.pctTecho)}% del techo`}
            tone={b.veredicto === 'ALTO' ? 'danger' : b.veredicto === 'OK' ? 'success' : 'warning'}
          />
          <KpiCard
            label="Carritos"
            value={entero(hoy.carritos)}
            sub={hoy.carritos ? `${plata(hoy.gasto / hoy.carritos)} cada uno` : 'todavía ninguno'}
          />
        </div>

        <div style={{ fontSize: font.sm, color: color.mut, lineHeight: 1.6 }}>
          {aEstaHora ? (
            <>
              A esta hora ayer la pauta llevaba <b>{plata(aEstaHora.gasto)}</b> y{' '}
              <b>{entero(aEstaHora.compras)}</b> compra{aEstaHora.compras === 1 ? '' : 's'}
              {aEstaHora.costo !== null && <> a {plata(aEstaHora.costo)}</>}. El día entero de ayer
              cerró en {plata(b.ayerEntero.gasto)} y {entero(b.ayerEntero.compras)} compras.
            </>
          ) : (
            <>
              {/* ⛔ No se cae a comparar contra el día entero de ayer: ése es exactamente el número
                  que esta banda vino a sacar del medio. Se dice que falta y se sigue. */}
              Sin comparación contra ayer: {b.motivoSinHora} El día entero de ayer cerró en{' '}
              {plata(b.ayerEntero.gasto)} y {entero(b.ayerEntero.compras)} compras — ⚠️ ⛔ no lo
              compares contra lo de arriba, que es medio día.
            </>
          )}
          {b.sinTope > 0 && b.tope > 0 && (
            <div style={{ marginTop: space[1] }}>
              ⚠️ {b.sinTope} de los {b.conjuntos} conjuntos que entregan no tienen presupuesto propio
              (lo maneja su campaña) ⇒ los {plata(b.tope)} son un piso, y por eso no va el porcentaje.
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  )
}
