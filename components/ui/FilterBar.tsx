'use client'

/**
 * FilterBar — la fila de filtros de un listado: buscador + chips + contador a la derecha.
 *
 * Dos cosas que arregla del estado anterior:
 *
 * 1. **Los filtros eran checkboxes sueltos** ("Solo sin ubicación", "Solo a reparar") o
 *    chips hechos con `.btn-sm` y un hex a mano por sección. Y sobre todo: no decían
 *    CUÁNTOS registros caen en cada filtro, que suele ser el dato que se está buscando
 *    ("¿cuántos me faltan?"). Los chips ahora llevan el número al lado.
 * 2. **El filtro se perdía al refrescar.** Con `useFiltroUrl` vive en la URL: sobrevive un
 *    F5, se puede compartir el link con el filtro puesto y el botón atrás del navegador
 *    hace lo que uno espera.
 */
import { useCallback, useState } from 'react'
import { Input } from '@/components/ui/Field'

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="mo-filterbar">{children}</div>
}

/** Buscador estándar del listado (240px en compu, ancho completo en móvil). */
export function BuscarInput({ value, onChange, placeholder = 'Buscar…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Input
      className="mo-input mo-filterbar-search"
      type="search"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export type ChipOpt<T extends string> = { key: T; label: string; n?: number; title?: string }

/** Chips de filtro mutuamente excluyentes (el patrón "Todos / Sin X / Con Y"). */
export function Chips<T extends string>({ opciones, value, onChange }: { opciones: ChipOpt<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mo-chips" role="group">
      {opciones.map((o) => (
        <button
          key={o.key}
          type="button"
          className="mo-chip"
          aria-pressed={value === o.key}
          title={o.title}
          onClick={() => onChange(o.key)}
        >
          {o.label}
          {o.n != null && <span className="mo-chip-n">{o.n.toLocaleString('es-AR')}</span>}
        </button>
      ))}
    </div>
  )
}

/** Contador de resultados, alineado a la derecha de la barra. */
export function ContadorFiltro({ n, singular, plural }: { n: number; singular: string; plural: string }) {
  return (
    <span className="mo-filterbar-right">
      {n.toLocaleString('es-AR')} {n === 1 ? singular : plural}
    </span>
  )
}

/**
 * Un filtro que vive en la URL (`?q=remera&f=sin`).
 *
 * Escribe con `history.replaceState` y no con `router.replace` a propósito: no queremos
 * que tipear en el buscador dispare una navegación de Next (re-render del shell) por cada
 * tecla. La URL es acá una memoria, no una fuente de verdad reactiva: se lee una sola vez
 * al montar y desde entonces manda el estado de React.
 */
export function useFiltroUrl<T extends string>(nombre: string, inicial: T): [T, (v: T) => void] {
  // Se lee en el inicializador y no en un efecto: leerlo después obligaría a un setState
  // dentro del efecto (cascada de renders, y el lint del repo lo prohibe con razón).
  // El guard de `window` es por el prerender de Next; en la práctica las secciones no se
  // renderizan en el servidor porque dependen de la sesión, que es del cliente.
  const [valor, setValor] = useState<T>(() => {
    if (typeof window === 'undefined') return inicial
    return (new URLSearchParams(window.location.search).get(nombre) as T) || inicial
  })

  const set = useCallback(
    (v: T) => {
      setValor(v)
      const url = new URL(window.location.href)
      if (v && v !== inicial) url.searchParams.set(nombre, v)
      else url.searchParams.delete(nombre)
      window.history.replaceState(null, '', url)
    },
    [nombre, inicial],
  )

  return [valor, set]
}
