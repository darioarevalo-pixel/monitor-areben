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

import { useMemo, useState } from 'react'
import {
  Button, CopyButton, Field, Input, Notice, SectionCard, Select, StatusPill,
  color, font, radius, space, weight, useToast, type Tone,
} from '@/components/ui'
import { numeroEM, etiquetaEM, trackingUrl } from '@/lib/reclamos/tipos'
import {
  anotarIntentoEntrega, marcarAvisada, marcarEntregado, registrarCompra, registrarEnvio, verificarOrden,
} from '@/lib/canjes/cliente'
import { mensajeDespacho, mensajeIntentoEntrega } from '@/lib/canjes/mensajes'
import { normalizeArgPhone } from '@/lib/crm/core'
import {
  VIAS_ENVIO, VIA_ENVIO_LABEL, camposParaTiendaNube, direccionEnUnaLinea, pideSeguimiento,
  queDatoPide, textoDeBusquedaDelItem, tieneDatosDeMarca, tieneDireccion,
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
        <span style={{ fontWeight: weight.semibold, fontSize: font.md }}>Para tipear en Tienda Nube</span>
        <span style={{ color: color.mut, fontSize: font.sm }}>
          {compraHecha
            ? 'La compra ya está hecha. Abrilo si hace falta volver a mirar los datos.'
            : 'Copiá cada campo y pegalo en el checkout.'}
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
      subtitle="El pedido se carga a mano en la tienda, como una venta común: el monitor no puede crearlo, sólo verificarlo."
      actions={
        <div style={{ display: 'flex', gap: space[2] }}>
          <StatusPill tone={PENDIENTE_TONE[canje.compra_estado]} label={canje.compra_estado === 'hecho' ? 'Comprado' : 'Falta comprar'} />
          <StatusPill tone={PENDIENTE_TONE[canje.envio_estado]} label={canje.envio_estado === 'hecho' ? 'Despachado' : 'Falta despachar'} />
        </div>
      }
    >
      <DatosDeElla canje={canje} persona={persona} />

      {/* ── Paso 1: la orden ── */}
      <div style={{ marginBottom: space[5] }}>
        <div style={{ fontWeight: weight.semibold, fontSize: font.md, marginBottom: space[2] }}>
          1. Cargá el pedido en la tienda
        </div>
        {persona && (
          <ParaTipearEnTiendaNube
            persona={persona}
            items={items}
            cupon={config?.cupon_codigo ?? null}
            emailPedido={config?.email_pedido ?? null}
            compraHecha={canje.compra_estado === 'hecho'}
          />
        )}
        <div style={{ color: color.mut, fontSize: font.sm, marginBottom: space[2] }}>
          Como una venta común: buscás los productos, los ponés en el carrito, aplicás el cupón de 100%
          y completás el checkout con los datos de arriba, campo por campo. Después pegá acá el número.
          La orden cae sola en Gestión Nube y descuenta el stock por el camino normal.
        </div>
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
