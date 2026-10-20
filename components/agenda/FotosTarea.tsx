'use client'

/**
 * Las fotos de un pendiente (Darío, 19-oct-2026: *«a veces quiero poner varias»*).
 *
 * Dos piezas: `EditorFotos` en el formulario —quien asigna adjunta una o varias, y saca la que no
 * va antes de guardar— y `MiniaturasFotos` en el renglón de Hoy, que se agrandan al tocarlas.
 *
 * 🔑 Las fotos se suben al Blob al elegirlas (carpeta `agenda/`) y el ítem guarda sólo las URLs en
 * `datos.fotos`. ⚠️ Sacar una foto del formulario ⛔ no la elimina del Blob: queda sin dueño, y de
 * eso se ocupa la pantalla Archivos (ver `docs/secciones/archivos.md`).
 */

import { useRef, useState } from 'react'
import { Button, color, font, space } from '@/components/ui'
import { achicarADataUrl, subirBlob } from '@/lib/imagenes'

const TOPE = 10

export function EditorFotos({ fotos, onChange }: { fotos: string[]; onChange: (f: string[]) => void }) {
  const galeria = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(0)
  const [error, setError] = useState<string | null>(null)

  async function subir(input: HTMLInputElement) {
    const archivos = [...(input.files || [])].slice(0, TOPE - fotos.length)
    // Se limpia ya: sin esto, elegir dos veces la misma foto ⛔ dispara el onChange.
    input.value = ''
    if (!archivos.length) return
    setError(null)
    setSubiendo(archivos.length)
    const nuevas: string[] = []
    let fallaron = 0
    // De a una: el servidor corta el cuerpo en 1,5 MB y una tanda de diez juntas no tiene sentido.
    for (const a of archivos) {
      try {
        nuevas.push(await subirBlob(await achicarADataUrl(a), 'agenda'))
      } catch {
        fallaron++
      }
      setSubiendo((n) => n - 1)
    }
    onChange([...fotos, ...nuevas])
    if (fallaron) setError(fallaron === 1 ? 'Una foto no se pudo subir.' : `${fallaron} fotos no se pudieron subir.`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
      {fotos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2] }}>
          {fotos.map((u) => (
            <button
              key={u}
              type="button"
              title="Sacar esta foto"
              aria-label="Sacar esta foto"
              onClick={() => onChange(fotos.filter((x) => x !== u))}
              style={{ ...MINI, width: 64, height: 64 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" style={IMG} />
              <span style={CRUZ}>×</span>
            </button>
          ))}
        </div>
      )}
      {fotos.length < TOPE && (
        <div>
          <Button variant="outline" disabled={subiendo > 0} onClick={() => galeria.current?.click()}>
            {subiendo > 0 ? `Subiendo ${subiendo}…` : fotos.length ? '📷 Agregar más' : '📷 Adjuntar fotos'}
          </Button>
        </div>
      )}
      {/* Sin `capture`: en el teléfono el selector ya ofrece la cámara y la galería, y deja elegir varias. */}
      <input
        ref={galeria}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => void subir(e.currentTarget)}
      />
      {error && <div style={{ fontSize: font.sm, color: color.dangerInk }}>{error}</div>}
    </div>
  )
}

export function MiniaturasFotos({ fotos }: { fotos: string[] | undefined }) {
  const [grande, setGrande] = useState<string | null>(null)
  if (!fotos || !fotos.length) return null
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2], marginTop: space[2] }}>
        {fotos.map((u) => (
          <button key={u} type="button" title="Ver foto" aria-label="Ver foto" onClick={() => setGrande(u)} style={{ ...MINI, width: 56, height: 56 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="" style={IMG} />
          </button>
        ))}
      </div>
      {grande && (
        <div
          role="dialog"
          aria-label="Foto"
          onClick={() => setGrande(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,6,23,.88)', cursor: 'zoom-out',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={grande} alt="Foto de la tarea" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10 }} />
        </div>
      )}
    </>
  )
}

const MINI: React.CSSProperties = {
  position: 'relative', padding: 0, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', flex: '0 0 auto',
  border: `1px solid ${color.line2}`, background: 'transparent',
}
const IMG: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
const CRUZ: React.CSSProperties = {
  position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: 10, lineHeight: '20px',
  textAlign: 'center', fontSize: 13, color: '#fff', background: 'rgba(15,23,42,.75)',
}
