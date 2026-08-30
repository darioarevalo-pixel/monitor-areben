'use client'

/**
 * **La ficha de una persona.** Dos columnas, y las rutinas arriba.
 *
 * # Los dos cambios que la sacaron de ser una tira
 *
 * 1. **Las rutinas de la Agenda suben al encabezado.** Estaban al final, después de treinta
 *    renglones, y son lo único de la ficha que le pide algo a esa persona **hoy**. Lo que se lee
 *    último es lo que no se lee.
 * 2. **Dos columnas, partidas por lo que preguntan**: a la izquierda *qué hace* (responde por,
 *    entrega), a la derecha *cómo trabaja y qué NO* (decide sola, publica, no es suyo). No es
 *    estética: son dos conversaciones distintas —una es el reclamo, la otra es la frontera— y
 *    apiladas se leían como una lista sola de la que no se distinguía el final.
 *
 * ⚠️ Cada renglón es un renglón, ⛔ no una caja: cuarenta cajas con borde le dan a todo el mismo
 * peso, que es exactamente de lo que se quejó esta pantalla.
 */

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { ItemAgenda } from '@/lib/agenda/tipos'
import { clavesDestino } from '@/lib/novedades/tipos'
import { CLASES, sinDueno, type ClaseResp, type Responsabilidad } from '@/lib/organizacion/tipos'
import { Badge, Button, EmptyState, Markdown, Notice, color, font, space, weight } from '@/components/ui'

const IZQUIERDA: ClaseResp[] = ['responde', 'entrega']
const DERECHA: ClaseResp[] = ['decide', 'publica', 'no_es_suyo']

export function FichaPersona({ persona, apodo, rol, filas, puesto, manuales, rutinas, haceHorasExtras, puedeEditar, onEditar, onEliminar }: {
  persona: string
  apodo: string
  /** La nota del organigrama («producción audiovisual»), si la tiene. */
  rol?: string | null
  filas: Responsabilidad[]
  /**
   * El puesto que cubre, si cubre uno: `{ label, filas }`.
   *
   * 🔑 **Karen no responde por «lo de Karen»: responde por lo del Local BDI.** El reparto del local
   * se escribe UNA vez, contra la cuenta del puesto — el mismo humano escribe desde dos identidades
   * y en BDI el puesto lo tapa 4,8×. Sin esto su ficha salía VACÍA, que se lee como «no responde
   * por nada»: la afirmación más cara que puede hacer esta pantalla.
   */
  puesto?: { label: string; filas: Responsabilidad[] } | null
  manuales: { id: string; titulo: string; publicado: boolean }[]
  rutinas: ItemAgenda[] | null
  /** Del padrón. Hay rutinas cuyo destino es esa condición y no un nombre: ver `misClaves`. */
  haceHorasExtras?: boolean
  puedeEditar: boolean
  onEditar: (r: Responsabilidad) => void
  onEliminar: (r: Responsabilidad) => void
}) {
  const [verRutinas, setVerRutinas] = useState(false)
  // 🔑 **Las claves con las que una rutina puede ser suya son más de una.** La mayoría la nombra
  // (`p:<name>`), pero el destino también puede describir una CONDICIÓN de la persona —«a quien
  // hace horas extras»— y ésa no lleva nombre adentro. Filtrar sólo por `p:` dejaba la rutina
  // mensual de las horas extras afuera de las fichas de las tres que las hacen, o sea afirmando
  // que no responden por algo que sí hacen. ⛔ No se agregan acá las claves de rol ni de sección:
  // ésas no son responsabilidades de una persona, son de un sector o de quien abra una pantalla.
  const misClaves = useMemo(() => {
    const cs = [`p:${persona}`]
    if (haceHorasExtras) cs.push('hx')
    return cs
  }, [persona, haceHorasExtras])
  const suyas = useMemo(() => (
    (rutinas || []).filter((i) => i.activo !== false && !i.plantilla && clavesDestino(i.destino).some((c) => misClaves.includes(c)))
  ), [rutinas, misClaves])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[5] }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: space[3], flexWrap: 'wrap' }}>
          <span style={{ fontSize: font['2xl'], fontWeight: weight.bold, color: color.ink, letterSpacing: -0.2 }}>{apodo}</span>
          {rol && <span style={{ fontSize: font.sm, color: color.mut }}>{rol}</span>}
          <Badge tone="neutral">{filas.filter((f) => f.activo !== false).length} responsabilidades</Badge>
          {apodo !== persona && <span style={{ fontSize: font.xs, color: color.mut2 }}>{persona}</span>}
        </div>

        {/* 🔴 Acá decía «Hoy la Agenda le trae» y listaba las 17 de Sofi: **afirmaba algo falso**.
            Son TODAS sus rutinas de calendario, caigan hoy o no — la ficha describe lo permanente,
            así que lo de hoy no es su pregunta. Cazado caminando la pantalla.
            🔑 Y el número sube al encabezado mientras la tira arranca PLEGADA: el dato que muerde es
            «17, y es part-time», no los diecisiete títulos tapando la ficha. */}
        {suyas.length > 0 && (
          <div style={{ marginTop: space[3] }}>
            <button
              type="button"
              onClick={() => setVerRutinas((v) => !v)}
              style={{ height: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: color.mut, fontSize: font.sm }}
            >
              <span aria-hidden style={{ marginRight: 4 }}>{verRutinas ? '▾' : '▸'}</span>
              y <b style={{ color: color.ink2 }}>{suyas.length} rutinas</b> de calendario en la Agenda
            </button>
            {verRutinas && (
              <div style={{ marginTop: space[2], display: 'flex', gap: space[1.5], flexWrap: 'wrap', alignItems: 'center' }}>
                {suyas.map((r) => (
                  <span key={r.id} style={{ fontSize: font.sm, color: color.ink2, border: `1px solid ${color.line}`, borderRadius: 999, padding: '2px 10px' }}>
                    {r.titulo}{r.clase === 'aviso' && <span style={{ color: color.mut2 }}> · aviso</span>}
                  </span>
                ))}
                <Link href="/agenda" style={{ fontSize: font.sm, color: color.brand, fontWeight: weight.semibold }}>Ver la Agenda →</Link>
              </div>
            )}
          </div>
        )}

        {/* 🔑 El cero de rutinas NO dice que no trabaje, y lo dice la pantalla en vez de dejar que
            el que mira lo deduzca: la Agenda dispara por día del calendario, y el trabajo que
            dispara por un HECHO vive en los eventos. Medido el 30-ago-2026: Camila Budek tiene 0
            rutinas propias y 14 responsabilidades. */}
        {rutinas !== null && suyas.length === 0 && (
          <div style={{ marginTop: space[3], fontSize: font.sm, color: color.mut }}>
            No es que no le toque nada: la Agenda dispara por día del calendario, y lo que dispara por
            un hecho —una sesión, un ingreso, un lanzamiento— vive en los <Link href="/agenda/eventos" style={{ color: color.brand }}>eventos</Link>.
          </div>
        )}
      </div>

      {puesto && (
        <Notice tone="brand">
          Cubre un turno de <b>{puesto.label}</b>, y responde por lo del puesto. El reparto del local
          se escribe una sola vez, contra el puesto y no contra cada persona: el turno cambia, el
          reparto no.
        </Notice>
      )}

      {filas.length === 0 && !puesto ? (
        <EmptyState title="Todavía no tiene ninguna responsabilidad escrita." />
      ) : filas.length === 0 && puesto ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: space[6] }}>
          <Columna claves={IZQUIERDA} filas={puesto.filas} manuales={manuales} puedeEditar={puedeEditar} onEditar={onEditar} onEliminar={onEliminar} />
          <Columna claves={DERECHA} filas={puesto.filas} manuales={manuales} puedeEditar={puedeEditar} onEditar={onEditar} onEliminar={onEliminar} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: space[6] }}>
          <Columna claves={IZQUIERDA} filas={filas} manuales={manuales} puedeEditar={puedeEditar} onEditar={onEditar} onEliminar={onEliminar} />
          <Columna claves={DERECHA} filas={filas} manuales={manuales} puedeEditar={puedeEditar} onEditar={onEditar} onEliminar={onEliminar} />
        </div>
      )}
    </div>
  )
}

function Columna({ claves, filas, manuales, puedeEditar, onEditar, onEliminar }: {
  claves: ClaseResp[]
  filas: Responsabilidad[]
  manuales: { id: string; titulo: string; publicado: boolean }[]
  puedeEditar: boolean
  onEditar: (r: Responsabilidad) => void
  onEliminar: (r: Responsabilidad) => void
}) {
  const bloques = CLASES.filter((c) => claves.includes(c.key) && filas.some((f) => f.clase === c.key))
  if (!bloques.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[5] }}>
      {bloques.map((c) => (
        <div key={c.key}>
          <div title={c.ayuda} style={{ fontSize: font.xs, color: color.mut2, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: space[2] }}>
            {c.label}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filas.filter((f) => f.clase === c.key).map((f) => (
              <Renglon key={f.id} fila={f} manuales={manuales} puedeEditar={puedeEditar} onEditar={onEditar} onEliminar={onEliminar} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function Renglon({ fila, manuales, sector, puedeEditar, onEditar, onEliminar }: {
  fila: Responsabilidad
  manuales: { id: string; titulo: string; publicado: boolean }[]
  /** El rótulo del sector, cuando la lista mezcla varios (los grises). */
  sector?: string
  puedeEditar: boolean
  onEditar: (r: Responsabilidad) => void
  onEliminar: (r: Responsabilidad) => void
}) {
  const manual = manuales.find((m) => m.id === fila.manual_id)
  const huerfano = sinDueno(fila)
  return (
    <div style={{ padding: `${space[2]}px 0`, borderBottom: `1px solid ${color.line}` }}>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontSize: font.md, fontWeight: weight.medium, color: fila.activo === false ? color.mut2 : color.ink }}>
          {fila.titulo}
        </span>
        {sector && <Badge tone="neutral">{sector}</Badge>}
        {huerfano && <Badge tone="warning">Sin dueño</Badge>}
        {fila.activo === false && <Badge tone="neutral">Apagada</Badge>}
        <span style={{ flex: 1 }} />
        {puedeEditar && (
          <>
            <Button size="sm" variant="ghost" onClick={() => onEditar(fila)}>Editar</Button>
            <Button size="sm" variant="ghost" onClick={() => onEliminar(fila)}>Eliminar</Button>
          </>
        )}
      </div>
      {fila.detalle && (
        <div style={{ marginTop: space[0.5], fontSize: font.sm, color: color.mut }}>
          <Markdown texto={fila.detalle} compacto />
        </div>
      )}
      {/* El link al manual sólo si está PUBLICADO: un botón que promete ayuda y abre vacío enseña
          a no apretarlo. Misma regla que el «📘 Cómo se hace» del pendiente. */}
      {manual?.publicado && (
        <Link href={`/manuales?manual=${encodeURIComponent(manual.id)}`} style={{ display: 'inline-block', marginTop: space[1], fontSize: font.sm, color: color.brand, fontWeight: weight.semibold }}>
          📘 {manual.titulo}
        </Link>
      )}
    </div>
  )
}
