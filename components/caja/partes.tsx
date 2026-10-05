'use client'

/**
 * Caja: las piezas que comparten las dos pantallas (fase C, 5-oct): el POS (`/pos`, `CajaPOS.tsx`)
 * y la pestaña Caja del monitor, que es el informativo del turno (`Caja.tsx`).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { NOMBRE_MEDIO } from '@/lib/caja/core.core.js'
import { numeroProvisorio, plata } from '@/lib/caja/ticket'
import { BILLETES_INICIALES, billetesDe } from '@/lib/caja/conteo.core.js'
import { CalculadoraBilletes } from '@/components/caja/CalculadoraBilletes'
import {
  cancelarVenta,
  cruzarVenta,
  guardarBajadas,
  guardarPolitica,
  abrirTurno,
  sacarEfectivo,
  cerrarTurno,
  contarBilletes,
  type Conteo,
  type Turno,
  type ResumenTurno,
  reintentarVenta,
  type Candidato,
  type Cruce,
  type Medio,
  type Rebaja,
  type Reglas,
  type Stock,
  type Variante,
  type Venta,
  type PedidosWeb,
} from '@/lib/caja/cliente'
import { Badge, Button, Field, Input, Notice, Plegable, SectionCard, Select, color, font, radius, space, weight } from '@/components/ui'


/** Un renglón del pedido. */
export type Renglon = { variante: Variante; stock: Stock; cantidad: number; precio: number | null; fueraDeTn: boolean; foto: string | null; rebaja?: Rebaja | null }
/** La cajera elige la FORMA de pago; la cuenta de GN la resuelve `cuentaDeMedio` (Bruno, 4-oct). */
export type PagoUI = { medio: Medio | null; base: string }

/** Las cuatro formas de pago que ve la cajera, en el orden del mostrador. */
export const MEDIOS: Medio[] = ['efectivo', 'transferencia', 'debito', 'credito']
export const claveDe = (v: Variante) => `${v.product_id}_${v.size_id}`

export const aNumero = (s: string) => {
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && String(s).trim() !== '' ? n : null
}

/**
 * Las prendas para elegir, con foto, precio de etiqueta y el stock del local (de anoche: el vivo se
 * lee al elegir). Por defecto sólo las que hay en el local; «Mostrar sin stock» suma el resto, para
 * poder vender una prenda que el sistema da en cero (Bruno, 4-oct).
 */
export function ListaPrendas({
  titulo,
  con,
  masCon,
  sin,
  masSin,
  verSin,
  onVerSin,
  precioYFoto,
  onElegir,
  grilla = false,
}: {
  titulo?: string
  con: Candidato[]
  masCon: number
  sin: Candidato[]
  masSin: number
  verSin: boolean
  onVerSin: () => void
  precioYFoto: (productId: number) => { precio: number | null; foto: string | null }
  onElegir: (v: Variante) => void
  /** El POS (fase C): tarjetas con la foto grande, como el POS de GN. */
  grilla?: boolean
}) {
  const fila = (v: Candidato, apagada: boolean) => {
    const { precio, foto } = precioYFoto(v.product_id)
    if (grilla) {
      return (
        <button
          key={claveDe(v)}
          type="button"
          onClick={() => onElegir(v)}
          style={{
            height: 'auto',
            display: 'grid',
            gap: space[1],
            padding: space[2],
            textAlign: 'left',
            alignContent: 'start',
            border: `1px solid ${color.line}`,
            borderRadius: radius.md,
            background: color.surface,
            cursor: 'pointer',
            opacity: apagada ? 0.6 : 1,
          }}
        >
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: radius.md }} />
          ) : (
            <div style={{ width: '100%', aspectRatio: '1', borderRadius: radius.md, background: color.line }} />
          )}
          <span style={{ fontWeight: weight.semibold, color: color.ink, fontSize: font.sm }}>
            {v.product_name} · {v.size_name}
          </span>
          <span style={{ fontWeight: weight.bold, color: color.ink }}>{precio ? plata(precio) : '—'}</span>
        </button>
      )
    }
    return (
      <button
        key={claveDe(v)}
        type="button"
        onClick={() => onElegir(v)}
        style={{
          height: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: space[3],
          padding: space[2],
          textAlign: 'left',
          border: `1px solid ${color.line}`,
          borderRadius: radius.md,
          background: color.surface,
          cursor: 'pointer',
          opacity: apagada ? 0.6 : 1,
        }}
      >
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: radius.md, flexShrink: 0 }} />
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: radius.md, background: color.line, flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: weight.semibold, color: color.ink }}>
            {v.product_name} · {v.size_name}
          </div>
          {/* ⛔ Número de stock: el de la lista es el de ANOCHE (tipear ⛔ gasta el cupo de GN) y un número
              viejo confunde. Sólo ordena —con stock arriba, el resto tras «Mostrar sin stock»—; el real lo
              dice el renglón al elegirla, que lee GN en vivo (Bruno, 4-oct). */}
        </div>
        <div style={{ fontWeight: weight.semibold, color: color.ink }}>{precio ? plata(precio) : '—'}</div>
      </button>
    )
  }
  const totalSin = sin.length + masSin
  // En grilla, los textos y el botón ocupan la fila entera.
  const ancho = grilla ? { gridColumn: '1 / -1' } : undefined
  return (
    <div style={{ marginTop: space[3], display: 'grid', gap: space[2], ...(grilla ? { gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' } : {}) }}>
      {titulo && <span style={{ ...ancho, color: color.mut, fontSize: font.sm }}>{titulo}</span>}
      {con.length === 0 && !verSin && <span style={{ ...ancho, color: color.mut, fontSize: font.sm }}>Ninguna con stock en el local.</span>}
      {con.map((v) => fila(v, false))}
      {masCon > 0 && <span style={{ ...ancho, color: color.mut, fontSize: font.sm }}>Y {masCon} más: escribí el color o el talle para achicar la lista.</span>}
      {verSin && sin.map((v) => fila(v, true))}
      {verSin && masSin > 0 && <span style={{ ...ancho, color: color.mut, fontSize: font.sm }}>Y {masSin} más sin stock.</span>}
      {!verSin && totalSin > 0 && (
        <div style={ancho}>
          <Button variant="ghost" size="sm" onClick={onVerSin}>
            Mostrar sin stock ({totalSin})
          </Button>
        </div>
      )}
    </div>
  )
}

/** Un renglón: foto, nombre, stock que QUEDA (descontando lo que ya está en la venta), cantidad y precio. */
export function FilaRenglon({
  r,
  cargandoPrecios,
  onCantidad,
  onPrecio,
  onRebaja,
  importe,
  onSacar,
  avisoWeb,
  mirandoWeb,
}: {
  r: Renglon
  cargandoPrecios: boolean
  onCantidad: (n: number) => void
  onPrecio: (p: number | null) => void
  onRebaja: (rb: Rebaja | null) => void
  /** Lo que queda del renglón después de su descuento (null si ⛔ se puede calcular). */
  importe: number | null
  onSacar: () => void
  /** La prenda está en un pedido web sin armar (W1). */
  avisoWeb: { tipo: 'separada' | 'reponer' | 'sin_stock'; texto: string } | null
  /** Los pedidos web todavía ⛔ llegaron: sin esto, «sin aviso» parece «en ningún pedido». */
  mirandoWeb: boolean
}) {
  // Mientras se escribe, el texto; si ⛔ se está escribiendo, el precio del renglón.
  const [texto, setTexto] = useState<string | null>(null)
  const quedan = r.stock.local - r.cantidad
  return (
    <div style={{ display: 'flex', gap: space[3], alignItems: 'center', padding: space[2], border: `1px solid ${color.line}`, borderRadius: radius.lg, flexWrap: 'wrap' }}>
      {r.foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.foto} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: radius.md }} />
      ) : (
        <div style={{ width: 56, height: 56, borderRadius: radius.md, background: color.bg2 }} />
      )}
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ fontWeight: weight.semibold, color: color.ink }}>
          {r.variante.product_name} · {r.variante.size_name}
        </div>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', fontSize: font.sm, color: color.mut, marginTop: space[0.5] }}>
          {quedan < 0 ? (
            <Badge tone="danger">Gestión Nube no tiene más en el local</Badge>
          ) : quedan === 0 ? (
            <Badge tone="warning">ÚLTIMA</Badge>
          ) : (
            <span>
              quedan {quedan} en el local
            </span>
          )}
          {/* En el local «depósito» es el de atrás de la percha, que ya está en `local`. El Depósito de GN
              (18210) ⛔ vende desde la caja: sólo repone. */}
          <span>· {r.stock.deposito} para reponer</span>
          {/* Ubicaciones depósito: dónde buscarla atrás. Sin estante ⛔ se dice nada: está todo en percha. */}
          {!!r.stock.atras?.length && <b style={{ color: color.ink }}>· ubicación: {r.stock.atras.join(' · ')}</b>}
          {r.stock.fuente === 'espejo' && <span title={r.stock.motivo}>· stock de anoche (Gestión Nube no contestó)</span>}
        </div>
        {r.fueraDeTn && <div style={{ fontSize: font.xs, color: color.warningInk }}>Precio del espejo: el producto no cruza con Tienda Nube.</div>}
        {mirandoWeb && <div style={{ fontSize: font.xs, color: color.mut, marginTop: space[0.5] }}>mirando pedidos web…</div>}
        {avisoWeb && (
          <div style={{ marginTop: space[1] }}>
            <Badge tone={avisoWeb.tipo === 'sin_stock' ? 'danger' : 'warning'}>{avisoWeb.texto}</Badge>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: space[1], alignItems: 'center' }}>
        <Button size="sm" variant="outline" onClick={() => onCantidad(r.cantidad - 1)} aria-label="Una menos">
          −
        </Button>
        <span style={{ minWidth: 24, textAlign: 'center', fontWeight: weight.bold }}>{r.cantidad}</span>
        <Button size="sm" variant="outline" onClick={() => onCantidad(r.cantidad + 1)} aria-label="Una más">
          +
        </Button>
      </div>
      <Input
        inputMode="decimal"
        value={texto ?? (r.precio != null ? String(r.precio) : '')}
        invalid={!(r.precio && r.precio > 0)}
        placeholder={cargandoPrecios ? 'cargando…' : 'precio'}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          if (texto != null) onPrecio(aNumero(texto))
          setTexto(null)
        }}
        style={{ width: 120, textAlign: 'right' }}
        aria-label="Precio"
      />
      <div style={{ display: 'grid', gap: space[0.5], justifyItems: 'end' }}>
        <CampoRebaja valor={r.rebaja ?? null} onCambio={onRebaja} />
        {r.rebaja && importe != null && <span style={{ fontSize: font.sm, color: color.mut }}>queda {plata(importe)}</span>}
      </div>
      <Button size="sm" variant="ghost" tone="danger" onClick={onSacar} aria-label={`Eliminar ${r.variante.product_name} · ${r.variante.size_name}`}>
        Eliminar
      </Button>
    </div>
  )
}

export function VariosPagos({ pagos, setPagos, montos }: { pagos: PagoUI[]; setPagos: (p: PagoUI[]) => void; montos: number[] | null }) {
  const cambiar = (i: number, cambio: Partial<PagoUI>) => setPagos(pagos.map((p, j) => (j === i ? { ...p, ...cambio } : p)))
  return (
    <div style={{ display: 'grid', gap: space[2] }}>
      <span style={{ fontSize: font.sm, color: color.mut }}>
        En cada pago va la parte del subtotal que se paga con esa forma de pago; el último se lleva el resto. Cada uno se descuenta y se redondea por separado.
      </span>
      {pagos.map((p, i) => {
        const ultimo = i === pagos.length - 1
        return (
          <div key={i} style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
            <Select value={p.medio ?? ''} onChange={(e) => cambiar(i, { medio: (e.target.value || null) as Medio | null })} style={{ width: 220 }}>
              <option value="">Forma de pago…</option>
              {MEDIOS.map((m) => (
                <option key={m} value={m}>
                  {NOMBRE_MEDIO[m]}
                </option>
              ))}
            </Select>
            {ultimo ? (
              <span style={{ width: 140, color: color.mut }}>el resto</span>
            ) : (
              <Input inputMode="decimal" value={p.base} onChange={(e) => cambiar(i, { base: e.target.value })} placeholder="$ del subtotal" style={{ width: 140 }} />
            )}
            <b style={{ minWidth: 100 }}>{montos?.[i] != null ? `cobra ${plata(montos[i])}` : ''}</b>
            {pagos.length > 2 && (
              <Button size="sm" variant="ghost" onClick={() => setPagos(pagos.filter((_, j) => j !== i))} aria-label={`Eliminar el pago ${p.medio ? NOMBRE_MEDIO[p.medio] : 'sin forma de pago'}`}>
                Eliminar
              </Button>
            )}
          </div>
        )
      })}
      <div>
        <Button size="sm" variant="outline" onClick={() => setPagos([...pagos.slice(0, -1), { medio: null, base: '' }, pagos[pagos.length - 1]])}>
          Agregar pago
        </Button>
      </div>
    </div>
  )
}

export function ResumenCobro({ c, nombreCuenta }: { c: { subtotal: number; aVenta: number; total: number; pagos: { cuenta: number; porcentaje: number; descuento: number; redondeo: number; monto: number }[] }; nombreCuenta: (id: number) => string }) {
  const linea = (izq: string, der: string, fuerte = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: fuerte ? font['2xl'] : font.md, fontWeight: fuerte ? weight.bold : weight.normal }}>
      <span>{izq}</span>
      <span>{der}</span>
    </div>
  )
  return (
    <div style={{ display: 'grid', gap: space[1], maxWidth: 420 }}>
      {linea('Subtotal', plata(c.subtotal))}
      {c.aVenta > 0 && linea('Descuento en la venta', `-${plata(c.aVenta)}`)}
      {c.pagos.map((p, i) => (
        <div key={i}>
          {p.descuento > 0 && linea(`Descuento ${p.porcentaje}%${c.pagos.length > 1 ? ` (${nombreCuenta(p.cuenta)})` : ''}`, `-${plata(p.descuento)}`)}
          {p.redondeo > 0 && linea('Recargo por redondeo', `+${plata(p.redondeo)}`)}
          {p.redondeo < 0 && linea('Redondeo', `-${plata(p.redondeo)}`)}
        </div>
      ))}
      {linea('Total', plata(c.total), true)}
    </div>
  )
}

export function UltimaVenta({ venta, onReimprimir }: { venta: Venta; onReimprimir: () => void }) {
  const enGn = venta.estado === 'en_gn'
  return (
    <Notice tone={enGn ? 'success' : 'danger'}>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <span>
          {enGn
            ? `Venta #${venta.gn_number} en Gestión Nube · ${plata(venta.total)}.`
            : `Venta ${numeroProvisorio(venta.id)} cobrada (${plata(venta.total)}) pero PENDIENTE en Gestión Nube: ${venta.ultimo_error ?? 'no contestó'}. Se reintenta sola.`}
        </span>
        <Button size="sm" variant="outline" onClick={onReimprimir}>
          Reimprimir ticket
        </Button>
      </div>
    </Notice>
  )
}

export const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
const TEXTO_ORIGEN: Record<string, string> = { mp: 'desde Mercado Pago', banco: 'desde otro banco', tarjeta: 'con tarjeta', otro: 'otro medio' }

/**
 * Una venta que espera la transferencia (F5). Pregunta cada 5 s si llegó; el servidor decide con
 * `cruzarTransferencia` y, si llegó, ya la mandó a GN ⇒ acá sólo se imprime (`onLlego`).
 */
export function EsperaTransferencia({ venta, onLlego, onCambio }: { venta: Venta; onLlego: (v: Venta) => void; onCambio: () => void }) {
  const [cruce, setCruce] = useState<Cruce | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [seguro, setSeguro] = useState(false)
  const terminada = useRef(false)

  const mirar = useCallback(
    async (pago?: string) => {
      if (terminada.current) return
      try {
        const r = await cruzarVenta(venta.id, pago)
        setError(null)
        if (r.cruce.estado === 'llego') {
          terminada.current = true
          onLlego(r.venta)
          return
        }
        if (r.cruce.estado === 'ya' || r.cruce.estado === 'cancelada') {
          terminada.current = true
          onCambio()
          return
        }
        setCruce(r.cruce)
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [venta.id, onLlego, onCambio],
  )

  useEffect(() => {
    // La primera vez enseguida, fuera del render del efecto (el lint ⛔ deja un setState sincrónico ahí).
    const t0 = setTimeout(() => void mirar(), 0)
    const t = setInterval(() => void mirar(), 5_000)
    return () => {
      clearTimeout(t0)
      clearInterval(t)
    }
  }, [mirar])

  async function elegir(pago: string) {
    setTrabajando(pago)
    await mirar(pago)
    setTrabajando(null)
  }

  async function cancelar() {
    setTrabajando('cancelar')
    try {
      await cancelarVenta(venta.id)
      terminada.current = true
      onCambio()
    } catch (e) {
      setError((e as Error).message)
      onCambio()
    } finally {
      setTrabajando(null)
    }
  }

  const monto = venta.espera_monto ?? venta.total
  return (
    <Notice tone="warning">
      <div style={{ display: 'grid', gap: space[2] }}>
        <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ flex: 1, minWidth: 220 }}>
            Esperando la transferencia de {plata(monto)} · venta {numeroProvisorio(venta.id)} de las {hora(venta.creada_en)}
          </b>
          {seguro ? (
            <>
              <span style={{ fontSize: font.sm }}>¿Cancelar la venta? No se cobra.</span>
              <Button size="sm" tone="danger" loading={trabajando === 'cancelar'} onClick={cancelar}>
                Cancelar la venta
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSeguro(false)}>
                No
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setSeguro(true)}>
              Cancelar venta
            </Button>
          )}
        </div>
        <span style={{ fontSize: font.sm }}>
          El ticket sale solo cuando la transferencia aparece en Mercado Pago. No alcanza con el comprobante del teléfono.
          {venta.total !== monto && ` El resto (${plata(venta.total - monto)}) se cobra aparte.`}
        </span>
        {cruce?.estado === 'elegir' && (
          <div style={{ display: 'grid', gap: space[1] }}>
            <span>{cruce.motivo}</span>
            {cruce.candidatos.map((p) => (
              <div key={p.id} style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', fontSize: font.sm }}>
                <span style={{ fontWeight: weight.semibold }}>{plata(p.monto)}</span>
                <span>a las {hora(p.cuando)}</span>
                <span style={{ color: color.mut }}>{TEXTO_ORIGEN[p.origen] ?? p.origen}</span>
                <Button size="sm" tone="success" loading={trabajando === p.id} disabled={!!trabajando} onClick={() => elegir(p.id)}>
                  Elegir
                </Button>
              </div>
            ))}
          </div>
        )}
        {(cruce?.estado === 'sin_cuenta' || cruce?.estado === 'invalido') && <span>{cruce.motivo}</span>}
        {error && <span style={{ color: color.danger }}>{error}</span>}
      </div>
    </Notice>
  )
}

/** Las ventas cobradas que todavía ⛔ están en GN. Rojo: hasta que lleguen, el stock y la caja de GN ⛔ cierran. */
/**
 * Los pedidos web pagados que todavía ⛔ se empaquetaron (W1): el más viejo primero. Es una alerta para
 * armarlos a tiempo; ⛔ se arman desde acá. Sin pedidos ⇒ ⛔ ocupa lugar.
 */
export function PedidosWebSinArmar({ datos, error }: { datos: PedidosWeb | null; error: string | null }) {
  const [abierto, setAbierto] = useState(false)
  if (error && !datos) return <Notice tone="warning">No se pudieron leer los pedidos web: {error}</Notice>
  if (!datos) return null
  const n = datos.pedidos.length
  if (!n && !datos.noLeidas && !error) return null
  const sinPagar = datos.pedidos.filter((p) => p.sinPagar).length
  const hace = (h: number | null) => (h == null ? '' : h < 1 ? 'hace menos de 1 h' : h < 48 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} días`)
  return (
    <Notice tone={n ? 'warning' : 'neutral'}>
      <div style={{ display: 'grid', gap: space[2] }}>
        <button
          onClick={() => setAbierto(!abierto)}
          style={{ height: 'auto', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit', fontSize: font.base }}
        >
          <b>
            {abierto ? '▾' : '▸'} {n === 1 ? '1 pedido web sin armar' : `${n} pedidos web sin armar`}
          </b>
          {sinPagar > 0 && <span> ({sinPagar === n ? (n === 1 ? 'sin pagar' : 'todos sin pagar') : `${sinPagar} sin pagar`})</span>}
          {n > 0 && <span> · el más viejo {hace(datos.pedidos[0].horas)}</span>}
        </button>
        {datos.noLeidas > 0 && <span style={{ fontSize: font.sm }}>Tienda Nube no devolvió {datos.noLeidas} órdenes: puede haber más.</span>}
        {datos.guardada && !error && <span style={{ fontSize: font.sm }}>Lista de las {new Date(datos.leidoEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })}: actualizando…</span>}
        {error && <span style={{ fontSize: font.sm }}>No se pudo actualizar ({error}). Es la lista de las {new Date(datos.leidoEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })}.</span>}
        {abierto &&
          datos.pedidos.map((p) => (
            <div key={p.numero} style={{ display: 'grid', gap: space[0.5], fontSize: font.sm, borderTop: `1px solid ${color.line}`, paddingTop: space[2] }}>
              <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
                <b>#{p.numero}</b>
                {p.sinPagar && <Badge tone="neutral">sin pagar</Badge>}
                <span>{hace(p.horas)}</span>
                <span style={{ color: color.mut }}>{p.envioTipo === 'pickup' ? `Retira: ${p.envio ?? ''}` : (p.envio ?? 'Envío')}</span>
              </div>
              {p.prendas.map((x, i) => (
                <span key={i}>
                  {x.cantidad > 1 ? `${x.cantidad} × ` : ''}
                  {x.nombre}
                  {!x.sku && <span style={{ color: color.mut }}> (sin SKU: no se cruza con la Caja)</span>}
                </span>
              ))}
            </div>
          ))}
      </div>
    </Notice>
  )
}

export function Pendientes({ ventas, onCambio }: { ventas: Venta[]; onCambio: () => void }) {
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function reintentar(id: string) {
    setTrabajando(id)
    setError(null)
    try {
      await reintentarVenta(id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTrabajando(null)
      onCambio()
    }
  }
  return (
    <Notice tone="danger">
      <div style={{ display: 'grid', gap: space[2] }}>
        <b>
          {ventas.length === 1 ? 'Una venta cobrada todavía no está' : `${ventas.length} ventas cobradas todavía no están`} en Gestión Nube
        </b>
        {ventas.map((v) => (
          <div key={v.id} style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', fontSize: font.sm }}>
            <span style={{ fontFamily: 'monospace' }}>{numeroProvisorio(v.id)}</span>
            <span>{plata(v.total)}</span>
            <span style={{ color: color.mut }}>{new Date(v.creada_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })}</span>
            <span style={{ flex: 1, minWidth: 200 }}>{v.ultimo_error ?? (v.estado === 'enviando' ? 'mandándose…' : '')}</span>
            {v.reintentable === false ? (
              <Badge tone="danger">Hay que revisarla a mano</Badge>
            ) : (
              <Button size="sm" variant="outline" loading={trabajando === v.id} onClick={() => reintentar(v.id)}>
                Reintentar
              </Button>
            )}
          </div>
        ))}
        {error && <span>{error}</span>}
      </div>
    </Notice>
  )
}

/**
 * Un descuento a mano: % o $ (Bruno, 4-oct). Vacío = sin descuento. El tope (⛔ más que el importe)
 * lo pone el núcleo, y la pantalla muestra su error.
 */
export function CampoRebaja({ valor, onCambio }: { valor: Rebaja | null; onCambio: (rb: Rebaja | null) => void }) {
  const [texto, setTexto] = useState<string | null>(null)
  const tipo = valor?.tipo ?? 'pct'
  const fijar = (t: string, tp: Rebaja['tipo']) => {
    const n = aNumero(t)
    onCambio(n != null && n > 0 ? { tipo: tp, valor: n } : null)
  }
  return (
    <div style={{ display: 'flex', gap: space[1], alignItems: 'center' }}>
      <Input
        inputMode="decimal"
        value={texto ?? (valor ? String(valor.valor) : '')}
        placeholder="descuento"
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          if (texto != null) fijar(texto, tipo)
          setTexto(null)
        }}
        style={{ width: 100, textAlign: 'right' }}
        aria-label="Descuento"
      />
      <Select value={tipo} onChange={(e) => valor && onCambio({ ...valor, tipo: e.target.value as Rebaja['tipo'] })} style={{ width: 64 }} aria-label="En % o en $" disabled={!valor}>
        <option value="pct">%</option>
        <option value="pesos">$</option>
      </Select>
    </div>
  )
}

/** Una pregunta de Sí/No del cobro con tarjeta de crédito. */
export function SiNo({ pregunta, valor, onCambio }: { pregunta: string; valor: boolean | null; onCambio: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontWeight: weight.semibold, color: color.ink }}>{pregunta}</span>
      <Button size="sm" variant={valor === true ? 'solid' : 'outline'} onClick={() => onCambio(true)}>
        Sí
      </Button>
      <Button size="sm" variant={valor === false ? 'solid' : 'outline'} onClick={() => onCambio(false)}>
        No
      </Button>
    </div>
  )
}

/**
 * Sólo admin: las bajadas de línea del cobro. 🔑 **A qué cuenta van las transferencias ⛔ lo decide
 * la cajera** (Bruno, 4-oct): «si dicen transfieran a cuenta Darío, va Caja Gerencia». Y el modo
 * feria: efectivo y transferencia van a las cuentas de feria (precio final, sin descuento extra).
 */
export function Bajadas({ reglas, onGuardadas }: { reglas: Reglas; onGuardadas: (r: Reglas) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const NOMBRE_TRANSF: Record<number, string> = { 13015: 'Areben Comercial (se confirma sola con Mercado Pago)', 20595: 'Caja Gerencia (se confirma a mano)' }
  const [billetesTxt, setBilletesTxt] = useState(() => billetesDe(reglas).join(', '))
  async function guardar(b: { transferenciaA?: number; feria?: boolean; billetes?: number[] }) {
    setGuardando(true)
    setMsg(null)
    try {
      const r = await guardarBajadas(b)
      onGuardadas(r.reglas)
      if (r.reglas.billetes) setBilletesTxt(r.reglas.billetes.join(', '))
      setMsg(b.billetes ? 'Guardado: la calculadora cuenta con estos billetes.' : 'Guardado: vale desde la próxima venta.')
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }
  const opciones = reglas.medios?.transferencia.opciones ?? []
  return (
    <Plegable abierto={abierto} onToggle={() => setAbierto(!abierto)} titulo="Formas de pago" ayuda="A qué cuenta van las transferencias y el modo feria. Sólo lo cambia un admin.">
      <div style={{ display: 'grid', gap: space[3], maxWidth: 560 }}>
        <Field label="Las transferencias van a">
          <Select value={String(reglas.transferenciaA ?? '')} disabled={guardando} onChange={(e) => guardar({ transferenciaA: Number(e.target.value) })} style={{ maxWidth: 420 }}>
            {opciones.map((id) => (
              <option key={id} value={id}>
                {NOMBRE_TRANSF[id] ?? reglas.cuentas[id]?.nombre ?? `Cuenta ${id}`}
              </option>
            ))}
          </Select>
        </Field>
        <label style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
          <input type="checkbox" checked={reglas.feria === true} disabled={guardando} onChange={(e) => guardar({ feria: e.target.checked })} />
          <span>Modo feria: efectivo y transferencia van a las cuentas de feria, sin descuento (los precios de feria son finales)</span>
        </label>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label={`Billetes de la calculadora (sin la lista: ${BILLETES_INICIALES.join(', ')})`}>
            <Input value={billetesTxt} onChange={(e) => setBilletesTxt(e.target.value)} style={{ minWidth: 320 }} />
          </Field>
          <Button
            size="sm"
            loading={guardando}
            onClick={() => guardar({ billetes: billetesTxt.split(/[\s,;]+/).filter(Boolean).map((t) => Number(t.replace(/\./g, ''))) })}
          >
            Guardar billetes
          </Button>
        </div>
        {msg && <span style={{ fontSize: font.sm, color: color.mut }}>{msg}</span>}
      </div>
    </Plegable>
  )
}

export const horaAr = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
export const diaAr = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })
export const textoDiferencia = (d: number) => (d === 0 ? 'Cuadrado' : d > 0 ? `Sobran ${plata(d)}` : `Faltan ${plata(-d)}`)

/**
 * v2, W3: el TURNO PROPIO de la Caja (Bruno, 4-oct). Se abre con el fondo, se saca efectivo con
 * motivo, y se cierra contando sólo el efectivo. Sin turno abierto ⛔ se cobra. El turno de Gestión
 * Nube se deja de usar. Un día puede tener dos turnos: se cierra uno y se abre el otro.
 */
/**
 * W3b: el efectivo que entró como COBRO en Gestión Nube (el pedido web que se paga al retirar), ⛔ como
 * venta en el local. Suma al efectivo que tiene que haber: la plata está en el cajón (Bruno, 4-oct).
 */
export function CobrosGN({ r }: { r: ResumenTurno }) {
  if (r.cobrosGN === null) {
    return <span style={{ color: color.warning }}>No se pudieron leer los cobros de Gestión Nube: el efectivo de la caja no los incluye.</span>
  }
  if (r.cobrosGN.length === 0) return null
  return (
    <div style={{ display: 'grid', gap: space[0.5] }}>
      <span>
        {r.cobrosGN.length === 1 ? 'Un cobro' : `${r.cobrosGN.length} cobros`} en efectivo cargado{r.cobrosGN.length === 1 ? '' : 's'} en Gestión Nube (pedidos, no ventas del local):{' '}
        <b>{plata(r.efectivo.cobradoGN)}</b> — suman al efectivo de la caja.
      </span>
      {r.cobrosGN.map((c) => (
        <span key={c.id} style={{ color: color.mut }}>
          {horaAr(c.en)} · {c.venta ? `venta #${c.venta}` : 'venta'}{c.tn ? ` (pedido #${c.tn})` : ''}{c.cliente ? ` · ${c.cliente}` : ''} · {plata(c.monto)}
        </span>
      ))}
    </div>
  )
}

export function TurnoCaja({
  turno,
  ultimos,
  billetes,
  esMio,
  abrirCon,
  onCambio,
  onCerrado,
}: {
  turno: Turno | null
  ultimos: Turno[]
  billetes: number[]
  /** Fase C: el conteo intermedio lo hace sólo la cuenta que abrió la caja (el servidor contesta 403). */
  esMio: boolean
  /** Desde el POS: entra con la calculadora del conteo abierta, o con el cierre a la vista. */
  abrirCon?: 'contar' | 'cerrar'
  onCambio: (t?: Turno) => void
  onCerrado: (t: Turno) => void
}) {
  const [fondo, setFondo] = useState('')
  // Fase B: la calculadora abierta, y el conteo que completó el fondo o el contado. Viaja sólo si el
  // input sigue diciendo SU total: si después se escribió otro número a mano, va sin billetes.
  const [calc, setCalc] = useState<null | 'apertura' | 'intermedio' | 'cierre'>(abrirCon === 'contar' && esMio ? 'intermedio' : null)
  const [conteoFondo, setConteoFondo] = useState<{ conteo: Conteo; total: number } | null>(null)
  const [conteoCierre, setConteoCierre] = useState<{ conteo: Conteo; total: number } | null>(null)
  const [errCalc, setErrCalc] = useState<string | null>(null)
  const [modo, setModo] = useState<'nada' | 'salida' | 'cerrar'>(abrirCon === 'cerrar' ? 'cerrar' : 'nada')
  const [monto, setMonto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [contado, setContado] = useState('')
  const [nota, setNota] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cerrado, setCerrado] = useState<Turno | null>(null)
  const [verDetalle, setVerDetalle] = useState(false)
  const [verUltimos, setVerUltimos] = useState(false)

  async function hacer(f: () => Promise<void>) {
    setTrabajando(true)
    setError(null)
    try {
      await f()
    } catch (e) {
      setError((e as Error).message)
      onCambio(undefined)
    } finally {
      setTrabajando(false)
    }
  }

  const ultimosPlegable = ultimos.length > 0 && (
    <Plegable abierto={verUltimos} onToggle={() => setVerUltimos(!verUltimos)} titulo="Últimos turnos" ayuda="Los turnos cerrados: el efectivo que tenía que haber, el que se contó y la diferencia.">
      <div style={{ display: 'grid', gap: space[1], fontSize: font.sm }}>
        {ultimos.map((t) => (
          <div key={t.id} style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', borderTop: `1px solid ${color.line}`, paddingTop: space[1] }}>
            <span style={{ minWidth: 160 }}>
              {diaAr(t.abierto_en)} {horaAr(t.abierto_en)}–{t.cerrado_en ? horaAr(t.cerrado_en) : ''}
            </span>
            <span style={{ color: color.mut, minWidth: 110 }}>{t.abierto_por ?? ''}</span>
            <span>Esperado {plata(Number(t.esperado))}</span>
            <span>Contado {plata(Number(t.contado))}</span>
            <b>{textoDiferencia(t.resumen?.diferencia ?? Number(t.contado) - Number(t.esperado))}</b>
            {t.nota && <span style={{ color: color.mut }}>«{t.nota}»</span>}
          </div>
        ))}
      </div>
    </Plegable>
  )

  if (!turno) {
    const fondoN = aNumero(fondo)
    return (
      <>
        {cerrado && (
          <Notice tone={cerrado.resumen?.diferencia ? 'warning' : 'success'}>
            Turno cerrado a las {cerrado.cerrado_en ? horaAr(cerrado.cerrado_en) : ''}: tenía que haber {plata(Number(cerrado.esperado))} en efectivo, se
            contaron {plata(Number(cerrado.contado))}. <b>{textoDiferencia(cerrado.resumen?.diferencia ?? 0)}</b>.
          </Notice>
        )}
        <SectionCard title="Abrir turno">
          <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field label="Fondo: el efectivo con que arranca la caja">
              <Input value={fondo} onChange={(e) => setFondo(e.target.value)} inputMode="decimal" placeholder="$" style={{ maxWidth: 200 }} />
            </Field>
            <Button variant="outline" onClick={() => setCalc('apertura')}>
              Contar billetes
            </Button>
            <Button
              tone="success"
              loading={trabajando}
              disabled={fondoN == null || fondoN < 0}
              onClick={() =>
                hacer(async () => {
                  const r = await abrirTurno(fondoN as number, conteoFondo && conteoFondo.total === fondoN ? conteoFondo.conteo : null)
                  setFondo('')
                  setConteoFondo(null)
                  setCerrado(null)
                  onCambio(r.turno)
                })
              }
            >
              Abrir turno
            </Button>
          </div>
          {conteoFondo && conteoFondo.total === fondoN && (
            <p style={{ margin: `${space[2]} 0 0`, color: color.mut, fontSize: font.sm }}>Con el conteo de billetes: queda guardado en el turno.</p>
          )}
          <p style={{ margin: `${space[2]} 0 0`, color: color.mut, fontSize: font.sm }}>Sin un turno abierto la Caja no cobra.</p>
          {error && <Notice tone="danger">{error}</Notice>}
        </SectionCard>
        {calc === 'apertura' && (
          <CalculadoraBilletes
            momento="apertura"
            billetes={billetes}
            titulo="Contar el fondo"
            accion="Usar este total"
            onCerrar={() => setCalc(null)}
            onUsar={(total, conteo) => {
              setFondo(String(total))
              setConteoFondo({ conteo, total })
              setCalc(null)
            }}
          />
        )}
        {ultimosPlegable}
      </>
    )
  }

  const r = turno.resumen
  const contadoN = aNumero(contado)
  const montoN = aNumero(monto)
  const intermedios = turno.conteos?.intermedios ?? []
  const ultimoConteo = intermedios.length ? intermedios[intermedios.length - 1] : null
  // La calculadora del turno arranca con el último conteo guardado (o el del fondo).
  const conteoBase = ultimoConteo ?? turno.conteos?.apertura ?? null
  return (
    <>
      <SectionCard
        title={`Turno abierto desde las ${horaAr(turno.abierto_en)}`}
        actions={
          <div style={{ display: 'flex', gap: space[2] }}>
            {esMio && (
              <Button size="sm" variant="outline" onClick={() => { setErrCalc(null); setCalc('intermedio') }}>
                Contar billetes
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setModo(modo === 'salida' ? 'nada' : 'salida')}>
              Cargar salida
            </Button>
            <Button size="sm" variant="outline" onClick={() => setModo(modo === 'cerrar' ? 'nada' : 'cerrar')}>
              Cerrar turno
            </Button>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: space[2], fontSize: font.sm }}>
          <div style={{ display: 'flex', gap: space[4], flexWrap: 'wrap' }}>
            <span>Abrió {turno.abierto_por ?? ''}</span>
            {r && <span>{r.ventas === 1 ? '1 venta' : `${r.ventas} ventas`} · {plata(r.total)}</span>}
            {r && (
              <b>Efectivo en la caja: {plata(r.efectivo.esperado)}</b>
            )}
            {r && (
              <button
                onClick={() => setVerDetalle(!verDetalle)}
                style={{ height: 'auto', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: color.mut, fontSize: font.sm }}
              >
                {verDetalle ? '▾ Ocultar detalle' : '▸ Ver detalle'}
              </button>
            )}
          </div>
          {r && verDetalle && (
            <div style={{ display: 'grid', gap: space[1], maxWidth: 560 }}>
              {r.porCuenta.map((c) => (
                <div key={c.cuenta} style={{ display: 'flex', gap: space[3], borderTop: `1px solid ${color.line}`, paddingTop: space[1] }}>
                  <span style={{ flex: 1 }}>{c.nombre}</span>
                  <span style={{ color: color.mut }}>{c.cobros === 1 ? '1 cobro' : `${c.cobros} cobros`}</span>
                  <b style={{ minWidth: 110, textAlign: 'right' }}>{plata(c.monto)}</b>
                </div>
              ))}
              <div style={{ borderTop: `2px solid ${color.line}`, paddingTop: space[1], display: 'grid', gap: space[0.5] }}>
                <span>
                  Fondo {plata(r.efectivo.fondo)} + efectivo cobrado {plata(r.efectivo.cobrado)}
                  {r.efectivo.cobradoGN > 0 && <> + cobrado en Gestión Nube {plata(r.efectivo.cobradoGN)}</>} − salidas {plata(r.efectivo.salidas)}
                </span>
                <b>= efectivo que tiene que haber: {plata(r.efectivo.esperado)}</b>
              </div>
              {(turno.salidas ?? []).map((m) => (
                <span key={m.id} style={{ color: color.mut }}>
                  Salida {horaAr(m.creado_en)} · {plata(m.monto)} · {m.motivo} {m.usuario ? `(${m.usuario})` : ''}
                </span>
              ))}
            </div>
          )}
          {ultimoConteo && (
            <span>
              Último conteo {horaAr(ultimoConteo.en)}: {plata(ultimoConteo.total)}
              {ultimoConteo.esperado != null && (
                <>
                  {' '}· tenía que haber {plata(ultimoConteo.esperado)} · <b>{textoDiferencia(ultimoConteo.diferencia ?? 0)}</b>
                </>
              )}
              {ultimoConteo.por ? <span style={{ color: color.mut }}> ({ultimoConteo.por})</span> : null}
            </span>
          )}
          {r && r.esperando.length > 0 && (
            <span style={{ color: color.warning }}>
              {r.esperando.length === 1 ? 'Una venta espera' : `${r.esperando.length} ventas esperan`} la transferencia: no suma hasta que llegue.
            </span>
          )}
          {r && r.sinGN.length > 0 && (
            <span style={{ color: color.warning }}>
              {r.sinGN.length === 1 ? 'Una venta cobrada todavía no está' : `${r.sinGN.length} ventas cobradas todavía no están`} en Gestión Nube (suman al turno igual).
            </span>
          )}
          {r && <CobrosGN r={r} />}

          {modo === 'salida' && (
            <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-end', flexWrap: 'wrap', borderTop: `1px solid ${color.line}`, paddingTop: space[2] }}>
              <Field label="Monto">
                <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="$" style={{ maxWidth: 160 }} />
              </Field>
              <Field label="Motivo">
                <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Retiro para gerencia, compra de…" style={{ minWidth: 260 }} />
              </Field>
              <Button
                loading={trabajando}
                disabled={montoN == null || montoN <= 0 || !motivo.trim()}
                onClick={() =>
                  hacer(async () => {
                    const x = await sacarEfectivo(montoN as number, motivo.trim())
                    setMonto('')
                    setMotivo('')
                    setModo('nada')
                    onCambio(x.turno)
                  })
                }
              >
                Registrar salida
              </Button>
            </div>
          )}

          {modo === 'cerrar' && r && (
            <div style={{ display: 'grid', gap: space[2], borderTop: `1px solid ${color.line}`, paddingTop: space[2], maxWidth: 560 }}>
              <span>Contá el efectivo de la caja (con el fondo incluido) y escribí cuánto hay.</span>
              <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <Field label="Efectivo contado">
                  <Input value={contado} onChange={(e) => setContado(e.target.value)} inputMode="decimal" placeholder="$" style={{ maxWidth: 180 }} />
                </Field>
                <Button variant="outline" onClick={() => setCalc('cierre')}>
                  Contar billetes
                </Button>
                <Field label="Nota (opcional)">
                  <Input value={nota} onChange={(e) => setNota(e.target.value)} style={{ minWidth: 240 }} />
                </Field>
              </div>
              {contadoN != null && contadoN >= 0 && (
                <span>
                  Tiene que haber {plata(r.efectivo.esperado)} ⇒ <b>{textoDiferencia(Math.round((contadoN - r.efectivo.esperado) * 100) / 100)}</b>
                </span>
              )}
              {r.cobrosGN !== null && r.cobrosGN.length > 0 && <CobrosGN r={r} />}
              {r.cobrosGN === null && <span style={{ color: color.warning }}>Al cerrar se vuelven a leer los cobros de Gestión Nube: si sigue sin contestar, el cierre queda sin ellos.</span>}
              {r.esperando.length > 0 && <span style={{ color: color.warning }}>Hay transferencias esperando: si llegan después del cierre, quedan en este turno pero no en el cierre.</span>}
              <div>
                <Button
                  tone="success"
                  loading={trabajando}
                  disabled={contadoN == null || contadoN < 0}
                  onClick={() =>
                    hacer(async () => {
                      const x = await cerrarTurno(turno.id, contadoN as number, nota.trim(), conteoCierre && conteoCierre.total === contadoN ? conteoCierre.conteo : null)
                      setContado('')
                      setConteoCierre(null)
                      setNota('')
                      setModo('nada')
                      setCerrado(x.turno)
                      onCerrado(x.turno)
                    })
                  }
                >
                  Cerrar turno
                </Button>
              </div>
            </div>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
      </SectionCard>
      {calc === 'intermedio' && (
        <CalculadoraBilletes
          momento={`intermedio:${turno.id}`}
          billetes={billetes}
          guardado={conteoBase}
          titulo="Contar billetes"
          accion="Guardar conteo"
          trabajando={trabajando}
          error={errCalc}
          onCerrar={() => setCalc(null)}
          onUsar={async (_total, conteo) => {
            setTrabajando(true)
            setErrCalc(null)
            try {
              const x = await contarBilletes(turno.id, conteo)
              setCalc(null)
              onCambio(x.turno)
            } catch (e) {
              setErrCalc((e as Error).message)
            } finally {
              setTrabajando(false)
            }
          }}
        />
      )}
      {calc === 'cierre' && (
        <CalculadoraBilletes
          momento={`cierre:${turno.id}`}
          billetes={billetes}
          guardado={conteoBase}
          titulo="Contar el efectivo del cierre"
          accion="Usar este total"
          onCerrar={() => setCalc(null)}
          onUsar={(total, conteo) => {
            setContado(String(total))
            setConteoCierre({ conteo, total })
            setCalc(null)
          }}
        />
      )}
      {ultimosPlegable}
    </>
  )
}

/** Sólo admin: el texto de la política de cambio que va al pie del ticket. */
export function PoliticaCambio({ inicial, onGuardada }: { inicial: string | null; onGuardada: (t: string | null) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState(inicial ?? '')
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  async function guardar() {
    setGuardando(true)
    setMsg(null)
    try {
      const r = await guardarPolitica(texto)
      onGuardada(r.politica_cambio)
      setMsg('Guardada: sale en el próximo ticket.')
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }
  return (
    <Plegable abierto={abierto} onToggle={() => setAbierto(!abierto)} titulo="Política de cambio del ticket" ayuda="El texto que sale al pie de cada ticket. Sólo lo cambia un admin.">
      <div style={{ display: 'grid', gap: space[2], maxWidth: 560 }}>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          maxLength={1000}
          className="mo-input"
          style={{ height: 'auto', fontFamily: 'inherit', fontSize: font.base, padding: space[2] }}
        />
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
          <Button size="sm" loading={guardando} onClick={guardar}>
            Guardar
          </Button>
          {msg && <span style={{ fontSize: font.sm, color: color.mut }}>{msg}</span>}
        </div>
      </div>
    </Plegable>
  )
}
