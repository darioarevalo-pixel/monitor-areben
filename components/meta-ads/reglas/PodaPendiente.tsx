'use client'

/**
 * **«Hay 5 avisos quemando $8.600 por día»**, adentro de «Qué hay que decidir» del Panel.
 *
 * # Por qué es un renglón y no la lista entera
 *
 * La lista con sus tildes vive en el modal. Acá va lo que hace falta para decidir si vale la pena
 * abrirlo: cuántos son y cuánta plata por día. Un bloque que despliega cinco renglones con checkbox
 * arriba de todo convierte el Panel —que es un resumen— en un formulario.
 *
 * 🔴 **Y va afuera del censo**: sale de la foto diaria, igual que los hallazgos y los planes, así que
 * se ve aunque Meta esté caído. Que la pauta esté quemando plata es exactamente lo que hay que poder
 * leer el día que Graph no contesta.
 */

import { useEffect, useState } from 'react'
import { traerCandidatosAPodar } from '@/lib/meta-ads/cliente'
import { plata } from '@/lib/meta-ads/formato'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import { ModalPodar } from '@/components/meta-ads/acciones/ModalPodar'
import type { LineaPauta } from '@/lib/meta-ads/tipos'
import { Button, StatusPill, color, font, radius, space, weight } from '@/components/ui'

export type Resumen = { linea: LineaPauta; cuantos: number; porDia: number; puede: boolean }

/**
 * Cuánto hay para podar por marca. Está en un hook y no adentro del renglón porque **el Panel
 * necesita saberlo antes de dibujar**: el bloque «Qué hay que decidir» sólo aparece si hay algo que
 * decidir, y una tarjeta vacía con ese título es peor que ninguna.
 */
export function usePoda(lineas: LineaPauta[]): { resumenes: Resumen[]; recargar: () => void } {
  const [resumenes, setResumenes] = useState<Resumen[]>([])
  const [pedido, setPedido] = useState(0)
  const clave = lineas.join(',')

  useEffect(() => {
    let vivo = true
    const suyas = clave ? (clave.split(',') as LineaPauta[]) : []
    void Promise.all(suyas.map((linea) => traerCandidatosAPodar(linea).then((r) => (
      // Un fallo de una marca no puede tapar a las otras: se cae a «nada que podar» en silencio. El
      // renglón es un aviso, no un diagnóstico — si Supabase está caído, el Panel ya lo dice arriba.
      !r.ok ? null : {
        linea,
        cuantos: r.dato.candidatos.length,
        porDia: r.dato.candidatos.reduce((s, c) => s + c.porDia, 0),
        puede: r.dato.puede,
      }
    )))).then((rs) => {
      if (!vivo) return
      setResumenes(rs.filter((x): x is Resumen => !!x && x.cuantos > 0))
    })
    return () => { vivo = false }
  }, [clave, pedido])

  return { resumenes, recargar: () => setPedido((n) => n + 1) }
}

export function PodaPendiente({ resumenes, recargar }: { resumenes: Resumen[]; recargar: () => void }) {
  const [abierta, setAbierta] = useState<LineaPauta | null>(null)
  if (resumenes.length === 0) return null

  return (
    <>
      {resumenes.map((r) => (
        <div
          key={r.linea}
          style={{
            display: 'flex', flexWrap: 'wrap', gap: space[2], alignItems: 'center',
            justifyContent: 'space-between',
            border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: space[3],
          }}
        >
          <div style={{ minWidth: 0, flex: '1 1 320px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[1.5], flexWrap: 'wrap' }}>
              <StatusPill tone="danger" label="Gasta sin vender" />
              <span style={{ fontSize: font.base, fontWeight: weight.semibold }}>
                {r.cuantos === 1
                  ? `1 aviso de ${ETIQUETA_LINEA[r.linea]} viene gastando sin vender`
                  : `${r.cuantos} avisos de ${ETIQUETA_LINEA[r.linea]} vienen gastando sin vender`}
              </span>
            </div>
            <div style={{ fontSize: font.sm, color: color.mut, marginTop: space[1], lineHeight: 1.45 }}>
              Son <b>{plata(r.porDia)}</b> por día. Cada uno gastó más de lo que cuesta traer un
              cliente en esta marca y no trajo ninguno.
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setAbierta(r.linea)}>
            {r.puede ? 'Ver y apagar' : 'Ver cuáles'}
          </Button>
        </div>
      ))}

      {/* Al cerrar se vuelve a pedir: lo que se apagó tiene que salir del renglón sin recargar. */}
      {abierta && <ModalPodar linea={abierta} onCerrar={() => { setAbierta(null); recargar() }} />}
    </>
  )
}
