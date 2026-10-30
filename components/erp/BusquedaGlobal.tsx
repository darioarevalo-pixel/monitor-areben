'use client'

/**
 * ERP › Búsqueda global (⌘K o «/») y la hoja de atajos («?») — 🎨 26-oct, Resto; `Piezas.dc.html`.
 * 🔑 Sólo reparte lo que se escribe entre las lecturas que YA existen (`buscarVentas`, `buscarPrendas`, `buscarClientas`) y los
 * saltos a pantallas (`lib/erp/busqueda-global.core.js`): no filtra listas, LLEVA a la ficha. Pedido de TN y factura ⛔ se buscan
 * por número (no hay lectura) y el cartel lo dice. Un escaneo del lector (sólo cifras + Enter) abre la prenda si es una sola.
 */

import { deLaTienda, useTiendaErp } from '@/lib/erp/linea-erp'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icono } from '@/components/ui/Icono'
import { color, font, radius, shadow, space, weight } from '@/components/ui/tokens'
import { buscarClientas, buscarPrendas, buscarVentas, type MarcaErp } from '@/lib/erp/cliente'
import {
  ATAJOS, accionDeTecla, desdeBusquedaDeVentas, esEscaneo, estaEscribiendo, gruposDe, queBuscar, saltosA,
} from '@/lib/erp/busqueda-global.core.js'
import { diaArgentino } from '@/lib/envios/portal.core.js'

type Seccion = { key: string; titulo: string; pestanias: Array<{ key: string; label: string }> }
export type DestinoBusqueda =
  | { tipo: 'venta'; marca: MarcaErp; id: string; ocurridaEn: string; numero: number }
  | { tipo: 'prenda'; marca: MarcaErp; producto: string; talle: string }
  | { tipo: 'cliente'; marca: MarcaErp; doc: string | null; nombre: string }
  | { tipo: 'ir'; seccion: string; pestania: string | null }

type Item = { id: string; titulo: string; detalle: string; destino: DestinoBusqueda }
type Grupo = { key: string; titulo: string; items: Item[] }
type Lectura = { clave: string; ventas: object[]; prendas: object[]; clientas: object[]; errores: string[] }

const msj = (e: unknown) => (e instanceof Error ? e.message : 'No se pudo buscar.')
const NOMBRE_MARCA: Record<MarcaErp, string> = { bdi: 'BDI', zattia: 'Zattia' }

/** Escucha ⌘K, «/» y «?» en toda la pantalla del ERP. */
export function useAtajosErp(abrir: (que: 'buscar' | 'atajos') => void) {
  const ref = useRef(abrir)
  useEffect(() => { ref.current = abrir })
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const que = accionDeTecla(e, estaEscribiendo(document.activeElement))
      if (!que) return
      // Con un diálogo abierto (cobro, editar) las teclas son del diálogo; ⌘K sí abre siempre el buscador.
      if (que !== 'buscar' && document.querySelector('[role="dialog"][aria-modal="true"]')) return
      e.preventDefault()
      ref.current(que)
    }
    document.addEventListener('keydown', f)
    return () => document.removeEventListener('keydown', f)
  }, [])
}

function Marco({ etiqueta, onCerrar, children }: { etiqueta: string; onCerrar: () => void; children: React.ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '10vh 12px 0' }}>
      <button type="button" aria-label="Cerrar" onClick={onCerrar} style={{ position: 'absolute', inset: 0, height: 'auto', border: 0, padding: 0, background: 'rgba(15, 23, 42, 0.45)', cursor: 'default' }} />
      <div role="dialog" aria-modal="true" aria-label={etiqueta} style={{ position: 'relative', width: 'min(640px, 100%)', maxHeight: '75vh', display: 'flex', flexDirection: 'column', background: color.surface, borderRadius: radius.xl, boxShadow: shadow.modal, overflow: 'hidden' }}>
        {children}
      </div>
    </div>,
    document.body,
  )
}

const Tecla = ({ children }: { children: React.ReactNode }) => (
  <kbd style={{ fontFamily: 'ui-monospace, monospace', fontSize: font.sm, border: `1px solid ${color.line2}`, borderRadius: 4, padding: '1px 6px', background: color.surface, color: color.ink2 }}>{children}</kbd>
)

export function HojaDeAtajos({ onCerrar }: { onCerrar: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onCerrar])
  return (
    <Marco etiqueta="Atajos de teclado" onCerrar={onCerrar}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${color.bg2}`, fontWeight: weight.semibold, color: color.ink }}>Atajos de teclado</div>
      <ul style={{ listStyle: 'none', margin: 0, padding: '8px 18px 16px', display: 'flex', flexDirection: 'column', gap: space[2] }}>
        {(ATAJOS as string[][]).map(([tecla, que]) => (
          <li key={tecla} style={{ display: 'flex', alignItems: 'center', gap: space[3], fontSize: font.md, color: color.ink2 }}>
            <span style={{ minWidth: 56 }}><Tecla>{tecla}</Tecla></span>{que}
          </li>
        ))}
        <li style={{ fontSize: font.sm, color: color.mut, paddingTop: space[2] }}>La Caja tiene los suyos (F2 cobrar, F4 cambio): no cambian.</li>
      </ul>
    </Marco>
  )
}

export function BusquedaGlobal({ marca, marcas, secciones, onElegir, onCerrar }: {
  marca: MarcaErp
  /** Las marcas que el usuario puede ver: con más de una aparece «Buscar en todas». */
  marcas: MarcaErp[]
  secciones: Seccion[]
  onElegir: (d: DestinoBusqueda) => void
  onCerrar: () => void
}) {
  const [escrito, setEscrito] = useState('')
  const [todas, setTodas] = useState(false)
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [marcado, setMarcado] = useState(0)
  const entradaRef = useRef<HTMLInputElement>(null)
  const enterPendiente = useRef(false)
  const onElegirRef = useRef(onElegir)
  useEffect(() => { onElegirRef.current = onElegir })

  // En la base de Zattia viven Zattia y Stunned: se queda con la tienda del menú (Bruno, 30-oct: mirando Stunned, una venta
  // de Zattia ⛔ aparece —y al elegirla Ventas decía «No encontré la venta»—). Y las clientas, sólo las de la línea (Bruno, 30-oct).
  const tienda = useTiendaErp()
  const lineaZ: 'zattia' | 'stunned' = tienda === 'stunned' ? 'stunned' : 'zattia'
  const donde: MarcaErp[] = todas ? marcas : [marca]
  const que = queBuscar(escrito)
  const hayLectura = que.ventas || que.prendas || que.clientas
  const clave = `${donde.join('+')}|${lineaZ}|${que.texto}`
  const lista = useMemo(() => saltosA(escrito, secciones), [escrito, secciones])

  useEffect(() => { entradaRef.current?.focus() }, [])

  // La lectura corre a los 250 ms de dejar de escribir (un escaneo termina antes: el Enter espera).
  useEffect(() => {
    if (!hayLectura) return
    let vivo = true
    const t = setTimeout(async () => {
      const hoy = diaArgentino(Date.now())
      const marcasDe = clave.split('|')[0].split('+') as MarcaErp[]
      const etiquetar = <T extends object>(m: MarcaErp, xs: T[]) => xs.map((x) => ({ ...x, buscadaEn: m }))
      const errores: string[] = []
      const quien = (m: MarcaErp, e: unknown) => errores.push(`${marcasDe.length > 1 ? `${NOMBRE_MARCA[m]}: ` : ''}${msj(e)}`)
      const salidas = await Promise.all(marcasDe.map(async (m) => {
        const [v, p, c] = await Promise.all([
          que.ventas ? buscarVentas(m, { q: que.texto, desde: desdeBusquedaDeVentas(hoy), hasta: hoy }).then((r) => etiquetar(m, m === 'zattia' ? r.ventas.filter((x) => x.marca === lineaZ) : r.ventas)).catch((e) => { quien(m, e); return [] }) : [],
          que.prendas ? buscarPrendas(m, que.texto).then((r) => etiquetar(m, m === 'zattia' ? deLaTienda(r.variantes, lineaZ) : r.variantes)).catch((e) => { quien(m, e); return [] }) : [],
          que.clientas ? buscarClientas(m, que.texto, m === 'zattia' ? lineaZ : undefined).then((r) => etiquetar(m, r.clientas)).catch((e) => { quien(m, e); return [] }) : [],
        ])
        return { v, p, c }
      }))
      if (!vivo) return
      const l: Lectura = { clave, ventas: salidas.flatMap((s) => s.v), prendas: salidas.flatMap((s) => s.p), clientas: salidas.flatMap((s) => s.c), errores }
      setLectura(l)
      setMarcado(0)
      if (enterPendiente.current) {
        enterPendiente.current = false
        const todos = (gruposDe({ ventas: l.ventas, prendas: l.prendas, clientas: l.clientas }, { conMarca: false }) as Grupo[]).flatMap((g) => g.items)
        if (todos.length === 1) onElegirRef.current(todos[0].destino)
      }
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  // `que` se deriva de `clave` (marcas + texto): la clave alcanza.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, hayLectura])

  const listo = !hayLectura || lectura?.clave === clave
  const grupos = useMemo(() => gruposDe({
    ventas: listo && lectura && hayLectura ? lectura.ventas : [],
    prendas: listo && lectura && hayLectura ? lectura.prendas : [],
    clientas: listo && lectura && hayLectura ? lectura.clientas : [],
    saltos: lista,
  }, { conMarca: todas }) as Grupo[], [lectura, listo, hayLectura, lista, todas])
  const planos = grupos.flatMap((g) => g.items)
  const actual = Math.min(marcado, Math.max(planos.length - 1, 0))

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onCerrar() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setMarcado(Math.min(actual + 1, planos.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMarcado(Math.max(actual - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (!listo) { if (esEscaneo(escrito)) enterPendiente.current = true; return }
      if (planos[actual]) onElegir(planos[actual].destino)
    }
  }

  return (
    <Marco etiqueta="Buscar en el ERP" onCerrar={onCerrar}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], padding: '0 16px', height: 52, borderBottom: `1px solid ${color.bg2}`, color: color.mut }}>
        <Icono nombre="lupa" size={18} />
        <input
          ref={entradaRef} value={escrito} onChange={(e) => { enterPendiente.current = false; setEscrito(e.target.value); setMarcado(0) }} onKeyDown={alTeclear}
          placeholder="Buscar venta, producto o cliente" aria-label="Buscar venta, producto o cliente" autoComplete="off" spellCheck={false}
          style={{ flex: 1, height: 40, border: 0, outline: 'none', background: 'transparent', fontSize: font.lg, color: color.ink, fontFamily: 'inherit' }}
        />
        <Tecla>Esc</Tecla>
      </div>
      {marcas.length > 1 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: space[2], padding: '8px 16px', fontSize: font.sm, color: color.mut, borderBottom: `1px solid ${color.bg2}` }}>
          <input type="checkbox" checked={todas} onChange={(e) => { setTodas(e.target.checked); setMarcado(0) }} />
          Buscar en todas las marcas (hoy: {NOMBRE_MARCA[marca]})
        </label>
      )}
      <div style={{ overflowY: 'auto', padding: '4px 0 8px' }}>
        {!escrito.trim() && (
          <div style={{ padding: '14px 18px', fontSize: font.md, color: color.mut, lineHeight: 1.6 }}>
            «296» → la venta · un código, el código de barras o parte del nombre → el producto · DNI/CUIT o el nombre → el cliente.<br />
            Las ventas se buscan en este mes y el mes pasado. Un pedido de Tienda Nube o una factura todavía no se buscan por su número.
          </div>
        )}
        {!!escrito.trim() && !hayLectura && escrito.trim().length < 3 && !lista.length && (
          <div style={{ padding: '14px 18px', fontSize: font.md, color: color.mut }}>Escribí al menos 3 letras, o el número de la venta.</div>
        )}
        {hayLectura && !listo && <div style={{ padding: '10px 18px', fontSize: font.md, color: color.mut }}>Buscando…</div>}
        {grupos.map((g) => (
          <div key={g.key} role="group" aria-label={g.titulo}>
            <div style={{ padding: '8px 18px 4px', fontSize: font.sm, fontWeight: weight.semibold, color: color.mut, textTransform: 'uppercase', letterSpacing: 0.4 }}>{g.titulo}</div>
            {g.items.map((it) => {
              const i = planos.indexOf(it)
              const on = i === actual
              return (
                <button
                  key={it.id} type="button" aria-current={on ? 'true' : undefined} onClick={() => onElegir(it.destino)} onMouseMove={() => setMarcado(i)}
                  style={{ width: '100%', height: 'auto', minHeight: 40, padding: '6px 18px', border: 0, display: 'flex', alignItems: 'baseline', gap: space[3], textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', background: on ? color.bg2 : 'transparent', color: color.ink }}
                >
                  <span style={{ fontSize: font.md, fontWeight: weight.medium }}>{it.titulo}</span>
                  {it.detalle && <span style={{ fontSize: font.sm, color: color.mut, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.detalle}</span>}
                </button>
              )
            })}
          </div>
        ))}
        {listo && !!escrito.trim() && !planos.length && (hayLectura || lista.length === 0) && escrito.trim().length >= 3 && (
          <div style={{ padding: '14px 18px', fontSize: font.md, color: color.mut }}>No encontré nada con «{escrito.trim()}».</div>
        )}
        {listo && !!lectura?.errores.length && hayLectura && lectura.clave === clave && (
          <div style={{ padding: '8px 18px', fontSize: font.sm, color: color.dangerInk }}>{lectura.errores.join(' · ')}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: space[4], padding: '8px 16px', borderTop: `1px solid ${color.bg2}`, fontSize: font.sm, color: color.mut }}>
        <span><Tecla>↑</Tecla> <Tecla>↓</Tecla> moverse</span><span><Tecla>Enter</Tecla> abrir</span><span><Tecla>?</Tecla> atajos</span>
      </div>
    </Marco>
  )
}
