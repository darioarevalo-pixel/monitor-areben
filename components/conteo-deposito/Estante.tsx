'use client'

import { useMemo, useRef, useState } from 'react'
import { estadoDe, ordenarModelo, visiblesDeGrupo } from '@/lib/conteo-deposito/core'
import { nombreGrupo, ordenDeposito, skuDeProducto } from '@/lib/conteo-estandar/core'
import type { CdepProducto, CdepState } from '@/lib/conteo-deposito/tipos'
import { ChipEstado } from '@/components/conteos/comunes'
import { BarraTeclado, mover } from '@/components/conteo-estandar/DepositoLocal'
import { BuscarInput, Button, EmptyState, Notice, color, font, space } from '@/components/ui'

/**
 * Conteo de Depósito «Por estante» (solo Zattia, 30-sep-2026).
 *
 * El mismo molde que el «Depósito del local» del conteo estándar: una categoría (prefijo del
 * SKU) por vez, los productos de menor a mayor SKU —caminar el estante—, y una casilla por talle
 * con «Siguiente ↓». Solo se ven los que el sistema dice que tienen stock (o ya cargados); el
 * buscador llega a los que están en 0, para lo que aparece en el estante y el sistema no tiene.
 * Acá hay UNA casilla: lo contado (en el local son dos: exhibido + depósito).
 */
export function Estante({
  products,
  state,
  onSet,
  onTerminarGrupo,
  onAbrir,
}: {
  products: CdepProducto[]
  state: CdepState
  onSet: (prod: CdepProducto, vid: string, val: string) => void
  onTerminarGrupo: (productos: CdepProducto[], grupo: string) => void
  onAbrir: (pid: string) => void
}) {
  const grupos = useMemo(() => ordenDeposito(products).map((g) => ({ ...g, nombre: nombreGrupo(g.grupo) })), [products])
  const [grupo, setGrupo] = useState<string>('')
  const [search, setSearch] = useState('')
  const contRef = useRef<HTMLDivElement>(null)
  const [escribiendo, setEscribiendo] = useState(false)

  const conStock = grupos.map((g) => ({ ...g, vis: visiblesDeGrupo(state, g.productos) })).filter((g) => g.vis.length)
  const idx = Math.max(0, conStock.findIndex((g) => g.grupo === grupo))
  const actual = conStock[idx]

  // El buscador mira la categoría elegida, incluidos los productos en 0. Si ahí no está, cae a todas.
  const q = search.trim().toLowerCase()
  const coincide = (p: CdepProducto) => p.name.toLowerCase().includes(q) || p.variants.some((v) => String(v.sku || '').toLowerCase().includes(q))
  const enCategoria = q && actual ? grupos.find((g) => g.grupo === actual.grupo)!.productos.filter(coincide) : []
  const enOtras = q && !enCategoria.length ? grupos.flatMap((g) => g.productos).filter(coincide) : []
  const visibles = q ? (enCategoria.length ? enCategoria : enOtras) : actual?.vis || []

  if (!products.length) return <EmptyState icon="📦" title="Sin productos en el depósito" dashed />

  const saltar = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    mover(contRef.current, e.currentTarget, 1)
  }
  const terminados = (g: { vis: CdepProducto[] }) => g.vis.filter((p) => estadoDe(state, p.pid) === 'terminado').length
  const ir = (i: number) => {
    const g = conStock[i]
    if (!g) return
    setGrupo(g.grupo)
    setSearch('')
  }

  return (
    <div>
      <p style={{ fontSize: font.sm, color: color.mut, marginBottom: space[3] }}>
        Mismo orden que el estante: una categoría por vez, por SKU de menor a mayor. Se ven los productos que el sistema dice que tienen stock; si aparece otro en el estante, buscalo y cargalo.
        La casilla en blanco cuenta como <b>0</b> cuando se termina el producto.
      </p>

      {actual && (
        <div style={{ display: 'flex', gap: space[2], alignItems: 'center', marginBottom: space[2] }}>
          <Button variant="outline" onClick={() => ir(idx - 1)} disabled={idx === 0} aria-label="Categoría anterior">
            ‹
          </Button>
          <select
            className="mo-input"
            value={actual.grupo}
            onChange={(e) => ir(conStock.findIndex((g) => g.grupo === e.target.value))}
            aria-label="Categoría"
            style={{ flex: 1, minWidth: 0, height: 44, fontSize: 16, fontWeight: 600 }}
          >
            {conStock.map((g) => {
              const t = terminados(g)
              return (
                <option key={g.grupo} value={g.grupo}>
                  {t === g.vis.length ? '✓ ' : ''}
                  {g.grupo}
                  {g.nombre ? ` · ${g.nombre}` : ''} — {t} de {g.vis.length} prod.
                </option>
              )
            })}
          </select>
          <Button variant="outline" onClick={() => ir(idx + 1)} disabled={idx >= conStock.length - 1} aria-label="Categoría siguiente">
            ›
          </Button>
        </div>
      )}

      <div style={{ marginBottom: space[3] }}>
        <BuscarInput value={search} onChange={setSearch} placeholder={actual ? `Buscar en ${actual.grupo} (también los que están en 0)…` : 'Buscá producto o SKU…'} />
      </div>

      {q ? (
        !enCategoria.length && enOtras.length > 0 && actual ? (
          <Notice tone="warning" icon="🔎" style={{ marginBottom: space[3] }}>
            No está en {actual.grupo}. Esto coincide en otras categorías.
          </Notice>
        ) : null
      ) : (
        actual && (
          <Notice tone={terminados(actual) === actual.vis.length ? 'success' : 'neutral'} icon="🗂️" style={{ marginBottom: space[3] }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
              <span>
                <b>
                  {actual.grupo}
                  {actual.nombre ? ` · ${actual.nombre}` : ''}
                </b>{' '}
                · {terminados(actual)} de {actual.vis.length} {actual.vis.length === 1 ? 'producto terminado' : 'productos terminados'}
              </span>
              <Button size="sm" variant="solid" tone="brand" onClick={() => onTerminarGrupo(actual.vis, actual.grupo)}>
                ✓ Terminar categoría
              </Button>
            </div>
          </Notice>
        )
      )}

      {!visibles.length ? (
        <EmptyState icon="🔍" title="No hay productos que coincidan" dashed />
      ) : (
        <div ref={contRef} onFocus={() => setEscribiendo(true)} onBlur={() => setEscribiendo(false)} style={{ display: 'flex', flexDirection: 'column', gap: space[3], maxWidth: 640 }}>
          {visibles.map((p) => (
            <Tarjeta key={p.pid} prod={p} st={state[p.pid]} estado={estadoDe(state, p.pid)} onSet={onSet} onAbrir={onAbrir} onEnter={saltar} />
          ))}
        </div>
      )}
      {escribiendo && <BarraTeclado cont={contRef} />}
    </div>
  )
}

const BORDE_ESTADO = { sin_iniciar: color.line2, en_progreso: color.warning, terminado: color.success } as const
const COLS = '1fr 52px 84px 48px'

/** Un producto = una tarjeta, con el SKU grande arriba (lo que está escrito en el estante). */
function Tarjeta({
  prod,
  st,
  estado,
  onSet,
  onAbrir,
  onEnter,
}: {
  prod: CdepProducto
  st: CdepState[string] | undefined
  estado: ReturnType<typeof estadoDe>
  onSet: (prod: CdepProducto, vid: string, val: string) => void
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
        <span style={{ textAlign: 'center' }}>Contado</span>
        <span style={{ textAlign: 'center' }}>Dif</span>
      </div>
      {vars.map((v, i) => {
        const sis = st?.snap?.[v.vid] != null ? st.snap[v.vid] : v.esperado
        const con = st?.contado?.[v.vid] != null ? st.contado[v.vid] : null
        const dif = con == null ? null : con - sis
        const difCol = dif == null ? color.mut2 : dif === 0 ? color.successInk : dif < 0 ? color.dangerInk : color.warningInk
        return (
          <div
            key={v.vid}
            style={{ display: 'grid', gridTemplateColumns: COLS, gap: space[2], alignItems: 'center', padding: `4px ${space[3]}`, borderTop: i ? `1px solid ${color.line}` : undefined }}
          >
            <span style={{ fontWeight: 600, color: color.ink2 }}>{v.size}</span>
            <span style={{ textAlign: 'center', color: color.mut }}>{sis}</span>
            <input
              data-dep=""
              className="mo-input mo-input--num"
              type="number"
              min={0}
              inputMode="numeric"
              enterKeyHint="next"
              value={con != null ? con : ''}
              placeholder="—"
              aria-label={`Contado de ${prod.name} talle ${v.size}`}
              onChange={(ev) => onSet(prod, v.vid, ev.target.value)}
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
