'use client'

/**
 * Los canjes de la marca. Dos vistas del mismo dato:
 *  - **Canjes**: todos, filtrables por estado.
 *  - **Aprobaciones**: sólo lo que espera una firma. Es lo que más traba el flujo — sin aprobar no
 *    se genera el link, y sin link ella no manda la dirección.
 *
 * Los canjes de otras marcas **no aparecen acá**: esta lista es operativa, y sobre un canje de
 * otra marca no hay nada que hacer. Sí aparecen (en modo ciego) en la ficha de la persona, que es
 * donde importa saber que existieron.
 */

import { useMemo, useState } from 'react'
import {
  Badge, Chips, EmptyState, StatusPill, TableWrap, THead, TBody, Tr, Th, Td,
  color, font, space, weight, type ChipOpt, type Tone,
} from '@/components/ui'
import { esCiego, type CanjeVencido, type CanjeVisible } from '@/lib/canjes/cliente'
import {
  STORE_LABEL, estadoEnCriollo, nombrePersona, numeroCanje,
  type CanjePersona, type CanjeRow, type EstadoCanje,
} from '@/lib/canjes/tipos'

const ESTADO_TONE: Record<EstadoCanje, Tone> = {
  borrador: 'neutral',
  propuesta: 'warning',
  rechazado: 'neutral',
  acuerdo: 'action',
  preparando: 'action',
  en_curso: 'brand',
  cerrado: 'success',
  cancelado: 'neutral',
}

type Filtro = 'abiertos' | 'aprobacion' | 'vencidos' | 'cerrados' | 'todos'

/** Lo que sigue pidiendo trabajo de alguien. Es el default: la lista es para trabajar. */
const ABIERTOS: EstadoCanje[] = ['borrador', 'propuesta', 'acuerdo', 'preparando', 'en_curso']

export function ListaCanjes({
  canjes, personas, vencidos, soloAprobaciones, onAbrir,
}: {
  canjes: CanjeVisible[]
  personas: CanjePersona[]
  vencidos: CanjeVencido[]
  /** La pestaña Aprobaciones: fija el filtro y saca los chips. */
  soloAprobaciones?: boolean
  onAbrir: (id: number) => void
}) {
  const [filtro, setFiltro] = useState<Filtro>('abiertos')
  const nombrePorId = useMemo(() => new Map(personas.map((p) => [p.id, nombrePersona(p)])), [personas])
  const vencidoPorCanje = useMemo(() => new Map(vencidos.map((v) => [v.canjeId, v.cuantas])), [vencidos])

  // Los ciegos se sacan de una: sobre un canje de otra marca no hay nada que hacer desde acá.
  const propios = useMemo(() => canjes.filter((c) => !esCiego(c)) as CanjeRow[], [canjes])

  const chips = useMemo<ChipOpt<Filtro>[]>(() => [
    { key: 'abiertos', label: 'Abiertos', n: propios.filter((c) => ABIERTOS.includes(c.estado)).length },
    { key: 'aprobacion', label: 'Esperando firma', n: propios.filter((c) => c.estado === 'propuesta').length },
    { key: 'vencidos', label: 'Con vencidos', n: propios.filter((c) => vencidoPorCanje.has(c.id)).length },
    { key: 'cerrados', label: 'Cerrados', n: propios.filter((c) => c.estado === 'cerrado').length },
    { key: 'todos', label: 'Todos', n: propios.length },
  ], [propios, vencidoPorCanje])

  const visibles = useMemo(() => {
    const f = soloAprobaciones ? 'aprobacion' : filtro
    const lista = propios.filter((c) => {
      if (f === 'abiertos') return ABIERTOS.includes(c.estado)
      if (f === 'aprobacion') return c.estado === 'propuesta'
      if (f === 'vencidos') return vencidoPorCanje.has(c.id)
      if (f === 'cerrados') return c.estado === 'cerrado'
      return true
    })
    // Lo más nuevo arriba, salvo en Aprobaciones: ahí lo que espera hace más tiempo va primero,
    // porque es lo que más traba.
    return lista.sort((a, b) =>
      f === 'aprobacion'
        ? Date.parse(a.created_at) - Date.parse(b.created_at)
        : Date.parse(b.created_at) - Date.parse(a.created_at),
    )
  }, [propios, filtro, soloAprobaciones, vencidoPorCanje])

  if (!propios.length) {
    return (
      <EmptyState
        dashed
        title="Todavía no hay canjes de esta marca"
        hint="Se arma desde la ficha de una persona del padrón, con el botón “Proponerle un canje”."
      />
    )
  }

  return (
    <>
      {!soloAprobaciones && (
        <div style={{ marginBottom: space[3] }}>
          <Chips opciones={chips} value={filtro} onChange={setFiltro} />
        </div>
      )}

      {!visibles.length ? (
        <EmptyState
          dashed
          title={soloAprobaciones ? 'No hay nada esperando tu firma' : 'Nada con ese filtro'}
          hint={soloAprobaciones ? 'Cuando marketing mande un canje a aprobar, aparece acá.' : undefined}
        />
      ) : (
        <TableWrap>
          <THead>
            <Tr>
              <Th width={80}>Nº</Th>
              <Th>Con quién</Th>
              <Th>Estado</Th>
              <Th>Marca</Th>
              <Th align="right">Tope</Th>
              <Th>Desde</Th>
            </Tr>
          </THead>
          <TBody>
            {visibles.map((c) => {
              const cuantas = vencidoPorCanje.get(c.id)
              return (
                <Tr key={c.id} onClick={() => onAbrir(c.id)} style={{ cursor: 'pointer' }}>
                  <Td mono strong>{c.numero || numeroCanje(c.id)}</Td>
                  <Td>
                    {nombrePorId.get(c.persona_id) || '—'}
                    {c.titulo ? <span style={{ color: color.mut }}> · {c.titulo}</span> : null}
                  </Td>
                  <Td>
                    <span style={{ display: 'flex', gap: space[1], alignItems: 'center', flexWrap: 'wrap' }}>
                      <StatusPill tone={ESTADO_TONE[c.estado]} label={estadoEnCriollo(c)} />
                      {/* El vencido se marca acá y no en un aviso aparte: es la fila donde se
                          resuelve. */}
                      {cuantas ? (
                        <Badge tone="danger" subtle>
                          {cuantas === 1 ? '1 vencido' : `${cuantas} vencidos`}
                        </Badge>
                      ) : null}
                      {c.cerrado_incompleto ? <Badge tone="warning" subtle>Cerrado igual</Badge> : null}
                      {c.producto_no_conservado ? <Badge tone="danger" subtle>No lo conservó</Badge> : null}
                    </span>
                  </Td>
                  <Td><Badge tone="neutral" subtle>{STORE_LABEL[c.store]}</Badge></Td>
                  <Td align="right">
                    {c.tope_tipo === 'monto'
                      ? (c.tope_pvp != null ? `$${Number(c.tope_pvp).toLocaleString('es-AR')}` : '—')
                      : `${(c.tope_unidades || []).reduce((a, u) => a + (Number(u.cantidad) || 0), 0)} u.`}
                  </Td>
                  <Td>{(c.acordado_at || c.created_at).slice(0, 10)}</Td>
                </Tr>
              )
            })}
          </TBody>
        </TableWrap>
      )}

      {/* El recordatorio de puesta en marcha que el plan marca como el más fácil de olvidar. */}
      {soloAprobaciones && !visibles.length && propios.some((c) => c.estado === 'propuesta') && (
        <div style={{ marginTop: space[3], color: color.mut, fontSize: font.sm }}>
          <span style={{ fontWeight: weight.medium }}>Ojo:</span> hay canjes esperando firma pero no
          tenés el permiso para verlos. Los sub-permisos de Canjes no se heredan de la función: hay
          que tildarlos en Config, en cada marca.
        </div>
      )}
    </>
  )
}
