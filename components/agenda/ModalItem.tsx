'use client'

/**
 * El alta de un pendiente rutinario.
 *
 * 🔑 **La regla de carga es que la rutina obvia no se carga.** Abrir la caja no va acá: entra sólo lo
 * que se olvida. Si la lista de "Hoy" tuviera quince renglones todos los días, en dos semanas nadie
 * la mira y el pendiente que sí importaba se pierde con el resto.
 *
 * Los días se arman con `EditorRegla`, el mismo control que la promo bancaria: "los martes hay que
 * reponer la vidriera" y "los martes de Banco Nación" son la misma pregunta.
 *
 * # Por qué el destino se dibuja acá y no se importa de Novedades
 *
 * La lógica de "¿a quién le llega?" **es una sola** y vive en `lib/novedades/destino.core.js`: la
 * usa el handler de novedades y el de la agenda, sin copiar una línea. Lo que se repite son estos
 * tres controles, porque extraerlos obligaría a tocar el editor de Novedades, que es código
 * compartido con Darío. Si mañana se toca ese archivo por otra razón, salen de ahí.
 */

import { useMemo, useState } from 'react'
import { Button, Field, Input, Modal, Notice, Select, color, font, space, weight } from '@/components/ui'
import { type Destino, type ItemAgenda } from '@/lib/agenda'
import { nuevoIdItem } from '@/lib/agenda/cliente'
import { todasLasKeys, tituloLimpio } from '@/lib/nav'
import { FUNCIONES } from '@/lib/permisos'
import { useSistema } from '@/store/useSistema'
import type { Marca } from '@/lib/nav.datos'
import { EditorRegla, Tilde, toggleEnLista } from './EditorRegla'

const MARCAS: { key: Marca; label: string }[] = [
  { key: 'bdi', label: 'BDI' },
  { key: 'zattia', label: 'Zattia' },
]

/**
 * Un pendiente nuevo arranca **semanal sin días tildados**, que es el caso que se carga siempre y el
 * único esqueleto que el validador rechaza hasta que la persona elija algo. Un default que ya pasa
 * la validación —"todos los días"— se guarda sin que nadie mire ese campo.
 *
 * `clase` nace en `pendiente` y no se pregunta: el aviso fechado llega en T3, y ofrecer hoy una
 * opción que no se dibuja en ningún lado sería cargar cosas que no aparecen.
 */
export function itemVacio(): ItemAgenda {
  return {
    id: nuevoIdItem(),
    clase: 'pendiente',
    titulo: '',
    cuerpo: null,
    regla: { tipo: 'semanal', dias: [] },
    destino: { tipo: 'todos' },
    marcas: [],
    manualId: null,
    activo: true,
    autor: null,
    creado: null,
    paraMi: true,
  }
}

export function ModalItem({
  inicial,
  onCerrar,
  onGuardar,
}: {
  inicial: ItemAgenda
  onCerrar: () => void
  onGuardar: (i: ItemAgenda) => Promise<void>
}) {
  const [it, setIt] = useState<ItemAgenda>(inicial)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const manuales = useSistema((s) => s.manuales)

  const set = <K extends keyof ItemAgenda>(k: K, v: ItemAgenda[K]) => setIt((x) => ({ ...x, [k]: v }))

  // Por nombre y no por el orden del menú: acá se busca una pantalla, no se navega por sectores.
  const secciones = useMemo(
    () => todasLasKeys().map((k) => ({ k, label: tituloLimpio(k) })).sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [],
  )
  const publicados = useMemo(() => manuales.filter((m) => m.publicado), [manuales])

  const toggleRol = (rol: string) => {
    const actuales = it.destino.tipo === 'roles' ? it.destino.roles : []
    const nuevos = toggleEnLista(actuales, rol)
    // Sin ningún rol tildado no le llegaría a nadie, que no es lo que nadie quiso decir: cae a todos,
    // que es el default visible. Es la misma regla que aplica el servidor en `normalizarDestino`.
    set('destino', nuevos.length ? { tipo: 'roles', roles: nuevos } : { tipo: 'todos' })
  }

  const guardar = async () => {
    setError(null)
    setGuardando(true)
    try {
      await onGuardar({
        ...it,
        titulo: it.titulo.trim(),
        cuerpo: it.cuerpo && it.cuerpo.trim() ? it.cuerpo : null,
      })
      onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  const d: Destino = it.destino

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={inicial.creado ? 'Editar el pendiente' : 'Nuevo pendiente rutinario'}
      ancho="ancho"
      cerrarConFondo={false}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: space[4] }}>
        {error && <Notice tone="danger">{error}</Notice>}

        <Notice tone="neutral">
          Entra <b>lo que se olvida</b>. Lo que se hace siempre igual —abrir la caja, prender las
          luces— no se carga acá: una lista larga todos los días es una lista que se deja de mirar.
        </Notice>

        <Field label="Qué hay que hacer" required hint="Corto y en infinitivo: «Reponer la vidriera».">
          <Input
            value={it.titulo}
            onChange={(e) => set('titulo', e.target.value)}
            placeholder="Reponer la vidriera"
          />
        </Field>

        <Field label="Detalle" hint="Opcional. El paso a paso largo va en un manual, no acá.">
          <textarea
            value={it.cuerpo ?? ''}
            onChange={(e) => set('cuerpo', e.target.value)}
            rows={3}
            style={{
              width: '100%', padding: space[2], borderRadius: 8,
              border: `1px solid ${color.line2}`, fontSize: font.base, fontFamily: 'inherit',
              background: 'transparent', color: color.ink, resize: 'vertical',
            }}
          />
        </Field>

        <EditorRegla regla={it.regla} onChange={(r) => set('regla', r)} titulo="Qué días toca" />

        <div>
          <div style={{ fontSize: font.xs, color: color.mut, fontWeight: weight.medium, marginBottom: 4 }}>
            A quién le toca
          </div>
          <Field hint="Si no lo acotás, le aparece a todo el equipo. Quien carga los ve todos igual, pero sólo tilda los suyos.">
            <Select
              value={d.tipo}
              onChange={(e) => {
                const t = e.target.value
                set('destino', t === 'seccion'
                  ? { tipo: 'seccion', key: 'atencion' }
                  : t === 'roles' ? { tipo: 'roles', roles: ['local'] } : { tipo: 'todos' })
              }}
            >
              <option value="todos">A todo el equipo</option>
              <option value="seccion">A quien usa una pantalla</option>
              <option value="roles">A ciertos roles</option>
            </Select>
          </Field>

          {d.tipo === 'seccion' && (
            <Field
              label="¿De qué pantalla es?"
              hint="Le llega a quien tenga permiso de verla. Si mañana alguien lo gana o lo pierde, la lista se ajusta sola."
            >
              <Select value={d.key} onChange={(e) => set('destino', { tipo: 'seccion', key: e.target.value })}>
                {secciones.map((s) => <option key={s.k} value={s.k}>{s.label}</option>)}
              </Select>
            </Field>
          )}

          {d.tipo === 'roles' && (
            <Field label="¿Qué roles?" hint="Ojo: a quien no tenga ningún rol asignado no le va a llegar.">
              <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
                {FUNCIONES.map((f) => (
                  <Tilde
                    key={f.key}
                    puesto={d.roles.includes(f.key)}
                    label={f.label}
                    onToggle={() => toggleRol(f.key)}
                  />
                ))}
              </div>
            </Field>
          )}
        </div>

        <div style={{ display: 'flex', gap: space[6], flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: font.xs, color: color.mut, fontWeight: weight.medium, marginBottom: 4 }}>
              Marcas <span style={{ fontWeight: weight.normal }}>(ninguna tildada = las dos)</span>
            </div>
            <div style={{ display: 'flex', gap: space[2] }}>
              {MARCAS.map((m) => (
                <Tilde
                  key={m.key}
                  puesto={it.marcas.includes(m.key)}
                  label={m.label}
                  onToggle={() => set('marcas', toggleEnLista(it.marcas, m.key) as Marca[])}
                />
              ))}
            </div>
          </div>

          {/*
            El manual es el enganche con el flujo que ya está escrito: en vez de repetir acá cómo se
            hace, el renglón de Hoy abre el manual. Si no hay ninguno publicado, no se ofrece.
          */}
          {publicados.length > 0 && (
            <Field label="Cómo se hace" hint="El manual que se abre desde el renglón. Opcional." width={280}>
              <Select
                value={it.manualId ?? ''}
                onChange={(e) => set('manualId', e.target.value || null)}
              >
                <option value="">— sin manual —</option>
                {publicados.map((m) => <option key={m.id} value={m.id}>{m.titulo}</option>)}
              </Select>
            </Field>
          )}
        </div>

        <Tilde
          puesto={it.activo}
          label={it.activo ? 'Prendido' : 'Apagado'}
          onToggle={() => set('activo', !it.activo)}
        />
      </div>
    </Modal>
  )
}
