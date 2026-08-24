'use client'

/**
 * Los canjes. Dos vistas del mismo dato:
 *  - **Canjes**: todos, filtrables por estado, marca, persona y fecha.
 *  - **Aprobaciones**: sólo lo que espera una firma. Es lo que más traba el flujo — sin aprobar no
 *    se genera el link, y sin link ella no manda la dirección.
 *
 * ⚠️ **La lista mezcla marcas**: el servidor manda los canjes de todas las que uno puede ver
 * (`api/_canjes.js`, `.in('store', visibles)`), no los de la marca elegida arriba. Por eso hay una
 * columna Marca y por eso el filtro de marca es real. Lo que **no** aparece acá son los canjes
 * *ciegos* —los de una marca que uno no tiene permitida—: sobre esos no hay nada que hacer. Sí
 * aparecen, en modo ciego, en la ficha de la persona, que es donde importa saber que existieron.
 *
 * El orden y el filtrado viven en `lib/canjes/lista.ts`, no acá: el orden de esta pantalla es una
 * decisión de negocio ("primero lo que espera algo nuestro") y tiene que poder probarse sin montar
 * un componente.
 */

import { useMemo } from 'react'
import {
  Badge, BuscarInput, Chips, ContadorFiltro, EmptyState, FilterBar, Input, Select, StatusPill,
  TableWrap, THead, TBody, Tr, Th, Td, useFiltroUrl,
  color, font, space, weight, type ChipOpt, type Tone,
} from '@/components/ui'
import { esCiego, type CanjeSinRevisar, type CanjeVencido, type CanjeVisible } from '@/lib/canjes/cliente'
import {
  ABIERTOS, decorarCanjes, filtrarCanjes, ordenarCanjes,
  type CtxLista, type FiltroEstado,
} from '@/lib/canjes/lista'
import {
  CANJE_STORES, STORE_LABEL, enTransito, estadoEnCriollo, nombrePersona, numeroCanje,
  type CanjePersona, type CanjeRow, type CanjeStore, type EstadoCanje,
} from '@/lib/canjes/tipos'

const ESTADO_TONE: Record<EstadoCanje, Tone> = {
  propuesta: 'warning',
  enviada: 'warning',
  rechazado: 'neutral',
  no_acepto: 'neutral',
  acuerdo: 'action',
  preparando: 'action',
  en_curso: 'brand',
  cerrado: 'success',
  cancelado: 'neutral',
}

export function ListaCanjes({
  canjes, personas, vencidos, sinRevisar, marcasVisibles, claveUrl, soloAprobaciones, onAbrir,
}: {
  canjes: CanjeVisible[]
  personas: CanjePersona[]
  vencidos: CanjeVencido[]
  /** Resumido por el servidor: cuánto material subió ella y nadie miró, por canje. */
  sinRevisar: CanjeSinRevisar[]
  /** Para el filtro de marca. Con una sola no se dibuja: sería un control que no hace nada. */
  marcasVisibles: CanjeStore[]
  /**
   * El prefijo de las claves en la URL. Este componente se monta **dos veces** (Canjes y
   * Aprobaciones) y `useFiltroUrl` lee la URL una sola vez al montar: sin prefijo, las dos pestañas
   * se pisarían el filtro entre sí. Va de la mano del `key` con el que lo monta `Canjes.tsx`.
   */
  claveUrl: string
  /** La pestaña Aprobaciones: fija el filtro de estado y saca los chips. */
  soloAprobaciones?: boolean
  onAbrir: (id: number) => void
}) {
  const [filtro, setFiltro] = useFiltroUrl<FiltroEstado>(`${claveUrl}est`, 'abiertos')
  const [marca, setMarca] = useFiltroUrl<CanjeStore | 'todas'>(`${claveUrl}marca`, 'todas')
  const [q, setQ] = useFiltroUrl<string>(`${claveUrl}q`, '')
  const [desde, setDesde] = useFiltroUrl<string>(`${claveUrl}desde`, '')
  const [hasta, setHasta] = useFiltroUrl<string>(`${claveUrl}hasta`, '')

  const ctx = useMemo<CtxLista>(() => ({
    personas: new Map(personas.map((p) => [p.id, { nombre: nombrePersona(p), instagram: p.instagram }])),
    vencidos: new Map(vencidos.map((v) => [v.canjeId, v.cuantas])),
    sinRevisar: new Map(sinRevisar.map((v) => [v.canjeId, v.cuantas])),
  }), [personas, vencidos, sinRevisar])

  // Los ciegos se sacan de una: sobre un canje de una marca que no tenemos no hay nada que hacer
  // desde acá. El cast se queda en este borde y `lib/canjes/lista.ts` no ve la unión nunca.
  const propios = useMemo(
    () => decorarCanjes(canjes.filter((c) => !esCiego(c)) as CanjeRow[], ctx),
    [canjes, ctx],
  )

  // Los contadores de los chips miran lo filtrado por marca, texto y fecha, pero no por estado: son
  // justamente lo que hay que mirar para elegir estado.
  const sinEstado = useMemo(
    () => filtrarCanjes(propios, { estado: 'todos', store: marca, q, desde, hasta }),
    [propios, marca, q, desde, hasta],
  )

  const chips = useMemo<ChipOpt<FiltroEstado>[]>(() => [
    { key: 'abiertos', label: 'Abiertos', n: sinEstado.filter((c) => ABIERTOS.includes(c._tramo)).length },
    { key: 'respuesta', label: 'Esperando respuesta', n: sinEstado.filter((c) => c.estado === 'enviada').length },
    { key: 'aprobacion', label: 'Esperando firma', n: sinEstado.filter((c) => c.estado === 'propuesta').length },
    // La cola de la encargada: despachado y sin llegar. No es un estado nuevo —`estadoEnCriollo` ya
    // los llama "En tránsito"— sino la lista que se revisa todos los días.
    { key: 'transito', label: 'En tránsito', n: sinEstado.filter(enTransito).length },
    { key: 'vencidos', label: 'Con vencidos', n: sinEstado.filter((c) => c._vencidos > 0).length },
    // Lo que ella ya mandó y nadie miró. Va al lado de los vencidos a propósito: son las dos caras
    // del mismo tramo, y hasta ahora sólo se veía la que le reclama a ella.
    { key: 'sin-revisar', label: 'Contenido sin revisar', n: sinEstado.filter((c) => c._sinRevisar > 0).length },
    { key: 'cerrados', label: 'Cerrados', n: sinEstado.filter((c) => c.estado === 'cerrado').length },
    { key: 'todos', label: 'Todos', n: sinEstado.length },
  ], [sinEstado])

  const visibles = useMemo(
    () => ordenarCanjes(
      filtrarCanjes(propios, {
        estado: soloAprobaciones ? 'aprobacion' : filtro, store: marca, q, desde, hasta,
      }),
    ),
    [propios, filtro, soloAprobaciones, marca, q, desde, hasta],
  )

  if (!propios.length) {
    return (
      <EmptyState
        dashed
        title="Todavía no hay canjes de esta marca"
        hint="Se arma desde el padrón, con el botón “+ canje” de la fila de la persona."
      />
    )
  }

  return (
    <>
      <FilterBar>
        <BuscarInput value={q} onChange={setQ} placeholder="Buscar por persona, @ o Nº" />
        {/* El selector de marca sólo aparece cuando hay más de una a la vista: con una sola sería
            un control que no puede cambiar nada. */}
        {marcasVisibles.length > 1 && (
          <Select
            value={marca}
            aria-label="Filtrar por marca"
            onChange={(e) => setMarca(e.target.value as CanjeStore | 'todas')}
          >
            <option value="todas">Todas las marcas</option>
            {CANJE_STORES.filter((s) => marcasVisibles.includes(s)).map((s) => (
              <option key={s} value={s}>{STORE_LABEL[s]}</option>
            ))}
          </Select>
        )}
        {/* El rango va contra la misma fecha que dibuja la columna "Desde" (`fechaDeLista`). */}
        <Input type="date" value={desde} aria-label="Desde" onChange={(e) => setDesde(e.target.value)} />
        <Input type="date" value={hasta} aria-label="Hasta" onChange={(e) => setHasta(e.target.value)} />
        <ContadorFiltro n={visibles.length} singular="canje" plural="canjes" />
      </FilterBar>

      {!soloAprobaciones && (
        <div style={{ margin: `${space[3]} 0` }}>
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
              const cuantas = c._vencidos
              return (
                <Tr key={c.id} onClick={() => onAbrir(c.id)} style={{ cursor: 'pointer' }}>
                  <Td mono strong>{c.numero || numeroCanje(c.id)}</Td>
                  <Td>
                    {c._persona || '—'}
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
                      {/* Trabajo hecho que está esperando: es lo único de esta fila que no le
                          reclama nada a ella, nos lo reclama a nosotros. */}
                      {c._sinRevisar ? (
                        <Badge tone="brand" subtle>
                          {c._sinRevisar === 1 ? '1 sin revisar' : `${c._sinRevisar} sin revisar`}
                        </Badge>
                      ) : null}
                      {c.cerrado_incompleto ? <Badge tone="warning" subtle>Cerrado igual</Badge> : null}
                      {/* Cerrado y sin contestar si sirvió. Es la única pregunta del canje que se
                          hace DESPUÉS de cerrarlo, así que sin esta chapita no la ve nadie. */}
                      {c.estado === 'cerrado' && !c.resultado ? (
                        <Badge tone="neutral" subtle>¿Rindió? sin contestar</Badge>
                      ) : null}
                      {c.producto_no_conservado ? <Badge tone="danger" subtle>No lo conservó</Badge> : null}
                    </span>
                  </Td>
                  <Td><Badge tone="neutral" subtle>{STORE_LABEL[c.store]}</Badge></Td>
                  <Td align="right">
                    {c.tope_tipo === 'monto'
                      ? (c.tope_pvp != null ? `$${Number(c.tope_pvp).toLocaleString('es-AR')}` : '—')
                      : `${(c.tope_unidades || []).reduce((a, u) => a + (Number(u.cantidad) || 0), 0)} u.`}
                  </Td>
                  {/* La misma fecha contra la que corre el filtro de rango: si acá se dibujara otra,
                      un canje se vería con fecha 3-ago y no entraría en un rango que la incluye. */}
                  <Td>{c._fecha}</Td>
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
