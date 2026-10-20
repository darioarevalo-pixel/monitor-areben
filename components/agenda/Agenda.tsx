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
import { personaDelEquipo } from '@/lib/agenda/equipo'
import { comoLeLlamamos } from '@/lib/inicio/core'
import { useAgenda } from '@/store/useAgenda'
import { AvisosHoy } from './AvisosHoy'
import { Cumplimiento } from './Cumplimiento'
import { Equipo } from './Equipo'
import { Eventos } from './Eventos'
import { GrillaAgenda } from './GrillaAgenda'
import { PendientesHoy } from './PendientesHoy'
import { Rutinas } from './Rutinas'
import { SaludoHoy } from './SaludoHoy'
import { TarjetaPromo } from './TarjetaPromo'
import { Titulo } from './Titulo'
import { TusPantallas } from './TusPantallas'

type Sub = 'hoy' | 'equipo' | 'semana' | 'mes' | 'eventos' | 'rutinas' | 'cumplimiento'

/**
 * Las seis, y quién puede ver cada una.
 *
 * ⚠️ El título de cada pantalla lo dibuja `SeccionHeader` con las `ZONAS` de `lib/nav.ts` (Darío,
 * 20-oct-2026: antes iban los dos, «Agenda» y abajo «Equipo»). «Hoy» no lleva ninguno de los dos:
 * saluda con `SaludoHoy`.
 */
const SUBS: { key: Sub; cargar: boolean }[] = [
  { key: 'hoy', cargar: false },
  { key: 'equipo', cargar: true },
  { key: 'semana', cargar: false },
  { key: 'mes', cargar: false },
  { key: 'eventos', cargar: true },
  { key: 'rutinas', cargar: true },
  { key: 'cumplimiento', cargar: true },
]

export function Agenda() {
  const { marca, perfil } = useSesion()
  const { promos, items, hechos, puede, cargado } = useAgenda()
  const params = useParams()

  const visibles = SUBS.filter((s) => !s.cargar || puede.cargar)
  // La subárea sale del 2º tramo de la URL (`/agenda/eventos`). Si no viene —o si es una que esta
  // persona no puede ver, o una inventada— cae en la primera, que es Hoy y la ve todo el mundo.
  const partes = params.seccion
  const pedida = (Array.isArray(partes) ? partes[1] : null) as Sub | null
  /**
   * 🔴 **Mientras la agenda no cargó ⛔ no se puede decidir si alguien puede ver una pantalla de
   * administración**: `puede.cargar` nace en `false` y lo contesta el servidor. Rebotar ahí mandaría
   * a «Hoy» **a quien sí puede entrar**, y encima cambiándole el encabezado bajo el cursor. Así que
   * hasta que cargue se dibuja **la que pidió**, con su esqueleto; el permiso se resuelve después.
   */
  const activa = cargado
    ? (visibles.find((s) => s.key === pedida) ?? visibles[0])
    : (SUBS.find((s) => s.key === pedida) ?? SUBS[0])

  const hoy = hoyIso()
  const delEquipo = personaDelEquipo(perfil?.name)
  const deHoy = pendientesDe(items, hechos, hoy, { marca })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {/* «Hoy» saluda como en la maqueta del celular (Darío, 19-oct-2026). Sólo el nombre de pila. */}
      {activa.key === 'hoy' && cargado && (
        <SaludoHoy
          nombre={(delEquipo ? delEquipo.nombre : comoLeLlamamos(perfil)).split(' ')[0]}
          hechas={deHoy.filter((p) => p.hecho).length}
          total={deHoy.length}
        />
      )}

      {!cargado ? (
        <Esqueleto />
      ) : (
        <>
          {activa.key === 'hoy' && (
            <Hoy
              promos={promosDe(promos, hoy, { marca })}
              hoy={hoy}
              sinTildar={contarSinTildar(items, hechos, hoy, { marca })}
              hayPendientes={deHoy.length > 0}
              hayAvisos={avisosDe(items, hoy, { marca }).length > 0}
              pantallas={!!delEquipo}
            />
          )}
          {/* Las dos vistas del calendario son la misma pantalla: lo que cambia es la unidad, y eso
              ya lo sabe `GrillaAgenda`. ⛔ No se duplica el componente para que la URL diga otra cosa. */}
          {(activa.key === 'semana' || activa.key === 'mes') && (
            // 🔴 El `key` ⛔ no es decorativo: **remonta** la grilla al cambiar de entrada, y con eso
            // el `offset` vuelve a 0. Sin él, «tres meses adelante» se volvería «tres semanas
            // adelante» en silencio: React conserva el estado de un componente que no se mueve.
            <GrillaAgenda key={activa.key} vista={activa.key} />
          )}
          {activa.key === 'equipo' && <Equipo />}
          {activa.key === 'eventos' && <Eventos />}
          {activa.key === 'rutinas' && <Rutinas />}
          {activa.key === 'cumplimiento' && <Cumplimiento items={items} hechos={hechos} />}
        </>
      )}
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
  pantallas,
}: {
  promos: Promo[]
  hoy: string
  sinTildar: number
  hayPendientes: boolean
  hayAvisos: boolean
  /** Al pie, sus otras pantallas: sólo para el equipo, que en el celular no ve el menú. */
  pantallas: boolean
}) {
  return (
    <div style={{ display: 'grid', gap: space[5] }}>
      <section style={{ display: 'grid', gap: space[3] }}>
        <Titulo>
          ☑ Tareas
          {sinTildar > 0 && <span style={{ color: color.mut, fontWeight: weight.medium }}> · {sinTildar} {sinTildar === 1 ? 'pendiente' : 'pendientes'}</span>}
        </Titulo>
        {hayPendientes ? (
          <PendientesHoy fecha={hoy} />
        ) : (
          <EmptyState icon="✅" title="Sin tareas para hoy." dashed />
        )}
      </section>

      <section style={{ display: 'grid', gap: space[3] }}>
        <Titulo>🏦 Promoción bancaria</Titulo>
        {promos.length === 0 ? (
          // El vacío es información, no una falla: "hoy no hay promo" es exactamente lo que hay que
          // poder contestarle al cliente, y hay que leerlo sin dudar de si la pantalla cargó. Por eso
          // ⛔ NO se oculta. Lo que cambia es el PESO: un renglón y no una tarjeta de media pantalla,
          // para que "Lo que hay que hacer hoy" —lo que sí tiene trabajo adentro— entre en la misma
          // vista. El día que hay promo, la tarjeta vuelve a ocupar lo que tiene que ocupar.
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.sm, color: color.mut }}>
            <span aria-hidden="true">🏦</span>
            Sin promoción hoy.
          </div>
        ) : (
          promos.map((p) => <TarjetaPromo key={p.id} promo={p} />)
        )}
      </section>

      {hayAvisos && (
        <section style={{ display: 'grid', gap: space[3] }}>
          <Titulo>📣 Avisos</Titulo>
          <AvisosHoy fecha={hoy} />
        </section>
      )}

      {pantallas && <TusPantallas />}

    </div>
  )
}
