'use client'

/**
 * "Qué ve esta persona", en un renglón.
 *
 * Es la mitad del problema que vino a resolver esta tanda: la pregunta *"¿qué termina viendo
 * Fulana?"* sólo se podía contestar abriendo once áreas plegadas y contando ~152 casillas a
 * ojo, así que en la práctica no se contestaba. Va en el encabezado de la ficha (para poder
 * auditar el equipo entero sin abrir a nadie) y al final del alta guiada (para poder confirmar
 * sabiendo qué se está firmando).
 *
 * Los números salen de `resumenUsuario`, que cuenta con el mismo `tienePermiso` que pinta cada
 * casilla de la matriz: si no coincidieran, el resumen no serviría para auditar.
 */

import { resumenUsuario } from '@/lib/usuarios/core'
import type { UsuarioConfig } from '@/lib/usuarios/tipos'
import { Badge, color, font, space } from '@/components/ui'

const NOMBRE_MARCA: Record<string, string> = { bdi: 'BDI', zattia: 'Zattia' }

export function Resumen({ u }: { u: UsuarioConfig }) {
  const r = resumenUsuario(u)

  if (r.esAdmin) {
    return (
      <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge tone="brand">admin</Badge>
        <span style={{ fontSize: font.xs, color: color.mut2 }}>ve todas las secciones de las dos marcas y gestiona usuarios</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap', alignItems: 'center' }}>
      {r.funciones.length > 0 ? (
        r.funciones.map((f) => (
          <Badge key={f} tone="brand" subtle>
            {f}
          </Badge>
        ))
      ) : (
        <Badge tone="neutral" subtle>
          sin función
        </Badge>
      )}

      {/* El detalle va por marca aunque sean dos: "18 de 44" escondería que en Zattia ve 3. */}
      {r.marcas.map((m) => (
        <Badge key={m} tone={r.secciones[m].tiene === 0 ? 'warning' : 'neutral'}>
          {NOMBRE_MARCA[m]} {r.secciones[m].tiene}/{r.secciones[m].total}
        </Badge>
      ))}

      {/* El `title` va en un span y no en el Badge: el kit no lo acepta, y la lista completa
          al pasar el mouse es justamente lo que evita tener que abrir la ficha. */}
      {r.extras.length > 0 && (
        <span title={r.extras.join(' · ')} style={{ display: 'inline-flex' }}>
          <Badge tone="neutral" subtle>
            {r.extras.length} {r.extras.length === 1 ? 'acción' : 'acciones'}
          </Badge>
        </span>
      )}

      {r.excepciones.length > 0 && (
        <span title={r.excepciones.join(' · ')} style={{ display: 'inline-flex' }}>
          <Badge tone="danger" subtle>
            {r.excepciones.length} {r.excepciones.length === 1 ? 'excepción' : 'excepciones'}
          </Badge>
        </span>
      )}

      {r.marcas.every((m) => r.secciones[m].tiene === 0) && (
        <span style={{ fontSize: font.xs, color: color.warningInk }}>no ve ninguna sección todavía</span>
      )}
    </div>
  )
}
