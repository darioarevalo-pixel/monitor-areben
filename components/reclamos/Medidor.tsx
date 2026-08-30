'use client'

/**
 * **El medidor: cuántos reclamos se registraron por cada 100 ventas online, mes a mes.**
 *
 * 🔑 Es el manómetro de la válvula del §5 del plan: el día que el alta pública multiplique los
 * casos hay cuatro diales para mover —la retención, el piso del retorno, la fricción por caso y el
 * canal— y hasta hoy ⛔ no había contra qué mirarlos.
 *
 * 🔴 **Lo que esta pantalla ⛔ NO puede dejar de decir.** El número ⛔ no es la tasa de reclamos:
 * es **lo que se registró**. El reclamo que se resuelve en un chat de WhatsApp ⛔ no deja fila, así
 * que el cociente mide dos cosas a la vez —cuánta gente reclama y cuánto se anota— y el formulario
 * público va a mover las dos juntas. Dibujar el número pelado sería exactamente
 * [[feedback_areben_el_espejo_mide_hoy_no_la_espera]] por la otra punta: leer como «subió» el
 * primer mes que se conoce.
 *
 * Por eso salen **seis meses juntos y ⛔ no un número solo**: con los meses de antes marcados como
 * *sin registro* a la vista, lo que se lee ⛔ no es un aumento — es desde cuándo se mide.
 */

import { useEffect, useState } from 'react'
import { Card, Notice, TableWrap, THead, TBody, Tr, Th, Td, color, font, space, weight } from '@/components/ui'
import type { Marca } from '@/lib/nav.datos'
import { leerMedidor, loQueDiceElMes, mesEnCriollo, type MesMedido } from '@/lib/reclamos/medidor'

export function Medidor({ marca }: { marca: Marca }) {
  const [meses, setMeses] = useState<MesMedido[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // El setState va DENTRO del await y ⛔ no en el cuerpo del effect: el linter del repo rechaza el
  // setState síncrono en un effect (renders en cascada). Mismo patrón que Reclamos y Cambios.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const filas = await leerMedidor(marca)
        if (vivo) { setMeses(filas); setError(null) }
      } catch (e) {
        // ⚠️ El medidor que ⛔ no pudo medir **lo dice**: quedarse en blanco se lee igual que un cero.
        if (vivo) { setError(e instanceof Error ? e.message : 'No se pudo medir.'); setMeses(null) }
      }
    })()
    return () => { vivo = false }
  }, [marca])

  return (
    <Card style={{ marginBottom: space[4] }}>
      <div style={{ fontSize: font.lg, fontWeight: weight.bold, color: color.ink }}>
        Reclamos registrados por cada 100 ventas online
      </div>
      <div style={{ fontSize: font.sm, color: color.mut, marginTop: 3, marginBottom: space[3] }}>
        Los reclamos abiertos en el mes, sobre las ventas de Tienda Nube de ese mismo mes.
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {!error && !meses && <div style={{ fontSize: font.sm, color: color.mut }}>Midiendo…</div>}

      {meses && meses.length > 0 && (
        <>
          <TableWrap>
            <THead>
              <Tr>
                <Th>Mes</Th>
                <Th>Ventas online</Th>
                <Th>Reclamos</Th>
                <Th>Cada 100 ventas</Th>
              </Tr>
            </THead>
            <TBody>
              {meses.map((f) => (
                <Tr key={f.mes}>
                  <Td>
                    {mesEnCriollo(f.mes)}
                    {f.enCurso && <span style={{ fontSize: font.xs, color: color.mut, marginLeft: 6 }}>(en curso)</span>}
                  </Td>
                  <Td>{f.ventas}</Td>
                  <Td>{f.reclamos}</Td>
                  <Td style={{ fontWeight: f.sinNumero ? weight.normal : weight.semibold, color: f.sinNumero ? color.mut : color.ink }}>
                    {loQueDiceElMes(f)}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </TableWrap>

          <Notice tone="warning" icon="⚠️" style={{ marginTop: space[3] }}>
            <b>Esto ⛔ no es la tasa de reclamos: es lo que se registró.</b> El reclamo que se
            resuelve en un chat no deja fila acá, así que el número sube tanto cuando reclama más
            gente como cuando se anota mejor. El mes en curso además está incompleto, y las ventas
            de hoy pueden todavía no haber sincronizado desde Gestión Nube.
          </Notice>
        </>
      )}
    </Card>
  )
}
