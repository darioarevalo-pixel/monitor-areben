'use client'

/**
 * "Modelos" (key `modelos`, área Marketing). El padrón de las modelos que trabajan con nosotros.
 *
 * # Por qué existe
 *
 * Lo pidió Bruno el 3-sep-2026, punto 6 de los siete: *«Sección en monitor de Model Management -
 * fichas - Booker - Portafolio con mejores fotos de la modelo con nosotros. Principalmente para
 * análisis. También que se pueda agregar ideas, modelos, como si fuese una base de datos»*, y eligió
 * arrancar por **las fichas**. Esto es esa primera mano: el padrón y la ficha de cada una.
 *
 * # 🔑 Su primer lector NO es esta pantalla: es la sesión de fotos
 *
 * El campo `modelo` de una solicitud (`lib/sesionfotos/modelo.ts`) se tipea a mano —nombre, talle y
 * altura— justamente porque este padrón no existía; su encabezado ya decía que «cuando exista la
 * ficha de la modelo este campo pasa a salir de ahí». Por eso el talle y la altura se guardan con
 * **el mismo núcleo** (`lib/modelos/core.core.js`, que es de donde ahora los importa la sesión):
 * un talle escrito de dos formas son dos talles para todo lo que después agrupe.
 *
 * # ⛔ Lo que esta pantalla NO tiene todavía, y por qué no se dibujó vacío
 *
 * ⛔ **Ninguna columna medida** —cuántas sesiones hizo, qué vendió lo que fotografió—. Al 3-sep-2026
 * **ninguna solicitud tiene modelo anotada** (medido: 11 sesiones en BDI, 0 con modelo; en Zattia la
 * tabla no se pudo leer desde afuera), así que cualquier columna de esas diría **0 para todas** y un
 * cero afirma: se leería como «esta modelo no vendió nada». Entran cuando la sesión empiece a
 * elegir del padrón.
 * ⛔ **El portafolio y el cachet.** El primero es el segundo paso; el segundo ⛔ no va en esta tabla
 * (el motivo está en el encabezado de `sql/migrate-modelos.sql`).
 */
import { useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import {
  Badge,
  BuscarInput,
  Button,
  EmptyState,
  Esqueleto,
  FilterBar,
  Notice,
  TBody,
  TableWrap,
  THead,
  Td,
  Th,
  Tr,
  color,
  space,
} from '@/components/ui'
import { esDeLaMarca, esDirecta, filtrarModelos, ordenarModelos } from '@/lib/modelos/core'
import type { Modelo } from '@/lib/modelos/tipos'
import { FichaModelo } from './FichaModelo'
import { useModelos } from './useModelos'

export function Modelos() {
  const { marca } = useSesion()
  const { modelos, cargando, error, recargar } = useModelos(marca)
  const [busca, setBusca] = useState('')
  const [verArchivadas, setVerArchivadas] = useState(false)
  /** `null` = el padrón · `'nueva'` = ficha en blanco · un id = esa ficha. */
  const [abierta, setAbierta] = useState<string | null>(null)

  /**
   * ⚠️ **`marcas` vacío quiere decir LAS DOS.** Una modelo cargada sin pensar en la marca aparece en
   * las dos, ⛔ no desaparece de las dos — que es la forma en que un filtro esconde datos sin que
   * nadie se entere. Mismo criterio que `insumo.marcas`.
   */
  const deLaMarca = useMemo(
    () => (marca ? modelos.filter((m) => esDeLaMarca(m, marca)) : modelos),
    [modelos, marca],
  )

  const activas = deLaMarca.filter((m) => m.estado === 'activa')
  const archivadas = deLaMarca.length - activas.length

  const lista = useMemo(
    () => ordenarModelos(filtrarModelos(verArchivadas ? deLaMarca : activas, busca)),
    [deLaMarca, activas, busca, verArchivadas],
  )

  if (!marca) return null

  if (abierta) {
    const modelo = abierta === 'nueva' ? null : (modelos.find((m) => m.id === abierta) ?? null)
    return (
      <div style={{ padding: space[4] }}>
        <FichaModelo
          marca={marca}
          modelo={modelo}
          padron={modelos}
          onVolver={() => setAbierta(null)}
          onCambio={recargar}
        />
      </div>
    )
  }

  return (
    <div style={{ padding: space[4], display: 'grid', gap: space[3] }}>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
        {/*
          🔴 **Mientras carga va «…» y ⛔ NO un cero.** Un «Modelos (0)» que un segundo después dice
          (8) afirmó que no hay ninguna, y el que lo lee no sabe que estaba cargando.
        */}
        <strong style={{ fontSize: 16 }}>Modelos ({cargando ? '…' : activas.length})</strong>
        <Button onClick={() => setAbierta('nueva')}>Cargar modelo</Button>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {cargando && <Esqueleto />}

      {!cargando && (
        <>
          <FilterBar>
            <BuscarInput
              value={busca}
              onChange={setBusca}
              placeholder="Buscar por nombre, Instagram, agencia o talle"
            />
            {archivadas > 0 && (
              <Button variant={verArchivadas ? 'solid' : 'ghost'} onClick={() => setVerArchivadas((v) => !v)}>
                {verArchivadas ? 'Ocultar archivadas' : `Ver archivadas (${archivadas})`}
              </Button>
            )}
          </FilterBar>

          {!lista.length ? (
            <EmptyState
              title={
                deLaMarca.length
                  ? 'Ninguna modelo coincide con lo que buscás.'
                  : 'Todavía no hay ninguna modelo cargada.'
              }
              hint={
                deLaMarca.length
                  ? undefined
                  : 'Cargá la primera con «Cargar modelo». El talle y la altura que anotes acá son los que después salen a la descripción del producto.'
              }
            />
          ) : (
            <TableWrap>
              <THead>
                <Tr>
                  <Th align="left">Modelo</Th>
                  <Th align="left">Talle</Th>
                  <Th align="left">Altura</Th>
                  <Th align="left">Quién la representa</Th>
                  <Th align="left">Marcas</Th>
                  <Th align="right"></Th>
                </Tr>
              </THead>
              <TBody>
                {lista.map((m) => (
                  <Tr key={m.id}>
                    <Td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <strong>{m.nombre}</strong>
                        {m.estado === 'archivada' && <Badge tone="neutral">Archivada</Badge>}
                      </div>
                      {m.instagram && (
                        <div style={{ fontSize: 12, color: color.mut }}>@{m.instagram}</div>
                      )}
                    </Td>
                    {/*
                      🔴 Un guion acá dice «no se sabe qué talle usa», ⛔ no «no usa talle». Es
                      literal: `null` es «todavía no se anotó», y por eso la ficha ⛔ no lo exige.
                    */}
                    <Td>{m.talle || <span style={{ color: color.mut2 }}>—</span>}</Td>
                    <Td>{m.altura || <span style={{ color: color.mut2 }}>—</span>}</Td>
                    <Td>{quienRepresenta(m)}</Td>
                    <Td>{m.marcas.length ? m.marcas.map((x) => x.toUpperCase()).join(' · ') : 'Las dos'}</Td>
                    <Td align="right">
                      <Button variant="ghost" size="sm" onClick={() => setAbierta(m.id)}>
                        Abrir
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </TableWrap>
          )}

          <p style={{ fontSize: 12, color: color.mut, margin: 0 }}>
            El <strong>talle</strong> y la <strong>altura</strong> de cada ficha son los que salen a la
            descripción del producto cuando la modelo se elige en una sesión de fotos. Lo que está
            vacío es <strong>no anotado</strong>: ⛔ no se inventa.
          </p>
        </>
      )}
    </div>
  )
}

/** 🔑 «Directa» se escribe con todas las letras: tres guiones se leen como una ficha a medio cargar. */
function quienRepresenta(m: Modelo) {
  if (esDirecta(m)) return <span style={{ color: color.mut }}>Directa</span>
  return [m.agencia, m.booker].filter(Boolean).join(' · ')
}
