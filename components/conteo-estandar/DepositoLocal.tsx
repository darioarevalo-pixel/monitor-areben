'use client'

import { Fragment, useMemo, useRef, useState } from 'react'
import { ordenarModelo } from '@/lib/conteo-deposito/core'
import { estadoDe, ordenDeposito } from '@/lib/conteo-estandar/core'
import type { CeProducto, CeState } from '@/lib/conteo-estandar/tipos'
import { ChipEstado } from '@/components/conteos/comunes'
import { BuscarInput, Button, Chips, EmptyState, FilterBar, Notice, TBody, THead, TableWrap, Td, Th, Tr, color, font, space } from '@/components/ui'

/**
 * «Depósito del local»: cargar el depósito a mano recorriendo el estante.
 *
 * El depósito del local está ordenado por SKU dentro de cada categoría, así que acá va todo en
 * una sola lista con ese orden (`ordenDeposito`), un chip por categoría y la casilla de depósito
 * en cada talle —Enter salta a la siguiente—. Abrir producto por producto desde la lista era
 * eterno. Lo exhibido se sigue escaneando en la otra vista y acá sólo se ve.
 */
export function DepositoLocal({
  products,
  state,
  onDep,
  onTerminarGrupo,
  onAbrir,
}: {
  products: CeProducto[]
  state: CeState
  onDep: (prod: CeProducto, vid: string, val: string) => void
  onTerminarGrupo: (productos: CeProducto[], grupo: string) => void
  onAbrir: (pid: string) => void
}) {
  const grupos = useMemo(() => ordenDeposito(products), [products])
  const [grupo, setGrupo] = useState<string>(() => grupos[0]?.grupo || '')
  const [search, setSearch] = useState('')
  const contRef = useRef<HTMLDivElement>(null)

  const q = search.trim().toLowerCase()
  const actual = grupos.find((g) => g.grupo === grupo) || grupos[0]
  // Con búsqueda se mira en todas las categorías; sin búsqueda, la del chip.
  const visibles = q
    ? grupos.flatMap((g) => g.productos).filter((p) => p.name.toLowerCase().includes(q) || p.variants.some((v) => String(v.sku || '').toLowerCase().includes(q)))
    : actual?.productos || []

  if (!products.length) return <EmptyState icon="📦" title="Sin productos en el Local" dashed />

  const saltar = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const ins = Array.from(contRef.current?.querySelectorAll<HTMLInputElement>('input[data-dep]') || [])
    const i = ins.indexOf(e.currentTarget)
    const sig = ins[i + 1]
    if (sig) {
      sig.focus()
      sig.select()
    } else e.currentTarget.blur()
  }

  const terminadosGrupo = actual ? actual.productos.filter((p) => estadoDe(state, p.pid) === 'terminado').length : 0

  return (
    <div>
      <p style={{ fontSize: font.sm, color: color.mut, marginBottom: space[3] }}>
        Mismo orden que el estante: por SKU, de menor a mayor, una categoría por vez. Cargá lo que hay en el depósito del local; lo exhibido se escanea en la otra vista y acá solo se ve.
        La casilla en blanco cuenta como <b>0</b> cuando se termina el producto.
      </p>

      <FilterBar>
        <BuscarInput value={search} onChange={setSearch} placeholder="Buscá producto o SKU…" />
      </FilterBar>
      {!q && (
        <div style={{ marginBottom: space[3] }}>
          <Chips<string>
            value={actual?.grupo || ''}
            onChange={setGrupo}
            opciones={grupos.map((g) => ({
              key: g.grupo,
              label: g.grupo,
              n: g.productos.length,
              title: `${g.productos.filter((p) => estadoDe(state, p.pid) === 'terminado').length} de ${g.productos.length} terminados`,
            }))}
          />
        </div>
      )}

      {!q && actual && (
        <Notice tone="neutral" icon="🗂️" style={{ marginBottom: space[3] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
            <span>
              <b>{actual.grupo}</b> · {terminadosGrupo} de {actual.productos.length} terminados
            </span>
            <Button size="sm" variant="solid" tone="brand" onClick={() => onTerminarGrupo(actual.productos, actual.grupo)}>
              ✓ Terminar categoría
            </Button>
          </div>
        </Notice>
      )}

      {!visibles.length ? (
        <EmptyState icon="🔍" title="No hay productos que coincidan" dashed />
      ) : (
        <div ref={contRef}>
          <TableWrap maxHeight="62vh">
            <THead>
              <Tr>
                <Th>Talle</Th>
                <Th align="center" width={60}>
                  Sist.
                </Th>
                <Th align="center" width={60}>
                  🔫 Exhib.
                </Th>
                <Th align="center" width={90}>
                  ✍️ Depósito
                </Th>
                <Th align="center" width={56}>
                  Dif
                </Th>
              </Tr>
            </THead>
            <TBody>
              {visibles.map((p) => {
                const st = state[p.pid]
                const e = estadoDe(state, p.pid)
                const vars = p.variants.slice().sort((a, b) => ordenarModelo(a.size, b.size))
                return (
                  <Fragment key={p.pid}>
                    <Tr style={{ background: color.bg }}>
                      <Td colSpan={5} wrap>
                        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', justifyContent: 'space-between' }}>
                          <span>
                            <b style={{ color: color.ink }}>{p.name}</b>{' '}
                            <span style={{ fontSize: font.xs, color: color.mut2 }}>{vars[0]?.sku || 'sin SKU'}</span>
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                            <ChipEstado e={e} />
                            <Button size="sm" variant="ghost" onClick={() => onAbrir(p.pid)}>
                              Abrir
                            </Button>
                          </span>
                        </div>
                      </Td>
                    </Tr>
                    {vars.map((v) => {
                      const sis = st?.snap?.[v.vid] != null ? st.snap[v.vid] : v.esperado
                      const ex = st?.exhibido?.[v.vid] || 0
                      const dep = st?.deposito?.[v.vid] != null ? st.deposito[v.vid] : null
                      const tocada = ex > 0 || dep != null
                      const dif = tocada ? ex + (dep || 0) - sis : null
                      const difCol = dif == null ? color.mut2 : dif === 0 ? color.successInk : dif < 0 ? color.dangerInk : color.warningInk
                      return (
                        <Tr key={v.vid}>
                          <Td strong>{v.size}</Td>
                          <Td align="center" style={{ color: color.mut2 }}>
                            {sis}
                          </Td>
                          <Td align="center" style={{ color: ex ? color.ink2 : color.mut2 }}>
                            {ex || '—'}
                          </Td>
                          <Td align="center" tall>
                            <input
                              data-dep=""
                              className="mo-input mo-input--num"
                              type="number"
                              min={0}
                              inputMode="numeric"
                              enterKeyHint="next"
                              value={dep != null ? dep : ''}
                              placeholder="—"
                              aria-label={`Depósito de ${p.name} talle ${v.size}`}
                              onChange={(ev) => onDep(p, v.vid, ev.target.value)}
                              onKeyDown={saltar}
                              style={{ width: 72, textAlign: 'center', padding: '0 6px', fontWeight: 700 }}
                            />
                          </Td>
                          <Td align="center" style={{ fontWeight: 700, color: difCol }}>
                            {dif == null ? '—' : (dif > 0 ? '+' : '') + dif}
                          </Td>
                        </Tr>
                      )
                    })}
                  </Fragment>
                )
              })}
            </TBody>
          </TableWrap>
        </div>
      )}
    </div>
  )
}
