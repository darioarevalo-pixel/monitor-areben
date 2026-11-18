'use client'

/**
 * Logística DEBAJO de cada pedido de la ficha (Darío 18-nov: «debería unificarse», el cuadro aparte agrandaba la vista).
 * La tarjeta de Pedidos deja un hueco por pedido (`HuecoLogistica`, por su código M-xxxx) y `PedidosLogistica` dibuja ahí
 * —con un portal— el renglón de ese pedido; lo que no tiene pedido en la lista sigue en el cuadro «Logística».
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react'

type Huecos = { huecos: Record<string, HTMLElement>; registrar: (codigo: string, el: HTMLElement | null) => void }
const Ctx = createContext<Huecos | null>(null)

export const claveHueco = (codigo: string | number | null | undefined) => String(codigo ?? '').trim().toUpperCase()

export function ConHuecosLogistica({ children }: { children: React.ReactNode }) {
  const [huecos, setHuecos] = useState<Record<string, HTMLElement>>({})
  const [registrar] = useState(() => (codigo: string, el: HTMLElement | null) =>
    setHuecos((h) => {
      const k = claveHueco(codigo)
      if (el) return h[k] === el ? h : { ...h, [k]: el }
      if (!h[k]) return h
      const resto = { ...h }
      delete resto[k]
      return resto
    }))
  return <Ctx.Provider value={{ huecos, registrar }}>{children}</Ctx.Provider>
}

export const useHuecosLogistica = () => useContext(Ctx)

/** El lugar debajo de un pedido donde cae su Logística. Se anota al montar y se borra al desmontar. */
export function HuecoLogistica({ codigo }: { codigo: string }) {
  const ctx = useContext(Ctx)
  const ref = useRef<HTMLDivElement>(null)
  const registrar = ctx?.registrar
  useEffect(() => {
    if (!registrar || !ref.current) return
    registrar(codigo, ref.current)
    return () => registrar(codigo, null)
  }, [registrar, codigo])
  return <div ref={ref} />
}
