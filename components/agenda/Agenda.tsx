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
 * se contesta con el día, no con la grilla. El mes es contexto y llega en otra tanda.
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
  Button, Card, EmptyState, Esqueleto, Notice, StatusPill, Tabs,
  color, font, space, weight, useConfirmar, useToast, type TabItem,
} from '@/components/ui'
import {
  contarSinTildar, corre, hoyIso, pendientesDe, promosDe, rotuloBeneficio, rotuloRegla, vaEl,
  type ItemAgenda, type Promo,
} from '@/lib/agenda'
import { borrarItem, borrarPromo, guardarItem, guardarPromo } from '@/lib/agenda/cliente'
import { tituloLimpio } from '@/lib/nav'
import { FUNCIONES } from '@/lib/permisos'
import { useAgenda } from '@/store/useAgenda'
import { Cumplimiento } from './Cumplimiento'
import { ModalItem, itemVacio } from './ModalItem'
import { ModalPromo, promoVacia } from './ModalPromo'
import { PendientesHoy } from './PendientesHoy'
import { TarjetaPromo } from './TarjetaPromo'

export function Agenda() {
  const { marca } = useSesion()
  const { promos, items, hechos, puede, cargado, cargar } = useAgenda()
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const [tab, setTab] = useState<'hoy' | 'carga' | 'cumplimiento'>('hoy')
  const [editando, setEditando] = useState<Promo | null>(null)
  const [editandoItem, setEditandoItem] = useState<ItemAgenda | null>(null)

  const hoy = hoyIso()
  const deHoy = promosDe(promos, hoy, { marca })
  const pendientes = pendientesDe(items, hechos, hoy, { marca })

  const tabs: TabItem[] = [
    { key: 'hoy', label: 'Hoy' },
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
    toast.ok('Pendiente guardado.')
  }

  const onBorrarItem = async (i: ItemAgenda) => {
    const ok = await confirmar({
      titulo: 'Borrar el pendiente',
      // Que los tildes se van con él va escrito acá y no en un tooltip: es lo que no se puede
      // deshacer, y el interruptor de «apagado» existe justamente para no tener que borrar.
      mensaje: `${i.titulo} — se borran también los tildes que ya tenga. Si sólo querés dejar de verlo, apagalo.`,
      ok: 'Borrar el pendiente',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await borrarItem(i.id)
      await cargar()
      toast.ok('Pendiente borrado.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo borrar.')
    }
  }

  return (
    <>
      {puede.cargar && (
        <HeaderAcciones>
          <Button onClick={() => setEditando(promoVacia())}>Nueva promoción</Button>
          <Button variant="outline" onClick={() => setEditandoItem(itemVacio())}>Nuevo pendiente</Button>
        </HeaderAcciones>
      )}

      {tabs.length > 1 && (
        <div style={{ marginBottom: space[4] }}>
          <Tabs items={tabs} value={tab} onChange={(k) => setTab(k as typeof tab)} variant="underline" />
        </div>
      )}

      {tab === 'hoy' && <Hoy promos={deHoy} hoy={hoy} sinTildar={contarSinTildar(items, hechos, hoy, { marca })} hayPendientes={pendientes.length > 0} cargado={cargado} />}
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
 * cliente delante— y después lo que hay que hacer.
 */
function Hoy({
  promos,
  hoy,
  sinTildar,
  hayPendientes,
  cargado,
}: {
  promos: Promo[]
  hoy: string
  sinTildar: number
  hayPendientes: boolean
  cargado: boolean
}) {
  if (!cargado) return <Esqueleto />

  return (
    <div style={{ display: 'grid', gap: space[5] }}>
      <section style={{ display: 'grid', gap: space[3] }}>
        <Titulo>🏦 Promociones bancarias de hoy</Titulo>
        {promos.length === 0 ? (
          // El vacío es información, no una falla: "hoy no hay promo" es exactamente lo que hay que
          // poder contestarle al cliente, y hay que leerlo sin dudar de si la pantalla cargó.
          <EmptyState
            icon="🏦"
            title="Hoy no corre ninguna promoción bancaria."
            hint="Si el cliente pregunta, la respuesta es que hoy no hay."
          />
        ) : (
          promos.map((p) => <TarjetaPromo key={p.id} promo={p} />)
        )}
      </section>

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
        <Titulo>☑ Pendientes rutinarios</Titulo>
        {items.length === 0 ? (
          <EmptyState
            title="Todavía no hay ningún pendiente cargado."
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
            {!i.activo ? (
              <StatusPill tone="neutral" label="apagado" />
            ) : vaEl(i, hoy) ? (
              <StatusPill tone="success" label="toca hoy" />
            ) : (
              <StatusPill tone="neutral" label="hoy no toca" />
            )}
          </div>
          <div style={{ fontSize: font.sm, color: color.mut, marginTop: 2 }}>
            {rotuloRegla(i.regla)} · {rotuloDestino(i.destino)}
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

/** «a todo el equipo» · «a Local y Depósito» · «a quien usa Atención al cliente». */
function rotuloDestino(d: ItemAgenda['destino']): string {
  if (d.tipo === 'roles') {
    const labels = d.roles.map((r) => FUNCIONES.find((f) => f.key === r)?.label ?? r)
    return `a ${labels.join(' y ')}`
  }
  if (d.tipo === 'seccion') return `a quien usa ${tituloLimpio(d.key)}`
  return 'a todo el equipo'
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
