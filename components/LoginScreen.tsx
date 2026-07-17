'use client'

import { useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { guardarAdminPass, login } from '@/lib/sesion'

/**
 * Replica el login actual (doLogin, index.html:9500): valida contra el KV, que es
 * quien tiene las contraseñas. NO es Supabase Auth a propósito — el iframe legacy
 * hace intentarAutoLogin() leyendo localStorage, y cambiar el modelo de sesión acá
 * lo dejaría afuera. El cambio de auth de verdad es la Fase S.
 */
export function LoginScreen() {
  const { entrar } = useSesion()
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError('Validando…')
    const r = await login(user.trim(), pass)
    if (r.ok) {
      // El legacy la necesita para autenticar guardados de admin (_getAdminPass).
      guardarAdminPass(pass)
      setError('')
      entrar(r.perfil)
    } else {
      setError(r.error)
      setEnviando(false)
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-title">
          AREBEN <span>SRL</span>
        </div>
        <div className="login-sub">Panel de análisis de ventas</div>

        <label className="login-label" htmlFor="login-user">
          Usuario
        </label>
        <input
          id="login-user"
          className="login-input"
          placeholder="Nombre completo"
          autoComplete="username"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          autoFocus
        />

        <label className="login-label" htmlFor="login-pass">
          Contraseña
        </label>
        <input
          id="login-pass"
          className="login-input"
          type="password"
          placeholder="Contraseña"
          autoComplete="current-password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />

        <button className="login-btn" type="submit" disabled={enviando}>
          Ingresar
        </button>
        <div className="login-error">{error}</div>
      </form>
    </div>
  )
}
