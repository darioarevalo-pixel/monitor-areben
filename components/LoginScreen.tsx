'use client'

import { useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { entrarConGoogle } from '@/lib/identidad'
import { guardarAdminPass, login } from '@/lib/sesion'

/**
 * Dos formas de entrar, y las dos son de primera clase:
 *
 *  - **Google**, para quien tiene casilla @arebensrl.com. Es el ingreso único de Areben:
 *    la misma cuenta abre el monitor, producción y el dashboard.
 *  - **Usuario y contraseña**, validado contra el KV como siempre. No es un resto de la
 *    transición: Depósito, Local y bdilocal son puestos de trabajo compartidos, no
 *    personas, y no pueden tener casilla de Workspace. Este camino se queda.
 */
export function LoginScreen() {
  const { entrar, errorGoogle } = useSesion()
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [yendoAGoogle, setYendoAGoogle] = useState(false)

  async function onGoogle() {
    setYendoAGoogle(true)
    setError('')
    const r = await entrarConGoogle()
    // Si sale bien, el navegador ya se está yendo a Google: no hay nada que resetear.
    if (!r.ok) {
      setError('No se pudo abrir el ingreso con Google. Probá de nuevo.')
      setYendoAGoogle(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError('Validando…')
    const r = await login(user.trim(), pass)
    if (r.ok) {
      // El legacy la necesita para autenticar guardados de admin (_getAdminPass).
      guardarAdminPass(pass)
      setError('')
      entrar(r.perfil, 'pass', r.cumples)
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

        <p className="login-aviso">
          Si tenés mail <strong>@arebensrl.com</strong>, ahora entrás con Google: es la misma cuenta para el
          Monitor, Producción y el Dashboard.
        </p>

        <button className="login-google" type="button" onClick={onGoogle} disabled={yendoAGoogle || enviando}>
          <LogoGoogle />
          {yendoAGoogle ? 'Abriendo Google…' : 'Entrar con Google'}
        </button>

        <div className="login-o">o</div>

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

        <button className="login-btn" type="submit" disabled={enviando || yendoAGoogle}>
          Ingresar
        </button>
        <div className="login-error">{error || errorGoogle}</div>
      </form>
    </div>
  )
}

/** Logo de Google, inline: es una marca, no un ícono del kit, y va con sus colores. */
function LogoGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path fill="#FBBC05" d="M3.95 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l2.99-2.33Z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l2.99 2.33C4.66 5.16 6.65 3.58 9 3.58Z"
      />
    </svg>
  )
}
