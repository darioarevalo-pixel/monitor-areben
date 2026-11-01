'use client'
/**
 * El resumen de la situación crediticia en el BCRA (Central de Deudores, pública): lo usan la tarjeta de cuenta del panel
 * (por la ficha), «Consultar un CUIT» y los datos para facturar (el CUIT recién traído del padrón de ARCA).
 */
import type { ReactNode } from 'react'
import { color, font } from '@/components/ui/tokens'
import type { BcraDelPanel } from '@/lib/erp/cliente'
import { SITUACION_BCRA, mesBcra, tonoBcra } from '@/lib/erp/bcra.core.js'

const plata = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
const TONO = { verde: color.successInk, ambar: color.warningInk, rojo: color.dangerInk, neutro: color.mut2 } as const

export function ResumenBcra({ r }: { r: BcraDelPanel | 'cargando' }): ReactNode {
  if (r === 'cargando') return <div style={{ fontSize: font.sm, color: color.mut2 }}>Consultando el BCRA…</div>
  if (!r.prendido) return null
  if ('sinCuit' in r) return <div style={{ fontSize: font.sm, color: color.mut2 }}>Hace falta el CUIT del cliente (con DNI el BCRA no contesta).</div>
  if (!r.ok) return <div style={{ fontSize: font.sm, color: color.dangerInk }}>{r.error}</div>
  const tono = TONO[tonoBcra(r)]
  const resumen = r.bancos.length
    ? `Situación ${r.peor} (${SITUACION_BCRA[r.peor as keyof typeof SITUACION_BCRA] ?? '?'}) · debe ${plata(r.deuda)} en ${r.bancos.length} ${r.bancos.length === 1 ? 'banco' : 'bancos'}`
    : 'Sin deudas en bancos'
  const cheques = r.cheques == null ? null
    : r.cheques.total === 0 ? 'sin cheques rechazados'
      : `${r.cheques.total} ${r.cheques.total === 1 ? 'cheque rechazado' : 'cheques rechazados'}${r.cheques.sinPagar ? ` · ${r.cheques.sinPagar} sin pagar (${plata(r.cheques.monto)})` : ''}`
  return (
    <>
      <div style={{ fontSize: font.sm, color: tono, fontWeight: 700 }}>{resumen}{cheques ? ` · ${cheques}` : ''}</div>
      {r.bancos.slice(0, 4).map((b) => (
        <div key={b.entidad} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: font.xs, color: color.mut2 }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.entidad}</span>
          <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>sit. {b.situacion}{b.diasAtraso ? ` · ${b.diasAtraso} días de atraso` : ''}{b.juicio ? ' · en juicio' : ''} · {plata(b.monto)}</span>
        </div>
      ))}
      {r.peor12 != null && r.peor12 > r.peor && (
        <div style={{ fontSize: font.xs, color: TONO.ambar }}>En los últimos 12 meses llegó a situación {r.peor12}.</div>
      )}
      <div style={{ fontSize: 11, color: color.mut2 }}>
        {r.denominacion ? `${r.denominacion} · ` : ''}{r.periodo ? `informado a ${mesBcra(r.periodo)}` : 'último período'} · fuente: BCRA, Central de Deudores
      </div>
    </>
  )
}
