'use client'

/**
 * **Eventos**: los hechos que copian una lista de trabajo, y las actividades de cada uno.
 *
 * # Por qué existe (29-ago-2026)
 *
 * El motor de siembra estaba entero —cuatro eventos, 44 actividades cargadas— pero **no tenía
 * pantalla**: las actividades vivían mezcladas en la lista plana de «Cargar», ordenadas
 * alfabéticamente junto a las rutinas, y los dos eventos que se aprietan a mano eran dos botones
 * sueltos arriba a la derecha, al lado de los de crear. *«Saque la sección disparadores, haga
 * sección evento, y abajo de ese evento las actividades asignadas a distintos sectores»* (Bruno,
 * 29-ago-2026).
 *
 * Una tarjeta por evento contesta las tres preguntas que antes no tenían dónde:
 *  1. **¿esto cuándo pasa?** — `comoSePrende`, del catálogo;
 *  2. **¿qué se hace, en qué orden y de quién es?** — las actividades por día;
 *  3. **¿qué quedó abierto del último?** — lo copiado, agrupado por hecho.
 *
 * 🔑 **La pantalla ⛔ no sabe de puertas, ni de promos, ni de cuántos eventos hay**: recorre
 * `PLANTILLAS`. El quinto evento es una fila de `plantillas.core.js` y aparece acá solo, con su
 * tarjeta, sus actividades y su botón si lo tiene.
 */

import { useMemo, useState } from 'react'
import {
  Button, Card, EmptyState, Notice, StatusPill,
  color, font, space, weight, useConfirmar, useToast,
} from '@/components/ui'
import {
  actividadesDe, hoyIso, PLANTILLAS, porHecho, rotuloDestino, rotuloOffset,
  type GrupoSembrado, type Hecho, type ItemAgenda, type Plantilla,
} from '@/lib/agenda'
import { borrarItem, guardarItem } from '@/lib/agenda/cliente'
import { rotuloFecha } from '@/lib/fechas/semana'
import { useAgenda } from '@/store/useAgenda'
import { ModalItem, actividadVacia } from './ModalItem'
import { ModalSembrar } from './ModalSembrar'

export function Eventos() {
  const { items, hechos, cargar } = useAgenda()
  const toast = useToast()
  const { confirmar } = useConfirmar()
  /** Qué actividad se está editando, y de qué evento: el modal necesita las dos cosas. */
  const [editando, setEditando] = useState<{ item: ItemAgenda; plantilla: Plantilla } | null>(null)
  /** Qué evento se está disparando a mano. ⛔ No un booleano: los que tienen botón son varios. */
  const [sembrando, setSembrando] = useState<Plantilla | null>(null)

  const onGuardar = async (i: ItemAgenda) => {
    await guardarItem(i)
    await cargar()
    toast.ok('Actividad guardada.')
  }

  const onBorrar = async (i: ItemAgenda, p: Plantilla) => {
    const ok = await confirmar({
      titulo: 'Eliminar la actividad',
      // ⚠️ Nombra lo que se pierde a futuro y ⛔ no los tildes: una actividad no corre ningún día, así
      // que no tiene tildes que perder. Lo que se pierde es que el próximo hecho la copie.
      mensaje: `${i.titulo} — el próximo ${p.evento} ya no la va a copiar. Lo que ya se copió queda.`,
      ok: 'Eliminar la actividad',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await borrarItem(i.id)
      await cargar()
      toast.ok('Actividad eliminada.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar.')
    }
  }

  return (
    <>
      <Notice tone="neutral">
        Un <b>evento</b> es un hecho que deja trabajo: llega mercadería, se arma una sesión de fotos,
        se lanza un producto, cambia una condición comercial. Sus <b>actividades</b> se cargan una
        sola vez acá y ⛔ no corren ningún día por su cuenta: cuando el evento pasa, se copian con su
        fecha y con la dueña que tenga cada una.
      </Notice>

      <div style={{ display: 'grid', gap: space[4], marginTop: space[4] }}>
        {PLANTILLAS.map((p) => (
          <TarjetaEvento
            key={p.key}
            plantilla={p}
            items={items}
            hechos={hechos}
            onNueva={() => setEditando({ item: actividadVacia(p), plantilla: p })}
            onEditar={(i) => setEditando({ item: i, plantilla: p })}
            onBorrar={(i) => onBorrar(i, p)}
            onDisparar={() => setSembrando(p)}
          />
        ))}
      </div>

      {sembrando && (
        <ModalSembrar
          plantilla={sembrando}
          moldes={items.filter((i) => i.plantilla === sembrando.key)}
          onCerrar={() => setSembrando(null)}
          onListo={async () => { setSembrando(null); await cargar() }}
        />
      )}
      {editando && (
        <ModalItem
          inicial={editando.item}
          plantilla={editando.plantilla}
          onCerrar={() => setEditando(null)}
          onGuardar={onGuardar}
        />
      )}
    </>
  )
}

function TarjetaEvento({
  plantilla, items, hechos, onNueva, onEditar, onBorrar, onDisparar,
}: {
  plantilla: Plantilla
  items: ItemAgenda[]
  hechos: Hecho[]
  onNueva: () => void
  onEditar: (i: ItemAgenda) => void
  onBorrar: (i: ItemAgenda) => void
  onDisparar: () => void
}) {
  const hoy = hoyIso()
  const actividades = useMemo(() => actividadesDe(items, plantilla.key), [items, plantilla.key])
  const enCurso = useMemo(() => porHecho(items, hechos, hoy, plantilla.key), [items, hechos, hoy, plantilla.key])

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: font.lg, fontWeight: weight.bold, color: color.ink }}>
            {plantilla.nombre}
          </div>
          {/* Qué lo prende. Es el dato que faltaba: hasta el 29-ago-2026 vivía sólo en los
              comentarios del catálogo, así que la única forma de saberlo era leer el código. */}
          <div style={{ fontSize: font.sm, color: color.mut, marginTop: 2 }}>{plantilla.comoSePrende}</div>
        </div>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/*
            🔑 **El disparo a mano vive en la tarjeta de su evento**, ⛔ ya no en la barra de arriba:
            ahí eran botones sin contexto, mezclados con los de crear una rutina. Acá el rótulo se lee
            al lado de la frase que dice qué prende el evento y de la lista que va a copiar.
          */}
          {plantilla.pantalla && (
            <Button variant="outline" size="sm" onClick={onDisparar}>{plantilla.pantalla.boton}</Button>
          )}
          <Button size="sm" onClick={onNueva}>+ Actividad</Button>
        </div>
      </div>

      <div style={{ marginTop: space[4], display: 'grid', gap: space[2] }}>
        {actividades.length === 0 ? (
          <EmptyState
            title="Este evento todavía no tiene ninguna actividad cargada."
            hint="Mientras no haya ninguna, el evento pasa y ⛔ no deja trabajo: no se inventa ningún renglón."
            dashed
          />
        ) : (
          actividades.map((i) => (
            <FilaActividad key={i.id} i={i} plantilla={plantilla} onEditar={onEditar} onBorrar={onBorrar} />
          ))
        )}
      </div>

      {enCurso.length > 0 && <EnCurso grupos={enCurso} plantilla={plantilla} />}
    </Card>
  )
}

/**
 * Una actividad del evento: **cuándo cae y de quién es**, que es lo que se revisa.
 *
 * ⚠️ Se exporta para poder probarla con `renderToStaticMarkup` sin montar la sección entera, igual
 * que `CeldaDia` en la grilla: es una pieza pura y lo que se fija es lo que dice.
 *
 * El día va en castellano (`rotuloOffset`) y ⛔ no como un número con signo: un `-2` se lee como un
 * error de carga, y es justo el caso normal de la sesión de fotos —la modelo, 48 h antes—.
 */
export function FilaActividad({
  i, plantilla, onEditar, onBorrar,
}: {
  i: ItemAgenda
  plantilla: Plantilla
  onEditar: (i: ItemAgenda) => void
  onBorrar: (i: ItemAgenda) => void
}) {
  const eje = plantilla.eje
  const enEje = eje ? ((i[eje.campo] ?? []) as string[]) : []

  return (
    <div
      style={{
        display: 'flex', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap',
        alignItems: 'flex-start', padding: `${space[2]}px 0`, borderTop: `1px solid ${color.line}`,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
          <span style={{ fontSize: font.base, fontWeight: weight.semibold, color: color.ink }}>
            {i.titulo}
          </span>
          {!i.activo && <StatusPill tone="neutral" label="apagada" />}
        </div>
        <div style={{ fontSize: font.sm, color: color.mut, marginTop: 2 }}>
          {rotuloOffset(plantilla, i.offsetDias)} · {rotuloDestino(i.destino)}
          {/* ⚠️ El eje se nombra sólo cuando corre en ALGUNOS. «todos» es el caso normal y escribirlo
              en cada renglón esconde justo los que sí cambian de dueña. */}
          {eje && enEje.length > 0 && ` · sólo ${enEje.map(eje.rotulo).join(' o ')}`}
          {i.marcas.length > 0 && ` · sólo ${i.marcas.join(' y ')}`}
          {i.manualId && ' · con manual'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: space[2] }}>
        <Button variant="ghost" size="sm" onClick={() => onEditar(i)}>Editar</Button>
        <Button variant="ghost" size="sm" onClick={() => onBorrar(i)}>Eliminar</Button>
      </div>
    </div>
  )
}

/**
 * **Lo que este evento ya copió**, agrupado por hecho y lo más nuevo arriba. Exportada por lo mismo
 * que `FilaActividad`.
 *
 * 🔴 Es lo que saca esos renglones de la lista de Rutinas, donde se acumulaban para siempre —6 por
 * ingreso, 11 por lanzamiento— sin que nadie los borrara. Y contesta la pregunta que la lista plana
 * ⛔ no podía: *«del IMP2, ¿qué quedó abierto?»*.
 */
export function EnCurso({ grupos, plantilla }: { grupos: GrupoSembrado[]; plantilla: Plantilla }) {
  // Sólo los últimos, y con el resto contado: la gracia era que la tarjeta ⛔ no crezca sola, que es
  // justo lo que hacía la lista plana. Lo viejo se mira en Cumplimiento, que es la que mira atrás.
  const TOPE = 3
  const visibles = grupos.slice(0, TOPE)

  return (
    <div style={{ marginTop: space[4], paddingTop: space[3], borderTop: `1px solid ${color.line2}` }}>
      <div style={{ fontSize: font.xs, color: color.mut, fontWeight: weight.medium, marginBottom: space[2] }}>
        LO QUE YA SE COPIÓ
      </div>
      <div style={{ display: 'grid', gap: space[2] }}>
        {visibles.map((g) => (
          <div key={g.clave} style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'baseline' }}>
            <span style={{ fontSize: font.sm, fontWeight: weight.semibold, color: color.ink }}>{g.nombre}</span>
            <span style={{ fontSize: font.sm, color: color.mut }}>
              {plantilla.evento} del {rotuloFecha(g.fecha)} · {g.items.length}{' '}
              {g.items.length === 1 ? 'renglón' : 'renglones'}
              {/* ⚠️ `null` ⛔ no se dibuja como 0: quiere decir que los tildes de esa fecha ya no
                  viajan, y un «0 sin tildar» ahí diría que está todo hecho sin saberlo. */}
              {g.sinTildar === null ? '' : g.sinTildar > 0 ? ` · faltan ${g.sinTildar}` : ' · todos tildados'}
            </span>
          </div>
        ))}
        {grupos.length > TOPE && (
          <div style={{ fontSize: font.sm, color: color.mut2 }}>
            y {grupos.length - TOPE} {grupos.length - TOPE === 1 ? 'anterior' : 'anteriores'}.
          </div>
        )}
      </div>
    </div>
  )
}
