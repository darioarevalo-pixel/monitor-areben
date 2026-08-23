'use client'

/**
 * El tour de una pantalla: recorta el control REAL y le pone un globo al lado.
 *
 * Es la respuesta a "mostrame dónde se aprieta", y sigue existiendo en vez de una captura por dos
 * motivos que no cambiaron: una captura de producción lleva **nombre, dirección y teléfono de
 * clientas reales** —y la URL del Blob donde se sube es pública—, y **queda vieja el día que cambie
 * un botón, sin que nadie se entere**. Esto se para sobre el botón de verdad, y si el botón se fue,
 * `tests/guia.test.ts` se pone rojo.
 *
 * ⚠️ El tercer motivo se venció el 23-ago-2026: el markdown del repo **ya entiende imágenes**
 * (`![qué se ve](url)`, sola en su renglón). Sigue devolviendo datos y no HTML, así que tampoco por
 * ahí entró un sanitizador. Una captura en un manual es una decisión que se toma mirando los otros
 * dos motivos, no algo que el parser impida.
 *
 * # Dónde vive cada cosa
 *
 * · Los **pasos** los registra la sección en `store/useGuia.ts` (así viajan en SU chunk).
 * · La **decisión** de sobre qué ancla pararse y qué texto decir es de `lib/guia/core.ts`, que es
 *   pura y se puede mutar.
 * · Acá queda sólo el dibujo y la medición del DOM.
 *
 * ⚠️ Se monta UNA vez en el shell, al lado de `CartelNovedad`: no pertenece a ninguna sección, y
 * montarlo adentro de una lo desmontaría cada vez que ella se re-renderiza.
 */

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import { color, font, space } from '@/components/ui/tokens'
import { resolverPaso, siguiente, anterior, type PasoResuelto } from '@/lib/guia/core'
import { useGuia } from '@/store/useGuia'

const GLOBO_W = 320
const MARGEN = 10
/** Cuántos frames se espera a que aparezca el ancla. Un cambio de pestaña tarda uno o dos. */
const REINTENTOS = 8
/**
 * Cada cuánto se vuelve a medir mientras el globo está abierto.
 *
 * 🔴 **Lo pidió un defecto visto en prod**: el último paso vive en «Cuenta del cadete», que trae sus
 * datos por fetch. Se medía el botón, llegaban los datos, la tabla empujaba todo para abajo **y el
 * recorte quedaba arriba, sobre un rectángulo vacío**. No hubo scroll ni resize, así que ningún
 * listener se enteró. Medir seguido es la única forma que no depende de adivinar qué va a mover el
 * layout — y no cuesta nada: `getBoundingClientRect` sobre un elemento, y sólo re-renderiza si la
 * caja cambió de verdad.
 */
const CADA_MS = 200

function buscar(ancla: string): HTMLElement | null {
  if (typeof document === 'undefined') return null
  // Si el ancla está en varias filas —el botón de WhatsApp de la bandeja, por ejemplo— se usa la
  // primera, que es la que el tour quiere señalar: alcanza con mostrar UNA fila.
  return document.querySelector<HTMLElement>(`[data-guia="${CSS.escape(ancla)}"]`)
}

function sinAnimacion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

type Caja = { top: number; left: number; ancho: number; alto: number }

/** Redondeada: el rect trae subpíxeles que oscilan solos y harían re-renderizar sin que se mueva nada. */
function cajaDe(el: HTMLElement): Caja {
  const b = el.getBoundingClientRect()
  return { top: Math.round(b.top), left: Math.round(b.left), ancho: Math.round(b.width), alto: Math.round(b.height) }
}

function mismaCaja(a: Caja | null, b: Caja): boolean {
  return !!a && a.top === b.top && a.left === b.left && a.ancho === b.ancho && a.alto === b.alto
}

export function Guia() {
  const { pasos, paso, irAPestania, ir } = useGuia()
  const [caja, setCaja] = useState<Caja | null>(null)
  const [resuelto, setResuelto] = useState<PasoResuelto | null>(null)

  const actual = paso != null ? pasos[paso] : undefined

  /** Mide el paso actual. Devuelve `false` si el ancla todavía no está en el DOM. */
  const medir = useCallback(() => {
    if (!actual) return false
    const r = resolverPaso(actual, (a) => buscar(a) != null)
    setResuelto(r)
    const el = buscar(r.ancla)
    if (!el) return false
    const b = cajaDe(el)
    setCaja((prev) => (mismaCaja(prev, b) ? prev : b))
    return true
  }, [actual])

  // Todo el trabajo va adentro de un `requestAnimationFrame` y no en el cuerpo del efecto: un paso
  // puede pedir cambiar de pestaña, y el control recién existe uno o dos commits después. Medir en
  // el primero daría `null` y mandaría el globo al centro sin motivo (y el lint del repo rechaza,
  // con razón, un `setState` síncrono adentro de un efecto).
  useEffect(() => {
    let vivo = true
    let quedan = REINTENTOS
    let raf = 0

    const intentar = () => {
      if (!vivo) return
      if (!actual) {
        setCaja(null)
        setResuelto(null)
        return
      }
      if (!medir() && quedan-- > 0) {
        raf = requestAnimationFrame(intentar)
        return
      }
      // Encontrado (o agotado): traerlo a la vista. `scrollIntoView` dispara scroll, y el listener
      // de abajo vuelve a medir, así que la caja sigue al elemento mientras la página se acomoda.
      const el = buscar(actual.anclaFina ?? actual.ancla) ?? buscar(actual.ancla)
      el?.scrollIntoView({ block: 'center', behavior: sinAnimacion() ? 'auto' : 'smooth' })
    }

    if (actual?.pestania) irAPestania?.(actual.pestania)
    raf = requestAnimationFrame(intentar)
    return () => {
      vivo = false
      cancelAnimationFrame(raf)
    }
  }, [actual, irAPestania, medir])

  useEffect(() => {
    if (paso == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ir(null)
    }
    const remedir = () => void medir()
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', remedir, true)
    window.addEventListener('resize', remedir)
    // El latido: lo que mueve el layout no siempre avisa (datos que llegan por fetch, una card que
    // aparece, una fila que se recarga). Ver `CADA_MS`.
    const latido = window.setInterval(remedir, CADA_MS)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', remedir, true)
      window.removeEventListener('resize', remedir)
      window.clearInterval(latido)
    }
  }, [paso, medir, ir])

  if (paso == null || !actual || !resuelto || typeof document === 'undefined') return null

  const total = pasos.length
  const sigue = siguiente(paso, total)
  const atras = anterior(paso)
  const transicion = sinAnimacion() ? 'none' : 'top .18s ease, left .18s ease, width .18s ease, height .18s ease'

  // Sin caja (el ancla no apareció ni reintentando) el globo va al centro: el paso se muestra
  // IGUAL. Callarse acá sería lo mismo que saltearlo.
  const globo = caja
    ? {
        top: Math.min(caja.top + caja.alto + MARGEN, window.innerHeight - 190),
        left: Math.max(MARGEN, Math.min(caja.left, window.innerWidth - GLOBO_W - MARGEN)),
      }
    : { top: Math.max(MARGEN, window.innerHeight / 2 - 90), left: Math.max(MARGEN, window.innerWidth / 2 - GLOBO_W / 2) }

  return createPortal(
    <>
      {/*
        El recorte es un div vacío con un box-shadow de spread enorme: oscurece todo MENOS lo que el
        div tapa. No hace falta SVG ni una librería de animación — el repo no tiene ninguna y no se
        trae una para esto. Sin caja queda de 0×0 y el fondo se oscurece entero, que es lo correcto:
        no hay nada que señalar.
      */}
      <div
        aria-hidden
        onClick={() => ir(null)}
        style={{
          position: 'fixed',
          top: caja ? caja.top - 4 : 0,
          left: caja ? caja.left - 4 : 0,
          width: caja ? caja.ancho + 8 : 0,
          height: caja ? caja.alto + 8 : 0,
          borderRadius: 10,
          boxShadow: '0 0 0 9999px rgba(16, 24, 40, 0.55)',
          outline: `2px solid ${color.brandSolid}`,
          zIndex: 250,
          transition: transicion,
        }}
      />
      <div
        role="dialog"
        aria-live="polite"
        aria-label={`Cómo se usa, paso ${paso + 1} de ${total}`}
        style={{
          position: 'fixed',
          top: globo.top,
          left: globo.left,
          width: GLOBO_W,
          zIndex: 251,
          background: color.surface,
          border: `1px solid ${color.line}`,
          borderRadius: 'var(--mo-r-lg)',
          boxShadow: '0 12px 32px rgba(16, 24, 40, 0.24)',
          padding: '12px 14px 10px',
          transition: transicion,
        }}
      >
        <div style={{ fontSize: font.sm, color: color.brand, fontWeight: 600, marginBottom: 4 }}>
          Paso {paso + 1} de {total}
        </div>
        <div style={{ fontSize: font.base, color: color.ink, lineHeight: 1.5 }}>{resuelto.texto}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginTop: space[3] }}>
          <Button variant="ghost" size="sm" onClick={() => ir(null)} style={{ marginRight: 'auto' }}>
            Salir
          </Button>
          {atras != null && (
            <Button variant="outline" size="sm" onClick={() => ir(atras)}>
              Atrás
            </Button>
          )}
          <Button variant="solid" tone="brand" size="sm" onClick={() => ir(sigue)}>
            {sigue == null ? 'Listo' : 'Siguiente'}
          </Button>
        </div>
      </div>
    </>,
    document.body,
  )
}
