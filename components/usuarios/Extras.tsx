'use client'

/**
 * "Además puede…": los 32 sub-permisos, afuera de la matriz y siempre a la vista.
 *
 * 🔑 **Un sub NUNCA lo trae la función** (ver `puedeSub` en `lib/permisos.core.js`): o se tilda
 * a mano, o no lo tiene nadie. Y son justo los que importan — aprobar un canje, aplicar un
 * conteo contra Gestión Nube, pausar campañas de Meta, escribir precios. Estaban como filas
 * `↳` adentro de una sección adentro de un área plegada, así que en la práctica no se tildaban
 * nunca: no porque alguien decidiera que no, sino porque no se veían.
 *
 * No están agrupados por área sino por **sección**, que es como se piensan ("de Canjes, ¿qué
 * puede?"). La lista sale de `SUBS_PLANOS`, derivada de `PERM_CAT`: no hay segunda lista.
 */

import { Fragment, useMemo } from 'react'
import type { Marca } from '@/lib/nav'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { SUBS_PLANOS, tienePermiso, type SubPlano } from '@/lib/usuarios/core'
import type { UsuarioConfig } from '@/lib/usuarios/tipos'
import { color, font, space, weight } from '@/components/ui'
import { Casilla } from './casilla'

/** Los subs agrupados por su sección, en el orden de `PERM_CAT`. */
const POR_SECCION: { seccion: string; label: string; subs: SubPlano[] }[] = []
for (const s of SUBS_PLANOS) {
  const ultimo = POR_SECCION[POR_SECCION.length - 1]
  if (ultimo?.seccion === s.seccion) ultimo.subs.push(s)
  else POR_SECCION.push({ seccion: s.seccion, label: s.seccionLabel, subs: [s] })
}

export function Extras({
  u,
  onPerm,
}: {
  u: UsuarioConfig
  onPerm: (brand: Marca, clave: string, val: boolean) => void
}) {
  const cuantos = useMemo(
    () => SUBS_PLANOS.filter((s) => s.brands.some((b) => tienePermiso(u, b, s.clave))).length,
    [u],
  )

  return (
    <div style={{ marginBottom: space[4] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', marginBottom: space[2] }}>
        <span style={{ fontSize: font.sm, color: color.mut, fontWeight: weight.semibold }}>Además puede…</span>
        <span style={{ fontSize: font.xs, color: color.mut2 }}>
          {cuantos} de {SUBS_PLANOS.length}
        </span>
        <InfoPopover titulo="Permisos de acción">
          Son las acciones sueltas que van <b>además</b> de ver la sección: aprobar, aplicar, publicar, escribir en
          Gestión Nube. <b>Ninguna la trae la función</b> —ni la de Dirección—, así que si no se tilda acá no la tiene
          nadie. Tildar una acción de una sección que la persona no ve <b>le da también la sección</b>.
        </InfoPopover>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.base, background: color.surface, borderRadius: 'var(--mo-r-lg)' }}>
          <thead>
            <tr style={{ color: color.mut2, fontSize: font.xs }}>
              <th style={{ textAlign: 'left', padding: '5px 8px' }}>Acción</th>
              <th style={{ width: 56 }}>BDI</th>
              <th style={{ width: 56 }}>Zattia</th>
            </tr>
          </thead>
          <tbody>
            {POR_SECCION.map((g) => {
              // Si la persona no ve la sección, tildar una acción se la va a dar (lo hace
              // `togglePerm`). Se avisa acá y no después: es un permiso que no se pidió.
              const sinSeccion = !g.subs[0].brands.some((b) => tienePermiso(u, b, g.seccion))
              return (
                <Fragment key={g.seccion}>
                  <tr style={{ background: color.bg, borderTop: `1px solid ${color.line}` }}>
                    <td colSpan={3} style={{ padding: '6px 8px', height: 'auto', fontSize: font.sm, fontWeight: weight.bold, color: color.ink2 }}>
                      {g.label}
                      {sinSeccion && (
                        <span style={{ fontWeight: weight.medium, color: color.mut2, fontSize: font.xs, marginLeft: 6 }}>
                          no ve esta sección — tildar algo acá se la da
                        </span>
                      )}
                    </td>
                  </tr>
                  {g.subs.map((s) => (
                    <tr key={s.clave} style={{ borderTop: `1px solid ${color.bg2}` }}>
                      <td style={{ padding: '5px 4px 5px 16px', height: 'auto', fontSize: 13 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                          {s.label}
                          {s.info && <InfoPopover titulo={s.label}>{s.info}</InfoPopover>}
                        </span>
                      </td>
                      <Casilla u={u} brand="bdi" clave={s.clave} brands={s.brands} onPerm={onPerm} />
                      <Casilla u={u} brand="zattia" clave={s.clave} brands={s.brands} onPerm={onPerm} />
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
