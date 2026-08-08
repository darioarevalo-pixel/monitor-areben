'use client'

/**
 * Una campaña en la tabla: su fila, y los dos paneles que despliega debajo (los avisos y los
 * conjuntos).
 *
 * **El nombre de la campaña despliega sus avisos** (ver `components/meta-ads/Avisos.tsx`): un
 * nombre de campaña no se parece en nada al aviso, y esta sección existe para que alguien piense la
 * pieza que falta mirando las que ya salieron.
 */

import { Fragment } from 'react'
import { BotonAvisos, PanelAvisos, type Avisos } from '@/components/meta-ads/Avisos'
import { PanelConjuntos } from '@/components/meta-ads/Conjuntos'
import { BotonesAccion, type ObjetoMeta } from '@/components/meta-ads/acciones'
import { CeldaDiario, CeldaEtapa, CeldaLinea, EstadoPill } from '@/components/meta-ads/campanias/celdas'
import type { Correccion, Palanca } from '@/components/meta-ads/useCampanias'
import { entero, plata } from '@/lib/meta-ads/formato'
import { estaAlAire, rotuloObjetivo } from '@/lib/meta-ads/etapas'
import type { CampañaEtapa } from '@/lib/meta-ads/tipos'
import { Button, Td, Tr, color, font, space, weight } from '@/components/ui'

/** Por qué una campaña que figura activa igual no ofrece botones. Ver `estaAlAire`. */
export const INERTE = 'Figura activa pero no entregó nada en la ventana: suele ser una publicación de Instagram promocionada, que Meta deja ACTIVE para siempre.'

export function FilaCampania({ c, correccion, avisos, palanca, columna, hayAcciones, anchoTotal, repetido }: {
  c: CampañaEtapa
  correccion: Correccion
  avisos: Avisos
  palanca: Palanca
  /** Si la tabla dibuja las columnas de Etapa y Marca. */
  columna: boolean
  hayAcciones: boolean
  /** Cuántas columnas tiene la tabla, para el `colSpan` de los paneles desplegados. */
  anchoTotal: number
  /** Si hay otra campaña con este mismo nombre en la tabla. Ver `TablaCampanias`. */
  repetido: boolean
}) {
  const abierta = avisos.abiertas.has(c.id)
  const conjuntosAbiertos = palanca.conjuntos.abiertas.has(c.id)
  const linea = correccion.lineaPorCampaña[c.id]?.linea ?? null
  const moneda = palanca.monedaDe(c.cuentaId)
  const deQuienEs = palanca.cuentaDe(c.cuentaId) || `cuenta ${c.cuentaId.slice(-4)}`
  // La cuenta viaja al cartel **sólo si el nombre se repite**: es la última pantalla antes de
  // escribir, y con dos campañas homónimas el nombre solo no alcanza para saber cuál se toca.
  // Cuando no hay ambigüedad, un renglón más sería ruido en cada confirmación.
  const objeto: ObjetoMeta = {
    // Para una campaña, la campaña es ella misma: es lo que le deja al modal de duplicar preguntar
    // si Meta va a aceptar la copia de sus avisos.
    nivel: 'campania', id: c.id, nombre: c.nombre, linea, moneda, campania: c.id,
    cuenta: repetido ? deQuienEs : undefined,
  }
  const diarioCrudo = c.diarioCrudo ?? 0

  return (
    <Fragment>
      <Tr>
        <Td wrap strong>
          <BotonAvisos nombre={c.nombre} abierta={abierta} onToggle={() => avisos.alternar(c.id)} />
          {repetido && (
            <div
              style={{ fontSize: font.xs, color: color.mut2, fontWeight: weight.normal }}
              title={`Hay más de una campaña con este nombre. Esta corre en la cuenta ${c.cuentaId}.`}
            >
              en {deQuienEs}
            </div>
          )}
        </Td>
        <Td>{rotuloObjetivo(c.objetivo)}</Td>
        <Td align="right"><CeldaDiario c={c} moneda={moneda} /></Td>
        <Td align="right">{plata(c.spend)}</Td>
        <Td align="right">{c.purchases ? entero(c.purchases) : '—'}</Td>
        <Td><EstadoPill s={c.estado} /></Td>
        {columna && <Td><CeldaEtapa c={c} correccion={correccion} /></Td>}
        {columna && <Td><CeldaLinea c={c} correccion={correccion} /></Td>}
        {hayAcciones && (
          <Td>
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[1], alignItems: 'flex-start' }}>
              <BotonesAccion
                objeto={objeto}
                estado={c.estado}
                diarioCrudo={diarioCrudo}
                // Sin diario propio, el presupuesto vive en los conjuntos: el botón de acá no
                // tendría qué tocar y el de la fila de cada conjunto sí.
                sinPresupuesto={diarioCrudo <= 0}
                // 🔴 `estaAlAire` IMPORTADA (`ACTIVE` **y** gasto > 0), no un `||`. Con un `||`, las
                // 171 publicaciones de Instagram promocionadas —que Meta deja ACTIVE para siempre y
                // hace meses que no entregan— se llenarían de botones y taparían las cinco campañas
                // que se llevan la plata.
                inerte={estaAlAire(c) ? null : INERTE}
                acciones={palanca.acciones}
              />
              <Button size="sm" variant="ghost" onClick={() => palanca.conjuntos.alternar(c.id)}>
                {conjuntosAbiertos ? '▾ Conjuntos' : '▸ Conjuntos'}
              </Button>
            </div>
          </Td>
        )}
      </Tr>
      {abierta && (
        <Tr>
          <Td colSpan={anchoTotal} wrap style={{ padding: 0, background: color.bg2 }}>
            <PanelAvisos estado={avisos.dato(c.id)} />
          </Td>
        </Tr>
      )}
      {conjuntosAbiertos && (
        <Tr>
          <Td colSpan={anchoTotal} wrap style={{ padding: 0, background: color.bg2 }}>
            <PanelConjuntos
              estado={palanca.conjuntos.dato(c.id)}
              moneda={moneda}
              linea={linea}
              acciones={palanca.acciones}
            />
          </Td>
        </Tr>
      )}
    </Fragment>
  )
}
