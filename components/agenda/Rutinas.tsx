'use client'

/**
 * **Rutinas**: el alta y la edición de lo que corre solo — las promociones bancarias, las rutinas
 * repetitivas y los avisos fechados.
 *
 * # Por qué esta pantalla existe aparte (29-ago-2026)
 *
 * Hasta acá era la pestaña «Cargar», y era **una sola lista plana ordenada alfabéticamente** con
 * tres poblaciones adentro: las rutinas, las actividades de los cuatro eventos (44 renglones, más de
 * la mitad de la lista) y lo que cada evento va copiando —6 por ingreso, 11 por lanzamiento— que
 * ⛔ **nadie borra nunca**. O sea: una lista que sólo crece, donde encontrar «reponer la vidriera»
 * entre los pasos de un lanzamiento era imposible. *«Las actividades repetidas son un quilombo de
 * buscar, además la vista plana es muy larga. No le veo escalabilidad»* (Bruno, 29-ago-2026).
 *
 * Acá entra **sólo lo que se administra a mano y corre solo** (`rutinasYAvisos`). Las actividades de
 * un evento se cargan en su tarjeta (`Eventos.tsx`) y lo copiado se mira por hecho, también ahí.
 *
 * 🔑 **El corte lo hace el núcleo y ⛔ no esta pantalla**: una pantalla que se olvida de uno de los
 * dos filtros no falla, se llena — y para cuando se nota, ya nadie la mira.
 */

import { useMemo, useState } from 'react'
import { HeaderAcciones } from '@/components/layout/acciones'
import {
  BuscarInput, Button, Card, Chips, ContadorFiltro, EmptyState, FilterBar,
  Notice, Select, StatusPill,
  color, font, space, weight, useConfirmar, useFiltroUrl, useToast, type ChipOpt,
} from '@/components/ui'
import {
  corre, filtrarItems, hoyIso, opcionesDeQuien, rotuloBeneficio, rotuloDestino, rotuloRegla,
  rutinasYAvisos, vaEl,
  type FiltroClase, type FiltroEstado, type ItemAgenda, type Promo,
} from '@/lib/agenda'
import { borrarItem, borrarPromo, guardarItem, guardarPromo } from '@/lib/agenda/cliente'
import { useAgenda } from '@/store/useAgenda'
import { ModalItem, itemVacio } from './ModalItem'
import { ModalPromo, promoVacia } from './ModalPromo'
import { Titulo } from './Titulo'

export function Rutinas() {
  const { promos, items, cargar } = useAgenda()
  const toast = useToast()
  const { confirmar } = useConfirmar()
  /**
   * Qué se está editando. Vive acá y ⛔ no en `Agenda.tsx` desde que la sección se partió en seis
   * pantallas: los tres modales son de ésta, y el router de arriba no tiene por qué saber que
   * existen. ⚠️ En estado y ⛔ no en la URL, al revés que los filtros: un modal abierto no es un
   * lugar donde se pueda volver, y `itemVacio()` estrena un id en cada llamada.
   */
  const [editandoPromo, setEditandoPromo] = useState<Promo | null>(null)
  const [editandoItem, setEditandoItem] = useState<ItemAgenda | null>(null)

  const hoy = hoyIso()
  const mios = useMemo(() => rutinasYAvisos(items), [items])

  /**
   * 🔑 **Guardar una promo prendida SIEMBRA los pasos de comunicarla** (el evento «cambio de
   * condición comercial»), y eso se cuenta en el toast: una lista nueva que nadie ve es una lista
   * que nadie hace. ⚠️ Se cuenta también lo que ⛔ no sembró —no hay actividades cargadas, la fecha
   * ya pasó— porque el silencio se leería como que el trabajo salió.
   */
  const onGuardarPromo = async (p: Promo) => {
    const { sembrado } = await guardarPromo(p)
    await cargar()
    const creados = sembrado.reduce((n, s) => n + (s.creados || 0), 0)
    const fallo = sembrado.find((s) => s.error)
    if (fallo) toast.ok(`Promoción guardada. Los pasos para comunicarla no se cargaron: ${fallo.error}`)
    else if (creados > 0) toast.ok(`Promoción guardada, y ${creados} ${creados === 1 ? 'pendiente' : 'pendientes'} para comunicarla.`)
    else toast.ok('Promoción guardada.')
  }

  const onBorrar = async (p: Promo) => {
    const ok = await confirmar({
      titulo: 'Eliminar la promoción',
      mensaje: `${p.banco} · ${rotuloBeneficio(p.beneficio)}`,
      ok: 'Eliminar la promoción',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await borrarPromo(p.id)
      await cargar()
      toast.ok('Promoción eliminada.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar.')
    }
  }

  const onGuardarItem = async (i: ItemAgenda) => {
    await guardarItem(i)
    await cargar()
    toast.ok(i.clase === 'aviso' ? 'Aviso guardado.' : 'Rutina guardada.')
  }

  const onBorrarItem = async (i: ItemAgenda) => {
    const esAviso = i.clase === 'aviso'
    const ok = await confirmar({
      titulo: esAviso ? 'Eliminar el aviso' : 'Eliminar la rutina',
      // Que los tildes se van con él va escrito acá y no en un tooltip: es lo que no se puede
      // deshacer, y el interruptor de «apagado» existe justamente para no tener que borrar. Un
      // aviso no tiene tildes que perder, así que no se le advierte de algo que no le pasa.
      mensaje: esAviso
        ? `${i.titulo} — si sólo querés dejar de verlo, apagalo.`
        : `${i.titulo} — se eliminan también los tildes que ya tenga. Si sólo querés dejar de verla, apagala.`,
      ok: esAviso ? 'Eliminar el aviso' : 'Eliminar la rutina',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await borrarItem(i.id)
      await cargar()
      toast.ok(esAviso ? 'Aviso eliminado.' : 'Rutina eliminada.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar.')
    }
  }

  return (
    <>
      {/*
        🔴 **Tres botones y ⛔ ninguno más.** Antes eran cinco: a las tres altas se les sumaba un
        botón por evento que se aprieta a mano, dibujado desde el catálogo — así que la barra crecía
        con cada evento nuevo y mezclaba dos cosas distintas (crear una rutina / disparar trabajo
        real), y encima mostraba **dos de los cuatro** eventos, porque los otros dos los prende su
        propia pantalla. *«Cada vez que sumamos una función aparece como botón arriba a la derecha,
        que no sé si es un disparador, pero no le entiendo»* (Bruno). El disparo vive ahora en la
        tarjeta de su evento, que es donde se lo puede explicar.

        🔑 **El `+` reemplaza al verbo** (pedido de Bruno, 29-ago): así el rótulo nombra la cosa y
        no hay que elegir entre `Agregar` y `Crear`, que en el VOCABULARIO §1.3 significan cosas
        distintas y acá las dos se defienden.
      */}
      <HeaderAcciones>
        <Button onClick={() => setEditandoItem(itemVacio('pendiente'))}>+ Rutina</Button>
        <Button variant="outline" onClick={() => setEditandoItem(itemVacio('aviso'))}>+ Aviso</Button>
        <Button variant="outline" onClick={() => setEditandoPromo(promoVacia())}>+ Promoción</Button>
      </HeaderAcciones>

      <div style={{ display: 'grid', gap: space[5] }}>
        <section style={{ display: 'grid', gap: space[3] }}>
          <Titulo>🏦 Promociones bancarias</Titulo>
          <Notice tone="neutral">
            Acá están <b>todas</b>, incluidas las apagadas y las vencidas. En «Hoy» sólo se ve lo que
            corre hoy — es lo que ve el mostrador.
          </Notice>
          {promos.length === 0 ? (
            <EmptyState title="Todavía no hay ninguna promoción cargada." dashed />
          ) : (
            promos.map((p) => (
              <FilaPromo key={p.id} p={p} hoy={hoy} onEditar={() => setEditandoPromo(p)} onBorrar={onBorrar} />
            ))
          )}
        </section>

        <section style={{ display: 'grid', gap: space[3] }}>
          <Titulo>☑ Rutinas y avisos</Titulo>
          {mios.length === 0 ? (
            <EmptyState
              title="Todavía no hay ninguna rutina ni ningún aviso cargado."
              hint="Entra sólo lo que se olvida: la rutina obvia no se carga."
              dashed
            />
          ) : (
            <ListaItems items={mios} hoy={hoy} onEditar={setEditandoItem} onBorrar={onBorrarItem} />
          )}
        </section>
      </div>

      {editandoPromo && (
        <ModalPromo inicial={editandoPromo} onCerrar={() => setEditandoPromo(null)} onGuardar={onGuardarPromo} />
      )}
      {editandoItem && (
        <ModalItem inicial={editandoItem} onCerrar={() => setEditandoItem(null)} onGuardar={onGuardarItem} />
      )}
    </>
  )
}

/**
 * La lista de rutinas y avisos, con su barra de filtros.
 *
 * Existe como componente aparte —y no como cuatro `useState` adentro de `Rutinas`— porque los
 * filtros viven en la URL: se remonta con la pantalla, que es lo que hace que `useFiltroUrl` los
 * relea.
 *
 * 🔑 **El filtro «de quién» sale de los ítems cargados** (`opcionesDeQuien`), no del padrón del
 * equipo: ése es admin-only y vive en otro sistema. El porqué, en `lib/agenda/index.ts`.
 *
 * ⚠️ **Ya no hay chip «Moldes»**: esa población se mudó entera a Eventos. Un chip que devuelve cero
 * se lee como que se perdió algo.
 */
function ListaItems({
  items, hoy, onEditar, onBorrar,
}: {
  items: ItemAgenda[]
  hoy: string
  onEditar: (i: ItemAgenda) => void
  onBorrar: (i: ItemAgenda) => void
}) {
  const [q, setQ] = useFiltroUrl<string>('q', '')
  const [quien, setQuien] = useFiltroUrl<string>('quien', 'todos')
  const [clase, setClase] = useFiltroUrl<FiltroClase>('f', 'todos')
  const [estado, setEstado] = useFiltroUrl<FiltroEstado>('e', 'todos')

  const gente = useMemo(() => opcionesDeQuien(items), [items])
  const filtrados = useMemo(
    () => filtrarItems(items, { q, quien, clase, estado }),
    [items, q, quien, clase, estado],
  )

  // Los contadores van sobre lo que dejan pasar LOS OTROS filtros, no sobre la lista entera: un
  // chip que dice 12 y devuelve 3 al apretarlo es peor que un chip sin número.
  const salvo = (sin: 'clase' | 'estado') =>
    filtrarItems(items, { q, quien, clase: sin === 'clase' ? 'todos' : clase, estado: sin === 'estado' ? 'todos' : estado })
  const porClase = salvo('clase')
  const porEstado = salvo('estado')

  const clases: ChipOpt<FiltroClase>[] = [
    { key: 'todos', label: 'Todo', n: porClase.length },
    { key: 'pendiente', label: 'Rutinas', n: filtrarItems(porClase, { clase: 'pendiente' }).length },
    { key: 'aviso', label: 'Avisos', n: filtrarItems(porClase, { clase: 'aviso' }).length },
  ]
  const estados: ChipOpt<FiltroEstado>[] = [
    { key: 'todos', label: 'Prendidos y apagados', n: porEstado.length },
    { key: 'activos', label: 'Prendidos', n: filtrarItems(porEstado, { estado: 'activos' }).length },
    { key: 'apagados', label: 'Apagados', n: filtrarItems(porEstado, { estado: 'apagados' }).length },
  ]

  return (
    <>
      <FilterBar>
        <BuscarInput value={q} onChange={setQ} placeholder="Buscar por título…" />
        <Select value={quien} onChange={(e) => setQuien(e.target.value)} style={{ maxWidth: 240 }}>
          <option value="todos">De quien sea</option>
          {gente.map((o) => (
            <option key={o.clave} value={o.clave}>{o.label} ({o.n})</option>
          ))}
        </Select>
        <Chips opciones={clases} value={clase} onChange={setClase} />
        <Chips opciones={estados} value={estado} onChange={setEstado} />
        <ContadorFiltro n={filtrados.length} singular="renglón" plural="renglones" />
      </FilterBar>

      {filtrados.length === 0 ? (
        <EmptyState
          title="Ninguno de los cargados entra en ese filtro."
          hint="El filtro no achica la lista: los otros siguen ahí. Sacá alguno para volver a verlos."
          dashed
        />
      ) : (
        filtrados.map((i) => (
          <FilaItem key={i.id} i={i} hoy={hoy} onEditar={onEditar} onBorrar={onBorrar} />
        ))
      )}
    </>
  )
}

function FilaPromo({
  p, hoy, onEditar, onBorrar,
}: {
  p: Promo
  hoy: string
  onEditar: () => void
  onBorrar: (p: Promo) => void
}) {
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
            <span style={{ fontSize: font.lg, fontWeight: weight.semibold, color: color.ink }}>
              {p.banco}
            </span>
            <span style={{ color: color.ink2 }}>{rotuloBeneficio(p.beneficio)}</span>
            <EstadoPromo promo={p} hoy={hoy} />
          </div>
          <div style={{ fontSize: font.sm, color: color.mut, marginTop: 2 }}>
            {rotuloRegla(p.regla)} · desde {p.desde}
            {p.hasta ? ` hasta ${p.hasta}` : ' · sin fin anunciado'}
            {p.marcas.length > 0 && ` · sólo ${p.marcas.join(' y ')}`}
            {` · ${p.canales.join(' y ')}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'flex-start' }}>
          <Button variant="ghost" size="sm" onClick={onEditar}>Editar</Button>
          <Button variant="ghost" size="sm" onClick={() => onBorrar(p)}>Eliminar</Button>
        </div>
      </div>
    </Card>
  )
}

/**
 * Una rutina o un aviso en la lista de administración.
 *
 * Dice **a quién le llega** además de qué días toca: el destino es lo que decide si aparece en la
 * pantalla de alguien, y una rutina que "no anda" casi siempre es un destino que no incluye a quien
 * la busca.
 *
 * ⚠️ Acá ya ⛔ no puede caer una actividad de un evento —las filtra `rutinasYAvisos`—, así que la
 * chapita de «molde» y la frase de «a los cuántos días» se fueron con ellas a `Eventos.tsx`.
 */
function FilaItem({
  i, hoy, onEditar, onBorrar,
}: {
  i: ItemAgenda
  hoy: string
  onEditar: (i: ItemAgenda) => void
  onBorrar: (i: ItemAgenda) => void
}) {
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
            <span style={{ fontSize: font.lg, fontWeight: weight.semibold, color: color.ink }}>
              {i.titulo}
            </span>
            {/*
              Que sea un aviso se dice acá y no sólo adentro del modal: en la lista, un renglón sin
              tildes en Cumplimiento se explica casi siempre por esto, y buscar el porqué abriendo
              cada uno es la fricción que hace que nadie revise.
            */}
            {i.clase === 'aviso' && <StatusPill tone="warning" label="sólo avisa" />}
            {!i.activo ? (
              <StatusPill tone="neutral" label="apagado" />
            ) : vaEl(i, hoy) ? (
              <StatusPill tone="success" label={i.clase === 'aviso' ? 'se avisa hoy' : 'toca hoy'} />
            ) : (
              <StatusPill tone="neutral" label="hoy no toca" />
            )}
          </div>
          <div style={{ fontSize: font.sm, color: color.mut, marginTop: 2 }}>
            {rotuloRegla(i.regla)} · {rotuloDestino(i.destino)}
            {/* La regla sola miente cuando el ítem arrastra: dice "los martes" y en la pantalla del
                local aparece un jueves. Acá se lee de una, sin abrir el modal — y el tope va en el
                mismo renglón: «queda hasta que se tilde» a secas sería falso en las que sí vencen. */}
            {i.arrastra && (i.arrastraDias == null
              ? ' · queda hasta que se tilde'
              : ` · queda hasta ${i.arrastraDias} ${i.arrastraDias === 1 ? 'día' : 'días'} después`)}
            {i.marcas.length > 0 && ` · sólo ${i.marcas.join(' y ')}`}
            {i.manualId && ' · con manual'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'flex-start' }}>
          <Button variant="ghost" size="sm" onClick={() => onEditar(i)}>Editar</Button>
          <Button variant="ghost" size="sm" onClick={() => onBorrar(i)}>Eliminar</Button>
        </div>
      </div>
    </Card>
  )
}

/**
 * En qué estado está una promo, mirada hoy.
 *
 * Son cuatro y no dos, porque las tres razones por las que algo no se ve son distintas y se arreglan
 * distinto: apagada la prendés, vencida la reemplazás, "todavía no" no se toca, y "hoy no toca" es
 * lo normal. Un solo "inactiva" mandaría a revisar la regla cuando el problema es la fecha.
 */
function EstadoPromo({ promo, hoy }: { promo: Promo; hoy: string }) {
  if (!promo.activa) return <StatusPill tone="neutral" label="apagada" />
  if (promo.hasta && hoy > promo.hasta) return <StatusPill tone="neutral" label="vencida" />
  if (hoy < promo.desde) return <StatusPill tone="warning" label="todavía no arrancó" />
  return corre(promo, hoy)
    ? <StatusPill tone="success" label="corre hoy" />
    : <StatusPill tone="neutral" label="hoy no toca" />
}
