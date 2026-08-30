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
import { normalizarLinkHoras, resumenUsuario, sinLinkDeHoras } from '@/lib/usuarios/core'
import type { UsuarioConfig } from '@/lib/usuarios/tipos'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { Button, color, Field, font, Input, Notice, Plegable, Select, space } from '@/components/ui'
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
  onHorasExtras,
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
  onCampo: (campo: 'name' | 'pass' | 'email' | 'apodo' | 'cumple' | 'horasLink', val: string) => void
  onAdmin: (val: boolean) => void
  onHorasExtras: (val: boolean) => void
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
            {/* Cómo le decimos. Es lo único de esta pantalla que la persona ve de sí misma: el
                Inicio la recibe con esto. Va aparte del usuario porque el usuario es la llave de
                login —y en los puestos compartidos es `bdilocal`, que no saluda a nadie—. Vacío
                cae al usuario, así que dejarlo así nunca deja el saludo en blanco. */}
            <Field label="Cómo le decimos">
              <Input placeholder={u.name || 'el usuario'} value={u.apodo || ''} onChange={(e) => onCampo('apodo', e.target.value)} />
            </Field>
            {/* Sin año: se guarda `MM-DD` porque lo único que se hace con esto es saludar.
                `type="date"` pide un año igual, así que se le pone uno fijo para mostrar y se
                recorta al guardar; el año que se ve no significa nada y no se guarda. */}
            <Field label="Cumpleaños">
              <Input
                type="date"
                value={u.cumple ? `2000-${u.cumple}` : ''}
                onChange={(e) => onCampo('cumple', e.target.value.slice(5))}
              />
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

          {/* Horas extras. Va acá arriba, del lado de la función y no de los permisos, porque no
              es un permiso: es una condición laboral de la persona. Y va ANTES del corte por
              `u.admin` a propósito — un administrador también puede hacer horas extras, y si
              quedara del lado de los permisos no se le podría tildar. */}
          <HorasExtras u={u} onCampo={onCampo} onHorasExtras={onHorasExtras} />

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

/**
 * El interruptor de las horas extras: un tilde y su link de carga.
 *
 * 🔑 **El tilde es lo único que decide a quién le llega la rutina mensual** «Cargar las horas
 * extras» (destino `{tipo:'horas-extras'}`). Antes era una lista de tres nombres escrita adentro
 * de la rutina, o sea dos verdades sobre lo mismo: acá hay una sola.
 *
 * ⚠️ **El link se escribe en un borrador y se normaliza al SALIR del campo, no en cada tecla.**
 * Normalizar mientras se tipea deja el campo peleando contra los dedos; y guardar crudo lo que se
 * pegó deja pasar un link de otro lado, que no falla hasta el último día del mes.
 */
function HorasExtras({
  u,
  onCampo,
  onHorasExtras,
}: {
  u: UsuarioConfig
  onCampo: (campo: 'horasLink', val: string) => void
  onHorasExtras: (val: boolean) => void
}) {
  const [borrador, setBorrador] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const salir = () => {
    if (borrador === null) return
    const crudo = borrador.trim()
    setBorrador(null)
    if (!crudo) {
      setError(null)
      onCampo('horasLink', '')
      return
    }
    const link = normalizarLinkHoras(crudo)
    if (!link) {
      // Se conserva lo escrito en el estado guardado, no: se descarta y se explica. Guardar algo
      // que no es un link haría que la ficha diga que tiene link y el botón lleve a la nada.
      setError('Eso no es un link de carga de horas. Copialo del dashboard, en RR.HH. → Horas extras → Links.')
      return
    }
    setError(null)
    onCampo('horasLink', link)
  }

  return (
    <div style={{ margin: '0 0 14px' }}>
      <label style={{ fontSize: font.base, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <input
          type="checkbox"
          checked={u.horasExtras === true}
          onChange={(e) => onHorasExtras(e.target.checked)}
          style={{ accentColor: color.brandSolid }}
        />{' '}
        Hace horas extras
      </label>
      <InfoPopover titulo="Horas extras">
        Con esto tildado, el último día de cada mes le aparece el pendiente «Cargar las horas extras» y el botón para
        cargarlas. Destildado, no le llega: es lo que evita que las cargue quien no las hace. El link es personal y sale
        del dashboard, en <b>RR.HH. → Horas extras → Links</b>.
      </InfoPopover>

      {u.horasExtras && (
        <div style={{ marginTop: 8, maxWidth: 460 }}>
          <Field
            label="Link de carga"
            hint="Copiado del dashboard, en RR.HH. → Horas extras → Links. Es el link de ella sola."
            error={error || undefined}
          >
            <Input
              placeholder="https://dashboard.arebensrl.com/horas/…"
              value={borrador ?? u.horasLink ?? ''}
              onChange={(e) => setBorrador(e.target.value)}
              onBlur={salir}
            />
          </Field>
          {sinLinkDeHoras(u) && !borrador && (
            <Notice tone="warning" icon="⚠️" style={{ marginTop: 8 }}>
              Le va a llegar el pendiente de fin de mes y no va a tener con qué cargarlas. Generale el link en el
              dashboard y pegalo acá.
            </Notice>
          )}
        </div>
      )}
    </div>
  )
}
