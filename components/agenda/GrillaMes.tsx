'use client'

/**
 * El mes de la agenda: **contexto, no acción**.
 *
 * La pregunta de la pestaña Hoy es "¿qué le aplico a este cliente?" y se contesta con el día. Ésta
 * contesta la otra, que también existe y hoy no tenía dónde: *"¿cuándo cae la próxima del Nación?"*,
 * *"¿esta semana qué días toca reponer?"*, *"el jueves que viene, ¿había algo?"*. Por eso es la
 * segunda pestaña y no la primera — y por eso **no se tilda desde acá**: el tilde es del día que se
 * está viviendo, y ofrecerlo en una grilla de un mes es ofrecer marcar hecho el martes que viene.
 *
 * # Lo que se ve es lo tuyo, no todo
 *
 * Sale de las mismas funciones que la pestaña Hoy (`entradasDelMes` las llama día por día), así que
 * el cuadradito del jueves y lo que el local va a ver el jueves **no pueden discrepar**. Con eso
 * viene también el filtro por destino: quien carga administra los ítems ajenos en la pestaña Cargar,
 * pero su mes es el suyo. Para la mirada de gerencia —quién tildó qué— está Cumplimiento.
 */

import { useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, Card, color, font, radius, space, weight } from '@/components/ui'
import { entradasDelMes, feriadoDe, hoyIso, rotuloBeneficio, type EntradaMes } from '@/lib/agenda'
import { celdasDelMes, DIAS_GRILLA, MESES, mesCorrido, rotuloFecha } from '@/lib/fechas/semana'
import { iso } from '@/lib/calendario'
import { useAgenda } from '@/store/useAgenda'

/** Cuántas entradas entran en una celda antes de resumir el resto en "+N". */
const TOPE_CELDA = 3

export function GrillaMes() {
  const { marca } = useSesion()
  const { promos, items, hechos } = useAgenda()
  const [offset, setOffset] = useState(0)
  /** El día abierto abajo de la grilla. En el celular la celda no alcanza para leer nada. */
  const [abierto, setAbierto] = useState<string | null>(null)

  const hoy = hoyIso()
  const { anio, mes } = mesCorrido(hoy, offset)

  const porDia = useMemo(
    () => entradasDelMes({ promos, items, hechos }, anio, mes, { marca }),
    [promos, items, hechos, anio, mes, marca],
  )

  const celdas = celdasDelMes(anio, mes)
  const delAbierto = abierto ? porDia.get(abierto) ?? [] : []

  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
        <Button size="sm" variant="ghost" onClick={() => setOffset((o) => o - 1)}>‹</Button>
        <div style={{ fontSize: font.md, fontWeight: weight.bold, minWidth: 170, textAlign: 'center' }}>
          {MESES[mes - 1]} {anio}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOffset((o) => o + 1)}>›</Button>
        {offset !== 0 && <Button size="sm" variant="ghost" onClick={() => setOffset(0)}>Hoy</Button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {DIAS_GRILLA.map((d) => (
          <div key={d} style={{ fontSize: font.xs, color: color.mut2, textAlign: 'center', paddingBottom: 4 }}>
            {d}
          </div>
        ))}

        {celdas.map((d, i) => {
          if (d === null) return <div key={`v${i}`} />
          const fecha = iso(anio, mes, d)
          const delDia = porDia.get(fecha) ?? []
          const esHoy = fecha === hoy
          const esAbierto = fecha === abierto
          const feriado = feriadoDe(fecha)

          return (
            <button
              key={fecha}
              type="button"
              // Un día vacío tampoco es inerte: se puede abrir igual y el detalle dice que no hay
              // nada. Que la mitad de los cuadraditos no respondan al toque se lee como que la
              // pantalla está colgada, no como que ese día está libre.
              onClick={() => setAbierto(esAbierto ? null : fecha)}
              title={feriado ? `${rotuloFecha(fecha)} · feriado: ${feriado}` : rotuloFecha(fecha)}
              style={{
                height: 'auto',
                minHeight: 78,
                padding: 6,
                textAlign: 'left',
                cursor: 'pointer',
                borderRadius: radius.md,
                border: `1px solid ${esAbierto ? color.brand : esHoy ? color.brandBorder : color.line}`,
                background: esHoy ? color.brandBg : color.surface,
                display: 'flex',
                flexDirection: 'column',
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
                  {d}
                </span>
                {/* El feriado se avisa y no saltea nada: hay feriados que el local trabaja. */}
                {feriado && <span style={{ fontSize: font.xs, color: color.warning }} title={feriado}>★</span>}
              </div>

              {delDia.slice(0, TOPE_CELDA).map((e) => <Chip key={e.key} entrada={e} />)}
              {delDia.length > TOPE_CELDA && (
                <span style={{ fontSize: font.xs, color: color.mut2 }}>+{delDia.length - TOPE_CELDA}</span>
              )}
            </button>
          )
        })}
      </div>

      {abierto && <Detalle fecha={abierto} entradas={delAbierto} hoy={hoy} />}
    </div>
  )
}

/**
 * Una entrada adentro del cuadradito, en un renglón.
 *
 * Los tres colores no son decoración: son las tres cosas distintas que puede haber ese día, y en un
 * cuadrito de 78 px el color es lo único que se lee sin acercarse. El pendiente ya tildado va gris y
 * tachado, igual que en la lista de Hoy — que se vea igual en los dos lados es lo que hace que se
 * pueda confiar en cualquiera de ellos.
 */
function Chip({ entrada: e }: { entrada: EntradaMes }) {
  const hecho = e.tipo === 'pendiente' && !!e.hecho
  const texto =
    e.tipo === 'promo' ? `${e.promo.banco} ${rotuloBeneficio(e.promo.beneficio)}` : e.item.titulo
  const tono =
    e.tipo === 'promo'
      ? { fondo: color.brandBg, letra: color.brand }
      : e.tipo === 'aviso'
        ? { fondo: color.warningBg, letra: color.warningInk }
        : { fondo: color.bg2, letra: color.ink2 }

  return (
    <span
      title={texto}
      style={{
        fontSize: font.xs,
        lineHeight: 1.25,
        padding: '2px 4px',
        borderRadius: 4,
        background: tono.fondo,
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
 * El día abierto, entero.
 *
 * Existe porque la celda miente por recorte: tres renglones cortados con puntos suspensivos no
 * contestan "¿qué promo era?". Acá va el texto completo y el acuse, **sin botón de tilde**: se tilda
 * el día que se vive, en Hoy o en Inicio.
 */
function Detalle({ fecha, entradas, hoy }: { fecha: string; entradas: EntradaMes[]; hoy: string }) {
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
          {entradas.map((e) => (
            <div key={e.key} style={{ fontSize: font.sm, display: 'flex', gap: space[2], alignItems: 'baseline' }}>
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
              {e.tipo === 'pendiente' && e.hecho && (
                // "Lo marcó Local" y no "lo hizo Ana": `Local` es un puesto compartido.
                <span style={{ color: color.mut2 }}>— lo marcó {e.hecho.usuario}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
