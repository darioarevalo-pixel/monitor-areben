'use client'

/**
 * La propuesta a **una** persona: se arma el formulario y al confirmar sale el mensaje para copiarle.
 *
 * Antes esto eran tres pantallas (crear el borrador → sumar los entregables de a uno en la ficha →
 * mandar a aprobar), y el canje quedaba a medias entre una y otra. La propuesta es una sola cosa:
 * lo que le ofrecemos y lo que esperamos a cambio. Si no está completa, no hay nada que mandarle.
 *
 * El formulario en sí vive en `FormularioPropuesta`, compartido con la propuesta de a muchas. Lo que
 * queda acá es lo que **sí** es de a una: el título con su nombre y el paso del mensaje.
 */

import { useState } from 'react'
import { Button, CopyButton, Modal, Notice, color, font, space, useToast } from '@/components/ui'
import { normalizeArgPhone } from '@/lib/crm/core'
import { crearCanje, marcarContactada, type VitrinaEnLista } from '@/lib/canjes/cliente'
import { instagramHref } from '@/lib/canjes/instagram'
import { mensajePropuesta, mensajeSondeo } from '@/lib/canjes/mensajes'
import {
  nombrePersona,
  type CanjeConfig, type CanjePersona, type CanjeStore, type EstadoCanje, type NivelAprobacion,
} from '@/lib/canjes/tipos'
import { pedidoALista } from './GrillaEntregables'
import { AvisoDeFirma, FormularioPropuesta, useFormularioPropuesta } from './FormularioPropuesta'

export function ProponerCanje({
  persona,
  store,
  configs,
  vitrinas,
  marcasVisibles,
  susNiveles,
  onCerrar,
  onListo,
}: {
  persona: CanjePersona
  /** La marca de la sección: es sólo el valor inicial, se puede cambiar. */
  store: CanjeStore
  /** Las de todas las marcas visibles: de ahí sale la unidad por defecto de cada una. */
  configs: CanjeConfig[]
  /** Las de todas las marcas: se filtran por la elegida, que se puede cambiar acá adentro. */
  vitrinas: VitrinaEnLista[]
  marcasVisibles: CanjeStore[]
  /**
   * Qué firmas tiene quien está proponiendo. Sirve para **anticipar** si el canje sale directo o va
   * a la pestaña de aprobaciones: quien decide de verdad es el servidor, pero un salteo silencioso
   * se lee como que el sistema hizo algo raro.
   */
  susNiveles: NivelAprobacion[]
  onCerrar: () => void
  onListo: (id: number) => Promise<void>
}) {
  const toast = useToast()
  const form = useFormularioPropuesta({ store, configs, vitrinas, susNiveles })
  const [guardando, setGuardando] = useState(false)
  /** Lo que hay para copiarle, una vez creado. `null` mientras se arma. */
  const [creado, setCreado] = useState<{ id: number; estado: EstadoCanje } | null>(null)

  const entregablesParaMensaje = pedidoALista(form.pedido).map((e) => ({
    tipo: e.tipo, cantidad_comprometida: e.cantidad,
  }))
  const texto = mensajePropuesta(persona, form.canjeParcial, entregablesParaMensaje)

  async function confirmar() {
    setGuardando(true)
    try {
      const { id, estado } = await crearCanje(form.armada.marca, {
        persona_id: persona.id,
        ...form.armada.datos,
      })
      setCreado({ id, estado })
    } catch (e) {
      // El servidor devuelve el veto y el bloqueo por vencidos con el motivo ya en criollo.
      toast.error(String((e as Error)?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  // ── Paso 2: el mensaje ────────────────────────────────────────────────────────
  if (creado) {
    return (
      <MensajeParaCopiar
        persona={persona}
        store={form.armada.marca}
        canjeId={creado.id}
        estado={creado.estado}
        propuesta={texto}
        titulo={form.titulo}
        conVitrina={form.armada.datos.vitrina_id != null}
        onCerrar={() => void onListo(creado.id)}
      />
    )
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Proponerle un canje a ${nombrePersona(persona)}`}
      ancho="ancho"
      cerrarConFondo={false}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" tone="brand" loading={guardando} disabled={!form.puede} onClick={() => void confirmar()}>
            Armar la propuesta
          </Button>
        </>
      }
    >
      <FormularioPropuesta estado={form} marcasVisibles={marcasVisibles} />

      <div style={{ marginTop: space[4] }}>
        <AvisoDeFirma estado={form} cuantos={1} />
      </div>
    </Modal>
  )
}

// ── El mensaje ──────────────────────────────────────────────────────────────────

/**
 * Los mensajes que se le mandan, apenas armada la propuesta.
 *
 * Se abre acá y no en la ficha por una razón práctica: el momento de escribirle es **ahora**, con
 * lo que se acaba de decidir a la vista. Si hay que ir a buscar el canje a un listado, se escribe
 * más tarde y con otras palabras.
 *
 * 🔑 **El arranque son dos contactos** (Bruno, 4-ago-2026): primero el sondeo —"¿te interesa?", sin
 * un solo número— y recién cuando contesta que sí, la propuesta con el trato. Por eso este modal
 * abre en el sondeo y guarda la propuesta detrás del segundo botón, en vez de mostrar las dos como
 * si diera igual cuál se manda: el orden ES la decisión.
 *
 * Cualquiera de las tres acciones (copiar, Instagram, WhatsApp) marca el canje como contactado: no
 * hay un botón aparte de "ya le escribí" porque nadie lo tocaría.
 */
export function MensajeParaCopiar({
  persona, store, canjeId, estado, propuesta, titulo, conVitrina, onCerrar,
}: {
  persona: Pick<CanjePersona, 'nombre' | 'apellido' | 'instagram' | 'instagram_raw' | 'telefono'>
  store: CanjeStore
  canjeId: number
  estado: EstadoCanje
  /** El segundo contacto, ya armado con el trato de hoy. */
  propuesta: string
  /** De qué es la acción. Es lo que hace que el sondeo diga algo y no un "nos gusta tu perfil". */
  titulo?: string | null
  /** Hay vitrina colgada: se le puede ofrecer elegir, así que el adelanto arranca prendido. */
  conVitrina?: boolean
  onCerrar: () => void
}) {
  const [marcado, setMarcado] = useState(false)
  const [paso, setPaso] = useState<'sondeo' | 'propuesta'>('sondeo')
  /**
   * "Todavía no está en la tienda". Arranca prendido si hay vitrina —que es el caso por el que este
   * párrafo existe: el adelanto de lo que no salió— y se apaga con un click. **No lo decide el
   * sistema**: la vitrina no sabe si sus productos están publicados, y prometer un adelanto de algo
   * que ya está en la tienda se nota al toque.
   */
  const [adelanto, setAdelanto] = useState(conVitrina === true)
  const tel = normalizeArgPhone(persona.telefono)

  const texto = paso === 'sondeo'
    ? mensajeSondeo(persona, store, { titulo, adelanto })
    : propuesta

  // Fire-and-forget, como `marcarAvisada` en el bloque de envío: si falla, el canje sigue estando
  // bien y lo peor que pasa es que el listado diga "falta escribirle" un rato de más.
  function marcar() {
    if (marcado || estado !== 'enviada') return
    setMarcado(true)
    void marcarContactada(store, canjeId).catch(() => {})
  }

  if (estado !== 'enviada') {
    return (
      <Modal
        abierto
        onCerrar={onCerrar}
        titulo="Quedó a la firma"
        pie={<Button variant="solid" tone="brand" onClick={onCerrar}>Entendido</Button>}
      >
        <Notice tone="action">
          La propuesta quedó esperando la firma interna. Cuando la aprueben vas a poder copiar el
          mensaje desde la ficha del canje.
        </Notice>
      </Modal>
    )
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Escribile"
      ancho="ancho"
      pie={<Button variant="solid" tone="brand" onClick={onCerrar}>Listo</Button>}
    >
      {/* Los dos pasos, en orden y con el número puesto: primero se pregunta, después se ofrece. */}
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginBottom: space[3] }}>
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

      <div style={{ color: color.mut, fontSize: font.sm, marginBottom: space[2] }}>
        {paso === 'sondeo'
          ? 'Este es el primero y no dice ni un número: sólo pregunta si le interesa. Cuando conteste que sí, volvés acá y mandás el segundo.'
          : 'Este va cuando ya contestó que le interesa. Si las condiciones cambian, se asientan con “Generar cambios” y el mensaje se rearma solo.'}
      </div>

      {paso === 'sondeo' && (
        <label style={{ display: 'flex', gap: space[2], alignItems: 'flex-start', marginBottom: space[3], cursor: 'pointer' }}>
          <input type="checkbox" checked={adelanto} onChange={(e) => setAdelanto(e.target.checked)} />
          <span style={{ fontSize: font.sm, color: color.ink }}>
            Todavía no está en la tienda
            <span style={{ color: color.mut2 }}> — le ofrece un avance exclusivo para que elija</span>
          </span>
        </label>
      )}

      <pre
        style={{
          whiteSpace: 'pre-wrap',
          fontFamily: 'inherit',
          fontSize: font.sm,
          background: color.bg2,
          border: `1px solid ${color.line}`,
          borderRadius: 8,
          padding: space[3],
          margin: 0,
        }}
      >
        {texto}
      </pre>

      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginTop: space[3] }}>
        <CopyButton getText={() => { marcar(); return texto }} label="Copiar el mensaje" />
        <Button
          variant="outline"
          onClick={() => { marcar(); window.open(instagramHref(persona.instagram), '_blank', 'noopener') }}
        >
          Abrir Instagram
        </Button>
        {tel && (
          <Button
            variant="outline"
            onClick={() => { marcar(); window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener') }}
          >
            Abrir WhatsApp
          </Button>
        )}
      </div>
    </Modal>
  )
}
