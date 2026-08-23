'use client'

/**
 * Escribir o corregir un manual, con la vista previa debajo.
 *
 * **La sección se elige de una lista, no se escribe.** Es la única validación real de que la key
 * exista: el handler es JS plano y no puede importar `lib/nav.ts`, así que del lado del servidor
 * sólo se corta lo absurdo. Acá se ofrecen las keys de verdad, y `tests/manuales.test.ts` amarra
 * que lo cargado sea una de ellas.
 */

import { useMemo, useRef, useState } from 'react'
import { guardarManual } from '@/lib/manuales/cliente'
import type { Manual } from '@/lib/manuales/tipos'
import { todasLasKeys, tituloLimpio } from '@/lib/nav'
import { BarraFormato, Button, Field, Input, Markdown, Modal, Select, color, font, radius, space, useFormato, useToast } from '@/components/ui'

export function EditorManual({
  manual,
  onCerrar,
  onGuardado,
}: {
  manual: Manual
  onCerrar: () => void
  onGuardado: () => void | Promise<void>
}) {
  const toast = useToast()
  const [titulo, setTitulo] = useState(manual.titulo)
  const [cuerpo, setCuerpo] = useState(manual.cuerpo)
  const [seccion, setSeccion] = useState<string>(manual.seccion || '')
  const [publicado, setPublicado] = useState(manual.publicado)
  const [guardando, setGuardando] = useState(false)
  const caja = useRef<HTMLTextAreaElement>(null)
  const { marcar, atajos } = useFormato(caja, cuerpo, setCuerpo)

  const secciones = useMemo(
    () => todasLasKeys().map((k) => ({ k, label: tituloLimpio(k) })).sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [],
  )

  const guardar = async () => {
    if (!titulo.trim()) return void toast.error('Poné un título: es lo que se busca después.')
    setGuardando(true)
    try {
      await guardarManual({ ...manual, titulo: titulo.trim(), cuerpo, seccion: seccion || null, publicado })
      toast.ok(publicado ? 'Guardado y publicado.' : 'Guardado. Nadie lo ve hasta que lo publiques.')
      await onGuardado()
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
      titulo={manual.created_at ? 'Editar el manual' : 'Escribir un manual'}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={() => void guardar()} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
        </>
      }
    >
      <Field label="Título" hint="Cómo lo buscarías vos: «Cómo se carga una falla», «Cierre de caja».">
        <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus style={{ width: '100%' }} />
      </Field>

      <Field
        label="¿De qué pantalla habla?"
        hint="Si elegís una, esa pantalla muestra el botón «Cómo se usa» con este manual. Cada pantalla puede tener uno solo. Si es un procedimiento que no es de ninguna, dejalo en «ninguna»."
      >
        <Select value={seccion} onChange={(e) => setSeccion(e.target.value)}>
          <option value="">Ninguna — es un procedimiento suelto</option>
          {secciones.map((s) => (
            <option key={s.k} value={s.k}>{s.label}</option>
          ))}
        </Select>
      </Field>

      <Field
        label="El manual"
        hint="Marcá lo que quieras y tocá un botón (⌘B negrita, ⌘I cursiva, ⌘K link). Los recuadros son tres y se escriben > [!REGLA] · > [!OJO] · > [!NUNCA]. Para colgar un renglón del de arriba, sangralo con 4 espacios."
      >
        <BarraFormato marcar={marcar} />
        <textarea
          ref={caja}
          className="mo-input mo-input--multi"
          rows={16}
          value={cuerpo}
          onChange={(e) => setCuerpo(e.target.value)}
          onKeyDown={atajos}
          style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'ui-monospace, monospace', fontSize: font.sm }}
        />
      </Field>

      <div style={{ fontSize: font.xs, color: color.mut2, margin: `${space[1]}px 0` }}>Así se va a ver:</div>
      <div style={{ background: color.bg2, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: space[4], minHeight: 60 }}>
        {cuerpo.trim() ? <Markdown texto={cuerpo} indice="cerrado" /> : <span style={{ fontSize: font.sm, color: color.mut2 }}>Escribí algo arriba.</span>}
      </div>

      <label style={{ display: 'flex', gap: space[2], alignItems: 'flex-start', marginTop: space[4], fontSize: font.sm, color: color.ink2 }}>
        <input type="checkbox" checked={publicado} onChange={(e) => setPublicado(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          <strong>Publicado</strong> — hasta que lo tildes, sólo lo ves vos. Un manual a medio
          escribir no ayuda a nadie, así que el botón «Cómo se usa» no aparece si no está publicado.
        </span>
      </label>
    </Modal>
  )
}
