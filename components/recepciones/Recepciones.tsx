'use client'

/**
 * "Ingresos" (key `recepciones`, área Compras). ⛔ No confundir con `ingresos` («Ingresos
 * proyectados»), que es lo que VIENE: ésta es lo que LLEGÓ. Se llamó "Lo que entró" hasta el
 * 27-ago-2026, cuando Bruno la renombró al nombre con que el equipo llama al sistema de Gerardo.
 *
 * # Qué hueco tapa
 *
 * El monitor sabía **lo que se pidió** (la sección `ingresos`: las importaciones proyectadas) y
 * **lo que se vendió** (el espejo de Gestión Nube). Entre las dos no había nada: qué llegó de
 * verdad, cuánto se contó contra lo pedido y de qué proveedor. Eso vivía sólo en el sistema de
 * Ingresos, que es otra app en otro servidor.
 *
 * ⛔ **Acá no se carga nada a mano y no hay ningún botón que escriba.** Las filas llegan solas por
 * webhook cuando alguien confirma una orden de compra del otro lado. Si un dato está mal, se
 * corrige allá y se vuelve a confirmar: el evento nuevo pisa la fila.
 *
 * ⛔ **No es «Ingresos proyectados»**, que es la importación de fundas *que viene* (sólo BDI, en el
 * KV de bdi-catalogo). Ésta es la que *llegó*, para las dos marcas.
 *
 * 🔑 **La pantalla está armada para decidir, no para archivar.** Primero contesta «¿este proveedor
 * entrega lo que le pedimos?», después «¿qué OC no cerró?», y recién al final la lista.
 */

import { useSearchParams } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import {
  Badge,
  Chips,
  EmptyState,
  Esqueleto,
  FilterBar,
  KpiCard,
  Notice,
  SectionCard,
  TBody,
  TableWrap,
  THead,
  Td,
  Th,
  Tr,
  color,
  space,
  type Tone,
} from '@/components/ui'
import { fechaDeIngreso, ocPorRef, porProveedor, porcentaje, resumen, tonoDeCumplimiento, type Recepcion } from '@/lib/recepciones/core'
import { useRecepciones } from './useRecepciones'
import { DetalleOC } from './DetalleOC'

/** Las ventanas que se ofrecen. Es un filtro con nombre, no un default escondido. */
const VENTANAS = [90, 180, 365] as const
type Dias = (typeof VENTANAS)[number]

const TONOS: Record<ReturnType<typeof tonoDeCumplimiento>, Tone> = {
  ok: 'success',
  aviso: 'warning',
  malo: 'danger',
  neutro: 'neutral',
}

/** Cuánto hace del último evento, en criollo. `null` = nunca llegó nada. */
function haceCuanto(iso: string | null): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const horas = Math.floor((Date.now() - t) / 3600000)
  if (horas < 1) return 'hace menos de una hora'
  if (horas < 24) return `hace ${horas} h`
  return `hace ${Math.floor(horas / 24)} días`
}

export function Recepciones() {
  const { marca } = useSesion()
  const [dias, setDias] = useState<Dias>(180)
  const { recepciones, eventos, puede, cargando, error } = useRecepciones(marca, dias)

  /*
    🆕 **Se puede llegar a UNA orden por la URL** (1-sep-2026, pedido de Bruno: *«si apretás la OC,
    que vaya a la OC para ver los productos»*, desde la Agenda). `router.push('/recepciones?oc=…')`.

    🔑 **El valor inicial sale de `useSearchParams()` y ⛔ no de `window.location.search`**: se llega
    con un `push` del router y no está garantizado que el History haya corrido cuando esta sección
    monta. Es el mismo problema que ya pagó `useCampaniaAbierta` con `?liq=`, y la misma salida.

    🔑 **Y se resuelve contra el ID *o* el RÓTULO**, porque de los dos lados hay uno distinto: la
    pregunta de la puerta guarda el id (`store:oc_id`) y un renglón sembrado sólo tiene el rótulo
    de la orden en su título. Aceptar los dos evita una migración de los clones ya sembrados.
  */
  const sp = useSearchParams()
  const [abierta, setAbiertaState] = useState<string | null>(() => sp.get('oc') || null)
  const setAbierta = useCallback((v: string | null) => {
    setAbiertaState(v)
    const url = new URL(window.location.href)
    if (v) url.searchParams.set('oc', v)
    else url.searchParams.delete('oc')
    window.history.replaceState(null, '', url)
  }, [])

  const res = useMemo(() => resumen(recepciones), [recepciones])
  const proveedores = useMemo(() => porProveedor(recepciones), [recepciones])
  const desde = haceCuanto(eventos.ultimo)

  if (!marca) return null
  if (abierta) {
    // 🔑 La resolución vive en el núcleo (`ocPorRef`) y ⛔ no acá: el id le gana al rótulo, y ese
    // orden es una regla con test, no un detalle de esta pantalla.
    const fila = ocPorRef(recepciones, abierta)
    /*
      🔴 **Mientras carga ⛔ no se dice que no está.** La lista llega por red: dibujar «no encontré
      esa orden» durante ese segundo es afirmar algo falso, y quien lo lea se va.
    */
    if (cargando) return <Esqueleto />
    if (fila) return <DetalleOC marca={marca} oc={fila.id} onCerrar={() => setAbierta(null)} />
    /*
      🔑 **No está ⛔ no es «entonces mostrá la lista».** Se llegó acá apretando una orden concreta;
      caer callado en el listado se lee como que el link está roto. Los dos motivos posibles se
      nombran, porque la acción es distinta: la ventana es un filtro que se puede abrir, y la marca
      equivocada se arregla en el header.
    */
    return (
      <div style={{ display: 'grid', gap: space[3] }}>
        <Notice tone="warning">
          <strong>No encontré la orden {abierta} entre las de {marca}.</strong> O es de la otra
          marca —se cambia en el encabezado— o quedó fuera de la ventana de {dias} días. Probá con
          una ventana más larga.
        </Notice>
        <FilterBar>
          <Chips
            value={String(dias)}
            onChange={(v) => setDias(Number(v) as Dias)}
            opciones={VENTANAS.map((d) => ({ key: String(d), label: d === 365 ? 'Un año' : `${d} días` }))}
          />
        </FilterBar>
        <div>
          <button
            type="button"
            onClick={() => setAbierta(null)}
            style={{ height: 30, background: 'none', border: 'none', color: color.mut, cursor: 'pointer', padding: 0 }}
          >
            ← Ver todas las órdenes
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: space[5] }}>
      <Notice tone="action">
        Cada vez que alguien confirma una orden de compra en el sistema de Ingresos, el detalle
        —proveedor, artículos, unidades pedidas contra contadas— <strong>entra solo acá</strong>. En
        esta pantalla no se carga ni se corrige nada: lo que se arregla, se arregla del otro lado y
        se vuelve a confirmar.
      </Notice>

      {error && <Notice tone="danger">{error}</Notice>}

      {/* 🔑 El estado del canal va SIEMPRE, aunque no haya nada que mostrar. Una lista vacía sin
          este renglón afirma "no entró ninguna orden", cuando lo que puede estar pasando es que el
          envío nunca se prendió — y son dos problemas distintos, de dos personas distintas. */}
      {!cargando && !eventos.ultimo && (
        <Notice tone="warning">
          <strong>Todavía no llegó ningún evento.</strong> O no se confirmó ninguna orden desde que
          esto existe, o el envío del sistema de Ingresos sigue apagado: le falta la URL de destino
          o la variable que la prende. Hasta que llegue el primero, esta pantalla no puede decir nada.
        </Notice>
      )}

      {eventos.rotos.length > 0 && (
        <Notice tone="danger">
          <strong>{eventos.rotos.length} eventos llegaron firmados y no se pudieron procesar.</strong>{' '}
          Quedaron guardados con su error y se pueden volver a procesar sin pedirle nada al emisor.
          El último: <em>{eventos.rotos[0].error || 'sin detalle'}</em> (
          {new Date(eventos.rotos[0].recibido_en).toLocaleString('es-AR')}).
        </Notice>
      )}

      <FilterBar>
        <Chips
          value={String(dias)}
          onChange={(v) => setDias(Number(v) as Dias)}
          opciones={VENTANAS.map((d) => ({ key: String(d), label: d === 365 ? 'Un año' : `${d} días` }))}
        />
        {desde && <span style={{ color: color.mut, fontSize: 12 }}>último evento {desde}</span>}
      </FilterBar>

      {cargando ? (
        <Esqueleto />
      ) : recepciones.length === 0 ? (
        <EmptyState
          icon="📦"
          title="Ninguna orden recibida en esta ventana"
          hint={
            eventos.ultimo
              ? 'Llegaron eventos, pero ninguno de esta marca en el período elegido. Probá con una ventana más larga.'
              : 'Todavía no llegó ningún evento — ver el aviso de arriba.'
          }
        />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: space[3] }}>
            <KpiCard label="Órdenes recibidas" value={res.ocs} sub={`${res.unidades_contadas} unidades contadas`} />
            <KpiCard
              label="Cumplimiento"
              value={porcentaje(res.cumplimiento)}
              /* El "qué se contó": el porcentaje solo no dice sobre cuántas unidades se calculó. */
              sub={`${res.unidades_contadas} de ${res.unidades_pedidas} pedidas`}
              tone={TONOS[tonoDeCumplimiento(res.cumplimiento)]}
            />
            <KpiCard
              label="Unidades que faltaron"
              value={res.unidades_faltantes}
              sub={`en ${res.ocs_con_diferencia} de ${res.ocs} órdenes`}
              tone={res.unidades_faltantes > 0 ? 'warning' : 'neutral'}
            />
            <KpiCard
              label="Unidades de más"
              value={res.unidades_sobrantes}
              sub="llegó lo que no se pidió"
              tone={res.unidades_sobrantes > 0 ? 'warning' : 'neutral'}
            />
            <KpiCard label="Artículos nuevos" value={res.lineas_nuevas} sub="primera vez que entran" />
          </div>

          {res.ocs_inconsistentes > 0 && (
            <Notice tone="warning">
              En {res.ocs_inconsistentes} órdenes los totales que manda Ingresos no cierran contra sus
              propios renglones. Se guardan igual y se muestran por sus renglones, que es lo que se
              puede verificar — pero es un desvío del emisor, no de acá.
            </Notice>
          )}

          {/* 🔴 El panel entero cuelga del permiso, ⛔ no sólo la columna: es una lista de nombres de
              proveedor con lo que le compramos a cada uno. Y el servidor ya borró el campo, así que
              sin esto se dibujaría una tabla de filas «— sin proveedor —» que no dice nada. */}
          {puede.proveedores && (
          <SectionCard
            title="Por proveedor"
            subtitle={`Sumado por unidades sobre las ${res.ocs} órdenes de la ventana, no promediando el porcentaje de cada una: si no, una orden de 4 unidades pesa lo mismo que una de 900.`}
          >
            <TableWrap>
              <THead>
                <Tr>
                  <Th>Proveedor</Th>
                  <Th align="right">Órdenes</Th>
                  <Th align="right">Pedidas</Th>
                  <Th align="right">Contadas</Th>
                  <Th align="right">Faltaron</Th>
                  <Th align="right">De más</Th>
                  <Th align="right">Cumplimiento</Th>
                </Tr>
              </THead>
              <TBody>
                {proveedores.map((p) => (
                  <Tr key={p.clave}>
                    <Td>
                      {p.nombre}
                      {p.ocs_con_diferencia > 0 && (
                        <>
                          {' '}
                          <Badge tone="neutral">{p.ocs_con_diferencia} con diferencia</Badge>
                        </>
                      )}
                    </Td>
                    <Td align="right">{p.ocs}</Td>
                    <Td align="right">{p.unidades_pedidas}</Td>
                    <Td align="right">{p.unidades_contadas}</Td>
                    <Td align="right">{p.unidades_faltantes || '—'}</Td>
                    <Td align="right">{p.unidades_sobrantes || '—'}</Td>
                    <Td align="right">
                      <Badge tone={TONOS[tonoDeCumplimiento(p.cumplimiento)]}>{porcentaje(p.cumplimiento)}</Badge>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </TableWrap>
          </SectionCard>
          )}

          <SectionCard title="Las órdenes" subtitle="La más reciente arriba. Tocá una para ver sus renglones.">
            <TableWrap>
              <THead>
                <Tr>
                  <Th>Ingresó</Th>
                  <Th>Orden</Th>
                  {puede.proveedores && <Th>Proveedor</Th>}
                  <Th align="right">Pedidas</Th>
                  <Th align="right">Contadas</Th>
                  <Th align="right">Faltaron</Th>
                  <Th align="right">Cumplimiento</Th>
                </Tr>
              </THead>
              <TBody>
                {recepciones.map((r: Recepcion) => (
                  <Tr key={r.id} onClick={() => setAbierta(r.id)}>
                    <Td>{fechaDeIngreso(r)}</Td>
                    <Td>
                      <strong>{r.oc_label || `OC ${r.oc_id}`}</strong>
                      <div style={{ color: color.mut, fontSize: 12 }}>
                        {r.lineas_recibidas} renglones
                        {r.lineas_nuevas > 0 ? ` · ${r.lineas_nuevas} nuevos` : ''}
                        {!r.totales_coinciden ? ' · totales inconsistentes' : ''}
                      </div>
                    </Td>
                    {puede.proveedores && <Td>{r.proveedor_nombre || '—'}</Td>}
                    <Td align="right">{r.unidades_pedidas}</Td>
                    <Td align="right">{r.unidades_contadas}</Td>
                    <Td align="right">{r.unidades_faltantes || '—'}</Td>
                    <Td align="right">
                      <Badge tone={TONOS[tonoDeCumplimiento(r.cumplimiento)]}>{porcentaje(r.cumplimiento)}</Badge>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </TableWrap>
          </SectionCard>
        </>
      )}
    </div>
  )
}
