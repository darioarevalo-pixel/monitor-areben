'use client'

import { useEffect, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { esAdmin, type Funcion } from '@/lib/permisos'
import { credencialConPrompt, guardarAdminPass, guardarConfigAdmin, traerConfigAdmin } from '@/lib/sesion'
import type { Marca } from '@/lib/nav'
import { copiarPermisos, normalizar, toggleFuncion, togglePerm, validar } from '@/lib/usuarios/core'
import type { UsuarioConfig } from '@/lib/usuarios/tipos'
import { HeaderAcciones } from '@/components/layout/acciones'
import { Button, Card, color, font, Notice, useConfirmar } from '@/components/ui'
import { AltaGuiada } from './AltaGuiada'
import { UsuarioCard } from './UsuarioCard'

type Estado = { msg: string; color: string } | null

/**
 * Gestión de usuarios y permisos (solo admin). Pide la config COMPLETA (admin-gated), la
 * edita en una copia local, y guarda todo junto. La lógica pura (toggle padre/sub, resumen,
 * validación) vive en `lib/usuarios/core`; las pantallas, en los archivos de al lado.
 *
 * **Un solo camino de escritura.** El alta guiada arma un usuario y lo agrega a esta lista;
 * la matriz y las acciones editan la copia local. Nada de eso toca el KV: lo único que
 * escribe es `guardar()`. Un segundo camino sería un segundo lugar donde equivocarse.
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
  const [alta, setAlta] = useState(false)
  /** El índice que el alta pidió abrir directo en el ajuste fino, y ya. */
  const [ajustar, setAjustar] = useState<number | null>(null)

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

  const crear = (nuevo: UsuarioConfig, conAjuste: boolean) => {
    setUsers((prev) => {
      const next = [...(prev || []), normalizar(nuevo)]
      setAbierto(next.length - 1)
      setAjustar(conAjuste ? next.length - 1 : null)
      return next
    })
    setAlta(false)
    setStatus({ msg: 'Creado acá nomás. Falta «Guardar cambios» para que exista de verdad.', color: color.warningInk })
  }

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
          el paso previo y queda secundario. */}
      <HeaderAcciones>
        {status && <span style={{ fontSize: font.sm, color: status.color }}>{status.msg}</span>}
        <Button variant="ghost" onClick={() => setTick((t) => t + 1)} title="Volver a leer la configuración">
          Recargar
        </Button>
        <Button variant="outline" onClick={() => setAlta(true)} disabled={!users}>
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

      {alta && users && <AltaGuiada usuarios={users} onCerrar={() => setAlta(false)} onCrear={crear} />}

      {!users ? (
        <Card padding={4} style={{ color: error ? color.danger : color.mut2 }}>
          {error ? `No se pudo leer la configuración: ${error}` : 'Cargando configuración…'}
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {users.map((u, i) => (
            <UsuarioCard
              // El índice como key es lo que había, y acá es correcto: la lista sólo crece al
              // final o pierde una fila, y el estado local de la ficha (qué está plegado) no
              // sobrevive a un reordenamiento que no existe.
              key={i}
              u={u}
              primero={i === 0}
              abierto={abierto === i}
              ajusteAbierto={ajustar === i}
              onToggleOpen={() => setAbierto((a) => (a === i ? null : i))}
              onCampo={(campo, val) => onCampo(i, campo, val)}
              onAdmin={(val) => onAdmin(i, val)}
              onCuenta={(val) => onCuenta(i, val)}
              onPerm={(brand, clave, val) => onPerm(i, brand, clave, val)}
              onPermArea={(brand, claves, val) => onPermArea(i, brand, claves, val)}
              onCopiar={(origen, destino) => onCopiar(i, origen, destino)}
              onFuncion={(f, val) => onFuncion(i, f, val)}
              onEliminar={() => eliminar(i)}
            />
          ))}
        </Card>
      )}
    </>
  )
}
