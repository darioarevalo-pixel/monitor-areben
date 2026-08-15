'use client'

import { useMemo, useState } from 'react'
import { HeaderAcciones } from '@/components/layout/acciones'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  KpiCard,
  MarcaChip,
  Modal,
  Notice,
  Select,
  StatusPill,
  TBody,
  TableWrap,
  Tabs,
  Td,
  THead,
  Th,
  Tr,
  color,
  formatMoney,
  space,
  useConfirmar,
  useToast,
} from '@/components/ui'
import {
  aCobrar,
  direccionCompleta,
  envioSaldado,
  estaTodoPago,
  ESTADO_LABEL,
  ESTADOS_CERRADOS,
  linkWhatsapp,
  diaDeRepartoVecino,
  nuevoIdEnvio,
  proximoDiaDeReparto,
  rotuloDeDia,
  ordenarParaPreparar,
  resumenDeTraida,
  siguienteEstado,
  totalesDelDia,
  turnosDe,
} from '@/lib/envios/core'
import { hoyIso } from '@/lib/calendario'
import { agendar, borrarEnvio, cambiarEstado, cerrarDia, desagendar, guardarCosto, guardarEnvio, marcarBonificado, marcarPagado } from '@/lib/envios/cliente'
import { imprimirTicketsCadete } from '@/lib/envios/ticket'
import type { Tone } from '@/components/ui'
import type { CierreDia, Envio, EstadoEnvio, TotalesDia, Turno } from '@/lib/envios/tipos'
import { useCuentaCadete, useEnvios } from './useEnvios'

/**
 * "🛵 Envíos del día" (key `envios`).
 *
 * La hoja del cadete, que hasta hoy era una planilla de Google escrita a mano. Se diagnosticó
 * entera el 13-ago-2026 y lo que salió no fue "faltan datos": **3 de cada 10 filas no eran un
 * envío** —eran el encabezado del turno siguiente filtrado adentro del anterior—, el 53,8% de los
 * turnos no decía si era mañana o tarde, y no había marca, ni estado, ni localidad. Nada de eso se
 * arregla con una regla de carga: se arregla dejando de escribir fechas como encabezados.
 *
 * **No tiene selector de marca, y eso es lo importante de la pantalla.** El cadete sale con
 * paquetes de BDI y de Zattia en la misma mochila: el turno es uno y la rendición es una. Pero cada
 * envío guarda su marca, así que el análisis por marca deja de estar ciego sin que la operación
 * cambie. Para los que vienen de Tienda Nube la marca sale sola.
 */
/**
 * El color de cada estado. Mismo criterio que Postventa (`ESTADO_TONE`), y por eso mismo tono:
 * ámbar es advertencia y nada más, verde es cerrado bien, rojo es cerrado mal.
 *
 * ⚠️ Están los dos legados (`despachado`, `reintento`) porque prod y los previews comparten base y
 * entre el deploy y la migración hay filas con esos valores. Un `Record` incompleto pinta la
 * pastilla sin color, que se lee como «acá no pasó nada» sobre un paquete que salió.
 */
const ESTADO_TONE: Record<string, Tone> = {
  pendiente: 'neutral',
  preparado: 'warning',
  en_transito: 'action',
  entregado: 'success',
  no_entregado: 'danger',
  despachado: 'action',
  reintento: 'neutral',
}

export function Envios() {
  const { fecha, setFecha, envios, pendientes, cierre, cargando, error, recargar, traerDeTiendaNube } = useEnvios()
  const { confirmar } = useConfirmar()
  const toast = useToast()
  const [trayendo, setTrayendo] = useState(false)
  const [editando, setEditando] = useState<Partial<Envio> | null>(null)
  // La caja es del día, así que esto vuelve a ser un booleano: hay una sola por cerrar.
  const [cerrando, setCerrando] = useState(false)
  const [pestania, setPestania] = useState<'dia' | 'pendientes' | 'cuenta'>('dia')
  const [agendando, setAgendando] = useState<Envio | null>(null)

  // 🔑 **La hoja es del DÍA, no del turno.** Un día con reparto de mañana y de tarde es un día:
  // el cadete es el mismo, la rendición es una, y tener que acordarse de mirar los dos turnos por
  // separado es la forma de que a las 11 nadie vea los paquetes de la tarde. Los turnos siguen
  // existiendo —cada envío guarda el suyo— pero como secciones adentro del día.
  const delDia = useMemo(() => ordenarParaPreparar(envios), [envios])
  const totales = useMemo(() => totalesDelDia(delDia), [delDia])
  // Los turnos que hay que pintar: los de la grilla de ese día, más cualquiera que tenga un envío
  // metido fuera de grilla — si no, un paquete agendado un sábado no aparecería en ningún lado.
  const turnosDelDia = useMemo(() => {
    const dela = new Set<string>(turnosDe(fecha))
    for (const e of delDia) if (e.turno) dela.add(e.turno)
    return (['mañana', 'tarde'] as Turno[]).filter((t) => dela.has(t))
  }, [fecha, delDia])

  async function traer() {
    setTrayendo(true)
    try {
      const r = await traerDeTiendaNube()
      // El texto y el color salen de `resumenDeTraida`, en `core.ts`: es lo que hay que poder mutar
      // en un test. 🔴 Si faltaron órdenes el cartel NO es verde — un tilde verde con media hoja es
      // el defecto que se está arreglando, no un detalle de estilo.
      const { tono, texto } = resumenDeTraida(r)
      if (tono === 'aviso') toast.aviso(texto)
      else toast.ok(texto)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron traer las órdenes.')
    } finally {
      setTrayendo(false)
    }
  }

  async function tildar(e: Envio, estado: EstadoEnvio) {
    try {
      await cambiarEstado(e.id, estado)
      await recargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cambiar el estado.')
    }
  }

  async function imprimir() {
    // Se imprime lo que todavía va a salir: reimprimir un entregado sería mandar al cadete a una
    // puerta donde ya estuvo.
    const paraImprimir = delDia.filter((e) => e.estado !== 'entregado' && e.estado !== 'no_entregado')
    if (!paraImprimir.length) return toast.error('No hay envíos para imprimir en este día.')
    await imprimirTicketsCadete(paraImprimir)
  }

  /** El tilde de «ya lo pagó»: el cadete deja de cobrarlo en la puerta. */
  async function tildarPagado(e: Envio) {
    try {
      await marcarPagado(e.id, !e.envio_pagado)
      await recargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo marcar como pagado.')
    }
  }

  /** Devolver un envío a la bandeja: la clienta pospuso y todavía no hay día nuevo. */
  async function sacarDelDia(e: Envio) {
    try {
      await desagendar(e.id)
      await recargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo sacar del día.')
    }
  }

  async function borrar(e: Envio) {
    const ok = await confirmar({
      titulo: '¿Sacar este envío de la hoja?',
      mensaje: `${e.cliente || 'Sin nombre'} · ${direccionCompleta(e)}`,
      ok: 'Sacarlo',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await borrarEnvio(e.id)
      await recargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo borrar.')
    }
  }

  return (
    <div style={{ display: 'grid', gap: space[5] }}>
      <HeaderAcciones>
        <Button variant="outline" onClick={traer} disabled={trayendo}>
          {trayendo ? 'Trayendo…' : 'Traer los de Tienda Nube'}
        </Button>
        <Button variant="solid" tone="brand" onClick={imprimir}>
          Imprimir tickets
        </Button>
      </HeaderAcciones>

      {/* Las dos primeras no son dos pantallas: el pendiente y el del día son el mismo envío en dos
          momentos de su vida, y el paso de uno al otro —ponerle precio y mandarlo a un día— es el
          trabajo. La tercera es la otra mitad de la operación: la plata que queda dando vueltas. */}
      <Tabs
        value={pestania}
        onChange={(k) => setPestania(k as 'dia' | 'pendientes' | 'cuenta')}
        items={[
          { key: 'dia', label: 'El día' },
          { key: 'pendientes', label: 'Sin fecha', badge: pendientes.length || undefined, hint: 'Pedidos cotizados esperando que el cliente confirme el día.' },
          { key: 'cuenta', label: 'Cuenta del cadete', hint: 'Lo que se debe de un lado o del otro, arrastrado día a día.' },
        ]}
      />

      {pestania === 'cuenta' ? (
        <CuentaDelCadete activa={pestania === 'cuenta'} />
      ) : pestania === 'pendientes' ? (
        <Pendientes
          envios={pendientes}
          cargando={cargando}
          onAgendar={setAgendando}
          onEditar={setEditando}
          onBorrar={borrar}
          onRecargar={recargar}
        />
      ) : (
      <>
      <Card>
        <div style={{ display: 'flex', gap: space[4], alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {/* 🔑 Las flechas saltan al día de reparto anterior y al siguiente, no al día calendario:
              el sábado, el domingo y el resto de los días sin moto son pantallas siempre vacías, y
              tener que pasar por ellas de a un click es la razón por la que se terminaba abriendo el
              calendario para todo. El campo de fecha queda para ir a un día lejano. */}
          <Field label="Día">
            <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
              <Button variant="outline" onClick={() => setFecha(diaDeRepartoVecino(fecha, -1))} title="El día de reparto anterior">
                ←
              </Button>
              <Input type="date" value={fecha} onChange={(ev) => setFecha(ev.target.value)} />
              <Button variant="outline" onClick={() => setFecha(diaDeRepartoVecino(fecha, 1))} title="El próximo día de reparto">
                →
              </Button>
            </div>
          </Field>
          <Button
            variant="outline"
            onClick={() =>
              setEditando({
                id: nuevoIdEnvio(),
                store: 'bdi',
                fecha,
                turno: (turnosDe(fecha)[0] as Turno) || 'tarde',
                origen: 'manual',
                estado: 'pendiente',
                envio_pagado: false,
                envio_bonificado: false,
              })
            }
          >
            Cargar uno a mano
          </Button>
        </div>
        <div style={{ marginTop: space[2], opacity: 0.7, fontSize: 13 }}>
          {rotuloDeDia(fecha)
            ? turnosDe(fecha).length === 0
              ? `${rotuloDeDia(fecha)} · no hay reparto`
              : `${rotuloDeDia(fecha)} · sale ${turnosDe(fecha).length === 2 ? 'mañana y tarde' : `sólo por la ${turnosDe(fecha)[0]}`}`
            : ''}
        </div>
      </Card>

      {error && <Notice tone="danger">{error}</Notice>}

      {/* Los totales son del DÍA entero, que es como se rinde. Los tres de plata son la cuenta del
          cadete en chiquito: cobró en las puertas, se queda con sus envíos, trae la diferencia. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: space[4] }}>
        <KpiCard label="Envíos del día" value={String(totales.envios)} />
        <KpiCard label="Sin salir todavía" value={String(totales.pendienteDeSalir)} />
        <KpiCard label="Cobró en las puertas" value={formatMoney(totales.cobrado)} />
        <KpiCard label="Se queda (sus envíos)" value={formatMoney(totales.tarifas)} />
        {/* El pie cambia de frase con el signo: lo que falta llegar puede ser plata que el cadete
            todavía tiene que cobrar, o —cuando lo que queda son envíos ya pagos o bonificados—
            plata que le vamos a deber. «-$3.000 todavía en la calle» decía lo contrario de lo que
            pasa. */}
        <KpiCard
          label={totales.debeTraer < 0 ? 'Le debemos' : 'Tiene que traer'}
          value={formatMoney(Math.abs(totales.debeTraer))}
          sub={
            totales.debeTraerSiTodoLlega === totales.debeTraer
              ? undefined
              : totales.debeTraerSiTodoLlega > totales.debeTraer
                ? `${formatMoney(totales.debeTraerSiTodoLlega - totales.debeTraer)} todavía en la calle`
                : `si todo llega le vamos a deber ${formatMoney(totales.debeTraer - totales.debeTraerSiTodoLlega)} más`
          }
        />
      </div>

      {cargando ? null : delDia.length === 0 ? (
        <EmptyState
          title="No hay envíos cargados en este día"
          hint="Traelos de «Sin fecha», o cargá uno a mano."
        />
      ) : (
        turnosDelDia.map((t) => {
          const delTurno = delDia.filter((e) => e.turno === t)
          if (!delTurno.length) return null
          return (
            <div key={t} style={{ display: 'grid', gap: space[3] }}>
              {/* El encabezado va SIEMPRE, aunque el día tenga un solo turno: el cadete de la mañana
                  y el de la tarde salen con hojas distintas, y una tabla sin decir cuál es se lee
                  como "todo esto sale ahora". La caja, en cambio, es del día: se cierra abajo. */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: space[3], flexWrap: 'wrap' }}>
                <strong>
                  <span style={{ textTransform: 'capitalize' }}>{t}</span> · {delTurno.length}{' '}
                  {delTurno.length === 1 ? 'envío' : 'envíos'}
                  {turnosDe(fecha).includes(t) ? '' : ' (fuera de grilla)'}
                </strong>
              </div>
              <TableWrap>
                <THead>
                  <Tr>
                    <Th>Cliente</Th>
                    <Th>Dónde va</Th>
                    <Th>Marca</Th>
                    <Th>Cobra</Th>
                    <Th>Estado</Th>
                    <Th />
                  </Tr>
                </THead>
                <TBody>
                  {delTurno.map((e) => (
                    <Tr key={e.id}>
                      <Td>
                        <div style={{ fontWeight: 600 }}>{e.cliente || 'Sin nombre'}</div>
                        {e.orden_numero ? <div style={{ opacity: 0.6, fontSize: 12 }}>#{e.orden_numero}</div> : null}
                        {e.origen === 'manual' ? <Badge>a mano</Badge> : null}
                      </Td>
                      <Td>
                        <div>{direccionCompleta(e)}</div>
                        {e.anotacion ? <div style={{ opacity: 0.7, fontSize: 12 }}>{e.anotacion}</div> : null}
                        {linkWhatsapp(e) ? (
                          <a href={linkWhatsapp(e)!} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
                            WhatsApp
                          </a>
                        ) : null}
                      </Td>
                      {/* 🔑 El chip de color, y no el nombre en texto: la hoja mezcla las dos marcas a
                          propósito, así que de un golpe de vista tiene que verse de cuál es cada
                          paquete mientras se arma la mochila. */}
                      <Td><MarcaChip marca={e.store} /></Td>
                      <Td>
                        {/* Igual que en el ticket: pagado NO es "$0". Un cero se lee como un precio. */}
                        {estaTodoPago(e) ? <StatusPill tone="success" label="PAGADO" /> : <strong>{formatMoney(aCobrar(e))}</strong>}
                        {/* 🔑 **El costo del envío no se borra cuando no se cobra: se pinta.** Es lo
                            que se le paga al cadete, así que tiene que estar a la vista mientras se
                            arma la mochila; esconderlo es lo que hacía falta una segunda columna
                            para no perderlo de vista. Verde = esta puerta no lo cobra. */}
                        {envioSaldado(e) && Number(e.monto_envio) > 0 ? (
                          <div style={{ fontSize: 12, color: color.success }}>
                            envío {formatMoney(Number(e.monto_envio))} · {e.envio_bonificado ? 'bonificado' : 'ya pago'}
                          </div>
                        ) : null}
                        {/* El tilde está en la fila y no sólo en la ficha: es la corrección que se hace
                            con la clienta al teléfono avisando que ya transfirió, y el cadete sin salir. */}
                        <div>
                          <Button size="sm" variant="ghost" onClick={() => void tildarPagado(e)}>
                            {e.envio_pagado ? 'Marcar envío impago' : 'Marcar envío pagado'}
                          </Button>
                        </div>
                      </Td>
                      <Td>
                        <EstadoDelEnvio envio={e} onCambiar={tildar} />
                      </Td>
                      <Td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Button size="sm" variant="ghost" onClick={() => setEditando(e)}>
                            Editar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void sacarDelDia(e)}>
                            Sin fecha
                          </Button>
                          <Button size="sm" variant="ghost" tone="danger" onClick={() => void borrar(e)}>
                            Sacar
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </TableWrap>
            </div>
          )
        })
      )}

      {/* 🔑 **La caja se cierra una vez por día, no una por turno.** El cadete es uno solo y sale a
          la mañana y a la tarde con la misma plata en el bolsillo: partirla en dos obligaría a
          repartir a mano un saldo que en la calle nunca estuvo partido. Y lo que quede a favor de
          uno o del otro no se salda hoy —se arrastra a los envíos que siguen—, por eso el cierre
          muestra el saldo y no un "faltan $4.300" que nadie va a volver a mirar. */}
      {cargando || !delDia.length ? null : (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
            <div>
              <strong>La caja del día</strong>
              <div style={{ opacity: 0.7, fontSize: 13 }}>
                {cierre?.cerrado_en
                  ? `Cerrado por ${cierre.cerrado_por} · trajo ${cierre.trajo == null ? '—' : formatMoney(Number(cierre.trajo))}`
                  : totales.pendienteDeSalir
                    ? `Todavía hay ${totales.pendienteDeSalir} sin salir`
                    : 'Sin cerrar'}
              </div>
            </div>
            <Button variant="outline" onClick={() => setCerrando(true)}>
              {cierre?.cerrado_en ? 'Corregir el cierre' : 'Cerrar el día'}
            </Button>
          </div>
        </Card>
      )}

      </>
      )}

      {agendando ? (
        <MandarAUnDia
          envio={agendando}
          onCerrar={() => setAgendando(null)}
          onGuardado={async () => {
            setAgendando(null)
            await recargar()
          }}
        />
      ) : null}

      {editando ? (
        <FichaEnvio
          envio={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={async () => {
            setEditando(null)
            await recargar()
          }}
        />
      ) : null}

      {cerrando ? (
        <CierreDelDia
          fecha={fecha}
          totales={totales}
          cierre={cierre}
          onCerrar={() => setCerrando(false)}
          onGuardado={async () => {
            setCerrando(false)
            await recargar()
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * El estado del paquete: una pastilla con color y **un botón que avanza**.
 *
 * 🔑 **Era un desplegable de seis opciones y eso es fricción veinte veces por día.** Elegir de una
 * lista obliga a leerla entera cada vez, y deja elegir hacia atrás sin querer —un click de más en
 * «Pendiente» sobre un entregado lo saca de la cuenta del día sin que nada avise—. El camino es uno
 * solo (`pendiente → preparado → en tránsito → entregado`), así que el botón dice a dónde va.
 *
 * La salida lateral —«No entregado»— aparece **sólo cuando el paquete ya salió**: antes de que el
 * cadete lo lleve no hay nada que no se haya podido entregar.
 *
 * Y los cerrados tienen «Corregir», chiquito. El estado va hacia adelante, pero un dedo en la
 * pantalla equivocada tiene que poder deshacerse sin abrir la base.
 */
function EstadoDelEnvio({ envio, onCambiar }: { envio: Envio; onCambiar: (e: Envio, estado: EstadoEnvio) => Promise<void> }) {
  const sigue = siguienteEstado(envio.estado) as EstadoEnvio | null
  const cerrado = (ESTADOS_CERRADOS as string[]).includes(envio.estado)
  const enLaCalle = envio.estado === 'en_transito' || envio.estado === 'despachado'

  return (
    <div style={{ display: 'grid', gap: 4, justifyItems: 'start' }}>
      <StatusPill tone={ESTADO_TONE[envio.estado] || 'neutral'} label={ESTADO_LABEL[envio.estado] || envio.estado} />
      {sigue ? (
        <Button size="sm" variant="outline" tone={ESTADO_TONE[sigue]} onClick={() => void onCambiar(envio, sigue)}>
          {ESTADO_LABEL[sigue]}
        </Button>
      ) : null}
      {enLaCalle ? (
        <Button size="sm" variant="ghost" tone="danger" onClick={() => void onCambiar(envio, 'no_entregado')}>
          No entregado
        </Button>
      ) : null}
      {cerrado ? (
        <Button
          size="sm"
          variant="ghost"
          title="Volver a «en tránsito»: se marcó por error."
          onClick={() => void onCambiar(envio, 'en_transito')}
        >
          Corregir
        </Button>
      ) : null}
    </div>
  )
}

/**
 * La bandeja: los pedidos cotizados que todavía no tienen día.
 *
 * 🔑 **Existe porque el día lo confirma el cliente, no la orden.** Antes, la única forma de anotar
 * un pedido que hay que enviar era meterlo en un día inventado —que es el ruido que la tabla vino a
 * sacar— o no anotarlo, que es lo que pasaba.
 *
 * Las dos columnas que no son decorativas son **el precio del envío** y **el botón de mandarlo a un
 * día**, y en ese orden: Tienda Nube manda la cadetería siempre en $0 (18 de 18 medidas) porque el
 * precio vive en el mapa de zonas, así que sin ese número la fila no está lista para salir.
 */
function Pendientes({
  envios,
  cargando,
  onAgendar,
  onEditar,
  onBorrar,
  onRecargar,
}: {
  envios: Envio[]
  cargando: boolean
  onAgendar: (e: Envio) => void
  onEditar: (e: Partial<Envio>) => void
  onBorrar: (e: Envio) => Promise<void>
  onRecargar: () => Promise<void>
}) {
  if (cargando) return null
  if (!envios.length) {
    return (
      <EmptyState
        title="No hay pedidos de esta marca esperando fecha"
        hint="Traé los de Tienda Nube: las órdenes que van en moto entran acá hasta que la clienta confirme el día."
      />
    )
  }

  return (
    <TableWrap>
      <THead>
        <Tr>
          <Th>Cliente</Th>
          <Th>Dónde va</Th>
          <Th>Precio del envío</Th>
          <Th>Cómo se cobra</Th>
          <Th />
        </Tr>
      </THead>
      <TBody>
        {envios.map((e) => (
          <Tr key={e.id}>
            <Td>
              <div style={{ fontWeight: 600 }}>{e.cliente || 'Sin nombre'}</div>
              {e.orden_numero ? <div style={{ opacity: 0.6, fontSize: 12 }}>#{e.orden_numero}</div> : null}
              {e.origen === 'manual' ? <Badge>a mano</Badge> : null}
              {/* 🔑 **De dónde viene esta fila.** La bandeja mezcla dos cosas que se trabajan igual
                  —hablar con la clienta y acordar un día— pero que llegaron por caminos distintos:
                  el pedido nuevo, y el paquete que salió y volvió. Sin decirlo, el segundo se lee
                  como un pedido más y nadie sabe que alguien ya esperó en una puerta. */}
              {e.estado === 'no_entregado' ? (
                <div style={{ marginTop: 2 }}>
                  <Badge tone="danger">volvió{e.fecha ? ` del ${rotuloDeDia(e.fecha) || e.fecha}` : ''}</Badge>
                </div>
              ) : null}
            </Td>
            <Td>
              <div>{direccionCompleta(e)}</div>
              {linkWhatsapp(e) ? (
                <a href={linkWhatsapp(e)!} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
                  WhatsApp
                </a>
              ) : null}
            </Td>
            <Td>
              <Cotizar envio={e} onGuardado={onRecargar} />
            </Td>
            <Td>
              {/* 🔴 Esto y el precio son DOS cosas y por eso son dos columnas. Juntas —«sin cotizar»
                  arriba de «PAGADO»— se leían como si una fuera del envío y la otra del pedido, y
                  además se contradecían: un envío sin precio no puede estar pagado.
                  Son tres respuestas y no dos: bonificado NO es lo mismo que pagado —uno es plata
                  que entró y el otro plata que no entró nunca— aunque en la puerta se cobre igual. */}
              {e.envio_pagado ? (
                <StatusPill tone="success" label="PAGADO" />
              ) : e.envio_bonificado ? (
                <StatusPill tone="brand" label="BONIFICADO" />
              ) : (
                <span style={{ opacity: 0.75 }}>lo cobra el cadete</span>
              )}
              <div>
                <Button size="sm" variant="ghost" onClick={() => void marcarPagado(e.id, !e.envio_pagado).then(onRecargar)}>
                  {e.envio_pagado ? 'Marcar envío impago' : 'Marcar envío pagado'}
                </Button>
              </div>
            </Td>
            <Td>
              <div style={{ display: 'flex', gap: 6 }}>
                <Button size="sm" variant="solid" tone="brand" onClick={() => onAgendar(e)}>
                  Mandar a un día
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onEditar(e)}>
                  Editar
                </Button>
                <Button size="sm" variant="ghost" tone="danger" onClick={() => void onBorrar(e)}>
                  Sacar
                </Button>
              </div>
            </Td>
          </Tr>
        ))}
      </TBody>
    </TableWrap>
  )
}

/**
 * El precio del envío, cargado desde la fila.
 *
 * 🔑 **Se cotiza de a diez seguidos, mirando el mapa.** Abrir la ficha entera para escribir un
 * número es tres clicks por fila y encima reenvía la fila completa —con lo que estaba en pantalla
 * al abrirla—, así que pisa lo que otra persona corrigió mientras tanto. Acá viaja un solo campo.
 *
 * Guarda al salir del campo o con Enter, y sólo si el número cambió: el `blur` se dispara también
 * cuando alguien pasa de largo con el tabulador, y guardar ahí sería escribir sin que nadie lo pida.
 */
function Cotizar({ envio, onGuardado }: { envio: Envio; onGuardado: () => Promise<void> }) {
  const original = Number(envio.monto_envio) || 0
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <MontoEnFila
          original={original || null}
          placeholder="sin cotizar"
          alFallar="No se pudo guardar el precio."
          onGuardar={(n) => guardarCosto(envio.id, n ?? 0)}
          onGuardado={onGuardado}
        />
        {!original ? <Badge tone="warning">falta</Badge> : null}
      </div>
      <Bonificar envio={envio} onGuardado={onGuardado} />
    </div>
  )
}

/**
 * El tilde de «se lo regalamos».
 *
 * 🔑 **El precio sigue escrito arriba, y eso es todo el punto.** La versión anterior resolvía el
 * bonificado poniendo el envío en cero y anotando aparte lo que igual cobraba el cadete: dos
 * columnas para el mismo número, que es exactamente el defecto que este módulo persigue. Ahora el
 * costo se cotiza igual que cualquier otro —es lo que se le paga a él— y esto sólo dice que en la
 * puerta no se cobra.
 *
 * Vive detrás de un link porque es el caso raro: nadie tiene que contestar esta pregunta veinte
 * veces por día.
 */
function Bonificar({ envio, onGuardado }: { envio: Envio; onGuardado: () => Promise<void> }) {
  const toast = useToast()
  const [guardando, setGuardando] = useState(false)

  async function alternar() {
    setGuardando(true)
    try {
      await marcarBonificado(envio.id, !envio.envio_bonificado)
      await onGuardado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo marcar el envío como bonificado.')
    } finally {
      setGuardando(false)
    }
  }

  if (envio.envio_bonificado) {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <Badge tone="brand">bonificado</Badge>
        <Button size="sm" variant="ghost" disabled={guardando} onClick={() => void alternar()}>
          Sacar
        </Button>
      </div>
    )
  }

  return (
    <button
      type="button"
      disabled={guardando}
      onClick={() => void alternar()}
      style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontSize: 12, opacity: 0.6, cursor: 'pointer', textAlign: 'left', textDecoration: 'underline' }}
    >
      bonificar el envío
    </button>
  )
}

/**
 * Un monto que se escribe en la fila y viaja solo.
 *
 * Guarda al salir del campo o con Enter, y **sólo si el número cambió**: el `blur` se dispara también
 * cuando alguien pasa de largo con el tabulador, y guardar ahí sería escribir sin que nadie lo pida.
 *
 * Vacío es "no lo toqué" y se descarta: el precio del envío no tiene forma de "sin precio" que
 * alguien quiera guardar a propósito — para eso está el placeholder «sin cotizar».
 */
function MontoEnFila({
  original,
  placeholder,
  alFallar,
  onGuardar,
  onGuardado,
}: {
  original: number | null
  placeholder: string
  alFallar: string
  onGuardar: (monto: number | null) => Promise<void>
  onGuardado: () => Promise<void>
}) {
  const texto = original == null ? '' : String(original)
  const toast = useToast()
  const [valor, setValor] = useState(texto)
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    if (valor === texto) return
    const vacio = valor.trim() === ''
    const n = Number(valor)
    if (vacio || !Number.isFinite(n) || n < 0) {
      setValor(texto)
      return
    }
    setGuardando(true)
    try {
      await onGuardar(n)
      await onGuardado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : alFallar)
      setValor(texto)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Input
      type="number"
      value={valor}
      placeholder={placeholder}
      disabled={guardando}
      style={{ width: 110 }}
      onChange={(e) => setValor(e.target.value)}
      onBlur={() => void guardar()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

/**
 * Mandar un pendiente a un día y turno: el momento en que el paquete entra a la calle.
 *
 * 🔑 **El selector ofrece sólo los turnos que ese día existen** —lun-vie tarde, mar y jue también
 * mañana— y por eso pide la fecha primero. Elegir «lunes a la mañana» no es un error de tipeo que se
 * vea después: es un paquete esperando en un turno que nunca sale.
 *
 * Pero **no bloquea**: si hace falta meter uno fuera de grilla se puede, con el aviso puesto. Un
 * sábado con un envío especial no puede depender de que alguien toque el código.
 */
function MandarAUnDia({ envio, onCerrar, onGuardado }: { envio: Envio; onCerrar: () => void; onGuardado: () => Promise<void> }) {
  const toast = useToast()
  const [fecha, setFecha] = useState<string>(() => proximoDiaDeReparto(hoyIso()))
  const [turno, setTurno] = useState<Turno>(() => (turnosDe(proximoDiaDeReparto(hoyIso()))[0] as Turno) || 'tarde')
  const [guardando, setGuardando] = useState(false)

  const dispo = turnosDe(fecha) as Turno[]
  const fueraDeGrilla = !dispo.includes(turno)
  const sinPrecio = !(Number(envio.monto_envio) > 0)

  async function guardar() {
    setGuardando(true)
    try {
      await agendar(envio.id, fecha, turno)
      await onGuardado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo mandar a ese día.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo={`Mandar a un día · ${envio.cliente || 'Sin nombre'}`}>
      <div style={{ display: 'grid', gap: space[4] }}>
        <div style={{ display: 'flex', gap: space[4], flexWrap: 'wrap' }}>
          <Field label="Día" hint={rotuloDeDia(fecha) ? `${rotuloDeDia(fecha)}${dispo.length ? '' : ' · no hay reparto'}` : 'Elegí un día'}>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Turno">
            <Select value={turno} onChange={(e) => setTurno(e.target.value as Turno)}>
              {(dispo.length ? dispo : (['mañana', 'tarde'] as Turno[])).map((t) => (
                <option key={t} value={t}>
                  {t === 'mañana' ? 'Mañana' : 'Tarde'}
                </option>
              ))}
              {/* El turno que no es de ese día sigue estando, al final y dicho: se puede forzar. */}
              {dispo.length === 1 ? (
                <option value={dispo[0] === 'mañana' ? 'tarde' : 'mañana'}>
                  {dispo[0] === 'mañana' ? 'Tarde' : 'Mañana'} (fuera de grilla)
                </option>
              ) : null}
            </Select>
          </Field>
        </div>

        {fueraDeGrilla ? (
          <Notice tone="warning">
            Ese día el cadete {dispo.length ? `sale sólo por la ${dispo.join(' y la ')}` : 'no sale'}. Se puede mandar igual, pero
            revisá que alguien lo esté esperando.
          </Notice>
        ) : null}

        {sinPrecio ? (
          <Notice tone="warning">
            Este envío todavía no tiene precio. Si sale así, el ticket no le va a pedir nada al cliente.
          </Notice>
        ) : null}

        <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="solid" tone="brand" onClick={guardar} disabled={guardando || !rotuloDeDia(fecha)}>
            {guardando ? 'Mandando…' : 'Mandar a ese día'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Alta y edición a mano: el 10% de los envíos que no pasa por la tienda. */
function FichaEnvio({ envio, onCerrar, onGuardado }: { envio: Partial<Envio>; onCerrar: () => void; onGuardado: () => Promise<void> }) {
  const toast = useToast()
  const [f, setF] = useState<Partial<Envio>>(envio)
  const [guardando, setGuardando] = useState(false)
  const set = (k: keyof Envio, v: unknown) => setF((x) => ({ ...x, [k]: v }))

  async function guardar() {
    setGuardando(true)
    try {
      await guardarEnvio(f)
      await onGuardado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo={f.orden_numero ? `Envío #${f.orden_numero}` : 'Envío a mano'}>
      <div style={{ display: 'grid', gap: space[4] }}>
        <Field label="Marca">
          <Select value={f.store || 'bdi'} onChange={(e) => set('store', e.target.value)}>
            <option value="bdi">BDI</option>
            <option value="zattia">Zattia</option>
          </Select>
        </Field>
        <Field label="Cliente">
          <Input value={f.cliente || ''} onChange={(e) => set('cliente', e.target.value)} />
        </Field>
        <Field label="Dirección">
          <Input value={f.direccion || ''} onChange={(e) => set('direccion', e.target.value)} />
        </Field>
        <Field label="Piso / depto">
          <Input value={f.piso_depto || ''} onChange={(e) => set('piso_depto', e.target.value)} />
        </Field>
        <Field label="Localidad" hint="Rosario, Roldán, Funes… Es lo que permite tarifar por distancia en vez de negociarlo caso por caso.">
          <Input value={f.localidad || ''} onChange={(e) => set('localidad', e.target.value)} />
        </Field>
        <Field label="Teléfono">
          <Input value={f.telefono || ''} onChange={(e) => set('telefono', e.target.value)} />
        </Field>
        <Field label="Anotación" hint="«Tocar timbre 2», «dejar en portería».">
          <Input value={f.anotacion || ''} onChange={(e) => set('anotacion', e.target.value)} />
        </Field>
        {/* 🔑 **Es el costo del reparto, no "lo que se cobra".** Se carga siempre, aunque en la
            puerta no se cobre: es lo que se le paga al cadete. Ponerlo en cero para decir que va sin
            cargo es lo que había antes, y obligaba a una segunda columna para no dejarlo trabajando
            gratis. Quién lo paga lo dicen los dos tildes de abajo. */}
        <Field label="Precio del envío" hint="El costo del reparto. Se carga igual aunque el envío vaya bonificado: es lo que cobra el cadete.">
          <Input type="number" value={String(f.monto_envio ?? '')} onChange={(e) => set('monto_envio', e.target.value)} />
        </Field>
        {/* Los dos tildes deciden si el ticket dice PAGADO o manda a cobrar, y son excluyentes:
            `validarEnvio` rechaza los dos juntos, así que prender uno apaga el otro acá también. */}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={!!f.envio_pagado}
            onChange={(e) => setF((x) => ({ ...x, envio_pagado: e.target.checked, envio_bonificado: e.target.checked ? false : x.envio_bonificado }))}
          />
          El envío ya está pagado
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={!!f.envio_bonificado}
            onChange={(e) => setF((x) => ({ ...x, envio_bonificado: e.target.checked, envio_pagado: e.target.checked ? false : x.envio_pagado }))}
          />
          Va bonificado (no lo paga nadie)
        </label>
        <Field label="Saldo del pedido a cobrar" hint="Casi siempre 0: el producto ya se pagó antes de despachar.">
          <Input type="number" value={String(f.monto_pedido_a_cobrar ?? '')} onChange={(e) => set('monto_pedido_a_cobrar', e.target.value)} />
        </Field>
        <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="solid" tone="brand" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * El cierre de caja del día: la rendición.
 *
 * 🔑 **Se guarda un solo número: cuánto trajo.** Lo que tenía que traer sale de los envíos —lo que
 * cobró en las puertas menos lo que se queda por llevarlos— y no se congela en ninguna columna: si
 * mañana se corrige el precio de un envío de hoy, un total guardado quedaría mintiendo sin que nada
 * falle, y encima el saldo se arrastra a todos los días siguientes.
 *
 * 🔑 **Que traiga $0 es lo NORMAL, no un error.** En la mediana el 100% de lo que cobra es el envío,
 * y el envío se lo queda él: sólo trae plata cuando cobró producto en efectivo. Por eso el campo
 * arranca en lo que la cuenta espera y no en blanco.
 */
function CierreDelDia({
  fecha,
  totales,
  cierre,
  onCerrar,
  onGuardado,
}: {
  fecha: string
  totales: TotalesDia
  cierre: CierreDia | null
  onCerrar: () => void
  onGuardado: () => Promise<void>
}) {
  const toast = useToast()
  const esperado = totales.debeTraer
  const [trajo, setTrajo] = useState(cierre?.trajo == null ? String(Math.max(0, esperado)) : String(cierre.trajo))
  const [aparte, setAparte] = useState(cierre?.pagado_aparte == null ? '' : String(cierre.pagado_aparte))
  const [nota, setNota] = useState(cierre?.nota || '')
  const [guardando, setGuardando] = useState(false)

  // Lo que queda dando vueltas después de cerrar: positivo = se lo llevó él, negativo = le debemos.
  // Lo que se le dio por fuera SUMA: salda lo que se le debía, no lo agranda. Ver `cuentaDelCadete`.
  const queda = esperado - (Number(trajo) || 0) + (Number(aparte) || 0)

  async function guardar() {
    setGuardando(true)
    try {
      await cerrarDia(fecha, trajo === '' ? null : Number(trajo), aparte === '' ? 0 : Number(aparte), nota.trim() || null)
      await onGuardado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cerrar el día.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo={`Cerrar la caja del ${rotuloDeDia(fecha) || 'día'}`}>
      <div style={{ display: 'grid', gap: space[4] }}>
        <Notice tone="brand">
          Cobró {formatMoney(totales.cobrado)} en las puertas y se queda {formatMoney(totales.tarifas)} de sus envíos ⇒{' '}
          {esperado < 0 ? (
            <>
              <strong>le debemos {formatMoney(-esperado)}</strong> y no trae nada.
            </>
          ) : (
            <>
              tendría que traer <strong>{formatMoney(esperado)}</strong>.
            </>
          )}
        </Notice>
        <Field label="Lo que trajo" hint="Cero es una respuesta: lo normal es que cobre sólo sus envíos y se los quede.">
          <Input type="number" value={trajo} onChange={(e) => setTrajo(e.target.value)} />
        </Field>
        <Field
          label="Plata que se le dio por fuera"
          hint="Una transferencia para saldar lo que se le debía. Vacío si no hubo."
        >
          <Input type="number" value={aparte} onChange={(e) => setAparte(e.target.value)} />
        </Field>
        {queda !== 0 ? (
          <Notice tone={queda > 0 ? 'warning' : 'brand'}>
            {queda > 0
              ? `Quedan ${formatMoney(queda)} suyos sin entregar: se suman a la cuenta y se descuentan de los próximos envíos.`
              : `Le quedamos debiendo ${formatMoney(-queda)}: se los descuenta de los próximos envíos que no estén pagos.`}
          </Notice>
        ) : null}
        <Field label="Nota" hint="Por qué, si el número no es el esperado. Un ajuste sin motivo es un número que nadie se anima a tocar.">
          <Input value={nota} onChange={(e) => setNota(e.target.value)} />
        </Field>
        <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="solid" tone="brand" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Cerrar el día'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * La cuenta corriente del cadete.
 *
 * 🔑 **Existe porque el saldo no se salda: se arrastra.** Hay un solo cadete; por cada envío
 * entregado él cobró en la puerta y nosotros le debemos lo que vale ese reparto, y lo que sobra o
 * falta se lo descuenta de los envíos que siguen. Sin esta pantalla, esa diferencia se llevaba de
 * memoria entre dos personas — que es exactamente lo que hacía la planilla con la mitad de la caja.
 *
 * El signo, una sola vez: **positivo = tiene plata nuestra**; negativo = se la debemos.
 */
function CuentaDelCadete({ activa }: { activa: boolean }) {
  const { cuenta, cargando, error } = useCuentaCadete(activa)

  if (error) return <Notice tone="danger">{error}</Notice>
  if (cargando) return null
  if (!cuenta.dias.length) {
    return (
      <EmptyState
        title="Todavía no hay días con envíos"
        hint="La cuenta se arma sola con lo que se entrega cada día. Arranca en cero."
      />
    )
  }

  const saldo = cuenta.saldo
  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: space[4] }}>
        <KpiCard
          label={saldo === 0 ? 'Están a mano' : saldo > 0 ? 'El cadete tiene plata nuestra' : 'Le debemos al cadete'}
          value={formatMoney(Math.abs(saldo))}
          sub={saldo === 0 ? undefined : saldo > 0 ? 'lo trae en la próxima rendición' : 'se lo descuenta de los próximos envíos'}
        />
        <KpiCard label="Días sin cerrar" value={String(cuenta.dias.filter((d) => !d.cerrado && d.entregados > 0).length)} />
      </div>

      {/* Del día más nuevo al más viejo: lo que se mira es lo último, y el acumulado ya viene
          calculado desde el principio — dar vuelta la lista no cambia ninguna suma. */}
      <TableWrap>
        <THead>
          <Tr>
            <Th>Día</Th>
            <Th>Entregados</Th>
            <Th>Cobró</Th>
            <Th>Se queda</Th>
            <Th>Tenía que traer</Th>
            <Th>Trajo</Th>
            <Th>Saldo</Th>
          </Tr>
        </THead>
        <TBody>
          {[...cuenta.dias].reverse().map((d) => (
            <Tr key={d.fecha}>
              <Td>
                <div style={{ fontWeight: 600 }}>{rotuloDeDia(d.fecha) || d.fecha}</div>
                {d.cerrado ? (
                  <div style={{ opacity: 0.6, fontSize: 12 }}>cerró {d.cerradoPor}</div>
                ) : (
                  <Badge tone="warning">sin cerrar</Badge>
                )}
                {d.nota ? <div style={{ opacity: 0.7, fontSize: 12 }}>{d.nota}</div> : null}
              </Td>
              <Td>
                {d.entregados} de {d.envios}
              </Td>
              <Td>{formatMoney(d.cobrado)}</Td>
              <Td>{formatMoney(d.tarifas)}</Td>
              <Td>{formatMoney(d.debeTraer)}</Td>
              <Td>
                {d.trajo == null ? <span style={{ opacity: 0.5 }}>—</span> : formatMoney(d.trajo)}
                {d.pagadoAparte ? <div style={{ opacity: 0.7, fontSize: 12 }}>+ {formatMoney(d.pagadoAparte)} por fuera</div> : null}
              </Td>
              {/* El acumulado y no el saldo del día: es el número con el que se habla con el cadete. */}
              <Td>
                <strong>{formatMoney(d.acumulado)}</strong>
              </Td>
            </Tr>
          ))}
        </TBody>
      </TableWrap>
    </div>
  )
}
