'use client'

/**
 * Toast — un solo canal para los mensajes de resultado.
 *
 * Reemplaza dos vicios repetidos por toda la app: el `alert('✓ guardado')` para contar
 * algo que salió bien, y el patrón `flashMsg` + `setTimeout` + un `<span>` chiquito que
 * cada sección se armaba (Ubicaciones, conteos, tncat…). Ese span solía ser SIEMPRE verde,
 * así que un error se anunciaba en color de éxito.
 *
 * Uso:
 *   const { ok, error, aviso } = useToast()
 *   ok(`${n} ${n === 1 ? 'ubicación guardada' : 'ubicaciones guardadas'}`)
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { toneTokens, type Tone } from '@/components/ui/tokens'

type Toast = { id: number; tono: Tone; texto: React.ReactNode; icono: string }

type Api = {
  ok: (t: React.ReactNode) => void
  error: (t: React.ReactNode) => void
  aviso: (t: React.ReactNode) => void
  info: (t: React.ReactNode) => void
}

const Ctx = createContext<Api | null>(null)

const VIDA_MS = 5000
const VIDA_ERROR_MS = 9000 // un error se lee con más calma que un éxito

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [lista, setLista] = useState<Toast[]>([])
  const seq = useRef(0)

  const push = useCallback((tono: Tone, icono: string, texto: React.ReactNode, vida: number) => {
    const id = ++seq.current
    setLista((prev) => [...prev, { id, tono, texto, icono }])
    setTimeout(() => setLista((prev) => prev.filter((t) => t.id !== id)), vida)
  }, [])

  const api = useMemo<Api>(
    () => ({
      ok: (t) => push('success', '✓', t, VIDA_MS),
      error: (t) => push('danger', '⚠', t, VIDA_ERROR_MS),
      aviso: (t) => push('warning', '!', t, VIDA_ERROR_MS),
      info: (t) => push('neutral', 'ℹ', t, VIDA_MS),
    }),
    [push],
  )

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="mo-toasts" role="status" aria-live="polite">
        {lista.map((t) => {
          const c = toneTokens[t.tono]
          return (
            <div
              key={t.id}
              className="mo-toast"
              style={{ '--_bg': c.bg, '--_fg': c.fg, '--_bd': c.border } as React.CSSProperties}
              onClick={() => setLista((prev) => prev.filter((x) => x.id !== t.id))}
            >
              <span aria-hidden style={{ fontWeight: 700 }}>
                {t.icono}
              </span>
              <span>{t.texto}</span>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}

/** Fuera de un ToastProvider no hace nada (no rompe una sección a medio migrar). */
export function useToast(): Api {
  const api = useContext(Ctx)
  return api ?? { ok: () => {}, error: () => {}, aviso: () => {}, info: () => {} }
}
