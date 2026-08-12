'use client'

import { useSesion } from '@/components/SesionProvider'
import { cuandoLabel, cumplesDe, loQueViene, modoInicio, type CumpleDeInicio, type FechaQueViene } from '@/lib/inicio/core'
import { hoyIso } from '@/lib/agenda'
import { Card, color, font, space, toneTokens } from '@/components/ui'

/**
 * La franja "lo que viene" del pie de Inicio: los días que van a cambiar cómo se trabaja.
 *
 * # Por qué está al final y no arriba
 *
 * Arriba va lo que hay que hacer hoy —lo que vence—; esto es contexto: enterarse el martes de que
 * el lunes es feriado sirve igual. Ponerlo arriba empujaría los pendientes del día abajo del pliegue
 * a cambio de nada.
 *
 * # No cuesta un fetch, y por eso puede estar acá
 *
 * Las fechas salen del catálogo, que es código (`lib/calendario/fechas.core.js`), y los cumpleaños
 * llegaron con el login. El calendario editorial sí pide al servidor las fechas fijadas a mano y las
 * decisiones de cada marca; esta franja no muestra nada de eso, así que no las necesita.
 *
 * # Cada uno ve lo que le cambia el día
 *
 * A Local y Depósito, **sólo los feriados**: les cambia si se abre y si el correo despacha. Que el
 * Día de la Madre sea el tercer domingo no les dice nada que puedan usar, y una franja con cinco
 * renglones que no les hablan es una franja que dejan de leer — con el feriado adentro. A Marketing,
 * Administración y Dirección, además las comerciales con su porqué, que es lo que les cambia el
 * trabajo. El criterio es el mismo `modoInicio()` que ya reparte el resto de la pantalla.
 *
 * # Una fecha estimada se dibuja estimada
 *
 * El chip ámbar "a confirmar" es el mismo mecanismo del calendario: el Hot Sale lo anuncia una
 * cámara y un feriado trasladable que cae fin de semana lo mueve un decreto. Mostrar como firme una
 * fecha que nadie confirmó es peor que no mostrarla, porque se planifica contra un dato inventado.
 */
export function LoQueViene() {
  const { perfil, cumples } = useSesion()
  const hoy = hoyIso()
  const soloFeriados = modoInicio(perfil) === 'sector'

  const fechas = loQueViene(hoy, DIAS_FECHAS, { soloFeriados })
  const cumpleanios = cumplesDe(cumples, hoy, DIAS_CUMPLES)
  if (!fechas.length && !cumpleanios.length) return null

  // Una sola línea de tiempo: el cumpleaños de alguien y un feriado compiten por el mismo lugar en
  // la cabeza —"¿qué pasa esta semana?"— y partirlos en dos bloques obligaría a leer dos veces para
  // contestarla. Se ordenan juntos por fecha; a igual día, primero el cumpleaños, que es de alguien.
  const renglones = [
    ...cumpleanios.map((c) => ({ key: `cumple:${c.apodo}:${c.fecha}`, orden: 0, c, f: null as FechaQueViene | null })),
    ...fechas.map((f) => ({ key: `fecha:${f.clave}:${f.fecha}`, orden: 1, c: null as CumpleDeInicio | null, f })),
  ].sort((a, b) => (a.c?.fecha || a.f!.fecha).localeCompare(b.c?.fecha || b.f!.fecha) || a.orden - b.orden)

  return (
    <section style={{ marginTop: space[6] }}>
      <h2 style={{ fontSize: font.lg, fontWeight: 700, color: color.ink, marginBottom: space[3] }}>🗓 Lo que viene</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {renglones.map(({ key, c, f }) => {
          const { fecha, faltan } = c ?? f!
          return (
          <Card key={key} padding={3} style={{ display: 'flex', gap: space[3], alignItems: 'baseline', flexWrap: 'wrap' }}>
            {/* El "cuándo" primero y con ancho fijo: la franja se lee en vertical por esa columna
                —"¿qué hay esta semana?"— y con el ancho suelto los días quedan en diagonal. Hoy y
                mañana van en color: son los dos que cambian lo que estás por hacer. */}
            <span style={{ minWidth: 92, fontSize: font.sm, fontWeight: 700, color: faltan <= 1 ? color.brandSolid : color.mut }}>
              {cuandoLabel(faltan, fecha)}
            </span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, color: color.ink }}>
                  {c ? `🎂 Cumple ${c.apodo}` : f!.titulo}
                </span>
                {f && f.tipo === 'feriado' && <Chip tono="brand">feriado</Chip>}
                {f?.estimada && <Chip tono="warning">a confirmar</Chip>}
              </div>
              {/* El `porQue` del catálogo, ya escrito en castellano: es lo que convierte "20 de
                  junio" en algo que se puede usar. Un cumpleaños no lleva bajada — el dato ES la
                  persona, y agregarle una explicación sería inventarle una. */}
              {f && <div style={{ fontSize: font.sm, color: color.mut2, marginTop: 3 }}>{f.porQue}</div>}
            </div>
          </Card>
          )
        })}
      </div>
    </section>
  )
}

function Chip({ tono, children }: { tono: 'brand' | 'warning'; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: font.xs, fontWeight: 700, color: toneTokens[tono].fg, background: toneTokens[tono].bg, borderRadius: 6, padding: '1px 7px' }}>
      {children}
    </span>
  )
}

/**
 * Cuánto se mira para adelante.
 *
 * Son dos ventanas distintas porque contestan dos preguntas distintas. Un feriado a 45 días se
 * planifica —es la ventana con la que ya trabaja el calendario editorial—; un cumpleaños a 45 días
 * no se puede hacer nada con él, y ocuparía el mismo renglón que el de pasado mañana.
 */
const DIAS_FECHAS = 45
const DIAS_CUMPLES = 15
