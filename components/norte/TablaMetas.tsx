'use client'

import { Badge, Button, EmptyState, TBody, THead, TableWrap, Td, Th, Tr, color, font } from '@/components/ui'
import { medidorDe, unidadDe } from '@/lib/norte/medidores'
import type { MetaGuardada } from '@/lib/norte/persistencia'
import type { AvanceMeta, Medidor } from '@/lib/norte/tipos'

/**
 * **La tabla de metas de Norte**: las que se están persiguiendo, con su medido, y las apagadas.
 *
 * # Por qué es un componente aparte
 *
 * Salió de `Norte.tsx` el 18-ago-2026 para poder **probarla**. El banco de Norte es de lógica y el
 * repo no tiene tests de componentes: el defecto que se arregló acá —una meta apagada que
 * desaparecía de la pantalla sin verbo de vuelta— vivía **entero adentro del JSX**, así que no
 * había nada que un test pudiera preguntarle. Con las props puras (nada de hooks de datos) se
 * renderiza con `renderToStaticMarkup` y se le pregunta qué muestra.
 *
 * 🔑 **Las dos reglas que defiende el banco son las que ya se rompieron una vez:**
 *
 *  1. **Una meta apagada se muestra igual**, al final, en gris y con su botón Editar. Antes la
 *     única lista era `metas.filter((m) => m.activa)` y al editor sólo se entra desde una fila de
 *     esa lista ⇒ destildar «Activa» sacaba la meta de la pantalla y no había cómo reactivarla ni
 *     borrarla; el único camino era `psql`. Volver a crearla con el mismo nombre tampoco la
 *     recuperaba: la clave se desambigua y nace una fila nueva, con la vieja al lado, muda.
 *  2. **El vacío mira TODAS.** Con una sola meta apagada cargada, «Sin metas cargadas» es falso, y
 *     además esconde la única fila desde la que se la puede volver a prender.
 *
 * 🔑 **Las apagadas no se miden**, a propósito. El medido va al lado de un objetivo que alguien
 * está persiguiendo; ponerle un número a una meta apagada la devuelve a la conversación, que es
 * justo lo que apagarla quiso evitar. **El objetivo sí va**: es lo que permite reconocerla, y dos
 * metas pueden llamarse igual (la clave se desambigua, el nombre no).
 */
export function TablaMetas({
  avances,
  apagadas,
  admin,
  onEditar,
}: {
  /** Las activas, ya medidas contra el mismo `ritmo` que la pantalla muestra arriba. */
  avances: readonly AvanceMeta[]
  /** Las apagadas, sin medir. */
  apagadas: readonly MetaGuardada[]
  admin: boolean
  onEditar: (key: string) => void
}) {
  // El vacío mira las dos listas: con una apagada cargada, «sin metas» sería falso.
  if (avances.length === 0 && apagadas.length === 0) {
    return (
      <EmptyState
        title="Sin metas cargadas"
        hint={admin ? 'Agregá la primera con el botón de arriba.' : 'Las carga un administrador.'}
      />
    )
  }

  return (
    <TableWrap>
      <THead>
        <Tr>
          <Th>Meta</Th>
          <Th align="right">Objetivo</Th>
          <Th align="right">Hoy</Th>
          <Th align="right">Avance</Th>
          <Th align="right">Faltan</Th>
          <Th align="right">Por semana</Th>
          {admin && <Th align="right"> </Th>}
        </Tr>
      </THead>
      <TBody>
        {avances.map((a) => (
          <Tr key={a.meta.key}>
            <Td>
              {a.meta.label}
              <div style={{ fontSize: font.sm, color: color.mut }}>
                {medidorDe(a.meta.medidor)?.label || a.meta.medidor}
                {a.meta.canal ? ` · ${a.meta.canal}` : ' · todos los canales'}
              </div>
            </Td>
            <Td align="right" mono>
              {conUnidad(a.meta.objetivo, a.meta.medidor)}
            </Td>
            <Td align="right" mono>
              {a.medido === null ? (
                <span style={{ color: color.mut, fontSize: font.sm }}>{a.motivo || '—'}</span>
              ) : (
                conUnidad(a.medido, a.meta.medidor)
              )}
            </Td>
            <Td align="right" mono>
              {a.pct === null ? '—' : `${a.pct.toFixed(0)}%`}
              {a.veces !== null && a.veces > 1.2 && (
                <span style={{ color: color.mut }}> · ×{a.veces === Infinity ? '∞' : a.veces.toFixed(1)}</span>
              )}
            </Td>
            <Td align="right" mono>
              {a.falta === null ? '—' : conUnidad(a.falta, a.meta.medidor)}
            </Td>
            <Td align="right" mono>
              {a.porSemana === null ? '—' : conUnidad(a.porSemana, a.meta.medidor)}
            </Td>
            {admin && (
              <Td align="right">
                <Button size="sm" variant="outline" onClick={() => onEditar(a.meta.key)}>
                  Editar
                </Button>
              </Td>
            )}
          </Tr>
        ))}
        {apagadas.map((m) => (
          <Tr key={m.key}>
            <Td>
              <span style={{ color: color.mut }}>{m.label}</span>{' '}
              <Badge tone="neutral" subtle>
                apagada
              </Badge>
              <div style={{ fontSize: font.sm, color: color.mut }}>
                {medidorDe(m.medidor)?.label || m.medidor}
                {m.canal ? ` · ${m.canal}` : ' · todos los canales'}
              </div>
            </Td>
            <Td align="right" mono style={{ color: color.mut }}>
              {conUnidad(m.objetivo, m.medidor)}
            </Td>
            <Td align="right" mono style={{ color: color.mut }}>
              —
            </Td>
            <Td align="right" mono style={{ color: color.mut }}>
              —
            </Td>
            <Td align="right" mono style={{ color: color.mut }}>
              —
            </Td>
            <Td align="right" mono style={{ color: color.mut }}>
              —
            </Td>
            {admin && (
              <Td align="right">
                <Button size="sm" variant="outline" onClick={() => onEditar(m.key)}>
                  Editar
                </Button>
              </Td>
            )}
          </Tr>
        ))}
      </TBody>
    </TableWrap>
  )
}

/**
 * Un número con la unidad que le corresponde a su medidor.
 *
 * La unidad viene del catálogo, no de una lista escrita acá: `$/funda` lleva el signo adelante y
 * `fundas/día` lo lleva atrás, y eso alcanza para las tres.
 */
export function conUnidad(valor: number, medidor: Medidor): string {
  const [izq, der] = unidadDe(medidor).split('/')
  if (izq === '$') return `$${Math.round(valor).toLocaleString('es-AR')}/${der}`
  return `${valor.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${izq}/${der}`
}
