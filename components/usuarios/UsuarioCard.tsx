'use client'

/**
 * La ficha de una persona: cómo entra, qué hace, y —plegado— el ajuste fino de permisos.
 *
 * El orden es el del problema real. Arriba, sus datos y su **función**, que es lo que decide
 * el 95% de lo que va a ver. Después "Además puede…", las acciones que ninguna función trae y
 * que por eso hay que decidir a conciencia. Y al final, plegada, la matriz de 44 secciones ×
 * 2 marcas, que antes era lo primero y lo único.
 */

import { useState } from 'react'
import type { Marca } from '@/lib/nav'
import { FUNCIONES, type Funcion } from '@/lib/permisos'
import { resumenUsuario } from '@/lib/usuarios/core'
import type { UsuarioConfig } from '@/lib/usuarios/tipos'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { Button, color, Field, font, Input, Plegable, Select, space } from '@/components/ui'
import { Extras } from './Extras'
import { MatrizPermisos } from './MatrizPermisos'
import { Resumen } from './Resumen'

export function UsuarioCard({
  u,
  primero,
  abierto,
  ajusteAbierto,
  onToggleOpen,
  onCampo,
  onAdmin,
  onCuenta,
  onPerm,
  onPermArea,
  onCopiar,
  onFuncion,
  onEliminar,
}: {
  u: UsuarioConfig
  primero: boolean
  abierto: boolean
  /** El alta guiada puede pedir abrir directo en el ajuste fino ("Crear y ajustar a mano"). */
  ajusteAbierto?: boolean
  onToggleOpen: () => void
  onCampo: (campo: 'name' | 'pass' | 'email', val: string) => void
  onAdmin: (val: boolean) => void
  onCuenta: (val: string) => void
  onPerm: (brand: Marca, clave: string, val: boolean) => void
  onPermArea: (brand: Marca, claves: string[], val: boolean) => void
  onCopiar: (origen: Marca, destino: Marca) => void
  onFuncion: (f: Funcion, val: boolean) => void
  onEliminar: () => void
}) {
  const [ajuste, setAjuste] = useState(!!ajusteAbierto)
  const r = resumenUsuario(u)

  return (
    <div style={{ borderTop: primero ? undefined : `1px solid ${color.line}`, background: abierto ? color.bg : undefined }}>
      <div
        onClick={onToggleOpen}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '11px 14px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
          <b>{u.name || '(nuevo usuario)'}</b>
          {/* Cómo entra: es lo que se mira al repartir los mails de Google. Quien no tiene
              ninguna de las dos cosas no entra por ningún lado, y `validar` lo frena. */}
          <span style={{ fontSize: font.xs, color: color.mut2 }}>
            {u.email ? `Google · ${u.email}` : u.tienePass || u.pass ? 'con contraseña' : 'sin acceso'}
          </span>
          {/* Qué ve: antes había que abrir once áreas plegadas y contar casillas para saberlo. */}
          <Resumen u={u} />
        </div>
        <span aria-hidden style={{ color: color.mut2 }}>
          {abierto ? '▴' : '▾'}
        </span>
      </div>

      {abierto && (
        <div style={{ padding: '0 14px 14px' }}>
          {/* Grid auto-fit en vez de cuatro anchos fijos que sumaban 790px: los campos se
              acomodan solos de 4 a 1 columna sin media query, que es el idioma del repo. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end', margin: '6px 0 14px' }}>
            <Field label="Usuario">
              <Input value={u.name} onChange={(e) => onCampo('name', e.target.value)} />
            </Field>
            {/* Las contraseñas se guardan hasheadas: no se pueden volver a leer, ni acá
                ni en el KV. Así que este campo no muestra la actual —muestra si hay una— y
                sirve para poner una nueva. Vacío al guardar = no se toca. */}
            <Field label={u.tienePass ? 'Cambiar contraseña' : 'Contraseña'}>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder={u.tienePass ? 'dejar vacío = sin cambios' : 'sin contraseña (solo Google)'}
                value={u.pass || ''}
                onChange={(e) => onCampo('pass', e.target.value)}
              />
            </Field>
            {/* El mail es lo que enlaza a esta persona con su cuenta de Google, y de paso
                con la misma persona en producción y en el dashboard: los nombres de usuario
                no cruzan entre sistemas ("Candela Luis" acá es "candela" en producción), el
                mail sí. Vacío = entra solo con contraseña, que es el caso de Depósito y
                Local, que son puestos y no personas. */}
            <Field label="Mail (para entrar con Google)">
              <Input
                type="email"
                placeholder="nombre@arebensrl.com"
                value={u.email || ''}
                onChange={(e) => onCampo('email', e.target.value.trim().toLowerCase())}
              />
            </Field>
            <Field label="Marca">
              <Select value={u.cuenta || ''} onChange={(e) => onCuenta(e.target.value)}>
                <option value="">BDI + Zattia</option>
                <option value="bdi">Solo BDI</option>
                <option value="zattia">Solo Zattia</option>
              </Select>
            </Field>
            <label style={{ fontSize: font.base, display: 'flex', alignItems: 'center', gap: 6, height: 'var(--mo-ctl-h)' }}>
              <input type="checkbox" checked={u.admin} onChange={(e) => onAdmin(e.target.checked)} style={{ accentColor: color.brandSolid }} />
              Administrador (ve todo)
            </label>
          </div>

          {/* La función es lo que decide casi todo lo que ve, así que va arriba y sola. */}
          <div style={{ margin: '0 0 14px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', fontSize: font.sm, color: color.mut, marginBottom: 5 }}>
              Función
              <InfoPopover titulo="Función del usuario">
                Rol de flujo de trabajo (además de los permisos). Define qué parte de una Solicitud ve cada uno:
                Local ve lo de retirar en local, Depósito lo de preparar, Marketing la solicitud completa, Dirección
                todo (su Inicio no arranca con las fotos para armar). Un usuario puede tener varias. Le da los
                sectores enteros de su área, y una sección nueva de ese sector la hereda sola.
              </InfoPopover>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {FUNCIONES.map((f) => (
                <label key={f.key} style={{ fontSize: font.base, display: 'inline-flex', alignItems: 'center', gap: 5 }} title={f.info}>
                  <input
                    type="checkbox"
                    checked={!!u.funcion?.includes(f.key)}
                    onChange={(e) => onFuncion(f.key, e.target.checked)}
                    style={{ accentColor: color.brandSolid }}
                  />{' '}
                  {f.label}
                </label>
              ))}
            </div>
          </div>

          {u.admin ? (
            <div style={{ fontSize: font.sm, color: color.mut, padding: '8px 0' }}>
              Es administrador: ve todas las secciones de las dos marcas, puede hacer todas las acciones y gestionar
              usuarios. Para darle permisos de a uno, destildá «Administrador».
            </div>
          ) : (
            <>
              <Extras u={u} onPerm={onPerm} />

              <Plegable
                abierto={ajuste}
                onToggle={() => setAjuste((a) => !a)}
                titulo="Ajustar a mano (avanzado)"
                ayuda={`Sección por sección y marca por marca. Hoy ve ${r.secciones.bdi.tiene} de ${r.secciones.bdi.total} en BDI y ${r.secciones.zattia.tiene} de ${r.secciones.zattia.total} en Zattia. Casi nunca hace falta: lo que decide qué ve es su función.`}
              >
                <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', marginBottom: space[2] }}>
                  <span style={{ fontSize: font.sm, color: color.mut }}>
                    El permiso es por marca. Casi todo el mundo trabaja igual en las dos:
                  </span>
                  <Button size="sm" variant="outline" onClick={() => onCopiar('bdi', 'zattia')}>
                    Copiar BDI → Zattia
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onCopiar('zattia', 'bdi')}>
                    Copiar Zattia → BDI
                  </Button>
                </div>
                <MatrizPermisos u={u} onPerm={onPerm} onPermArea={onPermArea} />
              </Plegable>
            </>
          )}

          <div style={{ marginTop: 12 }}>
            <Button size="sm" variant="outline" tone="danger" onClick={onEliminar}>
              Eliminar usuario
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
