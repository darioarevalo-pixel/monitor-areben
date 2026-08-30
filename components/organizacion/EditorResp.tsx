'use client'

/**
 * Alta y edición de una responsabilidad.
 *
 * # Dejar la persona en blanco es un gesto válido, y el formulario lo dice
 *
 * 🔑 El desplegable de persona arranca en **«Sin dueño (todavía)»** y no en un nombre. Es la única
 * forma de que un gris se pueda anotar en el momento en que aparece — que es cuando alguien se da
 * cuenta de que algo no es de nadie. Si el formulario exigiera una persona, el que lo abre elegiría
 * a la que tiene más cerca, y eso es peor que dejarlo vacío: le pone dueña de mentira a un agujero.
 *
 * ⚠️ Pero sólo en «Responde por». Las otras cuatro clases son afirmaciones SOBRE una persona, así
 * que sin persona no dicen nada — el freno vive en `filaValida()` del núcleo, se corre acá para
 * poder explicarlo antes de mandar, y **se vuelve a correr en el handler**, que es el que manda.
 */

import { useState } from 'react'
import { guardarResp } from '@/lib/organizacion/cliente'
import {
  CLASES, CLASE_DEL_GRIS, filaValida, labelDeClase, type ClaseResp, type Responsabilidad,
} from '@/lib/organizacion/tipos'
import { FUNCIONES, type Funcion } from '@/lib/permisos'
import type { Companero } from '@/lib/usuarios/equipo'
import { Button, Field, Input, Modal, Notice, Select, color, font, space, useToast } from '@/components/ui'

const SECTORES = FUNCIONES.map((f) => f.key)

export function EditorResp({ resp, equipo, manuales, onCerrar, onGuardado }: {
  resp: Responsabilidad
  equipo: Companero[] | null
  manuales: { id: string; titulo: string; publicado: boolean }[]
  onCerrar: () => void
  onGuardado: () => void
}) {
  const toast = useToast()
  const [f, setF] = useState<Responsabilidad>(resp)
  const [guardando, setGuardando] = useState(false)

  const motivo = filaValida(f, SECTORES)
  const ayuda = CLASES.find((c) => c.key === f.clase)?.ayuda

  async function guardar() {
    if (motivo) return
    setGuardando(true)
    try {
      await guardarResp(f)
      toast.ok('Guardada.')
      onGuardado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.')
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={resp.titulo ? 'Editar la responsabilidad' : 'Nueva responsabilidad'}
      cerrarConFondo={false}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={!!motivo || guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Field label="Qué es" required>
          <Input
            value={f.titulo}
            onChange={(e) => setF({ ...f, titulo: e.target.value })}
            placeholder="Que las cuentas hablen todos los días"
            autoFocus
          />
        </Field>

        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          <Field label="Sector" required width={200}>
            <Select value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value as Funcion })}>
              {FUNCIONES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          </Field>

          <Field label="Clase" required width={200} hint={ayuda}>
            <Select value={f.clase} onChange={(e) => setF({ ...f, clase: e.target.value as ClaseResp })}>
              {CLASES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </Select>
          </Field>

          <Field
            label="De quién es"
            width={240}
            hint={equipo === null ? 'No se pudo leer el padrón; volvé a entrar.' : undefined}
          >
            <Select
              value={f.persona || ''}
              onChange={(e) => setF({ ...f, persona: e.target.value || null })}
              disabled={equipo === null}
            >
              {/* Primero y por defecto, a propósito: ver el encabezado. */}
              <option value="">Sin dueño (todavía)</option>
              {(equipo || []).map((c) => <option key={c.name} value={c.name}>{c.apodo}</option>)}
            </Select>
          </Field>
        </div>

        <Field label="Detalle" hint="Markdown del mismo subconjunto que los manuales. Un ítem de lista es UN renglón largo, y la cursiva es _así_.">
          <textarea
            className="mo-input"
            rows={4}
            value={f.detalle || ''}
            onChange={(e) => setF({ ...f, detalle: e.target.value })}
            placeholder="Lo que hace falta aclarar para que no se discuta después."
          />
        </Field>

        <Field label="El manual que explica cómo se hace" hint="Sólo se ofrecen los publicados: un link a un manual sin publicar abre vacío.">
          <Select value={f.manual_id || ''} onChange={(e) => setF({ ...f, manual_id: e.target.value || null })}>
            <option value="">Ninguno</option>
            {manuales.filter((m) => m.publicado).map((m) => <option key={m.id} value={m.id}>{m.titulo}</option>)}
          </Select>
        </Field>

        <label style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.sm, color: color.ink2 }}>
          <input type="checkbox" checked={f.activo !== false} onChange={(e) => setF({ ...f, activo: e.target.checked })} />
          Activa
        </label>

        {motivo && f.titulo.trim() !== '' && <Notice tone="warning">{motivo}</Notice>}
        {!motivo && !f.persona && f.clase === CLASE_DEL_GRIS && (
          <Notice tone="brand">
            Va a quedar en «Sin dueño», y se va a ver en esa pestaña hasta que alguien la tome. Es la idea.
          </Notice>
        )}
        {!f.persona && f.clase !== CLASE_DEL_GRIS && (
          <Notice tone="warning">
            «{labelDeClase(f.clase)}» habla de una persona. Sin dueña, lo que se puede dejar anotado es «{labelDeClase(CLASE_DEL_GRIS)}».
          </Notice>
        )}
      </div>
    </Modal>
  )
}
