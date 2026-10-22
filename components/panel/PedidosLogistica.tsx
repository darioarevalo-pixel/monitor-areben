'use client'

import { useEffect, useState } from 'react'
import { color, font, radius, space } from '@/components/ui/tokens'
import {
  avisosDe,
  cambiosDeEnvio,
  catalogosLogistica,
  entregaDe,
  generarEtiqueta,
  guardarEntrega,
  leerMensaje,
  vistaPrevia,
  type CampoEnvio,
  type Envio,
  pedidosDelCliente,
  pendientesLogistica,
  TRANSPORTE,
  type Catalogos,
  type PedidoLogistica,
  type PendienteLogistica,
  type Resultado,
} from '@/lib/crm/logistica'

/**
 * Los pedidos del cliente que están en curso en Logística, en la ficha del chat (Darío, 22-oct-2026:
 * no olvidarse de elegir la forma de entrega, cargar el EM y pasar el seguimiento). Desde la 2ª
 * tanda, la forma de entrega se elige acá (sólo admin: el servidor lo corta).
 *
 * Sin pedidos en curso no se dibuja nada: es lo normal y no hace falta anunciarlo. Un error sí se
 * ve, en un renglón, para que «no aparece» no se lea como «no tiene pedidos».
 */
export function PedidosLogistica({ clienteId, tel, despacho }: { clienteId: number | null; tel: string | null; despacho?: string }) {
  // Lo que llegó va con a quién era: al cambiar de chat no se ve un instante el pedido del anterior.
  const clave = `${clienteId ?? ''}|${tel ?? ''}`
  const [llegado, setLlegado] = useState<{ clave: string; r: Resultado<PedidoLogistica[]> } | null>(null)
  useEffect(() => {
    let vivo = true
    if (!clienteId && !tel) return
    pedidosDelCliente(clienteId, tel).then((r) => vivo && setLlegado({ clave: `${clienteId ?? ''}|${tel ?? ''}`, r }))
    return () => {
      vivo = false
    }
  }, [clienteId, tel])

  // Lo que usó la vez anterior sale sólo de la lista de pendientes: se pide si algún pedido no tiene
  // forma de entrega, para dejar marcada esa opción.
  const [sugerencias, setSugerencias] = useState<Map<number, PendienteLogistica['suggestion']>>(new Map())
  const faltaElegir = llegado?.r.t === 'ok' && llegado.r.datos.some((p) => !p.dispatch_option)
  useEffect(() => {
    if (!faltaElegir) return
    let vivo = true
    pendientesLogistica().then((x) => {
      if (vivo && x.t === 'ok') setSugerencias(new Map(x.datos.orders.map((o) => [o.id, o.suggestion])))
    })
    return () => {
      vivo = false
    }
  }, [faltaElegir])

  /** Un pedido que volvió de Logística (guardado, o cómo quedó si cambió en el medio) reemplaza al viejo. */
  const reemplazar = (nuevo: PedidoLogistica) =>
    setLlegado((l) => (l && l.r.t === 'ok' ? { ...l, r: { t: 'ok', datos: l.r.datos.map((p) => (p.id === nuevo.id ? nuevo : p)) } } : l))

  const r = llegado?.clave === clave ? llegado.r : null
  if (!r || r.t === 'sin-permiso') return null
  if (r.t === 'error')
    return (
      <Caja>
        <div style={{ fontSize: font.xs, color: color.mut2 }}>Logística: {r.motivo}</div>
      </Caja>
    )
  if (!r.datos.length) return null
  return (
    <Caja>
      <div style={{ fontSize: font.xs, fontWeight: 700, letterSpacing: 0.4, color: color.mut2, textTransform: 'uppercase', marginBottom: 6 }}>
        En Logística
      </div>
      {r.datos.map((p, i) => (
        <Pedido key={p.id} p={p} primero={i === 0} sugerencia={sugerencias.get(p.id) ?? null} despacho={despacho} onCambio={reemplazar} />
      ))}
    </Caja>
  )
}

function Caja({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        background: color.surface,
        border: `1px solid ${color.line}`,
        borderRadius: radius.lg,
        padding: `${space[2]}px ${space[3]}px ${space[3]}px`,
        margin: `0 ${space[2]}px ${space[2]}px`,
      }}
    >
      {children}
    </section>
  )
}

function Pedido({
  p,
  primero,
  sugerencia,
  despacho,
  onCambio,
}: {
  p: PedidoLogistica
  primero: boolean
  sugerencia: PendienteLogistica['suggestion']
  despacho?: string
  onCambio: (p: PedidoLogistica) => void
}) {
  const [modo, setModo] = useState<'entrega' | 'etiqueta' | null>(null)
  const eligiendo = modo === 'entrega'
  const setEligiendo = (v: boolean) => setModo(v ? 'entrega' : null)
  // La etiqueta se arma acá sólo en Etiqueta libre y Transporte: la de EM la da Envío Nube.
  const llevaEtiqueta = p.dispatch_option?.code === 2 || p.dispatch_option?.code === TRANSPORTE
  const [aviso, setAviso] = useState<{ txt: string; mal?: boolean } | null>(null)
  const avisos = avisosDe(p)
  const entrega = entregaDe(p)
  return (
    <div style={{ paddingTop: primero ? 0 : space[2], marginTop: primero ? 0 : space[2], borderTop: primero ? 0 : `1px solid ${color.line2}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: font.sm, fontWeight: 700, color: color.ink }}>Pedido {p.gn_number || p.id}</span>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, border: `1px solid ${color.line}`, background: color.bg2, color: color.mut, whiteSpace: 'nowrap' }}>
          {p.status.label}
        </span>
        <span style={{ flex: 1 }} />
        <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: font.xs, color: color.brand, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          Abrir ↗
        </a>
      </div>
      <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
        {entrega ? `${entrega} · ` : ''}
        {p.units.scanned} de {p.units.total} escaneadas
      </div>
      {p.tracking_number && <Seguimiento numero={p.tracking_number} link={p.tracking_url} />}
      {aviso && (
        <div style={{ marginTop: 4, fontSize: font.xs, color: aviso.mal ? color.dangerInk : color.successInk }}>{aviso.txt}</div>
      )}
      {eligiendo ? (
        <ElegirEntrega
          p={p}
          sugerencia={sugerencia}
          onCancelar={() => setEligiendo(false)}
          onListo={(nuevo, txt, mal) => {
            if (nuevo) onCambio(nuevo)
            setAviso({ txt, mal })
            setEligiendo(false)
          }}
        />
      ) : modo === 'etiqueta' ? (
        <ArmarEtiqueta
          p={p}
          despacho={despacho}
          onCancelar={() => setModo(null)}
          onListo={(nuevo, txt, mal) => {
            if (nuevo) onCambio(nuevo)
            setAviso({ txt, mal })
            if (!mal) setModo(null)
          }}
        />
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <BotonChico onClick={() => (setAviso(null), setEligiendo(true))}>{p.dispatch_option ? 'Cambiar forma de entrega' : 'Elegir forma de entrega'}</BotonChico>
          {llevaEtiqueta && (
            <BotonChico fuerte={!p.has_label} onClick={() => (setAviso(null), setModo('etiqueta'))}>
              {p.has_label ? 'Rehacer etiqueta' : 'Armar etiqueta'}
            </BotonChico>
          )}
        </div>
      )}
      {avisos.map((a) => (
        <div key={a} style={{ marginTop: 4, fontSize: font.xs, color: color.warningInk, background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: radius.sm, padding: '3px 8px' }}>
          {a}
        </div>
      ))}
    </div>
  )
}

/** El número de seguimiento, con un botón para copiarlo y pegárselo al cliente. */
function Seguimiento({ numero, link }: { numero: string; link: string | null }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link ? `${numero}\n${link}` : numero)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      /* sin permiso de portapapeles: el número queda a la vista igual */
    }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: font.xs }}>
      <span style={{ color: color.mut2 }}>Seguimiento</span>
      <span style={{ fontWeight: 700, color: color.ink, fontVariantNumeric: 'tabular-nums' }}>{numero}</span>
      <button
        type="button"
        onClick={copiar}
        style={{ height: 22, padding: '0 8px', fontSize: 11, fontWeight: 600, borderRadius: 999, border: `1px solid ${color.line}`, background: color.bg2, color: copiado ? color.successInk : color.ink, cursor: 'pointer' }}
      >
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  )
}

function BotonChico({ children, onClick, disabled, fuerte }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; fuerte?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        marginTop: 6,
        height: 28,
        padding: '0 10px',
        fontSize: font.xs,
        fontWeight: 600,
        borderRadius: radius.md,
        border: `1px solid ${fuerte ? color.brand : color.line}`,
        background: fuerte ? color.brand : color.bg2,
        color: fuerte ? '#fff' : color.ink,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  )
}

/**
 * Elegir la forma de entrega: las opciones de Logística y, si es Transporte, cuál. Nace marcada con
 * lo que tiene el pedido o, si no tiene, con lo que el cliente usó la vez anterior.
 */
function ElegirEntrega({
  p,
  sugerencia,
  onCancelar,
  onListo,
}: {
  p: PedidoLogistica
  sugerencia: PendienteLogistica['suggestion']
  onCancelar: () => void
  onListo: (nuevo: PedidoLogistica | null, txt: string, mal?: boolean) => void
}) {
  const [cat, setCat] = useState<Resultado<Catalogos> | null>(null)
  const [codigo, setCodigo] = useState<number | null>(p.dispatch_option?.code ?? sugerencia?.dispatch_option.code ?? null)
  const [carrier, setCarrier] = useState<string>(p.carrier?.slug ?? sugerencia?.carrier?.slug ?? '')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    catalogosLogistica().then(setCat)
  }, [])

  if (!cat) return <div style={{ marginTop: 6, fontSize: font.xs, color: color.mut2 }}>Cargando…</div>
  if (cat.t !== 'ok')
    return (
      <div style={{ marginTop: 6, fontSize: font.xs, color: color.dangerInk }}>
        {cat.t === 'error' ? cat.motivo : 'Sin acceso.'} <BotonChico onClick={onCancelar}>Cancelar</BotonChico>
      </div>
    )

  const esTransporte = codigo === TRANSPORTE
  const listo = codigo !== null && (!esTransporte || !!carrier)
  const igual = codigo === (p.dispatch_option?.code ?? null) && (!esTransporte || carrier === (p.carrier?.slug ?? ''))

  const guardar = async () => {
    if (!listo || codigo === null || guardando) return
    setGuardando(true)
    const r = await guardarEntrega(p, codigo, esTransporte ? carrier : null)
    setGuardando(false)
    if (r.t === 'ok') return onListo(r.pedido, 'Guardado en Logística')
    if (r.t === 'cambio') return onListo(r.pedido, `${r.motivo} Fijate cómo quedó.`, true)
    onListo(null, r.motivo, true)
  }

  return (
    <div style={{ marginTop: 6, padding: space[2], border: `1px solid ${color.line}`, borderRadius: radius.md, background: color.bg2 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {cat.datos.dispatch_options.map((o) => (
          <button
            key={o.code}
            type="button"
            onClick={() => setCodigo(o.code)}
            aria-pressed={codigo === o.code}
            style={{
              height: 'auto',
              padding: '5px 10px',
              fontSize: font.xs,
              fontWeight: 600,
              borderRadius: 999,
              border: `1px solid ${codigo === o.code ? color.brand : color.line}`,
              background: codigo === o.code ? color.brand : color.surface,
              color: codigo === o.code ? '#fff' : color.ink,
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      {esTransporte && (
        <select
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          style={{ marginTop: 6, width: '100%', height: 30, fontSize: font.sm, borderRadius: radius.sm, border: `1px solid ${color.line}`, background: color.surface, color: color.ink }}
        >
          <option value="">Elegí el transporte</option>
          {cat.datos.carriers.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>
      )}
      {!p.dispatch_option && sugerencia && <div style={{ marginTop: 6, fontSize: font.xs, color: color.mut2 }}>Marcado: lo que usó la vez pasada.</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <BotonChico fuerte onClick={guardar} disabled={!listo || igual || guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </BotonChico>
        <BotonChico onClick={onCancelar} disabled={guardando}>
          Cancelar
        </BotonChico>
      </div>
    </div>
  )
}

/** Los datos de quien recibe, en el orden de la etiqueta. `solo` = sólo para esa forma de entrega. */
const CAMPOS: { k: CampoEnvio; txt: string; ayuda?: string; solo?: number; si?: 'domicilio' | 'sucursal' }[] = [
  { k: 'first_name', txt: 'Nombre' },
  { k: 'last_name', txt: 'Apellido' },
  { k: 'dni', txt: 'DNI o CUIT' },
  { k: 'phone', txt: 'Teléfono' },
  { k: 'branch_name', txt: 'Sucursal', si: 'sucursal' },
  { k: 'address', txt: 'Dirección', ayuda: 'Calle, número, piso y depto', si: 'domicilio' },
  { k: 'locality', txt: 'Localidad' },
  { k: 'province', txt: 'Provincia' },
  { k: 'zipcode', txt: 'Código postal' },
  { k: 'insurance_amount', txt: 'Seguro', ayuda: 'Vacío = mínimo', solo: TRANSPORTE },
  { k: 'payment_info', txt: 'Pago', ayuda: 'Vacío = en destino', solo: TRANSPORTE },
  { k: 'free_text', txt: 'Texto libre', solo: 2 },
]

const campoStyle: React.CSSProperties = {
  width: '100%',
  height: 30,
  padding: '0 8px',
  fontSize: font.sm,
  borderRadius: radius.sm,
  border: `1px solid ${color.line}`,
  background: color.surface,
  color: color.ink,
  boxSizing: 'border-box',
}

/**
 * Armar la etiqueta desde el chat (Darío, 22-oct-2026): pegar el mensaje del cliente → la IA de
 * Logística separa los datos → se revisan → se ve la etiqueta → «Guardar y generar». La imprime el
 * depósito; el panel no imprime.
 *
 * 🔑 **Guardar pide haber visto la etiqueta con ESOS datos**: tocar un campo después de la vista
 * previa vuelve a pedirla. Es todo o nada en Logística, pero lo que se guarda es real.
 */
function ArmarEtiqueta({
  p,
  despacho,
  onCancelar,
  onListo,
}: {
  p: PedidoLogistica
  despacho?: string
  onCancelar: () => void
  onListo: (nuevo: PedidoLogistica | null, txt: string, mal?: boolean) => void
}) {
  const codigo = p.dispatch_option?.code ?? TRANSPORTE
  const [mensaje, setMensaje] = useState(despacho || '')
  const [envio, setEnvio] = useState<Envio>(() => ({ ...(p.shipping || {}) }))
  const [carrier, setCarrier] = useState<string>(p.carrier?.slug ?? '')
  const [cat, setCat] = useState<Catalogos | null>(null)
  const [ocupado, setOcupado] = useState<'leer' | 'ver' | 'guardar' | null>(null)
  const [problema, setProblema] = useState<string | null>(null)
  const [previa, setPrevia] = useState<{ png: string; de: string } | null>(null)
  useEffect(() => {
    if (codigo === TRANSPORTE) catalogosLogistica().then((r) => r.t === 'ok' && setCat(r.datos))
  }, [codigo])

  const entrega = envio.delivery_type === 'domicilio' ? 'domicilio' : envio.delivery_type === 'sucursal' ? 'sucursal' : null
  const datos = {
    dispatch_option: codigo,
    ...(codigo === TRANSPORTE ? { carrier: carrier || null } : {}),
    shipping: cambiosDeEnvio(p.shipping, envio),
  }
  const huella = JSON.stringify(datos)
  const vista = previa?.de === huella

  const poner = (k: CampoEnvio, v: string) => setEnvio((e) => ({ ...e, [k]: v }))

  const leer = async () => {
    setOcupado('leer')
    setProblema(null)
    const r = await leerMensaje(mensaje)
    setOcupado(null)
    if (r.t !== 'ok') return setProblema(r.motivo)
    // Lo que la IA no encontró no borra lo que ya estaba.
    setEnvio((e) => {
      const n = { ...e }
      for (const [k, v] of Object.entries(r.shipping) as [CampoEnvio, string | null][]) if (v) n[k] = v
      return n
    })
    if (r.carrier && codigo === TRANSPORTE) {
      const c = cat?.carriers.find((x) => x.slug === r.carrier || x.label.toLowerCase() === r.carrier!.toLowerCase())
      setCarrier(c ? c.slug : r.carrier)
    }
  }

  const ver = async () => {
    setOcupado('ver')
    setProblema(null)
    const r = await vistaPrevia(p, datos)
    setOcupado(null)
    if (r.t !== 'ok') return setProblema(r.motivo)
    setPrevia({ png: r.png, de: huella })
  }

  const guardar = async () => {
    if (!vista) return
    setOcupado('guardar')
    setProblema(null)
    const r = await generarEtiqueta(p, datos)
    setOcupado(null)
    if (r.t === 'ok') return onListo(r.pedido, 'Etiqueta generada: la imprime el depósito')
    if (r.t === 'cambio') return onListo(r.pedido, `${r.motivo} Fijate cómo quedó antes de volver a guardar.`, true)
    setProblema(r.motivo)
  }

  return (
    <div style={{ marginTop: 6, padding: space[2], border: `1px solid ${color.line}`, borderRadius: radius.md, background: color.bg2, display: 'grid', gap: 6 }}>
      <label style={{ fontSize: font.xs, color: color.mut2 }}>
        Mensaje del cliente
        <textarea
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          rows={3}
          placeholder="Pegá acá el mensaje con sus datos"
          style={{ ...campoStyle, height: 'auto', padding: 8, marginTop: 2, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </label>
      <div>
        <BotonChico onClick={leer} disabled={!mensaje.trim() || !!ocupado}>
          {ocupado === 'leer' ? 'Leyendo…' : 'Completar con el mensaje'}
        </BotonChico>
      </div>

      {codigo === TRANSPORTE && (
        <label style={{ fontSize: font.xs, color: color.mut2 }}>
          Transporte
          <select value={carrier} onChange={(e) => setCarrier(e.target.value)} style={{ ...campoStyle, marginTop: 2 }}>
            <option value="">Elegí el transporte</option>
            {(cat?.carriers || []).map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
            {carrier && cat && !cat.carriers.some((c) => c.slug === carrier) && <option value={carrier}>{carrier} (nuevo)</option>}
          </select>
        </label>
      )}

      <label style={{ fontSize: font.xs, color: color.mut2 }}>
        Entrega
        <select value={entrega ?? ''} onChange={(e) => poner('delivery_type', e.target.value)} style={{ ...campoStyle, marginTop: 2 }}>
          <option value="">Elegí</option>
          <option value="sucursal">En sucursal</option>
          <option value="domicilio">A domicilio</option>
        </select>
      </label>

      {CAMPOS.filter((c) => (!c.solo || c.solo === codigo) && (!c.si || c.si === entrega)).map((c) => (
        <label key={c.k} style={{ fontSize: font.xs, color: c.k && p.missing.length && esFaltante(p, c.txt) ? color.warningInk : color.mut2 }}>
          {c.txt}
          {c.ayuda && <span style={{ color: color.mut2 }}> · {c.ayuda}</span>}
          {c.k === 'free_text' ? (
            <textarea value={envio[c.k] ?? ''} onChange={(e) => poner(c.k, e.target.value)} rows={2} style={{ ...campoStyle, height: 'auto', padding: 8, marginTop: 2, fontFamily: 'inherit' }} />
          ) : (
            <input value={envio[c.k] ?? ''} onChange={(e) => poner(c.k, e.target.value)} style={{ ...campoStyle, marginTop: 2 }} />
          )}
        </label>
      ))}

      {problema && <div style={{ fontSize: font.xs, color: color.dangerInk }}>{problema}</div>}

      {previa && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previa.png} alt="Vista previa de la etiqueta" style={{ width: '100%', border: `1px solid ${color.line}`, borderRadius: radius.sm, background: '#fff', opacity: vista ? 1 : 0.4 }} />
      )}
      {previa && !vista && <div style={{ fontSize: font.xs, color: color.mut2 }}>Cambiaste algo: volvé a ver la etiqueta antes de guardar.</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <BotonChico onClick={ver} disabled={!!ocupado}>
          {ocupado === 'ver' ? 'Armando…' : 'Ver etiqueta'}
        </BotonChico>
        <BotonChico fuerte onClick={guardar} disabled={!vista || !!ocupado}>
          {ocupado === 'guardar' ? 'Guardando…' : 'Guardar y generar'}
        </BotonChico>
        <BotonChico onClick={onCancelar} disabled={!!ocupado}>
          Cancelar
        </BotonChico>
      </div>
    </div>
  )
}

/** ¿Logística dice que falta este dato? (`missing` viene con los nombres de su pantalla.) */
function esFaltante(p: PedidoLogistica, txt: string): boolean {
  const t = txt.toLowerCase()
  return p.missing.some((m) => m.toLowerCase() === t || m.toLowerCase().startsWith(t.split(' ')[0]))
}
