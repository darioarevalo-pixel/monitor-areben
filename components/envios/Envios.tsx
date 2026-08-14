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
  Modal,
  Notice,
  Select,
  StatusPill,
  TBody,
  TableWrap,
  Td,
  THead,
  Th,
  Tr,
  formatMoney,
  space,
  useConfirmar,
  useToast,
} from '@/components/ui'
import { aCobrar, direccionCompleta, estaTodoPago, linkWhatsapp, ordenarParaPreparar, totalesDelTurno } from '@/lib/envios/core'
import { borrarEnvio, cambiarEstado, cerrarTurno, guardarEnvio, nuevoIdEnvio } from '@/lib/envios/cliente'
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
  const { fecha, setFecha, turno, setTurno, envios, cierres, cargando, error, recargar, traerDeTiendaNube } = useEnvios()
  const { confirmar } = useConfirmar()
  const toast = useToast()
  const [trayendo, setTrayendo] = useState(false)
  const [editando, setEditando] = useState<Partial<Envio> | null>(null)
  const [cerrando, setCerrando] = useState(false)

  const delTurno = useMemo(() => ordenarParaPreparar(envios.filter((e) => e.turno === turno)), [envios, turno])
  const totales = useMemo(() => totalesDelTurno(delTurno), [delTurno])
  const cierre = useMemo(() => cierres.find((c) => c.turno === turno) || null, [cierres, turno])

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
    const paraImprimir = delTurno.filter((e) => e.estado !== 'entregado' && e.estado !== 'no_entregado')
    if (!paraImprimir.length) return toast.error('No hay envíos para imprimir en este turno.')
    await imprimirEtiquetasCadete(paraImprimir)
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

      <Card>
        <div style={{ display: 'flex', gap: space[4], alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label="Día">
            <Input type="date" value={fecha} onChange={(ev) => setFecha(ev.target.value)} />
          </Field>
          <Field label="Turno">
            <Select value={turno} onChange={(ev) => setTurno(ev.target.value as Turno)}>
              <option value="mañana">Mañana</option>
              <option value="tarde">Tarde</option>
            </Select>
          </Field>
          <Button
            variant="outline"
            onClick={() => setEditando({ id: nuevoIdEnvio(), store: 'bdi', fecha, turno, origen: 'manual', estado: 'pendiente', envio_pagado: false })}
          >
            Cargar uno a mano
          </Button>
        </div>
      </Card>

      {error && <Notice tone="danger">{error}</Notice>}

      {/* Los dos totales con los que se cierra el turno son los mismos dos que la planilla calculaba
          al pie de cada sección: son la razón por la que la planilla existía. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: space[4] }}>
        <KpiCard label="Envíos del turno" value={String(totales.envios)} />
        <KpiCard label="Sin salir todavía" value={String(totales.pendienteDeSalir)} />
        <KpiCard label="Envíos ya pagos" value={formatMoney(totales.enviosPagos)} />
        <KpiCard label="A rendir" value={formatMoney(totales.aRendir)} sub={totales.aRendirSiTodoLlega !== totales.aRendir ? `${formatMoney(totales.aRendirSiTodoLlega - totales.aRendir)} todavía en la calle` : undefined} />
      </div>

      {cargando ? null : delTurno.length === 0 ? (
        <EmptyState
          title="No hay envíos cargados en este turno"
          hint="Traé los de Tienda Nube o cargá uno a mano."
        />
      ) : (
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
                <Td>{e.store === 'bdi' ? 'BDI' : 'Zattia'}</Td>
                <Td>
                  {/* Igual que en la etiqueta: pagado NO es "$0". Un cero se lee como un precio. */}
                  {estaTodoPago(e) ? <StatusPill tone="success" label="PAGADO" /> : <strong>{formatMoney(aCobrar(e))}</strong>}
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
                    <Button size="sm" variant="ghost" tone="danger" onClick={() => void borrar(e)}>
                      Sacar
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </TableWrap>
      )}

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[4], flexWrap: 'wrap' }}>
          <div>
            <strong>Cierre del turno</strong>
            <div style={{ opacity: 0.7, fontSize: 13 }}>
              {cierre?.cerrado_en
                ? `Cerrado por ${cierre.cerrado_por}. Se le pagaron ${cierre.pagado_al_cadete == null ? '—' : formatMoney(Number(cierre.pagado_al_cadete))} al cadete.`
                : 'Sin cerrar. Acá se anota lo que trajo el cadete y lo que se le pagó.'}
            </div>
          </div>
          <Button variant="outline" onClick={() => setCerrando(true)}>
            {cierre?.cerrado_en ? 'Corregir el cierre' : 'Cerrar el turno'}
          </Button>
        </div>
      </Card>

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
          turno={turno}
          aRendir={totales.aRendir}
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
