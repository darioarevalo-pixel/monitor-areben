'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ordenarModelo } from '@/lib/conteo-deposito/core'
import { estadoDe, nombreGrupo, ordenDeposito, skuDeProducto, visiblesDeGrupo } from '@/lib/conteo-estandar/core'
import type { CeProducto, CeState } from '@/lib/conteo-estandar/tipos'
import { ChipEstado } from '@/components/conteos/comunes'
import { BuscarInput, Button, EmptyState, Notice, color, font, space } from '@/components/ui'

/**
 * «Depósito del local»: cargar el depósito a mano recorriendo el estante.
 *
 * El depósito del local está ordenado por SKU dentro de cada categoría, así que acá va todo en
 * una sola lista con ese orden (`ordenDeposito`), una categoría por vez (un desplegable con
 * anterior/siguiente: los chips ocupaban media pantalla del celular) y la casilla de depósito en
 * cada talle —Enter salta a la siguiente—. Solo se ven los productos con stock o ya cargados
 * (`visiblesDeGrupo`); el buscador llega a los que están en 0. Abrir producto por producto desde la lista era
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
  const grupos = useMemo(() => ordenDeposito(products).map((g) => ({ ...g, nombre: nombreGrupo(g.productos) })), [products])
  const [grupo, setGrupo] = useState<string>('')
  const [search, setSearch] = useState('')
  const contRef = useRef<HTMLDivElement>(null)
  const [escribiendo, setEscribiendo] = useState(false)

  // Solo las categorías con algo para contar (stock en sistema o algo ya cargado).
  const conStock = grupos.map((g) => ({ ...g, vis: visiblesDeGrupo(state, g.productos) })).filter((g) => g.vis.length)
  const idx = Math.max(0, conStock.findIndex((g) => g.grupo === grupo))
  const actual = conStock[idx]

  // El buscador mira la categoría elegida, incluidos los productos en 0 (lo que apareció en el
  // estante y el sistema no tiene). Si ahí no está, cae a todas las categorías.
  const q = search.trim().toLowerCase()
  const coincide = (p: CeProducto) => p.name.toLowerCase().includes(q) || p.variants.some((v) => String(v.sku || '').toLowerCase().includes(q))
  const enCategoria = q && actual ? grupos.find((g) => g.grupo === actual.grupo)!.productos.filter(coincide) : []
  const enOtras = q && !enCategoria.length ? grupos.flatMap((g) => g.productos).filter(coincide) : []
  const visibles = q ? (enCategoria.length ? enCategoria : enOtras) : actual?.vis || []

  if (!products.length) return <EmptyState icon="📦" title="Sin productos en el Local" dashed />

  const saltar = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    mover(contRef.current, e.currentTarget, 1)
  }

  const terminados = (g: { vis: CeProducto[] }) => g.vis.filter((p) => estadoDe(state, p.pid) === 'terminado').length
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
                  {g.nombre ? ` · ${g.nombre}` : ''} — {t}/{g.vis.length}
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
                · {terminados(actual)} de {actual.vis.length} terminados
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
            <TarjetaProducto key={p.pid} prod={p} st={state[p.pid]} estado={estadoDe(state, p.pid)} onDep={onDep} onAbrir={onAbrir} onEnter={saltar} />
          ))}
        </div>
      )}
      {escribiendo && <BarraTeclado cont={contRef} />}
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

/** Pasa el foco a la casilla de depósito `delta` lugares más allá, y la deja centrada. */
function mover(cont: HTMLElement | null, desde: Element | null, delta: number) {
  const ins = Array.from(cont?.querySelectorAll<HTMLInputElement>('input[data-dep]') || [])
  const i = desde ? ins.indexOf(desde as HTMLInputElement) : -1
  const sig = ins[i + delta]
  if (sig) {
    sig.focus()
    sig.select()
    sig.scrollIntoView({ block: 'center', behavior: 'smooth' })
  } else if (desde instanceof HTMLElement && delta > 0) desde.blur()
}

/**
 * 🔑 **El teclado numérico del iPhone no tiene Enter** (26-sep-2026, Bruno cargando desde el suyo:
 * «no me da la posibilidad de bajar»). Esta barra se pega ARRIBA del teclado mientras hay una
 * casilla con foco, con «Siguiente ↓» grande para bajar al talle siguiente sin tocar la lista.
 *
 * ⚠️ En iOS un `position: fixed; bottom: 0` queda TAPADO por el teclado: la altura real que queda
 * a la vista sale de `visualViewport`, y con eso se calcula el `bottom`.
 * ⚠️ Los botones hacen `preventDefault` en el `pointerdown`: si no, tocar el botón le saca el foco
 * a la casilla, el teclado se cierra y la barra desaparece antes del click.
 */
function BarraTeclado({ cont }: { cont: React.RefObject<HTMLDivElement | null> }) {
  const [abajo, setAbajo] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const calc = () => setAbajo(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    calc()
    vv.addEventListener('resize', calc)
    vv.addEventListener('scroll', calc)
    return () => {
      vv.removeEventListener('resize', calc)
      vv.removeEventListener('scroll', calc)
    }
  }, [])
  const sinPerderFoco = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault()
  const base: React.CSSProperties = {
    height: 44,
    borderRadius: 10,
    border: `1px solid ${color.line2}`,
    background: color.surface,
    color: color.ink,
    fontSize: 16,
    fontWeight: 600,
    padding: '0 14px',
  }
  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: abajo,
        zIndex: 1000,
        display: 'flex',
        gap: 8,
        padding: 8,
        background: color.bg2,
        borderTop: `1px solid ${color.line}`,
      }}
    >
      <button type="button" aria-label="Casilla anterior" onPointerDown={sinPerderFoco} onMouseDown={sinPerderFoco} onClick={() => mover(cont.current, document.activeElement, -1)} style={base}>
        ↑
      </button>
      <button
        type="button"
        onPointerDown={sinPerderFoco}
        onMouseDown={sinPerderFoco}
        onClick={() => mover(cont.current, document.activeElement, 1)}
        style={{ ...base, flex: 1, background: color.brandSolid, color: '#fff', border: 'none', fontWeight: 700 }}
      >
        Siguiente ↓
      </button>
      <button type="button" onPointerDown={sinPerderFoco} onMouseDown={sinPerderFoco} onClick={() => (document.activeElement as HTMLElement | null)?.blur()} style={base}>
        Listo
      </button>
    </div>,
    document.body,
  )
}
