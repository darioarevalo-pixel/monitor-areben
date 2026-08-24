'use client'

/**
 * **El buzón del contenido**, adentro del link de la creadora. Es lo que reemplaza a «dejanos las
 * fotos en esta carpeta de Drive», que se trababa por permisos de Google y terminaba llegando por
 * WhatsApp, comprimido.
 *
 * Va en la pantalla de «Tu pedido llegó» y no en el formulario, y eso es una corrección: el bloque
 * de Drive vivía en la vista de datos, que **deja de dibujarse** cuando el canje pasa a `en_curso`
 * (`despachado` lo incluye). O sea que el único momento en que el portal le nombraba la carpeta era
 * *antes* de que saliera el pedido, con un «No hace falta ahora» al lado. Justo cuando tenía que
 * entregar, no veía nada.
 *
 * ⚠️ **Estilos inline, como todo el portal.** Lo abre alguien de afuera, sin sesión: un cambio en la
 * hoja del panel no puede mover esta pantalla. Ver el encabezado de `PortalVitrina`.
 *
 * ⚠️ **Sin visor propio.** Tocar un archivo lo abre en una pestaña. Un lightbox acá querría un
 * listener de Escape sobre `window`, y en este portal los listeners de Escape ya tienen dueño
 * (`PortalVitrina`): dos sobre el mismo target corren los dos y `stopPropagation` no los separa.
 * Para mirar una foto grande, la pestaña alcanza.
 */

import { useRef, useState } from 'react'
import { useSubirContenido } from '@/components/canjes/useSubirContenido'
import type { ClaseMedia } from '@/lib/media'

export type ArchivoSubido = { id: number; url: string; tipo: 'imagen' | 'video'; at: string | null }

const boton: React.CSSProperties = {
  display: 'inline-block', padding: '12px 18px', fontSize: 16, borderRadius: 10,
  border: 'none', background: '#4f46e5', color: '#fff', fontFamily: 'inherit', cursor: 'pointer',
}

/** Los dos botones de la confirmación. Grandes para el dedo, chicos para la celda. */
const botonChico = (fondo: string): React.CSSProperties => ({
  padding: '6px 14px', fontSize: 13, borderRadius: 8, border: 'none',
  background: fondo, color: '#fff', fontFamily: 'inherit', cursor: 'pointer',
})

const celda: React.CSSProperties = {
  width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10,
  background: '#e5e7eb', display: 'block',
}

export function PortalContenido({
  token, carpeta, archivos, puedeSubir, onSubido, onBorrar,
}: {
  token: string | null
  /** La manda el servidor. ⛔ No se arma acá. */
  carpeta: string | null
  archivos: ArchivoSubido[]
  puedeSubir: boolean
  /** Registra el archivo recién subido. Devuelve la fila para dibujarla en el momento. */
  onSubido: (item: { url: string; clase: ClaseMedia }) => Promise<void>
  /** Saca uno que subió mal. El servidor sólo la deja mientras nadie lo haya tocado del otro lado. */
  onBorrar: (id: number) => Promise<void>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const { enCurso, subiendo, agregar, descartar } = useSubirContenido(token, carpeta, onSubido)
  /** Cuál está preguntando "¿lo borro?". Uno solo por vez: son celdas de 100 px. */
  const [preguntando, setPreguntando] = useState<number | null>(null)
  const [borrando, setBorrando] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function borrar(id: number) {
    setBorrando(id)
    setError(null)
    try {
      await onBorrar(id)
      setPreguntando(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar ese archivo.')
    } finally {
      setBorrando(null)
    }
  }

  return (
    <div style={{ marginTop: 28, textAlign: 'left' }}>
      <h2 style={{ fontSize: 17, marginBottom: 6 }}>Pasanos el contenido</h2>
      <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.5, marginBottom: 14 }}>
        Subí acá las fotos y los videos, directo desde el celular. Se suben tal cual, sin perder
        calidad, y no hace falta ninguna cuenta.
      </p>

      {(archivos.length > 0 || enCurso.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
          {archivos.map((a) => (
            <div key={a.id} style={{ position: 'relative' }}>
              <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                {a.tipo === 'video' ? (
                  <video src={a.url} style={celda} preload="metadata" muted playsInline />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element -- portal público: se dibuja
                     con estilos propios y sin el runtime de imágenes de Next. */
                  <img src={a.url} alt="" style={celda} />
                )}
                {a.tipo === 'video' && (
                  <span style={{
                    position: 'absolute', bottom: 6, left: 6, fontSize: 12, color: '#fff',
                    background: 'rgba(0,0,0,.55)', borderRadius: 6, padding: '2px 6px',
                  }}>▶</span>
                )}
              </a>

              {/*
                La ✕ para el que se subió mal —la foto movida, el video que no era—. Antes no había
                forma de sacarlo: quedaba ahí y nos lo aclaraba por WhatsApp, que es justo lo que
                este buzón vino a evitar.

                ⛔ **La confirmación va adentro de la celda, no en un `confirm()`**: un diálogo del
                navegador bloquea todo, y acá adentro un `window.confirm` en un teléfono es la forma
                más rápida de que se pierda la subida que está en curso.
              */}
              {preguntando === a.id ? (
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: 10, background: 'rgba(17,24,39,.82)',
                  display: 'grid', placeItems: 'center', gap: 6, padding: 6, textAlign: 'center',
                }}>
                  <span style={{ color: '#fff', fontSize: 12 }}>¿Lo borramos?</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => void borrar(a.id)} disabled={borrando === a.id} style={botonChico('#dc2626')}>
                      {borrando === a.id ? '…' : 'Sí'}
                    </button>
                    <button type="button" onClick={() => setPreguntando(null)} style={botonChico('#4b5563')}>
                      No
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  aria-label="Borrar este archivo"
                  onClick={() => { setError(null); setPreguntando(a.id) }}
                  style={{
                    position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14,
                    border: 'none', background: 'rgba(17,24,39,.6)', color: '#fff', fontSize: 15,
                    lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {/* Cada archivo falla por su cuenta: el que se cayó se ve y se descarta sin tocar el resto. */}
          {enCurso.map((f) => (
            <div key={f.key} style={{
              ...celda, display: 'grid', placeItems: 'center', padding: 8, textAlign: 'center',
              fontSize: 11, color: f.estado === 'fallada' ? '#b91c1c' : '#6b7280',
              background: f.estado === 'fallada' ? '#fef2f2' : '#f3f4f6',
            }}>
              {f.estado === 'fallada'
                ? (
                  <span>
                    {f.motivo}
                    <br />
                    <button
                      type="button"
                      onClick={() => descartar(f.key)}
                      style={{ marginTop: 6, border: 'none', background: 'none', color: '#b91c1c', textDecoration: 'underline', fontFamily: 'inherit', fontSize: 11, cursor: 'pointer' }}
                    >
                      cerrar
                    </button>
                  </span>
                )
                : <span>Subiendo…<br />{f.nombre.slice(0, 22)}</span>}
            </div>
          ))}
        </div>
      )}

      {error && (
        <p style={{ background: '#fef2f2', color: '#991b1b', padding: 10, borderRadius: 10, fontSize: 14, marginBottom: 12 }}>
          {error}
        </p>
      )}

      {puedeSubir ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              agregar(e.target.files)
              // Si no se limpia, elegir DOS VECES el mismo archivo no dispara el change la segunda.
              e.target.value = ''
            }}
          />
          <button type="button" style={boton} onClick={() => fileRef.current?.click()} disabled={subiendo}>
            {subiendo ? 'Subiendo…' : archivos.length ? 'Subir más' : 'Subir fotos y videos'}
          </button>
        </>
      ) : (
        <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.5 }}>
          Ya subiste todo lo que entra. Si falta algo, escribinos.
        </p>
      )}

      {/* 🔴 Acá abajo estaba «si preferís, también podés dejarlo en esta carpeta», con el Drive de
          la marca. Se sacó junto con el otro cartel: esa carpeta es ahora **el archivo del equipo**
          —donde cae lo que se manda desde la ficha— y no un lugar donde ella pueda dejar nada. */}
    </div>
  )
}
