'use client'

/**
 * **Por sector: la matriz.** Personas en columnas, las cinco clases en filas.
 *
 * # Por qué dejó de ser una lista
 *
 * Era una tira de 52 cajas iguales agrupadas POR CLASE, así que «Responde por» mostraba quince
 * renglones de tres personas mezcladas: la pantalla que tiene que mostrar **el reparto** era justo
 * la que lo escondía. Puesto en columnas, el reparto se lee de un vistazo — y sobre todo **se ven
 * los huecos**: una celda vacía no es un espacio en blanco, es que **nadie**.
 *
 * # Dos clases van completas y tres arrancan como número
 *
 * 🔑 **«Responde por» y «Publica» son el titular de una persona**: de qué se le reclama, y qué canal
 * aprieta. Las otras tres son el detalle, y en una matriz el detalle de tres personas a la vez no
 * se lee: se hojea. Arrancan como el número —que ya dice algo: *«Cami tiene seis cosas escritas que
 * NO son suyas»*— y se abren desde el rótulo de la fila.
 *
 * ⚠️ **La columna «Sin dueño» va AL LADO de las personas, no en otra pantalla.** Es lo que la
 * convierte en una comparación honesta: el gris deja de ser una lista aparte que hay que acordarse
 * de abrir y pasa a ser la columna que quedó vacía de nombre.
 */

import { useState } from 'react'
import { CLASES, deLaPersona, grises, type ClaseResp, type Responsabilidad } from '@/lib/organizacion/tipos'
import { TableWrap, THead, TBody, Tr, Th, Td, color, font, space, weight } from '@/components/ui'

/** Las que se leen enteras. El resto arranca plegado. */
const COMPLETAS: ClaseResp[] = ['responde', 'publica']

export function MatrizSector({ filas, personas, apodoDe, puedeEditar, onEditar, onPersona }: {
  filas: Responsabilidad[]
  /** Las personas del sector, en el orden del organigrama. */
  personas: string[]
  apodoDe: (n: string) => string
  puedeEditar: boolean
  onEditar: (r: Responsabilidad) => void
  onPersona: (p: string) => void
}) {
  const [abiertas, setAbiertas] = useState<ClaseResp[]>([])
  const abierta = (c: ClaseResp) => COMPLETAS.includes(c) || abiertas.includes(c)
  const alternar = (c: ClaseResp) => setAbiertas((a) => (a.includes(c) ? a.filter((x) => x !== c) : [...a, c]))

  const losGrises = grises(filas)
  // La columna del gris sólo aparece si hay alguno: una columna vacía permanente enseña a no mirarla.
  const columnas: (string | null)[] = losGrises.length ? [...personas, null] : personas

  const deLaCelda = (persona: string | null, clase: ClaseResp) => (
    persona === null
      ? losGrises.filter((f) => f.clase === clase)
      : deLaPersona(filas, persona).filter((f) => f.clase === clase)
  )

  return (
    <TableWrap>
      <THead>
        <Tr>
          <Th width={150} />
          {columnas.map((p) => (
            <Th key={p ?? '(gris)'} width={220} style={{ verticalAlign: 'bottom' }}>
              {p === null ? (
                <span style={{ color: color.warningInk, fontWeight: weight.semibold }}>⚠ Sin dueño · {losGrises.length}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onPersona(p)}
                  title="Abrir su ficha"
                  style={{ height: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: color.brand, fontSize: font.sm, fontWeight: weight.semibold, letterSpacing: 0.3 }}
                >
                  {apodoDe(p).toUpperCase()} · {deLaPersona(filas, p).length}
                </button>
              )}
            </Th>
          ))}
        </Tr>
      </THead>
      <TBody>
        {CLASES.map((c) => {
          const plegable = !COMPLETAS.includes(c.key)
          const abierto = abierta(c.key)
          return (
            <Tr key={c.key}>
              <Td wrap tall style={{ verticalAlign: 'top', paddingTop: space[3], paddingBottom: space[3] }}>
                {plegable ? (
                  <button
                    type="button"
                    onClick={() => alternar(c.key)}
                    title={c.ayuda}
                    style={{ height: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: color.mut, fontSize: font.xs, letterSpacing: 0.4, textTransform: 'uppercase' }}
                  >
                    <span aria-hidden style={{ marginRight: 4 }}>{abierto ? '▾' : '▸'}</span>{c.label}
                  </button>
                ) : (
                  <span title={c.ayuda} style={{ color: color.ink2, fontSize: font.xs, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: weight.semibold }}>
                    {c.label}
                  </span>
                )}
              </Td>

              {columnas.map((p) => {
                const items = deLaCelda(p, c.key)
                return (
                  <Td key={(p ?? '(gris)') + c.key} wrap tall style={{ verticalAlign: 'top', paddingTop: space[3], paddingBottom: space[3], background: p === null ? color.warningBg : undefined }}>
                    {/* 🔑 El vacío se dibuja, no se deja en blanco: un blanco se lee como «no cargado»
                        y una raya se lee como «nadie», que es lo que la matriz vino a mostrar. */}
                    {items.length === 0 ? (
                      <span aria-label="nadie" style={{ color: color.mut2 }}>—</span>
                    ) : !abierto ? (
                      <button
                        type="button"
                        onClick={() => alternar(c.key)}
                        style={{ height: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: color.ink2, fontSize: font.md, fontWeight: weight.semibold }}
                      >
                        {items.length}
                      </button>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: space[1.5] }}>
                        {items.map((f) => (
                          <Celda key={f.id} fila={f} puedeEditar={puedeEditar} onEditar={onEditar} />
                        ))}
                      </div>
                    )}
                  </Td>
                )
              })}
            </Tr>
          )
        })}
      </TBody>
    </TableWrap>
  )
}

/**
 * Un renglón de la matriz.
 *
 * ⚠️ **El `detalle` no se dibuja acá, va como tooltip.** La matriz es para comparar; el detalle se
 * lee en la ficha de la persona. Metido en la celda, tres párrafos de tres personas desalinean las
 * filas y la comparación se pierde, que es lo único que esta vista sabe hacer.
 */
function Celda({ fila, puedeEditar, onEditar }: { fila: Responsabilidad; puedeEditar: boolean; onEditar: (r: Responsabilidad) => void }) {
  const apagada = fila.activo === false
  const estilo: React.CSSProperties = {
    fontSize: font.sm, lineHeight: 1.35, color: apagada ? color.mut2 : color.ink2,
    textDecoration: apagada ? 'line-through' : undefined,
  }
  if (!puedeEditar) return <span title={fila.detalle || undefined} style={estilo}>{fila.titulo}</span>
  return (
    <button
      type="button"
      onClick={() => onEditar(fila)}
      title={fila.detalle ? `${fila.detalle}\n\n(apretá para editar)` : 'Editar'}
      style={{ ...estilo, height: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
    >
      {fila.titulo}
    </button>
  )
}
