'use client'

/**
 * El único diálogo de PDF. Eran **tres botones sueltos** en la barra —"Reporte PDF", "Galería PDF"
 * y "Solo diseños"— para tres variantes del mismo papel; había que acordarse cuál era cuál.
 *
 * 🔑 Y los tres imprimían "A favor: 0 · En contra: 0", porque salían de los 👍/👎 del tablero, que
 * sobre los 37 diseños de BDI valían cero. Ahora imprimen el ★ de la ronda: el papel con el que se
 * decide la compra dice lo que votó el equipo.
 */

import { useState } from 'react'
import { reporteDecisiones, reporteGaleria, reporteLimpio } from '@/lib/disenos/pdf'
import { contarPorEstado } from '@/lib/disenos/core'
import { DB_ESTADOS, type Diseno, type EstadoDiseno, type OrdenDiseno } from '@/lib/disenos/tipos'
import type { PuntajesDeRonda } from '@/lib/disenos/votacion'
import { Button, Field, Modal, Notice, Select, color, font, space, useToast } from '@/components/ui'

type Tipo = 'decisiones' | 'galeria' | 'limpio'

const TIPOS: { k: Tipo; lbl: string; hint: string }[] = [
  { k: 'decisiones', lbl: 'Por decisión', hint: 'Agrupado en confirmados, en duda, rechazados y por revisar, con el puntaje de cada uno.' },
  { k: 'galeria', lbl: 'Galería', hint: 'Grilla de tres columnas con el color del estado y el puntaje abajo de cada foto.' },
  { k: 'limpio', lbl: 'Solo las fotos', hint: 'Nada más que las imágenes, para mostrárselas a alguien sin que vea lo que opinó el equipo.' },
]

export function ReportePDF({
  abierto,
  onCerrar,
  disenos,
  orden,
  puntajes,
  tituloRonda,
}: {
  abierto: boolean
  onCerrar: () => void
  disenos: Diseno[]
  orden: OrdenDiseno
  puntajes: PuntajesDeRonda
  tituloRonda?: string
}) {
  const toast = useToast()
  const [tipo, setTipo] = useState<Tipo>('decisiones')
  const [filtro, setFiltro] = useState<EstadoDiseno | 'todos'>('todos')
  const [generando, setGenerando] = useState(false)

  const generar = async () => {
    setGenerando(true)
    try {
      if (tipo === 'decisiones') await reporteDecisiones(disenos, puntajes, tituloRonda)
      else if (tipo === 'galeria') await reporteGaleria(disenos, orden, puntajes, tituloRonda)
      else if (!(await reporteLimpio(disenos, orden, filtro, puntajes))) {
        toast.aviso('No hay diseños en esa categoría.')
        return
      }
      onCerrar()
    } catch (e) {
      toast.error('No se pudo armar el PDF: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setGenerando(false)
    }
  }

  const elegido = TIPOS.find((t) => t.k === tipo)!

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Reporte PDF">
      <Field label="Qué reporte">
        <Select value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
          {TIPOS.map((t) => (
            <option key={t.k} value={t.k}>
              {t.lbl}
            </option>
          ))}
        </Select>
      </Field>
      <div style={{ fontSize: font.sm, color: color.mut, margin: `${space[2]}px 0 ${space[3]}px` }}>{elegido.hint}</div>

      {tipo === 'limpio' && (
        <Field label="Qué diseños entran">
          <Select value={filtro} onChange={(e) => setFiltro(e.target.value as EstadoDiseno | 'todos')}>
            <option value="todos">Todos ({disenos.length})</option>
            {DB_ESTADOS.map((e) => (
              <option key={e.k} value={e.k}>
                {e.lbl} ({contarPorEstado(disenos, e.k)})
              </option>
            ))}
          </Select>
        </Field>
      )}

      {/* El cero afirma: sin esto, un PDF con "sin votos" en las 34 fotos se lee como si al equipo
          no le hubiera gustado nada, en vez de como que la votación todavía no pasó. */}
      {!tituloRonda && tipo !== 'limpio' && (
        <Notice tone="neutral" style={{ marginTop: space[3] }}>
          Todavía no hay ninguna ronda de votación en esta marca, así que el reporte va a decir «sin votos» en cada diseño.
        </Notice>
      )}

      <div style={{ display: 'flex', gap: space[2], marginTop: space[4] }}>
        <Button variant="ghost" onClick={onCerrar}>
          Cancelar
        </Button>
        <Button variant="solid" tone="brand" onClick={() => void generar()} disabled={generando || !disenos.length} style={{ marginLeft: 'auto' }}>
          {generando ? 'Armando…' : 'Generar el PDF'}
        </Button>
      </div>
    </Modal>
  )
}
