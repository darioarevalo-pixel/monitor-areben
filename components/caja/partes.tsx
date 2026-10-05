'use client'

/**
 * Caja: las piezas que comparten las dos pantallas (fase C, 5-oct): el POS (`/pos`, `CajaPOS.tsx`)
 * y la pestaña Caja del monitor, que es el informativo del turno (`Caja.tsx`).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { NOMBRE_MEDIO } from '@/lib/caja/core.core.js'
import { numeroProvisorio, plata } from '@/lib/caja/ticket'
import { BILLETES_INICIALES, billetesDe } from '@/lib/caja/conteo.core.js'
import { CalculadoraBilletes, olvidarConteo } from '@/components/caja/CalculadoraBilletes'
import { aNumero as aNumeroTxt, textoDiferencia } from '@/lib/caja/textos'
import {
  cancelarVenta,
  cruzarVenta,
  guardarBajadas,
  guardarPolitica,
  abrirTurno,
  sacarEfectivo,
  cerrarTurno,
  contarBilletes,
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
  type ProductoLista,
  type ProductoFeria,
  buscarNombre,
} from '@/lib/caja/cliente'
import { Badge, Button, Field, Icono, Input, Modal, Notice, Plegable, SectionCard, Select, color, font, radius, space, weight } from '@/components/ui'


/** Un renglón del pedido. */
export type Renglon = { variante: Variante; stock: Stock; cantidad: number; precio: number | null; fueraDeTn: boolean; foto: string | null; rebaja?: Rebaja | null }
/** La cajera elige la FORMA de pago; la cuenta de GN la resuelve `cuentaDeMedio` (Bruno, 4-oct). */
export type PagoUI = { medio: Medio | null; base: string }

/** Las cuatro formas de pago que ve la cajera, en el orden del mostrador. */
export const MEDIOS: Medio[] = ['efectivo', 'transferencia', 'debito', 'credito']
export const claveDe = (v: Variante) => `${v.product_id}_${v.size_id}`

export const aNumero = aNumeroTxt

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
            <img src={foto} alt="" style={{ width: '100%', aspectRatio: '4 / 5', objectFit: 'cover', borderRadius: radius.md }} />
          ) : (
            <div style={{ width: '100%', aspectRatio: '4 / 5', borderRadius: radius.md, background: color.bg2 }} />
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
    <div style={{ marginTop: space[3], display: 'grid', gap: space[2], ...(grilla ? { gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' } : {}) }}>
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

/** La foto de una tarjeta o un renglón: recortada, y un recuadro gris si ⛔ hay. */
export function Foto({ src, ancho = '100%', proporcion = '4 / 5' }: { src: string | null; ancho?: number | string; proporcion?: string }) {
  const caja: React.CSSProperties = { width: ancho, aspectRatio: proporcion, borderRadius: radius.md, flexShrink: 0, background: color.bg2 }
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" loading="lazy" style={{ ...caja, objectFit: 'cover' }} /> : <div style={caja} />
}

/**
 * La grilla del POS POR PRODUCTO, como la de GN (Bruno, 5-oct): foto, nombre, precio y «Elegir
 * variante» (o «Agregar al pedido» si tiene una sola). Los productos sin stock en el local, tras
 * «Mostrar sin stock». ⛔ Lleva el número de stock: es el de anoche y confundía (Bruno, 4-oct).
 */
export function GrillaProductos({
  con,
  masCon,
  sin,
  masSin,
  verSin,
  onVerSin,
  precioYFoto,
  onElegir,
}: {
  con: ProductoLista[]
  masCon: number
  sin: ProductoLista[]
  masSin: number
  verSin: boolean
  onVerSin: () => void
  precioYFoto: (productId: number) => { precio: number | null; foto: string | null }
  onElegir: (p: ProductoLista) => void
}) {
  const ancho = { gridColumn: '1 / -1' }
  const tarjeta = (p: ProductoLista, apagada: boolean) => {
    const { precio, foto } = precioYFoto(p.product_id)
    const una = p.variantes.length === 1
    return (
      <button
        key={p.product_id}
        type="button"
        onClick={() => onElegir(p)}
        className="caja-tarjeta"
        style={{
          height: 'auto',
          display: 'grid',
          gap: space[1],
          padding: space[2],
          textAlign: 'left',
          alignContent: 'start',
          border: `1px solid ${color.line}`,
          borderRadius: radius.lg,
          background: color.surface,
          cursor: 'pointer',
          opacity: apagada ? 0.6 : 1,
        }}
      >
        <Foto src={foto} />
        <span style={{ fontWeight: weight.semibold, color: color.ink, fontSize: font.sm, lineHeight: 1.25 }}>{p.product_name}</span>
        <span style={{ fontWeight: weight.bold, color: color.brand, fontSize: font.md }}>{precio ? plata(precio) : '—'}</span>
        <span
          style={{
            fontSize: font.xs,
            fontWeight: weight.semibold,
            borderRadius: radius.md,
            padding: `${space[1]} ${space[2]}`,
            background: una ? color.brandBg : color.warningBg,
            color: una ? color.brand : color.warningInk,
          }}
        >
          {una ? 'Agregar al pedido +' : `Elegir variante (${p.variantes.length}) ›`}
        </span>
      </button>
    )
  }
  const totalSin = sin.length + masSin
  return (
    <div style={{ marginTop: space[3], display: 'grid', gap: space[2], gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
      {con.length === 0 && !verSin && <span style={{ ...ancho, color: color.mut, fontSize: font.sm }}>Con stock en el local: ninguno.</span>}
      {con.map((p) => tarjeta(p, false))}
      {masCon > 0 && <span style={{ ...ancho, color: color.mut, fontSize: font.sm }}>Y {masCon} más: sumar el color o el talle para achicar la lista.</span>}
      {verSin && sin.map((p) => tarjeta(p, true))}
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

/**
 * «Elegir variante» (Bruno, 5-oct, como el modal de GN): la foto de cada color si Tienda Nube la
 * tiene, las variantes del local primero y el resto tras «Mostrar sin stock». Con el teclado: ↑/↓ y
 * Enter.
 */
export function ElegirVariante({
  producto,
  precio,
  fotoDe,
  onElegir,
  onCerrar,
}: {
  producto: ProductoLista
  precio: number | null
  fotoDe: (v: Variante) => string | null
  onElegir: (v: Variante) => void
  onCerrar: () => void
}) {
  const con = producto.variantes.filter((v) => (v.local ?? 0) > 0)
  const sin = producto.variantes.filter((v) => !((v.local ?? 0) > 0))
  const [verSin, setVerSin] = useState(con.length === 0)
  const lista = useRef<HTMLDivElement>(null)
  const mover = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const botones = [...(lista.current?.querySelectorAll<HTMLButtonElement>('button[data-variante]') ?? [])]
    const i = botones.indexOf(document.activeElement as HTMLButtonElement)
    const j = e.key === 'ArrowDown' ? Math.min(botones.length - 1, i + 1) : Math.max(0, i - 1)
    botones[j]?.focus()
  }
  const fila = (v: Candidato, i: number, apagada: boolean) => (
    <button
      key={claveDe(v)}
      type="button"
      data-variante
      data-foco={i === 0 && !apagada ? true : undefined}
      onClick={() => onElegir(v)}
      className="caja-tarjeta"
      style={{
        height: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: space[3],
        padding: space[2],
        textAlign: 'left',
        border: `1px solid ${color.line}`,
        borderRadius: radius.lg,
        background: color.surface,
        cursor: 'pointer',
        opacity: apagada ? 0.6 : 1,
      }}
    >
      <Foto src={fotoDe(v)} ancho={48} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: weight.semibold, color: color.ink, fontSize: font.md }}>{v.size_name}</div>
        <div style={{ fontSize: font.xs, color: color.mut }}>{v.sku ?? v.barcode ?? ''}</div>
      </div>
      <div style={{ display: 'grid', justifyItems: 'end', gap: space[0.5] }}>
        <b style={{ color: color.brand }}>{precio ? plata(precio) : '—'}</b>
        {apagada ? <Badge tone="neutral">sin stock</Badge> : <Badge tone="success">en el local</Badge>}
      </div>
    </button>
  )
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Elegir variante">
      <div style={{ display: 'grid', gap: space[3] }} onKeyDown={mover}>
        <div style={{ display: 'flex', gap: space[3], alignItems: 'center' }}>
          <Foto src={fotoDe(producto.variantes[0])} ancho={56} />
          <b style={{ fontSize: font.lg, color: color.ink }}>{producto.product_name}</b>
        </div>
        <div ref={lista} style={{ display: 'grid', gap: space[2] }}>
          {con.map((v, i) => fila(v, i, false))}
          {verSin && sin.map((v, i) => fila(v, i, true))}
        </div>
        {!verSin && sin.length > 0 && (
          <div>
            <Button variant="ghost" size="sm" onClick={() => setVerSin(true)}>
              Mostrar sin stock ({sin.length})
            </Button>
          </div>
        )}
      </div>
    </Modal>
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
  feria = false,
}: {
  r: Renglon
  /** Producto de feria trabado (Bruno, 5-oct): precio final, sólo efectivo o transferencia. */
  feria?: boolean
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
  const lista = r.precio != null ? Math.round(r.cantidad * r.precio * 100) / 100 : null
  // Con descuento a mano: el de lista tachado y el que queda al lado (Bruno, 5-oct).
  const conRebaja = !!r.rebaja && importe != null && lista != null && lista - importe > 0.004
  return (
    <div style={{ display: 'grid', gap: space[2], padding: space[3], border: `1px solid ${color.line}`, borderRadius: radius.lg, background: color.surface }}>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'flex-start' }}>
        <Foto src={r.foto} ancho={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: weight.bold, color: color.ink, textTransform: 'uppercase', fontSize: font.sm }}>
            {r.variante.product_name} {feria && <Badge tone="warning">Feria</Badge>}
          </div>
          <div style={{ color: color.ink2, fontSize: font.sm }}>{r.variante.size_name}</div>
          <div style={{ color: color.mut2, fontSize: font.xs }}>{r.variante.sku ?? r.variante.barcode ?? ''}</div>
        </div>
        <Button size="sm" variant="ghost" onClick={onSacar} aria-label={`Eliminar ${r.variante.product_name} · ${r.variante.size_name}`} title="Eliminar">
          <Icono nombre="cruz" />
        </Button>
      </div>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', fontSize: font.xs, color: color.mut }}>
        {quedan < 0 ? (
          <Badge tone="danger">Local: sin stock en Gestión Nube</Badge>
        ) : quedan === 0 ? (
          <Badge tone="warning">ÚLTIMA</Badge>
        ) : (
          <span>Local: quedan {quedan}</span>
        )}
        {/* En el local «depósito» es el de atrás de la percha, que ya está en `local`. El Depósito de GN
            (18210) ⛔ vende desde la caja: sólo repone. */}
        <span>· Para reponer: {r.stock.deposito}</span>
        {/* Ubicaciones depósito: dónde buscarla atrás. Sin estante ⛔ se dice nada: está todo en percha. */}
        {!!r.stock.atras?.length && <b style={{ color: color.ink }}>· Ubicación: {r.stock.atras.join(' · ')}</b>}
        {r.stock.fuente === 'espejo' && <span title={r.stock.motivo}>· Stock de anoche (Gestión Nube sin respuesta)</span>}
      </div>
      {r.fueraDeTn && <div style={{ fontSize: font.xs, color: color.warningInk }}>Precio del espejo: producto sin cruce con Tienda Nube.</div>}
      {mirandoWeb && <div style={{ fontSize: font.xs, color: color.mut }}>Pedidos web: leyendo…</div>}
      {avisoWeb && (
        <div>
          <Badge tone={avisoWeb.tipo === 'sin_stock' ? 'danger' : 'warning'}>{avisoWeb.texto}</Badge>
        </div>
      )}
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
        <Input
          inputMode="decimal"
          autoComplete="off"
          value={texto ?? (r.precio != null ? String(r.precio) : '')}
          invalid={!(r.precio && r.precio > 0)}
          placeholder={cargandoPrecios ? 'cargando…' : 'precio'}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => {
            if (texto != null) onPrecio(aNumero(texto))
            setTexto(null)
          }}
          style={{ width: 110, textAlign: 'right', color: color.brand, fontWeight: weight.semibold }}
          aria-label="Precio"
        />
        <CampoRebaja valor={r.rebaja ?? null} onCambio={onRebaja} />
      </div>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: space[1], alignItems: 'center' }}>
          <Button size="sm" variant="outline" onClick={() => onCantidad(r.cantidad - 1)} aria-label="Una menos">
            −
          </Button>
          <span style={{ minWidth: 32, textAlign: 'center', fontWeight: weight.bold }}>{r.cantidad}</span>
          <Button size="sm" variant="outline" onClick={() => onCantidad(r.cantidad + 1)} aria-label="Una más">
            +
          </Button>
        </div>
        <div style={{ display: 'flex', gap: space[2], alignItems: 'baseline', fontVariantNumeric: 'tabular-nums' }}>
          {conRebaja && <s style={{ color: color.mut, fontSize: font.sm }}>{plata(lista as number)}</s>}
          <b style={{ fontSize: font.md, color: conRebaja ? color.successInk : color.ink }}>{importe != null ? plata(importe) : lista != null ? plata(lista) : '—'}</b>
        </div>
      </div>
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
            ? `Venta #${venta.gn_number} · ${plata(venta.total)} · en Gestión Nube`
            : `Venta provisoria ${numeroProvisorio(venta.id)} · ${plata(venta.total)} · pendiente en Gestión Nube (${venta.ultimo_error ?? 'sin respuesta'}) · reintento automático`}
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
          Cobradas sin llegar a Gestión Nube: {ventas.length}
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
        autoComplete="off"
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
export { textoDiferencia }

/** Un dato del turno: rótulo chico arriba, el número grande abajo, en su color. */
export function Dato({ rotulo, valor, tono = 'neutral', detalle }: { rotulo: string; valor: React.ReactNode; tono?: 'neutral' | 'brand' | 'success' | 'danger' | 'warning'; detalle?: React.ReactNode }) {
  const fondo = { neutral: color.bg, brand: color.brandBg, success: color.successBg, danger: color.dangerBg, warning: color.warningBg }[tono]
  const tinta = { neutral: color.ink, brand: color.brand, success: color.successInk, danger: color.dangerInk, warning: color.warningInk }[tono]
  return (
    <div style={{ background: fondo, borderRadius: radius.lg, padding: `${space[2]} ${space[3]}`, display: 'grid', gap: space[0.5], minWidth: 0 }}>
      <span style={{ fontSize: font.xs, color: color.mut, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: weight.semibold }}>{rotulo}</span>
      <span style={{ fontSize: font.xl, fontWeight: weight.bold, color: tinta, fontVariantNumeric: 'tabular-nums' }}>{valor}</span>
      {detalle && <span style={{ fontSize: font.xs, color: color.mut }}>{detalle}</span>}
    </div>
  )
}
const tonoDiferencia = (d: number) => (Math.abs(d) < 0.005 ? 'success' : 'danger') as 'success' | 'danger'
const grillaDatos: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: space[2] }

/** El turno que se acaba de cerrar: Esperado · Contado · Diferencia, ⛔ una frase. */
export function AvisoCierre({ t }: { t: Turno }) {
  const d = t.resumen?.diferencia ?? Number(t.contado) - Number(t.esperado)
  return (
    <SectionCard title={`Turno cerrado ${t.cerrado_en ? horaAr(t.cerrado_en) : ''}`}>
      <div style={grillaDatos}>
        <Dato rotulo="Esperado" valor={plata(Number(t.esperado))} />
        <Dato rotulo="Contado" valor={plata(Number(t.contado))} />
        <Dato rotulo="Diferencia" valor={textoDiferencia(d)} tono={tonoDiferencia(d)} />
      </div>
    </SectionCard>
  )
}

/** Abrir el turno: la calculadora con el fondo inicial, y el botón abre (un solo paso, Bruno 5-oct). */
export function AbrirTurnoModal({ billetes, onCerrar, onAbierto }: { billetes: number[]; onCerrar: () => void; onAbierto: (t: Turno) => void }) {
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <CalculadoraBilletes
      momento="apertura"
      billetes={billetes}
      titulo="Abrir turno · fondo inicial"
      accion="Abrir turno"
      aMano
      trabajando={trabajando}
      error={error}
      onCerrar={onCerrar}
      onUsar={async (total, conteo) => {
        setTrabajando(true)
        setError(null)
        try {
          const r = await abrirTurno(total, conteo)
          olvidarConteo('apertura')
          onAbierto(r.turno)
        } catch (e) {
          setError((e as Error).message)
        } finally {
          setTrabajando(false)
        }
      }}
    />
  )
}

/** El conteo intermedio: ⛔ cierra ni mueve plata. Sólo la cuenta que abrió la caja (el servidor da 403). */
export function ConteoModal({ turno, billetes, onCerrar, onListo }: { turno: Turno; billetes: number[]; onCerrar: () => void; onListo: (t: Turno) => void }) {
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const momento = `intermedio:${turno.id}`
  return (
    <CalculadoraBilletes
      momento={momento}
      billetes={billetes}
      titulo="Contar billetes"
      accion="Guardar conteo"
      esperado={turno.resumen?.efectivo.esperado ?? null}
      trabajando={trabajando}
      error={error}
      onCerrar={onCerrar}
      onUsar={async (_total, conteo) => {
        if (!conteo) return
        setTrabajando(true)
        setError(null)
        try {
          const x = await contarBilletes(turno.id, conteo)
          olvidarConteo(momento)
          onListo(x.turno)
        } catch (e) {
          setError((e as Error).message)
        } finally {
          setTrabajando(false)
        }
      }}
    />
  )
}

/** Cerrar el turno: se cuenta el efectivo (con el fondo) y el botón cierra. */
export function CerrarTurnoModal({ turno, billetes, onCerrar, onCerrado }: { turno: Turno; billetes: number[]; onCerrar: () => void; onCerrado: (t: Turno) => void }) {
  const [nota, setNota] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const r = turno.resumen
  const momento = `cierre:${turno.id}`
  return (
    <CalculadoraBilletes
      momento={momento}
      billetes={billetes}
      titulo="Cerrar turno · efectivo con el fondo"
      accion="Cerrar turno"
      aMano
      esperado={r?.efectivo.esperado ?? null}
      trabajando={trabajando}
      error={error}
      onCerrar={onCerrar}
      extra={
        <div style={{ display: 'grid', gap: space[1], fontSize: font.sm }}>
          <Field label="Nota (opcional)">
            <Input value={nota} onChange={(e) => setNota(e.target.value)} autoComplete="off" />
          </Field>
          {r?.cobrosGN === null && <span style={{ color: color.warningInk }}>Cobros de Gestión Nube: sin leer. Se releen al cerrar.</span>}
          {!!r?.esperando.length && <span style={{ color: color.warningInk }}>Transferencias en espera: {r.esperando.length}. Si llegan después, ⛔ entran en el cierre.</span>}
        </div>
      }
      onUsar={async (total, conteo) => {
        setTrabajando(true)
        setError(null)
        try {
          const x = await cerrarTurno(turno.id, total, nota.trim(), conteo)
          olvidarConteo(momento)
          onCerrado(x.turno)
        } catch (e) {
          setError((e as Error).message)
        } finally {
          setTrabajando(false)
        }
      }}
    />
  )
}

/** Cargar una salida de efectivo, con su motivo. */
export function SalidaModal({ onCerrar, onListo }: { onCerrar: () => void; onListo: (t: Turno) => void }) {
  const [monto, setMonto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const montoN = aNumero(monto)
  async function cargar() {
    setTrabajando(true)
    setError(null)
    try {
      const x = await sacarEfectivo(montoN as number, motivo.trim())
      onListo(x.turno)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTrabajando(false)
    }
  }
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Cargar salida"
      cerrarConFondo={false}
      pie={
        <>
          <Button variant="outline" onClick={onCerrar}>
            Volver
          </Button>
          <Button tone="success" loading={trabajando} disabled={montoN == null || montoN <= 0 || !motivo.trim()} onClick={cargar}>
            Cargar salida
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: space[3] }}>
        <Field label="Monto">
          <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="$" data-foco />
        </Field>
        <Field label="Motivo">
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoComplete="off" placeholder="Retiro para gerencia, compra de…" />
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Modal>
  )
}

/**
 * W3b: el efectivo que entró como COBRO en Gestión Nube (el pedido web que se paga al retirar), ⛔ como
 * venta en el local. Suma al efectivo esperado: la plata está en el cajón (Bruno, 4-oct).
 */
export function CobrosGN({ r }: { r: ResumenTurno }) {
  if (r.cobrosGN === null) return <span style={{ color: color.warningInk }}>Cobros de Gestión Nube: sin leer (⛔ suman al esperado).</span>
  if (r.cobrosGN.length === 0) return null
  return (
    <div style={{ display: 'grid', gap: space[0.5] }}>
      <span>
        Cobros en efectivo en Gestión Nube (pedidos web): {r.cobrosGN.length} · <b>{plata(r.efectivo.cobradoGN)}</b>
      </span>
      {r.cobrosGN.map((c) => (
        <span key={c.id} style={{ color: color.mut }}>
          {horaAr(c.en)} · {c.venta ? `venta #${c.venta}` : 'venta'}{c.tn ? ` (pedido #${c.tn})` : ''}{c.cliente ? ` · ${c.cliente}` : ''} · {plata(c.monto)}
        </span>
      ))}
    </div>
  )
}

/** Lo que hay que saber del turno abierto, en datos: lo comparten la pestaña y el POS. */
export function ResumenTurnoDatos({ turno }: { turno: Turno }) {
  const [verDetalle, setVerDetalle] = useState(false)
  const r = turno.resumen
  const intermedios = turno.conteos?.intermedios ?? []
  const ultimoConteo = intermedios.length ? intermedios[intermedios.length - 1] : null
  if (!r) return null
  return (
    <div style={{ display: 'grid', gap: space[3], fontSize: font.sm }}>
      <div style={grillaDatos}>
        <Dato rotulo="Ventas" valor={plata(r.total)} tono="brand" detalle={r.ventas === 1 ? '1 venta' : `${r.ventas} ventas`} />
        <Dato rotulo="Efectivo esperado" valor={plata(r.efectivo.esperado)} tono="success" detalle={`Fondo ${plata(r.efectivo.fondo)}`} />
        <Dato rotulo="Salidas" valor={plata(r.efectivo.salidas)} detalle={(turno.salidas ?? []).length === 1 ? '1 salida' : `${(turno.salidas ?? []).length} salidas`} />
        {ultimoConteo && (
          <Dato
            rotulo={`Último conteo ${horaAr(ultimoConteo.en)}`}
            valor={plata(ultimoConteo.total)}
            tono={ultimoConteo.diferencia != null ? tonoDiferencia(ultimoConteo.diferencia) : 'neutral'}
            detalle={ultimoConteo.diferencia != null ? `Diferencia: ${textoDiferencia(ultimoConteo.diferencia)}` : undefined}
          />
        )}
      </div>
      {r.esperando.length > 0 && <span style={{ color: color.warningInk }}>Transferencias en espera: {r.esperando.length} (⛔ suman hasta que lleguen)</span>}
      {r.sinGN.length > 0 && <span style={{ color: color.warningInk }}>Cobradas sin llegar a Gestión Nube: {r.sinGN.length} (suman al turno)</span>}
      <CobrosGN r={r} />
      <div>
        <Button size="sm" variant="ghost" onClick={() => setVerDetalle(!verDetalle)}>
          {verDetalle ? 'Ocultar detalle' : 'Ver detalle'}
        </Button>
      </div>
      {verDetalle && (
        <div style={{ display: 'grid', gap: space[1], maxWidth: 560 }}>
          {r.porCuenta.map((c) => (
            <div key={c.cuenta} style={{ display: 'flex', gap: space[3], borderTop: `1px solid ${color.line}`, paddingTop: space[1] }}>
              <span style={{ flex: 1 }}>{c.nombre}</span>
              <span style={{ color: color.mut }}>{c.cobros === 1 ? '1 cobro' : `${c.cobros} cobros`}</span>
              <b style={{ minWidth: 110, textAlign: 'right' }}>{plata(c.monto)}</b>
            </div>
          ))}
          <div style={{ borderTop: `2px solid ${color.line}`, paddingTop: space[1], display: 'grid', gap: space[0.5] }}>
            <span>Fondo {plata(r.efectivo.fondo)}</span>
            <span>+ Efectivo cobrado {plata(r.efectivo.cobrado)}</span>
            {r.efectivo.cobradoGN > 0 && <span>+ Cobrado en Gestión Nube {plata(r.efectivo.cobradoGN)}</span>}
            <span>− Salidas {plata(r.efectivo.salidas)}</span>
            <b>= Efectivo esperado {plata(r.efectivo.esperado)}</b>
          </div>
          {(turno.salidas ?? []).map((m) => (
            <span key={m.id} style={{ color: color.mut }}>
              Salida {horaAr(m.creado_en)} · {plata(m.monto)} · {m.motivo} {m.usuario ? `(${m.usuario})` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * v2, W3: el TURNO PROPIO de la Caja (Bruno, 4-oct), en la pestaña. Se abre con el fondo, se carga
 * efectivo que sale con su motivo, y se cierra contando sólo el efectivo. Sin turno abierto ⛔ se
 * cobra. Un día puede tener dos turnos: se cierra uno y se abre el otro.
 *
 * Abrir, contar, cargar salida y cerrar son MODALES (fase C, Bruno 5-oct): los mismos que usa el
 * POS, que ⛔ repite esta tarjeta.
 */
export function TurnoCaja({
  turno,
  ultimos,
  billetes,
  esMio,
  onCambio,
  onCerrado,
}: {
  turno: Turno | null
  ultimos: Turno[]
  billetes: number[]
  /** Fase C: el conteo intermedio lo hace sólo la cuenta que abrió la caja (el servidor contesta 403). */
  esMio: boolean
  onCambio: (t?: Turno) => void
  onCerrado: (t: Turno) => void
}) {
  const [abierto, setAbierto] = useState<null | 'abrir' | 'contar' | 'salida' | 'cerrar'>(null)
  const [cerrado, setCerrado] = useState<Turno | null>(null)
  const [verUltimos, setVerUltimos] = useState(false)

  const ultimosPlegable = ultimos.length > 0 && (
    <Plegable abierto={verUltimos} onToggle={() => setVerUltimos(!verUltimos)} titulo="Últimos turnos" ayuda="Los turnos cerrados: esperado, contado y diferencia del efectivo.">
      <div style={{ display: 'grid', gap: space[1], fontSize: font.sm }}>
        {ultimos.map((t) => {
          const d = t.resumen?.diferencia ?? Number(t.contado) - Number(t.esperado)
          return (
            <div key={t.id} style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', borderTop: `1px solid ${color.line}`, paddingTop: space[1] }}>
              <span style={{ minWidth: 160 }}>
                {diaAr(t.abierto_en)} {horaAr(t.abierto_en)}–{t.cerrado_en ? horaAr(t.cerrado_en) : ''}
              </span>
              <span style={{ color: color.mut, minWidth: 110 }}>{t.abierto_por ?? ''}</span>
              <span>Esperado {plata(Number(t.esperado))}</span>
              <span>Contado {plata(Number(t.contado))}</span>
              <b style={{ color: tonoDiferencia(d) === 'success' ? color.successInk : color.dangerInk }}>{textoDiferencia(d)}</b>
              {t.nota && <span style={{ color: color.mut }}>«{t.nota}»</span>}
            </div>
          )
        })}
      </div>
    </Plegable>
  )

  if (!turno) {
    return (
      <>
        {cerrado && <AvisoCierre t={cerrado} />}
        <SectionCard
          title="Sin turno abierto"
          actions={
            <Button tone="success" variant="solid" onClick={() => setAbierto('abrir')}>
              Abrir turno
            </Button>
          }
        >
          <span style={{ color: color.mut, fontSize: font.sm }}>Sin turno abierto la Caja ⛔ cobra.</span>
        </SectionCard>
        {abierto === 'abrir' && (
          <AbrirTurnoModal
            billetes={billetes}
            onCerrar={() => setAbierto(null)}
            onAbierto={(t) => {
              setAbierto(null)
              setCerrado(null)
              onCambio(t)
            }}
          />
        )}
        {ultimosPlegable}
      </>
    )
  }

  return (
    <>
      <SectionCard
        title={`Turno abierto · desde ${horaAr(turno.abierto_en)} · ${turno.abierto_por ?? ''}`}
        actions={
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            {esMio && (
              <Button size="sm" variant="outline" onClick={() => setAbierto('contar')}>
                Contar billetes
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setAbierto('salida')}>
              Cargar salida
            </Button>
            <Button size="sm" tone="danger" variant="outline" onClick={() => setAbierto('cerrar')}>
              Cerrar turno
            </Button>
          </div>
        }
      >
        <ResumenTurnoDatos turno={turno} />
      </SectionCard>
      <ModalesTurno
        que={abierto}
        turno={turno}
        billetes={billetes}
        onCerrar={() => setAbierto(null)}
        onCambio={(t) => {
          setAbierto(null)
          onCambio(t)
        }}
        onCerrado={(t) => {
          setAbierto(null)
          setCerrado(t)
          onCerrado(t)
        }}
      />
      {ultimosPlegable}
    </>
  )
}

/** Los tres modales del turno abierto, para la pestaña y el POS. */
export function ModalesTurno({
  que,
  turno,
  billetes,
  onCerrar,
  onCambio,
  onCerrado,
}: {
  que: null | 'abrir' | 'contar' | 'salida' | 'cerrar'
  turno: Turno
  billetes: number[]
  onCerrar: () => void
  onCambio: (t: Turno) => void
  onCerrado: (t: Turno) => void
}) {
  if (que === 'contar') return <ConteoModal turno={turno} billetes={billetes} onCerrar={onCerrar} onListo={onCambio} />
  if (que === 'salida') return <SalidaModal onCerrar={onCerrar} onListo={onCambio} />
  if (que === 'cerrar') return <CerrarTurnoModal turno={turno} billetes={billetes} onCerrar={onCerrar} onCerrado={onCerrado} />
  return null
}

/**
 * Sólo admin: los PRODUCTOS DE FERIA TRABADOS (Bruno, 5-oct). Su precio es final: en la Caja se cobran
 * sólo en efectivo o transferencia, a la cuenta de feria, sin el % de la forma de pago. Se guarda la
 * lista entera en `caja_config.reglas.feriaProductos`; la regla vive en `lib/caja/core.core.js`.
 */
export function ProductosFeria({ reglas, onGuardadas }: { reglas: Reglas; onGuardadas: (r: Reglas) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState('')
  const [resultado, setResultado] = useState<ProductoLista[] | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const lista = reglas.feriaProductos ?? []
  const ids = new Set(lista.map((p) => p.id))

  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) return
    let vivo = true
    const reloj = setTimeout(() => {
      buscarNombre(t)
        .then((r) => vivo && setResultado([...r.conStock, ...r.sinStock]))
        .catch((e) => vivo && setMsg((e as Error).message))
    }, 250)
    return () => {
      vivo = false
      clearTimeout(reloj)
    }
  }, [q])

  async function guardar(nueva: ProductoFeria[]) {
    setGuardando(true)
    setMsg(null)
    try {
      const r = await guardarBajadas({ feriaProductos: nueva })
      onGuardadas(r.reglas)
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Plegable
      abierto={abierto}
      onToggle={() => setAbierto(!abierto)}
      titulo={`Productos de feria (${lista.length})`}
      ayuda="Precio final: sólo efectivo o transferencia, a la cuenta de feria, sin descuento por forma de pago. Sólo lo cambia un admin."
    >
      <div style={{ display: 'grid', gap: space[3], maxWidth: 640 }}>
        {lista.length === 0 ? (
          <span style={{ color: color.mut, fontSize: font.sm }}>Productos de feria: ninguno.</span>
        ) : (
          <div style={{ display: 'grid', gap: space[1] }}>
            {lista.map((p) => (
              <div key={p.id} style={{ display: 'flex', gap: space[2], alignItems: 'center', borderBottom: `1px solid ${color.line}`, paddingBottom: space[1] }}>
                <Badge tone="warning">Feria</Badge>
                <span style={{ flex: 1 }}>{p.nombre || `Producto ${p.id}`}</span>
                <Button size="sm" variant="ghost" disabled={guardando} onClick={() => guardar(lista.filter((x) => x.id !== p.id))}>
                  Sacar
                </Button>
              </div>
            ))}
          </div>
        )}
        <Field label="Agregar un producto">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre del producto" autoComplete="off" spellCheck={false} />
        </Field>
        {q.trim().length >= 2 && resultado && (
          <div style={{ display: 'grid', gap: space[1] }}>
            {resultado.length === 0 && <span style={{ color: color.mut, fontSize: font.sm }}>Resultados: ninguno.</span>}
            {resultado.map((p) => (
              <div key={p.product_id} style={{ display: 'flex', gap: space[2], alignItems: 'center' }}>
                <span style={{ flex: 1 }}>{p.product_name}</span>
                {ids.has(p.product_id) ? (
                  <Badge tone="warning">Feria</Badge>
                ) : (
                  <Button size="sm" variant="outline" disabled={guardando} onClick={() => guardar([...lista, { id: p.product_id, nombre: p.product_name }])}>
                    Agregar
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        {msg && <Notice tone="danger">{msg}</Notice>}
      </div>
    </Plegable>
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
