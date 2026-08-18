'use client'

import { useState } from 'react'
import type { Marca } from '@/lib/nav.datos'
import { borrarMeta, guardarMeta, type MetaGuardada } from '@/lib/norte/persistencia'
import { claveDeMeta } from '@/lib/norte/core'
import { MEDIDORES, medidorDe } from '@/lib/norte/medidores'
import type { Canal, Medidor } from '@/lib/norte/tipos'
import { CANALES } from '@/lib/liquidacion/resultado'
import { Button, Card, Field, Input, Notice, Select, color, font, space } from '@/components/ui'

/** Los canales que tiene sentido ponerle a una meta. `tecnica` no es venta: no se propone. */
const CANALES_META: readonly Canal[] = CANALES.filter((c) => c !== 'tecnica')

/**
 * El formulario de una meta: **qué se quiere lograr, medido con qué**.
 *
 * 🔑 **La unidad no se escribe: la trae el medidor.** Antes `unidad` era texto libre y el avance no
 * se calculaba, así que nada impedía cargar «500 por mes» contra un medido que sale por día — un
 * avance plausible y falso, sin que fallara nada. Elegir de la lista es lo que hace que el objetivo
 * y el medido estén en la misma unidad por construcción.
 *
 * 🔑 **La clave se genera sola.** `key` es la PK y el guardado es un `upsert`: dos metas con la
 * misma clave se pisan sin decir nada. Al crear se deriva del nombre y se desambigua
 * (`claveDeMeta`); al editar no se toca, porque cambiarla crearía una segunda meta en vez de
 * renombrar la primera.
 */
export function EditorMeta({
  marca,
  meta,
  usadas,
  onListo,
  onCancelar,
}: {
  marca: Marca
  /** `null` = una meta nueva. */
  meta: MetaGuardada | null
  /** Las claves que ya existen, para no pisar ninguna. */
  usadas: readonly string[]
  onListo: () => void
  onCancelar: () => void
}) {
  const [label, setLabel] = useState(meta?.label || '')
  const [medidor, setMedidor] = useState<Medidor>(meta?.medidor || 'unidades-dia')
  const [canal, setCanal] = useState<string>(meta?.canal || '')
  const [objetivo, setObjetivo] = useState(meta ? String(meta.objetivo) : '')
  const [fechaObjetivo, setFechaObjetivo] = useState(meta?.fechaObjetivo || '')
  const [activa, setActiva] = useState(meta?.activa !== false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ficha = medidorDe(medidor)

  async function guardar() {
    if (!label.trim()) {
      setError('La meta necesita un nombre.')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await guardarMeta(marca, {
        key: meta?.key || claveDeMeta(label, usadas),
        label: label.trim(),
        medidor,
        canal: (canal || null) as Canal | null,
        objetivo: Number(objetivo) || 0,
        fechaObjetivo: fechaObjetivo || undefined,
        orden: meta?.orden ?? usadas.length,
        activa,
      })
      onListo()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
      setGuardando(false)
    }
  }

  async function borrar() {
    if (!meta) return
    setGuardando(true)
    setError(null)
    try {
      await borrarMeta(marca, meta.key)
      onListo()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar.')
      setGuardando(false)
    }
  }

  return (
    <Card style={{ marginTop: space[3], background: color.bg2 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontWeight: 600 }}>{meta ? 'Editar meta' : 'Meta nueva'}</div>

        {error && <Notice tone="danger">{error}</Notice>}

        <Field label="Qué se quiere lograr" hint="Como se dice en voz alta: «llegar a 400 fundas por día»">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="400 fundas por día" style={{ width: 320 }} />
        </Field>

        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Qué se mide" hint={ficha?.hint}>
            <Select value={medidor} onChange={(e) => setMedidor(e.target.value as Medidor)}>
              {MEDIDORES.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Canal" hint="Vacío = todos juntos">
            <Select value={canal} onChange={(e) => setCanal(e.target.value)}>
              <option value="">Todos</option>
              {CANALES_META.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Objetivo" hint={ficha?.unidad}>
            <Input
              type="number"
              step="0.01"
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value)}
              placeholder="400"
              style={{ width: 120 }}
            />
          </Field>
          <Field label="Para cuándo" hint="Opcional: con fecha sale el ritmo semanal">
            <Input type="date" value={fechaObjetivo} onChange={(e) => setFechaObjetivo(e.target.value)} />
          </Field>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.md }}>
          <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
          Activa (las apagadas van al final, en gris y sin medir)
        </label>

        <div style={{ display: 'flex', gap: space[3], alignItems: 'center' }}>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button variant="outline" onClick={onCancelar} disabled={guardando}>
            Cancelar
          </Button>
          {meta && (
            <Button size="sm" variant="outline" tone="danger" onClick={borrar} disabled={guardando}>
              Borrar
            </Button>
          )}
          <span style={{ fontSize: font.sm, color: color.mut }}>
            {ficha ? `Se compara contra ${ficha.label.toLowerCase()}, en ${ficha.unidad}.` : ''}
          </span>
        </div>
      </div>
    </Card>
  )
}
