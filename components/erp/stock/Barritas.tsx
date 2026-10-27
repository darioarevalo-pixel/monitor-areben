/**
 * Las dos barritas del tablero 3 del v8 (`~/Documents/erp-monitor/diseno/artifact/Stock.dc.html`):
 * `BarraPasos` (`fin: 'ok'` = recibida y controlada, verde entera) — los 4 pasos de una transferencia (Borrador · Armada · En tránsito · Recibida) y el estado en texto;
 * `BarraRecibidas` — lo recibido de lo pedido de una orden («24 de 24»).
 */

import { PASOS } from '@/lib/erp/transferencias.core.js'

const AZUL = '#0284c7', VERDE = '#16a34a', ROJO = '#dc2626', PISTA = '#e3e8ef'
/** El 4º paso sin control al llegar: GN mueve el stock de un golpe y nadie escanea en destino (⛔ verde lleno). */
const RAYADO = `repeating-linear-gradient(135deg, ${VERDE} 0 3px, ${PISTA} 3px 6px)`
const TEXTO = { curso: '#075985', rayado: '#15803d', ok: '#15803d', rojo: '#b42318', gris: '#5d6b82' } as const

export function BarraPasos({ paso, fin, texto }: { paso: number; fin: 'curso' | 'rayado' | 'ok' | 'rojo' | 'gris'; texto: string }) {
  const fondo = (i: number) => {
    if (i >= paso) return PISTA
    if (fin === 'rayado') return i === 3 ? RAYADO : VERDE
    if (fin === 'ok') return VERDE
    if (fin === 'rojo' && i === paso - 1) return ROJO
    return AZUL
  }
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }} aria-label={`${texto} (paso ${Math.max(paso, 0)} de 4)`}>
      {PASOS.map((t: string, i: number) => (
        <span key={t} title={i === 3 && fin === 'rayado' ? 'Recibida: Gestión Nube la mueve de un golpe, todavía nadie la escanea al llegar' : t} style={{ display: 'block', flex: '0 0 22px', height: 6, borderRadius: 3, background: fondo(i) }} />
      ))}
      <span style={{ marginLeft: 6, fontWeight: 600, fontSize: 13, color: TEXTO[fin], whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{texto}</span>
    </span>
  )
}

export function BarraRecibidas({ recibidas, pedidas, tono }: { recibidas: number; pedidas: number; tono: 'ok' | 'aviso' | 'malo' | 'neutro' }) {
  const pct = pedidas > 0 ? Math.min(Math.round((recibidas / pedidas) * 100), 100) : 0
  const relleno = tono === 'ok' ? VERDE : tono === 'neutro' ? AZUL : tono === 'aviso' ? '#d97706' : ROJO
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, width: '100%' }} aria-label={`${recibidas} de ${pedidas} recibidas`}>
      <span style={{ display: 'block', flex: '1 1 auto', height: 6, borderRadius: 3, background: PISTA, overflow: 'hidden' }}>
        <span style={{ display: 'block', height: 6, width: `${pct}%`, background: relleno }} />
      </span>
      <span style={{ flex: '0 0 auto', fontSize: 13, color: '#5d6b82', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{recibidas.toLocaleString('es-AR')} de {pedidas.toLocaleString('es-AR')}</span>
    </span>
  )
}
