'use client'

import { useState } from 'react'
import { APPS, APP_ACTUAL } from '@/lib/apps-areben'

/**
 * "Nuestras apps": el salto a los otros sistemas internos, en el pie del sidebar.
 *
 * Se listan las cinco a todo el mundo, incluso las que la persona no usa: el criterio
 * es que todos sepan qué herramientas existen — si alguien necesita una, la pide, en
 * vez de no enterarse de que está. Quien no tenga acceso ve el mensaje de "tu cuenta
 * no tiene acceso a este sistema", que las tres apps propias ya dan.
 *
 * Arranca cerrado: es un salto ocasional, no algo del día a día.
 */
export function NuestrasApps({ onNavegar }: { onNavegar?: () => void }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className={`apps-foot${abierto ? ' open' : ''}`}>
      <button className="apps-cat" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
        Nuestras apps
        <span className="nav-caret">▾</span>
      </button>

      {abierto && (
        <div className="apps-menu">
          {APPS.map((app) =>
            app.id === APP_ACTUAL ? (
              <div key={app.id} className="apps-item actual" aria-current="page">
                <span className="apps-nombre">
                  {app.nombre} <span className="apps-aca">· estás acá</span>
                </span>
                <span className="apps-desc">{app.descripcion}</span>
              </div>
            ) : (
              <a key={app.id} href={app.href} className="apps-item" onClick={onNavegar}>
                <span className="apps-nombre">{app.nombre}</span>
                <span className="apps-desc">{app.descripcion}</span>
              </a>
            ),
          )}
        </div>
      )}
    </div>
  )
}
