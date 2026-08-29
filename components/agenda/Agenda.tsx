'use client'

/**
 * **Agenda operativa**: qué corre HOY.
 *
 * Es la pieza que faltaba y que ni Novedades ni Manuales pueden dar. Una novedad dice "esto cambió,
 * leelo una vez"; un manual dice "así se hace"; ninguno de los dos sabe decir "esto va hoy". El
 * calendario editorial tampoco: es de Marketing, es por marca, y el local ni lo ve.
 *
 * # Por qué la primera pestaña es HOY y no el mes
 *
 * Porque la pregunta que se hace parada frente a la caja es "¿qué le aplico a este cliente?", y esa
 * se contesta con el día, no con la grilla. El mes está en la segunda pestaña y es **contexto**:
 * contesta "¿cuándo cae la próxima?", que también es una pregunta real pero nunca la urgente.
 *
 * # La regla de oro de esta pantalla: que sea corta
 *
 * *Un aviso que se ignora doce veces enseña a ignorar el número trece.* Si "Hoy" tuviera quince
 * renglones todos los días, en dos semanas nadie la mira, y entonces la promo que sí importaba se
 * pierde con el resto. Por eso acá **sólo entra lo que corre hoy** — lo vencido y lo que todavía no
 * arrancó vive en la pestaña de carga, que es de administración.
 *
 * Sin marca: una promoción bancaria la define el banco. Que valga sólo para una se dice con el campo
 * `marcas` de la promo, y por eso la pantalla igual filtra por la marca del header.
 */

import { useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { HeaderAcciones } from '@/components/layout/acciones'
import {
  BuscarInput, Button, Card, Chips, ContadorFiltro, EmptyState, Esqueleto, FilterBar,
  Notice, Select, StatusPill, Tabs,
  color, font, space, weight, useConfirmar, useFiltroUrl, useToast, type ChipOpt, type TabItem,
} from '@/components/ui'
import {
  avisosDe, contarSinTildar, corre, hoyIso, pendientesDe, promosDe, filtrarItems, opcionesDeQuien,
  plantillaDe, PLANTILLAS, rotuloBeneficio, rotuloDestino, rotuloRegla, vaEl,
  type FiltroClase, type FiltroEstado, type ItemAgenda, type Plantilla, type Promo,
} from '@/lib/agenda'
import { borrarItem, borrarPromo, guardarItem, guardarPromo } from '@/lib/agenda/cliente'
import { useAgenda } from '@/store/useAgenda'
import { AvisosHoy } from './AvisosHoy'
import { Cumplimiento } from './Cumplimiento'
import { GrillaAgenda } from './GrillaAgenda'
import { ModalItem, itemVacio } from './ModalItem'
import { ModalPromo, promoVacia } from './ModalPromo'
import { ModalSembrar } from './ModalSembrar'
import { PendientesHoy } from './PendientesHoy'
import { TarjetaPromo } from './TarjetaPromo'

export function Agenda() {
  const { marca } = useSesion()
  const { promos, items, hechos, puede, cargado, cargar } = useAgenda()
  const toast = useToast()
  const { confirmar } = useConfirmar()
  /**
   * 🔑 **La pestaña vive en la URL.** Antes era `useState`, así que recargar con un filtro puesto
   * devolvía a «Hoy» **con el filtro aplicado en una pestaña que ya no se estaba mirando** — el bug
   * exacto que Canjes pagó y arregló en agosto (`docs/secciones/canjes.md`, «Dónde está parado uno»).
   */
  const [tab, setTab] = useFiltroUrl<'hoy' | 'mes' | 'carga' | 'cumplimiento'>('t', 'hoy')
  const [editando, setEditando] = useState<Promo | null>(null)
  const [editandoItem, setEditandoItem] = useState<ItemAgenda | null>(null)
  /**
   * Qué hecho se está sembrando, ⛔ no un booleano: los botones que siembran salen del catálogo y
   * son dos —el ingreso y el cambio de condición comercial—, así que el modal necesita saber cuál.
   */
  const [sembrando, setSembrando] = useState<Plantilla | null>(null)

  const hoy = hoyIso()
  const deHoy = promosDe(promos, hoy, { marca })
  const pendientes = pendientesDe(items, hechos, hoy, { marca })
  const avisos = avisosDe(items, hoy, { marca })

  const tabs: TabItem[] = [
    { key: 'hoy', label: 'Hoy' },
    // El mes lo ve todo el equipo y no sólo quien carga: "¿cuándo cae la próxima del Nación?" es una
    // pregunta del mostrador, no de administración.
    { key: 'mes', label: 'Mes', hint: 'Cuándo cae cada cosa. Contexto: el tilde se pone en Hoy' },
    ...(puede.cargar
      ? [
          { key: 'carga', label: 'Cargar', hint: 'Alta y edición de las promociones y los pendientes' } as TabItem,
          { key: 'cumplimiento', label: 'Cumplimiento', hint: 'Qué se tildó y qué no en los últimos días' } as TabItem,
        ]
      : []),
  ]

  /**
   * 🔑 **Guardar una promo prendida ahora SIEMBRA los pasos de comunicarla** (4º disparador), y eso
   * se cuenta en el toast: una lista nueva que nadie ve es una lista que nadie hace. ⚠️ Se cuenta
   * también lo que ⛔ no sembró —no hay moldes, la fecha ya pasó— porque el silencio se leería como
   * que el trabajo salió.
   */
  const onGuardar = async (p: Promo) => {
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
    toast.ok(i.clase === 'aviso' ? 'Aviso guardado.' : 'Pendiente guardado.')
  }

  const onBorrarItem = async (i: ItemAgenda) => {
    const esAviso = i.clase === 'aviso'
    const ok = await confirmar({
      titulo: esAviso ? 'Eliminar el aviso' : 'Eliminar el pendiente',
      // Que los tildes se van con él va escrito acá y no en un tooltip: es lo que no se puede
      // deshacer, y el interruptor de «apagado» existe justamente para no tener que borrar. Un
      // aviso no tiene tildes que perder, así que no se le advierte de algo que no le pasa.
      mensaje: esAviso
        ? `${i.titulo} — si sólo querés dejar de verlo, apagalo.`
        : `${i.titulo} — se eliminan también los tildes que ya tenga. Si sólo querés dejar de verlo, apagalo.`,
      ok: esAviso ? 'Eliminar el aviso' : 'Eliminar el pendiente',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await borrarItem(i.id)
      await cargar()
      toast.ok(esAviso ? 'Aviso eliminado.' : 'Pendiente eliminado.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar.')
    }
  }

  return (
    <>
      {puede.cargar && (
        <HeaderAcciones>
          <Button onClick={() => setEditando(promoVacia())}>Nueva promoción</Button>
          <Button variant="outline" onClick={() => setEditandoItem(itemVacio('pendiente'))}>Nuevo pendiente</Button>
          {/*
            El aviso tiene botón propio aunque el modal sea el mismo y adentro se pueda cambiar de
            clase: quien nunca abrió el alta no tiene por qué saber que existe. Un tercer botón se
            lee de una; un `<select>` escondido adentro de otro formulario, no.
          */}
          <Button variant="outline" onClick={() => setEditandoItem(itemVacio('aviso'))}>Nuevo aviso</Button>
          {/*
            🔑 **Los disparadores salen del CATÁLOGO, ⛔ no están escritos acá**: uno por plantilla
            que se aprieta a mano (`pantalla`). Existen porque hoy el disparador es una persona
            acordándose — dos manuales se apoyan en «el aviso de ingreso de Administración», que era
            eso, y el cambio de condición comercial no lo prende nada. Siembran los pasos que estén
            cargados como molde. ⚠️ El lanzamiento y la sesión de fotos ⛔ NO tienen botón: los
            dispara su propia pantalla, y un segundo lugar para decirlo sembraría dos veces.
          */}
          {PLANTILLAS.filter((p) => p.pantalla).map((p) => (
            <Button key={p.key} variant="outline" onClick={() => setSembrando(p)}>{p.pantalla!.boton}</Button>
          ))}
        </HeaderAcciones>
      )}

      <div style={{ marginBottom: space[4] }}>
        <Tabs items={tabs} value={tab} onChange={(k) => setTab(k as typeof tab)} variant="underline" />
      </div>

      {tab === 'hoy' && (
        <Hoy
          promos={deHoy}
          hoy={hoy}
          sinTildar={contarSinTildar(items, hechos, hoy, { marca })}
          hayPendientes={pendientes.length > 0}
          hayAvisos={avisos.length > 0}
          cargado={cargado}
        />
      )}
      {tab === 'mes' && <GrillaAgenda />}
      {tab === 'carga' && (
        <Carga
          promos={promos}
          items={items}
          hoy={hoy}
          onEditar={setEditando}
          onBorrar={onBorrar}
          onEditarItem={setEditandoItem}
          onBorrarItem={onBorrarItem}
        />
      )}
      {tab === 'cumplimiento' && <Cumplimiento items={items} hechos={hechos} />}

      {sembrando && (
        <ModalSembrar
          plantilla={sembrando}
          moldes={items.filter((i) => i.plantilla === sembrando.key)}
          onCerrar={() => setSembrando(null)}
          onListo={async () => { setSembrando(null); await cargar() }}
        />
      )}

      {editando && (
        <ModalPromo inicial={editando} onCerrar={() => setEditando(null)} onGuardar={onGuardar} />
      )}
      {editandoItem && (
        <ModalItem inicial={editandoItem} onCerrar={() => setEditandoItem(null)} onGuardar={onGuardarItem} />
      )}
    </>
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

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: font.lg, fontWeight: weight.bold, color: color.ink, margin: 0 }}>{children}</h2>
  )
}

function Carga({
  promos,
  items,
  hoy,
  onEditar,
  onBorrar,
  onEditarItem,
  onBorrarItem,
}: {
  promos: Promo[]
  items: ItemAgenda[]
  hoy: string
  onEditar: (p: Promo) => void
  onBorrar: (p: Promo) => void
  onEditarItem: (i: ItemAgenda) => void
  onBorrarItem: (i: ItemAgenda) => void
}) {
  return (
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
          promos.map((p) => <FilaPromo key={p.id} p={p} hoy={hoy} onEditar={onEditar} onBorrar={onBorrar} />)
        )}
      </section>

      <section style={{ display: 'grid', gap: space[3] }}>
        <Titulo>☑ Pendientes y avisos</Titulo>
        {items.length === 0 ? (
          <EmptyState
            title="Todavía no hay ningún pendiente ni aviso cargado."
            hint="Entra sólo lo que se olvida: la rutina obvia no se carga."
            dashed
          />
        ) : (
          <ListaItems items={items} hoy={hoy} onEditar={onEditarItem} onBorrar={onBorrarItem} />
        )}
      </section>
    </div>
  )
}

/**
 * La lista de pendientes y avisos, con su barra de filtros.
 *
 * Existe como componente aparte —y no como cuatro `useState` adentro de `Carga`— porque los filtros
 * viven en la URL: se remonta con la pestaña, que es lo que hace que `useFiltroUrl` los relea.
 *
 * 🔑 **El filtro «de quién» sale de los ítems cargados** (`opcionesDeQuien`), no del padrón del
 * equipo: ése es admin-only y vive en otro sistema. El porqué, en `lib/agenda/index.ts`.
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
    { key: 'pendiente', label: 'Pendientes', n: filtrarItems(porClase, { clase: 'pendiente' }).length },
    { key: 'aviso', label: 'Avisos', n: filtrarItems(porClase, { clase: 'aviso' }).length },
    // Se nombra aparte porque no corre ningún día: mezclado con las rutinas se lee como una rota.
    { key: 'molde', label: 'Moldes', n: filtrarItems(porClase, { clase: 'molde' }).length, title: 'Los pasos que el ingreso clona. No corren solos.' },
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
  p,
  hoy,
  onEditar,
  onBorrar,
}: {
  p: Promo
  hoy: string
  onEditar: (p: Promo) => void
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
          <Button variant="ghost" size="sm" onClick={() => onEditar(p)}>Editar</Button>
          <Button variant="ghost" size="sm" onClick={() => onBorrar(p)}>Eliminar</Button>
        </div>
      </div>
    </Card>
  )
}

/**
 * Un pendiente en la lista de administración.
 *
 * Dice **a quién le llega** además de qué días toca: el destino es lo que decide si aparece en la
 * pantalla de alguien, y un pendiente que "no anda" casi siempre es un destino que no incluye a
 * quien lo busca.
 */
function FilaItem({
  i,
  hoy,
  onEditar,
  onBorrar,
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
            {/* Un molde no corre ningún día: sin esta chapita se lee «hoy no toca» y parece una
                rutina rota. Acá es donde se lo edita, así que acá es donde tiene que decirlo. */}
            {plantillaDe(i.plantilla) ? (
              <StatusPill tone="action" label={`molde · ${plantillaDe(i.plantilla)!.evento}`} />
            ) : !i.activo ? (
              <StatusPill tone="neutral" label="apagado" />
            ) : vaEl(i, hoy) ? (
              <StatusPill tone="success" label={i.clase === 'aviso' ? 'se avisa hoy' : 'toca hoy'} />
            ) : (
              <StatusPill tone="neutral" label="hoy no toca" />
            )}
          </div>
          <div style={{ fontSize: font.sm, color: color.mut, marginTop: 2 }}>
            {plantillaDe(i.plantilla)
              ? (() => {
                  const p = plantillaDe(i.plantilla)!
                  const dias = i.offsetDias ?? 0
                  // ⚠️ Un molde puede caer ANTES del hecho (la modelo, dos días antes de la sesión):
                  // «a los -2 días» se lee como un error de carga, así que se dice en castellano.
                  const cuando = dias === 0
                    ? `el día ${p.delHecho}`
                    : dias > 0
                      ? `a los ${dias} ${dias === 1 ? 'día' : 'días'} ${p.delHecho}`
                      : `${-dias} ${dias === -1 ? 'día' : 'días'} antes ${p.delHecho}`
                  // ⚠️ El eje se nombra sólo cuando corre en ALGUNOS. «todos» es el caso normal y
                  // escribirlo en cada renglón esconde justo los que sí cambian de dueña. Y la
                  // plantilla sin eje —el lanzamiento— no nombra nada: no hay nada que elegir.
                  const eje = p.eje
                  const enEje = eje ? ((i[eje.campo] ?? []) as string[]) : []
                  return `${cuando}${eje && enEje.length ? ` · sólo ${enEje.map(eje.rotulo).join(' o ')}` : ''}`
                })()
              : rotuloRegla(i.regla)} · {rotuloDestino(i.destino)}
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
