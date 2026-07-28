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
  Badge, Button, Card, CopyButton, Field, Input, Modal, Notice, SectionCard, StatusPill,
  color, font, space, weight, useConfirmar, useToast, type Tone,
} from '@/components/ui'
import { normalizeArgPhone } from '@/lib/crm/core'
import {
  aprobarCanje, cambiarEstadoCanje, leerCanje, leerToken, linkDelPortal, rechazarCanje,
  type FichaCanjeDatos,
} from '@/lib/canjes/cliente'
import { mensajeAcuerdo, mensajeLinkDatos } from '@/lib/canjes/mensajes'
import { puedeAprobar, puedeCerrarIncompleto } from '@/lib/canjes/permisos'
import { instagramParaMostrar } from '@/lib/canjes/instagram'
import {
  MOTIVOS_RECHAZO, STORE_LABEL, TIPO_CANJE_LABEL,
  costoEstimado, estadoEnCriollo, nombrePersona, quienApruebaCanje,
  type CanjeStore, type EstadoCanje,
} from '@/lib/canjes/tipos'
import { BloqueSeleccion } from './BloqueSeleccion'
import { BloqueEnvio } from './BloqueEnvio'
import { BloqueEntregables } from './BloqueEntregables'
import { CierreBalance } from './CierreBalance'

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

export function FichaCanje({
  store, canjeId, onVolver,
}: {
  store: CanjeStore
  canjeId: number
  onVolver: () => void
}) {
  const { perfil } = useSesion()
  const toast = useToast()
  const { confirmar, pedirTexto } = useConfirmar()

  const [d, setD] = useState<FichaCanjeDatos | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mostrandoLink, setMostrandoLink] = useState(false)

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

  const { canje, items, entregables, evidencias, persona } = d
  const editable = canje.estado !== 'cerrado' && canje.estado !== 'cancelado' && canje.estado !== 'rechazado'
  const puedeFirmar = nivel ? puedeAprobar(perfil, marcaPerm, nivel) : false

  async function proponer() {
    if (!entregables.length) {
      const igual = await confirmar({
        titulo: 'Sin entregables',
        mensaje: 'No cargaste nada que se haya comprometido a publicar. Se puede aprobar igual, pero después no hay nada que verificar ni forma de saber si cumplió.',
        ok: 'Mandar igual',
        tono: 'warning',
      })
      if (!igual) return
    }
    try {
      await cambiarEstadoCanje(store, canje.id, 'propuesta')
      await recargar()
      toast.ok('Mandado a aprobar. Le va a aparecer el aviso a quien pueda firmarlo.')
    } catch (e) { toast.error(String((e as Error)?.message || e)) }
  }

  async function aprobar() {
    try {
      const n = await aprobarCanje(store, canje.id)
      await recargar()
      toast.ok(`Aprobado (${n === 'aprobar-plata' ? 'firma alta' : 'firma común'}). Ya podés mandarle el link.`)
    } catch (e) { toast.error(String((e as Error)?.message || e)) }
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
          {canje.estado === 'borrador' && (
            <Button variant="solid" tone="brand" onClick={() => void proponer()}>Mandar a aprobar</Button>
          )}
          {canje.estado === 'propuesta' && puedeFirmar && (
            <>
              <Button variant="outline" tone="danger" onClick={() => void rechazar()}>Rechazar</Button>
              <Button variant="solid" tone="brand" onClick={() => void aprobar()}>Aprobar</Button>
            </>
          )}
          {canje.estado === 'acuerdo' && (
            <Button variant="solid" tone="brand" onClick={() => setMostrandoLink(true)}>Mandarle el link</Button>
          )}
          {editable && canje.estado !== 'borrador' && (
            <Button variant="ghost" tone="danger" onClick={() => void cancelar()}>Cancelar</Button>
          )}
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

      <BloqueSeleccion canje={canje} items={items} onCambio={() => void recargar()} editable={editable} />
      <BloqueEntregables
        canje={canje}
        entregables={entregables}
        evidencias={evidencias}
        onCambio={() => void recargar()}
        editable={editable}
      />
      {canje.estado !== 'borrador' && canje.estado !== 'propuesta' && canje.estado !== 'rechazado' && (
        <BloqueEnvio canje={canje} persona={persona} onCambio={() => void recargar()} />
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
    </div>
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
  const texto = link ? mensajeLinkDatos(persona, store, link, esPrimeraVez) : ''
  const tel = normalizeArgPhone(persona.telefono)

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Mandarle el link"
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
