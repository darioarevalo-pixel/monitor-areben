'use client'

/**
 * La propuesta, **entera en una pantalla**: la marca, cuántos productos y qué se le pide publicar.
 * Al confirmar sale el mensaje para copiarle.
 *
 * Antes esto eran tres pantallas (crear el borrador → sumar los entregables de a uno en la ficha →
 * mandar a aprobar), y el canje quedaba a medias entre una y otra. La propuesta es una sola cosa:
 * lo que le ofrecemos y lo que esperamos a cambio. Si no está completa, no hay nada que mandarle.
 *
 * Dos cosas que conviene no volver a discutir:
 * - **El tope por unidades es el default.** Así se trabaja: "3 fundas", no "hasta $80.000". El modo
 *   monto sigue existiendo porque a veces se pacta así, pero dejó de ser lo primero que se ve.
 * - **La marca se elige acá.** El padrón es transversal a las tres marcas, así que se propone desde
 *   donde uno esté parado sin tener que cambiar de pestaña primero.
 *
 * El bloqueo por vencidos (§2 bis) **no se chequea acá**: hace falta ver los canjes de todas las
 * marcas y eso sólo lo puede el servidor, que rechaza con el motivo ya escrito en criollo.
 */

import { useMemo, useState } from 'react'
import {
  Button, CopyButton, Field, Input, Modal, Notice, Select,
  color, font, space, weight, useToast,
} from '@/components/ui'
import { normalizeArgPhone } from '@/lib/crm/core'
import { crearCanje, marcarContactada, type VitrinaEnLista } from '@/lib/canjes/cliente'
import { instagramHref } from '@/lib/canjes/instagram'
import { mensajePropuesta } from '@/lib/canjes/mensajes'
import {
  CANJE_STORES, STORE_LABEL, TIPO_CANJE_LABEL, naceEn, nombrePersona, unidadDeLaMarca,
  type CanjeConfig, type CanjePersona, type CanjeStore, type EstadoCanje, type NivelAprobacion,
  type TipoCanje, type TopeTipo, type TopeUnidad,
} from '@/lib/canjes/tipos'
import { GrillaEntregables, PEDIDO_VACIO, pedidoALista, totalPedido, type PedidoPorTipo } from './GrillaEntregables'

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
  const [marca, setMarca] = useState<CanjeStore>(store)
  const [tipo, setTipo] = useState<TipoCanje>('producto')
  const [titulo, setTitulo] = useState('')
  const [topeTipo, setTopeTipo] = useState<TopeTipo>('unidades')
  const [topePvp, setTopePvp] = useState('')
  const [montoPlata, setMontoPlata] = useState('')
  const [detalles, setDetalles] = useState(false)
  const [pedido, setPedido] = useState<PedidoPorTipo>(PEDIDO_VACIO)
  const [guardando, setGuardando] = useState(false)
  /** Lo que hay para copiarle, una vez creado. `null` mientras se arma. */
  const [creado, setCreado] = useState<{ id: number; estado: EstadoCanje } | null>(null)

  /** Sólo las **activas** de la marca elegida: una en borrador se está armando todavía. */
  const vitrinasDeLaMarca = useMemo(
    () => vitrinas.filter((v) => v.store === marca && v.estado === 'activa'),
    [vitrinas, marca],
  )
  const [vitrinaId, setVitrinaId] = useState<number | null>(null)
  // Cambiar de marca invalida la vitrina elegida: son de una marca cada una.
  const vitrinaElegida = vitrinasDeLaMarca.some((v) => v.id === vitrinaId) ? vitrinaId : null

  const cfg = useMemo(() => configs.find((c) => c.store === marca) || null, [configs, marca])
  const unidadPorDefecto = unidadDeLaMarca(cfg)
  const sugeridas = cfg?.unidades_sugeridas || []

  // La unidad arranca en la de la marca y se re-arma si la cambian, pero sin pisar lo que hayan
  // escrito a mano: por eso el estado guarda la línea y no sólo el número.
  const [unidades, setUnidades] = useState<TopeUnidad[]>([{ cantidad: 1, descripcion: '' }])
  const lineas = unidades.map((u) => ({ ...u, descripcion: u.descripcion || unidadPorDefecto }))
  const unidadesLimpias = lineas.filter((u) => u.descripcion.trim() !== '' && Number(u.cantidad) > 0)

  const canjeParcial = {
    store: marca,
    tipo,
    monto_plata: tipo === 'producto_plata' && montoPlata !== '' ? Number(montoPlata) : null,
    tope_tipo: topeTipo,
    tope_pvp: topeTipo === 'monto' && topePvp !== '' ? Number(topePvp) : null,
    tope_unidades: topeTipo === 'unidades' ? unidadesLimpias : [],
  }

  const hayTope = topeTipo === 'monto' ? topePvp !== '' : unidadesLimpias.length > 0
  const puede = hayTope && totalPedido(pedido) > 0

  // Con qué firma sale. `naceEn` es la misma función que corre el servidor.
  const { estado: estadoAlNacer, nivel } = naceEn(canjeParcial, [], {
    umbral_aprobacion_alta: cfg?.umbral_aprobacion_alta ?? null,
    factor_costo_estimado: cfg?.factor_costo_estimado ?? 0.4,
  }, susNiveles)

  const entregablesParaMensaje = pedidoALista(pedido).map((e) => ({
    tipo: e.tipo, cantidad_comprometida: e.cantidad,
  }))
  const texto = mensajePropuesta(persona, canjeParcial, entregablesParaMensaje)

  async function confirmar() {
    setGuardando(true)
    try {
      const { id, estado } = await crearCanje(marca, {
        persona_id: persona.id,
        tipo,
        titulo: titulo.trim() || undefined,
        tope_tipo: topeTipo,
        tope_pvp: topeTipo === 'monto' ? Number(topePvp) : null,
        tope_unidades: topeTipo === 'unidades' ? unidadesLimpias : [],
        monto_plata: tipo === 'producto_plata' && montoPlata !== '' ? Number(montoPlata) : null,
        entregables: pedidoALista(pedido),
        vitrina_id: vitrinaElegida,
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
        store={marca}
        canjeId={creado.id}
        estado={creado.estado}
        texto={texto}
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
          <Button variant="solid" tone="brand" loading={guardando} disabled={!puede} onClick={() => void confirmar()}>
            Armar la propuesta
          </Button>
        </>
      }
    >
      {/* ── Qué se le manda ── */}
      <div style={{ display: 'grid', gap: space[3], gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Field label="De qué marca">
          <Select value={marca} onChange={(e) => setMarca(e.target.value as CanjeStore)}>
            {CANJE_STORES.filter((s) => marcasVisibles.includes(s)).map((s) => (
              <option key={s} value={s}>{STORE_LABEL[s]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Cómo se acordó">
          <Select value={topeTipo} onChange={(e) => setTopeTipo(e.target.value as TopeTipo)}>
            <option value="unidades">Por cantidad (&quot;3 {unidadPorDefecto}&quot;)</option>
            <option value="monto">Por monto (&quot;hasta $80.000&quot;)</option>
          </Select>
        </Field>
      </div>

      {topeTipo === 'monto' ? (
        <div style={{ marginTop: space[3] }}>
          <Field label="Hasta cuánto puede elegir" hint="En PVP. Al cargar productos no se va a poder pasar de acá" required>
            <Input type="number" value={topePvp} onChange={(e) => setTopePvp(e.target.value)} autoFocus />
          </Field>
        </div>
      ) : (
        <div style={{ marginTop: space[3] }}>
          <div style={{ color: color.mut, fontSize: font.sm, marginBottom: space[2] }}>
            Qué se le manda. El total se controla solo al cargar los productos; que sean los
            correctos lo mirás vos.
          </div>
          {lineas.map((u, i) => (
            <div key={i} style={{ display: 'flex', gap: space[2], marginBottom: space[2], alignItems: 'center' }}>
              <Input
                type="number"
                min={1}
                value={String(u.cantidad)}
                onChange={(e) => setUnidades((p) => p.map((x, j) => (j === i ? { ...x, cantidad: Number(e.target.value) || 1 } : x)))}
                style={{ width: 80 }}
                autoFocus={i === 0}
              />
              <Input
                value={u.descripcion}
                list="canje-unidades"
                placeholder={unidadPorDefecto}
                onChange={(e) => setUnidades((p) => p.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)))}
                style={{ flex: 1 }}
              />
              {lineas.length > 1 && (
                <Button variant="ghost" tone="danger" size="sm" onClick={() => setUnidades((p) => p.filter((_, j) => j !== i))}>
                  Quitar
                </Button>
              )}
            </div>
          ))}
          {/* Las sugerencias son eso: sugerencias. Nunca una lista cerrada — el día que entre algo
              nuevo no puede depender de un deploy. */}
          <datalist id="canje-unidades">
            {[unidadPorDefecto, ...sugeridas].map((u) => <option key={u} value={u} />)}
          </datalist>
          <Button variant="ghost" size="sm" onClick={() => setUnidades((p) => [...p, { cantidad: 1, descripcion: '' }])}>
            Sumar otra línea
          </Button>
        </div>
      )}

      {/* ── De dónde elige ──
          Opcional a propósito: sin vitrina el canje funciona como siempre —los productos los cargás
          vos— y el link sólo le pide los datos. */}
      <div style={{ marginTop: space[4] }}>
        <Field
          label="De qué vitrina elige"
          hint={
            vitrinasDeLaMarca.length
              ? 'Lo que va a ver al abrir el link. Se puede cambiar después, hasta que elija.'
              : 'Todavía no hay ninguna vitrina activa de esta marca: se arman en la pestaña Vitrinas.'
          }
        >
          <Select
            value={vitrinaId == null ? '' : String(vitrinaId)}
            disabled={!vitrinasDeLaMarca.length}
            onChange={(e) => setVitrinaId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Sin vitrina — los productos los cargás vos</option>
            {vitrinasDeLaMarca.map((v) => (
              <option key={v.id} value={v.id}>{v.nombre}</option>
            ))}
          </Select>
        </Field>
      </div>

      {/* ── Qué publica ── */}
      <div style={{ marginTop: space[5] }}>
        <div style={{ fontWeight: weight.medium, marginBottom: space[2] }}>Qué le pedimos a cambio</div>
        <GrillaEntregables valor={pedido} onCambio={setPedido} />
      </div>

      {/* ── Detalles, plegados: `producto_plata` es la excepción y no tiene por qué competir ── */}
      <div style={{ marginTop: space[4] }}>
        <Button variant="ghost" size="sm" onClick={() => setDetalles((v) => !v)}>
          {detalles ? 'Ocultar los detalles' : 'Detalles (título, plata)'}
        </Button>
        {detalles && (
          <div style={{ display: 'grid', gap: space[3], gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: space[3] }}>
            <Field label="De qué es la acción" hint="Opcional, para reconocerlo después">
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Lanzamiento cápsula invierno" />
            </Field>
            <Field label="Qué se le da">
              <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoCanje)}>
                {(['producto', 'producto_plata'] as TipoCanje[]).map((t) => (
                  <option key={t} value={t}>{TIPO_CANJE_LABEL[t]}</option>
                ))}
              </Select>
            </Field>
            {tipo === 'producto_plata' && (
              <Field label="Cuánta plata" hint="El pago se hace por fuera; acá se registra">
                <Input type="number" value={montoPlata} onChange={(e) => setMontoPlata(e.target.value)} />
              </Field>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: space[4] }}>
        {estadoAlNacer === 'enviada' ? (
          <Notice tone="action">Se manda directo: al confirmar te doy el mensaje para copiarle.</Notice>
        ) : (
          <Notice tone="warning">
            {nivel === 'aprobar-plata'
              ? 'Va a la firma de quien pueda aprobar canjes con plata o de monto alto. Hasta que lo firmen no hay nada para mandarle.'
              : 'Va a la firma de quien pueda aprobar canjes. Hasta que lo firmen no hay nada para mandarle.'}
          </Notice>
        )}
      </div>
    </Modal>
  )
}

// ── El mensaje ──────────────────────────────────────────────────────────────────

/**
 * El mensaje que se le manda, apenas armada la propuesta.
 *
 * Se abre acá y no en la ficha por una razón práctica: el momento de escribirle es **ahora**, con
 * lo que se acaba de decidir a la vista. Si hay que ir a buscar el canje a un listado, se escribe
 * más tarde y con otras palabras.
 *
 * Cualquiera de las tres acciones (copiar, Instagram, WhatsApp) marca el canje como contactado: no
 * hay un botón aparte de "ya le escribí" porque nadie lo tocaría.
 */
export function MensajeParaCopiar({
  persona, store, canjeId, estado, texto, onCerrar,
}: {
  persona: Pick<CanjePersona, 'instagram' | 'telefono'>
  store: CanjeStore
  canjeId: number
  estado: EstadoCanje
  texto: string
  onCerrar: () => void
}) {
  const [marcado, setMarcado] = useState(false)
  const tel = normalizeArgPhone(persona.telefono)

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
      titulo="Mandale la propuesta"
      ancho="ancho"
      pie={<Button variant="solid" tone="brand" onClick={onCerrar}>Listo</Button>}
    >
      <div style={{ color: color.mut, fontSize: font.sm, marginBottom: space[2] }}>
        La negociación va por las redes. Si cambian las condiciones, después se asientan con
        &quot;Generar cambios&quot; y el mensaje se rearma solo.
      </div>

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
