'use client'

/**
 * Escribir o corregir una novedad, con la vista previa al lado.
 *
 * La previa no es un lujo: el markdown es un subconjunto chico y propio, y la única forma de saber
 * si algo entró es verlo. Un `**` sin cerrar se ve como dos asteriscos, y eso hay que poder notarlo
 * antes de publicar, no después.
 *
 * **Guardar nunca publica.** El estado no viaja en el cuerpo —el handler lo ignora— así que desde
 * acá una novedad nueva nace siempre en borrador. Publicar es un botón aparte, en la tarjeta.
 */

import { useMemo, useState } from 'react'
import { guardarNovedad } from '@/lib/novedades/cliente'
import type { Destino, Novedad } from '@/lib/novedades/tipos'
import { FUNCIONES } from '@/lib/permisos'
import { todasLasKeys, tituloLimpio } from '@/lib/nav'
import { Button, Field, Input, Markdown, Modal, Select, color, font, radius, space, useToast } from '@/components/ui'

export function EditorNovedad({
  novedad,
  onCerrar,
  onGuardado,
}: {
  novedad: Novedad
  onCerrar: () => void
  onGuardado: () => void
}) {
  const toast = useToast()
  const [titulo, setTitulo] = useState(novedad.titulo)
  const [cuerpo, setCuerpo] = useState(novedad.cuerpo)
  const [importante, setImportante] = useState(novedad.importante)
  const [subirVersion, setSubirVersion] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [destino, setDestino] = useState<Destino>(novedad.destino ?? { tipo: 'todos' })

  const yaExiste = !!novedad.created_at

  // Ordenadas por nombre y no por el orden del menú: acá se busca una pantalla por su nombre, no
  // se navega por sectores.
  const secciones = useMemo(
    () => todasLasKeys().map((k) => ({ k, label: tituloLimpio(k) })).sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [],
  )

  const toggleRol = (rol: string) => {
    const actuales = destino.tipo === 'roles' ? destino.roles : []
    const nuevos = actuales.includes(rol) ? actuales.filter((r) => r !== rol) : [...actuales, rol]
    // Destildar el último vuelve a "todos": una novedad para cero roles no le llega a nadie, y eso
    // no es lo que nadie quiso escribir.
    setDestino(nuevos.length ? { tipo: 'roles', roles: nuevos } : { tipo: 'todos' })
  }

  const guardar = async () => {
    if (!titulo.trim()) return void toast.error('Poné un título: es lo que se ve en la lista y en el cartel.')
    setGuardando(true)
    try {
      await guardarNovedad({ ...novedad, titulo: titulo.trim(), cuerpo, importante, destino }, subirVersion)
      toast.ok(yaExiste ? 'Guardada.' : 'Guardada como borrador. Publicala cuando quieras.')
      onGuardado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      ancho="ancho"
      onCerrar={onCerrar}
      titulo={yaExiste ? 'Editar la novedad' : 'Escribir una novedad'}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={() => void guardar()} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <Field label="Título" hint="Lo que se lee en la lista. Que se entienda solo, sin abrir.">
        <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus style={{ width: '100%' }} />
      </Field>

      <Field
        label="El texto"
        hint="Entra ## y ### para títulos, - para listas, **negrita**, `código` y [texto](link)."
      >
        <textarea
          className="mo-input mo-input--multi"
          rows={12}
          value={cuerpo}
          onChange={(e) => setCuerpo(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'ui-monospace, monospace', fontSize: font.sm }}
        />
      </Field>

      <div style={{ fontSize: font.xs, color: color.mut2, margin: `${space[1]}px 0 ${space[1]}px` }}>Así se va a ver:</div>
      <div style={{ background: color.bg2, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: space[4], minHeight: 60 }}>
        {cuerpo.trim() ? <Markdown texto={cuerpo} /> : <span style={{ fontSize: font.sm, color: color.mut2 }}>Escribí algo arriba.</span>}
      </div>

      <div style={{ marginTop: space[4] }}>
        <Field
          label="¿A quién le llega?"
          hint="Si no la acotás, le llega a todo el equipo. Acotarla no la esconde: quien puede publicar las ve todas igual, pero no le cuentan como propias."
        >
          <Select
            value={destino.tipo}
            onChange={(e) => {
              const t = e.target.value
              setDestino(t === 'seccion' ? { tipo: 'seccion', key: 'atencion' } : t === 'roles' ? { tipo: 'roles', roles: ['local'] } : { tipo: 'todos' })
            }}
          >
            <option value="todos">A todo el equipo</option>
            <option value="seccion">A quien usa una pantalla</option>
            <option value="roles">A ciertos roles</option>
          </Select>
        </Field>

        {destino.tipo === 'seccion' && (
          <Field
            label="¿De qué pantalla habla?"
            hint="Le llega a quien tenga permiso de verla, en cualquiera de las dos marcas. Si mañana alguien gana o pierde ese permiso, la lista se ajusta sola."
          >
            <Select value={destino.key} onChange={(e) => setDestino({ tipo: 'seccion', key: e.target.value })}>
              {secciones.map((s) => (
                <option key={s.k} value={s.k}>{s.label}</option>
              ))}
            </Select>
          </Field>
        )}

        {destino.tipo === 'roles' && (
          <Field label="¿Qué roles?" hint="Ojo: a quien no tenga ningún rol asignado no le va a llegar.">
            <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
              {FUNCIONES.map((f) => (
                <label key={f.key} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: font.sm, color: color.ink2 }}>
                  <input
                    type="checkbox"
                    checked={destino.roles.includes(f.key)}
                    onChange={() => toggleRol(f.key)}
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </Field>
        )}
      </div>

      <label style={{ display: 'flex', gap: space[2], alignItems: 'flex-start', marginTop: space[4], fontSize: font.sm, color: color.ink2 }}>
        <input type="checkbox" checked={importante} onChange={(e) => setImportante(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          <strong>Importante</strong> — le va a aparecer a cada uno como un cartel al entrar, que hay
          que leer y cerrar. Usalo poco: si todo es importante, nada lo es.
        </span>
      </label>

      {yaExiste && (
        <label style={{ display: 'flex', gap: space[2], alignItems: 'flex-start', marginTop: space[2], fontSize: font.sm, color: color.ink2 }}>
          <input type="checkbox" checked={subirVersion} onChange={(e) => setSubirVersion(e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            <strong>Que la vuelvan a leer</strong> — para cuando la corrección cambia lo que hay que
            hacer. Los que ya la habían leído la ven de nuevo, y queda registrado que la leyeron las
            dos veces.
          </span>
        </label>
      )}
    </Modal>
  )
}
