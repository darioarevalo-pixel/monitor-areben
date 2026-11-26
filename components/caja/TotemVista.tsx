'use client'

/**
 * El DIBUJO del tótem (`CajaTotem.tsx` lee y calcula; acá sólo se pinta). Diseño aprobado por Bruno el 26-nov, maqueta v5
 * (https://claude.ai/artifact/HDeepcYaCugE1MLA4KbJ85):
 * - Colores de la TIENDA, ⛔ los del monitor (es para la clienta): blanco y negro. Tipografía Montserrat.
 * - Fotos que pasan solas con barras tipo historias y zoom lento · el panel entra escalonado · el precio de antes se tacha
 *   solo · el chip del % aparece · en Black Friday una cinta negra corre abajo de la foto. Todo respeta `prefers-reduced-motion`.
 * - Toda prenda: precio grande + 3 cuadros IGUALES (tarjeta en 3 cuotas, transferencia, efectivo), ⛔ priorizar el efectivo.
 * - La bikini: «Llevá 2 / Llevá 3 o más: EXTRA N% OFF» (⛔ desglosado por forma de pago), sólo si la Caja lo cobra HOY.
 */

import { useEffect, useRef, useState } from 'react'
import type { Variante } from '@/lib/caja/cliente'
import type { ProductoLista } from '@/lib/caja/cliente'
import type { LogoTicket } from '@/lib/caja/ticket'
import { plata } from '@/lib/caja/ticket'
import { BLACK_FRIDAY, type ColorTotem, type PrecioTotem } from '@/lib/caja/totem'
import { nombreDeColor } from '@/lib/caja/pantalla-cliente'
import { MARCA_CAJA } from '@/lib/caja/marca'

export type Resultado = {
  variante: Variante
  /** El nombre que se ve: el de la prenda, o el de la bikini («Bikini MADDIE · Sky»). */
  nombre: string
  /** «Bikini», arriba del nombre; null para el resto. */
  tipo: string | null
  fotos: string[]
  precio: PrecioTotem | null
  talles: { talle: string; hay: boolean }[]
  colores: ColorTotem[]
  colorActual: string | null
  /** 🩱 Las partes de la bikini con sus talles («Corpiño S M L»). Vacío para una prenda. */
  partes: { rotulo: string; product_id: number; talles: { talle: string; hay: boolean }[] }[]
  /** El descuento por cantidad que la Caja cobra HOY a esta prenda; null si ninguno. */
  escalera: { desde: number; pct: number }[] | null
  bikini: boolean
  stock: 'confirmando' | 'confirmado' | 'sin-confirmar'
}
/** Lo que ve la encargada al pasar su tarjeta. */
export type Ubicacion = { que: 'buscando' } | { que: 'falla' } | { que: 'ok'; atras: string[]; deposito: number; local: number }

export const TOTEM_FUENTE = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap'

const FOTO_MS = 3200

export const TOTEM_CSS = `
.totem { --ink: #0e0e0e; --mut: #75747a; --line: #e7e6e4; --soft: #f5f4f2; background: #fff; color: var(--ink);
  font-family: Montserrat, system-ui, -apple-system, sans-serif; --u: min(1vw, 1.6vh); }
.totem button { height: auto; }
.totem-prueba { margin: 8px 16px; padding: 8px 12px; font: inherit; font-size: 18px; border: 1.5px dashed #c9c8c4; border-radius: 12px; }
.totem-top { flex: none; display: flex; justify-content: space-between; align-items: center; padding: calc(var(--u) * 1.4) calc(var(--u) * 2.6); border-bottom: 1px solid var(--line); }
.totem-logo { font-weight: 800; font-size: calc(var(--u) * 2.2); letter-spacing: .3em; text-transform: uppercase; }
.totem-top > span:last-child { font-size: calc(var(--u) * 1.3); color: var(--mut); letter-spacing: .06em; text-transform: uppercase; }

.totem-prenda { flex: 1; min-height: 0; min-width: 0; display: grid; position: relative; grid-template-columns: minmax(0, 57fr) minmax(0, 43fr); grid-template-rows: minmax(0, 1fr); }
@media (max-aspect-ratio: 1/1) { .totem-prenda { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 42fr) minmax(0, 58fr); } .totem { --u: min(1.9vw, 1.2vh); } }

.totem-foto { position: relative; overflow: hidden; min-height: 0; background: var(--soft); touch-action: pan-y; }
.totem-foto img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; user-select: none; opacity: 0; transition: opacity .9s ease; }
.totem-foto img.on { opacity: 1; animation: totem-kb 6s ease-out forwards; }
@keyframes totem-kb { from { transform: scale(1); } to { transform: scale(1.06) translate(-1%, -.6%); } }
.totem-historias { position: absolute; top: calc(var(--u) * 1.4); left: calc(var(--u) * 1.6); right: calc(var(--u) * 1.6); display: flex; gap: calc(var(--u) * .5); z-index: 3; }
.totem-historias b { flex: 1; height: max(3px, calc(var(--u) * .3)); background: rgba(0, 0, 0, .14); border-radius: 9px; overflow: hidden; }
.totem-historias b i { display: block; height: 100%; width: 0; background: var(--ink); }
.totem-historias b.hecha i { width: 100%; }
.totem-historias b.corre i { animation: totem-llenar ${FOTO_MS}ms linear forwards; }
@keyframes totem-llenar { to { width: 100%; } }

.totem-cinta { position: absolute; left: 0; right: 0; bottom: 0; background: #000; color: #fff; overflow: hidden; z-index: 3; padding: calc(var(--u) * .9) 0; white-space: nowrap; }
.totem-cinta span { display: inline-block; font-weight: 800; font-size: calc(var(--u) * 1.5); letter-spacing: .2em; animation: totem-cinta 16s linear infinite; }
@keyframes totem-cinta { to { transform: translateX(-50%); } }

.totem-panel { padding: calc(var(--u) * 2.2) calc(var(--u) * 2.6); display: grid; align-content: center; gap: calc(var(--u) * 1.15); min-width: 0; min-height: 0; overflow-y: auto; }
.totem-panel > * { animation: totem-sube .6s cubic-bezier(.2, .7, .2, 1) both; }
.totem-panel > *:nth-child(2) { animation-delay: .07s; } .totem-panel > *:nth-child(3) { animation-delay: .14s; } .totem-panel > *:nth-child(4) { animation-delay: .21s; }
.totem-panel > *:nth-child(5) { animation-delay: .28s; } .totem-panel > *:nth-child(6) { animation-delay: .35s; } .totem-panel > *:nth-child(7) { animation-delay: .42s; } .totem-panel > *:nth-child(8) { animation-delay: .49s; }
@keyframes totem-sube { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.totem-ceja { display: flex; gap: calc(var(--u) * .6); align-items: center; font-size: calc(var(--u) * 1); letter-spacing: .14em; text-transform: uppercase; color: var(--mut); font-weight: 600; margin: 0; }
.totem-ceja .bf { background: #000; color: #fff; padding: calc(var(--u) * .25) calc(var(--u) * .7); border-radius: 99px; letter-spacing: .12em; }
.totem-nombre { font-weight: 800; font-size: calc(var(--u) * 3.4); letter-spacing: -.01em; line-height: .98; margin: 0; text-transform: uppercase; text-wrap: balance; }
.totem-chips { display: flex; flex-wrap: wrap; gap: calc(var(--u) * .55); align-items: center; }
.totem-chips > small { font-size: calc(var(--u) * 1); color: var(--mut); text-transform: uppercase; letter-spacing: .1em; font-weight: 600; min-width: calc(var(--u) * 7.5); }
.totem-chip { border: 1.5px solid var(--ink); font-weight: 700; font-size: calc(var(--u) * 1.2); min-width: calc(var(--u) * 3.1); height: calc(var(--u) * 3.1); display: inline-grid; place-items: center; padding: 0 calc(var(--u) * .8); border-radius: 99px; background: #fff; color: var(--ink); font-family: inherit; }
.totem-chip.no { border: 1.5px dashed #cac9c5; color: #b3b2ae; text-decoration: line-through; }
.totem-chip.vacio { border: none; background: var(--soft); }
.totem-chip.color { gap: calc(var(--u) * .5); display: inline-flex; cursor: pointer; }
.totem-chip.color[aria-pressed="true"] { box-shadow: inset 0 0 0 1.5px var(--ink); }
.totem-chip.color i { width: calc(var(--u) * 1.6); height: calc(var(--u) * 1.6); border-radius: 50%; border: 1px solid rgba(0, 0, 0, .12); background-size: cover; background-position: center; flex: none; }

.totem-precio { display: flex; align-items: center; gap: calc(var(--u) * 1.1); flex-wrap: wrap; }
.totem-precio strong { font-weight: 800; font-size: calc(var(--u) * 5); letter-spacing: -.02em; line-height: .9; font-variant-numeric: tabular-nums; }
.totem-antes { position: relative; font-size: calc(var(--u) * 1.7); color: var(--mut); font-variant-numeric: tabular-nums; }
.totem-antes::after { content: ""; position: absolute; left: -4%; top: 52%; height: 2px; width: 108%; background: var(--ink); transform-origin: left; animation: totem-tacha .5s .55s ease-out both; }
@keyframes totem-tacha { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.totem-pct { display: inline-flex; align-items: center; font-weight: 800; font-size: calc(var(--u) * 1.15); padding: calc(var(--u) * .3) calc(var(--u) * .8); border-radius: 99px; font-variant-numeric: tabular-nums; background: var(--ink); color: #fff; white-space: nowrap; font-style: normal; }
.totem-pct.l { background: transparent; color: var(--ink); box-shadow: inset 0 0 0 1.5px var(--ink); }
.totem-precio .totem-pct { animation: totem-pop .45s .8s cubic-bezier(.3, 1.6, .5, 1) both; }
@keyframes totem-pop { from { transform: scale(.4); opacity: 0; } to { transform: none; opacity: 1; } }

.totem-pagos { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); grid-auto-flow: column; gap: calc(var(--u) * .6); }
.totem-pagos > div { border: 1px solid var(--line); border-radius: calc(var(--u) * 1); padding: calc(var(--u) * .9) calc(var(--u) * 1); display: grid; gap: calc(var(--u) * .4); align-content: start; background: var(--soft); }
.totem-pagos .m { white-space: nowrap; font-size: calc(var(--u) * 1.05); color: var(--mut); font-weight: 600; }
.totem-pagos .f { display: flex; align-items: center; min-height: calc(var(--u) * 2.6); font-size: calc(var(--u) * .95); line-height: 1.15; color: var(--mut); font-weight: 600; }
.totem-pagos b { font-weight: 700; font-size: calc(var(--u) * 2.1); font-variant-numeric: tabular-nums; line-height: 1; }
.totem-pagos .totem-pct { font-size: calc(var(--u) * .95); padding: calc(var(--u) * .2) calc(var(--u) * .6); }

.totem-mas { display: grid; gap: calc(var(--u) * .6); }
.totem-mas h3 { margin: 0; font-size: calc(var(--u) * 1.05); letter-spacing: .12em; text-transform: uppercase; color: var(--mut); font-weight: 600; }
.totem-mas > div { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); grid-auto-flow: column; gap: calc(var(--u) * .6); }
.totem-mas > div > div { border: 1.5px solid var(--ink); border-radius: calc(var(--u) * 1.1); padding: calc(var(--u) * 1) calc(var(--u) * 1.2); display: grid; gap: calc(var(--u) * .35); }
.totem-mas > div > div:last-child { background: var(--ink); color: #fff; }
.totem-mas span { font-size: calc(var(--u) * 1.15); font-weight: 600; }
.totem-mas strong { font-size: calc(var(--u) * 2.3); line-height: 1; font-weight: 800; }
.totem-nota { font-size: calc(var(--u) * 1.15); color: var(--mut); margin: 0; }
.totem-aviso { background: var(--soft); border-radius: calc(var(--u) * 1); padding: calc(var(--u) * 1.2); font-size: calc(var(--u) * 1.5); font-weight: 600; }
.totem-encargada { background: var(--ink); color: #fff; border-radius: calc(var(--u) * 1); padding: calc(var(--u) * 1.2); display: grid; gap: 4px; font-size: calc(var(--u) * 1.4); }
.totem-encargada strong { font-size: calc(var(--u) * 2.2); }

.totem-barra { position: absolute; left: 0; right: 0; bottom: 0; height: max(4px, calc(var(--u) * .35)); background: var(--line); z-index: 4; }
.totem-barra i { display: block; height: 100%; width: 100%; background: var(--ink); transform-origin: left; animation: totem-vaciar linear forwards; }
@keyframes totem-vaciar { to { transform: scaleX(0); } }

.totem-espera { flex: 1; display: grid; place-items: center; align-content: center; gap: calc(var(--u) * 2.4); text-align: center; position: relative; padding: calc(var(--u) * 3) calc(var(--u) * 3) calc(var(--u) * 7); }
.totem-lector { position: relative; width: calc(var(--u) * 16); height: calc(var(--u) * 9); display: flex; gap: calc(var(--u) * .45); justify-content: center; }
.totem-lector i { background: var(--ink); border-radius: 1px; }
.totem-lector::after { content: ""; position: absolute; left: -10%; right: -10%; height: 2px; background: #e11d2e; box-shadow: 0 0 12px 2px rgba(225, 29, 46, .6); top: 0; animation: totem-barre 2.2s ease-in-out infinite alternate; }
@keyframes totem-barre { to { top: 100%; } }
.totem-espera h1 { margin: 0; font-weight: 800; font-size: calc(var(--u) * 5); letter-spacing: -.01em; line-height: .95; max-width: 16ch; text-transform: uppercase; text-wrap: balance; }
.totem-espera p { margin: 0; font-size: calc(var(--u) * 2.5); line-height: 1.2; font-weight: 600; max-width: 26ch; text-wrap: balance; }
.totem-espera.no h1 { font-size: calc(var(--u) * 3.6); }
.totem-espera.no p { color: var(--mut); font-size: calc(var(--u) * 2); }

@media (prefers-reduced-motion: reduce) { .totem *, .totem *::before, .totem *::after { animation: none !important; transition: none !important; } .totem-foto img.on { opacity: 1; } }
`

export function Cabecera({ logo }: { logo: LogoTicket | null }) {
  return (
    <header className="totem-top">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo.src} alt={MARCA_CAJA.nombre} style={{ height: 'calc(var(--u) * 3.2)', minHeight: 28 }} />
      ) : (
        <span className="totem-logo">{MARCA_CAJA.nombre}</span>
      )}
      <span>Consultá el precio</span>
    </header>
  )
}

/** La cinta negra del Black Friday: el texto repetido corre en loop (la mitad del ancho = una vuelta). */
function Cinta() {
  const t = Array.from({ length: 8 }, () => `${BLACK_FRIDAY.cinta} · `).join('')
  return (
    <div className="totem-cinta" aria-label={BLACK_FRIDAY.cinta}>
      <span aria-hidden>{t}</span>
    </div>
  )
}

const BARRAS = [3, 1, 2, 1, 3, 2, 1, 1, 3, 1, 2, 3, 1, 2, 1, 3, 1, 2]

export function Espera({ bf, no: noEsta, falla, buscando, encargada }: { bf: boolean; no: boolean; falla: boolean; buscando: boolean; encargada: boolean }) {
  const no = noEsta || falla
  return (
    <div className={`totem-espera${no ? ' no' : ''}`}>
      {!no && (
        <div className="totem-lector" aria-hidden>
          {BARRAS.map((w, i) => (
            <i key={i} style={{ width: `calc(var(--u) * ${w * 0.32})` }} />
          ))}
        </div>
      )}
      <h1>{encargada ? 'Escaneá el producto para ver su posición' : falla ? 'No pudimos consultar el precio' : noEsta ? 'No encontramos este producto' : buscando ? 'Buscando…' : 'Escaneá el producto'}</h1>
      <p>{falla ? 'Probá de nuevo en un momento o consultá en caja.' : noEsta ? 'Consultá en caja y te ayudamos.' : 'Mirá el precio y los talles disponibles.'}</p>
      {bf && <Cinta />}
    </div>
  )
}

/** Sólo con `?prueba=1`: lo que encontró la búsqueda por nombre. */
export function ListaPrueba({ productos, elegir }: { productos: ProductoLista[]; elegir: (p: ProductoLista) => void }) {
  return (
    <div style={{ flex: 1, display: 'grid', alignContent: 'start', gap: 8, padding: 16 }}>
      {productos.map((p) => (
        <button key={p.product_id} type="button" onClick={() => elegir(p)} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: 12, fontSize: 18, textAlign: 'left', background: '#fff', color: '#0e0e0e', border: '1px solid #e7e6e4', borderRadius: 12, cursor: 'pointer', font: 'inherit' }}>
          <span>{p.product_name}</span>
          <span style={{ color: '#75747a', flex: 'none' }}>{p.local > 0 ? `${p.local} en el local` : 'Sin stock en el local'}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * Las fotos pasan solas con barras tipo historias (`FOTO_MS` cada una) y zoom lento. Tocar la mitad izquierda o derecha, o
 * deslizar, va a la anterior o la siguiente; cada toque le da otros segundos a la ficha (`tocar`).
 */
function Galeria({ fotos, i, setI, tocar, bf }: { fotos: string[]; i: number; setI: (i: number) => void; tocar: () => void; bf: boolean }) {
  const inicioX = useRef<number | null>(null)
  const hay = fotos.length > 1
  const [vuelta, setVuelta] = useState(0)
  useEffect(() => {
    if (!hay || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = setTimeout(() => setI((i + 1) % fotos.length), FOTO_MS)
    return () => clearTimeout(t)
  }, [hay, i, fotos.length, setI, vuelta])
  const ir = (paso: number) => {
    setI((i + paso + fotos.length) % fotos.length)
    setVuelta((n) => n + 1)
    tocar()
  }
  return (
    <div
      className="totem-foto"
      onPointerDown={(e) => {
        inicioX.current = e.clientX
      }}
      onPointerUp={(e) => {
        if (inicioX.current == null || !hay) return
        const dx = e.clientX - inicioX.current
        inicioX.current = null
        if (Math.abs(dx) > 50) ir(dx < 0 ? 1 : -1)
      }}
    >
      {hay && (
        <div className="totem-historias" aria-hidden>
          {fotos.map((f, n) => (
            <b key={`${f}-${n < i ? 'h' : n === i ? `c${i}-${vuelta}` : 'p'}`} className={n < i ? 'hecha' : n === i ? 'corre' : undefined}>
              <i />
            </b>
          ))}
        </div>
      )}
      {fotos.map((f, n) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={n === i ? `${f}-on-${vuelta}` : f} src={f} alt="" draggable={false} className={n === i ? 'on' : undefined} />
      ))}
      {hay && (
        <>
          <button type="button" aria-label="Foto anterior" tabIndex={-1} onClick={(e) => (e.stopPropagation(), ir(-1))} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '35%', opacity: 0, border: 0, zIndex: 2 }} />
          <button type="button" aria-label="Foto siguiente" tabIndex={-1} onClick={(e) => (e.stopPropagation(), ir(1))} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '35%', opacity: 0, border: 0, zIndex: 2 }} />
        </>
      )}
      {bf && <Cinta />}
    </div>
  )
}

function Talles({ rotulo, talles, confirmado }: { rotulo?: string; talles: { talle: string; hay: boolean }[]; confirmado: boolean }) {
  return (
    <div className="totem-chips">
      {rotulo && <small>{rotulo}</small>}
      {talles.map((t) =>
        !confirmado ? <span key={t.talle} data-vacio aria-hidden className="totem-chip vacio" /> : <span key={t.talle} className={`totem-chip${t.hay ? '' : ' no'}`} style={t.hay ? undefined : { textDecoration: 'line-through' }}>{t.talle}</span>,
      )}
    </div>
  )
}

/** «Llevá 2: EXTRA 10% OFF» · «Llevá 3 o más: EXTRA 15% OFF» (el último escalón, «o más»). */
function Cantidad({ escalones, bikini }: { escalones: { desde: number; pct: number }[]; bikini: boolean }) {
  return (
    <div className="totem-mas">
      <h3>{bikini ? 'Llevando más bikinis' : 'Llevando más'}</h3>
      <div>
        {escalones.map((e, k) => (
          <div key={e.desde}>
            <span>Llevá {e.desde}{k === escalones.length - 1 ? ' o más' : ''}</span>
            <strong>EXTRA {e.pct}% OFF</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function Pagos({ p }: { p: Extract<PrecioTotem, { feria: false }> }) {
  return (
    <div className="totem-pagos">
      {p.tarjeta != null && (
        <div>
          <span className="m">Tarjeta</span>
          <b>{plata(p.tarjeta)}</b>
          <span className="f">{p.cuota != null ? `3 cuotas sin interés de ${plata(p.cuota)}` : ''}</span>
        </div>
      )}
      {p.transferencia != null && (
        <div>
          <span className="m">Transferencia</span>
          <b>{plata(p.transferencia)}</b>
          <span className="f">{p.pctTransferencia ? <em className="totem-pct l">−{p.pctTransferencia}%</em> : null}</span>
        </div>
      )}
      <div>
        <span className="m">Efectivo</span>
        <b>{plata(p.efectivo)}</b>
        <span className="f">{p.pctEfectivo ? <em className="totem-pct l">−{p.pctEfectivo}%</em> : null}</span>
      </div>
    </div>
  )
}

/** Sólo con la tarjeta de la encargada: dónde está la prenda y cuánto hay. */
function PanelUbicacion({ u }: { u: Ubicacion }) {
  if (u.que === 'buscando') return <div className="totem-encargada">Buscando la posición…</div>
  if (u.que === 'falla') return <div className="totem-encargada">No se pudo consultar la posición.</div>
  return (
    <div className="totem-encargada">
      <span>Posición en depósito</span>
      <strong>{u.atras.length ? u.atras.join(' · ') : 'Sin estante cargado'}</strong>
      <span>Stock: {u.deposito} en depósito · {u.local} en el local</span>
    </div>
  )
}

export function Prenda({ r, bf, ubicacion, arranques, msReloj, tocar }: { r: Resultado; bf: boolean; ubicacion: Ubicacion | null; arranques: number; msReloj: number; tocar: () => void }) {
  const { precio, talles } = r
  const tallesDePartes = r.partes.flatMap((p) => p.talles)
  // Un color con `hay: null` ⛔ sabe de stock: decide lo que sí se sabe.
  const conocidas = [...talles, ...tallesDePartes, ...r.colores].filter((o) => o.hay !== null)
  const confirmado = r.stock === 'confirmado'
  // 🩱 Una bikini sin stock: le falta alguna de las dos partes en todos los talles.
  const sinStock = confirmado && (r.bikini ? r.partes.some((p) => p.talles.length > 0 && p.talles.every((t) => !t.hay)) : conocidas.length > 0 && conocidas.every((o) => o.hay === false))
  // 🔴 Lo que depende del stock va vacío hasta confirmarlo: con el nombre a la vista parece disponible y después se tacha.
  const coloresAVer = r.stock === 'sin-confirmar' ? r.colores.filter((c) => c.hay === null) : r.colores
  const [foto, setFoto] = useState(0)
  const [elegido, setElegido] = useState(r.colorActual)
  const mismo = (a: string | null, b: string) => a?.trim().toLowerCase() === b.trim().toLowerCase()
  const elegirColor = (c: ColorTotem) => {
    setElegido(c.nombre)
    const n = c.foto ? r.fotos.indexOf(c.foto) : -1
    if (n >= 0) setFoto(n)
    tocar()
  }
  const conRebaja = !!precio && !precio.feria && precio.antes != null
  return (
    <div className="totem-prenda">
      <Galeria fotos={r.fotos} i={foto} setI={setFoto} tocar={tocar} bf={bf} />
      <div className="totem-panel">
        {ubicacion && <PanelUbicacion u={ubicacion} />}
        {(r.tipo || conRebaja) && (
          <p className="totem-ceja">
            {conRebaja && <span className="bf">{bf ? 'Black Friday' : 'Oferta'}</span>}
            {r.tipo}
          </p>
        )}
        <h1 className="totem-nombre">{r.nombre}</h1>
        {coloresAVer.length > 0 && (
          <div className="totem-chips">
            {coloresAVer.map((c) =>
              !confirmado && c.hay !== null ? <span key={c.nombre} data-vacio aria-hidden className="totem-chip vacio" style={{ width: 'calc(var(--u) * 9)' }} /> : (
                <button
                  key={c.nombre}
                  type="button"
                  tabIndex={-1}
                  onClick={() => elegirColor(c)}
                  aria-pressed={mismo(elegido, c.nombre)}
                  className={`totem-chip color${c.hay === false ? ' no' : ''}`}
                  style={c.hay === false ? { textDecoration: 'line-through' } : undefined}
                >
                  {/* TN ⛔ trae el hex: el punto es la foto del color en un círculo (sin foto, vacío). */}
                  <i aria-hidden style={c.foto ? { backgroundImage: `url("${c.foto.replace(/"/g, '%22')}")` } : undefined} />
                  {nombreDeColor(c.nombre)}
                </button>
              ),
            )}
          </div>
        )}
        {r.stock !== 'sin-confirmar' && talles.length > 0 && <Talles talles={talles} confirmado={confirmado} />}
        {r.stock !== 'sin-confirmar' && r.partes.map((p) => (p.talles.length ? <Talles key={p.product_id} rotulo={p.rotulo} talles={p.talles} confirmado={confirmado} /> : null))}
        {r.stock === 'confirmando' && <p className="totem-nota">Confirmando stock…</p>}
        {r.stock === 'sin-confirmar' && <p className="totem-nota">No se pudo confirmar el stock. Consultá en caja.</p>}
        {sinStock ? (
          <div className="totem-aviso">Sin stock en el local. Consultá en caja.</div>
        ) : !precio ? (
          <div className="totem-aviso">Precio: consultá en caja.</div>
        ) : precio.feria ? (
          <>
            <p className="totem-ceja">Oferta · precio final</p>
            <div className="totem-precio">
              <strong>{plata(precio.final)}</strong>
            </div>
            <p className="totem-nota">Sólo efectivo o transferencia</p>
          </>
        ) : (
          <>
            <div className="totem-precio">
              <strong>{plata(precio.precio)}</strong>
              {precio.antes != null && <span className="totem-antes">{plata(precio.antes)}</span>}
              {precio.pctOferta ? <em className="totem-pct">−{precio.pctOferta}%</em> : null}
            </div>
            <Pagos p={precio} />
            {r.escalera && <Cantidad escalones={r.escalera} bikini={r.bikini} />}
            {bf && r.bikini && !r.escalera && <p className="totem-nota">{BLACK_FRIDAY.vuelveCantidad}</p>}
          </>
        )}
      </div>
      {/* Lo que falta para volver a «Escaneá el producto». */}
      <div className="totem-barra">
        <i key={arranques} style={{ animationDuration: `${msReloj}ms` }} />
      </div>
    </div>
  )
}
