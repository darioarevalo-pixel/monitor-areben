'use client'

/**
 * Caja: las piezas que comparten las dos pantallas (fase C, 5-oct): el POS (`/pos`, `CajaPOS.tsx`)
 * y la pestaña Caja del monitor, que es el informativo del turno (`Caja.tsx`).
 */

import { Fragment, useCallback, useEffect, useRef, useState, type ComponentProps } from 'react'
import { useRouter } from 'next/navigation'
import { MODOS_OFERTA, NOMBRE_MEDIO, msjOferta, ofertaDe } from '@/lib/caja/core.core.js'
import { billetesDe } from '@/lib/caja/conteo.core.js'
import { porFormaDePago } from '@/lib/caja/cierre.core.js'
import { MARCA_CAJA, storeCaja } from '@/lib/caja/marca'
import { codigoArqueo } from '@/lib/caja/arqueo.core.js'
import { DOMINIOS_MAIL, completarMail, mailOk } from '@/lib/caja/mail'
import { imprimirCierre, numeroProvisorio, plata, type DatosCierre, type LogoTicket } from '@/lib/caja/ticket'
import { titularesDe } from '@/lib/caja/otra-cuenta.core.js'
import { TOLERANCIA_TRANSFERENCIA } from '@/lib/pagos-recibidos/core.core.js'
import { ArmadoDelSobre, CalculadoraBilletes, olvidarConteo } from '@/components/caja/CalculadoraBilletes'
import { aNumero as aNumeroTxt, textoDiferencia } from '@/lib/caja/textos'
import {
  cancelarVenta,
  confirmarOtraCuenta,
  confirmarVarios,
  cruzarVenta,
  guardarBajadas,
  guardarPolitica,
  abrirTurno,
  sacarEfectivo,
  anularMovimiento,
  resolverVenta,
  confirmarTransferencia,
  type SalidaTurno,
  type Versiones,
  cerrarTurno,
  leerTurno,
  leerVentasTurno,
  contarBilletes,
  type Turno,
  type Conteo,
  type ResumenTurno,
  reintentarVenta,
  type Candidato,
  type Cruce,
  type PagoReciente,
  type Medio,
  type Rebaja,
  type Reglas,
  type Stock,
  type Variante,
  type Venta,
  type PedidosWeb,
  type ProductoLista,
  type ProductoFeria,
  type MarcaLogo,
  type Oferta,
  type ModoOferta,
  type CampaniaLiq,
  buscarNombre,
  guardarLogo,
  leerLogoTN,
  leerCuentasMp,
  usarCuentaMp,
  type CuentaMp,
  numeroDeLaVenta,
} from '@/lib/caja/cliente'
import { Badge, Button, ButtonLink, Card, Field, Icono, Input, Modal, Notice, Plegable, SectionCard, Select, color, font, radius, space, weight } from '@/components/ui'
import { HeaderAcciones } from '@/components/layout/acciones'
import { ConfirmDetalle, useConfirmar } from '@/components/ui/Confirm'


/** Un renglón del pedido. `precioLista`: el de la etiqueta al escanear (B5: si la cajera lo cambia, queda a la vista). */
export type Renglon = { variante: Variante; stock: Stock; cantidad: number; precio: number | null; fueraDeTn: boolean; foto: string | null; rebaja?: Rebaja | null; precioLista?: number | null; /** Qué contestó la cajera cuando se escaneó de nuevo (14-oct, `repetida.core.js`). */ repetida?: { si: number; no: number; en: string[] } | null }
/** La cajera elige la FORMA de pago; la cuenta de GN la resuelve `cuentaDeMedio` (Bruno, 4-oct). `base`: con «Varios pagos», lo que PAGA con ella (texto). */
/** `oferta`: el pago es del reparto de la OFERTA (varios pagos con productos en oferta, 13-oct); van primero. */
export type PagoUI = { medio: Medio | null; base: string; oferta?: boolean }

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
        <TarjetaProducto key={claveDe(v)} nombre={`${v.product_name} · ${v.size_name}`} precio={precio} foto={foto} apagada={apagada} cta={apagada ? 'Sin stock en el local ›' : 'Agregar al pedido +'} onClick={() => onElegir(v)} />
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
    <div style={{ marginTop: space[3], display: 'grid', gap: grilla ? space[3] : space[2], ...(grilla ? { gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' } : {}) }}>
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
 * La tarjeta de un producto en el POS (prototipo del 5-oct): la foto a sangre arriba —con «Feria» encima
 * si es de feria—, el nombre, el precio y lo que pasa al tocarla. Sin stock en el local, la foto en gris.
 */
export function TarjetaProducto({ nombre, precio, foto, cta, apagada, feria = false, onClick }: { nombre: string; precio: number | null; foto: string | null; cta: string; apagada: boolean; feria?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="caja-tarjeta"
      style={{
        height: 'auto',
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        textAlign: 'left',
        overflow: 'hidden',
        border: `1px solid ${color.line}`,
        borderRadius: radius.xl,
        background: color.surface,
        cursor: 'pointer',
      }}
    >
      <span style={{ position: 'relative', display: 'block', filter: apagada ? 'grayscale(.9)' : undefined, opacity: apagada ? 0.55 : 1 }}>
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="" loading="lazy" style={{ display: 'block', width: '100%', aspectRatio: '4 / 5', objectFit: 'cover' }} />
        ) : (
          <span style={{ display: 'block', width: '100%', aspectRatio: '4 / 5', background: color.bg2 }} />
        )}
        {feria && (
          <span style={{ position: 'absolute', top: space[2], left: space[2] }}>
            <Badge tone="warning">Oferta</Badge>
          </span>
        )}
      </span>
      <span style={{ display: 'grid', gap: 3, padding: `${space[2]}px ${space[3]}px ${space[3]}px` }}>
        <span style={{ fontWeight: weight.semibold, color: color.ink, fontSize: font.base, lineHeight: 1.25 }}>{nombre}</span>
        <span style={{ fontWeight: weight.bold, color: color.ink, fontSize: font.lg, fontVariantNumeric: 'tabular-nums' }}>{precio ? plata(precio) : '—'}</span>
        <span style={{ marginTop: space[1], fontSize: font.sm, fontWeight: weight.bold, color: apagada ? color.mut : color.brand }}>{cta}</span>
      </span>
    </button>
  )
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
  feria,
}: {
  con: ProductoLista[]
  masCon: number
  sin: ProductoLista[]
  masSin: number
  verSin: boolean
  onVerSin: () => void
  precioYFoto: (productId: number) => { precio: number | null; foto: string | null }
  onElegir: (p: ProductoLista) => void
  /** Los productos de feria trabados: la tarjeta lo dice antes de agregarla. */
  feria?: Set<number>
}) {
  const ancho = { gridColumn: '1 / -1' }
  const tarjeta = (p: ProductoLista, apagada: boolean) => {
    const { precio, foto } = precioYFoto(p.product_id)
    const una = p.variantes.length === 1
    const cta = apagada ? 'Sin stock en el local ›' : una ? 'Agregar al pedido +' : `Elegir variante (${p.variantes.length}) ›`
    return <TarjetaProducto key={p.product_id} nombre={p.product_name} precio={precio} foto={foto} cta={cta} apagada={apagada} feria={!!feria?.has(Number(p.product_id))} onClick={() => onElegir(p)} />
  }
  const totalSin = sin.length + masSin
  const enLocal = con.length + masCon
  return (
    <div style={{ marginTop: space[3], display: 'grid', gap: space[3], gridTemplateColumns: 'repeat(auto-fill, minmax(164px, 1fr))' }}>
      {enLocal > 0 && (
        <div style={{ ...ancho, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: `${space[1]}px ${space[3]}px`, fontSize: font.sm, color: color.mut }}>
          <span>
            <b style={{ color: color.ink, fontSize: font.md }}>{enLocal === 1 ? '1 producto' : `${enLocal} productos`}</b> en el local
          </span>
          {/* La misma condición que el Enter del campo (CajaPOS): uno solo, sin más ni sin stock detrás. */}
          {con.length === 1 && !masCon && !totalSin && <span>Enter abre las variantes</span>}
        </div>
      )}
      {con.length === 0 && !verSin && <span style={{ ...ancho, color: color.mut, fontSize: font.sm }}>Con stock en el local: ninguno.</span>}
      {con.map((p) => tarjeta(p, false))}
      {masCon > 0 && <span style={{ ...ancho, color: color.mut, fontSize: font.sm }}>Y {masCon} más: sumar el color o el talle para achicar la lista.</span>}
      {verSin && sin.map((p) => tarjeta(p, true))}
      {verSin && masSin > 0 && <span style={{ ...ancho, color: color.mut, fontSize: font.sm }}>Y {masSin} más sin stock.</span>}
      {!verSin && totalSin > 0 && (
        <div style={ancho}>
          <Button variant="outline" size="sm" onClick={onVerSin}>
            Mostrar sin stock ({totalSin})
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * «Elegir variante» (Bruno, 5-oct, como el modal de GN; aspecto del prototipo del 6-oct): arriba la
 * foto grande DEL COLOR de la fila elegida, el nombre y el SKU; abajo una fila por variante con el
 * color en un círculo, «Color · Talle» y el precio. Las del local primero y el resto tras «Mostrar sin
 * stock». Con el teclado: ↑/↓ y Enter.
 *
 * 🔑 **El círculo es la FOTO del color** (Tienda Nube por SKU): ni GN ni TN traen el hex del color, y un
 * hex inventado por nombre mentiría. Sin foto, un círculo gris. ⚠️ La «Ubicación» ⛔ va acá: la lista de
 * la búsqueda ⛔ trae los estantes (los trae la lectura de la prenda al elegirla, y el renglón los dice).
 */
export function ElegirVariante({
  producto,
  precio,
  fotoDe,
  colorDe,
  feria = false,
  onElegir,
  onCerrar,
}: {
  producto: ProductoLista
  precio: number | null
  fotoDe: (v: Variante) => string | null
  /** El nombre del color de la variante en Tienda Nube (por SKU), o null. */
  colorDe?: (v: Variante) => string | null
  /** Producto de feria trabado: lo dice antes de agregarlo. */
  feria?: boolean
  onElegir: (v: Variante) => void
  onCerrar: () => void
}) {
  const con = producto.variantes.filter((v) => (v.local ?? 0) > 0)
  const sin = producto.variantes.filter((v) => !((v.local ?? 0) > 0))
  const [verSin, setVerSin] = useState(con.length === 0)
  // La fila con el foco: la resalta y le pone su foto arriba («la foto es la del color elegido»).
  const [sel, setSel] = useState<string | null>(null)
  const lista = useRef<HTMLDivElement>(null)
  const mover = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const botones = [...(lista.current?.querySelectorAll<HTMLButtonElement>('button[data-variante]') ?? [])]
    const i = botones.indexOf(document.activeElement as HTMLButtonElement)
    const j = e.key === 'ArrowDown' ? Math.min(botones.length - 1, i + 1) : Math.max(0, i - 1)
    botones[j]?.focus()
  }
  const visibles = verSin ? [...con, ...sin] : con
  const elegida = visibles.find((v) => claveDe(v) === sel) ?? visibles[0] ?? producto.variantes[0]
  /** «Color · Talle»; si el talle de GN ya trae el color («Bordó - S»), tal cual. */
  const rotulo = (v: Variante) => {
    const c = colorDe?.(v)?.trim()
    return c && !v.size_name.toLowerCase().includes(c.toLowerCase()) ? `${c} · ${v.size_name}` : v.size_name
  }
  const fila = (v: Candidato, i: number, apagada: boolean) => {
    const marcada = claveDe(v) === claveDe(elegida)
    const foto = fotoDe(v)
    return (
      <button
        key={claveDe(v)}
        type="button"
        role="option"
        aria-selected={marcada}
        data-variante
        data-foco={i === 0 && !apagada ? true : undefined}
        onClick={() => onElegir(v)}
        onFocus={() => setSel(claveDe(v))}
        style={{
          height: 'auto',
          minHeight: 48,
          display: 'grid',
          gridTemplateColumns: '22px minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: space[2] + 2,
          padding: `${space[1]}px ${space[3]}px`,
          textAlign: 'left',
          fontSize: font.md,
          border: marcada ? `1.5px solid ${color.brandSolid}` : `1px ${apagada ? 'dashed' : 'solid'} ${color.line}`,
          borderRadius: radius.lg,
          background: marcada ? color.brandBg : apagada ? color.bg : color.surface,
          color: apagada ? color.mut : color.ink,
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="" loading="lazy" style={{ width: 20, height: 20, borderRadius: radius.pill, objectFit: 'cover', border: '1px solid rgba(0,0,0,.12)' }} />
        ) : (
          <i style={{ display: 'block', width: 20, height: 20, borderRadius: radius.pill, background: color.bg2, border: '1px solid rgba(0,0,0,.12)' }} />
        )}
        <span style={{ minWidth: 0 }}>
          <b style={{ fontWeight: weight.semibold }}>{rotulo(v)}</b>
          {apagada && <span style={{ fontSize: font.sm, color: color.mut }}> · sin stock en el local</span>}
        </span>
        <span style={{ fontWeight: weight.bold, fontVariantNumeric: 'tabular-nums' }}>{precio ? plata(precio) : '—'}</span>
      </button>
    )
  }
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Elegir variante" variante="pos">
      <div style={{ display: 'grid', gap: space[3] + 2 }} onKeyDown={mover}>
        <div style={{ display: 'flex', gap: space[3] + 2, alignItems: 'center' }}>
          <Foto src={fotoDe(elegida)} ancho={96} />
          <div style={{ minWidth: 0 }}>
            <h4 style={{ margin: 0, fontSize: font.xl, color: color.ink }}>
              {producto.product_name} {feria && <Badge tone="warning">Oferta</Badge>}
            </h4>
            <p style={{ margin: '2px 0 0', fontSize: font.base, color: color.mut }}>
              {(elegida.sku ?? elegida.barcode) && <>{elegida.sku ?? elegida.barcode} · </>}
              <b style={{ color: color.ink, fontVariantNumeric: 'tabular-nums' }}>{precio ? plata(precio) : 'Sin precio'}</b>
            </p>
            <p style={{ margin: '2px 0 0', fontSize: font.sm, color: color.mut }}>La foto es la del color elegido.</p>
          </div>
        </div>
        <div ref={lista} role="listbox" aria-label="Variantes" style={{ display: 'grid', gap: space[1.5] }}>
          {con.map((v, i) => fila(v, i, false))}
          {verSin && sin.map((v, i) => fila(v, i, true))}
        </div>
        {!verSin && sin.length > 0 && (
          <div>
            <Button variant="outline" size="sm" onClick={() => setVerSin(true)}>
              Mostrar sin stock ({sin.length})
            </Button>
          </div>
        )}
        <span style={{ fontSize: font.sm, color: color.mut }}>↑/↓ para moverse · Enter agrega · Esc cierra</span>
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
  promos = null,
  tactil = false,
}: {
  r: Renglon
  /** Vista de celular: los botones de cantidad y la cruz de 40 px (el pulgar), ⛔ los 28 de la PC. */
  tactil?: boolean
  /** Las promos que le tocaron a esta prenda (W5), o null. Las aplica `aplicarPromos`, ⛔ la cajera. */
  promos?: string[] | null
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
  const conRebaja = (!!r.rebaja || !!promos?.length) && importe != null && lista != null && lista - importe > 0.004
  const paso = (delta: number, etiqueta: string, signo: string) => (
    <button type="button" onClick={() => onCantidad(r.cantidad + delta)} aria-label={etiqueta} style={{ height: tactil ? 40 : 28, width: tactil ? 40 : 28, display: 'grid', placeItems: 'center', border: 0, background: 'transparent', color: color.ink2, fontSize: font.lg, cursor: 'pointer' }}>
      {signo}
    </button>
  )
  return (
    // Compacto (Bruno, 12-oct): tres prendas tienen que entrar a la vista sin scroll ⇒ foto de 36 px y talle,
    // código, stock y ubicación en UNA línea; los avisos, sólo si hay alguno.
    // La cruz va ARRIBA a la derecha, al lado del importe (Bruno, 12-oct): en la fila de los controles la
    // hacía partir en dos renglones.
    <div style={{ display: 'grid', gridTemplateColumns: `36px minmax(0, 1fr) auto ${tactil ? 40 : 24}px`, columnGap: space[2], rowGap: space[1], padding: `${space[1.5]}px 0`, borderBottom: `1px solid ${color.bg2}` }}>
      <div style={{ gridRow: 'span 2' }}>
        <Foto src={r.foto} ancho={36} proporcion="1 / 1" />
      </div>
      <div style={{ minWidth: 0, fontWeight: weight.semibold, color: color.ink, fontSize: font.base, lineHeight: 1.25 }}>
        {r.variante.product_name} {feria && <Badge tone="warning">Oferta</Badge>}{' '}
        {!!promos?.length && <Badge tone="success">{promos.join(' + ')}</Badge>}
      </div>
      <div style={{ gridRow: 'span 2', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {conRebaja && <s style={{ display: 'block', color: color.mut2, fontSize: font.xs }}>{plata(lista as number)}</s>}
        <b style={{ fontSize: font.md, color: conRebaja ? color.successInk : color.ink }}>{importe != null ? plata(importe) : lista != null ? plata(lista) : '—'}</b>
      </div>
      <button
        type="button"
        onClick={onSacar}
        className="caja-sacar"
        aria-label={`Sacar ${r.variante.product_name} · ${r.variante.size_name} del pedido`}
        title="Sacar del pedido"
        // La cruz en ROJO siempre (Bruno, 12-oct), ⛔ sólo al pasar el mouse.
        style={{ gridRow: 'span 2', alignSelf: 'start', height: tactil ? 40 : 24, width: tactil ? 40 : 24, display: 'grid', placeItems: 'center', border: 0, background: 'transparent', borderRadius: radius.md, color: color.danger, cursor: 'pointer', padding: 0 }}
      >
        <Icono nombre="cruz" size={16} />
      </button>
      <div style={{ display: 'flex', gap: space[1.5], alignItems: 'center', flexWrap: 'wrap', fontSize: font.xs, color: color.mut, minWidth: 0 }}>
        <span style={{ fontSize: font.sm }}>{r.variante.size_name}</span>
        {(r.variante.sku ?? r.variante.barcode) && <span style={{ color: color.mut2 }}>· {r.variante.sku ?? r.variante.barcode}</span>}
        <span>·</span>
        {quedan < 0 ? <Badge tone="danger">Local: sin stock en {r.stock.fuente === 'erp' ? 'el ERP' : 'Gestión Nube'}</Badge> : quedan === 0 ? <Badge tone="warning">ÚLTIMA</Badge> : <span>Local: quedan {quedan}</span>}
        {/* En el local «depósito» es el de atrás de la percha, que ya está en `local`. El Depósito de GN
            (18210) ⛔ vende desde la caja: sólo repone. */}
        <span>· Para reponer: {r.stock.deposito}</span>
        {/* 🔑 Ubicaciones depósito: dónde buscarla atrás. Va EN EL RENGLÓN porque la mayoría se escanea y
            ⛔ pasa por la búsqueda (Bruno, 5-oct). Sin estante ⛔ se dice nada: está todo en percha. */}
        {!!r.stock.atras?.length && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: weight.semibold, color: color.brand, background: color.brandBg, border: `1px solid ${color.brandBorder}`, padding: '0 6px', borderRadius: radius.pill }}>
            <Icono nombre="ubicaciones" size={12} />
            Ubicación: {r.stock.atras.join(' · ')}
          </span>
        )}
        {r.stock.fuente === 'espejo' && <span title={r.stock.motivo}>· Stock de anoche (Gestión Nube sin respuesta)</span>}
      </div>
      {/* B5 (Bruno, 11-oct): cambiar el precio es libre, pero se ve (y queda en la venta). */}
      {((r.precioLista != null && r.precio != null && Math.abs(r.precioLista - r.precio) > 0.004) || mirandoWeb || avisoWeb) && (
        <div style={{ gridColumn: '2 / 5', display: 'flex', gap: space[1.5], flexWrap: 'wrap', alignItems: 'center', fontSize: font.xs }}>
          {r.precioLista != null && r.precio != null && Math.abs(r.precioLista - r.precio) > 0.004 && <span style={{ color: color.warningInk }}>Precio cambiado: la etiqueta dice {plata(r.precioLista)}.</span>}
          {mirandoWeb && <span style={{ color: color.mut }}>Pedidos web: leyendo…</span>}
          {/* El Badge ⛔ corta línea (nowrap): con el aviso largo estiraba el carrito a lo ancho (Bruno, 12-oct). */}
          {avisoWeb && <Badge tone={avisoWeb.tipo === 'sin_stock' ? 'danger' : 'warning'} style={{ whiteSpace: 'normal', minWidth: 0, maxWidth: '100%', borderRadius: 8 }}>{avisoWeb.texto}</Badge>}
        </div>
      )}
      {/* Los controles van a lo ancho del renglón: con el precio editable ⛔ entran debajo del nombre. */}
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'nowrap' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', height: tactil ? 44 : 28, border: `1px solid ${color.line2}`, borderRadius: radius.md, background: color.surface, flexShrink: 0 }}>
          {paso(-1, 'Una menos', '−')}
          <span style={{ minWidth: 28, textAlign: 'center', fontWeight: weight.semibold, fontSize: font.base, fontVariantNumeric: 'tabular-nums' }}>{r.cantidad}</span>
          {paso(1, 'Una más', '+')}
        </div>
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
          style={{ width: tactil ? 96 : 84, height: tactil ? 44 : 28, textAlign: 'right', color: color.brand, fontWeight: weight.semibold, fontSize: font.base }}
          aria-label="Precio"
        />
        <CampoRebaja valor={r.rebaja ?? null} onCambio={onRebaja} chico />
      </div>
    </div>
  )
}

/**
 * «Varios pagos» (prototipo del 6-oct): una fila por pago —forma de pago · lo que PAGA la clienta con ella ·
 * X—, y abajo si el reparto cierra. El último pago se lleva el resto (`cobro()`), así que su monto ⛔ se escribe.
 * 🔑 Robustez (auditoría, 11-oct): se escribe lo que la clienta paga con esa forma de pago (ya con su
 * descuento), ⛔ la parte del subtotal a precio de lista, que es lo que nadie tiene en la cabeza. `aBase`
 * lo pasa a la parte del subtotal, que es lo que reparte `cobro()`.
 */
export function VariosPagos({
  pagos,
  setPagos,
  montos,
  subtotal = null,
  aBase,
  medios = MEDIOS,
  minimo = 2,
  titulo,
}: {
  pagos: PagoUI[]
  setPagos: (p: PagoUI[]) => void
  montos: number[] | null
  /** El subtotal a precio de lista: contra eso se reparte. */
  subtotal?: number | null
  /** Lo que paga con una forma de pago ⇒ la parte del subtotal (null si ⛔ se puede). */
  aBase: (medio: Medio, monto: number) => number | null
  /** Las formas de pago que se ofrecen en este reparto (con oferta, 13-oct: ⛔ todas valen). */
  medios?: Medio[]
  /** Con menos pagos que esto ⛔ se ofrece eliminar: el reparto de la oferta o del resto puede ser de uno. */
  minimo?: number
  /** Con oferta son dos repartos: «La oferta» y «El resto». */
  titulo?: string
}) {
  const nuevo = (): PagoUI => ({ medio: null, base: '', oferta: pagos[0]?.oferta })
  const cambiar = (i: number, cambio: Partial<PagoUI>) => setPagos(pagos.map((p, j) => (j === i ? { ...p, ...cambio } : p)))
  // Lo que se lleva el último: el subtotal menos lo que cubren los demás. ⛔ Es plata nueva: el cobro lo
  // calcula `cobro()`; esto sólo dice si el reparto cierra.
  const bases = pagos.slice(0, -1).map((p) => {
    const m = aNumero(p.base)
    return m != null && p.medio ? aBase(p.medio, m) : null
  })
  const resto = subtotal != null ? Math.round((subtotal - bases.reduce((s: number, b) => s + (b ?? 0), 0)) * 100) / 100 : null
  const ultimoSinMedio = pagos[pagos.length - 1]?.medio == null
  const estado =
    resto == null
      ? null
      : resto <= 0
        ? { ok: false, texto: resto < 0 ? `Sobran ${plata(-resto)}` : 'El último pago queda en $0' }
        : ultimoSinMedio
          ? { ok: false, texto: `Falta repartir ${plata(resto)}` }
          : { ok: true, texto: 'Repartido completo' }
  return (
    <div style={{ display: 'grid', gap: space[2] }}>
      {titulo ? (
        <span style={{ fontSize: font.md, fontWeight: weight.semibold, color: color.ink }}>
          {titulo}
          {subtotal != null && <span style={{ color: color.mut, fontWeight: weight.normal }}> · {plata(subtotal)} a precio de lista</span>}
        </span>
      ) : (
        <span style={{ fontSize: font.sm, color: color.mut }}>
          En cada pago va lo que la clienta paga con esa forma de pago (ya con su descuento); el último se lleva el resto. Cada uno se redondea por separado.
        </span>
      )}
      {pagos.map((p, i) => {
        const ultimo = i === pagos.length - 1
        return (
          <div key={i} style={{ display: 'grid', gap: space[0.5] }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 150px 30px', gap: space[2], alignItems: 'center' }}>
              <Select value={p.medio ?? ''} onChange={(e) => cambiar(i, { medio: (e.target.value || null) as Medio | null })} aria-label={`Forma de pago ${i + 1}`}>
                <option value="">Forma de pago…</option>
                {medios.map((m) => (
                  <option key={m} value={m}>
                    {NOMBRE_MEDIO[m]}
                  </option>
                ))}
              </Select>
              {ultimo ? (
                <span style={{ color: color.mut, fontSize: font.base, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{montos?.[i] != null ? `el resto: ${plata(montos[i])}` : 'el resto'}</span>
              ) : (
                <Input inputMode="decimal" autoComplete="off" value={p.base} onChange={(e) => cambiar(i, { base: e.target.value })} placeholder="$ que paga" aria-label={`Lo que paga con el pago ${i + 1}`} style={{ textAlign: 'right' }} />
              )}
              {pagos.length > minimo ? (
                <button
                  type="button"
                  className="caja-sacar"
                  onClick={() => setPagos(pagos.filter((_, j) => j !== i))}
                  aria-label={`Eliminar el pago ${p.medio ? NOMBRE_MEDIO[p.medio] : 'sin forma de pago'}`}
                  title="Eliminar este pago"
                  style={{ height: 30, width: 30, display: 'grid', placeItems: 'center', border: 0, background: 'transparent', borderRadius: radius.md, color: color.mut2, cursor: 'pointer' }}
                >
                  <Icono nombre="cruz" size={16} />
                </button>
              ) : (
                <span />
              )}
            </div>
            {montos?.[i] != null && !ultimo && montos[i] !== aNumero(p.base) && <span style={{ fontSize: font.sm, color: color.mut, fontVariantNumeric: 'tabular-nums' }}>cobra {plata(montos[i])}</span>}
          </div>
        )
      })}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <Button size="sm" variant="outline" onClick={() => setPagos([...pagos.slice(0, -1), nuevo(), pagos[pagos.length - 1]])}>
          Agregar pago
        </Button>
        {estado && <span style={{ fontSize: font.base, fontWeight: weight.semibold, fontVariantNumeric: 'tabular-nums', color: estado.ok ? color.successInk : color.warningInk }}>{estado.texto}</span>}
      </div>
    </div>
  )
}

/**
 * Los números del cobro (prototipo del 6-oct): los descuentos en verde, el redondeo en gris y el Total
 * grande debajo de una línea punteada. Los números son los de `cobro()`: acá ⛔ se calcula nada.
 */
export function ResumenCobro({ c, nombreCuenta }: { c: { subtotal: number; aVenta: number; total: number; pagos: { cuenta: number; porcentaje: number; descuento: number; redondeo: number; monto: number }[] }; nombreCuenta: (id: number) => string }) {
  const linea = (izq: string, der: string, tinta: string = color.ink2) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[2], fontSize: font.md, color: tinta }}>
      <span>{izq}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{der}</span>
    </div>
  )
  return (
    <div style={{ display: 'grid', gap: space[1.5] }}>
      {linea('Subtotal', plata(c.subtotal))}
      {c.aVenta > 0 && linea('Descuento en la venta', `−${plata(c.aVenta)}`, color.successInk)}
      {c.pagos.map((p, i) => (
        <div key={i} style={{ display: 'grid', gap: space[1.5] }}>
          {p.descuento > 0 && linea(`Descuento ${p.porcentaje}%${c.pagos.length > 1 ? ` · ${nombreCuenta(p.cuenta)}` : ''}`, `−${plata(p.descuento)}`, color.successInk)}
          {p.redondeo > 0 && linea('Redondeo', `+${plata(p.redondeo)}`, color.mut)}
          {p.redondeo < 0 && linea('Redondeo', `−${plata(-p.redondeo)}`, color.mut)}
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: space[2], borderTop: `1px dashed ${color.line2}` }}>
        <span style={{ fontWeight: weight.heavy, fontSize: font.md, letterSpacing: '.05em', color: color.ink }}>Total</span>
        <strong style={{ fontSize: 32, fontWeight: weight.heavy, letterSpacing: '-.02em', lineHeight: 1, color: color.ink, fontVariantNumeric: 'tabular-nums' }}>{plata(c.total)}</strong>
      </div>
    </div>
  )
}

/**
 * La venta recién cobrada (prototipo del 5-oct): verde con el tilde si llegó a GN; roja si quedó
 * pendiente. «Agregar otra venta» va en el mismo panel.
 */
export function UltimaVenta({
  venta,
  onReimprimir,
  onTicketCambio,
  onOtra,
  nombreCuenta,
  esEfectivo,
  regalo = false,
  cambio,
}: {
  venta: Venta
  /** Es un CAMBIO (Bruno, 28-oct): la misma tarjeta que la venta, con su número y lo que quedó a favor. */
  cambio?: { aFavor: number }
  /** Sin él, ⛔ hay «Reimprimir» (el celular ⛔ imprime: el ticket va por mail). */
  onReimprimir?: () => void
  /** El ticket de cambio solo (regalo, Bruno 13-oct): sin precios. */
  onTicketCambio?: () => void
  /**
   * 🔴 La venta se cobró con «Regalo» (19-oct): el ticket de cambio sale solo al cerrarse el cuadro del de la
   * venta (`finDeImpresion`). Si igual ⛔ sale, ⛔ lo ve nadie ⇒ el botón queda resaltado y dice que se toque.
   */
  regalo?: boolean
  onOtra?: () => void
  /** El MEDIO de una cuenta (`nombreParaTicket`): con él, la línea dice cómo pagó. */
  nombreCuenta?: (id: number) => string
  /** Las cuentas de efectivo: el vuelto es lo que pagó de más sobre ellas. */
  esEfectivo?: (id: number) => boolean
}) {
  const enErp = venta.estado === 'en_erp'
  const enGn = venta.estado === 'en_gn' || enErp
  const tono = enGn ? { fg: color.successInk, bg: color.successBg, borde: color.successBorder } : { fg: color.dangerInk, bg: color.dangerBg, borde: color.dangerBorder }
  const medios = nombreCuenta ? [...new Set(venta.pagos.map((p) => nombreCuenta(p.cuenta)))].join(' + ') : ''
  const enEfectivo = esEfectivo ? venta.pagos.filter((p) => esEfectivo(p.cuenta)).reduce((s, p) => s + p.monto, 0) : 0
  const vuelto = venta.paga_con != null && enEfectivo > 0 ? Math.round((venta.paga_con - enEfectivo) * 100) / 100 : 0
  return (
    <section
      aria-label="Última venta"
      style={{ display: 'flex', alignItems: 'center', gap: space[3] + 2, flexWrap: 'wrap', padding: `${space[3] + 2}px ${space[4]}px`, border: `1px solid ${tono.borde}`, borderRadius: radius['2xl'], background: `linear-gradient(0deg, ${color.surface}, ${tono.bg})` }}
    >
      <span style={{ width: 40, height: 40, borderRadius: radius.pill, display: 'grid', placeItems: 'center', flexShrink: 0, background: tono.bg, color: tono.fg, border: `1px solid ${tono.borde}` }}>
        <Icono nombre={enGn ? 'check' : 'cruz'} size={22} />
      </span>
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <b style={{ display: 'block', fontSize: font.lg, color: color.ink }}>
          {enGn ? `${cambio ? 'Cambio' : 'Venta'} #${enErp ? venta.erp_numero ?? '—' : venta.gn_number} · ${plata(venta.total)}` : `Venta provisoria ${numeroProvisorio(venta.id)} · ${plata(venta.total)}`}
        </b>
        <span style={{ display: 'block', fontSize: font.base, color: enGn ? color.ink2 : color.dangerInk }}>
          {enGn ? (enErp ? 'en el ERP' : 'en Gestión Nube') : `pendiente en Gestión Nube (${venta.ultimo_error ?? 'sin respuesta'}) · reintento automático`}
        </span>
        {(medios || vuelto > 0 || venta.email || (cambio && cambio.aFavor > 0)) && (
          <span style={{ display: 'block', fontSize: font.base, color: color.ink2 }}>
            {[
              cambio && cambio.aFavor > 0 && <span key="f">Saldo a favor {plata(cambio.aFavor)}</span>,
              medios && <span key="m">{medios}</span>,
              vuelto > 0 && (
                <span key="v" style={{ color: color.successInk, fontWeight: weight.bold, fontVariantNumeric: 'tabular-nums' }}>
                  Vuelto {plata(vuelto)}
                </span>
              ),
              venta.email && <span key="c">{venta.email}</span>,
            ]
              .filter(Boolean)
              .flatMap((x, i) => (i ? [' · ', x] : [x]))}
          </span>
        )}
        {regalo && onTicketCambio && (
          <span style={{ display: 'block', fontSize: font.base, color: color.ink2 }}>Es regalo: si no salió el ticket de cambio, tocá «Imprimir ticket de cambio».</span>
        )}
      </div>
      {onReimprimir && (
        <Button variant="outline" onClick={onReimprimir}>
          Reimprimir ticket
        </Button>
      )}
      {onTicketCambio && (
        <Button variant={regalo ? 'solid' : 'outline'} tone={regalo ? 'brand' : undefined} onClick={onTicketCambio} title="Sin precios, para regalo">
          {regalo ? 'Imprimir ticket de cambio' : 'Ticket de cambio'}
        </Button>
      )}
      {onOtra && (
        <Button tone="brand" variant="solid" onClick={onOtra}>
          Agregar otra venta
        </Button>
      )}
    </section>
  )
}

export const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
const TEXTO_ORIGEN: Record<string, string> = { mp: 'desde Mercado Pago', banco: 'desde otro banco', tarjeta: 'con tarjeta', otro: 'otro medio' }

/**
 * Una venta que espera la transferencia (F5). Pregunta cada 5 s si llegó; el servidor decide con
 * `cruzarTransferencia` y, si llegó, ya la mandó a GN ⇒ acá sólo se imprime (`onLlego`).
 */
export function EsperaTransferencia({
  venta,
  reglas,
  onLlego,
  onCambio,
  onSeguir,
  onCambiarPago,
}: {
  venta: Venta
  /** Las de la tienda: de ahí salen los titulares de «Transfirió a otra cuenta» (V4). */
  reglas: Reglas | null
  onLlego: (v: Venta) => void
  onCambio: () => void
  onSeguir?: () => void
  /** «Cambiar forma de pago» (Bruno, 12-oct): la pantalla cancela la venta y vuelve a cargar el carrito. */
  onCambiarPago?: (v: Venta) => Promise<void>
}) {
  const [cruce, setCruce] = useState<Cruce | null>(null)
  const [recientes, setRecientes] = useState<{ lista: PagoReciente[]; cuenta: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [seguro, setSeguro] = useState(false)
  // Bruno, 12-oct: la salida cuando ⛔ llega justa. `sumando` = los pagos elegidos para completar la venta;
  // `otra` = el formulario de «transfirió a otra cuenta».
  const [sumando, setSumando] = useState<string[] | null>(null)
  const [otra, setOtra] = useState<{ titular: string | null; banco: string } | null>(null)
  // El error de una ACCIÓN de la cajera va aparte: la consulta a MP de cada 5 s limpia el suyo y lo borraba.
  const [errorAccion, setErrorAccion] = useState<string | null>(null)
  const [operacion, setOperacion] = useState('')
  const terminada = useRef(false)
  const verTodos = useRef(false)

  const mirar = useCallback(
    async (pago?: string) => {
      if (terminada.current) return
      try {
        const r = await cruzarVenta(venta.id, pago, verTodos.current)
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
        if (r.recientes) setRecientes({ lista: r.recientes, cuenta: r.cuentaMp ?? null })
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

  /** Corre una acción que termina la espera (la venta salió a GN o se canceló). */
  async function terminar(que: string, accion: () => Promise<void>) {
    setTrabajando(que)
    setErrorAccion(null)
    try {
      await accion()
      terminada.current = true
    } catch (e) {
      setErrorAccion((e as Error).message)
    } finally {
      setTrabajando(null)
    }
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

  function empezarASumar() {
    verTodos.current = true
    setOtra(null)
    setSumando([])
    void mirar()
  }

  const monto = venta.espera_monto ?? venta.total
  // Los que el cruce ofrece para elegir (con duda); el resto de la lista es para mirar o para sumar.
  const elegibles = new Set(cruce?.estado === 'elegir' ? cruce.candidatos.map((p) => p.id) : [])
  const lista: PagoReciente[] = [
    ...(recientes?.lista ?? []),
    ...(cruce?.estado === 'elegir' ? cruce.candidatos.filter((p) => !recientes?.lista.some((x) => x.id === p.id)).map((p) => ({ ...p, coincide: true })) : []),
  ]
  const suma = (sumando ?? []).reduce((s, id) => s + (lista.find((p) => p.id === id)?.monto ?? 0), 0)
  const falta = Math.round((monto - suma) * 100) / 100
  const completa = !!sumando && sumando.length > 0 && Math.abs(falta) <= TOLERANCIA_TRANSFERENCIA
  const otraLista = !!otra && !!otra.titular && otra.banco.trim().length >= 2
  return (
    <Notice tone="warning">
      <div style={{ display: 'grid', gap: space[2] }}>
        <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ flex: 1, minWidth: 220 }}>
            Transferencia pendiente de {plata(monto)} · venta {numeroProvisorio(venta.id)} de las {hora(venta.creada_en)}
          </b>
          {onSeguir && !seguro && (
            <Button size="sm" variant="outline" onClick={onSeguir}>
              Seguir vendiendo mientras llega
            </Button>
          )}
          {seguro ? (
            <>
              <span style={{ fontSize: font.sm }}>
                ¿Cancelar la venta? No se cobra.
                {venta.total > monto && <b> Devolver lo cobrado aparte ({plata(venta.total - monto)}).</b>}
              </span>
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
          {cruce?.estado === 'sin_cuenta'
            ? 'La venta se finaliza y sale el ticket cuando confirmás la transferencia.'
            : 'La venta se finaliza y sale el ticket cuando la transferencia aparece en Mercado Pago. No alcanza con el comprobante del teléfono.'}
          {venta.total !== monto && ` El resto (${plata(venta.total - monto)}) se cobra aparte.`}
        </span>
        {/* Bruno, 12-oct: las tres salidas cuando la transferencia ⛔ llega justa. */}
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          {!sumando && cruce?.estado !== 'sin_cuenta' && (
            <Button size="sm" variant="outline" disabled={!!trabajando} onClick={empezarASumar}>
              Completar con otro cobro
            </Button>
          )}
          {!otra && titularesDe(reglas).length > 0 && cruce?.estado !== 'sin_cuenta' && (
            <Button size="sm" variant="outline" disabled={!!trabajando} onClick={() => { setSumando(null); setOtra({ titular: null, banco: '' }) }}>
              Transfirió a otra cuenta
            </Button>
          )}
          {onCambiarPago && (
            <Button size="sm" variant="outline" loading={trabajando === 'cambiar'} disabled={!!trabajando} onClick={() => terminar('cambiar', () => onCambiarPago(venta))}>
              Cambiar forma de pago
            </Button>
          )}
        </div>
        {otra && (
          <div style={{ display: 'grid', gap: space[2], padding: space[2], border: `1px solid ${color.line2}`, borderRadius: radius.md, background: color.surface }}>
            <span style={{ fontSize: font.sm, fontWeight: weight.semibold }}>¿A nombre de quién está la cuenta a la que transfirió?</span>
            <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
              {titularesDe(reglas).map((t) => (
                <Button key={t.id} size="sm" variant={otra.titular === t.id ? 'solid' : 'outline'} onClick={() => setOtra({ ...otra, titular: t.id })}>
                  {t.nombre}
                </Button>
              ))}
            </div>
            <Field label="Banco">
              <Input value={otra.banco} placeholder="Galicia, Santander, Brubank…" onChange={(e) => setOtra({ ...otra, banco: e.target.value })} />
            </Field>
            <span style={{ fontSize: font.xs, color: color.mut }}>La venta se confirma ya y les llega un mail a Darío y Bruno para que verifiquen que entró.</span>
            <div style={{ display: 'flex', gap: space[2] }}>
              <Button
                size="sm"
                tone="success"
                disabled={!otraLista || !!trabajando}
                loading={trabajando === 'otra'}
                onClick={() =>
                  terminar('otra', async () => {
                    const r = await confirmarOtraCuenta(venta.id, otra.titular!, otra.banco.trim())
                    onLlego(r.venta)
                  })
                }
              >
                Validar transferencia
              </Button>
              <Button size="sm" variant="outline" onClick={() => setOtra(null)}>
                Volver
              </Button>
            </div>
          </div>
        )}
        {sumando && (
          <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', fontSize: font.sm }}>
            <b style={{ fontVariantNumeric: 'tabular-nums' }}>
              Elegidos {plata(suma)} · {falta > 0 ? `falta ${plata(falta)}` : falta < 0 ? `sobra ${plata(-falta)}` : 'completo'}
            </b>
            <Button
              size="sm"
              tone="success"
              disabled={!completa || !!trabajando}
              loading={trabajando === 'varios'}
              onClick={() =>
                terminar('varios', async () => {
                  const r = await confirmarVarios(venta.id, sumando)
                  onLlego(r.venta)
                })
              }
            >
              Confirmar con {sumando.length === 1 ? 'este cobro' : `estos ${sumando.length} cobros`}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { verTodos.current = false; setSumando(null) }}>
              Volver
            </Button>
          </div>
        )}
        {cruce?.estado === 'elegir' && !sumando && <span>{cruce.motivo}</span>}
        {recientes && (
          <div style={{ display: 'grid', gap: space[1] }}>
            <span style={{ fontSize: font.sm, fontWeight: weight.semibold }}>
              Últimos pagos en Mercado Pago{recientes.cuenta ? ` (${recientes.cuenta})` : ''}
            </span>
            {lista.length === 0 && <span style={{ fontSize: font.sm, color: color.mut }}>Todavía no entró ningún pago.</span>}
            {lista.map((p) => {
              const despues = Date.parse(p.cuando) >= Date.parse(venta.creada_en)
              const elegido = !!sumando && sumando.includes(p.id)
              return (
                <div key={p.id} style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', fontSize: font.sm, color: p.coincide || elegido ? color.ink : color.mut }}>
                  <span style={{ fontWeight: p.coincide || elegido ? weight.heavy : weight.semibold, fontVariantNumeric: 'tabular-nums' }}>{plata(p.monto)}</span>
                  <span>a las {hora(p.cuando)}</span>
                  <span>{TEXTO_ORIGEN[p.origen] ?? p.origen}</span>
                  {/* A5: para compararlo con el comprobante de la clienta (MP ⛔ dice quién transfirió). */}
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>operación ····{String(p.id).slice(-4)}</span>
                  {p.coincide && !despues && !sumando && !elegibles.has(p.id) && <Badge tone="neutral">de antes de la venta</Badge>}
                  {p.coincide && !sumando && <Badge tone={p.diferencia ? 'warning' : 'success'}>{textoDiferenciaPago(p.diferencia)}</Badge>}
                  {p.coincide && !sumando && elegibles.has(p.id) && (
                    <Button size="sm" tone="success" loading={trabajando === p.id} disabled={!!trabajando} onClick={() => elegir(p.id)}>
                      Elegir
                    </Button>
                  )}
                  {sumando && (
                    <Button size="sm" variant={elegido ? 'solid' : 'outline'} disabled={!!trabajando} onClick={() => setSumando(elegido ? sumando.filter((x) => x !== p.id) : [...sumando, p.id])}>
                      {elegido ? 'Sacar' : 'Sumar'}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {(cruce?.estado === 'sin_cuenta' || cruce?.estado === 'invalido') && <span>{cruce.motivo}</span>}
        {/* V4 (Bruno, 12-oct): la tienda sin cuenta de MP conectada (BDI) espera igual y la cajera la confirma. */}
        {cruce?.estado === 'sin_cuenta' && (
          <div style={{ display: 'flex', gap: space[2], alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field label="N° de operación (opcional)">
              <Input value={operacion} onChange={(e) => setOperacion(e.target.value)} autoComplete="off" style={{ width: 200 }} />
            </Field>
            <Button
              size="sm"
              tone="success"
              loading={trabajando === 'confirmada'}
              disabled={!!trabajando}
              onClick={() => terminar('confirmada', async () => onLlego((await confirmarTransferencia(venta.id, operacion.trim())).venta))}
            >
              Transferencia confirmada
            </Button>
          </div>
        )}
        {error && <span style={{ color: color.danger }}>{error}</span>}
        {errorAccion && <span style={{ color: color.danger }}>{errorAccion}</span>}
      </div>
    </Notice>
  )
}

/** Lo que dice el pago al lado del monto: «monto exacto», o cuánto de más o de menos (la tolerancia, Bruno 12-oct). */
export const textoDiferenciaPago = (d: number) => (!d ? 'monto exacto' : d < 0 ? `${plata(-d)} de menos` : `${plata(d)} de más`)

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

const ESTADO_VENTA: Record<string, { texto: string; tono: 'success' | 'danger' | 'warning' | 'neutral' }> = {
  en_gn: { texto: 'En Gestión Nube', tono: 'success' },
  en_erp: { texto: 'En el ERP', tono: 'success' },
  borrador: { texto: 'Pendiente en GN', tono: 'danger' },
  enviando: { texto: 'Pendiente en GN', tono: 'danger' },
  error: { texto: 'Pendiente en GN', tono: 'danger' },
  esperando_pago: { texto: 'Esperando transferencia', tono: 'warning' },
  cancelada: { texto: 'Cancelada', tono: 'neutral' },
  descartada: { texto: 'Descartada', tono: 'neutral' },
}

/** Lo hecho a mano y cómo se cobró, en palabras: la línea chica debajo del estado y el resumen. */
function marcasDe(v: Venta): string[] {
  const am = v.a_mano
  const c = v.confirmacion
  return [
    // B5: lo hecho a mano, a la vista. B2/B3: cómo se resolvió.
    am && am.precios > 0 && `precio bajado ${plata(am.precios)}`,
    am && (am.venta > 0 || am.prendas > 0) && `descuento a mano ${plata(am.venta + am.prendas)}`,
    v.resolucion?.tipo === 'a_mano' && `cargada a mano en GN (${v.resolucion.por ?? ''})`,
    v.resolucion?.tipo === 'descartada' && `descartada: «${v.resolucion.nota}»`,
    v.mp_cruce === 'admin' && `transferencia confirmada a mano (${c?.por ?? 'admin'})`,
    // Bruno, 12-oct: la transferencia que ⛔ llegó justa.
    v.mp_cruce === 'varios' && `${c?.cobros?.length ?? 'varios'} cobros de Mercado Pago`,
    v.mp_cruce === 'otra_cuenta' && `transferencia a ${c?.titular ?? 'otra cuenta'}${c?.banco ? ` (${c.banco})` : ''}${c?.mail?.error ? ' · el mail no salió' : ''}`,
    v.mp_diferencia ? `transferencia: ${textoDiferenciaPago(v.mp_diferencia)}` : false,
    v.cancelada_motivo === 'cambio_pago' && 'cambió la forma de pago',
  ].filter(Boolean) as string[]
}

/** El estado como se lee en la lista: una venta del ERP (Stunned) que ⛔ llegó está pendiente en el ERP, ⛔ en GN. */
const estadoDeVenta = (v: Venta) => {
  const e = ESTADO_VENTA[v.estado] ?? { texto: v.estado, tono: 'neutral' as const }
  return v.destino === 'erp' && e.texto === 'Pendiente en GN' ? { ...e, texto: 'Pendiente en el ERP' } : e
}
/** Las ventas anuladas del turno que ⛔ suman, con el número de su sistema (GN o ERP). */
function Anuladas({ donde, lista }: { donde: string; lista: NonNullable<ResumenTurno['anuladasGN']> }) {
  if (!lista.length) return null
  const numero = (v: (typeof lista)[number]) => { const n = numeroDeLaVenta({ gn_number: v.gn_number, erp_numero: v.erp_numero }); return n != null ? `#${n}` : numeroProvisorio(v.id) }
  return <Notice tone="warning">Anuladas en {donde}: {lista.map(numero).join(' · ')} ({plata(lista.reduce((t, v) => t + v.total, 0))}). No suman a la caja.</Notice>
}

const numeroDeVenta = (v: Venta) => (numeroDeLaVenta(v) != null ? `#${numeroDeLaVenta(v)}` : `Provisoria ${numeroProvisorio(v.id)}`)

/** El resumen de una venta (Bruno, 12-oct): qué se llevó, cómo pagó y quién la cobró, para identificarla rápido. */
function ResumenVenta({ venta: v, nombreCuenta, onVolver, onReimprimir, onTicketCambio }: { venta: Venta; nombreCuenta: (id: number) => string; onVolver: () => void; onReimprimir?: () => void; onTicketCambio?: () => void }) {
  const e = estadoDeVenta(v)
  const marcas = marcasDe(v)
  const fila: React.CSSProperties = { display: 'flex', gap: space[3], justifyContent: 'space-between', fontSize: font.base }
  const der: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
        <Button size="sm" variant="outline" onClick={onVolver}>
          <Icono nombre="atras" size={14} /> Ventas
        </Button>
        <b style={{ flex: 1, fontSize: font.lg, fontVariantNumeric: 'tabular-nums' }}>
          {numeroDeVenta(v)} · {hora(v.creada_en)}
        </b>
        <Badge tone={e.tono}>{e.texto}</Badge>
        {onReimprimir && (
          <Button size="sm" variant="outline" onClick={onReimprimir} title="Reimprimir ticket">
            <Icono nombre="impresora" size={16} /> Reimprimir
          </Button>
        )}
        {onTicketCambio && (
          <Button size="sm" variant="outline" onClick={onTicketCambio} title="Sin precios, para regalo">
            Ticket de cambio
          </Button>
        )}
      </div>
      <div style={{ display: 'grid', gap: space[1] }}>
        {(v.renglones ?? []).map((r, i) => (
          <div key={i} style={fila}>
            <span>
              {r.cantidad} × <b>{r.nombre ?? `Producto ${r.product_id}`}</b>
              {r.talle ? <span style={{ color: color.mut }}> · {r.talle}</span> : null}
              {r.promos?.length ? <span style={{ color: color.successInk }}> · {r.promos.join(' · ')}</span> : null}
              {r.precio_lista != null && r.precio_lista !== r.precio && <span style={{ color: color.warningInk }}> · etiqueta {plata(r.precio_lista)}</span>}
            </span>
            <span style={der}>{plata(r.importe ?? r.cantidad * r.precio)}</span>
          </div>
        ))}
        {!v.renglones?.length && <span style={{ color: color.mut }}>La venta no tiene las prendas guardadas.</span>}
      </div>
      <div style={{ display: 'grid', gap: space[1], borderTop: `1px solid ${color.line}`, paddingTop: space[2] }}>
        {v.subtotal !== v.total && (
          <div style={{ ...fila, color: color.mut }}>
            <span>Subtotal</span>
            <span style={der}>{plata(v.subtotal)}</span>
          </div>
        )}
        {v.pagos.map((p, i) => (
          <div key={i} style={fila}>
            <span>{nombreCuenta(p.cuenta)}</span>
            <span style={der}>{plata(p.monto)}</span>
          </div>
        ))}
        <div style={{ ...fila, fontWeight: weight.heavy }}>
          <span>Total</span>
          <span style={der}>{plata(v.total)}</span>
        </div>
        {v.paga_con != null && v.paga_con > 0 && (
          <div style={{ ...fila, color: color.mut }}>
            <span>Pagó con</span>
            <span style={der}>{plata(v.paga_con)}</span>
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gap: 2, fontSize: font.sm, color: color.ink2 }}>
        <span>Cobró: {v.usuario ?? '—'}</span>
        {v.email && <span>Mail de la clienta: {v.email}</span>}
        {marcas.length > 0 && <span style={{ color: color.warningInk }}>{marcas.join(' · ')}</span>}
      </div>
    </div>
  )
}

/**
 * B1 (auditoría, 11-oct): las ventas del turno, de la más nueva a la más vieja, con «Reimprimir».
 * Antes sólo quedaba la última, en memoria. La que espera la transferencia o se canceló ⛔ tiene ticket.
 * 🔑 También en la PESTAÑA (Bruno, 11-oct): el turno abierto y cada uno de «Últimos turnos» (`turnoId`),
 * sin «Reimprimir» —el ticket se arma en el POS, con la impresora del local—.
 * Bruno, 12-oct: «Reimprimir» es la impresora, las PROVISORIAS (sin número de GN) van en su sección abajo, y
 * el ojo abre el resumen de la venta (en el mismo modal: dos modales apilados cerrarían juntos con Escape).
 */
const CLAVE_PROVISORIAS = 'caja:ventas:provisorias-abiertas'

export function VentasDelTurno({ nombreCuenta, onReimprimir, onTicketCambio, onCerrar, turnoId, titulo = 'Ventas' }: { nombreCuenta: (id: number) => string; /** Sin él, ⛔ hay «Reimprimir». */ onReimprimir?: (v: Venta) => void; /** El ticket de cambio solo (regalo); sin él, ⛔ está. */ onTicketCambio?: (v: Venta) => void; onCerrar: () => void; /** Sin él, el turno abierto. */ turnoId?: string; titulo?: string }) {
  const [ventas, setVentas] = useState<Venta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [viendo, setViendo] = useState<Venta | null>(null)
  // Las provisorias arrancan plegadas y quedan como las dejó la cajera (Bruno, 12-oct).
  // El modal se abre con un click ⇒ ⛔ se renderiza en el servidor y se lee el disco al montar.
  const [verProvisorias, setVerProvisorias] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_PROVISORIAS) === '1'
    } catch {
      return false /* sin localStorage: plegadas */
    }
  })
  function plegarProvisorias() {
    const abiertas = !verProvisorias
    setVerProvisorias(abiertas)
    try {
      localStorage.setItem(CLAVE_PROVISORIAS, abiertas ? '1' : '0')
    } catch {
      /* sin localStorage: vale hasta cerrar */
    }
  }
  useEffect(() => {
    let vivo = true
    leerVentasTurno(turnoId)
      .then((r) => vivo && setVentas(r.ventas))
      .catch((e) => vivo && setError((e as Error).message))
    return () => {
      vivo = false
    }
  }, [turnoId])
  const th: React.CSSProperties = { textAlign: 'left', padding: `${space[1]}px ${space[2]}px`, color: color.mut, fontWeight: weight.semibold, fontSize: font.sm, borderBottom: `1px solid ${color.line}` }
  const td: React.CSSProperties = { padding: `${space[2]}px`, borderBottom: `1px solid ${color.line}`, fontSize: font.base, verticalAlign: 'middle' }
  const der: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const cobradas = (ventas ?? []).filter((v) => v.estado !== 'cancelada' && v.estado !== 'esperando_pago' && v.estado !== 'descartada')
  const conTicket = (v: Venta) => v.estado !== 'cancelada' && v.estado !== 'esperando_pago' && v.estado !== 'descartada'
  const firmes = (ventas ?? []).filter((v) => numeroDeLaVenta(v) != null)
  const provisorias = (ventas ?? []).filter((v) => numeroDeLaVenta(v) == null)

  const tabla = (lista: Venta[]) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Hora</th>
            <th style={th}>Venta</th>
            <th style={{ ...th, ...der }}>Prendas</th>
            <th style={th}>Forma de pago</th>
            <th style={{ ...th, ...der }}>Total</th>
            <th style={th}>Estado</th>
            <th style={th} />
          </tr>
        </thead>
        <tbody>
          {lista.map((v) => {
            const e = estadoDeVenta(v)
            const prendas = (v.renglones ?? []).reduce((t, r) => t + r.cantidad, 0)
            const marcas = marcasDe(v)
            return (
              <tr key={v.id}>
                <td style={td}>{hora(v.creada_en)}</td>
                <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{numeroDeVenta(v)}</td>
                <td style={{ ...td, ...der }}>{prendas || '—'}</td>
                <td style={td}>{[...new Set(v.pagos.map((p) => nombreCuenta(p.cuenta)))].join(' + ')}</td>
                <td style={{ ...td, ...der, fontWeight: weight.semibold }}>{plata(v.total)}</td>
                <td style={td}>
                  <Badge tone={e.tono}>{e.texto}</Badge>
                  {marcas.length > 0 && <div style={{ fontSize: font.xs, color: color.warningInk, marginTop: 2 }}>{marcas.join(' · ')}</div>}
                </td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <Button size="sm" variant="ghost" aria-label="Ver la venta" title="Ver la venta" onClick={() => setViendo(v)}>
                    <Icono nombre="tn-visibilidad" size={16} />
                  </Button>
                  {onReimprimir && conTicket(v) && (
                    <Button size="sm" variant="ghost" aria-label="Reimprimir ticket" title="Reimprimir ticket" onClick={() => onReimprimir(v)}>
                      <Icono nombre="impresora" size={16} />
                    </Button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <Modal abierto onCerrar={onCerrar} titulo={titulo} ancho="xl">
      {error && <Notice tone="danger">{error}</Notice>}
      {!ventas && !error && <span style={{ color: color.mut }}>Leyendo las ventas…</span>}
      {ventas && !ventas.length && <span style={{ color: color.mut }}>Sin ventas en esta caja.</span>}
      {viendo && (
        <ResumenVenta
          venta={viendo}
          nombreCuenta={nombreCuenta}
          onVolver={() => setViendo(null)}
          onReimprimir={onReimprimir && conTicket(viendo) ? () => onReimprimir(viendo) : undefined}
          onTicketCambio={onTicketCambio && conTicket(viendo) ? () => onTicketCambio(viendo) : undefined}
        />
      )}
      {!viendo && ventas && ventas.length > 0 && (
        <div style={{ display: 'grid', gap: space[2] }}>
          <span style={{ fontSize: font.sm, color: color.ink2 }}>
            {cobradas.length === 1 ? '1 venta cobrada' : `${cobradas.length} ventas cobradas`} · {plata(cobradas.reduce((t, v) => t + v.total, 0))}
          </span>
          {firmes.length > 0 ? tabla(firmes) : <span style={{ color: color.mut, fontSize: font.sm }}>Ninguna venta con número de Gestión Nube todavía.</span>}
          {provisorias.length > 0 && (
            <div style={{ display: 'grid', gap: space[1], marginTop: space[3] }}>
              <button
                type="button"
                onClick={plegarProvisorias}
                aria-expanded={verProvisorias}
                style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: space[1], fontSize: font.sm, fontWeight: weight.semibold, color: color.ink2 }}
              >
                <span aria-hidden style={{ display: 'inline-block', width: 12 }}>{verProvisorias ? '▾' : '▸'}</span>
                Provisorias ({provisorias.length})
              </button>
              {verProvisorias && (
                <>
                  <span style={{ fontSize: font.xs, color: color.mut }}>Sin número de Gestión Nube: esperan la transferencia, no llegaron a GN, o se cancelaron.</span>
                  {tabla(provisorias)}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

export function Pendientes({ ventas, onCambio, admin = false, esMio = false }: { ventas: Venta[]; onCambio: () => void; /** B2: descartar lo hace un admin. */ admin?: boolean; /** B2: «cargada a mano» también la cuenta que tiene la caja abierta. */ esMio?: boolean }) {
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resolviendo, setResolviendo] = useState<{ id: string; como: 'a_mano' | 'descartar' } | null>(null)
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
        {ventas.map((v) => {
          const rechazada = v.estado === 'error' && v.reintentable === false
          return (
            <div key={v.id} style={{ display: 'grid', gap: space[1] }}>
              <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', fontSize: font.sm }}>
                <span style={{ fontFamily: 'monospace' }}>{numeroProvisorio(v.id)}</span>
                <span>{plata(v.total)}</span>
                <span style={{ color: color.mut }}>{new Date(v.creada_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })}</span>
                <span style={{ flex: 1, minWidth: 200 }}>{v.ultimo_error ?? (v.estado === 'enviando' ? 'mandándose…' : '')}</span>
                {rechazada ? (
                  <>
                    {/* B2 (auditoría, 11-oct): la rechazada quedaba en rojo para siempre. */}
                    {(admin || esMio) && (
                      <Button size="sm" variant="outline" onClick={() => setResolviendo({ id: v.id, como: 'a_mano' })}>
                        Cargada a mano en GN
                      </Button>
                    )}
                    {admin && (
                      <Button size="sm" variant="outline" tone="danger" onClick={() => setResolviendo({ id: v.id, como: 'descartar' })}>
                        Descartar
                      </Button>
                    )}
                    {!admin && !esMio && <Badge tone="danger">Hay que revisarla a mano</Badge>}
                  </>
                ) : (
                  <Button size="sm" variant="outline" loading={trabajando === v.id} onClick={() => reintentar(v.id)}>
                    Reintentar
                  </Button>
                )}
              </div>
              {resolviendo?.id === v.id && (
                <ResolverVenta
                  venta={v}
                  como={resolviendo.como}
                  onCerrar={() => setResolviendo(null)}
                  onListo={() => {
                    setResolviendo(null)
                    onCambio()
                  }}
                />
              )}
            </div>
          )
        })}
        {error && <span>{error}</span>}
      </div>
    </Notice>
  )
}

/**
 * B2: resolver una venta que GN RECHAZÓ. «Cargada a mano»: se cargó en GN a mano y acá queda con ese
 * número (sigue sumando al turno: la clienta pagó). «Descartar»: ⛔ se cobró (deja de sumar). Las dos con nota.
 */
function ResolverVenta({ venta, como, onCerrar, onListo }: { venta: Venta; como: 'a_mano' | 'descartar'; onCerrar: () => void; onListo: () => void }) {
  const [numero, setNumero] = useState('')
  const [nota, setNota] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const n = Number(numero.replace(/\D/g, ''))
  const listo = nota.trim().length >= 3 && (como === 'descartar' || n > 0)
  async function guardar() {
    setTrabajando(true)
    setError(null)
    try {
      await resolverVenta(venta.id, como, nota.trim(), como === 'a_mano' ? n : undefined)
      onListo()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTrabajando(false)
    }
  }
  return (
    <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', fontSize: font.sm, paddingLeft: space[3] }}>
      {como === 'a_mano' ? (
        <Input value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="Nº de venta en GN" aria-label="Número de la venta en Gestión Nube" style={{ width: 150 }} />
      ) : (
        <span>
          La venta deja de sumar a la caja ({plata(venta.total)}).
        </span>
      )}
      <Input value={nota} onChange={(e) => setNota(e.target.value)} autoComplete="off" placeholder={como === 'a_mano' ? 'Qué pasó' : 'Por qué se descarta'} aria-label="Nota" style={{ width: 240 }} />
      <Button size="sm" tone={como === 'descartar' ? 'danger' : 'brand'} loading={trabajando} disabled={!listo} onClick={guardar}>
        {como === 'a_mano' ? 'Guardar' : 'Descartar venta'}
      </Button>
      <Button size="sm" variant="outline" onClick={onCerrar}>
        Volver
      </Button>
      {error && <span style={{ color: color.danger }}>{error}</span>}
    </div>
  )
}

/**
 * B3 (auditoría, 11-oct): sólo admin, en la pestaña. La transferencia que el cruce ⛔ ve nunca (la de Caja
 * Gerencia cae en la cuenta de un particular) se confirma A MANO con el comprobante: la venta sale a GN y
 * el ticket lo imprime el POS, que la está siguiendo.
 */
export function TransferenciasEnEspera({ ventas, onCambio }: { ventas: Venta[]; onCambio: () => void }) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const [comprobante, setComprobante] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!ventas.length) return null
  async function confirmar(id: string) {
    setTrabajando(true)
    setError(null)
    try {
      await confirmarTransferencia(id, comprobante.trim())
      setAbierta(null)
      setComprobante('')
      onCambio()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTrabajando(false)
    }
  }
  return (
    <Notice tone="warning">
      <div style={{ display: 'grid', gap: space[2] }}>
        <b>Transferencias en espera: {ventas.length}</b>
        <span style={{ fontSize: font.sm }}>Se siguen en el POS (ticket al llegar). Si la transferencia no aparece en Mercado Pago (por ejemplo, fue a Caja Gerencia), se confirma a mano con el comprobante.</span>
        {ventas.map((v) => (
          <div key={v.id} style={{ display: 'grid', gap: space[1], fontSize: font.sm }}>
            <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'monospace' }}>{numeroProvisorio(v.id)}</span>
              <span>{plata(v.espera_monto ?? v.total)}</span>
              <span style={{ color: color.mut }}>{hora(v.creada_en)}{v.usuario ? ` · ${v.usuario}` : ''}</span>
              {abierta !== v.id && (
                <Button size="sm" variant="outline" onClick={() => { setAbierta(v.id); setComprobante(''); setError(null) }}>
                  Confirmar a mano
                </Button>
              )}
            </div>
            {abierta === v.id && (
              <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', paddingLeft: space[3] }}>
                <Input value={comprobante} onChange={(e) => setComprobante(e.target.value)} autoComplete="off" placeholder="Nº de operación del comprobante" aria-label="Comprobante" style={{ width: 260 }} />
                <Button size="sm" tone="success" loading={trabajando} disabled={comprobante.trim().length < 4} onClick={() => confirmar(v.id)}>
                  Validar transferencia
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAbierta(null)}>
                  Volver
                </Button>
              </div>
            )}
          </div>
        ))}
        {error && <span style={{ color: color.danger }}>{error}</span>}
      </div>
    </Notice>
  )
}

/**
 * Un descuento a mano: % o $ (Bruno, 4-oct). Vacío = sin descuento. El tope (⛔ más que el importe)
 * lo pone el núcleo, y la pantalla muestra su error.
 */
/**
 * El mail del ticket con los botones de dominio (Bruno, 13-oct: «para simplificar la carga»). Lo usan el
 * pie del pedido y el cobro: un mail a medio escribir apaga «Finalizar venta» / «Validar transferencia», y
 * en el cobro se corrige ahí mismo o se cobra «Sin mail» (⛔ hay que volver al pedido).
 */
export function CampoMail({ valor, onCambio, sinMail = false }: { valor: string; onCambio: (m: string) => void; /** El botón «Sin mail» (el cobro). */ sinMail?: boolean }) {
  const ok = mailOk(valor)
  return (
    <div style={{ display: 'grid', gap: space[1] }}>
      <Input type="email" autoComplete="off" spellCheck={false} value={valor} invalid={!ok} onChange={(e) => onCambio(e.target.value)} placeholder="nombre@mail.com" />
      <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap' }}>
        {DOMINIOS_MAIL.map((d) => (
          <Button key={d} variant="outline" size="sm" onClick={() => onCambio(completarMail(valor, d))}>
            @{d}
          </Button>
        ))}
        {sinMail && valor.trim() && (
          <Button variant="ghost" size="sm" onClick={() => onCambio('')}>
            Sin mail
          </Button>
        )}
      </div>
    </div>
  )
}

export function CampoRebaja({ valor, onCambio, chico = false }: { valor: Rebaja | null; onCambio: (rb: Rebaja | null) => void; /** El del renglón del pedido: más angosto. */ chico?: boolean }) {
  const [texto, setTexto] = useState<string | null>(null)
  // Robustez (11-oct): el %/$ se elige ANTES de escribir. Arrancaba apagado y 5000 se tomaba como 5000 %.
  const [tipoVacio, setTipoVacio] = useState<Rebaja['tipo']>('pct')
  const tipo = valor?.tipo ?? tipoVacio
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
        style={chico ? { width: 90, height: 28, textAlign: 'right', fontSize: font.base } : { width: 100, textAlign: 'right' }}
        aria-label="Descuento"
      />
      <Select
        value={tipo}
        onChange={(e) => {
          const t = e.target.value as Rebaja['tipo']
          setTipoVacio(t)
          if (valor) onCambio({ ...valor, tipo: t })
          else if (texto != null) fijar(texto, t)
        }}
        style={chico ? { width: 54, height: 30 } : { width: 64 }}
        aria-label="En % o en $"
      >
        <option value="pct">%</option>
        <option value="pesos">$</option>
      </Select>
    </div>
  )
}

/** Una pregunta de Sí/No del cobro con tarjeta de crédito: un control segmentado sobre fondo gris. */
export function SiNo({ pregunta, valor, onCambio }: { pregunta: string; valor: boolean | null; onCambio: (v: boolean) => void }) {
  const opcion = (v: boolean, texto: string) => {
    const activa = valor === v
    return (
      <button
        type="button"
        aria-pressed={activa}
        onClick={() => onCambio(v)}
        style={{ height: 30, minWidth: 48, padding: `0 ${space[3]}px`, border: 0, borderRadius: radius.sm, background: activa ? color.brandSolid : 'transparent', color: activa ? '#fff' : color.ink2, fontWeight: weight.semibold, fontSize: font.base, cursor: 'pointer' }}
      >
        {texto}
      </button>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[2] + 2, flexWrap: 'wrap', fontSize: font.md, fontWeight: weight.semibold, color: color.ink2, padding: `${space[2]}px ${space[3]}px`, background: color.bg, borderRadius: radius.md }}>
      <span>{pregunta}</span>
      <div role="group" aria-label={pregunta} style={{ display: 'inline-flex', gap: 2, padding: 2, background: color.surface, border: `1px solid ${color.line2}`, borderRadius: radius.md }}>
        {opcion(true, 'Sí')}
        {opcion(false, 'No')}
      </div>
    </div>
  )
}


export const horaAr = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
export const diaAr = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })
export { textoDiferencia }

/** Un dato del turno: rótulo chico arriba, el número grande abajo, en su color. */
export function Dato({ rotulo, valor, tono = 'neutral', detalle }: { rotulo: string; valor: React.ReactNode; tono?: 'neutral' | 'brand' | 'success' | 'danger' | 'warning'; detalle?: React.ReactNode }) {
  const tinta = { neutral: color.ink, brand: color.brand, success: color.successInk, danger: color.dangerInk, warning: color.warningInk }[tono]
  return (
    <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: `${space[3]}px ${space[3] + 2}px`, display: 'grid', gap: space[0.5], minWidth: 0 }}>
      <span style={{ fontSize: font.sm, color: color.mut, fontWeight: weight.semibold }}>{rotulo}</span>
      <span style={{ fontSize: font.xl + 2, fontWeight: weight.heavy, letterSpacing: '-0.01em', color: tinta, fontVariantNumeric: 'tabular-nums' }}>{valor}</span>
      {detalle && <span style={{ fontSize: font.sm, color: color.mut }}>{detalle}</span>}
    </div>
  )
}
/** La diferencia del efectivo, en su color (prototipo): cuadrado verde, hasta $1.000 ámbar, más rojo. */
const tonoDiferencia = (d: number) => (Math.abs(d) < 0.005 ? 'success' : Math.abs(d) <= 1000 ? 'warning' : 'danger') as 'success' | 'warning' | 'danger'
const tintaDiferencia = (d: number) => (Math.abs(d) < 0.005 ? color.successInk : Math.abs(d) <= 1000 ? color.warningInk : color.dangerInk)
const grillaDatos: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: space[2] + 2 }
/** Las tablas chicas de la pestaña: forma de pago y últimos turnos. */
const th: React.CSSProperties = { textAlign: 'left', fontSize: font.xs, textTransform: 'uppercase', letterSpacing: '0.06em', color: color.mut, fontWeight: weight.semibold, padding: `0 ${space[2]}px ${space[1.5]}px 0`, borderBottom: `1px solid ${color.line}`, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: `${space[2]}px ${space[2]}px ${space[2]}px 0`, borderBottom: `1px solid ${color.bg2}`, whiteSpace: 'nowrap' }
const der: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

/** El turno cerrado, como lo escribe el ticket del cierre (Bruno, 13-oct). */
export const datosCierre = (t: Turno): DatosCierre => ({
  ...t,
  marca: MARCA_CAJA.nombre,
  // Por forma de pago (13-oct); un cierre guardado antes, por cuenta como estaba.
  formas: t.resumen?.porForma ?? t.resumen?.porCuenta ?? null,
  movimientos: t.salidas ?? null,
  codigo: codigoArqueo(storeCaja(), t.numero),
})
/** Imprime el ticket del cierre; el error vuelve como texto para el aviso de la pantalla. */
export const imprimirCierreDe = (t: Turno) => imprimirCierre(datosCierre(t), Date.now())

/** El turno que se acaba de cerrar: Esperado · Contado · Diferencia, ⛔ una frase. «Imprimir cierre» saca el ticket del turno. */
export function AvisoCierre({ t }: { t: Turno }) {
  const d = t.resumen?.diferencia ?? Number(t.contado) - Number(t.esperado)
  return (
    <SectionCard
      title={`Caja cerrada ${t.cerrado_en ? horaAr(t.cerrado_en) : ''}${codigoArqueo(storeCaja(), t.numero) ? ` · sobre ${codigoArqueo(storeCaja(), t.numero)}` : ''}`}
      actions={
        <Button size="sm" variant="outline" onClick={() => void imprimirCierreDe(t)}>
          <Icono nombre="impresora" size={16} /> Imprimir cierre
        </Button>
      }
    >
      <div style={grillaDatos}>
        <Dato rotulo="Esperado" valor={plata(Number(t.esperado))} />
        <Dato rotulo="Contado" valor={plata(Number(t.contado))} />
        <Dato rotulo="Diferencia" valor={textoDiferencia(d)} tono={tonoDiferencia(d)} />
      </div>
      <SobreDelCierre t={t} />
    </SectionCard>
  )
}

/** El sobre de la caja que se acaba de cerrar: el mismo armado que se vio al contar (`ArmadoDelSobre`). */
function SobreDelCierre({ t }: { t: Turno }) {
  const billetes = t.conteos?.cierre?.billetes
  if (!billetes || t.contado == null || !Object.values(billetes).some((n) => Number(n) > 0)) return null
  return (
    <div style={{ marginTop: space[3] }}>
      <ArmadoDelSobre conteo={billetes} fondo={Number(t.fondo)} billetes={billetesDe()} />
    </div>
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
      titulo="Abrir caja · fondo inicial"
      accion="Abrir caja"
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
  // A3 (auditoría, 11-oct): GN ⛔ contestó los cobros web ⇒ el servidor frena; cerrar igual es explícito y con nota.
  const [sinGN, setSinGN] = useState<{ total: number; conteo: Conteo | null } | null>(null)
  const { confirmar } = useConfirmar()
  // 🔑 22-oct (el martes 20 dijo «sobran $13.000»): el POS lee el turno al cargar y un cobro web cargado
  // en GN después ⛔ estaba en el esperado. Al abrir se relee GN entero; mientras, el esperado ⛔ se muestra
  // (una diferencia vieja se lee como sobra). «Consultar cobros de Gestión Nube» relee a pedido.
  const [vivo, setVivo] = useState<Turno>(turno)
  const [consultando, setConsultando] = useState(true)
  const [errConsulta, setErrConsulta] = useState<string | null>(null)
  const releer = useCallback(
    () =>
      leerTurno(false, true)
        .then((x) => {
          if (x.turno && x.turno.id === turno.id) setVivo(x.turno)
        })
        .catch((e) => setErrConsulta((e as Error).message))
        .finally(() => setConsultando(false)),
    [turno.id],
  )
  useEffect(() => {
    void releer()
  }, [releer])
  const consultar = () => {
    setConsultando(true)
    setErrConsulta(null)
    void releer()
  }
  const r = vivo.resumen
  const momento = `cierre:${turno.id}`

  async function cerrar(total: number, conteo: Conteo | null, sinCobrosGN: boolean) {
    setTrabajando(true)
    setError(null)
    try {
      const x = await cerrarTurno(turno.id, total, nota.trim(), conteo, sinCobrosGN)
      olvidarConteo(momento)
      onCerrado(x.turno)
      // El ticket del cierre sale solo (Bruno, 13-oct); si la impresora falla, queda «Imprimir cierre» en el aviso.
      imprimirCierreDe(x.turno).catch((e) => console.error('No se pudo imprimir el cierre:', e))
    } catch (e) {
      if ((e as { datos?: { sinCobrosGN?: boolean } }).datos?.sinCobrosGN) setSinGN({ total, conteo })
      setError((e as Error).message)
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <CalculadoraBilletes
      momento={momento}
      billetes={billetes}
      titulo="Cerrar caja · efectivo con el fondo"
      accion="Cerrar caja"
      tono="danger"
      aMano
      vacioApagado
      esperado={consultando ? null : (r?.efectivo.esperado ?? null)}
      fondo={Number(turno.fondo)}
      trabajando={trabajando}
      error={error}
      onCerrar={onCerrar}
      extra={
        <div style={{ display: 'grid', gap: space[1], fontSize: font.sm }}>
          <Field label={sinGN ? 'Nota (obligatoria para cerrar sin los cobros de Gestión Nube)' : 'Nota (opcional)'}>
            <Input value={nota} onChange={(e) => setNota(e.target.value)} autoComplete="off" />
          </Field>
          {consultando && <span style={{ color: color.mut }}>Consultando los cobros de Gestión Nube…</span>}
          {!consultando && r && (
            <span style={{ color: color.mut }}>
              Esperado = fondo {plata(r.efectivo.fondo)} + efectivo de la Caja {plata(r.efectivo.cobrado)}
              {!!r.efectivo.deEspera && <> + esperando transferencia {plata(r.efectivo.deEspera)}</>}
              {r.cobrosGN !== null && <> + cobrado en Gestión Nube {plata(r.efectivo.cobradoGN)}</>}
              {!!r.efectivo.cobradoERP && <> + pedidos web de Stunned (ERP) {plata(r.efectivo.cobradoERP)}</>}
              {!!r.efectivo.aportes && <> + ingresos {plata(r.efectivo.aportes)}</>}
              {!!r.efectivo.salidas && <> − salidas {plata(r.efectivo.salidas)}</>}
            </span>
          )}
          {!consultando && r && <CobrosGN r={r} />}
          {errConsulta && <span style={{ color: color.warningInk }}>No se pudo consultar Gestión Nube ({errConsulta}). Se relee al cerrar.</span>}
          <div>
            <Button size="sm" variant="outline" loading={consultando} disabled={trabajando} onClick={() => void consultar()}>
              Consultar cobros de Gestión Nube
            </Button>
          </div>
          {!!r?.esperando.length && <span style={{ color: color.warningInk }}>Transferencias en espera: {r.esperando.length}. Si llegan después, no entran en el cierre.</span>}
          {sinGN && (
            <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
              <Button size="sm" variant="outline" tone="danger" disabled={!nota.trim() || trabajando} onClick={() => void cerrar(sinGN.total, sinGN.conteo, true)}>
                Cerrar sin los cobros de Gestión Nube
              </Button>
            </div>
          )}
        </div>
      }
      onUsar={async (total, conteo) => {
        // A10 (auditoría, 11-oct): el cierre ⛔ se reabre ⇒ ⛔ en un clic. Se confirma viendo los tres números.
        const esperado = consultando ? null : (r?.efectivo.esperado ?? null)
        const dif = esperado == null ? null : Math.round((total - esperado) * 100) / 100
        const ok = await confirmar({
          titulo: 'Cerrar caja',
          mensaje: (
            <div style={{ display: 'grid', gap: space[2] }}>
              {esperado != null && <ConfirmDetalle label="Esperado" valor={plata(esperado)} />}
              <ConfirmDetalle label="Contado" valor={plata(total)} />
              {dif != null && <ConfirmDetalle label="Diferencia" valor={textoDiferencia(dif)} />}
              {total === 0 && !!esperado && <b style={{ color: color.dangerInk }}>Contado $0 contra {plata(esperado)} esperados.</b>}
              <span>El cierre queda guardado y no se reabre.</span>
            </div>
          ),
          ok: 'Cerrar caja',
          tono: 'danger',
        })
        if (ok) await cerrar(total, conteo, false)
      }}
    />
  )
}

/**
 * Cargar efectivo que SALE (un gasto, un pago, un retiro) o que ENTRA (B4: el cambio que trae alguien), con
 * su motivo. A8 (Bruno, 11-oct): lo carga la cuenta que abrió la caja o un admin (el servidor da 403).
 * 🔑 Bruno, 12-oct: DOS botones, «+ Salida» y «+ Ingreso», y adentro el motivo; en pantalla «ingreso», en
 * la base sigue `aporte`.
 */
export function SalidaModal({ tipo, onCerrar, onListo }: { tipo: 'salida' | 'aporte'; onCerrar: () => void; onListo: (t: Turno) => void }) {
  const [monto, setMonto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const montoN = aNumero(monto)
  const accion = tipo === 'aporte' ? 'Cargar ingreso' : 'Cargar salida'
  async function cargar() {
    setTrabajando(true)
    setError(null)
    try {
      const x = await sacarEfectivo(montoN as number, motivo.trim(), tipo)
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
      titulo={tipo === 'aporte' ? 'Ingreso de efectivo' : 'Salida de efectivo'}
      cerrarConFondo={false}
      pie={
        <>
          <Button variant="outline" onClick={onCerrar}>
            Volver
          </Button>
          <Button variant="solid" tone="brand" loading={trabajando} disabled={montoN == null || montoN <= 0 || !motivo.trim()} onClick={cargar}>
            {accion}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: space[3] }}>
        <Field label="Motivo">
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoComplete="off" placeholder={tipo === 'aporte' ? 'Cambio que trajo…' : 'Gasto, pago a un proveedor, retiro para gerencia…'} data-foco />
        </Field>
        <Field label="Monto">
          <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="$" />
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Modal>
  )
}

/**
 * W3b: el efectivo que entró por Gestión Nube y ⛔ por la Caja. Suma al efectivo esperado: la plata está en
 * el cajón (Bruno, 4-oct). Dos listas: las ventas hechas en el POS de GN (13-oct, las dos cajas en
 * paralelo) y los cobros de pedidos web. Desde el 29-oct, una tercera: los pedidos web de Stunned cobrados en efectivo,
 * que nacen en el ERP (`cobrosERP`).
 */
export function CobrosGN({ r }: { r: ResumenTurno }) {
  const erp = r.cobrosERP ?? []
  const avisos = [
    r.cobrosGN === null && <Notice key="gn" tone="warning">Cobros de Gestión Nube: sin leer. No suman al esperado.</Notice>,
    r.cobrosERP === null && <Notice key="erp" tone="warning">Pedidos web de Stunned (ERP): sin leer. No suman al esperado.</Notice>,
  ].filter(Boolean)
  const gn = r.cobrosGN ?? []
  const grupos = [
    { titulo: 'Ventas en efectivo en el POS de Gestión Nube', lista: gn.filter((c) => c.pos) },
    { titulo: 'Cobros en efectivo de pedidos web (en Gestión Nube)', lista: gn.filter((c) => !c.pos) },
    { titulo: 'Pedidos web de Stunned cobrados en efectivo (en el ERP)', lista: erp },
  ].filter((g) => g.lista.length)
  if (!avisos.length && !grupos.length) return null
  return (
    <div style={{ display: 'grid', gap: space[2] }}>
      {avisos}
      {grupos.map((g) => (
        <div key={g.titulo} style={{ display: 'grid', gap: space[0.5] }}>
          <span>
            {g.titulo}: {g.lista.length} · <b>{plata(g.lista.reduce((s, c) => s + c.monto, 0))}</b>
          </span>
          {g.lista.map((c) => (
            <span key={c.id} style={{ color: color.mut }}>
              {horaAr(c.en)} · {c.venta ? `venta #${c.venta}` : 'venta'}{c.tn ? ` (pedido #${c.tn})` : ''}{c.cliente ? ` · ${c.cliente}` : ''} · {plata(c.monto)}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Un movimiento de efectivo del turno (B4). El anulado queda TACHADO con quién y por qué: ⛔ se borra.
 * Anular pide el motivo; el servidor decide si esta cuenta puede (quien lo cargó, si abrió la caja, o un admin).
 */
function Movimiento({ m, puedeAnular, onCambio }: { m: SalidaTurno; puedeAnular: boolean; onCambio?: (t: Turno) => void }) {
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nombre = (m.tipo ?? 'salida') === 'aporte' ? 'Ingreso' : 'Salida'
  async function anular() {
    setTrabajando(true)
    setError(null)
    try {
      const x = await anularMovimiento(m.id, motivo.trim())
      setAnulando(false)
      onCambio?.(x.turno)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTrabajando(false)
    }
  }
  const texto = `${nombre} ${horaAr(m.creado_en)} · ${plata(m.monto)} · ${m.motivo} ${m.usuario ? `(${m.usuario})` : ''}`
  return (
    <div style={{ display: 'grid', gap: space[1] }}>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', color: color.mut }}>
        {m.anulado_en ? <s>{texto}</s> : <span>{texto}</span>}
        {m.anulado_en && <span>Anulada por {m.anulado_por ?? '—'}: «{m.anulado_motivo}»</span>}
        {!m.anulado_en && puedeAnular && onCambio && !anulando && (
          <Button size="sm" variant="ghost" onClick={() => setAnulando(true)}>
            Anular
          </Button>
        )}
      </div>
      {anulando && (
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoComplete="off" placeholder="Por qué se anula" aria-label="Por qué se anula" style={{ width: 240 }} />
          <Button size="sm" tone="danger" loading={trabajando} disabled={!motivo.trim()} onClick={anular}>
            Anular {nombre.toLowerCase()}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAnulando(false)}>
            Volver
          </Button>
          {error && <span style={{ color: color.danger }}>{error}</span>}
        </div>
      )}
    </div>
  )
}

/** Lo que hay que saber del turno abierto, en datos: lo comparten la pestaña y el POS. */
export function ResumenTurnoDatos({
  turno,
  conTabla = false,
  reglas = null,
  puedeAnular = false,
  onCambio,
}: {
  turno: Turno
  /** La pestaña muestra la tabla por cuenta a la vista; el POS, sólo en «Ver detalle». */
  conTabla?: boolean
  /** Para decir la FORMA de pago de cada cuenta (la cuenta de GN es interna); sin reglas, el nombre. */
  reglas?: Reglas | null
  /** B4: la dueña del turno o un admin ven «Anular» en cada movimiento (el servidor decide cuál). */
  puedeAnular?: boolean
  onCambio?: (t: Turno) => void
}) {
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
        <Dato
          rotulo={r.efectivo.aportes ? 'Salidas e ingresos' : 'Salidas'}
          valor={plata(r.efectivo.salidas)}
          detalle={r.efectivo.aportes ? `Ingresos ${plata(r.efectivo.aportes)}` : (() => { const n = (turno.salidas ?? []).filter((m) => !m.anulado_en && (m.tipo ?? 'salida') === 'salida').length; return n === 1 ? '1 salida' : `${n} salidas` })()}
        />
        <Dato
          rotulo={ultimoConteo ? `Último conteo ${horaAr(ultimoConteo.en)}` : 'Último conteo'}
          valor={ultimoConteo ? plata(ultimoConteo.total) : '—'}
          tono={ultimoConteo?.diferencia != null ? tonoDiferencia(ultimoConteo.diferencia) : 'neutral'}
          detalle={!ultimoConteo ? 'Sin contar todavía' : ultimoConteo.diferencia != null ? textoDiferencia(ultimoConteo.diferencia) : undefined}
        />
      </div>
      {r.esperando.length > 0 && <Notice tone="warning">Transferencias en espera: {r.esperando.length}. No suman hasta que lleguen.</Notice>}
      {r.sinGN.length > 0 && <Notice tone="warning">Cobradas sin llegar a Gestión Nube: {r.sinGN.length}. Suman a la caja.</Notice>}
      {/* A12: GN ⛔ anula por API: la venta anulada a mano allá deja de sumar acá (la plata se devolvió). */}
      {/* La del ERP (Stunned) se anula en el ERP y tiene su número (Bruno, 28-oct: decía «Anuladas en Gestión Nube: 96A141DC»). */}
      <Anuladas donde="Gestión Nube" lista={(r.anuladasGN ?? []).filter((v) => v.estado !== 'en_erp')} />
      <Anuladas donde="el ERP" lista={(r.anuladasGN ?? []).filter((v) => v.estado === 'en_erp')} />
      {r.anuladasGN === null && <Notice tone="neutral">Ventas anuladas en Gestión Nube: sin mirar. Se miran al cerrar.</Notice>}
      {/* B5 (Bruno, 11-oct): el descuento a mano y el cambio de precio son libres, pero a la vista. */}
      {!!r.aMano?.ventas && (
        <span style={{ color: color.ink2 }}>
          Hecho a mano: {r.aMano.ventas === 1 ? '1 venta' : `${r.aMano.ventas} ventas`}
          {r.aMano.venta > 0 && ` · descuento a la venta ${plata(r.aMano.venta)}`}
          {r.aMano.prendas > 0 && ` · descuento a prendas ${plata(r.aMano.prendas)}`}
          {r.aMano.precios > 0 && ` · precio bajado ${plata(r.aMano.precios)}`}
        </span>
      )}
      <CobrosGN r={r} />
      {conTabla && r.porCuenta.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Forma de pago</th>
                <th style={{ ...th, ...der }}>Cobros</th>
                <th style={{ ...th, ...der }}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {/* Por FORMA DE PAGO (Bruno, 13-oct): crédito es crédito, como el cierre de lote del posnet. */}
              {(r.porForma ?? porFormaDePago(r.porCuenta, reglas)).map((c) => (
                <tr key={c.nombre}>
                  <td style={td}>{c.nombre}</td>
                  <td style={{ ...td, ...der }}>{c.cobros}</td>
                  <td style={{ ...td, ...der }}>{plata(c.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div>
        <Button size="sm" variant="ghost" onClick={() => setVerDetalle(!verDetalle)}>
          {verDetalle ? 'Ocultar detalle' : 'Ver detalle'}
        </Button>
      </div>
      {verDetalle && (
        <div style={{ display: 'grid', gap: space[1], maxWidth: 560 }}>
          {!conTabla && r.porCuenta.map((c) => (
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
            {!!r.efectivo.cobradoERP && <span>+ Pedidos web de Stunned cobrados en efectivo (ERP) {plata(r.efectivo.cobradoERP)}</span>}
            {!!r.efectivo.deEspera && <span>+ Efectivo de ventas que esperan la transferencia {plata(r.efectivo.deEspera)}</span>}
            {!!r.efectivo.aportes && <span>+ Ingresos {plata(r.efectivo.aportes)}</span>}
            <span>− Salidas {plata(r.efectivo.salidas)}</span>
            <b>= Efectivo esperado {plata(r.efectivo.esperado)}</b>
          </div>
          {(turno.salidas ?? []).map((m) => (
            <Movimiento key={m.id} m={m} puedeAnular={puedeAnular && !turno.cerrado_en} onCambio={onCambio} />
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
  billetes,
  reglas = null,
  esMio,
  admin = false,
  antes,
  onCambio,
  onCerrado,
}: {
  turno: Turno | null
  billetes: number[]
  /** A8: la salida o el aporte los carga la cuenta que abrió la caja o un admin. */
  admin?: boolean
  /** Para la tabla del turno: la forma de pago de cada cuenta. */
  reglas?: Reglas | null
  /** Fase C: el conteo intermedio lo hace sólo la cuenta que abrió la caja (el servidor contesta 403). */
  esMio: boolean
  /** Lo que va primero en el header de la sección («Abrir POS»): un solo portal, en orden. */
  antes?: React.ReactNode
  onCambio: (t?: Turno) => void
  onCerrado: (t: Turno) => void
}) {
  const [abierto, setAbierto] = useState<null | 'abrir' | 'contar' | 'salida' | 'ingreso' | 'cerrar'>(null)
  const [cerrado, setCerrado] = useState<Turno | null>(null)

  if (!turno) {
    return (
      <>
        {/* Sin turno ⛔ hay «Abrir POS»: el POS ⛔ cobra sin turno y nadie es su dueño (`puedeUsarPOS`).
            El header lleva «Abrir turno» en outline; la acción sólida es la de la tarjeta. */}
        <HeaderAcciones>
          {antes}
          <Button variant="outline" onClick={() => setAbierto('abrir')}>
            Abrir caja
          </Button>
        </HeaderAcciones>
        {cerrado && <AvisoCierre t={cerrado} />}
        <Card padding={4} style={tarjetaTurno}>
          <div style={{ display: 'grid', justifyItems: 'start', gap: space[2], padding: space[1] }}>
            <b style={{ fontSize: font.lg + 1, color: color.ink }}>Sin caja abierta</b>
            <span style={{ color: color.mut, fontSize: font.base }}>El POS cobra con una caja abierta.</span>
            <Button tone="brand" variant="solid" onClick={() => setAbierto('abrir')}>
              Abrir caja
            </Button>
          </div>
        </Card>
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
      </>
    )
  }

  return (
    <>
      <HeaderAcciones>
        {antes}
        {esMio && (
          <Button variant="outline" onClick={() => setAbierto('contar')}>
            Contar billetes
          </Button>
        )}
        {(esMio || admin) && (
          <>
            <Button variant="outline" onClick={() => setAbierto('salida')}>
              + Salida
            </Button>
            <Button variant="outline" onClick={() => setAbierto('ingreso')}>
              + Ingreso
            </Button>
          </>
        )}
        {/* Borde neutro y texto rojo (prototipo): avisa sin competir con la acción sólida. */}
        <Button variant="outline" onClick={() => setAbierto('cerrar')} style={{ '--_fg': color.danger } as React.CSSProperties}>
          Cerrar caja
        </Button>
      </HeaderAcciones>
      <Card padding={4} style={tarjetaTurno}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[2] + 2, flexWrap: 'wrap' }}>
          <b style={{ fontSize: font.lg, color: color.ink }}>Caja abierta</b>
          <span style={{ color: color.mut, fontSize: font.base }}>desde {horaAr(turno.abierto_en)} · {turno.abierto_por ?? ''}</span>
        </div>
        <ResumenTurnoDatos turno={turno} conTabla reglas={reglas} puedeAnular={esMio || admin} onCambio={onCambio} />
      </Card>
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
    </>
  )
}

/** La tarjeta del turno, más liviana que un `SectionCard` (prototipo `.turno-card`): 16 de aire, 12 entre partes. */
const tarjetaTurno: React.CSSProperties = { display: 'grid', gap: space[3] }

/** Los turnos cerrados, en tabla (prototipo): cuándo, quién, esperado, contado y la diferencia en su color. */
export function UltimosTurnos({ ultimos, onVerVentas }: { ultimos: Turno[]; /** La lista de ventas de ESE turno (Bruno, 11-oct). */ onVerVentas?: (t: Turno) => void }) {
  const [abierto, setAbierto] = useState(false)
  if (ultimos.length === 0) return null
  return (
    <Plegable variante="tarjeta" abierto={abierto} onToggle={() => setAbierto(!abierto)} titulo="Cajas anteriores" ayuda="Las cajas cerradas: esperado, contado y diferencia del efectivo.">
      <div style={{ overflowX: 'auto', fontSize: font.base }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Cierre</th>
              <th style={th}>Cuenta</th>
              <th style={{ ...th, ...der }}>Esperado</th>
              <th style={{ ...th, ...der }}>Contado</th>
              <th style={{ ...th, ...der }}>Diferencia</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {ultimos.map((t) => {
              const d = t.resumen?.diferencia ?? Number(t.contado) - Number(t.esperado)
              return (
                <tr key={t.id} title={t.nota ? `Nota: ${t.nota}` : undefined}>
                  <td style={td}>
                    {diaAr(t.abierto_en)} {horaAr(t.abierto_en)}–{t.cerrado_en ? horaAr(t.cerrado_en) : ''}
                    {t.nota && <span style={{ color: color.mut }}> · «{t.nota}»</span>}
                  </td>
                  <td style={td}>{t.abierto_por ?? ''}</td>
                  <td style={{ ...td, ...der }}>{plata(Number(t.esperado))}</td>
                  <td style={{ ...td, ...der }}>{plata(Number(t.contado))}</td>
                  <td style={{ ...td, ...der, fontWeight: weight.bold, color: tintaDiferencia(d) }}>{textoDiferencia(d)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <span style={{ display: 'inline-flex', gap: space[1] }}>
                      <Button size="sm" variant="ghost" aria-label="Imprimir cierre" title="Imprimir el ticket del cierre" onClick={() => void imprimirCierreDe(t)}>
                        <Icono nombre="impresora" size={16} />
                      </Button>
                      {onVerVentas && (
                        <Button size="sm" variant="outline" onClick={() => onVerVentas(t)}>
                          Ventas
                        </Button>
                      )}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Plegable>
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
  que: null | 'abrir' | 'contar' | 'salida' | 'ingreso' | 'cerrar'
  turno: Turno
  billetes: number[]
  onCerrar: () => void
  onCambio: (t: Turno) => void
  onCerrado: (t: Turno) => void
}) {
  if (que === 'contar') return <ConteoModal turno={turno} billetes={billetes} onCerrar={onCerrar} onListo={onCambio} />
  if (que === 'salida' || que === 'ingreso') return <SalidaModal tipo={que === 'ingreso' ? 'aporte' : 'salida'} onCerrar={onCerrar} onListo={onCambio} />
  if (que === 'cerrar') return <CerrarTurnoModal turno={turno} billetes={billetes} onCerrar={onCerrar} onCerrado={onCerrado} />
  return null
}

/**
 * Sólo admin: los PRODUCTOS DE FERIA TRABADOS (Bruno, 5-oct). Su precio es final: en la Caja se cobran
 * sólo en efectivo o transferencia, a la cuenta de feria, sin el % de la forma de pago. Se guarda la
 * lista entera en `caja_config.reglas.feriaProductos`; la regla vive en `lib/caja/core.core.js`.
 */
export function ProductosFeria({ reglas, version, campanias = [], onGuardadas }: { reglas: Reglas; version?: string; /** Las de Liquidación: las tildadas son la feria (Bruno, 11-oct). */ campanias?: CampaniaLiq[]; onGuardadas: (r: Reglas, v?: Versiones) => void }) {
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

  async function guardarCampanias(ids: string[]) {
    setGuardando(true)
    setMsg(null)
    try {
      const r = await guardarBajadas({ feriaCampanias: ids })
      onGuardadas(r.reglas, r.versiones)
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  async function guardar(nueva: ProductoFeria[]) {
    setGuardando(true)
    setMsg(null)
    try {
      const r = await guardarBajadas({ feriaProductos: nueva, version })
      onGuardadas(r.reglas, r.versiones)
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Plegable
      variante="tarjeta"
      abierto={abierto}
      onToggle={() => setAbierto(!abierto)}
      titulo={`Productos en oferta (${new Set([...lista.map((p) => p.id), ...(reglas.feriaIdsCampania ?? [])]).size})`}
      ayuda={`${msjOferta(reglas)}. Sólo lo cambia un admin.`}
    >
      <div style={{ display: 'grid', gap: space[3], maxWidth: 640 }}>
        <CobroDeOferta reglas={reglas} onGuardadas={onGuardadas} />
        {/* 🔑 Bruno, 11-oct: la feria es la de Liquidación. Es feria todo producto con el precio de una campaña
            tildada APLICADO; al sacar la campaña, deja de serlo solo. */}
        <Field label="Campañas de Liquidación que son oferta">
          <div style={{ display: 'grid', gap: space[1] }}>
            {campanias.length === 0 && <span style={{ color: color.mut, fontSize: font.sm }}>Sin campañas en Liquidación.</span>}
            {campanias.map((c) => {
              const tildada = (reglas.feriaCampanias ?? []).includes(c.id)
              return (
                <label key={c.id} style={{ display: 'flex', gap: space[2], alignItems: 'center', fontSize: font.base }}>
                  <input
                    type="checkbox"
                    checked={tildada}
                    disabled={guardando}
                    onChange={() => void guardarCampanias(tildada ? (reglas.feriaCampanias ?? []).filter((x) => x !== c.id) : [...(reglas.feriaCampanias ?? []), c.id])}
                  />
                  <span>{c.nombre}</span>
                  <span style={{ color: color.mut, fontSize: font.sm }}>({c.estado})</span>
                </label>
              )
            })}
            {!!reglas.feriaIdsCampania?.length && <span style={{ color: color.mut, fontSize: font.sm }}>{reglas.feriaIdsCampania.length} productos con el precio de oferta aplicado.</span>}
          </div>
        </Field>
        <span style={{ fontWeight: weight.semibold, fontSize: font.sm, color: color.ink2 }}>Agregados a mano</span>
        {lista.length === 0 ? (
          <span style={{ color: color.mut, fontSize: font.sm }}>Ninguno.</span>
        ) : (
          <div style={{ display: 'grid', gap: space[1.5] }}>
            {lista.map((p) => (
              <div key={p.id} style={{ display: 'flex', gap: space[2], alignItems: 'center', border: `1px solid ${color.line}`, borderRadius: radius.md, padding: `${space[1.5]}px ${space[2] + 2}px` }}>
                <Badge tone="warning">Oferta</Badge>
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
                  <Badge tone="warning">Oferta</Badge>
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

const TEXTO_MODO: Record<ModoOferta, string> = {
  final: 'Precio final, sin el %',
  descuento: 'Con el descuento de la forma de pago',
  recargo: 'Con recargo',
  no: 'No se acepta',
}

/**
 * Cómo se cobra la oferta, por forma de pago (Bruno, 12-oct): se acepta o no, con el descuento de la forma
 * de pago o sin él, y el recargo de la tarjeta. La regla es `pagosDeMedio`/`exigirFeria` (`core.core.js`);
 * acá sólo se elige. Va a mudarse a la lista de precios del local cuando exista.
 */
/** V4: `final` y `recargo` piden la cuenta de oferta de la tienda (BDI ⛔ tiene): sin ella ⛔ se ofrecen. */
function modoPosible(m: ModoOferta, medio: Medio, reglas: Reglas): boolean {
  const md = reglas.medios
  if (!md) return false
  if (m === 'final') return medio === 'efectivo' ? md.efectivo.feria != null : medio === 'transferencia' ? md.transferencia.feria != null : false
  if (m === 'recargo') return md.tarjetaOferta != null
  return true
}

function CobroDeOferta({ reglas, onGuardadas }: { reglas: Reglas; onGuardadas: (r: Reglas, v?: Versiones) => void }) {
  const [o, setO] = useState<Oferta>(() => ofertaDe(reglas) as Oferta)
  const [recargoTxt, setRecargoTxt] = useState(() => String(ofertaDe(reglas).recargo))
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ tono: 'success' | 'danger'; texto: string } | null>(null)
  const guardada = ofertaDe(reglas) as Oferta
  const recargo = Number(recargoTxt.replace(',', '.'))
  const cambio = (['efectivo', 'transferencia', 'debito', 'credito'] as const).some((m) => o[m] !== guardada[m]) || recargo !== guardada.recargo
  async function guardar() {
    setGuardando(true)
    setMsg(null)
    try {
      const r = await guardarBajadas({ oferta: { ...o, recargo } })
      onGuardadas(r.reglas, r.versiones)
      setMsg({ tono: 'success', texto: `Guardado. ${msjOferta(r.reglas)}.` })
    } catch (e) {
      setMsg({ tono: 'danger', texto: (e as Error).message })
    } finally {
      setGuardando(false)
    }
  }
  return (
    <div style={{ display: 'grid', gap: space[2], border: `1px solid ${color.line}`, borderRadius: radius.md, padding: space[3] }}>
      <span style={{ fontWeight: weight.semibold, fontSize: font.sm, color: color.ink2 }}>Cómo se cobra la oferta</span>
      {(['efectivo', 'transferencia', 'debito', 'credito'] as const).map((medio) => (
        <div key={medio} style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ width: 150, fontSize: font.base }}>{NOMBRE_MEDIO[medio]}</span>
          <Select value={o[medio]} disabled={guardando} onChange={(e) => setO({ ...o, [medio]: e.target.value as ModoOferta })} style={{ maxWidth: 280 }} aria-label={`Oferta con ${NOMBRE_MEDIO[medio]}`}>
            {MODOS_OFERTA[medio].filter((m) => modoPosible(m, medio, reglas) || m === o[medio]).map((m) => (
              <option key={m} value={m}>
                {m === 'recargo' ? `${TEXTO_MODO.recargo} (+${recargoTxt || '?'} %)` : TEXTO_MODO[m]}
              </option>
            ))}
          </Select>
        </div>
      ))}
      <div style={{ display: 'flex', gap: space[2], alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Recargo con tarjeta (%)">
          <Input value={recargoTxt} onChange={(e) => setRecargoTxt(e.target.value)} inputMode="decimal" autoComplete="off" style={{ width: 90, textAlign: 'right' }} />
        </Field>
        <Button size="sm" loading={guardando} disabled={!cambio} onClick={guardar}>
          Guardar
        </Button>
      </div>
      <span style={{ color: color.mut, fontSize: font.sm }}>El recargo va sólo sobre los productos en oferta, a la cuenta «Feria TC» de Gestión Nube; el resto del pedido sigue con su regla.</span>
      {msg && <Notice tone={msg.tono}>{msg.texto}</Notice>}
    </div>
  )
}

/** El archivo elegido, achicado a 400 px de ancho y pasado a PNG: lo que se guarda y se imprime. */
async function logoDesdeArchivo(archivo: File): Promise<LogoTicket> {
  const url = URL.createObjectURL(archivo)
  try {
    return await logoDesdeUrl(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Una imagen (archivo local o la del logo de Tienda Nube, V4), achicada a 400 px y pasada a PNG con fondo
 * blanco. La CDN de TN contesta con CORS abierto (`crossOrigin`): sin eso el lienzo ⛔ se puede exportar.
 */
async function logoDesdeUrl(url: string): Promise<LogoTicket> {
  {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image()
      if (!url.startsWith('blob:')) i.crossOrigin = 'anonymous'
      i.onload = () => ok(i)
      i.onerror = () => mal(new Error('No se pudo leer la imagen.'))
      i.src = url
    })
    const escala = Math.min(1, 400 / img.naturalWidth)
    const ancho = Math.max(1, Math.round(img.naturalWidth * escala))
    const alto = Math.max(1, Math.round(img.naturalHeight * escala))
    const lienzo = document.createElement('canvas')
    lienzo.width = ancho
    lienzo.height = alto
    const ctx = lienzo.getContext('2d')
    if (!ctx) throw new Error('No se pudo preparar la imagen.')
    // Fondo blanco: la térmica imprime negro sobre blanco, y un PNG transparente sale negro en jsPDF.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, ancho, alto)
    ctx.drawImage(img, 0, 0, ancho, alto)
    return { src: lienzo.toDataURL('image/png'), ancho, alto }
  }
}

/**
 * Sólo admin: el logo que va arriba del ticket (Bruno, 5-oct). Sin logo, el ticket lleva el nombre. Uno por
 * marca (Bruno, 12-oct): sale el de la marca de lo que se vende, y los dos si el ticket mezcla.
 */
export function LogoDelTicket({ marca, nombre, inicial, tienda = null, onGuardado }: { marca: MarcaLogo; nombre: string; inicial: LogoTicket | null; /** V4: la Tienda Nube de la marca: el logo por defecto sale de ahí. */ tienda?: string | null; onGuardado: (r: { ticket_logo: LogoTicket | null; ticket_logo_stunned: LogoTicket | null }) => void }) {
  const [abierto, setAbierto] = useState(false)
  const archivo = useRef<HTMLInputElement>(null)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  async function guardar(l: LogoTicket | null) {
    setGuardando(true)
    setMsg(null)
    try {
      const r = await guardarLogo(l, marca)
      onGuardado(r)
      setMsg(l ? 'Logo guardado: sale en el próximo ticket.' : 'Logo eliminado: el ticket lleva el nombre.')
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }
  return (
    <Plegable variante="tarjeta" abierto={abierto} onToggle={() => setAbierto(!abierto)} titulo={`Logo del ticket · ${nombre}`} ayuda={`Sale cuando el ticket lleva prendas de ${nombre}. PNG o JPG; se achica a 400 px de ancho. Sólo lo cambia un admin.`}>
      <div style={{ display: 'grid', gap: space[3], maxWidth: 560 }}>
        {inicial ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={inicial.src} alt={`Logo de ${nombre}`} style={{ maxWidth: 160, maxHeight: 48, objectFit: 'contain', justifySelf: 'start', border: `1px solid ${color.line}`, borderRadius: radius.sm, padding: space[1], background: '#fff' }} />
        ) : (
          <span style={{ color: color.mut, fontSize: font.sm }}>Logo: ninguno (el ticket lleva el nombre).</span>
        )}
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
          {tienda && (
            <Button
              size="sm"
              variant={inicial ? 'outline' : 'solid'}
              loading={guardando}
              onClick={async () => {
                try {
                  await guardar(await logoDesdeUrl((await leerLogoTN(marca === 'stunned' ? 'stunned' : undefined)).url))
                } catch (err) {
                  setMsg((err as Error).message)
                }
              }}
            >
              Usar el de Tienda Nube
            </Button>
          )}
          <Button size="sm" variant="outline" loading={guardando} onClick={() => archivo.current?.click()}>
            {tienda ? 'Cargar otro (para la térmica)' : 'Cargar logo'}
          </Button>
          <input
            ref={archivo}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                await guardar(await logoDesdeArchivo(f))
              } catch (err) {
                setMsg((err as Error).message)
              }
            }}
          />
          {inicial && (
            <Button size="sm" variant="ghost" disabled={guardando} onClick={() => guardar(null)}>
              Eliminar logo
            </Button>
          )}
        </div>
        {msg && <span style={{ fontSize: font.sm, color: color.mut }}>{msg}</span>}
      </div>
    </Plegable>
  )
}

/**
 * Dónde se detectan las transferencias (Bruno, 5-oct: «tiene que ir cambiando»): la cuenta de Mercado
 * Pago en uso de Pagos recibidos —la MISMA, ⛔ una copia—. Todos ven cuál es; cambiarla, sólo admin.
 * Cargar una cuenta nueva (con su llave) sigue siendo en Pagos recibidos.
 */
/** Cómo se llama en Gestión Nube la cuenta de transferencias (Bruno, 11-oct). */
const NOMBRE_TRANSF_GN: Record<number, string> = { 13015: 'Transferencia (Areben Comercial)', 20595: 'Transferencia CG (Darío)' }

/**
 * Dónde se detectan las transferencias (la cuenta de Mercado Pago de Pagos recibidos) y, 🔑 Bruno 11-oct,
 * la cuenta de Gestión Nube donde se ASIENTAN: sale de esa misma cuenta de MP (la de Darío ⇒
 * Transferencia CG; Areben Comercial ⇒ Transferencia). El mapeo lo carga un admin.
 */
export function DeteccionTransferencias({ admin, reglas = null, onGuardadas }: { admin: boolean; reglas?: Reglas | null; onGuardadas?: (r: Reglas, v?: Versiones) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [datos, setDatos] = useState<{ enUso: CuentaMp | null; cuentas?: CuentaMp[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    leerCuentasMp()
      .then(setDatos)
      .catch((e) => setError((e as Error).message))
  }, [])
  async function usar(id: number) {
    setGuardando(true)
    setError(null)
    try {
      const r = await usarCuentaMp(id)
      setDatos((d) => ({ ...d, enUso: r.enUso }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }
  async function asentarEn(gn: number) {
    if (!datos?.enUso) return
    setGuardando(true)
    setError(null)
    try {
      const r = await guardarBajadas({ transferenciaPorMp: { mp: datos.enUso.cuenta_id, gn } })
      onGuardadas?.(r.reglas, r.versiones)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }
  const enUso = datos ? (datos.enUso?.nombre ?? 'ninguna cuenta (cargarla en Pagos recibidos)') : '…'
  const gn = reglas?.transferenciaA ?? null
  const opciones = reglas?.medios?.transferencia.opciones ?? []
  // V4 (Bruno, 12-oct): la tienda que ⛔ verifica en Mercado Pago confirma la transferencia al cobrar.
  if (reglas && reglas.verificarTransferencia === false) {
    const nombreGN = gn != null ? (NOMBRE_TRANSF_GN[gn] ?? reglas.cuentas[gn]?.nombre ?? `Cuenta ${gn}`) : '—'
    return (
      <Plegable variante="tarjeta" abierto={abierto} onToggle={() => setAbierto(!abierto)} titulo="Transferencias" ayuda="Esta tienda no las verifica en Mercado Pago: se dan por cobradas al confirmar.">
        <div style={{ display: 'grid', gap: space[2], maxWidth: 560 }}>
          <span style={{ color: color.ink2 }}>Se asientan en Gestión Nube como: <b style={{ color: color.ink }}>{nombreGN}</b></span>
          <span style={{ fontSize: font.sm, color: color.mut }}>La cajera mira el comprobante en el teléfono de la clienta. Para verificarlas en Mercado Pago, cambiarlo en «Formas de pago».</span>
        </div>
      </Plegable>
    )
  }
  return (
    <Plegable variante="tarjeta" abierto={abierto} onToggle={() => setAbierto(!abierto)} titulo="Las transferencias se detectan en" ayuda={`${enUso} · la misma cuenta que usa Pagos recibidos.`}>
      <div style={{ display: 'grid', gap: space[2], maxWidth: 560 }}>
        {admin && datos?.cuentas && datos.cuentas.length > 1 ? (
          <Field label="Cuenta de Mercado Pago">
            <Select value={String(datos.enUso?.cuenta_id ?? '')} disabled={guardando} onChange={(e) => usar(Number(e.target.value))} style={{ maxWidth: 320 }}>
              {datos.cuentas.map((x) => (
                <option key={x.cuenta_id} value={x.cuenta_id}>
                  {x.nombre}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <span style={{ display: 'inline-flex', gap: space[2], alignItems: 'center', color: color.ink2 }}>
            <Icono nombre="transferencia" size={16} /> Cuenta de Mercado Pago: <b style={{ color: color.ink }}>{enUso}</b>
          </span>
        )}
        {reglas && datos?.enUso && (admin && onGuardadas ? (
          <Field label="Se asienta en Gestión Nube como">
            <Select value={String(gn ?? '')} disabled={guardando} onChange={(e) => e.target.value && asentarEn(Number(e.target.value))} style={{ maxWidth: 320 }}>
              {gn == null && <option value="">Elegir la cuenta de Gestión Nube…</option>}
              {opciones.map((id) => (
                <option key={id} value={id}>
                  {NOMBRE_TRANSF_GN[id] ?? reglas.cuentas[id]?.nombre ?? `Cuenta ${id}`}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <span style={{ color: color.ink2 }}>Se asienta en Gestión Nube como: <b style={{ color: color.ink }}>{gn != null ? (NOMBRE_TRANSF_GN[gn] ?? `Cuenta ${gn}`) : '—'}</b></span>
        ))}
        {reglas && datos?.enUso && gn == null && <Notice tone="warning">Falta a qué cuenta de Gestión Nube va esta cuenta de Mercado Pago: hasta elegirla, la Caja no cobra por transferencia.</Notice>}
        {datos && !datos.enUso && reglas?.transferenciaA != null && (
          <Notice tone="neutral">Sin cuenta conectada: la transferencia queda esperando y la cajera la confirma mirando el comprobante («Transferencia confirmada»). Va a {NOMBRE_TRANSF_GN[reglas.transferenciaA] ?? reglas.cuentas[reglas.transferenciaA]?.nombre ?? `Cuenta ${reglas.transferenciaA}`}. Al conectar la cuenta en Pagos recibidos, se confirma sola.</Notice>
        )}
        <span style={{ fontSize: font.sm, color: color.mut }}>Toda transferencia queda esperando el pago, sin ticket, hasta que aparece en esta cuenta.</span>
        {error && <span style={{ color: color.dangerInk, fontSize: font.sm }}>{error}</span>}
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
    <Plegable variante="tarjeta" abierto={abierto} onToggle={() => setAbierto(!abierto)} titulo="Política de cambio del ticket" ayuda="El texto que sale al pie de cada ticket. Sólo lo cambia un admin.">
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

/**
 * El botón entre la pestaña Caja y el POS (Bruno, 13-oct: «entrar y salir del POS demora»). Era un `<a>`
 * pelado ⇒ cada ida y vuelta RECARGABA el monitor entero: la sesión otra vez («Entrando…»), el shell y
 * los datos de la marca. Navega adentro de la app; con Ctrl/⌘ o la rueda sigue abriendo otra pestaña.
 */
export function IrA({ href, onClick, ...resto }: ComponentProps<typeof ButtonLink> & { href: string }) {
  const router = useRouter()
  return (
    <ButtonLink
      href={href}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        router.push(href)
      }}
      {...resto}
    />
  )
}
