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

import { useRef } from 'react'
import { useSubirContenido } from '@/components/canjes/useSubirContenido'
import type { ClaseMedia } from '@/lib/media'

export type ArchivoSubido = { id: number; url: string; tipo: 'imagen' | 'video'; at: string | null }

const boton: React.CSSProperties = {
  display: 'inline-block', padding: '12px 18px', fontSize: 16, borderRadius: 10,
  border: 'none', background: '#4f46e5', color: '#fff', fontFamily: 'inherit', cursor: 'pointer',
}

const celda: React.CSSProperties = {
  width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10,
  background: '#e5e7eb', display: 'block',
}

export function PortalContenido({
  token, carpeta, archivos, puedeSubir, driveUrl, onSubido,
}: {
  token: string | null
  /** La manda el servidor. ⛔ No se arma acá. */
  carpeta: string | null
  archivos: ArchivoSubido[]
  puedeSubir: boolean
  /** La carpeta de la marca, si está cargada. Queda como alternativa, ya no como el camino. */
  driveUrl: string | null
  /** Registra el archivo recién subido. Devuelve la fila para dibujarla en el momento. */
  onSubido: (item: { url: string; clase: ClaseMedia }) => Promise<void>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const { enCurso, subiendo, agregar, descartar } = useSubirContenido(token, carpeta, onSubido)

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
            <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" style={{ position: 'relative' }}>
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

      {/* La carpeta de la marca deja de ser el camino y queda como alternativa. Sólo aparece si
          alguien la cargó en Ajustes — hoy está en `null` en las tres marcas. */}
      {driveUrl && (
        <p style={{ color: '#9ca3af', fontSize: 13, lineHeight: 1.5, marginTop: 12 }}>
          Si preferís, también podés dejarlo{' '}
          <a href={driveUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#6b7280' }}>en esta carpeta</a>.
        </p>
      )}
    </div>
  )
}
