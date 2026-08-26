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

import { useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { HeaderAcciones } from '@/components/layout/acciones'
import {
  Button, Card, EmptyState, Esqueleto, Field, Input, Modal, Notice, Select, StatusPill, Tabs,
  color, font, space, weight, useConfirmar, useToast, type TabItem,
} from '@/components/ui'
import {
  avisosDe, contarSinTildar, corre, hoyIso, moldeCorreEn, moldeCorreEnMarca, pendientesDe, promosDe,
  PUERTAS, rotuloBeneficio, rotuloDestino, rotuloPuerta, rotuloRegla, vaEl,
  type ItemAgenda, type Promo, type Puerta,
} from '@/lib/agenda'
import type { Marca } from '@/lib/nav.datos'
import { borrarItem, borrarPromo, guardarItem, guardarPromo, sembrarIngreso } from '@/lib/agenda/cliente'
import { useAgenda } from '@/store/useAgenda'
import { AvisosHoy } from './AvisosHoy'
import { Cumplimiento } from './Cumplimiento'
import { GrillaMes } from './GrillaMes'
import { MARCAS, ModalItem, itemVacio } from './ModalItem'
import { ModalPromo, promoVacia } from './ModalPromo'
import { PendientesHoy } from './PendientesHoy'
import { TarjetaPromo } from './TarjetaPromo'

export function Agenda() {
  const { marca } = useSesion()
  const { promos, items, hechos, puede, cargado, cargar } = useAgenda()
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const [tab, setTab] = useState<'hoy' | 'mes' | 'carga' | 'cumplimiento'>('hoy')
  const [editando, setEditando] = useState<Promo | null>(null)
  const [editandoItem, setEditandoItem] = useState<ItemAgenda | null>(null)
  const [sembrando, setSembrando] = useState(false)

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

  const onGuardar = async (p: Promo) => {
    await guardarPromo(p)
    await cargar()
    toast.ok('Promoción guardada.')
  }

  const onBorrar = async (p: Promo) => {
    const ok = await confirmar({
      titulo: 'Borrar la promoción',
      mensaje: `${p.banco} · ${rotuloBeneficio(p.beneficio)}`,
      ok: 'Borrar la promoción',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await borrarPromo(p.id)
      await cargar()
      toast.ok('Promoción borrada.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo borrar.')
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
      titulo: esAviso ? 'Borrar el aviso' : 'Borrar el pendiente',
      // Que los tildes se van con él va escrito acá y no en un tooltip: es lo que no se puede
      // deshacer, y el interruptor de «apagado» existe justamente para no tener que borrar. Un
      // aviso no tiene tildes que perder, así que no se le advierte de algo que no le pasa.
      mensaje: esAviso
        ? `${i.titulo} — si sólo querés dejar de verlo, apagalo.`
        : `${i.titulo} — se borran también los tildes que ya tenga. Si sólo querés dejar de verlo, apagalo.`,
      ok: esAviso ? 'Borrar el aviso' : 'Borrar el pendiente',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await borrarItem(i.id)
      await cargar()
      toast.ok(esAviso ? 'Aviso borrado.' : 'Pendiente borrado.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo borrar.')
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
            🔑 **Es el disparador del ingreso, y existe porque hoy no existe ninguno**: dos manuales
            se apoyan en «el aviso de ingreso de Administración» y ese aviso era una persona
            acordándose. Siembra los pasos que estén cargados como molde, con la fecha del ingreso.
          */}
          <Button variant="outline" onClick={() => setSembrando(true)}>Ingresó mercadería</Button>
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
      {tab === 'mes' && <GrillaMes />}
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
        <ModalIngreso
          moldes={items.filter((i) => i.plantilla === 'ingreso')}
          onCerrar={() => setSembrando(false)}
          onListo={async () => { setSembrando(false); await cargar() }}
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
          items.map((i) => (
            <FilaItem key={i.id} i={i} hoy={hoy} onEditar={onEditarItem} onBorrar={onBorrarItem} />
          ))
        )}
      </section>
    </div>
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
          <Button variant="ghost" size="sm" onClick={() => onBorrar(p)}>Borrar</Button>
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
            {i.plantilla === 'ingreso' ? (
              <StatusPill tone="action" label="molde · lista de ingreso" />
            ) : !i.activo ? (
              <StatusPill tone="neutral" label="apagado" />
            ) : vaEl(i, hoy) ? (
              <StatusPill tone="success" label={i.clase === 'aviso' ? 'se avisa hoy' : 'toca hoy'} />
            ) : (
              <StatusPill tone="neutral" label="hoy no toca" />
            )}
          </div>
          <div style={{ fontSize: font.sm, color: color.mut, marginTop: 2 }}>
            {i.plantilla === 'ingreso'
              ? `a los ${i.offsetDias ?? 0} días del ingreso${
                  // ⚠️ Se nombra sólo cuando corre en ALGUNAS. «las cuatro» es el caso normal y
                  // escribirlo en cada renglón esconde justo los dos que sí cambian de dueña.
                  i.puertas && i.puertas.length
                    ? ` · sólo si entra por ${i.puertas.map(rotuloPuerta).join(' o ')}`
                    : ''
                }`
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
          <Button variant="ghost" size="sm" onClick={() => onBorrar(i)}>Borrar</Button>
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

/**
 * «Ingresó mercadería» — el disparador de la lista corta.
 *
 * 🔴 **Existe porque hoy el disparador es una persona acordándose.** Dos manuales («Sesiones de
 * fotos» y «Cómo se lanza un producto») se apoyan en un aviso de ingreso automático que nunca
 * existió, y el flujo que dispara —nombre → descripción → precio → foto → publicación → pantallas—
 * es, según el manual, **el que más se cae**: al no haber fecha grande, nadie lo mira.
 *
 * 🔑 **No inventa los renglones**: clona los ítems marcados como molde. Si no hay ninguno lo dice y
 * no siembra nada — es preferible a crear seis pendientes de mentira que después nadie tilda.
 */
function ModalIngreso({ moldes, onCerrar, onListo }: {
  moldes: ItemAgenda[]
  onCerrar: () => void
  onListo: () => Promise<void>
}) {
  const toast = useToast()
  const [nombre, setNombre] = useState('')
  const [fecha, setFecha] = useState(hoyIso())
  // 🔴 **Arranca vacía y no en «importación»**, que es la puerta más común. Un default acá se
  // contesta solo: el que carga aprieta sin mirar y los dos pasos que cambian de dueña quedan mal
  // puestos, que es peor que no sembrar — un pendiente que ya tiene nombre no lo revisa nadie.
  const [puerta, setPuerta] = useState<Puerta | ''>('')
  // 🔴 Y la marca arranca vacía por el mismo motivo, ⛔ no en la del header: el que carga puede
  // estar mirando BDI y estar sembrando el ingreso de ropa. Un default que casi siempre acierta es
  // el peor de todos — el día que se equivoca nadie lo mira, porque nadie eligió nada.
  const [marcaIngreso, setMarcaIngreso] = useState<Marca | ''>('')
  const [guardando, setGuardando] = useState(false)

  // Cuántos renglones va a crear ESTA combinación. El total no sirve: los pasos que cambian de
  // dueña están cargados uno por puerta y por marca, así que decir «se van a crear 16» sería
  // mentir en las ocho. Las dos preguntas son las mismas que hace el servidor al sembrar.
  const listo = !!puerta && !!marcaIngreso
  const paraEsta = listo
    ? moldes.filter((m) => moldeCorreEn(m.puertas, puerta as Puerta) && moldeCorreEnMarca(m.marcas, marcaIngreso as Marca))
    : []

  async function sembrar() {
    if (!nombre.trim() || !listo) return
    setGuardando(true)
    try {
      const r = await sembrarIngreso(nombre.trim(), fecha, puerta as Puerta, marcaIngreso as Marca)
      if (r.ya) toast.ok('Ese ingreso ya estaba cargado: no se duplicó nada.')
      else toast.ok(`Listo: ${r.creados} ${r.creados === 1 ? 'pendiente' : 'pendientes'}.`)
      await onListo()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo sembrar el ingreso.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Ingresó mercadería"
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button
            variant="solid"
            tone="brand"
            loading={guardando}
            disabled={!nombre.trim() || !listo || paraEsta.length === 0}
            onClick={() => void sembrar()}
          >
            Cargar los pendientes
          </Button>
        </>
      }
    >
      {moldes.length === 0 ? (
        <Notice tone="warning">
          <b>Todavía no hay ningún paso cargado como molde.</b> Se cargan una sola vez desde «Nuevo
          pendiente», tildando «Es un paso de la lista de ingreso» y poniéndole la dueña y a los
          cuántos días va. Después, cada ingreso los clona solo.
        </Notice>
      ) : (
        <>
          <Field
            label="Qué entró"
            hint="Va adelante del título de cada pendiente, así se agrupan de un vistazo. Ej: «IMP2», «Camperas invierno»."
          >
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="IMP2" />
          </Field>
          <div style={{ marginTop: space[3] }}>
            <Field label="Cuándo entró" hint="Desde acá se cuentan los días de cada paso." width={200}>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
          </div>
          {/*
            🔑 **Por dónde entró.** El nombre y la descripción cambian de dueña según la puerta —lo
            cierra el manual «El nombre y la descripción del producto»—, así que sin esto los dos
            renglones que más se caen salen con la persona equivocada.

            ⚠️ Va **sin opción vacía elegible**: el placeholder es un `disabled`, no un «cualquiera».
          */}
          <div style={{ marginTop: space[3] }}>
            <Field
              label="Por dónde entró"
              hint="Decide quién pone el nombre y quién escribe la descripción. Los otros pasos no cambian."
              width={280}
            >
              <Select value={puerta} onChange={(e) => setPuerta(e.target.value as Puerta | '')}>
                <option value="" disabled>Elegí la puerta…</option>
                {PUERTAS.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </Select>
            </Field>
            {puerta && (
              <div style={{ marginTop: space[2], color: color.mut, fontSize: font.sm }}>
                {PUERTAS.find((p) => p.key === puerta)?.ayuda}
              </div>
            )}
          </div>
          {/*
            🔑 **De qué marca es el ingreso**, y es una pregunta aparte de la puerta: las cuatro
            puertas existen en los dos negocios. Lo que cambia con la marca es quién escribe la
            descripción de una compra nacional —el local si es ropa de Zattia, Administración si son
            fundas de BDI—, así que sin esto ese renglón sale duplicado en cada ingreso nacional.
          */}
          <div style={{ marginTop: space[3] }}>
            <Field
              label="De qué marca"
              hint="El renglón nace en esta marca, y algunos pasos son de una sola."
              width={280}
            >
              <Select value={marcaIngreso} onChange={(e) => setMarcaIngreso(e.target.value as Marca | '')}>
                <option value="" disabled>Elegí la marca…</option>
                {MARCAS.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div style={{ marginTop: space[3], color: color.mut, fontSize: font.sm }}>
            {!listo ? (
              <>Elegí la puerta y la marca para ver cuántos pendientes se van a crear.</>
            ) : paraEsta.length === 0 ? (
              <>
                <b>
                  Ninguno de los {moldes.length} moldes cargados corre para «{rotuloPuerta(puerta as Puerta)}»
                  {' '}en {MARCAS.find((m) => m.key === marcaIngreso)?.label}.
                </b>{' '}
                Revisá en «Cargar» en qué puertas y en qué marcas corre cada paso.
              </>
            ) : (
              <>
                Se van a crear <b>{paraEsta.length}</b>{' '}
                {paraEsta.length === 1 ? 'pendiente' : 'pendientes'}, cada uno con su dueña. El mismo
                ingreso cargado dos veces no los duplica.
              </>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}
