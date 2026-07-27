'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Marca } from '@/lib/nav.datos'
import type { Perfil } from '@/lib/permisos'
import { marcaInicial } from '@/lib/permisos'
import {
  canjearCodigo,
  consumirSalto,
  entrarConGoogle,
  hayCodigoEnLaUrl,
  marcarSalto,
  pidenSalto,
  saltoEnCurso,
  tokenActual,
} from '@/lib/identidad'
import { borrarSesion, guardarSesion, leerSesion, loginGoogle, rehidratarPorPass, type Via } from '@/lib/sesion'

type Ctx = {
  perfil: Perfil | null
  marca: Marca
  cargando: boolean
  /** Error de la vuelta de Google (cuenta sin alta en el KV, canje fallido). Lo muestra el login. */
  errorGoogle: string
  setMarca: (m: Marca) => void
  entrar: (perfil: Perfil, via?: Via) => void
  salir: () => void
}

const SesionCtx = createContext<Ctx | null>(null)

export function SesionProvider({ children }: { children: React.ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [marca, setMarcaState] = useState<Marca>('bdi')
  const [cargando, setCargando] = useState(true)
  const [errorGoogle, setErrorGoogle] = useState('')

  // Arranque. Tres caminos, en orden:
  //
  //  1. Volvemos de Google (`?code=` en la URL): se canjea y se entra. Va PRIMERO porque
  //     puede haber una sesión vieja guardada y la vuelta de Google manda sobre ella.
  //  2. Sesión guardada de Google: el perfil se rehidrata con el token del proveedor, que
  //     `getSession()` refresca solo. Si ya no hay token (el refresh expiró o se cerró la
  //     sesión en otra app), la sesión del monitor tampoco vale.
  //  3. Sesión guardada de contraseña: se revalida la credencial contra el KV. La sesión
  //     guarda el nombre, no el perfil, así que hay que ir a buscarlo igual que hacía
  //     intentarAutoLogin() del legacy — pero probando la contraseña, no leyendo la
  //     nómina completa de un endpoint abierto.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      if (hayCodigoEnLaUrl()) {
        const veniaDeSalto = consumirSalto()
        const canje = await canjearCodigo()
        const r = canje.ok ? await loginGoogle(canje.token) : null
        if (!vivo) return
        if (r?.ok) {
          const m = aplicar(r.perfil, null)
          guardarSesion(r.perfil.name, m, 'google') // ingreso nuevo: acá sí nace la sesión
        } else {
          // `r` no nulo = Google autenticó bien y lo que falta es el alta en el KV: eso se
          // muestra siempre, porque es información útil. `r` nulo = falló el canje, y si
          // veníamos de un salto silencioso eso es lo esperable (no había sesión de
          // Google): se muestra la pantalla de ingreso limpia, sin cartel de error.
          if (r || !veniaDeSalto) {
            setErrorGoogle(r ? r.error : 'No se pudo completar el ingreso con Google. Probá de nuevo.')
          }
          borrarSesion()
        }
        setCargando(false)
        return
      }

      const s = leerSesion()
      if (!s) {
        // Salto desde otra app de Areben: se intenta entrar con Google sin pantalla. Si
        // arranca bien nos vamos a Google, así que `cargando` queda en true a propósito —
        // mostrar el login por un instante sería un parpadeo inútil.
        if (pidenSalto() && !saltoEnCurso()) {
          marcarSalto()
          const salto = await entrarConGoogle({ silencioso: true })
          if (salto.ok) return
          consumirSalto()
        }
        if (vivo) setCargando(false)
        return
      }

      if (s.via === 'google') {
        const token = await tokenActual()
        const r = token ? await loginGoogle(token) : null
        if (!vivo) return
        if (r?.ok) aplicar(r.perfil, s.empresa)
        else borrarSesion()
        setCargando(false)
        return
      }

      const p = await rehidratarPorPass(s.user)
      if (!vivo) return
      if (p) {
        aplicar(p, s.empresa)
      } else {
        // El usuario ya no existe, le cambiaron la contraseña, o la pass no está
        // cacheada en este navegador: en los tres casos la sesión no se puede sostener.
        borrarSesion()
      }
      setCargando(false)
    })()

    /**
     * Deja el perfil andando y devuelve la marca elegida. NO reescribe la sesión: al
     * rehidratar, tocarla correría los 30 días de vencimiento en cada visita, que no es
     * lo que hacía el auto-login de antes. La sesión la escribe quien la crea.
     */
    function aplicar(p: Perfil, empresa: Marca | null): Marca {
      const m = marcaInicial(p, empresa)
      setPerfil(p)
      setMarcaState(m)
      return m
    }

    return () => {
      vivo = false
    }
  }, [])

  const entrar = useCallback((p: Perfil, via: Via = 'pass') => {
    const m = marcaInicial(p, null)
    setPerfil(p)
    setMarcaState(m)
    guardarSesion(p.name, m, via)
  }, [])

  const salir = useCallback(() => {
    borrarSesion()
    setPerfil(null)
  }, [])

  const setMarca = useCallback(
    (m: Marca) => {
      setMarcaState(m)
      // Se reescribe la sesión entera, así que hay que arrastrar el `via`: sin esto,
      // cambiar de marca degradaría una sesión de Google a una de contraseña y las
      // escrituras empezarían a pedir una contraseña que esa persona no tiene.
      if (perfil) guardarSesion(perfil.name, m, leerSesion()?.via ?? 'pass')
    },
    [perfil],
  )

  const valor = useMemo(
    () => ({ perfil, marca, cargando, errorGoogle, setMarca, entrar, salir }),
    [perfil, marca, cargando, errorGoogle, setMarca, entrar, salir],
  )

  return <SesionCtx.Provider value={valor}>{children}</SesionCtx.Provider>
}

export function useSesion(): Ctx {
  const c = useContext(SesionCtx)
  if (!c) throw new Error('useSesion tiene que usarse dentro de <SesionProvider>')
  return c
}
