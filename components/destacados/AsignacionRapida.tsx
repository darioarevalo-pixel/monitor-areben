'use client'

/**
 * «⭐ Asignación rápida»: pasar los productos de la tabla de a uno, con la foto grande, y marcar
 * los productos estrella sin entrar a cada uno.
 *
 * Las reglas —moverse ⛔ escribe, la ⭐ es un interruptor sobre la carta actual— y el pedido de
 * Bruno viven en `lib/destacados/mazo.ts`. Acá está sólo la pantalla.
 *
 * Vive en `components/destacados/` y ⛔ no en `components/productos/` por lo mismo que
 * `MarcaEstrella`: **`ProductosTable.tsx` es del repo compartido con Darío**, y desde allá esto entra
 * en una línea. Y Bruno pidió que Por producto ⛔ cambie de estructura: es un botón y un modo que se
 * abre encima.
 *
 * # Las teclas
 *
 *   ← / →        anterior / siguiente (como una galería) — ⛔ marcan nada
 *   ↑ / Enter    poner o sacar la ⭐ del que se está mirando
 *   Espacio      la siguiente foto del mismo producto (también tocando la foto)
 *   Esc          cerrar
 *
 * En el teléfono, deslizar mueve entre productos: a la izquierda es el siguiente, como en cualquier
 * galería.
 *
 * # Las decisiones de la pantalla
 *
 *  1. **El mazo es una FOTO de la tabla al abrir.** Se arma una vez: si mientras se mira vuelve la
 *     lista de ⭐ o se refrescan los datos, las cartas ⛔ se reordenan.
 *  2. **La ★ se pinta sin esperar al servidor.** Es lo que hace que sea rápido. El guardado corre
 *     detrás, y si falla se vuelve a la verdad de la lista y se avisa **con el nombre del
 *     producto** — un error sin nombre, diez cartas después, ⛔ dice qué quedó sin guardar.
 *  3. **Tocar la foto (sin arrastrar) pasa a la siguiente foto del MISMO producto.** Un producto
 *     se decide mirándolo entero, y la 1ª foto a veces es un detalle o una tira de colores.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, color, font, radius, space, useToast } from '@/components/ui'
import { antiguedad } from '@/lib/productos'
import { imagenesDe, type IndiceTn } from '@/lib/tn'
import { alternarEstrella, armarMazo, marcadas, mover, tieneEstrella } from '@/lib/destacados/mazo'
import type { Destacados } from './useDestacados'

/** Lo que la carta necesita de un producto. `Producto` del ETL lo cumple. */
export interface ProductoMazo {
  id: string
  name: string
  sku?: string | null
  retailer_price?: number | null
  stock?: number | null
  diasVivo?: number | null
}

/** Cuántos px hay que arrastrar para que cuente como deslizar. Menos es un toque. */
const UMBRAL_PX = 70

export function BotonAsignacionRapida({
  productos,
  tnIdx,
  destacados,
}: {
  /** Lo que la tabla tiene filtrado, en su orden. */
  productos: ProductoMazo[]
  tnIdx: IndiceTn | null
  destacados: Destacados
}) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <Button
        variant="outline"
        tone="neutral"
        onClick={() => setAbierto(true)}
        disabled={!tnIdx || !productos.length}
        title={tnIdx ? 'Pasar los productos filtrados de a uno, con la foto grande, y marcar las ⭐' : 'Esperando las fotos de Tienda Nube…'}
      >
        ⭐ Asignación rápida
      </Button>
      {abierto && tnIdx && (
        <MazoEstrellas productos={productos} tnIdx={tnIdx} destacados={destacados} onCerrar={() => setAbierto(false)} />
      )}
    </>
  )
}

export function MazoEstrellas({
  productos,
  tnIdx,
  destacados,
  onCerrar,
}: {
  productos: ProductoMazo[]
  tnIdx: IndiceTn
  destacados: Destacados
  onCerrar: () => void
}) {
  const toast = useToast()
  // Decisión 1: se arma una sola vez, al abrir. Y lo que ya tenía ⭐ al abrir, para el conteo final.
  const [cartas] = useState(() => armarMazo(productos, (p) => imagenesDe(p, tnIdx)))
  const [teniaAlAbrir] = useState(() => new Set(destacados.porProducto.keys()))
  const [i, setI] = useState(0)
  const [foto, setFoto] = useState(0)
  const [dx, setDx] = useState(0)
  // pid → cómo lo dejó esta pasada (true = con ⭐). Gana sobre la lista del servidor.
  const [propias, setPropias] = useState<Map<string, boolean>>(() => new Map())
  const arrastre = useRef<{ x0: number; movio: boolean } | null>(null)

  const total = cartas.length
  const carta = cartas[i]
  const terminado = i >= total
  const tiene = carta ? tieneEstrella(String(carta.p.id), propias, destacados.porProducto) : false

  const ir = useCallback(
    (delta: -1 | 1) => {
      setI((x) => mover(x, total, delta))
      setFoto(0)
      setDx(0)
    },
    [total],
  )

  // Decisión 2: se pinta ya, se guarda detrás, y si falla se avisa con nombre.
  const estrella = useCallback(() => {
    if (!carta) return
    const p = carta.p
    const pid = String(p.id)
    const accion = alternarEstrella(tiene)
    setPropias((m) => new Map(m).set(pid, accion === 'marcar'))
    destacados
      .alternar({ id: p.id, nombre: p.name ?? null, sku: p.sku ?? null }, accion)
      .catch((e) => {
        setPropias((m) => {
          const n = new Map(m)
          n.delete(pid)
          return n
        })
        const por = e instanceof Error ? e.message : 'error'
        toast.error(accion === 'marcar' ? `No se guardó la ⭐ de ${p.name} (${por}).` : `No se pudo sacar la ⭐ de ${p.name} (${por}).`)
      })
  }, [carta, tiene, destacados, toast])

  const otraFoto = useCallback(() => {
    if (carta && carta.imagenes.length > 1) setFoto((f) => (f + 1) % carta.imagenes.length)
  }, [carta])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar()
      else if (e.key === 'ArrowRight') ir(1)
      else if (e.key === 'ArrowLeft') ir(-1)
      else if (e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault()
        // 🔴 Una tecla sostenida repite: la ⭐ es un interruptor, y la repetición la prendería y
        // apagaría sola. Moverse sí puede repetir (es recorrer rápido).
        if (!e.repeat) estrella()
      } else if (e.key === ' ') {
        e.preventDefault()
        otraFoto()
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [ir, estrella, otraFoto, onCerrar])

  return (
    <div
      role="dialog"
      aria-label="Asignación rápida de productos estrella"
      style={{
        position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(16, 24, 40, 0.94)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#fff',
        padding: `${space[3]}px ${space[4]}px`, touchAction: 'none',
      }}
    >
      <div style={{ width: '100%', maxWidth: 520, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[2] }}>
        <span style={{ fontSize: font.sm, opacity: 0.8 }}>
          {terminado ? `${total} de ${total}` : `${i + 1} de ${total}`}
          {productos.length > total && <span style={{ opacity: 0.7 }}> · {productos.length - total} sin foto, salteados</span>}
        </span>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" style={botonRedondo}>×</button>
      </div>

      {terminado ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: space[3], textAlign: 'center' }}>
          <div style={{ fontSize: 48 }}>⭐</div>
          <div style={{ fontSize: font.xl, fontWeight: 600 }}>
            {total ? `Marcaste ${marcadas(propias, teniaAlAbrir)} de ${total}` : 'Ninguno de estos productos tiene foto en Tienda Nube'}
          </div>
          <div style={{ fontSize: font.sm, opacity: 0.75 }}>Ya se ven con ★ en la tabla.</div>
          <div style={{ display: 'flex', gap: space[2] }}>
            {total > 0 && <Button variant="outline" tone="neutral" onClick={() => ir(-1)}>‹ Volver al último</Button>}
            <Button variant="solid" tone="brand" onClick={onCerrar}>Cerrar</Button>
          </div>
        </div>
      ) : (
        <>
          <div
            style={{ flex: 1, minHeight: 0, width: '100%', maxWidth: 520, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onPointerDown={(e) => {
              arrastre.current = { x0: e.clientX, movio: false }
              e.currentTarget.setPointerCapture?.(e.pointerId)
            }}
            onPointerMove={(e) => {
              const a = arrastre.current
              if (!a) return
              const d = e.clientX - a.x0
              if (Math.abs(d) > 8) a.movio = true
              setDx(d)
            }}
            onPointerUp={(e) => {
              const a = arrastre.current
              arrastre.current = null
              if (!a) return
              const d = e.clientX - a.x0
              // Como una galería: el dedo empuja la foto, a la izquierda aparece la siguiente.
              if (d < -UMBRAL_PX) ir(1)
              else if (d > UMBRAL_PX) ir(-1)
              else {
                setDx(0)
                // Decisión 3: un toque (sin arrastre) cambia de foto.
                if (!a.movio) otraFoto()
              }
            }}
            onPointerCancel={() => {
              arrastre.current = null
              setDx(0)
            }}
          >
            {/* La ★ y los puntitos van pegados a la FOTO, ⛔ al área: una foto angosta dejaba la ★
                flotando afuera, a la derecha (caminado en prod el 26-sep-2026). */}
            <div style={{ position: 'relative', display: 'inline-flex', maxWidth: '100%' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={`${carta.p.id}-${foto}`}
                src={carta.imagenes[foto]}
                alt={carta.p.name}
                draggable={false}
                style={{
                  // El % de alto ⛔ se resuelve adentro de un contenedor sin alto definido: el tope va contra la ventana.
                  maxWidth: '100%', maxHeight: 'calc(100dvh - 240px)', objectFit: 'contain', borderRadius: radius.lg,
                  boxShadow: '0 10px 50px rgba(0,0,0,0.5)', userSelect: 'none',
                  transform: `translateX(${dx}px)`,
                  transition: dx === 0 ? 'transform 0.15s' : 'none',
                  outline: tiene ? `4px solid ${color.warning}` : 'none',
                }}
              />
              {tiene && (
                <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 32, color: color.warning, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }} title="Producto estrella">★</span>
              )}
              {carta.imagenes.length > 1 && (
                <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>
                  {carta.imagenes.map((_, k) => (
                    <span key={k} style={{ width: 7, height: 7, borderRadius: 4, background: k === foto ? '#fff' : 'rgba(255,255,255,0.35)', boxShadow: '0 0 2px rgba(0,0,0,0.6)' }} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ width: '100%', maxWidth: 520, marginTop: space[2], textAlign: 'center' }}>
            <div style={{ fontSize: font.lg, fontWeight: 600 }}>{carta.p.name}</div>
            <div style={{ fontSize: font.sm, opacity: 0.75, marginTop: 2 }}>
              {[
                carta.p.retailer_price ? `$${Number(carta.p.retailer_price).toLocaleString('es-AR')}` : null,
                carta.p.diasVivo !== null && carta.p.diasVivo !== undefined ? `ingresó ${antiguedad(carta.p.diasVivo)}` : null,
                carta.p.stock !== null && carta.p.stock !== undefined ? `stock ${carta.p.stock}` : null,
              ].filter(Boolean).join(' · ')}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: space[4], marginTop: space[3], marginBottom: space[2] }}>
            <button type="button" {...sinFoco} onClick={() => ir(-1)} disabled={i === 0} aria-label="Anterior" title="Anterior (←)" style={{ ...botonRedondo, width: 48, height: 48, borderRadius: 24, fontSize: 26, opacity: i === 0 ? 0.35 : 1 }}>‹</button>
            <button
              type="button"
              {...sinFoco}
              onClick={estrella}
              aria-pressed={tiene}
              aria-label={tiene ? 'Sacar la estrella' : 'Marcar como producto estrella'}
              title={tiene ? 'Sacar la ⭐ (↑ o Enter)' : 'Producto estrella (↑ o Enter)'}
              style={{ ...botonGesto, color: tiene ? '#fff' : color.warning, background: tiene ? color.warning : 'rgba(255,255,255,0.08)' }}
            >
              ★
            </button>
            <button type="button" {...sinFoco} onClick={() => ir(1)} aria-label="Siguiente" title="Siguiente (→)" style={{ ...botonRedondo, width: 48, height: 48, borderRadius: 24, fontSize: 26 }}>›</button>
          </div>
          <div style={{ fontSize: font.xs, opacity: 0.55 }}>← → para moverte · ↑ o Enter para ⭐ · espacio o tocar la foto para ver la siguiente</div>
        </>
      )}
    </div>
  )
}

/**
 * 🔴 Los botones ⛔ toman el foco al clickearlos: con el foco en ★, Enter y Espacio lo accionarían
 * **además** del atajo de teclado ⇒ la ⭐ se prendería y se apagaría en el mismo toque.
 */
const sinFoco = { onMouseDown: (e: React.MouseEvent) => e.preventDefault() }

const botonRedondo: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 20, border: 'none', cursor: 'pointer',
  background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 22, lineHeight: 1,
}

const botonGesto: React.CSSProperties = {
  width: 64, height: 64, borderRadius: 32, border: '2px solid rgba(255,255,255,0.25)', cursor: 'pointer',
  fontSize: 30, lineHeight: 1,
}
