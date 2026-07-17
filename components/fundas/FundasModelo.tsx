'use client'

import { useDatosMonitor } from './useDatosMonitor'
import { RankingCard } from './RankingCard'
import { DemandaCard } from './DemandaCard'

/**
 * "Fundas por modelo" (key `fundas-modelo`, solo BDI) en Next.
 *
 * Shell de cards apiladas (no tabs: coexisten verticalmente, index.html 526-702).
 * Por ahora solo el ranking (Paso 1: valida el cableado del store). Demanda,
 * simulación y pedidos se agregan en sus pasos.
 *
 * Espera el estado `'listo'` del store antes de pintar tablas: una tabla vacía
 * muda sería el mismo modo de falla que si el ETL no llegó.
 */
export function FundasModelo() {
  const { datos, estado, error } = useDatosMonitor()

  return (
    <div className="section visible">
      {estado === 'error' ? (
        <div className="card" style={{ color: '#DC2626' }}>
          No se pudieron cargar los datos del monitor{error ? `: ${error}` : '.'}
        </div>
      ) : !datos ? (
        <div className="card" style={{ color: '#9CA3AF' }}>Cargando datos…</div>
      ) : (
        <>
          <RankingCard datos={datos} />
          <DemandaCard datos={datos} />
        </>
      )}
    </div>
  )
}
