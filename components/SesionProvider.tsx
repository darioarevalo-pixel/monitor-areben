'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Marca } from '@/lib/nav.generated'
import type { Perfil } from '@/lib/permisos'
import { marcaInicial } from '@/lib/permisos'
import { borrarSesion, guardarSesion, leerSesion, traerPerfiles } from '@/lib/sesion'

type Ctx = {
  perfil: Perfil | null
  marca: Marca
  cargando: boolean
  setMarca: (m: Marca) => void
  entrar: (perfil: Perfil) => void
  salir: () => void
}

const SesionCtx = createContext<Ctx | null>(null)

export function SesionProvider({ children }: { children: React.ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [marca, setMarcaState] = useState<Marca>('bdi')
  const [cargando, setCargando] = useState(true)

  // Auto-login: mismo contrato que intentarAutoLogin() del legacy. La sesión no
  // guarda el perfil, solo el nombre, así que hay que rehidratarlo del KV.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const s = leerSesion()
      if (!s) {
        if (vivo) setCargando(false)
        return
      }
      const perfiles = await traerPerfiles()
      if (!vivo) return
      const p = perfiles?.find((x) => x.name === s.user) ?? null
      if (p) {
        setPerfil(p)
        setMarcaState(marcaInicial(p, s.empresa))
      } else {
        // El usuario ya no existe en el KV: la sesión no vale.
        borrarSesion()
      }
      setCargando(false)
    })()
    return () => {
      vivo = false
    }
  }, [])

  const entrar = useCallback((p: Perfil) => {
    const m = marcaInicial(p, null)
    setPerfil(p)
    setMarcaState(m)
    guardarSesion(p.name, m)
  }, [])

  const salir = useCallback(() => {
    borrarSesion()
    setPerfil(null)
  }, [])

  const setMarca = useCallback(
    (m: Marca) => {
      setMarcaState(m)
      if (perfil) guardarSesion(perfil.name, m) // el iframe relee esto al recargarse
    },
    [perfil],
  )

  const valor = useMemo(
    () => ({ perfil, marca, cargando, setMarca, entrar, salir }),
    [perfil, marca, cargando, setMarca, entrar, salir],
  )

  return <SesionCtx.Provider value={valor}>{children}</SesionCtx.Provider>
}

export function useSesion(): Ctx {
  const c = useContext(SesionCtx)
  if (!c) throw new Error('useSesion tiene que usarse dentro de <SesionProvider>')
  return c
}
