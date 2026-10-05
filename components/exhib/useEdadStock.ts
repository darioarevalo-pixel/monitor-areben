'use client'

import { useEffect, useState } from 'react'
import type { Marca } from '@/lib/nav'
import { ultimoSyncStock } from '@/lib/sync-gn'

/**
 * 🔴 **De cuándo es el stock contra el que se está comparando.** El espejo se actualiza **una vez
 * por día, a las 3 de la mañana**, y el local vende **~160 unidades por día**: una lista hecha a la
 * tarde contra esa foto manda a buscar prendas que se vendieron a la mañana. Lo usan el balance del
 * sector y el cierre del relevamiento.
 *
 * ⚠️ Se vuelve a preguntar cuando `items` cambia, que es lo que pasa después de traer el stock: así
 * el cartel se corrige solo en vez de quedar mostrando la hora vieja.
 *
 * `undefined` = todavía ⛔ se sabe · `null` = ⛔ hay dato.
 */
export function useEdadStock(marca: Marca, items: unknown) {
  const [stockDe, setStockDe] = useState<{ fecha: Date; horas: number } | null | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    void ultimoSyncStock(marca).then((fecha) => {
      // ⚠️ La antigüedad se calcula **acá**, cuando se pregunta, y ⛔ no en el render: leer el reloj
      // mientras se dibuja da un número que cambia solo en cada re-dibujo (y el lint lo prohíbe).
      if (vivo) setStockDe(fecha ? { fecha, horas: (Date.now() - fecha.getTime()) / 36e5 } : null)
    })
    return () => {
      vivo = false
    }
  }, [marca, items])

  // 🔑 Dos horas es el corte, y sale de la venta real: a ~160 unidades por día, dos horas de local
  // abierto son unas 20 prendas que la foto ⛔ no conoce. Abajo de eso, el ruido ⛔ no cambia una
  // lista; arriba, sí. ⚠️ Y **no saber ⛔ no es estar al día**: sin dato, se avisa igual.
  const stockViejo = !stockDe || stockDe.horas > 2
  const texto =
    stockDe === undefined ? 'Stock…' : stockDe === null ? '⚠️ Stock de hora desconocida' : stockDe.horas < 1 ? '✓ Stock de recién' : `⚠️ Stock de hace ${Math.round(stockDe.horas)} h`
  return { stockDe, stockViejo, texto }
}
