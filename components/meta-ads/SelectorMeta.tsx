'use client'

/**
 * El selector de la sección: **línea de pauta** (pestañas) × **cuenta publicitaria** (desplegable).
 *
 * Van los dos y no uno: BDI y Zattia comparten cuenta, así que la cuenta no dice de quién es la
 * plata; y una línea puede estar en dos cuentas a la vez —es exactamente lo que va a pasar mientras
 * Zattia se muda a la suya—, así que la línea no dice dónde se pautea.
 *
 * 🔑 **La cuenta con campañas sin asignar nunca desaparece al filtrar por línea**, y por eso el
 * desplegable las nombra: son campañas que no cuenta ningún diagnóstico, y esconderlas justo cuando
 * alguien filtra es esconder el único lugar donde el estado se arregla. Ver `lib/meta-ads/cuentas.ts`.
 */

import { useMeta } from '@/components/meta-ads/ContextoMeta'
import { sinAsignarDe } from '@/lib/meta-ads/cuentas'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import { color, font, Select, space, Tabs, weight, type TabItem } from '@/components/ui'

export function SelectorMeta() {
  const { estado, cuentasVisibles, cuenta, setCuenta, linea, setLinea, visibles, laCuenta } = useMeta()

  const pestañas: TabItem[] = [
    { key: 'todas', label: 'Todas' },
    ...visibles.map<TabItem>((l) => ({ key: l, label: ETIQUETA_LINEA[l] })),
  ]

  return (
    <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', marginBottom: space[5] }}>
      {/* Sólo si hay más de una: con una sola línea visible, la pestaña «Todas» al lado de esa línea
          ofrece dos veces lo mismo. */}
      {visibles.length > 1 && (
        <Tabs items={pestañas} value={linea} onChange={(k) => setLinea(k as typeof linea)} />
      )}

      <label style={{ display: 'inline-flex', alignItems: 'center', gap: space[2], fontSize: font.sm, color: color.ink2 }}>
        Cuenta:
        <Select value={cuenta} onChange={(e) => setCuenta(e.target.value)} disabled={estado.fase !== 'ok'}>
          <option value="todas">
            {estado.fase === 'ok' ? `Todas (${cuentasVisibles.length})` : 'Cargando…'}
          </option>
          {cuentasVisibles.map((c) => {
            const huerfanas = sinAsignarDe(c)
            const detalle = [
              c.campanias ? `${c.campanias} campaña${c.campanias === 1 ? '' : 's'}` : 'sin campañas',
              huerfanas ? `${huerfanas} sin marca` : '',
            ].filter(Boolean).join(' · ')
            return <option key={c.id} value={c.id}>{`${c.nombre} — ${detalle}`}</option>
          })}
        </Select>
      </label>

      {/* La moneda y la zona son de la CUENTA y las dos cambian lo que se lee: los presupuestos van
          en la unidad menor de la moneda, y «hoy» lo corta Meta en la zona de la cuenta, no en la de
          quien mira. Se dicen acá para que no haya que ir a buscarlas. */}
      {laCuenta && (
        <span style={{ fontSize: font.xs, color: color.mut2 }} title={`Cuenta ${laCuenta.id}`}>
          {laCuenta.moneda || 'sin moneda'}{laCuenta.zona ? ` · hora de ${laCuenta.zona}` : ''}
          {!laCuenta.administra && (
            <span style={{ color: color.warningInk, fontWeight: weight.semibold }}> · solo lectura</span>
          )}
        </span>
      )}

      {estado.fase === 'error' && (
        <span style={{ fontSize: font.xs, color: color.danger }}>No se pudieron traer las cuentas: {estado.motivo}</span>
      )}
    </div>
  )
}
