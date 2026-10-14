'use client'

/**
 * «Ya viene en…» — anotar que unas fundas del tablero **ya están compradas** en una importación.
 *
 * 🔑 **Por qué no alcanza con «Pasar a una importación».** Las fundas de las importaciones se
 * cargan casi siempre directo en Ingresos, sin pasar por Diseños: el 14-oct-2026 las 56 de las tres
 * que venían tenían **0** con `disenoId`. Y el tablero tenía 19 de ellas en «Por revisar», que es
 * justo de donde la votación nueva arma su lista. Mandarlas con el puente para ganar la chapita las
 * habría **duplicado** en la importación.
 *
 * Esto sólo **lee** Ingresos —para ofrecer a cuál y mostrar sus fotos al lado— y escribe en el
 * diseño: lo confirma y le deja el vínculo (`vincularAImportacion`). ⛔ Nunca escribe el KV.
 * Qué funda es igual a cuál lo decide quien mira las fotos: no hay un cruce automático confiable
 * entre el render de una funda y la foto de la muestra.
 */

import { useEffect, useState } from 'react'
import { leerIngresos } from '@/lib/kv/cliente'
import { normalizar } from '@/lib/ingresos/core'
import { nuevoId } from '@/components/ingresos/useIngresos'
import type { Ingreso } from '@/lib/ingresos/tipos'
import type { Diseno, EnvioAIngreso } from '@/lib/disenos/tipos'
import type { Marca } from '@/lib/nav.datos'
import { Button, Field, Modal, Notice, Select, color, font, space } from '@/components/ui'

/** Primero las que todavía no llegaron, la más próxima arriba: son las únicas que importan acá. */
function porLlegar(lista: Ingreso[]): Ingreso[] {
  return lista.filter((g) => g.estado !== 'arribado').sort((a, b) => String(a.fecha || '9').localeCompare(String(b.fecha || '9')))
}

function etiqueta(g: Ingreso): string {
  const f = g.fecha ? new Date(g.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : ''
  return (g.desc || 'sin nombre') + (f ? ` · llega ${f}` : '')
}

export function YaVieneEn({
  marca,
  disenos,
  por,
  onCerrar,
  onVincular,
}: {
  marca: Marca
  /** Los elegidos. Vacío = el diálogo está cerrado. */
  disenos: Diseno[]
  por: string
  onCerrar: () => void
  onVincular: (ids: Set<string>, envio: EnvioAIngreso) => void
}) {
  const abierto = disenos.length > 0
  const [lista, setLista] = useState<Ingreso[] | null>(null)
  const [motivo, setMotivo] = useState<string | null>(null)
  const [elegida, setElegida] = useState('')

  useEffect(() => {
    if (!abierto) return
    let vivo = true
    void (async () => {
      setLista(null)
      setMotivo(null)
      const r = await leerIngresos<Ingreso>(marca)
      if (!vivo) return
      if (!r.ok) return setMotivo(r.motivo)
      const l = porLlegar((r.dato || []).map((g) => normalizar(g, nuevoId)))
      setLista(l)
      setElegida(l[0]?.id || '')
    })()
    return () => {
      vivo = false
    }
  }, [abierto, marca])

  const g = lista?.find((x) => x.id === elegida)
  const fotos = (g?.bloques || []).flatMap((b) => b.disenos || []).filter((d) => d.img)
  const n = disenos.length

  function vincular() {
    if (!g) return
    onVincular(new Set(disenos.map((d) => d.id)), {
      ingresoId: g.id,
      ingresoDesc: etiqueta(g),
      bloqueId: '',
      columnaId: '',
      fecha: new Date().toISOString(),
      por,
    })
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={n === 1 ? 'Esta funda ya viene en una importación' : `Estas ${n} fundas ya vienen en una importación`} ancho="ancho">
      <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[3] }}>
        Quedan confirmadas y con la importación anotada en la tarjeta, así no entran en la próxima votación. No se agrega nada en Ingresos.
      </div>

      {motivo && (
        <Notice tone="danger" icon="⚠" style={{ marginBottom: space[3] }}>
          No se pudieron leer las importaciones: {motivo}
        </Notice>
      )}

      {!lista && !motivo ? (
        <div style={{ color: color.mut2, fontSize: font.sm, padding: space[3] }}>Leyendo las importaciones…</div>
      ) : lista && !lista.length ? (
        <Notice tone="neutral">No hay ninguna importación por llegar cargada en Ingresos.</Notice>
      ) : (
        lista && (
          <>
            <Field label="En qué importación vienen">
              <Select value={elegida} onChange={(e) => setElegida(e.target.value)}>
                {lista.map((x) => (
                  <option key={x.id} value={x.id}>
                    {etiqueta(x)}
                  </option>
                ))}
              </Select>
            </Field>

            {/* Las dos tiras juntas: es la única forma de chequear «es la misma» antes de apretar. */}
            <div style={{ fontSize: font.xs, color: color.mut2, margin: `${space[3]}px 0 ${space[1]}px` }}>Las elegidas</div>
            <Tira urls={disenos.map((d) => d.url)} />
            <div style={{ fontSize: font.xs, color: color.mut2, margin: `${space[3]}px 0 ${space[1]}px` }}>
              Lo que trae esa importación ({fotos.length} {fotos.length === 1 ? 'foto' : 'fotos'})
            </div>
            {fotos.length ? <Tira urls={fotos.map((d) => d.img)} /> : <div style={{ fontSize: font.sm, color: color.mut2 }}>Esa importación no tiene fotos cargadas.</div>}

            <div style={{ display: 'flex', gap: space[2], marginTop: space[4] }}>
              <Button variant="ghost" onClick={onCerrar}>
                Cancelar
              </Button>
              <Button variant="solid" tone="brand" onClick={vincular} disabled={!g} style={{ marginLeft: 'auto' }}>
                {n === 1 ? 'Marcar la funda' : `Marcar las ${n}`}
              </Button>
            </div>
          </>
        )
      )}
    </Modal>
  )
}

function Tira({ urls }: { urls: string[] }) {
  return (
    <div style={{ display: 'flex', gap: space[1], overflowX: 'auto', paddingBottom: 4 }}>
      {urls.map((u, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={u} alt="" loading="lazy" style={{ width: 56, height: 72, objectFit: 'cover', borderRadius: 5, background: color.bg2, flex: 'none' }} />
      ))}
    </div>
  )
}
