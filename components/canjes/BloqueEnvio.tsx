'use client'

/**
 * La compra y el envío.
 *
 * ⚠️ **El monitor no crea la orden en Tienda Nube y no puede hacerlo**: no hay credenciales de TN
 * en este repo, todo lo de TN pasa por `bdi-catalogo`, que escribe categorías, visibilidad, stock
 * de variante e imágenes — **cero escritura de órdenes**. Por eso la orden con 100% de descuento
 * se crea A MANO en el admin, y acá sólo se registra el número y se *verifica* leyéndola.
 *
 * La pantalla lo dice como paso del checklist en vez de esconderlo: un botón que parece crear la
 * orden y no la crea es peor que no tenerlo.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Button, CopyButton, Field, Input, Notice, SectionCard, Select, StatusPill,
  color, font, radius, space, weight, useConfirmar, useToast, type Tone,
} from '@/components/ui'
import { numeroEM, etiquetaEM, trackingUrl } from '@/lib/reclamos/tipos'
import {
  anotarIntentoEntrega, comprarEnGn, marcarAvisada, marcarEntregado, registrarCompra, registrarEnvio,
  verificarOrden,
} from '@/lib/canjes/cliente'
import { notaVentaCanje } from '@/lib/canjes/nota-gn.core.js'
import {
  DEPOSITO_GN, resolverLineas, traerArticulosDeGn,
  type LineaVentaGn, type ProblemaVentaGn,
} from '@/lib/canjes/venta-gn'
import { credencialConPrompt } from '@/lib/sesion'
import { mensajeDespacho, mensajeIntentoEntrega } from '@/lib/canjes/mensajes'
import { normalizeArgPhone } from '@/lib/crm/core'
import {
  VIAS_ENVIO, VIA_ENVIO_LABEL, camposParaTiendaNube, direccionEnUnaLinea, itemsVivos,
  listoParaVenderEnGn, numeroCanje, pideSeguimiento, queDatoPide, textoDeBusquedaDelItem,
  tieneDatosDeMarca, tieneDireccion, ventaGnDisponible,
  type CanjeConfig, type CanjeItem, type CanjePersona, type CanjeRow, type ViaEnvio,
} from '@/lib/canjes/tipos'

const PENDIENTE_TONE: Record<string, Tone> = { pendiente: 'warning', hecho: 'success', no_aplica: 'neutral' }

/**
 * De dónde salieron los datos con los que se va a armar el pedido: si los cargó el equipo de
 * memoria o si los confirmó ella por el link.
 *
 * Es el único lugar del panel donde se ve el resultado del portal, y por eso está acá y no en la
 * ficha de la persona: el momento en que importa saber si la dirección es confiable es **justo
 * antes de tipearla en Tienda Nube**, no antes.
 */
function DatosDeElla({ canje, persona }: { canje: CanjeRow; persona: CanjePersona | null }) {
  if (!persona) return null

  const falta: string[] = []
  if (!tieneDireccion(persona)) falta.push('la dirección')
  // ⚠️ Con vitrina NO se le pide el modelo ni los talles: **ya los dijo eligiendo la variante**, y
  // el link dejó de preguntárselos justamente por eso. Reclamarlos acá mandaba a pedirle por
  // WhatsApp un dato que ella no tiene forma de cargar y que además ya está en lo que eligió.
  if (!canje.vitrina_id && !tieneDatosDeMarca(persona, canje.store)) {
    falta.push(queDatoPide(canje.store) === 'talles' ? 'los talles' : 'el modelo de celular')
  }
  if (!persona.telefono) falta.push('el teléfono')
  const confirmado = canje.datos_confirmados_at

  const aviso = falta.length ? (
    <Notice tone="warning">
      Falta {falta.length === 1 ? falta[0] : `${falta.slice(0, -1).join(', ')} y ${falta[falta.length - 1]}`}
      {confirmado
        ? `. Ella abrió el link el ${confirmado.slice(0, 10)} pero eso quedó vacío: pedíselo por WhatsApp.`
        : '. Mandale el link con «Enviarle el link» y lo carga ella.'}
    </Notice>
  ) : (
    <Notice tone={confirmado ? 'success' : 'neutral'}>
      {confirmado
        ? `Ella confirmó estos datos el ${confirmado.slice(0, 10)}.`
        : 'Los datos los cargó el equipo: ella nunca abrió el link. Si hay dudas con la dirección, mandáselo antes de despachar.'}
    </Notice>
  )

  // La dirección no se repite acá: está entera, campo por campo, en el bloque de abajo.
  return <div style={{ marginBottom: space[4] }}>{aviso}</div>
}

/**
 * Los datos para tipear el pedido, **campo por campo**.
 *
 * **El pedido se carga como una venta común, desde la tienda online**: se buscan los productos, se
 * agregan al carrito, se aplica el cupón de 100% y se completa el checkout. El checkout pide el
 * nombre por un lado y el apellido por otro, la calle en una casilla y la altura en otra; con
 * "copiar la dirección entera" hay que volver a partirla a mano ahí, que es exactamente donde se
 * cuela el CP mal tipeado que hace volver el paquete.
 *
 * Los vacíos se muestran igual, en gris y sin botón: la lista contesta de un vistazo la pregunta
 * que importa antes de empezar, que es qué le falta a esta persona para poder despacharle.
 *
 * **Se pliega solo cuando la compra ya está hecha.** Es un bloque grande cuyo trabajo termina en
 * ese momento; dejarlo abierto empuja hacia abajo los dos pasos que siguen.
 */
function ParaTipearEnTiendaNube({
  persona, items, cupon, emailPedido, compraHecha,
}: {
  persona: CanjePersona
  items: CanjeItem[]
  cupon: string | null
  /** El mail de la MARCA, que es el que va en la orden. Ver `camposParaTiendaNube`. */
  emailPedido: string | null
  compraHecha: boolean
}) {
  const campos = camposParaTiendaNube(persona, { email_pedido: emailPedido })
  // Lo que efectivamente entra a la orden. Lo quitado y lo que se cayó por falta de stock queda
  // fuera: son los dos casos en que el canje sale distinto de lo acordado, y tipearlos sería el
  // error que el bloque viene a evitar.
  const alPedido = useMemo(
    () => items.filter((i) => i.estado !== 'quitado' && i.estado !== 'sin_stock'),
    [items],
  )
  const listaEntera = useMemo(
    () => alPedido.map((i) => {
      const nombre = [i.nombre, i.variante].map((v) => String(v ?? '').trim()).filter(Boolean).join(' · ')
      return `${textoDeBusquedaDelItem(i)}${nombre && i.sku ? ` · ${nombre}` : ''} × ${i.cantidad}`
    }).join('\n'),
    [alPedido],
  )

  return (
    <details
      open={!compraHecha}
      style={{
        border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: space[3], marginBottom: space[4],
      }}
    >
      <summary style={{
        cursor: 'pointer', display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: weight.semibold, fontSize: font.md }}>Los datos de ella, campo por campo</span>
        <span style={{ color: color.mut, fontSize: font.sm }}>
          {compraHecha
            ? 'La compra ya está hecha. Abrilo si hace falta volver a mirar los datos.'
            : 'Para armar la etiqueta del envío: se copian de a uno, sin volver a partir la dirección.'}
        </span>
      </summary>
      <div style={{ marginTop: space[3] }} />

      {/* El cupón: uno solo por marca y siempre el mismo. Es lo primero porque sin él la orden no
          sale en $0, que es lo único que la distingue de una venta. */}
      <div style={{ marginBottom: space[3] }}>
        {cupon ? (
          <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: color.mut, fontSize: font.sm }}>Cupón de 100%:</span>
            <span style={{ fontWeight: weight.semibold, fontFamily: 'ui-monospace, monospace' }}>{cupon}</span>
            <CopyButton getText={() => cupon} label="Copiar el cupón" />
          </div>
        ) : (
          <Notice tone="warning">
            Esta marca no tiene cargado el cupón de 100%. Se crea a mano en Tienda Nube —el monitor no
            puede crearlo— y se guarda en la pestaña Ajustes.
          </Notice>
        )}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: space[2],
      }}>
        {campos.map((c) => (
          <div
            key={c.key}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[2],
              background: color.bg2, borderRadius: radius.md, padding: `${space[1.5]}px ${space[2]}px`,
              minWidth: 0,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ color: color.mut2, fontSize: font.xs }}>{c.label}</div>
              <div
                title={c.valor || undefined}
                style={{
                  fontSize: font.base, color: c.valor ? color.ink : color.mut2,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                {c.valor || '—'}
              </div>
            </div>
            {/* Sólo el ícono: trece botones diciendo "Copiar" son trece veces la misma palabra. */}
            {c.valor && (
              <CopyButton getText={() => c.valor} label="" copiedLabel="" title={`Copiar ${c.label.toLowerCase()}`} />
            )}
          </div>
        ))}
      </div>

      {tieneDireccion(persona) && (
        <div style={{ marginTop: space[2] }}>
          <CopyButton
            getText={() => direccionEnUnaLinea(persona)}
            label="Copiar la dirección en un renglón"
            variant="ghost"
          />
        </div>
      )}

      {/* El mail de ella, dicho y sin botón de copiar. Está a la vista para que nadie lo vaya a
          buscar a la ficha, y no se puede copiar para que no se tipee por costumbre en la casilla
          de arriba: en la orden va el de la marca. */}
      {!emailPedido ? (
        <div style={{ marginTop: space[2] }}>
          <Notice tone="warning">
            Esta marca no tiene cargado el mail para la orden. Se carga una vez en la pestaña
            Ajustes — no va el de la creadora.
          </Notice>
        </div>
      ) : persona.email ? (
        <div style={{ marginTop: space[2], color: color.mut, fontSize: font.sm }}>
          El mail de ella es <strong style={{ fontWeight: weight.medium }}>{persona.email}</strong>,
          y no va en la orden: queda en el padrón para volver a escribirle.
        </div>
      ) : null}

      {/* Los productos, para buscarlos en la tienda. Se copian **el SKU y el nombre por separado**:
          son las dos formas de encontrar una funda en el buscador y no siempre funciona la misma.
          ⚠️ El modelo va como texto y sin botón a propósito: no se busca por modelo, se usa para
          confirmar a ojo que la funda que se agregó al carrito es la que ella eligió. */}
      {alPedido.length > 0 && (
        <div style={{ marginTop: space[3], paddingTop: space[3], borderTop: `1px solid ${color.line}` }}>
          <div style={{ display: 'flex', gap: space[2], alignItems: 'center', marginBottom: space[2], flexWrap: 'wrap' }}>
            <span style={{ fontWeight: weight.medium, fontSize: font.sm }}>Qué va en la orden</span>
            <CopyButton getText={() => listaEntera} label="Copiar la lista entera" variant="ghost" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[1.5] }}>
            {alPedido.map((i) => (
              <div key={i.id} style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
                {i.sku ? (
                  <>
                    <CopyButton getText={() => i.sku as string} label="" copiedLabel="" title="Copiar el SKU" />
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: font.base }}>{i.sku}</span>
                  </>
                ) : (
                  // Sin SKU no se inventa un botón vacío: se dice, y se busca por nombre.
                  <span style={{ color: color.mut2, fontSize: font.xs }}>sin SKU</span>
                )}
                <CopyButton
                  getText={() => String(i.nombre ?? '')}
                  label=""
                  copiedLabel=""
                  title="Copiar el nombre"
                  disabled={!i.nombre}
                />
                <span style={{ fontSize: font.base }}>{i.nombre || '—'}</span>
                {i.variante && <span style={{ color: color.mut, fontSize: font.base }}>{i.variante}</span>}
                <span style={{ color: color.mut }}>× {i.cantidad}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </details>
  )
}

/**
 * **La venta del canje, escrita directo en Gestión Nube.**
 *
 * Es el camino que reemplazó a tipear la orden en el admin de Tienda Nube (1-sep-2026, pedido de
 * Bruno): un botón crea la venta a $0 en GN contra el cliente `Canjes BDI`, con el nombre de la
 * creadora en la nota, y descuenta el stock del depósito. **La etiqueta del envío se hace por
 * afuera** —por eso los datos de ella, campo por campo, siguen abajo con sus botones de copiar— y
 * después se carga el despacho en el paso 2, como siempre.
 *
 * 🔑 **Muestra las líneas ANTES de apretar, y eso es el punto del bloque.** Lo que la creadora
 * elige por su link viene con ids de Tienda Nube, así que el artículo de Gestión Nube lo resuelve
 * el SKU (`resolverLineas`): quien aprieta tiene que poder ver qué producto exacto se va a
 * descontar y de dónde. Un botón que dijera sólo "crear la venta" estaría pidiendo fe.
 *
 * 🔴 **Es irreversible**: Gestión Nube no anula ventas por API. De ahí la confirmación, el guard del
 * servidor (`listoParaVenderEnGn`, la misma regla que usa esta pantalla) y que el botón se apague
 * en cuanto hay número de venta.
 */
function VentaEnGestionNube({
  canje, persona, items, onCambio,
}: {
  canje: CanjeRow
  persona: CanjePersona | null
  items: CanjeItem[]
  onCambio: () => void
}) {
  const toast = useToast()
  const { confirmar } = useConfirmar()

  const vivos = useMemo(() => itemsVivos(items), [items])
  const puede = listoParaVenderEnGn(canje, items)
  const yaHecha = !!(canje.gn_venta_number || canje.gn_venta_id)
  /**
   * Si hay algo que ir a buscar a Gestión Nube. Se calcula ANTES del estado, y no dentro del
   * efecto, porque el lint prohíbe `setState` sincrónico ahí (`react-hooks/set-state-in-effect`) —
   * y con razón: el "cargando" inicial es un dato que ya se sabe al pintar, no algo que haya que
   * corregir con un segundo render. Mismo patrón que `Ajustes.tsx`.
   */
  const debeResolver = !yaHecha && vivos.length > 0 && ventaGnDisponible(canje.store)

  const [lineas, setLineas] = useState<LineaVentaGn[]>([])
  const [problemas, setProblemas] = useState<ProblemaVentaGn[]>([])
  const [cargando, setCargando] = useState(debeResolver)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // El artículo de GN y su precio. No se piden si el canje ya tiene venta: sería trabajo para
  // dibujar una tabla que nadie va a poder usar.
  useEffect(() => {
    // ⛔ La consulta va contra el espejo de BDI. Para otra marca no se pregunta: traería el
    // inventario equivocado y dibujaría líneas de otra tienda debajo de un botón apagado.
    if (!debeResolver) return
    let vivo = true
    void (async () => {
      setCargando(true)
      try {
        const { inventario, precios } = await traerArticulosDeGn('bdi', vivos)
        if (!vivo) return
        const r = resolverLineas(vivos, inventario, precios)
        setLineas(r.lineas)
        setProblemas(r.problemas)
      } catch (e) {
        if (vivo) setErrorCarga(String((e as Error)?.message || e))
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [vivos, debeResolver])

  const quien = [persona?.nombre, persona?.apellido].filter(Boolean).join(' ').trim() || 'sin nombre'
  // La MISMA función que manda `comprarEnGn`: lo que dice acá es literalmente lo que GN va a
  // guardar. Ver `lib/canjes/nota-gn.core.js`.
  const nota = notaVentaCanje({ numero: numeroCanje(canje.id), quien, modo: 'envio' })

  const faltaStock = lineas.filter((l) => l.stock_deposito != null && l.stock_deposito < l.cantidad)
  const sePuedeApretar = puede.ok && !cargando && !problemas.length && lineas.length > 0

  async function crear() {
    const total = lineas.reduce((a, l) => a + l.cantidad, 0)
    const ok = await confirmar({
      titulo: `Crear la venta de ${quien}`,
      mensaje:
        `Salen ${total} ${total === 1 ? 'unidad' : 'unidades'} del stock del depósito y queda la venta ` +
        `hecha en Gestión Nube a $0, a nombre de Canjes BDI. Esto no se puede deshacer desde el monitor.`,
      ok: 'Crear la venta',
    })
    if (!ok) return

    const cred = await credencialConPrompt('del Monitor')
    if (!cred) return void toast.error('Sin tu contraseña no se puede crear la venta en Gestión Nube.')

    setGuardando(true)
    try {
      const { gn_venta_number } = await comprarEnGn(canje, lineas, persona || {}, cred)
      toast.ok(`Venta creada${gn_venta_number ? ` — nº ${gn_venta_number} en Gestión Nube` : ''}.`)
      onCambio()
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  if (yaHecha) {
    return (
      <Notice tone="success">
        La venta ya está hecha en Gestión Nube{canje.gn_venta_number ? `, nº ${canje.gn_venta_number}` : ''}
        {' '}— a nombre de Canjes BDI, con el stock descontado del depósito. Si hubo un error hay que
        anularla a mano en Gestión Nube: por acá no se puede repetir.
      </Notice>
    )
  }

  return (
    <div style={{ marginBottom: space[4] }}>
      {!puede.ok && puede.motivo && (
        <div style={{ marginBottom: space[2] }}><Notice tone="warning">{puede.motivo}</Notice></div>
      )}

      {cargando ? (
        <div style={{ color: color.mut, fontSize: font.sm }}>Buscando los artículos en Gestión Nube…</div>
      ) : errorCarga ? (
        <Notice tone="warning">
          No se pudo leer el inventario de Gestión Nube ({errorCarga}). Recargá la ficha antes de crear la venta.
        </Notice>
      ) : (
        <>
          {lineas.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[1.5], marginBottom: space[3] }}>
              {lineas.map((l) => (
                <div key={l.item_id} style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', fontSize: font.base }}>
                  <span style={{ fontWeight: weight.medium }}>{l.nombre || 'Sin nombre'}</span>
                  {l.variante && <span style={{ color: color.mut }}>{l.variante}</span>}
                  <span style={{ color: color.mut }}>× {l.cantidad}</span>
                  <span style={{ color: color.mut }}>
                    ${l.unit_price.toLocaleString('es-AR')}
                    {/* De dónde salió el precio. Se dice porque hoy el de la vitrina está 10 veces
                        abajo del real y un número sin origen no se puede discutir. */}
                    {l.precio_de === 'gn' ? ' (precio de Gestión Nube)' : ' (precio del canje)'}
                  </span>
                  {/* Cómo se llegó al artículo: el SKU es el camino de lo que eligió ella. */}
                  {l.via === 'sku' && l.sku && (
                    <span style={{ color: color.mut2, fontSize: font.xs, fontFamily: 'ui-monospace, monospace' }}>
                      por SKU {l.sku}
                    </span>
                  )}
                  <span style={{
                    color: l.stock_deposito != null && l.stock_deposito < l.cantidad ? color.danger : color.mut2,
                    fontSize: font.xs,
                  }}>
                    {l.stock_deposito == null ? 'sin dato de stock' : `${l.stock_deposito} en ${DEPOSITO_GN}`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Lo que no se pudo resolver, renglón por renglón. No bloquea con un "no se puede" pelado:
              dice cuál y por qué, que es lo único con lo que alguien puede hacer algo. */}
          {problemas.length > 0 && (
            <div style={{ marginBottom: space[3] }}>
              <Notice tone="warning">
                <div style={{ fontWeight: weight.medium, marginBottom: space[1] }}>
                  {problemas.length === 1 ? 'Hay un producto' : `Hay ${problemas.length} productos`} que no se
                  {' '}{problemas.length === 1 ? 'puede' : 'pueden'} vender en Gestión Nube:
                </div>
                <ul style={{ margin: 0, paddingLeft: space[4] }}>
                  {problemas.map((p) => (
                    <li key={p.item_id}>{p.nombre || 'Sin nombre'}: {p.motivo}</li>
                  ))}
                </ul>
                <div style={{ marginTop: space[1.5] }}>
                  Se arregla cargando ese producto con el buscador de Gestión Nube, arriba en «Qué se lleva».
                </div>
              </Notice>
            </div>
          )}

          {faltaStock.length > 0 && (
            <div style={{ marginBottom: space[3] }}>
              <Notice tone="warning">
                No hay stock suficiente en {DEPOSITO_GN} de: {faltaStock.map((l) => l.nombre).join(', ')}.
                La venta se puede crear igual —Gestión Nube lo permite— pero el stock queda en negativo.
              </Notice>
            </div>
          )}

          {lineas.length > 0 && (
            <div style={{ color: color.mut, fontSize: font.sm, marginBottom: space[2] }}>
              Va a quedar en Gestión Nube a nombre de <strong style={{ fontWeight: weight.medium }}>Canjes BDI</strong>,
              con la nota <strong style={{ fontWeight: weight.medium }}>«{nota}»</strong>, descontando del {DEPOSITO_GN}.
            </div>
          )}

          <Button onClick={() => void crear()} loading={guardando} disabled={!sePuedeApretar}>
            Crear la venta en Gestión Nube
          </Button>
        </>
      )}
    </div>
  )
}

export function BloqueEnvio({
  canje, persona, items, config, onCambio,
}: {
  canje: CanjeRow
  persona: CanjePersona | null
  items: CanjeItem[]
  config: CanjeConfig | null
  onCambio: () => void
}) {
  const toast = useToast()

  const [orden, setOrden] = useState(canje.tn_orden ?? '')
  const [gnVenta, setGnVenta] = useState(canje.gn_venta_number ?? '')
  const [verificando, setVerificando] = useState(false)
  const [avisoOrden, setAvisoOrden] = useState<string | null>(null)

  const [via, setVia] = useState<ViaEnvio>((canje.envio_via as ViaEnvio) || 'correo')
  const [seguimiento, setSeguimiento] = useState(canje.envio_seguimiento ?? '')
  const [costo, setCosto] = useState<string>(canje.envio_costo == null ? '' : String(canje.envio_costo))
  const [guardando, setGuardando] = useState(false)

  const [anotandoIntento, setAnotandoIntento] = useState(false)
  const [notaIntento, setNotaIntento] = useState('')
  const intentos = canje.intentos ?? []

  const cerrado = canje.estado === 'cerrado' || canje.estado === 'cancelado'
  const link = canje.envio_seguimiento ? trackingUrl(canje.envio_via as never, canje.envio_seguimiento) : null

  async function verificar() {
    if (!orden.trim()) return
    setVerificando(true)
    setAvisoOrden(null)
    try {
      const v = await verificarOrden(canje.store, orden.trim())
      if (!v.encontrada) setAvisoOrden('No se encontró esa orden en Tienda Nube. Ojo que sólo se encuentran las recientes.')
      else if (v.aviso) setAvisoOrden(v.aviso)
      else toast.ok('La orden existe y va en $0, como corresponde a un canje.')
    } catch (e) {
      // Si la lectura no anda, el número se guarda igual y se verifica mirando el admin: es una
      // ayuda, no un requisito.
      setAvisoOrden(`No se pudo verificar contra Tienda Nube (${(e as Error)?.message}). Guardala igual y chequeala en el admin.`)
    } finally {
      setVerificando(false)
    }
  }

  async function guardarCompra() {
    setGuardando(true)
    try {
      await registrarCompra(canje.store, canje.id, { tn_orden: orden.trim(), gn_venta_number: gnVenta.trim() || undefined })
      onCambio()
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  async function guardarEnvio() {
    setGuardando(true)
    try {
      await registrarEnvio(canje.store, canje.id, {
        envio_via: via,
        // El `EM` es fijo y lo pone la pantalla: se guarda sólo el número. Sin esto, en GN salía
        // `EM EM1234`. Se reusa el helper de Reclamos en vez de copiarlo.
        envio_seguimiento: pideSeguimiento(via) ? numeroEM(seguimiento) || null : null,
        envio_costo: costo === '' ? null : Number(costo),
      })
      onCambio()
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  async function guardarIntento() {
    setGuardando(true)
    try {
      await anotarIntentoEntrega(canje.store, canje.id, notaIntento.trim() || undefined)
      setNotaIntento('')
      setAnotandoIntento(false)
      onCambio()
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  function escribirlePorWhatsApp(texto: string) {
    if (!persona) return
    const tel = normalizeArgPhone(persona.telefono)
    const url = tel
      ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`
    window.open(url, '_blank', 'noopener')
  }

  function avisarPorWhatsApp() {
    if (!persona) return
    escribirlePorWhatsApp(mensajeDespacho(persona, canje, link))
    void marcarAvisada(canje.store, canje.id).then(onCambio).catch(() => {})
  }

  return (
    <SectionCard
      title="Compra y envío"
      subtitle="La venta se escribe en Gestión Nube desde acá; la etiqueta del envío se hace por afuera."
      actions={
        <div style={{ display: 'flex', gap: space[2] }}>
          <StatusPill tone={PENDIENTE_TONE[canje.compra_estado]} label={canje.compra_estado === 'hecho' ? 'Comprado' : 'Falta comprar'} />
          <StatusPill tone={PENDIENTE_TONE[canje.envio_estado]} label={canje.envio_estado === 'hecho' ? 'Despachado' : 'Falta despachar'} />
        </div>
      }
    >
      <DatosDeElla canje={canje} persona={persona} />

      {/* ── Paso 1: la venta ──
          🔑 **El pedido ya no se tipea en Tienda Nube**: la venta se escribe directo en Gestión Nube
          (decisión de Bruno, 1-sep-2026) y la etiqueta del envío se hace por afuera. Los datos de
          ella siguen abajo, campo por campo, porque son los que se copian PARA esa etiqueta. */}
      <div style={{ marginBottom: space[5] }}>
        <div style={{ fontWeight: weight.semibold, fontSize: font.md, marginBottom: space[2] }}>
          1. Creá la venta en Gestión Nube
        </div>
        {ventaGnDisponible(canje.store) ? (
          <VentaEnGestionNube canje={canje} persona={persona} items={items} onCambio={onCambio} />
        ) : (
          <div style={{ color: color.mut, fontSize: font.sm, marginBottom: space[3] }}>
            Esta marca todavía no escribe la venta en Gestión Nube: cargá el pedido en Tienda Nube y
            anotá el número abajo.
          </div>
        )}
        {persona && (
          <ParaTipearEnTiendaNube
            persona={persona}
            items={items}
            cupon={config?.cupon_codigo ?? null}
            emailPedido={config?.email_pedido ?? null}
            compraHecha={canje.compra_estado === 'hecho'}
          />
        )}

        {/* El camino viejo: cargar la orden en Tienda Nube y anotar acá el número.
            ⛔ **No se borró, y no es indecisión.** Hay canjes que quedaron a mitad de camino con su
            orden ya tipeada, y sigue habiendo casos que no pasan por Gestión Nube (algo que se pidió
            de afuera, un pedido que se cargó antes de esto). Lo que cambia es la jerarquía: esto es
            la excepción y va plegado, no el paso principal.
            🔴 Hacer los dos descuenta el stock DOS veces: la orden de Tienda Nube también baja
            stock por su propio camino. Por eso lo dice el resumen, en vez de confiar en que se sepa. */}
        <details style={{
          border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: space[3],
        }}>
          <summary style={{ cursor: 'pointer', display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: weight.medium, fontSize: font.base }}>Se cargó en Tienda Nube</span>
            <span style={{ color: color.mut, fontSize: font.sm }}>
              Sólo si este pedido se tipeó a mano en la tienda. No hagas las dos cosas: el stock baja dos veces.
            </span>
          </summary>
          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end', marginTop: space[3] }}>
            <Field label="Nº de orden de Tienda Nube" width={200}>
              <Input value={orden} onChange={(e) => setOrden(e.target.value)} disabled={cerrado} />
            </Field>
            <Field label="Nº de venta en GN" hint="Opcional" width={180}>
              <Input value={gnVenta} onChange={(e) => setGnVenta(e.target.value)} disabled={cerrado} />
            </Field>
            <Button variant="outline" onClick={() => void verificar()} loading={verificando} disabled={!orden.trim() || cerrado}>
              Verificar
            </Button>
            <Button variant="outline" onClick={() => void guardarCompra()} loading={guardando} disabled={!orden.trim() || cerrado}>
              {canje.compra_estado === 'hecho' ? 'Actualizar' : 'Marcar comprado'}
            </Button>
          </div>
          {avisoOrden && (
            <div style={{ marginTop: space[2] }}>
              <Notice tone="warning">{avisoOrden}</Notice>
            </div>
          )}
        </details>
      </div>

      {/* ── Paso 2: el despacho ── */}
      <div style={{ marginBottom: space[5] }}>
        <div style={{ fontWeight: weight.semibold, fontSize: font.md, marginBottom: space[2] }}>2. Despachalo</div>
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Cómo va" width={180}>
            <Select value={via} onChange={(e) => setVia(e.target.value as ViaEnvio)} disabled={cerrado}>
              {VIAS_ENVIO.map((v) => <option key={v} value={v}>{VIA_ENVIO_LABEL[v]}</option>)}
            </Select>
          </Field>
          {/* Sólo Correo y Andreani tienen código que seguir. Pedirle uno a un cadete es pedir un
              dato que no existe. */}
          {pideSeguimiento(via) && (
            <Field label="Nº de seguimiento" hint="Sin el EM: lo pone el sistema" width={180}>
              <Input value={seguimiento} onChange={(e) => setSeguimiento(e.target.value)} disabled={cerrado} />
            </Field>
          )}
          <Field label="Costo del envío" hint="Sin esto el balance miente" width={150}>
            <Input type="number" value={costo} onChange={(e) => setCosto(e.target.value)} disabled={cerrado} />
          </Field>
          <Button variant="outline" onClick={() => void guardarEnvio()} loading={guardando} disabled={cerrado}>
            {canje.envio_estado === 'hecho' ? 'Actualizar' : 'Marcar despachado'}
          </Button>
        </div>
        {canje.envio_seguimiento && (
          <div style={{ marginTop: space[2], color: color.mut, fontSize: font.sm }}>
            {etiquetaEM(canje.envio_seguimiento)}
            {link && (
              <>
                {' · '}
                <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: color.brand }}>Seguir el envío</a>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Paso 3: avisarle y marcar que llegó ── */}
      <div>
        <div style={{ fontWeight: weight.semibold, fontSize: font.md, marginBottom: space[2] }}>3. Avisale y esperá</div>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="outline" onClick={avisarPorWhatsApp} disabled={canje.envio_estado !== 'hecho' || !persona}>
            {canje.aviso_estado === 'hecho' ? 'Volver a avisarle' : 'Avisarle que salió'}
          </Button>
          {/* ⚠️ Es el pivote del módulo: acá el servidor CONGELA el vencimiento de cada entregable.
              Hasta que no llega el pedido no hay plazo que contar. */}
          <Button
            variant="outline"
            onClick={() => void marcarEntregado(canje.store, canje.id).then(onCambio).catch((e) => toast.error(String(e?.message || e)))}
            disabled={canje.envio_estado !== 'hecho' || !!canje.entregado_at || cerrado}
          >
            Marcar que le llegó
          </Button>
          {/* Anotar un intento NO saca el canje de la cola de tránsito: el pedido sigue sin llegar,
              así que sigue siendo trabajo de alguien. */}
          <Button
            variant="ghost"
            onClick={() => setAnotandoIntento((v) => !v)}
            disabled={canje.envio_estado !== 'hecho' || !!canje.entregado_at || cerrado}
          >
            Agregar un intento de entrega
          </Button>
          {canje.entregado_at && (
            <span style={{ color: color.mut, fontSize: font.sm }}>
              Llegó el {canje.entregado_at.slice(0, 10)} — desde ahí corren los plazos.
            </span>
          )}
        </div>

        {anotandoIntento && (
          <div style={{
            marginTop: space[3], padding: space[3], border: `1px solid ${color.line}`, borderRadius: radius.lg,
          }}>
            <div style={{ color: color.mut, fontSize: font.sm, marginBottom: space[2] }}>
              Pasaron a entregarlo y no lo pudieron dejar. Se anota la fecha y sigue en la cola hasta
              que llegue.
            </div>
            <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Field label="Qué pasó" hint="Opcional" width={320}>
                <Input
                  value={notaIntento}
                  onChange={(e) => setNotaIntento(e.target.value)}
                  placeholder="No había nadie / dirección incompleta…"
                />
              </Field>
              <Button variant="outline" onClick={() => void guardarIntento()} loading={guardando}>
                Agregarlo
              </Button>
              {/* Sirve para las dos puntas: para avisarle antes de que se entere, y para contestarle
                  cuando la que escribe es ella preguntando por qué no le llegó. */}
              {persona && (
                <Button
                  variant="ghost"
                  onClick={() => escribirlePorWhatsApp(mensajeIntentoEntrega(persona, canje, link))}
                >
                  Escribirle por WhatsApp
                </Button>
              )}
              {persona && (
                <CopyButton
                  getText={() => mensajeIntentoEntrega(persona, canje, link)}
                  label="Copiar el mensaje"
                  variant="ghost"
                />
              )}
            </div>
          </div>
        )}

        {intentos.length > 0 && (
          <div style={{ marginTop: space[3] }}>
            <div style={{ color: color.mut2, fontSize: font.xs, marginBottom: space[1] }}>
              {intentos.length === 1 ? 'Un intento de entrega' : `${intentos.length} intentos de entrega`}
            </div>
            {intentos.map((i, n) => (
              <div key={`${i.at}-${n}`} style={{ color: color.mut, fontSize: font.sm }}>
                {i.at.slice(0, 10)}
                {i.nota ? ` · ${i.nota}` : ''}
                {i.usuario ? ` · ${i.usuario}` : ''}
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  )
}
