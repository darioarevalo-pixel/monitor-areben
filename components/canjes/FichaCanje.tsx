'use client'

/**
 * Un canje de punta a punta: propuesta → aprobación → acuerdo → envío → cumplimiento → cierre.
 *
 * La pantalla sigue el orden del flujo real y **no esconde lo que el sistema no puede hacer**: la
 * orden de Tienda Nube se crea a mano y eso figura como paso del checklist, no como un botón que
 * promete algo que no va a pasar.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import {
  Badge, Button, Card, CopyButton, Field, Input, Modal, Notice, PasoCantidad, SectionCard, Select,
  StatusPill, color, font, space, weight, useConfirmar, useToast, type Tone,
} from '@/components/ui'
import { normalizeArgPhone } from '@/lib/crm/core'
import {
  aprobarCanje, borrarCanje, cambiarEstadoCanje, cambiarRetiroLocal, editarCanje, editarPersona,
  leerCanje, leerToken, linkDelPortal,
  queSeLlevaElCanje, rechazarCanje, registrarRespuesta,
  type FichaCanjeDatos, type VitrinaEnLista,
} from '@/lib/canjes/cliente'
import { mensajeAcuerdo, mensajeLinkDatos, mensajePropuesta } from '@/lib/canjes/mensajes'
import { puedeAprobar, puedeCerrarIncompleto } from '@/lib/canjes/permisos'
import { instagramParaMostrar } from '@/lib/canjes/instagram'
import {
  MOTIVOS_NO_ACEPTO, MOTIVOS_RECHAZO, STORE_LABEL, TIPO_CANJE_LABEL,
  costoEstimado, esTerminal, estadoEnCriollo, nombrePersona, queDatoPide, quienApruebaCanje,
  retiroLocalDisponible,
  type CanjeRow, type CanjeStore, type EstadoCanje, type TopeTipo, type TopeUnidad,
} from '@/lib/canjes/tipos'
import { BloqueSeleccion } from './BloqueSeleccion'
import { NotasCanje } from './NotasCanje'
import { SelectorModelo } from './SelectorModelo'
import { BloqueEnvio } from './BloqueEnvio'
import { BloqueEntregables } from './BloqueEntregables'
import { ContenidoDeElla } from './ContenidoDeElla'
import { CierreBalance } from './CierreBalance'
import { GrillaEntregables, listaAPedido, pedidoALista, totalPedido, type PedidoPorTipo } from './GrillaEntregables'
import { MensajeParaCopiar } from './ProponerCanje'

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

export function FichaCanje({
  store, canjeId, vitrinas, onVolver,
}: {
  store: CanjeStore
  canjeId: number
  /** Las vitrinas de la marca, para poder cambiarle de cuál elige mientras no haya elegido. */
  vitrinas: VitrinaEnLista[]
  onVolver: () => void
}) {
  const { perfil } = useSesion()
  const toast = useToast()
  const { confirmar, pedirTexto } = useConfirmar()

  const [d, setD] = useState<FichaCanjeDatos | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mostrandoLink, setMostrandoLink] = useState(false)
  const [mostrandoPropuesta, setMostrandoPropuesta] = useState(false)
  const [editandoTrato, setEditandoTrato] = useState(false)
  const [noAcepto, setNoAcepto] = useState(false)

  const recargar = useCallback(async () => {
    try {
      setD(await leerCanje(store, canjeId))
      setError(null)
    } catch (e) {
      setError(String((e as Error)?.message || e))
    } finally {
      setCargando(false)
    }
  }, [store, canjeId])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCargando(true)
      try {
        const datos = await leerCanje(store, canjeId)
        if (vivo) { setD(datos); setError(null) }
      } catch (e) {
        if (vivo) setError(String((e as Error)?.message || e))
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [store, canjeId])

  // La marca de la que cuelgan los permisos: Stunned no existe en `acceso`, es una línea de Zattia.
  const marcaPerm = store === 'bdi' ? 'bdi' : 'zattia'

  const nivel = useMemo(
    () => (d ? quienApruebaCanje(d.canje, d.items, d.config) : null),
    [d],
  )
  const costo = useMemo(
    () => (d ? costoEstimado(d.canje, d.items, d.config) : null),
    [d],
  )

  if (cargando) return <Card>Cargando el canje…</Card>
  if (error) return <Notice tone="danger">{error}</Notice>
  if (!d) return <Notice tone="warning">No se encontró ese canje.</Notice>

  const { canje, items, entregables, evidencias, persona, vitrina, config } = d
  const editable = !esTerminal(canje.estado)
  const puedeFirmar = nivel ? puedeAprobar(perfil, marcaPerm, nivel) : false

  async function aprobar() {
    try {
      const n = await aprobarCanje(store, canje.id)
      await recargar()
      toast.ok(`Aprobado (${n === 'aprobar-plata' ? 'firma alta' : 'firma común'}). Ya se le puede mandar la propuesta.`)
    } catch (e) { toast.error(String((e as Error)?.message || e)) }
  }

  /**
   * Ella dijo que sí. Es lo que genera el link del portal.
   *
   * Devuelve si salió bien: "Guardar y aceptado" abre el modal del link a continuación y no tiene
   * que abrirlo sobre un canje que no llegó a cambiar de estado.
   */
  async function acepto(): Promise<boolean> {
    try {
      await registrarRespuesta(store, canje.id, 'acepto')
      await recargar()
      toast.ok('Acordado. Ya podés mandarle el link para que cargue sus datos.')
      return true
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
      return false
    }
  }

  async function rechazar() {
    const motivo = await pedirTexto('¿Por qué se rechaza? Queda registrado.', '', {
      titulo: 'Rechazar el canje',
      placeholder: MOTIVOS_RECHAZO.join(' · '),
      ok: 'Rechazar',
    })
    if (!motivo) return
    try {
      await rechazarCanje(store, canje.id, motivo)
      await recargar()
    } catch (e) { toast.error(String((e as Error)?.message || e)) }
  }

  async function borrar() {
    // Se pregunta primero qué cascadea, para poder decirlo en vez de "¿seguro?". Un canje ya
    // acordado se lleva productos, entregables y publicaciones puestas.
    let detalle = ''
    try {
      const l = await queSeLlevaElCanje(store, canje.id)
      const partes = [
        l.items ? `${l.items} ${l.items === 1 ? 'producto' : 'productos'}` : '',
        l.entregables ? `${l.entregables} ${l.entregables === 1 ? 'entregable' : 'entregables'}` : '',
        l.evidencias ? `${l.evidencias} ${l.evidencias === 1 ? 'publicación cargada' : 'publicaciones cargadas'}` : '',
      ].filter(Boolean)
      if (partes.length) detalle = ` Se van con él: ${partes.join(', ')}.`
    } catch { /* si no se puede contar, igual se pregunta */ }

    const ok = await confirmar({
      titulo: `Eliminar ${canje.numero}`,
      mensaje: `No queda rastro de que existió.${detalle} Si el canje no salió, mejor cancelalo: así queda el motivo escrito.`,
      ok: 'Eliminar',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await borrarCanje(store, canje.id)
      toast.ok(`${canje.numero} eliminado.`)
      onVolver()
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    }
  }

  async function cancelar() {
    const motivo = await pedirTexto('¿Por qué se cancela? El link del portal deja de funcionar.', '', {
      titulo: 'Cancelar el canje',
      ok: 'Cancelar el canje',
    })
    if (!motivo) return
    try {
      await cambiarEstadoCanje(store, canje.id, 'cancelado', motivo)
      await recargar()
    } catch (e) { toast.error(String((e as Error)?.message || e)) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[5] }}>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="ghost" onClick={onVolver}>Volver</Button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          {canje.estado === 'propuesta' && puedeFirmar && (
            <>
              <Button variant="outline" tone="danger" onClick={() => void rechazar()}>Rechazar</Button>
              <Button variant="solid" tone="brand" onClick={() => void aprobar()}>Aprobar</Button>
            </>
          )}
          {/* La negociación pasa por las redes; acá sólo se asienta cómo terminó. "Generar
              cambios" existe porque las condiciones se mueven en el chat: para cuando se usa, la
              propuesta YA se mandó y lo que se está haciendo es registrar el acuerdo final, no
              rearmar el pitch. Por eso no ofrece el mensaje — para eso está "Ver el mensaje". */}
          {canje.estado === 'enviada' && (
            <>
              <Button variant="outline" onClick={() => setMostrandoPropuesta(true)}>Ver el mensaje</Button>
              <Button variant="outline" onClick={() => setEditandoTrato(true)}>Generar cambios</Button>
              <Button variant="outline" tone="danger" onClick={() => setNoAcepto(true)}>No aceptó</Button>
              <Button variant="solid" tone="brand" onClick={() => void acepto()}>Aceptó</Button>
            </>
          )}
          {/*
            🔴 **Con retiro en el local el link NO es un paso de más, y decir que lo era costó
            caro**: es el único momento del canje en que se le puede nombrar el buzón del contenido.
            Al que se le manda por correo se lo dice el mensaje del despacho; el retiro no tiene ese
            mensaje, porque el bloque de envío ni se dibuja. Por eso acá el botón es igual de sólido
            y sale también después de la entrega —en `en_curso`, que es cuando ella tiene el producto
            y nos debe el contenido—, que era justo cuando no había forma de volver a pasárselo.
          */}
          {(canje.estado === 'acuerdo'
            || (canje.retiro_local && (canje.estado === 'preparando' || canje.estado === 'en_curso'))) && (
            <Button variant="solid" tone="brand" onClick={() => setMostrandoLink(true)}>
              Enviarle el link
            </Button>
          )}
          {editable && (
            <Button variant="ghost" tone="danger" onClick={() => void cancelar()}>Cancelar</Button>
          )}
          {/* Borrar es lo que cancelar no es: no deja rastro. Para la prueba y el error de carga.
              Lo que se cayó de verdad se cancela, así queda el motivo. */}
          <Button variant="ghost" tone="danger" onClick={() => void borrar()}>Eliminar</Button>
        </div>
      </div>

      {/* ── Cabecera ── */}
      <Card>
        <div style={{ display: 'flex', gap: space[5], flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: font.lg, fontWeight: weight.semibold }}>{canje.numero}</strong>
              <Badge tone="neutral" subtle>{STORE_LABEL[canje.store]}</Badge>
              <StatusPill tone={ESTADO_TONE[canje.estado]} label={estadoEnCriollo(canje)} />
              <Badge tone="neutral" subtle>{TIPO_CANJE_LABEL[canje.tipo]}</Badge>
            </div>
            {canje.titulo && <div style={{ marginTop: 4 }}>{canje.titulo}</div>}
            {persona && (
              <div style={{ marginTop: 4, color: color.mut, fontSize: font.sm }}>
                {nombrePersona(persona)} · {instagramParaMostrar(persona.instagram, persona.instagram_raw)}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: color.mut, fontSize: font.sm }}>Costo estimado</div>
            <div style={{ fontSize: font.xl, fontWeight: weight.semibold }}>
              {costo == null ? '—' : `$${Math.round(costo).toLocaleString('es-AR')}`}
            </div>
            {/* Qué firma hace falta lo decide el canje, no quien lo mira. */}
            {canje.estado === 'propuesta' && nivel && (
              <div style={{ color: color.mut2, fontSize: font.sm }}>
                {nivel === 'aprobar-plata' ? 'Necesita firma alta' : 'Firma común'}
              </div>
            )}
            {canje.aprobacion_nivel && canje.aprobado_por && (
              <div style={{ color: color.mut2, fontSize: font.sm }}>
                Aprobado por {canje.aprobado_por}
              </div>
            )}
          </div>
        </div>

        {canje.estado === 'rechazado' && canje.rechazado_motivo && (
          <div style={{ marginTop: space[3] }}><Notice tone="danger">Rechazado: {canje.rechazado_motivo}</Notice></div>
        )}
        {canje.estado === 'cancelado' && canje.cancelado_motivo && (
          <div style={{ marginTop: space[3] }}><Notice tone="neutral">Cancelado: {canje.cancelado_motivo}</Notice></div>
        )}
        {canje.estado === 'no_acepto' && canje.respuesta_motivo && (
          <div style={{ marginTop: space[3] }}>
            <Notice tone="neutral">
              No aceptó: {canje.respuesta_motivo}
              {canje.respuesta_nota ? ` — ${canje.respuesta_nota}` : ''}
            </Notice>
          </div>
        )}
        {canje.estado === 'enviada' && (
          <div style={{ marginTop: space[3] }}>
            <Notice tone={canje.contacto_estado === 'hecho' ? 'action' : 'warning'}>
              {canje.contacto_estado === 'hecho'
                ? 'Ya se le escribió: esperando que conteste. Cuando conteste que le interesa, mandale la propuesta desde "Ver el mensaje". Lo que se negocie por las redes se asienta con "Generar cambios".'
                : 'La propuesta está armada pero todavía no se le escribió. El primer mensaje sale de "Ver el mensaje" y sólo pregunta si le interesa.'}
            </Notice>
          </div>
        )}
        {canje.estado === 'propuesta' && !puedeFirmar && (
          <div style={{ marginTop: space[3] }}>
            <Notice tone="warning">
              Esperando aprobación. Vos no tenés el permiso para firmarlo
              {nivel === 'aprobar-plata' ? ' (necesita la firma alta)' : ''}.
            </Notice>
          </div>
        )}
      </Card>

      {/* Historial de la persona a la vista al aprobar: es el dato que hoy no tiene quien firma. */}
      {canje.estado === 'propuesta' && persona && <HistorialCorto persona={persona} />}

      {/* Va ARRIBA del trabajo y no al fondo: lo que alguien anotó ayer es lo primero que hay que
          leer al abrir el canje, y una lista al final de una ficha larga no la ve nadie. Se dibuja
          también en los terminales, porque de un canje lo más útil suele saberse después. */}
      <NotasCanje
        store={store}
        canjeId={canje.id}
        notas={canje.notas || []}
        onCambio={(notas) => setD((prev) => (prev ? { ...prev, canje: { ...prev.canje, notas } } : prev))}
      />

      <BloqueSeleccion
        store={store}
        canje={canje}
        items={items}
        vitrina={vitrina}
        vitrinas={vitrinas}
        onCambio={() => void recargar()}
        editable={editable}
      />
      <BloqueEntregables
        canje={canje}
        entregables={entregables}
        evidencias={evidencias}
        persona={persona}
        onCambio={() => void recargar()}
        editable={editable}
      />
      {/* El material crudo que dejó ella en su link. Va PEGADO a los entregables porque es lo que
          se mira mientras se decide si cumplió, pero es su propio bloque: no es la prueba de que
          publicó, y confundirlos es lo que hacía que se leyeran como «Sólo captura». */}
      <ContenidoDeElla
        store={store}
        canje={canje}
        persona={persona}
        config={config}
        evidencias={evidencias}
        onCambio={() => void recargar()}
      />
      {/* Cómo lo recibe. Va ARRIBA del envío y desde la propuesta, no sólo al proponer: "ya lo
          acordamos y después me dice que pasa por el local" es el caso normal. Sólo en las marcas
          que tienen local; en las demás no hay nada que elegir. */}
      {/* Qué celular tiene, contra el stock real. Va para los DOS caminos —envío y retiro— porque
          si no hay funda para ese modelo no hay canje, se mande como se mande. Sólo donde el dato
          que se pide es el modelo (BDI vende fundas; Zattia y Stunned piden talles). */}
      {!esTerminal(canje.estado) && queDatoPide(store) === 'modelo_celular' && persona && (
        <SectionCard title="Qué celular tiene">
          <SelectorModelo
            valor={persona.modelo_celular}
            retiroLocal={!!canje.retiro_local}
            vitrina={vitrina ? { nombre: vitrina.nombre, items: vitrina.items || [] } : null}
            onGuardar={async (m) => {
              await editarPersona(store, persona.id, { modelo_celular: m })
              await recargar()
            }}
          />
        </SectionCard>
      )}

      {!esTerminal(canje.estado) && retiroLocalDisponible(store) && (
        <BloqueEntrega store={store} canje={canje} onCambio={() => void recargar()} />
      )}

      {/* El envío recién tiene sentido con el acuerdo hecho: antes no hay a dónde mandar nada.
          Y si lo retira en el local no hay envío en absoluto: la orden de Tienda Nube, el despacho y
          la entrega los reemplaza un solo acto en el mostrador. Dejar el bloque visible sería
          ofrecer dos caminos para lo mismo y alguien terminaría tipeando una orden al pedo. */}
      {!['propuesta', 'enviada', 'rechazado', 'no_acepto'].includes(canje.estado) && !canje.retiro_local && (
        <BloqueEnvio
          canje={canje}
          persona={persona}
          items={items}
          config={config}
          onCambio={() => void recargar()}
        />
      )}
      {(canje.estado === 'en_curso' || canje.estado === 'cerrado') && (
        <CierreBalance
          canje={canje}
          items={items}
          entregables={entregables}
          evidencias={evidencias}
          onCambio={() => void recargar()}
          puedeCerrarIncompleto={puedeCerrarIncompleto(perfil, marcaPerm)}
        />
      )}

      {mostrandoLink && persona && (
        <MandarLink
          store={store}
          canjeId={canje.id}
          canje={canje}
          persona={persona}
          entregables={entregables}
          onCerrar={() => setMostrandoLink(false)}
        />
      )}

      {/* El mismo modal que sale al armar la propuesta. El texto se rearma con lo que hay ahora,
          así que si el trato cambió, dice las condiciones nuevas. */}
      {mostrandoPropuesta && persona && (
        <MensajeParaCopiar
          persona={persona}
          store={canje.store}
          canjeId={canje.id}
          estado={canje.estado}
          propuesta={mensajePropuesta(persona, canje, entregables)}
          titulo={canje.titulo}
          conVitrina={canje.vitrina_id != null}
          onCerrar={() => { setMostrandoPropuesta(false); void recargar() }}
        />
      )}

      {editandoTrato && (
        <EditarTrato
          store={store}
          canje={canje}
          entregables={entregables}
          onCerrar={() => setEditandoTrato(false)}
          onListo={async (tambienAcepto) => {
            setEditandoTrato(false)
            if (!tambienAcepto) { await recargar(); return }
            // Es el mismo "Aceptó" de la barra: pasa a `acuerdo` y hace nacer el token del portal.
            if (await acepto()) setMostrandoLink(true)
          }}
        />
      )}

      {noAcepto && (
        <NoAcepto
          store={store}
          canjeId={canje.id}
          onCerrar={() => setNoAcepto(false)}
          onListo={async () => { setNoAcepto(false); await recargar() }}
        />
      )}
    </div>
  )
}

/**
 * "Generar cambios": lo que se negoció por las redes, asentado.
 *
 * Sólo el trato —cuánto se le manda y qué publica—, que es lo único que se mueve en una
 * negociación. Lo demás (la marca, el tipo) no cambia sin que cambie el canje entero.
 *
 * Sale con dos botones porque son dos momentos distintos y los dos existen: asentar un cambio
 * mientras se sigue negociando, y asentar el cambio **con el que ella dijo que sí**. El segundo es
 * el caso frecuente —se registra recién cuando el acuerdo cerró—, y separarlo en dos pantallas
 * dejaba a mitad de camino un canje ya acordado.
 */
function EditarTrato({
  store, canje, entregables, onCerrar, onListo,
}: {
  store: CanjeStore
  canje: FichaCanjeDatos['canje']
  entregables: FichaCanjeDatos['entregables']
  onCerrar: () => void
  /** `tambienAcepto`: además de guardar, registra el sí y sigue con el link del portal. */
  onListo: (tambienAcepto: boolean) => Promise<void>
}) {
  const toast = useToast()
  const [topeTipo, setTopeTipo] = useState<TopeTipo>(canje.tope_tipo)
  const [topePvp, setTopePvp] = useState(canje.tope_pvp == null ? '' : String(canje.tope_pvp))
  const [unidades, setUnidades] = useState<TopeUnidad[]>(
    canje.tope_unidades?.length ? canje.tope_unidades : [{ cantidad: 1, descripcion: '' }],
  )
  const [pedido, setPedido] = useState<PedidoPorTipo>(() => listaAPedido(entregables))
  const [guardando, setGuardando] = useState(false)

  const unidadesLimpias = unidades.filter((u) => u.descripcion.trim() !== '' && Number(u.cantidad) > 0)
  const puede = (topeTipo === 'monto' ? topePvp !== '' : unidadesLimpias.length > 0) && totalPedido(pedido) > 0

  /** Los dos botones guardan lo mismo; sólo cambia si además se registra el sí. */
  const guardar = async (tambienAcepto: boolean) => {
    setGuardando(true)
    try {
      await editarCanje(store, canje.id, {
        tope_tipo: topeTipo,
        tope_pvp: topeTipo === 'monto' ? Number(topePvp) : null,
        tope_unidades: topeTipo === 'unidades' ? unidadesLimpias : [],
        entregables: pedidoALista(pedido),
      })
      await onListo(tambienAcepto)
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Lo que se acordó al final"
      ancho="ancho"
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button variant="outline" loading={guardando} disabled={!puede} onClick={() => void guardar(false)}>
            Guardar
          </Button>
          <Button
            variant="solid"
            tone="brand"
            loading={guardando}
            disabled={!puede}
            title="Guarda el trato nuevo y registra que aceptó"
            onClick={() => void guardar(true)}
          >
            Guardar y aceptado
          </Button>
        </>
      }
    >
      <Field label="Cómo quedó">
        <Select value={topeTipo} onChange={(e) => setTopeTipo(e.target.value as TopeTipo)}>
          <option value="unidades">Por cantidad</option>
          <option value="monto">Por monto</option>
        </Select>
      </Field>

      {topeTipo === 'monto' ? (
        <div style={{ marginTop: space[3] }}>
          <Field label="Hasta cuánto puede elegir" required>
            <Input type="number" value={topePvp} onChange={(e) => setTopePvp(e.target.value)} />
          </Field>
        </div>
      ) : (
        <div style={{ marginTop: space[3] }}>
          {unidades.map((u, i) => (
            <div key={i} style={{ display: 'flex', gap: space[2], marginBottom: space[2], alignItems: 'center' }}>
              {/* El mismo control que al proponer: acá se reasienta lo que se renegoció y no tiene
                  por qué contarse distinto. */}
              <PasoCantidad
                valor={u.cantidad}
                min={1}
                onCambio={(n) => setUnidades((p) => p.map((x, j) => (j === i ? { ...x, cantidad: n } : x)))}
                etiqueta={u.descripcion || 'productos'}
              />
              <Input
                value={u.descripcion}
                onChange={(e) => setUnidades((p) => p.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)))}
                style={{ flex: 1 }}
              />
              {unidades.length > 1 && (
                <Button variant="ghost" tone="danger" size="sm" onClick={() => setUnidades((p) => p.filter((_, j) => j !== i))}>
                  Sacar
                </Button>
              )}
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setUnidades((p) => [...p, { cantidad: 1, descripcion: '' }])}>
            Sumar otra línea
          </Button>
        </div>
      )}

      <div style={{ marginTop: space[5] }}>
        <div style={{ fontWeight: weight.medium, marginBottom: space[2] }}>Qué le pedimos a cambio</div>
        <GrillaEntregables valor={pedido} onCambio={setPedido} />
      </div>
    </Modal>
  )
}

/**
 * El "no" de ella.
 *
 * Motivo de **lista cerrada**, a diferencia del rechazo interno: esto es información sobre la
 * persona —la mira quien la vuelva a proponer dentro de seis meses— y una lista abierta se llena de
 * `no contestó` / `No respondio` / `ni bola`.
 */
function NoAcepto({
  store, canjeId, onCerrar, onListo,
}: {
  store: CanjeStore
  canjeId: number
  onCerrar: () => void
  onListo: () => Promise<void>
}) {
  const toast = useToast()
  const [motivo, setMotivo] = useState(MOTIVOS_NO_ACEPTO[0])
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)

  const faltaNota = motivo === 'Otro' && !nota.trim()

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="No salió"
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Volver</Button>
          <Button
            variant="solid"
            tone="danger"
            loading={guardando}
            disabled={faltaNota}
            onClick={async () => {
              setGuardando(true)
              try {
                await registrarRespuesta(store, canjeId, 'no_acepto', { motivo, nota: nota.trim() || undefined })
                await onListo()
              } catch (e) {
                toast.error(String((e as Error)?.message || e))
              } finally {
                setGuardando(false)
              }
            }}
          >
            Registrar
          </Button>
        </>
      }
    >
      <Field label="Qué pasó">
        <Select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
          {MOTIVOS_NO_ACEPTO.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
      </Field>
      <div style={{ marginTop: space[3] }}>
        <Field
          label="Detalle"
          required={motivo === 'Otro'}
          hint="Lo lee quien la vuelva a proponer dentro de seis meses"
        >
          <Input value={nota} onChange={(e) => setNota(e.target.value)} />
        </Field>
      </div>
      <div style={{ marginTop: space[3], color: color.mut2, fontSize: font.sm }}>
        {motivo === 'Ahora no, más adelante'
          ? 'No cuenta como un no: la persona sigue igual de disponible para la próxima.'
          : 'El canje queda cerrado. Para volver a intentarlo se arma uno nuevo.'}
      </div>
    </Modal>
  )
}

/**
 * Envío o retiro en el local, y el cambio entre los dos.
 *
 * **Se puede cambiar hasta que salga**, no sólo al proponer: la creadora avisa que pasa por el local
 * después de haber acordado, y mandar a cancelar y armar otro canje por eso sería absurdo. El
 * servidor corta por lo mismo —despachado o entregado— y no por el estado.
 *
 * No tiene botón de entregar a propósito: **desde acá no se entrega**. El que entrega es el que
 * tiene la mercadería y la persona enfrente, y lo hace desde su pantalla (Cupones y canjes). Un
 * botón acá marcaría entregado algo que nadie entregó, y encima crearía la venta en Gestión Nube,
 * que no se puede deshacer.
 */
function BloqueEntrega({
  store, canje, onCambio,
}: {
  store: CanjeStore
  canje: CanjeRow
  onCambio: () => void
}) {
  const toast = useToast()
  const [guardando, setGuardando] = useState(false)
  const salio = !!canje.entregado_at || canje.envio_estado === 'hecho'

  async function cambiar(aRetiro: boolean) {
    setGuardando(true)
    try {
      await cambiarRetiroLocal(store, canje.id, aRetiro)
      onCambio()
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <SectionCard title="Cómo lo recibe">
      {salio ? (
        canje.retiro_local ? (
          <Notice tone="success">
            Lo retiró en el local{canje.entregado_at ? ` el ${canje.entregado_at.slice(0, 10)}` : ''}
            {canje.gn_venta_number ? ` — venta ${canje.gn_venta_number} en Gestión Nube` : ''}.
          </Notice>
        ) : null
      ) : (
        <>
          <Field label="Cómo lo recibe" hint="Se puede cambiar hasta que salga.">
            <Select
              value={canje.retiro_local ? 'local' : 'envio'}
              disabled={guardando}
              onChange={(e) => void cambiar(e.target.value === 'local')}
            >
              <option value="envio">Se lo enviamos</option>
              <option value="local">Retira en el local</option>
            </Select>
          </Field>
          {canje.retiro_local && (
            <div style={{ marginTop: space[3] }}>
              {/* 🔑 No hay ningún paso más: **que ella acepte ES la confirmación**. En cuanto el
                  canje pasa a `acuerdo`, le aparece a la chica del mostrador. */}
              <Notice tone={canje.estado === 'acuerdo' || canje.estado === 'preparando' ? 'neutral' : 'warning'}>
                {canje.estado === 'acuerdo' || canje.estado === 'preparando' ? (
                  <>
                    <b>Lo retira en el local.</b> Ya le aparece en <b>Cupones y canjes</b>, con el
                    nombre y cuántas unidades tiene autorizadas. No hay que cargar orden de Tienda
                    Nube ni despachar nada: elige en el mostrador, ahí se descuenta el stock y se
                    registra acá solo.
                  </>
                ) : (
                  <><b>Lo retira en el local.</b> Le va a aparecer al local en cuanto acepte el canje.</>
                )}
              </Notice>
              {canje.tn_orden && (
                <div style={{ marginTop: space[3] }}>
                  <Notice tone="warning">
                    Ojo: este canje ya tiene cargada la orden <b>{canje.tn_orden}</b> de Tienda Nube.
                    Si ya no se envía, anulala allá.
                  </Notice>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}

/** Lo mínimo que quien firma necesita saber de ella y hoy no tiene a mano. */
function HistorialCorto({ persona }: { persona: NonNullable<FichaCanjeDatos['persona']> }) {
  return (
    <SectionCard title="Con quién es">
      <div style={{ display: 'flex', gap: space[5], flexWrap: 'wrap' }}>
        <Dato label="Seguidores en Instagram" valor={persona.seguidores_ig?.toLocaleString('es-AR')} />
        <Dato label="Ciudad" valor={persona.ciudad} />
        {persona.destacada && <Dato label="Marcada como" valor={`Destacada${persona.destacada_nota ? `: ${persona.destacada_nota}` : ''}`} />}
        {persona.vetada && <Dato label="⚠ Vetada" valor={persona.vetada_motivo} />}
      </div>
      {(persona.notas || []).length > 0 && (
        <div style={{ marginTop: space[3], color: color.mut, fontSize: font.sm }}>
          Última nota: {[...(persona.notas || [])].pop()?.texto}
        </div>
      )}
    </SectionCard>
  )
}

function Dato({ label, valor }: { label: string; valor?: string | null }) {
  return (
    <div>
      <div style={{ color: color.mut, fontSize: font.sm }}>{label}</div>
      <div>{valor || <span style={{ color: color.mut2 }}>—</span>}</div>
    </div>
  )
}

/**
 * El link del portal, con el mensaje ya armado.
 *
 * **Hay dos versiones del texto y la diferencia importa:** en el segundo canje el formulario abre
 * prellenado, así que pedirle "completá tus datos" suena a que perdimos lo que ya nos dio. Cuál
 * usar se decide mirando si tiene dirección cargada, no con un flag guardado.
 */
function MandarLink({
  store, canjeId, canje, persona, entregables, onCerrar,
}: {
  store: CanjeStore
  canjeId: number
  canje: FichaCanjeDatos['canje']
  persona: NonNullable<FichaCanjeDatos['persona']>
  entregables: FichaCanjeDatos['entregables']
  onCerrar: () => void
}) {
  const toast = useToast()
  const [token, setToken] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const t = await leerToken(store, canjeId)
        if (vivo) setToken(t.token)
      } catch (e) {
        if (vivo) toast.error(String((e as Error)?.message || e))
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [store, canjeId, toast])

  const link = token ? linkDelPortal(token) : ''
  // Si ya tiene dirección es porque trabajó con nosotros antes: el formulario le va a abrir
  // prellenado y el mensaje tiene que decirlo.
  const esPrimeraVez = !persona.calle
  // Con vitrina el link no es un formulario: es la pantalla donde elige. El mensaje lo dice, o lo
  // abre esperando un trámite.
  const conVitrina = !!canje.vitrina_id && !canje.seleccion_cerrada_at
  const texto = link ? mensajeLinkDatos(persona, store, link, esPrimeraVez, conVitrina, !!canje.retiro_local) : ''
  const tel = normalizeArgPhone(persona.telefono)

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Enviarle el link"
      ancho="ancho"
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cerrar</Button>
          <Button
            variant="solid"
            tone="brand"
            disabled={!link}
            onClick={() => {
              const url = tel
                ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`
                : `https://wa.me/?text=${encodeURIComponent(texto)}`
              window.open(url, '_blank', 'noopener')
            }}
          >
            Abrir WhatsApp
          </Button>
        </>
      }
    >
      {cargando ? (
        <div>Generando el link…</div>
      ) : !token ? (
        <Notice tone="warning">Este canje no tiene link activo. Se genera al aprobarlo.</Notice>
      ) : (
        <>
          <Notice tone={esPrimeraVez ? 'neutral' : 'success'}>
            {esPrimeraVez
              ? 'Es la primera vez que trabajamos con ella: el formulario le va a pedir todo.'
              : 'Ya tenemos sus datos: el formulario le abre prellenado y sólo tiene que confirmar.'}
          </Notice>
          <div style={{ marginTop: space[3] }}>
            <Field label="El link">
              <div style={{ display: 'flex', gap: space[2] }}>
                <Input value={link} readOnly style={{ flex: 1 }} />
                <CopyButton getText={() => link} />
              </div>
            </Field>
          </div>
          <div style={{ marginTop: space[3] }}>
            <div style={{ color: color.mut, fontSize: font.sm, marginBottom: 4 }}>El mensaje que se manda</div>
            <pre style={{
              whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: font.sm,
              background: color.bg2, padding: space[3], borderRadius: 8, margin: 0,
            }}>{texto}</pre>
            <div style={{ marginTop: space[2] }}>
              <CopyButton getText={() => texto} label="Copiar el mensaje" />
            </div>
          </div>
          {entregables.length > 0 && (
            <div style={{ marginTop: space[5] }}>
              <div style={{ color: color.mut, fontSize: font.sm, marginBottom: 4 }}>
                Y si querés dejarle por escrito lo acordado
              </div>
              <CopyButton getText={() => mensajeAcuerdo(persona, canje, entregables)} label="Copiar el resumen del acuerdo" />
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
