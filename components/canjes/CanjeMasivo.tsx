'use client'

/**
 * El mismo canje para varias personas.
 *
 * **Por qué el mismo y no uno por persona**: una campaña es un trato —"tres fundas por dos historias
 * y un reel"— que se le ofrece a veinte creadoras. Lo que cambia por persona no es el trato, es a
 * quién se le escribe. Por eso el formulario es uno solo y lo que se multiplica es el mensaje.
 *
 * ⚠️ **Cada una conserva su link.** El canje, el token del portal, la cantidad y los datos
 * prellenados son suyos: acá no se crea "un canje con veinte personas adentro", se crean veinte
 * canjes iguales.
 *
 * ⚠️ **Una vetada no frena a las otras diecinueve.** El servidor la deja afuera con el motivo y
 * crea el resto; lo que no puede pasar es que se la saltee en silencio, y por eso se muestran.
 */

import { useMemo, useState } from 'react'
import {
  Badge, Button, CopyButton, Modal, Notice, StatusPill, TableWrap, THead, TBody, Tr, Th, Td,
  useConfirmar, useToast, color, font, space, weight, type Tone,
} from '@/components/ui'
import { normalizeArgPhone } from '@/lib/crm/core'
import {
  crearCanjesLote, marcarContactada, type CanjeDelLote, type ResumenLoteCanjes, type VitrinaEnLista,
} from '@/lib/canjes/cliente'
import { instagramHref } from '@/lib/canjes/instagram'
import { mensajePropuesta, mensajeSondeo } from '@/lib/canjes/mensajes'
import { TOPE_CANJES_LOTE, cuantasPersonas, separarSeleccion, textoDelResultado } from '@/lib/canjes/propuesta-masiva'
import {
  nombrePersona,
  type CanjeConfig, type CanjePersona, type CanjeStore, type NivelAprobacion,
} from '@/lib/canjes/tipos'
import { pedidoALista } from './GrillaEntregables'
import { AvisoDeFirma, FormularioPropuesta, useFormularioPropuesta } from './FormularioPropuesta'

export function CanjeMasivo({
  personas, store, configs, vitrinas, marcasVisibles, susNiveles, onCerrar, onListo,
}: {
  /** A quiénes se les marcó la casilla en el padrón. */
  personas: CanjePersona[]
  store: CanjeStore
  configs: CanjeConfig[]
  vitrinas: VitrinaEnLista[]
  marcasVisibles: CanjeStore[]
  susNiveles: NivelAprobacion[]
  onCerrar: () => void
  /** Se crearon: la lista se vuelve a pedir. */
  onListo: () => Promise<void>
}) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const form = useFormularioPropuesta({ store, configs, vitrinas, susNiveles })
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<ResumenLoteCanjes | null>(null)

  const { aptas, vetadas } = useMemo(() => separarSeleccion(personas), [personas])
  const seVaDelTope = aptas.length > TOPE_CANJES_LOTE

  async function armar() {
    if (!aptas.length) return
    if (vetadas.length) {
      const sigue = await confirmar.confirmar({
        titulo: vetadas.length === 1 ? 'Hay una vetada en la selección' : `Hay ${vetadas.length} vetadas en la selección`,
        mensaje: `${vetadas.map((p) => nombrePersona(p)).join(', ')} ${
          vetadas.length === 1 ? 'queda' : 'quedan'} afuera: el veto vale para las tres marcas.`,
        ok: aptas.length === 1 ? 'Armar 1 igual' : `Armar los ${aptas.length} igual`,
        tono: 'warning',
      })
      if (!sigue) return
    }
    setGuardando(true)
    try {
      const r = await crearCanjesLote(form.armada.marca, aptas.map((p) => p.id), form.armada.datos)
      // El resumen se muestra ANTES de recargar: `recargar()` vuelve a bajar el módulo entero y el
      // spinner se comería justo lo único que dice cuáles se crearon.
      setResultado(r)
      await onListo()
    } catch (e) {
      // ⚠️ Nada de "reintentar": si esto se cortó a mitad de camino puede haber canjes creados, y no
      // hay nada en la base que impida crear los mismos dos veces.
      toast.error(`${String((e as Error)?.message || e)} — puede que algunos se hayan creado: actualizá y revisá.`)
    } finally {
      setGuardando(false)
    }
  }

  if (resultado) {
    return (
      <ColaDeMensajes
        resultado={resultado}
        personas={personas}
        store={form.armada.marca}
        canjeParcial={form.canjeParcial}
        entregables={pedidoALista(form.pedido)}
        titulo={form.titulo}
        conVitrina={form.armada.datos.vitrina_id != null}
        onCerrar={onCerrar}
      />
    )
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Proponerles un canje a ${cuantasPersonas(personas.length)}`}
      ancho="ancho"
      cerrarConFondo={false}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button
            variant="solid"
            tone="brand"
            loading={guardando}
            disabled={!form.puede || !aptas.length || seVaDelTope}
            onClick={() => void armar()}
          >
            {aptas.length === 1 ? 'Armar la propuesta' : `Armar las ${aptas.length} propuestas`}
          </Button>
        </>
      }
    >
      {/* A quiénes, arriba de todo: es lo que distingue esta pantalla de la de a una, y lo que hay
          que poder repasar antes de crear veinte cosas. */}
      <div style={{ marginBottom: space[4] }}>
        <div style={{ fontWeight: weight.medium, marginBottom: space[2] }}>A quiénes</div>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          {personas.map((p) => (
            <Badge key={p.id} tone={p.vetada ? 'danger' : 'neutral'} subtle>
              {nombrePersona(p)}{p.vetada ? ' · vetada' : ''}
            </Badge>
          ))}
        </div>
        {vetadas.length > 0 && (
          <div style={{ color: color.mut, fontSize: font.sm, marginTop: space[2] }}>
            {vetadas.length === 1 ? 'La vetada queda afuera' : `Las ${vetadas.length} vetadas quedan afuera`}: el
            veto vale para las tres marcas.
          </div>
        )}
      </div>

      {seVaDelTope && (
        <div style={{ marginBottom: space[4] }}>
          <Notice tone="warning">
            El máximo por tanda son {TOPE_CANJES_LOTE} y hay {aptas.length}. Destildá algunas y hacelo
            en dos tandas: de a más, el pedido se corta a mitad de camino y quedan canjes creados sin
            que nadie sepa cuáles.
          </Notice>
        </div>
      )}

      <FormularioPropuesta estado={form} marcasVisibles={marcasVisibles} />

      <div style={{ marginTop: space[4] }}>
        <AvisoDeFirma estado={form} cuantos={aptas.length} />
      </div>
    </Modal>
  )
}

// ── La cola de mensajes ─────────────────────────────────────────────────────────

const ESTADO_TONE: Record<string, Tone> = { enviada: 'action', propuesta: 'warning' }

/**
 * Los veinte mensajes, uno por persona.
 *
 * 🔑 **Son veinte mensajes distintos, no uno repetido**: cada uno lleva su nombre. Un texto genérico
 * copiado veinte veces es exactamente lo que hace que una creadora se dé cuenta de que es un molde.
 *
 * El orden de los dos pasos es el mismo que el de a una (Bruno, 4-ago-2026): primero el sondeo —"¿te
 * interesa?", sin un solo número— y recién cuando contesta que sí, la propuesta con el trato. Acá el
 * paso se elige **para toda la lista**, porque el momento es el mismo para todas.
 */
function ColaDeMensajes({
  resultado, personas, store, canjeParcial, entregables, titulo, conVitrina, onCerrar,
}: {
  resultado: ResumenLoteCanjes
  personas: CanjePersona[]
  store: CanjeStore
  canjeParcial: Parameters<typeof mensajePropuesta>[1]
  entregables: Array<{ tipo: string; cantidad: number }>
  titulo?: string | null
  conVitrina: boolean
  onCerrar: () => void
}) {
  const [paso, setPaso] = useState<'sondeo' | 'propuesta'>('sondeo')
  const [adelanto, setAdelanto] = useState(conVitrina)
  const [marcados, setMarcados] = useState<Set<number>>(() => new Set())

  const porId = useMemo(() => new Map(personas.map((p) => [p.id, p])), [personas])
  const paraMensaje = entregables.map((e) => ({ tipo: e.tipo, cantidad_comprometida: e.cantidad }))

  const texto = (c: CanjeDelLote) => {
    const p = porId.get(c.persona_id)
    if (!p) return ''
    return paso === 'sondeo'
      ? mensajeSondeo(p, store, { titulo, adelanto })
      : mensajePropuesta(p, canjeParcial, paraMensaje as Parameters<typeof mensajePropuesta>[2])
  }

  // Fire-and-forget, igual que en la propuesta de a una: si falla, el canje sigue estando bien y lo
  // peor que pasa es que el listado diga "falta escribirle" un rato de más.
  const marcar = (c: CanjeDelLote) => {
    if (c.estado !== 'enviada' || marcados.has(c.id)) return
    setMarcados((s) => new Set(s).add(c.id))
    void marcarContactada(store, c.id).catch(() => {})
  }

  const resumen = textoDelResultado({
    creados: resultado.creados.length,
    rechazadas: resultado.rechazadas.length,
    errores: resultado.errores.length,
  })
  const hayQueEscribir = resultado.creados.some((c) => c.estado === 'enviada')

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Escribiles"
      ancho="ancho"
      pie={<Button variant="solid" tone="brand" onClick={onCerrar}>Listo</Button>}
    >
      <Notice tone={resultado.creados.length ? 'success' : 'warning'}>{resumen}</Notice>

      {hayQueEscribir && (
        <>
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', margin: `${space[3]} 0` }}>
            <Button
              variant={paso === 'sondeo' ? 'soft' : 'outline'}
              tone={paso === 'sondeo' ? 'brand' : undefined}
              size="sm"
              onClick={() => setPaso('sondeo')}
            >
              1. ¿Te interesa?
            </Button>
            <Button
              variant={paso === 'propuesta' ? 'soft' : 'outline'}
              tone={paso === 'propuesta' ? 'brand' : undefined}
              size="sm"
              onClick={() => setPaso('propuesta')}
            >
              2. La propuesta
            </Button>
          </div>

          <div style={{ color: color.mut, fontSize: font.sm, marginBottom: space[3] }}>
            {paso === 'sondeo'
              ? 'Este es el primero y no dice ni un número: sólo pregunta si le interesa. Cada mensaje lleva su nombre, así que se copian de a uno.'
              : 'Este va cuando ya contestó que le interesa. Podés volver acá desde la ficha de cada canje.'}
          </div>

          {paso === 'sondeo' && (
            <label style={{ display: 'flex', gap: space[2], alignItems: 'flex-start', marginBottom: space[3], cursor: 'pointer' }}>
              <input type="checkbox" checked={adelanto} onChange={(e) => setAdelanto(e.target.checked)} />
              <span style={{ fontSize: font.sm, color: color.ink }}>
                Todavía no está en la tienda
                <span style={{ color: color.mut2 }}> — les ofrece un avance exclusivo para que elijan</span>
              </span>
            </label>
          )}
        </>
      )}

      {resultado.creados.length > 0 && (
        <TableWrap>
          <THead>
            <Tr><Th>Con quién</Th><Th width={110}>Nº</Th><Th>Cómo nació</Th><Th /></Tr>
          </THead>
          <TBody>
            {resultado.creados.map((c) => {
              const p = porId.get(c.persona_id)
              const tel = normalizeArgPhone(p?.telefono)
              const t = texto(c)
              return (
                <Tr key={c.id}>
                  <Td>{p ? nombrePersona(p) : '—'}</Td>
                  <Td mono>{c.numero}</Td>
                  <Td>
                    <StatusPill
                      tone={ESTADO_TONE[c.estado] || 'neutral'}
                      label={c.estado === 'enviada' ? 'Listo para escribirle' : 'Quedó a la firma'}
                    />
                  </Td>
                  <Td align="right">
                    {/* Los que quedaron a la firma no tienen nada que copiar: hasta que alguien los
                        apruebe no hay link ni trato que ofrecer. */}
                    {c.estado === 'enviada' && p && (
                      <span style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <CopyButton getText={() => { marcar(c); return t }} label="Copiar" />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { marcar(c); window.open(instagramHref(p.instagram), '_blank', 'noopener') }}
                        >
                          Instagram
                        </Button>
                        {tel && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { marcar(c); window.open(`https://wa.me/${tel}?text=${encodeURIComponent(t)}`, '_blank', 'noopener') }}
                          >
                            WhatsApp
                          </Button>
                        )}
                      </span>
                    )}
                  </Td>
                </Tr>
              )
            })}
          </TBody>
        </TableWrap>
      )}

      {/* Las que quedaron afuera, con el motivo. Nunca en silencio: quien eligió veinte tiene que
          poder ver por qué salieron dieciocho. */}
      {(resultado.rechazadas.length > 0 || resultado.errores.length > 0) && (
        <div style={{ marginTop: space[4] }}>
          <div style={{ fontWeight: weight.medium, marginBottom: space[2] }}>Las que quedaron afuera</div>
          {[...resultado.rechazadas.map((r) => ({ id: r.persona_id, motivo: r.motivo })),
            ...resultado.errores.map((r) => ({ id: r.persona_id, motivo: r.error }))].map((r) => (
              <div key={r.id} style={{ fontSize: font.sm, marginBottom: 4 }}>
                <span style={{ fontWeight: weight.medium }}>
                  {porId.get(r.id) ? nombrePersona(porId.get(r.id)!) : `Persona ${r.id}`}
                </span>
                <span style={{ color: color.mut }}> — {r.motivo}</span>
              </div>
            ))}
        </div>
      )}
    </Modal>
  )
}
