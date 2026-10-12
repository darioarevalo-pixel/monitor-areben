'use client'

/**
 * «Promociones bancarias y por forma de pago» (Bruno, 12-oct): debajo de las promos por producto, lo que
 * cambia según CON QUÉ paga la clienta. Sólo para leer: las bancarias se cargan en la Agenda y los
 * descuentos de la Caja en su configuración. La regla de qué corre hoy es la MISMA del cobro
 * (`promosDe`, `lib/agenda/promos.core.js`).
 */
import { useEffect, useState } from 'react'

import { Badge, Plegable, color, font, space, weight } from '@/components/ui'
import { hoyIso, promosDe, rotuloBeneficio, rotuloRegla } from '@/lib/agenda'
import { NOMBRE_MEDIO, cuentaDeMedio, msjOferta } from '@/lib/caja/core.core.js'
import type { Medio, Reglas } from '@/lib/caja/cliente'
import { useAgenda } from '@/store/useAgenda'

const MEDIO_PROMO: Record<string, string> = { credito: 'Crédito', debito: 'Débito', app: 'App', qr: 'QR', transferencia: 'Transferencia' }

/** El % de la cuenta de una forma de pago, o null si ⛔ se puede armar (falta configuración). */
function pctDe(medio: Medio, reglas: Reglas): number | null {
  try {
    const cuenta = cuentaDeMedio(medio, { reglas, total: 0, promoCreditoHoy: false, esDelBanco: false, seisCuotas: false })
    return reglas.cuentas[cuenta]?.descuento ?? null
  } catch {
    return null
  }
}

export function PromosFormaDePago({ reglas }: { reglas: Reglas }) {
  const [abierto, setAbierto] = useState(false)
  const promos = useAgenda((st) => st.promos)
  const cargado = useAgenda((st) => st.cargado)
  const cargar = useAgenda((st) => st.cargar)
  useEffect(() => {
    if (!cargado) void cargar()
  }, [cargado, cargar])

  const hoy = hoyIso()
  // Las del mostrador de Zattia que siguen vigentes (la ventana), con las de HOY primero.
  const vigentes = promos
    .filter((p) => p.activa && p.desde <= hoy && (!p.hasta || p.hasta >= hoy))
    .filter((p) => (p.canales || []).includes('mostrador') && (!p.marcas || p.marcas.length === 0 || p.marcas.includes('zattia')))
  const deHoy = new Set(promosDe(vigentes, hoy, { canal: 'mostrador', marca: 'zattia' }).map((p) => p.id))
  const lista = [...vigentes].sort((a, b) => Number(deHoy.has(b.id)) - Number(deHoy.has(a.id)) || a.banco.localeCompare(b.banco, 'es'))

  return (
    <Plegable
      variante="tarjeta"
      abierto={abierto}
      onToggle={() => setAbierto(!abierto)}
      titulo={`Promociones bancarias y por forma de pago (${deHoy.size} hoy)`}
      ayuda="Lo que cambia según con qué paga la clienta. Las bancarias se cargan en la Agenda; los descuentos de la Caja, en su configuración."
    >
      <div style={{ display: 'grid', gap: space[3], maxWidth: 720 }}>
        <div style={{ display: 'grid', gap: space[1] }}>
          <span style={{ fontWeight: weight.semibold, fontSize: font.sm, color: color.ink2 }}>Descuentos de la Caja por forma de pago</span>
          {(['efectivo', 'transferencia', 'debito', 'credito'] as const).map((medio) => {
            const pct = pctDe(medio, reglas)
            return (
              <div key={medio} style={{ display: 'flex', gap: space[2], fontSize: font.base }}>
                <span style={{ width: 160 }}>{NOMBRE_MEDIO[medio]}</span>
                <span style={{ color: pct ? color.successInk : color.mut }}>{pct == null ? '—' : pct > 0 ? `${pct}% de descuento` : 'precio de lista'}</span>
              </div>
            )
          })}
          <span style={{ fontSize: font.sm, color: color.mut }}>{msjOferta(reglas)}.</span>
        </div>
        <div style={{ display: 'grid', gap: space[1] }}>
          <span style={{ fontWeight: weight.semibold, fontSize: font.sm, color: color.ink2 }}>Promociones bancarias en el local</span>
          {!cargado && <span style={{ fontSize: font.sm, color: color.mut }}>Leyendo la Agenda…</span>}
          {cargado && lista.length === 0 && <span style={{ fontSize: font.sm, color: color.mut }}>Ninguna vigente.</span>}
          {lista.map((p) => (
            <div key={p.id} style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', fontSize: font.base }}>
              {deHoy.has(p.id) ? <Badge tone="success">Hoy</Badge> : <Badge tone="neutral">Otro día</Badge>}
              <b>{p.banco}</b>
              <span>{MEDIO_PROMO[p.medio] ?? p.medio}</span>
              <span style={{ color: color.successInk, fontWeight: weight.semibold }}>{rotuloBeneficio(p.beneficio)}</span>
              <span style={{ color: color.mut, fontSize: font.sm }}>{rotuloRegla(p.regla)}</span>
            </div>
          ))}
        </div>
      </div>
    </Plegable>
  )
}
