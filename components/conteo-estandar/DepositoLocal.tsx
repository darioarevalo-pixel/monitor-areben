'use client'

import { useMemo, useRef, useState } from 'react'
import { ordenarModelo } from '@/lib/conteo-deposito/core'
import { estadoDe, ordenDeposito, skuDeProducto } from '@/lib/conteo-estandar/core'
import type { CeProducto, CeState } from '@/lib/conteo-estandar/tipos'
import { ChipEstado } from '@/components/conteos/comunes'
import { BuscarInput, Button, Chips, EmptyState, FilterBar, Notice, color, font, space } from '@/components/ui'

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
        <div ref={contRef} style={{ display: 'flex', flexDirection: 'column', gap: space[3], maxWidth: 640 }}>
          {visibles.map((p) => (
            <TarjetaProducto key={p.pid} prod={p} st={state[p.pid]} estado={estadoDe(state, p.pid)} onDep={onDep} onAbrir={onAbrir} onEnter={saltar} />
          ))}
        </div>
      )}
    </div>
  )
}

const BORDE_ESTADO = { sin_iniciar: color.line2, en_progreso: color.warning, terminado: color.success } as const
const COLS = '1fr 44px 52px 76px 44px'

/**
 * Un producto = una tarjeta. La franja de arriba lleva el SKU del producto grande (categoría +
 * número, `RTO-0013`: es lo que está escrito en el estante) y el borde izquierdo el estado, así
 * de un vistazo se ve dónde empieza cada producto y cuáles faltan.
 */
function TarjetaProducto({
  prod,
  st,
  estado,
  onDep,
  onAbrir,
  onEnter,
}: {
  prod: CeProducto
  st: CeState[string] | undefined
  estado: ReturnType<typeof estadoDe>
  onDep: (prod: CeProducto, vid: string, val: string) => void
  onAbrir: (pid: string) => void
  onEnter: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  const vars = prod.variants.slice().sort((a, b) => ordenarModelo(a.size, b.size))
  const sku = skuDeProducto(prod)
  return (
    <div
      style={{
        background: color.surface,
        border: `1px solid ${color.line}`,
        borderLeft: `5px solid ${BORDE_ESTADO[estado] || color.line2}`,
        borderRadius: 'var(--mo-r-xl)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[2]} ${space[3]}`, background: color.brandBg, flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: 'var(--mo-font-mono, ui-monospace, monospace)',
            fontWeight: 800,
            fontSize: font.md,
            color: '#fff',
            background: color.brandSolid,
            borderRadius: 6,
            padding: '2px 8px',
            letterSpacing: 0.3,
          }}
        >
          {sku || 'sin SKU'}
        </span>
        <b style={{ color: color.ink, fontSize: font.base, flex: 1, minWidth: 120 }}>{prod.name}</b>
        <ChipEstado e={estado} />
        <Button size="sm" variant="ghost" onClick={() => onAbrir(prod.pid)}>
          Abrir
        </Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: space[2], padding: `6px ${space[3]} 2px`, fontSize: font.xs, color: color.mut2, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        <span>Talle</span>
        <span style={{ textAlign: 'center' }}>Sist.</span>
        <span style={{ textAlign: 'center' }}>Exhib.</span>
        <span style={{ textAlign: 'center' }}>Depósito</span>
        <span style={{ textAlign: 'center' }}>Dif</span>
      </div>
      {vars.map((v, i) => {
        const sis = st?.snap?.[v.vid] != null ? st.snap[v.vid] : v.esperado
        const ex = st?.exhibido?.[v.vid] || 0
        const dep = st?.deposito?.[v.vid] != null ? st.deposito[v.vid] : null
        const tocada = ex > 0 || dep != null
        const dif = tocada ? ex + (dep || 0) - sis : null
        const difCol = dif == null ? color.mut2 : dif === 0 ? color.successInk : dif < 0 ? color.dangerInk : color.warningInk
        return (
          <div
            key={v.vid}
            style={{
              display: 'grid',
              gridTemplateColumns: COLS,
              gap: space[2],
              alignItems: 'center',
              padding: `4px ${space[3]}`,
              borderTop: i ? `1px solid ${color.line}` : undefined,
            }}
          >
            <span style={{ fontWeight: 600, color: color.ink2 }}>{v.size}</span>
            <span style={{ textAlign: 'center', color: color.mut }}>{sis}</span>
            <span style={{ textAlign: 'center', color: ex ? color.ink2 : color.mut2 }}>{ex || '—'}</span>
            <input
              data-dep=""
              className="mo-input mo-input--num"
              type="number"
              min={0}
              inputMode="numeric"
              enterKeyHint="next"
              value={dep != null ? dep : ''}
              placeholder="—"
              aria-label={`Depósito de ${prod.name} talle ${v.size}`}
              onChange={(ev) => onDep(prod, v.vid, ev.target.value)}
              onKeyDown={onEnter}
              style={{ width: '100%', height: 40, textAlign: 'center', padding: '0 4px', fontWeight: 700, fontSize: 16 }}
            />
            <span style={{ textAlign: 'center', fontWeight: 700, color: difCol }}>{dif == null ? '—' : (dif > 0 ? '+' : '') + dif}</span>
          </div>
        )
      })}
    </div>
  )
}
