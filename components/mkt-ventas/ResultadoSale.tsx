'use client'

import { useEffect, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Resultado } from '@/components/liquidacion/Resultado'
import { leerCampaniasParaResultado, leerItemsParaResultado } from '@/lib/liquidacion/persistencia'
import type { Liquidacion, LiquidacionItem } from '@/lib/liquidacion/tipos'
import { Card, EmptyState, Notice, Select, color, font, space, weight } from '@/components/ui'

/**
 * El resultado de una campaña de sale, adentro de Ventas de Marketing.
 *
 * # Por qué se monta `Resultado` en vez de escribir uno propio
 *
 * `components/liquidacion/Resultado.tsx` y su motor `lib/liquidacion/resultado.ts` ya contestan
 * exactamente lo que Marketing necesita —qué se vendió de lo liquidado, si el precio de sale llegó
 * a estar puesto, y los descartados como grupo de control— y **no leen costo, margen ni markup**
 * (medido con grep en las dos puntas antes de escribir esto). Escribir una segunda versión sería
 * garantizar que algún día las dos pantallas contesten distinto sobre la misma campaña.
 *
 * # Lo que NO entra
 *
 * ⛔ La pestaña de Bitácora, `DefinirPrecio` y cualquier verbo que escriba. Del lado del servidor
 * la llave `?resultado=1` sólo contesta GET, y las dos lecturas que hace `Resultado` por POST
 * (`ventas-campania`, `stock-campania`) están nombradas una por una en el gate del handler.
 *
 * 🔑 **`puedeSincronizar` va en `false` y no es un olvido**: traer las ventas del día al espejo
 * escribe en producción y hoy pide admin. Es la tanda que sigue.
 */
export function ResultadoSale() {
  const { marca } = useSesion()
  // 🔑 **Cada estado lleva ADENTRO de qué pedido es**, en vez de resetearse al arrancar el effect.
  // No es una vuelta: un `setX(null)` síncrono en el cuerpo de un `useEffect` lo rechaza el lint
  // (`react-hooks/set-state-in-effect`) y deja el CI en rojo. Y de paso cierra el agujero que el
  // reset tapaba a mano — mientras el pedido viejo no coincide con la marca de ahora, esto es
  // «cargando», y no hay un frame con los datos de la otra marca abajo del título de ésta.
  const [datos, setDatos] = useState<{ marca: string; campanias: Liquidacion[] } | null>(null)
  const [elegidaPorMano, setElegidaPorMano] = useState<string>('')
  const [items, setItems] = useState<{ clave: string; items: LiquidacionItem[] } | null>(null)
  const [error, setError] = useState<{ marca: string; msg: string } | null>(null)

  const campanias = datos?.marca === marca ? datos.campanias : null
  // La más nueva es la que se está mirando. `leerCampaniasParaResultado` ya viene ordenada por
  // `created_at desc` del servidor: elegir acá por fecha sería un segundo criterio de «cuál es la
  // última» al lado del que ya decidió el orden de la lista.
  const elegida = campanias?.some((c) => c.id === elegidaPorMano) ? elegidaPorMano : (campanias?.[0]?.id ?? '')
  const clave = `${marca}|${elegida}`

  useEffect(() => {
    let vivo = true
    leerCampaniasParaResultado(marca)
      .then((cs) => vivo && setDatos({ marca, campanias: cs }))
      .catch((e: unknown) => vivo && setError({ marca, msg: e instanceof Error ? e.message : String(e) }))
    return () => {
      vivo = false
    }
  }, [marca])

  useEffect(() => {
    if (!elegida) return
    let vivo = true
    leerItemsParaResultado(marca, elegida)
      .then((is) => vivo && setItems({ clave: `${marca}|${elegida}`, items: is }))
      .catch((e: unknown) => vivo && setError({ marca, msg: e instanceof Error ? e.message : String(e) }))
    return () => {
      vivo = false
    }
  }, [marca, elegida])

  if (error?.marca === marca) {
    return (
      <Notice tone="warning" icon="⚠" style={{ marginTop: space[4] }}>
        No pude leer el resultado de las liquidaciones: <b>{error.msg}</b>
      </Notice>
    )
  }

  if (campanias && !campanias.length) {
    return (
      <Card style={{ marginTop: space[4] }}>
        <EmptyState icon="🏷️" title="Todavía no hay ninguna campaña de sale en esta marca" hint="Cuando haya una, acá se ve qué se vendió de lo liquidado y si el precio llegó a estar puesto." />
      </Card>
    )
  }

  const campania = campanias?.find((c) => c.id === elegida) ?? null

  return (
    <div style={{ marginTop: space[6] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], marginBottom: space[4], flexWrap: 'wrap' }}>
        <span style={{ fontSize: font.xl, fontWeight: weight.bold, letterSpacing: -0.2, color: color.ink }}>Resultado del sale</span>
        {campanias && campanias.length > 1 && (
          <Select value={elegida} onChange={(e) => setElegidaPorMano(e.target.value)} style={{ maxWidth: 320 }}>
            {campanias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </Select>
        )}
      </div>
      {campania && items?.clave === clave ? (
        <Resultado campania={campania} items={items.items} puedeSincronizar={false} />
      ) : (
        <p style={{ fontSize: font.sm, color: color.mut2 }}>Buscando lo que se vendió…</p>
      )}
    </div>
  )
}
