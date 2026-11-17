'use client'

/**
 * Las piezas de la solapa «Pedidos» del panel (Darío 15-nov, página F9adDHTnQkLiZH6Z3DuMJD): un BLOQUE (Nuevos · Retenidos ·
 * Entregas) con su cuenta y su plata, y adentro un PASO por color con su número. Van aparte de `PedidosDelDia.tsx` porque
 * las usa también `PedidosMayoristas.tsx` («Sin cliente» y «Retenidos»), y ese archivo ya lo importa `PedidosDelDia`.
 *
 * Un color por paso: rojo = trabado o plata en riesgo · ámbar = esperando el pago · verde = listo para avanzar · índigo =
 * para despachar · celeste = avisar al cliente · gris = esperando al depósito. Lo viejo (más de un día) va en rojo.
 */
import { color, font, radius, space } from '@/components/ui/tokens'

export type TonoPaso = 'rojo' | 'ambar' | 'verde' | 'azul' | 'celeste' | 'gris'

export const TONO: Record<TonoPaso, { k: string; bg: string; ink: string }> = {
  rojo: { k: color.danger, bg: color.dangerBg, ink: color.dangerInk },
  ambar: { k: color.warning, bg: color.warningBg, ink: color.warningInk },
  verde: { k: color.success, bg: color.successBg, ink: color.successInk },
  azul: { k: color.brandSolid, bg: color.brandBg, ink: color.brand },
  celeste: { k: 'var(--mo-info)', bg: 'var(--mo-info-bg)', ink: 'var(--mo-info)' },
  gris: { k: color.mut2, bg: color.bg2, ink: color.mut },
}

export const MARGEN_PASO = space[3]

export const plataPedido = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

/** «hoy», «ayer», «hace 3 días». */
export function hace(iso: string | null | undefined, ahora = Date.now()): { txt: string; dias: number } | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const d0 = new Date(ahora)
  const inicioHoy = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()).getTime()
  const dias = t >= inicioHoy ? 0 : Math.ceil((inicioHoy - t) / 86_400_000)
  return { txt: dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`, dias }
}

/** «hace 3 días» en rojo cuando pasó más de un día; si no, apagado. */
export function Cuando({ iso, ahora }: { iso: string | null | undefined; ahora?: number }) {
  const h = hace(iso, ahora)
  if (!h) return null
  return <span style={h.dias > 1 ? { color: color.dangerInk, fontWeight: 700 } : undefined}>{h.txt}</span>
}

/** Un bloque: Nuevos · Retenidos · Entregas. `tono` pinta el título (Retenidos va en rojo). */
export function Bloque({ titulo, detalle, tono, accion, children }: { titulo: string; detalle?: React.ReactNode; tono?: TonoPaso; accion?: React.ReactNode; children: React.ReactNode }) {
  const t = tono ? TONO[tono] : null
  return (
    <section style={{ margin: `${space[2]}px ${space[2]}px 0`, border: `1px solid ${color.line}`, borderRadius: radius.lg, overflow: 'hidden', background: color.surface }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: `${space[2]}px ${MARGEN_PASO}px`, background: t?.bg, color: t?.ink ?? color.ink }}>
        {t && <i aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: t.k, flex: 'none' }} />}
        <span style={{ fontSize: font.md, fontWeight: 700 }}>{titulo}</span>
        <span style={{ flex: 1 }} />
        {detalle != null && <span style={{ fontSize: font.xs, fontWeight: 600, color: t?.ink ?? color.mut, fontVariantNumeric: 'tabular-nums' }}>{detalle}</span>}
        {accion}
      </div>
      {children}
    </section>
  )
}

/** Un paso adentro del bloque: el punto de color, la palabra y el número. Vacío ⇒ ⛔ se dibuja. */
export function Paso({ titulo, tono, cuantos, children }: { titulo: string; tono: TonoPaso; cuantos: number; children: React.ReactNode }) {
  if (!cuantos) return null
  const t = TONO[tono]
  return (
    <div data-paso={titulo}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: `7px ${MARGEN_PASO}px`, background: t.bg, color: t.ink, borderTop: `1px solid ${color.line}`, fontSize: font.sm, fontWeight: 700 }}>
        <i aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: t.k, flex: 'none' }} />
        <span style={{ flex: 1 }}>{titulo}</span>
        <span style={{ minWidth: 22, textAlign: 'center', fontSize: font.xs, fontWeight: 700, color: color.sideActiveInk, background: t.k, borderRadius: 999, padding: '1px 7px', fontVariantNumeric: 'tabular-nums' }}>{cuantos}</span>
      </div>
      <div style={{ boxShadow: `inset 3px 0 0 ${t.k}` }}>{children}</div>
    </div>
  )
}

/**
 * Un renglón: el nombre arriba, el detalle abajo (tocar abre la hoja o la ficha) y a la derecha los botones del paso.
 */
export function Renglon({ nombre, detalle, onTocar, tituloTocar, botones, chico }: { nombre: React.ReactNode; detalle?: React.ReactNode; onTocar?: () => void; /** El título y el nombre accesible del toque («Ver el pedido M-0111»). */ tituloTocar?: string; botones?: React.ReactNode; /** Un solo renglón, más chico y gris (Darío 17-nov: lo ya hecho no ocupa la vista). */ chico?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${color.line2}`, background: chico ? color.bg2 : color.surface }}>
      <button
        type="button"
        disabled={!onTocar}
        onClick={onTocar}
        title={tituloTocar}
        aria-label={tituloTocar}
        style={{ display: chico ? 'flex' : 'block', alignItems: 'baseline', gap: 8, flex: 1, minWidth: 0, height: 'auto', textAlign: 'left', background: 'none', border: 0, padding: chico ? `${space[1]}px 0 ${space[1]}px ${MARGEN_PASO}px` : `${space[2]}px 0 ${space[2]}px ${MARGEN_PASO}px`, cursor: onTocar ? 'pointer' : 'default', font: 'inherit', color: 'inherit' }}
      >
        <div style={{ fontSize: chico ? font.sm : font.md, fontWeight: chico ? 600 : 700, color: chico ? color.mut : color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flexShrink: 1 }}>{nombre}</div>
        {detalle && <div style={{ display: 'flex', alignItems: 'center', flexWrap: chico ? 'nowrap' : 'wrap', whiteSpace: 'nowrap', flexShrink: 0, gap: 5, marginTop: chico ? 0 : 3, fontSize: font.xs, color: color.mut, fontVariantNumeric: 'tabular-nums' }}>{detalle}</div>}
      </button>
      {botones && <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: `0 ${MARGEN_PASO}px 0 ${space[2]}px` }}>{botones}</div>}
    </div>
  )
}

/** Un botón con texto, chico, para el paso del renglón («Elegir cliente», «💬 Cobrar»). */
export function BotonPaso({ children, onClick, solido, title }: { children: React.ReactNode; onClick: () => void; solido?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{ height: 30, padding: '0 10px', borderRadius: radius.md, fontSize: font.xs, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', border: `1px solid ${solido ? color.brandSolid : color.line2}`, background: solido ? color.brandSolid : color.surface, color: solido ? color.sideActiveInk : color.ink }}
    >
      {children}
    </button>
  )
}
