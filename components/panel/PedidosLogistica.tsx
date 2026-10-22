'use client'

import { useEffect, useState } from 'react'
import { color, font, radius, space } from '@/components/ui/tokens'
import {
  avisosDe,
  catalogosLogistica,
  entregaDe,
  guardarEntrega,
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
export function PedidosLogistica({ clienteId, tel }: { clienteId: number | null; tel: string | null }) {
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
        <Pedido key={p.id} p={p} primero={i === 0} sugerencia={sugerencias.get(p.id) ?? null} onCambio={reemplazar} />
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
  onCambio,
}: {
  p: PedidoLogistica
  primero: boolean
  sugerencia: PendienteLogistica['suggestion']
  onCambio: (p: PedidoLogistica) => void
}) {
  const [eligiendo, setEligiendo] = useState(false)
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
      ) : (
        <BotonChico onClick={() => (setAviso(null), setEligiendo(true))}>{p.dispatch_option ? 'Cambiar forma de entrega' : 'Elegir forma de entrega'}</BotonChico>
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
