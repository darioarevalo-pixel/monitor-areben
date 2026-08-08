'use client'

/**
 * La tabla de campañas. La usan el Embudo (agrupadas por etapa) y Campañas (todas juntas), con las
 * mismas columnas y las mismas reglas.
 *
 * Las tres decisiones que decide la tabla y no la fila, porque **dependen del conjunto de filas**:
 * qué columnas se dibujan, y cuáles nombres están repetidos.
 */

import { FilaCampania } from '@/components/meta-ads/campanias/FilaCampania'
import type { Avisos } from '@/components/meta-ads/Avisos'
import type { Correccion, Palanca } from '@/components/meta-ads/useCampanias'
import type { CampañaEtapa } from '@/lib/meta-ads/tipos'
import { TBody, TableWrap, Th, THead, Tr } from '@/components/ui'

export function TablaCampanias({ filas, correccion, avisos, palanca }: {
  filas: CampañaEtapa[]
  correccion: Correccion
  avisos: Avisos
  palanca: Palanca
}) {
  // La columna de correcciones aparece si hay algo que mostrar o alguien que pueda tocarla. Quien
  // no puede corregir tampoco tiene por qué cargar con una columna vacía.
  const hayOverride = filas.some((c) => correccion.porCampaña[c.id])
  const columna = correccion.puedePautar || hayOverride
  // Ídem con las acciones: se pregunta por la LÍNEA de cada campaña de esta tabla, no por la marca
  // de la sesión. Si esta persona no puede accionar en ninguna de las que ve, la columna no va.
  const hayAcciones = filas.some((c) => {
    const linea = correccion.lineaPorCampaña[c.id]?.linea ?? null
    return palanca.acciones.puede('estado', linea)
      || palanca.acciones.puede('presupuesto', linea)
      || palanca.acciones.puede('duplicar', linea)
      || palanca.acciones.puede('nombre', linea)
  })
  const anchoTotal = 6 + (columna ? 2 : 0) + (hayAcciones ? 1 : 0)

  /**
   * 🔴 **Dos campañas con el MISMO nombre en la misma tabla.** No es hipotético: «STUNNED - Tráfico a
   * Perfil - Abril 2026» existe en dos cuentas publicitarias distintas y **no son la misma campaña**
   * (una es la histórica apagada, la otra la que corre hoy). Se ven como dos filas idénticas con un
   * botón «Reactivar» cada una, y prender la equivocada es plata gastada.
   *
   * Apareció recién cuando las pausadas se hicieron visibles: antes las dos ni se dibujaban. Se
   * desempata con el nombre de la cuenta, y **sólo en las que repiten**: ponérselo a todas sería una
   * línea de ruido en cada fila para resolver un caso que casi nunca pasa.
   */
  const repetidos = new Set(
    filas.map((c) => c.nombre).filter((n, i, todos) => todos.indexOf(n) !== i),
  )

  return (
    <TableWrap>
      <THead>
        <Tr>
          <Th>Campaña</Th>
          <Th>Objetivo en Meta</Th>
          <Th align="right">Diario</Th>
          <Th align="right">Gasto</Th>
          <Th align="right">Compras</Th>
          <Th>Estado</Th>
          {columna && <Th>Etapa</Th>}
          {columna && <Th>Marca</Th>}
          {hayAcciones && <Th>Acciones</Th>}
        </Tr>
      </THead>
      <TBody>
        {filas.map((c) => (
          <FilaCampania
            key={c.id}
            c={c}
            correccion={correccion}
            avisos={avisos}
            palanca={palanca}
            columna={columna}
            hayAcciones={hayAcciones}
            anchoTotal={anchoTotal}
            repetido={repetidos.has(c.nombre)}
          />
        ))}
      </TBody>
    </TableWrap>
  )
}
