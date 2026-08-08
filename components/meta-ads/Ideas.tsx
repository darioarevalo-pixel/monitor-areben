'use client'

/**
 * Ideas — el tablero donde marketing anota las piezas que hay que producir.
 *
 * Estaba embebido al pie del Embudo. Sale a pantalla propia porque son **dos audiencias distintas**:
 * el Embudo lo mira quien decide dónde falta pauta, el tablero lo trabaja quien produce los
 * creativos, todos los días y sin necesidad de esperar 20 segundos a que Meta conteste el censo.
 *
 * 🔴 **El tablero se dibuja SIEMPRE, ande o no ande Meta.** Se lee por `api/datos.js`, que no habla
 * con Graph, mientras que el censo va por `api/meta-ads.js`, que corta con 500 si falta el
 * `META_ADS_TOKEN`. Si el token vence justo cuando hay que craneаr las piezas, el lugar donde se
 * anotan no se puede haber caído con él. Lo único que se degrada es «marcar como pauteada», que
 * necesita la lista de campañas: sin censo se dice, no se esconde.
 */

import { useCampanias } from '@/components/meta-ads/useCampanias'
import { useFechas } from '@/components/meta-ads/useFechas'
import { TableroIdeas } from '@/components/meta-ads/TableroIdeas'
import { useSesion } from '@/components/SesionProvider'
import { Notice, font, space } from '@/components/ui'

export function Ideas() {
  const { perfil } = useSesion()
  const m = useCampanias()
  const fechas = useFechas(m.marca)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {m.estado.fase === 'error' && (
        <Notice tone="warning">
          Meta no contestó, así que <b>no se puede marcar una idea como pauteada</b>: hace falta la
          lista de campañas para elegir con cuál salió.
          <div style={{ fontSize: font.sm, marginTop: space[1] }}>
            Todo lo demás del tablero anda igual — las ideas viven en la base del monitor, no en Meta.
          </div>
        </Notice>
      )}

      <TableroIdeas
        marca={m.marca}
        ideas={m.funnel.ideas}
        puede={m.funnel.puede}
        quien={perfil?.name ?? null}
        cargando={m.funnel.cargando}
        caido={m.funnel.caido}
        recargar={m.funnel.recargar}
        campañas={m.campañasDeLaMarca}
        // La etapa que el diagnóstico está reclamando viene preelegida al anotar una idea: es el
        // enganche entre las dos pantallas, y el punto entero de que el tablero viva en esta sección.
        sugerida={m.diagDeLaMarca?.veredicto.etapa ?? null}
        fechas={fechas}
      />
    </div>
  )
}
