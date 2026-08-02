'use client'

import { useEffect, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { esAdmin, funcionQueDa, FUNCIONES, type Funcion } from '@/lib/permisos'
import { credencialConPrompt, guardarAdminPass, guardarConfigAdmin, traerConfigAdmin } from '@/lib/sesion'
import { keysDeCat, NAV_CATS, PERM_CAT, type Marca } from '@/lib/nav'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { copiarPermisos, normalizar, nuevoUsuario, origenPermiso, tienePermiso, toggleFuncion, togglePerm, validar } from '@/lib/usuarios/core'
import type { UsuarioConfig } from '@/lib/usuarios/tipos'
import { HeaderAcciones } from '@/components/layout/acciones'
import { Badge, Button, Card, Field, Input, Notice, Select, color, font, weight, useConfirmar } from '@/components/ui'

/** En qué grupos del menú aparece cada sección (una puede colgar de varios). */
const GRUPOS_DE = new Map<string, string[]>()
for (const c of NAV_CATS) {
  for (const k of keysDeCat(c)) GRUPOS_DE.set(k, [...(GRUPOS_DE.get(k) ?? []), c.id])
}

const LABEL_AREA = new Map(NAV_CATS.map((c) => [c.id, c.label]))

/**
 * Las secciones agrupadas por sector, en el orden del menú. La lista plana de 35 filas
 * sin jerarquía era el reclamo concreto: no se sabía a qué sector correspondía cada
 * permiso, así que dar de alta a alguien era ir tildando de memoria.
 *
 * El grupo sale del **menú**, no de `PermCat.area`. El área es una sola y el menú puede
 * mostrar la misma sección en varios sectores: `solicitudes` cuelga de cuatro (Local,
 * Depósito, Marketing y Administración) pero su área es `local`, así que Config la mostraba
 * únicamente ahí y darle Solicitudes a la cuenta de Depósito era imposible desde su sector —
 * había que saber que estaba escondida en Local. Es el reclamo de Bruno.
 *
 * Las que no tienen entrada de menú caen en su área: `resumen`, y `sesion-fotos` /
 * `solicitudes-internas`, que ya no son secciones sino el detalle de Solicitudes y siguen en
 * la lista por sus sub-permisos (editar, aprobar consumos).
 */
const AREAS = NAV_CATS.map((c) => ({
  id: c.id,
  label: c.label,
  secciones: PERM_CAT.filter((p) => (GRUPOS_DE.get(p.key) ?? [p.area]).includes(c.id)).map((p) => {
    const otros = (GRUPOS_DE.get(p.key) ?? []).filter((g) => g !== c.id)
    return {
      ...p,
      // El menú le da a la misma sección un nombre por sector ("Solicitudes a preparar" en
      // Depósito). Config usa el mismo, porque es el que la persona va a ver.
      label: c.labels?.[p.key] ?? p.label,
      info: otros.length
        ? `${p.info ?? ''} · Es la MISMA sección que ${otros.map((g) => LABEL_AREA.get(g) ?? g).join(', ')}: el permiso es uno solo, tildarlo acá lo tilda en todos (cada sector ve adentro lo suyo).`
        : p.info,
    }
  }),
})).filter((a) => a.secciones.length > 0)

type Estado = { msg: string; color: string } | null

/**
 * Los checkbox de la matriz. Al bajar la altura de fila el tilde queda chico para el dedo,
 * así que el área táctil se la da el propio control: 17px de caja más el margen alrededor.
 */
const ESTILO_CHECK: React.CSSProperties = { width: 17, height: 17, margin: '7px 4px', cursor: 'pointer' }

/**
 * Gestión de usuarios y permisos (solo admin). Port de la sección usuarios* del
 * legacy (index.html:9417-9512). Pide la config COMPLETA (admin-gated), la edita en
 * una copia local, y guarda todo junto. La lógica (toggle padre/sub, validación) va
 * en lib/usuarios/core.
 *
 * Tanda 10: la lista era una pila de `<div>` con borde y **fondo transparente**, así que
 * sobre el lienzo gris la pantalla entera se leía "todo en gris" (el reclamo de Bruno).
 * Ahora las fichas viven dentro de UNA superficie blanca, separadas por línea — la regla 5
 * del rediseño: toda lista importante va sobre una superficie, nunca como filas-card
 * sueltas sobre el lienzo.
 */
export function Usuarios() {
  const { confirmar } = useConfirmar()
  const { perfil } = useSesion()
  const admin = esAdmin(perfil)
  const [users, setUsers] = useState<UsuarioConfig[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<Estado>(null)
  const [abierto, setAbierto] = useState<number | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setUsers(null)
      setError(null)
      const r = await traerConfigAdmin<UsuarioConfig>(await credencialConPrompt())
      if (!vivo) return
      if (r.ok) setUsers(r.users.map(normalizar))
      else {
        if (r.prohibido) guardarAdminPass('')
        setError(r.error)
      }
    })()
    return () => {
      vivo = false
    }
  }, [perfil, tick])

  if (!admin) return <div style={{ padding: 16, color: color.mut2 }}>Solo un administrador puede gestionar usuarios.</div>

  const mut = (i: number, fn: (u: UsuarioConfig) => UsuarioConfig) => setUsers((prev) => (prev ? prev.map((u, j) => (j === i ? fn(u) : u)) : prev))
  const onCampo = (i: number, campo: 'name' | 'pass' | 'email', val: string) => mut(i, (u) => ({ ...u, [campo]: val }))
  const onAdmin = (i: number, val: boolean) => mut(i, (u) => ({ ...u, admin: val }))
  const onCuenta = (i: number, val: string) => mut(i, (u) => ({ ...u, cuenta: (val || null) as Marca | null }))
  const onPerm = (i: number, brand: Marca, key: string, val: boolean) => mut(i, (u) => togglePerm(u, brand, key, val))
  const onPermArea = (i: number, brand: Marca, keys: string[], val: boolean) =>
    mut(i, (u) => keys.reduce((acc, k) => togglePerm(acc, brand, k, val), u))
  const onCopiar = (i: number, origen: Marca, destino: Marca) => mut(i, (u) => copiarPermisos(u, origen, destino))
  const onFuncion = (i: number, f: Funcion, val: boolean) => mut(i, (u) => toggleFuncion(u, f, val))
  const agregar = () =>
    setUsers((prev) => {
      const next = [...(prev || []), nuevoUsuario()]
      setAbierto(next.length - 1)
      return next
    })
  const eliminar = async (i: number) => {
    if (!users) return
    const ok = await confirmar({
      titulo: 'Eliminar el usuario',
      tono: 'danger',
      ok: 'Eliminar',
      mensaje: `"${users[i].name || '(sin nombre)'}" pierde el acceso al monitor. Si está trabajando ahora, se le corta.`,
    })
    if (!ok) return
    setUsers((prev) => (prev ? prev.filter((_, j) => j !== i) : prev))
    setAbierto(null)
  }

  const guardar = async () => {
    if (!users) return
    const err = validar(users)
    if (err) {
      setStatus({ msg: err, color: color.danger })
      return
    }
    setGuardando(true)
    setStatus({ msg: 'Guardando…', color: color.mut })
    const r = await guardarConfigAdmin(await credencialConPrompt(), users)
    setGuardando(false)
    if (r.ok) setStatus({ msg: 'Guardado. Los cambios ya aplican para todos.', color: color.success })
    else {
      if (r.prohibido) guardarAdminPass('')
      setStatus({ msg: 'Error: ' + r.error, color: color.danger })
    }
  }

  return (
    <>
      {/* Las acciones al header, como en el resto. Y UN solo primario: guardar es lo que
          cierra el trabajo de esta pantalla, así que es el lleno; agregar un usuario es
          el paso previo y queda secundario. Antes eran dos botones llenos —verde e
          índigo— pegados, sin jerarquía entre ellos. */}
      <HeaderAcciones>
        {status && <span style={{ fontSize: font.sm, color: status.color }}>{status.msg}</span>}
        <Button variant="ghost" onClick={() => setTick((t) => t + 1)} title="Volver a leer la configuración">
          Recargar
        </Button>
        <Button variant="outline" onClick={agregar}>
          Agregar usuario
        </Button>
        <Button variant="solid" tone="brand" onClick={guardar} loading={guardando} disabled={!users}>
          Guardar cambios
        </Button>
      </HeaderAcciones>

      {/* Config aparece dentro de las dos marcas, pero la lista de usuarios es UNA sola:
          el endpoint no recibe marca. Lo que sí es por marca son los permisos de cada uno. */}
      <Notice style={{ marginBottom: 12 }}>
        Esta configuración es <b>única para las dos marcas</b>: entres desde BDI o desde Zattia, editás la misma lista de
        usuarios. Lo que se define por marca son los permisos de cada uno (las columnas BDI y Zattia).
      </Notice>

      {!users ? (
        <Card padding={4} style={{ color: error ? color.danger : color.mut2 }}>
          {error ? `No se pudo leer la configuración: ${error}` : 'Cargando configuración…'}
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {users.map((u, i) => (
            <UsuarioCard
              key={i}
              u={u}
              i={i}
              primero={i === 0}
              abierto={abierto === i}
              onToggleOpen={() => setAbierto((a) => (a === i ? null : i))}
              onCampo={onCampo}
              onAdmin={onAdmin}
              onCuenta={onCuenta}
              onPerm={onPerm}
              onPermArea={onPermArea}
              onCopiar={onCopiar}
              onFuncion={onFuncion}
              onEliminar={() => eliminar(i)}
            />
          ))}
        </Card>
      )}
    </>
  )
}

function UsuarioCard({
  u,
  i,
  primero,
  abierto,
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
  i: number
  primero: boolean
  abierto: boolean
  onToggleOpen: () => void
  onCampo: (i: number, campo: 'name' | 'pass' | 'email', val: string) => void
  onAdmin: (i: number, val: boolean) => void
  onCuenta: (i: number, val: string) => void
  onPerm: (i: number, brand: Marca, key: string, val: boolean) => void
  onPermArea: (i: number, brand: Marca, keys: string[], val: boolean) => void
  onCopiar: (i: number, origen: Marca, destino: Marca) => void
  onFuncion: (i: number, f: Funcion, val: boolean) => void
  onEliminar: () => void
}) {
  // Las áreas arrancan plegadas: abiertas de una son ~64 filas por persona (37 secciones +
  // 18 sub-permisos + los 9 encabezados), que en el celular son casi 3.000px de scroll.
  const [areasAbiertas, setAreasAbiertas] = useState<ReadonlySet<string>>(() => new Set())
  return (
    <div style={{ borderTop: primero ? undefined : `1px solid ${color.line}`, background: abierto ? color.bg : undefined }}>
      <div
        onClick={onToggleOpen}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '11px 14px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <b>{u.name || '(nuevo usuario)'}</b>
          {u.admin && <Badge tone="brand">admin</Badge>}
          {/* Cómo entra: es lo que se mira al repartir los mails de Google. Quien no tiene
              ninguna de las dos cosas no entra por ningún lado, y `validar` lo frena. */}
          <span style={{ fontSize: font.xs, color: color.mut2 }}>
            {u.email ? `Google · ${u.email}` : u.tienePass || u.pass ? 'con contraseña' : 'sin acceso'}
          </span>
          <span style={{ fontSize: font.xs, color: color.mut2 }}>{u.cuenta ? 'solo ' + u.cuenta : 'BDI + Zattia'}</span>
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
              <Input value={u.name} onChange={(e) => onCampo(i, 'name', e.target.value)} />
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
                onChange={(e) => onCampo(i, 'pass', e.target.value)}
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
                onChange={(e) => onCampo(i, 'email', e.target.value.trim().toLowerCase())}
              />
            </Field>
            <Field label="Marca">
              <Select value={u.cuenta || ''} onChange={(e) => onCuenta(i, e.target.value)}>
                <option value="">BDI + Zattia</option>
                <option value="bdi">Solo BDI</option>
                <option value="zattia">Solo Zattia</option>
              </Select>
            </Field>
            <label style={{ fontSize: font.base, display: 'flex', alignItems: 'center', gap: 6, height: 'var(--mo-ctl-h)' }}>
              <input
                type="checkbox"
                checked={u.admin}
                onChange={(e) => onAdmin(i, e.target.checked)}
                style={{ accentColor: 'var(--mo-brand-solid)' }}
              />
              Administrador (ve todo)
            </label>
          </div>

          {/* Funciones (rol de flujo de trabajo): definen qué parte de las Solicitudes ve cada uno. */}
          <div style={{ margin: '0 0 14px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', fontSize: font.sm, color: color.mut, marginBottom: 5 }}>
              Función
              <InfoPopover titulo="Función del usuario">
                Rol de flujo de trabajo (además de los permisos). Define qué parte de una Solicitud ve cada uno:
                Local ve lo de retirar en local, Depósito lo de preparar, Marketing la solicitud completa, Dirección
                todo (su Inicio no arranca con las fotos para armar). Un usuario puede tener varias.
              </InfoPopover>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {FUNCIONES.map((f) => (
                <label key={f.key} style={{ fontSize: font.base, display: 'inline-flex', alignItems: 'center', gap: 5 }} title={f.info}>
                  <input
                    type="checkbox"
                    checked={!!u.funcion?.includes(f.key)}
                    onChange={(e) => onFuncion(i, f.key, e.target.checked)}
                    style={{ accentColor: 'var(--mo-brand-solid)' }}
                  />{' '}
                  {f.label}
                </label>
              ))}
            </div>
          </div>

          {u.admin ? (
            <div style={{ fontSize: font.sm, color: color.mut, padding: '8px 0' }}>Es administrador: ve todas las secciones de las dos marcas y puede gestionar usuarios.</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                <span style={{ fontSize: font.sm, color: color.mut }}>Permisos por marca</span>
                <InfoPopover titulo="Permisos, funciones y excepciones">
                  Lo que trae puesto la <b>función</b> aparece tildado y en gris: no hace falta marcarlo, y una
                  sección nueva de esa área la hereda sola. Si destildás algo que viene por función, queda como
                  <b> excepción</b> (en rojo) para esa persona y esa marca. Los sub-permisos (aplicar un ajuste,
                  crear cupones) nunca vienen por función: se tildan siempre a mano.
                </InfoPopover>
                <Button size="sm" variant="outline" onClick={() => onCopiar(i, 'bdi', 'zattia')}>
                  Copiar BDI → Zattia
                </Button>
                <Button size="sm" variant="outline" onClick={() => onCopiar(i, 'zattia', 'bdi')}>
                  Copiar Zattia → BDI
                </Button>
              </div>
              {/* La matriz se queda en una <table> propia y NO va a `mo-table`: son 37
                  secciones más sus sub-permisos, y la fila de 38px del kit la volvería una
                  pantalla y media de scroll. Acá la densidad es la funcionalidad.
                  El wrapper con overflow es porque la Card padre recorta (mismo recurso que
                  usa Etiquetas para su tabla cruda). */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.base, background: color.surface, borderRadius: 'var(--mo-r-lg)' }}>
                  <thead>
                    <tr style={{ color: color.mut2, fontSize: font.xs }}>
                      <th style={{ textAlign: 'left', padding: '5px 8px' }}>Sección</th>
                      <th style={{ width: 56 }}>BDI</th>
                      <th style={{ width: 56 }}>Zattia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {AREAS.map((area) => (
                      <Area
                        key={area.id}
                        area={area}
                        u={u}
                        i={i}
                        abierta={areasAbiertas.has(area.id)}
                        onToggle={() => setAreasAbiertas((prev) => {
                          const s = new Set(prev)
                          if (!s.delete(area.id)) s.add(area.id)
                          return s
                        })}
                        onPerm={onPerm}
                        onPermArea={onPermArea}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
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
 * Un checkbox de tres estados. El indeterminado no se puede poner por atributo: es una
 * propiedad del nodo, así que va por ref.
 */
function CheckTri({
  checked,
  indeterminado,
  ...rest
}: { checked: boolean; indeterminado?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminado && !checked
  }, [indeterminado, checked])
  return <input ref={ref} type="checkbox" checked={checked} {...rest} />
}

/**
 * Un área del menú con sus secciones. El tilde del encabezado marca/desmarca el área
 * entera para esa marca — el alta de alguien pasa de 35 clics a uno por sector.
 *
 * El área **arranca plegada**: abiertas todas de una son ~64 filas por persona. Al plegarse,
 * el tilde del encabezado pasa a ser lo único que dice qué hay adentro, así que necesita el
 * tercer estado: sin el indeterminado, "ninguna sección" y "la mitad" se ven igual.
 */
function Area({
  area,
  u,
  i,
  abierta,
  onToggle,
  onPerm,
  onPermArea,
}: {
  area: (typeof AREAS)[number]
  u: UsuarioConfig
  i: number
  abierta: boolean
  onToggle: () => void
  onPerm: (i: number, brand: Marca, key: string, val: boolean) => void
  onPermArea: (i: number, brand: Marca, keys: string[], val: boolean) => void
}) {
  const celdaArea = (brand: Marca) => {
    const keys = area.secciones.filter((s) => s.brands.includes(brand)).map((s) => s.key)
    if (!keys.length) return <td key={brand} style={{ textAlign: 'center', color: color.line2 }}>—</td>
    const todas = keys.every((k) => tienePermiso(u, brand, k))
    const algunas = keys.some((k) => tienePermiso(u, brand, k))
    return (
      // El clic no burbujea: darle un sector entero de un tilde es el atajo que ya existía y
      // tiene que seguir funcionando sin abrir el área.
      <td key={brand} style={{ textAlign: 'center', height: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <CheckTri
          checked={todas}
          indeterminado={algunas}
          title={todas ? `Sacarle todo ${area.label}` : `Darle todo ${area.label}`}
          onChange={(e) => onPermArea(i, brand, keys, e.target.checked)}
          style={ESTILO_CHECK}
        />
      </td>
    )
  }
  const n = area.secciones.length
  return (
    <>
      <tr style={{ background: color.bg, borderTop: `1px solid ${color.line}` }}>
        <td
          onClick={onToggle}
          style={{ padding: '6px 8px', height: 'auto', fontSize: font.sm, fontWeight: weight.bold, color: color.ink2, cursor: 'pointer', userSelect: 'none' }}
        >
          <span aria-hidden style={{ display: 'inline-block', width: 14, color: color.mut2 }}>{abierta ? '▾' : '▸'}</span>
          {area.label}
          <span style={{ fontWeight: weight.medium, color: color.mut2, fontSize: font.xs, marginLeft: 6 }}>
            {n} {n === 1 ? 'sección' : 'secciones'}
          </span>
        </td>
        {celdaArea('bdi')}
        {celdaArea('zattia')}
      </tr>
      {abierta && area.secciones.map((sec) => (
        <FilaPermiso key={sec.key} u={u} i={i} label={sec.label} info={sec.info} claveKey={sec.key} brands={sec.brands} onPerm={onPerm}>
          {(sec.subs || []).map((sub) => (
            <FilaPermiso
              key={sec.key + '.' + sub.key}
              u={u}
              i={i}
              label={'↳ ' + sub.label}
              info={sub.info}
              claveKey={sec.key + '.' + sub.key}
              brands={sub.brands || sec.brands}
              sub
              onPerm={onPerm}
            />
          ))}
        </FilaPermiso>
      ))}
    </>
  )
}

function FilaPermiso({
  u,
  i,
  label,
  info,
  claveKey,
  brands,
  sub,
  onPerm,
  children,
}: {
  u: UsuarioConfig
  i: number
  label: string
  info?: string
  claveKey: string
  brands: Marca[]
  sub?: boolean
  onPerm: (i: number, brand: Marca, key: string, val: boolean) => void
  children?: React.ReactNode
}) {
  const celda = (brand: Marca) => {
    if (!brands.includes(brand)) return <td key={brand} style={{ textAlign: 'center', height: 'auto', color: color.line2 }}>—</td>
    const origen = origenPermiso(u, brand, claveKey)
    const f = origen === 'funcion' ? funcionQueDa(u, claveKey) : null
    const titulo =
      origen === 'funcion'
        ? `Lo trae la función ${FUNCIONES.find((x) => x.key === f)?.label ?? f}. Destildalo para hacerle una excepción.`
        : origen === 'excluido'
          ? `Su función se lo daría, pero se lo quitaron para ${brand === 'bdi' ? 'BDI' : 'Zattia'}.`
          : undefined
    return (
      <td key={brand} style={{ textAlign: 'center', height: 'auto' }}>
        <input
          type="checkbox"
          checked={tienePermiso(u, brand, claveKey)}
          disabled={u.admin}
          title={titulo}
          onChange={(e) => onPerm(i, brand, claveKey, e.target.checked)}
          style={
            origen === 'funcion'
              ? { ...ESTILO_CHECK, accentColor: color.mut2 }
              : origen === 'excluido'
                ? { ...ESTILO_CHECK, outline: `1.5px solid ${color.dangerBorder}`, borderRadius: 3 }
                : ESTILO_CHECK
          }
        />
      </td>
    )
  }
  return (
    <>
      <tr style={sub ? { color: color.mut } : { borderTop: `1px solid ${color.bg2}` }}>
        {/* `height: auto` inline porque el legacy le fija --mo-row-h a todo <td> de
            .shell-content, que en pantalla angosta son 44px: por 64 filas es media pantalla
            de más. El área táctil no se pierde — vive en el checkbox, no en la fila. */}
        <td style={{ padding: sub ? '3px 4px 3px 22px' : '5px 4px', height: 'auto', fontSize: sub ? 12 : 13 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            {label}
            {info && <InfoPopover titulo={label.replace(/^↳ /, '')}>{info}</InfoPopover>}
          </span>
        </td>
        {celda('bdi')}
        {celda('zattia')}
      </tr>
      {children}
    </>
  )
}

