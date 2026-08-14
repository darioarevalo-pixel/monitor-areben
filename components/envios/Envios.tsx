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
  formatMoney,
  space,
  useConfirmar,
  useToast,
} from '@/components/ui'
import {
  aCobrar,
  direccionCompleta,
  estaTodoPago,
  linkWhatsapp,
  diaDeRepartoVecino,
  nuevoIdEnvio,
  proximoDiaDeReparto,
  rotuloDeDia,
  ordenarParaPreparar,
  totalesDelTurno,
  turnosDe,
} from '@/lib/envios/core'
import { hoyIso } from '@/lib/calendario'
import { agendar, borrarEnvio, cambiarEstado, cerrarTurno, desagendar, guardarCosto, guardarEnvio, marcarPagado } from '@/lib/envios/cliente'
import { imprimirEtiquetasCadete } from '@/lib/envios/etiqueta'
import type { Envio, EstadoEnvio, Turno } from '@/lib/envios/tipos'
import { useEnvios } from './useEnvios'

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
export function Envios() {
  const { fecha, setFecha, envios, pendientes, cierres, cargando, error, recargar, traerDeTiendaNube } = useEnvios()
  const { confirmar } = useConfirmar()
  const toast = useToast()
  const [trayendo, setTrayendo] = useState(false)
  const [editando, setEditando] = useState<Partial<Envio> | null>(null)
  // Qué turno se está cerrando, o `null`. Antes era un booleano porque la pantalla era de un turno.
  const [cerrando, setCerrando] = useState<Turno | null>(null)
  const [pestania, setPestania] = useState<'dia' | 'pendientes'>('dia')
  const [agendando, setAgendando] = useState<Envio | null>(null)

  // 🔑 **La hoja es del DÍA, no del turno.** Un día con reparto de mañana y de tarde es un día:
  // el cadete es el mismo, la rendición es una, y tener que acordarse de mirar los dos turnos por
  // separado es la forma de que a las 11 nadie vea los paquetes de la tarde. Los turnos siguen
  // existiendo —cada envío guarda el suyo— pero como secciones adentro del día.
  const delDia = useMemo(() => ordenarParaPreparar(envios), [envios])
  const totales = useMemo(() => totalesDelTurno(delDia), [delDia])
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
      // Las dos cuentas, no un "listo": "traje 2 y 3 ya estaban" es una respuesta.
      const partes = [`${r.agregados} nuevo${r.agregados === 1 ? '' : 's'}`]
      if (r.ya_estaban) partes.push(`${r.ya_estaban} ya estaban`)
      // El correo se deja afuera, pero se dice: si no, la cuenta del día no cierra contra Tienda Nube.
      if (r.porCorreo) partes.push(`${r.porCorreo} ${r.porCorreo === 1 ? 'va' : 'van'} por correo`)
      if (r.sinDireccion) partes.push(`⚠️ ${r.sinDireccion} sin dirección: completala a mano`)
      toast.ok(partes.join(' · '))
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
    await imprimirEtiquetasCadete(paraImprimir)
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
          Imprimir etiquetas
        </Button>
      </HeaderAcciones>

      {/* Dos listas y no dos pantallas: el pendiente y el del día son el mismo envío en dos momentos
          de su vida, y el paso de uno al otro —ponerle precio y mandarlo a un día— es el trabajo. */}
      <Tabs
        value={pestania}
        onChange={(k) => setPestania(k as 'dia' | 'pendientes')}
        items={[
          { key: 'dia', label: 'El día' },
          { key: 'pendientes', label: 'Sin fecha', badge: pendientes.length || undefined, hint: 'Pedidos cotizados esperando que el cliente confirme el día.' },
        ]}
      />

      {pestania === 'pendientes' ? (
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

      {/* Los totales son del DÍA entero, que es como se rinde. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: space[4] }}>
        <KpiCard label="Envíos del día" value={String(totales.envios)} />
        <KpiCard label="Sin salir todavía" value={String(totales.pendienteDeSalir)} />
        <KpiCard label="Envíos ya pagos" value={formatMoney(totales.enviosPagos)} />
        <KpiCard label="A rendir" value={formatMoney(totales.aRendir)} sub={totales.aRendirSiTodoLlega !== totales.aRendir ? `${formatMoney(totales.aRendirSiTodoLlega - totales.aRendir)} todavía en la calle` : undefined} />
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
          const cierre = cierres.find((c) => c.turno === t) || null
          return (
            <div key={t} style={{ display: 'grid', gap: space[3] }}>
              {/* El encabezado va SIEMPRE, aunque el día tenga un solo turno: el cadete de la mañana
                  y el de la tarde salen con hojas distintas, y una tabla sin decir cuál es se lee
                  como "todo esto sale ahora". */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: space[3], flexWrap: 'wrap' }}>
                <strong>
                  <span style={{ textTransform: 'capitalize' }}>{t}</span> · {delTurno.length}{' '}
                  {delTurno.length === 1 ? 'envío' : 'envíos'}
                  {turnosDe(fecha).includes(t) ? '' : ' (fuera de grilla)'}
                </strong>
                <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
                  <span style={{ opacity: 0.7, fontSize: 13 }}>
                    {cierre?.cerrado_en
                      ? `Cerrado por ${cierre.cerrado_por} · se le pagaron ${cierre.pagado_al_cadete == null ? '—' : formatMoney(Number(cierre.pagado_al_cadete))}`
                      : 'Sin cerrar'}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setCerrando(t)}>
                    {cierre?.cerrado_en ? 'Corregir el cierre' : 'Cerrar el turno'}
                  </Button>
                </div>
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
                        {/* Igual que en la etiqueta: pagado NO es "$0". Un cero se lee como un precio. */}
                        {estaTodoPago(e) ? <StatusPill tone="success" label="PAGADO" /> : <strong>{formatMoney(aCobrar(e))}</strong>}
                        {/* El tilde está en la fila y no sólo en la ficha: es la corrección que se hace
                            con la clienta al teléfono avisando que ya transfirió, y el cadete sin salir. */}
                        <div>
                          <Button size="sm" variant="ghost" onClick={() => void tildarPagado(e)}>
                            {e.envio_pagado ? 'Marcar envío impago' : 'Marcar envío pagado'}
                          </Button>
                        </div>
                      </Td>
                      <Td>
                        <Select value={e.estado} onChange={(ev) => void tildar(e, ev.target.value as EstadoEnvio)}>
                          <option value="pendiente">Pendiente</option>
                          <option value="preparado">Preparado</option>
                          <option value="despachado">Salió</option>
                          <option value="entregado">Entregado</option>
                          <option value="no_entregado">No entregado</option>
                          <option value="reintento">Vuelve a salir</option>
                        </Select>
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
        <CierreDelTurno
          fecha={fecha}
          turno={cerrando}
          aRendir={totalesDelTurno(delDia.filter((e) => e.turno === cerrando)).aRendir}
          cierre={cierres.find((c) => c.turno === cerrando) || null}
          onCerrar={() => setCerrando(null)}
          onGuardado={async () => {
            setCerrando(null)
            await recargar()
          }}
        />
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
                  además se contradecían: un envío sin precio no puede estar pagado. */}
              {e.envio_pagado ? (
                <StatusPill tone="success" label="PAGADO" />
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
  const toast = useToast()
  const original = Number(envio.monto_envio) || 0
  const [valor, setValor] = useState(original ? String(original) : '')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    const n = Number(valor)
    if (valor === '' || !Number.isFinite(n) || n < 0 || n === original) {
      setValor(original ? String(original) : '')
      return
    }
    setGuardando(true)
    try {
      await guardarCosto(envio.id, n)
      await onGuardado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar el precio.')
      setValor(original ? String(original) : '')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <Input
        type="number"
        value={valor}
        placeholder="sin cotizar"
        disabled={guardando}
        style={{ width: 110 }}
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => void guardar()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
      {!original ? <Badge tone="warning">falta</Badge> : null}
    </div>
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
            Este envío todavía no tiene precio. Si sale así, la etiqueta no le va a pedir nada al cliente.
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
        <Field label="Precio del envío">
          <Input type="number" value={String(f.monto_envio ?? '')} onChange={(e) => set('monto_envio', e.target.value)} />
        </Field>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={!!f.envio_pagado} onChange={(e) => set('envio_pagado', e.target.checked)} />
          {/* Es el tilde que decide si la etiqueta dice PAGADO o manda a cobrar. */}
          El envío ya está pagado
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
 * El cierre de caja del turno.
 *
 * 🔑 `pagado_al_cadete` es el único dato que hoy no existe en ningún lado: la planilla decía cuánto
 * se cobra de envío pero nunca cuánto cuesta el reparto, así que nunca se supo si el envío se
 * subsidia. Se deja vacío si no se sabe: vacío es "no se cargó" y cero diría que el reparto sale
 * gratis, que es una respuesta distinta.
 */
function CierreDelTurno({
  fecha,
  turno,
  aRendir,
  cierre,
  onCerrar,
  onGuardado,
}: {
  fecha: string
  turno: Turno
  aRendir: number
  cierre: { pagado_al_cadete: number | string | null; rendido: number | string | null } | null
  onCerrar: () => void
  onGuardado: () => Promise<void>
}) {
  const toast = useToast()
  const [pagado, setPagado] = useState(cierre?.pagado_al_cadete == null ? '' : String(cierre.pagado_al_cadete))
  const [rendido, setRendido] = useState(cierre?.rendido == null ? String(aRendir) : String(cierre.rendido))
  const [guardando, setGuardando] = useState(false)

  const diferencia = (Number(rendido) || 0) - aRendir

  async function guardar() {
    setGuardando(true)
    try {
      await cerrarTurno(fecha, turno, pagado === '' ? null : Number(pagado), rendido === '' ? null : Number(rendido))
      await onGuardado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cerrar el turno.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo={`Cerrar el turno ${turno}`}>
      <div style={{ display: 'grid', gap: space[4] }}>
        <Notice tone="brand">Según lo entregado, tendría que rendir {formatMoney(aRendir)}.</Notice>
        <Field label="Lo que trajo el cadete">
          <Input type="number" value={rendido} onChange={(e) => setRendido(e.target.value)} />
        </Field>
        {rendido !== '' && diferencia !== 0 ? (
          <Notice tone={diferencia < 0 ? 'danger' : 'warning'}>
            {diferencia < 0 ? `Faltan ${formatMoney(-diferencia)}.` : `Sobran ${formatMoney(diferencia)}.`}
          </Notice>
        ) : null}
        <Field
          label="Lo que se le pagó al cadete"
          hint="Dejalo vacío si no se sabe. Es el único número que falta para saber si el envío se subsidia o deja plata."
        >
          <Input type="number" value={pagado} onChange={(e) => setPagado(e.target.value)} />
        </Field>
        <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="solid" tone="brand" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Cerrar el turno'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
