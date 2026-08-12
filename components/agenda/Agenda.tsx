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
import { corre, hoyIso, promosDe, rotuloBeneficio, rotuloRegla, type Promo } from '@/lib/agenda'
import { borrarPromo, guardarPromo } from '@/lib/agenda/cliente'
import { useAgenda } from '@/store/useAgenda'
import { ModalPromo, promoVacia } from './ModalPromo'
import { TarjetaPromo } from './TarjetaPromo'

export function Agenda() {
  const { marca } = useSesion()
  const { promos, puede, cargado, cargar } = useAgenda()
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const [tab, setTab] = useState<'hoy' | 'carga'>('hoy')
  const [editando, setEditando] = useState<Promo | null>(null)

  const hoy = hoyIso()
  const deHoy = promosDe(promos, hoy, { marca })

  const items: TabItem[] = [
    { key: 'hoy', label: 'Hoy' },
    ...(puede.cargar
      ? [{ key: 'carga', label: 'Cargar', hint: 'Alta y edición de las promociones' } as TabItem]
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

  return (
    <>
      {puede.cargar && (
        <HeaderAcciones>
          <Button onClick={() => setEditando(promoVacia())}>Nueva promoción</Button>
        </HeaderAcciones>
      )}

      {items.length > 1 && (
        <div style={{ marginBottom: space[4] }}>
          <Tabs items={items} value={tab} onChange={(k) => setTab(k as typeof tab)} variant="underline" />
        </div>
      )}

      {tab === 'hoy' ? (
        <Hoy promos={deHoy} cargado={cargado} />
      ) : (
        <Carga
          promos={promos}
          hoy={hoy}
          onEditar={setEditando}
          onBorrar={onBorrar}
        />
      )}

      {editando && (
        <ModalPromo inicial={editando} onCerrar={() => setEditando(null)} onGuardar={onGuardar} />
      )}
    </>
  )
}

function Hoy({ promos, cargado }: { promos: Promo[]; cargado: boolean }) {
  if (!cargado) return <Esqueleto />

  if (promos.length === 0) {
    // El vacío es información, no una falla: "hoy no hay promo" es exactamente lo que hay que poder
    // contestarle al cliente, y hay que poder leerlo sin dudar de si la pantalla cargó.
    return (
      <EmptyState
        icon="🏦"
        title="Hoy no corre ninguna promoción bancaria."
        hint="Si el cliente pregunta, la respuesta es que hoy no hay."
      />
    )
  }

  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      {promos.map((p) => <TarjetaPromo key={p.id} promo={p} />)}
    </div>
  )
}

function Carga({
  promos,
  hoy,
  onEditar,
  onBorrar,
}: {
  promos: Promo[]
  hoy: string
  onEditar: (p: Promo) => void
  onBorrar: (p: Promo) => void
}) {
  if (promos.length === 0) {
    return <EmptyState title="Todavía no hay ninguna promoción cargada." dashed />
  }

  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <Notice tone="neutral">
        Acá están <b>todas</b>, incluidas las apagadas y las vencidas. En «Hoy» sólo se ve lo que corre
        hoy — es lo que ve el mostrador.
      </Notice>

      {promos.map((p) => (
        <Card key={p.id}>
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
      ))}
    </div>
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
