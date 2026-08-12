'use client'

/**
 * Escribir o corregir una novedad, con la barra de formato arriba y la vista previa abajo.
 *
 * La previa no es un lujo: el markdown es un subconjunto chico y propio, y la única forma de saber
 * si algo entró es verlo. Un `**` sin cerrar se ve como dos asteriscos, y eso hay que poder notarlo
 * antes de publicar, no después.
 *
 * 🔑 **La barra escribe los caracteres, no reemplaza al markdown.** Lo que se guarda sigue siendo
 * texto —el mismo que acepta `scripts/novedad.mjs`— y el textarea sigue a la vista: se puede tipear
 * a mano, y lo que pone un botón se puede borrar con la tecla de borrar. Un editor que esconde el
 * texto (contentEditable) devuelve HTML, y todo el camino de las novedades está hecho para no tener
 * HTML en ningún tramo. Qué le hace cada botón al texto vive en `lib/markdown/barra.ts`, que es
 * donde se puede probar sin DOM.
 *
 * **Guardar nunca publica.** El estado no viaja en el cuerpo —el handler lo ignora— así que desde
 * acá una novedad nueva nace siempre en borrador. Publicar es un botón aparte, en la tarjeta.
 */

import { useMemo, useRef, useState } from 'react'
import { guardarNovedad } from '@/lib/novedades/cliente'
import { aplicar, AYUDA, type Marca } from '@/lib/markdown/barra'
import type { Destino, Novedad } from '@/lib/novedades/tipos'
import { FUNCIONES } from '@/lib/permisos'
import { todasLasKeys, tituloLimpio } from '@/lib/nav'
import { Button, Field, Input, Markdown, Modal, Select, color, font, radius, space, useToast } from '@/components/ui'

/**
 * La barra, en el orden en que se usa: primero lo de adentro de una frase, después lo que arma la
 * estructura. Cada botón se muestra **con la pinta de lo que hace** (la negrita en negrita), que es
 * más rápido de leer que su nombre.
 */
const BOTONES: { m: Marca; label: string; estilo?: React.CSSProperties }[] = [
  { m: 'negrita', label: 'B', estilo: { fontWeight: 800 } },
  { m: 'italica', label: 'I', estilo: { fontStyle: 'italic' } },
  { m: 'codigo', label: '‹›', estilo: { fontFamily: 'ui-monospace, monospace' } },
  { m: 'link', label: 'Link' },
  { m: 'titulo', label: 'Título' },
  { m: 'subtitulo', label: 'Subtítulo' },
  { m: 'lista', label: '• Lista' },
  { m: 'numerada', label: '1. Lista' },
]

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
  const caja = useRef<HTMLTextAreaElement>(null)
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

  /**
   * Un botón de la barra. La selección se lee y se repone sobre el textarea de verdad: sin eso, cada
   * toque manda el cursor al final y hay que volver a marcar la palabra siguiente a mano.
   */
  const marcar = (m: Marca) => {
    const el = caja.current
    if (!el) return
    const r = aplicar(el.value, el.selectionStart, el.selectionEnd, m)
    setCuerpo(r.texto)
    // Después del `setCuerpo` el valor del textarea todavía es el viejo: reponer la selección va en
    // el frame siguiente, cuando React ya lo pintó.
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(r.ini, r.fin)
    })
  }

  const atajos = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.metaKey || e.ctrlKey)) return
    const k = e.key.toLowerCase()
    const m: Marca | null = k === 'b' ? 'negrita' : k === 'i' ? 'italica' : k === 'k' ? 'link' : null
    if (!m) return
    e.preventDefault()
    marcar(m)
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
        hint="Marcá lo que quieras y tocá un botón. También se puede escribir a mano: ⌘B negrita, ⌘I cursiva, ⌘K link."
      >
        <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap', marginBottom: space[2] }}>
          {BOTONES.map((b) => (
            <Button
              key={b.m}
              type="button"
              size="sm"
              variant="ghost"
              title={AYUDA[b.m]}
              onClick={() => marcar(b.m)}
              style={b.estilo}
            >
              {b.label}
            </Button>
          ))}
        </div>
        <textarea
          ref={caja}
          className="mo-input mo-input--multi"
          rows={12}
          value={cuerpo}
          onChange={(e) => setCuerpo(e.target.value)}
          onKeyDown={atajos}
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
