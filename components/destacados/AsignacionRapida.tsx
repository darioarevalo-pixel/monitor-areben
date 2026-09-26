'use client'

/**
 * «⭐ Asignación rápida»: pasar los productos de la tabla de a uno, con la foto grande, y deslizar
 * a la derecha para marcarlo como producto estrella o a la izquierda para pasarlo.
 *
 * Las reglas del mazo —pasar ⛔ desmarca, deshacer sólo revierte lo que esta pasada escribió— y el
 * pedido de Bruno viven en `lib/destacados/mazo.ts`. Acá está sólo la pantalla.
 *
 * Vive en `components/destacados/` y ⛔ no en `components/productos/` por lo mismo que
 * `MarcaEstrella`: **`ProductosTable.tsx` es del repo compartido con Darío**, y desde allá esto entra
 * en una línea. Y Bruno pidió que Por producto ⛔ cambie de estructura: es un botón y un modo que se
 * abre encima.
 *
 * # Las decisiones de la pantalla
 *
 *  1. **El mazo es una FOTO de la tabla al abrir.** Se arma una vez: si mientras se desliza vuelve
 *     la lista de ⭐ o se refrescan los datos, las cartas ⛔ se reordenan bajo el dedo.
 *  2. **La carta avanza sin esperar al servidor.** Es lo que hace que sea rápido. El guardado corre
 *     detrás, y si falla se avisa **con el nombre del producto** — un error sin nombre, diez cartas
 *     después, ⛔ dice qué quedó sin guardar.
 *  3. **Tocar la foto (sin arrastrar) pasa a la siguiente foto del MISMO producto.** Un producto
 *     se decide mirándolo entero, y la 1ª foto a veces es un detalle o una tira de colores.
 *  4. 🔴 **«¿Ya tiene ⭐?» lo contesta primero lo que ESTA pasada escribió, y después la lista.**
 *     Caminado en prod el 26-sep-2026: marcar, ↶ y volver a apretar → antes de que la lista
 *     vuelva (~1 s) leía la ⭐ vieja ⇒ «ya la tenía» ⇒ ⛔ no se guardaba nada, y la carta mostraba
 *     una ★ que ya se había sacado. La lista del servidor sigue mandando para lo que esta pasada
 *     ⛔ tocó (las ⭐ de otra persona).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, color, font, radius, space, useToast } from '@/components/ui'
import { antiguedad } from '@/lib/productos'
import { imagenesDe, type IndiceTn } from '@/lib/tn'
import { armarMazo, decidir, deshacer, marcadas, MAZO_INICIAL, type EstadoMazo, type Gesto } from '@/lib/destacados/mazo'
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

/** Cuántos px hay que arrastrar para que cuente como gesto. Menos es un toque. */
const UMBRAL_PX = 90

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
        title={tnIdx ? 'Pasar los productos filtrados de a uno, con la foto grande, y marcar las ⭐ deslizando' : 'Esperando las fotos de Tienda Nube…'}
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
  // Decisión 1: se arma una sola vez, al abrir.
  const [cartas] = useState(() => armarMazo(productos, (p) => imagenesDe(p, tnIdx)))
  const [estado, setEstado] = useState<EstadoMazo>(MAZO_INICIAL)
  const [foto, setFoto] = useState(0)
  const [dx, setDx] = useState(0)
  const arrastre = useRef<{ x0: number; movio: boolean } | null>(null)
  // Decisión 4: pid → cómo lo dejó esta pasada (true = con ⭐). Gana sobre la lista del servidor.
  const [propias, setPropias] = useState<Map<string, boolean>>(() => new Map())

  const total = cartas.length
  const carta = cartas[estado.i]
  const tieneEstrella = (pid: string) => propias.get(pid) ?? destacados.porProducto.has(pid)
  const yaTiene = carta ? tieneEstrella(String(carta.p.id)) : false

  // Decisión 2: el guardado corre detrás y avisa con nombre si falla.
  const escribir = useCallback(
    (p: ProductoMazo, accion: 'marcar' | 'sacar') => {
      const pid = String(p.id)
      setPropias((m) => new Map(m).set(pid, accion === 'marcar'))
      destacados
        .alternar({ id: p.id, nombre: p.name ?? null, sku: p.sku ?? null }, accion)
        .catch((e) => {
          // Si no quedó guardado, la verdad vuelve a ser la de la lista.
          setPropias((m) => {
            const n = new Map(m)
            n.delete(pid)
            return n
          })
          const por = e instanceof Error ? e.message : 'error'
          toast.error(accion === 'marcar' ? `No se guardó la ⭐ de ${p.name} (${por}).` : `No se pudo sacar la ⭐ de ${p.name} (${por}).`)
        })
    },
    [destacados, toast],
  )

  const gesto = useCallback(
    (g: Gesto) => {
      if (!carta) return
      const r = decidir(estado, total, g, yaTiene)
      if (r.escritura) escribir(carta.p, r.escritura)
      setEstado(r.estado)
      setFoto(0)
      setDx(0)
    },
    [carta, estado, total, yaTiene, escribir],
  )

  const volver = useCallback(() => {
    const r = deshacer(estado)
    if (r.i === null) return
    if (r.escritura) escribir(cartas[r.i].p, r.escritura)
    setEstado(r.estado)
    setFoto(0)
    setDx(0)
  }, [estado, cartas, escribir])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar()
      else if (e.key === 'ArrowRight') gesto('estrella')
      else if (e.key === 'ArrowLeft') gesto('pasar')
      else if (e.key === 'Backspace' || (e.key === 'z' && (e.metaKey || e.ctrlKey))) volver()
      else if (e.key === ' ' && carta) {
        e.preventDefault()
        setFoto((f) => (f + 1) % carta.imagenes.length)
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [gesto, volver, onCerrar, carta])

  const terminado = estado.i >= total

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
          {terminado ? `${total} de ${total}` : `${estado.i + 1} de ${total}`}
          {productos.length > total && <span style={{ opacity: 0.7 }}> · {productos.length - total} sin foto, salteados</span>}
        </span>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" style={botonRedondo}>×</button>
      </div>

      {terminado ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: space[3], textAlign: 'center' }}>
          <div style={{ fontSize: 48 }}>⭐</div>
          <div style={{ fontSize: font.xl, fontWeight: 600 }}>
            {total ? `Marcaste ${marcadas(estado)} de ${total}` : 'Ninguno de estos productos tiene foto en Tienda Nube'}
          </div>
          <div style={{ fontSize: font.sm, opacity: 0.75 }}>Ya se ven con ★ en la tabla.</div>
          <div style={{ display: 'flex', gap: space[2] }}>
            {estado.historia.length > 0 && <Button variant="outline" tone="neutral" onClick={volver}>↶ Volver al último</Button>}
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
              if (d > UMBRAL_PX) gesto('estrella')
              else if (d < -UMBRAL_PX) gesto('pasar')
              else {
                setDx(0)
                // Decisión 3: un toque (sin arrastre) cambia de foto.
                if (!a.movio && carta.imagenes.length > 1) setFoto((f) => (f + 1) % carta.imagenes.length)
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
                maxWidth: '100%', maxHeight: 'calc(100dvh - 240px)', objectFit: 'contain', borderRadius: radius.lg,
                boxShadow: '0 10px 50px rgba(0,0,0,0.5)', userSelect: 'none',
                transform: `translateX(${dx}px) rotate(${dx / 25}deg)`,
                transition: dx === 0 ? 'transform 0.15s' : 'none',
                outline: dx > UMBRAL_PX ? `4px solid ${color.warning}` : dx < -UMBRAL_PX ? '4px solid rgba(255,255,255,0.4)' : 'none',
              }}
            />
            {yaTiene && (
              <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 32, color: color.warning, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }} title="Ya es producto estrella">★</span>
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
            <button type="button" onClick={() => gesto('pasar')} aria-label="Pasar" title="Pasar (←)" style={{ ...botonGesto, color: '#fff' }}>✕</button>
            <button type="button" onClick={volver} disabled={!estado.historia.length} aria-label="Deshacer" title="Deshacer el último" style={{ ...botonRedondo, opacity: estado.historia.length ? 1 : 0.35 }}>↶</button>
            <button type="button" onClick={() => gesto('estrella')} aria-label="Estrella" title="Producto estrella (→)" style={{ ...botonGesto, color: color.warning }}>★</button>
          </div>
          <div style={{ fontSize: font.xs, opacity: 0.55 }}>Deslizá → para ⭐ · ← para pasar · tocá la foto para ver la siguiente</div>
        </>
      )}
    </div>
  )
}

const botonRedondo: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 20, border: 'none', cursor: 'pointer',
  background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 22, lineHeight: 1,
}

const botonGesto: React.CSSProperties = {
  width: 64, height: 64, borderRadius: 32, border: '2px solid rgba(255,255,255,0.25)', cursor: 'pointer',
  background: 'rgba(255,255,255,0.08)', fontSize: 30, lineHeight: 1,
}
