'use client'

/**
 * El calendario de la agenda —mes y semana—: **contexto, no acción**.
 *
 * La pregunta de la pestaña Hoy es "¿qué le aplico a este cliente?" y se contesta con el día. Ésta
 * contesta la otra, que también existe y hoy no tenía dónde: *"¿cuándo cae la próxima del Nación?"*,
 * *"¿esta semana qué días toca reponer?"*, *"el jueves que viene, ¿había algo?"*. Por eso es la
 * segunda pestaña y no la primera — y por eso **no se tilda desde acá**: el tilde es del día que se
 * está viviendo, y ofrecerlo en una grilla de un mes es ofrecer marcar hecho el martes que viene.
 *
 * # Lo que se ve es lo tuyo, no todo
 *
 * Sale de las mismas funciones que la pestaña Hoy (`entradasDeRango` las llama día por día), así que
 * el cuadradito del jueves y lo que el local va a ver el jueves **no pueden discrepar**. Con eso
 * viene también el filtro por destino: quien carga administra los ítems ajenos en la pestaña Cargar,
 * pero su mes es el suyo. Para la mirada de gerencia —quién tildó qué— está Cumplimiento.
 *
 * # El mes cuenta, la semana nombra
 *
 * El mes se leía *«cargado y monótono»* (Bruno, 26-ago-2026), y las dos cosas eran el mismo defecto:
 * una rutina de todos los martes ocupaba cuatro cuadraditos repitiendo el mismo título. En el mes
 * esas rutinas se **cuentan** en un renglón (`resumirDia`) para que el día que tiene algo distinto
 * pueda saltar; en la semana la celda es alta, entra todo y **no se colapsa nada**.
 *
 * ⚠️ **No se llama `Calendario.tsx`**: ya existe `components/calendario/Calendario.tsx`, que es el
 * editorial de Marketing, por marca y de fechas comerciales.
 *
 * # La vista entra por parámetro (29-ago-2026)
 *
 * Antes vivía en un chip adentro de esta pantalla, y la pantalla era la pestaña **«Mes»**: o sea que
 * mirando la semana la pestaña seguía diciendo «Mes», que fue exactamente la queja —*«capaz que
 * agregaría una pestaña que sea semanal, en vez de que en la vista Mes pueda cambiarse a semanal
 * pero igual sea pestaña Mes»* (Bruno)—. Ahora son **dos entradas del sidebar** con su dirección
 * (`/agenda/semana`, `/agenda/mes`) y esto sólo dibuja la que le pidan.
 *
 * 🔴 **El `offset` sigue siendo local y sigue arrancando en 0 al cambiar de vista**, porque cambia
 * de unidad (meses ↔ semanas): lo garantiza el `key` con el que `Agenda.tsx` monta este componente
 * —cambiar de entrada lo remonta—, ⛔ no un `if` acá adentro.
 */

import { useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, Card, color, font, radius, space, weight } from '@/components/ui'
import {
  entradasDelMes,
  entradasDeRango,
  feriadoDe,
  hoyIso,
  resumirDia,
  rotuloBeneficio,
  type EntradaMes,
} from '@/lib/agenda'
import { rotuloDestinoCorto } from '@/lib/novedades/tipos'
import {
  celdasDelMes,
  DIAS_GRILLA,
  diasDeSemana,
  MESES,
  mesCorrido,
  rotuloFecha,
  rotuloSemana,
  semanaCorrida,
} from '@/lib/fechas/semana'
import { iso } from '@/lib/calendario'
import { useAgenda } from '@/store/useAgenda'

/** Cuántos chips nombrados entran en una celda del mes antes de resumir el resto en "+N". */
const TOPE_CELDA = 3

export type Vista = 'mes' | 'semana'

export function GrillaAgenda({ vista }: { vista: Vista }) {
  const { marca } = useSesion()
  const { promos, items, hechos } = useAgenda()
  // 🔴 El `offset` ⛔ no va a la URL: (1) es relativo a hoy, así que un link compartido significaría
  // otro mes mañana — una URL que dice algo distinto cada día miente; (2) es navegación, no filtro.
  const [offset, setOffset] = useState(0)
  /** El día abierto abajo de la grilla. En el celular la celda no alcanza para leer nada. */
  const [abierto, setAbierto] = useState<string | null>(null)

  const hoy = hoyIso()

  /**
   * Moverse un mes o una semana.
   *
   * ⚠️ **Cierra el día abierto**: sin eso, el detalle del 12 de agosto se queda abajo mientras la
   * grilla muestra septiembre, y la tarjeta gana porque es la que tiene texto — el mismo renglón
   * que existe para desambiguar, mintiendo.
   */
  const irA = (n: number) => {
    setOffset(n)
    setAbierto(null)
  }

  const { anio, mes } = mesCorrido(hoy, vista === 'mes' ? offset : 0)
  const { desde, hasta } = semanaCorrida(hoy, vista === 'semana' ? offset : 0)

  const porDia = useMemo(() => {
    const datos = { promos, items, hechos }
    // El mes va por su envoltorio y ⛔ no calculando el último día de febrero acá: el mes es un
    // concepto de verdad y la pantalla no tiene por qué saber sus bordes. Los dos caminos terminan
    // en `entradasDeRango`, así que Mes y Semana no pueden discrepar.
    return vista === 'mes'
      ? entradasDelMes(datos, anio, mes, { marca })
      : entradasDeRango(datos, desde, hasta, { marca })
  }, [promos, items, hechos, vista, anio, mes, desde, hasta, marca])

  const delAbierto = abierto ? porDia.get(abierto) ?? [] : []

  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <Button size="sm" variant="ghost" onClick={() => irA(offset - 1)}>‹</Button>
        <div style={{ fontSize: font.md, fontWeight: weight.bold, minWidth: 170, textAlign: 'center' }}>
          {vista === 'mes' ? `${MESES[mes - 1]} ${anio}` : rotuloSemana(desde, hasta)}
        </div>
        <Button size="sm" variant="ghost" onClick={() => irA(offset + 1)}>›</Button>
        {offset !== 0 && <Button size="sm" variant="ghost" onClick={() => irA(0)}>Hoy</Button>}
      </div>

      {vista === 'mes' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {DIAS_GRILLA.map((d) => (
            <div key={d} style={{ fontSize: font.xs, color: color.mut2, textAlign: 'center', paddingBottom: 4 }}>
              {d}
            </div>
          ))}

          {celdasDelMes(anio, mes).map((d, i) => {
            if (d === null) return <div key={`v${i}`} />
            const fecha = iso(anio, mes, d)
            return (
              <CeldaDia
                key={fecha}
                fecha={fecha}
                rotulo={String(d)}
                entradas={porDia.get(fecha) ?? []}
                hoy={hoy}
                resumir
                abierto={fecha === abierto}
                onClick={() => setAbierto(fecha === abierto ? null : fecha)}
              />
            )
          })}
        </div>
      ) : (
        // Sin fila de encabezado y sin `@media` nuevas: cada celda se rotula sola y el `auto-fit`
        // da siete columnas altas en compu y dos en el celular. ⛔ `components/ui/kit.css` es el
        // único lugar donde el repo escribe media queries y es compartido.
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 4,
          }}
        >
          {diasDeSemana(desde).map((fecha) => (
            <CeldaDia
              key={fecha}
              fecha={fecha}
              rotulo={rotuloFecha(fecha)}
              entradas={porDia.get(fecha) ?? []}
              hoy={hoy}
              resumir={false}
              abierto={fecha === abierto}
              onClick={() => setAbierto(fecha === abierto ? null : fecha)}
            />
          ))}
        </div>
      )}

      {abierto && <DetalleDia fecha={abierto} entradas={delAbierto} hoy={hoy} />}
    </div>
  )
}

/**
 * Un día de la grilla: el rótulo, lo que se nombra y —en el mes— lo que se cuenta.
 *
 * 🔑 **Es pura y se exporta con nombre** para que `renderToStaticMarkup` la alcance sin mockear los
 * stores. `resumir` es la única diferencia entre las dos vistas: el mes cuenta, la semana nombra.
 *
 * 🔴 **Los días anteriores a hoy van apagados.** Parte de la monotonía era que las treinta y una
 * celdas pesaban lo mismo; el pasado es contexto, no plan.
 */
export function CeldaDia({
  fecha,
  rotulo,
  entradas,
  hoy,
  resumir,
  abierto,
  onClick,
}: {
  fecha: string
  rotulo: string
  entradas: EntradaMes[]
  hoy: string
  resumir: boolean
  abierto: boolean
  onClick: () => void
}) {
  const esHoy = fecha === hoy
  const pasado = fecha < hoy
  const feriado = feriadoDe(fecha)
  const { chips, rutinas, hechas } = resumir
    ? resumirDia(entradas)
    : { chips: entradas, rutinas: [], hechas: 0 }
  const visibles = resumir ? chips.slice(0, TOPE_CELDA) : chips
  const ocultos = chips.length - visibles.length

  return (
    <button
      type="button"
      // Un día vacío tampoco es inerte: se puede abrir igual y el detalle dice que no hay nada. Que
      // la mitad de los cuadraditos no respondan al toque se lee como que la pantalla está colgada,
      // no como que ese día está libre.
      onClick={onClick}
      title={feriado ? `${rotuloFecha(fecha)} · feriado: ${feriado}` : rotuloFecha(fecha)}
      style={{
        height: 'auto',
        minHeight: resumir ? 78 : 220,
        padding: 6,
        textAlign: 'left',
        cursor: 'pointer',
        borderRadius: radius.md,
        border: `1px solid ${abierto ? color.brand : esHoy ? color.brandBorder : color.line}`,
        background: esHoy ? color.brandBg : color.surface,
        opacity: pasado && !abierto ? 0.62 : 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 3,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span
          style={{
            fontSize: font.xs,
            color: esHoy ? color.brand : color.mut2,
            fontWeight: esHoy ? weight.bold : weight.normal,
          }}
        >
          {rotulo}
        </span>
        {/* El feriado se avisa y no saltea nada: hay feriados que el local trabaja. */}
        {feriado && <span style={{ fontSize: font.xs, color: color.warning }} title={feriado}>★</span>}
      </div>

      {visibles.map((e) => <ChipEntrada key={e.key} entrada={e} />)}
      {ocultos > 0 && <span style={{ fontSize: font.xs, color: color.mut2 }}>+{ocultos}</span>}
      {rutinas.length > 0 && <ChipRutinas n={rutinas.length} hechas={hechas} pasado={fecha <= hoy} />}
    </button>
  )
}

/**
 * Una entrada nombrada adentro del cuadradito, en un renglón.
 *
 * Los tonos no son decoración: son las cosas distintas que puede haber ese día, y en un cuadrito de
 * 78 px el color es lo único que se lee sin acercarse. El pendiente ya tildado va gris y tachado,
 * igual que en la lista de Hoy — que se vea igual en los dos lados es lo que hace que se pueda
 * confiar en cualquiera de ellos.
 *
 * ⚠️ **El pendiente excepcional va `surface` con borde**, y no relleno como antes: es un evento, y
 * tiene que distinguirse del contador de rutinas, que es mobiliario y retrocede.
 */
export function ChipEntrada({ entrada: e }: { entrada: EntradaMes }) {
  const hecho = e.tipo === 'pendiente' && !!e.hecho
  const texto =
    e.tipo === 'promo' ? `${e.promo.banco} ${rotuloBeneficio(e.promo.beneficio)}` : e.item.titulo
  const tono =
    e.tipo === 'promo'
      ? { fondo: color.brandBg, letra: color.brand, borde: 'transparent' }
      : e.tipo === 'aviso'
        ? { fondo: color.warningBg, letra: color.warningInk, borde: 'transparent' }
        : { fondo: color.surface, letra: color.ink2, borde: color.line }

  return (
    <span
      title={texto}
      style={{
        fontSize: font.xs,
        lineHeight: 1.25,
        padding: '2px 4px',
        borderRadius: 4,
        background: tono.fondo,
        border: `1px solid ${tono.borde}`,
        color: hecho ? color.mut2 : tono.letra,
        textDecoration: hecho ? 'line-through' : undefined,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'block',
        width: '100%',
      }}
    >
      {texto}
    </span>
  )
}

/**
 * Lo de todos los días, contado en un renglón: «3 rutinas · 2 ✓».
 *
 * 🔴 **No puede inventar un rojo.** «3 rutinas · 1 sin hacer» en un martes **futuro** es una alarma
 * que nadie puede apagar: todavía no tocaba. Los días que no pasaron dicen sólo cuántas son; los
 * que ya pasaron suman las tildadas, y ⛔ **nunca en tono `danger`** — el informe de deuda es
 * Cumplimiento, no esta grilla.
 *
 * Va en `mut` y **sin relleno**: es mobiliario, tiene que retroceder para que lo excepcional salte.
 */
export function ChipRutinas({ n, hechas, pasado }: { n: number; hechas: number; pasado: boolean }) {
  return (
    <span style={{ fontSize: font.xs, lineHeight: 1.25, color: color.mut, padding: '2px 0' }}>
      {n} {n === 1 ? 'rutina' : 'rutinas'}
      {pasado && ` · ${hechas} ✓`}
    </span>
  )
}

/**
 * El día abierto, entero.
 *
 * Existe porque la celda miente por recorte: tres renglones cortados con puntos suspensivos no
 * contestan "¿qué promo era?". Acá va el texto completo y el acuse, **sin botón de tilde**: se tilda
 * el día que se vive, en Hoy o en Inicio.
 *
 * 🔑 **Lista TODO, sin resumir**: es el lugar donde se ve lo que la celda del mes contó. Y acá sí
 * entra el responsable —con `rotuloDestinoCorto`—, que en la grilla sería ruido: para quien no es
 * admin todo lo que ve es suyo.
 */
export function DetalleDia({ fecha, entradas, hoy }: { fecha: string; entradas: EntradaMes[]; hoy: string }) {
  const feriado = feriadoDe(fecha)

  return (
    <Card padding={3}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], flexWrap: 'wrap', marginBottom: space[2] }}>
        <span style={{ fontSize: font.base, fontWeight: weight.semibold, color: color.ink }}>
          {rotuloFecha(fecha)}
        </span>
        {fecha === hoy && (
          <span style={{ fontSize: font.xs, color: color.brand, fontWeight: weight.semibold }}>hoy</span>
        )}
        {feriado && <span style={{ fontSize: font.sm, color: color.warning }}>feriado · {feriado}</span>}
      </div>

      {entradas.length === 0 ? (
        <div style={{ fontSize: font.sm, color: color.mut }}>Ese día no hay nada cargado.</div>
      ) : (
        <div style={{ display: 'grid', gap: space[2] }}>
          {entradas.map((e) => {
            const dueno = e.tipo === 'promo' ? '' : rotuloDestinoCorto(e.item.destino)
            return (
              <div key={e.key} style={{ fontSize: font.sm, display: 'flex', gap: space[2], alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ flex: '0 0 auto' }}>
                  {e.tipo === 'promo' ? '🏦' : e.tipo === 'aviso' ? '📣' : e.hecho ? '✓' : '☐'}
                </span>
                <span style={{ color: color.ink }}>
                  {e.tipo === 'promo' ? (
                    <>
                      <b>{e.promo.banco}</b> · {rotuloBeneficio(e.promo.beneficio)}
                    </>
                  ) : (
                    e.item.titulo
                  )}
                </span>
                {/* `rotuloDestinoCorto` devuelve vacío para «todo el equipo»: un rótulo que aparece
                    siempre no distingue nada. */}
                {dueno && <span style={{ color: color.mut }}>· {dueno}</span>}
                {e.tipo === 'pendiente' && e.hecho && (
                  // "Lo marcó Local" y no "lo hizo Ana": `Local` es un puesto compartido.
                  <span style={{ color: color.mut2 }}>— lo marcó {e.hecho.usuario}</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
