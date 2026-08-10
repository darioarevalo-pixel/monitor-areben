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

import { useState } from 'react'
import { guardarNovedad } from '@/lib/novedades/cliente'
import type { Novedad } from '@/lib/novedades/tipos'
import { Button, Field, Input, Markdown, Modal, color, font, radius, space, useToast } from '@/components/ui'

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

  const yaExiste = !!novedad.created_at

  const guardar = async () => {
    if (!titulo.trim()) return void toast.error('Poné un título: es lo que se ve en la lista y en el cartel.')
    setGuardando(true)
    try {
      await guardarNovedad({ ...novedad, titulo: titulo.trim(), cuerpo, importante }, subirVersion)
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
