'use client'

/**
 * Qué días corre una cosa de la agenda — **un solo editor para la promo y para el pendiente**.
 *
 * 🔑 **La regla se arma con controles, nunca se tipea el JSON.** Lo que se guarda es
 * `{tipo:'semanal',dias:[2,5]}`, pero quien carga elige "ciertos días de la semana" y tilda martes y
 * viernes. Es la misma razón por la que la lista muestra `rotuloRegla()`: una regla que no se puede
 * leer no se puede revisar, y una que no se puede armar sin saber el formato no se carga.
 *
 * Vive en su propio archivo desde que el pendiente rutinario pide lo mismo que la promo bancaria. Es
 * la misma pregunta —"¿esto va hoy?"— y ya tenía un solo motor (`reglas.core.js`); tener dos
 * pantallas para armar la misma regla las habría dejado divergir en el primer arreglo.
 *
 * El servidor vuelve a validar todo con `motivoReglaInvalida`: esto evita el viaje, no decide.
 */

import { Field, Input, Select, color, font, space, weight } from '@/components/ui'
import { hoyIso, TIPOS_REGLA, type Regla } from '@/lib/agenda'

/**
 * 0 = domingo, como `getDay()` y como la regla.
 *
 * 🔴 **El orden de la fila arranca en lunes porque así se lee, pero los valores NO se reordenan.**
 * Dar vuelta el array es el error que ya se cometió en el calendario editorial: corre todas las
 * etiquetas un día **sin que falle nada**.
 */
export const DIAS_TILDE: { valor: number; label: string }[] = [
  { valor: 1, label: 'Lun' },
  { valor: 2, label: 'Mar' },
  { valor: 3, label: 'Mié' },
  { valor: 4, label: 'Jue' },
  { valor: 5, label: 'Vie' },
  { valor: 6, label: 'Sáb' },
  { valor: 0, label: 'Dom' },
]

/** Un tilde con forma de píldora: se toca con el dedo y se lee prendido o apagado de lejos. */
export function Tilde({ puesto, label, onToggle }: { puesto: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        height: 'auto',
        padding: `${space[1.5]}px ${space[3]}px`,
        borderRadius: 999,
        cursor: 'pointer',
        fontSize: font.sm,
        fontWeight: weight.semibold,
        border: `1px solid ${puesto ? color.brand : color.line2}`,
        background: puesto ? color.brandBg : 'transparent',
        color: puesto ? color.brand : color.mut,
      }}
    >
      {label}
    </button>
  )
}

/** `lista` con `v` adentro si no estaba, y sin él si estaba. */
export function toggleEnLista<T>(lista: T[], v: T): T[] {
  return lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]
}

/**
 * El esqueleto de cada tipo de regla.
 *
 * Cambiar de tipo estrena esqueleto: conservar los campos del anterior dejaría una
 * `{tipo:'diaria', dias:[2]}` que el validador rechaza por un campo que la pantalla ya no muestra.
 */
export function reglaVaciaDe(tipo: Regla['tipo']): Regla {
  const nueva: Record<Regla['tipo'], Regla> = {
    unica: { tipo: 'unica', fecha: hoyIso() },
    rango: { tipo: 'rango', desde: hoyIso(), hasta: hoyIso() },
    diaria: { tipo: 'diaria' },
    semanal: { tipo: 'semanal', dias: [] },
    mensual: { tipo: 'mensual', dia: 1 },
  }
  return nueva[tipo]
}

export function EditorRegla({
  regla: r,
  onChange,
  titulo = 'Qué días corre',
}: {
  regla: Regla
  onChange: (r: Regla) => void
  titulo?: string
}) {
  return (
    <div>
      <div style={{ fontSize: font.xs, color: color.mut, fontWeight: weight.medium, marginBottom: 4 }}>
        {titulo}
      </div>
      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field width={240}>
          <Select value={r.tipo} onChange={(e) => onChange(reglaVaciaDe(e.target.value as Regla['tipo']))}>
            {TIPOS_REGLA.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </Select>
        </Field>

        {r.tipo === 'unica' && (
          <Field label="El día" width={170}>
            <Input type="date" value={r.fecha} onChange={(e) => onChange({ ...r, fecha: e.target.value })} />
          </Field>
        )}

        {r.tipo === 'rango' && (
          <>
            <Field label="Del" width={170}>
              <Input type="date" value={r.desde} onChange={(e) => onChange({ ...r, desde: e.target.value })} />
            </Field>
            <Field label="Al" width={170}>
              <Input type="date" value={r.hasta} onChange={(e) => onChange({ ...r, hasta: e.target.value })} />
            </Field>
          </>
        )}

        {r.tipo === 'mensual' && (
          <Field label="Día del mes" hint="Del 29 en adelante, usá «el último»" width={170}>
            <Select
              value={String(r.dia)}
              onChange={(e) => onChange({ ...r, dia: e.target.value === 'ultimo' ? 'ultimo' : Number(e.target.value) })}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={String(d)}>{d}</option>
              ))}
              <option value="ultimo">el último día del mes</option>
            </Select>
          </Field>
        )}
      </div>

      {r.tipo === 'semanal' && (
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginTop: space[3] }}>
          {DIAS_TILDE.map((d) => (
            <Tilde
              key={d.valor}
              puesto={r.dias.includes(d.valor)}
              label={d.label}
              onToggle={() => onChange({ ...r, dias: toggleEnLista(r.dias, d.valor) })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
