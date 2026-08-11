'use client'

/**
 * **Cupones y canjes**: las dos cosas que el mostrador entrega por fuera de una venta normal.
 *
 * Son dos módulos sin ninguna relación técnica —los cupones viven en el KV de `bdi-catalogo` y los
 * canjes en Supabase— pero para quien atiende son el mismo trabajo: alguien llega, se fija en la
 * lista si le corresponde algo, y se lo da. Por eso comparten sección en vez de sumar una entrada
 * más al menú.
 *
 * La pestaña de canjes **sólo aparece en BDI**: es la única marca con local, y en Zattia una
 * pestaña vacía sería una promesa falsa.
 */

import { useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Tabs, space, type TabItem } from '@/components/ui'
import { retiroLocalDisponible } from '@/lib/canjes/tipos'
import { CanjesLocal } from './CanjesLocal'
import { ListaCupones } from './ListaCupones'

export function Cupones() {
  const { marca } = useSesion()
  const hayCanjes = retiroLocalDisponible(marca)
  const [tab, setTab] = useState<'cupones' | 'canjes'>('cupones')

  if (!hayCanjes) return <ListaCupones />

  const items: TabItem[] = [
    { key: 'cupones', label: 'Cupones' },
    { key: 'canjes', label: 'Canjes', hint: 'Las creadoras que pasan a buscar lo suyo por el local' },
  ]

  return (
    <>
      <div style={{ marginBottom: space[4] }}>
        <Tabs items={items} value={tab} onChange={(k) => setTab(k as typeof tab)} variant="underline" />
      </div>
      {tab === 'cupones' ? <ListaCupones /> : <CanjesLocal />}
    </>
  )
}
