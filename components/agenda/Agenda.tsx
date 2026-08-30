'use client'

/**
 * **Agenda operativa**: qué corre HOY, y de dónde sale lo que corre.
 *
 * Es la pieza que faltaba y que ni Novedades ni Manuales pueden dar. Una novedad dice "esto cambió,
 * leelo una vez"; un manual dice "así se hace"; ninguno de los dos sabe decir "esto va hoy". El
 * calendario editorial tampoco: es de Marketing, es por marca, y el local ni lo ve.
 *
 * # Seis pantallas y ⛔ ninguna pestaña (29-ago-2026)
 *
 * Eran cuatro pestañas, y «Cargar» se había vuelto **una sola lista plana alfabética** con tres
 * poblaciones adentro: las rutinas, las 44 actividades de los cuatro eventos y todo lo que esos
 * eventos van copiando, que ⛔ nadie borra nunca. Arriba a la derecha, cinco botones que mezclaban
 * *crear una rutina* con *disparar trabajo real* — y que crecían de a uno con cada evento nuevo.
 *
 * Ahora cada pregunta tiene su dirección, como en Tienda Nube y en Meta: la subárea sale del 2º
 * tramo de la URL y esta pantalla sólo elige qué montar. Con eso, **el gesto de crear de cada
 * pantalla es el suyo** y ⛔ no una barra que junta los de todas.
 *
 * | pantalla | contesta | quién la ve |
 * | --- | --- | --- |
 * | Hoy | ¿qué le aplico a este cliente, y qué me toca? | todo el equipo |
 * | Semana · Mes | ¿cuándo cae la próxima? | todo el equipo |
 * | Eventos | ¿qué deja trabajo, y qué trabajo deja? | `agenda.cargar` |
 * | Rutinas | ¿qué corre solo, y de quién es? | `agenda.cargar` |
 * | Cumplimiento | ¿qué se tildó y qué no? | `agenda.cargar` |
 *
 * # La regla de oro de «Hoy»: que sea corta
 *
 * *Un aviso que se ignora doce veces enseña a ignorar el número trece.* Si "Hoy" tuviera quince
 * renglones todos los días, en dos semanas nadie la mira, y entonces la promo que sí importaba se
 * pierde con el resto. Por eso acá **sólo entra lo que corre hoy** — lo vencido y lo que todavía no
 * arrancó vive en Rutinas, que es de administración.
 *
 * Sin marca: una promoción bancaria la define el banco. Que valga sólo para una se dice con el campo
 * `marcas` de la promo, y por eso la pantalla igual filtra por la marca del header.
 */

import { useParams } from 'next/navigation'
import { useSesion } from '@/components/SesionProvider'
import { EmptyState, Esqueleto, color, font, space, weight } from '@/components/ui'
import {
  avisosDe, contarSinTildar, hoyIso, pendientesDe, promosDe,
  type Promo,
} from '@/lib/agenda'
import { useAgenda } from '@/store/useAgenda'
import { AvisosHoy } from './AvisosHoy'
import { Cumplimiento } from './Cumplimiento'
import { Eventos } from './Eventos'
import { GrillaAgenda } from './GrillaAgenda'
import { PendientesHoy } from './PendientesHoy'
import { Rutinas } from './Rutinas'
import { TarjetaPromo } from './TarjetaPromo'
import { Titulo } from './Titulo'

type Sub = 'hoy' | 'semana' | 'mes' | 'eventos' | 'rutinas' | 'cumplimiento'

/**
 * Las seis, con lo que contesta cada una.
 *
 * ⚠️ El encabezado lo dibuja esta pantalla y ⛔ no `SeccionHeader`: las seis comparten `key`, así
 * que el del shell diría «Agenda» seis veces y no habría forma de saber en cuál cayó uno desde el
 * sidebar. Es el mismo motivo —y la misma forma— que en `components/tncat/Tncat.tsx`.
 */
const SUBS: { key: Sub; label: string; hint: string; cargar: boolean }[] = [
  { key: 'hoy', label: 'Hoy', hint: 'La promoción que corre hoy y lo que hay que hacer hoy', cargar: false },
  { key: 'semana', label: 'Semana', hint: 'Los siete días, con todo nombrado', cargar: false },
  { key: 'mes', label: 'Mes', hint: 'Cuándo cae cada cosa. Es contexto: el tilde se pone en Hoy', cargar: false },
  { key: 'eventos', label: 'Eventos', hint: 'Los hechos que dejan trabajo, y las actividades de cada uno', cargar: true },
  { key: 'rutinas', label: 'Rutinas', hint: 'Lo que corre solo: promociones bancarias, rutinas y avisos', cargar: true },
  { key: 'cumplimiento', label: 'Cumplimiento', hint: 'Qué se tildó y qué no en los últimos días', cargar: true },
]

export function Agenda() {
  const { marca } = useSesion()
  const { promos, items, hechos, puede, cargado } = useAgenda()
  const params = useParams()

  const visibles = SUBS.filter((s) => !s.cargar || puede.cargar)
  // La subárea sale del 2º tramo de la URL (`/agenda/eventos`). Si no viene —o si es una que esta
  // persona no puede ver, o una inventada— cae en la primera, que es Hoy y la ve todo el mundo.
  const partes = params.seccion
  const pedida = (Array.isArray(partes) ? partes[1] : null) as Sub | null
  const activa = visibles.find((s) => s.key === pedida) ?? visibles[0]

  const hoy = hoyIso()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <header style={{ borderBottom: `1px solid ${color.line}`, paddingBottom: space[3] }}>
        <h2 style={{ fontSize: font.xl, fontWeight: weight.bold, color: color.ink, letterSpacing: -0.2, margin: 0 }}>
          {activa.label}
        </h2>
        <p style={{ fontSize: font.base, color: color.mut, marginTop: 2 }}>{activa.hint}</p>
      </header>

      {activa.key === 'hoy' && (
        <Hoy
          promos={promosDe(promos, hoy, { marca })}
          hoy={hoy}
          sinTildar={contarSinTildar(items, hechos, hoy, { marca })}
          hayPendientes={pendientesDe(items, hechos, hoy, { marca }).length > 0}
          hayAvisos={avisosDe(items, hoy, { marca }).length > 0}
          cargado={cargado}
        />
      )}
      {/* Las dos vistas del calendario son la misma pantalla: lo que cambia es la unidad, y eso ya
          lo sabe `GrillaAgenda`. ⛔ No se duplica el componente para que la URL diga otra cosa. */}
      {(activa.key === 'semana' || activa.key === 'mes') && (
        // 🔴 El `key` ⛔ no es decorativo: **remonta** la grilla al cambiar de entrada, y con eso el
        // `offset` vuelve a 0. Sin él, «tres meses adelante» se volvería «tres semanas adelante» en
        // silencio, porque React conserva el estado de un componente que no se mueve del árbol.
        <GrillaAgenda key={activa.key} vista={activa.key} />
      )}
      {activa.key === 'eventos' && <Eventos />}
      {activa.key === 'rutinas' && <Rutinas />}
      {activa.key === 'cumplimiento' && <Cumplimiento items={items} hechos={hechos} />}
    </div>
  )
}

/**
 * Lo del día, en el orden en que se necesita: **primero la promo** —es lo que se contesta con el
 * cliente delante—, después cómo viene el día, y al final lo que hay que hacer.
 *
 * El bloque de avisos no dibuja su título cuando no hay ninguno, a diferencia de los otros dos: la
 * promo y los pendientes tienen un vacío que **afirma** ("hoy no hay promo" es exactamente lo que
 * hay que poder contestarle al cliente), y un aviso no — "hoy no hay avisos" es una fila de ruido
 * repetida todos los días, que es lo que enseña a saltear la zona.
 */
function Hoy({
  promos,
  hoy,
  sinTildar,
  hayPendientes,
  hayAvisos,
  cargado,
}: {
  promos: Promo[]
  hoy: string
  sinTildar: number
  hayPendientes: boolean
  hayAvisos: boolean
  cargado: boolean
}) {
  if (!cargado) return <Esqueleto />

  return (
    <div style={{ display: 'grid', gap: space[5] }}>
      <section style={{ display: 'grid', gap: space[3] }}>
        <Titulo>🏦 Promociones bancarias de hoy</Titulo>
        {promos.length === 0 ? (
          // El vacío es información, no una falla: "hoy no hay promo" es exactamente lo que hay que
          // poder contestarle al cliente, y hay que leerlo sin dudar de si la pantalla cargó. Por eso
          // ⛔ NO se oculta. Lo que cambia es el PESO: un renglón y no una tarjeta de media pantalla,
          // para que "Lo que hay que hacer hoy" —lo que sí tiene trabajo adentro— entre en la misma
          // vista. El día que hay promo, la tarjeta vuelve a ocupar lo que tiene que ocupar.
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.sm, color: color.mut }}>
            <span aria-hidden="true">🏦</span>
            Hoy no corre ninguna promoción bancaria.
          </div>
        ) : (
          promos.map((p) => <TarjetaPromo key={p.id} promo={p} />)
        )}
      </section>

      {hayAvisos && (
        <section style={{ display: 'grid', gap: space[3] }}>
          <Titulo>📣 Para tener en cuenta hoy</Titulo>
          <AvisosHoy fecha={hoy} />
        </section>
      )}

      <section style={{ display: 'grid', gap: space[3] }}>
        <Titulo>
          ☑ Lo que hay que hacer hoy
          {sinTildar > 0 && <span style={{ color: color.mut, fontWeight: weight.medium }}> · faltan {sinTildar}</span>}
        </Titulo>
        {hayPendientes ? (
          <PendientesHoy fecha={hoy} />
        ) : (
          <EmptyState icon="✅" title="Hoy no te toca ningún pendiente cargado." dashed />
        )}
      </section>
    </div>
  )
}
