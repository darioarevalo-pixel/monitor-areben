'use client'

import { useState } from 'react'
import { Button, Lightbox, color, font, space, useToast, weight } from '@/components/ui'
import { SacarFoto } from '@/components/recorridas/SacarFoto'
import { fotoDelTicket } from '@/lib/exhib/cliente'
import type { Cobertura, FotoTicket as Foto, RecorridoLibre } from '@/lib/exhib/libre'

/**
 * **La foto del ticket tildado** (Darío, 11-oct-2026): la empleada sale con el ticket de 80 mm,
 * marca «Exhibido» / «No encontrado» / «Retirado» en el papel y, al terminar, le saca una foto.
 * Con eso los dueños ven que el chequeo se terminó, sin preguntar.
 *
 * 🔑 **Un chequeo son los recorridos del DÍA** (igual que el reporte): las fotos se leen de todos
 * y se guardan en el primero. Así ⛔ se pierden si después se destilda un recorrido del reporte.
 * 🔑 **Va en el celular de la empleada Y en el reporte**: ella sube, los dueños la ven en el mismo
 * lugar donde imprimieron el ticket.
 * Varias fotos: un ticket largo ⛔ entra en una.
 */

const EN_AR = { timeZone: 'America/Argentina/Buenos_Aires' } as const
const cuando = (iso: string) => new Date(iso).toLocaleString('es-AR', { ...EN_AR, weekday: 'short', hour: '2-digit', minute: '2-digit' })

export function FotoTicket({
  marca,
  recorridos,
  onCobertura,
  titulo = 'Ticket tildado',
}: {
  marca: string
  /** Los recorridos cerrados del día, del primero al último. */
  recorridos: RecorridoLibre[]
  onCobertura: (id: string, c: Cobertura) => void
  titulo?: string
}) {
  const toast = useToast()
  const [viendo, setViendo] = useState<string | null>(null)
  const [sacando, setSacando] = useState<string | null>(null)
  const primero = recorridos[0]
  if (!primero) return null

  const fotos: Array<Foto & { recorrido: string }> = recorridos
    .flatMap((r) => (r.cobertura?.ticket ?? []).map((f) => ({ ...f, recorrido: r.id })))
    .sort((a, b) => a.cuando.localeCompare(b.cuando))

  async function guardar(url: string) {
    try {
      onCobertura(primero.id, await fotoDelTicket(marca, primero.id, url))
      toast.ok('Foto guardada.')
    } catch (e) {
      toast.error('No se pudo guardar la foto: ' + (e as Error).message)
    }
  }

  async function quitar(f: Foto & { recorrido: string }) {
    setSacando(f.url)
    try {
      onCobertura(f.recorrido, await fotoDelTicket(marca, f.recorrido, f.url, true))
    } catch (e) {
      toast.error('No se pudo sacar la foto: ' + (e as Error).message)
    } finally {
      setSacando(null)
    }
  }

  return (
    <div style={{ margin: `${space[3]}px 0` }}>
      <div style={{ fontWeight: weight.bold, fontSize: font.base, color: color.ink, marginBottom: space[2] }}>
        {titulo}{' '}
        <span style={{ fontWeight: 400, fontSize: font.sm, color: fotos.length ? color.success : color.mut }}>
          {fotos.length ? '· terminado' : '· foto pendiente'}
        </span>
      </div>
      {fotos.length > 0 && (
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', marginBottom: space[2] }}>
          {fotos.map((f) => (
            <div key={f.url} style={{ width: 120, fontSize: font.xs, color: color.mut }}>
              <button
                type="button"
                onClick={() => setViendo(f.url)}
                style={{ padding: 0, height: 'auto', border: `1px solid ${color.line}`, borderRadius: 6, background: 'none', cursor: 'zoom-in', display: 'block' }}
                aria-label="Ver la foto del ticket"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt="Ticket tildado" style={{ width: 118, height: 160, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
              </button>
              <div style={{ marginTop: 4 }}>
                {f.por || 'sin nombre'} · {cuando(f.cuando)}
              </div>
              <Button size="sm" variant="ghost" loading={sacando === f.url} onClick={() => void quitar(f)}>
                Sacar
              </Button>
            </div>
          ))}
        </div>
      )}
      <SacarFoto carpeta="exhib" etiqueta={fotos.length ? 'Otra foto' : 'Foto del ticket'} onFoto={(url) => void guardar(url)} onError={(m) => toast.error(m)} />
      <Lightbox src={viendo} alt="Ticket tildado" onCerrar={() => setViendo(null)} />
    </div>
  )
}
