'use client'

/**
 * **DECIDIR: todo lo que las automatizaciones encontraron y todavía no resolvió nadie.**
 *
 * # 🔴 Por qué existe, y por qué NO contradice «no hay pantalla de alertas»
 *
 * `HallazgosPanel` tiene escrito, desde que se armó, *«una pantalla nueva de alertas sería un
 * segundo lugar al que hay que acordarse de entrar, y el que no entra no se entera»*. **Eso sigue
 * valiendo y esta pantalla lo cumple**: nadie tiene que acordarse de entrar acá. El que empuja
 * sigue siendo el mismo de siempre —el badge del sidebar, la pantalla de Inicio y el mail de las
 * 07:50—, y en Rendimiento quedó **un renglón con el número** que es el link a esto. Lo que cambió
 * es **dónde se hace**, ⛔ no **cómo se entera**.
 *
 * 📊 Lo que lo motivó, medido el 5-sep-2026. Bruno: *«son 14 pendientes que alargan la lista y que
 * no estoy ejecutando nada por ahí»*. Eran **19**, y cruzados uno por uno contra el estado de la
 * cuenta: 7 apuntaban a algo **ya apagado**, 1 a un objeto que ⛔ ni aparecía en la ventana, 1
 * contradecía a la tabla de la misma pantalla —decía «156% del techo, pausar» donde la fila decía
 * «Rinde, 58%», y era del 26-ago—, 4 eran informativos y 1 era ruido de frecuencia (1,4 contra un
 * máximo de 1,3). **Quedaban ~2.**
 *
 * 🔑 **La lista ⛔ no estaba larga porque faltara una pantalla: estaba larga porque el 89% ⛔ no
 * debería estar ahí.** Eso se arregla en el motor. Lo que se arregla mudándola es que media
 * pantalla de Rendimiento ⛔ no la ocupe una lista que nadie acciona — y el 30-ago ya se había
 * intentado lo contrario, subirla de lugar, que trató la posición y ⛔ no la causa.
 *
 * # ⛔ Lo que esta pantalla NO hace
 *
 * **⛔ No repite lo que ya tiene fila.** `repartirHallazgos` manda a la fila de su pauta todo lo que
 * tenga una, y ahí se acciona. Acá quedan los sueltos. Dos lugares para el mismo gesto sobre el
 * mismo objeto es exactamente el defecto que ese reparto vino a curar.
 *
 * **⛔ No es una construcción: es una MUDANZA.** `HallazgosPanel`, `PodaPendiente` y `Silencio` ya
 * existían y ya estaban probados; acá se montan.
 */

import Link from 'next/link'
import { useMemo } from 'react'
import { HallazgosPanel } from '@/components/meta-ads/reglas/HallazgosPanel'
import { PodaPendiente, usePoda } from '@/components/meta-ads/reglas/PodaPendiente'
import { useReglas } from '@/components/meta-ads/reglas/useReglas'
import { useMeta } from '@/components/meta-ads/ContextoMeta'
import { contarParaDecidir, silencioDeReglas, type Regla } from '@/lib/meta-ads/reglas'
import { Card, EmptyState, SectionCard, color, font, space, weight } from '@/components/ui'

/**
 * El reloj entra acá y ⛔ no adentro del render: `react-hooks/purity` prohíbe `Date.now()` en el
 * cuerpo de un componente. El núcleo lo recibe como parámetro para poder probarlo.
 */
function leerSilencio(reglas: Regla[] | null) {
  return silencioDeReglas(reglas, Date.now())
}

export function Decidir() {
  const { linea, visibles } = useMeta()
  const reglas = useReglas()
  // 🔑 El MISMO criterio que Rendimiento (`laLinea`): con «Todas» y una sola línea visible, esa.
  // Dos formas de resolver «de qué línea es esta pantalla» darían dos listas distintas.
  const laLinea = linea !== 'todas' ? linea : visibles.length === 1 ? visibles[0] : null
  const lineas = useMemo(() => (laLinea ? [laLinea] : visibles), [laLinea, visibles])
  const poda = usePoda(lineas)

  const hallazgos = laLinea ? reglas.hallazgos.filter((h) => h.linea === laLinea) : reglas.hallazgos
  const cuenta = contarParaDecidir(hallazgos)
  const s = leerSilencio(reglas.estado.fase === 'ok' ? reglas.estado.data.reglas : null)

  if (reglas.estado.fase === 'cargando') {
    return <Card style={{ color: color.mut2 }}>Buscando las automatizaciones…</Card>
  }

  if (hallazgos.length === 0 && poda.resumenes.length === 0) {
    return (
      // 🔴 Se dice que está vacío **Y POR QUÉ**, y el porqué se MIDE. Sólo una de las cuatro causas
      // es buena noticia: un «no hay nada» que en realidad significa «no corrió ninguna regla» es
      // el cartel que hace que se le deje de creer a la pantalla. Ver `silencioDeReglas`.
      <EmptyState
        title={s.clase === 'todo-bien' ? 'No queda nada para decidir' : 'No hay nada que mostrar todavía'}
        hint={s.texto}
        action={s.clase === 'sin-reglas'
          ? <Link href="/meta-ads/automatizaciones" style={{ color: color.brandSolid, fontWeight: weight.semibold }}>Prenderlas →</Link>
          : undefined}
        dashed
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard
        title="Pendientes"
        subtitle="Lo que detectaron las automatizaciones. Sale de la base, así que se ve aunque Meta no conteste."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          {/* 🔑 El MISMO criterio y la MISMA función que el asunto del mail de las 07:50 y que el
              renglón de Rendimiento: si contaran distinto, quien abre los tres ⛔ no sabría a cuál
              creerle. */}
          {cuenta.total > 0 && (
            <div style={{ fontSize: font.base, fontWeight: weight.semibold }}>
              {cuenta.total} para decidir
              {cuenta.quemando > 0 && (
                <span style={{ color: color.dangerInk }}> · {cuenta.quemando} para pausar</span>
              )}
            </div>
          )}
          <HallazgosPanel hallazgos={hallazgos} quitar={reglas.quitar} />
          <PodaPendiente resumenes={poda.resumenes} recargar={poda.recargar} />
        </div>
      </SectionCard>
    </div>
  )
}
